import { Router } from "express";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/trip/:tripId", async (req, res) => {
  const reservations = await prisma.reservation.findMany({
    where: { tripId: req.params.tripId as string },
    orderBy: { datetime: "asc" },
    include: { day: true },
  });
  res.json(reservations);
});

router.post("/", async (req: AuthRequest, res) => {
  const { tripId, dayId, name, type, datetime, durationMinutes, latitude, longitude, confirmationNumber, notes, transportModeToHere } = req.body;

  const reservation = await prisma.reservation.create({
    data: {
      tripId, dayId, name, type,
      datetime: new Date(datetime),
      durationMinutes: durationMinutes || null,
      latitude: latitude || null,
      longitude: longitude || null,
      confirmationNumber: confirmationNumber || null,
      notes: notes || null,
      transportModeToHere: transportModeToHere || null,
    },
    include: { day: true },
  });

  await logChange({
    user: req.user!,
    tripId,
    actionType: "reservation_created",
    entityType: "reservation",
    entityId: reservation.id,
    entityName: reservation.name,
    description: `${req.user!.displayName} added reservation "${reservation.name}"`,
    newState: reservation,
  });

  res.status(201).json(reservation);
});

router.patch("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.reservation.findUnique({ where: { id: req.params.id as string } });
  if (!existing) { res.status(404).json({ error: "Reservation not found" }); return; }

  const data: any = { ...req.body };
  if (data.datetime) data.datetime = new Date(data.datetime);

  const reservation = await prisma.reservation.update({
    where: { id: req.params.id as string },
    data,
    include: { day: true },
  });

  await logChange({
    user: req.user!,
    tripId: reservation.tripId,
    actionType: "reservation_edited",
    entityType: "reservation",
    entityId: reservation.id,
    entityName: reservation.name,
    description: `${req.user!.displayName} updated reservation "${reservation.name}"`,
    previousState: existing,
    newState: reservation,
  });

  res.json(reservation);
});

router.delete("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.reservation.findUnique({ where: { id: req.params.id as string } });
  if (!existing) { res.status(404).json({ error: "Reservation not found" }); return; }

  await prisma.reservation.delete({ where: { id: req.params.id as string } });

  await logChange({
    user: req.user!,
    tripId: existing.tripId,
    actionType: "reservation_deleted",
    entityType: "reservation",
    entityId: existing.id,
    entityName: existing.name,
    description: `${req.user!.displayName} deleted reservation "${existing.name}"`,
    previousState: existing,
  });

  res.json({ deleted: true });
});

export default router;
