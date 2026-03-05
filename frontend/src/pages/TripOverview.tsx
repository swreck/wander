import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import CreateTrip from "../components/CreateTrip";
import type { Trip, Day, Experience } from "../lib/types";

export default function TripOverview() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
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
    await api.patch(`/trips/${trip.id}`, {
      name: editName,
      startDate: editStartDate,
      endDate: editEndDate,
    });
    setEditingTrip(false);
    loadTrips();
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
                <p className="text-sm text-[#8a7a62] mt-1">
                  {formatDate(trip.startDate)} — {formatDate(trip.endDate)}
                  <button
                    onClick={() => {
                      setEditName(trip.name);
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
                  <span className="text-[#3a3128] font-medium">{city.name}</span>
                  {city.country && <span className="text-[#a89880] text-sm ml-2">{city.country}</span>}
                  {possiblePerCity[city.id] > 0 && (
                    <span className="text-[#c8bba8] text-xs ml-2">
                      {possiblePerCity[city.id]} possible
                    </span>
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

        {/* Day summary */}
        <section className="mb-8">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-3">Days</h2>
          <div className="px-4 py-3 bg-white rounded-lg border border-[#f0ece5] text-sm text-[#8a7a62]">
            {days.length} days planned · {experiences.filter((e) => e.state === "selected").length} selected experiences · {experiences.filter((e) => e.state === "possible").length} possible
          </div>
        </section>

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
