/**
 * The Guide's day-by-day data for a trip, fetched once and shared.
 *
 * Home warms it as soon as the trip is known, so tapping a day opens instantly; the Day screen
 * reads it. The service worker also keeps these responses, so they survive a lost signal.
 */

import { api } from "./api";
import type { Trip, Day, Accommodation } from "./types";

export interface GuideItem {
  id: string;
  /** where the line is in her sheet: each tab and its cells (backend sources.ts spotsOf) — for "Open this spot" */
  spots?: { tab: string; a1s: string[] }[];
  date: string | null;
  time: string | null;
  endTime: string | null;
  timeZone: string | null;
  kind: string;
  title: string;
  detail: string | null;
  forWhom: string | null;
  place: string | null;
  confirmation: string | null;
  link: string | null;
  source: string;
  /** A deadline that can be done over several days: its first day (YYYY-MM-DD) */
  windowStart?: string | null;
  /** A day-plan block's time exactly as she wrote it ("~8:30–9:15", "Morning") */
  timeText?: string | null;
  /** Her order within the reading — a day plan is shown in this order, not re-sorted by clock */
  sortOrder?: number;
}

export interface GuideStatus {
  current: { sourceName: string; importedAt: string } | null;
}

export type Stay = Accommodation & { checkInDate?: string | null; checkOutDate?: string | null; forWhom?: string | null };

export interface TripGuideData {
  trip: Trip & { timeZone?: string | null };
  days: Day[];
  items: GuideItem[];
  stays: Stay[];
  status: GuideStatus | null;
  /** True when there was no signal and this is the phone's saved copy */
  fromSavedCopy?: boolean;
  savedAt?: string;
}

const cache = new Map<string, Promise<TripGuideData>>();
const savedKey = (tripId: string) => `wander:guide-copy:${tripId}`;

async function load(tripId: string): Promise<TripGuideData> {
  try {
    const [trip, days, items, stays, status] = await Promise.all([
      api.get<TripGuideData["trip"]>(`/trips/${tripId}`),
      api.get<Day[]>(`/days/trip/${tripId}`),
      api.get<GuideItem[]>(`/guide/items/${tripId}`),
      api.get<Stay[]>(`/accommodations/trip/${tripId}`),
      api.get<GuideStatus>(`/guide/status/${tripId}`).catch(() => null),
    ]);
    const data = { trip, days, items, stays, status };
    // Keep a copy on the phone: the plan must open with no signal
    try { localStorage.setItem(savedKey(tripId), JSON.stringify({ ...data, savedAt: new Date().toISOString() })); } catch { /* storage full */ }
    return data;
  } catch (err) {
    try {
      const raw = localStorage.getItem(savedKey(tripId));
      if (raw) return { ...(JSON.parse(raw) as TripGuideData), fromSavedCopy: true };
    } catch { /* unreadable copy */ }
    throw err;
  }
}

/** Start (or reuse) loading a trip's Guide data. A failed load is forgotten so the next call retries. */
export function guideData(tripId: string): Promise<TripGuideData> {
  let p = cache.get(tripId);
  if (!p) {
    p = load(tripId);
    cache.set(tripId, p);
    // A failure, or a saved copy used for lack of signal, is forgotten so the next look tries fresh
    p.then((d) => { if (d.fromSavedCopy) cache.delete(tripId); }, () => cache.delete(tripId));
  }
  return p;
}

/** Home calls this once the trip is known, so a tapped day opens at once. */
export function warmGuideData(tripId: string) {
  guideData(tripId).catch(() => { /* the Day screen will retry and explain */ });
}
