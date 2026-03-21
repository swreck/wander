import { useState, useMemo, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  DragOverlay,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Experience, Day, Trip, ExperienceInterest } from "../lib/types";
import { api } from "../lib/api";
import RatingsBadge from "./RatingsBadge";

import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";

function CreatorBadge({ exp }: { exp: Experience }) {
  // Show creator's first initial until someone else edits
  if (exp.lastEditedBy && exp.lastEditedBy !== exp.createdBy) return null;

  // Backroads itinerary items show "B"
  if (exp.sourceText === "Imported from itinerary document") {
    return (
      <span className="ml-1 text-[10px] text-[#c8bba8] font-medium" title="Backroads itinerary">
        B
      </span>
    );
  }

  const initial = exp.createdBy?.[0]?.toUpperCase();
  if (!initial) return null;
  return (
    <span className="ml-1 text-[10px] text-[#c8bba8] font-medium" title={`Added by ${exp.createdBy}`}>
      {initial}
    </span>
  );
}

// ── Inline Group Interest Controls ───────────────────────────────
function GroupInterestBadge({
  exp,
  interest,
  onInterestChanged,
}: {
  exp: Experience;
  interest?: ExperienceInterest;
  onInterestChanged: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showReactions, setShowReactions] = useState(false);

  const isFloatedByMe = interest?.userCode === user?.code;
  const reactionCount = interest?.reactions?.length || 0;
  const myReaction = interest?.reactions?.find((r) => r.userCode === user?.code);

  async function handleFloat() {
    setSubmitting(true);
    try {
      await api.post("/interests", { experienceId: exp.id, note: note || null });
      showToast("Shared with group");
      setShowForm(false);
      setNote("");
      onInterestChanged();
    } catch {
      showToast("Couldn't share", "error");
    }
    setSubmitting(false);
  }

  async function handleReact(reaction: "interested" | "maybe" | "pass") {
    if (!interest) return;
    try {
      await api.post(`/interests/${interest.id}/react`, { reaction });
      showToast(reaction === "interested" ? "Interested!" : reaction === "maybe" ? "Marked maybe" : "Passed");
      setShowReactions(false);
      onInterestChanged();
    } catch {
      showToast("Couldn't react", "error");
    }
  }

  async function handleRetract() {
    if (!interest) return;
    try {
      await api.delete(`/interests/${interest.id}`);
      showToast("Retracted");
      onInterestChanged();
    } catch {
      showToast("Couldn't retract", "error");
    }
  }

  // If floated — show warm badge with reaction count
  if (interest) {
    const reactionEmoji = myReaction
      ? myReaction.reaction === "interested" ? "+" : myReaction.reaction === "maybe" ? "~" : "-"
      : null;

    return (
      <span className="relative inline-flex items-center ml-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); setShowReactions(!showReactions); }}
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
            isFloatedByMe
              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
              : "bg-blue-50 text-blue-600 hover:bg-blue-100"
          }`}
          title={`${interest.displayName} is interested${interest.note ? `: ${interest.note}` : ""}`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
          {reactionCount > 0 && <span>{reactionCount}</span>}
        </button>
        {showReactions && (
          <div
            className="absolute top-full left-0 mt-1 z-30 bg-white rounded-lg border border-[#e0d8cc] shadow-lg p-2 min-w-[180px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs text-[#8a7a62] mb-1.5">
              <span className="font-medium text-[#3a3128]">{interest.displayName}</span> is interested
              {interest.note && <span className="italic"> — "{interest.note}"</span>}
            </div>
            {interest.reactions.length > 0 && (
              <div className="space-y-0.5 mb-1.5 border-t border-[#f0ece5] pt-1.5">
                {interest.reactions.map((r) => (
                  <div key={r.id} className="text-xs text-[#6b5d4a] flex items-center gap-1">
                    <span>{r.reaction === "interested" ? "+" : r.reaction === "maybe" ? "~" : "-"}</span>
                    <span className="font-medium">{r.displayName}</span>
                    {r.note && <span className="text-[#a89880] italic truncate">"{r.note}"</span>}
                  </div>
                ))}
              </div>
            )}
            {!isFloatedByMe && user && (
              <div className="flex gap-1 border-t border-[#f0ece5] pt-1.5">
                <button
                  onClick={() => handleReact("interested")}
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    myReaction?.reaction === "interested" ? "bg-green-100 text-green-700" : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                  }`}
                >
                  Yes
                </button>
                <button
                  onClick={() => handleReact("maybe")}
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    myReaction?.reaction === "maybe" ? "bg-amber-100 text-amber-700" : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                  }`}
                >
                  Maybe
                </button>
                <button
                  onClick={() => handleReact("pass")}
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    myReaction?.reaction === "pass" ? "bg-red-50 text-red-600" : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                  }`}
                >
                  Pass
                </button>
              </div>
            )}
            {isFloatedByMe && (
              <button
                onClick={handleRetract}
                className="w-full py-1 text-xs text-red-500 hover:bg-red-50 rounded transition-colors border-t border-[#f0ece5] mt-1 pt-1.5"
              >
                Retract
              </button>
            )}
          </div>
        )}
      </span>
    );
  }

  // Not floated — show subtle share icon
  return (
    <span className="relative inline-flex items-center ml-1.5">
      <button
        onClick={(e) => { e.stopPropagation(); setShowForm(!showForm); }}
        className="text-[#d0c8b8] hover:text-[#8a7a62] transition-colors p-0.5"
        title="Share interest with group"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      </button>
      {showForm && (
        <div
          className="absolute top-full left-0 mt-1 z-30 bg-white rounded-lg border border-[#e0d8cc] shadow-lg p-2 min-w-[200px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs text-[#8a7a62] mb-1.5">Tell the group you're interested</div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFloat()}
            placeholder="Why? (optional)"
            className="w-full text-xs px-2 py-1.5 border border-[#e0d8cc] rounded bg-[#faf8f5]
                       focus:outline-none focus:border-[#a89880] mb-1.5"
          />
          <div className="flex gap-1">
            <button
              onClick={handleFloat}
              disabled={submitting}
              className="flex-1 py-1 text-xs bg-[#514636] text-white rounded hover:bg-[#3a3128]
                         disabled:opacity-40 transition-colors"
            >
              {submitting ? "..." : "Share"}
            </button>
            <button
              onClick={() => { setShowForm(false); setNote(""); }}
              className="px-2 py-1 text-xs text-[#8a7a62] hover:text-[#3a3128]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

// ── Inline Location Resolver ──────────────────────────────────────
function LocationResolver({ exp, onResolved }: { exp: Experience; onResolved: () => void }) {
  const [query, setQuery] = useState(exp.name);
  const [results, setResults] = useState<{ placeId: string; name: string; address: string; latitude: number; longitude: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { showToast } = useToast();

  async function handleSearch() {
    setSearching(true);
    try {
      const r = await api.get<any[]>(`/geocoding/search?query=${encodeURIComponent(query)}&city=${encodeURIComponent(exp.city?.name || "")}`);
      setResults(r);
    } catch { setResults([]); }
    setSearching(false);
  }

  async function handleConfirm(result: { placeId: string; latitude: number; longitude: number }) {
    setConfirming(true);
    try {
      await api.post(`/geocoding/experience/${exp.id}/confirm`, {
        latitude: result.latitude,
        longitude: result.longitude,
        placeIdGoogle: result.placeId,
      });
      showToast("Location set");
      onResolved();
    } catch {
      showToast("Couldn't set location", "error");
    }
    setConfirming(false);
  }

  return (
    <div className="mt-1 p-2 bg-white rounded-lg border border-[#e0d8cc] space-y-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-1">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1 text-xs px-2 py-1 border border-[#e0d8cc] rounded bg-[#faf8f5] focus:outline-none focus:border-[#a89880]"
          placeholder="Search for place..."
        />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-2 py-1 text-xs bg-[#514636] text-white rounded hover:bg-[#3a3128] disabled:opacity-40"
        >
          {searching ? "..." : "Search"}
        </button>
      </div>
      {results.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.placeId}
              onClick={() => handleConfirm(r)}
              disabled={confirming}
              className="w-full text-left px-2 py-1.5 rounded bg-[#faf8f5] hover:bg-[#f0ece5] transition-colors"
            >
              <div className="text-xs font-medium text-[#3a3128]">{r.name}</div>
              <div className="text-sm text-[#8a7a62] truncate">{r.address}</div>
            </button>
          ))}
        </div>
      )}
      {results.length === 0 && !searching && (
        <div className="text-sm text-[#c8bba8]">Search to find a map location</div>
      )}
    </div>
  );
}

interface Props {
  selected: Experience[];
  possible: Experience[];
  days: Day[];
  trip: Trip;
  onPromote: (expId: string, dayId: string, routeSegmentId?: string, timeWindow?: string) => void;
  onDemote: (expId: string) => void;
  onExperienceClick: (id: string) => void;
  onExperienceHover?: (id: string | null) => void;
  onLocationResolved?: () => void;
  interests?: Map<string, ExperienceInterest>;
  onInterestChanged?: () => void;
}

// ── Grip Handle SVG ────────────────────────────────────────────────
function GripHandle({ listeners, attributes }: { listeners: Record<string, unknown>; attributes: Record<string, unknown> }) {
  return (
    <button
      className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
      {...listeners}
      {...attributes}
    >
      <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor">
        <circle cx="3" cy="3" r="1.5" />
        <circle cx="9" cy="3" r="1.5" />
        <circle cx="3" cy="9" r="1.5" />
        <circle cx="9" cy="9" r="1.5" />
        <circle cx="3" cy="15" r="1.5" />
        <circle cx="9" cy="15" r="1.5" />
      </svg>
    </button>
  );
}

// ── Sortable Item (selected zone) ──────────────────────────────────
function SortableSelectedItem({
  exp,
  onDemote,
  onExperienceClick,
  onHover,
  locatingId,
  setLocatingId,
  onLocationResolved,
  interest,
  onInterestChanged,
}: {
  exp: Experience;
  onDemote: (id: string) => void;
  onExperienceClick: (id: string) => void;
  onHover?: (id: string | null) => void;
  locatingId: string | null;
  setLocatingId: (id: string | null) => void;
  onLocationResolved: () => void;
  interest?: ExperienceInterest;
  onInterestChanged: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exp.id,
    data: { zone: "selected", experience: exp },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className="px-3 py-2 bg-[#faf8f5] rounded-lg border border-[#e0d8cc] cursor-pointer
                   hover:border-[#a89880] transition-colors"
        onClick={() => onExperienceClick(exp.id)}
        onMouseEnter={() => onHover?.(exp.id)}
        onMouseLeave={() => onHover?.(null)}
      >
        <div className="flex items-center gap-2">
          <GripHandle listeners={listeners as Record<string, unknown>} attributes={attributes} />
          <div className="flex-1 min-w-0 flex items-center justify-between">
            <div className="truncate flex items-center gap-1.5">
              {exp.locationStatus !== "confirmed" && (
                <button
                  title="Tap to set map location"
                  className="text-sm text-[#c8bba8] relative inline-block hover:text-[#8a7a62] transition-colors"
                  style={{ width: 14, height: 14, flexShrink: 0 }}
                  onClick={(e) => { e.stopPropagation(); setLocatingId(locatingId === exp.id ? null : exp.id); }}
                >
                  <span style={{ position: "absolute", fontSize: 12 }}>📍</span>
                  <span style={{ position: "absolute", top: -1, left: 2, fontSize: 14, color: "#d44" }}>╲</span>
                </button>
              )}
              <span className="text-sm font-medium text-[#3a3128]">{exp.name}</span>
              <CreatorBadge exp={exp} />
              <GroupInterestBadge exp={exp} interest={interest} onInterestChanged={onInterestChanged} />
              {exp.timeWindow && (
                <span className="text-sm text-[#a89880] ml-1.5">{exp.timeWindow}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <button
                onClick={(e) => { e.stopPropagation(); onExperienceClick(exp.id); }}
                className="w-5 h-5 rounded-full border border-[#e0d8cc] text-[#a89880] hover:text-[#6b5d4a]
                           flex items-center justify-center text-xs transition-colors"
                title="Details"
              >
                i
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDemote(exp.id); }}
                className="text-sm text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
                title="Move to candidates"
              >
                &darr;
              </button>
            </div>
          </div>
        </div>
        {locatingId === exp.id && (
          <LocationResolver exp={exp} onResolved={() => { setLocatingId(null); onLocationResolved(); }} />
        )}
      </div>
    </div>
  );
}

// ── Sortable Item (possible zone) ──────────────────────────────────
function SortablePossibleItem({
  exp,
  promotingId,
  setPromotingId,
  promoteDay,
  setPromoteDay,
  promoteTimeWindow,
  setPromoteTimeWindow,
  days,
  onPromoteSubmit,
  onDirectPromote,
  onExperienceClick,
  onHover,
  locatingId,
  setLocatingId,
  onLocationResolved,
  interest,
  onInterestChanged,
}: {
  exp: Experience;
  promotingId: string | null;
  setPromotingId: (id: string | null) => void;
  promoteDay: string;
  setPromoteDay: (v: string) => void;
  promoteTimeWindow: string;
  setPromoteTimeWindow: (v: string) => void;
  days: Day[];
  onPromoteSubmit: (id: string) => void;
  onDirectPromote: (expId: string, dayId: string) => void;
  onExperienceClick: (id: string) => void;
  onHover?: (id: string | null) => void;
  locatingId: string | null;
  setLocatingId: (id: string | null) => void;
  onLocationResolved: () => void;
  interest?: ExperienceInterest;
  onInterestChanged: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exp.id,
    data: { zone: "possible", experience: exp },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`px-3 py-1.5 rounded-lg border transition-colors cursor-pointer opacity-70
          ${ratingBorderClass(exp)} bg-white
          hover:opacity-100 hover:border-[#e0d8cc]`}
        onClick={() => onExperienceClick(exp.id)}
        onMouseEnter={() => onHover?.(exp.id)}
        onMouseLeave={() => onHover?.(null)}
      >
        <div className="flex items-center gap-2">
          <GripHandle listeners={listeners as Record<string, unknown>} attributes={attributes} />
          <div className="flex-1 min-w-0 flex items-center justify-between">
            <span className="text-sm text-[#6b5d4a] truncate flex items-center gap-1">
              {exp.locationStatus !== "confirmed" && (
                <button
                  title="Tap to set map location"
                  className="inline-block relative hover:opacity-70 transition-opacity"
                  style={{ width: 12, height: 12, flexShrink: 0 }}
                  onClick={(e) => { e.stopPropagation(); setLocatingId(locatingId === exp.id ? null : exp.id); }}
                >
                  <span style={{ position: "absolute", fontSize: 10 }}>📍</span>
                  <span style={{ position: "absolute", top: -1, left: 1, fontSize: 12, color: "#d44" }}>╲</span>
                </button>
              )}
              {exp.name}
              <CreatorBadge exp={exp} />
              <GroupInterestBadge exp={exp} interest={interest} onInterestChanged={onInterestChanged} />
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setPromotingId(promotingId === exp.id ? null : exp.id); }}
              className="text-sm text-[#c8bba8] hover:text-[#514636] transition-colors shrink-0 ml-2"
              title="Add to itinerary"
            >
              &uarr;
            </button>
          </div>
        </div>
      </div>

      {/* Inline promote — calendar strip (city days only) */}
      {promotingId === exp.id && (() => {
        const cityDays = days.filter((d) => d.cityId === exp.cityId);
        const showDays = cityDays.length > 0 ? cityDays : days;
        return (
          <div className="mt-1 p-2 bg-[#faf8f5] rounded-lg border border-[#e0d8cc]">
            <div className="text-sm text-[#a89880] mb-1.5 uppercase tracking-wider">
              {cityDays.length > 0 ? `Pick a ${exp.city?.name || "city"} day` : "Pick a day"}
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {showDays.map((d) => {
                const shortDate = new Date(d.date).toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
                return (
                  <button
                    key={d.id}
                    onClick={(e) => { e.stopPropagation(); onDirectPromote(exp.id, d.id); setPromotingId(null); }}
                    className="flex flex-col items-center px-2 py-1.5 rounded text-xs shrink-0 transition-colors bg-[#514636] text-white hover:bg-[#3a3128]"
                  >
                    <span className="font-medium">{shortDate}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setPromotingId(null); setPromoteDay(""); setPromoteTimeWindow(""); }}
              className="mt-1 text-sm text-[#c8bba8] hover:text-[#8a7a62]"
            >
              Cancel
            </button>
          </div>
        );
      })()}
      {locatingId === exp.id && (
        <LocationResolver exp={exp} onResolved={() => { setLocatingId(null); onLocationResolved(); }} />
      )}
    </div>
  );
}

// ── Droppable Zone Wrapper ─────────────────────────────────────────
function DroppableZone({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return <div ref={setNodeRef}>{children}</div>;
}

// ── Drag Overlay Item ──────────────────────────────────────────────
function DragOverlayItem({ exp }: { exp: Experience }) {
  return (
    <div className="px-3 py-2.5 bg-[#faf8f5] rounded-lg border-2 border-[#a89880] shadow-lg opacity-90">
      <div className="flex items-center gap-2">
        <svg width="12" height="18" viewBox="0 0 12 18" fill="#8a7a62">
          <circle cx="3" cy="3" r="1.5" />
          <circle cx="9" cy="3" r="1.5" />
          <circle cx="3" cy="9" r="1.5" />
          <circle cx="9" cy="9" r="1.5" />
          <circle cx="3" cy="15" r="1.5" />
          <circle cx="9" cy="15" r="1.5" />
        </svg>
        <span className="text-sm font-medium text-[#3a3128]">{exp.name}</span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function ExperienceList({
  selected, possible, days, trip, onPromote, onDemote, onExperienceClick, onExperienceHover, onLocationResolved,
  interests, onInterestChanged,
}: Props) {
  const { showToast } = useToast();
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteDay, setPromoteDay] = useState("");
  const [promoteTimeWindow, setPromoteTimeWindow] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [locatingId, setLocatingId] = useState<string | null>(null);

  // Cross-zone drag: if dragging from possible to selected, show inline day selector
  const [crossZonePromoteId, setCrossZonePromoteId] = useState<string | null>(null);
  const [crossPromoteDay, setCrossPromoteDay] = useState("");
  const [crossPromoteTimeWindow, setCrossPromoteTimeWindow] = useState("");

  // Local order state so drag reorder is visually instant
  const [selectedOrder, setSelectedOrder] = useState<string[] | null>(null);
  const [possibleOrder, setPossibleOrder] = useState<string[] | null>(null);

  // Reset cached orders when the experience set changes (e.g. switching cities)
  const selectedKey = selected.map((e) => e.id).join(",");
  const possibleKey = possible.map((e) => e.id).join(",");
  useEffect(() => { setSelectedOrder(null); }, [selectedKey]);
  useEffect(() => { setPossibleOrder(null); }, [possibleKey]);

  const orderedSelected = useMemo(() => {
    if (!selectedOrder) return selected;
    const map = new Map(selected.map((e) => [e.id, e]));
    return selectedOrder.map((id) => map.get(id)).filter(Boolean) as Experience[];
  }, [selected, selectedOrder]);

  const orderedPossible = useMemo(() => {
    if (!possibleOrder) return possible;
    const map = new Map(possible.map((e) => [e.id, e]));
    return possibleOrder.map((id) => map.get(id)).filter(Boolean) as Experience[];
  }, [possible, possibleOrder]);

  const selectedIds = useMemo(() => orderedSelected.map((e) => e.id), [orderedSelected]);
  const possibleIds = useMemo(() => orderedPossible.map((e) => e.id), [orderedPossible]);

  const allExperiences = useMemo(() => {
    const map = new Map<string, Experience>();
    selected.forEach((e) => map.set(e.id, e));
    possible.forEach((e) => map.set(e.id, e));
    return map;
  }, [selected, possible]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handlePromoteSubmit(expId: string) {
    if (!promoteDay) return;
    onPromote(expId, promoteDay, undefined, promoteTimeWindow || undefined);
    setPromotingId(null);
    setPromoteDay("");
    setPromoteTimeWindow("");
  }

  function handleCrossPromoteSubmit(expId: string) {
    if (!crossPromoteDay) return;
    onPromote(expId, crossPromoteDay, undefined, crossPromoteTimeWindow || undefined);
    setCrossZonePromoteId(null);
    setCrossPromoteDay("");
    setCrossPromoteTimeWindow("");
  }

  function getZone(id: string): "selected" | "possible" | null {
    if (selectedIds.includes(id)) return "selected";
    if (possibleIds.includes(id)) return "possible";
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragOver(_event: DragOverEvent) {
    // We handle cross-zone on dragEnd to keep things simpler
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeZone = getZone(active.id as string);
    const overZone = over.id === "selected-zone"
      ? "selected"
      : over.id === "possible-zone"
        ? "possible"
        : getZone(over.id as string);

    if (!activeZone || !overZone) return;

    // Same zone: reorder
    if (activeZone === overZone) {
      if (active.id === over.id) return;
      const items = activeZone === "selected" ? [...selectedIds] : [...possibleIds];
      const oldIndex = items.indexOf(active.id as string);
      const newIndex = items.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(items, oldIndex, newIndex);

      if (activeZone === "selected") {
        setSelectedOrder(newOrder);
      } else {
        setPossibleOrder(newOrder);
      }

      // Persist reorder to backend
      api.post("/experiences/reorder", { orderedIds: newOrder }).then(() => {
        showToast("Order saved");
      }).catch(() => {
        showToast("Couldn't save order", "error");
        if (activeZone === "selected") setSelectedOrder(null);
        else setPossibleOrder(null);
      });
      return;
    }

    // Cross-zone: possible -> selected (promote with day selector)
    if (activeZone === "possible" && overZone === "selected") {
      setCrossZonePromoteId(active.id as string);
      return;
    }

    // Cross-zone: selected -> possible (demote)
    if (activeZone === "selected" && overZone === "possible") {
      onDemote(active.id as string);
      return;
    }
  }

  const activeExp = activeId ? allExperiences.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium uppercase tracking-wider text-[#a89880]">
            {selected.length} Selected · {possible.length} Possible
          </span>
        </div>

        {/* Cross-zone promote panel — calendar strip (city days only) */}
        {crossZonePromoteId && (() => {
          const draggedExp = allExperiences.get(crossZonePromoteId);
          const cityDays = draggedExp ? days.filter((d) => d.cityId === draggedExp.cityId) : [];
          const showDays = cityDays.length > 0 ? cityDays : days;
          return (
            <div className="mb-3 p-2 bg-[#faf8f5] rounded-lg border-2 border-[#a89880]">
              <div className="text-sm text-[#a89880] mb-1.5 uppercase tracking-wider">
                Tap a day to add "{draggedExp?.name}"
              </div>
              <div className="flex gap-1 overflow-x-auto pb-1">
                {showDays.map((d) => {
                  const shortDate = new Date(d.date).toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
                  return (
                    <button
                      key={d.id}
                      onClick={() => {
                        onPromote(crossZonePromoteId, d.id);
                        setCrossZonePromoteId(null);
                        setCrossPromoteDay("");
                        setCrossPromoteTimeWindow("");
                      }}
                      className="flex flex-col items-center px-2 py-1.5 rounded text-xs shrink-0 transition-colors bg-[#514636] text-white hover:bg-[#3a3128]"
                    >
                      <span className="font-medium">{shortDate}</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => { setCrossZonePromoteId(null); setCrossPromoteDay(""); setCrossPromoteTimeWindow(""); }}
                className="mt-1 text-sm text-[#c8bba8] hover:text-[#8a7a62]"
              >
                Cancel
              </button>
            </div>
          );
        })()}

        {/* Selected zone */}
        <DroppableZone id="selected-zone">
          <SortableContext items={selectedIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5 mb-3 min-h-[40px]">
              {orderedSelected.length === 0 && (
                <div className="py-4 text-center text-sm text-[#c8bba8] border-2 border-dashed border-[#e0d8cc] rounded-lg">
                  Drag experiences here to add to itinerary
                </div>
              )}
              {orderedSelected.map((exp) => (
                <SortableSelectedItem
                  key={exp.id}
                  exp={exp}
                  onDemote={onDemote}
                  onExperienceClick={onExperienceClick}
                  onHover={onExperienceHover}
                  locatingId={locatingId}
                  setLocatingId={setLocatingId}
                  onLocationResolved={() => onLocationResolved?.()}
                  interest={interests?.get(exp.id)}
                  onInterestChanged={() => onInterestChanged?.()}
                />
              ))}
            </div>
          </SortableContext>
        </DroppableZone>

        {/* Divider */}
        <div className="border-t border-dashed border-[#e0d8cc] my-3" />

        {/* Possible zone */}
        <DroppableZone id="possible-zone">
          <SortableContext items={possibleIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5 min-h-[40px]">
              {orderedPossible.map((exp) => (
                <SortablePossibleItem
                  key={exp.id}
                  exp={exp}
                  promotingId={promotingId}
                  setPromotingId={setPromotingId}
                  promoteDay={promoteDay}
                  setPromoteDay={setPromoteDay}
                  promoteTimeWindow={promoteTimeWindow}
                  setPromoteTimeWindow={setPromoteTimeWindow}
                  days={days}
                  onPromoteSubmit={handlePromoteSubmit}
                  onDirectPromote={onPromote}
                  onExperienceClick={onExperienceClick}
                  onHover={onExperienceHover}
                  locatingId={locatingId}
                  setLocatingId={setLocatingId}
                  onLocationResolved={() => onLocationResolved?.()}
                  interest={interests?.get(exp.id)}
                  onInterestChanged={() => onInterestChanged?.()}
                />
              ))}

              {possible.length === 0 && selected.length === 0 && (
                <div className="text-center py-8 text-sm text-[#c8bba8]">
                  No experiences yet. Tap + to capture one.
                </div>
              )}
            </div>
          </SortableContext>
        </DroppableZone>
      </div>

      {/* Drag overlay — follows cursor */}
      <DragOverlay>
        {activeExp ? <DragOverlayItem exp={activeExp} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function ratingBorderClass(exp: Experience): string {
  if (!exp.ratings || exp.ratings.length === 0) return "border-[#f0ece5]";
  const hasLow = exp.ratings.some((r) =>
    (r.platform !== "foursquare" && r.ratingValue < 3.8) ||
    (r.platform === "foursquare" && r.ratingValue < 6.5)
  );
  if (hasLow) return "border-l-4 border-l-amber-200 border-[#f0ece5]";
  const hasHigh = exp.ratings.some((r) =>
    (r.platform !== "foursquare" && r.ratingValue >= 4.5) ||
    (r.platform === "foursquare" && r.ratingValue >= 8.5)
  );
  if (hasHigh) return "border-l-4 border-l-green-200 border-[#f0ece5]";
  return "border-[#f0ece5]";
}
