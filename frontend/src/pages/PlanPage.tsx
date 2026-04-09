import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Trip, Day, Experience, ExperienceInterest, Decision, Accommodation } from "../lib/types";
import MapCanvas, { getCityPastel } from "../components/MapCanvas";
import ExperienceList from "../components/ExperienceList";
import ExperienceDetail from "../components/ExperienceDetail";
import CapturePanel from "../components/CapturePanel";
import UniversalCapturePanel from "../components/UniversalCapturePanel";
import DayView from "../components/DayView";
import PlanningBoard from "../components/PlanningBoard";
import ActionsPanel from "../components/ActionsPanel";
import CitySplash from "../components/CitySplash";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { useCapture } from "../contexts/CaptureContext";
import useUniversalCapture from "../hooks/useUniversalCapture";
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
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [loading, setLoading] = useState(true);

  // Navigation — days-based, plus dateless candidate cities
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [selectedCandidateCityId, setSelectedCandidateCityId] = useState<string | null>(null);
  const initialCityId = searchParams.get("city");
  const initialAction = searchParams.get("action");

  // UI state
  const [showCapture, setShowCapture] = useState(false);
  const [selectedExpId, setSelectedExpId] = useState<string | null>(null);
  const [showDayView, setShowDayView] = useState(false);
  // showImport replaced by captureCtx.reviewOpen
  const [mobileView, setMobileView] = useState<"map" | "list">(initialCityId ? "list" : "map");
  const [expandedDecisionId, setExpandedDecisionId] = useState<string | null>(null);
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  const [candidatesExpanded, setCandidatesExpanded] = useState(() => {
    try { return localStorage.getItem("wander:candidates-expanded") === "true"; } catch { return false; }
  });
  const [highlightedExpId, setHighlightedExpId] = useState<string | null>(null);
  const [splashCity, setSplashCity] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);
  const [themeFilter, setThemeFilter] = useState<string | null>(null);

  // Universal capture
  const captureCtx = useCapture();
  useUniversalCapture(trip?.id);
  const cameraRef = useRef<HTMLInputElement>(null);

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
    toggleImport: () => {
      if (captureCtx.reviewOpen || captureCtx.active) {
        captureCtx.reset();
      } else {
        captureCtx.openReview();
      }
    },
    toggleMobileView: () => setMobileView((v) => v === "map" ? "list" : "map"),
    closePanel: () => {
      if (selectedExpId) { setSelectedExpId(null); return; }
      if (showBoard) { setShowBoard(false); return; }
      if (showDayView) { setShowDayView(false); return; }
      if (showCapture) { setShowCapture(false); return; }
      if (captureCtx.reviewOpen) { captureCtx.reset(); return; }
    },
  }), [selectedExpId, showBoard, showDayView, showCapture, captureCtx]);
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

  const loadTrip = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const t = await api.get<Trip>("/trips/active");
    if (!t) { navigate("/"); return; }
    setTrip(t);

    const d = await api.get<Day[]>(`/days/trip/${t.id}`);
    setDays(d);
    if (d.length > 0 && !selectedDayId) {
      const cityDay = initialCityId ? d.find((day) => day.cityId === initialCityId) : null;
      setSelectedDayId(cityDay?.id || d[0].id);
      if (initialCityId) setSearchParams({}, { replace: true });
    }
    setLoading(false);
  }, [navigate, selectedDayId]);

  useEffect(() => {
    // If we already have trip data (return visit), refresh silently
    if (trip) loadTrip(true);
    else loadTrip();
  }, []);

  // Handle action params from Home (camera, import)
  useEffect(() => {
    if (!loading && initialAction) {
      if (initialAction === "camera") {
        setTimeout(() => cameraRef.current?.click(), 300);
      } else if (initialAction === "import") {
        captureCtx.openReview();
      }
      setSearchParams({}, { replace: true });
    }
  }, [loading, initialAction]);

  const loadExperiences = useCallback(async () => {
    if (!trip) return;
    const exps = await api.get<Experience[]>(`/experiences/trip/${trip.id}`);
    setExperiences(exps);
  }, [trip]);

  useEffect(() => { loadExperiences(); }, [loadExperiences]);

  const loadDecisions = useCallback(async () => {
    if (!trip) return;
    try {
      const decs = await api.get<Decision[]>(`/decisions/trip/${trip.id}`);
      setDecisions(decs);
    } catch { /* decisions are optional */ }
  }, [trip]);

  useEffect(() => { loadDecisions(); }, [loadDecisions]);

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

  const loadAccommodations = useCallback(async () => {
    if (!trip) return;
    try {
      const accoms = await api.get<Accommodation[]>(`/accommodations/trip/${trip.id}`);
      setAccommodations(accoms);
    } catch { /* accommodations are optional */ }
  }, [trip]);

  useEffect(() => { loadAccommodations(); }, [loadAccommodations]);

  // Refresh all data when chat or other panels make changes
  useEffect(() => {
    const handler = () => { loadTrip(true); loadExperiences(); loadDecisions(); loadInterests(); loadAccommodations(); };
    window.addEventListener("wander:data-changed", handler);
    return () => window.removeEventListener("wander:data-changed", handler);
  }, [loadTrip, loadExperiences, loadDecisions, loadInterests, loadAccommodations]);

  // ── Actions ───────────────────────────────────────────────────

  async function handlePromote(expId: string, dayId: string, routeSegmentId?: string, timeWindow?: string) {
    try {
      await api.post(`/experiences/${expId}/promote`, {
        dayId: dayId || null,
        routeSegmentId: routeSegmentId || null,
        timeWindow: timeWindow || null,
      });
      showToast("On the plan");
      await loadExperiences();
    } catch {
      showToast("Couldn't add — check your connection and try again", "error");
    }
  }

  async function handleDemote(expId: string) {
    try {
      await api.post(`/experiences/${expId}/demote`, {});
      showToast("Back in the idea pile");
      await loadExperiences();
    } catch {
      showToast("Couldn't move — check your connection and try again", "error");
    }
  }

  async function handleDeleteExp(expId: string) {
    try {
      const result = await api.delete<{ changeLogId?: string; name?: string }>(`/experiences/${expId}`);
      setSelectedExpId(null);
      await loadExperiences();
      const changeLogId = result?.changeLogId;
      const expName = result?.name || "that";
      if (changeLogId) {
        showToast(`Removed ${expName}`, "success", {
          duration: 10000,
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                const token = localStorage.getItem("wander_token") || localStorage.getItem("wander:token");
                await fetch(`/api/restore/${changeLogId}`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                });
                showToast(`Brought back ${expName}`, "success");
                await loadExperiences();
              } catch {
                showToast("Couldn't undo that one", "error");
              }
            },
          },
        });
      } else {
        showToast(`Removed ${expName}`, "success");
      }
    } catch {
      showToast("Couldn't delete — check your connection and try again", "error");
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
      showToast("Couldn't dismiss — check your connection and try again", "error");
    }
  }

  async function undoHideCity(cityId: string, cityName: string) {
    try {
      await api.patch(`/cities/${cityId}`, { hidden: false });
      showToast(`${cityName} restored`);
      await loadTrip();
      await loadExperiences();
    } catch {
      showToast("Couldn't restore — check your connection and try again", "error");
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
      showToast("Couldn't dismiss — check your connection and try again", "error");
    }
  }

  // ── Import (via UniversalCapturePanel) ───────────────────────

  function handleCameraCapture(file: File) {
    if (!trip) return;
    captureCtx.startCapture("camera", null, file);
    // Extract via universal endpoint
    const formData = new FormData();
    formData.append("tripId", trip.id);
    formData.append("cityId", activeCityId);
    formData.append("image", file);
    if (captureCtx.sessionId) formData.append("sessionId", captureCtx.sessionId);
    api.upload<any>("/import/universal-extract", formData).then(result => {
      captureCtx.setExtractionResults({
        items: result.items || [],
        versionMatches: result.versionMatches || [],
        newItemIndices: result.newItemIndices || [],
        sessionId: result.sessionId || null,
        sessionItemCount: result.sessionItemCount || 0,
        defaultCityId: result.defaultCityId || activeCityId,
        defaultCityName: result.defaultCityName || null,
      });
    }).catch(() => {
      captureCtx.reset();
      showToast("Couldn't process image — try again or paste the text instead", "error");
    });
  }

  async function handleImportCommitted() {
    await loadTrip();
    await loadExperiences();
    // Re-fetch after delay for geocoding
    setTimeout(async () => {
      await loadExperiences();
      setRecenterKey(k => k + 1);
    }, 2500);
  }

  // Keep old handleRecCommit as fallback (will be removed once fully migrated)
  async function handleRecCommitLegacy() {
    // no-op: old import panel removed
  }
  void handleRecCommitLegacy; // suppress unused warning

  // First activity welcome message
  const [firstActivityShown, setFirstActivityShown] = useState(false);
  useEffect(() => {
    if (!user || !trip) return;
    // Check if this user has added any experiences to this trip
    const userExps = experiences.filter(e => e.createdBy === user.code);
    if (userExps.length === 1 && !firstActivityShown) {
      const key = `wander:first-activity-${user.code}-${trip.id}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        setFirstActivityShown(true);
        showToast(
          "Thanks for adding your first activity. Ken mentioned I needed to make that work well so everyone can be part of the planning.",
          "info",
          { duration: 8000 },
        );
      }
    }
  }, [experiences, user, trip, firstActivityShown, showToast]);

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
      showToast("Couldn't add — check your connection and try again", "error");
    }
  }

  // ── Day selection ─────────────────────────────────────────────

  function handleDayClick(dayId: string) {
    setRecenterKey((k) => k + 1);
    setSelectedCandidateCityId(null);
    setSelectedDayId(dayId);
    // Always open day detail on single tap — no hidden double-tap
    setShowDayView(true);
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
        Getting your plan ready...
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
  const cityAccomNames = new Set(accommodations.filter(a => a.cityId === activeCityId).map(a => a.name.toLowerCase()));
  const possible = cityExperiences.filter((e) => e.state === "possible" && !e.decisionId && !cityAccomNames.has(e.name.toLowerCase()));
  const cityDecisions = decisions.filter((d) => d.cityId === activeCityId);
  const openDecisionOptionIds = new Set(
    cityDecisions.filter((d) => d.status === "open").flatMap((d) => d.options.map((o) => o.id))
  );

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
    if (!trip.startDate || !trip.endDate) return false;
    const now = new Date();
    return now >= new Date(trip.startDate) && now <= new Date(trip.endDate);
  })();

  return (
    <div className="flex flex-col bg-[#faf8f5]" style={{ height: "100dvh" }}>
      {/* Top bar removed — all navigation now in bottom action bar */}

      {/* Universal capture panel — replaces old import panel */}
      {captureCtx.reviewOpen && (
        <UniversalCapturePanel
          trip={trip}
          defaultCityId={activeCityId}
          onCommitted={handleImportCommitted}
        />
      )}

      {/* Hidden camera input */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleCameraCapture(file);
          e.target.value = "";
        }}
        className="hidden"
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map — always visible on desktop, toggleable on mobile, compressed when board is open */}
        <div className={`relative ${
          showBoard
            ? "hidden lg:block lg:w-[35%] lg:shrink-0"
            : `flex-1 ${mobileView !== "map" ? "hidden lg:block" : ""}`
        }`}>
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
            emphasizeIds={openDecisionOptionIds}
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
                  {trip.datesKnown === false
                    ? `Day ${selectedDay.dayNumber || days.indexOf(selectedDay) + 1}`
                    : new Date(selectedDay.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })
                  }
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
                  {(() => {
                    const scheduled = selected.filter((e) => e.dayId === selectedDay.id).length;
                    const ideas = possible.length;
                    if (scheduled > 0) return `${scheduled} planned`;
                    if (ideas > 0) return (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowBoard(true); }}
                        className="underline underline-offset-2 decoration-[#c8bba8] hover:decoration-[#6b5d4a] transition-colors"
                      >
                        {ideas} {ideas === 1 ? 'idea' : 'ideas'}
                      </button>
                    );
                    return "Open day";
                  })()}
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
                  <p>• Swipe days to navigate</p>
                  <p>• Tap <strong>List</strong> to see all activities</p>
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

          {/* Bottom dock: action bar + day filmstrip — hidden when board is open */}
          <div className={`fixed left-0 right-0 bg-white/55 backdrop-blur-sm border-t border-[#e0d8cc]/40 z-30 bottom-0 ${showBoard ? "hidden" : ""}`}
               style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            {/* Action bar — Home, List, Add, Chat, Now */}
            <div className="flex items-center justify-around px-2 py-0.5 border-b border-[#e0d8cc]/40">
              <button onClick={() => navigate("/")} className="flex flex-col items-center px-2 py-0.5 text-[#c8bba8] hover:text-[#6b5d4a] transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                <span className="text-[10px] leading-tight">Home</span>
              </button>
              <button onClick={() => { setShowBoard(true); setMobileView("map"); }} className="flex flex-col items-center px-3 py-0.5 text-[#6b5d4a] hover:text-[#3a3128] transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="12" y1="3" x2="12" y2="21" />
                </svg>
                <span className="text-[10px] leading-tight">Build</span>
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
                      <button onClick={() => { captureCtx.openReview(); setShowAddMenu(false); }}
                        className="block w-full px-4 py-2 text-sm text-[#3a3128] hover:bg-[#f0ece5] text-left">Import</button>
                      <button onClick={() => { cameraRef.current?.click(); setShowAddMenu(false); }}
                        className="block w-full px-4 py-2 text-sm text-[#3a3128] hover:bg-[#f0ece5] text-left">Camera</button>
                      <div className="border-t border-[#e0d8cc] my-0.5" />
                      <button onClick={() => {
                        setShowAddMenu(false);
                        const cityName = selectedDay?.city?.name || "our plans";
                        window.dispatchEvent(new CustomEvent("wander-open-chat", {
                          detail: { prefill: `Help the group decide: where should we eat in ${cityName}?` },
                        }));
                      }}
                        className="block w-full px-4 py-2 text-sm text-[#3a3128] hover:bg-[#f0ece5] text-left">Group decision</button>
                    </div>
                  </>
                )}
              </div>
              <button onClick={() => navigate("/now")} className="flex flex-col items-center px-2 py-0.5 text-[#c8bba8] hover:text-[#6b5d4a] transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="text-[10px] leading-tight">Now</span>
              </button>
              <button onClick={() => setShowActions(true)} className="flex flex-col items-center px-2 py-0.5 text-[#c8bba8] hover:text-[#6b5d4a] transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
                <span className="text-[10px] leading-tight">Actions</span>
              </button>
            </div>
            {/* Day filmstrip — extra top padding separates from action bar for mobile tap accuracy */}
            <div className="border-t border-[#e5ddd0]/60" />
            <div
              className="flex gap-2.5 px-2 pt-2 pb-2.5 overflow-x-auto"
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

                const isDateless = trip.datesKnown === false;
                const dayOfWeek = isDateless
                  ? `Day ${day.dayNumber || dayIdx + 1}`
                  : new Date(day.date).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
                const dateLabel = isDateless
                  ? day.city.name
                  : new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

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

        {/* Planning board — inline on desktop (map+board side-by-side), overlay on mobile */}
        {showBoard && (
          <PlanningBoard
            trip={trip}
            days={days}
            experiences={experiences}
            activeCityId={activeCityId}
            onPromote={handlePromote}
            onDemote={handleDemote}
            onExperienceClick={(id) => setSelectedExpId(id)}
            onClose={() => setShowBoard(false)}
            onActiveDayChange={(dayId) => setSelectedDayId(dayId)}
            decisionOptionNames={new Set(
              cityDecisions.filter(d => d.status === "open").flatMap(d => d.options.map(o => o.name.toLowerCase()))
            )}
            onAdd={(cityId, action) => {
              const cityDay = days.find(d => d.cityId === cityId);
              if (cityDay) setSelectedDayId(cityDay.id);
              switch (action) {
                case "manual": setShowCapture(true); break;
                case "import": captureCtx.openReview(); break;
                case "camera": cameraRef.current?.click(); break;
                case "decision": {
                  const cn = trip?.cities.find(c => c.id === cityId)?.name || "our plans";
                  window.dispatchEvent(new CustomEvent("wander-open-chat", {
                    detail: { prefill: `Help the group decide: where should we eat in ${cn}?` },
                  }));
                  break;
                }
              }
            }}
          />
        )}

        {/* Desktop side panel — hidden when board is open */}
        <div className={`w-96 border-l border-[#f0ece5] bg-white overflow-y-auto hidden ${showBoard ? "" : "lg:block"}`}>
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
              decisions={cityDecisions}
              onDecisionsChanged={() => { loadDecisions(); loadExperiences(); }}
              cityName={trip?.cities.find((c) => c.id === activeCityId)?.name}
            />
          )}
        </div>

        {/* Mobile list view — structured day view */}
        {mobileView === "list" && !showBoard && (
          <div className="fixed inset-0 z-40 bg-[#faf8f5] lg:hidden flex flex-col">
            {/* Header — just city name and back */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#f0ece5] shrink-0"
                 style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
              <button
                onClick={() => navigate("/")}
                className="text-sm text-[#8a7a62] hover:text-[#3a3128] min-h-[44px] flex items-center"
              >
                &larr; Home
              </button>
              <div className="text-center">
                <div className="text-sm font-medium text-[#3a3128]">
                  {trip?.cities.find(c => c.id === activeCityId)?.name || ""}
                </div>
                {selectedDay && (
                  <div className="text-[10px] text-[#a89880]">
                    {new Date(selectedDay.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
                  </div>
                )}
              </div>
              <div className="w-12" /> {/* spacer for centering */}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
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
                <>
                  {/* Section 1: The Plan — grouped by day when spanning multiple days */}
                  {selected.length > 0 && (() => {
                    const cityDaysAll = days.filter(d => d.cityId === activeCityId).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                    const dayIds = new Set(selected.map(e => e.dayId).filter(Boolean));
                    const showDayHeaders = dayIds.size > 1;

                    // Group by day, preserving day order
                    const groups: { day: typeof days[0] | null; exps: typeof selected }[] = [];
                    if (showDayHeaders) {
                      const byDay = new Map<string, typeof selected>();
                      selected.forEach(e => {
                        const key = e.dayId || '_none';
                        if (!byDay.has(key)) byDay.set(key, []);
                        byDay.get(key)!.push(e);
                      });
                      const usedKeys = new Set<string>();
                      cityDaysAll.forEach(d => {
                        const exps = byDay.get(d.id);
                        if (exps) { groups.push({ day: d, exps }); usedKeys.add(d.id); }
                      });
                      // Catch experiences assigned to days outside this city (data mismatch)
                      const remaining: typeof selected = [];
                      byDay.forEach((exps, key) => {
                        if (key !== '_none' && !usedKeys.has(key)) remaining.push(...exps);
                      });
                      const unassigned = [...(byDay.get('_none') || []), ...remaining];
                      if (unassigned.length > 0) groups.push({ day: null, exps: unassigned });
                    } else {
                      groups.push({ day: null, exps: selected });
                    }

                    return (
                      <div className="mb-6">
                        <div className="text-xs text-[#a89880] uppercase tracking-wider mb-2">The plan</div>
                        {groups.map((group, gi) => (
                          <div key={gi} className={gi > 0 ? "mt-4" : ""}>
                            {group.day && (
                              <div className="text-xs font-medium text-[#8a7a62] mb-1.5 ml-1">
                                {new Date(group.day.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                              </div>
                            )}
                            <div className="space-y-2">
                              {group.exps.map((exp) => (
                                <button
                                  key={exp.id}
                                  onClick={() => { setSelectedExpId(exp.id); setMobileView("map"); }}
                                  className="w-full text-left p-3 bg-white rounded-xl border border-[#e8e0d4] hover:border-[#c8bba8] transition-colors"
                                >
                                  <div className="text-sm font-medium text-[#3a3128]">{exp.name}</div>
                                  {exp.neighborhood && (
                                    <div className="text-xs text-[#a89880] mt-0.5">{exp.neighborhood}</div>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Accommodation — where you're staying */}
                  {(() => {
                    const uniqueAccoms = accommodations.filter(a => a.cityId === activeCityId);
                    if (uniqueAccoms.length === 0) return null;
                    return (
                      <div className="mb-4">
                        {uniqueAccoms.map(a => (
                          <div key={a.id} className="flex items-center gap-2 p-2.5 bg-[#faf8f5] rounded-lg border border-[#f0ece5]">
                            <span className="text-base">🏨</span>
                            <div>
                              <div className="text-sm text-[#3a3128]">{a.name}</div>
                              {a.address && <div className="text-xs text-[#a89880]">{a.address}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {selected.length === 0 && (() => {
                    // Show day notes/descriptions from the itinerary if available
                    const cityDays = days.filter(d => d.cityId === activeCityId).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                    const daysWithNotes = cityDays.filter(d => d.notes && d.notes.trim());
                    if (daysWithNotes.length > 0) {
                      return (
                        <div className="mb-6">
                          <div className="text-xs text-[#a89880] uppercase tracking-wider mb-2">The itinerary</div>
                          <div className="space-y-2">
                            {daysWithNotes.map(d => (
                              <div key={d.id} className="p-3 bg-white rounded-xl border border-[#e8e0d4]">
                                <div className="text-xs font-medium text-[#8a7a62]">
                                  {new Date(d.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                                </div>
                                <div className="text-sm text-[#3a3128] mt-1">{d.notes}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="mb-4" />
                    );
                  })()}

                  {/* Section 2: Decisions — expand inline to show options */}
                  {cityDecisions.length > 0 && (
                    <div className="mb-6">
                      {cityDecisions.map((dec) => {
                        const voterCount = new Set(dec.votes.map((v: any) => v.userCode)).size;
                        const voterNames = [...new Set(dec.votes.map((v: any) => v.displayName))];
                        const isExpanded = expandedDecisionId === dec.id;
                        // Vote counts per option
                        const voteCounts = new Map<string, number>();
                        dec.votes.forEach((v: any) => {
                          voteCounts.set(v.optionId, (voteCounts.get(v.optionId) || 0) + 1);
                        });
                        return (
                          <div key={dec.id} className="mb-2">
                            <button
                              onClick={() => setExpandedDecisionId(isExpanded ? null : dec.id)}
                              className="w-full text-left p-3 rounded-xl border border-amber-200/60 bg-amber-50/30"
                            >
                              <div className="text-sm font-medium text-[#3a3128]">{dec.title}</div>
                              <div className="text-xs text-[#8a7a62] mt-0.5">
                                {dec.options.length} option{dec.options.length !== 1 ? "s" : ""}
                                {voterCount > 0 && ` · ${voterNames.join(", ")} weighed in`}
                                {" · "}
                                <span className="text-amber-700">{isExpanded ? "Hide" : "See options →"}</span>
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="mt-1 ml-3 space-y-1">
                                {dec.options.map((opt: any) => {
                                  const votes = voteCounts.get(opt.id) || 0;
                                  return (
                                    <div key={opt.id} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-[#e8e0d4]">
                                      <span className="text-sm text-[#3a3128]">{opt.name}</span>
                                      {votes > 0 && (
                                        <span className="text-xs text-[#a89880] ml-2">{votes} vote{votes !== 1 ? "s" : ""}</span>
                                      )}
                                    </div>
                                  );
                                })}
                                <button
                                  onClick={() => setMobileView("map")}
                                  className="text-xs text-amber-700 mt-1 py-1"
                                >
                                  Vote on the map →
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Section 3: Ideas */}
                  {possible.length > 0 ? (
                    <div>
                      <div className="text-xs text-[#a89880] uppercase tracking-wider mb-3">Ideas for this city</div>
                      <div className="space-y-2">
                        {possible.map((exp) => (
                          <div key={exp.id}>
                            <button
                              onClick={() => setExpandedIdeaId(expandedIdeaId === exp.id ? null : exp.id)}
                              className="w-full text-left p-3 bg-white rounded-xl border border-[#f0ece5] hover:border-[#d8cfc0] transition-colors"
                            >
                              <div className="text-sm text-[#3a3128]">{exp.name}</div>
                              {exp.neighborhood && (
                                <div className="text-xs text-[#a89880] mt-0.5">{exp.neighborhood}</div>
                              )}
                            </button>
                            {expandedIdeaId === exp.id && (
                              <div className="ml-3 mt-1 p-2.5 bg-[#faf8f5] rounded-lg border border-[#f0ece5] text-xs text-[#6b5d4a] space-y-1.5">
                                {exp.description && <p>{exp.description}</p>}
                                {exp.explorationZone && <p className="text-[#a89880]">{exp.explorationZone}</p>}
                                {!exp.description && !exp.explorationZone && (
                                  <p className="text-[#c8bba8] italic">No details yet — ask Scout for more info</p>
                                )}
                                <button
                                  onClick={() => { setSelectedExpId(exp.id); setMobileView("map"); }}
                                  className="text-amber-700 mt-1"
                                >
                                  See on map →
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : selected.length === 0 && (
                    <div className="py-12 text-center">
                      <p className="text-sm text-[#a89880]">Nothing here yet</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Bottom: just + add */}
            <div className="shrink-0 px-4 py-3 bg-white border-t border-[#f0ece5]">
              <button
                onClick={() => { setShowCapture(true); setMobileView("map"); }}
                className="w-full py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium"
              >
                + Add something
              </button>
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

      {/* Actions panel */}
      {showActions && trip && <ActionsPanel tripId={trip.id} onClose={() => setShowActions(false)} />}

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
  const year = trip.startDate ? new Date(trip.startDate).getFullYear() : new Date().getFullYear();
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
