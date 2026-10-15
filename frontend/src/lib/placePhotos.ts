/**
 * A day's stops' photos (Oct 15 2026, the day as moments) — backend routes/placePhotos.ts. Asked for once the day's lines
 * are known; kept on the phone three days by the stop's Maps search, so a day opened again draws its photos at once.
 */
import { api } from "./api";

import type { Hours } from "./placeHours";
/** (hours: Google's, for the place her line means — lib/placeHours says when her time runs past them) */
export type PlaceHit = { id: string; v?: number; name: string | null; photos: { credit: string | null }[]; hours?: Hours | null };
// (2: answers that carry when each was checked — the test runs' earlier copies are dropped; 3: with Google's hours)
const KEY = "wander:place-photos:3";
const KEEP = 3 * 24 * 3600_000;
type Kept = Record<string, { hit: PlaceHit | null; at: number }>;
const read = (): Kept => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const write = (k: Kept) => {
  try {
    const keys = Object.keys(k);
    for (const old of keys.slice(0, Math.max(0, keys.length - 200))) delete k[old];
    localStorage.setItem(KEY, JSON.stringify(k));
  } catch { /* full or private: asked again next time */ }
};

/** A stop's photo: small for the day's list, large full screen */
export const placePhotoUrl = (hit: PlaceHit, n: number, small = false) => `/api/place-photos/${hit.id}/${n}?v=${hit.v || 0}${small ? "&size=small" : ""}`;

// (kept by the search and her words both: her words changing — a new Guide copy — asks again)
const keyOf = (p: { query: string; line: string }) => `${p.query}\n${p.line}`;

/** What this phone already knows, by Maps search (for drawing at once) */
export function keptPlacePhotos(places: { query: string; line: string }[]): Record<string, PlaceHit | null> {
  const k = read(), now = Date.now(), out: Record<string, PlaceHit | null> = {};
  for (const p of places) { const e = k[keyOf(p)]; if (e && now - e.at < KEEP) out[p.query] = e.hit; }
  return out;
}

/** Ask Wander for the stops this phone doesn't know yet — by Maps search */
export async function lookUpPlacePhotos(tripId: string, cityId: string | null | undefined, places: { query: string; line: string }[]): Promise<Record<string, PlaceHit | null>> {
  const known = keptPlacePhotos(places);
  const ask = places.filter((p) => !(p.query in known));
  if (!ask.length || (typeof navigator !== "undefined" && navigator.onLine === false)) return known;
  try {
    const r = await api.post<{ places: Record<string, PlaceHit | null> }>("/place-photos/lookup", { tripId, cityId, places: ask.map((p) => ({ key: p.query, query: p.query, line: p.line })) });
    const k = read(), now = Date.now();
    // (a stop the server didn't finish in time is asked again next visit — only answers are kept)
    for (const p of ask) if (p.query in (r.places || {})) k[keyOf(p)] = { hit: r.places[p.query], at: now };
    write(k);
    return { ...known, ...(r.places || {}) };
  } catch { return known; }
}

/** When Wander opens: every stop Wander has already looked at, kept on the phone — so a day draws with its photos in
 *  its first frame, never moving as they arrive (tourist63). At most once every couple of hours. */
let primed = false;
export function primePlacePhotos(): void {
  if (primed || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  primed = true;
  try { if (Date.now() - Number(sessionStorage.getItem("wander:place-photos-primed") || 0) < 2 * 3600_000) return; } catch { /* none */ }
  api.get<{ places: { query: string; line: string; hit: PlaceHit | null }[] }>("/place-photos/known").then((r) => {
    const k = read(), now = Date.now();
    for (const p of r.places || []) k[keyOf(p)] = { hit: p.hit, at: now };
    write(k);
    try { sessionStorage.setItem("wander:place-photos-primed", String(now)); } catch { /* none */ }
  }).catch(() => { primed = false; });
}

/** The words a Maps link searches ("Tsukiji Outer Market, Ginza, Japan"), or null for a link that isn't a search */
export function mapsQueryOf(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    if (/maps\.apple\.com$/.test(u.hostname)) return u.searchParams.get("q") || null;
    if (/google\./.test(u.hostname)) {
      const q = u.searchParams.get("q") || u.searchParams.get("query");
      if (q) return q;
      const place = u.pathname.match(/\/maps\/(?:place|search)\/([^/@]+)/)?.[1];
      return place ? decodeURIComponent(place.replace(/\+/g, " ")) : null;
    }
  } catch { /* not a link */ }
  return null;
}
