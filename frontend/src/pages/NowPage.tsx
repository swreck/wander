import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Trip, Day, Experience, TravelerDocument, Decision } from "../lib/types";
import FirstTimeGuide from "../components/FirstTimeGuide";
import { useToast } from "../contexts/ToastContext";
import { isNextUpEnabled, setNextUpEnabled } from "../components/NextUpOverlay";
import { getTripPhase, type TripPhase } from "../lib/tripPhase";
import PlanningInsight from "../components/PlanningInsight";
import { useAuth } from "../contexts/AuthContext";

interface TravelAdvisorySummary {
  visaActions: { country: string; action: string; urgent: boolean }[];
  vaccineActions: { name: string; countries: string[]; status: string; notes: string }[];
  healthHighlights: string[];
  connectivityNote: string;
}

interface TransitDisruption {
  line: string;
  status: string;
  detail: string;
  source: string;
}

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
  transportModeToHere?: string | null;
}

type TravelMode = "walk" | "subway" | "train" | "bus" | "taxi" | "shuttle" | "other";

const MODE_LABELS: Record<TravelMode, string> = {
  walk: "walk",
  subway: "subway",
  train: "train",
  bus: "bus",
  taxi: "taxi",
  shuttle: "shuttle",
  other: "other",
};

export default function NowPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
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
  const [travelDocs, setTravelDocs] = useState<TravelerDocument[]>([]);
  const [transitAlerts, setTransitAlerts] = useState<TransitDisruption[]>([]);
  const [allDays, setAllDays] = useState<Day[]>([]);
  const [allExperiences, setAllExperiences] = useState<Experience[]>([]);
  const [advisorySummary, setAdvisorySummary] = useState<TravelAdvisorySummary | null>(null);
  const [dayDecisions, setDayDecisions] = useState<Decision[]>([]);
  const [votingId, setVotingId] = useState<string | null>(null);
  const { user } = useAuth();

  // Load trip and day data — extracted so it can be called on mount and on data-changed
  const loadData = useCallback(async () => {
    const t = await api.get<Trip>("/trips/active");
    if (!t) { navigate("/"); return; }
    setTrip(t);

    const [days, profileRes, exps] = await Promise.all([
      api.get<Day[]>(`/days/trip/${t.id}`),
      api.get<{ documents: TravelerDocument[] }>(`/traveler-documents/trip/${t.id}`).catch(() => ({ documents: [] })),
      api.get<Experience[]>(`/experiences/trip/${t.id}`),
    ]);
    setTravelDocs(profileRes?.documents || []);
    setAllDays(days);
    setAllExperiences(exps);
    const todayStr = new Date().toISOString().split("T")[0];
    const todayDay = days.find((d) => d.date.split("T")[0] === todayStr);
    setToday(todayDay || null);

    // Fetch transit disruption alerts for the trip
    api.get<{ allDisruptions: TransitDisruption[] }>(`/transit-status/trip/${t.id}`)
      .then((res) => setTransitAlerts(res?.allDisruptions || []))
      .catch(() => {});

    // Fetch travel advisories for pre-trip view
    api.get<{ summary: TravelAdvisorySummary }>(`/travel-advisory/trip/${t.id}`)
      .then((res) => setAdvisorySummary(res?.summary || null))
      .catch(() => {});

    // Fetch open decisions for today (day-level choices)
    api.get<Decision[]>(`/decisions/trip/${t.id}`)
      .then((decisions) => {
        const todayDay = days.find((d) => d.date.split("T")[0] === todayStr);
        if (todayDay) {
          const todayDecisions = decisions.filter(
            (d) => d.dayId === todayDay.id && d.status === "open"
          );
          setDayDecisions(todayDecisions);
        }
      })
      .catch(() => {});

    // F1: Predictive caching — prefetch next city's data if transition within 2 days
    const todayMs = new Date(todayStr).getTime();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    const upcomingDays = days.filter((d) => {
      const dayMs = new Date(d.date.split("T")[0]).getTime();
      return dayMs > todayMs && dayMs <= todayMs + twoDaysMs;
    });
    const nextCityIds = new Set(upcomingDays.map((d) => d.cityId));
    if (nextCityIds.size > 0 && navigator.serviceWorker?.controller) {
      const urls = [
        `/api/days/trip/${t.id}`,
        ...Array.from(nextCityIds).map((cid) => `/api/experiences/city/${cid}`),
      ];
      navigator.serviceWorker.controller.postMessage({ type: "PREFETCH_CITY", urls });
    }

    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh when chat makes changes
  useEffect(() => {
    const handler = () => { loadData(); };
    window.addEventListener("wander:data-changed", handler);
    return () => window.removeEventListener("wander:data-changed", handler);
  }, [loadData]);

  // Periodically refresh transit alerts every 5 minutes
  useEffect(() => {
    if (!trip) return;
    const transitInterval = setInterval(() => {
      api.get<{ allDisruptions: TransitDisruption[] }>(`/transit-status/trip/${trip.id}`)
        .then((res) => setTransitAlerts(res?.allDisruptions || []))
        .catch(() => {});
    }, 300000);
    return () => clearInterval(transitInterval);
  }, [trip]);

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
        transportModeToHere: exp.transportModeToHere,
      });
    }

    // Reservations
    for (const res of reservations) {
      const detailParts = [
        new Date(res.datetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      ];
      if (res.confirmationNumber) detailParts.push(`Conf: ${res.confirmationNumber}`);
      if (res.notes) detailParts.push(res.notes);
      anchors.push({
        time: new Date(res.datetime),
        name: res.name,
        type: "reservation",
        detail: detailParts.join(" — "),
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
    }, 15000);

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
      showToast("Added to today", "success");
      // Refresh data to show new experience
      window.dispatchEvent(new CustomEvent("wander:data-changed"));
    } finally {
      setCapturing(false);
    }
  }

  async function castDayVote(decisionId: string, optionId: string | null) {
    setVotingId(decisionId);
    try {
      await api.post(`/decisions/${decisionId}/vote`, {
        optionId,
        userCode: user?.code,
        displayName: user?.displayName,
      });
      showToast(optionId ? "Vote cast" : "Happy with either — noted");
      // Refresh decisions
      if (trip) {
        const decisions = await api.get<Decision[]>(`/decisions/trip/${trip.id}`);
        const todayDecisions = decisions.filter(
          (d) => d.dayId === today?.id && d.status === "open"
        );
        setDayDecisions(todayDecisions);
      }
    } catch {
      showToast("That didn't go through — try again?", "error");
    }
    setVotingId(null);
  }

  // Phase detection for pre/post trip views — must be before early returns (hooks rule)
  const tripPhase: TripPhase = trip
    ? getTripPhase({ datesKnown: trip.datesKnown !== false, startDate: trip.startDate, endDate: trip.endDate })
    : "dreaming";

  // Planning insights for pre-trip phase
  const planningInsights = useMemo(() => {
    if (!trip || (tripPhase !== "planning" && tripPhase !== "soon" && tripPhase !== "dreaming")) return [];
    const insights: { key: string; message: string; actionLabel?: string; cityId?: string }[] = [];

    // Busy day detection
    for (const day of allDays) {
      const dayExps = allExperiences.filter(e => e.dayId === day.id && e.state === "selected");
      if (dayExps.length >= 5) {
        const dateLabel = new Date(day.date).toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
        });
        const city = trip.cities?.find(c => c.id === day.cityId);
        insights.push({
          key: `busy-${day.id}`,
          message: `${dateLabel} in ${city?.name || "?"} has ${dayExps.length} things planned. That's a full day — might be worth spreading some out.`,
          actionLabel: "Take a look",
          cityId: day.cityId,
        });
      }
    }

    // City with lots of food
    const cities = trip.cities?.filter(c => !c.hidden) || [];
    for (const city of cities) {
      const foodCount = allExperiences.filter(
        e => e.cityId === city.id && e.themes?.includes("food") && e.state === "selected"
      ).length;
      if (foodCount >= 4) {
        insights.push({
          key: `food-heavy-${city.id}`,
          message: `You've got ${foodCount} food spots planned in ${city.name}. That's a lot of eating — some days might have more meals than hours.`,
          cityId: city.id,
        });
      }
    }

    // Popular unscheduled items (lots of reactions but not scheduled)
    const popularUnscheduled = allExperiences.filter(
      e => e.state === "possible" && e.priorityOrder <= 3
    );
    if (popularUnscheduled.length >= 3) {
      insights.push({
        key: `popular-unscheduled`,
        message: `You have ${popularUnscheduled.length} high-priority ideas that haven't been planned yet. Worth a look before things fill up.`,
        actionLabel: "See them",
      });
    }

    // Empty days (days with no scheduled activities or reservations)
    const emptyDays = allDays.filter(d => {
      const dayExps = allExperiences.filter(e => e.dayId === d.id && e.state === "selected");
      const dayRes = d.reservations?.length || 0;
      return dayExps.length === 0 && dayRes === 0;
    });
    if (emptyDays.length > 0 && emptyDays.length < allDays.length) {
      insights.push({
        key: `empty-days`,
        message: emptyDays.length === 1
          ? `One day is still wide open — sometimes that's the best kind of day.`
          : `${emptyDays.length} days are still wide open. That can be great — or worth filling if you've got ideas.`,
      });
    }

    return insights.slice(0, 5); // Max 5 insights
  }, [trip, tripPhase, allDays, allExperiences]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#8a7a62] bg-[#faf8f5]">
        Checking what's next...
      </div>
    );
  }

  if (!trip || !today) {
    // Phase-aware "no today" view
    return (
      <div className="min-h-screen bg-[#faf8f5] px-4 py-8">
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-[#8a7a62] hover:text-[#3a3128] mb-6"
          >
            &larr; Back
          </button>

          {/* Before trip: planning insights */}
          {trip && (tripPhase === "planning" || tripPhase === "soon" || tripPhase === "dreaming") && (
            <>
              <h1 className="text-2xl font-light text-[#3a3128] mb-1">
                {tripPhase === "soon" ? "Almost time" : "Getting ready"}
              </h1>
              <p className="text-sm text-[#8a7a62] mb-6">
                {trip.name}
                {trip.startDate && (() => {
                  const today = new Date();
                  const nowUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
                  const [sy, sm, sd] = trip.startDate!.split("T")[0].split("-").map(Number);
                  const startUTC = Date.UTC(sy, sm - 1, sd);
                  const daysUntil = Math.round((startUTC - nowUTC) / 86400000);
                  if (daysUntil > 0) return ` · ${daysUntil} days away`;
                  return "";
                })()}
              </p>

              {planningInsights.length > 0 ? (
                <div className="space-y-3 mb-8">
                  <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880]">
                    A few things worth knowing
                  </h2>
                  {planningInsights.map(insight => (
                    <PlanningInsight
                      key={insight.key}
                      insightKey={`${trip.id}-${insight.key}`}
                      message={insight.message}
                      actionLabel={insight.actionLabel}
                      onAction={insight.cityId
                        ? () => navigate(`/plan?city=${insight.cityId}`)
                        : insight.actionLabel
                          ? () => navigate("/plan")
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-[#a89880]">Looking good so far</p>
                  <p className="text-xs text-[#c8bba8] mt-1">Check back closer to your trip for insights</p>
                </div>
              )}

              {/* Travel readiness — visa & health advisories */}
              {advisorySummary && (advisorySummary.visaActions.length > 0 || advisorySummary.vaccineActions.length > 0) && (
                <div className="space-y-3 mb-8">
                  <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880]">
                    Before you go
                  </h2>

                  {/* Visa requirements */}
                  {advisorySummary.visaActions.map((visa) => (
                    <div
                      key={visa.country}
                      className={`p-3 rounded-lg border ${
                        visa.urgent
                          ? "bg-amber-50 border-amber-200"
                          : "bg-[#f5f0e8] border-[#e0d8cc]"
                      }`}
                    >
                      <div className={`text-sm font-medium ${visa.urgent ? "text-amber-800" : "text-[#3a3128]"}`}>
                        {visa.country} visa {visa.urgent ? "— act soon" : "needed"}
                      </div>
                      <p className={`text-xs mt-1 ${visa.urgent ? "text-amber-700" : "text-[#6b5d4a]"}`}>
                        {visa.action}
                      </p>
                    </div>
                  ))}

                  {/* Vaccine recommendations */}
                  {advisorySummary.vaccineActions.length > 0 && (
                    <div className="p-3 rounded-lg border border-[#e0d8cc] bg-[#f5f0e8]">
                      <div className="text-sm font-medium text-[#3a3128] mb-1">
                        Recommended vaccines
                      </div>
                      <p className="text-xs text-[#8a7a62] mb-2">
                        Talk to your doctor or a travel clinic about these:
                      </p>
                      <div className="space-y-1.5">
                        {advisorySummary.vaccineActions.map((v) => (
                          <div key={v.name} className="text-xs text-[#6b5d4a]">
                            <span className="font-medium">{v.name}</span>
                            <span className="text-[#a89880]"> — {v.notes}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Connectivity warning */}
                  {advisorySummary.connectivityNote && !advisorySummary.connectivityNote.includes("Good connectivity") && (
                    <div className="p-3 rounded-lg border border-[#e0d8cc] bg-[#f5f0e8]">
                      <div className="text-sm font-medium text-[#3a3128]">Connectivity heads-up</div>
                      <p className="text-xs text-[#6b5d4a] mt-1">{advisorySummary.connectivityNote}</p>
                      <p className="text-xs text-[#a89880] mt-1">Wander saves your plans offline — you'll have everything you need even without signal.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Preview of what Now becomes during travel */}
              {allDays.length > 0 && (
                <div className="mt-6 p-4 bg-[#f0ece5] rounded-lg border border-[#e0d8cc]">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">
                    During your trip
                  </h3>
                  <p className="text-sm text-[#6b5d4a]">
                    This is where you'll see your live timeline, walking distances, and when to leave for your next thing.
                  </p>
                  {(() => {
                    const firstDay = [...allDays].sort((a, b) =>
                      new Date(a.date).getTime() - new Date(b.date).getTime()
                    )[0];
                    const firstDayExps = allExperiences.filter(
                      e => e.dayId === firstDay.id && e.state === "selected"
                    );
                    if (firstDayExps.length === 0) return null;
                    return (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {firstDayExps.slice(0, 3).map(e => (
                          <span key={e.id} className="text-xs px-2 py-0.5 rounded-full bg-white text-[#6b5d4a]">
                            {e.name}
                          </span>
                        ))}
                        {firstDayExps.length > 3 && (
                          <span className="text-xs text-[#a89880]">+{firstDayExps.length - 3} more on Day 1</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}

          {/* After trip: summary */}
          {trip && tripPhase === "past" && (
            <>
              <h1 className="text-2xl font-light text-[#3a3128] mb-1">Welcome home</h1>
              <p className="text-sm text-[#8a7a62] mb-6">{trip.name}</p>
              <div className="grid grid-cols-3 gap-4 text-center mb-6">
                <div className="p-3 bg-white rounded-lg border border-[#f0ece5]">
                  <div className="text-2xl font-light text-[#3a3128]">
                    {(trip.cities || []).filter(c => !c.hidden).length}
                  </div>
                  <div className="text-xs text-[#a89880]">cities</div>
                </div>
                <div className="p-3 bg-white rounded-lg border border-[#f0ece5]">
                  <div className="text-2xl font-light text-[#3a3128]">{allDays.length}</div>
                  <div className="text-xs text-[#a89880]">days</div>
                </div>
                <div className="p-3 bg-white rounded-lg border border-[#f0ece5]">
                  <div className="text-2xl font-light text-[#3a3128]">
                    {allExperiences.filter(e => e.state === "selected").length}
                  </div>
                  <div className="text-xs text-[#a89880]">things done</div>
                </div>
              </div>

              {/* Contributor stats */}
              {(() => {
                const byCreator: Record<string, number> = {};
                for (const e of allExperiences) {
                  if (e.createdBy) byCreator[e.createdBy] = (byCreator[e.createdBy] || 0) + 1;
                }
                const contributors = Object.keys(byCreator);
                if (contributors.length <= 1) return null;
                return (
                  <p className="text-sm text-[#a89880] text-center mb-6">
                    {contributors.length} people contributed ideas to this trip
                  </p>
                );
              })()}

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => navigate("/story")}
                  className="w-full py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium
                             hover:bg-[#3a3128] transition-colors"
                >
                  See your trip story
                </button>
                <button
                  onClick={() => navigate("/")}
                  className="w-full py-2.5 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a] font-medium
                             hover:bg-[#f0ece5] transition-colors"
                >
                  Back to trip overview
                </button>
              </div>
            </>
          )}

          {/* No trip at all */}
          {!trip && (
            <div className="text-center py-16">
              <h1 className="text-xl font-light text-[#3a3128] mb-2">Nothing here yet</h1>
              <p className="text-sm text-[#8a7a62]">Create a trip to get started.</p>
            </div>
          )}
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

  // Auto-adopt the next anchor's saved transport mode as the default
  const nextAnchorMode = nextAnchor?.transportModeToHere as TravelMode | undefined;
  const effectiveMode = nextAnchorMode && MODE_LABELS[nextAnchorMode] ? nextAnchorMode : travelMode;

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-20">
      <FirstTimeGuide
        id="now"
        lines={[
          "See what's next and when you should leave",
          "Switch between walk, subway, train, bus, taxi, or shuttle for travel times",
          "Set a timer or alarm so you don't lose track of time",
          "Quickly capture a place you discover while wandering",
        ]}
      />
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate("/plan")}
            className="text-sm text-[#8a7a62] hover:text-[#3a3128]"
          >
            &larr; Planning
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#c8bba8]">
              {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
            <button
              onClick={() => navigate("/guide#travel-days")}
              className="text-sm text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
              aria-label="Guide"
            >
              ?
            </button>
          </div>
        </div>

        {/* Today — morning briefing header */}
        <section className="mb-8">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">
            Today
          </h2>
          <h1 className="text-2xl font-light text-[#3a3128]">
            {new Date(today.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
          </h1>
          <p className="text-sm text-[#8a7a62] mt-1">
            {today.city.name}
            {today.city.tagline && <span className="text-[#a89880] ml-1">· {today.city.tagline}</span>}
          </p>
          {accommodations.length > 0 && (() => {
            const acc = accommodations[0];
            return (
              <div className="mt-2 px-3 py-2 bg-[#f0ece5] rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#3a3128]">{acc.name}</span>
                  {acc.latitude != null && acc.longitude != null && (
                    <a
                      href={`https://maps.apple.com/?daddr=${acc.latitude},${acc.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#a89880] hover:text-[#514636]"
                    >
                      navigate
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-sm text-[#8a7a62]">
                  {acc.checkInTime && <span>Check-in: {acc.checkInTime}</span>}
                  {acc.checkOutTime && <span>Check-out: {acc.checkOutTime}</span>}
                  {acc.confirmationNumber && (
                    <button onClick={() => { navigator.clipboard.writeText(acc.confirmationNumber!); showToast("Ready to paste"); }}
                      className="hover:text-[#514636] transition-colors">Conf: {acc.confirmationNumber} 📋</button>
                  )}
                </div>
                {acc.notes && <div className="text-sm text-[#6b5d4a] mt-1 italic">{acc.notes}</div>}
              </div>
            );
          })()}
          {/* Quick summary line */}
          <p className="text-sm text-[#c8bba8] mt-2">
            {selectedExps.length} planned
            {reservations.length > 0 && ` · ${reservations.length} reservation${reservations.length > 1 ? "s" : ""}`}
          </p>
        </section>

        {/* Day-level choices — unresolved decisions for today */}
        {dayDecisions.length > 0 && (
          <section className="mb-6">
            {dayDecisions.map((decision) => {
              const userVote = decision.votes.find((v) => v.userCode === user?.code);
              return (
                <div key={decision.id} className="p-4 bg-white rounded-xl border border-amber-200 mb-3">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-amber-700 mb-1">
                    Today's choice
                  </h3>
                  <p className="text-sm font-medium text-[#3a3128] mb-3">{decision.title}</p>

                  <div className="space-y-2">
                    {decision.options.map((opt) => {
                      const voteCount = decision.votes.filter((v) => v.optionId === opt.id).length;
                      const isMyVote = userVote?.optionId === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => castDayVote(decision.id, opt.id)}
                          disabled={votingId === decision.id}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            isMyVote
                              ? "border-amber-400 bg-amber-50"
                              : "border-[#e0d8cc] hover:border-[#a89880]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-[#3a3128]">{opt.name}</span>
                            {voteCount > 0 && (
                              <span className="text-xs text-[#a89880]">
                                {voteCount} {voteCount === 1 ? "vote" : "votes"}
                              </span>
                            )}
                          </div>
                          {opt.description && (
                            <p className="text-xs text-[#8a7a62] mt-0.5">{opt.description}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {!userVote && (
                    <button
                      onClick={() => castDayVote(decision.id, null)}
                      disabled={votingId === decision.id}
                      className="mt-2 text-xs text-[#a89880] hover:text-[#6b5d4a] transition-colors"
                    >
                      Happy with either
                    </button>
                  )}
                  {userVote && (
                    <p className="mt-2 text-xs text-[#a89880]">
                      You voted{userVote.optionId ? "" : " — happy with either"}
                    </p>
                  )}
                </div>
              );
            })}
          </section>
        )}

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
                  {nextTravelResult.durationMinutes} min {MODE_LABELS[effectiveMode]} + {nextTravelResult.bufferMinutes} min buffer to {nextAnchor.name}
                </div>
                {nextTravelResult.source === "fallback" && (
                  <div className="text-sm text-[#a89880] mt-1 italic">Estimated from distance</div>
                )}
              </div>
            )}

            {/* Travel mode selector */}
            {nextAnchor.lat != null && nextAnchor.lng != null && userLat != null && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(["walk", "subway", "train", "bus", "taxi", "shuttle"] as TravelMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setTravelMode(m)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      effectiveMode === m
                        ? "bg-[#514636] text-white"
                        : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                    }`}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
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
            <div className="text-sm text-amber-700 mt-0.5">
              Reservation in {Math.round((new Date(r.datetime).getTime() - now.getTime()) / 60000)} minutes
            </div>
          </div>
        ))}

        {/* Transit disruption alerts */}
        {transitAlerts.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="text-xs font-medium uppercase tracking-wider text-red-700 mb-2">Train Alerts</div>
            {transitAlerts.map((alert, i) => (
              <div key={i} className="text-sm text-red-800 mb-1 last:mb-0">
                <span className="font-medium">{alert.line}</span>
                <span className="text-red-600 ml-1">— {alert.status}</span>
                {alert.detail && <p className="text-xs text-red-600 mt-0.5">{alert.detail}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Contextual travel docs — passport on travel days, hotel confirmation on check-in */}
        {travelDocs.length > 0 && (() => {
          const items: { label: string; value: string }[] = [];
          // Check if today has a route segment (travel day)
          const todayExps = today?.experiences || [];
          const hasTransport = todayExps.some((e) => e.routeSegmentId);
          const accom = today?.accommodations?.[0];

          if (hasTransport) {
            const passport = travelDocs.find((d) => d.type === "passport");
            if (passport?.data) {
              if (passport.data.nameAsOnPassport) items.push({ label: "Passport name", value: passport.data.nameAsOnPassport });
              if (passport.data.number) items.push({ label: "Passport", value: passport.data.number });
            }
          }
          if (accom?.confirmationNumber) {
            items.push({ label: accom.name, value: `Conf: ${accom.confirmationNumber}` });
          }
          // Frequent flyer for travel days
          if (hasTransport) {
            travelDocs.filter((d) => d.type === "frequent_flyer").forEach((d) => {
              if (d.data.airline && d.data.number) {
                items.push({ label: d.data.airline, value: d.data.number });
              }
            });
          }

          if (items.length === 0) return null;
          return (
            <div className="mb-4 p-3 bg-[#f5f0e8] rounded-lg border border-[#e0d8cc]">
              <div className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">Your travel docs</div>
              <div className="space-y-1">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-[#8a7a62]">{item.label}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(item.value);
                        showToast("Ready to paste");
                      }}
                      className="text-[#3a3128] font-medium hover:text-[#514636] transition-colors"
                    >
                      {item.value} 📋
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

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
                className="px-3 py-2 text-sm text-[#8a7a62] hover:text-[#3a3128]"
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
          onClick={() => sharePlan(today, selectedExps, reservations, accommodations, showToast)}
          className="mt-4 w-full py-3 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a]
                     hover:bg-[#f0ece5] transition-colors"
        >
          Share Today's Plan
        </button>

        {/* Next-up overlay setting */}
        <div className="mt-6 flex items-center justify-between px-1">
          <span className="text-xs text-[#a89880]">Show next-up reminder on open</span>
          <button
            onClick={() => {
              const newVal = !isNextUpEnabled();
              setNextUpEnabled(newVal);
              showToast(newVal ? "I'll give you a heads up when something's next" : "Got it — no reminders");
            }}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              isNextUpEnabled() ? "bg-[#514636]" : "bg-[#d9cfc0]"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                isNextUpEnabled() ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
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
  const dateStr = dayDate.split("T")[0];
  const day = new Date(dateStr + "T12:00:00");
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

function sharePlan(day: Day, exps: Experience[], reservations: any[], accommodations: any[], showToast: (msg: string, type?: string) => void) {
  const date = new Date(day.date).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
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
    showToast("Copied — ready to share", "success");
  }
}
