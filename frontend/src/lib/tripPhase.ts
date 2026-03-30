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
