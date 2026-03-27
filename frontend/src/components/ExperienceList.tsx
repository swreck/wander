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

function CreatorBadge({ exp }: { exp: Experience }) {
  // Show creator's first initial until someone else edits
  if (exp.lastEditedBy && exp.lastEditedBy !== exp.createdBy) return null;

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
                title="Remove from itinerary (keep as idea)"
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
                  className="inline-flex items-center justify-center rounded bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                  onClick={(e) => { e.stopPropagation(); setLocatingId(locatingId === exp.id ? null : exp.id); }}
                >
                  <span style={{ fontSize: 9 }}>📍</span>
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
      </div>
    </div>
  );
}

// ── Decision Group ────────────────────────────────────────────────
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

  const myVote = decision.votes.find((v) => v.userCode === user?.code);
  const isHappyWithAny = myVote && myVote.optionId === null;

  async function handleVote(optionId: string | null) {
    if (voting) return;
    setVoting(true);
    try {
      await api.post(`/decisions/${decision.id}/vote`, { optionId });
      onDecisionsChanged();
    } catch {
      showToast("Vote didn't go through — check your connection?", "error");
    }
    setVoting(false);
  }

  async function handleResolve(winnerIds: string[]) {
    setResolving(true);
    try {
      await api.post(`/decisions/${decision.id}/resolve`, { winnerIds });
      showToast("Settled!");
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
      onDecisionsChanged();
    } catch {
      showToast("Couldn't add that — try again?", "error");
    }
    setAdding(false);
  }

  async function handleDelete() {
    if (!window.confirm("Clear this decision? Everyone's votes will go away.")) return;
    try {
      await api.delete(`/decisions/${decision.id}`);
      showToast("Cleared");
      onDecisionsChanged();
    } catch {
      showToast("That didn't go through — check your connection?", "error");
    }
  }

  // Count votes per option
  const voteCounts = new Map<string, { voters: string[] }>();
  let happyWithAnyCount = 0;
  for (const v of decision.votes) {
    if (v.optionId === null) {
      happyWithAnyCount++;
    } else {
      const existing = voteCounts.get(v.optionId) || { voters: [] };
      existing.voters.push(v.displayName);
      voteCounts.set(v.optionId, existing);
    }
  }

  // Find the leading option(s)
  let maxVotes = 0;
  for (const [, { voters }] of voteCounts) {
    if (voters.length > maxVotes) maxVotes = voters.length;
  }
  const leaders = maxVotes > 0
    ? decision.options.filter((o) => (voteCounts.get(o.id)?.voters.length || 0) === maxVotes).map((o) => o.id)
    : [];

  // 3-day nudge
  const ageMs = Date.now() - new Date(decision.createdAt).getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  const isStale = ageDays >= 3;

  return (
    <div className={`rounded-lg border-2 p-2.5 ${isStale ? "border-amber-400 bg-amber-100/60" : "border-amber-200 bg-amber-50/50"}`}>
      {isStale && (
        <div className="text-xs text-amber-700 mb-1.5 font-medium">
          Open {ageDays} days — time to decide?
        </div>
      )}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-amber-700">{decision.title}</span>
        <button
          onClick={handleDelete}
          className="text-xs text-[#c8bba8] hover:text-red-500 transition-colors"
          title="Cancel decision"
        >
          &times;
        </button>
      </div>

      <div className="space-y-1.5">
        {decision.options.map((opt) => {
          const votes = voteCounts.get(opt.id);
          const isMyPick = myVote?.optionId === opt.id;
          const isLeader = leaders.includes(opt.id);
          return (
            <div
              key={opt.id}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors ${
                voting ? "opacity-50 cursor-wait" : "cursor-pointer"
              } ${
                isMyPick
                  ? "border-amber-400 bg-amber-100"
                  : "border-[#e0d8cc] bg-white hover:border-amber-300"
              }`}
              onClick={() => !voting && handleVote(opt.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-[#3a3128] truncate">{opt.name}</span>
                  {isLeader && maxVotes > 0 && (
                    <span className="text-xs text-amber-600">*</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {votes && votes.voters.length > 0 && (
                  <div className="flex -space-x-1">
                    {votes.voters.map((name, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-[10px] font-medium border border-white"
                        title={name}
                      >
                        {name[0]}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onExperienceClick(opt.id); }}
                  className="w-5 h-5 rounded-full border border-[#e0d8cc] text-[#a89880] hover:text-[#6b5d4a]
                             flex items-center justify-center text-xs transition-colors"
                  title="Details"
                >
                  i
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Happy with any */}
      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={() => handleVote(null)}
          disabled={voting}
          className={`text-xs transition-colors ${
            voting ? "opacity-50 cursor-wait" : ""
          } ${
            isHappyWithAny
              ? "text-amber-700 font-medium"
              : "text-[#a89880] hover:text-amber-600"
          }`}
        >
          {isHappyWithAny ? "You're happy with any" : "Happy with any"}
          {happyWithAnyCount > 0 && !isHappyWithAny && (
            <span className="ml-1 text-amber-600">({happyWithAnyCount})</span>
          )}
        </button>

        {/* Add option */}
        <button
          onClick={() => setShowAddOption(!showAddOption)}
          className="text-xs text-[#a89880] hover:text-amber-600 transition-colors"
        >
          + option
        </button>
      </div>

      {showAddOption && (
        <div className="mt-1.5 flex gap-1">
          <input
            type="text"
            value={newOptionName}
            onChange={(e) => setNewOptionName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddOption()}
            placeholder="New option..."
            autoFocus
            className="flex-1 text-xs px-2 py-1.5 border border-[#e0d8cc] rounded bg-white
                       focus:outline-none focus:border-amber-400"
          />
          <button
            onClick={handleAddOption}
            disabled={adding || !newOptionName.trim()}
            className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700
                       disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        </div>
      )}

      {/* Resolve — show when there are votes */}
      {decision.votes.length > 0 && (
        <div className="mt-2 pt-2 border-t border-amber-200">
          <button
            onClick={() => handleResolve(leaders)}
            disabled={resolving || leaders.length === 0}
            className="w-full py-1.5 text-xs font-medium rounded bg-amber-600 text-white
                       hover:bg-amber-700 disabled:opacity-40 transition-colors"
          >
            {resolving ? "..." : leaders.length > 0
              ? `Resolve → ${decision.options.filter((o) => leaders.includes(o.id)).map((o) => o.name).join(", ")}`
              : "Vote to resolve"}
          </button>
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
