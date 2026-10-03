/**
 * Maybes (Ken, Oct 2 2026): "a shared list of maybes — people traveling together say 'maybe we should do X'… just
 * enough information for someone else, maybe a link, and others can add comments or just indicate interest." The test
 * is whether it's light enough for "tea or ice cream?". The rules live in services/maybes.ts (Scout uses them too).
 *
 *  POST /maybes                { tripId, cityId, words, link? } — one sentence; a link in the words is taken out
 *  POST /maybes/:id/in         { on, forName? } — "I'm in" on a maybe or one of her ideas ("Julie's in too": forName)
 *  DELETE /maybes/:id          — take back your own maybe (never one of her ideas, never someone else's)
 *  POST /maybes/seen           { tripId, cityId } — you've looked at that city's list now
 *  GET  /maybes/seen/:tripId   — when each person on the trip last looked at each city ("Seen by", the new dot)
 *  GET  /maybes/recent/:tripId — the last two weeks' maybes and group notes, for the new dot and Home's line
 */
import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getUserRole, tripMemberParam, itemMemberParam } from "../middleware/role.js";
import { tripOf } from "../middleware/tripGuard.js";
import { createMaybe, setIn, takeBackMaybe, MaybeError } from "../services/maybes.js";

const router = Router();
router.use(requireAuth);
router.param("tripId", tripMemberParam);
router.param("id", itemMemberParam(tripOf.experience));

const onTrip = async (req: AuthRequest, tripId: string) =>
  req.user?.travelerId ? !!(await getUserRole(req.user.travelerId, tripId)) : false;
const fail = (res: any, e: unknown) => {
  if (e instanceof MaybeError) { res.status(e.status).json({ error: e.message }); return; }
  throw e;
};

// ── Add a maybe ──
router.post("/", async (req: AuthRequest, res) => {
  const { tripId, cityId, words, link } = req.body || {};
  if (!req.user?.travelerId) { res.status(403).json({ error: "Traveler identity required" }); return; }
  if (!tripId || !(await onTrip(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  try {
    const { maybe, again } = await createMaybe(req.user, tripId, cityId, String(words ?? ""), link);
    res.status(again ? 200 : 201).json(maybe);
  } catch (e) { fail(res, e); }
});

// ── I'm in (or not); "Julie's in too", said by her partner ──
router.post("/:id/in", async (req: AuthRequest, res) => {
  try {
    const r = await setIn(req.user!, req.params.id as string, req.body?.on !== false, req.body?.forName);
    res.json({ on: r.on, interests: r.interests });
  } catch (e) { fail(res, e); }
});

// ── Take back your own maybe ──
router.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const r = await takeBackMaybe(req.user!, req.params.id as string);
    res.json({ deleted: true, name: r.name });
  } catch (e) { fail(res, e); }
});

// ── Looked at a city's list ──
router.post("/seen", async (req: AuthRequest, res) => {
  const { tripId, cityId } = req.body || {};
  if (!req.user?.travelerId || !tripId || !cityId) { res.status(400).json({ error: "tripId and cityId required" }); return; }
  if (!(await onTrip(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const t = await prisma.traveler.findUnique({ where: { id: req.user.travelerId }, select: { preferences: true } });
  const prefs = ((t?.preferences as Record<string, any>) || {});
  const seen = { ...(prefs.maybesSeen || {}) };
  seen[tripId] = { ...(seen[tripId] || {}), [cityId]: new Date().toISOString() };
  await prisma.traveler.update({ where: { id: req.user.travelerId }, data: { preferences: { ...prefs, maybesSeen: seen } } });
  res.json({ seen: seen[tripId] });
});

router.get("/seen/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  const members = await prisma.tripMember.findMany({ where: { tripId }, include: { traveler: { select: { id: true, displayName: true, preferences: true } } } });
  res.json(members.map((m) => ({
    name: m.traveler.displayName,
    me: m.traveler.id === req.user?.travelerId,
    seen: (((m.traveler.preferences as Record<string, any>) || {}).maybesSeen || {})[tripId] || {},
  })));
});

// ── What's new: the last two weeks' maybes and group notes ──
router.get("/recent/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  const since = new Date(Date.now() - 14 * 86400_000);
  const [maybes, notes] = await Promise.all([
    prisma.experience.findMany({
      where: { tripId, sheetRowRef: null, createdAt: { gte: since } },
      select: { id: true, cityId: true, name: true, createdBy: true, createdAt: true, city: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.experienceNote.findMany({
      where: { visibility: "group", createdAt: { gte: since }, experience: { tripId } },
      select: { id: true, experienceId: true, createdAt: true, traveler: { select: { displayName: true } }, experience: { select: { cityId: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  res.json({
    maybes: maybes.map((m) => ({ id: m.id, cityId: m.cityId, city: m.city.name, words: m.name, by: m.createdBy, at: m.createdAt })),
    notes: notes.map((n) => ({ id: n.id, experienceId: n.experienceId, cityId: n.experience.cityId, about: n.experience.name, by: n.traveler.displayName, at: n.createdAt })),
  });
});

export default router;
