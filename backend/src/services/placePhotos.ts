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
// Nov 16 2026: the photos themselves are no longer kept by Google's references (they expire after about a month and may
// not be stored). A place's checked photos are Wander's own verdicts (services/placePhotoChecks.ts), shown from Google's
// current list of the place's photos when a person opens it; the checks are in services/photoJudge.ts.
import { Prisma } from "@prisma/client";
import prisma from "./db.js";
import { allow } from "./usage.js";
import { samePlace, judgePhotos } from "./photoJudge.js";
import { fetchPhoto, recordVerdicts, ensureChecked, judgedWords, sameWords, MOST } from "./placePhotoChecks.js";
import { plainCredit } from "./photoCredit.js";

const WEEK = 7 * 24 * 3600_000;
const DAY = 24 * 3600_000;
// (Google gives up to ten photos of a place, and each of them is looked at; up to eight shown — Ken, Nov 16, on Larisa's
// report: "several pictures is better than one (but not dozens… can add up to two more than you did in the past)")
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
/** `ok` on a photo after the first: checked to show the place too (Play's second photo, Oct 16). `id`: Wander's own
 *  address for the photo (Nov 16); a place not yet looked at under these rules has one photo with no id — its address is
 *  its place in the order ("0"), and opening it is what looks at the place. */
export type PlaceHit = { id: string; v: number; name: string | null; photos: { id?: string; credit: string | null; ok?: boolean }[]; hours?: Hours | null } | null;
const HOURS_FIELDS = "opening_hours,current_opening_hours,business_status";
const hoursOf = (r: any): Hours | null => {
  const weekly = (r?.opening_hours?.periods || []).filter((x: any) => x?.open).map((x: any) => ({ open: { day: x.open.day, time: x.open.time }, ...(x.close ? { close: { day: x.close.day, time: x.close.time } } : {}) }));
  const dated = (r?.current_opening_hours?.periods || []).filter((x: any) => x?.open?.date).map((x: any) => ({ open: { date: x.open.date, time: x.open.time }, ...(x.close?.date ? { close: { date: x.close.date, time: x.close.time } } : {}) }));
  if (!weekly.length && !dated.length && !r?.business_status) return null;
  return { weekly, dated, status: r?.business_status || null, at: Date.now() };
};
// (a place's hours are looked at again after three days — the dated ones only run a week ahead)
const HOURS_FRESH = 3 * 24 * 3600_000;
/** One of Google's photos of a place, as its listing gives it — used while the place is looked at, never kept */
type Ref = { ref: string; credit: string | null; width: number; height: number };

const asking = new Map<string, Promise<PlaceHit>>();

/** The photos for one stop (her line, and the words its Maps button searches), near its city. `asKept`: a finished
 *  trip's stop — the answer kept for it as it is, never checked again (Nov 15); one never looked at is looked at once. */
export function placePhotosFor(query: string, line: string, near: { lat: number; lng: number } | null, opts: { asKept?: boolean } = {}): Promise<PlaceHit> {
  const q = query.trim().slice(0, 300);
  if (!q) return Promise.resolve(null);
  if (opts.asKept) return asKept(q, line.trim().slice(0, 400), near);
  if (!asking.has(q)) asking.set(q, resolve(q, line.trim().slice(0, 400), near).finally(() => asking.delete(q)));
  return asking.get(q)!;
}

/** A finished trip's stop: the place as it was found, never searched again — but its photos judged again when her words
 *  for it differ from the words they were judged against (Nov 16 2026: her list's "3D panda billboard" under an udon
 *  shop's pin had never reached the check, which kept a plate of udon) */
async function asKept(query: string, line: string, near: { lat: number; lng: number } | null): Promise<PlaceHit> {
  const row = await prisma.placePhoto.findUnique({ where: { query } });
  if (!row) return placePhotosFor(query, line, near);
  if (row.verdict === "yes" && row.placeId) {
    const all = await prisma.placePhotoCheck.findMany({ where: { placeRowId: row.id }, select: { words: true } });
    if (all.length && !sameWords(judgedWords(all), line)) await ensureChecked(row, line);
  }
  return hit(row);
}

type Row = { id: string; name: string | null; verdict: string; checkedAt: Date; hours?: unknown };
type Shown = { id: string; placeRowId: string; credit: string | null; checkedAt: Date };
/** What phones are told about places: each one's passed photos, by Wander's own ids for them, in order (only checked
 *  photos reach a phone — Oct 17). A place with verdicts but none passed or still listed: no photos. A place not yet
 *  looked at under these rules (no verdicts at all): one photo with no id, so opening it looks at the place. */
export async function knownHits(rows: Row[]): Promise<Map<string, PlaceHit>> {
  const ids = rows.filter((r) => r.verdict === "yes").map((r) => r.id);
  const shown = ids.length ? await prisma.placePhotoCheck.findMany({ where: { placeRowId: { in: ids }, pass: true, missingAt: null }, orderBy: [{ rank: "asc" }, { checkedAt: "asc" }], select: { id: true, placeRowId: true, credit: true, checkedAt: true } }) : [];
  const judged = new Set(ids.length ? (await prisma.placePhotoCheck.groupBy({ by: ["placeRowId"], where: { placeRowId: { in: ids } } })).map((g) => g.placeRowId) : []);
  const byRow = new Map<string, Shown[]>();
  for (const s of shown) byRow.set(s.placeRowId, [...(byRow.get(s.placeRowId) || []), s]);
  const out = new Map<string, PlaceHit>();
  for (const r of rows) out.set(r.id, hitOf(r, byRow.get(r.id) || [], judged.has(r.id)));
  return out;
}
function hitOf(row: Row, shown: Shown[], judged: boolean): PlaceHit {
  if (row.verdict !== "yes") return null;
  const hours = (row.hours as Hours | null) ?? null;
  if (!judged) return { id: row.id, v: row.checkedAt.getTime(), name: row.name, photos: [{ credit: null }], hours };
  if (!shown.length) return null;
  const v = Math.max(row.checkedAt.getTime(), ...shown.map((s) => s.checkedAt.getTime()));
  return { id: row.id, v, name: row.name, photos: shown.slice(0, MOST).map((s, i) => ({ id: s.id, credit: plainCredit(s.credit), ...(i > 0 ? { ok: true } : {}) })), hours };
}
const hit = async (row: Row): Promise<PlaceHit> => (await knownHits([row])).get(row.id) ?? null;

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
  if (!(await allow("google.details"))) return;
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
  if (!(await allow("google.details"))) return null;
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
  if (!(await allow("google.search"))) return null;
  const s: any = await (await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(words)}${where}&language=en&key=${key}`)).json();
  const top = (s?.results || [])[0];
  if (!top?.place_id) return null;
  return byId(top.place_id, key, top);
}

/** Google's listing of one place, by its id: name, address, kinds, up to ten photos, hours */
async function byId(placeId: string, key: string, top: any = {}): Promise<{ found: Found; hours: Hours | null } | null> {
  if (!(await allow("google.details"))) return null;
  const d: any = await (await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,types,photos,${HOURS_FIELDS}&language=en&key=${key}`)).json();
  const r = d?.result || top;
  if (!r?.name && !top?.name) return null;
  return {
    found: {
      placeId, name: r.name || top.name, address: r.formatted_address || top.formatted_address || "", types: r.types || top.types || [],
      // (the photographer as the photo list gives them — the same words placePhotoChecks.ts reads, so the fingerprints agree)
      photos: (r.photos || top.photos || []).slice(0, LOOKED_AT).map((p: any) => ({ ref: p.photo_reference, width: Number(p.width) || 0, height: Number(p.height) || 0,
        credit: (p.html_attributions || []).map((a: string) => a.replace(/<[^>]+>/g, "").trim()).filter(Boolean).join("; ") || null })),
    },
    hours: hoursOf(d?.result),
  };
}

/** Her line's own words, for a second search when the first found another place: "DINNER RESERVATION – Gastronomy
 *  "Joël Robuchon" (Ebisu)" → "Gastronomy Joël Robuchon Ebisu" */
export function lineWords(line: string): string {
  return line
    .replace(/\s*\((?:her tab names the stop|her booking for it|her list says):[^)]*\)\s*$/, "")
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
  let looked: { bytes: Buffer; type: string }[] | null = null, shownPicks: number[] = [];
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
      looked = await lookAt(got.found.photos);
      const picks = looked ? await judgePhotos(line, got.found.name, looked, MOST).catch((e) => { console.warn("[place-photos] pick:", e?.message || e); return null; }) : null;
      if (picks === null) return kept ? hit(kept) : null;
      if (!picks.length) { verdict = "no"; why = `${why}; none of its photos shows it`; }
      else shownPicks = picks;
    }
  }
  const found = got?.found ?? null;
  // (hours only for the place her line means; never the photos' references — they expire and may not be stored; the
  // verdicts on the photos are kept instead, in place_photo_checks)
  const data = { line, placeId: found?.placeId ?? null, name: found?.name ?? null, address: found?.address ?? null, photos: [], verdict, why: `${RULES}${why || ""}`,
    hours: verdict === "yes" ? (got?.hours ?? { weekly: [], dated: [], status: null, at: Date.now() }) as unknown as Prisma.InputJsonValue : Prisma.DbNull, checkedAt: new Date() };
  const row = await prisma.placePhoto.upsert({ where: { query }, create: { query, ...data }, update: data });
  if (verdict === "yes" && looked && found) await recordVerdicts(row.id, looked.map((l, i) => ({ ...l, credit: found.photos[i].credit, width: found.photos[i].width, height: found.photos[i].height })), shownPicks, line);
  else await prisma.placePhotoCheck.deleteMany({ where: { placeRowId: row.id } });
  console.log(`[place-photos] "${line.slice(0, 50)}" → ${found?.name || "nothing"}: ${verdict}${verdict === "yes" ? `, ${shownPicks.length} photos` : ""}${why ? ` (${why.slice(0, 80)})` : ""}`);
  return hit(row);
}

/** Each of a place's photos at 640 wide, to be looked at by the photo check — null when any can't be fetched */
async function lookAt(refs: Ref[]): Promise<{ bytes: Buffer; type: string }[] | null> {
  const out: { bytes: Buffer; type: string }[] = [];
  for (const r of refs) {
    const p = await fetchPhoto(r.ref, 640);
    if (!p) return null;
    out.push({ bytes: p.bytes, type: p.type });
  }
  return out;
}
