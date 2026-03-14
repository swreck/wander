import { useState, useMemo } from "react";
import { api } from "../lib/api";
import type { Day, Experience, Trip, RouteSegment } from "../lib/types";
import RatingsBadge from "./RatingsBadge";
import AIObservations from "./AIObservations";
import FirstTimeGuide from "./FirstTimeGuide";
import { useToast } from "../contexts/ToastContext";

type IntraCityMode = "walk" | "subway" | "train" | "bus" | "taxi" | "shuttle" | "other";

const MODE_EMOJI: Record<string, string> = {
  flight: "✈️", train: "🚃", ferry: "⛴️", drive: "🚗", other: "🚐",
  walk: "🚶", subway: "🚇", bus: "🚌", taxi: "🚕", shuttle: "🚐",
};

const INTRA_MODES: { value: IntraCityMode; label: string; emoji: string }[] = [
  { value: "walk", label: "Walk", emoji: "🚶" },
  { value: "subway", label: "Subway", emoji: "🚇" },
  { value: "train", label: "Train", emoji: "🚃" },
  { value: "bus", label: "Bus", emoji: "🚌" },
  { value: "taxi", label: "Taxi", emoji: "🚕" },
  { value: "shuttle", label: "Shuttle", emoji: "🚐" },
];

interface Props {
  day: Day;
  experiences: Experience[];
  trip: Trip;
  onClose: () => void;
  onPromote: (expId: string, dayId: string, routeSegmentId?: string, timeWindow?: string) => void;
  onDemote: (expId: string) => void;
  onExperienceClick: (id: string) => void;
  onRefresh: () => void;
}

function AIObsDisclosure({ dayId }: { dayId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm text-[#a89880] hover:text-[#6b5d4a] transition-colors"
      >
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[#c8bba8] text-xs font-medium">
          i
        </span>
        <span>AI Observations</span>
        <span className="text-[8px]">{open ? "▲" : "▼"}</span>
      </button>
      {open && <AIObservations dayId={dayId} />}
    </div>
  );
}

/** Intercity travel card — shows route segment with full logistics on city-transition days */
function TransportCard({ day, trip, onRefresh }: { day: Day; trip: Trip; onRefresh: () => void }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);

  const sortedDays = useMemo(() =>
    [...(trip.days || [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [trip.days]
  );
  const dayIdx = sortedDays.findIndex((d) => d.id === day.id);
  const prev = dayIdx > 0 ? sortedDays[dayIdx - 1] : null;

  // Only show on city transition days
  if (!prev || prev.cityId === day.cityId) return null;

  const segment = trip.routeSegments?.find(
    (rs) => rs.originCity === prev.city.name && rs.destinationCity === day.city.name
  );

  const emoji = segment ? (MODE_EMOJI[segment.transportMode.toLowerCase()] || "🚐") : "🚐";

  // Edit form state
  const [mode, setMode] = useState(segment?.transportMode || "train");
  const [depDate, setDepDate] = useState(segment?.departureDate?.split("T")[0] || "");
  const [depTime, setDepTime] = useState(segment?.departureTime || "");
  const [arrTime, setArrTime] = useState(segment?.arrivalTime || "");
  const [depStation, setDepStation] = useState(segment?.departureStation || "");
  const [arrStation, setArrStation] = useState(segment?.arrivalStation || "");
  const [serviceNum, setServiceNum] = useState(segment?.serviceNumber || "");
  const [confNum, setConfNum] = useState(segment?.confirmationNumber || "");
  const [seat, setSeat] = useState(segment?.seatInfo || "");
  const [notes, setNotes] = useState(segment?.notes || "");

  async function saveSegment() {
    try {
      const data = {
        transportMode: mode,
        departureDate: depDate || null,
        departureTime: depTime || null,
        arrivalTime: arrTime || null,
        departureStation: depStation || null,
        arrivalStation: arrStation || null,
        serviceNumber: serviceNum || null,
        confirmationNumber: confNum || null,
        seatInfo: seat || null,
        notes: notes || null,
      };

      if (segment) {
        await api.patch(`/route-segments/${segment.id}`, data);
      } else {
        await api.post("/route-segments", {
          ...data,
          tripId: trip.id,
          originCity: prev!.city.name,
          destinationCity: day.city.name,
        });
      }
      setEditing(false);
      showToast("Travel details saved");
      onRefresh();
    } catch {
      showToast("Couldn't save travel details", "error");
    }
  }

  if (editing) {
    return (
      <div className="mb-4 px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
        <div className="text-sm font-medium text-amber-800 mb-2">
          {prev.city.name} → {day.city.name}
        </div>
        {/* Mode selector */}
        <div className="flex gap-1.5 flex-wrap">
          {(["flight", "train", "ferry", "drive", "other"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                mode === m ? "bg-amber-600 text-white" : "bg-white text-amber-700 border border-amber-200"
              }`}
            >
              {MODE_EMOJI[m]} {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        {/* Service number + confirmation */}
        <div className="flex gap-2">
          <input type="text" value={serviceNum} onChange={(e) => setServiceNum(e.target.value)}
            placeholder={mode === "flight" ? "Flight # (e.g. NH204)" : "Service # (e.g. Nozomi 42)"}
            className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
          <input type="text" value={confNum} onChange={(e) => setConfNum(e.target.value)}
            placeholder="Confirmation #"
            className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        {/* Date + departure/arrival times */}
        <div className="flex gap-2">
          <input type="date" value={depDate} onChange={(e) => setDepDate(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] focus:outline-none focus:ring-1 focus:ring-amber-400" />
          <input type="time" value={depTime} onChange={(e) => setDepTime(e.target.value)}
            placeholder="Depart"
            className="w-24 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] focus:outline-none focus:ring-1 focus:ring-amber-400" />
          <input type="time" value={arrTime} onChange={(e) => setArrTime(e.target.value)}
            placeholder="Arrive"
            className="w-24 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] focus:outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        {/* Stations */}
        <div className="flex gap-2">
          <input type="text" value={depStation} onChange={(e) => setDepStation(e.target.value)}
            placeholder="From station/airport"
            className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
          <input type="text" value={arrStation} onChange={(e) => setArrStation(e.target.value)}
            placeholder="To station/airport"
            className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        {/* Seat + notes */}
        <div className="flex gap-2">
          <input type="text" value={seat} onChange={(e) => setSeat(e.target.value)}
            placeholder="Seat info"
            className="w-28 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        {/* Save / Cancel */}
        <div className="flex gap-2 pt-1">
          <button onClick={saveSegment}
            className="px-4 py-1.5 rounded bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors">
            Save
          </button>
          <button onClick={() => setEditing(false)}
            className="px-4 py-1.5 rounded text-xs text-amber-700 hover:bg-amber-100 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mb-4 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer hover:bg-amber-100 transition-colors"
      onClick={() => setEditing(true)}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-amber-800">
          {emoji} {prev.city.name} → {day.city.name}
        </div>
        <span className="text-xs text-amber-500">tap to edit</span>
      </div>
      {segment ? (
        <div className="mt-1 space-y-0.5">
          <div className="text-sm text-amber-700">
            {segment.transportMode.charAt(0).toUpperCase() + segment.transportMode.slice(1)}
            {segment.serviceNumber && ` · ${segment.serviceNumber}`}
            {segment.departureDate && ` · ${new Date(segment.departureDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </div>
          {(segment.departureTime || segment.arrivalTime) && (
            <div className="text-sm text-amber-600">
              {segment.departureTime && `Depart ${segment.departureTime}`}
              {segment.departureTime && segment.arrivalTime && " → "}
              {segment.arrivalTime && `Arrive ${segment.arrivalTime}`}
            </div>
          )}
          {(segment.departureStation || segment.arrivalStation) && (
            <div className="text-sm text-amber-600">
              {segment.departureStation}{segment.departureStation && segment.arrivalStation && " → "}{segment.arrivalStation}
            </div>
          )}
          {segment.confirmationNumber && (
            <button onClick={() => { navigator.clipboard.writeText(segment.confirmationNumber!); showToast("Copied confirmation number"); }}
              className="text-xs text-amber-500 hover:text-amber-700 transition-colors">Conf: {segment.confirmationNumber} 📋</button>
          )}
          {segment.seatInfo && (
            <div className="text-xs text-amber-500">Seat: {segment.seatInfo}</div>
          )}
          {segment.notes && (
            <div className="text-sm text-amber-600 italic">{segment.notes}</div>
          )}
        </div>
      ) : (
        <div className="text-sm text-amber-600 mt-0.5 italic">
          No travel details yet — tap to add
        </div>
      )}
    </div>
  );
}

/** Transport connector between two experiences — shows mode + estimated time */
function TransportConnector({
  prevExp, nextExp, useSpatialOrder, onRefresh,
}: {
  prevExp: Experience;
  nextExp: Experience;
  useSpatialOrder: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localMode, setLocalMode] = useState<IntraCityMode | null>(null);
  const { showToast } = useToast();

  // Calculate distance-based estimates
  const hasCoords = prevExp.latitude != null && nextExp.latitude != null;
  const distKm = hasCoords ? (() => {
    const dx = (nextExp.latitude! - prevExp.latitude!) * 111;
    const dy = (nextExp.longitude! - prevExp.longitude!) * 111 * Math.cos(prevExp.latitude! * Math.PI / 180);
    return Math.sqrt(dx * dx + dy * dy);
  })() : null;

  // Current mode for this experience (stored on the destination experience)
  const currentMode = localMode || (nextExp.transportModeToHere as IntraCityMode) || "walk";
  const modeEmoji = MODE_EMOJI[currentMode] || "🚶";

  // Estimate minutes based on mode
  const speeds: Record<string, number> = { walk: 5, subway: 30, train: 25, bus: 20, taxi: 30, shuttle: 25, other: 20 };
  const estMin = distKm ? Math.round((distKm * 1.4 / (speeds[currentMode] || 5)) * 60) : null;

  async function handleSetMode(mode: IntraCityMode) {
    try {
      setLocalMode(mode);
      setExpanded(false);
      await api.patch(`/experiences/${nextExp.id}`, { transportModeToHere: mode });
      onRefresh();
    } catch {
      setLocalMode(null);
      showToast("Couldn't update travel mode", "error");
    }
  }

  // Always show if the user has explicitly set a non-walk mode
  const hasExplicitMode = nextExp.transportModeToHere != null && nextExp.transportModeToHere !== "walk";
  // Hide only if: no coords AND no explicit mode AND spatial ordering is off
  if (!hasCoords && !hasExplicitMode && !useSpatialOrder) return null;
  // Hide trivially short walks (< 1 min) unless mode was explicitly set
  if (estMin != null && estMin < 1 && currentMode === "walk" && !hasExplicitMode) return null;

  return (
    <div className="py-0.5 px-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-sm text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
      >
        <span className="flex-1 border-t border-dashed border-[#e0d8cc]" />
        <span className="flex items-center gap-1 shrink-0">
          {modeEmoji}
          {estMin != null && <span>{estMin} min</span>}
        </span>
        <span className="flex-1 border-t border-dashed border-[#e0d8cc]" />
      </button>
      {expanded && (
        <div className="flex gap-1 justify-center mt-1 mb-0.5">
          {INTRA_MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => handleSetMode(m.value)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                currentMode === m.value
                  ? "bg-[#514636] text-white"
                  : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
              }`}
            >
              {m.emoji} {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DayView({
  day, experiences, trip, onClose, onPromote, onDemote, onExperienceClick, onRefresh,
}: Props) {
  const { showToast } = useToast();
  const dayDate = new Date(day.date);
  const formattedDate = dayDate.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  // Selected experiences for this day
  const selectedForDay = experiences.filter(
    (e) => e.state === "selected" && e.dayId === day.id
  );

  // Possible experiences for this city
  const possibleForCity = experiences.filter(
    (e) => e.state === "possible" && e.cityId === day.cityId
  );

  // Reservations (already included in day data)
  const reservations = day.reservations || [];
  const accommodations = day.accommodations || [];

  // Day notes editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(day.notes || "");
  const [editingZone, setEditingZone] = useState(false);
  const [zoneText, setZoneText] = useState(day.explorationZone || "");

  // Friction alerts
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("wander:dismissed-alerts");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  function dismissAlert(key: string) {
    setDismissedAlerts(prev => {
      const next = new Set(prev);
      next.add(key);
      localStorage.setItem("wander:dismissed-alerts", JSON.stringify([...next]));
      return next;
    });
  }

  const frictionAlerts = useMemo(() => {
    const alerts: { key: string; message: string }[] = [];

    // Density imbalance
    if (selectedForDay.length >= 5 && trip.days) {
      const sameCityDays = trip.days
        .filter(d => d.cityId === day.cityId)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const dayIdx = sameCityDays.findIndex(d => d.id === day.id);
      const adjacent = [sameCityDays[dayIdx - 1], sameCityDays[dayIdx + 1]].filter(Boolean);
      for (const adj of adjacent) {
        const adjCount = experiences.filter(e => e.state === "selected" && e.dayId === adj.id).length;
        if (adjCount <= 1) {
          const adjDate = new Date(adj.date).toLocaleDateString("en-US", { weekday: "long" });
          alerts.push({
            key: `density-${day.id}-${adj.id}`,
            message: `${selectedForDay.length} planned here — ${adjDate} is open. Consider spreading out.`,
          });
        }
      }
    }

    // Distance warnings between consecutive experiences
    const locatedSelected = selectedForDay.filter(e => e.latitude != null && e.longitude != null);
    for (let i = 1; i < locatedSelected.length; i++) {
      const prev = locatedSelected[i - 1];
      const curr = locatedSelected[i];
      const dx = (curr.latitude! - prev.latitude!) * 111;
      const dy = (curr.longitude! - prev.longitude!) * 111 * Math.cos(prev.latitude! * Math.PI / 180);
      const distKm = Math.sqrt(dx * dx + dy * dy);
      if (distKm > 3) {
        alerts.push({
          key: `distance-${prev.id}-${curr.id}`,
          message: `${prev.name} and ${curr.name} are ~${distKm.toFixed(1)}km apart.`,
        });
      }
    }

    return alerts.filter(a => !dismissedAlerts.has(a.key));
  }, [selectedForDay, experiences, day, trip.days, dismissedAlerts]);

  // Spatial sequence — ON by default when 2+ located experiences exist
  const canShowSpatial = selectedForDay.filter(e => e.latitude != null).length >= 2;
  const [spatialOverridden, setSpatialOverridden] = useState(false);

  const spatiallyOrdered = useMemo(() => {
    const located = selectedForDay.filter(e => e.latitude != null && e.longitude != null);
    if (located.length < 2) return selectedForDay;

    const startLat = accommodations[0]?.latitude ?? located[0].latitude!;
    const startLng = accommodations[0]?.longitude ?? located[0].longitude!;

    // Nearest-neighbor greedy sort, respecting time windows
    const morning = located.filter(e => e.timeWindow?.toLowerCase() === "morning");
    const afternoon = located.filter(e => e.timeWindow?.toLowerCase() === "afternoon");
    const evening = located.filter(e => e.timeWindow?.toLowerCase() === "evening");
    const unslotted = located.filter(e => !["morning", "afternoon", "evening"].includes(e.timeWindow?.toLowerCase() || ""));

    function nearestSort(items: Experience[], fromLat: number, fromLng: number): Experience[] {
      const result: Experience[] = [];
      const remaining = [...items];
      let curLat = fromLat, curLng = fromLng;
      while (remaining.length > 0) {
        let bestIdx = 0, bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const dx = (remaining[i].latitude! - curLat) * 111;
          const dy = (remaining[i].longitude! - curLng) * 111 * Math.cos(curLat * Math.PI / 180);
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        }
        const next = remaining.splice(bestIdx, 1)[0];
        result.push(next);
        curLat = next.latitude!;
        curLng = next.longitude!;
      }
      return result;
    }

    const sortedMorning = nearestSort(morning, startLat, startLng);
    const lastMorning = sortedMorning.length > 0 ? sortedMorning[sortedMorning.length - 1] : null;
    const sortedUnslotted = nearestSort(unslotted, lastMorning?.latitude ?? startLat, lastMorning?.longitude ?? startLng);
    const lastMid = sortedUnslotted.length > 0 ? sortedUnslotted[sortedUnslotted.length - 1] : lastMorning;
    const sortedAfternoon = nearestSort(afternoon, lastMid?.latitude ?? startLat, lastMid?.longitude ?? startLng);
    const lastAfternoon = sortedAfternoon.length > 0 ? sortedAfternoon[sortedAfternoon.length - 1] : lastMid;
    const sortedEvening = nearestSort(evening, lastAfternoon?.latitude ?? startLat, lastAfternoon?.longitude ?? startLng);

    const unlocated = selectedForDay.filter(e => e.latitude == null || e.longitude == null);
    return [...sortedMorning, ...sortedUnslotted, ...sortedAfternoon, ...sortedEvening, ...unlocated];
  }, [selectedForDay, accommodations]);

  // Show spatial order by default (unless user turned it off)
  const useSpatialOrder = canShowSpatial && !spatialOverridden;
  const displaySelected = useSpatialOrder ? spatiallyOrdered : selectedForDay;

  // Add reservation
  const [addingRes, setAddingRes] = useState(false);
  const [resName, setResName] = useState("");
  const [resTime, setResTime] = useState("");
  const [resNotes, setResNotes] = useState("");
  const [resType, setResType] = useState<string>("restaurant");

  async function saveNotes() {
    try {
      await api.patch(`/days/${day.id}`, { notes: notesText || null });
      setEditingNotes(false);
      showToast("Notes saved");
      onRefresh();
    } catch {
      showToast("Couldn't save notes", "error");
    }
  }

  async function saveZone() {
    try {
      await api.patch(`/days/${day.id}`, { explorationZone: zoneText || null });
      setEditingZone(false);
      showToast("Exploration zone saved");
      onRefresh();
    } catch {
      showToast("Couldn't save zone", "error");
    }
  }

  async function addReservation() {
    if (!resName.trim() || !resTime) return;
    const dateStr = day.date.split("T")[0];
    try {
      await api.post("/reservations", {
        tripId: trip.id,
        dayId: day.id,
        name: resName.trim(),
        type: resType,
        datetime: `${dateStr}T${resTime}:00`,
        notes: resNotes.trim() || null,
      });
      setAddingRes(false);
      setResName("");
      setResTime("");
      setResNotes("");
      showToast("Reservation added");
      onRefresh();
    } catch {
      showToast("Couldn't add reservation", "error");
    }
  }

  async function handleApplySpatialOrder() {
    const orderedIds = spatiallyOrdered.map(e => e.id);
    try {
      await api.post("/experiences/reorder", { orderedIds });
      showToast("Route order applied");
      onRefresh();
    } catch {
      showToast("Couldn't save order", "error");
    }
  }

  return (
    <div className="p-4" style={{ paddingTop: "max(16px, env(safe-area-inset-top, 16px))" }}>
      {/* First-time guide for day view */}
      <FirstTimeGuide
        id="day-view"
        lines={[
          "Experiences are sorted by walking distance for the best route",
          "Amber alerts warn when a day is packed or distances are long",
          "Tap an experience to see details, or the arrow to move it",
          "Add reservations with times so the Now screen can remind you",
        ]}
      />

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-light text-[#3a3128]">{formattedDate}</h2>
          <p className="text-sm text-[#8a7a62]">
            {day.city.name}
            {day.city.tagline && <span className="ml-1 text-[#a89880]">· {day.city.tagline}</span>}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-sm text-[#8a7a62] hover:text-[#3a3128]"
        >
          &times;
        </button>
      </div>

      {/* Travel card — shown on city transition days */}
      <TransportCard day={day} trip={trip} onRefresh={onRefresh} />

      {/* Accommodation anchor — with full details */}
      {accommodations.length > 0 && (
        <div className="mb-6">
          {accommodations.map((acc) => (
            <div key={acc.id} className="px-3 py-2.5 bg-[#f0ece5] rounded-lg text-sm">
              <div className="font-medium text-[#3a3128]">{acc.name}</div>
              {acc.address && (
                acc.latitude != null && acc.longitude != null ? (
                  <a href={`https://maps.apple.com/?daddr=${acc.latitude},${acc.longitude}`} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-[#8a7a62] mt-0.5 underline decoration-[#d0c9be] block">{acc.address}</a>
                ) : (
                  <div className="text-sm text-[#8a7a62] mt-0.5">{acc.address}</div>
                )
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-sm text-[#a89880]">
                {acc.checkInTime && <span>Check-in: {acc.checkInTime}</span>}
                {acc.checkOutTime && <span>Check-out: {acc.checkOutTime}</span>}
                {acc.confirmationNumber && (
                  <button onClick={() => { navigator.clipboard.writeText(acc.confirmationNumber!); showToast("Copied confirmation number"); }}
                    className="hover:text-[#514636] transition-colors">Conf: {acc.confirmationNumber} 📋</button>
                )}
              </div>
              {acc.notes && <div className="text-sm text-[#6b5d4a] mt-1 italic">{acc.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {/* AI Observations — hidden behind disclosure icon */}
      {selectedForDay.length > 0 && (
        <AIObsDisclosure dayId={day.id} />
      )}

      {/* Friction alerts */}
      {frictionAlerts.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {frictionAlerts.map(alert => (
            <div key={alert.key} className="flex items-start gap-2 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-800 border border-amber-100">
              <span className="flex-1">{alert.message}</span>
              <button
                onClick={() => dismissAlert(alert.key)}
                className="text-amber-400 hover:text-amber-600 shrink-0"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Spatial sequence indicator — shown when active */}
      {canShowSpatial && (
        <div className="flex items-center justify-between mb-2">
          {useSpatialOrder ? (
            <>
              <span className="text-xs uppercase tracking-wider text-[#a89880]">
                Route order
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleApplySpatialOrder}
                  className="text-xs text-[#514636] hover:text-[#3a3128] font-medium"
                >
                  Save this order
                </button>
                <button
                  onClick={() => setSpatialOverridden(true)}
                  className="text-sm text-[#c8bba8] hover:text-[#8a7a62]"
                >
                  Use my order
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setSpatialOverridden(false)}
              className="text-xs uppercase tracking-wider text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
            >
              Show route order
            </button>
          )}
        </div>
      )}

      {/* Selected experiences */}
      <div className="space-y-4 mb-6">
        {displaySelected.map((exp, idx) => (
          <div key={exp.id}>
            {/* Transport connector between consecutive experiences */}
            {idx > 0 && (
              <TransportConnector
                prevExp={displaySelected[idx - 1]}
                nextExp={exp}
                useSpatialOrder={useSpatialOrder}
                onRefresh={onRefresh}
              />
            )}
            <div
              className="px-4 py-3 bg-[#faf8f5] rounded-lg border border-[#e0d8cc] cursor-pointer
                         hover:border-[#a89880] transition-colors active:bg-[#f0ece5]"
              onClick={() => onExperienceClick(exp.id)}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#3a3128]">{exp.name}</span>
                <div className="flex items-center gap-2">
                  {exp.timeWindow && (
                    <span className="text-sm text-[#a89880]">{exp.timeWindow}</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDemote(exp.id); }}
                    className="text-sm text-[#c8bba8] hover:text-[#8a7a62] p-1"
                    aria-label="Move to candidates"
                  >
                    &darr;
                  </button>
                </div>
              </div>
              {exp.description && (
                <p className="text-sm text-[#8a7a62] mt-1 line-clamp-2">{exp.description}</p>
              )}
              {exp.userNotes && (
                <p className="text-sm text-[#6b5d4a] mt-1 italic line-clamp-2">{exp.userNotes}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <RatingsBadge ratings={exp.ratings} placeIdGoogle={exp.placeIdGoogle} />
                {exp.createdBy && (
                  <span className="text-sm text-[#c8bba8] ml-auto">by {exp.createdBy}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reservations */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#a89880]">
            Reservations
          </h3>
          <button
            onClick={() => setAddingRes(!addingRes)}
            className="text-sm text-[#a89880] hover:text-[#514636]"
          >
            {addingRes ? "Cancel" : "+ Add"}
          </button>
        </div>
        {addingRes && (
          <div className="mb-3 p-3 bg-[#faf8f5] rounded-lg border border-[#e0d8cc] space-y-2">
            <input
              type="text"
              value={resName}
              onChange={(e) => setResName(e.target.value)}
              placeholder="Restaurant or activity name"
              className="w-full px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                         placeholder-[#c8bba8] focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            />
            <div className="flex gap-2">
              <input
                type="time"
                value={resTime}
                onChange={(e) => setResTime(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                           focus:outline-none focus:ring-2 focus:ring-[#a89880]"
              />
              <select
                value={resType}
                onChange={(e) => setResType(e.target.value)}
                className="px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                           focus:outline-none focus:ring-2 focus:ring-[#a89880]"
              >
                <option value="restaurant">Restaurant</option>
                <option value="activity">Activity</option>
                <option value="transport">Transport</option>
                <option value="other">Other</option>
              </select>
            </div>
            <input
              type="text"
              value={resNotes}
              onChange={(e) => setResNotes(e.target.value)}
              placeholder="Notes (confirmation number, seat, etc.)"
              className="w-full px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                         placeholder-[#c8bba8] focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            />
            <button
              onClick={addReservation}
              disabled={!resName.trim() || !resTime}
              className="w-full py-1.5 rounded bg-[#514636] text-white text-xs font-medium
                         hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
            >
              Add Reservation
            </button>
          </div>
        )}
        {reservations.length > 0 ? (
          <div className="space-y-2">
            {reservations.map((res) => (
              <div key={res.id} className="px-3 py-2 bg-[#faf8f5] rounded-lg border border-[#e0d8cc]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#3a3128]">
                    {res.latitude != null && res.longitude != null ? (
                      <a href={`https://maps.apple.com/?daddr=${res.latitude},${res.longitude}`} target="_blank" rel="noopener noreferrer"
                        className="underline decoration-[#d0c9be]">{res.name}</a>
                    ) : res.name}
                  </span>
                  <span className="text-sm text-[#8a7a62]">
                    {new Date(res.datetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                {res.confirmationNumber && (
                  <button onClick={() => { navigator.clipboard.writeText(res.confirmationNumber!); showToast("Copied confirmation number"); }}
                    className="text-sm text-[#a89880] mt-0.5 hover:text-[#514636] transition-colors">Conf: {res.confirmationNumber} 📋</button>
                )}
                {res.notes && <p className="text-sm text-[#a89880] mt-0.5">{res.notes}</p>}
              </div>
            ))}
          </div>
        ) : !addingRes && (
          <p className="text-sm text-[#c8bba8]">No reservations yet</p>
        )}
      </div>

      {/* Exploration zone */}
      <div className="mb-6">
        {editingZone ? (
          <div className="space-y-2">
            <input
              type="text"
              value={zoneText}
              onChange={(e) => setZoneText(e.target.value)}
              placeholder="e.g. Higashiyama district"
              className="w-full px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                         placeholder-[#c8bba8] focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            />
            <div className="flex gap-2">
              <button onClick={saveZone} className="px-3 py-1 rounded bg-[#514636] text-white text-xs">Save</button>
              <button onClick={() => setEditingZone(false)} className="text-sm text-[#8a7a62]">Cancel</button>
            </div>
          </div>
        ) : (
          <div
            className="px-3 py-2 bg-[#f0ece5] rounded-lg cursor-pointer hover:bg-[#e8e2d8] transition-colors"
            onClick={() => setEditingZone(true)}
          >
            <span className="text-xs font-medium text-[#a89880]">Exploration Zone: </span>
            <span className="text-sm text-[#6b5d4a]">{day.explorationZone || "Tap to set..."}</span>
          </div>
        )}
      </div>

      {/* Day notes */}
      <div className="mb-6">
        {editingNotes ? (
          <div className="space-y-2">
            <textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              rows={3}
              placeholder="Day notes..."
              className="w-full px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                         placeholder-[#c8bba8] focus:outline-none focus:ring-2 focus:ring-[#a89880] resize-y"
            />
            <div className="flex gap-2">
              <button onClick={saveNotes} className="px-3 py-1 rounded bg-[#514636] text-white text-xs">Save</button>
              <button onClick={() => setEditingNotes(false)} className="text-sm text-[#8a7a62]">Cancel</button>
            </div>
          </div>
        ) : (
          <div
            className="px-3 py-2 bg-white rounded-lg border border-[#f0ece5] cursor-pointer
                       hover:border-[#e0d8cc] transition-colors"
            onClick={() => setEditingNotes(true)}
          >
            <span className="text-sm text-[#8a7a62]">{day.notes || "Tap to add notes..."}</span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-dashed border-[#e0d8cc] my-4" />

      {/* Candidate zone */}
      <h3 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">
        {possibleForCity.length} Possible in {day.city.name}
      </h3>
      <div className="space-y-1.5">
        {possibleForCity.map((exp) => (
          <div
            key={exp.id}
            className="px-3 py-2 bg-white rounded-lg border border-[#f0ece5]
                       hover:border-[#e0d8cc] cursor-pointer transition-colors active:bg-[#faf8f5]"
            onClick={() => onExperienceClick(exp.id)}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#3a3128]">{exp.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPromote(exp.id, day.id);
                }}
                className="text-sm text-[#a89880] hover:text-[#514636] p-1"
                aria-label="Add to this day"
              >
                &uarr;
              </button>
            </div>
            {exp.description && (
              <p className="text-sm text-[#a89880] mt-0.5 line-clamp-1">{exp.description}</p>
            )}
            {exp.userNotes && (
              <p className="text-sm text-[#6b5d4a] mt-0.5 italic line-clamp-1">{exp.userNotes}</p>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <RatingsBadge ratings={exp.ratings} placeIdGoogle={exp.placeIdGoogle} />
              {exp.createdBy && (
                <span className="text-sm text-[#c8bba8] ml-auto">by {exp.createdBy}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
