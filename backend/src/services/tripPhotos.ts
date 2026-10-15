/**
 * Your own photos, on the day you took them (Oct 15 2026 — Ken: "Yes. Value, delight. Not gimmicks. Go"). Andy comes
 * from Instagram: the trip's own pictures are what it lacked — every photo in Wander came from Google or the city.
 *
 * A photo is its taker's alone until they share it with the trip; shared, all four see it on its day, in "Play the day"
 * and in the trip's story. Only its taker can change or delete it, and deleting removes it for real. Each person's
 * last choice ("share" or not) is remembered as their next default (preferences.photos.share).
 */
import jwt from "jsonwebtoken";
import prisma from "./db.js";

const SECRET = process.env.JWT_SECRET || "dev-secret";
const MAX_FULL = 4 * 1024 * 1024, MAX_THUMB = 400 * 1024;

export type PhotoView = {
  id: string; dayDate: string; takenAt: string | null; caption: string | null; shared: boolean; authorName: string; mine: boolean;
  width: number | null; height: number | null; url: string; thumbUrl: string; createdAt: string;
};

/** A link to a photo for one viewer, for an <img> (which carries no sign-in) — the same all day. The picture route checks,
 *  every time, that the photo is still the viewer's or still shared (tourist75: a link kept working after its taker made
 *  the photo private again) */
function linkFor(id: string, size: "full" | "thumb", viewer: string) {
  const day = Math.floor(Date.now() / 86_400_000) * 86_400;
  return `/api/trip-photos/image/${id}/${size}?t=${jwt.sign({ photo: id, viewer, iat: day }, SECRET, { expiresIn: "2d" })}`;
}
/** The viewer a link was made for, when it's a good link to this photo */
export function viewerFromLink(id: string, token: string): string | null {
  try { const p = jwt.verify(token, SECRET) as any; return p?.photo === id && typeof p.viewer === "string" ? p.viewer : null; } catch { return null; }
}

export async function listPhotos(tripId: string, me: string, date?: string | null): Promise<PhotoView[]> {
  const rows = await prisma.tripPhoto.findMany({
    where: { tripId, ...(date ? { dayDate: date } : {}), OR: [{ travelerId: me }, { shared: true }] },
    select: { id: true, dayDate: true, takenAt: true, caption: true, shared: true, authorName: true, travelerId: true, width: true, height: true, createdAt: true },
  });
  return rows
    // (by the photo's own clock; one without a clock after them, in the order kept — as "Play the day" plays them)
    .sort((a, b) => (a.dayDate + (a.takenAt ? `0${a.takenAt}` : `1${a.createdAt.toISOString()}`)).localeCompare(b.dayDate + (b.takenAt ? `0${b.takenAt}` : `1${b.createdAt.toISOString()}`)))
    .map((r) => ({ id: r.id, dayDate: r.dayDate, takenAt: r.takenAt, caption: r.caption, shared: r.shared, authorName: r.authorName, mine: r.travelerId === me,
      width: r.width, height: r.height, url: linkFor(r.id, "full", me), thumbUrl: linkFor(r.id, "thumb", me), createdAt: r.createdAt.toISOString() }));
}

const b64 = (s: unknown) => (typeof s === "string" ? Buffer.from(s.replace(/^data:[^,]+,/, ""), "base64") : null);

export async function addPhoto(input: { tripId: string; travelerId: string; authorName: string; image: string; thumb: string; dayDate: string; takenAt?: string | null;
  caption?: string | null; shared?: boolean; width?: number | null; height?: number | null }): Promise<{ id: string } | { error: string }> {
  const image = b64(input.image), thumb = b64(input.thumb);
  if (!image?.length || !thumb?.length) return { error: "That photo didn't come through — try it again." };
  if (image.length > MAX_FULL || thumb.length > MAX_THUMB) return { error: "That photo is too large to keep." };
  // (a JPEG, as the phone makes it — never anything else stored as a photo)
  if (!(image[0] === 0xff && image[1] === 0xd8) || !(thumb[0] === 0xff && thumb[1] === 0xd8)) return { error: "That isn't a photo Wander can keep." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dayDate)) return { error: "Which day is it from?" };
  const takenAt = typeof input.takenAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.takenAt) ? input.takenAt.slice(0, 16) : null;
  const row = await prisma.tripPhoto.create({ data: { tripId: input.tripId, travelerId: input.travelerId, authorName: input.authorName, dayDate: input.dayDate, takenAt,
    caption: (input.caption || "").trim().slice(0, 300) || null, shared: input.shared === true, image, thumb,
    width: Number.isFinite(input.width) ? Math.round(input.width!) : null, height: Number.isFinite(input.height) ? Math.round(input.height!) : null } });
  await rememberShare(input.travelerId, input.shared === true);
  return { id: row.id };
}

/** What a change touched: its trip, and whether the others could see it before or after (then their open screens must
 *  catch up at once — tourist77: a day left open kept showing a photo its taker had made private) */
export type Touched = { tripId: string; others: boolean };

/** Share, unshare, or say what it is — its taker only */
export async function changePhoto(id: string, me: string, change: { shared?: boolean; caption?: string | null }): Promise<Touched | null> {
  const row = await prisma.tripPhoto.findFirst({ where: { id, travelerId: me }, select: { id: true, tripId: true, shared: true } });
  if (!row) return null;
  await prisma.tripPhoto.update({ where: { id }, data: {
    ...(typeof change.shared === "boolean" ? { shared: change.shared } : {}),
    ...(change.caption !== undefined ? { caption: (change.caption || "").trim().slice(0, 300) || null } : {}),
  } });
  if (typeof change.shared === "boolean") await rememberShare(me, change.shared);
  return { tripId: row.tripId, others: row.shared || change.shared === true };
}

/** Gone for real — its taker only */
export async function deletePhoto(id: string, me: string): Promise<Touched | null> {
  const row = await prisma.tripPhoto.findFirst({ where: { id, travelerId: me }, select: { tripId: true, shared: true } });
  if (!row) return null;
  const r = await prisma.tripPhoto.deleteMany({ where: { id, travelerId: me } });
  return r.count === 1 ? { tripId: row.tripId, others: row.shared } : null;
}

/** Each person's last choice, offered as their next default */
async function rememberShare(travelerId: string, share: boolean) {
  const t = await prisma.traveler.findUnique({ where: { id: travelerId }, select: { preferences: true } });
  const prefs = (t?.preferences as any) || {};
  if (prefs.photos?.share === share) return;
  await prisma.traveler.update({ where: { id: travelerId }, data: { preferences: { ...prefs, photos: { ...(prefs.photos || {}), share } } } });
}
export async function shareDefault(travelerId: string): Promise<boolean> {
  const t = await prisma.traveler.findUnique({ where: { id: travelerId }, select: { preferences: true } });
  return ((t?.preferences as any) || {}).photos?.share === true;
}
