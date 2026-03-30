import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Toggle a reaction on an experience (add if not present, remove if already there)
router.post("/", async (req: AuthRequest, res) => {
  const { experienceId, emoji } = req.body;

  if (!experienceId || !emoji) {
    res.status(400).json({ error: "experienceId and emoji required" });
    return;
  }

  if (!req.user?.travelerId) {
    res.status(403).json({ error: "Traveler identity required" });
    return;
  }

  // Check if reaction already exists — if so, remove it (toggle)
  const existing = await prisma.experienceReaction.findUnique({
    where: {
      experienceId_travelerId_emoji: {
        experienceId,
        travelerId: req.user.travelerId,
        emoji,
      },
    },
  });

  if (existing) {
    await prisma.experienceReaction.delete({ where: { id: existing.id } });
    res.json({ toggled: "off", emoji });
    return;
  }

  const reaction = await prisma.experienceReaction.create({
    data: {
      experienceId,
      travelerId: req.user.travelerId,
      emoji,
    },
    include: { traveler: { select: { displayName: true } } },
  });

  res.status(201).json({ toggled: "on", ...reaction });
});

// Get reactions for experiences in a city
router.get("/city/:cityId", async (req, res) => {
  const reactions = await prisma.experienceReaction.findMany({
    where: {
      experience: { cityId: req.params.cityId as string },
    },
    include: { traveler: { select: { displayName: true } } },
  });

  // Group by experienceId
  const grouped: Record<string, { emoji: string; count: number; travelers: string[] }[]> = {};
  for (const r of reactions) {
    if (!grouped[r.experienceId]) grouped[r.experienceId] = [];
    const bucket = grouped[r.experienceId].find(b => b.emoji === r.emoji);
    if (bucket) {
      bucket.count++;
      bucket.travelers.push(r.traveler.displayName);
    } else {
      grouped[r.experienceId].push({
        emoji: r.emoji,
        count: 1,
        travelers: [r.traveler.displayName],
      });
    }
  }

  res.json(grouped);
});

export default router;
