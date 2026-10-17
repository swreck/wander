/**
 * A stop's photos, for the day as moments (Oct 15 2026). Andy, through Ken: he comes from "the world of Instagram and
 * Facebook with a sort of visual flow about the trip"; Ken: "simply adding a photo on each day page does not seem to
 * fulfill Andy's social media vision… It might be an option when you see a picture to see more pictures". Each stop of
 * her plan is led by photos of that exact place, and a tap shows more of them.
 *
 * Found from the very words her stop's Maps button searches ("Tsukiji Outer Market, Ginza, Japan"), near the day's
 * city, from Google's listing of the place (Wikipedia has the temples but not Yazawa, Itoya or Hassun). A photo is never
 * a guess: before it's kept, a check reads her line and Google's place (name, address, kind) and says whether they're
 * the same place — "Ginza Premium Retail Walk" is a walk, not a shop, and gets no photo. Kept a week per search.
 *
 * Every photo shown is checked (Oct 17; Ken, on Play's Robuchon dinner with no photo: "Are you searching enough for
 * targeted verifiable photos?… I would expect four to six pictures of the restaurant and food", and on the plan for
 * every place: "Add to my documentation agreement with your plan that would then apply to the Robichon restaurant as
 * well as the rest of Wander. And yes, we're at la table."). Google's up-to-10 photos of the place are each looked at,
 * and only the ones that show it are kept, the best first — up to six; a lesser place keeps fewer. A line her booking
 * names ("her booking for it: LeTable de Joel Robuchon - 1F") is checked as that booking. A "no" is searched once more
 * by her line's own words, and asked again after a day, not a week.
 */
import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import prisma from "./db.js";

const WEEK = 7 * 24 * 3600_000;
const DAY = 24 * 3600_000;
// (shown at most; Google gives up to ten photos of a place, and each of them is looked at)
const MOST = 6;
const LOOKED_AT = 10;
// (a row checked by these rules says so in its reason — rows checked before them are checked once more, in the background)
const RULES = "[2] ";
const current = (row: { verdict: string; why: string | null }) => row.verdict === "none" || (row.why || "").startsWith(RULES);
/**
 * Google's hours for a place her line means (Oct 15, Ken: "the feature or info or view the user would want before they
 * realize they want it" — Kyoto's temples close at 4:30 or 5): the week as Google lists it ("0900"–"1700", day 0 =
 * Sunday), the next days' own hours with their dates (holidays and special days included), and whether Google says
 * it's closed for now. Said on a line only when her plan's time runs past them (lib/placeHours on the phone).
 */
export type Hours = {
  weekly: { open: { day: number; time: string }; close?: { day: number; time: string } }[];
  dated: { open: { date: string; time: string }; close?: { date: string; time: string } }[];
  status: string | null;
  at: number;
};
/** v: when it was last checked — in the photo's address, so a phone never keeps showing one Wander has replaced */
/** `ok` on a photo after the first: checked to show the place too (Play's second photo, Oct 16) */
export type PlaceHit = { id: string; v: number; name: string | null; photos: { credit: string | null; ok?: boolean }[]; hours?: Hours | null } | null;
const HOURS_FIELDS = "opening_hours,current_opening_hours,business_status";
const hoursOf = (r: any): Hours | null => {
  const weekly = (r?.opening_hours?.periods || []).filter((x: any) => x?.open).map((x: any) => ({ open: { day: x.open.day, time: x.open.time }, ...(x.close ? { close: { day: x.close.day, time: x.close.time } } : {}) }));
  const dated = (r?.current_opening_hours?.periods || []).filter((x: any) => x?.open?.date).map((x: any) => ({ open: { date: x.open.date, time: x.open.time }, ...(x.close?.date ? { close: { date: x.close.date, time: x.close.time } } : {}) }));
  if (!weekly.length && !dated.length && !r?.business_status) return null;
  return { weekly, dated, status: r?.business_status || null, at: Date.now() };
};
// (a place's hours are looked at again after three days — the dated ones only run a week ahead)
const HOURS_FRESH = 3 * 24 * 3600_000;
/** `ok`: a second photo checked to show the place too; `two` on the first: that check has been made (Oct 16) */
type Ref = { ref: string; credit: string | null; ok?: boolean; two?: boolean };

const asking = new Map<string, Promise<PlaceHit>>();
let client: Anthropic | null = null;

/** The photos for one stop (her line, and the words its Maps button searches), near its city */
export function placePhotosFor(query: string, line: string, near: { lat: number; lng: number } | null): Promise<PlaceHit> {
  const q = query.trim().slice(0, 300);
  if (!q) return Promise.resolve(null);
  if (!asking.has(q)) asking.set(q, resolve(q, line.trim().slice(0, 400), near).finally(() => asking.delete(q)));
  return asking.get(q)!;
}

type Row = { id: string; name: string | null; photos: unknown; verdict: string; checkedAt: Date; hours?: unknown };
export const knownHit = (row: Row): PlaceHit => hit(row);
// (only checked photos reach a phone: the first, and each after it marked ok — a row checked before these rules kept six
// of Google's photos and checked two, and the full-screen photos showed the four never checked; Oct 17)
const hit = (row: Row): PlaceHit => {
  const checked = row.verdict === "yes" && Array.isArray(row.photos) ? (row.photos as Ref[]).filter((p, i) => i === 0 || p.ok) : [];
  return checked.length
    ? { id: row.id, v: row.checkedAt.getTime(), name: row.name, photos: checked.map((p, i) => ({ credit: p.credit, ...(i > 0 ? { ok: true } : {}) })), hours: (row.hours as Hours | null) ?? null } : null;
};

/**
 * Every place her lines mean whose hours Wander lacks or has had three days: looked at again, one at a time, in the
 * background. Phones learn the known places at start (GET /known) and don't ask for each one again, so the hours are
 * kept fresh here rather than on a stop's own lookup. One run at a time.
 */
let refreshingHours = false;
// (a place whose look keeps failing is tried again at most every six hours — it was tried on every app open; cost audit)
const hoursTried = new Map<string, number>();
export function freshenHours(): void {
  if (refreshingHours || !process.env.GOOGLE_MAPS_API_KEY) return;
  refreshingHours = true;
  (async () => {
    const rows = await prisma.placePhoto.findMany({ where: { verdict: "yes" }, select: { id: true, placeId: true, hours: true } });
    for (const r of rows) {
      const h = r.hours as Hours | null;
      if ((hoursTried.get(r.id) || 0) > Date.now() - 6 * 3600_000) continue;
      if (!h || Date.now() - (h.at || 0) > HOURS_FRESH) { hoursTried.set(r.id, Date.now()); await refreshHours(r); }
    }
  })().catch((e) => console.warn("[place-photos] hours run:", e?.message || e)).finally(() => { refreshingHours = false; });
}

/** Google's hours for a place already found and checked, looked at again (a few tenths of a cent) */
async function refreshHours(row: { id: string; placeId: string | null }): Promise<void> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !row.placeId) return;
  try {
    const d: any = await (await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${row.placeId}&fields=${HOURS_FIELDS}&language=en&key=${key}`)).json();
    const h = hoursOf(d?.result);
    await prisma.placePhoto.update({ where: { id: row.id }, data: { hours: (h ?? { weekly: [], dated: [], status: null, at: Date.now() }) as unknown as Prisma.InputJsonValue } });
  } catch (e: any) { console.warn("[place-photos] hours:", e?.message || e); }
}

/** Places with photos checked before the current rules (Oct 17: every photo shown checked, up to six): each checked once
 *  more, one at a time, in the background — a phone gets them through /known, which never reaches resolve() for a place
 *  already checked. A "no" is checked again only when a phone asks for it (after a day, or under new rules): a phone
 *  sends her line as it reads now — with her booking's name — and the line kept here may be older (Robuchon's, kept
 *  without it, searched again by its own words, would find Gastronomy, the room upstairs). The test copy doesn't run it
 *  (WARMERS=off): sixty places' photos looked at again, for nothing. */
let placesRunning = false;
// (a place whose look keeps failing is tried at most once a day)
const placesTried = new Map<string, number>();
export function freshenPlaces(): void {
  if (placesRunning || !process.env.GOOGLE_MAPS_API_KEY || process.env.WARMERS === "off") return;
  placesRunning = true;
  (async () => {
    const rows = await prisma.placePhoto.findMany({ where: { verdict: "yes" }, select: { id: true, query: true, line: true, placeId: true, verdict: true, why: true }, orderBy: { checkedAt: "asc" } });
    for (const r of rows) {
      if (current(r) || (placesTried.get(r.id) || 0) > Date.now() - DAY) continue;
      placesTried.set(r.id, Date.now());
      await placePhotosFor(r.query, r.line, await nearOf(r.placeId));
    }
  })().catch((e) => console.warn("[place-photos] recheck run:", e?.message || e)).finally(() => { placesRunning = false; });
}

/** Where a place Google found before is — the search again is made near it, as a phone's was near its day's city */
async function nearOf(placeId: string | null): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !placeId) return null;
  try {
    const d: any = await (await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${key}`)).json();
    const at = d?.result?.geometry?.location;
    return typeof at?.lat === "number" ? { lat: at.lat, lng: at.lng } : null;
  } catch { return null; }
}

/** Google's place for some words near a city: its name, address, kinds and up to ten photos, and its hours */
type Found = { placeId: string; name: string; address: string; types: string[]; photos: Ref[] };
async function lookUp(words: string, near: { lat: number; lng: number } | null, key: string): Promise<{ found: Found; hours: Hours | null } | null> {
  const where = near ? `&location=${near.lat},${near.lng}&radius=20000` : "";
  const s: any = await (await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(words)}${where}&language=en&key=${key}`)).json();
  const top = (s?.results || [])[0];
  if (!top?.place_id) return null;
  return byId(top.place_id, key, top);
}

/** Google's listing of one place, by its id: name, address, kinds, up to ten photos, hours */
async function byId(placeId: string, key: string, top: any = {}): Promise<{ found: Found; hours: Hours | null } | null> {
  const d: any = await (await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,types,photos,${HOURS_FIELDS}&language=en&key=${key}`)).json();
  const r = d?.result || top;
  if (!r?.name && !top?.name) return null;
  return {
    found: {
      placeId, name: r.name || top.name, address: r.formatted_address || top.formatted_address || "", types: r.types || top.types || [],
      photos: (r.photos || top.photos || []).slice(0, LOOKED_AT).map((p: any) => ({ ref: p.photo_reference, credit: ((p.html_attributions || [])[0] || "").replace(/<[^>]+>/g, "").trim() || null })),
    },
    hours: hoursOf(d?.result),
  };
}

/** Her line's own words, for a second search when the first found another place: "DINNER RESERVATION – Gastronomy
 *  "Joël Robuchon" (Ebisu)" → "Gastronomy Joël Robuchon Ebisu" */
export function lineWords(line: string): string {
  return line
    .replace(/\s*\((?:her tab names the stop|her booking for it):[^)]*\)\s*$/, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/^[A-Z][A-Z &-]+\s+[–-]\s+/, "")
    .split(/\s+[—–]\s+/)[0]
    .replace(/["“”]/g, "").replace(/[()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

async function resolve(query: string, line: string, near: { lat: number; lng: number } | null): Promise<PlaceHit> {
  const kept = await prisma.placePhoto.findUnique({ where: { query } });
  // (checked again when her words for it changed — a new Guide copy, the stop her tab names, her booking for it; the same
  // words with less said — a phone on an older Wander that doesn't send her booking's name — aren't a change)
  const sameLine = !!kept && (kept.line === line || kept.line.startsWith(`${line} (`));
  // (a "no" is asked again after a day, not a week — Robuchon's waited a week, Oct 17)
  const fresh = !!kept && Date.now() - kept.checkedAt.getTime() < (kept.verdict === "no" ? DAY : WEEK);
  if (kept && sameLine && fresh && current(kept)) {
    // (a place her line means: its hours, when Wander has none yet or they're three days old)
    const h = kept.hours as Hours | null;
    if (kept.verdict === "yes" && (!h || Date.now() - (h.at || 0) > HOURS_FRESH)) await refreshHours(kept);
    return hit((await prisma.placePhoto.findUnique({ where: { id: kept.id } })) || kept);
  }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return kept ? hit(kept) : null;
  let got: { found: Found; hours: Hours | null } | null = null;
  // (a place already found and checked for these words is looked at again by Google's own id for it, never searched for
  // again — the re-check of Oct 17 searched "Onitsuka Tiger Shinjuku Flagship Store" again and settled on a small Onitsuka
  // shop in a Shinjuku mall: the fresh check saw its photos where the flagship's had been)
  const knownId = kept && kept.verdict === "yes" && kept.placeId && sameLine ? kept.placeId : null;
  try { got = knownId ? await byId(knownId, key) : await lookUp(query, near, key); } catch (e: any) {
    console.warn("[place-photos] google:", e?.message || e);
    return kept ? hit(kept) : null;   // (a hiccup: last week's answer, or none — asked again next time)
  }
  let verdict: "yes" | "no" | "none" = "none", why: string | null = null;
  if (got && got.found.photos.length) {
    let c = await samePlace(line, query, got.found).catch((e) => { console.warn("[place-photos] check:", e?.message || e); return null; });
    if (!c) return kept ? hit(kept) : null;   // (unchecked is never shown)
    // A "no": searched once more by her line's own words, when they aren't the words searched — the first search can
    // find the place next door, as her booking's address did for Robuchon (Oct 17)
    const words = lineWords(line);
    if (!c.same && words && words.toLowerCase() !== query.toLowerCase()) {
      const again = await lookUp(words, near, key).catch(() => null);
      if (again && again.found.placeId !== got.found.placeId && again.found.photos.length) {
        const c2 = await samePlace(line, words, again.found).catch(() => null);
        if (c2?.same) { got = again; c = { same: true, why: `${c2.why} (found by her line's words)` }; }
      }
    }
    verdict = c.same ? "yes" : "no"; why = c.why;
    // …and only the photos that show what her line means are kept, the best first — Google's first photo of Ginza
    // Mitsukoshi was a handbag shop, for her "LIGHT LUNCH – Ginza Mitsukoshi Depachika" (tourist63). None: no photo.
    if (verdict === "yes") {
      const picks = await checkedPhotos(line, got.found.name, got.found.photos, key).catch((e) => { console.warn("[place-photos] pick:", e?.message || e); return null; });
      if (picks === null) return kept ? hit(kept) : null;
      if (!picks.length) { verdict = "no"; why = `${why}; none of its photos shows it`; }
      else got.found.photos = picks.map((i) => ({ ...got!.found.photos[i], ok: true }));
    }
  }
  const found = got?.found ?? null;
  // (only the checked photos are kept, and hours only for the place her line means)
  const data = { line, placeId: found?.placeId ?? null, name: found?.name ?? null, address: found?.address ?? null, photos: verdict === "yes" ? found!.photos : [], verdict, why: `${RULES}${why || ""}`,
    hours: verdict === "yes" ? (got?.hours ?? { weekly: [], dated: [], status: null, at: Date.now() }) as unknown as Prisma.InputJsonValue : Prisma.DbNull, checkedAt: new Date() };
  const row = await prisma.placePhoto.upsert({ where: { query }, create: { query, ...data }, update: data });
  console.log(`[place-photos] "${line.slice(0, 50)}" → ${found?.name || "nothing"}: ${verdict}${verdict === "yes" ? `, ${found!.photos.length} photos` : ""}${why ? ` (${why.slice(0, 80)})` : ""}`);
  return hit(row);
}

/** Is Google's place the one her line means? Asked once per search a week — a few tenths of a cent */
async function samePlace(line: string, query: string, g: { name: string; address: string; types: string[] }): Promise<{ same: boolean; why: string } | null> {
  client ??= new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-5", max_tokens: 1500,
    system: "You check whether a photo of a place may stand beside a line of a travel plan. Say same=true only when Google's place is plainly the very place the line means to visit (the same shop, restaurant, temple, market, museum, station or hotel — a branch in another town is not the same, and nor is another branch of the same brand in the same district: when the line names a flagship, a main store or a branch by its place, Google's place must be that one, not a smaller shop of the brand nearby). When the line gives her booking for it (\"her booking for it: …\"), the place is the one her booking names: Google's place is the same when it is that booking's restaurant or venue, even when the line's own words name another room of the same building; a place that isn't her booking's is not the same. A food hall, floor or counter inside a department store is the same place as the store when Google lists only the store. A line that isn't one place (a walk, a stroll through an area, \"refresh at the hotel\" when the hotel isn't named, free time, lunch with no place named) is same=false. A line about getting somewhere — a taxi, train, bus or walk to a place, a transfer, \"continue to\", \"return to\" — is same=false: the photo belongs on the line for the place itself. When unsure, false: a wrong photo beside her plan is worse than none.",
    messages: [{ role: "user", content: `Her plan's line: "${line}"\nThe Maps search for it: "${query}"\nGoogle's place: "${g.name}", ${g.address} (kinds: ${g.types.slice(0, 6).join(", ")})\nAnswer in JSON only: {"same": true|false, "why": "a few words"}` }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const j = JSON.parse(m[0]);
  return typeof j.same === "boolean" ? { same: j.same, why: String(j.why || "") } : null;
}

/** Which of a place's photos (Google gives up to ten) show what her line means, best first, at most six — their indexes;
 *  [] when none does, null when they couldn't be looked at. Each is fetched small (640 wide) to be looked at, and kept to
 *  show in the day's list; a few cents a place, once a week. */
async function checkedPhotos(line: string, name: string, refs: Ref[], key: string): Promise<number[] | null> {
  const imgs: Anthropic.ImageBlockParam[] = [];
  for (const r of refs) {
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=640&photo_reference=${r.ref}&key=${key}`);
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0] as "image/jpeg";
    const bytes = Buffer.from(await res.arrayBuffer());
    // (the same 640-wide photo the day's list shows: kept, not fetched from Google again to show it — cost audit, Oct 16)
    keepPicture(`${r.ref}:s`, { bytes, type: res.headers.get("content-type") || "image/jpeg", at: Date.now() });
    imgs.push({ type: "image", source: { type: "base64", media_type: type, data: bytes.toString("base64") } });
  }
  if (!imgs.length) return [];
  client ??= new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-5", max_tokens: 2000,
    system: "You choose the photos to show for a line of a travel plan. Keep each photo that plainly shows the place the way the line means it: the market's stalls for a market, the temple for a temple, the food hall for a department store's food hall (depachika), the restaurant's dining room or its food for a restaurant, the museum, its building or its art for a museum, the hotel for a hotel, the shop or what it sells on its own shelves for a shop, the sight itself for a sight. Every photo must be taken at the place: leave out one taken anywhere else (a purchase at someone's home, a product on a desk or a floor that isn't the shop's), a photo of a different shop or restaurant (even in the same building), a sign, a map, a menu board or a receipt on its own, a car park, a selfie or a person filling the frame, a blurred or dark photo, and one that repeats a photo already kept (the same shot again). Put the best first; for a restaurant, mix its room and its food when both are there. At most six. An empty list when none of them shows it.",
    messages: [{ role: "user", content: [...imgs, { type: "text", text: `Her plan's line: "${line}" — the place: "${name}". The ${imgs.length} photos above are numbered 0 to ${imgs.length - 1} in order. Answer in JSON only: {"show": [<numbers, best first>], "why": "a few words"}` }] }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "null");
  if (!j || !Array.isArray(j.show)) return null;
  const show = [...new Set((j.show as unknown[]).filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < imgs.length))].slice(0, MOST);
  console.log(`[place-photos] photos for "${line.slice(0, 40)}": ${show.join(", ") || "none"} of ${imgs.length} (${String(j.why || "").slice(0, 60)})`);
  return show;
}

// ── the pictures themselves, through Wander's server (the Google key never reaches a phone) ──
const pictures = new Map<string, { bytes: Buffer; type: string; at: number }>();
const MOST_KEPT = 400;
/** A photo at the size it's shown: small (640 wide) in the day's list — a fifth of the bytes on hotel Wi-Fi — and large
 *  (1200) full screen */
export async function placePicture(id: string, n: number, small = false): Promise<{ bytes: Buffer; type: string } | null> {
  const row = await prisma.placePhoto.findUnique({ where: { id } }).catch(() => null);
  const ref = row?.verdict === "yes" && Array.isArray(row.photos) ? (row.photos as Ref[])[n]?.ref : null;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!ref || !key) return null;
  // (kept by Google's own reference: a re-check that puts another photo first never shows the old one)
  const k = `${ref}:${small ? "s" : "l"}`;
  const had = pictures.get(k);
  if (had && Date.now() - had.at < WEEK) return had;
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=${small ? 640 : 1200}&photo_reference=${ref}&key=${key}`).catch(() => null);
  if (!r?.ok) return null;
  const p = { bytes: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "image/jpeg", at: Date.now() };
  keepPicture(k, p);
  return p;
}
function keepPicture(k: string, p: { bytes: Buffer; type: string; at: number }) {
  pictures.set(k, p);
  // (the oldest go first past a few hundred — they're a phone's to keep a week anyway)
  if (pictures.size > MOST_KEPT) pictures.delete(pictures.keys().next().value!);
}
