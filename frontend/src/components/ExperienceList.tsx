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
import type { Experience, Day, Trip, ExperienceInterest, Decision, DecisionVote } from "../lib/types";
import { api } from "../lib/api";
import RatingsBadge from "./RatingsBadge";

import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { getContributorColor, getContributorInitial } from "../lib/travelerProfiles";
import ContributorView from "./ContributorView";

function SyncBadge({ exp }: { exp: Experience }) {
  const [showTip, setShowTip] = useState(false);
  if (!exp.sheetRowRef) return null;
  return (
    <span className="relative ml-0.5 shrink-0">
      <button
        className="text-[#b8a990] hover:text-[#8a7a62] text-xs leading-none transition-colors"
        onClick={(e) => { e.stopPropagation(); setShowTip(!showTip); }}
        title="Synced with Larisa's Japan Guide"
      >↔</button>
      {showTip && (
        <span
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 rounded bg-[#3a3128] text-white text-[10px] whitespace-nowrap z-50 shadow-lg"
          onClick={(e) => { e.stopPropagation(); setShowTip(false); }}
        >Synced with Larisa's Japan Guide</span>
      )}
    </span>
  );
}

function CreatorBadge({ exp }: { exp: Experience }) {
  // Show creator's first initial until someone else edits
  if (exp.lastEditedBy && exp.lastEditedBy !== exp.createdBy) return null;
  // Don't attribute items that were bulk-imported — the importer isn't the "creator" in a meaningful sense
  if (exp.sourceText && /import|merged/i.test(exp.sourceText)) return null;

  const color = getContributorColor(exp.createdBy);
  const initial = getContributorInitial(exp.createdBy);

  return (
    <span
      className="ml-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0"
      style={{ backgroundColor: color.bg, color: color.text, border: `1px solid ${color.border}` }}
      title={`Added by ${exp.createdBy}`}
    >
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
      showToast("Shared");
      setShowForm(false);
      setNote("");
      onInterestChanged();
    } catch {
      showToast("That didn't go through — try again?", "error");
    }
    setSubmitting(false);
  }

  async function handleReact(reaction: "interested" | "maybe" | "pass") {
    if (!interest) return;
    try {
      await api.post(`/interests/${interest.id}/react`, { reaction });
      showToast(reaction === "interested" ? "Interested!" : reaction === "maybe" ? "Maybe" : "Passed");
      setShowReactions(false);
      onInterestChanged();
    } catch {
      showToast("That didn't go through — try again?", "error");
    }
  }

  async function handleRetract() {
    if (!interest) return;
    try {
      await api.delete(`/interests/${interest.id}`);
      showToast("Withdrawn");
      onInterestChanged();
    } catch {
      showToast("That didn't go through — try again?", "error");
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
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
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
        title="Share with the group"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
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
      showToast("Found it");
      onResolved();
    } catch {
      showToast("Couldn't place that on the map — try again?", "error");
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
  decisions?: Decision[];
  onDecisionsChanged?: () => void;
  cityName?: string;
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
  days,
  onDemote,
  onMove,
  onExperienceClick,
  onHover,
  locatingId,
  setLocatingId,
  onLocationResolved,
  interest,
  onInterestChanged,
}: {
  exp: Experience;
  days: Day[];
  onDemote: (id: string) => void;
  onMove: (expId: string, dayId: string) => void;
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

  const [showMovePicker, setShowMovePicker] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const contributorColor = getContributorColor(exp.createdBy);

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className="px-3 py-2 bg-[#faf8f5] rounded-lg border border-[#e0d8cc] cursor-pointer
                   hover:border-[#a89880] transition-colors"
        style={{ borderLeftWidth: 3, borderLeftColor: contributorColor.dot }}
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
                  className="inline-flex items-center justify-center rounded bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
                  style={{ width: 18, height: 18, flexShrink: 0 }}
                  onClick={(e) => { e.stopPropagation(); setLocatingId(locatingId === exp.id ? null : exp.id); }}
                >
                  <span style={{ fontSize: 10 }}>📍</span>
                </button>
              )}
              <span className="text-sm font-medium text-[#3a3128]">{exp.name}</span>
              <SyncBadge exp={exp} />
              <CreatorBadge exp={exp} />
              <GroupInterestBadge exp={exp} interest={interest} onInterestChanged={onInterestChanged} />
              {exp.timeWindow && (
                <span className="text-sm text-[#a89880] ml-1.5">{exp.timeWindow}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <button
                onClick={(e) => { e.stopPropagation(); setShowMovePicker(!showMovePicker); }}
                className="text-[10px] px-1.5 py-0.5 rounded border border-[#e0d8cc] text-[#8a7a62] hover:text-[#514636] hover:border-[#a89880] transition-colors"
                title="Move to a different day"
              >
                Move
              </button>
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
                title="Back to ideas"
              >
                &darr;
              </button>
            </div>
          </div>
        </div>
        {showMovePicker && (
          <div className="px-3 py-2 flex flex-wrap gap-1 bg-[#faf8f5] border-t border-[#f0ece5]">
            {days.filter(d => d.id !== exp.dayId).map(d => {
              const date = new Date(d.date);
              return (
                <button
                  key={d.id}
                  onClick={(e) => { e.stopPropagation(); onMove(exp.id, d.id); setShowMovePicker(false); }}
                  className="px-2 py-1 rounded text-[11px] bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc] transition-colors"
                >
                  {date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" })}
                </button>
              );
            })}
          </div>
        )}
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
            <span className="text-sm text-[#6b5d4a] truncate flex items-center gap-1 cursor-pointer hover:text-[#3a3128] transition-colors"
              onClick={(e) => { e.stopPropagation(); onExperienceClick(exp.id); }}
            >
              {exp.locationStatus !== "confirmed" && (
                <button
                  title="Tap to set map location"
                  className="inline-flex items-center justify-center rounded bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                  onClick={(e) => { e.stopPropagation(); setLocatingId(locatingId === exp.id ? null : exp.id); }}
                >
                  <span style={{ fontSize: 9 }}>📍</span>
                </button>
              )}
              {exp.name}
              <SyncBadge exp={exp} />
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
                const shortDate = new Date(d.date).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
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
        <SyncBadge exp={exp} />
      </div>
    </div>
  );
}

// ── Resolved Decisions (collapsed "Decided" cards) ───────────────
function ResolvedDecisions({ tripId, cityId }: { tripId: string; cityId: string }) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) return;
    api.get<Decision[]>(`/decisions/trip/${tripId}/resolved`)
      .then((decs) => setDecisions(decs.filter((d) => d.cityId === cityId)))
      .catch(() => {});
  }, [tripId, cityId]);

  if (decisions.length === 0) return null;

  return (
    <div className="space-y-1.5 mb-3">
      {decisions.map((dec) => {
        const winner = dec.options.find((o) => o.state === "selected");
        const isExpanded = expandedId === dec.id;
        const allThoughts = dec.options
          .flatMap((opt) => (opt.notes || []).map((note) => ({ ...note, optionName: opt.name })))
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        return (
          <div key={dec.id} className="rounded-xl border border-green-200/80 bg-green-50/30 p-3">
            <div className="flex items-center gap-2">
              <span className="text-green-600 text-sm">✓</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-[#3a3128]">
                  {winner ? `Going with ${winner.name}` : dec.title}
                </span>
                {dec.resolvedAt && (
                  <div className="text-[11px] text-[#a89880] mt-0.5">
                    Decided {new Date(dec.resolvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                )}
              </div>
              <button
                onClick={() => setExpandedId(isExpanded ? null : dec.id)}
                className="text-[11px] text-[#a89880] hover:text-[#6b5d4a] transition-colors shrink-0"
              >
                {isExpanded ? "Hide" : "See the conversation"}
              </button>
            </div>
            {isExpanded && (
              <div className="mt-2.5 pt-2 border-t border-green-200/40 space-y-2">
                {allThoughts.length > 0 ? allThoughts.map((note) => (
                  <div key={note.id} className="flex gap-2 items-start">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#f0ebe3] text-[#6b5d4a] text-[10px] font-medium shrink-0 mt-0.5">
                      {note.traveler.displayName[0]}
                    </span>
                    <div className="min-w-0">
                      <span className="text-[11px] font-medium text-[#6b5d4a]">{note.traveler.displayName}</span>
                      <span className="text-[11px] text-[#a89880]"> on {note.optionName}</span>
                      <p className="text-xs text-[#3a3128] leading-relaxed mt-0.5">{note.content}</p>
                    </div>
                  </div>
                )) : (
                  <div className="text-[11px] text-[#a89880]">No conversation recorded</div>
                )}
                <div className="text-[11px] text-[#a89880] mt-1">
                  Options considered: {dec.options.map((o) => o.name).join(", ")}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Decision Group (conversational decision UI) ──────────────────
function DecisionGroup({
  decision,
  onDecisionsChanged,
  onExperienceClick,
}: {
  decision: Decision;
  onDecisionsChanged: () => void;
  onExperienceClick: (id: string) => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [resolving, setResolving] = useState(false);
  const [showAddOption, setShowAddOption] = useState(false);
  const [newOptionName, setNewOptionName] = useState("");
  const [adding, setAdding] = useState(false);
  const [voting, setVoting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [thoughtOption, setThoughtOption] = useState<string | null>(null);
  const [thoughtTexts, setThoughtTexts] = useState<Record<string, string>>({});
  const [submittingThought, setSubmittingThought] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState<string | null>(null);

  const myVotes = decision.votes.filter((v) => v.userCode === user?.code).sort((a, b) => (a.rank || 1) - (b.rank || 1));
  const myPickIds = myVotes.map(v => v.optionId).filter(Boolean);
  const isHappyWithAny = myVotes.length === 1 && myVotes[0].optionId === null;

  function getMyRank(optionId: string): number | null {
    const vote = myVotes.find(v => v.optionId === optionId);
    return vote ? (vote.rank || 1) : null;
  }

  async function handleTogglePick(optionId: string) {
    if (voting) return;
    setVoting(true);
    try {
      const currentRank = getMyRank(optionId);
      let newRankings;
      if (currentRank) {
        // Remove this pick, shift others up
        newRankings = myVotes
          .filter(v => v.optionId !== optionId)
          .map((v, i) => ({ optionId: v.optionId, rank: i + 1 }));
      } else if (myPickIds.length >= 3) {
        // Already have 3 picks, ignore
        showToast("You've picked your top 3 — tap one to remove it first");
        setVoting(false);
        return;
      } else {
        // Add this pick at the next rank
        newRankings = [
          ...myVotes.filter(v => v.optionId).map(v => ({ optionId: v.optionId, rank: v.rank || 1 })),
          { optionId, rank: myPickIds.length + 1 },
        ];
      }
      await api.post(`/decisions/${decision.id}/vote`, { rankings: newRankings });
      onDecisionsChanged();
    } catch {
      showToast("That didn't stick — try again?", "error");
    }
    setVoting(false);
  }

  async function handleHappyWithAny() {
    if (voting) return;
    setVoting(true);
    try {
      await api.post(`/decisions/${decision.id}/vote`, {});
      showToast("Got it — you're flexible");
      onDecisionsChanged();
    } catch {
      showToast("That didn't stick — try again?", "error");
    }
    setVoting(false);
  }

  async function handleResolve(winnerId: string) {
    setResolving(true);
    try {
      const winner = decision.options.find((o) => o.id === winnerId);
      await api.post(`/decisions/${decision.id}/resolve`, { winnerIds: [winnerId] });
      showToast(`Going with ${winner?.name || "that one"}`, "success", {
        duration: 12000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              // Re-open by creating a fresh decision with same options
              showToast("Can't undo yet — ask Scout to help", "error");
            } catch { /* fallback */ }
          },
        },
      });
      setConfirmResolve(null);
      onDecisionsChanged();
    } catch {
      showToast("That didn't go through — try again?", "error");
    }
    setResolving(false);
  }

  async function handleAddOption() {
    if (!newOptionName.trim()) return;
    setAdding(true);
    try {
      await api.post(`/decisions/${decision.id}/options`, { name: newOptionName.trim() });
      setNewOptionName("");
      setShowAddOption(false);
      showToast("Added");
      onDecisionsChanged();
    } catch {
      showToast("Couldn't add that — try again?", "error");
    }
    setAdding(false);
  }

  async function handleAddThought(experienceId: string) {
    const text = thoughtTexts[experienceId]?.trim();
    if (!text || submittingThought) return;
    setSubmittingThought(true);
    try {
      await api.post("/experience-notes", { experienceId, content: text });
      setThoughtTexts((prev) => ({ ...prev, [experienceId]: "" }));
      setThoughtOption(null);
      showToast("Shared");
      onDecisionsChanged();
    } catch {
      showToast("Couldn't share that — try again?", "error");
    }
    setSubmittingThought(false);
  }

  async function handleDelete() {
    try {
      await api.delete(`/decisions/${decision.id}`);
      setConfirmingDelete(false);
      showToast("Decision removed — options are back in your ideas");
      onDecisionsChanged();
    } catch {
      showToast("That didn't go through — check your connection?", "error");
    }
  }

  // ── Derived state ──

  // Vote counts per option
  const voteCounts = new Map<string, { voters: string[] }>();
  let happyWithAnyVoters: string[] = [];
  for (const v of decision.votes) {
    if (v.optionId === null) {
      happyWithAnyVoters.push(v.displayName);
    } else {
      const existing = voteCounts.get(v.optionId) || { voters: [] };
      existing.voters.push(v.displayName);
      voteCounts.set(v.optionId, existing);
    }
  }

  // Find the single leading option (not ties)
  let maxVotes = 0;
  for (const [, { voters }] of voteCounts) {
    if (voters.length > maxVotes) maxVotes = voters.length;
  }
  const leadingOptions = maxVotes > 0
    ? decision.options.filter((o) => (voteCounts.get(o.id)?.voters.length || 0) === maxVotes)
    : [];
  const hasCleanLeader = leadingOptions.length === 1 && maxVotes > 0;
  const leader = hasCleanLeader ? leadingOptions[0] : null;

  // Who's participated (voted or shared a thought)
  const participantNames = new Set<string>();
  for (const v of decision.votes) participantNames.add(v.displayName);
  for (const opt of decision.options) {
    for (const n of opt.notes || []) participantNames.add(n.traveler.displayName);
  }

  // Collect all thoughts across options, chronological
  const allThoughts = decision.options
    .flatMap((opt) => (opt.notes || []).map((note) => ({ ...note, optionName: opt.name, optionId: opt.id })))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Staleness
  const ageMs = Date.now() - new Date(decision.createdAt).getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  const isStale = ageDays >= 3;

  // Helpers
  function googleRating(opt: typeof decision.options[0]) {
    const r = opt.ratings?.find((r: any) => r.platform === "google");
    return r ? `★ ${r.ratingValue}` : null;
  }

  const totalVotes = decision.votes.filter((v) => v.optionId !== null).length;

  return (
    <div className={`rounded-xl border-2 p-3 ${isStale ? "border-amber-400 bg-amber-50/80" : "border-amber-200/80 bg-[#fdfbf7]"}`}>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-[#3a3128]">{decision.title}</div>
          <div className="text-[11px] text-[#a89880] mt-0.5">
            {participantNames.size > 0
              ? `${[...participantNames].join(", ")} ${participantNames.size === 1 ? "has" : "have"} weighed in`
              : "No one has weighed in yet"
            }
            {isStale && <span className="text-amber-600 font-medium"> · open {ageDays} days</span>}
          </div>
        </div>
        {confirmingDelete ? (
          <span className="flex items-center gap-1.5 shrink-0">
            <button onClick={handleDelete} className="text-xs text-red-500 font-medium hover:text-red-700">Remove</button>
            <button onClick={() => setConfirmingDelete(false)} className="text-xs text-[#a89880] hover:text-[#514636]">Keep</button>
          </span>
        ) : (
          <button onClick={() => setConfirmingDelete(true)} className="text-[#c8bba8] hover:text-red-500 text-sm leading-none p-1" title="Remove decision">&times;</button>
        )}
      </div>

      {/* ── Conversation: what people are saying ── */}
      {allThoughts.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-[#a89880] font-medium">What people are saying</div>
          {allThoughts.map((note) => (
            <div key={note.id} className="flex gap-2 items-start">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#f0ebe3] text-[#6b5d4a] text-[10px] font-medium shrink-0 mt-0.5">
                {note.traveler.displayName[0]}
              </span>
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-[#6b5d4a]">{note.traveler.displayName}</span>
                <span className="text-[11px] text-[#a89880]"> on {note.optionName}</span>
                <p className="text-xs text-[#3a3128] leading-relaxed mt-0.5">{note.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── My top 3 picks box ── */}
      {myPickIds.length > 0 && (
        <div className="mb-3 bg-[#faf8f5] rounded-xl border border-[#e8e0d4] p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-[#a89880] font-medium mb-1.5">Your picks</div>
          <div className="space-y-1">
            {myVotes.filter(v => v.optionId).map((v, idx, arr) => {
              const opt = decision.options.find(o => o.id === v.optionId);
              if (!opt) return null;

              async function moveUp() {
                if (idx === 0) return;
                const reordered = [...arr];
                [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
                const rankings = reordered.map((rv, ri) => ({ optionId: rv.optionId, rank: ri + 1 }));
                try {
                  await api.post(`/decisions/${decision.id}/vote`, { rankings });
                  onDecisionsChanged();
                } catch { /* ignore */ }
              }

              async function moveDown() {
                if (idx === arr.length - 1) return;
                const reordered = [...arr];
                [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
                const rankings = reordered.map((rv, ri) => ({ optionId: rv.optionId, rank: ri + 1 }));
                try {
                  await api.post(`/decisions/${decision.id}/vote`, { rankings });
                  onDecisionsChanged();
                } catch { /* ignore */ }
              }

              return (
                <div key={v.id || v.optionId} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#514636] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {v.rank || idx + 1}
                  </span>
                  <span className="text-xs text-[#3a3128] flex-1 truncate">{opt.name}</span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {idx > 0 && (
                      <button onClick={(e) => { e.stopPropagation(); moveUp(); }} className="text-[#a89880] hover:text-[#514636] text-xs px-1" title="Move up">↑</button>
                    )}
                    {idx < arr.length - 1 && (
                      <button onClick={(e) => { e.stopPropagation(); moveDown(); }} className="text-[#a89880] hover:text-[#514636] text-xs px-1" title="Move down">↓</button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleTogglePick(opt.id); }}
                      className="text-[#c8bba8] hover:text-red-400 text-xs px-1"
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Options: compact comparison ── */}
      <div className="space-y-1.5">
        {decision.options.map((opt) => {
          const votes = voteCounts.get(opt.id);
          const myRank = getMyRank(opt.id);
          const isMyPick = !!myRank;
          const isLeading = leader?.id === opt.id;
          const rating = googleRating(opt);
          const isThoughtOpen = thoughtOption === opt.id;
          const currentText = thoughtTexts[opt.id] || "";

          return (
            <div key={opt.id}>
              <div
                className={`rounded-lg border px-3 py-2 transition-all cursor-pointer ${
                  isMyPick
                    ? "border-amber-400 bg-amber-50/60"
                    : isLeading
                      ? "border-amber-300/60 bg-amber-50/30"
                      : "border-[#e5ddd0] bg-white"
                }`}
                onClick={() => setThoughtOption(isThoughtOpen ? null : opt.id)}
              >
                <div className="flex items-center gap-2">
                  {/* Name + rating */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-[#3a3128] truncate">{opt.name}</span>
                      {isLeading && <span className="text-[10px] text-amber-600 font-medium shrink-0">leading</span>}
                    </div>
                    {(opt.description || rating) && (
                      <div className="text-[11px] text-[#8a7a62] mt-0.5 truncate">
                        {rating && <span className="text-amber-700 font-medium mr-1.5">{rating}</span>}
                        {opt.description}
                      </div>
                    )}
                  </div>

                  {/* Who likes this + preference signal */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {votes && votes.voters.length > 0 && (
                      <div className="flex -space-x-1">
                        {votes.voters.map((name, i) => (
                          <span key={i} className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-[10px] font-medium border border-white" title={name}>
                            {name[0]}
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleTogglePick(opt.id); }}
                      disabled={voting}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors text-sm ${
                        myRank
                          ? "bg-[#514636] text-white font-bold"
                          : "text-[#c8bba8] hover:text-[#514636] hover:bg-[#f0ece5]"
                      }`}
                      title={myRank ? `Your #${myRank} pick` : "Add to your top 3"}
                    >
                      {myRank ? myRank : "👍"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Inline thought input — opens when you tap an option */}
              {isThoughtOpen && (
                <div className="mt-1 ml-2 mr-2 flex gap-1.5">
                  <input
                    type="text"
                    value={currentText}
                    onChange={(e) => setThoughtTexts((prev) => ({ ...prev, [opt.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && handleAddThought(opt.id)}
                    placeholder={`What do you know about ${opt.name.split(" ").slice(0, 2).join(" ")}?`}
                    autoFocus
                    className="flex-1 text-xs px-2.5 py-1.5 border border-[#e5ddd0] rounded-lg bg-[#faf8f5]
                               focus:outline-none focus:border-amber-400 placeholder:text-[#c8bba8]"
                  />
                  {currentText.trim() && (
                    <button
                      onClick={() => handleAddThought(opt.id)}
                      disabled={submittingThought}
                      className="px-2.5 py-1 text-xs bg-[#514636] text-white rounded-lg hover:bg-[#3a3128]
                                 disabled:opacity-40 transition-colors shrink-0"
                    >
                      Share
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Bottom actions ── */}
      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={() => handleHappyWithAny()}
          disabled={voting}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
            isHappyWithAny
              ? "bg-amber-100 text-amber-700 font-medium"
              : "bg-[#f0ebe3] text-[#6b5d4a] hover:bg-amber-50 hover:text-amber-600"
          }`}
        >
          {isHappyWithAny ? "You're flexible ✓" : "I'm good with whatever"}
          {happyWithAnyVoters.length > 0 && !isHappyWithAny && (
            <span className="ml-1 text-amber-600" title={happyWithAnyVoters.join(", ")}>
              ({happyWithAnyVoters.map((n) => n.split(" ")[0]).join(", ")})
            </span>
          )}
        </button>

        <button
          onClick={() => setShowAddOption(!showAddOption)}
          className="text-xs text-[#a89880] hover:text-amber-600 transition-colors"
        >
          + suggest another
        </button>
      </div>

      {showAddOption && (
        <div className="mt-1.5 flex gap-1.5">
          <input
            type="text"
            value={newOptionName}
            onChange={(e) => setNewOptionName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddOption()}
            placeholder="Another option..."
            autoFocus
            className="flex-1 text-xs px-2.5 py-1.5 border border-[#e5ddd0] rounded-lg bg-white
                       focus:outline-none focus:border-amber-400 placeholder:text-[#c8bba8]"
          />
          <button
            onClick={handleAddOption}
            disabled={adding || !newOptionName.trim()}
            className="px-2.5 py-1 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700
                       disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        </div>
      )}

      {/* ── Suggest / Confirm — only when there's a clear direction ── */}
      {hasCleanLeader && leader && totalVotes >= 2 && !confirmResolve && (
        <div className="mt-3 pt-2.5 border-t border-amber-200/40">
          <div className="text-[11px] text-[#8a7a62] mb-1.5">
            {totalVotes} of the group {totalVotes === 1 ? "likes" : "like"} {leader.name}
            {happyWithAnyVoters.length > 0 && `, ${happyWithAnyVoters.length} flexible`}
          </div>
          <button
            onClick={() => setConfirmResolve(leader.id)}
            className="w-full py-2 text-xs font-medium rounded-lg bg-[#f0ebe3] text-[#514636]
                       hover:bg-amber-100 hover:text-amber-700 transition-colors"
          >
            Suggest going with {leader.name}?
          </button>
        </div>
      )}

      {/* Confirmation step */}
      {confirmResolve && (
        <div className="mt-3 pt-2.5 border-t border-amber-200/40">
          <div className="text-xs text-[#3a3128] mb-2">
            Go with <strong>{decision.options.find((o) => o.id === confirmResolve)?.name}</strong>? This moves it to your plan.
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleResolve(confirmResolve)}
              disabled={resolving}
              className="flex-1 py-2 text-xs font-medium rounded-lg bg-amber-600 text-white
                         hover:bg-amber-700 disabled:opacity-40 transition-colors"
            >
              {resolving ? "..." : "Yes, go with it"}
            </button>
            <button
              onClick={() => setConfirmResolve(null)}
              className="px-4 py-2 text-xs rounded-lg bg-[#f0ebe3] text-[#6b5d4a] hover:bg-[#e5ddd0] transition-colors"
            >
              Not yet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function ExperienceList({
  selected, possible, days, trip, onPromote, onDemote, onExperienceClick, onExperienceHover, onLocationResolved,
  interests, onInterestChanged, decisions, onDecisionsChanged, cityName,
}: Props) {
  const { showToast } = useToast();
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteDay, setPromoteDay] = useState("");
  const [promoteTimeWindow, setPromoteTimeWindow] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [locatingId, setLocatingId] = useState<string | null>(null);

  // Contributor filter
  const [contributorFilter, setContributorFilter] = useState<string | null>(null);
  const [contributorViewCode, setContributorViewCode] = useState<string | null>(null);

  // New decision form
  const [showNewDecision, setShowNewDecision] = useState(false);
  const [newDecisionTitle, setNewDecisionTitle] = useState("");
  const [creatingDecision, setCreatingDecision] = useState(false);

  async function handleCreateDecision() {
    if (!newDecisionTitle.trim() || !trip) return;
    const cityId = selected[0]?.cityId || possible[0]?.cityId;
    if (!cityId) return;
    setCreatingDecision(true);
    try {
      await api.post("/decisions", {
        tripId: trip.id,
        cityId,
        title: newDecisionTitle.trim(),
      });
      setNewDecisionTitle("");
      setShowNewDecision(false);
      onDecisionsChanged?.();
    } catch {
      showToast("Couldn't start that — try again?", "error");
    }
    setCreatingDecision(false);
  }

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

  // Apply contributor filter
  const filteredSelected = useMemo(() =>
    contributorFilter ? orderedSelected.filter(e => e.createdBy === contributorFilter) : orderedSelected,
    [orderedSelected, contributorFilter],
  );
  const filteredPossible = useMemo(() =>
    contributorFilter ? orderedPossible.filter(e => e.createdBy === contributorFilter) : orderedPossible,
    [orderedPossible, contributorFilter],
  );

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
        showToast("Got it");
      }).catch(() => {
        showToast("Couldn't save that order — try again?", "error");
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
    <>
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
            {selected.length} Planned{decisions && decisions.length > 0 ? ` · ${decisions.length} Deciding` : ""} · {possible.length} Maybe
          </span>
        </div>
        {/* Contributor filter */}
        {(() => {
          const allExps = [...selected, ...possible];
          const contributors = [...new Set(allExps.map(e => e.createdBy).filter(Boolean))];
          if (contributors.length <= 1) return null;
          return (
            <div className="flex gap-1.5 mb-2 overflow-x-auto" style={{ touchAction: "pan-x" }}>
              {contributors.map(c => {
                const color = getContributorColor(c);
                const initial = getContributorInitial(c);
                const isActive = contributorFilter === c;
                return (
                  <button
                    key={c}
                    onClick={() => setContributorFilter(isActive ? null : c)}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all"
                    style={isActive
                      ? { backgroundColor: color.dot, color: "white" }
                      : { backgroundColor: color.bg, color: color.text, border: `1px solid ${color.border}` }
                    }
                  >
                    <span className="w-3 h-3 rounded-full text-[8px] font-bold flex items-center justify-center"
                          style={isActive ? { backgroundColor: "white", color: color.dot } : { backgroundColor: color.dot, color: "white" }}>
                      {initial}
                    </span>
                    {c}
                  </button>
                );
              })}
              {contributorFilter && (
                <>
                  <button
                    onClick={() => setContributorViewCode(contributorFilter)}
                    className="shrink-0 text-xs text-[#a89880] hover:text-[#514636] px-1 underline underline-offset-2"
                  >
                    See all across trip
                  </button>
                  <button
                    onClick={() => setContributorFilter(null)}
                    className="shrink-0 text-xs text-[#c8bba8] hover:text-[#8a7a62] px-1"
                  >
                    All
                  </button>
                </>
              )}
            </div>
          );
        })()}
        {(() => {
          const unlocated = [...selected, ...possible].filter((e) => e.locationStatus !== "confirmed").length;
          if (unlocated === 0) return null;
          return (
            <div className="mb-2 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-1.5">
              <span style={{ fontSize: 12 }}>📍</span>
              {unlocated} {unlocated === 1 ? "item needs" : "items need"} a location to appear on the map
            </div>
          );
        })()}

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
                  const shortDate = new Date(d.date).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
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
              {filteredSelected.length === 0 && (
                <div className="py-4 text-center text-sm text-[#c8bba8] border-2 border-dashed border-[#e0d8cc] rounded-lg">
                  {contributorFilter ? `No planned items from ${contributorFilter}` : "No planned items yet — add from the Maybe section below, or tap + to create new ones"}
                </div>
              )}
              {filteredSelected.map((exp) => (
                <SortableSelectedItem
                  key={exp.id}
                  exp={exp}
                  days={days}
                  onDemote={onDemote}
                  onMove={(expId, dayId) => onPromote(expId, dayId)}
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

        {/* Decide section */}
        {(decisions?.length || 0) === 0 && !showNewDecision && (
          <div className="my-2 text-center">
            <button
              onClick={() => setShowNewDecision(true)}
              className="text-xs text-amber-600 hover:text-amber-700 transition-colors"
            >
              + Start a group decision
            </button>
          </div>
        )}
        {((decisions && decisions.length > 0) || showNewDecision) && (
          <>
            <div className="border-t border-dashed border-amber-200 my-3" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-amber-600">
                Decide Together
              </span>
              <button
                onClick={() => setShowNewDecision(!showNewDecision)}
                className="text-xs text-amber-600 hover:text-amber-700 transition-colors"
                title="New decision"
              >
                +
              </button>
            </div>
            {showNewDecision && (
              <div className="mb-2 flex gap-1">
                <input
                  type="text"
                  value={newDecisionTitle}
                  onChange={(e) => setNewDecisionTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateDecision()}
                  placeholder="What should we decide?"
                  autoFocus
                  className="flex-1 text-xs px-2 py-1.5 border border-amber-200 rounded bg-amber-50
                             focus:outline-none focus:border-amber-400"
                />
                <button
                  onClick={handleCreateDecision}
                  disabled={creatingDecision || !newDecisionTitle.trim()}
                  className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700
                             disabled:opacity-40 transition-colors"
                >
                  Go
                </button>
              </div>
            )}
            <div className="space-y-2 mb-3">
              {decisions?.map((dec) => (
                <DecisionGroup
                  key={dec.id}
                  decision={dec}
                  onDecisionsChanged={() => onDecisionsChanged?.()}
                  onExperienceClick={onExperienceClick}
                />
              ))}
            </div>
          </>
        )}

        {/* Resolved decisions — the story of past group choices */}
        <ResolvedDecisions tripId={trip.id} cityId={selected[0]?.cityId || possible[0]?.cityId || ""} />

        {/* Divider */}
        <div className="border-t border-dashed border-[#e0d8cc] my-3" />

        {/* Maybe zone */}
        <DroppableZone id="possible-zone">
          <SortableContext items={possibleIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5 min-h-[40px]">
              {filteredPossible.map((exp) => (
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
                <div className="text-center py-10 px-6">
                  <p className="text-[15px] text-[#8a7a62] leading-relaxed">
                    {cityName ? `${cityName} is wide open.` : "Nothing here yet."}
                  </p>
                  <p className="text-sm text-[#c8bba8] mt-1">
                    Paste something you've found, or ask the chat what's worth seeing.
                  </p>
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

    {/* ContributorView overlay */}
    {contributorViewCode && (
      <ContributorView
        travelerCode={contributorViewCode}
        experiences={[...selected, ...possible]}
        trip={trip}
        onClose={() => setContributorViewCode(null)}
        onExperienceClick={(id) => { setContributorViewCode(null); onExperienceClick(id); }}
      />
    )}
    </>
  );
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
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
