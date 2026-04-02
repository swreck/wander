/**
 * PlanningBoard — The container-filling view for trip planning.
 *
 * Split-panel layout: days on the left (containers to fill), unassigned
 * ideas on the right (the pool to pick from). One tap assigns an idea
 * to the active day. Both sides always visible. Progress you can feel.
 *
 * Inspired by the WineTracker case-building UI — same pattern, different
 * domain. Cases → days, wines → ideas, rating → theme.
 */

import { useState, useMemo, useRef, useEffect } from "react";
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
  onAdd?: (cityId: string) => void;
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
  const activeDayRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Derived data ────────────────────────────────────────────

  const cities = useMemo(() => {
    const withDays = new Set(days.map(d => d.cityId));
    return trip.cities.filter(c => withDays.has(c.id));
  }, [trip.cities, days]);

  const cityDays = useMemo(
    () => days.filter(d => d.cityId === selectedCityId).sort((a, b) => a.date.localeCompare(b.date)),
    [days, selectedCityId],
  );

  // Keep activeDayId valid for the current city
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

  // Theme counts (only unassigned pool)
  const themeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of unassigned) {
      if (e.themes.length === 0) { c.other = (c.other || 0) + 1; continue; }
      for (const t of e.themes) c[t] = (c[t] || 0) + 1;
    }
    return c;
  }, [unassigned]);

  // Filtered + sorted pool
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

  // Experiences per day
  const dayExpsMap = useMemo(() => {
    const map = new Map<string, Experience[]>();
    for (const d of cityDays) {
      map.set(d.id, assigned.filter(e => e.dayId === d.id));
    }
    return map;
  }, [cityDays, assigned]);

  // Assigned grouped by day (for the "already planned" section)
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

  // Scroll active day into view when it changes
  useEffect(() => {
    activeDayRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [effectiveDayId]);

  // ── Handlers ──────────────────────────────────────────────

  function handleAdd(expId: string) {
    if (!effectiveDayId) return;
    setPending(prev => new Set(prev).add(expId));
    onPromote(expId, effectiveDayId);
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

  // ── Shared: inline day picker for move ────────────────────

  function renderMovePicker(expId: string, currentDayId: string | null) {
    if (movingExpId !== expId) return null;
    return (
      <div
        className="flex flex-wrap gap-1 mt-1.5 p-2 bg-[#faf8f5] rounded-lg border border-[#e0d8cc]"
        onClick={e => e.stopPropagation()}
      >
        {cityDays.map(d => {
          const isCurrent = d.id === currentDayId;
          return (
            <button
              key={d.id}
              onClick={() => handleMove(expId, d.id)}
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
          onClick={() => setMovingExpId(null)}
          className="px-2 py-1 text-[11px] text-[#a89880] hover:text-[#6b5d4a]"
        >
          cancel
        </button>
      </div>
    );
  }

  // ── Shared: day item row (used in both desktop column & mobile card) ──

  function renderDayItem(exp: Experience, options: { showHoverRemove?: boolean }) {
    return (
      <div key={exp.id}>
        <div className={`flex items-center gap-1.5 ${options.showHoverRemove ? "group" : ""}`}>
          <span className="text-xs leading-none">{themeEmoji(exp)}</span>
          <span
            className="text-xs text-[#6b5d4a] flex-1 truncate cursor-pointer hover:text-[#3a3128] transition-colors"
            onClick={e => { e.stopPropagation(); onExperienceClick(exp.id); }}
          >
            {exp.name}
          </span>
          <button
            onClick={e => { e.stopPropagation(); setMovingExpId(movingExpId === exp.id ? null : exp.id); }}
            className={`text-[#c8bba8] hover:text-[#6b5d4a] text-[10px] transition-all px-1
                        ${options.showHoverRemove ? "opacity-0 group-hover:opacity-100" : ""}`}
            title="Move to another day"
          >
            move
          </button>
          <button
            onClick={e => { e.stopPropagation(); handleRemove(exp.id); }}
            className={`text-[#c8bba8] hover:text-red-400 text-xs transition-all px-1 -mr-1
                        ${options.showHoverRemove ? "opacity-0 group-hover:opacity-100" : ""}`}
            title="Back to ideas"
          >
            &times;
          </button>
        </div>
        {renderMovePicker(exp.id, exp.dayId)}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-40 lg:static lg:z-auto lg:flex-1 bg-[#faf8f5] flex flex-col border-l border-[#f0ece5] lg:border-l"
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
            <div className="text-[11px] text-[#a89880] mt-0.5">
              {plannedCount} of {totalIdeas} ideas planned for {cityName}
            </div>
          )}
        </div>
        {onAdd ? (
          <button
            onClick={() => onAdd(selectedCityId)}
            className="text-sm text-[#8a7a62] hover:text-[#3a3128] transition-colors shrink-0"
            title="Add a new idea"
          >
            + Add
          </button>
        ) : (
          <div className="w-14 shrink-0" />
        )}
      </div>

      {/* ─── City tabs ──────────────────────────────────────── */}
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
              <button
                key={day.id}
                ref={isActive ? activeDayRef : undefined}
                onClick={() => setActiveDayId(day.id)}
                className={`w-full text-left px-3 py-3 border-b border-[#f0ece5] transition-all ${
                  isActive ? "bg-[#faf8f5]" : "hover:bg-[#faf8f5]/50"
                }`}
                style={{ borderLeft: isActive ? "3px solid #514636" : "3px solid transparent" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-medium ${isActive ? "text-[#3a3128]" : "text-[#6b5d4a]"}`}>
                    {fmtDay(day)}
                  </span>
                  <span className={`text-[11px] shrink-0 ${f.cls}`}>{f.text}</span>
                </div>

                {/* Show items on ALL days (compact for inactive, detailed for active) */}
                {exps.length > 0 && (
                  <div className={`mt-2 space-y-1 ${isActive ? "" : "opacity-60"}`}>
                    {exps.map(exp => isActive
                      ? renderDayItem(exp, { showHoverRemove: true })
                      : (
                        <div key={exp.id} className="flex items-center gap-1.5">
                          <span className="text-[10px] leading-none">{themeEmoji(exp)}</span>
                          <span className="text-[11px] text-[#8a7a62] truncate">{exp.name}</span>
                        </div>
                      )
                    )}
                  </div>
                )}

                {isActive && exps.length === 0 && (
                  <p className="mt-1.5 text-[11px] text-[#c8bba8] italic leading-snug">
                    Wide open &mdash; pick ideas from the right &rarr;
                  </p>
                )}
              </button>
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
          {/* Day pills (horizontal scroll) */}
          <div
            className="shrink-0 flex gap-1.5 px-3 py-2 bg-white border-b border-[#f0ece5] overflow-x-auto"
            style={{ touchAction: "pan-x", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          >
            {cityDays.map(day => {
              const count = (dayExpsMap.get(day.id) || []).length;
              const isActive = day.id === effectiveDayId;
              return (
                <button
                  key={day.id}
                  onClick={() => setActiveDayId(day.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-[#514636] text-white"
                      : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                  }`}
                >
                  {fmtDay(day, true)}
                  {count > 0 && (
                    <span className={`ml-1 ${isActive ? "text-white/60" : "text-[#a89880]"}`}>
                      ({count})
                    </span>
                  )}
                </button>
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
                <span className="text-[11px] text-[#a89880] w-3">{dayExpanded ? "\u25BE" : "\u25B8"}</span>
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
                    (dayExpsMap.get(activeDay.id) || []).map(exp => renderDayItem(exp, { showHoverRemove: false }))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Pool (mobile) */}
          <div className="flex-1 overflow-y-auto">
            <Pool
              pool={pool}
              unassigned={unassigned}
              assigned={assigned}
              assignedByDay={assignedByDay}
              totalIdeas={totalIdeas}
              plannedCount={plannedCount}
              cityName={cityName}
              themeCounts={themeCounts}
              themeFilter={themeFilter}
              setThemeFilter={setThemeFilter}
              search={search}
              setSearch={setSearch}
              sort={sort}
              setSort={setSort}
              showPlanned={showPlanned}
              setShowPlanned={setShowPlanned}
              addLabel={addLabel}
              effectiveDayId={effectiveDayId}
              cityDays={cityDays}
              movingExpId={movingExpId}
              onAdd={handleAdd}
              onRemove={handleRemove}
              onMove={handleMove}
              onStartMove={setMovingExpId}
              onExperienceClick={onExperienceClick}
              themeEmoji={themeEmoji}
              bestRating={bestRating}
              fmtDay={fmtDay}
              searchRef={searchRef}
            />
          </div>
        </div>

        {/* ── Desktop: pool column (right) ── */}
        <div className="hidden lg:flex lg:flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <Pool
              pool={pool}
              unassigned={unassigned}
              assigned={assigned}
              assignedByDay={assignedByDay}
              totalIdeas={totalIdeas}
              plannedCount={plannedCount}
              cityName={cityName}
              themeCounts={themeCounts}
              themeFilter={themeFilter}
              setThemeFilter={setThemeFilter}
              search={search}
              setSearch={setSearch}
              sort={sort}
              setSort={setSort}
              showPlanned={showPlanned}
              setShowPlanned={setShowPlanned}
              addLabel={addLabel}
              effectiveDayId={effectiveDayId}
              cityDays={cityDays}
              movingExpId={movingExpId}
              onAdd={handleAdd}
              onRemove={handleRemove}
              onMove={handleMove}
              onStartMove={setMovingExpId}
              onExperienceClick={onExperienceClick}
              themeEmoji={themeEmoji}
              bestRating={bestRating}
              fmtDay={fmtDay}
              searchRef={searchRef}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pool sub-component (shared between mobile & desktop) ────────

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
  onAdd: (expId: string) => void;
  onRemove: (expId: string) => void;
  onMove: (expId: string, toDayId: string) => void;
  onStartMove: (expId: string | null) => void;
  onExperienceClick: (id: string) => void;
  themeEmoji: (exp: Experience) => string;
  bestRating: (exp: Experience) => number | null;
  fmtDay: (day: Day, short?: boolean) => string;
  searchRef: React.RefObject<HTMLInputElement | null>;
}

function Pool({
  pool, unassigned, assigned, assignedByDay,
  totalIdeas, plannedCount, cityName,
  themeCounts, themeFilter, setThemeFilter,
  search, setSearch, sort, setSort,
  showPlanned, setShowPlanned,
  addLabel, effectiveDayId, cityDays, movingExpId,
  onAdd, onRemove, onMove, onStartMove, onExperienceClick,
  themeEmoji, bestRating, fmtDay, searchRef,
}: PoolProps) {
  const hasThemes = Object.keys(themeCounts).length > 0;
  const hasRatings = unassigned.some(e => e.ratings?.length > 0);

  return (
    <div className="p-3 lg:p-4">
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

      {/* ── Theme filter chips ── */}
      {hasThemes && (
        <div className="flex gap-1.5 flex-wrap mb-3">
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
        </div>
      )}

      {/* ── Search + sort ── */}
      <div className="flex gap-2 mb-3">
        {/* Search: always on desktop, >5 items on mobile */}
        {(unassigned.length > 5 || unassigned.length > 0) && (
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ideas\u2026"
            className={`flex-1 px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white text-sm text-[#3a3128]
                       placeholder:text-[#c8bba8] focus:outline-none focus:border-[#a89880] transition-colors
                       ${unassigned.length <= 5 ? "hidden lg:block" : ""}`}
          />
        )}
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

      {/* ── Empty states ── */}
      {pool.length === 0 && unassigned.length === 0 && assigned.length > 0 && (
        <div className="text-center py-10">
          <div className="text-2xl mb-2">{"\u2728"}</div>
          <div className="text-sm text-[#6b5d4a] font-medium mb-1">
            {cityName} is all set
          </div>
          <div className="text-xs text-[#a89880]">
            Every idea has a day &mdash; nice work
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
            Close the board and use Add to capture<br />
            ideas for {cityName}
          </div>
        </div>
      )}

      {/* ── Idea cards ── */}
      <div className="space-y-1.5">
        {pool.map(exp => {
          const rating = bestRating(exp);
          return (
            <div
              key={exp.id}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white border border-[#f0ece5]
                         hover:border-[#e0d8cc] transition-all group"
            >
              <span className="text-lg leading-none shrink-0">{themeEmoji(exp)}</span>
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => onExperienceClick(exp.id)}
              >
                <div className="text-sm text-[#3a3128] font-medium truncate">{exp.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  {rating != null && (
                    <span className="text-[11px] text-[#a89880]">{"\u2605"} {rating.toFixed(1)}</span>
                  )}
                  {exp.description && !exp.description.startsWith("Nearby") && (
                    <span className="text-[11px] text-[#c8bba8] truncate">{exp.description}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => onAdd(exp.id)}
                disabled={!effectiveDayId}
                className="shrink-0 px-3 py-2.5 rounded-lg text-xs font-medium transition-all
                           bg-[#f0ece5] text-[#6b5d4a]
                           hover:bg-[#514636] hover:text-white
                           active:scale-95
                           disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {addLabel}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Already planned (collapsible, grouped by day) ── */}
      {assignedByDay.length > 0 && (
        <div className="mt-6 pt-4 border-t border-[#f0ece5]">
          <button
            onClick={() => setShowPlanned(!showPlanned)}
            className="flex items-center gap-2 text-xs text-[#a89880] hover:text-[#8a7a62] transition-colors mb-2"
          >
            <span className="text-[10px]">{showPlanned ? "\u25BE" : "\u25B8"}</span>
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
                            className="text-[#c8bba8] hover:text-[#6b5d4a] text-[10px] px-1 transition-colors"
                            title="Move to another day"
                          >
                            move
                          </button>
                          <button
                            onClick={() => onRemove(exp.id)}
                            className="text-[#c8bba8] hover:text-red-400 text-xs px-1 transition-colors"
                            title="Back to ideas"
                          >
                            &times;
                          </button>
                        </div>
                        {/* Move day picker */}
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
