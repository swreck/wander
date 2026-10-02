/**
 * Each day's summary (backend daySummaries.ts), kept on this phone too, so a day still shows it with no signal.
 */
import { api } from "./api";

const key = (tripId: string) => `wander:day-summaries:${tripId}`;
const byTrip = new Map<string, Promise<Record<string, string>>>();

export function daySummaries(tripId: string): Promise<Record<string, string>> {
  if (!byTrip.has(tripId)) {
    const p = api.get<{ byDay: Record<string, string> }>(`/guide/day-summaries/${tripId}`)
      .then((r) => {
        const by = r.byDay || {};
        try { localStorage.setItem(key(tripId), JSON.stringify(by)); } catch { /* storage full or private */ }
        return by;
      })
      .catch(() => {
        byTrip.delete(tripId);
        // (no signal: the summaries this phone last saw — the server hides a changed day's, and so did that copy)
        try { return JSON.parse(localStorage.getItem(key(tripId)) || "{}") as Record<string, string>; } catch { return {}; }
      });
    byTrip.set(tripId, p);
  }
  return byTrip.get(tripId)!;
}
