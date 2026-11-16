/**
 * Each person's own current trip (Nov 16 2026, December plan step 1 — trip-data is private; the rule is in SPEC.md).
 *
 * Until now one switch served all of Wander: opening a trip archived every other trip for everyone, and a phone's first
 * load could switch the whole app. Ken (Nov 2): "switch instantly back to Japan to Remember how I did a particular thing
 * on that trip and use that to then allow me to switch back to the new instance". So the choice is per person: choosing
 * a trip stamps that person's own membership row (trip_members.opened_at), and nobody else's view moves. A trip's
 * status is no longer changed by opening one; "archived" now only means set aside (April's placeholder trips).
 *
 * The current trip, for one person, is the most recent of:
 *  - the moment they last chose one of their trips, and
 *  - the start of a trip of theirs that is under way now (so a trip that begins after their last choice comes forward
 *    by itself — opening Japan on Dec 1 to look something up doesn't leave December hidden on Dec 15).
 * With neither, the trips they're on that aren't set aside: one under way, else the next to start, else the one that
 * ended last; failing all that, any trip of theirs.
 */
import prisma from "./db.js";

const DAY = 86400_000;
const ymd = (d: Date, zone: string) => {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
  catch { return d.toISOString().slice(0, 10); }
};
const dayOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

type Mine = { tripId: string; openedAt: Date | null; trip: { status: string; startDate: Date | null; endDate: Date | null; timeZone: string | null; updatedAt: Date } };

/** The trip under way on the trip's own clock (start and end days included) */
export function underWay(t: Mine["trip"], now = new Date()): boolean {
  const first = dayOf(t.startDate), last = dayOf(t.endDate);
  if (!first || !last) return false;
  const today = ymd(now, t.timeZone || "Asia/Tokyo");
  return first <= today && today <= last;
}

/** Midnight starting `ymd` on `zone`'s clock, as a moment (Asia/Tokyo's Nov 17 begins at 15:00 UTC on Nov 16) */
export function zonedMidnight(ymd: string, zone: string): number {
  const utc = Date.parse(`${ymd}T00:00:00Z`);
  let offset = 0;
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(new Date(utc)).find((x) => x.type === "timeZoneName")?.value || "GMT";
    const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    if (m) offset = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  } catch { /* unknown zone: UTC */ }
  return utc - offset * 60_000;
}

/** Pick the current trip from one person's memberships (pure, for tests) */
export function pickCurrent(mine: Mine[], now = new Date()): string | null {
  if (!mine.length) return null;
  let best: { tripId: string; at: number } | null = null;
  for (const m of mine) {
    const chose = m.openedAt ? m.openedAt.getTime() : -Infinity;
    // (when the trip began on its own clock — never a moment still to come, or it would outrank every choice made
    // before then: a trip "under way" in Hanoi from 5 PM UTC the day before its date)
    const began = underWay(m.trip, now) && m.trip.startDate
      ? Math.min(zonedMidnight(dayOf(m.trip.startDate)!, m.trip.timeZone || "Asia/Tokyo"), now.getTime()) : -Infinity;
    const at = Math.max(chose, began);
    if (at > -Infinity && (!best || at > best.at)) best = { tripId: m.tripId, at };
  }
  if (best) return best.tripId;
  const inUse = mine.filter((m) => m.trip.status !== "archived");
  const pool = inUse.length ? inUse : mine;
  const on = pool.find((m) => underWay(m.trip, now));
  if (on) return on.tripId;
  const today = now.getTime() - DAY;
  const ahead = pool.filter((m) => m.trip.startDate && m.trip.startDate.getTime() > today).sort((a, b) => a.trip.startDate!.getTime() - b.trip.startDate!.getTime());
  if (ahead.length) return ahead[0].tripId;
  const ended = pool.filter((m) => m.trip.endDate).sort((a, b) => b.trip.endDate!.getTime() - a.trip.endDate!.getTime());
  if (ended.length) return ended[0].tripId;
  return [...pool].sort((a, b) => b.trip.updatedAt.getTime() - a.trip.updatedAt.getTime())[0].tripId;
}

/** This person's current trip id, or null when they're on no trip */
export async function currentTripIdFor(travelerId: string, now = new Date()): Promise<string | null> {
  const mine = await prisma.tripMember.findMany({
    where: { travelerId },
    select: { tripId: true, openedAt: true, trip: { select: { status: true, startDate: true, endDate: true, timeZone: true, updatedAt: true } } },
  });
  return pickCurrent(mine as Mine[], now);
}

/** This person chooses one of their trips: only their own row changes. False when they aren't on that trip. */
export async function chooseTrip(travelerId: string, tripId: string): Promise<boolean> {
  const r = await prisma.tripMember.updateMany({ where: { tripId, travelerId }, data: { openedAt: new Date() } });
  return r.count > 0;
}
