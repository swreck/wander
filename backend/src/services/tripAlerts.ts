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

/** The trip's messages still showing, for Scout's own answers to agree with them (oldest first; never a note to one person) */
export async function liveOn(tripId: string, now = Date.now()) {
  const alerts = await prisma.tripAlert.findMany({ where: { tripId, withdrawnAt: null, toId: null, createdAt: { gt: new Date(now - KEEP_MS) } }, orderBy: { createdAt: "asc" } });
  return alerts.filter((a) => live(a, now));
}

/** A note from Scout to one person, made once ever (its `key`), shown like a message to everyone but only to them —
 *  Ken, Oct 23: "When andy adds his next item to the budget, after it is done, send this message in a panel" */
export async function noteFromScoutOnce(tripId: string, toId: string, key: string, text: string) {
  if (await prisma.tripAlert.findFirst({ where: { key } })) return null;
  return prisma.tripAlert.create({ data: { tripId, fromId: toId, fromName: "Scout", toId, key, text } });
}

/** Ken's one-time notes, each made after something a person does (Oct 23) */
export const ONE_TIME_NOTES = [
  {
    key: "andy-budget-2026-10-23", who: "Andy", after: "budget-add" as const,
    text: "Hi Andy. This is Scout. Ken said my UI was disappointing. I'm sorry and I tried to improve. Anytime you don't like something, just tap Scout & tell me. I'll let Ken know and try to fix it. Have fun in Kyoto!",
  },
];
/** Ken hears how a note from Scout to someone went (Ken, Oct 23: "Tell me in an alert when you give andy the message and
 *  give me the seconds it is open if possible to know if he reads it"): a buzz on his phone when it's on their screen,
 *  and when they answer it, with how long it was open (seconds it was on their screen) and which button — also kept as a
 *  card for him. Only for notes from Scout to one person; never for Ken's own. */
const toldShown = new Set<string>();
async function kenOf(tripId: string) {
  return prisma.tripMember.findFirst({ where: { tripId }, orderBy: { joinedAt: "asc" }, select: { travelerId: true, traveler: { select: { displayName: true } } } });
}
const jstTime = (d: Date) => d.toLocaleString("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", minute: "2-digit" });
export async function scoutNoteShown(alertId: string, travelerId: string) {
  if (toldShown.has(alertId)) return;
  const a = await prisma.tripAlert.findUnique({ where: { id: alertId } });
  if (!a || a.toId !== travelerId || a.fromName !== "Scout") return;
  const ken = await kenOf(a.tripId);
  if (!ken || ken.travelerId === travelerId) return;
  toldShown.add(alertId);
  const who = (await prisma.traveler.findUnique({ where: { id: travelerId }, select: { displayName: true } }))?.displayName || "They";
  const { sendToPhones } = await import("./push.js");
  await sendToPhones(ken.travelerId, { title: `Scout's note to ${who}`, body: `It's on ${who}'s screen now (${jstTime(new Date())}).`, tag: `scout-note-${alertId}`, url: "/" });
}
async function scoutNoteAnswered(a: { id: string; tripId: string; toId: string | null; fromName: string }, travelerId: string, state: string, openSeconds: number | null, button: string | null) {
  if (a.fromName !== "Scout" || a.toId !== travelerId) return;
  const ken = await kenOf(a.tripId);
  if (!ken || ken.travelerId === travelerId) return;
  const who = (await prisma.traveler.findUnique({ where: { id: travelerId }, select: { displayName: true } }))?.displayName || "They";
  const open = openSeconds == null ? "" : ` It was open ${openSeconds} second${openSeconds === 1 ? "" : "s"}.`;
  const tapped = button === "tell" ? "Tell Scout" : state === "later" ? "Remind me" : "Got it";
  const words = `${who} read Scout's note at ${jstTime(new Date())}.${open} ${who === "They" ? "They" : who} tapped ${tapped}.`;
  const { sendToPhones } = await import("./push.js");
  await sendToPhones(ken.travelerId, { title: `Scout's note to ${who}`, body: words, tag: `scout-note-${a.id}`, url: "/" });
  await prisma.tripAlert.create({ data: { tripId: a.tripId, fromId: ken.travelerId, fromName: "Scout", toId: ken.travelerId, text: words } });
}

/** After a person does something (keeps a payment): any one-time note for them, made now */
export async function afterDoing(tripId: string, person: { travelerId?: string | null; displayName: string }, what: "budget-add") {
  if (!person.travelerId) return;
  const first = person.displayName.trim().split(/\s+/)[0].toLowerCase();
  for (const n of ONE_TIME_NOTES) if (n.after === what && n.who.toLowerCase() === first) await noteFromScoutOnce(tripId, person.travelerId, n.key, n.text);
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
    // (everyone's but their own, or a note to them alone)
    where: { tripId: { in: trips }, withdrawnAt: null, createdAt: { gt: new Date(now - KEEP_MS) }, OR: [{ toId: null, fromId: { not: travelerId } }, { toId: travelerId }] },
    include: { seen: { where: { travelerId } } }, orderBy: { createdAt: "asc" },
  });
  const waiting = alerts.filter((a) => live(a, now))
    .filter((a) => { const s = a.seen[0]; return !s || (s.state === "later" && japanDay(now) > japanDay(s.at.getTime())); });
  // (a paper shared with everyone: the card carries a small picture of it that opens full screen — Ken, Oct 25: "alert
  // each person on next login that the doc is available with a small picture that can expand"; one kept back or removed
  // since isn't shown)
  const paperIds = waiting.map((a) => a.paperId).filter((x): x is string => !!x);
  const papers = paperIds.length ? await prisma.tripPaper.findMany({ where: { id: { in: paperIds }, hidden: false, share: "group" },
    select: { id: true, title: true, summary: true, dayDate: true, authorName: true, mimeType: true, thumb: true } }) : [];
  const { paperLink } = await import("./papers.js");
  return waiting.flatMap((a) => {
    const base = { id: a.id, tripId: a.tripId, from: a.fromName, text: a.text, at: a.createdAt.toISOString(), ...(a.toId ? { toYou: true } : {}) };
    if (!a.paperId) return [base];
    const p = papers.find((x) => x.id === a.paperId);
    if (!p) return [];
    return [{ ...base, paper: { id: p.id, title: p.title, summary: p.summary, dayDate: p.dayDate, authorName: p.authorName, pdf: p.mimeType === "application/pdf",
      url: paperLink(p.id, false, travelerId), smallUrl: p.thumb ? paperLink(p.id, true, travelerId) : null } }];
  });
}

/** Got it, or Remind me — only on an alert on one of this person's trips */
export async function markSeen(alertId: string, travelerId: string, state: "got" | "later", how: { openSeconds?: number | null; button?: string | null } = {}): Promise<boolean> {
  const a = await prisma.tripAlert.findUnique({ where: { id: alertId }, select: { id: true, tripId: true, toId: true, fromName: true } });
  if (!a) return false;
  const member = await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId: a.tripId, travelerId } } });
  if (!member) return false;
  await prisma.tripAlertSeen.upsert({ where: { alertId_travelerId: { alertId, travelerId } }, create: { alertId, travelerId, state }, update: { state, at: new Date() } });
  // (a note from Scout to them: Ken hears how it went — never holds the answer up)
  const secs = typeof how.openSeconds === "number" && isFinite(how.openSeconds) && how.openSeconds >= 0 ? Math.round(how.openSeconds) : null;
  void scoutNoteAnswered(a, travelerId, state, secs, how.button ?? null).catch((e) => console.warn("[alerts] note answered:", e?.message || e));
  return true;
}

/** The trip's first member (Ken on this trip) — who may take back anyone's, as with Maybes */
async function firstMember(tripId: string): Promise<string | null> {
  return (await prisma.tripMember.findFirst({ where: { tripId }, orderBy: { joinedAt: "asc" }, select: { travelerId: true } }))?.travelerId ?? null;
}

/** What this person has sent on the trip (the first member sees everyone's), each with who has seen it */
export async function sentOn(tripId: string, travelerId: string) {
  const all = (await firstMember(tripId)) === travelerId;
  const alerts = await prisma.tripAlert.findMany({ where: { tripId, toId: null, ...(all ? {} : { fromId: travelerId }) }, include: { seen: true }, orderBy: { createdAt: "desc" }, take: 20 });
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
