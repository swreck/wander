// "Ideas for Wander" (services/wanderIdeas.ts): its members only — Ken and Andy. Everyone else gets 403, and their
// phones show nothing of it.
import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { tripMemberParam } from "../middleware/role.js";
import { isMember, listIdeas, postIdea, setStatus, unseenCount, markSeen } from "../services/wanderIdeas.js";

const router = Router();
router.use(requireAuth);
router.param("tripId", tripMemberParam);

const NOT_IN = { error: "Ideas for Wander is for its members." };

// GET /trip/:tripId — the ideas with their replies (403: not a member)
router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string, me = req.user?.travelerId;
  if (!me || !(await isMember(tripId, me))) { res.status(403).json(NOT_IN); return; }
  // (when this member last looked, so the page can mark what's new since — verify62: "1 new" on Home, nothing marked)
  const m = await prisma.wanderIdeaMember.findUnique({ where: { tripId_travelerId: { tripId, travelerId: me } }, select: { seenAt: true } });
  res.json({ ideas: await listIdeas(tripId, me), seenAt: m?.seenAt?.toISOString() ?? null });
});

// GET /trip/:tripId/unseen — for the dot beside "Ideas" on Home ({ member: false } for everyone else)
router.get("/trip/:tripId/unseen", async (req: AuthRequest, res) => {
  const n = req.user?.travelerId ? await unseenCount(req.params.tripId as string, req.user.travelerId) : null;
  res.json(n === null ? { member: false } : { member: true, unseen: n });
});

router.post("/trip/:tripId/seen", async (req: AuthRequest, res) => {
  if (req.user?.travelerId) await markSeen(req.params.tripId as string, req.user.travelerId);
  res.json({ ok: true });
});

// POST /trip/:tripId — { words, screen?, parentId?, pictures?: [{ mediaType, data }] }
router.post("/trip/:tripId", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  if (!me) { res.status(403).json(NOT_IN); return; }
  const b = (req.body || {}) as Record<string, unknown>;
  const r = await postIdea({ tripId: req.params.tripId as string, travelerId: me, authorName: req.user!.displayName,
    words: typeof b.words === "string" ? b.words : "", screen: typeof b.screen === "string" ? b.screen.slice(0, 60) : null,
    parentId: typeof b.parentId === "string" ? b.parentId : null, pictures: Array.isArray(b.pictures) ? (b.pictures as any[]) : [] });
  if ("error" in r) { res.status(/members/.test(r.error) ? 403 : 400).json(r); return; }
  res.json(r);
});

// POST /trip/:tripId/:id/status — { status }
router.post("/trip/:tripId/:id/status", async (req: AuthRequest, res) => {
  const ok = req.user?.travelerId ? await setStatus(req.params.tripId as string, req.user.travelerId, req.params.id as string, String((req.body || {}).status || "")) : false;
  if (!ok) { res.status(400).json({ error: "That status couldn't be set." }); return; }
  res.json({ ok: true });
});

// GET /picture/:id — a member of that idea's trip only
router.get("/picture/:id", async (req: AuthRequest, res) => {
  const p = await prisma.wanderIdeaPicture.findUnique({ where: { id: req.params.id as string }, include: { idea: { select: { tripId: true } } } }).catch(() => null);
  if (!p || !(await isMember(p.idea.tripId, req.user?.travelerId))) { res.status(404).end(); return; }
  res.type(p.imageType).set("Cache-Control", "private, max-age=86400").send(Buffer.from(p.image));
});

export default router;
