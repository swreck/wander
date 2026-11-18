/**
 * The country a day is lived in: its city's (City.country). December's trip runs through Vietnam, Cambodia and Japan, so
 * what is Japan's alone (the storm watch, a Japan-only forecast agency) asks the day, not the trip. A day with no city
 * country says nothing (null) and is treated as the trip's own place, as before.
 */
import prisma from "./db.js";

export async function dayCountry(tripId: string, ymd: string): Promise<string | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const day = await prisma.day.findFirst({ where: { tripId, date: new Date(`${ymd}T00:00:00Z`) }, select: { city: { select: { country: true } } } }).catch(() => null);
  return day?.city?.country || null;
}

/** The one rule for a day's clock: its city's zone, else the trip's, else Japan's (the one Wander was built for) */
export const zoneFor = (cityZone: string | null | undefined, tripZone: string | null | undefined): string => cityZone || tripZone || "Asia/Tokyo";

/** The clock a day is lived on: its city's time zone, else the trip's, else Japan's (the one Wander was built for).
 *  Japan's trip has no zone on its cities, so every day of it falls to the trip's, as before. */
export async function dayZone(tripId: string, ymd: string): Promise<string> {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(ymd)
    ? await prisma.day.findFirst({ where: { tripId, date: new Date(`${ymd}T00:00:00Z`) }, select: { city: { select: { timeZone: true } } } }).catch(() => null)
    : null;
  if (day?.city?.timeZone) return day.city.timeZone;
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { timeZone: true } }).catch(() => null);
  return zoneFor(null, trip?.timeZone);
}

/** Today for a trip that crosses countries: the date on the clock of the day the people are living, found as the day whose
 *  own clock reads its own date right now (the trip's clock when none does). A Japan trip keeps asking Japan's clock
 *  where it always did; this is for a trip built from a plan. */
export async function tripToday(tripId: string, now: Date = new Date()): Promise<string> {
  const [trip, days] = await Promise.all([
    prisma.trip.findUnique({ where: { id: tripId }, select: { timeZone: true } }).catch(() => null),
    prisma.day.findMany({ where: { tripId }, select: { date: true, city: { select: { timeZone: true } } }, orderBy: { date: "asc" } }).catch(() => []),
  ]);
  const own = (zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const here = days.find((d) => own(zoneFor(d.city?.timeZone, trip?.timeZone)) === d.date.toISOString().slice(0, 10));
  return here ? here.date.toISOString().slice(0, 10) : own(zoneFor(null, trip?.timeZone));
}

/** Does the trip go to Japan at all? Yes when a city of it is in Japan, or when no city says where it is (an older trip:
 *  nothing to rule it out). A trip whose cities all say another country has no Japan weather to watch. */
export async function tripIsInJapan(tripId: string): Promise<boolean> {
  const cities = await prisma.city.findMany({ where: { tripId, hidden: false }, select: { country: true } }).catch(() => []);
  const known = cities.filter((c) => c.country);
  return !known.length || known.some((c) => /^japan$/i.test(c.country!));
}

/** True unless the day is known to be outside Japan */
export async function japanOrUnknown(tripId: string, ymd: string): Promise<boolean> {
  const c = await dayCountry(tripId, ymd);
  return !c || /^japan$/i.test(c);
}
