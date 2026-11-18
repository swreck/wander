/**
 * The words for a clock, one table (December plan S2a, Nov 17 2026). The phone's table (frontend/src/lib/dayZone.ts)
 * holds the same six; a test reads both and fails if they differ. A zone not in the table reads as its last part plus
 * "time" ("Asia/Singapore" reads "Singapore time"). A person never sees a raw "Asia/…" name.
 */
export const ZONE_WORDS: Record<string, string> = {
  "America/Los_Angeles": "California time",
  "Asia/Tokyo": "Japan time",
  "Asia/Ho_Chi_Minh": "Vietnam time",
  "Asia/Phnom_Penh": "Cambodia time",
  "Asia/Seoul": "Korea time",
  "Asia/Bangkok": "Thailand time",
};

export function zoneWords(zone: string): string {
  if (ZONE_WORDS[zone]) return ZONE_WORDS[zone];
  const last = zone.split("/").pop() || zone;
  return `${last.replace(/_/g, " ")} time`;
}

/** "California|Japan|…": the names in the table, for a pattern that reads a spoken clock ("5:40 PM Korea time") */
export const ZONE_NAMES_PATTERN = Object.values(ZONE_WORDS).map((w) => w.replace(/ time$/, "")).join("|");

/** The zone a spoken clock ("Korea time" or "Korea") names; null when it isn't one of the table's */
export function zoneFromWords(words: string): string | null {
  const name = words.trim().replace(/ time$/i, "").toLowerCase();
  const hit = Object.entries(ZONE_WORDS).find(([, w]) => w.replace(/ time$/, "").toLowerCase() === name);
  return hit ? hit[0] : null;
}

/** The moment a local date and time happens in a time zone ("2026-10-09", 23:59, Tokyo → a Date) */
export function zonedMoment(date: string, minutes: number, zone: string): Date {
  const guess = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 0, minutes));
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    return new Date(guess.getTime() - (asUtc - guess.getTime()));
  } catch {
    return guess;
  }
}

/** The calendar date at a moment on a zone's clock ("2026-12-20") */
export function dateIn(zone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
