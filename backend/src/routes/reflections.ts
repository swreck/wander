/**
 * Reflections — End-of-day memories captured during the trip.
 *
 * Each person can save one reflection per day: highlights, a note, and photos.
 */

import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Save or update a reflection for a day
router.post("/", async (req: AuthRequest, res) => {
  const { dayId, highlights, note, mediaUrls } = req.body;

  if (!dayId) {
    res.status(400).json({ error: "dayId required" });
    return;
  }

  if (!req.user?.travelerId) {
    res.status(403).json({ error: "Traveler identity required" });
    return;
  }

  // Validate day exists
  const day = await prisma.day.findUnique({ where: { id: dayId } });
  if (!day) {
    res.status(404).json({ error: "Day not found" });
    return;
  }

  const reflection = await prisma.reflection.upsert({
    where: {
      dayId_travelerId: {
        dayId,
        travelerId: req.user.travelerId,
      },
    },
    create: {
      dayId,
      travelerId: req.user.travelerId,
      highlights: highlights || [],
      note: note || null,
      mediaUrls: mediaUrls || [],
    },
    update: {
      highlights: highlights || [],
      note: note || null,
      mediaUrls: mediaUrls || [],
    },
    include: { traveler: { select: { displayName: true } } },
  });

  res.json(reflection);
});

// Get reflections for a trip
router.get("/trip/:tripId", async (req, res) => {
  const tripId = req.params.tripId as string;

  const reflections = await prisma.reflection.findMany({
    where: { day: { tripId } },
    orderBy: { day: { date: "asc" } },
    include: {
      traveler: { select: { displayName: true } },
      day: { select: { id: true, date: true, cityId: true, city: { select: { name: true } } } },
    },
  });

  res.json(reflections);
});

// Get reflection for a specific day (current user)
router.get("/day/:dayId", async (req: AuthRequest, res) => {
  if (!req.user?.travelerId) {
    res.json(null);
    return;
  }

  const reflection = await prisma.reflection.findUnique({
    where: {
      dayId_travelerId: {
        dayId: req.params.dayId as string,
        travelerId: req.user.travelerId,
      },
    },
  });

  res.json(reflection);
});

// Delete a reflection
router.delete("/:id", async (req: AuthRequest, res) => {
  const reflection = await prisma.reflection.findUnique({
    where: { id: req.params.id as string },
  });

  if (!reflection) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (reflection.travelerId !== req.user?.travelerId) {
    res.status(403).json({ error: "Not yours" });
    return;
  }

  await prisma.reflection.delete({ where: { id: req.params.id as string } });
  res.json({ deleted: true });
});

export default router;
