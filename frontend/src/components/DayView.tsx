/**
 * DayView — Container for a single day's content.
 *
 * 2.0: The body is now a DayTimeline (continuous time-ordered flow) instead of
 * separate sections for experiences, reservations, and candidates. The candidate
 * zone is gone — possible experiences belong to the city board, not the day.
 */

import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import type { Day, Experience, Trip, ExperienceInterest, Decision } from "../lib/types";
import AIObservations from "./AIObservations";
import FirstTimeGuide from "./FirstTimeGuide";
import DayTimeline from "./DayTimeline";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";

const MODE_EMOJI: Record<string, string> = {
  flight: "\u2708\uFE0F", train: "\uD83D\uDE83", ferry: "\u26F4\uFE0F",
  drive: "\uD83D\uDE97", other: "\uD83D\uDE90",
};

interface Props {
  day: Day;
  experiences: Experience[];
  trip: Trip;
  onClose: () => void;
  onPromote: (expId: string, dayId: string, routeSegmentId?: string, timeWindow?: string) => void;
  onDemote: (expId: string) => void;
  onExperienceClick: (id: string) => void;
  onRefresh: () => void;
  interests?: Map<string, ExperienceInterest>;
}

// ─── Sub-components ──────────────────────────────────────────────

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
        <span className="text-[8px]">{open ? "\u25B2" : "\u25BC"}</span>
      </button>
      {open && <AIObservations dayId={dayId} />}
    </div>
  );
}

/** Intercity travel card — shown on city-transition days */
function TransportCard({ day, trip, onRefresh }: { day: Day; trip: Trip; onRefresh: () => void }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);

  const sortedDays = useMemo(() =>
    [...(trip.days || [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [trip.days]
  );
  const dayIdx = sortedDays.findIndex((d) => d.id === day.id);
  const prev = dayIdx > 0 ? sortedDays[dayIdx - 1] : null;

  if (!prev || prev.cityId === day.cityId) return null;

  const segment = trip.routeSegments?.find(
    (rs) => rs.originCity === prev.city.name && rs.destinationCity === day.city.name
  );

  const emoji = segment ? (MODE_EMOJI[segment.transportMode.toLowerCase()] || "\uD83D\uDE90") : "\uD83D\uDE90";

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
      showToast("Got it");
      onRefresh();
    } catch {
      showToast("That didn't save \u2014 try again?", "error");
    }
  }

  if (editing) {
    return (
      <div className="mb-4 px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
        <div className="text-sm font-medium text-amber-800 mb-2">
          {prev.city.name} → {day.city.name}
        </div>
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
        <div className="flex gap-2">
          <input type="text" value={serviceNum} onChange={(e) => setServiceNum(e.target.value)}
            placeholder={mode === "flight" ? "Flight # (e.g. NH204)" : "Service # (e.g. Nozomi 42)"}
            className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
          <input type="text" value={confNum} onChange={(e) => setConfNum(e.target.value)}
            placeholder="Confirmation #"
            className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
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
        <div className="flex gap-2">
          <input type="text" value={depStation} onChange={(e) => setDepStation(e.target.value)}
            placeholder="From station/airport"
            className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
          <input type="text" value={arrStation} onChange={(e) => setArrStation(e.target.value)}
            placeholder="To station/airport"
            className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        <div className="flex gap-2">
          <input type="text" value={seat} onChange={(e) => setSeat(e.target.value)}
            placeholder="Seat info"
            className="w-28 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
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
            {segment.serviceNumber && ` \u00B7 ${segment.serviceNumber}`}
            {segment.departureDate && ` \u00B7 ${new Date(segment.departureDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </div>
          {(segment.departureTime || segment.arrivalTime) && (
            <div className="text-sm text-amber-600">
              {segment.departureTime && `Depart ${segment.departureTime}`}
              {segment.departureTime && segment.arrivalTime && " →"}
              {segment.arrivalTime && `Arrive ${segment.arrivalTime}`}
            </div>
          )}
          {(segment.departureStation || segment.arrivalStation) && (
            <div className="text-sm text-amber-600">
              {segment.departureStation}{segment.departureStation && segment.arrivalStation && " →"}{segment.arrivalStation}
            </div>
          )}
          {segment.confirmationNumber && (
            <button onClick={() => { navigator.clipboard.writeText(segment.confirmationNumber!); showToast("Copied"); }}
              className="text-xs text-amber-500 hover:text-amber-700 transition-colors">Conf: {segment.confirmationNumber} \uD83D\uDCCB</button>
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
          Tap to add travel details
        </div>
      )}
    </div>
  );
}

// ─── Main DayView ────────────────────────────────────────────────

export default function DayView({
  day, experiences, trip, onClose, onPromote, onDemote, onExperienceClick, onRefresh, interests,
}: Props) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const isGuided = day.dayType === "guided";

  // Day-level decisions (choices)
  const [dayDecisions, setDayDecisions] = useState<Decision[]>([]);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    api.get<Decision[]>(`/decisions/trip/${trip.id}`)
      .then((decs) => setDayDecisions(decs.filter((d) => d.dayId === day.id && d.status === "open")))
      .catch(() => {});
  }, [trip.id, day.id]);

  async function castVote(decisionId: string, optionId: string | null) {
    setVoting(true);
    try {
      await api.post(`/decisions/${decisionId}/vote`, { optionId });
      showToast("Vote cast");
      const decs = await api.get<Decision[]>(`/decisions/trip/${trip.id}`);
      setDayDecisions(decs.filter((d) => d.dayId === day.id && d.status === "open"));
    } catch {
      showToast("Vote didn't stick — try again?", "error");
    } finally {
      setVoting(false);
    }
  }
  const dayDate = new Date(day.date);
  const formattedDate = dayDate.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });

  const selectedForDay = experiences.filter(
    (e) => e.state === "selected" && e.dayId === day.id
  );

  // Day notes editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(day.notes || "");
  const [editingZone, setEditingZone] = useState(false);
  const [zoneText, setZoneText] = useState(day.explorationZone || "");

  // Friction alerts — suppressed for guided days
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
    if (isGuided) return []; // Guided days don't need planning alerts

    const alerts: { key: string; message: string }[] = [];

    if (selectedForDay.length >= 5 && trip.days) {
      const sameCityDays = trip.days
        .filter(d => d.cityId === day.cityId)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const dayIdx = sameCityDays.findIndex(d => d.id === day.id);
      const adjacent = [sameCityDays[dayIdx - 1], sameCityDays[dayIdx + 1]].filter(Boolean);
      for (const adj of adjacent) {
        const adjCount = experiences.filter(e => e.state === "selected" && e.dayId === adj.id).length;
        if (adjCount <= 1) {
          const adjDate = new Date(adj.date).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
          alerts.push({
            key: `density-${day.id}-${adj.id}`,
            message: `${selectedForDay.length} planned here \u2014 ${adjDate} is open. Consider spreading out.`,
          });
        }
      }
    }

    const locatedSelected = selectedForDay.filter(e => e.latitude != null && e.longitude != null);
    for (let i = 1; i < locatedSelected.length; i++) {
      const prev = locatedSelected[i - 1];
      const curr = locatedSelected[i];
      const dx = (curr.latitude! - prev.latitude!) * 111;
      const dy = (curr.longitude! - prev.longitude!) * 111 * Math.cos(prev.latitude! * Math.PI / 180);
      const distKm = Math.sqrt(dx * dx + dy * dy);
      if (distKm > 3) {
        const walkMin = Math.round((distKm / 5) * 60);
        alerts.push({
          key: `distance-${prev.id}-${curr.id}`,
          message: `${prev.name} and ${curr.name} are ${distKm.toFixed(1)}km apart (~${walkMin} min walk)`,
        });
      }
    }

    return alerts.filter(a => !dismissedAlerts.has(a.key));
  }, [selectedForDay, experiences, day, trip.days, dismissedAlerts, isGuided]);

  // Add reservation form
  const [addingRes, setAddingRes] = useState(false);
  const [resName, setResName] = useState("");
  const [resTime, setResTime] = useState("");
  const [resNotes, setResNotes] = useState("");
  const [resType, setResType] = useState<string>("restaurant");

  async function saveNotes() {
    try {
      await api.patch(`/days/${day.id}`, { notes: notesText || null });
      setEditingNotes(false);
      showToast("Got it");
      onRefresh();
    } catch {
      showToast("That didn't save \u2014 try again?", "error");
    }
  }

  async function saveZone() {
    try {
      await api.patch(`/days/${day.id}`, { explorationZone: zoneText || null });
      setEditingZone(false);
      showToast("Got it");
      onRefresh();
    } catch {
      showToast("That didn't save \u2014 try again?", "error");
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
      showToast("Added");
      onRefresh();
    } catch {
      showToast("Couldn't add that \u2014 try again?", "error");
    }
  }

  return (
    <div className="p-4" style={{ paddingTop: "max(16px, env(safe-area-inset-top, 16px))" }}>
      {/* First-time guide */}
      <FirstTimeGuide
        id="day-view-2"
        lines={[
          "Your day flows from morning to evening \u2014 reservations and activities in time order",
          "A dashed rose outline means a place that usually needs a reservation",
          "Tap any item to see details, use the arrow to move it back to city ideas",
          "Add personal reminders that only you can see",
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isGuided && (
            <span className="w-6 h-6 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
              B
            </span>
          )}
          <div>
            <h2 className="text-lg font-light text-[#3a3128]">{formattedDate}</h2>
            <p className="text-sm text-[#8a7a62]">
              {day.city.name}
              {day.city.tagline && <span className="ml-1 text-[#a89880]">\u00B7 {day.city.tagline}</span>}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-sm text-[#8a7a62] hover:text-[#3a3128]"
        >
          &times;
        </button>
      </div>

      {/* Travel card — city transition days */}
      <TransportCard day={day} trip={trip} onRefresh={onRefresh} />

      {/* Day-level choices (decisions) */}
      {dayDecisions.length > 0 && (
        <div className="space-y-3 mb-4">
          {dayDecisions.map((dec) => {
            const myVote = dec.votes.find((v) => v.userCode === user?.code);
            return (
              <div key={dec.id} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-medium text-blue-700 mb-2">Today's choice: {dec.title}</p>
                <div className="space-y-1.5">
                  {dec.options.map((opt) => {
                    const voteCount = dec.votes.filter((v) => v.optionId === opt.id).length;
                    const isMyVote = myVote?.optionId === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => castVote(dec.id, opt.id)}
                        disabled={voting}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          isMyVote
                            ? "bg-blue-600 text-white"
                            : "bg-white border border-blue-200 text-[#3a3128] hover:bg-blue-100"
                        }`}
                      >
                        <span className="font-medium">{opt.name}</span>
                        {opt.description && (
                          <span className="text-xs ml-1 opacity-70">— {opt.description}</span>
                        )}
                        {voteCount > 0 && (
                          <span className={`ml-2 text-xs ${isMyVote ? "text-blue-200" : "text-blue-500"}`}>
                            {voteCount} {voteCount === 1 ? "vote" : "votes"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => castVote(dec.id, null)}
                  disabled={voting}
                  className={`mt-1.5 text-xs transition-colors ${
                    myVote && !myVote.optionId
                      ? "text-blue-700 font-medium"
                      : "text-blue-400 hover:text-blue-600"
                  }`}
                >
                  Happy with either
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Observations — hidden behind disclosure */}
      {selectedForDay.length > 0 && !isGuided && (
        <AIObsDisclosure dayId={day.id} />
      )}

      {/* Friction alerts — suppressed for guided days */}
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

      {/* ─── THE TIMELINE ─── */}
      <DayTimeline
        day={day}
        experiences={experiences}
        trip={trip}
        onExperienceClick={onExperienceClick}
        onDemote={onDemote}
        onRefresh={onRefresh}
      />

      {/* Add reservation (kept as a separate action below timeline) */}
      <div className="mt-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#a89880]">
            Add a reservation
          </h3>
          <button
            onClick={() => setAddingRes(!addingRes)}
            className="text-sm text-[#a89880] hover:text-[#514636]"
          >
            {addingRes ? "Cancel" : "+ Add"}
          </button>
        </div>
        {addingRes && (
          <div className="p-3 bg-[#faf8f5] rounded-lg border border-[#e0d8cc] space-y-2">
            <input
              type="text"
              value={resName}
              onChange={(e) => setResName(e.target.value)}
              placeholder="What's it called?"
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
              placeholder="Confirmation number, notes..."
              className="w-full px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                         placeholder-[#c8bba8] focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            />
            <button
              onClick={addReservation}
              disabled={!resName.trim() || !resTime}
              className="w-full py-1.5 rounded bg-[#514636] text-white text-xs font-medium
                         hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
            >
              Add reservation
            </button>
          </div>
        )}
      </div>

      {/* Exploration zone */}
      <div className="mb-4">
        {editingZone ? (
          <div className="space-y-2">
            <input
              type="text"
              value={zoneText}
              onChange={(e) => setZoneText(e.target.value)}
              placeholder="Higashiyama district, Arashiyama..."
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
      <div className="mb-4">
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
    </div>
  );
}
