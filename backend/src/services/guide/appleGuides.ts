/**
 * Larisa's Apple Maps guides — a map per day she made in Apple Maps, apart from her sheet (Oct 2 2026: "Larisa has
 * crafted each page into an Apple Maps page"). Read from their share links, which are view-only — reading one can't
 * change her guide (Ken's OK) — by trip-data/session-tools/read-apple-guides.mjs, and recorded beside her sheet's
 * address (set-apple-guides.ts); every import keeps them. Her guides are live: the link always opens her latest map;
 * the places Wander knows are as of `readAt`.
 *
 * Her map's places are not in visiting order (Ken). Wander works out what's close to what — straight-line distance
 * between the map's own locations, said as such, never a walking time — and never reorders her day.
 */
import prisma from "../db.js";

export interface AppleGuidePlace { name: string | null; address: string | null; lat: number | null; lng: number | null }
export interface AppleGuide {
  name: string;
  /** https://maps.apple/ug/… — her share link */
  link: string;
  readAt: string;
  /** the day it's for (YYYY-MM-DD), from her day tab of the same name */
  date: string | null;
  /** that day tab */
  tab: string | null;
  places: AppleGuidePlace[];
}

export const isGuideLink = (s: unknown): s is string => typeof s === "string" && /^https:\/\/maps\.apple\/ug\/[\w~-]+$/.test(s);

export async function appleGuidesOf(tripId: string): Promise<AppleGuide[]> {
  const cfg = await prisma.sheetSyncConfig.findUnique({ where: { tripId }, select: { tabMappings: true } });
  const list = (cfg?.tabMappings as any)?.appleGuides;
  if (!Array.isArray(list)) return [];
  const guides: AppleGuide[] = list.filter((g: any) => g && typeof g.name === "string" && isGuideLink(g.link) && Array.isArray(g.places));
  // The day comes from her day tab as the current Guide copy dates it (a new copy can move a tab to another day);
  // the date recorded with the map is only for a tab she no longer has
  const out: AppleGuide[] = [];
  for (const g of guides) {
    let date = g.date;
    if (g.tab) {
      const items = await prisma.guideItem.findMany({ where: { tripId, source: { startsWith: g.tab }, date: { not: null } }, select: { date: true } });
      const count = new Map<string, number>();
      for (const i of items) { const d = i.date!.toISOString().slice(0, 10); count.set(d, (count.get(d) || 0) + 1); }
      const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) date = top[0];
    }
    out.push({ ...g, date });
  }
  return out;
}

/** The day each map is for → its name and link (the day screen's "her Apple Maps guide for the day") */
export async function guideLinksByDay(tripId: string): Promise<Record<string, { name: string; link: string }[]>> {
  const by: Record<string, { name: string; link: string }[]> = {};
  for (const g of await appleGuidesOf(tripId)) if (g.date) (by[g.date] ||= []).push({ name: g.name, link: g.link });
  return by;
}

/** Straight-line distance in metres */
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "about 300 m" / "about 1.4 km" — rounded, never more exact than a straight line deserves */
export function distanceWords(m: number): string {
  if (m < 100) return "under 100 m";
  if (m < 1000) return `about ${Math.round(m / 50) * 50} m`;
  return `about ${(Math.round(m / 100) / 10).toFixed(1)} km`;
}

/** The same place twice in one map (her hotel as start and end, or a store pinned twice) is said once */
const located = (g: AppleGuide) => {
  const seen = new Set<string>();
  return g.places.filter((p): p is AppleGuidePlace & { name: string; lat: number; lng: number } => {
    if (!p.name || p.lat == null || p.lng == null) return false;
    const k = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * What's close to what in one map: for each place, the others within 1.2 km (nearest first), and whether anything is
 * within that at all. Straight line — a river, a station or a hill can make the walk longer.
 */
export function closeness(g: AppleGuide): { place: string; near: { name: string; m: number }[]; nearestM: number | null }[] {
  const ps = located(g);
  return ps.map((p) => {
    const others = ps.filter((o) => o !== p).map((o) => ({ name: o.name, m: metres(p, o) })).sort((a, b) => a.m - b.m);
    return { place: p.name, near: others.filter((o) => o.m <= 1200), nearestM: others[0]?.m ?? null };
  });
}

/** Lines for Scout: each map with its day, places and addresses, and what's close to what */
export function guideLines(g: AppleGuide, day: string | null): string[] {
  const out: string[] = [];
  const unnamed = g.places.filter((p) => !p.name || p.lat == null).length;
  out.push(`[Her Apple Maps guide "${g.name}"${day ? ` — for ${day}` : ""}${g.tab ? `, the day of her "${g.tab}" tab` : ""}. Read ${g.readAt.slice(0, 10)}; her map may have changed since. NOT in visiting order — her day tab's order is the plan.]`);
  for (const p of located(g)) out.push(`- ${p.name}${p.address ? ` · ${p.address}` : ""}`);
  if (unnamed) out.push(`- (${unnamed} more on her map that Apple shows no name or address for)`);
  const c = closeness(g);
  if (c.length > 1) {
    out.push("  What's close to what (straight-line distance between her map's own locations — not a walking time):");
    for (const x of c) {
      out.push(x.near.length
        ? `  - ${x.place}: ${x.near.map((n) => `${n.name} ${distanceWords(n.m)}`).join("; ")}`
        : `  - ${x.place}: nothing else on this map within 1.2 km (nearest ${x.nearestM != null ? distanceWords(x.nearestM) : "—"})`);
    }
  }
  return out;
}
