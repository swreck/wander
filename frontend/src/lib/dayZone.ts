/**
 * Which clock and which country a day is lived on, in one place (December plan S2a, Nov 17 2026). December runs
 * Vietnam, Cambodia and Japan, flown from California through Seoul and Bangkok, so "Japan time" and Tokyo's date can't
 * be assumed. A day's zone is its city's `timeZone`, else the trip's; its country is its city's `country`. The words for
 * a clock are one table, the same six as the server's (backend/src/services/zoneWords.ts; a test reads both).
 * Japan's trip has no zone on its cities, so every path falls to the trip's zone, as it always did.
 */

export const ZONE_WORDS: Record<string, string> = {
  "America/Los_Angeles": "California time",
  "Asia/Tokyo": "Japan time",
  "Asia/Ho_Chi_Minh": "Vietnam time",
  "Asia/Phnom_Penh": "Cambodia time",
  "Asia/Seoul": "Korea time",
  "Asia/Bangkok": "Thailand time",
};

/** "California time", "Japan time" — whose clock a time is on. A zone not in the table reads as its last part plus
 *  "time" ("Asia/Singapore" → "Singapore time"): a person never sees a raw "Asia/…" name. */
export function zoneWords(zone: string): string {
  if (ZONE_WORDS[zone]) return ZONE_WORDS[zone];
  const last = zone.split("/").pop() || zone;
  return `${last.replace(/_/g, " ")} time`;
}

/** The place names of the table, as a pattern: "California|Japan|Vietnam|Cambodia|Korea|Thailand" */
export const ZONE_NAMES_PATTERN = Object.values(ZONE_WORDS).map((w) => w.replace(/ time$/, "")).join("|");

/** The zone a spoken clock ("Korea time" or "Korea") names; null when it isn't one of the table's */
export function zoneFromWords(words: string): string | null {
  const name = words.trim().replace(/ time$/i, "").toLowerCase();
  const hit = Object.entries(ZONE_WORDS).find(([, w]) => w.replace(/ time$/, "").toLowerCase() === name);
  return hit ? hit[0] : null;
}

/** A day of the trip, as the phone holds it (guideData's `days`): its date and the city it is lived in */
export type DayLike = { date: string; city?: { timeZone?: string | null; country?: string | null } | null };

const same = (a: string, b: string) => a.slice(0, 10) === b.slice(0, 10);

/** The clock a date is lived on: its city's zone, else the trip's. */
export function zoneOfDay(days: DayLike[] | undefined | null, date: string, tripZone: string): string {
  const d = (days || []).find((x) => same(x.date, date));
  return d?.city?.timeZone || tripZone;
}

/** The country a date is lived in: its city's. Null when the day or its city doesn't say. */
export function countryOfDay(days: DayLike[] | undefined | null, date: string): string | null {
  const d = (days || []).find((x) => same(x.date, date));
  return d?.city?.country?.trim() || null;
}

/** "On this Vietnam date" — the day's own country; a day whose country isn't known says "On this date", never Japan */
export const stillHomeOn = (country?: string | null) => (country?.trim() ? `On this ${country.trim()} date` : "On this date");

/** "your first day in Vietnam" — the day's own country; none known says "your first day" */
export const firstDayIn = (country?: string | null) => (country?.trim() ? `your first day in ${country.trim()}` : "your first day");

/** The calendar date at a moment on a zone's clock ("2026-12-20") */
export function dateIn(zone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The hour (0–23) at a moment on a zone's clock */
export function hourIn(zone: string, now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(now));
}

/** The moment a clock time ("18:00") on a date happens on a zone's clock */
export function momentOn(date: string, hhmm: string, zone: string): Date {
  return new Date(`${date}T${hhmm}:00${offsetIso(zone, new Date(`${date}T${hhmm}:00Z`))}`);
}

/** The UTC offset of a zone at a moment as "+07:00" (for building an ISO moment on that zone's clock) */
export function offsetIso(zone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  const mins = Math.round((asUtc - at.getTime()) / 60000);
  const sign = mins < 0 ? "-" : "+";
  const m = Math.abs(mins);
  return `${sign}${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
