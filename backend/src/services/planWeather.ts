/**
 * Scout's weather on a trip built from a plan (Nov 23 2026), where Japan's own code stops:
 *   - a town on the way in any of the trip's countries ("What's the weather in Da Nang on the 29th?"), on that town's
 *     own clock: one of the trip's own cities first, else Open-Meteo's place search (services/townSearch);
 *   - a town Wander can't place is said as not placed, with the trip's countries named, and nothing is forecast;
 *   - a day more than 16 days ahead has no forecast yet, and comes with what that week was like there in the last five
 *     years, said as past years (services/typicalWeather).
 * Japan's own trip never comes here: its towns and its far-off days are answered as they always were.
 */
import prisma from "./db.js";
import { forecastAt, hoursAt, hourlyWords, dayPlaces } from "./dayWeather.js";
import { forecastLines } from "./forecastWords.js";
import { dayZone, zoneFor } from "./dayCountry.js";
import { dateIn, zoneWords } from "./zoneWords.js";
import { findTown, plainName } from "./townSearch.js";
import { typicalWeek, typicalWords } from "./typicalWeather.js";

type Pt = { lat: number; lng: number };
export interface PlacedTown { place: string; pt: Pt; zone: string; country: string | null; found: "trip" | "search" }

export const OVER = "No forecast: that day is over.";
export const FAR = "No forecast yet: more than 16 days ahead.";
export const TYPICAL_HOW = "A day with \"typical\" has no forecast yet. Say that first, then give its typical sentence as what past years were like there: its years and its counts as they are. Never as a forecast, a chance or what to expect (\"it will\", \"likely\", \"expect\"), and never a percentage worked out from the counts. They can ask again closer to the day.";
export const TOWN_HOW = "Wander places towns by their own names, not sights. Ask again with the town people stay in to see it, only if you are sure which town that is, and say that the forecast is that town's. Otherwise say Wander couldn't place it. Never give a forecast of your own.";

const DAY = 86_400_000;
const short = (s: string) => s.split(/\s+-\s+|\s*\(|,/)[0].trim();
const awayOf = (date: string, today: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
const dayName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
// (plain characters for an answer, as get_weather's lines are made)
const plain = (t: string) => t.replace(/\u00a0/g, " ").replace(/\u2060/g, "").replace(/\u2011/g, "-");
/** What a zone's clock reads at a moment, as one number, for telling two zones on the same clock apart from two that differ */
const clockAt = (zone: string, now: Date) => {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(now); } catch { return ""; }
};

/** "Vietnam", "Vietnam or Cambodia", "Vietnam, Cambodia or Japan" */
export const orWords = (xs: string[]) => (xs.length < 2 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);

/** The countries the trip's shown cities are in, in the trip's order */
export async function tripCountries(tripId: string): Promise<string[]> {
  const cities = await prisma.city.findMany({ where: { tripId, hidden: false }, select: { country: true }, orderBy: { sequenceOrder: "asc" } });
  return [...new Set(cities.map((c) => c.country?.trim()).filter((c): c is string => !!c))];
}

/** Where a town named to Scout is: one of the trip's own shown cities (accents, case and spacing aside), else a town of
 *  that name the place search is sure of inside the trip's countries. Null when neither. */
export async function planTown(tripId: string, name: string, now: Date = new Date()): Promise<PlacedTown | null> {
  const want = plainName(name);
  if (!want) return null;
  const [trip, cities] = await Promise.all([
    prisma.trip.findUnique({ where: { id: tripId }, select: { timeZone: true } }),
    prisma.city.findMany({ where: { tripId, hidden: false }, select: { name: true, country: true, timeZone: true, latitude: true, longitude: true }, orderBy: { sequenceOrder: "asc" } }),
  ]);
  const own = cities.find((c) => c.latitude != null && c.longitude != null && (plainName(c.name) === want || plainName(short(c.name)) === want));
  if (own) return { place: short(own.name), pt: { lat: own.latitude!, lng: own.longitude! }, zone: zoneFor(own.timeZone, trip?.timeZone), country: own.country?.trim() || null, found: "trip" };
  const countries = [...new Set(cities.map((c) => c.country?.trim()).filter((c): c is string => !!c))];
  const t = await findTown(name, countries);
  if (!t) return null;
  // (the clock's words: the map names Hanoi's zone "Asia/Bangkok", which would be said "Thailand time". A city of the
  // trip in the same country, on the same clock at this moment, gives the zone the trip already uses for that country.)
  const mate = cities.map((c) => ({ country: c.country?.trim().toLowerCase(), zone: zoneFor(c.timeZone, trip?.timeZone) }))
    .find((c) => c.country === t.country.trim().toLowerCase() && clockAt(c.zone, now) === clockAt(t.zone, now) && clockAt(c.zone, now) !== "");
  return { place: t.name, pt: { lat: t.lat, lng: t.lng }, zone: mate?.zone ?? t.zone, country: t.country, found: "search" };
}

/** Asked about a run of far-off days in one town, past years are read once, for the middle day: each reading is five
 *  requests to the archive, and a week either side of a day says the same of its neighbours. At most six towns an ask. */
export const TYPICAL_ONCE = "Past years are given once for each town: on the middle day of its days asked about, for the week around that day.";
const MOST_TOWNS = 6;
const middle = <T>(xs: T[]) => xs[Math.floor((xs.length - 1) / 2)];

/** What past years were like where this person sleeps on far-off days: the sentence for each day that gets one (one a
 *  town), and whether some day shares another's. A day the plan has no place for, or an archive that didn't answer,
 *  gets nothing. */
export async function typicalForDays(tripId: string, person: string, farDates: string[]): Promise<{ byDate: Map<string, string>; once: boolean }> {
  const byDate = new Map<string, string>();
  const runs: { town: string; days: { date: string; pt: Pt }[] }[] = [];
  for (const date of [...farDates].sort()) {
    const at = await dayPlaces(tripId, person, date).catch(() => null);
    if (!at) continue;
    const last = runs[runs.length - 1];
    if (last && last.town === at.night.town) last.days.push({ date, pt: at.night });
    else runs.push({ town: at.night.town, days: [{ date, pt: at.night }] });
  }
  const read = runs.slice(0, MOST_TOWNS);
  await Promise.all(read.map(async (r) => {
    const d = middle(r.days);
    const t = await typicalWeek(d.pt, d.date, await dayZone(tripId, d.date));
    if (t) byDate.set(d.date, typicalWords(t, r.town));
  }));
  return { byDate, once: byDate.size > 0 && read.some((r) => r.days.length > 1) };
}

/** get_weather's answer for a named town on a plan trip. `asked`: real calendar dates (none: the town's own today);
 *  `tripToday`: the trip's today, for a town that can't be placed; `hourlyHow`: get_weather's own sentence, given its
 *  clock's words, so the two never drift apart. */
export async function planTownWeather(o: {
  tripId: string; town: string; asked: string[]; hours: { from: number; to: number } | null; tripToday: string; now?: Date;
  hourlyHow: (clockWords: string) => string;
}): Promise<Record<string, unknown>> {
  const now = o.now ?? new Date();
  const asked = o.town.trim().replace(/\s+/g, " ").slice(0, 60);
  const at = await planTown(o.tripId, asked, now);
  const datesFrom = (today: string) => [...new Set(o.asked.length ? o.asked : [today])].sort().slice(0, 16);

  if (!at) {
    const where = orWords(await tripCountries(o.tripId));
    return {
      days: datesFrom(o.tripToday).map((date) => ({ date, day: dayName(date), none: date < o.tripToday ? OVER : `No forecast for ${asked}: Wander couldn't place a town of that name${where ? ` in ${where}` : ""}.` })),
      townHow: TOWN_HOW,
      source: "Wander's forecast (Open-Meteo), the same source as the day pages; towns are placed by Open-Meteo's place search",
      say: "Say plainly that Wander couldn't place that town, and nothing about its weather.",
    };
  }

  const today = dateIn(at.zone, now);
  const readAt = (iso: string) => `${new Date(iso).toLocaleString("en-US", { timeZone: at.zone, hour: "numeric", minute: "2-digit", ...(iso.slice(0, 10) !== now.toISOString().slice(0, 10) ? { weekday: "short" } : {}) })} ${zoneWords(at.zone)}`;
  // (past years once, for the middle of its far-off days)
  const dates = datesFrom(today);
  const farDates = dates.filter((d) => awayOf(d, today) > 15);
  const typicalDate = farDates.length ? middle(farDates) : null;
  const past = typicalDate ? await typicalWeek(at.pt, typicalDate, at.zone) : null;
  const typical = !!past;
  const days = await Promise.all(dates.map(async (date) => {
    const away = awayOf(date, today);
    if (away < 0) return { date, day: dayName(date), none: OVER };
    if (away > 15) return { date, day: dayName(date), none: FAR, ...(past && date === typicalDate ? { typical: typicalWords(past, at.place) } : {}) };
    const w = await forecastAt(at.pt, date, away, at.zone);
    if (!w) return { date, day: dayName(date), none: `Wander has no forecast for ${at.place} for that day just now.` };
    const h = o.hours ? await hoursAt(at.pt, date, o.hours.from, o.hours.to, at.zone) : null;
    return {
      date, day: dayName(date),
      lines: forecastLines({ place: at.place, atHotel: false, town: at.place, ...w }, date, at.place, now, at.zone).map((l) => plain(l.text)),
      read: readAt(w.at),
      ahead: w.outlook === "early outlook" ? "an early outlook: more than a week ahead, likely to change" : "a week or less",
      ...(h ? { hourly: [hourlyWords(at.place, h)] } : {}),
    };
  }));
  return {
    days,
    source: `Wander's forecast for ${at.place} (Open-Meteo), the same source as the day pages`,
    ...(at.found === "search" ? { placed: `${at.place} in ${at.country}, found by Open-Meteo's place search` } : {}),
    ...(o.hours ? { hourlyHow: o.hourlyHow(zoneWords(at.zone)) } : {}),
    ...(typical ? { typicalHow: TYPICAL_HOW } : {}),
    ...(typical && farDates.length > 1 ? { typicalOnce: TYPICAL_ONCE } : {}),
    say: `Give the numbers exactly as the lines have them, and say in a short clause that it's not where the plan has them that day, unless their day passes through it (say where it does, from DAY BY DAY). Its days and hours are on its own clock, ${zoneWords(at.zone)}.${at.found === "search" ? " Name the town with its country once, as \"placed\" has it, so they can tell it is the town they meant." : ""}`,
  };
}
