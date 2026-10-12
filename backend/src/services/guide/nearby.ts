/**
 * "What's near me?" — Ken, Oct 11 2026: Scout should answer with something like "the two closest places that attracted
 * Larisa are X, about 4 blocks from you, and Y, a 1.5 mile walk in the direction of your hotel" (it needn't be exact).
 *
 * The phone sends where it is with a question that needs it (or whenever Wander already has permission); Scout gets her
 * pinned places closest to it — her Google map and her Apple Maps guides, the only places of hers with a map point — as
 * straight-line distance in the words people use, which way, and whether that's toward their hotel (her own pin for it).
 * Never a walking time: a straight line isn't a route. Where they are is never saved or logged.
 */
import prisma from "../db.js";
import { metres, appleGuidesOf, strayKeys, pinKey } from "./appleGuides.js";
import { myMapOf } from "./googleMyMap.js";

/** Her pins (Google map and Apple Maps guides) that sit far from the whole trip — never used to say where a place is */
export async function strayPinsOf(tripId: string): Promise<Map<string, { m: number; town: string | null }>> {
  const pins: { lat: number; lng: number }[] = [];
  for (const l of (await myMapOf(tripId).catch(() => null))?.layers ?? []) pins.push(...l.places);
  for (const g of await appleGuidesOf(tripId).catch(() => [])) for (const p of g.places) if (p.lat != null && p.lng != null) pins.push({ lat: p.lat, lng: p.lng });
  const towns = (await prisma.city.findMany({ where: { tripId, hidden: false, latitude: { not: null }, longitude: { not: null } }, select: { name: true, latitude: true, longitude: true } }))
    .map((c) => ({ lat: c.latitude!, lng: c.longitude!, name: c.name }));
  return strayKeys(pins, towns);
}

export type Here =
  // spd: metres a second, when the phone knows it (Ken asked from a moving train, Oct 12)
  | { lat: number; lng: number; acc: number | null; age: number | null; spd?: number | null }
  | { none: "denied" | "unavailable" | "not-asked" };

/** What the phone sent, or null when it sent nothing usable */
export function parseHere(x: unknown): Here | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.none === "denied" || o.none === "unavailable" || o.none === "not-asked") return { none: o.none };
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
  const lat = num(o.lat, -90, 90), lng = num(o.lng, -180, 180);
  if (lat == null || lng == null) return null;
  const spd = num(o.spd, 0, 150);
  return { lat, lng, acc: num(o.acc, 0, 100_000), age: num(o.age, 0, 86_400), ...(spd != null ? { spd } : {}) };
}

/**
 * Real places of a kind near the phone, closest first, from Google (Ken, Oct 12: "Yes" to sending the phone's position
 * to Google for this — rounded to about 100 m, only for "what's near" questions, never stored). Measured by Wander from
 * where they actually are, in the same words as her pins. Before, Scout searched the web: places by town, a mile or two
 * off, with no distance, and ~25 s (Ken's coffee question on a train).
 */
export interface NearPlace { name: string; lat: number; lng: number; m: number; way: string; words: string; open: boolean | null; rating: number | null; ratings: number | null; area: string | null }
export async function placesNear(here: { lat: number; lng: number }, kind: string, key: string): Promise<NearPlace[] | null> {
  // (rounded before it leaves Wander: 3 decimals is ~110 m north–south, ~90 m east–west in Japan)
  const at = `${here.lat.toFixed(3)},${here.lng.toFixed(3)}`;
  const base = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${at}&keyword=${encodeURIComponent(kind.slice(0, 80))}&language=en&key=${key}`;
  // (closest first; failing that, everything within 2 km, sorted here — Google's closest-first search gave up on
  // "pharmacy" in Tokoname twice in ten tries, "DEADLINE_EXCEEDED")
  const urls = [`${base}&rankby=distance`, `${base}&radius=2000`];
  let data: any = null;
  for (let attempt = 0; attempt < urls.length && !(data?.status === "OK" || data?.status === "ZERO_RESULTS"); attempt++) {
    const url = urls[attempt];
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    try { data = await (await fetch(url, { signal: ctl.signal })).json(); } catch { data = null; } finally { clearTimeout(t); }
  }
  if (data?.status !== "OK" && data?.status !== "ZERO_RESULTS") {
    // (Google's reason only — never where they are)
    console.warn(`[places-near] Google said ${data?.status ?? "nothing"}${data?.error_message ? `: ${data.error_message}` : ""}`);
    return null;
  }
  {
    const live = (data.results || []).filter((r: any) => r?.business_status !== "CLOSED_PERMANENTLY" && r?.geometry?.location);
    // (all kept, with their review counts — Tokoname's station pharmacy has one review; Scout weighs them, and the walking
    // button goes to a place with real reviews: placesNear's caller)
    // (sorted by distance before the six are kept: the 2 km search lists by prominence)
    return live
      .map((r: any) => {
        const p = { lat: r.geometry.location.lat as number, lng: r.geometry.location.lng as number };
        const m = metres(here, p);
        // (close by, in metres: "under 150 m" for all of them hid which is closest)
        const words = m < 150 ? `about ${Math.max(20, Math.round(m / 10) * 10)} m` : farWords(m);
        return { name: String(r.name), ...p, m, way: compass(bearing(here, p)), words,
          open: typeof r.opening_hours?.open_now === "boolean" ? r.opening_hours.open_now : null,
          rating: typeof r.rating === "number" ? r.rating : null, ratings: typeof r.user_ratings_total === "number" ? r.user_ratings_total : null,
          area: typeof r.vicinity === "string" ? r.vicinity : null };
      })
      .sort((a: NearPlace, b: NearPlace) => a.m - b.m)
      .slice(0, 6);
  }
}

/** The one the walking button goes to: the closest place known to be open — or one with real reviews only a little
 *  farther (a hotspot called "Wi-Fi" with one review sat among Kanayama's cafés; in Tokoname the open pharmacy at 400 m
 *  beats a well-reviewed one at 650 m) */
export function buttonPlace(found: NearPlace[]): NearPlace {
  const open = found.find((p) => p.open === true) || found.find((p) => p.open !== false) || found[0];
  const reviewed = found.find((p) => p.open !== false && (p.ratings ?? 0) >= 5);
  return reviewed && reviewed.m <= open.m + 150 ? reviewed : open;
}

/** "They're moving" — said to Scout when the phone reports a speed a walk can't reach (over ~25 km/h) */
export function movingLine(here: Here): string | null {
  if ("none" in here || here.spd == null || here.spd < 7) return null;
  return `They're moving at about ${Math.round((here.spd * 3.6) / 5) * 5} km/h, likely on a train or in a car, so where they are is changing fast: say so in a few words, and when today's plan makes clear where they're heading, favour places near there.`;
}

export interface Pin { name: string; lat: number; lng: number; from: string; note: string | null }
export interface Anchor { name: string; lat: number; lng: number; when: "tonight" | "last night" }

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
/** Compass bearing from a to b, in degrees */
export function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
export const compass = (deg: number) => COMPASS[Math.round(deg / 45) % 8];

/** "about 400 m — roughly 4 blocks" / "about 2.4 km — 1.5 miles": rounded, in the words a person uses */
export function farWords(m: number): string {
  const mi = m / 1609.34;
  if (m < 150) return "right around them (under 150 m)";
  // (a city block in Japan is roughly 100 m — Ken's "about 4 blocks" for a place ~400 m off)
  if (m < 800) return `about ${Math.round(m / 50) * 50} m — roughly ${Math.max(2, Math.round(m / 100))} blocks`;
  if (m < 100_000) return `about ${(m / 1000).toFixed(1)} km — ${mi < 10 ? mi.toFixed(1) : Math.round(mi)} miles`;
  return `about ${Math.round(m / 1000).toLocaleString("en-US")} km (${Math.round(mi).toLocaleString("en-US")} miles)`;
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const GENERIC = /^(hotel|hotels|ryokan|resort|the|inn|tokyo|kyoto|osaka|nagoya|hakata|okayama|nikko|izu)$/;
/** Her pin for a hotel, by a word of its name that isn't a generic one ("Marriott", "Imperial", "Yoyokaku" = "Yōyōkaku") */
export function pinFor(hotel: string, pins: Pin[]): Pin | null {
  const words = plain(hotel).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC.test(w));
  if (!words.length) return null;
  return pins.find((p) => { const n = plain(p.name).split(/[^a-z0-9]+/); return words.some((w) => n.includes(w)); }) ?? null;
}

/** Lines for Scout: where the phone is, its hotel, and her closest places — or why Wander doesn't know where they are */
export function nearbyLines(here: Here, pins: Pin[], anchors: Anchor[]): string[] {
  if ("none" in here) {
    const why = here.none === "denied"
      ? "they've said no to sharing their location with Wander (the iPhone's Settings can change that)"
      // (in their words, not the phone's: "didn't send it with this question" read as technical to a first-timer; verify15)
      : here.none === "unavailable" ? "the phone couldn't tell where it is just now" : "they haven't shared their location since opening Wander";
    return [`WHERE THEY ARE: not known — ${why}. For "what's near me", ask what they're near (a place, their hotel, a station) and use her pins' closeness${here.none === "denied" ? "" : "; offer_location puts a \"Use my location\" button under your answer"}.`];
  }
  const out: string[] = [];
  const rough = here.acc != null && here.acc > 300 ? `, rough — within about ${Math.round(here.acc / 100) * 100} m` : "";
  const old = here.age != null && here.age > 300 ? `, as of ${Math.round(here.age / 60)} minutes ago` : "";
  out.push(`WHERE THEY ARE (the phone's location${rough}${old}; never saved). Distances below are straight lines from them — not routes or walking times:`);
  const moving = movingLine(here);
  if (moving) out.push(`- ${moving}`);
  // Their hotel (tonight's, or last night's on a moving day), said whenever they're in its part of the country — Ken at
  // the Marriott asked "How far is my hotel?" and Scout couldn't say: the line was only written when her places were
  // near (Oct 11). Not from California: tonight's hotel there is someone else's night.
  const hotel = anchors.map((a) => ({ ...a, m: metres(here, a), deg: bearing(here, a) })).filter((a) => a.m <= 100_000).sort((a, b) => a.m - b.m)[0];
  const hotelLine = hotel
    ? `- Their hotel ${hotel.when === "tonight" ? "tonight" : "from last night"}, ${hotel.name} (her pin): ${hotel.m < 150 ? "right where they are (under 150 m) — they're at it" : `${farWords(hotel.m)} to the ${compass(hotel.deg)}`}.`
    : null;
  // (…and "toward their hotel" only when it's close enough to walk toward)
  const anchor = hotel && hotel.m <= 5000 ? hotel : undefined;
  const seen: Pin[] = [];
  const ranked = pins
    .map((p) => ({ ...p, m: metres(here, p), deg: bearing(here, p) }))
    .sort((a, b) => a.m - b.m)
    .filter((p) => {
      // (her hotel pin is said as their hotel; the same place pinned twice, or on both her maps, is said once)
      if (anchor && metres(p, anchor) < 60) return false;
      if (seen.some((s) => metres(s, p) < 60 || (plain(s.name) === plain(p.name) && metres(s, p) < 500))) return false;
      seen.push(p);
      return true;
    });
  if (hotelLine) out.push(hotelLine);
  if (!ranked.length) return [...out, "- None of her places has a map point Wander knows."];
  if (ranked[0].m > 30_000) {
    const p = ranked[0];
    out.push(`- None of Larisa's ${hotelLine ? "other " : ""}pinned places is near them. The closest is ${p.name} (${p.from}), ${farWords(p.m)} to the ${compass(p.deg)}${p.m > 300_000 ? " — they may not be in Japan yet" : ""}. Say so plainly; never call anything "nearby".`);
    return out;
  }
  const list = ranked.filter((p, i) => i < 2 || p.m <= 3000).slice(0, 8);
  for (const p of list) {
    // (right where they are, a direction means nothing)
    let way = p.m < 150 ? "" : `to the ${compass(p.deg)}`;
    if (way && anchor && anchor.m > 300) {
      const off = Math.abs(((p.deg - anchor.deg + 540) % 360) - 180);
      // (30°: Ginza Itoya, due north with the hotel north-west, was "toward the hotel" at 35°; verify12)
      if (off <= 30) way += p.m <= anchor.m * 1.3 ? ", toward their hotel" : ", past their hotel";
    }
    out.push(`- ${p.name} — ${farWords(p.m)}${way ? ` ${way}` : ""} · ${p.from}${p.note ? ` · her note: "${p.note.slice(0, 160)}"` : ""}`);
  }
  return out;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** Today on Japan's calendar */
const japanToday = (now: Date) => new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

/** Her pinned places and their hotel pins for this trip, then the lines for where the phone is */
export async function nearbyFor(tripId: string, here: Here, now = new Date()): Promise<string[]> {
  if ("none" in here) return nearbyLines(here, [], []);
  const pins: Pin[] = [];
  const map = await myMapOf(tripId).catch(() => null);
  for (const l of map?.layers ?? []) for (const p of l.places) pins.push({ name: p.name, lat: p.lat, lng: p.lng, note: p.note, from: `her Google map, layer "${l.name.trim()}"` });
  for (const g of await appleGuidesOf(tripId).catch(() => [])) {
    for (const p of g.places) if (p.name && p.lat != null && p.lng != null) pins.push({ name: p.name, lat: p.lat, lng: p.lng, note: null, from: `her Apple Maps guide "${g.name}"` });
  }
  // (a pin far from the whole trip — her Sannenzaka in Wakayama — is never "near" anyone… unless they're standing near it:
  // then it's a real place off the route, a day trip's, and theirs to see; verify12)
  const stray = await strayPinsOf(tripId);
  for (let i = pins.length - 1; i >= 0; i--) if (stray.has(pinKey(pins[i])) && metres(here, pins[i]) > 30_000) pins.splice(i, 1);
  const today = japanToday(now);
  const stays = await prisma.accommodation.findMany({ where: { tripId }, select: { name: true, checkInDate: true, checkOutDate: true } });
  const anchors: Anchor[] = [];
  for (const s of stays) {
    if (!s.checkInDate || !s.checkOutDate) continue;
    const ci = ymd(s.checkInDate), co = ymd(s.checkOutDate);
    const when = ci <= today && today < co ? "tonight" : co === today ? "last night" : null;
    const pin = when ? pinFor(s.name, pins) : null;
    if (when && pin) anchors.push({ name: s.name, lat: pin.lat, lng: pin.lng, when });
  }
  return nearbyLines(here, pins, anchors);
}
