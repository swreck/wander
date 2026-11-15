/**
 * Determines the current lifecycle phase of a trip.
 *
 * Phases:
 * - "dreaming"   — dates not yet known
 * - "planning"   — dates set, trip is 2+ weeks away
 * - "soon"       — under 2 weeks out
 * - "active"     — currently within trip dates
 * - "past"       — trip has ended
 */

export type TripPhase = "dreaming" | "planning" | "soon" | "active" | "past";

export function getTripPhase(opts: {
  datesKnown: boolean;
  startDate: string | null;
  endDate: string | null;
}): TripPhase {
  if (!opts.datesKnown || !opts.startDate || !opts.endDate) {
    return "dreaming";
  }

  const today = new Date();
  const nowUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  const [sy, sm, sd] = opts.startDate.split("T")[0].split("-").map(Number);
  const [ey, em, ed] = opts.endDate.split("T")[0].split("-").map(Number);
  const startUTC = Date.UTC(sy, sm - 1, sd);
  const endUTC = Date.UTC(ey, em - 1, ed);

  const msPerDay = 86400000;

  if (nowUTC > endUTC) return "past";
  if (nowUTC >= startUTC) return "active";

  const daysUntil = Math.round((startUTC - nowUTC) / msPerDay);
  if (daysUntil <= 14) return "soon";
  return "planning";
}

/**
 * The trip's last day (YYYY-MM-DD) once it's past on the trip's own clock, else null — before the trip and on every day
 * of it, null (Nov 15 2026; Ken, on Japan after it ended: "I would like the old Japan to open, looking like it looked on
 * the last day"). `dates`: the trip's days and its end date, any of them may be missing.
 */
export function finishedLastDay(dates: (string | null | undefined)[], zone = "Asia/Tokyo", now = new Date()): string | null {
  const last = dates.filter((d): d is string => !!d).map((d) => String(d).slice(0, 10)).sort().pop();
  if (!last) return null;
  let today: string;
  try { today = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
  catch { today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
  return today > last ? last : null;
}

/** Human-readable phase label */
export function phaseLabel(phase: TripPhase): string {
  switch (phase) {
    case "dreaming": return "Dreaming";
    case "planning": return "Planning";
    case "soon": return "Almost time";
    case "active": return "You're there";
    case "past": return "Welcome home";
  }
}
