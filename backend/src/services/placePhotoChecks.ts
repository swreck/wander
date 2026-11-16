/**
 * A place's checked photos, shown from Google's current list of them (Nov 16 2026).
 *
 * Why: Google's photo references expire about a month after they're handed out (Japan's, found Oct 17, stopped opening on
 * Nov 16) and may not be stored ("You cannot cache a photo_reference" — Google's Place Photos documentation). Wander stored
 * them, so a place's photos died a month after it was checked, and nothing renewed them for any trip.
 *
 * Now: Wander keeps only its own verdict on each photo (place_photo_checks: passed or not, its rank, when) against a
 * fingerprint — a hash of the photographer and the photo's size, and a hash of the image itself at 640 wide. When a person
 * opens a place, the server asks Google for the place's current photos by its place id (place ids may be kept), matches
 * them to the verdicts, and shows only the passed ones, in their order. What's asked of Google is held in memory only, for
 * as long as Google's own answer allows: a place's photo list 5 minutes (its "max-age=300"), a photo's image 24 hours
 * (its "max-age=86400"). Nothing about a reference reaches the database or a phone.
 *
 * Matching: by photographer + size; when two or more of the place's current photos share that, by the image hash; a photo
 * not matched with certainty is new and must pass the check itself (services/photoJudge.ts). A place kept from Japan's own
 * October checks shows exactly those photos; any other place has its new photos checked once each, while it shows fewer
 * than eight.
 */
import crypto from "crypto";
import prisma from "./db.js";
import { allow } from "./usage.js";
import { judgePhotos } from "./photoJudge.js";

export const MOST = 8;
const DAY = 24 * 3600_000;
const LIST_MS = 300_000;            // Google's place answer: "Cache-Control: public, max-age=300"
const IMAGE_MS = DAY;               // Google's photo answer: "Cache-Control: public, max-age=86400"
const CHECK_WAIT_MS = 25_000;       // a person opening a place not yet re-checked waits this long at most

export type Current = { ref: string; width: number; height: number; credit: string | null; keyHash: string; imageHash?: string | null };
type List = { photos: Current[]; until: number };
type Check = { id: string; placeRowId: string; keyHash: string | null; imageHash: string | null; pass: boolean; rank: number | null; credit: string | null; source: string; missingAt: Date | null; checkedAt: Date };

const sha = (s: string | Buffer) => crypto.createHash("sha256").update(s).digest("hex");
export const keyOf = (credit: string | null, width: number, height: number) => sha(`${credit ?? ""}|${width}|${height}`);
export const imageHashOf = (bytes: Buffer) => sha(bytes);
const dayNow = () => new Date().toISOString().slice(0, 10);

// ── Google, asked on demand ──
const lists = new Map<string, List>();
const listing = new Map<string, Promise<Current[] | null>>();
// (a place Google couldn't list today — down, gone, no photos — is asked again tomorrow, whoever opens it)
const listFailedOn = new Map<string, string>();

/** The place's current photos from Google (by its place id): from memory for 5 minutes, else one lookup shared by
 *  everyone asking at that moment; null when Google can't be asked or lists none (then not again today) */
export function currentPhotos(placeId: string): Promise<Current[] | null> {
  const had = lists.get(placeId);
  if (had && had.until > Date.now()) return Promise.resolve(had.photos);
  if (listFailedOn.get(placeId) === dayNow()) return Promise.resolve(null);
  if (!listing.has(placeId)) listing.set(placeId, askList(placeId).finally(() => listing.delete(placeId)));
  return listing.get(placeId)!;
}
async function askList(placeId: string): Promise<Current[] | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  if (!(await allow("google.details"))) return null;   // (the day's ceiling: not marked failed — asked again tomorrow anyway)
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=photos&key=${key}`);
    const d: any = await r.json();
    const photos: Current[] = (d?.result?.photos || []).slice(0, 10).map((p: any) => {
      const credit = (p.html_attributions || []).map((a: string) => a.replace(/<[^>]+>/g, "").trim()).filter(Boolean).join("; ") || null;
      return { ref: p.photo_reference, width: Number(p.width) || 0, height: Number(p.height) || 0, credit, keyHash: keyOf(credit, Number(p.width) || 0, Number(p.height) || 0) };
    }).filter((p: Current) => !!p.ref);
    if (!photos.length) { listFailedOn.set(placeId, dayNow()); console.warn(`[place-photos] Google lists no photos for ${placeId.slice(0, 10)}… (${d?.status})`); return null; }
    const age = Number((r.headers.get("cache-control") || "").match(/max-age=(\d+)/)?.[1]) * 1000;
    lists.set(placeId, { photos, until: Date.now() + Math.min(Number.isFinite(age) && age > 0 ? age : LIST_MS, LIST_MS) });
    return photos;
  } catch (e: any) {
    listFailedOn.set(placeId, dayNow());
    console.warn("[place-photos] google list:", e?.message || e);
    return null;
  }
}

/** One photo's image from Google at a width — counted, under the day's ceiling; null when refused or not there */
export async function fetchPhoto(ref: string, width: number): Promise<{ bytes: Buffer; type: string; maxAge: number } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !(await allow("google.photo"))) return null;
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=${width}&photo_reference=${encodeURIComponent(ref)}&key=${key}`).catch(() => null);
  if (!r?.ok) return null;
  const age = Number((r.headers.get("cache-control") || "").match(/max-age=(\d+)/)?.[1]);
  return { bytes: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "image/jpeg", maxAge: Math.min(Number.isFinite(age) && age > 0 ? age : IMAGE_MS / 1000, IMAGE_MS / 1000) };
}

/** A current photo's image hash at 640 wide (fetched once per list; the bytes kept to show as its small size) */
async function hashOf(c: Current): Promise<string | null> {
  if (c.imageHash !== undefined) return c.imageHash;
  const p = await fetchPhoto(c.ref, 640);
  c.imageHash = p ? imageHashOf(p.bytes) : null;
  if (p) smallByHash.set(c.imageHash!, { bytes: p.bytes, type: p.type, until: Date.now() + p.maxAge * 1000 });
  return c.imageHash;
}
// (an image fetched to be hashed or checked, kept by its hash until it's known whose it is — so it isn't fetched again)
const smallByHash = new Map<string, Kept>();

/** Which current photo each verdict is: by photographer + size when that's unique on both sides; else by the image hash.
 *  A verdict with no certain match isn't in the map; a current photo matched by none is new. */
export async function match(checks: Check[], current: Current[]): Promise<{ byCheck: Map<string, Current>; unmatched: Current[] }> {
  const byCheck = new Map<string, Current>();
  const taken = new Set<Current>();
  const groups = new Map<string, Current[]>();
  for (const c of current) groups.set(c.keyHash, [...(groups.get(c.keyHash) || []), c]);
  const checksByKey = new Map<string, Check[]>();
  for (const v of checks) if (v.keyHash) checksByKey.set(v.keyHash, [...(checksByKey.get(v.keyHash) || []), v]);
  for (const [k, vs] of checksByKey) {
    const cs = groups.get(k) || [];
    if (!cs.length) continue;
    if (cs.length === 1 && vs.length === 1) { byCheck.set(vs[0].id, cs[0]); taken.add(cs[0]); continue; }
    // (a shared key — phone photos share one size, one account posts several: settled by the image itself)
    for (const c of cs) {
      const h = await hashOf(c);
      const v = h ? vs.find((x) => x.imageHash === h && !byCheck.has(x.id)) : undefined;
      if (v) { byCheck.set(v.id, c); taken.add(c); }
    }
  }
  return { byCheck, unmatched: current.filter((c) => !taken.has(c)) };
}

// ── the images, kept in memory for Google's 24 hours, by Wander's own id for the photo ──
type Kept = { bytes: Buffer; type: string; until: number };
const images = new Map<string, Kept>();
const MOST_KEPT = 500;
function keep(k: string, p: Kept) {
  images.set(k, p);
  if (images.size > MOST_KEPT) images.delete(images.keys().next().value!);
}
const fetching = new Map<string, Promise<{ bytes: Buffer; type: string; maxAge: number } | null>>();

type Row = { id: string; line: string; name: string | null; placeId: string | null; verdict: string };
const rowOf = (id: string) => prisma.placePhoto.findUnique({ where: { id }, select: { id: true, line: true, name: true, placeId: true, verdict: true } }).catch(() => null);
const checksOf = (rowId: string) => prisma.placePhotoCheck.findMany({ where: { placeRowId: rowId }, orderBy: [{ rank: "asc" }, { checkedAt: "asc" }] }) as Promise<Check[]>;
/** The photos a place shows, in order: passed, not seen missing from Google */
export const shownChecks = (rowId: string) => prisma.placePhotoCheck.findMany({ where: { placeRowId: rowId, pass: true, missingAt: null }, orderBy: [{ rank: "asc" }, { checkedAt: "asc" }] }) as Promise<Check[]>;

/** One photo of a place, by Wander's address for it: `which` is the photo's own id, or its place in the order (the
 *  addresses phones kept before Nov 16 — "0", "1" …). Small is 640 wide, large 1200. null: not there (the phone says
 *  "Photo not available") — never an error. */
export async function picture(rowId: string, which: string, small: boolean): Promise<{ bytes: Buffer; type: string; maxAge: number } | null> {
  const row = await rowOf(rowId);
  if (!row || row.verdict !== "yes" || !row.placeId) return null;
  let shown = await shownChecks(row.id);
  // (a place not yet looked at by these rules — Japan's 75 whose photos expired: looked at now, while the person waits a
  // little; the answer is kept, so it's looked at once)
  if (!shown.length && (await prisma.placePhotoCheck.count({ where: { placeRowId: row.id } })) === 0) {
    await Promise.race([ensureChecked(row), new Promise((ok) => setTimeout(ok, CHECK_WAIT_MS))]);
    shown = await shownChecks(row.id);
  }
  const check = /^\d+$/.test(which) ? shown[Number(which)] : shown.find((c) => c.id === which);
  if (!check) return null;
  const k = `${check.id}:${small ? "s" : "l"}`;
  const had = images.get(k);
  if (had && had.until > Date.now()) return { bytes: had.bytes, type: had.type, maxAge: Math.round((had.until - Date.now()) / 1000) };
  if (small && check.imageHash) {
    const h = smallByHash.get(check.imageHash);
    if (h && h.until > Date.now()) { keep(k, h); return { bytes: h.bytes, type: h.type, maxAge: Math.round((h.until - Date.now()) / 1000) }; }
  }
  if (!fetching.has(k)) fetching.set(k, fetchFor(row, check, small).finally(() => fetching.delete(k)));
  return fetching.get(k)!;
}
async function fetchFor(row: Row, check: Check, small: boolean) {
  const current = await currentPhotos(row.placeId!);
  if (!current) return null;
  const all = await checksOf(row.id);
  const { byCheck, unmatched } = await match(all, current);
  void markMissing(all, byCheck);
  // (a place with fewer than eight to show has its new photos checked — once each, in the background)
  const present = all.filter((v) => v.pass && byCheck.has(v.id)).length;
  if (present < MOST && unmatched.length && !all.some((v) => v.source === "october")) void ensureChecked(row);
  const c = byCheck.get(check.id);
  if (!c) return null;
  const p = await fetchPhoto(c.ref, small ? 640 : 1200);
  if (p) keep(`${check.id}:${small ? "s" : "l"}`, { bytes: p.bytes, type: p.type, until: Date.now() + p.maxAge * 1000 });
  return p;
}
/** A passed photo Google no longer lists stops being offered (and comes back if Google lists it again) */
async function markMissing(all: Check[], byCheck: Map<string, Current>) {
  const gone = all.filter((v) => v.pass && !v.missingAt && !byCheck.has(v.id)).map((v) => v.id);
  const back = all.filter((v) => v.missingAt && byCheck.has(v.id)).map((v) => v.id);
  if (gone.length) await prisma.placePhotoCheck.updateMany({ where: { id: { in: gone } }, data: { missingAt: new Date() } }).catch(() => {});
  if (back.length) await prisma.placePhotoCheck.updateMany({ where: { id: { in: back } }, data: { missingAt: null } }).catch(() => {});
}

// ── the check, on demand, once per photo ──
const checking = new Map<string, Promise<void>>();
const checkedOn = new Map<string, string>();
/** The place's photos Wander hasn't judged yet: each looked at by the photo check, once; the verdicts kept. One at a time
 *  per place, at most once a day per place (a failed look is tried again tomorrow). */
export function ensureChecked(row: Row): Promise<void> {
  if (checkedOn.get(row.id) === dayNow()) return checking.get(row.id) ?? Promise.resolve();
  if (!checking.has(row.id)) {
    checkedOn.set(row.id, dayNow());
    checking.set(row.id, checkNew(row).catch((e) => console.warn("[place-photos] check:", e?.message || e)).finally(() => checking.delete(row.id)));
  }
  return checking.get(row.id)!;
}
async function checkNew(row: Row): Promise<void> {
  if (!row.placeId) return;
  const current = await currentPhotos(row.placeId);
  if (!current) return;
  const all = await checksOf(row.id);
  if (all.some((v) => v.source === "october")) return;   // (Japan's own October photos: exactly those)
  const { byCheck, unmatched } = await match(all, current);
  const present = all.filter((v) => v.pass && byCheck.has(v.id)).length;
  if (!unmatched.length || present >= MOST) return;
  const looked: { c: Current; bytes: Buffer; type: string }[] = [];
  for (const c of unmatched) {
    const p = await fetchPhoto(c.ref, 640);
    if (!p) continue;
    c.imageHash = imageHashOf(p.bytes);
    smallByHash.set(c.imageHash, { bytes: p.bytes, type: p.type, until: Date.now() + p.maxAge * 1000 });
    looked.push({ c, bytes: p.bytes, type: p.type });
  }
  if (!looked.length) return;
  const picks = await judgePhotos(row.line, row.name || row.line, looked.map((l) => ({ bytes: l.bytes, type: l.type })), MOST - present);
  if (picks === null) { checkedOn.delete(row.id); return; }   // (couldn't be looked at: asked again on the next open)
  const top = all.reduce((m, v) => Math.max(m, v.rank ?? -1), -1);
  await prisma.placePhotoCheck.createMany({
    data: looked.map((l, i) => {
      const at = picks.indexOf(i);
      return { placeRowId: row.id, keyHash: l.c.keyHash, imageHash: l.c.imageHash!, pass: at >= 0, rank: at >= 0 ? top + 1 + at : null, credit: l.c.credit, source: "check" };
    }),
  });
  console.log(`[place-photos] "${row.line.slice(0, 40)}": ${picks.length} of ${looked.length} new photos pass`);
}

/** Verdicts for a place just looked at for the first time (services/placePhotos.ts resolve): its photos as checked
 *  then — the passed ones in order, and the others as not passed — in place of any it had */
export async function recordVerdicts(rowId: string, looked: { credit: string | null; width: number; height: number; bytes: Buffer; type: string }[], picks: number[]): Promise<void> {
  await prisma.$transaction([
    prisma.placePhotoCheck.deleteMany({ where: { placeRowId: rowId } }),
    prisma.placePhotoCheck.createMany({
      data: looked.map((l, i) => {
        const at = picks.indexOf(i);
        return { placeRowId: rowId, keyHash: keyOf(l.credit, l.width, l.height), imageHash: imageHashOf(l.bytes), pass: at >= 0, rank: at >= 0 ? at : null, credit: l.credit, source: "check" };
      }),
    }),
  ]);
  for (const l of looked) smallByHash.set(imageHashOf(l.bytes), { bytes: l.bytes, type: l.type, until: Date.now() + IMAGE_MS });
}

/** (tests: forget what memory holds) */
export function forgetForTests(): void { lists.clear(); listFailedOn.clear(); images.clear(); smallByHash.clear(); checkedOn.clear(); }
