// Your own photos, on the day you took them (services/tripPhotos.ts — Oct 15 2026). Yours alone until you share them.
import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { tripMemberParam } from "../middleware/role.js";
import { listPhotos, addPhoto, changePhoto, deletePhoto, shareDefault, viewerFromLink } from "../services/tripPhotos.js";
import { broadcastChange } from "./sse.js";

/** The others' open screens fetch the photos again (no notice) when a change touched what they can see */
function tellOthers(req: AuthRequest, tripId: string) {
  try { broadcastChange(tripId, { userCode: req.user!.code, displayName: req.user!.displayName, description: "updated the trip's photos", quiet: true }); } catch { /* no one listening */ }
}

const router = Router();

// GET /image/:id/:size?t=… — the picture itself, by a signed link (an <img> carries no sign-in)
router.get("/image/:id/:size", async (req, res) => {
  const id = req.params.id as string;
  const viewer = viewerFromLink(id, String(req.query.t || ""));
  if (!viewer) { res.status(403).json({ error: "This photo link has expired. Reopen the page." }); return; }
  const thumb = req.params.size === "thumb";
  const row = await prisma.tripPhoto.findUnique({ where: { id }, select: { imageType: true, shared: true, travelerId: true } });
  // (still theirs, or still shared — asked every time, so a photo made private again stops showing at once)
  if (!row || !(row.shared || row.travelerId === viewer)) { res.status(404).json({ error: "That photo isn't there anymore." }); return; }
  res.setHeader("Content-Type", row.imageType || "image/jpeg");
  // (the phone asks again each time it shows it — answered "not changed" when it hasn't — never shows a copy on its own)
  res.setHeader("Cache-Control", "private, no-cache");
  // (a photo's picture never changes once kept — only its caption and who sees it — so "not changed" is answered from
  // its id, without loading the picture from the database; it was loaded on every view — cost audit, Oct 16)
  const tag = `"${id}-${thumb ? "t" : "f"}"`;
  res.setHeader("ETag", tag);
  if (String(req.headers["if-none-match"] || "").split(/\s*,\s*/).includes(tag)) { res.status(304).end(); return; }
  const pic = await prisma.tripPhoto.findUnique({ where: { id }, select: thumb ? { thumb: true } : { image: true } });
  if (!pic) { res.status(404).json({ error: "That photo isn't there anymore." }); return; }
  res.send(Buffer.from(((pic as any).thumb ?? (pic as any).image) as Uint8Array));
});

router.use(requireAuth);
router.param("tripId", tripMemberParam);

// GET /trip/:tripId?date=YYYY-MM-DD — yours and the shared ones, by when they were taken; and your share default
router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  if (!me) { res.status(403).json({ error: "Photos are kept per person — sign in on your own phone." }); return; }
  const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
  res.json({ photos: await listPhotos(req.params.tripId as string, me, date), shareDefault: await shareDefault(me) });
});

// POST /trip/:tripId — { image, thumb (base64 JPEG), dayDate, takenAt?, caption?, shared?, width?, height? }
router.post("/trip/:tripId", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  if (!me) { res.status(403).json({ error: "Photos are kept per person — sign in on your own phone." }); return; }
  const b = req.body || {};
  const r = await addPhoto({ tripId: req.params.tripId as string, travelerId: me, authorName: req.user!.displayName, image: b.image, thumb: b.thumb, dayDate: String(b.dayDate || ""),
    takenAt: b.takenAt ?? null, caption: b.caption ?? null, shared: b.shared === true, width: b.width, height: b.height });
  if ("error" in r) { res.status(400).json(r); return; }
  if (b.shared === true) tellOthers(req, req.params.tripId as string);
  res.json(r);
});

// PATCH /:id — { shared?, caption? } (its taker only)
router.patch("/:id", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  const done = me ? await changePhoto(req.params.id as string, me, { shared: req.body?.shared, caption: req.body?.caption }) : null;
  if (!done) { res.status(404).json({ error: "Only the person who took it can change it." }); return; }
  if (done.others) tellOthers(req, done.tripId);
  res.json({ ok: true });
});

// DELETE /:id — gone for real (its taker only)
router.delete("/:id", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  const done = me ? await deletePhoto(req.params.id as string, me) : null;
  if (!done) { res.status(404).json({ error: "Only the person who took it can delete it." }); return; }
  if (done.others) tellOthers(req, done.tripId);
  res.json({ ok: true });
});

export default router;
