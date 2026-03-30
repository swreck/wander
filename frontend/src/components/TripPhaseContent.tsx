/**
 * TripPhaseContent — Phase-specific content blocks for TripOverview.
 *
 * Renders contextual content based on where the trip is in its lifecycle.
 * Each phase shows what's most useful right now — not a different app,
 * just a warmer home screen.
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { TripPhase } from "../lib/tripPhase";
import type { Trip, Day, Experience, City } from "../lib/types";
import PlanningProgress from "./PlanningProgress";
import ScoutNudge from "./ScoutNudge";

interface TripPhaseContentProps {
  phase: TripPhase;
  trip: Trip;
  days: Day[];
  experiences: Experience[];
}

export default function TripPhaseContent({ phase, trip, days, experiences }: TripPhaseContentProps) {
  const navigate = useNavigate();
  const cities = trip.cities || [];

  // Today's day (for active phase)
  const todayDay = useMemo(() => {
    if (phase !== "active") return null;
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    return days.find(d => d.date.split("T")[0] === todayStr) || null;
  }, [phase, days]);

  // Tomorrow's day
  const tomorrowDay = useMemo(() => {
    if (phase !== "active") return null;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    return days.find(d => d.date.split("T")[0] === tomorrowStr) || null;
  }, [phase, days]);

  // Phase-specific Scout nudges
  const nudges = useMemo(() => {
    const result: { key: string; message: string; onTap?: () => void; tapLabel?: string }[] = [];

    if (phase === "dreaming") {
      const citiesWithIdeas = new Set(experiences.map(e => e.cityId));
      const totalIdeas = experiences.length;
      if (cities.length > 0 && totalIdeas === 0) {
        result.push({
          key: `${trip.id}-no-ideas`,
          message: `You've got ${cities.length} ${cities.length === 1 ? "city" : "cities"} but no ideas saved yet. Want to start exploring?`,
          tapLabel: "Add ideas",
          onTap: () => navigate("/plan"),
        });
      }
      if (cities.length > 2 && citiesWithIdeas.size < cities.length / 2) {
        const neglected = cities.filter(c => !c.hidden && !citiesWithIdeas.has(c.id));
        if (neglected.length > 0) {
          result.push({
            key: `${trip.id}-neglected-cities`,
            message: `${neglected[0].name} doesn't have any ideas saved yet`,
          });
        }
      }
    }

    if (phase === "planning" || phase === "soon") {
      // Food-heavy detection
      const foodCount = experiences.filter(e =>
        e.themes?.includes("food") && e.state === "selected"
      ).length;
      if (foodCount > 10) {
        result.push({
          key: `${trip.id}-food-heavy`,
          message: `You've got ${foodCount} food spots scheduled — that's a lot of eating! Some days might have more meals than hours.`,
        });
      }

      // Busy day detection
      for (const day of days) {
        const dayExps = experiences.filter(e => e.dayId === day.id && e.state === "selected");
        if (dayExps.length >= 6) {
          const dateLabel = new Date(day.date).toLocaleDateString("en-US", {
            month: "short", day: "numeric", timeZone: "UTC",
          });
          result.push({
            key: `${trip.id}-busy-${day.id}`,
            message: `${dateLabel} has ${dayExps.length} things planned. That's a full day — might be worth spreading some out.`,
            tapLabel: "Take a look",
            onTap: () => navigate(`/plan?city=${day.cityId}`),
          });
          break; // Only show one busy-day nudge
        }
      }
    }

    return result;
  }, [phase, trip, days, experiences, cities, navigate]);

  return (
    <>
      {/* Planning progress — shown during planning and soon phases */}
      {(phase === "planning" || phase === "soon") && (
        <PlanningProgress
          days={days}
          experiences={experiences}
          cities={cities}
        />
      )}

      {/* Phase-specific nudges */}
      {nudges.length > 0 && (
        <div className="space-y-2 mb-4">
          {nudges.map(n => (
            <ScoutNudge
              key={n.key}
              nudgeKey={n.key}
              message={n.message}
              onTap={n.onTap}
              tapLabel={n.tapLabel}
            />
          ))}
        </div>
      )}

      {/* Active phase: today's day preview */}
      {phase === "active" && todayDay && (
        <div className="mb-4">
          <button
            onClick={() => navigate("/now")}
            className="w-full text-left p-3 bg-white rounded-lg border border-[#e0d8cc]
                       hover:border-[#a89880] transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-[#3a3128]">Today</span>
              <span className="text-xs text-[#a89880]">
                {todayDay.city?.name || ""}
                {" · tap for full view →"}
              </span>
            </div>
            {(() => {
              const todayExps = experiences.filter(
                e => e.dayId === todayDay.id && e.state === "selected"
              );
              const todayRes = todayDay.reservations || [];
              if (todayExps.length === 0 && todayRes.length === 0) {
                return <p className="text-xs text-[#a89880]">A free day — go where the wind takes you</p>;
              }
              return (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {todayRes.map(r => (
                    <span key={r.id} className="text-xs px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[#6b5d4a]">
                      {r.name}
                      {r.datetime && ` · ${new Date(r.datetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                    </span>
                  ))}
                  {todayExps.slice(0, 4).map(e => (
                    <span key={e.id} className="text-xs px-2 py-0.5 rounded-full bg-[#f0ece5] text-[#6b5d4a]">
                      {e.name}
                    </span>
                  ))}
                  {todayExps.length > 4 && (
                    <span className="text-xs text-[#c8bba8]">+{todayExps.length - 4} more</span>
                  )}
                </div>
              );
            })()}
          </button>
        </div>
      )}

      {/* Active phase: tomorrow preview */}
      {phase === "active" && tomorrowDay && (
        <div className="mb-4">
          <div className="px-3 py-2 bg-[#faf8f5] rounded-lg border border-[#f0ece5]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#8a7a62]">Tomorrow</span>
              <span className="text-xs text-[#c8bba8]">{tomorrowDay.city?.name || ""}</span>
            </div>
            {(() => {
              const tmrwExps = experiences.filter(
                e => e.dayId === tomorrowDay.id && e.state === "selected"
              );
              if (tmrwExps.length === 0) {
                return <p className="text-xs text-[#c8bba8] mt-0.5">Nothing planned yet</p>;
              }
              return (
                <p className="text-xs text-[#a89880] mt-0.5">
                  {tmrwExps.slice(0, 3).map(e => e.name).join(", ")}
                  {tmrwExps.length > 3 ? ` +${tmrwExps.length - 3} more` : ""}
                </p>
              );
            })()}
          </div>
        </div>
      )}

      {/* Past phase: trip summary */}
      {phase === "past" && (
        <div className="mb-6 p-4 bg-white rounded-lg border border-[#e0d8cc]">
          <h3 className="text-sm font-medium text-[#3a3128] mb-2">Welcome home</h3>
          <div className="grid grid-cols-3 gap-3 text-center mb-3">
            <div>
              <div className="text-lg font-light text-[#3a3128]">
                {cities.filter(c => !c.hidden).length}
              </div>
              <div className="text-xs text-[#a89880]">cities</div>
            </div>
            <div>
              <div className="text-lg font-light text-[#3a3128]">{days.length}</div>
              <div className="text-xs text-[#a89880]">days</div>
            </div>
            <div>
              <div className="text-lg font-light text-[#3a3128]">
                {experiences.filter(e => e.state === "selected").length}
              </div>
              <div className="text-xs text-[#a89880]">things you did</div>
            </div>
          </div>
          {/* Contributor summary */}
          {(() => {
            const byCreator: Record<string, number> = {};
            for (const e of experiences) {
              if (e.createdBy) byCreator[e.createdBy] = (byCreator[e.createdBy] || 0) + 1;
            }
            const contributors = Object.keys(byCreator);
            if (contributors.length <= 1) return null;
            return (
              <p className="text-xs text-[#a89880] text-center">
                {contributors.length} people contributed ideas
              </p>
            );
          })()}
          <button
            onClick={() => navigate("/story")}
            className="w-full mt-3 py-2 rounded-lg bg-[#514636] text-white text-sm font-medium
                       hover:bg-[#3a3128] transition-colors"
          >
            See your trip story
          </button>
        </div>
      )}

      {/* Soon phase: readiness nudge */}
      {phase === "soon" && (
        <ScoutNudge
          nudgeKey={`${trip.id}-getting-close`}
          message={(() => {
            if (!trip.startDate) return "Getting close!";
            const today = new Date();
            const nowUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
            const [sy, sm, sd] = trip.startDate.split("T")[0].split("-").map(Number);
            const startUTC = Date.UTC(sy, sm - 1, sd);
            const daysUntil = Math.round((startUTC - nowUTC) / 86400000);
            return daysUntil === 1
              ? "Tomorrow! Make sure everyone has what they need."
              : `${daysUntil} days to go. This is a good time to double-check reservations and make sure everyone's set.`;
          })()}
        />
      )}
    </>
  );
}
