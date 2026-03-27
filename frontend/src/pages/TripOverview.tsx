import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import CreateTrip from "../components/CreateTrip";
import { useToast } from "../contexts/ToastContext";
import { APIProvider, Map as GoogleMap, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { getCityPastel, CITY_PASTELS } from "../components/MapCanvas";
import type { Trip, City, Day, Experience, ChangeLogEntry } from "../lib/types";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts";
import useUniversalCapture from "../hooks/useUniversalCapture";
import RouteSegmentsPanel from "../components/RouteSegmentsPanel";
import { getContributorColor, getContributorInitial } from "../lib/travelerProfiles";
import ContributorView from "../components/ContributorView";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

export default function TripOverview() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
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

  useKeyboardShortcuts();
  useUniversalCapture(trip?.id);

  async function loadTrips() {
    setLoading(true);
    try {
      const [active, all] = await Promise.all([
        api.get<Trip | null>("/trips/active"),
        api.get<Trip[]>("/trips"),
      ]);
      setTrip(active);
      setAllTrips(all);
      if (!active) { setShowCreate(true); }
      else {
        const [d, e] = await Promise.all([
          api.get<Day[]>(`/days/trip/${active.id}`),
          api.get<Experience[]>(`/experiences/trip/${active.id}`),
        ]);
        setDays(d);
        setExperiences(e);
        try {
          const { logs } = await api.get<{ logs: ChangeLogEntry[]; total: number }>(`/change-logs/trip/${active.id}?limit=50`);
          setRecentActivity(logs.slice(0, 5));

          const welcomeKey = `wander:trip-welcomed:${active.id}:${user?.displayName}`;
          if (user && !localStorage.getItem(welcomeKey)) {
            const myEntries = logs.filter((l) => l.userDisplayName === user.displayName);
            if (myEntries.length === 0 && logs.length > 0) {
              const otherNames = [...new Set(logs.map((l) => l.userDisplayName))];
              if (otherNames.length > 0) {
                setCollabWelcome({ names: otherNames, tripName: active.name });
              }
            }
            localStorage.setItem(welcomeKey, "1");
          }
        } catch { /* ignore */ }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTrips(); }, []);

  useEffect(() => {
    const handler = () => { loadTrips(); };
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
      showToast("Trip updated");
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

  // Backroads days: continuous range from earliest to latest itinerary-imported day
  // NOTE: useMemo must be called before any early returns to maintain hook order
  const backroadsDays = useMemo(() => {
    if (!trip) return new Set<string>();
    const set = new Set<string>();
    const brDates: string[] = [];
    for (const exp of experiences) {
      if (exp.sourceText === "Imported from itinerary document" && exp.dayId) {
        const day = trip.days.find((d) => d.id === exp.dayId);
        if (day?.date) brDates.push(day.date);
      }
    }
    if (brDates.length === 0) return set;
    brDates.sort();
    const startDate = new Date(brDates[0]);
    const endDate = new Date(brDates[brDates.length - 1]);
    for (const day of trip.days) {
      const d = new Date(day.date);
      if (d >= startDate && d <= endDate) set.add(day.id);
    }
    return set;
  }, [experiences, trip]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#8a7a62] bg-[#faf8f5]">
        Loading...
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
            setShowCreate(false);
            loadTrips();
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
            loadTrips();
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
      setShowTripSwitcher(false);
      showToast("Switched trip");
      loadTrips();
    } catch {
      showToast("Couldn't switch — check your connection and try again", "error");
    }
  }

  const archivedTrips = allTrips.filter((t) => t.status === "archived");
  const isWithinDates = (() => {
    const now = new Date();
    return now >= new Date(trip.startDate) && now <= new Date(trip.endDate);
  })();

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

  // Derive visit order from the actual day sequence (not city arrivalDates).
  // Walk through days sorted by date. Each time the city changes, that's a new visit.
  // This correctly handles return visits (e.g., Kyoto Oct 5-7 then Kyoto Oct 20-23 = visits 2 and 8).
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
  const locatedCities = cities.filter((c) => c.latitude && c.longitude && c.arrivalDate && !c.hidden);
  const hasMap = API_KEY && cityMarkers.length > 0;

  return (
    <div className="min-h-screen bg-[#faf8f5]">
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
            {/* Active trip */}
            <div className="px-4 py-3 bg-[#faf8f5]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-[#3a3128]">{trip.name}</div>
                  <div className="text-xs text-[#8a7a62]">{formatDate(trip.startDate)} — {formatDate(trip.endDate)}</div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
              </div>
            </div>
            {/* Archived trips */}
            {archivedTrips.length > 0 && (
              <div className="px-4 pt-3">
                <div className="text-xs text-[#a89880] uppercase tracking-wider mb-2">Other Trips</div>
                <div className="space-y-2">
                  {archivedTrips.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2 border-b border-[#f0ece5] last:border-0">
                      <div>
                        <div className="text-sm text-[#3a3128]">{t.name}</div>
                        <div className="text-xs text-[#a89880]">
                          {formatDate(t.startDate)} — {formatDate(t.endDate)}
                          {t.cities?.length > 0 && ` · ${t.cities.length} cities`}
                        </div>
                      </div>
                      <button
                        onClick={() => handleSwitchTrip(t.id)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-[#514636] text-white hover:bg-[#3a3128] transition-colors"
                      >
                        Switch
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* New trip */}
            <div className="px-4 pt-3 pb-2">
              <button
                onClick={() => { setShowTripSwitcher(false); setShowCreate(true); }}
                className="w-full py-2.5 rounded-lg border border-dashed border-[#c8bba8] text-sm text-[#8a7a62] hover:bg-[#faf8f5] transition-colors"
              >
                + Plan a new trip
              </button>
            </div>
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
                <RoutePolyline cities={itineraryCities} />
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
                          className="flex items-center justify-center shadow-lg"
                          style={{
                            minWidth: 40,
                            height: 40,
                            padding: isMultiVisit ? "0 10px" : undefined,
                            borderRadius: isMultiVisit ? 20 : "50%",
                            backgroundColor: pastel,
                            borderWidth: 3,
                            borderColor: "white",
                            borderStyle: "solid",
                            boxShadow: `0 3px 10px rgba(0,0,0,0.3), 0 0 0 2px ${pastel}`,
                          }}
                        >
                          <span className="text-sm font-bold text-[#3a3128]">
                            {label}
                          </span>
                        </div>
                        <div className="mt-1 px-2 py-0.5 rounded bg-white/90 shadow-sm">
                          <span className="text-xs font-semibold text-[#3a3128]">{city.name}</span>
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
                onClick={() => archivedTrips.length > 0 && setShowTripSwitcher(true)}
                className="text-left group"
              >
                <h1 className="text-2xl font-light text-[#3a3128] inline">
                  {trip.name}
                </h1>
                {archivedTrips.length > 0 && (
                  <span className="ml-1.5 text-[#c8bba8] group-hover:text-[#8a7a62] transition-colors text-sm">&#9662;</span>
                )}
              </button>
              {trip.tagline && (
                <p className="text-sm text-[#6b5d4a] italic">{trip.tagline}</p>
              )}
              <p className="text-sm text-[#8a7a62] mt-1">
                {formatDate(trip.startDate)} — {formatDate(trip.endDate)}
                <button
                  onClick={() => {
                    setEditName(trip.name);
                    setEditTagline(trip.tagline || "");
                    setEditStartDate(trip.startDate.split("T")[0]);
                    setEditEndDate(trip.endDate.split("T")[0]);
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
              onClick={() => archivedTrips.length > 0 && setShowTripSwitcher(true)}
              className="text-left group"
            >
              <h1 className="text-2xl font-light text-[#3a3128] inline">
                {trip.name}
              </h1>
              {archivedTrips.length > 0 && (
                <span className="ml-1.5 text-[#c8bba8] group-hover:text-[#8a7a62] transition-colors text-sm">&#9662;</span>
              )}
            </button>
            {trip.tagline && (
              <p className="text-sm text-[#6b5d4a] mt-0.5 italic">{trip.tagline}</p>
            )}
            <p className="text-sm text-[#8a7a62] mt-1">
              {formatDate(trip.startDate)} — {formatDate(trip.endDate)}
              <button
                onClick={() => {
                  setEditName(trip.name);
                  setEditTagline(trip.tagline || "");
                  setEditStartDate(trip.startDate.split("T")[0]);
                  setEditEndDate(trip.endDate.split("T")[0]);
                  setEditingTrip(true);
                }}
                className="ml-2 text-sm text-[#c8bba8] hover:text-[#8a7a62]"
              >
                edit
              </button>
            </p>
          </div>
        )}

        {/* Identity bar */}
        <div className="flex items-center justify-end gap-3 mb-6">
          <button
            onClick={() => navigate("/guide#getting-around")}
            className="text-sm text-[#a89880] hover:text-[#6b5d4a] transition-colors"
            aria-label="Guide"
          >
            ?
          </button>
          <button
            onClick={() => navigate("/history")}
            className="text-sm text-[#a89880] hover:text-[#6b5d4a] transition-colors"
          >
            History
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="text-[#a89880] hover:text-[#6b5d4a] transition-colors"
            aria-label="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
          <button onClick={() => navigate("/profile")} className="text-sm text-[#8a7a62] hover:text-[#514636] transition-colors underline decoration-dotted underline-offset-2">{user?.displayName}</button>
          <button onClick={logout} className="text-sm text-[#a89880] hover:text-[#6b5d4a] transition-colors">
            Sign out
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

        {/* Post-import orientation — short and scannable */}
        {!localStorage.getItem("wander:overview-oriented") && experiences.length > 0 && (
          <div className="mb-6 p-4 bg-white rounded-lg border border-[#e0d8cc]">
            <p className="text-sm font-medium text-[#3a3128] mb-2">
              Quick start
            </p>
            <ul className="text-sm text-[#6b5d4a] space-y-1 list-none">
              {!window.matchMedia("(display-mode: standalone)").matches && (
                <li>• <strong>Save to phone:</strong> tap Share → Add to Home Screen (toggle "web app" so it's green)</li>
              )}
              <li>• Tap any day below to see your map + activities</li>
              <li>• Use <strong>Import</strong> on the map to add plans</li>
              <li>• The AI chat can help rearrange things</li>
            </ul>
            <button
              onClick={() => { localStorage.setItem("wander:overview-oriented", "1"); loadTrips(); }}
              className="text-sm text-[#c8bba8] hover:text-[#6b5d4a] mt-2 transition-colors"
            >
              got it
            </button>
          </div>
        )}

        {/* Week-view calendar grid */}
        <CalendarGrid
          days={days}
          cities={trip.cities}
          selectedPerDay={selectedPerDay}
          backroadsDays={backroadsDays}
          onDayClick={(cityId) => navigate(`/plan?city=${cityId}`)}
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
          onNavigate={(cityId) => navigate(`/plan?city=${cityId}`)}
        />

        {/* Trip members & invite */}
        {trip && <TripMembers tripId={trip.id} />}

        {/* Contributor summary — colored chips with counts */}
        {(() => {
          const byCreator: Record<string, number> = {};
          for (const exp of experiences) {
            if (exp.createdBy) {
              byCreator[exp.createdBy] = (byCreator[exp.createdBy] || 0) + 1;
            }
          }
          const creators = Object.entries(byCreator).sort((a, b) => b[1] - a[1]);
          if (creators.length <= 1) return null;
          return (
            <div className="mb-6">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">Contributions</h3>
              <div className="flex flex-wrap gap-2">
                {creators.map(([code, count]) => {
                  const cc = getContributorColor(code);
                  return (
                    <button
                      key={code}
                      onClick={() => setContributorViewCode(code)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors hover:shadow-sm"
                      style={{ backgroundColor: cc.bg, borderColor: cc.border }}
                    >
                      <span
                        className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center"
                        style={{ backgroundColor: cc.border, color: "#fff" }}
                      >
                        {getContributorInitial(code)}
                      </span>
                      <span className="text-sm font-medium" style={{ color: cc.text }}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ContributorView overlay */}
        {contributorViewCode && trip && (
          <ContributorView
            travelerCode={contributorViewCode}
            experiences={experiences}
            trip={trip}
            onClose={() => setContributorViewCode(null)}
            onExperienceClick={(id) => { setContributorViewCode(null); navigate(`/plan?highlight=${id}`); }}
          />
        )}

        {/* Recent activity — collapsed to button, opens modal */}
        {recentActivity.length > 0 && (
          <RecentActivityButton activity={recentActivity} />
        )}

        {/* Actions */}
        <div className="flex gap-3">
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

        {/* Past trips removed — accessible via CreateTrip screen if needed */}
      </div>
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

// ── Calendar grid (week view) ───────────────────────────────────

function CalendarGrid({
  days,
  cities,
  selectedPerDay,
  backroadsDays,
  onDayClick,
}: {
  days: Day[];
  cities: City[];
  selectedPerDay: Record<string, number>;
  backroadsDays: Set<string>;
  onDayClick: (cityId: string) => void;
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
          onDayClick={onDayClick}
        />
      ))}
    </section>
  );
}

function CalendarCluster({
  clusterDays,
  allSortedDays,
  cities,
  selectedPerDay,
  backroadsDays,
  onDayClick,
}: {
  clusterDays: Day[];
  allSortedDays: Day[];
  cities: City[];
  selectedPerDay: Record<string, number>;
  backroadsDays: Set<string>;
  onDayClick: (cityId: string) => void;
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
                  className="aspect-[3/4] rounded-lg flex flex-col items-center justify-between relative overflow-hidden
                             hover:shadow-md transition-shadow"
                  style={{ backgroundColor: cityColor }}
                >
                  {/* Map background with city color tint */}
                  {mapUrl && (
                    <>
                      <img
                        src={mapUrl}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0" style={{ backgroundColor: cityColor, opacity: 0.25 }} />
                    </>
                  )}
                  {/* Backroads badge — absolute top-right so long city names can't push it offscreen */}
                  {isBackroads && (
                    <span className="absolute top-0.5 right-0.5 z-20 font-bold text-white rounded-sm leading-none"
                      style={{ fontSize: 10, backgroundColor: "#c0392b", padding: "1px 3px" }}>B</span>
                  )}
                  {/* Top: date */}
                  <div className="relative z-10 mt-1 text-xs font-bold text-[#3a3128] bg-white/80 rounded px-1 leading-tight">
                    {dayNum}
                  </div>
                  {/* Middle: city name */}
                  <div className="relative z-10 text-xs text-[#3a3128] font-medium leading-tight bg-white/80 rounded px-1 text-center"
                    style={{ wordBreak: "break-word" }}>
                    {city?.name || ""}
                  </div>
                  {/* Bottom: plans icon */}
                  <div className="relative z-10 mb-1 h-4 flex items-center justify-center">
                    {count > 0 && (
                      <span style={{ fontSize: 12, color: dotColor }}>🗓️</span>
                    )}
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
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<{ displayName: string; role: string }[]>([]);
  const [invites, setInvites] = useState<{ expectedName: string; claimed: boolean }[]>([]);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [newNames, setNewNames] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loadMembers() {
    try {
      const data = await api.get<{
        members: { displayName: string; role: string }[];
        invites: { expectedName: string; claimed: boolean }[];
        inviteToken: string | null;
      }>(`/trips/${tripId}/members`);
      setMembers(data.members);
      setInvites(data.invites);
      setInviteToken(data.inviteToken);
    } catch { /* ignore — might not have members yet */ }
  }

  useEffect(() => {
    if (expanded) loadMembers();
  }, [expanded, tripId]);

  async function handleInvite() {
    const names = newNames.split(",").map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    setSending(true);
    try {
      const data = await api.post<{ inviteLink: string; inviteToken: string }>(`/trips/${tripId}/invite`, { names });
      setInviteToken(data.inviteToken);
      setNewNames("");
      loadMembers();
    } catch { /* ignore */ }
    setSending(false);
  }

  function copyLink() {
    if (!inviteToken) return;
    const link = `${window.location.origin}/join/${inviteToken}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <span
                  key={m.displayName}
                  className="px-3 py-1 rounded-full bg-[#f0ece5] text-sm text-[#3a3128]"
                >
                  {m.displayName}
                  {m.role === "owner" && (
                    <span className="ml-1 text-xs text-[#a89880]">(organizer)</span>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div className="text-xs text-[#a89880]">
              Waiting for: {pendingInvites.map((i) => i.expectedName).join(", ")}
            </div>
          )}

          {/* Invite link */}
          {inviteToken && (
            <div className="flex items-center gap-2">
              <div className="flex-1 text-xs text-[#8a7a62] bg-[#faf8f5] px-3 py-2 rounded-lg truncate border border-[#f0ece5]">
                {window.location.origin}/join/{inviteToken}
              </div>
              <button
                onClick={copyLink}
                className="px-3 py-2 text-xs rounded-lg bg-[#514636] text-white hover:bg-[#3a3128] transition-colors whitespace-nowrap"
              >
                {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>
          )}

          {/* Add names */}
          <div>
            <label className="text-xs text-[#8a7a62] block mb-1">
              Invite travelers (comma-separated names):
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newNames}
                onChange={(e) => setNewNames(e.target.value)}
                placeholder="e.g. Kyler, Sarah"
                className="flex-1 px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white text-sm text-[#3a3128] focus:outline-none focus:ring-2 focus:ring-[#514636]/30 placeholder-[#c8bba8]"
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
              <button
                onClick={handleInvite}
                disabled={sending || !newNames.trim()}
                className="px-4 py-2 rounded-lg bg-[#514636] text-white text-sm hover:bg-[#3a3128] transition-colors disabled:opacity-50"
              >
                {sending ? "..." : "Invite"}
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
