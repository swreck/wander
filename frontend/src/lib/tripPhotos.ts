/**
 * Your own photos, on the day you took them (backend routes/tripPhotos.ts; Oct 15 2026). Each photo is shrunk here on the
 * phone (a sharp copy ~1800 px and a small one for strips) and filed under the day its own clock says it was taken — the
 * day you're looking at when it carries none. Yours alone until you share it with the trip.
 */
import { useEffect, useState } from "react";
import { api } from "./api";
import { whoIs } from "./offlineStore";

export interface TripPhoto {
  id: string; dayDate: string; takenAt: string | null; caption: string | null; shared: boolean; authorName: string; mine: boolean;
  width: number | null; height: number | null; url: string; thumbUrl: string; createdAt: string;
}
export const PHOTOS_CHANGED = "wander:photos-changed";

// Open photo screens ask again when the trip changed (the others' share, unshare or delete arrive as a quiet change) and
// when Wander comes back to the front — a phone asleep in a pocket misses the news (tourist77, Oct 15 2026: a day left
// open kept showing a photo its taker had made private)
if (typeof window !== "undefined") {
  let last = 0;
  const again = () => { last = Date.now(); window.dispatchEvent(new Event(PHOTOS_CHANGED)); };
  window.addEventListener("wander:data-changed", again);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && Date.now() - last > 15_000) again(); });
}

// Each person's own copy, named from the sign-in itself and fixed before asking: on a shared phone Julie never sees
// Andy's list — not even his slow answer landing after she signed in (tourist75, tourist76; Oct 15 2026)
const PREFIX = "wander:photos:";
const token = () => { try { return localStorage.getItem("wander_token"); } catch { return null; } };
const key = (who: string, tripId: string, date: string | null) => `${PREFIX}${who}:${tripId}:${date || "all"}`;
export function savedPhotos(tripId: string, date: string | null): TripPhoto[] | undefined {
  const who = whoIs(token());
  if (!who) return undefined;
  try { const raw = localStorage.getItem(key(who, tripId, date)); return raw ? JSON.parse(raw) : undefined; } catch { return undefined; }
}
export async function photosOf(tripId: string, date: string | null): Promise<{ photos: TripPhoto[]; shareDefault: boolean } | null> {
  const asked = token(), who = whoIs(asked);
  if (!who) return null;
  try {
    const r = await api.get<{ photos: TripPhoto[]; shareDefault: boolean }>(`/trip-photos/trip/${tripId}${date ? `?date=${date}` : ""}`);
    if (token() !== asked) return null;                       // someone else is signed in now: not theirs to see or keep
    // (a day's list only: the story's whole-trip list was never read back, and kept the phone's copies of photos taken
    // back since — tourist77)
    if (date) try { localStorage.setItem(key(who, tripId, date), JSON.stringify(r.photos)); } catch { /* full */ }
    forgetGone(who);
    return r;
  } catch {
    // (no answer — a weak signal gave up: ask again soon, so a list holding a photo taken back since doesn't stay;
    // tourist78)
    if (!retrying) { retrying = true; setTimeout(() => { retrying = false; window.dispatchEvent(new Event(PHOTOS_CHANGED)); }, 15_000); }
    return null;
  }
}
let retrying = false;

/** Someone else's photos only once their picture has come — never a name, time or caption for a photo the server no
 *  longer gives this person (tourist78: on a weak signal Play showed "Ken's photo · 9:00 PM" and its caption over black,
 *  from the phone's old list, after Ken had made it private). Your own show at once. */
const cameIn = new Set<string>();
export function useShowable(photos: TripPhoto[]): TripPhoto[] {
  const [, redraw] = useState(0);
  const key = photos.map((p) => (p.mine ? "" : p.thumbUrl)).join("|");
  useEffect(() => {
    let live = true;
    for (const p of photos) {
      if (p.mine || cameIn.has(p.thumbUrl)) continue;
      const im = new Image();
      im.onload = () => { cameIn.add(p.thumbUrl); if (live) redraw((n) => n + 1); };
      im.src = p.thumbUrl;
    }
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return photos.filter((p) => p.mine || cameIn.has(p.thumbUrl));
}
/** The phone's copies of photos no longer in any of this person's lists (made private again, deleted, or someone
 *  else's) go — so with no signal later, a photo its taker took back doesn't open from the phone */
function forgetGone(who: string) {
  if (typeof caches === "undefined") return;
  const keep = new Set<string>();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(`${PREFIX}${who}:`)) for (const p of JSON.parse(localStorage.getItem(k) || "[]") as TripPhoto[]) keep.add(p.id);
  } catch { return; }
  caches.open("wander-photos-v1").then(async (c) => {
    for (const req of await c.keys()) { const id = new URL(req.url).pathname.split("/")[4]; if (id && !keep.has(id)) await c.delete(req); }
  }).catch(() => { /* nothing kept */ });
}

/** The photo's own "taken" clock, from its EXIF (DateTimeOriginal) — "2026-10-15T19:42", or null */
async function takenAtOf(file: File): Promise<string | null> {
  try {
    const buf = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (buf.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off + 4 < buf.byteLength) {
      const marker = buf.getUint16(off), size = buf.getUint16(off + 2);
      if (marker === 0xffe1 && buf.getUint32(off + 4) === 0x45786966) {
        const tiff = off + 10, little = buf.getUint16(tiff) === 0x4949;
        const u16 = (o: number) => buf.getUint16(tiff + o, little), u32 = (o: number) => buf.getUint32(tiff + o, little);
        const tagIn = (ifd: number, tag: number) => { const n = u16(ifd); for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (u16(e) === tag) return e; } return -1; };
        const exifPtr = tagIn(u32(4), 0x8769);
        if (exifPtr < 0) return null;
        const dt = tagIn(u32(exifPtr + 8), 0x9003);
        if (dt < 0) return null;
        const at = u32(dt + 8);
        let s = ""; for (let i = 0; i < 19; i++) s += String.fromCharCode(buf.getUint8(tiff + at + i));
        const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/);
        return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : null;
      }
      if ((marker & 0xff00) !== 0xff00) return null;
      off += 2 + size;
    }
  } catch { /* no date in it */ }
  return null;
}

/** A sharp copy and a small one, drawn upright (the phone's own orientation) */
async function shrink(file: File): Promise<{ image: string; thumb: string; width: number; height: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const draw = (max: number, q: number) => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext("2d"); if (!g) return null;
      g.drawImage(img, 0, 0, c.width, c.height);
      return { data: c.toDataURL("image/jpeg", q).split(",")[1], w: c.width, h: c.height };
    };
    const full = draw(1800, 0.82), small = draw(480, 0.75);
    return full && small ? { image: full.data, thumb: small.data, width: full.w, height: full.h } : null;
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

/** Keep photos, one at a time (`onEach` after each). The day each goes under: its own clock's day if it's on the trip,
 *  else `day`. Returns how many were kept and the first problem, if any. */
export async function keepPhotos(tripId: string, files: File[], day: string, shared: boolean, trip: { first: string; last: string },
  onEach?: (done: number, total: number) => void): Promise<{ kept: number; days: string[]; elsewhereCount: number; error: string | null }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kept: 0, days: [], elsewhereCount: 0, error: "No signal right now. Add them again when there's signal." };
  let kept = 0, elsewhereCount = 0, error: string | null = null;
  const days = new Set<string>();
  for (const f of files) {
    const [taken, small] = await Promise.all([takenAtOf(f), shrink(f)]);
    if (!small) { error ??= `“${f.name || "That photo"}” couldn't be read on this phone.`; continue; }
    const own = taken?.slice(0, 10);
    const dayDate = own && own >= trip.first && own <= trip.last ? own : day;
    try {
      await api.post(`/trip-photos/trip/${tripId}`, { ...small, dayDate, takenAt: taken, shared });
      kept++; days.add(dayDate); if (dayDate !== day) elsewhereCount++;
    } catch (e: any) { error ??= e?.message && !/^Request failed|Failed to fetch|Load failed/i.test(e.message) ? e.message : "A photo didn't upload — the signal may be weak. Try that one again."; }
    onEach?.(kept, files.length);
  }
  if (kept) window.dispatchEvent(new Event(PHOTOS_CHANGED));
  return { kept, days: [...days], elsewhereCount, error };
}

export async function sharePhoto(id: string, shared: boolean): Promise<boolean> {
  try { await api.patch(`/trip-photos/${id}`, { shared }); window.dispatchEvent(new Event(PHOTOS_CHANGED)); return true; } catch { return false; }
}
export async function captionPhoto(id: string, caption: string): Promise<boolean> {
  try { await api.patch(`/trip-photos/${id}`, { caption }); window.dispatchEvent(new Event(PHOTOS_CHANGED)); return true; } catch { return false; }
}
export async function deletePhoto(id: string): Promise<boolean> {
  try { await api.delete(`/trip-photos/${id}`); window.dispatchEvent(new Event(PHOTOS_CHANGED)); return true; } catch { return false; }
}
