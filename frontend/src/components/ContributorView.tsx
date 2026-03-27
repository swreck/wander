import type { Experience, Trip } from "../lib/types";
import { getContributorColor, getContributorInitial } from "../lib/travelerProfiles";

interface Props {
  travelerCode: string;
  experiences: Experience[];
  trip: Trip;
  onClose: () => void;
  onExperienceClick?: (id: string) => void;
}

/**
 * Trip-wide view of one traveler's contributions, grouped by city.
 * Shows state (planned/maybe) and day assignment for each item.
 */
export default function ContributorView({ travelerCode, experiences, trip, onClose, onExperienceClick }: Props) {
  const color = getContributorColor(travelerCode);
  const initial = getContributorInitial(travelerCode);
  const travelerExps = experiences.filter(e => e.createdBy === travelerCode);

  // Group by city
  const byCity: Record<string, { cityName: string; items: typeof travelerExps }> = {};
  for (const exp of travelerExps) {
    const city = trip.cities.find(c => c.id === exp.cityId);
    const cityName = city?.name || "Unknown";
    if (!byCity[cityName]) byCity[cityName] = { cityName, items: [] };
    byCity[cityName].items.push(exp);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-hidden flex flex-col"
           style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#f0ece5] shrink-0 flex items-center gap-3">
          <span
            className="w-8 h-8 rounded-full text-sm font-bold flex items-center justify-center"
            style={{ backgroundColor: color.bg, color: color.text, border: `2px solid ${color.border}` }}
          >
            {initial}
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-[#3a3128]">{travelerCode}'s contributions</h3>
            <p className="text-xs text-[#a89880]">
              {travelerExps.length} activit{travelerExps.length !== 1 ? "ies" : "y"} across {Object.keys(byCity).length} cit{Object.keys(byCity).length !== 1 ? "ies" : "y"}
            </p>
          </div>
          <button onClick={onClose} className="text-[#c8bba8] hover:text-[#6b5d4a] text-lg">&times;</button>
        </div>

        {/* City groups */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {Object.entries(byCity).map(([cityName, { items }]) => (
            <div key={cityName}>
              <div className="text-xs font-medium text-[#a89880] uppercase tracking-wider mb-1.5">{cityName} ({items.length})</div>
              <div className="space-y-1">
                {items.map(exp => (
                  <div
                    key={exp.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#faf8f5] border border-[#e0d8cc]
                               hover:border-[#a89880] cursor-pointer transition-colors"
                    style={{ borderLeftWidth: 3, borderLeftColor: color.dot }}
                    onClick={() => onExperienceClick?.(exp.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[#3a3128] truncate">{exp.name}</div>
                      {exp.description && (
                        <div className="text-xs text-[#a89880] truncate">{exp.description}</div>
                      )}
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
                      exp.state === "selected"
                        ? "bg-green-100 text-green-700"
                        : "bg-[#f0ece5] text-[#8a7a62]"
                    }`}>
                      {exp.state === "selected" ? "Planned" : "Maybe"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
