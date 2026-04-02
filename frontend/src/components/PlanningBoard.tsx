/**
 * PlanningBoard — The container-filling view for trip planning.
 *
 * Split-panel layout: days on the left (containers to fill), unassigned
 * ideas on the right (the pool to pick from). Drag ideas onto days, or
 * tap the + button. Both sides always visible. Progress you can feel.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Trip, Day, Experience } from "../lib/types";

// ── Theme metadata ──────────────────────────────────────────────

const THEMES: Record<string, { emoji: string; label: string }> = {
  food:         { emoji: "\uD83C\uDF5C", label: "Food" },
  temples:      { emoji: "\u26E9\uFE0F", label: "Temples" },
  ceramics:     { emoji: "\uD83C\uDFFA", label: "Craft" },
  architecture: { emoji: "\uD83C\uDFDB\uFE0F", label: "Architecture" },
  nature:       { emoji: "\uD83C\uDF3F", label: "Nature" },
  shopping:     { emoji: "\uD83D\uDECD\uFE0F", label: "Shopping" },
  art:          { emoji: "\uD83C\uDFA8", label: "Art" },
  nightlife:    { emoji: "\uD83C\uDF19", label: "Nightlife" },
  other:        { emoji: "\uD83D\uDCCD", label: "Other" },
};

// ── Props ───────────────────────────────────────────────────────

interface Props {
  trip: Trip;
  days: Day[];
  experiences: Experience[];
  activeCityId: string;
  onPromote: (expId: string, dayId: string, routeSegmentId?: string, timeWindow?: string) => void;
  onDemote: (expId: string) => void;
  onExperienceClick: (id: string) => void;
  onClose: () => void;
  onAdd?: (cityId: string, action: "manual" | "import" | "camera" | "decision") => void;
}

// ── Component ───────────────────────────────────────────────────

export default function PlanningBoard({
  trip, days, experiences, activeCityId, onPromote, onDemote, onExperienceClick, onClose, onAdd,
}: Props) {
  const [selectedCityId, setSelectedCityId] = useState(activeCityId);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  const [themeFilter, setThemeFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showPlanned, setShowPlanned] = useState(false);
  const [dayExpanded, setDayExpanded] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<"name" | "rating">("name");
  const [movingExpId, setMovingExpId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [dragExpId, setDragExpId] = useState<string | null>(null);
  const activeDayRef = useRef<HTMLDivElement>(null);

  // "Set for now" — planner's personal signal stored in localStorage
  const setForNowKey = `wander:set-for-now:${trip.id}`;
  const [setForNow, setSetForNow] = useState<{ days: Set<string>; cities: Set<string> }>(() => {
    try {
      const raw = localStorage.getItem(setForNowKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { days: new Set(parsed.days || []), cities: new Set(parsed.cities || []) };
      }
    } catch { /* ignore */ }
    return { days: new Set(), cities: new Set() };
  });

  function toggleSetForNow(type: "day" | "city", id: string) {
    setSetForNow(prev => {
      const key = type === "day" ? "days" : "cities";
      const next = { days: new Set(prev.days), cities: new Set(prev.cities) };
      if (next[key].has(id)) next[key].delete(id);
      else next[key].add(id);
      try {
        localStorage.setItem(setForNowKey, JSON.stringify({
          days: [...next.days],
          cities: [...next.cities],
        }));
      } catch { /* ignore */ }
      return next;
    });
  }

  const isCitySet = setForNow.cities.has(selectedCityId);

  // Drag sensors — pointer for mouse, touch with slight delay for mobile
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  // ── Derived data ────────────────────────────────────────────

  // Cities in chronological order (arrival date, then sequence)
  const cities = useMemo(() => {
    const withDays = new Set(days.map(d => d.cityId));
    return trip.cities
      .filter(c => withDays.has(c.id))
      .sort((a, b) => {
        if (a.arrivalDate && b.arrivalDate) return a.arrivalDate.localeCompare(b.arrivalDate);
        if (a.arrivalDate) return -1;
        if (b.arrivalDate) return 1;
        return a.sequenceOrder - b.sequenceOrder;
      });
  }, [trip.cities, days]);

  const cityDays = useMemo(
    () => days.filter(d => d.cityId === selectedCityId).sort((a, b) => a.date.localeCompare(b.date)),
    [days, selectedCityId],
  );

  const effectiveDayId = activeDayId && cityDays.some(d => d.id === activeDayId)
    ? activeDayId
    : cityDays[0]?.id || null;

  const activeDay = cityDays.find(d => d.id === effectiveDayId) || null;

  const cityExps = useMemo(
    () => experiences.filter(e => e.cityId === selectedCityId),
    [experiences, selectedCityId],
  );

  const unassigned = useMemo(
    () => cityExps.filter(e => e.state === "possible" && !e.dayId && !pending.has(e.id)),
    [cityExps, pending],
  );

  const assigned = useMemo(
    () => cityExps.filter(e => e.state === "selected" && e.dayId),
    [cityExps],
  );

  const themeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of unassigned) {
      if (e.themes.length === 0) { c.other = (c.other || 0) + 1; continue; }
      for (const t of e.themes) c[t] = (c[t] || 0) + 1;
    }
    return c;
  }, [unassigned]);

  const pool = useMemo(() => {
    let items = [...unassigned];
    if (themeFilter) {
      items = items.filter(e =>
        e.themes.includes(themeFilter) || (themeFilter === "other" && e.themes.length === 0),
      );
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.description || "").toLowerCase().includes(q),
      );
    }
    if (sort === "rating") {
      items.sort((a, b) => (bestRating(b) || 0) - (bestRating(a) || 0));
    } else {
      items.sort((a, b) => a.name.localeCompare(b.name));
    }
    return items;
  }, [unassigned, themeFilter, search, sort]);

  const dayExpsMap = useMemo(() => {
    const map = new Map<string, Experience[]>();
    for (const d of cityDays) {
      map.set(d.id, assigned.filter(e => e.dayId === d.id));
    }
    return map;
  }, [cityDays, assigned]);

  const assignedByDay = useMemo(() => {
    const groups: { day: Day; exps: Experience[] }[] = [];
    for (const d of cityDays) {
      const exps = assigned.filter(e => e.dayId === d.id);
      if (exps.length > 0) groups.push({ day: d, exps });
    }
    return groups;
  }, [cityDays, assigned]);

  const totalIdeas = cityExps.length;
  const plannedCount = assigned.length;

  useEffect(() => {
    activeDayRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [effectiveDayId]);

  // ── Drag handlers ─────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    setDragExpId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragExpId(null);
    const { active, over } = event;
    if (!over) return;

    const expId = active.id as string;
    const target = over.id as string;

    if (target === "pool-drop") {
      // Dragged to pool = unplan
      handleRemove(expId);
    } else if (target.startsWith("day-")) {
      const dayId = target.replace("day-", "");
      const exp = experiences.find(e => e.id === expId);
      if (!exp) return;
      if (exp.state === "possible" && !exp.dayId) {
        // Pool → day
        handleAdd(expId, dayId);
      } else if (exp.dayId !== dayId) {
        // Day → different day
        handleMove(expId, dayId);
      }
    }
  }

  const dragExp = dragExpId ? experiences.find(e => e.id === dragExpId) || null : null;

  // ── Handlers ──────────────────────────────────────────────

  function handleAdd(expId: string, targetDayId?: string) {
    const dayId = targetDayId || effectiveDayId;
    if (!dayId) return;
    setPending(prev => new Set(prev).add(expId));
    onPromote(expId, dayId);
    setTimeout(() => setPending(prev => {
      const next = new Set(prev); next.delete(expId); return next;
    }), 5000);
  }

  function handleRemove(expId: string) {
    onDemote(expId);
  }

  function handleMove(expId: string, toDayId: string) {
    onPromote(expId, toDayId);
    setMovingExpId(null);
  }

  function handleCityChange(cityId: string) {
    setSelectedCityId(cityId);
    setActiveDayId(null);
    setThemeFilter(null);
    setSearch("");
    setMovingExpId(null);
  }

  // ── Formatters ────────────────────────────────────────────

  function fmtDay(day: Day, short = false): string {
    if (trip.datesKnown === false) return `Day ${day.dayNumber || "?"}`;
    const d = new Date(day.date);
    return short
      ? d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" })
      : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  }

  function themeEmoji(exp: Experience): string {
    const t = exp.themes[0];
    return THEMES[t]?.emoji || "\uD83D\uDCCD";
  }

  function bestRating(exp: Experience): number | null {
    if (!exp.ratings?.length) return null;
    return Math.max(...exp.ratings.map(r => r.ratingValue));
  }

  function fullness(count: number): { text: string; cls: string } {
    if (count === 0) return { text: "Wide open", cls: "text-[#c8bba8]" };
    const s = count === 1 ? "thing" : "things";
    if (count <= 3) return { text: `${count} ${s}`, cls: "text-[#8a7a62]" };
    if (count <= 5) return { text: `${count} ${s} \u2014 full day`, cls: "text-amber-600" };
    return { text: `${count} ${s} \u2014 packed`, cls: "text-amber-700" };
  }

  const addLabel = activeDay ? `+ ${fmtDay(activeDay, true)}` : "+";
  const cityName = cities.find(c => c.id === selectedCityId)?.name || "";

  // ── Render ────────────────────────────────────────────────

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        className="fixed inset-0 z-40 lg:static lg:z-auto lg:flex-1 bg-[#faf8f5] flex flex-col border-l border-[#f0ece5]"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* ─── Header ─────────────────────────────────────────── */}
        <div className="shrink-0 px-4 py-3 bg-white border-b border-[#e0d8cc] flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-sm text-[#8a7a62] hover:text-[#3a3128] transition-colors shrink-0"
          >
            &larr; Map
          </button>
          <div className="flex-1 text-center min-w-0">
            <div className="text-sm font-medium text-[#3a3128] truncate">{trip.name}</div>
            {totalIdeas > 0 && (
              <div className="text-[11px] text-[#a89880] mt-0.5 flex items-center justify-center gap-2">
                <span>{plannedCount} of {totalIdeas} ideas planned for {cityName}</span>
                {plannedCount > 0 && (
                  <button
                    onClick={() => toggleSetForNow("city", selectedCityId)}
                    className={`transition-colors ${
                      isCitySet ? "text-amber-600" : "text-[#c8bba8] hover:text-[#8a7a62]"
                    }`}
                    title={isCitySet ? `${cityName} is set for now` : `Mark ${cityName} as set for now`}
                  >
                    {isCitySet ? "\u2728" : "\u2606"}
                  </button>
                )}
              </div>
            )}
          </div>
          {onAdd ? (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="text-sm text-[#8a7a62] hover:text-[#3a3128] transition-colors"
              >
                + Add
              </button>
              {showAddMenu && (
                <>
                  <div className="fixed inset-0 z-[1]" onClick={() => setShowAddMenu(false)} />
                  <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-[#e0d8cc] py-1 z-[2] whitespace-nowrap">
                    <button onClick={() => { onAdd(selectedCityId, "manual"); setShowAddMenu(false); }}
                      className="block w-full px-4 py-2 text-sm text-[#3a3128] hover:bg-[#f0ece5] text-left">Manual</button>
                    <button onClick={() => { onAdd(selectedCityId, "import"); setShowAddMenu(false); }}
                      className="block w-full px-4 py-2 text-sm text-[#3a3128] hover:bg-[#f0ece5] text-left">Import</button>
                    <button onClick={() => { onAdd(selectedCityId, "camera"); setShowAddMenu(false); }}
                      className="block w-full px-4 py-2 text-sm text-[#3a3128] hover:bg-[#f0ece5] text-left">Camera</button>
                    <div className="border-t border-[#e0d8cc] my-0.5" />
                    <button onClick={() => { onAdd(selectedCityId, "decision"); setShowAddMenu(false); }}
                      className="block w-full px-4 py-2 text-sm text-[#3a3128] hover:bg-[#f0ece5] text-left">Group decision</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="w-14 shrink-0" />
          )}
        </div>

        {/* ─── City tabs (chronological) ────────────────────── */}
        {cities.length > 1 && (
          <div
            className="shrink-0 flex gap-1.5 px-4 py-2 bg-white border-b border-[#f0ece5] overflow-x-auto"
            style={{ touchAction: "pan-x", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          >
            {cities.map(city => {
              const isActive = city.id === selectedCityId;
              const ct = experiences.filter(e => e.cityId === city.id).length;
              const cp = experiences.filter(e => e.cityId === city.id && e.state === "selected" && e.dayId).length;
              return (
                <button
                  key={city.id}
                  onClick={() => handleCityChange(city.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#514636] text-white"
                      : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                  }`}
                >
                  {setForNow.cities.has(city.id) && <span className="mr-0.5">{"\u2728"}</span>}
                  {city.name}
                  <span className={`ml-1.5 text-[11px] ${isActive ? "text-white/60" : "text-[#a89880]"}`}>
                    {cp}/{ct}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ─── Main split ─────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* ── Desktop: days column (left) ── */}
          <div className="hidden lg:flex lg:flex-col w-72 xl:w-80 border-r border-[#f0ece5] bg-white overflow-y-auto">
            <div className="px-3 py-2.5 text-[11px] font-medium text-[#a89880] uppercase tracking-wider border-b border-[#f0ece5]">
              {cityDays.length} day{cityDays.length !== 1 ? "s" : ""} in {cityName}
            </div>

            {cityDays.map(day => {
              const exps = dayExpsMap.get(day.id) || [];
              const isActive = day.id === effectiveDayId;
              const f = fullness(exps.length);
              return (
                <DroppableDay key={day.id} dayId={day.id} isOver={dragExpId != null}>
                  <div
                    ref={isActive ? activeDayRef : undefined}
                    onClick={() => setActiveDayId(day.id)}
                    role="button"
                    tabIndex={0}
                    className={`w-full text-left px-3 py-3 border-b border-[#f0ece5] transition-all cursor-pointer ${
                      isActive ? "bg-[#faf8f5]"
                        : setForNow.days.has(day.id) ? "bg-amber-50/40"
                        : "hover:bg-[#faf8f5]/50"
                    }`}
                    style={{ borderLeft: isActive ? "3px solid #514636" : setForNow.days.has(day.id) ? "3px solid #f59e0b40" : "3px solid transparent" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium ${isActive ? "text-[#3a3128]" : "text-[#6b5d4a]"}`}>
                        {setForNow.days.has(day.id) && <span className="mr-1">{"\u2728"}</span>}
                        {fmtDay(day)}
                      </span>
                      <span className={`text-[11px] shrink-0 ${f.cls}`}>{f.text}</span>
                    </div>

                    {exps.length > 0 && (
                      <div className={`mt-2 space-y-1 ${isActive ? "" : "opacity-60"}`}>
                        {exps.map(exp => isActive ? (
                          <DayItemRow
                            key={exp.id}
                            exp={exp}
                            themeEmoji={themeEmoji}
                            onExperienceClick={onExperienceClick}
                            onRemove={handleRemove}
                            onStartMove={setMovingExpId}
                            movingExpId={movingExpId}
                            cityDays={cityDays}
                            fmtDay={fmtDay}
                            onMove={handleMove}
                            desktop
                          />
                        ) : (
                          <div key={exp.id} className="flex items-center gap-1.5">
                            <span className="text-[10px] leading-none">{themeEmoji(exp)}</span>
                            <span className="text-[11px] text-[#8a7a62] truncate">{exp.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isActive && exps.length === 0 && (
                      <p className="mt-1.5 text-[11px] text-[#c8bba8] italic leading-snug">
                        {dragExpId ? "Drop here" : "Wide open \u2014 pick ideas from the right \u2192"}
                      </p>
                    )}

                    {/* Set for now toggle */}
                    {isActive && exps.length > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); toggleSetForNow("day", day.id); }}
                        className={`mt-2 text-[11px] transition-colors ${
                          setForNow.days.has(day.id)
                            ? "text-amber-600"
                            : "text-[#c8bba8] hover:text-[#8a7a62]"
                        }`}
                      >
                        {setForNow.days.has(day.id) ? "\u2728 Set for now" : "Mark as set for now"}
                      </button>
                    )}
                  </div>
                </DroppableDay>
              );
            })}

            {cityDays.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-[#a89880]">
                No days set for {cityName} yet
              </div>
            )}
          </div>

          {/* ── Mobile: stacked layout ── */}
          <div className="flex-1 flex flex-col lg:hidden overflow-hidden">
            {/* Day pills — bigger for drag targets */}
            <div
              className="shrink-0 flex gap-2 px-3 py-2 bg-white border-b border-[#f0ece5] overflow-x-auto"
              style={{ touchAction: "pan-x", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
            >
              {cityDays.map(day => {
                const count = (dayExpsMap.get(day.id) || []).length;
                const isActive = day.id === effectiveDayId;
                return (
                  <DroppableDay key={day.id} dayId={day.id} isOver={dragExpId != null} pill>
                    <button
                      onClick={() => setActiveDayId(day.id)}
                      className={`shrink-0 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-[#514636] text-white"
                          : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                      }`}
                    >
                      {setForNow.days.has(day.id) && <span className="mr-0.5">{"\u2728"}</span>}
                      {fmtDay(day, true)}
                      {count > 0 && (
                        <span className={`ml-1 ${isActive ? "text-white/60" : "text-[#a89880]"}`}>
                          ({count})
                        </span>
                      )}
                    </button>
                  </DroppableDay>
                );
              })}
              {cityDays.length === 0 && (
                <span className="text-xs text-[#a89880] py-1">No days yet</span>
              )}
            </div>

            {/* Active day card (collapsible) */}
            {activeDay && (
              <div className="shrink-0 bg-white border-b border-[#e0d8cc]">
                <button
                  onClick={() => setDayExpanded(!dayExpanded)}
                  className="w-full px-3 py-2.5 flex items-center gap-2 active:bg-[#faf8f5] transition-colors"
                >
                  <span className="text-base text-[#a89880]">{dayExpanded ? "\u25BE" : "\u25B8"}</span>
                  <span className="text-sm font-medium text-[#3a3128]">{fmtDay(activeDay)}</span>
                  <span className={`text-[11px] ${fullness((dayExpsMap.get(activeDay.id) || []).length).cls}`}>
                    &middot; {fullness((dayExpsMap.get(activeDay.id) || []).length).text}
                  </span>
                </button>
                {dayExpanded && (
                  <div className="px-3 pb-2.5 space-y-1.5">
                    {(dayExpsMap.get(activeDay.id) || []).length === 0 ? (
                      <p className="text-[11px] text-[#c8bba8] italic py-0.5">Nothing yet &mdash; tap + below</p>
                    ) : (
                      (dayExpsMap.get(activeDay.id) || []).map(exp => (
                        <DayItemRow
                          key={exp.id}
                          exp={exp}
                          themeEmoji={themeEmoji}
                          onExperienceClick={onExperienceClick}
                          onRemove={handleRemove}
                          onStartMove={setMovingExpId}
                          movingExpId={movingExpId}
                          cityDays={cityDays}
                          fmtDay={fmtDay}
                          onMove={handleMove}
                          desktop={false}
                        />
                      ))
                    )}
                    {/* Set for now on mobile */}
                    {(dayExpsMap.get(activeDay.id) || []).length > 0 && (
                      <button
                        onClick={() => toggleSetForNow("day", activeDay.id)}
                        className={`mt-1 text-[11px] transition-colors ${
                          setForNow.days.has(activeDay.id)
                            ? "text-amber-600"
                            : "text-[#c8bba8]"
                        }`}
                      >
                        {setForNow.days.has(activeDay.id) ? "\u2728 Set for now" : "Mark as set for now"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Pool (mobile) */}
            <div className="flex-1 overflow-y-auto">
              <PoolSection
                pool={pool} unassigned={unassigned} assigned={assigned} assignedByDay={assignedByDay}
                totalIdeas={totalIdeas} plannedCount={plannedCount} cityName={cityName}
                themeCounts={themeCounts} themeFilter={themeFilter} setThemeFilter={setThemeFilter}
                search={search} setSearch={setSearch} sort={sort} setSort={setSort}
                showPlanned={showPlanned} setShowPlanned={setShowPlanned}
                addLabel={addLabel} effectiveDayId={effectiveDayId}
                cityDays={cityDays} movingExpId={movingExpId} dragActive={dragExpId != null}
                onAdd={id => handleAdd(id)} onRemove={handleRemove}
                onMove={handleMove} onStartMove={setMovingExpId}
                onExperienceClick={onExperienceClick}
                themeEmoji={themeEmoji} bestRating={bestRating} fmtDay={fmtDay}
              />
            </div>
          </div>

          {/* ── Desktop: pool column (right) ── */}
          <div className="hidden lg:flex lg:flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <PoolSection
                pool={pool} unassigned={unassigned} assigned={assigned} assignedByDay={assignedByDay}
                totalIdeas={totalIdeas} plannedCount={plannedCount} cityName={cityName}
                themeCounts={themeCounts} themeFilter={themeFilter} setThemeFilter={setThemeFilter}
                search={search} setSearch={setSearch} sort={sort} setSort={setSort}
                showPlanned={showPlanned} setShowPlanned={setShowPlanned}
                addLabel={addLabel} effectiveDayId={effectiveDayId}
                cityDays={cityDays} movingExpId={movingExpId} dragActive={dragExpId != null}
                onAdd={id => handleAdd(id)} onRemove={handleRemove}
                onMove={handleMove} onStartMove={setMovingExpId}
                onExperienceClick={onExperienceClick}
                themeEmoji={themeEmoji} bestRating={bestRating} fmtDay={fmtDay}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Drag overlay — the "ghost" item following the cursor */}
      <DragOverlay>
        {dragExp && (
          <div className="px-3 py-2.5 bg-white rounded-lg border-2 border-[#a89880] shadow-lg opacity-90 max-w-xs">
            <div className="flex items-center gap-2">
              <span className="text-base">{themeEmoji(dragExp)}</span>
              <span className="text-sm font-medium text-[#3a3128] truncate">{dragExp.name}</span>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ── Droppable day wrapper ───────────────────────────────────────

function DroppableDay({ dayId, isOver, pill, children }: {
  dayId: string; isOver: boolean; pill?: boolean; children: React.ReactNode;
}) {
  const { setNodeRef, isOver: thisOver } = useDroppable({ id: `day-${dayId}` });
  return (
    <div
      ref={setNodeRef}
      className={`transition-all ${
        isOver && thisOver
          ? pill
            ? "ring-2 ring-[#514636] ring-offset-1 rounded-lg"
            : "bg-[#514636]/5 ring-1 ring-[#514636]/30"
          : ""
      }`}
    >
      {children}
    </div>
  );
}

// ── Draggable pool item ─────────────────────────────────────────

function DraggablePoolItem({ expId, children }: { expId: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: expId });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={isDragging ? "opacity-30" : ""}
    >
      {children}
    </div>
  );
}

// ── Draggable day item ──────────────────────────────────────────

function DraggableDayItem({ expId, children }: { expId: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: expId });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={isDragging ? "opacity-30" : ""}
    >
      {children}
    </div>
  );
}

// ── Day item row (used in day cards and mobile active day) ──────

function DayItemRow({ exp, themeEmoji, onExperienceClick, onRemove, onStartMove, movingExpId, cityDays, fmtDay, onMove, desktop }: {
  exp: Experience;
  themeEmoji: (e: Experience) => string;
  onExperienceClick: (id: string) => void;
  onRemove: (id: string) => void;
  onStartMove: (id: string | null) => void;
  movingExpId: string | null;
  cityDays: Day[];
  fmtDay: (d: Day, short?: boolean) => string;
  onMove: (expId: string, dayId: string) => void;
  desktop: boolean;
}) {
  return (
    <DraggableDayItem expId={exp.id}>
      <div className={`flex items-center gap-1.5 ${desktop ? "group" : ""}`}>
        <span className="text-xs leading-none">{themeEmoji(exp)}</span>
        <span
          className="text-xs text-[#6b5d4a] flex-1 truncate cursor-pointer hover:text-[#3a3128] transition-colors"
          onClick={e => { e.stopPropagation(); onExperienceClick(exp.id); }}
        >
          {exp.name}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onStartMove(movingExpId === exp.id ? null : exp.id); }}
          className={`text-[#8a7a62] hover:text-[#3a3128] text-[11px] font-medium transition-all px-1
                      ${desktop ? "lg:text-xs opacity-0 group-hover:opacity-100" : "text-[11px]"}`}
        >
          move
        </button>
        <button
          onClick={e => { e.stopPropagation(); onRemove(exp.id); }}
          className={`text-[#c8bba8] hover:text-red-400 text-xs transition-all px-1 -mr-1
                      ${desktop ? "opacity-0 group-hover:opacity-100" : ""}`}
        >
          &times;
        </button>
      </div>
      {movingExpId === exp.id && (
        <div
          className="flex flex-wrap gap-1 mt-1.5 p-2 bg-[#faf8f5] rounded-lg border border-[#e0d8cc]"
          onClick={e => e.stopPropagation()}
        >
          {cityDays.map(d => {
            const isCurrent = d.id === exp.dayId;
            return (
              <button
                key={d.id}
                onClick={() => onMove(exp.id, d.id)}
                disabled={isCurrent}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  isCurrent
                    ? "bg-[#514636] text-white/50 cursor-default"
                    : "bg-white text-[#6b5d4a] hover:bg-[#514636] hover:text-white border border-[#e0d8cc]"
                }`}
              >
                {fmtDay(d, true)}
              </button>
            );
          })}
          <button
            onClick={() => onStartMove(null)}
            className="px-2 py-1 text-[11px] text-[#a89880] hover:text-[#6b5d4a]"
          >
            cancel
          </button>
        </div>
      )}
    </DraggableDayItem>
  );
}

// ── Pool section ────────────────────────────────────────────────

interface PoolProps {
  pool: Experience[];
  unassigned: Experience[];
  assigned: Experience[];
  assignedByDay: { day: Day; exps: Experience[] }[];
  totalIdeas: number;
  plannedCount: number;
  cityName: string;
  themeCounts: Record<string, number>;
  themeFilter: string | null;
  setThemeFilter: (v: string | null) => void;
  search: string;
  setSearch: (v: string) => void;
  sort: "name" | "rating";
  setSort: (v: "name" | "rating") => void;
  showPlanned: boolean;
  setShowPlanned: (v: boolean) => void;
  addLabel: string;
  effectiveDayId: string | null;
  cityDays: Day[];
  movingExpId: string | null;
  dragActive: boolean;
  onAdd: (expId: string) => void;
  onRemove: (expId: string) => void;
  onMove: (expId: string, toDayId: string) => void;
  onStartMove: (expId: string | null) => void;
  onExperienceClick: (id: string) => void;
  themeEmoji: (exp: Experience) => string;
  bestRating: (exp: Experience) => number | null;
  fmtDay: (day: Day, short?: boolean) => string;
}

function PoolSection({
  pool, unassigned, assigned, assignedByDay,
  totalIdeas, plannedCount, cityName,
  themeCounts, themeFilter, setThemeFilter,
  search, setSearch, sort, setSort,
  showPlanned, setShowPlanned,
  addLabel, effectiveDayId, cityDays, movingExpId, dragActive,
  onAdd, onRemove, onMove, onStartMove, onExperienceClick,
  themeEmoji, bestRating, fmtDay,
}: PoolProps) {
  const hasThemes = Object.keys(themeCounts).length > 0;
  const hasRatings = unassigned.some(e => e.ratings?.length > 0);

  return (
    <div className="p-3 lg:p-4 max-w-2xl">
      {/* ── Progress bar ── */}
      {totalIdeas > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-[#8a7a62]">
              {unassigned.length > 0
                ? `${unassigned.length} idea${unassigned.length !== 1 ? "s" : ""} to plan`
                : "All planned"}
            </span>
            <span className="text-[11px] text-[#a89880]">{plannedCount}/{totalIdeas}</span>
          </div>
          <div className="h-1.5 bg-[#f0ece5] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#514636] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(plannedCount / totalIdeas) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Theme filter chips + sort ── */}
      <div className="flex items-start gap-2 mb-3">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {hasThemes && (
            <>
              <button
                onClick={() => setThemeFilter(null)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  !themeFilter ? "bg-[#514636] text-white" : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                }`}
              >
                All {unassigned.length}
              </button>
              {Object.entries(THEMES).map(([key, { emoji }]) => {
                const count = themeCounts[key];
                if (!count) return null;
                return (
                  <button
                    key={key}
                    onClick={() => setThemeFilter(themeFilter === key ? null : key)}
                    className={`px-2 py-1 rounded-full text-xs transition-colors ${
                      themeFilter === key
                        ? "bg-[#514636] text-white"
                        : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                    }`}
                  >
                    {emoji} {count}
                  </button>
                );
              })}
            </>
          )}
        </div>
        {hasRatings && unassigned.length > 3 && (
          <div className="flex rounded-lg border border-[#e0d8cc] overflow-hidden shrink-0">
            <button
              onClick={() => setSort("name")}
              className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                sort === "name" ? "bg-[#514636] text-white" : "bg-white text-[#8a7a62] hover:bg-[#f0ece5]"
              }`}
            >
              A-Z
            </button>
            <button
              onClick={() => setSort("rating")}
              className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                sort === "rating" ? "bg-[#514636] text-white" : "bg-white text-[#8a7a62] hover:bg-[#f0ece5]"
              }`}
            >
              {"\u2605"}
            </button>
          </div>
        )}
      </div>

      {/* ── Search ── */}
      {unassigned.length > 0 && (
        <div className={`mb-3 ${unassigned.length <= 5 ? "hidden lg:block" : ""}`}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ideas..."
            className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white text-sm text-[#3a3128]
                       placeholder:text-[#c8bba8] focus:outline-none focus:border-[#a89880] transition-colors"
          />
        </div>
      )}

      {/* ── Drop zone: drag here to unplan ── */}
      {dragActive && <PoolDropZone />}

      {/* ── Empty states ── */}
      {pool.length === 0 && unassigned.length === 0 && assigned.length > 0 && (
        <div className="text-center py-10">
          <div className="text-2xl mb-2">{"\u2728"}</div>
          <div className="text-sm text-[#6b5d4a] font-medium mb-1">
            {cityName} is all set
          </div>
          <div className="text-xs text-[#a89880]">
            Every idea has a day
          </div>
        </div>
      )}

      {pool.length === 0 && unassigned.length > 0 && (
        <div className="text-center py-8 text-sm text-[#a89880]">
          No ideas match that filter
        </div>
      )}

      {pool.length === 0 && unassigned.length === 0 && assigned.length === 0 && (
        <div className="text-center py-10">
          <div className="text-sm text-[#6b5d4a] mb-1">Nothing here yet</div>
          <div className="text-xs text-[#a89880] leading-relaxed">
            Tap + Add above to get started
          </div>
        </div>
      )}

      {/* ── Idea cards ── */}
      <div className="space-y-1.5">
        {pool.map(exp => {
          const rating = bestRating(exp);
          return (
            <DraggablePoolItem key={exp.id} expId={exp.id}>
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-white border border-[#f0ece5]
                             hover:border-[#e0d8cc] transition-all group">
                <span className="text-lg leading-none shrink-0 mt-0.5">{themeEmoji(exp)}</span>
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => onExperienceClick(exp.id)}
                >
                  <div className="text-sm text-[#3a3128] font-medium">{exp.name}</div>
                  {rating != null && (
                    <span className="text-[11px] text-[#a89880] whitespace-nowrap">{"\u2605"} {rating.toFixed(1)}</span>
                  )}
                  {exp.description && !exp.description.startsWith("Nearby") && (
                    <p className="text-[11px] text-[#c8bba8] mt-0.5 line-clamp-3 leading-relaxed">{exp.description}</p>
                  )}
                </div>
                <button
                  onClick={() => onAdd(exp.id)}
                  disabled={!effectiveDayId}
                  className="shrink-0 px-3 py-2.5 rounded-lg text-xs font-medium transition-all
                             bg-[#f0ece5] text-[#6b5d4a]
                             hover:bg-[#514636] hover:text-white
                             active:scale-95
                             disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {addLabel}
                </button>
              </div>
            </DraggablePoolItem>
          );
        })}
      </div>

      {/* ── Already planned ── */}
      {assignedByDay.length > 0 && (
        <div className="mt-6 pt-4 border-t border-[#f0ece5]">
          <button
            onClick={() => setShowPlanned(!showPlanned)}
            className="flex items-center gap-2 text-sm text-[#a89880] hover:text-[#8a7a62] transition-colors mb-2"
          >
            <span className="text-base">{showPlanned ? "\u25BE" : "\u25B8"}</span>
            <span>Already planned ({assigned.length})</span>
          </button>

          {showPlanned && (
            <div className="space-y-4">
              {assignedByDay.map(({ day, exps }) => (
                <div key={day.id}>
                  <div className="text-[11px] font-medium text-[#a89880] mb-1.5 uppercase tracking-wide">
                    {fmtDay(day)}
                  </div>
                  <div className="space-y-1">
                    {exps.map(exp => (
                      <div key={exp.id}>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#faf8f5] border border-[#f0ece5]">
                          <span className="text-sm leading-none shrink-0 opacity-50">{themeEmoji(exp)}</span>
                          <span
                            className="text-xs text-[#8a7a62] flex-1 truncate cursor-pointer hover:text-[#6b5d4a] transition-colors"
                            onClick={() => onExperienceClick(exp.id)}
                          >
                            {exp.name}
                          </span>
                          <button
                            onClick={() => onStartMove(movingExpId === exp.id ? null : exp.id)}
                            className="text-[#8a7a62] hover:text-[#3a3128] text-[11px] lg:text-xs font-medium px-1 transition-colors"
                          >
                            move
                          </button>
                          <button
                            onClick={() => onRemove(exp.id)}
                            className="text-[#c8bba8] hover:text-red-400 text-xs px-1 transition-colors"
                          >
                            &times;
                          </button>
                        </div>
                        {movingExpId === exp.id && (
                          <div className="flex flex-wrap gap-1 mt-1 ml-3 p-2 bg-[#faf8f5] rounded-lg border border-[#e0d8cc]">
                            {cityDays.map(d => {
                              const isCurrent = d.id === exp.dayId;
                              return (
                                <button
                                  key={d.id}
                                  onClick={() => onMove(exp.id, d.id)}
                                  disabled={isCurrent}
                                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                                    isCurrent
                                      ? "bg-[#514636] text-white/50 cursor-default"
                                      : "bg-white text-[#6b5d4a] hover:bg-[#514636] hover:text-white border border-[#e0d8cc]"
                                  }`}
                                >
                                  {fmtDay(d, true)}
                                </button>
                              );
                            })}
                            <button
                              onClick={() => onStartMove(null)}
                              className="px-2 py-1 text-[11px] text-[#a89880] hover:text-[#6b5d4a]"
                            >
                              cancel
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pool drop zone (visible during drag to unplan items) ────────

function PoolDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: "pool-drop" });
  return (
    <div
      ref={setNodeRef}
      className={`mb-3 py-3 rounded-lg border-2 border-dashed text-center text-xs transition-all ${
        isOver
          ? "border-[#514636] bg-[#514636]/5 text-[#514636]"
          : "border-[#e0d8cc] text-[#c8bba8]"
      }`}
    >
      Drop here to unplan
    </div>
  );
}
