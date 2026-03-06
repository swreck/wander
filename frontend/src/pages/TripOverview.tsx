import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import CreateTrip from "../components/CreateTrip";
import FirstTimeGuide from "../components/FirstTimeGuide";
import { useToast } from "../contexts/ToastContext";
import type { Trip, Day, Experience, ChangeLogEntry } from "../lib/types";

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
        // Fetch recent activity
        try {
          const { logs } = await api.get<{ logs: ChangeLogEntry[]; total: number }>(`/change-logs/trip/${active.id}?limit=50`);
          setRecentActivity(logs.slice(0, 5));

          // Check if this user is new to the trip (collaboration welcome)
          const welcomeKey = `wander:trip-welcomed:${active.id}:${user?.displayName}`;
          if (user && !localStorage.getItem(welcomeKey)) {
            const myEntries = logs.filter((l) => l.userDisplayName === user.displayName);
            if (myEntries.length === 0 && logs.length > 0) {
              // This user has never touched this trip — show who has
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

  // Refresh when chat makes changes
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
        startDate: editStartDate,
        endDate: editEndDate,
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

  if (showCreate || !trip) {
    return <CreateTrip onCreated={() => { setShowCreate(false); loadTrips(); }} />;
  }

  const archivedTrips = allTrips.filter((t) => t.status === "archived");
  const isWithinDates = (() => {
    const now = new Date();
    return now >= new Date(trip.startDate) && now <= new Date(trip.endDate);
  })();

  // Stats
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

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      {/* Collaboration welcome — one-time for users joining an existing trip */}
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

      <FirstTimeGuide
        id="overview"
        lines={[
          "This is your trip home base — cities, days, and recent activity at a glance",
          "Tap \"Start Planning\" to open the map and organize your experiences",
          "During your trip, the \"Now\" button shows your live schedule",
          "Import text from friends, blogs, or AI chatbots to add experiences quickly",
        ]}
      />
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            {editingTrip ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-2xl font-light text-[#3a3128] border-b border-[#e0d8cc]
                             focus:outline-none focus:border-[#a89880] bg-transparent"
                />
                <input
                  type="text"
                  value={editTagline}
                  onChange={(e) => setEditTagline(e.target.value)}
                  placeholder="Trip tagline (e.g. Ceramics, temples, and autumn leaves)"
                  className="w-full text-sm text-[#6b5d4a] border-b border-[#e0d8cc]
                             focus:outline-none focus:border-[#a89880] bg-transparent placeholder-[#c8bba8]"
                />
                <div className="flex gap-2">
                  <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)}
                    className="px-2 py-1 text-sm border border-[#e0d8cc] rounded" />
                  <input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)}
                    className="px-2 py-1 text-sm border border-[#e0d8cc] rounded" />
                </div>
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
            ) : (
              <>
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
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
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
        </div>

        {/* Cities */}
        <section className="mb-8">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-3">
            Cities
          </h2>
          <div className="space-y-2">
            {trip.cities.map((city) => (
              <div key={city.id} className="flex items-center justify-between px-4 py-3 bg-white rounded-lg border border-[#f0ece5]">
                <div>
                  <div>
                    <span className="text-[#3a3128] font-medium">{city.name}</span>
                    {city.country && <span className="text-[#a89880] text-sm ml-2">{city.country}</span>}
                    {possiblePerCity[city.id] > 0 && (
                      <span className="text-[#c8bba8] text-xs ml-2">
                        {possiblePerCity[city.id]} possible
                      </span>
                    )}
                  </div>
                  {city.tagline && (
                    <div className="text-xs text-[#8a7a62] italic mt-0.5">{city.tagline}</div>
                  )}
                </div>
                <div className="text-sm text-[#8a7a62]">
                  {city.arrivalDate && city.departureDate && (
                    <>
                      {formatDate(city.arrivalDate)} — {formatDate(city.departureDate)}
                      <span className="ml-2 text-[#c8bba8]">{nights(city.arrivalDate, city.departureDate)}n</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Route Segments */}
        {trip.routeSegments.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-3">Route</h2>
            <div className="space-y-2">
              {trip.routeSegments.map((seg) => (
                <div key={seg.id} className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-[#f0ece5] text-sm">
                  <span className="text-[#3a3128]">{seg.originCity}</span>
                  <span className="text-[#c8bba8]">→</span>
                  <span className="text-[#3a3128]">{seg.destinationCity}</span>
                  <span className="ml-auto text-[#a89880] text-xs capitalize">{seg.transportMode}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Day filmstrip preview */}
        <section className="mb-8">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-3">
            {days.length} Days · {experiences.filter((e) => e.state === "selected").length} Planned
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {days.map((day) => {
              const count = selectedPerDay[day.id] || 0;
              return (
                <button
                  key={day.id}
                  onClick={() => navigate("/plan")}
                  className="shrink-0 w-[90px] bg-white rounded-lg border border-[#f0ece5] hover:border-[#e0d8cc]
                             transition-colors overflow-hidden text-left"
                >
                  <div className="px-2 py-1.5">
                    <div className="text-[10px] font-medium text-[#3a3128]">
                      {new Date(day.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </div>
                    <div className="text-[9px] text-[#a89880] truncate">{day.city.name}</div>
                    <div className="text-[9px] text-[#c8bba8] mt-0.5">
                      {count > 0 ? `${count} planned` : "open day"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Recent activity */}
        {recentActivity.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-3">
              Recent Activity
            </h2>
            <div className="space-y-1.5">
              {recentActivity.map((log) => (
                <div key={log.id} className="px-4 py-2 bg-white rounded-lg border border-[#f0ece5] text-xs text-[#8a7a62]">
                  <span className="text-[#3a3128] font-medium">{log.userDisplayName}</span>
                  {" "}{log.description.replace(`${log.userDisplayName} `, "")}
                  <span className="text-[#c8bba8] ml-2">
                    {formatRelativeTime(log.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/plan")}
            className="flex-1 py-3 rounded-lg bg-[#514636] text-white text-sm font-medium hover:bg-[#3a3128] transition-colors"
          >
            Start Planning
          </button>
          {isWithinDates && (
            <button
              onClick={() => navigate("/now")}
              className="px-4 py-3 rounded-lg bg-[#6b5d4a] text-white text-sm font-medium hover:bg-[#514636] transition-colors"
            >
              Now
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-3 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a] hover:bg-[#f0ece5] transition-colors"
          >
            New Trip
          </button>
        </div>

        {/* Archived Trips */}
        {archivedTrips.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[#c8bba8] mb-3">Past Trips</h2>
            <div className="space-y-2">
              {archivedTrips.map((t) => (
                <div key={t.id} className="px-4 py-3 bg-white/50 rounded-lg border border-[#f0ece5] text-sm text-[#a89880]">
                  {t.name} — {formatDate(t.startDate)} to {formatDate(t.endDate)}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

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
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
