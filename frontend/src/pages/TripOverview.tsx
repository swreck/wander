import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import CreateTrip from "../components/CreateTrip";
import { useToast } from "../contexts/ToastContext";
import { APIProvider, Map as GoogleMap, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { getCityPastel, CITY_PASTELS } from "../components/MapCanvas";
import type { Trip, City, Day, Experience, ChangeLogEntry } from "../lib/types";

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
    try {
      await api.patch(`/trips/${trip.id}`, {
        name: editName,
        tagline: editTagline || null,
      });
      setEditingTrip(false);
      showToast("Trip updated");
      loadTrips();
    } catch {
      showToast("Couldn't update trip", "error");
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function nights(arrival: string | null, departure: string | null): number {
    if (!arrival || !departure) return 0;
    return Math.round((new Date(departure).getTime() - new Date(arrival).getTime()) / 86400000);
  }

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
            showToast("Couldn't switch trip", "error");
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
            showToast("Couldn't switch trip", "error");
          }
        }}
      />
    );
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

  // Check if any cities have coordinates for the map
  const locatedCities = trip.cities.filter((c) => c.latitude && c.longitude);
  const hasMap = API_KEY && locatedCities.length > 0;

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      {/* Collaboration welcome */}
      {collabWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div
            className="mx-6 max-w-sm w-full bg-white rounded-2xl shadow-xl p-6 animate-greetingFadeIn"
            onClick={() => setCollabWelcome(null)}
          >
            <p className="text-[15px] text-[#3a3128] leading-relaxed">
              {formatNameList(collabWelcome.names)}{" "}
              {collabWelcome.names.length === 1 ? "has" : "have"} already started
              the {collabWelcome.tripName} itinerary. Once you enter, you'll be
              collaborating on the trip and everyone will see your changes.
            </p>
            <div className="mt-4 text-center">
              <span className="text-xs text-[#c8bba8]">tap anywhere to continue</span>
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
                zoomControl={true}
                mapTypeControl={false}
                streetViewControl={false}
                fullscreenControl={false}
                style={{ width: "100%", height: "100%" }}
              >
                <OverviewFitter cities={locatedCities} />
                <RoutePolyline cities={trip.cities} />
                {trip.cities.map((city, i) => city.latitude && city.longitude && (
                  <AdvancedMarker
                    key={city.id}
                    position={{ lat: city.latitude, lng: city.longitude }}
                    onClick={() => navigate(`/plan?city=${city.id}`)}
                    title={city.name}
                  >
                    <div className="flex flex-col items-center">
                      <div
                        className="flex items-center justify-center rounded-full shadow-lg border-3 border-white"
                        style={{
                          width: 40,
                          height: 40,
                          backgroundColor: CITY_PASTELS[i % CITY_PASTELS.length],
                          borderWidth: 3,
                          boxShadow: `0 3px 10px rgba(0,0,0,0.3), 0 0 0 2px ${CITY_PASTELS[i % CITY_PASTELS.length]}`,
                        }}
                      >
                        <span className="text-sm font-bold text-[#3a3128]">
                          {i + 1}
                        </span>
                      </div>
                      <div className="mt-1 px-2 py-0.5 rounded bg-white/90 shadow-sm">
                        <span className="text-[11px] font-semibold text-[#3a3128]">{city.name}</span>
                      </div>
                    </div>
                  </AdvancedMarker>
                ))}
              </GoogleMap>
            </APIProvider>
          </div>
          {/* Trip name overlay on map */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#faf8f5] to-transparent pt-12 pb-4 px-4">
            <div className="max-w-2xl mx-auto">
              <h1 className="text-2xl font-light text-[#3a3128]">{trip.name}</h1>
              {trip.tagline && (
                <p className="text-sm text-[#6b5d4a] italic">{trip.tagline}</p>
              )}
              <p className="text-xs text-[#8a7a62] mt-1">
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
            <h1 className="text-2xl font-light text-[#3a3128]">{trip.name}</h1>
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
                className="ml-2 text-xs text-[#c8bba8] hover:text-[#8a7a62]"
              >
                edit
              </button>
            </p>
          </div>
        )}

        {/* Identity bar */}
        <div className="flex items-center justify-end gap-3 mb-6">
          <button
            onClick={() => navigate("/history")}
            className="text-xs text-[#a89880] hover:text-[#6b5d4a] transition-colors"
          >
            History
          </button>
          <span className="text-sm text-[#8a7a62]">{user?.displayName}</span>
          <button onClick={logout} className="text-xs text-[#a89880] hover:text-[#6b5d4a] transition-colors">
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
            <p className="text-xs text-[#a89880]">
              Dates are set automatically from your city schedules
            </p>
            <div className="flex gap-2">
              <button onClick={handleSaveTrip}
                className="px-3 py-1 text-xs bg-[#514636] text-white rounded hover:bg-[#3a3128]">
                Save
              </button>
              <button onClick={() => setEditingTrip(false)}
                className="px-3 py-1 text-xs text-[#8a7a62] hover:text-[#3a3128]">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Post-import orientation — short and scannable */}
        {!localStorage.getItem("wander:overview-oriented") && experiences.length > 0 && (
          <div className="mb-6 p-4 bg-white rounded-lg border border-[#e0d8cc]">
            <p className="text-sm font-medium text-[#3a3128] mb-2">
              Your trip at a glance
            </p>
            <ul className="text-xs text-[#6b5d4a] space-y-1 list-none">
              <li>• Tap a day to jump to the map</li>
              <li>• Colors match cities across all views</li>
              <li>• Use <strong>Import</strong> on the map to add plans</li>
              <li>• The AI assistant can help rearrange things</li>
            </ul>
            <button
              onClick={() => { localStorage.setItem("wander:overview-oriented", "1"); loadTrips(); }}
              className="text-[10px] text-[#c8bba8] hover:text-[#6b5d4a] mt-2 transition-colors"
            >
              dismiss
            </button>
          </div>
        )}

        {/* Week-view calendar grid */}
        <CalendarGrid
          days={days}
          cities={trip.cities}
          selectedPerDay={selectedPerDay}
          onDayClick={(cityId) => navigate(`/plan?city=${cityId}`)}
        />

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
  onDayClick,
}: {
  days: Day[];
  cities: City[];
  selectedPerDay: Record<string, number>;
  onDayClick: (cityId: string) => void;
}) {
  if (days.length === 0) return null;

  const sortedDays = [...days].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const totalPlanned = Object.values(selectedPerDay).reduce((a, b) => a + b, 0);

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
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-medium text-[#3a3128]">Itinerary</h2>
        <span className="text-xs text-[#a89880]">
          {days.length} days · {totalPlanned} planned
        </span>
      </div>

      {clusters.map((cluster, ci) => (
        <CalendarCluster
          key={ci}
          clusterDays={cluster}
          allSortedDays={sortedDays}
          cities={cities}
          selectedPerDay={selectedPerDay}
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
  onDayClick,
}: {
  clusterDays: Day[];
  allSortedDays: Day[];
  cities: City[];
  selectedPerDay: Record<string, number>;
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
  const monthLabel = firstDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const endMonthLabel = lastDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const headerLabel = monthLabel === endMonthLabel
    ? monthLabel
    : `${firstDate.toLocaleDateString("en-US", { month: "short" })} — ${lastDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;

  return (
    <div className="mb-4">
      <div className="text-xs text-[#8a7a62] mb-2">{headerLabel}</div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayLabels.map((l) => (
          <div key={l} className="text-center text-[10px] font-medium text-[#a89880] uppercase">
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
                  {/* Top: date */}
                  <div className="relative z-10 mt-1 text-[11px] font-bold text-[#3a3128] bg-white/80 rounded px-1 leading-tight">
                    {dayNum}
                  </div>
                  {/* Middle: city name */}
                  <div className="relative z-10 text-[9px] text-[#3a3128] font-medium leading-tight bg-white/80 rounded px-1 text-center"
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
        className="mb-4 flex items-center gap-2 text-xs text-[#a89880] hover:text-[#6b5d4a] transition-colors"
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
                <div key={log.id} className="px-3 py-2 bg-[#faf8f5] rounded-lg text-xs text-[#8a7a62]">
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
