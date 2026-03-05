import { useState } from "react";
import type { Experience, Day, Trip } from "../lib/types";
import RatingsBadge from "./RatingsBadge";

interface Props {
  selected: Experience[];
  possible: Experience[];
  days: Day[];
  trip: Trip;
  onPromote: (expId: string, dayId: string, routeSegmentId?: string, timeWindow?: string) => void;
  onDemote: (expId: string) => void;
  onExperienceClick: (id: string) => void;
}

export default function ExperienceList({
  selected, possible, days, trip, onPromote, onDemote, onExperienceClick,
}: Props) {
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteDay, setPromoteDay] = useState("");
  const [promoteTimeWindow, setPromoteTimeWindow] = useState("");

  function handlePromoteSubmit(expId: string) {
    if (!promoteDay) return;
    onPromote(expId, promoteDay, undefined, promoteTimeWindow || undefined);
    setPromotingId(null);
    setPromoteDay("");
    setPromoteTimeWindow("");
  }

  return (
    <div className="p-3">
      {/* Selected zone */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wider text-[#a89880]">
          {selected.length} Selected · {possible.length} Possible
        </span>
      </div>

      {selected.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {selected.map((exp) => (
            <div
              key={exp.id}
              className="px-3 py-2.5 bg-[#faf8f5] rounded-lg border border-[#e0d8cc] cursor-pointer
                         hover:border-[#a89880] transition-colors"
              onClick={() => onExperienceClick(exp.id)}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-[#3a3128]">{exp.name}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDemote(exp.id); }}
                  className="text-xs text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
                  title="Move to candidates"
                >
                  &darr;
                </button>
              </div>
              {exp.timeWindow && (
                <div className="text-xs text-[#a89880] mt-0.5">{exp.timeWindow}</div>
              )}
              {exp.description && (
                <div className="text-xs text-[#8a7a62] mt-1 line-clamp-2">{exp.description}</div>
              )}
              <RatingsBadge ratings={exp.ratings} />
            </div>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-dashed border-[#e0d8cc] my-3" />

      {/* Possible zone */}
      <div className="space-y-1.5">
        {possible.map((exp) => (
          <div key={exp.id}>
            <div
              className={`px-3 py-2.5 bg-white rounded-lg border transition-colors cursor-pointer
                ${ratingBorderClass(exp)}
                hover:border-[#e0d8cc]`}
              onClick={() => onExperienceClick(exp.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#3a3128]">{exp.name}</span>
                  {exp.locationStatus === "unlocated" && (
                    <span className="text-[10px] text-[#c8bba8]" title="Location needed">
                      📍?
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setPromotingId(promotingId === exp.id ? null : exp.id); }}
                  className="text-xs text-[#a89880] hover:text-[#514636] transition-colors"
                  title="Add to itinerary"
                >
                  &uarr;
                </button>
              </div>
              {exp.description && (
                <div className="text-xs text-[#a89880] mt-1 line-clamp-2">{exp.description}</div>
              )}
              <RatingsBadge ratings={exp.ratings} />
            </div>

            {/* Inline promote panel */}
            {promotingId === exp.id && (
              <div className="mt-1 p-3 bg-[#faf8f5] rounded-lg border border-[#e0d8cc] space-y-2">
                <select
                  value={promoteDay}
                  onChange={(e) => setPromoteDay(e.target.value)}
                  className="w-full px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                             focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                >
                  <option value="">Select a day...</option>
                  {days.map((d) => (
                    <option key={d.id} value={d.id}>
                      {formatDate(d.date)} — {d.city.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={promoteTimeWindow}
                  onChange={(e) => setPromoteTimeWindow(e.target.value)}
                  placeholder="Time window (optional, e.g. morning)"
                  className="w-full px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                             placeholder-[#c8bba8] focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePromoteSubmit(exp.id)}
                    disabled={!promoteDay}
                    className="flex-1 py-1.5 rounded bg-[#514636] text-white text-xs font-medium
                               hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
                  >
                    Add to Day
                  </button>
                  <button
                    onClick={() => { setPromotingId(null); setPromoteDay(""); setPromoteTimeWindow(""); }}
                    className="px-3 py-1.5 rounded border border-[#e0d8cc] text-xs text-[#6b5d4a]
                               hover:bg-[#f0ece5] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {possible.length === 0 && selected.length === 0 && (
          <div className="text-center py-8 text-sm text-[#c8bba8]">
            No experiences yet. Tap + to capture one.
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function ratingBorderClass(exp: Experience): string {
  if (!exp.ratings || exp.ratings.length === 0) return "border-[#f0ece5]";
  const hasLow = exp.ratings.some((r) =>
    (r.platform !== "foursquare" && r.ratingValue < 3.8) ||
    (r.platform === "foursquare" && r.ratingValue < 6.5)
  );
  if (hasLow) return "border-l-4 border-l-amber-200 border-[#f0ece5]";
  const hasHigh = exp.ratings.some((r) =>
    (r.platform !== "foursquare" && r.ratingValue >= 4.5) ||
    (r.platform === "foursquare" && r.ratingValue >= 8.5)
  );
  if (hasHigh) return "border-l-4 border-l-green-200 border-[#f0ece5]";
  return "border-[#f0ece5]";
}
