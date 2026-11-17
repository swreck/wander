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

/** The calendar date at a moment on a zone's clock ("2026-12-20") */
export function dateIn(zone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
