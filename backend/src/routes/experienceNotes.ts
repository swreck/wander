import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Add a note to an experience
router.post("/", async (req: AuthRequest, res) => {
  const { experienceId, content } = req.body;

  if (!experienceId || !content?.trim()) {
    res.status(400).json({ error: "experienceId and content required" });
    return;
  }

  if (!req.user?.travelerId) {
    res.status(403).json({ error: "Traveler identity required" });
    return;
  }

  // Validate experience exists
  const experience = await prisma.experience.findUnique({ where: { id: experienceId } });
  if (!experience) {
    res.status(404).json({ error: "Experience not found" });
    return;
  }

  const note = await prisma.experienceNote.create({
    data: {
      experienceId,
      travelerId: req.user.travelerId,
      content: content.trim(),
    },
    include: { traveler: { select: { displayName: true } } },
  });

  res.status(201).json(note);
});

// Get notes for experiences in a city
router.get("/city/:cityId", async (req, res) => {
  const notes = await prisma.experienceNote.findMany({
    where: {
      experience: { cityId: req.params.cityId as string },
    },
    orderBy: { createdAt: "asc" },
    include: { traveler: { select: { displayName: true } } },
  });

  // Group by experienceId
  const grouped: Record<string, typeof notes> = {};
  for (const n of notes) {
    if (!grouped[n.experienceId]) grouped[n.experienceId] = [];
    grouped[n.experienceId].push(n);
  }

  res.json(grouped);
});

// Delete a note (only the author can)
router.delete("/:id", async (req: AuthRequest, res) => {
  const note = await prisma.experienceNote.findUnique({
    where: { id: req.params.id as string },
  });

  if (!note) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (note.travelerId !== req.user?.travelerId) {
    res.status(403).json({ error: "Not yours" });
    return;
  }

  await prisma.experienceNote.delete({ where: { id: req.params.id as string } });
  res.json({ deleted: true });
});

export default router;
