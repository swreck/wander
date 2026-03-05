import { useState } from "react";
import { api } from "../lib/api";

interface CityInput {
  name: string;
  country: string;
  arrivalDate: string;
  departureDate: string;
}

interface Props {
  onCreated: () => void;
}

export default function CreateTrip({ onCreated }: Props) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [cities, setCities] = useState<CityInput[]>([
    { name: "", country: "", arrivalDate: "", departureDate: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function updateCity(index: number, field: keyof CityInput, value: string) {
    const updated = [...cities];
    updated[index] = { ...updated[index], [field]: value };
    setCities(updated);
  }

  function addCity() {
    setCities([...cities, { name: "", country: "", arrivalDate: "", departureDate: "" }]);
  }

  function removeCity(index: number) {
    if (cities.length <= 1) return;
    setCities(cities.filter((_, i) => i !== index));
  }

  function buildRouteSegments() {
    const segments = [];
    for (let i = 0; i < cities.length - 1; i++) {
      if (cities[i].name && cities[i + 1].name) {
        segments.push({
          originCity: cities[i].name,
          destinationCity: cities[i + 1].name,
          transportMode: "other",
        });
      }
    }
    return segments;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !startDate || !endDate) return;

    setError("");
    setSubmitting(true);
    try {
      await api.post("/trips", {
        name: name.trim(),
        startDate,
        endDate,
        cities: cities.filter((c) => c.name.trim()),
        routeSegments: buildRouteSegments(),
      });
      onCreated();
    } catch (err: any) {
      setError(err.message || "Failed to create trip");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <div className="max-w-xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-light text-[#3a3128] mb-6">New Trip</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Trip basics */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">
              Trip Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Japan 2026"
              className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                         text-[#3a3128] placeholder-[#c8bba8]
                         focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                           text-[#3a3128] focus:outline-none focus:ring-2 focus:ring-[#a89880]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                           text-[#3a3128] focus:outline-none focus:ring-2 focus:ring-[#a89880]"
              />
            </div>
          </div>

          {/* Cities */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-3">
              Cities
            </label>
            <div className="space-y-3">
              {cities.map((city, i) => (
                <div key={i} className="p-3 bg-white rounded-lg border border-[#f0ece5] space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={city.name}
                      onChange={(e) => updateCity(i, "name", e.target.value)}
                      placeholder="City name"
                      className="flex-1 px-3 py-2 rounded border border-[#e0d8cc] bg-white
                                 text-[#3a3128] placeholder-[#c8bba8] text-sm
                                 focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                    />
                    <input
                      type="text"
                      value={city.country}
                      onChange={(e) => updateCity(i, "country", e.target.value)}
                      placeholder="Country"
                      className="w-28 px-3 py-2 rounded border border-[#e0d8cc] bg-white
                                 text-[#3a3128] placeholder-[#c8bba8] text-sm
                                 focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                    />
                    {cities.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCity(i)}
                        className="px-2 text-[#c8bba8] hover:text-red-500 transition-colors"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={city.arrivalDate}
                      onChange={(e) => updateCity(i, "arrivalDate", e.target.value)}
                      className="px-3 py-1.5 rounded border border-[#e0d8cc] bg-white
                                 text-[#3a3128] text-sm
                                 focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                    />
                    <input
                      type="date"
                      value={city.departureDate}
                      onChange={(e) => updateCity(i, "departureDate", e.target.value)}
                      className="px-3 py-1.5 rounded border border-[#e0d8cc] bg-white
                                 text-[#3a3128] text-sm
                                 focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addCity}
              className="mt-2 text-sm text-[#6b5d4a] hover:text-[#3a3128] transition-colors"
            >
              + Add city
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !name.trim() || !startDate || !endDate}
            className="w-full py-3 rounded-lg bg-[#514636] text-white text-sm font-medium
                       hover:bg-[#3a3128] disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {submitting ? "Creating..." : "Create Trip"}
          </button>
        </form>
      </div>
    </div>
  );
}
