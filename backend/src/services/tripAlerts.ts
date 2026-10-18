/**
 * "Let everyone know" (Oct 18 2026). Ken: "Alert on next login function from anyone using anything to scout like 'let
 * everyone know' with 'got it' and 'remind me' as options. This is for logistics not general messaging." (Before it,
 * asked to tell everyone that the guides' names might be misspelled, Scout said "Wander has nothing that fires on
 * login".) Anyone on the trip tells Scout; each other member sees it the next time they open Wander until they tap Got
 * it. "Remind me" brings it back on the next day (Japan's date; Ken: "start with the first login the following day").
 * Gone after 3 days, or once its moment has passed (Ken: "Expires in 3 days or the moment that the moment has passed"
 * — `until`, set by Scout). The sender and the trip's first member can take one back — hidden, never deleted.
 */
import prisma from "./db.js";

export const KEEP_MS = 3 * 86_400_000;
const MAX_CHARS = 600;
/** Japan's date of a moment, "2026-10-18" */
const japanDay = (t: number) => new Date(t + 9 * 3600_000).toISOString().slice(0, 10);

/** A new one, from this person, to everyone else on the trip; `until`: when its moment has passed */
export async function tellEveryone(tripId: string, fromId: string, fromName: string, text: string, until?: Date | null) {
  const words = text.trim().slice(0, MAX_CHARS);
  if (!words) return null;
  // (the same words from the same person in the last ten minutes are the same alert: a resend never makes two)
  const recent = await prisma.tripAlert.findFirst({ where: { tripId, fromId, text: words, withdrawnAt: null, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } } });
  if (recent) return recent;
  return prisma.tripAlert.create({ data: { tripId, fromId, fromName, text: words, ...(until ? { until } : {}) } });
}

/** Still showing to anyone: not taken back, under 3 days old, and its moment not passed */
export const live = (a: { withdrawnAt: Date | null; createdAt: Date; until: Date | null }, now = Date.now()) =>
  !a.withdrawnAt && now - a.createdAt.getTime() < KEEP_MS && (!a.until || a.until.getTime() > now);

/** The trip's messages still showing, for Scout's own answers to agree with them (oldest first) */
export async function liveOn(tripId: string, now = Date.now()) {
  const alerts = await prisma.tripAlert.findMany({ where: { tripId, withdrawnAt: null, createdAt: { gt: new Date(now - KEEP_MS) } }, orderBy: { createdAt: "asc" } });
  return alerts.filter((a) => live(a, now));
}

/** Everyone on the trip but the sender, by first name — who it goes to */
export async function othersOn(tripId: string, me: string): Promise<{ id: string; name: string }[]> {
  const members = await prisma.tripMember.findMany({ where: { tripId, travelerId: { not: me } }, select: { travelerId: true, traveler: { select: { displayName: true } } }, orderBy: { joinedAt: "asc" } });
  return members.map((m) => ({ id: m.travelerId, name: m.traveler.displayName }));
}

/** What this person should see now, on any of their trips: not theirs, not taken back, not Got it, and a Remind me an
 *  hour old or more. Oldest first. */
export async function pendingFor(travelerId: string, now = Date.now()) {
  const trips = (await prisma.tripMember.findMany({ where: { travelerId }, select: { tripId: true } })).map((m) => m.tripId);
  if (!trips.length) return [];
  const alerts = await prisma.tripAlert.findMany({
    where: { tripId: { in: trips }, fromId: { not: travelerId }, withdrawnAt: null, createdAt: { gt: new Date(now - KEEP_MS) } },
    include: { seen: { where: { travelerId } } }, orderBy: { createdAt: "asc" },
  });
  return alerts.filter((a) => live(a, now))
    .filter((a) => { const s = a.seen[0]; return !s || (s.state === "later" && japanDay(now) > japanDay(s.at.getTime())); })
    .map((a) => ({ id: a.id, tripId: a.tripId, from: a.fromName, text: a.text, at: a.createdAt.toISOString() }));
}

/** Got it, or Remind me — only on an alert on one of this person's trips */
export async function markSeen(alertId: string, travelerId: string, state: "got" | "later"): Promise<boolean> {
  const a = await prisma.tripAlert.findUnique({ where: { id: alertId }, select: { tripId: true } });
  if (!a) return false;
  const member = await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId: a.tripId, travelerId } } });
  if (!member) return false;
  await prisma.tripAlertSeen.upsert({ where: { alertId_travelerId: { alertId, travelerId } }, create: { alertId, travelerId, state }, update: { state, at: new Date() } });
  return true;
}

/** The trip's first member (Ken on this trip) — who may take back anyone's, as with Maybes */
async function firstMember(tripId: string): Promise<string | null> {
  return (await prisma.tripMember.findFirst({ where: { tripId }, orderBy: { joinedAt: "asc" }, select: { travelerId: true } }))?.travelerId ?? null;
}

/** What this person has sent on the trip (the first member sees everyone's), each with who has seen it */
export async function sentOn(tripId: string, travelerId: string) {
  const all = (await firstMember(tripId)) === travelerId;
  const alerts = await prisma.tripAlert.findMany({ where: { tripId, ...(all ? {} : { fromId: travelerId }) }, include: { seen: true }, orderBy: { createdAt: "desc" }, take: 20 });
  const people = await prisma.tripMember.findMany({ where: { tripId }, select: { travelerId: true, traveler: { select: { displayName: true } } } });
  const name = (id: string) => people.find((p) => p.travelerId === id)?.traveler.displayName || "someone";
  return alerts.map((a) => ({
    id: a.id, from: a.fromName, text: a.text, sent: a.createdAt.toISOString(), ...(a.withdrawnAt ? { takenBack: a.withdrawnAt.toISOString() } : {}),
    ...(a.until ? { until: a.until.toISOString() } : {}), stillShowing: live(a),
    gotIt: a.seen.filter((s) => s.state === "got").map((s) => name(s.travelerId)),
    remindLater: a.seen.filter((s) => s.state === "later").map((s) => name(s.travelerId)),
    // (Wander knows only who tapped: someone who saw it and tapped nothing is here too)
    noTapYet: people.filter((p) => p.travelerId !== a.fromId && !a.seen.some((s) => s.travelerId === p.travelerId)).map((p) => p.traveler.displayName),
  }));
}

/** Take one back: the sender, or the trip's first member. Hidden for everyone, never deleted. */
export async function takeBack(alertId: string, travelerId: string): Promise<"done" | "not-yours" | "none"> {
  const a = await prisma.tripAlert.findUnique({ where: { id: alertId } });
  if (!a) return "none";
  if (a.fromId !== travelerId && (await firstMember(a.tripId)) !== travelerId) return "not-yours";
  if (!a.withdrawnAt) await prisma.tripAlert.update({ where: { id: alertId }, data: { withdrawnAt: new Date() } });
  return "done";
}
