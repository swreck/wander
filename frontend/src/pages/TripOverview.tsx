import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import CreateTrip from "../components/CreateTrip";

interface City {
  id: string;
  name: string;
  country: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
}

interface RouteSegment {
  id: string;
  originCity: string;
  destinationCity: string;
  transportMode: string;
}

interface Trip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  cities: City[];
  routeSegments: RouteSegment[];
  days: any[];
}

export default function TripOverview() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function loadTrips() {
    setLoading(true);
    try {
      const [active, all] = await Promise.all([
        api.get<Trip | null>("/trips/active"),
        api.get<Trip[]>("/trips"),
      ]);
      setTrip(active);
      setAllTrips(all);
      if (!active) setShowCreate(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTrips(); }, []);

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  function nights(arrival: string | null, departure: string | null): number {
    if (!arrival || !departure) return 0;
    const ms = new Date(departure).getTime() - new Date(arrival).getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#8a7a62]">
        Loading...
      </div>
    );
  }

  if (showCreate || !trip) {
    return <CreateTrip onCreated={() => { setShowCreate(false); loadTrips(); }} />;
  }

  const archivedTrips = allTrips.filter((t) => t.status === "archived");

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-light text-[#3a3128]">{trip.name}</h1>
            <p className="text-sm text-[#8a7a62] mt-1">
              {formatDate(trip.startDate)} — {formatDate(trip.endDate)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#8a7a62]">{user?.displayName}</span>
            <button
              onClick={logout}
              className="text-xs text-[#a89880] hover:text-[#6b5d4a] transition-colors"
            >
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
              <div
                key={city.id}
                className="flex items-center justify-between px-4 py-3
                           bg-white rounded-lg border border-[#f0ece5]"
              >
                <div>
                  <span className="text-[#3a3128] font-medium">{city.name}</span>
                  {city.country && (
                    <span className="text-[#a89880] text-sm ml-2">{city.country}</span>
                  )}
                </div>
                <div className="text-sm text-[#8a7a62]">
                  {city.arrivalDate && city.departureDate && (
                    <>
                      {formatDate(city.arrivalDate)} — {formatDate(city.departureDate)}
                      <span className="ml-2 text-[#c8bba8]">
                        {nights(city.arrivalDate, city.departureDate)}n
                      </span>
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
            <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-3">
              Route
            </h2>
            <div className="space-y-2">
              {trip.routeSegments.map((seg) => (
                <div
                  key={seg.id}
                  className="flex items-center gap-3 px-4 py-3
                             bg-white rounded-lg border border-[#f0ece5] text-sm"
                >
                  <span className="text-[#3a3128]">{seg.originCity}</span>
                  <span className="text-[#c8bba8]">→</span>
                  <span className="text-[#3a3128]">{seg.destinationCity}</span>
                  <span className="ml-auto text-[#a89880] text-xs capitalize">
                    {seg.transportMode}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Day count */}
        <section className="mb-8">
          <div className="px-4 py-3 bg-white rounded-lg border border-[#f0ece5] text-sm text-[#8a7a62]">
            {trip.days.length} days planned
          </div>
        </section>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/plan")}
            className="flex-1 py-3 rounded-lg bg-[#514636] text-white text-sm font-medium
                       hover:bg-[#3a3128] transition-colors"
          >
            Start Planning
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-3 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a]
                       hover:bg-[#f0ece5] transition-colors"
          >
            New Trip
          </button>
        </div>

        {/* Archived Trips */}
        {archivedTrips.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[#c8bba8] mb-3">
              Past Trips
            </h2>
            <div className="space-y-2">
              {archivedTrips.map((t) => (
                <div
                  key={t.id}
                  className="px-4 py-3 bg-white/50 rounded-lg border border-[#f0ece5]
                             text-sm text-[#a89880]"
                >
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
