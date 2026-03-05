import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Trip, City, Day, Experience, RouteSegment } from "../lib/types";
import MapCanvas from "../components/MapCanvas";
import ExperienceList from "../components/ExperienceList";
import ExperienceDetail from "../components/ExperienceDetail";
import CapturePanel from "../components/CapturePanel";
import DayView from "../components/DayView";

type Axis = "cities" | "days" | "routes";

export default function PlanPage() {
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);

  // Navigation state
  const [axis, setAxis] = useState<Axis>("cities");
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // UI state
  const [showCapture, setShowCapture] = useState(false);
  const [selectedExpId, setSelectedExpId] = useState<string | null>(null);
  const [showDayView, setShowDayView] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAddCity, setShowAddCity] = useState(false);
  const [showNearby, setShowNearby] = useState(false);

  // Add city form
  const [newCityName, setNewCityName] = useState("");
  const [newCityCountry, setNewCityCountry] = useState("");
  const [newCityArrival, setNewCityArrival] = useState("");
  const [newCityDeparture, setNewCityDeparture] = useState("");

  // Import more
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  // Mobile panel state
  const [mobilePanel, setMobilePanel] = useState<"list" | null>(null);

  // Load trip data
  const loadTrip = useCallback(async () => {
    const t = await api.get<Trip>("/trips/active");
    if (!t) { navigate("/"); return; }
    setTrip(t);
    if (t.cities.length > 0 && !selectedCityId) {
      setSelectedCityId(t.cities[0].id);
    }

    const d = await api.get<Day[]>(`/days/trip/${t.id}`);
    setDays(d);
    if (d.length > 0 && !selectedDayId) {
      setSelectedDayId(d[0].id);
    }

    if (!selectedSegmentId && t.routeSegments.length > 0) {
      setSelectedSegmentId(t.routeSegments[0].id);
    }

    setLoading(false);
  }, [navigate, selectedCityId, selectedDayId, selectedSegmentId]);

  useEffect(() => { loadTrip(); }, []);

  // Load experiences for current context
  const loadExperiences = useCallback(async () => {
    if (!trip) return;
    let url = `/experiences/trip/${trip.id}`;
    if (axis === "cities" && selectedCityId) {
      url += `?cityId=${selectedCityId}`;
    }
    const exps = await api.get<Experience[]>(url);
    setExperiences(exps);
  }, [trip, axis, selectedCityId]);

  useEffect(() => { loadExperiences(); }, [loadExperiences]);

  // Actions
  async function handlePromote(expId: string, dayId: string, routeSegmentId?: string, timeWindow?: string) {
    await api.post(`/experiences/${expId}/promote`, {
      dayId: dayId || null,
      routeSegmentId: routeSegmentId || null,
      timeWindow: timeWindow || null,
    });
    await loadExperiences();
  }

  async function handleDemote(expId: string) {
    await api.post(`/experiences/${expId}/demote`, {});
    await loadExperiences();
  }

  async function handleDeleteExp(expId: string) {
    await api.delete(`/experiences/${expId}`);
    setSelectedExpId(null);
    await loadExperiences();
  }

  async function handleCaptured() {
    setShowCapture(false);
    await loadExperiences();
  }

  async function handleAddCity() {
    if (!trip || !newCityName.trim()) return;
    await api.post("/cities", {
      tripId: trip.id,
      name: newCityName.trim(),
      country: newCityCountry.trim() || null,
      arrivalDate: newCityArrival || null,
      departureDate: newCityDeparture || null,
    });
    setShowAddCity(false);
    setNewCityName("");
    setNewCityCountry("");
    setNewCityArrival("");
    setNewCityDeparture("");
    await loadTrip();
  }

  async function handleImportMore() {
    if (!trip || !importText.trim()) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("tripId", trip.id);
      formData.append("cityId", selectedCityId || trip.cities[0]?.id || "");
      formData.append("text", importText.trim());
      formData.append("mode", "all");
      await api.upload("/capture", formData);
      setShowImport(false);
      setImportText("");
      await loadExperiences();
    } finally {
      setImporting(false);
    }
  }

  async function handleNearbyClick(place: { placeId: string; name: string; latitude: number; longitude: number; rating: number }) {
    if (!trip || !selectedCityId) return;
    // Quick-capture from nearby marker
    await api.post("/experiences", {
      tripId: trip.id,
      cityId: selectedCityId,
      name: place.name,
      description: `Nearby discovery (★${place.rating})`,
      userNotes: "Discovered via map nearby places",
    });
    await loadExperiences();
  }

  if (loading || !trip) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#8a7a62] bg-[#faf8f5]">
        Loading...
      </div>
    );
  }

  const selectedDay = days.find((d) => d.id === selectedDayId) || null;

  // Filter experiences for current context
  const contextExperiences = axis === "days" && selectedDay
    ? experiences.filter((e) => e.cityId === selectedDay.cityId)
    : experiences;

  const selected = contextExperiences.filter((e) => e.state === "selected");
  const possible = contextExperiences.filter((e) => e.state === "possible");

  // Map center based on context
  const mapCenter = (() => {
    if (axis === "cities" && selectedCityId) {
      const city = trip.cities.find((c) => c.id === selectedCityId);
      if (city?.latitude && city?.longitude) return { lat: city.latitude, lng: city.longitude };
    }
    if (axis === "days" && selectedDay?.city) {
      const city = selectedDay.city;
      if (city?.latitude && city?.longitude) return { lat: city.latitude, lng: city.longitude };
    }
    const confirmed = experiences.find((e) => e.locationStatus === "confirmed" && e.latitude);
    if (confirmed) return { lat: confirmed.latitude!, lng: confirmed.longitude! };
    return { lat: 35.6762, lng: 139.6503 };
  })();

  return (
    <div className="h-screen flex flex-col bg-[#faf8f5]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#f0ece5] bg-white shrink-0">
        <button
          onClick={() => navigate("/")}
          className="text-sm text-[#8a7a62] hover:text-[#3a3128]"
        >
          &larr; {trip.name}
        </button>
        <div className="flex items-center gap-2">
          {/* Axis switcher */}
          {(["cities", "days", "routes"] as Axis[]).map((a) => (
            <button
              key={a}
              onClick={() => setAxis(a)}
              className={`px-3 py-1 rounded text-xs capitalize transition-colors ${
                axis === a
                  ? "bg-[#514636] text-white"
                  : "text-[#8a7a62] hover:bg-[#f0ece5]"
              }`}
            >
              {a}
            </button>
          ))}
          <span className="text-[#e0d8cc] mx-1">|</span>
          <button
            onClick={() => setShowNearby(!showNearby)}
            className={`px-2 py-1 rounded text-xs transition-colors ${
              showNearby ? "bg-[#e8e2d8] text-[#514636]" : "text-[#c8bba8] hover:text-[#8a7a62]"
            }`}
            title="Show nearby high-rated places"
          >
            Nearby
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="px-2 py-1 rounded text-xs text-[#8a7a62] hover:bg-[#f0ece5] transition-colors"
            title="Import text or paste recommendations"
          >
            Import
          </button>
        </div>
      </div>

      {/* Import panel */}
      {showImport && (
        <div className="px-4 py-3 bg-white border-b border-[#f0ece5] shrink-0">
          <div className="max-w-2xl mx-auto">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste recommendations, article text, or chatbot output to extract experiences..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                         text-[#3a3128] placeholder-[#c8bba8] text-sm resize-y
                         focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleImportMore}
                disabled={importing || !importText.trim()}
                className="px-4 py-1.5 rounded bg-[#514636] text-white text-xs font-medium
                           hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
              >
                {importing ? "Extracting..." : "Extract & Add"}
              </button>
              <button
                onClick={() => { setShowImport(false); setImportText(""); }}
                className="px-3 py-1.5 text-xs text-[#8a7a62] hover:text-[#3a3128]"
              >
                Cancel
              </button>
              <span className="text-xs text-[#c8bba8] self-center ml-2">
                Adding to: {trip.cities.find((c) => c.id === selectedCityId)?.name || "first city"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          <MapCanvas
            center={mapCenter}
            experiences={contextExperiences}
            accommodations={selectedDay?.accommodations || []}
            onExperienceClick={(id) => setSelectedExpId(id)}
            onNearbyClick={handleNearbyClick}
            showNearby={showNearby}
          />

          {/* Now button — visible during trip dates */}
          {isWithinTripDates(trip) && (
            <button
              onClick={() => navigate("/now")}
              className="absolute bottom-20 left-4 px-4 py-2 bg-white rounded-lg shadow-lg
                         text-sm font-medium text-[#514636] hover:bg-[#faf8f5] transition-colors z-10"
            >
              Now
            </button>
          )}

          {/* Capture button */}
          <button
            onClick={() => setShowCapture(true)}
            className="absolute bottom-20 right-4 w-14 h-14 rounded-full bg-[#514636] text-white
                       text-2xl shadow-lg hover:bg-[#3a3128] transition-colors z-10
                       flex items-center justify-center"
          >
            +
          </button>

          {/* Mobile list toggle */}
          <button
            onClick={() => setMobilePanel(mobilePanel ? null : "list")}
            className="absolute bottom-20 right-20 md:hidden w-10 h-10 rounded-full bg-white shadow-lg
                       text-sm text-[#514636] flex items-center justify-center z-10"
          >
            ≡
          </button>

          {/* Selector strip */}
          <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-[#f0ece5] z-10">
            <div className="flex gap-1 p-2 overflow-x-auto">
              {axis === "cities" && (
                <>
                  {trip.cities.map((city) => (
                    <button
                      key={city.id}
                      onClick={() => setSelectedCityId(city.id)}
                      className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap shrink-0 transition-colors ${
                        selectedCityId === city.id
                          ? "bg-[#514636] text-white"
                          : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                      }`}
                    >
                      {city.name}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowAddCity(!showAddCity)}
                    className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap shrink-0
                               border border-dashed border-[#e0d8cc] text-[#a89880]
                               hover:border-[#8a7a62] hover:text-[#6b5d4a] transition-colors"
                  >
                    + City
                  </button>
                </>
              )}
              {axis === "days" && days.map((day) => (
                <button
                  key={day.id}
                  onClick={() => { setSelectedDayId(day.id); setShowDayView(true); }}
                  className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap shrink-0 transition-colors ${
                    selectedDayId === day.id
                      ? "bg-[#514636] text-white"
                      : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                  }`}
                >
                  {formatShortDate(day.date)} · {day.city.name}
                </button>
              ))}
              {axis === "routes" && trip.routeSegments.map((seg) => (
                <button
                  key={seg.id}
                  onClick={() => setSelectedSegmentId(seg.id)}
                  className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap shrink-0 transition-colors ${
                    selectedSegmentId === seg.id
                      ? "bg-[#514636] text-white"
                      : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                  }`}
                >
                  {seg.originCity} → {seg.destinationCity}
                </button>
              ))}
            </div>
          </div>

          {/* Add city form — inline above selector strip */}
          {showAddCity && (
            <div className="absolute bottom-14 left-0 right-0 z-20 px-2">
              <div className="bg-white rounded-lg shadow-lg border border-[#e0d8cc] p-3 space-y-2 max-w-md mx-auto">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCityName}
                    onChange={(e) => setNewCityName(e.target.value)}
                    placeholder="City name"
                    autoFocus
                    className="flex-1 px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                               placeholder-[#c8bba8] focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                  />
                  <input
                    type="text"
                    value={newCityCountry}
                    onChange={(e) => setNewCityCountry(e.target.value)}
                    placeholder="Country"
                    className="w-24 px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                               placeholder-[#c8bba8] focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newCityArrival}
                    onChange={(e) => setNewCityArrival(e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]"
                  />
                  <input
                    type="date"
                    value={newCityDeparture}
                    onChange={(e) => setNewCityDeparture(e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddCity}
                    disabled={!newCityName.trim()}
                    className="flex-1 py-1.5 rounded bg-[#514636] text-white text-xs font-medium
                               hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
                  >
                    Add City
                  </button>
                  <button
                    onClick={() => setShowAddCity(false)}
                    className="px-3 py-1.5 text-xs text-[#8a7a62] hover:text-[#3a3128]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Side panel — desktop */}
        <div className="w-96 border-l border-[#f0ece5] bg-white overflow-y-auto hidden md:block">
          {showDayView && selectedDay ? (
            <DayView
              day={selectedDay}
              experiences={contextExperiences}
              trip={trip}
              onClose={() => setShowDayView(false)}
              onPromote={handlePromote}
              onDemote={handleDemote}
              onExperienceClick={(id) => setSelectedExpId(id)}
              onRefresh={() => { loadExperiences(); loadTrip(); }}
            />
          ) : (
            <ExperienceList
              selected={selected}
              possible={possible}
              days={days}
              trip={trip}
              onPromote={handlePromote}
              onDemote={handleDemote}
              onExperienceClick={(id) => setSelectedExpId(id)}
            />
          )}
        </div>

        {/* Mobile bottom drawer */}
        {mobilePanel === "list" && (
          <div className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-[#e0d8cc]
                          rounded-t-2xl shadow-2xl max-h-[60vh] overflow-y-auto md:hidden">
            <div className="w-12 h-1 bg-[#e0d8cc] rounded-full mx-auto mt-2 mb-1" />
            {showDayView && selectedDay ? (
              <DayView
                day={selectedDay}
                experiences={contextExperiences}
                trip={trip}
                onClose={() => { setShowDayView(false); setMobilePanel(null); }}
                onPromote={handlePromote}
                onDemote={handleDemote}
                onExperienceClick={(id) => { setSelectedExpId(id); setMobilePanel(null); }}
                onRefresh={() => { loadExperiences(); loadTrip(); }}
              />
            ) : (
              <ExperienceList
                selected={selected}
                possible={possible}
                days={days}
                trip={trip}
                onPromote={handlePromote}
                onDemote={handleDemote}
                onExperienceClick={(id) => { setSelectedExpId(id); setMobilePanel(null); }}
              />
            )}
          </div>
        )}
      </div>

      {/* Experience detail panel */}
      {selectedExpId && (
        <ExperienceDetail
          experienceId={selectedExpId}
          trip={trip}
          days={days}
          onClose={() => setSelectedExpId(null)}
          onPromote={handlePromote}
          onDemote={handleDemote}
          onDelete={handleDeleteExp}
          onRefresh={loadExperiences}
        />
      )}

      {/* Capture panel */}
      {showCapture && (
        <CapturePanel
          trip={trip}
          defaultCityId={selectedCityId || trip.cities[0]?.id}
          onClose={() => setShowCapture(false)}
          onCaptured={handleCaptured}
        />
      )}
    </div>
  );
}

function formatShortDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isWithinTripDates(trip: Trip): boolean {
  const now = new Date();
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  return now >= start && now <= end;
}
