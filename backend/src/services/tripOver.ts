/**
 * Whether a trip is over: its last day past on the trip's own clock (Japan's, for Wander's trips) — Nov 15 2026. A
 * finished trip's places and cities are shown as they were kept, and nothing about them is looked at again in the
 * background (Ken, on old Japan: "they don't need to update"). Before a trip and on each of its days, it isn't over.
 */
import prisma from "./db.js";
import { dayZone } from "./dayCountry.js";

const ZONE = "Asia/Tokyo";
const ymd = (d: Date, zone = ZONE) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** A trip whose end date is `endDate` is over at `now` (no end date: not over), by the clock of its last day: that day's
 *  city's zone, else the trip's, else Japan's (the zone given). Japan's trip is over by Tokyo's clock, as before. */
export function tripOver(endDate: Date | string | null | undefined, now = new Date(), zone: string = ZONE): boolean {
  if (!endDate) return false;
  const last = (endDate instanceof Date ? endDate.toISOString() : String(endDate)).slice(0, 10);
  return ymd(now, zone) > last;
}

// (asked on each photo and each app open: kept ten minutes)
const KEEP_MS = 10 * 60_000;
const known = new Map<string, { over: boolean; at: number }>();
async function remember(key: string, work: () => Promise<boolean>): Promise<boolean> {
  const had = known.get(key);
  if (had && Date.now() - had.at < KEEP_MS) return had.over;
  const over = await work().catch(() => false);
  if (known.size > 500) known.clear();
  known.set(key, { over, at: Date.now() });
  return over;
}

/** The clock of a trip's last day (its city's zone, else the trip's, else Japan's) */
async function lastDayZone(tripId: string, endDate: Date | null): Promise<string> {
  return endDate ? dayZone(tripId, endDate.toISOString().slice(0, 10)) : ZONE;
}

/** The trip is over (`now` is for tests) */
export function tripIsOver(tripId: string, now = new Date()): Promise<boolean> {
  return remember(`trip:${tripId}`, async () => {
    const t = await prisma.trip.findUnique({ where: { id: tripId }, select: { endDate: true } });
    return !!t && tripOver(t.endDate, now, await lastDayZone(tripId, t.endDate));
  });
}

/** The trip a city belongs to is over */
export function cityTripOver(cityId: string): Promise<boolean> {
  return remember(`city:${cityId}`, async () => {
    const c = await prisma.city.findUnique({ where: { id: cityId }, select: { tripId: true, trip: { select: { endDate: true } } } });
    return !!c && tripOver(c.trip.endDate, new Date(), await lastDayZone(c.tripId, c.trip.endDate));
  });
}

/** Every trip this traveler is on that's still in use (not archived) is over — or they're on none: Wander's background
 *  look at places' hours and photos isn't needed for them */
export function travelerTripsAllOver(travelerId: string | null | undefined): Promise<boolean> {
  if (!travelerId) return Promise.resolve(true);
  return remember(`traveler:${travelerId}`, async () => {
    const trips = await prisma.trip.findMany({ where: { status: { not: "archived" }, tripMembers: { some: { travelerId } } }, select: { id: true, endDate: true } });
    for (const t of trips) if (!tripOver(t.endDate, new Date(), await lastDayZone(t.id, t.endDate))) return false;
    return true;
  });
}

/** (tests: forget what was kept) */
export function forgetTripsOver() { known.clear(); }
