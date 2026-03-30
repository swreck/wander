/**
 * PlanningProgress — A warm, at-a-glance sense of planning readiness.
 *
 * Shows during the "planning" and "soon" phases. Not a checklist or
 * progress bar — more like a friend saying "here's where things stand."
 */

import type { Day, Experience, City } from "../lib/types";

interface PlanningProgressProps {
  days: Day[];
  experiences: Experience[];
  cities: City[];
}

export default function PlanningProgress({ days, experiences, cities }: PlanningProgressProps) {
  const daysWithPlans = new Set<string>();
  for (const exp of experiences) {
    if (exp.state === "selected" && exp.dayId) daysWithPlans.add(exp.dayId);
  }
  for (const day of days) {
    if (day.reservations?.length > 0) daysWithPlans.add(day.id);
  }

  const totalDays = days.length;
  const plannedDays = daysWithPlans.size;

  // City coverage
  const visibleCities = cities.filter(c => !c.hidden);
  const citiesWithIdeas: Record<string, number> = {};
  for (const exp of experiences) {
    citiesWithIdeas[exp.cityId] = (citiesWithIdeas[exp.cityId] || 0) + 1;
  }
  const citiesNeedingAttention = visibleCities.filter(c => !citiesWithIdeas[c.id]);

  if (totalDays === 0) return null;

  return (
    <div className="mb-4 px-3 py-2.5 bg-white rounded-lg border border-[#f0ece5]">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#6b5d4a]">
          {plannedDays === totalDays
            ? "Every day has something planned"
            : plannedDays === 0
              ? `${totalDays} days — all wide open so far`
              : `${plannedDays} of ${totalDays} days have something planned · ${totalDays - plannedDays} left to fill (or leave open)`}
        </span>
      </div>

      {/* Subtle progress indication */}
      {plannedDays < totalDays && (
        <div className="mt-2 h-1.5 rounded-full bg-[#f0ece5] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#c8bba8] transition-all duration-500"
            style={{ width: `${(plannedDays / totalDays) * 100}%` }}
          />
        </div>
      )}

      {/* Cities needing attention */}
      {citiesNeedingAttention.length > 0 && (
        <p className="text-xs text-[#a89880] mt-2">
          {citiesNeedingAttention.length === 1
            ? `${citiesNeedingAttention[0].name} doesn't have any ideas saved yet`
            : `${citiesNeedingAttention.map(c => c.name).join(" and ")} could use some ideas`}
        </p>
      )}
    </div>
  );
}
