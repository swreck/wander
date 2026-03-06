import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Trip, City, Day, Experience } from "../lib/types";
import MapCanvas from "../components/MapCanvas";
import ExperienceList from "../components/ExperienceList";
import ExperienceDetail from "../components/ExperienceDetail";
import CapturePanel from "../components/CapturePanel";
import DayView from "../components/DayView";
import FirstTimeGuide from "../components/FirstTimeGuide";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { getNudgesForPlace } from "../lib/travelerProfiles";

type Axis = "cities" | "days";

export default function PlanPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);

  // Navigation state
  const [axis, setAxis] = useState<Axis>("cities");
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);

  // UI state
  const [showCapture, setShowCapture] = useState(false);
  const [selectedExpId, setSelectedExpId] = useState<string | null>(null);
  const [showDayView, setShowDayView] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAddCity, setShowAddCity] = useState(false);

  // Mobile layout state
  const [mobileView, setMobileView] = useState<"map" | "list">("map");

  // Add city form
  const [newCityName, setNewCityName] = useState("");
  const [newCityCountry, setNewCityCountry] = useState("");
  const [newCityArrival, setNewCityArrival] = useState("");
  const [newCityDeparture, setNewCityDeparture] = useState("");

  // Import more
  const [importText, setImportText] = useState("");
  const [importStartDate, setImportStartDate] = useState("");
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any>(null);

  // Theme filter state — persists across axis switches
  const [activeThemes, setActiveThemes] = useState<string[]>([]);

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

    setLoading(false);
  }, [navigate, selectedCityId, selectedDayId]);

  useEffect(() => { loadTrip(); }, []);

  // Refresh when chat makes changes
  useEffect(() => {
    const handler = () => { loadTrip(); };
    window.addEventListener("wander:data-changed", handler);
    return () => window.removeEventListener("wander:data-changed", handler);
  }, [loadTrip]);

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

  // Actions — with toast feedback
  async function handlePromote(expId: string, dayId: string, routeSegmentId?: string, timeWindow?: string) {
    try {
      await api.post(`/experiences/${expId}/promote`, {
        dayId: dayId || null,
        routeSegmentId: routeSegmentId || null,
        timeWindow: timeWindow || null,
      });
      showToast("Added to itinerary");
      await loadExperiences();
    } catch {
      showToast("Couldn't add to itinerary", "error");
    }
  }

  async function handleDemote(expId: string) {
    try {
      await api.post(`/experiences/${expId}/demote`, {});
      showToast("Moved to candidates");
      await loadExperiences();
    } catch {
      showToast("Couldn't move to candidates", "error");
    }
  }

  async function handleDeleteExp(expId: string) {
    try {
      await api.delete(`/experiences/${expId}`);
      setSelectedExpId(null);
      showToast("Experience deleted");
      await loadExperiences();
    } catch {
      showToast("Couldn't delete", "error");
    }
  }

  async function handleCaptured() {
    setShowCapture(false);
    showToast("Experience captured");
    await loadExperiences();
  }

  async function handleAddCity() {
    if (!trip || !newCityName.trim()) return;
    try {
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
      showToast("City added");
      await loadTrip();
    } catch {
      showToast("Couldn't add city", "error");
    }
  }

  async function handleImportExtract() {
    if (!trip || !importText.trim()) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("text", importText.trim());
      if (importStartDate) formData.append("startDate", importStartDate);
      const result = await api.upload<any>("/import/extract", formData);
      setImportPreview(result);
    } catch {
      // Fall back to simple capture if extraction fails
      const formData = new FormData();
      formData.append("tripId", trip.id);
      formData.append("cityId", selectedCityId || trip.cities[0]?.id || "");
      formData.append("text", importText.trim());
      formData.append("mode", "all");
      await api.upload("/capture", formData);
      setShowImport(false);
      setImportText("");
      setImportPreview(null);
      showToast("Imported successfully");
      await loadExperiences();
    } finally {
      setImporting(false);
    }
  }

  async function handleImportMerge() {
    if (!trip || !importPreview) return;
    setImporting(true);
    try {
      await api.post("/import/merge", { tripId: trip.id, ...importPreview });
      setShowImport(false);
      setImportText("");
      setImportStartDate("");
      setImportPreview(null);
      showToast("Import added to trip");
      await loadTrip();
      await loadExperiences();
    } catch {
      showToast("Import failed", "error");
    } finally {
      setImporting(false);
    }
  }

  // Personalized nudge state — shown when a nearby marker is tapped
  const [nudgeMessage, setNudgeMessage] = useState<{ place: any; nudge: string } | null>(null);

  async function handleNearbyClick(place: { placeId: string; name: string; latitude: number; longitude: number; rating: number; types?: string[] }) {
    if (!trip || !selectedCityId) return;

    // Check for personalized nudge before adding
    const nudge = user ? getNudgesForPlace(user.displayName, place.name, place.types || []) : null;
    if (nudge) {
      setNudgeMessage({ place, nudge });
      return;
    }

    // No nudge — add directly
    await addNearbyPlace(place);
  }

  async function addNearbyPlace(place: { placeId: string; name: string; latitude: number; longitude: number; rating: number }) {
    if (!trip || !selectedCityId) return;
    try {
      await api.post("/experiences", {
        tripId: trip.id,
        cityId: selectedCityId,
        name: place.name,
        description: `Nearby discovery (${place.rating} stars)`,
        userNotes: "Discovered via map",
      });
      showToast(`${place.name} added`);
      await loadExperiences();
    } catch {
      showToast("Couldn't add place", "error");
    }
  }

  if (loading || !trip) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#8a7a62] bg-[#faf8f5]">
        Loading...
      </div>
    );
  }

  const selectedDay = days.find((d) => d.id === selectedDayId) || null;

  const THEME_OPTIONS = ["ceramics", "architecture", "food", "temples", "nature", "other"] as const;

  function toggleTheme(theme: string) {
    setActiveThemes((prev) =>
      prev.includes(theme)
        ? prev.filter((t) => t !== theme)
        : [...prev, theme]
    );
  }

  // Filter experiences for current context, then by theme
  // Theme filters persist across axis switches
  const axisFiltered = axis === "days" && selectedDay
    ? experiences.filter((e) => e.cityId === selectedDay.cityId)
    : experiences;

  const contextExperiences = activeThemes.length > 0
    ? axisFiltered.filter((e) =>
        e.themes.some((t) => activeThemes.includes(t))
      )
    : axisFiltered;

  const selected = contextExperiences.filter((e) => e.state === "selected");
  const possible = contextExperiences.filter((e) => e.state === "possible");

  // Friction indicators for day chips
  const dayFrictionMap = new Map<string, boolean>();
  for (const day of days) {
    const daySelected = experiences.filter(e => e.state === "selected" && e.dayId === day.id);
    if (daySelected.length >= 5) {
      dayFrictionMap.set(day.id, true);
    }
  }

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
      {/* First-time guide */}
      <FirstTimeGuide
        id="plan"
        lines={[
          "Switch between Cities and Days to organize your trip",
          "Drag experiences up to add them to your itinerary",
          "Tap a day card to see details, route suggestions, and alerts",
          "Filter by theme to focus on what interests you",
          "Ghost markers on the map show highly-rated places nearby",
        ]}
      />

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
          {(["cities", "days"] as Axis[]).map((a) => (
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
            {!importPreview ? (
              <>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste recommendations, itinerary text, tour details, or chatbot output..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                             text-[#3a3128] placeholder-[#c8bba8] text-sm resize-y
                             focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                />
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <input
                    type="date"
                    value={importStartDate}
                    onChange={(e) => setImportStartDate(e.target.value)}
                    placeholder="Start date hint"
                    className="px-2 py-1.5 rounded border border-[#e0d8cc] text-xs text-[#3a3128]
                               focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                  />
                  <span className="text-[10px] text-[#c8bba8] hidden sm:inline">Start date (if text uses "Day 1, Day 2")</span>
                  <div className="flex-1" />
                  <button
                    onClick={handleImportExtract}
                    disabled={importing || !importText.trim()}
                    className="px-4 py-1.5 rounded bg-[#514636] text-white text-xs font-medium
                               hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
                  >
                    {importing ? "Analyzing..." : "Extract & Review"}
                  </button>
                  <button
                    onClick={() => { setShowImport(false); setImportText(""); setImportStartDate(""); setImportPreview(null); }}
                    className="px-3 py-1.5 text-xs text-[#8a7a62] hover:text-[#3a3128]"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-[#3a3128]">Review before adding to trip</h3>
                  <button
                    onClick={() => setImportPreview(null)}
                    className="text-xs text-[#8a7a62] hover:text-[#3a3128]"
                  >
                    &larr; Edit text
                  </button>
                </div>
                {/* Stacked on mobile, grid on desktop */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs max-h-48 overflow-y-auto">
                  {importPreview.cities?.length > 0 && (
                    <div>
                      <span className="font-medium text-[#a89880] uppercase tracking-wider">
                        {importPreview.cities.filter((c: any) => !trip.cities.some((tc) => tc.name.toLowerCase() === c.name.toLowerCase())).length} new cities
                      </span>
                      <div className="mt-1 space-y-0.5">
                        {importPreview.cities.map((c: any, i: number) => {
                          const exists = trip.cities.some((tc) => tc.name.toLowerCase() === c.name.toLowerCase());
                          return (
                            <div key={i} className={`px-2 py-1 rounded ${exists ? "text-[#c8bba8]" : "bg-[#f0ece5] text-[#3a3128]"}`}>
                              {c.name} {exists && <span className="text-[10px]">(exists)</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {importPreview.experiences?.length > 0 && (
                    <div>
                      <span className="font-medium text-[#a89880] uppercase tracking-wider">
                        {importPreview.experiences.length} experiences
                      </span>
                      <div className="mt-1 space-y-0.5">
                        {importPreview.experiences.map((e: any, i: number) => (
                          <div key={i} className="px-2 py-1 rounded bg-[#f0ece5] text-[#3a3128]">
                            {e.name} <span className="text-[#a89880]">· {e.cityName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    {importPreview.accommodations?.length > 0 && (
                      <div className="mb-2">
                        <span className="font-medium text-[#a89880] uppercase tracking-wider">
                          {importPreview.accommodations.length} hotels
                        </span>
                        <div className="mt-1 space-y-0.5">
                          {importPreview.accommodations.map((a: any, i: number) => (
                            <div key={i} className="px-2 py-1 rounded bg-[#f0ece5] text-[#3a3128]">
                              {a.name} <span className="text-[#a89880]">· {a.cityName}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {importPreview.routeSegments?.length > 0 && (
                      <div>
                        <span className="font-medium text-[#a89880] uppercase tracking-wider">
                          {importPreview.routeSegments.length} routes
                        </span>
                        <div className="mt-1 space-y-0.5">
                          {importPreview.routeSegments.map((r: any, i: number) => (
                            <div key={i} className="px-2 py-1 rounded bg-[#f0ece5] text-[#3a3128]">
                              {r.originCity} → {r.destinationCity}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleImportMerge}
                    disabled={importing}
                    className="px-4 py-1.5 rounded bg-[#514636] text-white text-xs font-medium
                               hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
                  >
                    {importing ? "Adding..." : "Add to Trip"}
                  </button>
                  <button
                    onClick={() => { setShowImport(false); setImportText(""); setImportStartDate(""); setImportPreview(null); }}
                    className="px-3 py-1.5 text-xs text-[#8a7a62] hover:text-[#3a3128]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main content — desktop: side-by-side, mobile: toggle map/list */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map — always visible on desktop, toggleable on mobile */}
        <div className={`flex-1 relative ${mobileView !== "map" ? "hidden md:block" : ""}`}>
          <MapCanvas
            center={mapCenter}
            experiences={contextExperiences}
            accommodations={selectedDay?.accommodations || []}
            onExperienceClick={(id) => setSelectedExpId(id)}
            onNearbyClick={handleNearbyClick}
            showNearby={true}
            themeFilter={activeThemes}
          />

          {/* Contextual day card — floating over map when Days axis is active */}
          {axis === "days" && selectedDay && (
            <div className="absolute top-2 left-2 right-2 z-10 pointer-events-none flex justify-center">
              <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-[#e0d8cc] px-3 py-2 pointer-events-auto max-w-sm">
                <div className="text-xs font-medium text-[#3a3128]">
                  {new Date(selectedDay.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  {" — "}
                  {selectedDay.city.name}
                  {selectedDay.city.tagline && (
                    <span className="text-[#a89880] font-normal ml-1">· {selectedDay.city.tagline}</span>
                  )}
                </div>
                <div className="text-[10px] text-[#8a7a62] mt-0.5">
                  {selected.filter(e => e.dayId === selectedDay.id).length} planned
                  {selectedDay.explorationZone && ` · ${selectedDay.explorationZone}`}
                  {(() => {
                    const dayRes = selectedDay.reservations?.find(r => r);
                    if (dayRes) {
                      return ` · ${dayRes.name} ${new Date(dayRes.datetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
                    }
                    return "";
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Map legend — bottom left, subtle */}
          <div className="absolute bottom-[7.5rem] left-2 z-10 hidden md:block">
            <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-[#e0d8cc] px-2.5 py-2 text-[10px] text-[#8a7a62] space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#514636]" />
                <span>Planned</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#c8bba8]" />
                <span>Possible</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#e8e2d8] border border-[#d4cdc0]" />
                <span>Nearby</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6b5d4a]" />
                <span>Hotel</span>
              </div>
            </div>
          </div>

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

          {/* Mobile view toggle — map/list */}
          <button
            onClick={() => setMobileView("list")}
            className="absolute bottom-20 right-20 md:hidden w-10 h-10 rounded-full bg-white shadow-lg
                       text-sm text-[#514636] flex items-center justify-center z-10"
            aria-label="Show list"
          >
            <svg width="16" height="14" viewBox="0 0 16 14" fill="currentColor">
              <rect y="0" width="16" height="2" rx="1" />
              <rect y="6" width="16" height="2" rx="1" />
              <rect y="12" width="16" height="2" rx="1" />
            </svg>
          </button>

          {/* Theme filter chips + Selector strip */}
          <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-[#f0ece5] z-10">
            {/* Theme filter row */}
            <div className="flex gap-1.5 px-2 pt-2 pb-1 overflow-x-auto">
              {THEME_OPTIONS.map((theme) => (
                <button
                  key={theme}
                  onClick={() => toggleTheme(theme)}
                  className={`px-2.5 py-1 rounded-full text-[11px] capitalize whitespace-nowrap shrink-0 transition-colors border ${
                    activeThemes.includes(theme)
                      ? "bg-[#514636] text-white border-[#514636]"
                      : "bg-transparent text-[#8a7a62] border-[#e0d8cc] hover:border-[#a89880]"
                  }`}
                >
                  {theme}
                </button>
              ))}
              {activeThemes.length > 0 && (
                <button
                  onClick={() => setActiveThemes([])}
                  className="px-2 py-1 text-[11px] text-[#c8bba8] hover:text-[#8a7a62] whitespace-nowrap shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex gap-1 px-2 pb-2 overflow-x-auto">
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
                      {city.tagline && selectedCityId === city.id && (
                        <span className="ml-1 opacity-70 font-normal">· {city.tagline}</span>
                      )}
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
              {axis === "days" && days.map((day) => {
                const dayExps = experiences.filter(e => e.state === "selected" && e.dayId === day.id);
                const locatedExps = dayExps.filter(e => e.latitude != null && e.longitude != null);
                const dayAccom = day.accommodations?.[0];
                const mapUrl = buildStaticMapUrl(locatedExps, dayAccom);
                const isActive = selectedDayId === day.id;
                const hasFriction = dayFrictionMap.has(day.id);
                return (
                  <button
                    key={day.id}
                    onClick={() => { setSelectedDayId(day.id); setShowDayView(true); }}
                    className={`shrink-0 rounded-lg overflow-hidden transition-all relative ${
                      isActive
                        ? "ring-2 ring-[#514636] w-[120px]"
                        : "w-[100px] opacity-80 hover:opacity-100"
                    }`}
                  >
                    {/* Friction indicator dot */}
                    {hasFriction && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 z-10" />
                    )}
                    {mapUrl ? (
                      <img
                        src={mapUrl}
                        alt={`${day.city.name} map`}
                        className="w-full h-14 object-cover bg-[#f0ece5]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-14 bg-[#f0ece5] flex items-center justify-center">
                        <span className="text-[#c8bba8] text-lg">{day.city.name.charAt(0)}</span>
                      </div>
                    )}
                    <div className={`px-1.5 py-1 text-left ${isActive ? "bg-[#514636] text-white" : "bg-[#f0ece5] text-[#6b5d4a]"}`}>
                      <div className="text-[10px] font-medium truncate">
                        {formatShortDate(day.date)}
                      </div>
                      <div className={`text-[9px] truncate ${isActive ? "opacity-70" : "text-[#a89880]"}`}>
                        {day.city.name}
                        {dayExps.length > 0 ? ` · ${dayExps.length}` : ""}
                      </div>
                    </div>
                  </button>
                );
              })}
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

        {/* Mobile list view — full screen when active */}
        {mobileView === "list" && (
          <div className="fixed inset-0 z-40 bg-[#faf8f5] md:hidden flex flex-col">
            {/* Mobile list header */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#f0ece5] shrink-0">
              <button
                onClick={() => setMobileView("map")}
                className="text-sm text-[#8a7a62] hover:text-[#3a3128]"
              >
                &larr; Map
              </button>
              <span className="text-xs font-medium text-[#a89880]">
                {selected.length} Selected · {possible.length} Possible
              </span>
              {axis === "days" && selectedDay && (
                <button
                  onClick={() => { setShowDayView(true); }}
                  className="text-xs text-[#514636] font-medium"
                >
                  Day view
                </button>
              )}
            </div>
            {/* Mobile list content */}
            <div className="flex-1 overflow-y-auto">
              {showDayView && selectedDay ? (
                <DayView
                  day={selectedDay}
                  experiences={contextExperiences}
                  trip={trip}
                  onClose={() => { setShowDayView(false); }}
                  onPromote={handlePromote}
                  onDemote={handleDemote}
                  onExperienceClick={(id) => { setSelectedExpId(id); setMobileView("map"); }}
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
                  onExperienceClick={(id) => { setSelectedExpId(id); setMobileView("map"); }}
                />
              )}
            </div>
            {/* Mobile bottom actions */}
            <div className="shrink-0 flex gap-2 px-4 py-3 bg-white border-t border-[#f0ece5]">
              <button
                onClick={() => { setShowCapture(true); setMobileView("map"); }}
                className="flex-1 py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium"
              >
                + Capture
              </button>
              {axis === "days" && !showDayView && selectedDay && (
                <button
                  onClick={() => setShowDayView(true)}
                  className="px-4 py-2.5 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a]"
                >
                  Day details
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Personalized nudge card */}
      {nudgeMessage && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/20">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl max-w-sm w-full mx-4 mb-0 sm:mb-0 p-5 border border-[#e0d8cc]">
            <p className="text-sm text-[#3a3128] leading-relaxed mb-1">
              {nudgeMessage.nudge}
            </p>
            <p className="text-xs text-[#a89880] mb-4">
              {nudgeMessage.place.name} · {nudgeMessage.place.rating} stars
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  addNearbyPlace(nudgeMessage.place);
                  setNudgeMessage(null);
                }}
                className="flex-1 py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium
                           hover:bg-[#3a3128] transition-colors"
              >
                Add to trip
              </button>
              <button
                onClick={() => setNudgeMessage(null)}
                className="flex-1 py-2.5 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a]
                           hover:bg-[#f0ece5] transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Experience detail panel — responsive */}
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

function buildStaticMapUrl(
  experiences: { latitude: number | null; longitude: number | null }[],
  accommodation?: { latitude: number | null; longitude: number | null } | null,
): string | null {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const points: { lat: number; lng: number }[] = [];
  for (const e of experiences) {
    if (e.latitude != null && e.longitude != null) {
      points.push({ lat: e.latitude, lng: e.longitude });
    }
  }
  if (accommodation?.latitude != null && accommodation?.longitude != null) {
    points.push({ lat: accommodation.latitude, lng: accommodation.longitude });
  }
  if (points.length === 0) return null;

  const centerLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const centerLng = points.reduce((s, p) => s + p.lng, 0) / points.length;

  let zoom = 15;
  if (points.length > 1) {
    const latSpan = Math.max(...points.map(p => p.lat)) - Math.min(...points.map(p => p.lat));
    const lngSpan = Math.max(...points.map(p => p.lng)) - Math.min(...points.map(p => p.lng));
    const span = Math.max(latSpan, lngSpan);
    if (span > 0.1) zoom = 12;
    else if (span > 0.05) zoom = 13;
    else if (span > 0.02) zoom = 14;
    else zoom = 15;
  }

  const markers = points.slice(0, 5).map(p => `${p.lat},${p.lng}`).join("|");

  return `https://maps.googleapis.com/maps/api/staticmap?center=${centerLat},${centerLng}&zoom=${zoom}&size=240x120&scale=2&maptype=roadmap&style=feature:all|saturation:-50&markers=size:tiny|color:0x514636|${markers}&key=${apiKey}`;
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
