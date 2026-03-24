import { Router } from "express";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/trip/:tripId", async (req, res) => {
  const accommodations = await prisma.accommodation.findMany({
    where: { tripId: req.params.tripId as string },
    include: { city: true, day: true },
  });
  res.json(accommodations);
});

router.post("/", async (req: AuthRequest, res) => {
  const { tripId, cityId, dayId, name, address, latitude, longitude, checkInTime, checkOutTime, confirmationNumber, notes } = req.body;

  if (!tripId) { res.status(400).json({ error: "tripId is required" }); return; }
  if (!cityId) { res.status(400).json({ error: "cityId is required" }); return; }
  if (!name?.trim()) { res.status(400).json({ error: "Accommodation name is required" }); return; }

  const acc = await prisma.accommodation.create({
    data: {
      tripId, cityId,
      dayId: dayId || null,
      name,
      address: address || null,
      latitude: latitude || null,
      longitude: longitude || null,
      checkInTime: checkInTime || null,
      checkOutTime: checkOutTime || null,
      confirmationNumber: confirmationNumber || null,
      notes: notes || null,
    },
    include: { city: true },
  });

  await logChange({
    user: req.user!,
    tripId,
    actionType: "accommodation_added",
    entityType: "accommodation",
    entityId: acc.id,
    entityName: acc.name,
    description: `${req.user!.displayName} added accommodation "${acc.name}" in ${acc.city.name}`,
    newState: acc,
  });

  res.status(201).json(acc);
});

router.patch("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.accommodation.findUnique({ where: { id: req.params.id as string } });
  if (!existing) { res.status(404).json({ error: "Accommodation not found" }); return; }

  const { name, address, latitude, longitude, checkInTime, checkOutTime, confirmationNumber, notes, dayId } = req.body;

  const acc = await prisma.accommodation.update({
    where: { id: req.params.id as string },
    data: {
      ...(name !== undefined && { name }),
      ...(address !== undefined && { address: address || null }),
      ...(latitude !== undefined && { latitude: latitude || null }),
      ...(longitude !== undefined && { longitude: longitude || null }),
      ...(checkInTime !== undefined && { checkInTime: checkInTime || null }),
      ...(checkOutTime !== undefined && { checkOutTime: checkOutTime || null }),
      ...(confirmationNumber !== undefined && { confirmationNumber: confirmationNumber || null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(dayId !== undefined && { dayId: dayId || null }),
    },
    include: { city: true },
  });

  await logChange({
    user: req.user!,
    tripId: acc.tripId,
    actionType: "accommodation_edited",
    entityType: "accommodation",
    entityId: acc.id,
    entityName: acc.name,
    description: `${req.user!.displayName} updated accommodation "${acc.name}"`,
    previousState: existing,
    newState: acc,
  });

  res.json(acc);
});

router.delete("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.accommodation.findUnique({ where: { id: req.params.id as string } });
  if (!existing) { res.status(404).json({ error: "Accommodation not found" }); return; }

  await prisma.accommodation.delete({ where: { id: req.params.id as string } });

  await logChange({
    user: req.user!,
    tripId: existing.tripId,
    actionType: "accommodation_deleted",
    entityType: "accommodation",
    entityId: existing.id,
    entityName: existing.name,
    description: `${req.user!.displayName} deleted accommodation "${existing.name}"`,
    previousState: existing,
  });

  res.json({ deleted: true });
});

export default router;
