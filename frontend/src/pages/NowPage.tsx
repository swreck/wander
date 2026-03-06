import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Trip, Day, Experience } from "../lib/types";

interface TravelTimeResult {
  durationMinutes: number;
  bufferMinutes: number;
  totalMinutes: number;
  departureTime?: string;
  source: "google" | "fallback";
  mode: string;
}

interface AnchorItem {
  time: Date | null;
  name: string;
  type: string;
  detail?: string;
  lat?: number | null;
  lng?: number | null;
}

type TravelMode = "walk" | "transit" | "taxi";

const MODE_LABELS: Record<TravelMode, string> = {
  walk: "walk",
  transit: "transit",
  taxi: "taxi",
};

export default function NowPage() {
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [today, setToday] = useState<Day | null>(null);
  const [loading, setLoading] = useState(true);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>("walk");
  const [travelResults, setTravelResults] = useState<Map<number, TravelTimeResult>>(new Map());
  const [now, setNow] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [quickCaptureName, setQuickCaptureName] = useState("");
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // Load trip and day data
  useEffect(() => {
    async function load() {
      const t = await api.get<Trip>("/trips/active");
      if (!t) { navigate("/"); return; }
      setTrip(t);

      const days = await api.get<Day[]>(`/days/trip/${t.id}`);
      const todayStr = new Date().toISOString().split("T")[0];
      const todayDay = days.find((d) => d.date.split("T")[0] === todayStr);
      setToday(todayDay || null);
      setLoading(false);
    }
    load();
  }, [navigate]);

  // Refresh when chat makes changes
  useEffect(() => {
    const handler = () => { window.location.reload(); };
    window.addEventListener("wander:data-changed", handler);
    return () => window.removeEventListener("wander:data-changed", handler);
  }, []);

  // Request GPS position, fall back to hotel coords
  useEffect(() => {
    if (!today) return;

    const accommodation = today.accommodations?.[0];
    const fallbackLat = accommodation?.latitude ?? null;
    const fallbackLng = accommodation?.longitude ?? null;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
        },
        () => {
          // GPS denied or unavailable — use hotel coords
          setUserLat(fallbackLat);
          setUserLng(fallbackLng);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 }
      );
    } else {
      setUserLat(fallbackLat);
      setUserLng(fallbackLng);
    }
  }, [today]);

  // Build anchors from the day's schedule
  const buildAnchors = useCallback((): AnchorItem[] => {
    if (!today) return [];

    const selectedExps = (today.experiences || [])
      .filter((e) => e.state === "selected")
      .sort((a, b) => a.priorityOrder - b.priorityOrder);
    const reservations = (today.reservations || [])
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
    const accommodations = today.accommodations || [];

    const anchors: AnchorItem[] = [];

    // Hotel as first anchor
    if (accommodations.length > 0) {
      anchors.push({
        time: null,
        name: accommodations[0].name,
        type: "hotel",
        detail: accommodations[0].address || undefined,
        lat: accommodations[0].latitude,
        lng: accommodations[0].longitude,
      });
    }

    // Experiences
    for (const exp of selectedExps) {
      const detailParts: string[] = [];
      if (exp.timeWindow) detailParts.push(exp.timeWindow);
      if (exp.userNotes) detailParts.push(exp.userNotes);
      anchors.push({
        time: exp.timeWindow ? parseTimeWindow(exp.timeWindow, today.date) : null,
        name: exp.name,
        type: "experience",
        detail: detailParts.join(" · ") || undefined,
        lat: exp.latitude,
        lng: exp.longitude,
      });
    }

    // Reservations
    for (const res of reservations) {
      anchors.push({
        time: new Date(res.datetime),
        name: res.name,
        type: "reservation",
        detail: `${new Date(res.datetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${res.notes ? ` — ${res.notes}` : ""}`,
        lat: res.latitude,
        lng: res.longitude,
      });
    }

    // Sort by time (nulls first)
    anchors.sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return -1;
      if (!b.time) return 1;
      return a.time.getTime() - b.time.getTime();
    });

    return anchors;
  }, [today]);

  // Fetch travel times for upcoming anchors with coordinates
  const fetchTravelTimes = useCallback(async (anchors: AnchorItem[]) => {
    if (userLat == null || userLng == null) return;

    const currentTime = new Date();
    const results = new Map<number, TravelTimeResult>();

    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i];
      if (!anchor.time || anchor.time <= currentTime) continue;
      if (anchor.lat == null || anchor.lng == null) continue;

      try {
        const result = await api.post<TravelTimeResult>("/travel-time", {
          originLat: userLat,
          originLng: userLng,
          destLat: anchor.lat,
          destLng: anchor.lng,
          mode: travelMode,
          anchorTime: anchor.time.toISOString(),
        });
        results.set(i, result);
      } catch {
        // Silently skip failed calculations
      }
    }

    setTravelResults(results);
  }, [userLat, userLng, travelMode]);

  // Refresh every 60 seconds
  useEffect(() => {
    const anchors = buildAnchors();
    fetchTravelTimes(anchors);

    intervalRef.current = setInterval(() => {
      setNow(new Date());
      const freshAnchors = buildAnchors();
      fetchTravelTimes(freshAnchors);
    }, 60000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [buildAnchors, fetchTravelTimes]);

  // Re-fetch when travel mode changes
  useEffect(() => {
    const anchors = buildAnchors();
    fetchTravelTimes(anchors);
  }, [travelMode, buildAnchors, fetchTravelTimes]);

  async function handleQuickCapture() {
    if (!quickCaptureName.trim() || !trip || !today) return;
    setCapturing(true);
    try {
      await api.post("/experiences", {
        tripId: trip.id,
        cityId: today.cityId,
        name: quickCaptureName.trim(),
        userNotes: "Discovered today",
      });
      setQuickCaptureName("");
      setShowQuickCapture(false);
      // Reload the page to show the new experience
      window.location.reload();
    } finally {
      setCapturing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#8a7a62] bg-[#faf8f5]">
        Loading...
      </div>
    );
  }

  if (!trip || !today) {
    return (
      <div className="min-h-screen bg-[#faf8f5] px-4 py-8">
        <button
          onClick={() => navigate("/plan")}
          className="text-sm text-[#8a7a62] hover:text-[#3a3128] mb-4"
        >
          &larr; Back to planning
        </button>
        <div className="text-center py-16">
          <h1 className="text-xl font-light text-[#3a3128] mb-2">No schedule for today</h1>
          <p className="text-sm text-[#8a7a62]">Today doesn't fall within your trip dates.</p>
        </div>
      </div>
    );
  }

  const anchors = buildAnchors();
  const selectedExps = (today.experiences || [])
    .filter((e) => e.state === "selected")
    .sort((a, b) => a.priorityOrder - b.priorityOrder);
  const reservations = (today.reservations || [])
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
  const accommodations = today.accommodations || [];

  // Find next upcoming anchor
  const nextAnchorIndex = anchors.findIndex((a) => a.time && a.time > now);
  const nextAnchor = nextAnchorIndex >= 0 ? anchors[nextAnchorIndex] : null;
  const nextTravelResult = nextAnchorIndex >= 0 ? travelResults.get(nextAnchorIndex) : null;

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate("/plan")}
            className="text-sm text-[#8a7a62] hover:text-[#3a3128]"
          >
            &larr; Planning
          </button>
          <span className="text-xs text-[#c8bba8]">
            {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>
        </div>

        {/* Today — morning briefing header */}
        <section className="mb-8">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">
            Today
          </h2>
          <h1 className="text-2xl font-light text-[#3a3128]">
            {new Date(today.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h1>
          <p className="text-sm text-[#8a7a62] mt-1">
            {today.city.name}
            {today.city.tagline && <span className="text-[#a89880] ml-1">· {today.city.tagline}</span>}
          </p>
          {accommodations.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-[#6b5d4a]">{accommodations[0].name}</span>
              {accommodations[0].latitude != null && accommodations[0].longitude != null && (
                <a
                  href={`https://maps.apple.com/?daddr=${accommodations[0].latitude},${accommodations[0].longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[#a89880] hover:text-[#514636]"
                >
                  navigate
                </a>
              )}
            </div>
          )}
          {/* Quick summary line */}
          <p className="text-xs text-[#c8bba8] mt-2">
            {selectedExps.length} planned
            {reservations.length > 0 && ` · ${reservations.length} reservation${reservations.length > 1 ? "s" : ""}`}
          </p>
        </section>

        {/* Question 2 & 3: What's next? When should I leave? */}
        {nextAnchor && (
          <section className="mb-8 p-4 bg-white rounded-xl border border-[#e0d8cc]">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">
              Next
            </h2>
            <div className="text-lg font-medium text-[#3a3128]">{nextAnchor.name}</div>
            {nextAnchor.detail && (
              <div className="text-sm text-[#8a7a62] mt-1">{nextAnchor.detail}</div>
            )}

            {/* Leave-time calculation */}
            {nextTravelResult && nextTravelResult.departureTime && (
              <div className="mt-4 p-3 bg-[#faf8f5] rounded-lg border border-[#e0d8cc]">
                <div className="text-lg font-semibold text-[#3a3128]">
                  Leave by {new Date(nextTravelResult.departureTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </div>
                <div className="text-sm text-[#6b5d4a] mt-1">
                  {nextTravelResult.durationMinutes} min {MODE_LABELS[travelMode]} + {nextTravelResult.bufferMinutes} min buffer to {nextAnchor.name}
                </div>
                {nextTravelResult.source === "fallback" && (
                  <div className="text-xs text-[#a89880] mt-1 italic">Estimated from distance</div>
                )}
              </div>
            )}

            {/* Travel mode selector */}
            {nextAnchor.lat != null && nextAnchor.lng != null && userLat != null && (
              <div className="mt-3 flex gap-2">
                {(["walk", "transit", "taxi"] as TravelMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setTravelMode(m)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      travelMode === m
                        ? "bg-[#514636] text-white"
                        : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                    }`}
                  >
                    {m === "walk" ? "Walk" : m === "transit" ? "Transit" : "Taxi"}
                  </button>
                ))}
              </div>
            )}

            {/* Timer handoff (primary — Siri) */}
            {nextAnchor.time && (
              <div className="mt-4">
                {(() => {
                  const minsUntil = Math.round((nextAnchor.time!.getTime() - now.getTime()) / 60000);
                  // Use travel-time calculation if available, otherwise fall back to simple buffer
                  const timerMins = nextTravelResult?.departureTime
                    ? Math.max(1, Math.round((new Date(nextTravelResult.departureTime).getTime() - now.getTime()) / 60000))
                    : Math.max(1, minsUntil - 15);
                  return (
                    <>
                      <div className="text-sm text-[#6b5d4a] mb-2">
                        {minsUntil > 0
                          ? `In ${minsUntil} minutes`
                          : "Starting now"}
                      </div>
                      {minsUntil > 5 && timerMins > 0 && (
                        <a
                          href={`shortcuts://run-shortcut?name=Timer&input=${timerMins}`}
                          className="inline-block px-4 py-2 bg-[#514636] text-white rounded-lg text-sm
                                     font-medium hover:bg-[#3a3128] transition-colors"
                        >
                          Set a {timerMins} minute timer
                        </a>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Secondary handoff buttons */}
            {nextAnchor.time && (
              <div className="mt-3 flex flex-col gap-2">
                {/* Set alarm deep link */}
                {nextTravelResult?.departureTime && (
                  <a
                    href={buildAlarmLink(new Date(nextTravelResult.departureTime))}
                    className="flex items-center justify-center px-4 py-2 rounded-lg border border-[#e0d8cc]
                               text-sm text-[#6b5d4a] hover:bg-[#f0ece5] transition-colors"
                  >
                    Set alarm for {new Date(nextTravelResult.departureTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </a>
                )}

                {/* Maps links — only if destination has coordinates */}
                {nextAnchor.lat != null && nextAnchor.lng != null && (
                  <div className="flex gap-2">
                    <a
                      href={`https://maps.apple.com/?daddr=${nextAnchor.lat},${nextAnchor.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center px-3 py-2 rounded-lg border border-[#e0d8cc]
                                 text-sm text-[#6b5d4a] hover:bg-[#f0ece5] transition-colors"
                    >
                      Open in Apple Maps
                    </a>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${nextAnchor.lat},${nextAnchor.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center px-3 py-2 rounded-lg border border-[#e0d8cc]
                                 text-sm text-[#6b5d4a] hover:bg-[#f0ece5] transition-colors"
                    >
                      Open in Google Maps
                    </a>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Question 4: What matters right now? */}
        {reservations.filter((r) => {
          const resTime = new Date(r.datetime);
          const minsUntil = (resTime.getTime() - now.getTime()) / 60000;
          return minsUntil > 0 && minsUntil < 60;
        }).map((r) => (
          <div key={r.id} className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <div className="text-sm font-medium text-amber-800">
              {r.name} at {new Date(r.datetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </div>
            <div className="text-xs text-amber-700 mt-0.5">
              Reservation in {Math.round((new Date(r.datetime).getTime() - now.getTime()) / 60000)} minutes
            </div>
          </div>
        ))}

        {/* Full schedule */}
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-3">
            Today's Schedule
          </h2>
          <div className="space-y-4">
            {anchors.map((anchor, i) => {
              const isPast = anchor.time && anchor.time < now;
              const isNext = i === nextAnchorIndex;
              const anchorTravel = travelResults.get(i);
              return (
                <div
                  key={i}
                  className={`px-4 py-3 rounded-lg transition-colors ${
                    isNext
                      ? "bg-white border-2 border-[#514636]"
                      : isPast
                        ? "bg-[#f0ece5]/50 text-[#c8bba8]"
                        : "bg-white border border-[#f0ece5]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${isNext ? "text-[#3a3128]" : isPast ? "text-[#c8bba8]" : "text-[#3a3128]"}`}>
                      {anchor.name}
                    </span>
                    <span className={`text-xs capitalize ${isPast ? "text-[#c8bba8]" : "text-[#a89880]"}`}>
                      {anchor.type}
                    </span>
                  </div>
                  {anchor.detail && (
                    <div className={`text-xs mt-0.5 ${isPast ? "text-[#c8bba8]" : "text-[#8a7a62]"}`}>
                      {anchor.detail}
                    </div>
                  )}
                  {/* Show leave-by time in schedule for upcoming anchors */}
                  {anchorTravel?.departureTime && !isPast && !isNext && (
                    <div className="text-xs mt-1 text-[#6b5d4a]">
                      Leave by {new Date(anchorTravel.departureTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </div>
                  )}
                </div>
              );
            })}

            {anchors.length === 0 && (
              <div className="text-center py-8 text-sm text-[#c8bba8]">
                Nothing planned for today yet.
              </div>
            )}
          </div>
        </section>

        {/* Quick capture */}
        {showQuickCapture ? (
          <div className="mt-6 p-3 bg-white rounded-lg border border-[#e0d8cc] space-y-2">
            <input
              type="text"
              value={quickCaptureName}
              onChange={(e) => setQuickCaptureName(e.target.value)}
              placeholder="Place name"
              autoFocus
              className="w-full px-3 py-2 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                         placeholder-[#c8bba8] focus:outline-none focus:ring-2 focus:ring-[#a89880]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && quickCaptureName.trim()) {
                  handleQuickCapture();
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleQuickCapture}
                disabled={!quickCaptureName.trim() || capturing}
                className="flex-1 py-2 rounded bg-[#514636] text-white text-sm font-medium
                           hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
              >
                {capturing ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => { setShowQuickCapture(false); setQuickCaptureName(""); }}
                className="px-3 py-2 text-xs text-[#8a7a62] hover:text-[#3a3128]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowQuickCapture(true)}
            className="mt-6 w-full py-3 rounded-lg border-2 border-dashed border-[#e0d8cc] text-sm text-[#a89880]
                       hover:border-[#a89880] hover:text-[#6b5d4a] transition-colors"
          >
            + Add a discovery
          </button>
        )}

        {/* Share plan */}
        <button
          onClick={() => sharePlan(today, selectedExps, reservations, accommodations)}
          className="mt-4 w-full py-3 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a]
                     hover:bg-[#f0ece5] transition-colors"
        >
          Share Today's Plan
        </button>
      </div>
    </div>
  );
}

/**
 * Build a clock app alarm deep link.
 * On iOS, the clock:// scheme opens the Clock app. Falls back to a Shortcuts approach.
 */
function buildAlarmLink(time: Date): string {
  const hours = time.getHours();
  const minutes = time.getMinutes();
  // iOS Shortcuts-based alarm setting
  return `shortcuts://run-shortcut?name=Set%20Alarm&input=${hours}:${minutes.toString().padStart(2, "0")}`;
}

function parseTimeWindow(tw: string, dayDate: string): Date | null {
  const day = new Date(dayDate);
  const lower = tw.toLowerCase();
  if (lower === "morning") { day.setHours(9, 0); return day; }
  if (lower === "afternoon") { day.setHours(14, 0); return day; }
  if (lower === "evening") { day.setHours(18, 0); return day; }

  // Try parsing "2:00 PM" style
  const match = tw.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (match) {
    let hours = parseInt(match[1]);
    const mins = match[2] ? parseInt(match[2]) : 0;
    const ampm = match[3]?.toLowerCase();
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
    day.setHours(hours, mins);
    return day;
  }

  return null;
}

function sharePlan(day: Day, exps: Experience[], reservations: any[], accommodations: any[]) {
  const date = new Date(day.date).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  let text = `${date}\n${day.city.name}\n`;

  if (accommodations.length > 0) {
    text += `\nHotel: ${accommodations[0].name}\n`;
  }

  if (exps.length > 0) {
    text += "\n";
    for (const exp of exps) {
      text += `- ${exp.name}`;
      if (exp.timeWindow) text += ` (${exp.timeWindow})`;
      text += "\n";
    }
  }

  if (reservations.length > 0) {
    text += "\n";
    for (const res of reservations) {
      const time = new Date(res.datetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      text += `Reservation: ${res.name} at ${time}\n`;
    }
  }

  if (day.notes) {
    text += `\nNotes: ${day.notes}\n`;
  }

  if (navigator.share) {
    navigator.share({ text });
  } else {
    navigator.clipboard.writeText(text);
  }
}
