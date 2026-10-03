import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import CreateTrip from "../components/CreateTrip";
import { useToast } from "../contexts/ToastContext";
import { getCityPastel } from "../components/MapCanvas";
import HomeTripMap from "../components/HomeTripMap";
import { tripCountryOf, cityAccent } from "../lib/cityColors";
import type { Trip, City, Day, Experience, ChangeLogEntry, Decision } from "../lib/types";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts";
import useBackToClose from "../hooks/useBackToClose";
import useUniversalCapture from "../hooks/useUniversalCapture";
import { getContributorColor, getContributorInitial } from "../lib/travelerProfiles";
import ContributorView from "../components/ContributorView";
import ApprovalQueue from "../components/ApprovalQueue";
import LearningsPanel from "../components/LearningsPanel";
import ActivityFeed from "../components/ActivityFeed";
import SheetNotesCard from "../components/SheetNotesCard";
import SyncAlert from "../components/SyncAlert";
import ActionsPanel from "../components/ActionsPanel";
import FaceIdSetup from "../components/FaceIdSetup";
import { warmGuideData } from "../lib/guideData";
import TripGlance from "../components/TripGlance";
import EveningQuestion from "../components/EveningQuestion";
import WelcomeOnce from "../components/WelcomeOnce";
import LeavingSoonCard from "../components/LeavingSoonCard";
import { guideOwnerOf } from "../lib/tellGuideOwner";
import { voiceFor } from "../lib/guideDisplay";
import { changeRest } from "../lib/changeWords";
import AddToHomeScreen, { isIPhoneSafari, isHomeScreenApp } from "../components/AddToHomeScreen";
import { signedInWithPasskeyHere } from "../lib/passkeys";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Module-level cache so return visits don't flash "Finding your trip..."
let _cachedTrip: Trip | null = null;
let _cachedDays: Day[] = [];
let _cachedExperiences: Experience[] = [];

// The phone's own copy of Home from the last good load: opens Home instantly, and keeps the trip
// on screen with no signal. Labelled with whose it is, so a phone switched to another person
// never shows the previous person's trip.
const SAVED_HOME_KEY = "wander:home-copy";
interface SavedHome { owner: string; savedAt: string; trip: Trip; days: Day[]; allTrips: Trip[] }

function homeOwner(): string {
  try { return localStorage.getItem("wander_user") || ""; } catch { return ""; }
}

function readSavedHome(): SavedHome | null {
  try {
    const raw = localStorage.getItem(SAVED_HOME_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedHome;
    return saved.owner && saved.owner === homeOwner() && saved.trip ? saved : null;
  } catch {
    return null;
  }
}

function saveHome(trip: Trip, days: Day[], allTrips: Trip[]) {
  try {
    const copy: SavedHome = { owner: homeOwner(), savedAt: new Date().toISOString(), trip, days, allTrips };
    localStorage.setItem(SAVED_HOME_KEY, JSON.stringify(copy));
  } catch { /* storage full or unavailable — the live load still works */ }
}

function savedAtWords(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return sameDay ? `today at ${time}` : `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${time}`;
}

export default function TripOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const [savedHome] = useState(() => (_cachedTrip ? null : readSavedHome()));
  const [trip, setTrip] = useState<Trip | null>(_cachedTrip || savedHome?.trip || null);
  const [allTrips, setAllTrips] = useState<Trip[]>(savedHome?.allTrips || []);
  const [days, setDays] = useState<Day[]>(_cachedTrip ? _cachedDays : savedHome?.days || []);
  const [experiences, setExperiences] = useState<Experience[]>(_cachedExperiences);
  const [loading, setLoading] = useState(!_cachedTrip && !savedHome);
  const [showCreate, setShowCreate] = useState(false);
  // When the last load couldn't reach Wander: the saved copy's time, "never" if there's no copy, null when fine
  const [unreachableSince, setUnreachableSince] = useState<string | null>(null);
  const [editingTrip, setEditingTrip] = useState(false);
  const [editName, setEditName] = useState("");
  const [editTagline, setEditTagline] = useState("");
  const [recentActivity, setRecentActivity] = useState<ChangeLogEntry[]>([]);
  const [showTripSwitcher, setShowTripSwitcher] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [contributorViewCode, setContributorViewCode] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showLearnings, setShowLearnings] = useState(false);
  const [showActions, setShowActions] = useState(false);
  // The phone's Back closes these panels instead of leaving Wander
  useBackToClose(showTripSwitcher, () => setShowTripSwitcher(false));
  useBackToClose(showActions, () => setShowActions(false));
  const [openDecisions, setOpenDecisions] = useState<Decision[]>([]);

  const isPlanner = user?.role === "planner";
  const initialLoadDone = useRef(false);

  useKeyboardShortcuts();
  useUniversalCapture(trip?.id);

  // Listen for bottom nav actions trigger (on Home), or arrive from another tab asking for it
  useEffect(() => {
    const handler = () => setShowActions(true);
    const close = () => setShowActions(false);
    window.addEventListener("wander-open-actions", handler);
    window.addEventListener("wander-close-actions", close);
    if ((location.state as { openActions?: boolean } | null)?.openActions) {
      setShowActions(true);
      navigate(".", { replace: true, state: null });
    }
    return () => { window.removeEventListener("wander-open-actions", handler); window.removeEventListener("wander-close-actions", close); };
  }, []);

  // Tell the tab bar when Actions is open, so Actions (not Home) is highlighted
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("wander:actions-panel", { detail: { open: showActions } }));
    return () => { window.dispatchEvent(new CustomEvent("wander:actions-panel", { detail: { open: false } })); };
  }, [showActions]);

  // Signal to BottomNav whether actions need attention
  useEffect(() => {
    const needsInput = openDecisions.filter(dec => !dec.votes.some(v => v.userCode === user?.code)).length > 0;
    (window as any).__actionsNeedAttention = needsInput;
    window.dispatchEvent(new CustomEvent("wander:actions-attention", { detail: { needsAttention: needsInput } }));
  }, [openDecisions, user?.code]);

  async function loadTrips(silent = false) {
    if (!silent) setLoading(true);
    let active: Trip | null;
    let all: Trip[];
    try {
      [active, all] = await Promise.all([
        api.get<Trip | null>("/trips/active"),
        api.get<Trip[]>("/trips"),
      ]);
      setUnreachableSince(null);
    } catch {
      // No signal (or the server didn't answer). Never conclude "no trip" from a failed request:
      // show the copy this phone kept from its last good load, and say so.
      const saved = readSavedHome();
      if (saved) {
        setTrip(saved.trip); _cachedTrip = saved.trip;
        setDays(saved.days); _cachedDays = saved.days;
        setAllTrips(saved.allTrips);
        setUnreachableSince(saved.savedAt);
      } else {
        setUnreachableSince("never");
      }
      setLoading(false);
      return;
    }
    try {

      // On first load, auto-select the best trip for this planner.
      // Priority: trip with the most recent sync (the one connected to Larisa's Guide).
      // Fallback: last-viewed trip from localStorage.
      // Final fallback: server's active trip.
      let effectiveActive = active;
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;

        // For planners: find the trip with the most recent sync
        const tripsWithSync = all.filter((t: any) => t.sheetSyncConfig?.lastSyncAt);
        if (tripsWithSync.length > 0) {
          const mostRecent = tripsWithSync.sort((a: any, b: any) =>
            new Date(b.sheetSyncConfig.lastSyncAt).getTime() - new Date(a.sheetSyncConfig.lastSyncAt).getTime()
          )[0];
          if (mostRecent.id !== active?.id) {
            try {
              const switched = await api.post<Trip>(`/trips/${mostRecent.id}/activate`, {});
              effectiveActive = switched;
              localStorage.setItem("wander:last-trip-id", mostRecent.id);
            } catch {
              // Fall through to localStorage logic
            }
          } else {
            localStorage.setItem("wander:last-trip-id", mostRecent.id);
          }
        } else {
          // No synced trips — use localStorage fallback (original behavior)
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
      }

      setTrip(effectiveActive);
      _cachedTrip = effectiveActive;
      setAllTrips(all);
      if (!effectiveActive) { setShowCreate(true); }
      else {
        // Fetch the Guide's day-by-day items now, so tapping a day opens at once
        warmGuideData(effectiveActive.id);
        const [d, e] = await Promise.all([
          api.get<Day[]>(`/days/trip/${effectiveActive.id}`),
          api.get<Experience[]>(`/experiences/trip/${effectiveActive.id}`),
        ]);
        setDays(d); _cachedDays = d;
        setExperiences(e); _cachedExperiences = e;
        saveHome(effectiveActive, d, all);
        try {
          const { logs } = await api.get<{ logs: ChangeLogEntry[]; total: number }>(`/change-logs/trip/${effectiveActive.id}?limit=50`);
          setRecentActivity(logs.slice(0, 5));
          // (A first-visit overlay — "X has already started the itinerary… everyone will see your
          // changes" — was removed: it covered Home on first open and wasn't true; the plan is Larisa's Guide.)
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
  /** "Oct 5–29, 2026" (or "Oct 25 – Nov 2, 2026" across months) */
  function shortRange(a: string, b: string) {
    const o = { timeZone: "UTC" } as const;
    const s = new Date(a), e = new Date(b);
    const sm = s.toLocaleDateString("en-US", { month: "short", ...o }), em = e.toLocaleDateString("en-US", { month: "short", ...o });
    return sm === em
      ? `${sm} ${s.getUTCDate()}–${e.getUTCDate()}, ${e.getUTCFullYear()}`
      : `${sm} ${s.getUTCDate()} – ${em} ${e.getUTCDate()}, ${e.getUTCFullYear()}`;
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
  // The map is the trip's country — the city you fly from (San Francisco) would shrink Japan to a speck (Oct 1 2026)
  const tripCountry = tripCountryOf(cities);
  const inTripCountry = (c: City) => !tripCountry || !c.country || c.country === tripCountry;
  const cityMarkers = useMemo(() => {
    if (!cities.length || !days.length) return [];
    const sortedDays = [...days].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Build visit sequence: each city transition = new visit number
    const visits: { cityId: string; visitNumber: number }[] = [];
    let lastCityId: string | null = null;
    let visitCount = 0;
    // (only cities the map shows are counted — numbers run 1, 2, 3… with no gaps for the city you fly from or one whose
    // place isn't confirmed; Oct 1 2026)
    const onMap = (id: string) => { const c = cities.find((x) => x.id === id); return !!c && !!c.latitude && !!c.longitude && !c.hidden && inTripCountry(c); };
    for (const day of sortedDays) {
      if (day.cityId && day.cityId !== lastCityId && onMap(day.cityId)) {
        visitCount++;
        visits.push({ cityId: day.cityId, visitNumber: visitCount });
        lastCityId = day.cityId;
      }
    }

    // Group by city: collect all visit numbers for each city
    const cityMap = new Map<string, { city: City; visitNumbers: number[] }>();
    for (const { cityId, visitNumber } of visits) {
      const city = cities.find((c) => c.id === cityId);
      if (!city || !city.latitude || !city.longitude || city.hidden || !inTripCountry(city)) continue;
      const existing = cityMap.get(cityId);
      if (existing) {
        existing.visitNumbers.push(visitNumber);
      } else {
        cityMap.set(cityId, { city, visitNumbers: [visitNumber] });
      }
    }
    return Array.from(cityMap.values());
  }, [days, cities]);

  // Face ID set up on this phone (now or before) → the Home Screen step can follow
  const [faceIdHere, setFaceIdHere] = useState(signedInWithPasskeyHere);
  // In iPhone Safari (not the Home Screen app): where someone new sets up this phone
  const [settingUpHere] = useState(() => isIPhoneSafari() && !isHomeScreenApp());
  useEffect(() => {
    const on = () => setFaceIdHere(true);
    window.addEventListener("wander:faceid-ready", on);
    return () => window.removeEventListener("wander:faceid-ready", on);
  }, []);

  // Unlocking the phone in the morning redraws Home, so the calendar rings today — not yesterday
  const [, setWakeTick] = useState(0);
  useEffect(() => {
    const bump = () => { if (document.visibilityState === "visible") setWakeTick((n) => n + 1); };
    document.addEventListener("visibilitychange", bump);
    window.addEventListener("focus", bump);
    const every = setInterval(() => setWakeTick((n) => n + 1), 60000);
    return () => { document.removeEventListener("visibilitychange", bump); window.removeEventListener("focus", bump); clearInterval(every); };
  }, []);

  // Coming back to Home (Back from a day) lands where you left it: App.tsx's ScrollKeeper does that for every screen.

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#6b5d4a] bg-[#faf8f5]">
        Finding your trip...
      </div>
    );
  }

  // Couldn't reach Wander and there's no copy on this phone yet: say so — never offer a new trip
  if (!trip && unreachableSince) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#faf8f5] p-6 text-center">
        <p className="text-base text-[#3a3128] mb-1">Wander can't reach the trip right now.</p>
        <p className="text-sm text-[#6b5d4a] mb-5">It looks like there's no signal. Once this phone has opened the trip with a signal, it keeps a copy for times like this.</p>
        <button onClick={() => loadTrips()} className="min-h-[44px] px-5 rounded-xl bg-[#514636] text-white text-sm">Try again</button>
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
  // The trip menu lists real trips — ones read from Larisa's Guide — not April's placeholder or test trips
  const menuTrips = allTrips.filter((t) => t.id === trip?.id || /^From Larisa's Guide/.test(t.tagline || ""));
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

  // The cities the Home map shows: located, in the trip's country (not the city you fly from), not hidden
  const mapCities = cities.filter((c) => c.latitude && c.longitude && !c.hidden && inTripCountry(c));
  const hasMap = API_KEY && cityMarkers.length > 0;

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-20">
      {/* Trip switcher bottom sheet */}
      {showTripSwitcher && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm"
          onClick={() => setShowTripSwitcher(false)}>
          <div
            className="w-full sm:max-w-md sm:mx-4 bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            <div className="px-4 pt-4 pb-2 border-b border-[#f0ece5] flex items-center justify-between">
              <h3 className="text-sm font-medium text-[#3a3128]">Your Trips</h3>
              <button onClick={() => setShowTripSwitcher(false)} aria-label="Close" className="min-h-[44px] min-w-[44px] text-[#6b5d4a] hover:text-[#6b5d4a] text-lg">&times;</button>
            </div>
            {/* All trips — sorted by last opened */}
            <TripSwitcherList
              trips={menuTrips}
              currentTripId={trip.id}
              onSwitch={handleSwitchTrip}
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
        <div>
          {/* The trip's cities in order; a tap opens a city's first day (charm item C1) */}
          <HomeTripMap tripId={trip.id} cities={mapCities} allCities={cities} days={days}
            onOpenDay={(d) => navigate(`/day/${d}`)} />
          {/* The trip's name, below the map — over it, it hid the map's lower part and Google's logo and credit */}
          <div className="px-4 pt-3">
            <div className="max-w-2xl mx-auto">
              <button
                onClick={() => showSwitcherArrow && setShowTripSwitcher(true)}
                className="text-left group min-h-[44px]"
              >
                <h1 className="text-2xl font-light text-[#3a3128] inline">
                  {trip.name}
                </h1>
                {showSwitcherArrow && (
                  <span className="ml-2 text-[#6b5d4a] group-hover:text-[#514636] transition-colors text-base">&#9662;</span>
                )}
              </button>
              {trip.tagline && (
                // Where it comes from, to the person looking — without her copy's file name, which repeated the
                // trip's name just above it (map review, Oct 1 2026)
                <p className="text-sm text-[#6b5d4a] italic">{/^From Larisa's Guide/.test(trip.tagline)
                  ? (voiceFor(user?.displayName).mine ? "From your Guide" : "From Larisa's Guide") : trip.tagline}</p>
              )}
              <p className="text-sm text-[#6b5d4a] mt-1">
                {/* Just the trip's dates: the Today card says where each person is in it (Julie's trip
                    starts later than Ken's; a "Day 12 of 25" count was wrong for her and went stale overnight) */}
                {trip.startDate && trip.endDate ? (
                  <>{formatDate(trip.startDate)} — {formatDate(trip.endDate)}</>
                ) : (
                  <span>{days.length} days planned · Dates TBD</span>
                )}
              </p>
              {/* A stop the map can't show, said plainly — Shirakabeso was simply missing while the calendar showed it
                  (tester t2) */}
              {cities.filter((c) => !c.hidden && inTripCountry(c) && (!c.latitude || !c.longitude) && days.some((d) => d.cityId === c.id)).map((c) => {
                const ds = days.filter((d) => d.cityId === c.id).map((d) => d.date.slice(0, 10)).sort();
                const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
                return (
                  <p key={c.id} className="text-xs text-[#6b5d4a] mt-1">
                    {c.name} ({fmt(ds[0])}{ds.length > 1 ? `–${fmt(ds[ds.length - 1]).replace(/^[A-Za-z]+ /, "")}` : ""}) isn't on the map — Wander doesn't know exactly where it is yet.
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 pt-6 pb-36">{/* room at the bottom so nothing ends under the tab bar or Scout's bubble */}
        {/* Header and controls in one row, so Today starts near the top (delight audit: the trip's name, its source and
            its dates took a third of a small screen before Today; the designer and Andy both flagged it) */}
        <div className="flex items-center gap-1 mb-3">
          {!hasMap && (
            <button
              onClick={() => showSwitcherArrow && setShowTripSwitcher(true)}
              className="text-left group min-h-[44px] mr-auto min-w-0"
            >
              <h1 className="text-lg font-normal text-[#3a3128] inline">{trip.name}</h1>
              {showSwitcherArrow && (
                <span className="ml-1 text-[#6b5d4a] group-hover:text-[#514636] transition-colors text-sm">&#9662;</span>
              )}
              <span className="block text-xs text-[#6b5d4a]">
                {trip.startDate && trip.endDate ? shortRange(trip.startDate, trip.endDate) : `${days.length} days planned · Dates TBD`}
              </span>
            </button>
          )}
          {hasMap && <span className="mr-auto" />}
          <button
            onClick={() => navigate("/guide")}
            className="text-sm text-[#6b5d4a] hover:text-[#3a3128] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="How Wander works"
          >
            <span className="w-6 h-6 rounded-full border border-[#c8bba8] flex items-center justify-center text-xs">?</span>
          </button>
          <button
            onClick={() => navigate("/history")}
            className="text-sm text-[#6b5d4a] hover:text-[#6b5d4a] transition-colors px-2 py-2.5 min-h-[44px] flex items-center"
          >
            History
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="text-[#6b5d4a] hover:text-[#6b5d4a] transition-colors p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
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
          
          <button onClick={() => navigate("/profile")} className="text-sm text-[#6b5d4a] hover:text-[#514636] transition-colors underline decoration-dotted underline-offset-2 px-1 py-2.5 min-h-[44px] min-w-[44px] justify-center flex items-center">{user?.displayName}</button>
          {/* (no ☑ here — the Actions tab below opens the same list; delight audit: an unlabelled second way in) */}
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
            <p className="text-sm text-[#6b5d4a]">
              Dates are set automatically from your city schedules
            </p>
            <div className="flex gap-2">
              <button onClick={handleSaveTrip} disabled={savingTrip}
                className="px-3 py-1 text-xs bg-[#514636] text-white rounded hover:bg-[#3a3128] disabled:opacity-40">
                {savingTrip ? "Saving..." : "Save"}
              </button>
              <button onClick={() => setEditingTrip(false)}
                className="px-3 py-1 text-sm text-[#6b5d4a] hover:text-[#3a3128]">
                Cancel
              </button>
            </div>
          </div>
        )}


        {/* Sync alert — planner-only, shows conflicts/errors with PWA badge */}
        <SyncAlert />

        {/* Actions panel (full screen overlay) — subtitle reads sync source from tagline */}
        {showActions && <ActionsPanel tripId={trip.id} onClose={() => setShowActions(false)} decisions={openDecisions} userCode={user?.code || ""} onNavigate={(path) => { setShowActions(false); navigate(path); }} syncSourceName={trip.tagline?.match(/^Synced with (.+?)(?:\s*·.*)?$/)?.[1]} />}

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
                  <div className="text-xs text-[#6b5d4a] ml-5">
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

        {/* What the Guide says matters now — today, tomorrow, deadlines (or the start / welcome home) */}
        {unreachableSince && unreachableSince !== "never" && (
          <p className="mb-3 text-sm text-[#6b5d4a] bg-white/70 border border-[#e0d8cc] rounded-lg px-3 py-2" role="status">
            No signal — showing what this phone saved {savedAtWords(unreachableSince)}.
          </p>
        )}
        <WelcomeOnce owner={guideOwnerOf(trip.tagline)} />
        {/* Before Julie and Andy leave home: the days left and a fact a day (and Ken's preview of it) — not while
            someone new is setting up Face ID, the step that matters more */}
        {trip && <LeavingSoonCard tripId={trip.id} hold={settingUpHere} />}
        {/* Someone new, in iPhone Safari from their invite: Face ID first, then the Home Screen icon — at the top,
            where it can't be missed (Oct 2: Larisa's icon, added first, opened signed out with no Face ID to use; a
            Face ID key made here in Safari is the one the Home Screen app signs in with — proven on her iPhone) */}
        {settingUpHere && <FaceIdSetup variant="card" />}
        {settingUpHere && faceIdHere && <AddToHomeScreen variant="card" />}
        {/* Scout's evening question — after 6 PM on a trip day, once (Oct 1 2026) */}
        <EveningQuestion tripId={trip?.id} className="mb-3" />
        <TripGlance tripId={trip.id} />

        {/* Elsewhere, the Face ID offer sits right under Today — it only shows until it's set up or dismissed. Above
            Today it arrived a moment late and shoved the day's plan half a screen down (round 6). */}
        {!settingUpHere && <FaceIdSetup variant="card" />}

        {/* Calendar / At-a-Glance toggle — after the trip too: it's how anyone finds "that place on the 16th"
            (round 9: Home after the trip had no calendar, and the Guide's note still said "the days above") */}
        {(trip.datesKnown !== false ? (
          <HomeViewToggle
            days={days}
            cities={trip.cities}
            selectedPerDay={selectedPerDay}
            backroadsDays={backroadsDays}
            experiences={experiences}
            routeSegments={trip.routeSegments || []}
            accommodations={trip.accommodations || []}
            decisions={openDecisions}
            onDayClick={(cityId, dayId) => {
              // Tapping a day opens that day
              const day = dayId ? days.find((d) => d.id === dayId) : null;
              if (day) navigate(`/day/${day.date.slice(0, 10)}`);
              else navigate(`/plan?city=${cityId}`);
            }}
            onCityClick={(cityId) => navigate(`/plan?city=${cityId}`)}
          />
        ) : (
          <DatelessTripView
            cities={trip.cities}
            days={days}
            onCityClick={(cityId) => navigate(`/city/${cityId}`)}
          />
        ))}

        {/* Larisa's original tabs — the Guide's own words, for anyone who wants the source */}
        {trip && <SheetNotesCard tripId={trip.id} />}

        {/* People on this trip — who's in, and sending someone their link */}
        <button
          onClick={() => navigate("/people")}
          className="w-full min-h-[52px] mb-4 flex items-center justify-between px-4 rounded-xl bg-white border border-[#e0d8cc] text-left"
        >
          <span>
            <span className="block text-sm text-[#3a3128]">People on this trip</span>
            <span className="block text-xs text-[#6b5d4a] mt-0.5">{isPlanner ? "Who's in, and letting someone in" : "Who's on this trip"}</span>
          </span>
          <span className="text-[#6b5d4a]" aria-hidden>›</span>
        </button>

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
        <p className="text-sm text-[#6b5d4a] mb-2">Your trip is a blank canvas.</p>
        <p className="text-xs text-[#6b5d4a]">Add cities below, or tell Scout what you're thinking.</p>
      </div>
    );
  }

  return (
    <section className="mb-6 space-y-2">
      <div className="text-xs text-[#6b5d4a] uppercase font-medium mb-2">Your cities</div>
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
              <div className="text-xs text-[#6b5d4a]">
                {cityDays.length > 0
                  ? `${cityDays.length} day${cityDays.length !== 1 ? "s" : ""}`
                  : "No days yet"
                }
                {city.country ? ` · ${city.country}` : ""}
              </div>
            </div>
            <span className="text-[#6b5d4a] text-sm">→</span>
          </button>
        );
      })}
      <p className="text-xs text-[#6b5d4a] text-center pt-2">
        When dates are ready, tell Scout: "Day 1 is December 25"
      </p>
    </section>
  );
}


function TripSwitcherList({
  trips, currentTripId, onSwitch, onRename,
}: {
  trips: Trip[];
  currentTripId: string;
  onSwitch: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}) {
  const { user } = useAuth();
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
                  {/* Tagline — shows the sync source so planners can tell trips apart */}
                  {t.tagline && (
                    // Where it comes from, to the person looking — without her copy's file name (delight audit)
                    <p className="text-[11px] text-[#6b5d4a] italic truncate mt-0.5">{/^From Larisa's Guide/.test(t.tagline)
                      ? (voiceFor(user?.displayName).mine ? "From your Guide" : "From Larisa's Guide") : t.tagline}</p>
                  )}
                  {/* Metadata line — smaller, muted */}
                  {/* The trip's own dates, and how fresh Wander's copy of the Guide is */}
                  <div className="text-xs text-[#6b5d4a] mt-0.5 flex items-center gap-1 flex-wrap">
                    {t.startDate && t.endDate && (
                      <span>{new Date(t.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – {new Date(t.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>
                    )}
                    {/* (no "Guide read …" here: it was an old sync setting's time, a different moment from the copy
                        Wander reads — Home says that one; round 12 found three different dates) */}
                  </div>
                </div>
                {/* No delete button: removing a trip wipes every day, place, and its history,
                    with no undo. Too dangerous for a one-tap control. */}
              </div>
            </div>
          );
        })}
      </div>
      {/* No "+ Plan a new trip" here: a trip comes from Larisa's Guide now, and that button opened the old PDF-import
          screen with no way back but a reload (round 12). */}
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
  onDayClick: (cityId: string, dayId?: string) => void;
  onCityClick: (cityId: string) => void;
}) {
  const [view, setView] = useState<"trip" | "details">(
    () => (localStorage.getItem("wander:home-view") as any) || "trip"
  );
  const navigate = useNavigate();

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
      {/* What the "B" means, said once (round 9: it had no legend on screen) */}
      {backroadsDays.size > 0 && (
        <p className="text-xs text-[#6b5d4a] -mt-2 mb-3 flex items-center gap-1.5">
          <span className="font-bold text-white rounded-sm leading-none" style={{ fontSize: 10, backgroundColor: "#c0392b", padding: "1px 3px" }} aria-hidden>B</span>
          with Backroads
        </p>
      )}
      {/* Every day, stay, booked meal, flight, train and date to keep in mind, on one page — what the sheet did better
          (round 16) */}
      {days.length > 0 && (
        <button onClick={() => navigate("/whole-trip")} className="w-full min-h-[44px] -mt-1 mb-3 flex items-center justify-between px-3 rounded-xl bg-white border border-[#e0d8cc] text-left">
          <span className="text-sm text-[#3a3128]">The whole trip on one page<span className="block text-xs text-[#6b5d4a]">Every day, place to sleep, booked meal, flight and train</span></span>
          <span className="text-[#6b5d4a]" aria-hidden>›</span>
        </button>
      )}
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
                {isBackroads && <span className="ml-1.5 text-[10px] text-[#6b5d4a]">🚐 Backroads</span>}
              </div>
              <span className="text-xs text-[#6b5d4a]">{dateRange} · {nights} night{nights !== 1 ? "s" : ""}</span>
            </div>

            {/* Details */}
            <div className="px-3 py-2 space-y-1 bg-white">
              {segment && (
                <div className="text-xs text-[#6b5d4a]">
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
                <div className="text-xs text-[#6b5d4a]">
                  🏨 Deciding — {hotelDecision.options?.length} option{hotelDecision.options?.length !== 1 ? "s" : ""}
                </div>
              ) : null}

              {highlights.map((h, i) => (
                <div key={i} className="text-[11px] text-[#6b5d4a] italic">{h}</div>
              ))}

              {!segment && !acc && !hotelDecision && highlights.length === 0 && (
                <div className="text-[11px] text-[#6b5d4a]">Wide open</div>
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
  onDayClick: (cityId: string, dayId?: string) => void;
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
  onDayClick: (cityId: string, dayId?: string) => void;
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
  // The phone's own calendar date, to ring today's square
  const now = new Date();
  const phoneTodayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Month header
  const monthLabel = firstDate.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const endMonthLabel = lastDate.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const headerLabel = monthLabel === endMonthLabel
    ? monthLabel
    : `${firstDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })} — ${lastDate.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}`;

  return (
    <div className="mb-4">
      <div className="text-sm text-[#6b5d4a] mb-2">{headerLabel}</div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayLabels.map((l) => (
          <div key={l} className="text-center text-xs font-medium text-[#6b5d4a] uppercase">
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

              // Darker accent for dots (the shared rule — this copy turned the rose city's dots green)
              const dotColor = cityAccent(cityColor);

              const dayKey = new Date(day.date).toISOString().slice(0, 10);
              const isToday = dayKey === phoneTodayKey;
              return (
                <button
                  key={day.id}
                  onClick={() => onDayClick(day.cityId, day.id)}
                  aria-label={`${new Date(day.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}, ${city?.name || ""}${isBackroads ? ", with Backroads" : ""}${isToday ? ", today" : ""}`}
                  aria-current={isToday ? "date" : undefined}
                  className={`aspect-[3/4] rounded-lg flex flex-col items-center justify-center relative overflow-hidden hover:shadow-md transition-shadow ${isToday ? "ring-2 ring-[#514636] ring-offset-1 ring-offset-[#faf8f5]" : ""}`}
                  style={{ backgroundColor: cityColor, borderLeft: `4px solid ${dotColor}` }}
                >
                  {mapUrl && (
                    <>
                      <img src={mapUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                      <div className="absolute inset-0" style={{ backgroundColor: cityColor, opacity: 0.25 }} />
                    </>
                  )}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="text-xs font-bold text-[#3a3128] bg-white/80 rounded px-1 leading-tight whitespace-nowrap">
                      {dayNum}
                      {/* Beside the date, never over it (round 9: at large text the corner "B" covered the digit: "2B") */}
                      {isBackroads && (
                        <span className="ml-0.5 font-bold text-white rounded-sm leading-none align-middle"
                          style={{ fontSize: 10, backgroundColor: "#c0392b", padding: "1px 3px" }} aria-hidden>B</span>
                      )}
                    </div>
                    {/* A tile fits about six letters: known short forms, else a long name breaks between syllables with a hyphen */}
                    <div className="text-[11px] text-[#3a3128] font-medium leading-tight bg-white/80 rounded px-0.5 text-center mt-0.5 max-w-full" aria-hidden>
                      {tileLines(city?.name || "").map((w, i) => (
                        <span key={i} className="block max-w-full overflow-hidden whitespace-nowrap">{w}</span>
                      ))}
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

// ── Calendar tile names ──────────────────────────────────────────

const TILE_SHORT: Record<string, string[]> = { "san francisco": ["SF"], "los angeles": ["LA"] };
const VOWEL = /[aeiou]/i;

/**
 * A city name as lines that fit a calendar tile (about six letters each):
 * "Okayama" → ["Oka-", "yama"], "Shirakabeso" → ["Shira-", "kabeso"], "San Francisco" → ["SF"].
 * Breaks fall before a consonant that starts a syllable, as Japanese place names are read.
 */
export function tileLines(name: string): string[] {
  const known = TILE_SHORT[name.trim().toLowerCase()];
  if (known) return known;
  return name.split(" ").flatMap((w) => {
    if (w.length <= 6) return [w];
    let best = -1;
    for (let i = 2; i <= w.length - 3; i++) {
      // before a consonant + vowel ("Oka-yama"), or before ts/sh/ch + vowel ("Kara-tsu")
      const digraph = /^(ts|sh|ch)$/i.test(w.slice(i, i + 2)) && VOWEL.test(w[i + 2] || "");
      if (!VOWEL.test(w[i]) && (VOWEL.test(w[i + 1] || "") || digraph) && VOWEL.test(w[i - 1])) {
        if (best < 0 || Math.abs(i - w.length / 2) < Math.abs(best - w.length / 2)) best = i;
      }
    }
    if (best < 0) best = Math.ceil(w.length / 2);
    return [`${w.slice(0, best)}-`, w.slice(best)];
  });
}

// ── Recent Activity Modal ────────────────────────────────────────

function RecentActivityButton({ activity }: { activity: ChangeLogEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mb-4 flex items-center gap-2 text-sm text-[#6b5d4a] hover:text-[#6b5d4a] transition-colors"
      >
        <span>🔔</span>
        <span>{activity.length} recent changes</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="mx-4 max-w-md w-full bg-white rounded-xl shadow-xl p-4 max-h-[60vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#3a3128]">Recent Activity</h3>
              <button onClick={() => setOpen(false)} className="text-[#6b5d4a] hover:text-[#6b5d4a] text-lg">&times;</button>
            </div>
            <div className="space-y-2">
              {activity.map((log) => (
                <div key={log.id} className="px-3 py-2 bg-[#faf8f5] rounded-lg text-sm text-[#6b5d4a]">
                  <span className="text-[#3a3128] font-medium">{log.userDisplayName}</span>
                  {" "}{changeRest(log.userDisplayName, log.description)}
                  <span className="text-[#6b5d4a] ml-2">{formatRelativeTime(log.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
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
