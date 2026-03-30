import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getUserRole } from "../middleware/role.js";

const router = Router();
router.use(requireAuth);

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

  const where: any = {};
  if (tripId) {
    where.OR = [{ tripId: tripId as string }, { tripId: null }];
  }

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
