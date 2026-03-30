import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Create a personal item (private reminder on a day)
router.post("/", async (req: AuthRequest, res) => {
  const { dayId, content, timeWindow } = req.body;

  if (!content?.trim()) {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  if (!req.user?.travelerId) {
    res.status(403).json({ error: "Traveler identity required" });
    return;
  }

  const day = await prisma.day.findUnique({ where: { id: dayId } });
  if (!day) {
    res.status(404).json({ error: "Day not found" });
    return;
  }

  const item = await prisma.personalItem.create({
    data: {
      dayId,
      travelerId: req.user.travelerId,
      content: content.trim(),
      timeWindow: timeWindow || null,
    },
  });

  res.status(201).json(item);
});

// Update a personal item
router.patch("/:id", async (req: AuthRequest, res) => {
  const item = await prisma.personalItem.findUnique({
    where: { id: req.params.id as string },
  });

  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (item.travelerId !== req.user?.travelerId) {
    res.status(403).json({ error: "Not yours" });
    return;
  }

  const { content, timeWindow } = req.body;
  const updated = await prisma.personalItem.update({
    where: { id: req.params.id as string },
    data: {
      ...(content !== undefined && { content: content.trim() }),
      ...(timeWindow !== undefined && { timeWindow: timeWindow || null }),
    },
  });

  res.json(updated);
});

// Delete a personal item
router.delete("/:id", async (req: AuthRequest, res) => {
  const item = await prisma.personalItem.findUnique({
    where: { id: req.params.id as string },
  });

  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (item.travelerId !== req.user?.travelerId) {
    res.status(403).json({ error: "Not yours" });
    return;
  }

  await prisma.personalItem.delete({ where: { id: req.params.id as string } });
  res.json({ deleted: true });
});

export default router;
