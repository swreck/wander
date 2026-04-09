import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import CreateTrip from "../components/CreateTrip";
import { useToast } from "../contexts/ToastContext";
import { APIProvider, Map as GoogleMap, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { getCityPastel, CITY_PASTELS } from "../components/MapCanvas";
import type { Trip, City, Day, Experience, ChangeLogEntry, Decision } from "../lib/types";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts";
import useUniversalCapture from "../hooks/useUniversalCapture";
import RouteSegmentsPanel from "../components/RouteSegmentsPanel";
import { getContributorColor, getContributorInitial } from "../lib/travelerProfiles";
import ContributorView from "../components/ContributorView";
import ImportCard from "../components/ImportCard";
import ApprovalQueue from "../components/ApprovalQueue";
import LearningsPanel from "../components/LearningsPanel";
import TripPhaseContent from "../components/TripPhaseContent";
import { getTripPhase } from "../lib/tripPhase";
import ActivityFeed from "../components/ActivityFeed";
import SyncAlert from "../components/SyncAlert";
import ActionsPanel from "../components/ActionsPanel";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Module-level cache so return visits don't flash "Finding your trip..."
let _cachedTrip: Trip | null = null;
let _cachedDays: Day[] = [];
let _cachedExperiences: Experience[] = [];

export default function TripOverview() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [trip, setTrip] = useState<Trip | null>(_cachedTrip);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [days, setDays] = useState<Day[]>(_cachedDays);
  const [experiences, setExperiences] = useState<Experience[]>(_cachedExperiences);
  const [loading, setLoading] = useState(!_cachedTrip);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTrip, setEditingTrip] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editTagline, setEditTagline] = useState("");
  const [recentActivity, setRecentActivity] = useState<ChangeLogEntry[]>([]);
  const [collabWelcome, setCollabWelcome] = useState<{ names: string[]; tripName: string } | null>(null);
  const [showTripSwitcher, setShowTripSwitcher] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [contributorViewCode, setContributorViewCode] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showLearnings, setShowLearnings] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [openDecisions, setOpenDecisions] = useState<Decision[]>([]);

  const isPlanner = user?.role === "planner";
  const initialLoadDone = useRef(false);

  useKeyboardShortcuts();
  useUniversalCapture(trip?.id);

  // Listen for bottom nav actions trigger
  useEffect(() => {
    const handler = () => setShowActions(true);
    window.addEventListener("wander-open-actions", handler);
    return () => window.removeEventListener("wander-open-actions", handler);
  }, []);

  // Signal to BottomNav whether actions need attention
  useEffect(() => {
    const needsInput = openDecisions.filter(dec => !dec.votes.some(v => v.userCode === user?.code)).length > 0;
    (window as any).__actionsNeedAttention = needsInput;
  }, [openDecisions, user?.code]);

  async function loadTrips(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [active, all] = await Promise.all([
        api.get<Trip | null>("/trips/active"),
        api.get<Trip[]>("/trips"),
      ]);

      // On first load, restore last-viewed trip if it differs from server's active trip
      let effectiveActive = active;
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        const storedTripId = localStorage.getItem("wander:last-trip-id");
        if (storedTripId && active && storedTripId !== active.id) {
          const storedExists = all.some((t) => t.id === storedTripId);
          if (storedExists) {
            try {
              const switched = await api.post<Trip>(`/trips/${storedTripId}/activate`, {});
              effectiveActive = switched;
            } catch {
              localStorage.setItem("wander:last-trip-id", active.id);
            }
          } else {
            localStorage.removeItem("wander:last-trip-id");
          }
        } else if (active) {
          localStorage.setItem("wander:last-trip-id", active.id);
        }
      }

      setTrip(effectiveActive);
      _cachedTrip = effectiveActive;
      setAllTrips(all);
      if (!effectiveActive) { setShowCreate(true); }
      else {
        const [d, e] = await Promise.all([
          api.get<Day[]>(`/days/trip/${effectiveActive.id}`),
          api.get<Experience[]>(`/experiences/trip/${effectiveActive.id}`),
        ]);
        setDays(d); _cachedDays = d;
        setExperiences(e); _cachedExperiences = e;
        try {
          const { logs } = await api.get<{ logs: ChangeLogEntry[]; total: number }>(`/change-logs/trip/${effectiveActive.id}?limit=50`);
          setRecentActivity(logs.slice(0, 5));

          const welcomeKey = `wander:trip-welcomed:${effectiveActive.id}:${user?.displayName}`;
          if (user && !localStorage.getItem(welcomeKey)) {
            const myEntries = logs.filter((l) => l.userDisplayName === user.displayName);
            if (myEntries.length === 0 && logs.length > 0) {
              const otherNames = [...new Set(logs.map((l) => l.userDisplayName))];
              if (otherNames.length > 0) {
                setCollabWelcome({ names: otherNames, tripName: effectiveActive.name });
              }
            }
            localStorage.setItem(welcomeKey, "1");
          }
        } catch { /* ignore */ }
        // Fetch pending approvals count for planners
        try {
          const { count } = await api.get<{ count: number }>(`/approvals/${effectiveActive.id}/pending`);
          setPendingApprovals(count);
        } catch { /* ignore */ }
        // Fetch open decisions for nudge
        try {
          const decs = await api.get<Decision[]>(`/decisions/trip/${effectiveActive.id}`);
          setOpenDecisions(decs.filter((d) => d.status === "open"));
        } catch { /* ignore */ }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // First load shows spinner; subsequent navigations reuse cached data
    if (trip) loadTrips(true);
    else loadTrips();
  }, []);

  useEffect(() => {
    const handler = () => { loadTrips(true); };
    window.addEventListener("wander:data-changed", handler);
    return () => window.removeEventListener("wander:data-changed", handler);
  }, []);

  async function handleSaveTrip() {
    if (!trip) return;
    setSavingTrip(true);
    try {
      await api.patch(`/trips/${trip.id}`, {
        name: editName,
        tagline: editTagline || null,
      });
      setEditingTrip(false);
      showToast("Got it");
      loadTrips();
    } catch {
      showToast("Couldn't save — check your connection and try again", "error");
    } finally {
      setSavingTrip(false);
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }

  function nights(arrival: string | null, departure: string | null): number {
    if (!arrival || !departure) return 0;
    return Math.round((new Date(departure).getTime() - new Date(arrival).getTime()) / 86400000);
  }

  // Backroads days: days with dayType "guided" (set during import)
  // NOTE: useMemo must be called before any early returns to maintain hook order
  const backroadsDays = useMemo(() => {
    if (!trip) return new Set<string>();
    const set = new Set<string>();
    for (const day of trip.days) {
      if (day.dayType === "guided") set.add(day.id);
    }
    return set;
  }, [trip]);

  // Derive visit order from the actual day sequence (not city arrivalDates).
  // Walk through days sorted by date. Each time the city changes, that's a new visit.
  // This correctly handles return visits (e.g., Kyoto Oct 5-7 then Kyoto Oct 20-23 = visits 2 and 8).
  // NOTE: useMemo must be called before any early returns to maintain hook order
  const cities = trip?.cities || [];
  const cityMarkers = useMemo(() => {
    if (!cities.length || !days.length) return [];
    const sortedDays = [...days].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Build visit sequence: each city transition = new visit number
    const visits: { cityId: string; visitNumber: number }[] = [];
    let lastCityId: string | null = null;
    let visitCount = 0;
    for (const day of sortedDays) {
      if (day.cityId && day.cityId !== lastCityId) {
        visitCount++;
        visits.push({ cityId: day.cityId, visitNumber: visitCount });
        lastCityId = day.cityId;
      }
    }

    // Group by city: collect all visit numbers for each city
    const cityMap = new Map<string, { city: City; visitNumbers: number[] }>();
    for (const { cityId, visitNumber } of visits) {
      const city = cities.find((c) => c.id === cityId);
      if (!city || !city.latitude || !city.longitude || city.hidden) continue;
      const existing = cityMap.get(cityId);
      if (existing) {
        existing.visitNumbers.push(visitNumber);
      } else {
        cityMap.set(cityId, { city, visitNumbers: [visitNumber] });
      }
    }
    return Array.from(cityMap.values());
  }, [days, cities]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#8a7a62] bg-[#faf8f5]">
        Finding your trip...
      </div>
    );
  }

  if (showCreate || (!trip && allTrips.length === 0)) {
    return (
      <CreateTrip
        onCreated={() => { setShowCreate(false); loadTrips(); }}
        existingTrips={allTrips}
        onSwitchTrip={async (tripId) => {
          try {
            await api.post(`/trips/${tripId}/activate`, {});
            localStorage.setItem("wander:last-trip-id", tripId);
            setShowCreate(false);
            loadTrips();
            window.dispatchEvent(new CustomEvent("wander:data-changed"));
          } catch {
            showToast("Couldn't switch — check your connection and try again", "error");
          }
        }}
      />
    );
  }

  // Active trip failed to load but trips exist — show trip switcher
  if (!trip && allTrips.length > 0) {
    return (
      <CreateTrip
        onCreated={() => { loadTrips(); }}
        existingTrips={allTrips}
        onSwitchTrip={async (tripId) => {
          try {
            await api.post(`/trips/${tripId}/activate`, {});
            localStorage.setItem("wander:last-trip-id", tripId);
            loadTrips();
            window.dispatchEvent(new CustomEvent("wander:data-changed"));
          } catch {
            showToast("Couldn't switch — check your connection and try again", "error");
          }
        }}
      />
    );
  }

  async function handleSwitchTrip(tripId: string) {
    try {
      await api.post(`/trips/${tripId}/activate`, {});
      localStorage.setItem("wander:last-trip-id", tripId);
      setShowTripSwitcher(false);
      const switched = allTrips.find(t => t.id === tripId);
      showToast(switched?.name || "Switched");
      loadTrips();
      // Notify ChatOverlay to update its trip context
      window.dispatchEvent(new CustomEvent("wander:data-changed"));
    } catch {
      showToast("Couldn't switch — check your connection and try again", "error");
    }
  }

  const archivedTrips = allTrips.filter((t) => t.status === "archived");
  // Always show trip switcher — "Plan a new trip" inside is the planner-gated action
  const showSwitcherArrow = true;
  const tripPhase = getTripPhase({
    datesKnown: trip.datesKnown !== false,
    startDate: trip.startDate,
    endDate: trip.endDate,
  });
  const isWithinDates = tripPhase === "active";

  const selectedPerDay: Record<string, number> = {};
  const possiblePerCity: Record<string, number> = {};
  for (const exp of experiences) {
    if (exp.state === "selected" && exp.dayId) {
      selectedPerDay[exp.dayId] = (selectedPerDay[exp.dayId] || 0) + 1;
    }
    if (exp.state === "possible") {
      possiblePerCity[exp.cityId] = (possiblePerCity[exp.cityId] || 0) + 1;
    }
  }

  const locatedCities = cities.filter((c) => c.latitude && c.longitude && c.arrivalDate && !c.hidden);
  const hasMap = API_KEY && cityMarkers.length > 0;

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-20">
      {/* Collaboration welcome */}
      {collabWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
          onClick={() => setCollabWelcome(null)}>
          <div
            className="mx-6 max-w-sm w-full bg-white rounded-2xl shadow-xl p-6 animate-greetingFadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[15px] text-[#3a3128] leading-relaxed">
              {formatNameList(collabWelcome.names)}{" "}
              {collabWelcome.names.length === 1 ? "has" : "have"} already started
              the {collabWelcome.tripName} itinerary. Once you enter, you'll be
              collaborating on the trip and everyone will see your changes.
            </p>
            <div className="mt-4 text-center">
              <span className="text-sm text-[#c8bba8]">tap anywhere to continue</span>
            </div>
          </div>
        </div>
      )}

      {/* Trip switcher bottom sheet */}
      {showTripSwitcher && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm"
          onClick={() => setShowTripSwitcher(false)}>
          <div
            className="w-full sm:max-w-md sm:mx-4 bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            <div className="px-4 pt-4 pb-2 border-b border-[#f0ece5] flex items-center justify-between">
              <h3 className="text-sm font-medium text-[#3a3128]">Your Trips</h3>
              <button onClick={() => setShowTripSwitcher(false)} className="text-[#c8bba8] hover:text-[#8a7a62] text-lg">&times;</button>
            </div>
            {/* All trips — sorted by last opened */}
            <TripSwitcherList
              trips={allTrips}
              currentTripId={trip.id}
              onSwitch={handleSwitchTrip}
              onDelete={async (id) => {
                if (!confirm("Remove this trip? This can't be undone.")) return;
                try {
                  await api.delete(`/trips/${id}`);
                  showToast("Trip removed", "success");
                  loadTrips();
                } catch { showToast("Couldn't remove trip", "error"); }
              }}
              onNewTrip={() => { setShowTripSwitcher(false); setShowCreate(true); }}
              onRename={(id, newName) => {
                setAllTrips(prev => prev.map(t => t.id === id ? { ...t, name: newName } : t));
                if (trip && trip.id === id) setTrip({ ...trip, name: newName });
              }}
            />
          </div>
        </div>
      )}

      {/* Hero map */}
      {hasMap && (
        <div className="relative">
          <div className="h-[40vh] min-h-[280px]">
            <APIProvider apiKey={API_KEY}>
              <GoogleMap
                defaultCenter={{ lat: locatedCities[0].latitude!, lng: locatedCities[0].longitude! }}
                defaultZoom={6}
                mapId="wander-overview"
                gestureHandling="cooperative"
                disableDefaultUI={true}
                zoomControl={false}
                mapTypeControl={false}
                streetViewControl={false}
                fullscreenControl={false}
                style={{ width: "100%", height: "100%" }}
              >
                <OverviewFitter cities={locatedCities} />
                <RoutePolyline cities={locatedCities} />
                {cityMarkers.map(({ city, visitNumbers }) => {
                  const firstIdx = visitNumbers[0] - 1;
                  const pastel = CITY_PASTELS[firstIdx % CITY_PASTELS.length];
                  const label = visitNumbers.length > 1
                    ? visitNumbers.join(" · ")
                    : String(visitNumbers[0]);
                  const isMultiVisit = visitNumbers.length > 1;
                  return (
                    <AdvancedMarker
                      key={city.id}
                      position={{ lat: city.latitude!, lng: city.longitude! }}
                      onClick={() => navigate(`/plan?city=${city.id}`)}
                      title={city.name}
                    >
                      <div className="flex flex-col items-center">
                        <div
                          className="flex items-center justify-center shadow"
                          style={{
                            minWidth: 20,
                            height: 20,
                            padding: isMultiVisit ? "0 5px" : undefined,
                            borderRadius: isMultiVisit ? 10 : "50%",
                            backgroundColor: pastel,
                            borderWidth: 2,
                            borderColor: "white",
                            borderStyle: "solid",
                            boxShadow: `0 1px 4px rgba(0,0,0,0.25), 0 0 0 1px ${pastel}`,
                          }}
                        >
                          <span className="text-[9px] font-bold text-[#3a3128]">
                            {label}
                          </span>
                        </div>
                        <div className="mt-0.5 px-1 py-0 rounded bg-white/90 shadow-sm">
                          <span className="text-[9px] font-medium text-[#3a3128]">{city.name}</span>
                        </div>
                      </div>
                    </AdvancedMarker>
                  );
                })}
              </GoogleMap>
            </APIProvider>
          </div>
          {/* Trip name overlay on map */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#faf8f5] to-transparent pt-12 pb-4 px-4">
            <div className="max-w-2xl mx-auto">
              <button
                onClick={() => showSwitcherArrow && setShowTripSwitcher(true)}
                className="text-left group"
              >
                <h1 className="text-2xl font-light text-[#3a3128] inline">
                  {trip.name}
                </h1>
                {showSwitcherArrow && (
                  <span className="ml-2 text-[#8a7a62] group-hover:text-[#514636] transition-colors text-base">&#9662;</span>
                )}
              </button>
              {trip.tagline && (
                <p className="text-sm text-[#6b5d4a] italic">{trip.tagline}</p>
              )}
              <p className="text-sm text-[#8a7a62] mt-1">
                {trip.startDate && trip.endDate ? (
                  <>
                    {(() => {
                      const today = new Date();
                      const nowUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
                      const [sy, sm, sd] = trip.startDate!.split("T")[0].split("-").map(Number);
                      const [ey, em, ed] = trip.endDate!.split("T")[0].split("-").map(Number);
                      const startUTC = Date.UTC(sy, sm - 1, sd);
                      const endUTC = Date.UTC(ey, em - 1, ed);
                      const msPerDay = 86400000;
                      const daysUntil = Math.round((startUTC - nowUTC) / msPerDay);
                      const totalDays = Math.round((endUTC - startUTC) / msPerDay) + 1;

                      if (daysUntil > 1) return `${daysUntil} days away`;
                      if (daysUntil === 1) return "Tomorrow!";
                      if (daysUntil === 0) return "Today!";
                      const dayNum = Math.abs(daysUntil) + 1;
                      return dayNum <= totalDays ? `Day ${dayNum} of ${totalDays}` : "Welcome home";
                    })()}
                    {" · "}
                    {formatDate(trip.startDate)} — {formatDate(trip.endDate)}
                  </>
                ) : (
                  <span>{days.length} days planned · Dates TBD</span>
                )}
                <button
                  onClick={() => {
                    setEditName(trip.name);
                    setEditTagline(trip.tagline || "");
                    setEditStartDate(trip.startDate ? trip.startDate.split("T")[0] : "");
                    setEditEndDate(trip.endDate ? trip.endDate.split("T")[0] : "");
                    setEditingTrip(true);
                  }}
                  className="ml-2 text-[#c8bba8] hover:text-[#8a7a62]"
                >
                  edit
                </button>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header — only when there's no map */}
        {!hasMap && (
          <div className="mb-8">
            <button
              onClick={() => showSwitcherArrow && setShowTripSwitcher(true)}
              className="text-left group"
            >
              <h1 className="text-2xl font-light text-[#3a3128] inline">
                {trip.name}
              </h1>
              {showSwitcherArrow && (
                <span className="ml-2 text-[#8a7a62] group-hover:text-[#514636] transition-colors text-base">&#9662;</span>
              )}
            </button>
            {trip.tagline && (
              <p className="text-sm text-[#6b5d4a] mt-0.5 italic">{trip.tagline}</p>
            )}
            <p className="text-sm text-[#8a7a62] mt-1">
              {trip.startDate && trip.endDate
                ? (() => {
                    const today = new Date();
                    const nowUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
                    const [sy, sm, sd] = trip.startDate!.split("T")[0].split("-").map(Number);
                    const [ey, em, ed] = trip.endDate!.split("T")[0].split("-").map(Number);
                    const startUTC = Date.UTC(sy, sm - 1, sd);
                    const endUTC = Date.UTC(ey, em - 1, ed);
                    const msPerDay = 86400000;
                    const daysUntil = Math.round((startUTC - nowUTC) / msPerDay);
                    const totalDays = Math.round((endUTC - startUTC) / msPerDay) + 1;
                    let prefix = "";
                    if (daysUntil > 1) prefix = `${daysUntil} days away · `;
                    else if (daysUntil === 1) prefix = "Tomorrow! · ";
                    else if (daysUntil === 0) prefix = "Today! · ";
                    else {
                      const dayNum = Math.abs(daysUntil) + 1;
                      prefix = dayNum <= totalDays ? `Day ${dayNum} of ${totalDays} · ` : "Welcome home · ";
                    }
                    return `${prefix}${formatDate(trip.startDate)} — ${formatDate(trip.endDate)}`;
                  })()
                : `${days.length} days planned · Dates TBD`
              }
              <button
                onClick={() => {
                  setEditName(trip.name);
                  setEditTagline(trip.tagline || "");
                  setEditStartDate(trip.startDate ? trip.startDate.split("T")[0] : "");
                  setEditEndDate(trip.endDate ? trip.endDate.split("T")[0] : "");
                  setEditingTrip(true);
                }}
                className="ml-2 text-sm text-[#c8bba8] hover:text-[#8a7a62]"
              >
                edit
              </button>
            </p>
          </div>
        )}

        {/* Identity bar — min 44px tap targets for mobile */}
        <div className="flex items-center justify-end gap-1 mb-4">
          <button
            onClick={() => navigate("/guide#getting-around")}
            className="text-sm text-[#a89880] hover:text-[#6b5d4a] transition-colors px-2 py-2.5 min-h-[44px] flex items-center"
            aria-label="Guide"
          >
            ?
          </button>
          <button
            onClick={() => navigate("/history")}
            className="text-sm text-[#a89880] hover:text-[#6b5d4a] transition-colors px-2 py-2.5 min-h-[44px] flex items-center"
          >
            History
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="text-[#a89880] hover:text-[#6b5d4a] transition-colors p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
          {isPlanner && pendingApprovals > 0 && (
            <button
              onClick={() => setShowApprovals(true)}
              className="text-xs bg-[#514636] text-white px-2.5 py-2 rounded-full hover:bg-[#3a3128] transition-colors min-h-[44px] flex items-center"
            >
              {pendingApprovals} to review
            </button>
          )}
          {isPlanner && (
            <button
              onClick={() => setShowLearnings(true)}
              className="text-sm text-[#c8bba8] hover:text-[#8a7a62] transition-colors px-2 py-2.5 min-h-[44px] flex items-center"
              title="Trip learnings"
            >
              Learnings
            </button>
          )}
          <button onClick={() => navigate("/profile")} className="text-sm text-[#8a7a62] hover:text-[#514636] transition-colors underline decoration-dotted underline-offset-2 px-1 py-2.5 min-h-[44px] flex items-center">{user?.displayName}</button>
          <button onClick={logout} className="text-sm text-[#a89880] hover:text-[#6b5d4a] transition-colors px-1 py-2.5 min-h-[44px] flex items-center">
            Sign out
          </button>
          <button
            onClick={() => setShowActions(true)}
            className="text-[#a89880] hover:text-[#6b5d4a] transition-colors p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Actions"
            title="What's happening"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          </button>
        </div>

        {/* Edit trip form */}
        {editingTrip && (
          <div className="mb-6 p-4 bg-white rounded-lg border border-[#e0d8cc] space-y-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full text-lg font-light text-[#3a3128] border-b border-[#e0d8cc]
                         focus:outline-none focus:border-[#a89880] bg-transparent"
            />
            <input
              type="text"
              value={editTagline}
              onChange={(e) => setEditTagline(e.target.value)}
              placeholder="Trip tagline"
              className="w-full text-sm text-[#6b5d4a] border-b border-[#e0d8cc]
                         focus:outline-none focus:border-[#a89880] bg-transparent placeholder-[#c8bba8]"
            />
            <p className="text-sm text-[#a89880]">
              Dates are set automatically from your city schedules
            </p>
            <div className="flex gap-2">
              <button onClick={handleSaveTrip} disabled={savingTrip}
                className="px-3 py-1 text-xs bg-[#514636] text-white rounded hover:bg-[#3a3128] disabled:opacity-40">
                {savingTrip ? "Saving..." : "Save"}
              </button>
              <button onClick={() => setEditingTrip(false)}
                className="px-3 py-1 text-sm text-[#8a7a62] hover:text-[#3a3128]">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Sync alert — planner-only, shows conflicts/errors with PWA badge */}
        <SyncAlert />

        {/* Actions panel (full screen overlay) */}
        {showActions && <ActionsPanel tripId={trip.id} onClose={() => setShowActions(false)} decisions={openDecisions} userCode={user?.code || ""} onNavigate={(path) => { setShowActions(false); navigate(path); }} />}

        {/* Decisions moved to Actions panel — overview stays clean */}

        {/* [REMOVED: decision nudge cards — they now live in the Actions panel] */}
        {false && openDecisions.length > 0 && (
          <div className="mb-4 space-y-2">
            {openDecisions.map((dec) => {
              const myVote = dec.votes.find((v) => v.userCode === user?.code);
              const totalVotes = new Set(dec.votes.map((v) => v.userCode)).size;
              const totalThoughts = dec.options.reduce((s, o) => s + (o.notes?.length || 0), 0);
              return (
                <button
                  key={dec.id}
                  onClick={() => navigate(`/plan?city=${dec.cityId}`)}
                  className="w-full text-left p-3 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-amber-600 text-sm">●</span>
                    <span className="text-sm font-medium text-[#3a3128]">{dec.title}</span>
                  </div>
                  <div className="text-xs text-[#8a7a62] ml-5">
                    {dec.options.length} option{dec.options.length !== 1 ? "s" : ""}
                    {totalVotes > 0 && ` · ${totalVotes} weighing in`}
                    {totalThoughts > 0 && ` · ${totalThoughts} thought${totalThoughts !== 1 ? "s" : ""} shared`}
                    {myVote ? "" : " — your turn?"}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Post-import orientation — below decisions so first-time collaborators see voting first */}
        {!localStorage.getItem("wander:overview-oriented") && experiences.length > 0 && (
          <div className="mb-4 p-3 bg-white rounded-lg border border-[#e0d8cc] text-sm">
            <p className="font-medium text-[#3a3128] mb-1.5">Quick start</p>
            <ul className="text-[#6b5d4a] space-y-0.5 list-none">
              {!window.matchMedia("(display-mode: standalone)").matches && (
                <li>• <strong>Save to phone:</strong> tap Share → Add to Home Screen</li>
              )}
              <li>• Tap any day below to see your map and what's planned</li>
              <li>• The chat bubble is <strong>Scout</strong> — ask questions or rearrange plans</li>
            </ul>
            <button
              onClick={() => { localStorage.setItem("wander:overview-oriented", "1"); loadTrips(); }}
              className="text-xs text-[#c8bba8] hover:text-[#6b5d4a] mt-1.5 transition-colors"
            >
              got it
            </button>
          </div>
        )}

        {/* Calendar / At-a-Glance toggle */}
        {tripPhase !== "past" && (trip.datesKnown !== false ? (
          <HomeViewToggle
            days={days}
            cities={trip.cities}
            selectedPerDay={selectedPerDay}
            backroadsDays={backroadsDays}
            experiences={experiences}
            routeSegments={trip.routeSegments || []}
            accommodations={trip.accommodations || []}
            decisions={openDecisions}
            onDayClick={(cityId) => navigate(`/plan?city=${cityId}`)}
            onCityClick={(cityId) => navigate(`/plan?city=${cityId}`)}
          />
        ) : (
          <DatelessTripView
            cities={trip.cities}
            days={days}
            onCityClick={(cityId) => navigate(`/city/${cityId}`)}
          />
        ))}

        {/* Scout briefing — below the calendar per Ken's 2-line rule */}
        <GroupPulse
          trip={trip}
          experiences={experiences}
          days={days}
          openDecisions={openDecisions}
          userCode={user?.code || ""}
          onNavigate={(path) => navigate(path)}
        />

        {/* Primary action — go plan */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => navigate("/plan")}
            className="flex-1 py-3 rounded-lg bg-[#514636] text-white text-sm font-medium hover:bg-[#3a3128] transition-colors"
          >
            Day by Day
          </button>
          {isWithinDates && (
            <button
              onClick={() => navigate("/now")}
              className="px-4 py-3 rounded-lg bg-[#6b5d4a] text-white text-sm font-medium hover:bg-[#514636] transition-colors"
            >
              Now
            </button>
          )}
        </div>

        {/* Add something */}
        <ImportCard tripId={trip.id} />

        {/* City browse links — quick access to each city's idea board */}
        {tripPhase !== "past" && trip.datesKnown !== false && (() => {
          const datedCityIds = [...new Set(days.map(d => d.cityId))];
          const datedCities = (trip.cities || []).filter(c => datedCityIds.includes(c.id));
          if (datedCities.length === 0) return null;
          return (
            <div className="mb-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">Explore by city</h3>
              <div className="flex flex-wrap gap-2">
                {datedCities.map(c => {
                  const cityExpCount = experiences.filter(e => e.cityId === c.id).length;
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/city/${c.id}`)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#f0ebe3] text-[#6b5d4a] hover:bg-[#e5ddd0] transition-colors"
                    >
                      {c.name}{cityExpCount > 0 ? ` · ${cityExpCount} ideas` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Phase-aware content — adapts to trip lifecycle */}
        <TripPhaseContent
          phase={tripPhase}
          trip={trip}
          days={days}
          experiences={experiences}
        />

        {/* Route segments — intercity travel logistics */}
        <RouteSegmentsPanel
          tripId={trip.id}
          segments={trip.routeSegments ?? []}
          onRefresh={loadTrips}
        />

        {/* Candidate destinations — cities with no dates but with experiences */}
        <CandidateDestinations
          cities={trip.cities}
          experiences={experiences}
          onNavigate={(cityId) => navigate(`/city/${cityId}`)}
        />

        {/* Trip members & invite */}
        {trip && <TripMembers tripId={trip.id} />}

        {/* Activity feed — recent actions from the group */}
        {trip && <ActivityFeed tripId={trip.id} />}

        {/* Past trips removed — accessible via CreateTrip screen if needed */}
      </div>

      {/* Approval Queue Panel */}
      {trip && isPlanner && (
        <ApprovalQueue
          tripId={trip.id}
          isOpen={showApprovals}
          onClose={() => setShowApprovals(false)}
          onReviewed={() => {
            loadTrips();
            setPendingApprovals((p) => Math.max(0, p - 1));
          }}
        />
      )}

      {/* Learnings Panel */}
      {trip && isPlanner && user?.travelerId && (
        <LearningsPanel
          tripId={trip.id}
          travelerId={user.travelerId}
          isOpen={showLearnings}
          onClose={() => setShowLearnings(false)}
        />
      )}
    </div>
  );
}

// ── Map helpers (inner components, need useMap) ─────────────────

function OverviewFitter({ cities }: { cities: City[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const located = cities.filter((c) => c.latitude && c.longitude);
    if (located.length === 0) return;

    if (located.length === 1) {
      map.panTo({ lat: located[0].latitude!, lng: located[0].longitude! });
      map.setZoom(11);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    for (const c of located) {
      bounds.extend({ lat: c.latitude!, lng: c.longitude! });
    }
    map.fitBounds(bounds, 50);
  }, [map, cities]);

  return null;
}

function RoutePolyline({ cities }: { cities: City[] }) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;
    if (polylineRef.current) polylineRef.current.setMap(null);

    const path = cities
      .filter((c) => c.latitude && c.longitude)
      .map((c) => ({ lat: c.latitude!, lng: c.longitude! }));

    if (path.length < 2) return;

    const polyline = new google.maps.Polyline({
      path,
      strokeColor: "#a89880",
      strokeOpacity: 0.5,
      strokeWeight: 2,
      geodesic: true,
      map,
    });
    polylineRef.current = polyline;

    return () => { polyline.setMap(null); };
  }, [map, cities]);

  return null;
}

// ── Dateless trip view (city cards instead of calendar) ──────────

function DatelessTripView({
  cities,
  days,
  onCityClick,
}: {
  cities: City[];
  days: Day[];
  onCityClick: (cityId: string) => void;
}) {
  const visibleCities = cities.filter((c) => !c.hidden);
  const daysByCity = new Map<string, Day[]>();
  for (const d of days) {
    const arr = daysByCity.get(d.cityId) || [];
    arr.push(d);
    daysByCity.set(d.cityId, arr);
  }

  if (visibleCities.length === 0) {
    return (
      <div className="mb-6 text-center py-8">
        <p className="text-sm text-[#8a7a62] mb-2">Your trip is a blank canvas.</p>
        <p className="text-xs text-[#c8bba8]">Add cities below, or tell Scout what you're thinking.</p>
      </div>
    );
  }

  return (
    <section className="mb-6 space-y-2">
      <div className="text-xs text-[#a89880] uppercase font-medium mb-2">Your cities</div>
      {visibleCities.map((city, i) => {
        const cityDays = daysByCity.get(city.id) || [];
        const pastel = getCityPastel(visibleCities, city.id);
        return (
          <button
            key={city.id}
            onClick={() => onCityClick(city.id)}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-[#f0ece5] bg-white hover:border-[#e0d8cc] transition-colors text-left"
          >
            <div
              className="w-2 h-8 rounded-full shrink-0"
              style={{ backgroundColor: pastel }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#3a3128] truncate">{city.name}</div>
              <div className="text-xs text-[#a89880]">
                {cityDays.length > 0
                  ? `${cityDays.length} day${cityDays.length !== 1 ? "s" : ""}`
                  : "No days yet"
                }
                {city.country ? ` · ${city.country}` : ""}
              </div>
            </div>
            <span className="text-[#c8bba8] text-sm">→</span>
          </button>
        );
      })}
      <p className="text-xs text-[#c8bba8] text-center pt-2">
        When dates are ready, tell Scout: "Day 1 is December 25"
      </p>
    </section>
  );
}

// ── Group Pulse — "What's happening" Scout briefing ──────────────

function GroupPulse({
  trip, experiences, days, openDecisions, userCode, onNavigate,
}: {
  trip: Trip;
  experiences: Experience[];
  days: Day[];
  openDecisions: Decision[];
  userCode: string;
  onNavigate: (path: string) => void;
}) {
  const [actions, setActions] = useState<any[]>([]);

  useEffect(() => {
    if (trip?.id) {
      api.get<any[]>(`/sheets-sync/actions/${trip.id}`).then(setActions).catch(() => {});
    }
  }, [trip?.id]);

  // Build the briefing items
  const items: { text: string; detail: string; action: string; path: string }[] = [];

  // Planning actions — summarize as one line
  const openActions = actions.filter((a: any) => a.status === "open" && a.dueDate);
  if (openActions.length > 0) {
    const nearest = openActions[0];
    const summary = openActions.length === 1
      ? `${nearest.action} · by ${nearest.dueDate}`
      : `${openActions.length} things coming up — ${nearest.action} by ${nearest.dueDate}`;
    items.push({
      text: summary,
      detail: "",
      action: "",
      path: "/settings",
    });
  }

  // 1. Decisions where user hasn't voted
  const unvotedDecisions = openDecisions.filter(
    (d) => !d.votes.some((v) => v.userCode === userCode)
  );
  // Don't duplicate decisions already shown as cards above — only add non-decision items here

  // 2. Cities with activities user hasn't reacted to
  const cityIdToName = new Map<string, string>();
  for (const c of trip.cities) cityIdToName.set(c.id, c.name);

  const nonDecisionExps = experiences.filter((e) => e.state !== "voting");
  const byCity = new Map<string, { total: number; withMyInterest: number; contributors: Set<string> }>();

  for (const exp of nonDecisionExps) {
    if (!byCity.has(exp.cityId)) {
      byCity.set(exp.cityId, { total: 0, withMyInterest: 0, contributors: new Set() });
    }
    const bucket = byCity.get(exp.cityId)!;
    bucket.total++;
    bucket.contributors.add(exp.createdBy);
    // Check if user has expressed interest (we don't have interests loaded here,
    // but we can check sheetRowRef — if it has one, it came from spreadsheet/someone else)
  }

  // Aggregate city data into a single summary instead of one row per city
  let totalIdeas = 0;
  let citiesWithIdeas = 0;
  let othersContributed = false;
  let primaryContributor = "";
  const topCities: { name: string; count: number; cityId: string }[] = [];

  for (const [cityId, data] of byCity) {
    if (data.total === 0) continue;
    totalIdeas += data.total;
    citiesWithIdeas++;
    const cityName = cityIdToName.get(cityId) || "Unknown";
    topCities.push({ name: cityName, count: data.total, cityId });
    const others = [...data.contributors].filter((c) => c !== userCode);
    if (others.length > 0) {
      othersContributed = true;
      primaryContributor = others[0];
    }
  }

  // Sort by count, show top 3 as individual items, rest as summary
  topCities.sort((a, b) => b.count - a.count);

  if (totalIdeas > 0) {
    const topCity = topCities[0];
    const who = othersContributed ? `${primaryContributor} shared` : "";
    const summary = citiesWithIdeas === 1
      ? `${totalIdeas} idea${totalIdeas !== 1 ? "s" : ""} for ${topCity.name}`
      : `${totalIdeas} ideas across ${citiesWithIdeas} cities`;
    items.push({
      text: who ? `${who} ${summary}` : summary,
      detail: topCity ? `${topCity.name} has the most` : "",
      action: "Take a look",
      path: `/plan?city=${topCity.cityId}`,
    });
  }

  // 3. Days that are wide open (no selected experiences) in cities that have ideas
  const emptyDayCount = days.filter((d) => {
    const cityData = byCity.get(d.cityId);
    const hasIdeas = cityData && cityData.total > 0;
    const hasSelected = nonDecisionExps.some((e) => e.dayId === d.id && e.state === "selected");
    return hasIdeas && !hasSelected;
  }).length;

  if (emptyDayCount > 3) {
    items.push({
      text: `${emptyDayCount} days wide open`,
      detail: "Good time to start shaping the itinerary",
      action: "Build a day",
      path: "/plan",
    });
  }

  // Don't show if nothing to say
  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-xs text-[#8a7a62] mb-2">
        {items.some(i => i.action === "See your list") ? "Your Japan Guide is here" : "The group's been busy"}
      </p>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => onNavigate(item.path)}
            className="w-full text-left px-3 py-2.5 rounded-lg bg-[#faf8f5] border border-[#ebe5db] hover:bg-[#f5f0e8] transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-sm font-medium text-[#3a3128]">{item.text}</span>
                <span className="text-xs text-[#8a7a62] ml-1.5">{item.detail}</span>
              </div>
              <span className="text-xs text-[#a89880] shrink-0 ml-2">{item.action} →</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Trip Switcher List ──────────────────────────────────────────

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TripSwitcherList({
  trips, currentTripId, onSwitch, onDelete, onNewTrip, onRename,
}: {
  trips: Trip[];
  currentTripId: string;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onNewTrip: () => void;
  onRename: (id: string, newName: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const savingRef = useRef(false);

  async function saveName(tripId: string) {
    if (savingRef.current) return;
    const trimmed = editName.trim();
    if (!trimmed) { setEditingId(null); return; }
    savingRef.current = true;
    try {
      await api.patch(`/trips/${tripId}`, { name: trimmed });
      onRename(tripId, trimmed);
    } catch { /* ignore */ }
    setEditingId(null);
    savingRef.current = false;
  }

  // Sort by lastOpenedAt descending, nulls last
  const sorted = [...trips].sort((a, b) => {
    const aTime = (a as any).lastOpenedAt ? new Date((a as any).lastOpenedAt).getTime() : 0;
    const bTime = (b as any).lastOpenedAt ? new Date((b as any).lastOpenedAt).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <>
      <div className="px-4 pt-2 max-h-[50vh] overflow-y-auto">
        {sorted.map((t) => {
          const isCurrent = t.id === currentTripId;
          const syncAt = (t as any).sheetSyncConfig?.lastSyncAt;
          const openedAt = (t as any).lastOpenedAt;
          const createdAt = t.createdAt || (t as any).created_at;

          return (
            <div
              key={t.id}
              className={`py-3 border-b border-[#f0ece5] last:border-0 ${!isCurrent ? "cursor-pointer hover:bg-[#faf8f5]" : ""}`}
              onClick={() => !isCurrent && onSwitch(t.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {/* Name — largest, darkest, double-click to edit */}
                  {editingId === t.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => saveName(t.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveName(t.id); if (e.key === "Escape") setEditingId(null); }}
                      className="text-[15px] font-semibold text-[#3a3128] w-full border-b border-[#a89880] outline-none bg-transparent"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div
                      className="text-[15px] font-semibold text-[#3a3128] truncate cursor-text"
                      onDoubleClick={(e) => { e.stopPropagation(); setEditingId(t.id); setEditName(t.name); }}
                      title="Double-click to rename"
                    >
                      {t.name}
                      {isCurrent && <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Now</span>}
                    </div>
                  )}
                  {/* Metadata line — smaller, muted */}
                  <div className="text-[11px] text-[#a89880] mt-0.5 flex items-center gap-1 flex-wrap">
                    <span>Started {createdAt ? new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</span>
                    <span>·</span>
                    {syncAt ? (
                      <span className="text-[#6b5d4a] font-medium">Synced {timeAgo(syncAt)}</span>
                    ) : (
                      <span>No sync</span>
                    )}
                    <span>·</span>
                    <span>Opened {timeAgo(openedAt)}</span>
                  </div>
                </div>
                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                  className="text-[#d0c9be] hover:text-red-400 text-sm ml-2 mt-1 transition-colors"
                  title="Remove trip"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {/* New trip */}
      <div className="px-4 pt-3 pb-2">
        <button
          onClick={onNewTrip}
          className="w-full py-2.5 rounded-lg border border-dashed border-[#c8bba8] text-sm text-[#8a7a62] hover:bg-[#faf8f5] transition-colors"
        >
          + Plan a new trip
        </button>
      </div>
    </>
  );
}

// ── Home View Toggle (Calendar ↔ At a Glance) ──────────────────

function HomeViewToggle({
  days, cities, selectedPerDay, backroadsDays, experiences,
  routeSegments, accommodations, decisions,
  onDayClick, onCityClick,
}: {
  days: Day[];
  cities: City[];
  selectedPerDay: Record<string, number>;
  backroadsDays: Set<string>;
  experiences: Experience[];
  routeSegments: any[];
  accommodations: any[];
  decisions: Decision[];
  onDayClick: (cityId: string) => void;
  onCityClick: (cityId: string) => void;
}) {
  const [view, setView] = useState<"trip" | "details">(
    () => (localStorage.getItem("wander:home-view") as any) || "trip"
  );

  function toggleView(v: "trip" | "details") {
    setView(v);
    localStorage.setItem("wander:home-view", v);
  }

  return (
    <>
      {/* Calendar grid — transport icons always shown, no toggle needed */}
      <CalendarGrid
        days={days}
        cities={cities}
        selectedPerDay={selectedPerDay}
        backroadsDays={backroadsDays}
        experiences={experiences}
        onDayClick={onDayClick}
        showDetails={view === "details"}
        routeSegments={routeSegments}
        accommodations={accommodations}
        decisions={decisions}
      />
      {false && (
        <AtAGlanceView
          days={days}
          cities={cities}
          routeSegments={routeSegments}
          accommodations={accommodations}
          decisions={decisions}
          backroadsDays={backroadsDays}
          onCityClick={onCityClick}
        />
      )}
    </>
  );
}

// ── At a Glance — operational summary per city ──────────────────

function AtAGlanceView({
  days, cities, routeSegments, accommodations, decisions, backroadsDays, onCityClick,
}: {
  days: Day[];
  cities: City[];
  routeSegments: any[];
  accommodations: any[];
  decisions: Decision[];
  backroadsDays: Set<string>;
  onCityClick: (cityId: string) => void;
}) {
  // Guard against undefined arrays
  if (!cities?.length || !days?.length) return null;

  // Group days by city, in sequence order
  const sortedCities = [...cities].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  return (
    <section className="mb-6 space-y-2">
      {sortedCities.map((city) => {
        const cityDays = (days || [])
          .filter(d => d.cityId === city.id)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (cityDays.length === 0) return null;

        const arrival = new Date(cityDays[0].date);
        const departure = cityDays.length > 1 ? new Date(cityDays[cityDays.length - 1].date) : arrival;
        const nights = cityDays.length;
        const isBackroads = cityDays.some(d => backroadsDays.has(d.id));

        // Find transport to this city
        const segment = (routeSegments || []).find((s: any) =>
          s.destinationCity?.toLowerCase().includes(city.name.toLowerCase().substring(0, 4))
        );

        // Find accommodation
        const acc = (accommodations || []).find((a: any) => a.cityId === city.id);

        // Find hotel decision
        const hotelDecision = decisions.find(d =>
          d.cityId === city.id && d.title.toLowerCase().includes("hotel")
        );

        // Day highlights (non-empty notes)
        const highlights = cityDays
          .filter(d => d.notes && !d.notes.includes("TBD"))
          .map(d => d.notes!)
          .slice(0, 2);

        const pastel = getCityPastel(sortedCities, city.id);

        const arrivalStr = arrival.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const departureStr = departure.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const dateRange = nights === 1 ? arrivalStr : `${arrivalStr}–${departureStr}`;

        return (
          <button
            key={city.id}
            onClick={() => onCityClick(city.id)}
            className="w-full text-left rounded-xl border border-[#e8e0d4] hover:border-[#d0c9be] transition-colors overflow-hidden"
          >
            {/* City header bar — same color as calendar */}
            <div
              className="px-3 py-2 flex items-center justify-between"
              style={{ backgroundColor: pastel }}
            >
              <div>
                <span className="text-sm font-medium text-[#3a3128]">{city.name}</span>
                {isBackroads && <span className="ml-1.5 text-[10px] text-[#8a7a62]">🚐 Backroads</span>}
              </div>
              <span className="text-xs text-[#6b5d4a]">{dateRange} · {nights} night{nights !== 1 ? "s" : ""}</span>
            </div>

            {/* Details */}
            <div className="px-3 py-2 space-y-1 bg-white">
              {segment && (
                <div className="text-xs text-[#8a7a62]">
                  {segment.transportMode === "train" ? "🚃" : segment.transportMode === "flight" ? "✈️" : "🚐"}{" "}
                  From {segment.originCity}
                  {segment.departureTime ? ` · ${segment.departureTime}` : ""}
                </div>
              )}

              {acc ? (
                <div className="text-xs text-[#3a3128]">
                  🏨 {acc.name}
                </div>
              ) : hotelDecision ? (
                <div className="text-xs text-[#a89880]">
                  🏨 Deciding — {hotelDecision.options?.length} option{hotelDecision.options?.length !== 1 ? "s" : ""}
                </div>
              ) : null}

              {highlights.map((h, i) => (
                <div key={i} className="text-[11px] text-[#8a7a62] italic">{h}</div>
              ))}

              {!segment && !acc && !hotelDecision && highlights.length === 0 && (
                <div className="text-[11px] text-[#c8bba8]">Wide open</div>
              )}
            </div>
          </button>
        );
      })}
    </section>
  );
}

// ── Calendar grid (week view) ───────────────────────────────────

function CalendarGrid({
  days,
  cities,
  selectedPerDay,
  backroadsDays,
  experiences,
  onDayClick,
  showDetails,
  routeSegments,
  accommodations,
  decisions,
}: {
  days: Day[];
  cities: City[];
  selectedPerDay: Record<string, number>;
  backroadsDays: Set<string>;
  experiences: Experience[];
  onDayClick: (cityId: string) => void;
  showDetails?: boolean;
  routeSegments?: any[];
  accommodations?: any[];
  decisions?: Decision[];
}) {
  if (days.length === 0) return null;

  const sortedDays = [...days].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Group days into contiguous clusters (gaps > 7 days = new cluster)
  const clusters: Day[][] = [];
  let currentCluster: Day[] = [sortedDays[0]];
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1].date).getTime();
    const curr = new Date(sortedDays[i].date).getTime();
    const gapDays = (curr - prev) / 86400000;
    if (gapDays > 7) {
      clusters.push(currentCluster);
      currentCluster = [sortedDays[i]];
    } else {
      currentCluster.push(sortedDays[i]);
    }
  }
  clusters.push(currentCluster);

  return (
    <section className="mb-6">
      {clusters.map((cluster, ci) => (
        <CalendarCluster
          key={ci}
          clusterDays={cluster}
          allSortedDays={sortedDays}
          cities={cities}
          selectedPerDay={selectedPerDay}
          backroadsDays={backroadsDays}
          experiences={experiences}
          onDayClick={onDayClick}
          showDetails={showDetails}
          routeSegments={routeSegments}
          accommodations={accommodations}
        />
      ))}
    </section>
  );
}

// Theme → emoji mapping for calendar day cells
const DAY_THEME_EMOJI: Record<string, string> = {
  food: "🍜", temples: "⛩️", ceramics: "🏺", architecture: "🏛️",
  nature: "🌿", transport: "🚃", shopping: "🛍️", art: "🎨", nightlife: "🌙",
};

function CalendarCluster({
  clusterDays,
  allSortedDays,
  cities,
  selectedPerDay,
  backroadsDays,
  experiences,
  onDayClick,
  showDetails,
  routeSegments,
  accommodations,
}: {
  clusterDays: Day[];
  allSortedDays: Day[];
  cities: City[];
  selectedPerDay: Record<string, number>;
  backroadsDays: Set<string>;
  experiences: Experience[];
  onDayClick: (cityId: string) => void;
  showDetails?: boolean;
  routeSegments?: any[];
  accommodations?: any[];
}) {
  const firstDate = new Date(clusterDays[0].date);
  const lastDate = new Date(clusterDays[clusterDays.length - 1].date);

  // Find Monday on or before firstDate
  const startMon = new Date(firstDate);
  const dow = startMon.getUTCDay();
  const offsetToMon = dow === 0 ? 6 : dow - 1;
  startMon.setUTCDate(startMon.getUTCDate() - offsetToMon);

  // Find Sunday on or after lastDate
  const endSun = new Date(lastDate);
  const dowEnd = endSun.getUTCDay();
  if (dowEnd !== 0) endSun.setUTCDate(endSun.getUTCDate() + (7 - dowEnd));

  // Map date strings to day objects
  const dayMap = new Map<string, Day>();
  for (const d of clusterDays) {
    dayMap.set(new Date(d.date).toISOString().split("T")[0], d);
  }

  // Build week rows
  const weeks: (Day | null)[][] = [];
  const cursor = new Date(startMon);
  while (cursor <= endSun) {
    const week: (Day | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const key = cursor.toISOString().split("T")[0];
      week.push(dayMap.get(key) || null);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Month header
  const monthLabel = firstDate.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const endMonthLabel = lastDate.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const headerLabel = monthLabel === endMonthLabel
    ? monthLabel
    : `${firstDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })} — ${lastDate.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}`;

  return (
    <div className="mb-4">
      <div className="text-sm text-[#8a7a62] mb-2">{headerLabel}</div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayLabels.map((l) => (
          <div key={l} className="text-center text-xs font-medium text-[#a89880] uppercase">
            {l}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="grid gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day, di) => {
              if (!day) {
                return <div key={di} className="aspect-[3/4] rounded-lg bg-[#f5f3f0]" />;
              }

              const count = selectedPerDay[day.id] || 0;
              const isBackroads = backroadsDays.has(day.id);
              const cityColor = getCityPastel(cities, day.cityId);
              const globalIdx = allSortedDays.indexOf(day);
              const prevDay = globalIdx > 0 ? allSortedDays[globalIdx - 1] : null;
              const isTravel = prevDay && prevDay.cityId !== day.cityId;
              const prevColor = isTravel ? getCityPastel(cities, prevDay.cityId) : null;
              const dayNum = new Date(day.date).getUTCDate();
              const city = cities.find((c) => c.id === day.cityId);
              const mapUrl = city?.latitude && city?.longitude && API_KEY
                ? `https://maps.googleapis.com/maps/api/staticmap?center=${city.latitude},${city.longitude}&zoom=13&size=120x120&scale=2&maptype=roadmap&style=feature:all|element:labels.text|visibility:off&style=feature:all|saturation:-50&key=${API_KEY}`
                : null;

              // Darker accent for dots (darken the pastel)
              const dotColor = cityColor.replace(/F2|DE|EC|E6/g, (m: string) => {
                const map: Record<string, string> = { F2: "C0", DE: "A8", EC: "B8", E6: "B0" };
                return map[m] || m;
              });

              return (
                <button
                  key={day.id}
                  onClick={() => onDayClick(day.cityId)}
                  className="aspect-[3/4] rounded-lg flex flex-col items-center justify-center relative overflow-hidden hover:shadow-md transition-shadow"
                  style={{ backgroundColor: cityColor, borderLeft: `4px solid ${dotColor}` }}
                >
                  {mapUrl && (
                    <>
                      <img src={mapUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                      <div className="absolute inset-0" style={{ backgroundColor: cityColor, opacity: 0.25 }} />
                    </>
                  )}
                  {isBackroads && (
                    <span className="absolute top-0.5 right-0.5 z-20 font-bold text-white rounded-sm leading-none"
                      style={{ fontSize: 10, backgroundColor: "#c0392b", padding: "1px 3px" }}>B</span>
                  )}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="text-xs font-bold text-[#3a3128] bg-white/80 rounded px-1 leading-tight">
                      {dayNum}
                    </div>
                    <div className="text-xs text-[#3a3128] font-medium leading-tight bg-white/80 rounded px-1 text-center mt-0.5"
                      style={{ wordBreak: "break-word" }}>
                      {city?.name || ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Recent Activity Modal ────────────────────────────────────────

function RecentActivityButton({ activity }: { activity: ChangeLogEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mb-4 flex items-center gap-2 text-sm text-[#a89880] hover:text-[#6b5d4a] transition-colors"
      >
        <span>🔔</span>
        <span>{activity.length} recent changes</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="mx-4 max-w-md w-full bg-white rounded-xl shadow-xl p-4 max-h-[60vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#3a3128]">Recent Activity</h3>
              <button onClick={() => setOpen(false)} className="text-[#c8bba8] hover:text-[#8a7a62] text-lg">&times;</button>
            </div>
            <div className="space-y-2">
              {activity.map((log) => (
                <div key={log.id} className="px-3 py-2 bg-[#faf8f5] rounded-lg text-sm text-[#8a7a62]">
                  <span className="text-[#3a3128] font-medium">{log.userDisplayName}</span>
                  {" "}{log.description.replace(`${log.userDisplayName} `, "")}
                  <span className="text-[#c8bba8] ml-2">{formatRelativeTime(log.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Candidate Destinations ────────────────────────────────────────

function CandidateDestinations({
  cities,
  experiences,
  onNavigate,
}: {
  cities: City[];
  experiences: Experience[];
  onNavigate: (cityId: string) => void;
}) {
  const [expandedCity, setExpandedCity] = useState<string | null>(null);
  const [sectionExpanded, setSectionExpanded] = useState(() => {
    try { return localStorage.getItem("wander:candidates-expanded") === "true"; } catch { return false; }
  });

  // Candidate cities: no dates, but have experiences
  const candidateCities = cities.filter(
    (c) => !c.arrivalDate && !c.departureDate
  );

  // Count experiences per candidate city
  const expsByCity: Record<string, Experience[]> = {};
  for (const c of candidateCities) {
    expsByCity[c.id] = experiences.filter((e) => e.cityId === c.id);
  }

  // Only show cities that actually have experiences
  const visibleCities = candidateCities.filter((c) => (expsByCity[c.id]?.length || 0) > 0);

  if (visibleCities.length === 0) return null;

  // Group by tagline (which stores the region from recommendation import)
  const byRegion: Record<string, typeof visibleCities> = {};
  for (const c of visibleCities) {
    const region = c.tagline || "Other destinations";
    if (!byRegion[region]) byRegion[region] = [];
    byRegion[region].push(c);
  }

  const totalExps = visibleCities.reduce((sum, c) => sum + (expsByCity[c.id]?.length || 0), 0);

  return (
    <section className="mb-6">
      <button
        onClick={() => {
          const next = !sectionExpanded;
          setSectionExpanded(next);
          try { localStorage.setItem("wander:candidates-expanded", String(next)); } catch {}
        }}
        className="w-full text-left flex items-center justify-between mb-2"
      >
        <h2 className="text-sm font-medium text-[#3a3128]">
          Candidate Destinations
          <span className="ml-2 text-[#a89880] font-normal">{visibleCities.length} cities · {totalExps} ideas</span>
        </h2>
        <span className="text-sm text-[#a89880]">{sectionExpanded ? "\u25B4" : "\u25BE"}</span>
      </button>
      {!sectionExpanded ? null : (<>
      <p className="text-sm text-[#a89880] mb-3">
        Places to consider if you adjust your itinerary. Tap to browse suggestions.
      </p>
      {Object.entries(byRegion).map(([region, regionCities]) => (
        <div key={region} className="mb-3">
          <div className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1.5">
            {region}
          </div>
          <div className="space-y-1.5">
            {regionCities.map((city) => {
              const cityExps = expsByCity[city.id] || [];
              const isExpanded = expandedCity === city.id;
              return (
                <div key={city.id}>
                  <button
                    onClick={() => setExpandedCity(isExpanded ? null : city.id)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-white border border-[#f0ece5]
                               hover:border-[#a89880] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[#3a3128]">{city.name}</span>
                      <span className="text-sm text-[#a89880]">
                        {cityExps.length} suggestion{cityExps.length !== 1 ? "s" : ""}
                        <span className="ml-1">{isExpanded ? "\u25B4" : "\u25BE"}</span>
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="ml-3 mt-1 space-y-1 mb-2">
                      {cityExps.map((exp) => (
                        <div
                          key={exp.id}
                          className="px-3 py-2 rounded bg-[#faf8f5] border border-[#f0ece5]"
                        >
                          <div className="text-sm font-medium text-[#3a3128]">{exp.name}</div>
                          {exp.description && (
                            <div className="text-sm text-[#8a7a62] mt-0.5 whitespace-pre-line line-clamp-3">
                              {exp.description}
                            </div>
                          )}
                          {exp.sourceText && (
                            <div className="text-sm text-[#c8bba8] mt-1">
                              via {exp.sourceText}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      </>)}
    </section>
  );
}

// ── Trip Members & Invite ────────────────────────────────────────

function TripMembers({ tripId }: { tripId: string }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<{ displayName: string; role: string; travelerId: string }[]>([]);
  const [invites, setInvites] = useState<{ id: string; expectedName: string; claimed: boolean; inviteToken?: string }[]>([]);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [newNames, setNewNames] = useState("");
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState("");
  const isPlanner = user?.role === "planner";

  async function loadMembers() {
    try {
      const data = await api.get<{
        members: { displayName: string; role: string; travelerId: string }[];
        invites: { id: string; expectedName: string; claimed: boolean; inviteToken?: string }[];
        inviteToken: string | null;
      }>(`/trips/${tripId}/members`);
      setMembers(data.members);
      setInvites(data.invites);
      setInviteToken(data.inviteToken);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (expanded) loadMembers();
  }, [expanded, tripId]);

  async function handleInvite() {
    const names = newNames.split(",").map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    setSending(true);
    try {
      await api.post(`/trips/${tripId}/add-members`, { names });
      setNewNames("");
      loadMembers();
    } catch { /* ignore */ }
    setSending(false);
  }

  async function resetVaultPin(travelerId: string, name: string) {
    try {
      await api.post(`/vault/reset-pin/${travelerId}`, {});
      setResetMessage(`${name}'s vault PIN has been reset`);
      setResetConfirm(null);
      setTimeout(() => setResetMessage(""), 3000);
    } catch {
      setResetMessage("Couldn't reset PIN");
      setTimeout(() => setResetMessage(""), 3000);
    }
  }

  function copyPersonalLink(token: string, id: string) {
    const link = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  async function handleResend(inviteId: string) {
    try {
      await api.post(`/trips/${tripId}/resend-invite`, { inviteId });
      loadMembers();
    } catch { /* ignore */ }
  }

  const pendingInvites = invites.filter((i) => !i.claimed);

  return (
    <section className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center justify-between mb-2"
      >
        <h2 className="text-sm font-medium text-[#3a3128]">
          Travelers
          {members.length > 0 && (
            <span className="ml-2 text-[#a89880] font-normal">{members.length} members</span>
          )}
        </h2>
        <span className="text-sm text-[#a89880]">{expanded ? "\u25B4" : "\u25BE"}</span>
      </button>

      {expanded && (
        <div className="p-4 bg-white rounded-lg border border-[#e0d8cc] space-y-3">
          {/* Current members */}
          {members.length > 0 && (
            <div className="space-y-1.5">
              {members.map((m) => (
                <div
                  key={m.displayName}
                  className="flex items-center justify-between py-1.5 px-3 bg-[#f0ece5] rounded-lg"
                >
                  <span className="text-sm text-[#3a3128]">
                    {m.displayName}
                    {(m.role === "planner" || m.role === "owner") && (
                      <span className="ml-1 text-xs text-[#a89880]">(planner)</span>
                    )}
                  </span>
                  {isPlanner && m.travelerId !== user?.travelerId && (
                    <div className="flex items-center gap-1">
                      {resetConfirm === m.travelerId ? (
                        <>
                          <button
                            onClick={() => resetVaultPin(m.travelerId, m.displayName)}
                            className="text-xs text-red-600"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setResetConfirm(null)}
                            className="text-xs text-[#a89880]"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setResetConfirm(m.travelerId)}
                          className="text-xs text-[#a89880] hover:text-[#8a7a62]"
                        >
                          Reset PIN
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {resetMessage && (
            <p className="text-xs text-[#8a7a62] text-center">{resetMessage}</p>
          )}

          {/* Pending invites with personal links */}
          {pendingInvites.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-[#a89880] uppercase tracking-wider">
                Waiting to join
              </div>
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-1.5 px-3 bg-[#faf8f5] rounded-lg border border-[#f0ece5]">
                  <span className="text-sm text-[#3a3128]">{inv.expectedName}</span>
                  <div className="flex items-center gap-2">
                    {inv.inviteToken && (
                      <button
                        onClick={() => copyPersonalLink(inv.inviteToken!, inv.id)}
                        className="text-xs px-2 py-1 rounded bg-[#514636] text-white hover:bg-[#3a3128] transition-colors"
                      >
                        {copiedId === inv.id ? "Copied!" : "Copy link"}
                      </button>
                    )}
                    <button
                      onClick={() => handleResend(inv.id)}
                      className="text-xs text-[#a89880] hover:text-[#6b5d4a] transition-colors"
                    >
                      Resend
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add people */}
          <div>
            <label className="text-xs text-[#8a7a62] block mb-1">
              Who else is coming?
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newNames}
                onChange={(e) => setNewNames(e.target.value)}
                placeholder="Names, separated by commas"
                className="flex-1 px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white text-sm text-[#3a3128] focus:outline-none focus:ring-2 focus:ring-[#514636]/30 placeholder-[#c8bba8]"
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
              <button
                onClick={handleInvite}
                disabled={sending || !newNames.trim()}
                className="px-4 py-2 rounded-lg bg-[#514636] text-white text-sm hover:bg-[#3a3128] transition-colors disabled:opacity-50"
              >
                {sending ? "..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Utility functions ───────────────────────────────────────────

function formatNameList(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const d = Math.floor(hours / 24);
  return `${d}d ago`;
}
