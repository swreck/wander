/**
 * Her Apple Maps guides by day (backend appleGuides.ts) — "See her Apple Maps guide for the day ↗" (Oct 2: Larisa made
 * a map in Apple Maps for each day). The link opens her map as it is now; Wander never changes it.
 */
import { api } from "./api";

export type GuidesByDay = Record<string, { name: string; link: string }[]>;
const byTrip = new Map<string, Promise<GuidesByDay>>();
const key = (tripId: string) => `wander:apple-guides:${tripId}`;

/** This phone's last copy (undefined if it has none) — the day draws with it at once, nothing drops in later */
export function savedAppleGuides(tripId: string): GuidesByDay | undefined {
  try { const raw = localStorage.getItem(key(tripId)); return raw ? (JSON.parse(raw) as GuidesByDay) : undefined; } catch { return undefined; }
}

/** Once per trip per visit (a failed ask is tried again next time) */
export function appleGuides(tripId: string): Promise<GuidesByDay> {
  if (!byTrip.has(tripId)) {
    const p = api.get<{ byDay: GuidesByDay }>(`/guide/apple-guides/${tripId}`)
      .then((r) => {
        const by = r.byDay || {};
        try { localStorage.setItem(key(tripId), JSON.stringify(by)); } catch { /* storage full or private */ }
        return by;
      })
      .catch(() => { byTrip.delete(tripId); return savedAppleGuides(tripId) || {}; });
    byTrip.set(tripId, p);
  }
  return byTrip.get(tripId)!;
}
