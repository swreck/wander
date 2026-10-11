/**
 * Larisa's Google map ("My Maps" — every location of the trip, in layers she named: "Ginza - Day 0", "Tokoname"…).
 * Ken, Oct 11 2026: anyone should be able to ask Scout for "Larisa's detailed map" and get the link; Larisa set it to
 * "anyone with the link can view". Wander reads its public KML export — read-only, the same as opening the link; nothing
 * here can change her map — every few hours (Ken: "multiple hours is fine"), and keeps the last good reading: a failed
 * or empty read never replaces it. The map's id lives only in the trip's record (tabMappings.googleMap), never in code.
 *
 * Her layers are named by her, not dated: Wander never says which day a layer is for — her day plan says where each day
 * goes (a layer called "Day 0" is her numbering).
 */
import { createHash } from "crypto";
import prisma from "../db.js";
import { closeness, distanceWords, pinKey, type AppleGuide } from "./appleGuides.js";

export interface MyMapPlace { name: string; note: string | null; lat: number; lng: number }
export interface MyMapLayer { name: string; places: MyMapPlace[] }
export interface MyMap {
  /** the map's id (Google's "mid") */
  mid: string;
  title: string | null;
  layers: MyMapLayer[];
  /** when what Wander knows of her map last changed (or was first read) */
  readAt: string;
  /** when Wander last looked (changes on every look; never shown to Scout, so a look that finds nothing new costs nothing) */
  checkedAt?: string;
  /** what's on the map, as a fingerprint — a new reading replaces the old only when this changes */
  hash: string;
}

export const isMid = (s: unknown): s is string => typeof s === "string" && /^[\w-]{10,80}$/.test(s);
/** The link anyone with it can open (view only) */
export const viewLink = (mid: string) => `https://www.google.com/maps/d/viewer?mid=${mid}`;

const un = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<br\s*\/?>/gi, " / ").replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const tag = (s: string, t: string) => s.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1] ?? "";

/** Her map's layers and pins from its KML (lines and areas are left out — pins are places) */
export function parseMyMapKml(kml: string): { title: string | null; layers: MyMapLayer[] } {
  const docHead = kml.split("<Folder>")[0];
  const title = un(tag(docHead, "name")) || null;
  const layers: MyMapLayer[] = [];
  for (const f of kml.split("<Folder>").slice(1)) {
    const [head, ...rest] = f.split("<Placemark>");
    const places: MyMapPlace[] = [];
    const seen = new Set<string>();
    for (const p of rest) {
      if (!p.includes("<Point>")) continue;
      const [lng, lat] = (tag(p, "coordinates").trim().split(/\s+/)[0] || "").split(",").map(Number);
      const name = un(tag(p, "name"));
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      // (the same pin twice in a layer — her "Tokoname Pottery Footpath" is in Tokoname twice — said once)
      const key = `${name.toLowerCase()}|${lat.toFixed(5)},${lng.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const note = un(tag(p, "description")) || null;
      places.push({ name, note, lat, lng });
    }
    layers.push({ name: un(tag(head, "name")) || "(a layer with no name)", places });
  }
  return { title, layers };
}

const fingerprint = (m: { title: string | null; layers: MyMapLayer[] }) => createHash("sha1").update(JSON.stringify([m.title, m.layers])).digest("hex");

/** Read her map now (its public KML export — like a browser opening the view link). Null when it can't be read. */
export async function readMyMap(mid: string): Promise<{ title: string | null; layers: MyMapLayer[] } | null> {
  if (!isMid(mid)) return null;
  try {
    const r = await fetch(`https://www.google.com/maps/d/kml?mid=${mid}&forcekml=1`, {
      // (Google refuses a request that doesn't say what it is — Oct 11: a bare request got 403)
      headers: { "User-Agent": "Mozilla/5.0 (Wander; reads a shared map's KML export)", "Accept-Language": "en-US,en" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const text = await r.text();
    if (!/<kml[\s>]/.test(text)) return null;
    const m = parseMyMapKml(text);
    return m.layers.some((l) => l.places.length) ? m : null;
  } catch { return null; }
}

export async function myMapOf(tripId: string): Promise<MyMap | null> {
  const cfg = await prisma.sheetSyncConfig.findUnique({ where: { tripId }, select: { tabMappings: true } });
  const m = (cfg?.tabMappings as any)?.googleMap;
  return m && isMid(m.mid) && Array.isArray(m.layers) ? (m as MyMap) : null;
}

/**
 * Look at her map again and keep what's new. Returns what happened, for the log. A reading that fails or comes back
 * empty changes nothing; one with the same places only notes the look.
 */
export async function refreshMyMap(tripId: string, mid?: string): Promise<"new" | "same" | "unread" | "none"> {
  const cfg = await prisma.sheetSyncConfig.findUnique({ where: { tripId }, select: { tabMappings: true } });
  if (!cfg) return "none";
  const tm = (cfg.tabMappings || {}) as any;
  const id = mid || tm.googleMap?.mid;
  if (!isMid(id)) return "none";
  const read = await readMyMap(id);
  const now = new Date().toISOString();
  if (!read) return "unread";
  const hash = fingerprint(read);
  const was = tm.googleMap as MyMap | undefined;
  const same = !!was && was.mid === id && was.hash === hash;
  const next: MyMap = same ? { ...was!, checkedAt: now } : { mid: id, title: read.title, layers: read.layers, readAt: now, checkedAt: now, hash };
  await prisma.sheetSyncConfig.update({ where: { tripId }, data: { tabMappings: { ...tm, googleMap: next } } });
  return same ? "same" : "new";
}

/** Every trip with her map: looked at again every few hours, from a minute after the server starts */
export function startMyMapReader(everyMs = 3 * 3600_000): void {
  const pass = async () => {
    const cfgs = await prisma.sheetSyncConfig.findMany({ select: { tripId: true, tabMappings: true } }).catch(() => []);
    for (const c of cfgs) {
      if (!isMid((c.tabMappings as any)?.googleMap?.mid)) continue;
      const r = await refreshMyMap(c.tripId).catch(() => "unread" as const);
      console.log(`[google-map] trip ${c.tripId.slice(0, 8)}: ${r}`);
    }
  };
  // (unref: these never keep a process alive on their own — a test run ends when its work does)
  setTimeout(() => { void pass(); setInterval(() => { void pass(); }, everyMs).unref?.(); }, 60_000).unref?.();
}

/** "Sun, Oct 11" — a reading's day as people say it, on Japan's calendar */
export const saidDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Tokyo" });

/** Lines for Scout: the link, then each of her layers by her name, its pins with her notes, and what's close to what */
export function myMapLines(m: MyMap, stray: Map<string, { m: number; town: string | null }> = new Map()): string[] {
  const out: string[] = [];
  // (the date as people say it — Scout once said "read it on Oct 2 — sorry, Oct 11", mixing it with her Apple guides')
  out.push(`[Her Google map${m.title ? ` "${m.title}"` : ""} — anyone with this link can open it: ${viewLink(m.mid)} . Wander read it ${saidDate(m.readAt)}; her map may have changed since. Its layers are named by her; a layer's name is not a date.]`);
  for (const l of m.layers) {
    if (!l.places.length) continue;
    out.push(`Layer "${l.name}":`);
    for (const p of l.places) {
      const far = stray.get(pinKey(p));
      // (far from every town and every other pin of hers: misplaced — her Sannenzaka lane sat in Wakayama — or a real
      // place off the route, a day trip's; her plan tells which, so Scout weighs it, and nobody is sent there by this pin)
      out.push(`- ${p.name}${p.note ? ` — her note: "${p.note.slice(0, 300)}"` : ""}${far
        ? ` [her pin for this sits far from every town of the trip and her other pins — ${distanceWords(far.m)}${far.town ? ` from ${far.town}` : ""}, the nearest. If her plan puts this place somewhere else (a Kyoto street pinned outside Kyoto), the pin is likely misplaced: say so and suggest checking with Larisa. If her plan sends them there (a day trip), it may be right. Either way, never route anyone by this pin]` : ""}`);
    }
    const located = l.places.filter((p) => !stray.has(pinKey(p)));
    const asGuide = { name: l.name, link: "", readAt: m.readAt, date: null, tab: null, places: located.map((p) => ({ name: p.name, address: null, lat: p.lat, lng: p.lng })) } as AppleGuide;
    const c = closeness(asGuide);
    if (c.length > 1) {
      out.push("  What's close to what in this layer (straight-line distance between her pins — not a walking time):");
      for (const x of c) out.push(x.near.length ? `  - ${x.place}: ${x.near.map((n) => `${n.name} ${distanceWords(n.m)}`).join("; ")}` : `  - ${x.place}: nothing else in this layer within 1.2 km (nearest ${x.nearestM != null ? distanceWords(x.nearestM) : "—"})`);
    }
  }
  return out;
}

/** Her pins by name (for directions when her sheet gives no address) */
export async function myMapPlaces(tripId: string): Promise<MyMapPlace[]> {
  return (await myMapOf(tripId))?.layers.flatMap((l) => l.places) ?? [];
}
