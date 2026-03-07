import { useState, useMemo } from "react";
import { api } from "../lib/api";
import type { Day, Experience, Trip } from "../lib/types";
import RatingsBadge from "./RatingsBadge";
import AIObservations from "./AIObservations";
import FirstTimeGuide from "./FirstTimeGuide";
import { useToast } from "../contexts/ToastContext";

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
        className="flex items-center gap-1.5 text-[10px] text-[#a89880] hover:text-[#6b5d4a] transition-colors"
      >
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[#c8bba8] text-[9px] font-medium">
          i
        </span>
        <span>AI Observations</span>
        <span className="text-[8px]">{open ? "▲" : "▼"}</span>
      </button>
      {open && <AIObservations dayId={dayId} />}
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
    <div className="p-4">
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
          <p className="text-xs text-[#8a7a62]">
            {day.city.name}
            {day.city.tagline && <span className="ml-1 text-[#a89880]">· {day.city.tagline}</span>}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-[#8a7a62] hover:text-[#3a3128]"
        >
          &times;
        </button>
      </div>

      {/* Accommodation anchor — with full details */}
      {accommodations.length > 0 && (
        <div className="mb-6">
          {accommodations.map((acc) => (
            <div key={acc.id} className="px-3 py-2.5 bg-[#f0ece5] rounded-lg text-sm">
              <div className="font-medium text-[#3a3128]">{acc.name}</div>
              {acc.address && <div className="text-xs text-[#8a7a62] mt-0.5">{acc.address}</div>}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-[#a89880]">
                {acc.checkInTime && <span>Check-in: {acc.checkInTime}</span>}
                {acc.checkOutTime && <span>Check-out: {acc.checkOutTime}</span>}
                {acc.confirmationNumber && <span>Conf: {acc.confirmationNumber}</span>}
              </div>
              {acc.notes && <div className="text-xs text-[#6b5d4a] mt-1 italic">{acc.notes}</div>}
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
              <span className="text-[10px] uppercase tracking-wider text-[#a89880]">
                Route order
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleApplySpatialOrder}
                  className="text-[10px] text-[#514636] hover:text-[#3a3128] font-medium"
                >
                  Save this order
                </button>
                <button
                  onClick={() => setSpatialOverridden(true)}
                  className="text-[10px] text-[#c8bba8] hover:text-[#8a7a62]"
                >
                  Use my order
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setSpatialOverridden(false)}
              className="text-[10px] uppercase tracking-wider text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
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
            {/* Distance hint between consecutive experiences */}
            {useSpatialOrder && idx > 0 && exp.latitude != null && displaySelected[idx - 1].latitude != null && (() => {
              const prev = displaySelected[idx - 1];
              const dx = (exp.latitude! - prev.latitude!) * 111;
              const dy = (exp.longitude! - prev.longitude!) * 111 * Math.cos(prev.latitude! * Math.PI / 180);
              const distKm = Math.sqrt(dx * dx + dy * dy);
              const walkMin = Math.round((distKm / 5) * 60);
              if (walkMin < 1) return null;
              return (
                <div className="flex items-center gap-2 py-1 px-4 text-[10px] text-[#c8bba8]">
                  <span className="flex-1 border-t border-dashed border-[#e0d8cc]" />
                  <span>{walkMin} min walk</span>
                  <span className="flex-1 border-t border-dashed border-[#e0d8cc]" />
                </div>
              );
            })()}
            <div
              className="px-4 py-3 bg-[#faf8f5] rounded-lg border border-[#e0d8cc] cursor-pointer
                         hover:border-[#a89880] transition-colors active:bg-[#f0ece5]"
              onClick={() => onExperienceClick(exp.id)}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#3a3128]">{exp.name}</span>
                <div className="flex items-center gap-2">
                  {exp.timeWindow && (
                    <span className="text-xs text-[#a89880]">{exp.timeWindow}</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDemote(exp.id); }}
                    className="text-xs text-[#c8bba8] hover:text-[#8a7a62] p-1"
                    aria-label="Move to candidates"
                  >
                    &darr;
                  </button>
                </div>
              </div>
              {exp.description && (
                <p className="text-xs text-[#8a7a62] mt-1 line-clamp-2">{exp.description}</p>
              )}
              {exp.userNotes && (
                <p className="text-xs text-[#6b5d4a] mt-1 italic line-clamp-2">{exp.userNotes}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <RatingsBadge ratings={exp.ratings} />
                {exp.createdBy && (
                  <span className="text-[10px] text-[#c8bba8] ml-auto">by {exp.createdBy}</span>
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
            className="text-xs text-[#a89880] hover:text-[#514636]"
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
                  <span className="text-sm font-medium text-[#3a3128]">{res.name}</span>
                  <span className="text-xs text-[#8a7a62]">
                    {new Date(res.datetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                {res.confirmationNumber && (
                  <div className="text-xs text-[#a89880] mt-0.5">Conf: {res.confirmationNumber}</div>
                )}
                {res.notes && <p className="text-xs text-[#a89880] mt-0.5">{res.notes}</p>}
              </div>
            ))}
          </div>
        ) : !addingRes && (
          <p className="text-xs text-[#c8bba8]">No reservations yet</p>
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
              <button onClick={() => setEditingZone(false)} className="text-xs text-[#8a7a62]">Cancel</button>
            </div>
          </div>
        ) : (
          <div
            className="px-3 py-2 bg-[#f0ece5] rounded-lg cursor-pointer hover:bg-[#e8e2d8] transition-colors"
            onClick={() => setEditingZone(true)}
          >
            <span className="text-xs font-medium text-[#a89880]">Exploration Zone: </span>
            <span className="text-xs text-[#6b5d4a]">{day.explorationZone || "Tap to set..."}</span>
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
              <button onClick={() => setEditingNotes(false)} className="text-xs text-[#8a7a62]">Cancel</button>
            </div>
          </div>
        ) : (
          <div
            className="px-3 py-2 bg-white rounded-lg border border-[#f0ece5] cursor-pointer
                       hover:border-[#e0d8cc] transition-colors"
            onClick={() => setEditingNotes(true)}
          >
            <span className="text-xs text-[#8a7a62]">{day.notes || "Tap to add notes..."}</span>
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
                className="text-xs text-[#a89880] hover:text-[#514636] p-1"
                aria-label="Add to this day"
              >
                &uarr;
              </button>
            </div>
            {exp.description && (
              <p className="text-xs text-[#a89880] mt-0.5 line-clamp-1">{exp.description}</p>
            )}
            {exp.userNotes && (
              <p className="text-xs text-[#6b5d4a] mt-0.5 italic line-clamp-1">{exp.userNotes}</p>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <RatingsBadge ratings={exp.ratings} />
              {exp.createdBy && (
                <span className="text-[10px] text-[#c8bba8] ml-auto">by {exp.createdBy}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
