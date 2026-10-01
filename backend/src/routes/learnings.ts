import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getUserRole } from "../middleware/role.js";

const router = Router();
router.use(requireAuth);

// Changing or removing a learning: the people on its trip, or — tied to no trip — whoever wrote it (Oct 1 2026)
router.param("id", async (req: AuthRequest, res, next, id: string) => {
  const travelerId = req.user?.travelerId;
  if (!travelerId) { next(); return; }
  const learning = await prisma.learning.findUnique({ where: { id }, select: { tripId: true, travelerId: true } }).catch(() => null);
  if (!learning) { next(); return; }
  const allowed = learning.tripId ? !!(await getUserRole(travelerId, learning.tripId)) : learning.travelerId === travelerId;
  if (!allowed) { res.status(403).json({ error: "That isn't on one of your trips." }); return; }
  next();
});

// ── GET / ─────────────────────────────────────────────────────
// List learnings. Planner-only. Optionally filter by tripId.
router.get("/", async (req: AuthRequest, res) => {
  const { tripId } = req.query;

  // Check planner role on active trip
  if (req.user?.travelerId) {
    const activeTrip = await prisma.trip.findFirst({ where: { status: "active" } });
    if (activeTrip) {
      const role = await getUserRole(req.user.travelerId, activeTrip.id);
      if (role !== "planner") {
        res.status(403).json({ error: "Planner access required" });
        return;
      }
    }
  }

  // Only learnings from the caller's own trips, and ones tied to no trip (Oct 1 2026: every trip's were listed)
  const where: any = {};
  const mine = req.user?.travelerId
    ? (await prisma.tripMember.findMany({ where: { travelerId: req.user.travelerId }, select: { tripId: true } })).map((m) => m.tripId)
    : null;
  const tripIds = mine ? (tripId ? mine.filter((t) => t === tripId) : mine) : (tripId ? [tripId as string] : null);
  if (tripIds) where.OR = [{ tripId: { in: tripIds } }, { tripId: null }];

  const learnings = await prisma.learning.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { traveler: { select: { displayName: true } } },
  });

  res.json(learnings);
});

// ── POST / ────────────────────────────────────────────────────
// Create a learning
router.post("/", async (req: AuthRequest, res) => {
  const { content, scope, tripId, experienceId, source, visibility, locationTag } = req.body;

  if (!content?.trim()) {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  if (!req.user?.travelerId) {
    res.status(403).json({ error: "Traveler identity required" });
    return;
  }

  // Validate tripId if provided
  if (tripId) {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }
  }

  const learning = await prisma.learning.create({
    data: {
      travelerId: req.user.travelerId,
      content: content.trim(),
      scope: scope || "general",
      visibility: visibility || "group",
      locationTag: locationTag || null,
      tripId: tripId || null,
      experienceId: experienceId || null,
      source: source || "dedicated",
    },
    include: { traveler: { select: { displayName: true } } },
  });

  res.status(201).json(learning);
});

// ── PATCH /:id ────────────────────────────────────────────────
// Update a learning
router.patch("/:id", async (req: AuthRequest, res) => {
  const { content } = req.body;

  if (content !== undefined && !content?.trim()) {
    res.status(400).json({ error: "Content can't be empty" });
    return;
  }

  const learning = await prisma.learning.findUnique({
    where: { id: req.params.id as string },
  });

  if (!learning) {
    res.status(404).json({ error: "Learning not found" });
    return;
  }

  const updated = await prisma.learning.update({
    where: { id: req.params.id as string },
    data: { ...(content !== undefined && { content: content.trim() }) },
    include: { traveler: { select: { displayName: true } } },
  });

  res.json(updated);
});

// ── DELETE /:id ───────────────────────────────────────────────
router.delete("/:id", async (req: AuthRequest, res) => {
  const learning = await prisma.learning.findUnique({
    where: { id: req.params.id as string },
  });

  if (!learning) {
    res.status(404).json({ error: "Learning not found" });
    return;
  }

  await prisma.learning.delete({ where: { id: req.params.id as string } });
  res.json({ deleted: true });
});

export default router;
