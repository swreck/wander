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
 */
import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import prisma from "./db.js";

const WEEK = 7 * 24 * 3600_000;
const MOST = 6;
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
const hit = (row: Row): PlaceHit =>
  row.verdict === "yes" && Array.isArray(row.photos) && row.photos.length
    ? { id: row.id, v: row.checkedAt.getTime(), name: row.name, photos: (row.photos as Ref[]).map((p, i) => ({ credit: p.credit, ...(i > 0 && p.ok ? { ok: true } : {}) })), hours: (row.hours as Hours | null) ?? null } : null;

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

/** Places checked before Play's second photo existed (Oct 16): each looked at once more, one at a time, in the
 *  background — a phone gets them through /known, which never reaches resolve() for a place already checked */
let secondsRunning = false;
// (a place whose second-photo look keeps failing — five photos and a model call each time — is tried at most once a day;
// it was tried on every app open; cost audit, Oct 16)
const secondsTried = new Map<string, number>();
export function freshenSecondPhotos(): void {
  if (secondsRunning || !process.env.GOOGLE_MAPS_API_KEY) return;
  secondsRunning = true;
  (async () => {
    const rows = await prisma.placePhoto.findMany({ where: { verdict: "yes" }, select: { id: true, line: true, name: true, query: true, photos: true } });
    for (const r of rows) {
      const refs = r.photos as Ref[];
      if ((secondsTried.get(r.id) || 0) > Date.now() - 86400_000) continue;
      if (Array.isArray(refs) && refs.length > 1 && !refs[0]?.two) { secondsTried.set(r.id, Date.now()); await secondPhotoFor(r.id, r.line, r.name || r.query, refs); }
    }
  })().catch((e) => console.warn("[place-photos] second run:", e?.message || e)).finally(() => { secondsRunning = false; });
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

async function resolve(query: string, line: string, near: { lat: number; lng: number } | null): Promise<PlaceHit> {
  const kept = await prisma.placePhoto.findUnique({ where: { query } });
  // (checked again when her words for it changed — a new Guide copy, or the stop her tab names)
  if (kept && kept.line === line && Date.now() - kept.checkedAt.getTime() < WEEK) {
    // (a place her line means: its hours, when Wander has none yet or they're three days old)
    const h = kept.hours as Hours | null;
    if (kept.verdict === "yes" && (!h || Date.now() - (h.at || 0) > HOURS_FRESH)) await refreshHours(kept);
    const refs = kept.photos as Ref[];
    if (kept.verdict === "yes" && Array.isArray(refs) && refs.length > 1 && !refs[0]?.two) await secondPhotoFor(kept.id, line, kept.name || query, refs);
    return hit((await prisma.placePhoto.findUnique({ where: { id: kept.id } })) || kept);
  }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return kept ? hit(kept) : null;
  let found: { placeId: string; name: string; address: string; types: string[]; photos: Ref[] } | null = null;
  let hoursFound: Hours | null = null;
  try {
    const where = near ? `&location=${near.lat},${near.lng}&radius=20000` : "";
    const s: any = await (await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}${where}&language=en&key=${key}`)).json();
    const top = (s?.results || [])[0];
    if (top?.place_id) {
      const d: any = await (await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${top.place_id}&fields=name,formatted_address,types,photos,${HOURS_FIELDS}&language=en&key=${key}`)).json();
      const r = d?.result || top;
      hoursFound = hoursOf(d?.result);
      found = {
        placeId: top.place_id, name: r.name || top.name, address: r.formatted_address || top.formatted_address || "", types: r.types || top.types || [],
        photos: (r.photos || top.photos || []).slice(0, MOST).map((p: any) => ({ ref: p.photo_reference, credit: ((p.html_attributions || [])[0] || "").replace(/<[^>]+>/g, "").trim() || null })),
      };
    }
  } catch (e: any) {
    console.warn("[place-photos] google:", e?.message || e);
    return kept ? hit(kept) : null;   // (a hiccup: last week's answer, or none — asked again next time)
  }
  let verdict: "yes" | "no" | "none" = "none", why: string | null = null;
  if (found && found.photos.length) {
    const c = await samePlace(line, query, found).catch((e) => { console.warn("[place-photos] check:", e?.message || e); return null; });
    if (!c) return kept ? hit(kept) : null;   // (unchecked is never shown)
    verdict = c.same ? "yes" : "no"; why = c.why;
    // …and the photo that leads is one that shows what her line means — Google's first photo of Ginza Mitsukoshi was a
    // handbag shop, for her "LIGHT LUNCH – Ginza Mitsukoshi Depachika" (tourist63). None of the first three: no photo.
    if (verdict === "yes") {
      const pick = await bestPhoto(line, found.name, found.photos.slice(0, 5), key).catch((e) => { console.warn("[place-photos] pick:", e?.message || e); return null; });
      if (pick === null) return kept ? hit(kept) : null;
      if (pick.best < 0) { verdict = "no"; why = `${why}; none of its first photos shows it`; }
      else found.photos = ordered(found.photos, pick);
    }
  }
  // (hours kept only for the place her line means)
  const data = { line, placeId: found?.placeId ?? null, name: found?.name ?? null, address: found?.address ?? null, photos: found?.photos ?? [], verdict, why,
    hours: verdict === "yes" ? (hoursFound ?? { weekly: [], dated: [], status: null, at: Date.now() }) as unknown as Prisma.InputJsonValue : Prisma.DbNull, checkedAt: new Date() };
  const row = await prisma.placePhoto.upsert({ where: { query }, create: { query, ...data }, update: data });
  console.log(`[place-photos] "${line.slice(0, 50)}" → ${found?.name || "nothing"}: ${verdict}${why ? ` (${why.slice(0, 80)})` : ""}`);
  return hit(row);
}

/** Is Google's place the one her line means? Asked once per search a week — a few tenths of a cent */
async function samePlace(line: string, query: string, g: { name: string; address: string; types: string[] }): Promise<{ same: boolean; why: string } | null> {
  client ??= new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-5", max_tokens: 1500,
    system: "You check whether a photo of a place may stand beside a line of a travel plan. Say same=true only when Google's place is plainly the very place the line means to visit (the same shop, restaurant, temple, market, museum, station or hotel — a branch in another town is not the same). A line that isn't one place (a walk, a stroll through an area, \"refresh at the hotel\" when the hotel isn't named, free time, lunch with no place named) is same=false. A line about getting somewhere — a taxi, train, bus or walk to a place, a transfer, \"continue to\", \"return to\" — is same=false: the photo belongs on the line for the place itself. When unsure, false: a wrong photo beside her plan is worse than none.",
    messages: [{ role: "user", content: `Her plan's line: "${line}"\nThe Maps search for it: "${query}"\nGoogle's place: "${g.name}", ${g.address} (kinds: ${g.types.slice(0, 6).join(", ")})\nAnswer in JSON only: {"same": true|false, "why": "a few words"}` }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const j = JSON.parse(m[0]);
  return typeof j.same === "boolean" ? { same: j.same, why: String(j.why || "") } : null;
}

/** The photos in the order shown: the best first, the second one checked next (marked ok), then the rest; the first says
 *  the two-photo check was made */
function ordered(refs: Ref[], pick: { best: number; also: number }): Ref[] {
  const first = { ...refs[pick.best], two: true, ok: undefined };
  const also = pick.also >= 0 && pick.also !== pick.best && refs[pick.also] ? [{ ...refs[pick.also], ok: true, two: undefined }] : [];
  const rest = refs.filter((_, i) => i !== pick.best && !(also.length && i === pick.also)).map((r) => ({ ...r, ok: undefined, two: undefined }));
  return [first, ...also, ...rest];
}

/** A place checked before the second photo existed: its own photos looked at once more (the first stays first unless the
 *  check says another shows it better) — a few cents, once */
async function secondPhotoFor(id: string, line: string, name: string, refs: Ref[]) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return;
  try {
    const pick = await bestPhoto(line, name, refs.slice(0, 5), key);
    if (!pick) return;
    // (none shows it now: the first, as it was checked before, stays alone)
    const photos = pick.best < 0 ? [{ ...refs[0], two: true }, ...refs.slice(1).map((r) => ({ ...r, ok: undefined }))] : ordered(refs, pick);
    // (checkedAt moves on: it's in each photo's address, and a phone keeps a photo a week — a new first photo must never
    // show under the old one's address)
    await prisma.placePhoto.update({ where: { id }, data: { photos: photos as unknown as Prisma.InputJsonValue, checkedAt: new Date() } });
  } catch (e: any) { console.warn("[place-photos] second:", e?.message || e); }
}

/** Which of a place's first photos best shows what her line means, and a second, different one that shows it too — their
 *  indexes (-1 for none), null when they couldn't be looked at. Each photo is fetched small (640 wide) to be looked at; a
 *  few cents a place, once a week. */
async function bestPhoto(line: string, name: string, refs: Ref[], key: string): Promise<{ best: number; also: number } | null> {
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
  if (!imgs.length) return { best: -1, also: -1 };
  client ??= new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-5", max_tokens: 1500,
    system: "You choose the photos to show for a line of a travel plan. Each must show the place the way the line means it: the market's stalls for a market, the temple for a temple, the food hall for a department store's food hall (depachika), the restaurant's room or food for a restaurant, the museum or its art for a museum, the hotel for a hotel. Not a different shop inside a department store, not a sign, a map, a menu board alone, a receipt, a car park, a selfie or a person filling the frame. \"best\": the one that shows it best. \"also\": a second that also shows it, a clearly different view (not the same shot again) — -1 when none does. When none of them shows it at all, best is -1.",
    messages: [{ role: "user", content: [...imgs, { type: "text", text: `Her plan's line: "${line}" — the place: "${name}". The ${imgs.length} photos above are numbered 0 to ${imgs.length - 1} in order. Answer in JSON only: {"best": <number or -1>, "also": <number or -1>, "why": "a few words"}` }] }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "null");
  if (!j || typeof j.best !== "number") return null;
  console.log(`[place-photos] photos for "${line.slice(0, 40)}": ${j.best}, also ${j.also} (${String(j.why || "").slice(0, 60)})`);
  const inRange = (n: unknown) => typeof n === "number" && n >= 0 && n < imgs.length;
  const best = inRange(j.best) ? j.best : -1;
  return { best, also: best >= 0 && inRange(j.also) && j.also !== best ? j.also : -1 };
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
