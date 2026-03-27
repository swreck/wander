import { useState } from "react";
import type { CaptureItem } from "../contexts/CaptureContext";
import type { Trip } from "../lib/types";

interface Props {
  items: CaptureItem[];
  trip: Trip;
  defaultCityId: string;
  onUpdateItem: (index: number, item: CaptureItem) => void;
  onRemoveItem: (index: number) => void;
}

/**
 * Multi-item review list with expandable cards.
 * Each item shows name + city, tap to expand for editing.
 */
export default function BatchReviewList({ items, trip, defaultCityId, onUpdateItem, onRemoveItem }: Props) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Group items by city for visual organization
  const tripCityNames = trip.cities.map(c => c.name.toLowerCase());

  function matchCity(cityName: string | null): string | null {
    if (!cityName) return null;
    const lower = cityName.toLowerCase();
    const match = trip.cities.find(c => {
      const cn = c.name.toLowerCase();
      return cn === lower || (lower.length >= 4 && (cn.includes(lower) || lower.includes(cn)));
    });
    return match?.id || null;
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-[#a89880] mb-2">
        Tap any item to edit. Tap the &times; to remove.
      </p>
      {items.map((item, index) => {
        const isExpanded = expandedIndex === index;
        const cityId = item.cityId || matchCity(item.cityName) || defaultCityId;
        const cityName = trip.cities.find(c => c.id === cityId)?.name || item.cityName || "Unknown";

        // Color indicator based on routing
        const isExistingCity = tripCityNames.includes(cityName.toLowerCase());

        return (
          <div
            key={index}
            className="rounded-lg border border-[#e0d8cc] bg-white overflow-hidden"
          >
            {/* Collapsed row */}
            <div
              className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-[#faf8f5] transition-colors"
              onClick={() => setExpandedIndex(isExpanded ? null : index)}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${isExistingCity ? "bg-green-400" : "bg-amber-400"}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#3a3128] truncate font-medium">{item.name}</div>
                <div className="text-xs text-[#a89880] truncate">{cityName}</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveItem(index); }}
                className="text-[#c8bba8] hover:text-red-400 text-sm shrink-0 px-1"
              >
                &times;
              </button>
            </div>

            {/* Expanded edit */}
            {isExpanded && (
              <div className="px-3 pb-3 pt-1 border-t border-[#f0ece5] space-y-2">
                <input
                  type="text"
                  value={item.name}
                  onChange={e => onUpdateItem(index, { ...item, name: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                             focus:outline-none focus:ring-1 focus:ring-[#a89880]"
                />
                {item.description && (
                  <textarea
                    value={item.description}
                    onChange={e => onUpdateItem(index, { ...item, description: e.target.value })}
                    rows={2}
                    className="w-full px-2.5 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128] resize-none
                               focus:outline-none focus:ring-1 focus:ring-[#a89880]"
                  />
                )}
                <select
                  value={cityId}
                  onChange={e => onUpdateItem(index, { ...item, cityId: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                             appearance-none focus:outline-none focus:ring-1 focus:ring-[#a89880]"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23a89880' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundPosition: "right 0.5rem center", backgroundRepeat: "no-repeat", backgroundSize: "1.5em 1.5em", paddingRight: "2.5rem" }}
                >
                  {trip.cities.map(city => (
                    <option key={city.id} value={city.id}>{city.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
