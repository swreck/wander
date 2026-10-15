/**
 * When her plan's time runs past a stop's hours, as Google lists them (Oct 15 2026 — Ken: "the feature or info or view
 * the user would want before they realize they want it"; Kyoto's temples close at 4:30 or 5). Only for a place Wander
 * has checked is the one her line means (its photo's place). Says nothing when her times fit, or Google has no hours.
 * Always as Google's: "Google lists Raku Museum as closing at 4:30 PM" — her plan is never changed or second-guessed.
 */
export type Hours = {
  weekly: { open: { day: number; time: string }; close?: { day: number; time: string } }[];
  dated: { open: { date: string; time: string }; close?: { date: string; time: string } }[];
  status: string | null;
  at: number;
};

const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2, 4));
const said = (m: number) => {
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""}\u00a0${h < 12 ? "AM" : "PM"}`;
};
const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** The day's open spans in minutes from that midnight ([] = closed that day), and whether they're the date's own */
function spans(h: Hours, date: string): { list: [number, number][]; dated: boolean } | null {
  const dates = h.dated.map((d) => d.open.date).sort();
  if (dates.length && dates[0] <= date && date <= dates[dates.length - 1]) {
    return { dated: true, list: h.dated.filter((d) => d.open.date === date).map((d) => [min(d.open.time), d.close ? min(d.close.time) + (d.close.date > date ? 1440 : 0) : 1440] as [number, number]) };
  }
  if (!h.weekly.length) return null;
  // (open around the clock: Google gives one period with no close)
  if (h.weekly.length === 1 && !h.weekly[0].close && h.weekly[0].open.time === "0000") return { dated: false, list: [[0, 1440]] };
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { dated: false, list: h.weekly.filter((p) => p.open.day === day).map((p) => [min(p.open.time), p.close ? min(p.close.time) + (p.close.day !== day ? 1440 : 0) : 1440] as [number, number]) };
}

/**
 * Google's word on a stop, for her plan's time on a date: closed that day, not yet open at her start, or closed before
 * her line ends (start/end in minutes after midnight; end null when her plan doesn't say). Null when it all fits.
 */
export function hoursWords(h: Hours | null | undefined, place: string, date: string, start: number | null, end: number | null): string | null {
  if (!h) return null;
  if (h.status === "CLOSED_PERMANENTLY") return `Google lists ${place} as permanently closed.`;
  if (h.status === "CLOSED_TEMPORARILY") return `Google lists ${place} as closed for now.`;
  if (start === null) return null;
  const s = spans(h, date);
  if (!s) return null;
  if (!s.list.length) {
    const d = new Date(`${date}T12:00:00Z`);
    return s.dated ? `Google lists ${place} as closed on ${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}.`
      : `Google lists ${place} as closed on ${DAYS[d.getUTCDay()]}.`;
  }
  const sorted = [...s.list].sort((a, b) => a[0] - b[0]);
  // (a quarter hour's grace either side: arriving at 9:50 for a 10:00 opening is no news — tourist70)
  const at = sorted.find(([o, c]) => o - 15 <= start && start < c);
  if (!at) {
    const later = sorted.find(([o]) => o > start);
    // (a whole street or market: its listing's hours aren't every shop's — "Google's hours for … start at 10 AM", so it
    // doesn't read as nothing open before 10; tourist70 on Kappabashi)
    if (later) return /\b(town|street|market|arcade|d[oō]ri|sh[oō]tengai|district|alley|yokocho)\b/i.test(place)
      ? `Google's hours for ${place} start at ${said(later[0])}.` : `Google lists ${place} as opening at ${said(later[0])}.`;
    return `Google lists ${place} as closing at ${said(sorted[sorted.length - 1][1])}.`;
  }
  // (a quarter hour's grace: her "until ~5:00" at a place closing at 4:45 is said; at 4:50, not)
  if (end !== null && at[1] < 1440 && end - at[1] >= 15) return `Google lists ${place} as closing at ${said(at[1])}.`;
  return null;
}
