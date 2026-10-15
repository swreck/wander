/**
 * Her illustrated map, one panel per day, at the top of the day (backend /guide/day-panels; "Wander in pictures" idea 3,
 * Oct 15 2026). The phone keeps its last copy, so a day draws with its panel in the first frame — never dropping in later.
 */
import { api } from "./api";

export interface DayPanel { url: string; w: number; h: number; label: string; of: string }
export type PanelsByDay = Record<string, DayPanel>;
const byTrip = new Map<string, Promise<PanelsByDay>>();
const key = (tripId: string) => `wander:day-panels:${tripId}`;

/** This phone's last copy (undefined if it has none) */
export function savedDayPanels(tripId: string): PanelsByDay | undefined {
  try { const raw = localStorage.getItem(key(tripId)); return raw ? (JSON.parse(raw) as PanelsByDay) : undefined; } catch { return undefined; }
}

/** Once per trip per visit (a failed ask is tried again next time) */
export function dayPanels(tripId: string): Promise<PanelsByDay> {
  if (!byTrip.has(tripId)) {
    const p = api.get<{ byDay: PanelsByDay }>(`/guide/day-panels/${tripId}`)
      .then((r) => {
        const got = r?.byDay && typeof r.byDay === "object" ? r.byDay : {};
        try { localStorage.setItem(key(tripId), JSON.stringify(got)); } catch { /* storage full or private */ }
        return got;
      })
      .catch(() => { byTrip.delete(tripId); return savedDayPanels(tripId) || {}; });
    byTrip.set(tripId, p);
  }
  return byTrip.get(tripId)!;
}
