import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Trip, Day, Experience, ExperienceInterest } from "../lib/types";
import MapCanvas, { getCityPastel } from "../components/MapCanvas";
import ExperienceList from "../components/ExperienceList";
import ExperienceDetail from "../components/ExperienceDetail";
import CapturePanel from "../components/CapturePanel";
import DayView from "../components/DayView";
import CitySplash from "../components/CitySplash";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { getNudgesForPlace } from "../lib/travelerProfiles";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts";

export default function PlanPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [interests, setInterests] = useState<Map<string, ExperienceInterest>>(new Map());
  const [loading, setLoading] = useState(true);

  // Navigation — days-based, plus dateless candidate cities
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [selectedCandidateCityId, setSelectedCandidateCityId] = useState<string | null>(null);
  const initialCityId = searchParams.get("city");

  // UI state
  const [showCapture, setShowCapture] = useState(false);
  const [selectedExpId, setSelectedExpId] = useState<string | null>(null);
  const [showDayView, setShowDayView] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [candidatesExpanded, setCandidatesExpanded] = useState(() => {
    try { return localStorage.getItem("wander:candidates-expanded") === "true"; } catch { return false; }
  });
  const [highlightedExpId, setHighlightedExpId] = useState<string | null>(null);
  const [splashCity, setSplashCity] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);
  const [themeFilter, setThemeFilter] = useState<string | null>(null);

  // Import state
  const [importText, setImportText] = useState("");
  const [importStartDate, setImportStartDate] = useState("");
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [recPreview, setRecPreview] = useState<any>(null);
  const [senderLabel, setSenderLabel] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Nudge state
  const [nudgeMessage, setNudgeMessage] = useState<{ place: any; nudge: string } | null>(null);

  // First-visit orientation
  const [showOrientation, setShowOrientation] = useState(
    () => !localStorage.getItem("wander:plan-oriented"),
  );

  // Derived state
  const selectedDay = selectedCandidateCityId ? null : (days.find((d) => d.id === selectedDayId) || null);
  const activeCityId = selectedCandidateCityId || selectedDay?.cityId || trip?.cities[0]?.id || "";

  // Dateless candidate cities (created by recommendation import, no days assigned)
  const datedCityIds = useMemo(() => new Set(days.map((d) => d.cityId)), [days]);
  const candidateCities = useMemo(
    () => trip?.cities.filter((c) => !datedCityIds.has(c.id)) || [],
    [trip, datedCityIds],
  );

  // Keyboard shortcuts
  const shortcutActions = useMemo(() => ({
    toggleCapture: () => setShowCapture((v) => !v),
    toggleImport: () => setShowImport((v) => !v),
    toggleMobileView: () => setMobileView((v) => v === "map" ? "list" : "map"),
    closePanel: () => {
      if (selectedExpId) { setSelectedExpId(null); return; }
      if (showDayView) { setShowDayView(false); return; }
      if (showCapture) { setShowCapture(false); return; }
      if (showImport) { setShowImport(false); setImportPreview(null); setRecPreview(null); return; }
    },
  }), [selectedExpId, showDayView, showCapture, showImport]);
  useKeyboardShortcuts(shortcutActions);

  // Expose current day/city to chat assistant via global
  useEffect(() => {
    (window as any).__wanderContext = {
      dayId: selectedDay?.id,
      dayDate: selectedDay?.date,
      cityId: selectedDay?.cityId,
      cityName: selectedDay?.city?.name,
    };
    return () => { delete (window as any).__wanderContext; };
  }, [selectedDay]);

  // Trigger city splash when city changes
  const prevCityRef = useRef<string>("");
  useEffect(() => {
    if (!activeCityId || activeCityId === prevCityRef.current) return;
    prevCityRef.current = activeCityId;
    const city = trip?.cities.find((c) => c.id === activeCityId);
    if (city?.name) setSplashCity(city.name);
  }, [activeCityId, trip]);

  // ── Data loading ──────────────────────────────────────────────

  const loadTrip = useCallback(async () => {
    const t = await api.get<Trip>("/trips/active");
    if (!t) { navigate("/"); return; }
    setTrip(t);

    const d = await api.get<Day[]>(`/days/trip/${t.id}`);
    setDays(d);
    if (d.length > 0 && !selectedDayId) {
      // If navigated with ?city=X, jump to that city's first day
      const cityDay = initialCityId ? d.find((day) => day.cityId === initialCityId) : null;
      setSelectedDayId(cityDay?.id || d[0].id);
      // Clear the param so future loads don't keep jumping
      if (initialCityId) setSearchParams({}, { replace: true });
    }
    setLoading(false);
  }, [navigate, selectedDayId]);

  useEffect(() => { loadTrip(); }, []);

  useEffect(() => {
    const handler = () => { loadTrip(); };
    window.addEventListener("wander:data-changed", handler);
    return () => window.removeEventListener("wander:data-changed", handler);
  }, [loadTrip]);

  const loadExperiences = useCallback(async () => {
    if (!trip) return;
    const exps = await api.get<Experience[]>(`/experiences/trip/${trip.id}`);
    setExperiences(exps);
  }, [trip]);

  useEffect(() => { loadExperiences(); }, [loadExperiences]);

  const loadInterests = useCallback(async () => {
    if (!trip) return;
    try {
      const list = await api.get<ExperienceInterest[]>(`/interests/trip/${trip.id}`);
      const map = new Map<string, ExperienceInterest>();
      for (const i of list) map.set(i.experienceId, i);
      setInterests(map);
    } catch { /* interests are optional */ }
  }, [trip]);

  useEffect(() => { loadInterests(); }, [loadInterests]);

  // ── Actions ───────────────────────────────────────────────────

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
    // Re-fetch after a delay to pick up async geocoding results
    setTimeout(async () => {
      await loadExperiences();
      setRecenterKey((k) => k + 1);
    }, 2500);
  }

  const [confirmHideCity, setConfirmHideCity] = useState<{ id: string; name: string } | null>(null);

  async function handleHideCity(cityId: string) {
    const city = candidateCities.find((c) => c.id === cityId);
    if (!city) return;
    setConfirmHideCity({ id: cityId, name: city.name });
  }

  async function executeHideCity(cityId: string, cityName: string) {
    setConfirmHideCity(null);
    try {
      await api.patch(`/cities/${cityId}`, { hidden: true });
      if (selectedCandidateCityId === cityId) {
        setSelectedCandidateCityId(null);
        if (days.length > 0) setSelectedDayId(days[0].id);
      }
      await loadTrip();
      await loadExperiences();
      showToast(`${cityName} dismissed`, "success", {
        action: { label: "Undo", onClick: () => undoHideCity(cityId, cityName) },
      });
    } catch {
      showToast("Couldn't dismiss city", "error");
    }
  }

  async function undoHideCity(cityId: string, cityName: string) {
    try {
      await api.patch(`/cities/${cityId}`, { hidden: false });
      showToast(`${cityName} restored`);
      await loadTrip();
      await loadExperiences();
    } catch {
      showToast("Couldn't restore city", "error");
    }
  }

  const [confirmHideAll, setConfirmHideAll] = useState(false);

  async function handleHideAllCandidates() {
    setConfirmHideAll(true);
  }

  async function executeHideAllCandidates() {
    if (!trip) return;
    setConfirmHideAll(false);
    const cities = [...candidateCities];
    const ids = cities.map((c) => c.id);
    try {
      await Promise.all(ids.map((id) => api.patch(`/cities/${id}`, { hidden: true })));
      setSelectedCandidateCityId(null);
      if (days.length > 0) setSelectedDayId(days[0].id);
      showToast(`Dismissed ${cities.length} cities`, "success", {
        action: {
          label: "Undo",
          onClick: async () => {
            await Promise.all(ids.map((id) => api.patch(`/cities/${id}`, { hidden: false })));
            showToast("Cities restored");
            loadTrip();
            loadExperiences();
          },
        },
      });
      await loadTrip();
      await loadExperiences();
    } catch {
      showToast("Couldn't dismiss cities", "error");
    }
  }

  // ── Import ────────────────────────────────────────────────────

  function resetImport() {
    setShowImport(false);
    setImportText("");
    setImportStartDate("");
    setImportPreview(null);
    setRecPreview(null);
    setSenderLabel("");
    setImportFile(null);
  }

  async function handleSmartExtract() {
    if (!trip || (!importText.trim() && !importFile)) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("tripId", trip.id);
      formData.append("cityId", selectedCityId);
      if (importText.trim()) formData.append("text", importText.trim());
      if (importFile) formData.append("image", importFile);

      const result = await api.upload<any>("/import/smart-extract", formData);

      if (result.type === "simple") {
        // Auto-saved — close panel and refresh
        resetImport();
        showToast(`Added ${result.saved} experience${result.saved !== 1 ? "s" : ""}`);
        await loadExperiences();
        return;
      }

      if (result.type === "recommendations") {
        setRecPreview(result);
        return;
      }

      if (result.type === "itinerary") {
        setImportPreview(result);
        return;
      }
    } catch {
      showToast("Couldn't process input. Try a shorter or clearer format.", "error");
    } finally {
      setImporting(false);
    }
  }

  async function handleImportMerge() {
    if (!trip || !importPreview) return;
    setImporting(true);
    try {
      await api.post("/import/merge", { tripId: trip.id, ...importPreview });
      resetImport();
      showToast("Import added to trip");
      await loadTrip();
      await loadExperiences();
    } catch {
      showToast("Import failed", "error");
    } finally {
      setImporting(false);
    }
  }

  async function handleReplaceBackbone() {
    if (!trip || !importPreview) return;
    setImporting(true);
    try {
      const result = await api.post<{ archivedTripName: string; repositioned: { before: number; after: number } }>(
        "/import/replace-backbone",
        { tripId: trip.id, ...importPreview }
      );
      resetImport();
      const { before, after } = result.repositioned;
      const moved = before + after;
      showToast(
        `Backbone replaced. Old plan archived. ${moved > 0 ? `${moved} surrounding day${moved !== 1 ? "s" : ""} repositioned.` : ""}`
      );
      await loadTrip();
      await loadExperiences();
    } catch {
      showToast("Replace failed", "error");
    } finally {
      setImporting(false);
    }
  }

  const hasBackbone = experiences.some(
    (e) => e.sourceText === "Imported from itinerary document" || e.sourceText === "Merged from imported text"
  );

  async function handleRecCommit() {
    if (!trip || !recPreview) return;
    setImporting(true);
    try {
      const result = await api.post<any>("/import/commit-recommendations", {
        tripId: trip.id,
        recommendations: recPreview.recommendations,
        senderNotes: recPreview.senderNotes,
        senderLabel: senderLabel || "Imported recommendations",
      });
      resetImport();
      showToast(
        `Imported ${result.imported} recommendations: ${result.category1} to existing cities, ${result.category2} to new cities${result.category3 > 0 ? `, ${result.category3} to Ideas` : ""}`
      );
      await loadTrip();
      await loadExperiences();
    } catch {
      showToast("Import failed", "error");
    } finally {
      setImporting(false);
    }
  }

  // ── Nearby + Nudges ───────────────────────────────────────────

  async function handleNearbyClick(place: { placeId: string; name: string; latitude: number; longitude: number; rating: number; types?: string[] }) {
    if (!trip || !activeCityId) return;

    // If an experience with this name already exists, open its detail instead of duplicating
    const existing = experiences.find(
      (e) => e.name.toLowerCase() === place.name.toLowerCase() || e.placeIdGoogle === place.placeId
    );
    if (existing) {
      setSelectedExpId(existing.id);
      return;
    }

    const nudge = user ? getNudgesForPlace(user.displayName, place.name, place.types || []) : null;
    if (nudge) {
      setNudgeMessage({ place, nudge });
      return;
    }
    await addNearbyPlace(place);
  }

  async function addNearbyPlace(place: { placeId: string; name: string; latitude: number; longitude: number; rating: number }) {
    if (!trip || !activeCityId) return;
    try {
      await api.post("/experiences", {
        tripId: trip.id,
        cityId: activeCityId,
        name: place.name,
        description: `Nearby discovery (${place.rating} stars)`,
        userNotes: "Discovered via map",
        latitude: place.latitude,
        longitude: place.longitude,
        locationStatus: "confirmed",
        placeIdGoogle: place.placeId,
      });
      showToast(`${place.name} added`);
      await loadExperiences();
    } catch {
      showToast("Couldn't add place", "error");
    }
  }

  // ── Day selection ─────────────────────────────────────────────

  function handleDayClick(dayId: string) {
    setRecenterKey((k) => k + 1);
    setSelectedCandidateCityId(null);
    if (selectedDayId === dayId) {
      setShowDayView(true);
    } else {
      setSelectedDayId(dayId);
      setShowDayView(false);
    }
  }

  // Backroads days: continuous date range from first to last itinerary-imported item
  // NOTE: useMemo must be called before any early returns to maintain hook order
  const backroadsDayIds = useMemo(() => {
    const set = new Set<string>();
    const brDates: { date: string; dayId: string }[] = [];
    for (const exp of experiences) {
      if (exp.sourceText === "Imported from itinerary document" && exp.dayId) {
        const day = days.find((d) => d.id === exp.dayId);
        if (day) brDates.push({ date: day.date, dayId: day.id });
      }
    }
    if (brDates.length === 0) return set;
    brDates.sort((a, b) => a.date.localeCompare(b.date));
    const startDate = new Date(brDates[0].date);
    const endDate = new Date(brDates[brDates.length - 1].date);
    for (const day of days) {
      const d = new Date(day.date);
      if (d >= startDate && d <= endDate) set.add(day.id);
    }
    return set;
  }, [experiences, days]);

  // ── Derived display data ──────────────────────────────────────

  if (loading || !trip) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#8a7a62] bg-[#faf8f5]">
        Loading...
      </div>
    );
  }

  // Show experiences for the selected day's city
  const cityExperiences = selectedCandidateCityId
    ? experiences.filter((e) => e.cityId === selectedCandidateCityId)
    : selectedDay
      ? experiences.filter((e) => e.cityId === selectedDay.cityId)
      : experiences;

  const selected = cityExperiences.filter((e) => e.state === "selected");
  const possible = cityExperiences.filter((e) => e.state === "possible");

  // Friction dots for filmstrip
  const dayFrictionMap = new Map<string, boolean>();
  for (const day of days) {
    const count = experiences.filter((e) => e.state === "selected" && e.dayId === day.id).length;
    if (count >= 5) dayFrictionMap.set(day.id, true);
  }

  // Map center — centroid of selected day's located experiences, or city center
  const mapCenter = (() => {
    if (selectedDay) {
      const dayExps = experiences.filter(
        (e) => e.state === "selected" && e.dayId === selectedDay.id &&
          e.latitude != null && e.longitude != null,
      );
      if (dayExps.length > 0) {
        return {
          lat: dayExps.reduce((s, e) => s + e.latitude!, 0) / dayExps.length,
          lng: dayExps.reduce((s, e) => s + e.longitude!, 0) / dayExps.length,
        };
      }
      if (selectedDay.city?.latitude && selectedDay.city?.longitude) {
        return { lat: selectedDay.city.latitude, lng: selectedDay.city.longitude };
      }
    }
    const confirmed = experiences.find((e) => e.locationStatus === "confirmed" && e.latitude);
    if (confirmed) return { lat: confirmed.latitude!, lng: confirmed.longitude! };
    return { lat: 35.6762, lng: 139.6503 };
  })();

  const isWithinDates = (() => {
    const now = new Date();
    return now >= new Date(trip.startDate) && now <= new Date(trip.endDate);
  })();

  return (
    <div className="flex flex-col bg-[#faf8f5]" style={{ height: "100dvh" }}>
      {/* Top bar removed — all navigation now in bottom action bar */}

      {/* Import panel — bottom drawer */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={resetImport} />
          <div className="relative bg-white rounded-t-2xl px-4 py-4 max-h-[80vh] overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
          <div className="max-w-2xl mx-auto">
            {/* Persistent close X */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#3a3128]">Import</h3>
              <button onClick={resetImport} className="text-[#c8bba8] hover:text-[#6b5d4a] text-lg">&times;</button>
            </div>

            {/* ── Unified input ── */}
            {!importPreview && !recPreview && (
              <>
                <p className="text-xs text-[#a89880] mb-3">
                  Paste text, a URL, or upload a screenshot. AI will figure out the rest.
                </p>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste anything — a URL, friend's recommendations, itinerary, article..."
                  rows={5}
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                             text-[#3a3128] placeholder-[#c8bba8] text-sm resize-y
                             focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                />
                <input
                  ref={importFileRef}
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <button
                    onClick={() => importFileRef.current?.click()}
                    className="px-3 py-1.5 rounded border border-dashed border-[#e0d8cc] text-xs text-[#8a7a62]
                               hover:border-[#a89880] transition-colors"
                  >
                    {importFile ? importFile.name : "Upload screenshot or PDF"}
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={handleSmartExtract}
                    disabled={importing || (!importText.trim() && !importFile)}
                    className="px-4 py-1.5 rounded bg-[#514636] text-white text-xs font-medium
                               hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
                  >
                    {importing ? "Analyzing..." : "Go"}
                  </button>
                </div>
              </>
            )}

            {/* ── Itinerary review ── */}
            {importPreview && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-[#3a3128]">Review before adding to trip</h3>
                  <button
                    onClick={() => setImportPreview(null)}
                    className="text-sm text-[#8a7a62] hover:text-[#3a3128]"
                  >
                    &larr; Edit text
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm max-h-48 overflow-y-auto">
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
                              {c.name} {exists && <span className="text-xs">(exists)</span>}
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
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    onClick={handleImportMerge}
                    disabled={importing}
                    className="px-4 py-1.5 rounded bg-[#514636] text-white text-xs font-medium
                               hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
                  >
                    {importing ? "Adding..." : "Add to Trip"}
                  </button>
                  {hasBackbone && (
                    <button
                      onClick={handleReplaceBackbone}
                      disabled={importing}
                      className="px-4 py-1.5 rounded bg-[#c0392b] text-white text-xs font-medium
                                 hover:bg-[#a93226] disabled:opacity-40 transition-colors"
                    >
                      {importing ? "Replacing..." : "Replace Backbone"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Recommendations review ── */}
            {recPreview && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-[#3a3128]">
                    {recPreview.recommendations?.length || 0} recommendations extracted
                  </h3>
                  <button
                    onClick={() => setRecPreview(null)}
                    className="text-sm text-[#8a7a62] hover:text-[#3a3128]"
                  >
                    &larr; Edit text
                  </button>
                </div>
                <div className="text-sm max-h-64 overflow-y-auto space-y-3">
                  {/* Group by: existing city, new city, no city */}
                  {(() => {
                    const recs = recPreview.recommendations || [];
                    const tripCities = trip.cities.map((c) => c.name.toLowerCase());
                    function matchesTripCity(name: string): boolean {
                      const lower = name.toLowerCase();
                      if (tripCities.includes(lower)) return true;
                      if (lower.length >= 4) {
                        return tripCities.some((tc) => tc.includes(lower) || lower.includes(tc));
                      }
                      return false;
                    }
                    const inTrip = recs.filter((r: any) => r.city && matchesTripCity(r.city));
                    const newCity = recs.filter((r: any) => r.city && !matchesTripCity(r.city));
                    const noCity = recs.filter((r: any) => !r.city);
                    // Group newCity by region
                    const byRegion: Record<string, any[]> = {};
                    for (const r of newCity) {
                      const key = r.region || r.city || "Other";
                      if (!byRegion[key]) byRegion[key] = [];
                      byRegion[key].push(r);
                    }
                    return (
                      <>
                        {inTrip.length > 0 && (
                          <div>
                            <div className="font-medium text-[#3a3128] mb-1 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                              {inTrip.length} items for cities on your trip
                            </div>
                            <div className="space-y-0.5 ml-3.5">
                              {inTrip.map((r: any, i: number) => (
                                <div key={i} className="px-2 py-1 rounded bg-green-50 text-[#3a3128]">
                                  {r.name} <span className="text-[#a89880]">· {r.city}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {Object.keys(byRegion).length > 0 && (
                          <div>
                            <div className="font-medium text-[#3a3128] mb-1 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                              {newCity.length} items for new locations
                            </div>
                            {Object.entries(byRegion).map(([region, items]) => (
                              <div key={region} className="ml-3.5 mb-1">
                                <div className="text-xs font-medium text-[#a89880] uppercase">{region}</div>
                                <div className="space-y-0.5">
                                  {items.map((r: any, i: number) => (
                                    <div key={i} className="px-2 py-1 rounded bg-amber-50 text-[#3a3128]">
                                      {r.name} <span className="text-[#a89880]">· {r.city}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {noCity.length > 0 && (
                          <div>
                            <div className="font-medium text-[#3a3128] mb-1 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                              {noCity.length} general ideas
                            </div>
                            <div className="space-y-0.5 ml-3.5">
                              {noCity.map((r: any, i: number) => (
                                <div key={i} className="px-2 py-1 rounded bg-gray-50 text-[#3a3128]">
                                  {r.name}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  {recPreview.senderNotes && (
                    <div className="px-2 py-1.5 bg-[#faf8f5] rounded text-[#8a7a62] italic">
                      {recPreview.senderNotes}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleRecCommit}
                    disabled={importing}
                    className="px-4 py-1.5 rounded bg-[#514636] text-white text-xs font-medium
                               hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
                  >
                    {importing ? "Importing..." : "Import All"}
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map — always visible on desktop, toggleable on mobile */}
        <div className={`flex-1 relative ${mobileView !== "map" ? "hidden lg:block" : ""}`}>
          <MapCanvas
            center={mapCenter}
            experiences={cityExperiences}
            accommodations={selectedDay?.accommodations || []}
            onExperienceClick={(id) => setSelectedExpId(id)}
            onNearbyClick={handleNearbyClick}
            showNearby={true}
            highlightedExpId={highlightedExpId}
            recenterKey={recenterKey}
            themeFilter={themeFilter}
            onThemeFilterChange={setThemeFilter}
            dayId={selectedDay?.id || null}
          />

          {/* City splash photo — shows once per city per session */}
          {splashCity && (
            <CitySplash
              cityName={splashCity}
              onComplete={() => setSplashCity(null)}
            />
          )}

          {/* Contextual day card — floating over map */}
          {selectedDay && (
            <div className="absolute left-2 right-2 z-10 pointer-events-none flex justify-center" style={{ top: "calc(env(safe-area-inset-top, 0px) + 8px)" }}>
              <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-[#e0d8cc] px-3 py-2 pointer-events-auto max-w-sm">
                <div className="text-xs font-medium text-[#3a3128]">
                  {new Date(selectedDay.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
                  {" — "}
                  {selectedDay.city.name}
                  {selectedDay.city.tagline && (
                    <span className="text-[#a89880] font-normal ml-1">· {selectedDay.city.tagline}</span>
                  )}
                </div>
                <div className="text-sm text-[#8a7a62] mt-0.5">
                  {(() => {
                    const dayIdx = days.findIndex((d) => d.id === selectedDay.id);
                    const prev = dayIdx > 0 ? days[dayIdx - 1] : null;
                    if (prev && prev.cityId !== selectedDay.cityId) {
                      const segment = trip.routeSegments.find(
                        (rs) => rs.originCity === prev.city.name && rs.destinationCity === selectedDay.city.name
                      );
                      const modeEmoji: Record<string, string> = { train: "🚃", bus: "🚌", flight: "✈️", car: "🚗", ferry: "⛴️", walk: "🚶" };
                      const emoji = segment ? (modeEmoji[segment.transportMode.toLowerCase()] || "🚃") : "🚃";
                      return (
                        <span className="text-amber-600 font-medium mr-1">
                          {emoji} {prev.city.name} → {selectedDay.city.name}
                          {segment?.notes && <span className="font-normal text-[#8a7a62]"> · {segment.notes}</span>}
                          {" ·"}
                        </span>
                      );
                    }
                    return null;
                  })()}
                  {selected.filter((e) => e.dayId === selectedDay.id).length} planned
                  {selectedDay.explorationZone && ` · ${selectedDay.explorationZone}`}
                  {(() => {
                    const dayRes = selectedDay.reservations?.find((r) => r);
                    if (dayRes) {
                      return ` · ${dayRes.name} ${new Date(dayRes.datetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
                    }
                    return "";
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Orientation banner — first visit only, compact */}
          {showOrientation && (
            <div className="absolute top-16 left-2 right-2 z-20 flex justify-center">
              <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-sm border border-[#e0d8cc] px-3 py-2 flex items-center gap-2 max-w-sm">
                <div className="text-sm text-[#6b5d4a] leading-snug">
                  <p className="font-medium mb-1">Map view</p>
                  <p>• Swipe days at bottom to navigate</p>
                  <p>• Tap <strong>List</strong> below for activities</p>
                  <p>• <strong>+ Import</strong> to add plans</p>
                </div>
                <button
                  onClick={() => { setShowOrientation(false); localStorage.setItem("wander:plan-oriented", "1"); }}
                  className="text-[#c8bba8] hover:text-[#8a7a62] shrink-0 text-sm"
                >
                  &times;
                </button>
              </div>
            </div>
          )}

          {/* Bottom dock: action bar + day filmstrip — single fixed container */}
          <div className="fixed bottom-0 left-0 right-0 bg-white/55 backdrop-blur-sm border-t border-[#e0d8cc]/40 z-30 safe-bottom-nav lg:block">
            {/* Action bar — Home, List, Add, Chat */}
            <div className="flex items-center justify-around px-2 py-0.5 border-b border-[#e0d8cc]/40">
              <button onClick={() => navigate("/")} className="flex flex-col items-center px-3 py-0.5 text-[#6b5d4a] hover:text-[#3a3128] transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                <span className="text-[10px] leading-tight">Home</span>
              </button>
              <button onClick={() => setMobileView("list")} className="flex flex-col items-center px-3 py-0.5 text-[#6b5d4a] hover:text-[#3a3128] transition-colors lg:hidden">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                <span className="text-[10px] leading-tight">List</span>
              </button>
              <div className="relative">
                <button onClick={() => setShowAddMenu(!showAddMenu)} className="flex flex-col items-center px-3 py-0.5 text-[#6b5d4a] hover:text-[#3a3128] transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span className="text-[10px] leading-tight">Add</span>
                </button>
                {showAddMenu && (
                  <>
                    <div className="fixed inset-0 z-[1]" onClick={() => setShowAddMenu(false)} />
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-xl border border-[#e0d8cc] py-1 z-[2] whitespace-nowrap">
                      <button onClick={() => { setShowCapture(true); setShowAddMenu(false); }}
                        className="block w-full px-4 py-2 text-sm text-[#3a3128] hover:bg-[#f0ece5] text-left">Manual</button>
                      <button onClick={() => { setShowImport(true); setShowAddMenu(false); }}
                        className="block w-full px-4 py-2 text-sm text-[#3a3128] hover:bg-[#f0ece5] text-left">Import</button>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  window.dispatchEvent(new Event("wander-open-chat"));
                }}
                className="flex flex-col items-center px-3 py-0.5 text-[#6b5d4a] hover:text-[#3a3128] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                <span className="text-[10px] leading-tight">Chat</span>
              </button>
              <button onClick={() => navigate("/guide#shaping")} className="flex flex-col items-center px-3 py-0.5 text-[#a89880] hover:text-[#6b5d4a] transition-colors" aria-label="Guide">
                <span className="text-sm leading-none font-light">?</span>
                <span className="text-[10px] leading-tight">&nbsp;</span>
              </button>
            </div>
            {/* Day filmstrip */}
            <div
              className="flex gap-1.5 px-2 py-2 overflow-x-auto"
              style={{ touchAction: "pan-x", overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch" }}
            >
              {days.map((day, dayIdx) => {
                const dayExps = experiences.filter((e) => e.state === "selected" && e.dayId === day.id);
                const locatedExps = dayExps.filter((e) => e.latitude != null && e.longitude != null);
                const hasBackroads = backroadsDayIds.has(day.id);
                const dayAccom = day.accommodations?.[0];
                const city = trip.cities.find((c) => c.id === day.cityId);
                const mapUrl = buildStaticMapUrl(locatedExps, dayAccom, city);
                const isActive = selectedDayId === day.id;
                const hasFriction = dayFrictionMap.has(day.id);
                const cityColor = getCityPastel(trip.cities, day.cityId);
                // Detect travel day: first day of a new city
                const prevDay = dayIdx > 0 ? days[dayIdx - 1] : null;
                const isTravel = prevDay && prevDay.cityId !== day.cityId;
                const prevColor = isTravel ? getCityPastel(trip.cities, prevDay.cityId) : null;

                const dayOfWeek = new Date(day.date).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
                const dateLabel = new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

                return (
                  <button
                    key={day.id}
                    onClick={() => handleDayClick(day.id)}
                    className={`shrink-0 rounded-lg overflow-hidden transition-all relative ${
                      isActive
                        ? "ring-2 ring-[#514636] w-[110px]"
                        : "w-[100px] opacity-80 hover:opacity-100"
                    }`}
                  >
                    {hasFriction && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 z-10" />
                    )}
                    {hasBackroads && (
                      <span className="absolute top-1 left-1 z-10 text-[9px] font-bold text-white bg-[#8a7a62]/70 rounded px-0.5 leading-tight">B</span>
                    )}
                    {/* Map thumbnail — just geography, no labels */}
                    {mapUrl ? (
                      <img
                        src={mapUrl}
                        alt=""
                        className="w-full h-12 object-cover bg-[#f0ece5]"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="w-full h-12"
                        style={isTravel && prevColor
                          ? { background: `linear-gradient(135deg, ${prevColor} 50%, ${cityColor} 50%)` }
                          : { backgroundColor: cityColor, opacity: 0.5 }
                        }
                      />
                    )}
                    {/* Info strip: day, date, city name */}
                    <div
                      className="px-1.5 py-1 text-center"
                      style={isActive
                        ? { backgroundColor: "#514636", color: "#fff" }
                        : { backgroundColor: cityColor, color: "#3a3128" }
                      }
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide">
                        {dayOfWeek}
                      </div>
                      <div className="text-xs font-medium">
                        {dateLabel}
                      </div>
                      <div
                        className={`text-xs leading-tight mt-0.5 ${isActive ? "opacity-80" : "opacity-60"}`}
                        style={{ wordBreak: "break-word" }}
                      >
                        {day.city.name}
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Dateless candidate cities from recommendation imports */}
              {candidateCities.length > 0 && (
                <>
                  <div className="shrink-0 flex flex-col items-center justify-center mx-1 self-stretch gap-1">
                    <div className="w-px flex-1 bg-[#e0d8cc]" />
                    <button
                      onClick={() => {
                        const next = !candidatesExpanded;
                        setCandidatesExpanded(next);
                        try { localStorage.setItem("wander:candidates-expanded", String(next)); } catch {}
                        if (!next) setSelectedCandidateCityId(null);
                      }}
                      className="text-xs text-[#c8bba8] hover:text-[#8a7a62] whitespace-nowrap px-1"
                      title={candidatesExpanded ? "Collapse ideas" : "Show idea cities"}
                    >
                      {candidatesExpanded ? `${candidateCities.length} ideas ‹` : `${candidateCities.length} ideas ›`}
                    </button>
                    <div className="w-px flex-1 bg-[#e0d8cc]" />
                  </div>
                  {candidatesExpanded && (
                    <>
                      {candidateCities.map((city) => {
                        const isActive = selectedCandidateCityId === city.id;
                        const cityExpCount = experiences.filter((e) => e.cityId === city.id).length;
                        return (
                          <div key={city.id} className="shrink-0 relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleHideCity(city.id);
                              }}
                              className="absolute -top-1 -right-1 z-10 w-5 h-5 rounded-full bg-[#e0d8cc] hover:bg-[#c8bba8] flex items-center justify-center text-xs text-[#514636]"
                              title={`Dismiss ${city.name}`}
                            >
                              ×
                            </button>
                            <button
                              onClick={() => {
                                setSelectedCandidateCityId(isActive ? null : city.id);
                                if (!isActive) setSelectedDayId(null);
                                else if (days.length > 0) setSelectedDayId(days[0].id);
                              }}
                              className={`rounded-lg overflow-hidden transition-all ${
                                isActive
                                  ? "ring-2 ring-[#514636] w-[110px]"
                                  : "w-[100px] opacity-80 hover:opacity-100"
                              }`}
                            >
                              <div
                                className="w-full h-12 flex items-center justify-center"
                                style={{ backgroundColor: "#f0ece5" }}
                              >
                                <span className="text-lg">📌</span>
                              </div>
                              <div
                                className="px-1.5 py-1 text-center"
                                style={isActive
                                  ? { backgroundColor: "#514636", color: "#fff" }
                                  : { backgroundColor: "#f5f0e8", color: "#3a3128" }
                                }
                              >
                                <div className="text-xs font-semibold">
                                  {cityExpCount} ideas
                                </div>
                                <div
                                  className={`text-xs leading-tight mt-0.5 ${isActive ? "opacity-80" : "opacity-60"}`}
                                  style={{ wordBreak: "break-word" }}
                                >
                                  {city.name}
                                </div>
                              </div>
                            </button>
                          </div>
                        );
                      })}
                      <div className="shrink-0 flex flex-col items-center justify-center mx-1 self-stretch gap-1">
                        <button
                          onClick={handleHideAllCandidates}
                          className="text-xs text-[#c8bba8] hover:text-[#8a7a62] whitespace-nowrap px-1"
                          title="Dismiss all recommendation cities"
                        >
                          dismiss all
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Desktop side panel */}
        <div className="w-96 border-l border-[#f0ece5] bg-white overflow-y-auto hidden lg:block">
          {showDayView && selectedDay ? (
            <DayView
              day={selectedDay}
              experiences={cityExperiences}
              trip={trip}
              onClose={() => setShowDayView(false)}
              onPromote={handlePromote}
              onDemote={handleDemote}
              onExperienceClick={(id) => setSelectedExpId(id)}
              onRefresh={() => { loadExperiences(); loadTrip(); }}
              interests={interests}
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
              onExperienceHover={setHighlightedExpId}
              onLocationResolved={() => { loadExperiences(); setRecenterKey((k) => k + 1); }}
              interests={interests}
              onInterestChanged={loadInterests}
            />
          )}
        </div>

        {/* Mobile list view — full screen when active */}
        {mobileView === "list" && (
          <div className="fixed inset-0 z-40 bg-[#faf8f5] lg:hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#f0ece5] shrink-0"
                 style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
              <button
                onClick={() => setMobileView("map")}
                className="text-sm text-[#8a7a62] hover:text-[#3a3128]"
              >
                &larr; Map
              </button>
              <span className="text-xs font-medium text-[#a89880]">
                {selected.length} Planned · {possible.length} Possible
              </span>
              {selectedDay && (
                <button
                  onClick={() => setShowDayView(true)}
                  className="text-xs text-[#514636] font-medium"
                >
                  Day details
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {showDayView && selectedDay ? (
                <DayView
                  day={selectedDay}
                  experiences={cityExperiences}
                  trip={trip}
                  onClose={() => setShowDayView(false)}
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
                  onLocationResolved={() => { loadExperiences(); setRecenterKey((k) => k + 1); }}
                  interests={interests}
                  onInterestChanged={loadInterests}
                />
              )}
            </div>
            <div className="shrink-0 flex gap-2 px-4 py-3 bg-white border-t border-[#f0ece5]">
              <button
                onClick={() => { setShowCapture(true); setMobileView("map"); }}
                className="flex-1 py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium"
              >
                + Manual
              </button>
              {!showDayView && selectedDay && (
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
            <p className="text-sm text-[#a89880] mb-4">
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
          interest={interests.get(selectedExpId)}
          onInterestChanged={loadInterests}
        />
      )}

      {/* Capture panel */}
      {showCapture && (
        <CapturePanel
          trip={trip}
          defaultCityId={activeCityId}
          onClose={() => setShowCapture(false)}
          onCaptured={handleCaptured}
        />
      )}

      {/* Dismiss all candidates confirmation */}
      {confirmHideAll && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <p className="text-sm text-[#3a3128] mb-4">
              Dismiss all {candidateCities.length} recommendation cities? You can bring them back later via the assistant.
            </p>
            <div className="flex gap-3">
              <button
                onClick={executeHideAllCandidates}
                className="flex-1 py-2 rounded-lg bg-[#514636] text-white text-sm font-medium
                           hover:bg-[#3a3128] transition-colors"
              >
                Dismiss All
              </button>
              <button
                onClick={() => setConfirmHideAll(false)}
                className="flex-1 py-2 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a]
                           hover:bg-[#f0ece5] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dismiss city confirmation */}
      {confirmHideCity && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <p className="text-sm text-[#3a3128] mb-4">
              Dismiss <strong>{confirmHideCity.name}</strong> and its ideas? You can bring it back later via the assistant.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => executeHideCity(confirmHideCity.id, confirmHideCity.name)}
                className="flex-1 py-2 rounded-lg bg-[#514636] text-white text-sm font-medium
                           hover:bg-[#3a3128] transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={() => setConfirmHideCity(null)}
                className="flex-1 py-2 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a]
                           hover:bg-[#f0ece5] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildStaticMapUrl(
  experiences: { latitude: number | null; longitude: number | null }[],
  accommodation?: { latitude: number | null; longitude: number | null } | null,
  cityFallback?: { latitude: number | null; longitude: number | null } | null,
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

  // Fall back to city center if no experience/accommodation points
  if (points.length === 0 && cityFallback?.latitude != null && cityFallback?.longitude != null) {
    return `https://maps.googleapis.com/maps/api/staticmap?center=${cityFallback.latitude},${cityFallback.longitude}&zoom=13&size=240x120&scale=2&maptype=roadmap&style=feature:all|saturation:-50&style=feature:all|element:labels.text|visibility:off&key=${apiKey}`;
  }
  if (points.length === 0) return null;

  const centerLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const centerLng = points.reduce((s, p) => s + p.lng, 0) / points.length;

  let zoom = 15;
  if (points.length > 1) {
    const latSpan = Math.max(...points.map((p) => p.lat)) - Math.min(...points.map((p) => p.lat));
    const lngSpan = Math.max(...points.map((p) => p.lng)) - Math.min(...points.map((p) => p.lng));
    const span = Math.max(latSpan, lngSpan);
    if (span > 0.1) zoom = 12;
    else if (span > 0.05) zoom = 13;
    else if (span > 0.02) zoom = 14;
    else zoom = 15;
  }

  const markers = points.slice(0, 5).map((p) => `${p.lat},${p.lng}`).join("|");
  return `https://maps.googleapis.com/maps/api/staticmap?center=${centerLat},${centerLng}&zoom=${zoom}&size=240x120&scale=2&maptype=roadmap&style=feature:all|saturation:-50&style=feature:all|element:labels.text|visibility:off&markers=size:tiny|color:0x514636|${markers}&key=${apiKey}`;
}

function buildShortLabel(trip: Trip): string {
  const year = new Date(trip.startDate).getFullYear();
  // Use first word of trip name that isn't a month or year
  const months = new Set(["january","february","march","april","may","june","july","august","september","october","november","december"]);
  const word = trip.name.split(/\s+/).find(
    (w) => !months.has(w.toLowerCase()) && !/^\d{4}$/.test(w)
  );
  return `${word || trip.name} ${year}`;
}

function formatShortDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
