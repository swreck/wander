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
