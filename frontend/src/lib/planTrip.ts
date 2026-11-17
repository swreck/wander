/**
 * Which trips are built from a plan (S2d, Nov 17 2026). The server says so when a status or a trip arrives; the phone
 * keeps the answer (ids and their source names, nothing else), so the words on the first draw are the right ones with
 * or without signal. Every read and write of localStorage is guarded: private mode or a full phone reads as "not a plan
 * trip", never as an error.
 */
const KEY = "wander:plan-trips";
const LAST = "wander:last-trip-id";

let known: Record<string, string[]> | null = null;

function load(): Record<string, string[]> {
  if (known) return known;
  known = {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [id, v] of Object.entries(raw)) if (Array.isArray(v)) known[id] = v.filter((s): s is string => typeof s === "string");
    }
  } catch { /* none kept, or unreadable */ }
  return known;
}

/** The server's answer for a trip. `sources` are only kept for a plan trip. */
export function notePlanTrip(tripId: string | null | undefined, plan: boolean | undefined, sources?: string[] | null) {
  if (!tripId || plan === undefined) return;
  const all = load();
  if (plan) {
    const list = Array.isArray(sources) ? sources.filter((s) => typeof s === "string") : all[tripId] || [];
    if (all[tripId] && JSON.stringify(all[tripId]) === JSON.stringify(list)) return;
    all[tripId] = list;
  } else {
    if (!(tripId in all)) return;
    delete all[tripId];
  }
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private or full: memory still holds it */ }
}

const openTrip = (): string | null => { try { return localStorage.getItem(LAST); } catch { return null; } };

/** Is this trip (the open one when none is named) built from a plan? */
export function isPlanTrip(tripId?: string | null): boolean {
  const id = tripId || openTrip();
  return !!id && id in load();
}

/** The plan's own source names ("Larisa's notes", "Backroads' itinerary"), in the order the server gave them */
export function planSourcesOf(tripId?: string | null): string[] {
  const id = tripId || openTrip();
  return id ? load()[id] || [] : [];
}

/** For tests: forget what this module holds in memory, so the next read comes from localStorage again */
export function forgetPlanTripsInMemory() { known = null; }
