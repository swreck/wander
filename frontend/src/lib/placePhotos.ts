/**
 * A day's stops' photos (Oct 15 2026, the day as moments) — backend routes/placePhotos.ts. Asked for once the day's lines
 * are known; kept on the phone three days by the stop's Maps search, so a day opened again draws its photos at once.
 */
import { api } from "./api";

import type { Hours } from "./placeHours";
/** (hours: Google's, for the place her line means — lib/placeHours says when her time runs past them) */
/** `ok` on a photo after the first: checked to show the place too — Play shows it as the moment's second photo */
/** `id` on a photo: Wander's own address for it (Nov 16 2026) — the server finds Google's current copy of it */
export type PlaceHit = { id: string; v?: number; name: string | null; photos: { id?: string; credit: string | null; ok?: boolean }[]; hours?: Hours | null };
// (2: answers that carry when each was checked — the test runs' earlier copies are dropped; 3: with Google's hours;
// 4: only checked photos, up to six — a phone's earlier copies listed six of Google's with two checked, Oct 17)
const KEY = "wander:place-photos:4";
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
// (by Wander's own id for the photo when the place has one — Nov 16 2026; a place not yet looked at under those rules, or
// a copy this phone kept from before, by its place in the order, which the server still answers)
export const placePhotoUrl = (hit: PlaceHit, n: number, small = false) => `/api/place-photos/${hit.id}/${hit.photos[n]?.id || n}?v=${hit.v || 0}${small ? "&size=small" : ""}`;

/** A place as Wander has it now — asked after the first photo of a place not yet looked at has shown (Nov 16 2026: the
 *  place is looked at when that photo is opened, so this phone's copy had no photographer to credit). This phone's kept
 *  copy of the place is brought up to date too. */
export async function freshPlaceHit(id: string): Promise<PlaceHit | null> {
  try {
    const r = await api.get<{ hit: PlaceHit | null }>(`/place-photos/one/${encodeURIComponent(id)}`);
    const k = read();
    for (const key of Object.keys(k)) if (k[key].hit?.id === id) k[key] = { hit: r.hit, at: Date.now() };
    write(k);
    return r.hit;
  } catch { return null; }
}

/** Why a photo didn't show, asked once after it fails: "gone" when Wander answers it has no such photo (Google stops
 *  serving a saved photo about a month after it was found — Japan's from Oct 17, seen Nov 16 2026), "signal" when the
 *  phone couldn't reach Wander. Every failure said "needs signal", which was untrue online. */
export async function whyNoPhoto(src: string): Promise<"gone" | "signal"> {
  try { return (await fetch(src)).status === 404 ? "gone" : "signal"; } catch { return "signal"; }
}

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
  api.get<{ places: { id?: string; query: string; line: string; words?: string; hit: PlaceHit | null }[] }>("/place-photos/known").then((r) => {
    const k = read(), now = Date.now();
    // (by its line, and by the words its photos were judged against — her map list's stops are asked for by their name
    // with her description; kept by those words too, the day draws their photos in its first frame)
    for (const p of r.places || []) { k[keyOf(p)] = { hit: p.hit, at: now }; if (p.words) k[keyOf({ query: p.query, line: p.words })] = { hit: p.hit, at: now }; }
    // (and every other copy of each place, kept by other words — a day sends her list's description with a stop's
    // name, so its copy is kept by those words; it's corrected here too, by the place's own id — Nov 16 2026: a copy
    // from before a place was checked again kept drawing a photo the place no longer has)
    const byId = new Map((r.places || []).filter((p) => p.id).map((p) => [p.id!, p.hit]));
    for (const key of Object.keys(k)) { const id = k[key].hit?.id; if (id && byId.has(id)) k[key] = { hit: byId.get(id)!, at: now }; }
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
