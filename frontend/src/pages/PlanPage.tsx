import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface City {
  id: string;
  name: string;
  country: string | null;
}

interface Trip {
  id: string;
  name: string;
  cities: City[];
  days: any[];
  routeSegments: any[];
}

interface Experience {
  id: string;
  name: string;
  description: string | null;
  state: string;
  cityId: string;
  dayId: string | null;
  themes: string[];
  locationStatus: string;
  ratings: any[];
}

export default function PlanPage() {
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);

  // Capture form
  const [showCapture, setShowCapture] = useState(false);
  const [captureName, setCaptureName] = useState("");
  const [captureDesc, setCaptureDesc] = useState("");
  const [captureCity, setCaptureCity] = useState("");

  useEffect(() => {
    api.get<Trip>("/trips/active").then((t) => {
      if (!t) { navigate("/"); return; }
      setTrip(t);
      if (t.cities.length > 0) {
        setSelectedCityId(t.cities[0].id);
        setCaptureCity(t.cities[0].id);
      }
      setLoading(false);
    });
  }, [navigate]);

  useEffect(() => {
    if (!trip || !selectedCityId) return;
    api.get<Experience[]>(`/experiences/trip/${trip.id}?cityId=${selectedCityId}`)
      .then(setExperiences);
  }, [trip, selectedCityId]);

  async function handleCapture(e: React.FormEvent) {
    e.preventDefault();
    if (!captureName.trim() || !captureCity || !trip) return;

    await api.post("/experiences", {
      tripId: trip.id,
      cityId: captureCity,
      name: captureName.trim(),
      description: captureDesc.trim() || null,
    });

    setCaptureName("");
    setCaptureDesc("");
    setShowCapture(false);

    // Refresh list
    if (selectedCityId) {
      const exps = await api.get<Experience[]>(`/experiences/trip/${trip.id}?cityId=${selectedCityId}`);
      setExperiences(exps);
    }
  }

  if (loading || !trip) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#8a7a62]">
        Loading...
      </div>
    );
  }

  const selected = experiences.filter((e) => e.state === "selected");
  const possible = experiences.filter((e) => e.state === "possible");

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0ece5] bg-white">
        <button
          onClick={() => navigate("/")}
          className="text-sm text-[#8a7a62] hover:text-[#3a3128]"
        >
          &larr; {trip.name}
        </button>
        <span className="text-xs text-[#c8bba8]">
          Planning View
        </span>
      </div>

      {/* Main content area — will become spatial canvas in Phase 2 */}
      <div className="flex-1 flex">
        {/* Map placeholder */}
        <div className="flex-1 bg-[#e0d8cc]/30 flex items-center justify-center">
          <p className="text-[#c8bba8] text-sm">Map canvas — Phase 2</p>
        </div>

        {/* Side panel */}
        <div className="w-80 border-l border-[#f0ece5] bg-white overflow-y-auto">
          {/* City selector strip */}
          <div className="flex gap-1 p-3 border-b border-[#f0ece5] overflow-x-auto">
            {trip.cities.map((city) => (
              <button
                key={city.id}
                onClick={() => setSelectedCityId(city.id)}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
                  selectedCityId === city.id
                    ? "bg-[#514636] text-white"
                    : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                }`}
              >
                {city.name}
              </button>
            ))}
          </div>

          {/* Selected zone */}
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-[#a89880]">
                {selected.length} Selected
              </span>
              <span className="text-xs text-[#c8bba8]">
                {possible.length} Possible
              </span>
            </div>

            {/* Divider */}
            {selected.length > 0 && (
              <div className="space-y-1.5 mb-4">
                {selected.map((exp) => (
                  <div
                    key={exp.id}
                    className="px-3 py-2.5 bg-[#faf8f5] rounded-lg border border-[#e0d8cc]"
                  >
                    <div className="text-sm font-medium text-[#3a3128]">{exp.name}</div>
                    {exp.description && (
                      <div className="text-xs text-[#8a7a62] mt-1 line-clamp-2">{exp.description}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Candidate zone divider */}
            <div className="border-t border-dashed border-[#e0d8cc] my-3" />

            {/* Possible zone */}
            <div className="space-y-1.5">
              {possible.map((exp) => (
                <div
                  key={exp.id}
                  className="px-3 py-2.5 bg-white rounded-lg border border-[#f0ece5]
                             hover:border-[#e0d8cc] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-[#3a3128]">{exp.name}</div>
                    {exp.locationStatus === "unlocated" && (
                      <span className="text-[10px] text-[#c8bba8]" title="Location needed">
                        📍?
                      </span>
                    )}
                  </div>
                  {exp.description && (
                    <div className="text-xs text-[#a89880] mt-1 line-clamp-2">{exp.description}</div>
                  )}
                </div>
              ))}

              {possible.length === 0 && selected.length === 0 && (
                <div className="text-center py-8 text-sm text-[#c8bba8]">
                  No experiences yet. Tap + to add one.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Capture button */}
      <button
        onClick={() => setShowCapture(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#514636] text-white
                   text-2xl shadow-lg hover:bg-[#3a3128] transition-colors z-50
                   flex items-center justify-center"
      >
        +
      </button>

      {/* Capture panel (slides in from bottom) */}
      {showCapture && (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-[#e0d8cc]
                        rounded-t-2xl shadow-2xl p-4 max-h-[60vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-[#3a3128]">Add Experience</h3>
            <button
              onClick={() => setShowCapture(false)}
              className="text-[#c8bba8] hover:text-[#6b5d4a] text-lg"
            >
              &times;
            </button>
          </div>

          <form onSubmit={handleCapture} className="space-y-3">
            <input
              type="text"
              value={captureName}
              onChange={(e) => setCaptureName(e.target.value)}
              placeholder="Experience name"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                         text-[#3a3128] placeholder-[#c8bba8] text-sm
                         focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            />
            <textarea
              value={captureDesc}
              onChange={(e) => setCaptureDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                         text-[#3a3128] placeholder-[#c8bba8] text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            />
            <select
              value={captureCity}
              onChange={(e) => setCaptureCity(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                         text-[#3a3128] text-sm
                         focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            >
              {trip.cities.map((city) => (
                <option key={city.id} value={city.id}>{city.name}</option>
              ))}
            </select>

            <button
              type="submit"
              disabled={!captureName.trim()}
              className="w-full py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium
                         hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
            >
              Save
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
