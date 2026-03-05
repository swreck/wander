import { useState } from "react";
import type { ExtractionResult } from "./CreateTrip";

interface Props {
  data: ExtractionResult;
  onCommit: (data: ExtractionResult) => void;
  onBack: () => void;
  submitting: boolean;
  error: string;
}

export default function ImportReview({ data, onCommit, onBack, submitting, error }: Props) {
  const [edited, setEdited] = useState<ExtractionResult>({ ...data });

  function updateField<K extends keyof ExtractionResult>(key: K, value: ExtractionResult[K]) {
    setEdited({ ...edited, [key]: value });
  }

  function removeCity(index: number) {
    const updated = edited.cities.filter((_, i) => i !== index);
    updateField("cities", updated);
  }

  function removeExperience(index: number) {
    const updated = edited.experiences.filter((_, i) => i !== index);
    updateField("experiences", updated);
  }

  function removeAccommodation(index: number) {
    const updated = edited.accommodations.filter((_, i) => i !== index);
    updateField("accommodations", updated);
  }

  function removeRouteSegment(index: number) {
    const updated = edited.routeSegments.filter((_, i) => i !== index);
    updateField("routeSegments", updated);
  }

  function formatDate(d: string | null | undefined): string {
    if (!d) return "";
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  // Group experiences by city
  const experiencesByCity: Record<string, typeof edited.experiences> = {};
  for (const exp of edited.experiences) {
    const key = exp.cityName || "Unassigned";
    if (!experiencesByCity[key]) experiencesByCity[key] = [];
    experiencesByCity[key].push(exp);
  }

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={onBack}
          className="text-sm text-[#8a7a62] hover:text-[#3a3128] mb-4 transition-colors"
        >
          &larr; Back to import
        </button>

        <h1 className="text-2xl font-light text-[#3a3128] mb-1">Review Extraction</h1>
        <p className="text-sm text-[#8a7a62] mb-6">
          Review what was extracted. Remove items that don't belong, then confirm to create your trip.
        </p>

        {/* Trip basics */}
        <section className="mb-6">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">
            Trip
          </h2>
          <div className="bg-white rounded-lg border border-[#f0ece5] p-4 space-y-3">
            <div>
              <label className="text-xs text-[#a89880]">Name</label>
              <input
                type="text"
                value={edited.tripName}
                onChange={(e) => updateField("tripName", e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-[#e0d8cc] bg-white
                           text-[#3a3128] text-sm focus:outline-none focus:ring-2 focus:ring-[#a89880]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#a89880]">Start</label>
                <input
                  type="date"
                  value={edited.startDate}
                  onChange={(e) => updateField("startDate", e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#e0d8cc] bg-white
                             text-[#3a3128] text-sm focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                />
              </div>
              <div>
                <label className="text-xs text-[#a89880]">End</label>
                <input
                  type="date"
                  value={edited.endDate}
                  onChange={(e) => updateField("endDate", e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#e0d8cc] bg-white
                             text-[#3a3128] text-sm focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Cities */}
        <section className="mb-6">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">
            Cities ({edited.cities.length})
          </h2>
          <div className="space-y-2">
            {edited.cities.map((city, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-3
                           bg-white rounded-lg border border-[#f0ece5]"
              >
                <div>
                  <span className="text-[#3a3128] font-medium">{city.name}</span>
                  {city.country && (
                    <span className="text-[#a89880] text-sm ml-2">{city.country}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[#8a7a62]">
                    {formatDate(city.arrivalDate)} — {formatDate(city.departureDate)}
                  </span>
                  <button
                    onClick={() => removeCity(i)}
                    className="text-[#c8bba8] hover:text-red-500 transition-colors text-lg"
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Route Segments */}
        {edited.routeSegments.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">
              Route ({edited.routeSegments.length})
            </h2>
            <div className="space-y-2">
              {edited.routeSegments.map((seg, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3
                             bg-white rounded-lg border border-[#f0ece5] text-sm"
                >
                  <span className="text-[#3a3128]">{seg.originCity}</span>
                  <span className="text-[#c8bba8]">&rarr;</span>
                  <span className="text-[#3a3128]">{seg.destinationCity}</span>
                  <span className="text-[#a89880] text-xs capitalize">{seg.transportMode}</span>
                  {seg.departureDate && (
                    <span className="text-[#a89880] text-xs">{formatDate(seg.departureDate)}</span>
                  )}
                  <button
                    onClick={() => removeRouteSegment(i)}
                    className="ml-auto text-[#c8bba8] hover:text-red-500 transition-colors text-lg"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Accommodations */}
        {edited.accommodations.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">
              Accommodations ({edited.accommodations.length})
            </h2>
            <div className="space-y-2">
              {edited.accommodations.map((acc, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3
                             bg-white rounded-lg border border-[#f0ece5]"
                >
                  <div>
                    <span className="text-[#3a3128] font-medium text-sm">{acc.name}</span>
                    <span className="text-[#a89880] text-xs ml-2">{acc.cityName}</span>
                    {acc.address && (
                      <div className="text-xs text-[#8a7a62] mt-0.5">{acc.address}</div>
                    )}
                  </div>
                  <button
                    onClick={() => removeAccommodation(i)}
                    className="text-[#c8bba8] hover:text-red-500 transition-colors text-lg"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Experiences grouped by city */}
        {edited.experiences.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">
              Activities & Experiences ({edited.experiences.length})
            </h2>
            {Object.entries(experiencesByCity).map(([cityName, exps]) => (
              <div key={cityName} className="mb-4">
                <h3 className="text-sm font-medium text-[#6b5d4a] mb-2">{cityName}</h3>
                <div className="space-y-1.5">
                  {exps.map((exp) => {
                    const globalIndex = edited.experiences.indexOf(exp);
                    return (
                      <div
                        key={globalIndex}
                        className="flex items-start justify-between px-4 py-2.5
                                   bg-white rounded-lg border border-[#f0ece5]"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[#3a3128] text-sm font-medium">{exp.name}</span>
                            {exp.dayDate && (
                              <span className="text-xs text-[#a89880]">
                                {formatDate(exp.dayDate)}
                              </span>
                            )}
                            {exp.timeWindow && (
                              <span className="text-xs text-[#c8bba8]">{exp.timeWindow}</span>
                            )}
                          </div>
                          {exp.description && (
                            <div className="text-xs text-[#8a7a62] mt-0.5 line-clamp-2">
                              {exp.description}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => removeExperience(globalIndex)}
                          className="ml-2 text-[#c8bba8] hover:text-red-500 transition-colors text-lg flex-shrink-0"
                        >
                          &times;
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Notes from extraction */}
        {edited.notes && (
          <section className="mb-6">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">
              Notes
            </h2>
            <div className="px-4 py-3 bg-white rounded-lg border border-[#f0ece5] text-sm text-[#8a7a62]">
              {edited.notes}
            </div>
          </section>
        )}

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          onClick={() => onCommit(edited)}
          disabled={submitting || !edited.tripName || !edited.startDate || !edited.endDate || edited.cities.length === 0}
          className="w-full py-3 rounded-lg bg-[#514636] text-white text-sm font-medium
                     hover:bg-[#3a3128] disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors"
        >
          {submitting ? "Creating trip..." : "Create Trip from This Itinerary"}
        </button>
      </div>
    </div>
  );
}
