import { useState, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
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
import type { Experience, Day, Trip } from "../lib/types";
import { api } from "../lib/api";
import RatingsBadge from "./RatingsBadge";
import AIObservations from "./AIObservations";

interface Props {
  selected: Experience[];
  possible: Experience[];
  days: Day[];
  trip: Trip;
  onPromote: (expId: string, dayId: string, routeSegmentId?: string, timeWindow?: string) => void;
  onDemote: (expId: string) => void;
  onExperienceClick: (id: string) => void;
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
}: {
  exp: Experience;
  onDemote: (id: string) => void;
  onExperienceClick: (id: string) => void;
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
        className="px-3 py-2.5 bg-[#faf8f5] rounded-lg border border-[#e0d8cc] cursor-pointer
                   hover:border-[#a89880] transition-colors"
        onClick={() => onExperienceClick(exp.id)}
      >
        <div className="flex items-center gap-2">
          <GripHandle listeners={listeners as Record<string, unknown>} attributes={attributes} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-[#3a3128] truncate">{exp.name}</div>
              <button
                onClick={(e) => { e.stopPropagation(); onDemote(exp.id); }}
                className="text-xs text-[#c8bba8] hover:text-[#8a7a62] transition-colors flex-shrink-0"
                title="Move to candidates"
              >
                &darr;
              </button>
            </div>
            {exp.timeWindow && (
              <div className="text-xs text-[#a89880] mt-0.5">{exp.timeWindow}</div>
            )}
            {exp.description && (
              <div className="text-xs text-[#8a7a62] mt-1 line-clamp-2">{exp.description}</div>
            )}
            <RatingsBadge ratings={exp.ratings} />
          </div>
        </div>
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
  onExperienceClick,
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
  onExperienceClick: (id: string) => void;
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
        className={`px-3 py-2.5 bg-white rounded-lg border transition-colors cursor-pointer
          ${ratingBorderClass(exp)}
          hover:border-[#e0d8cc]`}
        onClick={() => onExperienceClick(exp.id)}
      >
        <div className="flex items-center gap-2">
          <GripHandle listeners={listeners as Record<string, unknown>} attributes={attributes} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#3a3128]">{exp.name}</span>
                {exp.locationStatus === "unlocated" && (
                  <span className="text-[10px] text-[#c8bba8]" title="Location needed">?</span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setPromotingId(promotingId === exp.id ? null : exp.id); }}
                className="text-xs text-[#a89880] hover:text-[#514636] transition-colors flex-shrink-0"
                title="Add to itinerary"
              >
                &uarr;
              </button>
            </div>
            {exp.description && (
              <div className="text-xs text-[#a89880] mt-1 line-clamp-2">{exp.description}</div>
            )}
            <RatingsBadge ratings={exp.ratings} />
          </div>
        </div>
      </div>

      {/* Inline promote panel */}
      {promotingId === exp.id && (
        <div className="mt-1 p-3 bg-[#faf8f5] rounded-lg border border-[#e0d8cc] space-y-2">
          <select
            value={promoteDay}
            onChange={(e) => setPromoteDay(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                       focus:outline-none focus:ring-2 focus:ring-[#a89880]"
          >
            <option value="">Select a day...</option>
            {days.map((d) => (
              <option key={d.id} value={d.id}>
                {formatDate(d.date)} — {d.city.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={promoteTimeWindow}
            onChange={(e) => setPromoteTimeWindow(e.target.value)}
            placeholder="Time window (optional, e.g. morning)"
            className="w-full px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                       placeholder-[#c8bba8] focus:outline-none focus:ring-2 focus:ring-[#a89880]"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onPromoteSubmit(exp.id)}
              disabled={!promoteDay}
              className="flex-1 py-1.5 rounded bg-[#514636] text-white text-xs font-medium
                         hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
            >
              Add to Day
            </button>
            <button
              onClick={() => { setPromotingId(null); setPromoteDay(""); setPromoteTimeWindow(""); }}
              className="px-3 py-1.5 rounded border border-[#e0d8cc] text-xs text-[#6b5d4a]
                         hover:bg-[#f0ece5] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
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
  selected, possible, days, trip, onPromote, onDemote, onExperienceClick,
}: Props) {
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteDay, setPromoteDay] = useState("");
  const [promoteTimeWindow, setPromoteTimeWindow] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  // Cross-zone drag: if dragging from possible to selected, show inline day selector
  const [crossZonePromoteId, setCrossZonePromoteId] = useState<string | null>(null);
  const [crossPromoteDay, setCrossPromoteDay] = useState("");
  const [crossPromoteTimeWindow, setCrossPromoteTimeWindow] = useState("");

  // Local order state so drag reorder is visually instant
  const [selectedOrder, setSelectedOrder] = useState<string[] | null>(null);
  const [possibleOrder, setPossibleOrder] = useState<string[] | null>(null);

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
      api.post("/experiences/reorder", { orderedIds: newOrder }).catch(() => {
        // Revert on failure
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

        {/* AI Observations — shown when there are selected experiences */}
        {selected.length > 0 && (
          <AIObservations cityId={selected[0].cityId} />
        )}

        {/* Cross-zone promote panel (shown at top when dragging possible -> selected) */}
        {crossZonePromoteId && (
          <div className="mb-3 p-3 bg-[#faf8f5] rounded-lg border-2 border-[#a89880] space-y-2">
            <div className="text-xs font-medium text-[#514636]">
              Add "{allExperiences.get(crossZonePromoteId)?.name}" to itinerary:
            </div>
            <select
              value={crossPromoteDay}
              onChange={(e) => setCrossPromoteDay(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                         focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            >
              <option value="">Select a day...</option>
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatDate(d.date)} — {d.city.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={crossPromoteTimeWindow}
              onChange={(e) => setCrossPromoteTimeWindow(e.target.value)}
              placeholder="Time window (optional, e.g. morning)"
              className="w-full px-2 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                         placeholder-[#c8bba8] focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleCrossPromoteSubmit(crossZonePromoteId)}
                disabled={!crossPromoteDay}
                className="flex-1 py-1.5 rounded bg-[#514636] text-white text-xs font-medium
                           hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
              >
                Add to Day
              </button>
              <button
                onClick={() => { setCrossZonePromoteId(null); setCrossPromoteDay(""); setCrossPromoteTimeWindow(""); }}
                className="px-3 py-1.5 rounded border border-[#e0d8cc] text-xs text-[#6b5d4a]
                           hover:bg-[#f0ece5] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Selected zone */}
        <DroppableZone id="selected-zone">
          <SortableContext items={selectedIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5 mb-3 min-h-[40px]">
              {orderedSelected.length === 0 && (
                <div className="py-4 text-center text-xs text-[#c8bba8] border-2 border-dashed border-[#e0d8cc] rounded-lg">
                  Drag experiences here to add to itinerary
                </div>
              )}
              {orderedSelected.map((exp) => (
                <SortableSelectedItem
                  key={exp.id}
                  exp={exp}
                  onDemote={onDemote}
                  onExperienceClick={onExperienceClick}
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
                  onExperienceClick={onExperienceClick}
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
