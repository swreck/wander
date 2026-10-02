/**
 * Her Apple Maps guides by day (backend appleGuides.ts) — "See her Apple Maps guide for the day ↗" (Oct 2: Larisa made
 * a map in Apple Maps for each day). The link opens her map as it is now; Wander never changes it.
 */
import { api } from "./api";

export type GuidesByDay = Record<string, { name: string; link: string }[]>;
const byTrip = new Map<string, Promise<GuidesByDay>>();
/** Once per trip per visit (a failed ask is tried again next time) */
export function appleGuides(tripId: string): Promise<GuidesByDay> {
  if (!byTrip.has(tripId)) {
    const p = api.get<{ byDay: GuidesByDay }>(`/guide/apple-guides/${tripId}`).then((r) => r.byDay || {}).catch(() => { byTrip.delete(tripId); return {}; });
    byTrip.set(tripId, p);
  }
  return byTrip.get(tripId)!;
}
