/**
 * DayTimeline — A continuous vertical timeline for a single day.
 *
 * Replaces the old "database list" day view with something that reads
 * like a day: morning fading into afternoon fading into evening, with
 * activities, reservations, and accommodations placed in time order.
 *
 * Key changes from old DayView body:
 * - Reservations and experiences interleave by time (not separate sections)
 * - "Possible" experiences removed — they belong to the city, not the day
 * - Subtle time-of-day background gradient
 * - Free-time indicators between items
 * - Personal (private) reminders shown in a lighter style
 * - "Reservation likely" outline on food/museum experiences without one
 * - Guided/Backroads days show "B" badge and suppress planning nudges
 */

import { useState, useMemo } from "react";
import { api } from "../lib/api";
import type { Day, Experience, Reservation, Accommodation, PersonalItem, Trip } from "../lib/types";
import RatingsBadge from "./RatingsBadge";
import { useToast } from "../contexts/ToastContext";
import { getContributorColor, getContributorInitial } from "../lib/travelerProfiles";

// ─── Types ───────────────────────────────────────────────────────

type TimelineEntry = {
  id: string;
  type: "accommodation-checkin" | "accommodation-checkout" | "reservation" | "experience" | "personal";
  minutesFromMidnight: number;
  timeLabel: string;
  data: Experience | Reservation | Accommodation | PersonalItem;
};

// ─── Time helpers ────────────────────────────────────────────────

function timeWindowToMinutes(tw: string | null): number {
  if (!tw) return 720; // noon default
  const lower = tw.toLowerCase();
  if (lower === "morning") return 540;   // 9:00
  if (lower === "afternoon") return 840; // 14:00
  if (lower === "evening") return 1140;  // 19:00
  // Try HH:MM or H:MM format
  const match = tw.match(/^(\d{1,2}):(\d{2})/);
  if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
  return 720;
}

function parseTimeString(t: string | null, fallback: number): number {
  if (!t) return fallback;
  const match = t.match(/^(\d{1,2}):(\d{2})/);
  if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
  return fallback;
}

function minutesToLabel(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return min === 0 ? `${h12} ${ampm}` : `${h12}:${min.toString().padStart(2, "0")} ${ampm}`;
}

function timeOfDayPhase(m: number): "morning" | "afternoon" | "evening" {
  if (m < 720) return "morning";   // before noon
  if (m < 1020) return "afternoon"; // before 5pm
  return "evening";
}

// ─── Reservation-likely detection ────────────────────────────────

const RESERVATION_THEMES = new Set(["food"]);
const RESERVATION_NAME_PATTERNS = [/museum/i, /gallery/i, /exhibit/i];

function needsReservation(exp: Experience, dayReservations: Reservation[]): boolean {
  const isReservationType = exp.themes?.some(t => RESERVATION_THEMES.has(t))
    || RESERVATION_NAME_PATTERNS.some(p => p.test(exp.name));
  if (!isReservationType) return false;

  // Check if there's already a reservation with a similar name on this day
  const nameWords = exp.name.toLowerCase().split(/\s+/);
  return !dayReservations.some(r => {
    const resWords = r.name.toLowerCase().split(/\s+/);
    return nameWords.some(w => w.length > 3 && resWords.includes(w));
  });
}

// ─── Background gradient for time of day ─────────────────────────

const PHASE_COLORS = {
  morning: "rgba(255, 243, 224, 0.3)",   // warm gold
  afternoon: "rgba(255, 255, 255, 0)",     // transparent (natural bg)
  evening: "rgba(220, 230, 240, 0.25)",    // gentle blue-grey
};

// ─── Sub-components ──────────────────────────────────────────────

function FreeTimeSlot({ minutes, onTap }: { minutes: number; onTap?: () => void }) {
  if (minutes < 20) return null;
  const hours = Math.floor(minutes / 60);
  const label = hours > 0
    ? `${hours}h${minutes % 60 > 0 ? ` ${minutes % 60}m` : ""} open`
    : `${minutes}m open`;

  return (
    <div
      className={`flex items-center gap-2 py-2 px-4 ${onTap ? "cursor-pointer hover:bg-[#f5f2ed]" : ""}`}
      onClick={onTap}
    >
      <span className="flex-1 border-t border-dashed border-[#e0d8cc]" />
      <span className="text-xs text-[#c8bba8] whitespace-nowrap">{label}</span>
      <span className="flex-1 border-t border-dashed border-[#e0d8cc]" />
    </div>
  );
}

function TimelineBadge({ label }: { label: string }) {
  return (
    <span className="text-xs text-[#a89880] tabular-nums min-w-[52px] text-right shrink-0">
      {label}
    </span>
  );
}

function ExperienceCard({
  exp, reservationWarning, onExperienceClick, onDemote,
}: {
  exp: Experience;
  reservationWarning: boolean;
  onExperienceClick: (id: string) => void;
  onDemote: (id: string) => void;
}) {
  const isImported = exp.sourceText && /import|merged/i.test(exp.sourceText);
  const cc = (exp.createdBy && !isImported) ? getContributorColor(exp.createdBy) : null;

  return (
    <div
      className={`px-4 py-3 bg-[#faf8f5] rounded-lg cursor-pointer
                   hover:border-[#a89880] transition-colors active:bg-[#f0ece5]
                   ${reservationWarning
                     ? "border-2 border-dashed border-rose-200"
                     : "border border-[#e0d8cc]"}`}
      onClick={() => onExperienceClick(exp.id)}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[#3a3128] flex items-center gap-1">
          {exp.name}
        </span>
        <div className="flex items-center gap-2">
          {exp.timeWindow && (
            <span className="text-xs text-[#a89880]">{exp.timeWindow}</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDemote(exp.id); }}
            className="text-sm text-[#c8bba8] hover:text-[#8a7a62] p-1"
            aria-label="Move to city ideas"
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
        {reservationWarning && (
          <span className="text-[10px] text-rose-400 ml-1">No reservation</span>
        )}
        {cc && (
          <span className="flex items-center gap-1 ml-auto">
            <span
              className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0"
              style={{ backgroundColor: cc.bg, color: cc.text, border: `1px solid ${cc.border}` }}
            >
              {getContributorInitial(exp.createdBy)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function ReservationCard({ res }: { res: Reservation }) {
  const { showToast } = useToast();
  const time = new Date(res.datetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="px-4 py-3 bg-white rounded-lg border-2 border-[#e0d8cc] shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[#3a3128]">
          {res.latitude != null && res.longitude != null ? (
            <a href={`https://maps.apple.com/?ll=${res.latitude},${res.longitude}&q=${encodeURIComponent(res.name)}`}
              target="_blank" rel="noopener noreferrer"
              className="underline decoration-[#d0c9be]">{res.name}</a>
          ) : res.name}
        </span>
        <span className="text-sm font-medium text-[#514636]">{time}</span>
      </div>
      {res.confirmationNumber && (
        <button onClick={() => { navigator.clipboard.writeText(res.confirmationNumber!); showToast("Copied"); }}
          className="text-xs text-[#a89880] mt-0.5 hover:text-[#514636] transition-colors">
          Conf: {res.confirmationNumber} 📋
        </button>
      )}
      {res.notes && <p className="text-xs text-[#a89880] mt-0.5">{res.notes}</p>}
    </div>
  );
}

function AccommodationCard({ acc, variant }: { acc: Accommodation; variant: "checkin" | "checkout" }) {
  const { showToast } = useToast();
  const timeStr = variant === "checkin" ? acc.checkInTime : acc.checkOutTime;
  const label = variant === "checkin" ? "Check in" : "Check out";

  return (
    <div className="px-4 py-3 bg-[#f0ece5] rounded-lg">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[#3a3128]">{acc.name}</span>
        <span className="text-xs text-[#a89880]">
          {label}{timeStr ? ` · ${timeStr}` : ""}
        </span>
      </div>
      {acc.address && (
        acc.latitude != null && acc.longitude != null ? (
          <a href={`https://maps.apple.com/?ll=${acc.latitude},${acc.longitude}&q=${encodeURIComponent(acc.name)}`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs text-[#8a7a62] mt-0.5 underline decoration-[#d0c9be] block">{acc.address}</a>
        ) : (
          <div className="text-xs text-[#8a7a62] mt-0.5">{acc.address}</div>
        )
      )}
      {acc.confirmationNumber && (
        <button onClick={() => { navigator.clipboard.writeText(acc.confirmationNumber!); showToast("Copied"); }}
          className="text-xs text-[#a89880] mt-1 hover:text-[#514636] transition-colors">
          Conf: {acc.confirmationNumber} 📋
        </button>
      )}
    </div>
  );
}

function PersonalItemCard({
  item, onDelete,
}: {
  item: PersonalItem;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="px-4 py-2 bg-blue-50/50 rounded-lg border border-blue-100 flex items-center gap-2">
      <span className="text-xs text-blue-400">✦</span>
      <span className="text-sm text-blue-700/70 flex-1">{item.content}</span>
      <button
        onClick={() => onDelete(item.id)}
        className="text-xs text-blue-300 hover:text-blue-500 shrink-0"
      >
        &times;
      </button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────

interface Props {
  day: Day;
  experiences: Experience[];
  trip: Trip;
  onExperienceClick: (id: string) => void;
  onDemote: (id: string) => void;
  onRefresh: () => void;
}

export default function DayTimeline({
  day, experiences, trip, onExperienceClick, onDemote, onRefresh,
}: Props) {
  const { showToast } = useToast();
  const isGuided = day.dayType === "guided";

  // Selected experiences for this day only
  const selectedForDay = useMemo(
    () => experiences.filter(e => e.state === "selected" && e.dayId === day.id),
    [experiences, day.id],
  );

  const reservations = day.reservations || [];
  const accommodations = day.accommodations || [];
  const personalItems = day.personalItems || [];

  // ─── Build timeline entries ────────────────────────────────────

  const entries = useMemo(() => {
    const items: TimelineEntry[] = [];

    // Accommodations — check-in at top, check-out at bottom (or by time)
    for (const acc of accommodations) {
      if (acc.checkInTime) {
        items.push({
          id: `acc-in-${acc.id}`,
          type: "accommodation-checkin",
          minutesFromMidnight: parseTimeString(acc.checkInTime, 900), // default 3pm
          timeLabel: acc.checkInTime || "3:00 pm",
          data: acc,
        });
      }
      if (acc.checkOutTime) {
        items.push({
          id: `acc-out-${acc.id}`,
          type: "accommodation-checkout",
          minutesFromMidnight: parseTimeString(acc.checkOutTime, 660), // default 11am
          timeLabel: acc.checkOutTime || "11:00 am",
          data: acc,
        });
      }
    }

    // Reservations — exact times
    for (const res of reservations) {
      const dt = new Date(res.datetime);
      const mins = dt.getHours() * 60 + dt.getMinutes();
      items.push({
        id: `res-${res.id}`,
        type: "reservation",
        minutesFromMidnight: mins,
        timeLabel: minutesToLabel(mins),
        data: res,
      });
    }

    // Experiences — by time window
    for (const exp of selectedForDay) {
      const mins = timeWindowToMinutes(exp.timeWindow);
      items.push({
        id: `exp-${exp.id}`,
        type: "experience",
        minutesFromMidnight: mins,
        timeLabel: exp.timeWindow || "",
        data: exp,
      });
    }

    // Personal items — by time window
    for (const pi of personalItems) {
      const mins = timeWindowToMinutes(pi.timeWindow);
      items.push({
        id: `pi-${pi.id}`,
        type: "personal",
        minutesFromMidnight: mins,
        timeLabel: pi.timeWindow || "",
        data: pi,
      });
    }

    // Sort by time, with accommodations check-out first, check-in last for same time
    items.sort((a, b) => {
      if (a.minutesFromMidnight !== b.minutesFromMidnight) {
        return a.minutesFromMidnight - b.minutesFromMidnight;
      }
      // Tie-breaking: checkout before anything, checkin after everything
      const typeOrder: Record<string, number> = {
        "accommodation-checkout": 0,
        "reservation": 1,
        "experience": 2,
        "personal": 3,
        "accommodation-checkin": 4,
      };
      return (typeOrder[a.type] || 2) - (typeOrder[b.type] || 2);
    });

    return items;
  }, [selectedForDay, reservations, accommodations, personalItems]);

  // ─── Add personal item form ────────────────────────────────────

  const [addingPersonal, setAddingPersonal] = useState(false);
  const [personalText, setPersonalText] = useState("");
  const [personalWindow, setPersonalWindow] = useState("morning");

  async function savePersonalItem() {
    if (!personalText.trim()) return;
    try {
      await api.post("/personal-items", {
        dayId: day.id,
        content: personalText.trim(),
        timeWindow: personalWindow,
      });
      setPersonalText("");
      setAddingPersonal(false);
      showToast("Added your reminder");
      onRefresh();
    } catch {
      showToast("That didn't save — try again?", "error");
    }
  }

  async function deletePersonalItem(id: string) {
    try {
      await api.delete(`/personal-items/${id}`);
      onRefresh();
    } catch {
      showToast("Couldn't remove that — try again?", "error");
    }
  }

  // ─── Render ────────────────────────────────────────────────────

  // Track current phase for background gradient
  let lastPhase: string | null = null;

  return (
    <div className="space-y-2">
      {/* Guided day badge */}
      {isGuided && (
        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-lg border border-indigo-100">
          <span className="w-6 h-6 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center">
            B
          </span>
          <span className="text-sm text-indigo-700">Guided day — your tour handles the schedule</span>
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && !isGuided && (
        <div className="text-center py-8">
          <p className="text-sm text-[#a89880]">Nothing planned yet</p>
          <p className="text-xs text-[#c8bba8] mt-1">Add activities from the city board, or ask Scout</p>
        </div>
      )}

      {/* Timeline entries */}
      {entries.map((entry, idx) => {
        const phase = timeOfDayPhase(entry.minutesFromMidnight);
        const phaseChanged = phase !== lastPhase;
        lastPhase = phase;

        // Calculate gap from previous entry for free-time indicator
        const prevEntry = idx > 0 ? entries[idx - 1] : null;
        const gap = prevEntry
          ? entry.minutesFromMidnight - prevEntry.minutesFromMidnight
          : 0;

        return (
          <div key={entry.id}>
            {/* Phase divider (morning → afternoon → evening) */}
            {phaseChanged && (
              <div
                className="py-1.5 px-4 -mx-1 rounded"
                style={{ backgroundColor: PHASE_COLORS[phase] }}
              >
                <span className="text-[10px] uppercase tracking-widest text-[#c8bba8] font-medium">
                  {phase}
                </span>
              </div>
            )}

            {/* Free-time indicator */}
            {gap > 20 && <FreeTimeSlot minutes={gap} />}

            {/* The item itself */}
            <div className="flex items-start gap-3 px-1">
              <TimelineBadge label={entry.timeLabel} />
              <div className="flex-1 min-w-0">
                {entry.type === "accommodation-checkin" && (
                  <AccommodationCard acc={entry.data as Accommodation} variant="checkin" />
                )}
                {entry.type === "accommodation-checkout" && (
                  <AccommodationCard acc={entry.data as Accommodation} variant="checkout" />
                )}
                {entry.type === "reservation" && (
                  <ReservationCard res={entry.data as Reservation} />
                )}
                {entry.type === "experience" && (
                  <ExperienceCard
                    exp={entry.data as Experience}
                    reservationWarning={needsReservation(entry.data as Experience, reservations)}
                    onExperienceClick={onExperienceClick}
                    onDemote={onDemote}
                  />
                )}
                {entry.type === "personal" && (
                  <PersonalItemCard
                    item={entry.data as PersonalItem}
                    onDelete={deletePersonalItem}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Add personal reminder */}
      <div className="pt-2 px-1">
        {addingPersonal ? (
          <div className="space-y-2 p-3 bg-blue-50/30 rounded-lg border border-blue-100">
            <input
              type="text"
              value={personalText}
              onChange={e => setPersonalText(e.target.value)}
              placeholder="Remind yourself of something..."
              className="w-full px-2 py-1.5 rounded border border-blue-200 text-sm text-[#3a3128]
                         placeholder-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") savePersonalItem(); }}
            />
            <div className="flex items-center gap-2">
              <select
                value={personalWindow}
                onChange={e => setPersonalWindow(e.target.value)}
                className="px-2 py-1 rounded border border-blue-200 text-xs text-[#3a3128]"
              >
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
              <button
                onClick={savePersonalItem}
                disabled={!personalText.trim()}
                className="px-3 py-1 rounded bg-blue-500 text-white text-xs font-medium
                           hover:bg-blue-600 disabled:opacity-40 transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => setAddingPersonal(false)}
                className="text-xs text-blue-400 hover:text-blue-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingPersonal(true)}
            className="text-xs text-blue-400 hover:text-blue-600 transition-colors"
          >
            + Add a personal reminder
          </button>
        )}
      </div>
    </div>
  );
}
