import { Router } from "express";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { syncTripDates } from "../services/syncTripDates.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/trip/:tripId", async (req, res) => {
  const days = await prisma.day.findMany({
    where: { tripId: req.params.tripId as string },
    orderBy: { date: "asc" },
    include: {
      city: true,
      experiences: { orderBy: { priorityOrder: "asc" }, include: { ratings: true } },
      reservations: { orderBy: { datetime: "asc" } },
      accommodations: true,
    },
  });
  res.json(days);
});

router.get("/:id", async (req, res) => {
  const day = await prisma.day.findUnique({
    where: { id: req.params.id as string },
    include: {
      city: true,
      experiences: { orderBy: { priorityOrder: "asc" }, include: { ratings: true } },
      reservations: { orderBy: { datetime: "asc" } },
      accommodations: true,
    },
  });
  if (!day) { res.status(404).json({ error: "Day not found" }); return; }
  res.json(day);
});

router.patch("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.day.findUnique({ where: { id: req.params.id as string } });
  if (!existing) { res.status(404).json({ error: "Day not found" }); return; }

  const { explorationZone, notes, cityId } = req.body;
  const day = await prisma.day.update({
    where: { id: req.params.id as string },
    data: {
      ...(explorationZone !== undefined && { explorationZone }),
      ...(notes !== undefined && { notes }),
      ...(cityId !== undefined && { cityId }),
    },
    include: { city: true },
  });

  // When a day is reassigned to a different city, move its experiences too
  if (cityId !== undefined && cityId !== existing.cityId) {
    await prisma.experience.updateMany({
      where: { dayId: day.id },
      data: { cityId },
    });
  }

  await logChange({
    user: req.user!,
    tripId: day.tripId,
    actionType: "day_note_edited",
    entityType: "day",
    entityId: day.id,
    entityName: `Day ${day.date.toISOString().slice(0, 10)}`,
    description: `${req.user!.displayName} updated ${day.date.toISOString().slice(0, 10)}`,
    previousState: existing,
    newState: day,
  });

  res.json(day);
});

// Create a new day
router.post("/", async (req: AuthRequest, res) => {
  const { tripId, cityId, date, notes } = req.body;

  const day = await prisma.day.create({
    data: {
      tripId,
      cityId,
      date: new Date(date),
      notes: notes || null,
    },
    include: { city: true },
  });

  await syncTripDates(tripId);

  await logChange({
    user: req.user!,
    tripId,
    actionType: "day_created",
    entityType: "day",
    entityId: day.id,
    entityName: `Day ${day.date.toISOString().slice(0, 10)}`,
    description: `${req.user!.displayName} added day ${day.date.toISOString().slice(0, 10)}`,
    newState: day,
  });

  res.status(201).json(day);
});

// Delete a day
router.delete("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.day.findUnique({ where: { id: req.params.id as string } });
  if (!existing) { res.status(404).json({ error: "Day not found" }); return; }

  // Demote selected experiences on this day back to "possible" before deleting
  await prisma.experience.updateMany({
    where: { dayId: req.params.id as string, state: "selected" },
    data: { state: "possible", dayId: null, timeWindow: null },
  });

  await prisma.day.delete({ where: { id: req.params.id as string } });

  await syncTripDates(existing.tripId);

  await logChange({
    user: req.user!,
    tripId: existing.tripId,
    actionType: "day_deleted",
    entityType: "day",
    entityId: existing.id,
    entityName: `Day ${existing.date.toISOString().slice(0, 10)}`,
    description: `${req.user!.displayName} removed day ${existing.date.toISOString().slice(0, 10)}`,
    previousState: existing,
  });

  res.json({ deleted: true });
});

export default router;
