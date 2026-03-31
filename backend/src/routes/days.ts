import { Router } from "express";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { syncTripDates } from "../services/syncTripDates.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const days = await prisma.day.findMany({
    where: { tripId: req.params.tripId as string },
    orderBy: { date: "asc" },
    include: {
      city: true,
      experiences: { orderBy: { priorityOrder: "asc" }, include: { ratings: true } },
      reservations: { orderBy: { datetime: "asc" } },
      accommodations: true,
      personalItems: req.user?.travelerId
        ? { where: { travelerId: req.user.travelerId } }
        : false,
    },
  });
  res.json(days);
});

router.get("/:id", async (req: AuthRequest, res) => {
  const day = await prisma.day.findUnique({
    where: { id: req.params.id as string },
    include: {
      city: true,
      experiences: { orderBy: { priorityOrder: "asc" }, include: { ratings: true } },
      reservations: { orderBy: { datetime: "asc" } },
      accommodations: true,
      personalItems: req.user?.travelerId
        ? { where: { travelerId: req.user.travelerId } }
        : false,
    },
  });
  if (!day) { res.status(404).json({ error: "Day not found" }); return; }
  res.json(day);
});

router.patch("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.day.findUnique({ where: { id: req.params.id as string } });
  if (!existing) { res.status(404).json({ error: "Day not found" }); return; }

  const { explorationZone, notes, cityId, date } = req.body;

  // Validate cityId if being changed — must exist and belong to the same trip
  if (cityId !== undefined) {
    const cityCheck = await prisma.city.findUnique({ where: { id: cityId } });
    if (!cityCheck || cityCheck.tripId !== existing.tripId) {
      res.status(404).json({ error: "City not found on this trip" });
      return;
    }
  }

  // Validate date if being changed
  if (date !== undefined) {
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      res.status(400).json({ error: "Invalid date format" });
      return;
    }
  }

  const day = await prisma.day.update({
    where: { id: req.params.id as string },
    data: {
      ...(explorationZone !== undefined && { explorationZone }),
      ...(notes !== undefined && { notes }),
      ...(cityId !== undefined && { cityId }),
      ...(date !== undefined && { date: new Date(date) }),
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

  if (date !== undefined) {
    await syncTripDates(day.tripId);
  }

  await logChange({
    user: req.user!,
    tripId: day.tripId,
    actionType: date !== undefined ? "day_date_changed" : "day_note_edited",
    entityType: "day",
    entityId: day.id,
    entityName: `Day ${day.date.toISOString().slice(0, 10)}`,
    description: `${req.user!.displayName} updated ${existing.date.toISOString().slice(0, 10)}${date !== undefined ? ` → ${day.date.toISOString().slice(0, 10)}` : ""}`,
    previousState: existing,
    newState: day,
  });

  res.json(day);
});

// Create a new day
router.post("/", async (req: AuthRequest, res) => {
  const { tripId, cityId, date, notes } = req.body;

  if (!tripId) { res.status(400).json({ error: "tripId is required" }); return; }
  if (!cityId) { res.status(400).json({ error: "cityId is required" }); return; }
  if (!date) { res.status(400).json({ error: "date is required" }); return; }

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    res.status(400).json({ error: "Invalid date format" });
    return;
  }

  // Verify trip exists
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  // Verify city exists and belongs to this trip
  const city = await prisma.city.findUnique({ where: { id: cityId } });
  if (!city || city.tripId !== tripId) {
    res.status(404).json({ error: "City not found on this trip" });
    return;
  }

  const day = await prisma.day.create({
    data: {
      tripId,
      cityId,
      date: parsedDate,
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

  // Demote selected experiences and delete day atomically
  await prisma.$transaction([
    prisma.experience.updateMany({
      where: { dayId: req.params.id as string, state: "selected" },
      data: { state: "possible", dayId: null, timeWindow: null },
    }),
    prisma.day.delete({ where: { id: req.params.id as string } }),
  ]);

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

// Bulk shift all days (and city dates) by N days
router.post("/shift", async (req: AuthRequest, res) => {
  const { tripId, offsetDays } = req.body;

  if (!tripId || typeof offsetDays !== "number" || offsetDays === 0) {
    res.status(400).json({ error: "tripId and non-zero offsetDays required" });
    return;
  }

  const ms = offsetDays * 86400000;

  // Shift all days
  const days = await prisma.day.findMany({ where: { tripId } });
  for (const day of days) {
    await prisma.day.update({
      where: { id: day.id },
      data: { date: new Date(day.date.getTime() + ms) },
    });
  }

  // Shift all city arrival/departure dates
  const cities = await prisma.city.findMany({ where: { tripId } });
  for (const city of cities) {
    const data: any = {};
    if (city.arrivalDate) data.arrivalDate = new Date(city.arrivalDate.getTime() + ms);
    if (city.departureDate) data.departureDate = new Date(city.departureDate.getTime() + ms);
    if (Object.keys(data).length > 0) {
      await prisma.city.update({ where: { id: city.id }, data });
    }
  }

  // Shift route segment departure dates
  const segments = await prisma.routeSegment.findMany({ where: { tripId } });
  for (const seg of segments) {
    if (seg.departureDate) {
      await prisma.routeSegment.update({
        where: { id: seg.id },
        data: { departureDate: new Date(seg.departureDate.getTime() + ms) },
      });
    }
  }

  // Shift reservation datetimes
  const reservations = await prisma.reservation.findMany({ where: { tripId } });
  for (const r of reservations) {
    await prisma.reservation.update({
      where: { id: r.id },
      data: { datetime: new Date(r.datetime.getTime() + ms) },
    });
  }

  await syncTripDates(tripId);

  const direction = offsetDays > 0 ? "forward" : "back";
  const absOffset = Math.abs(offsetDays);
  await logChange({
    user: req.user!,
    tripId,
    actionType: "trip_dates_shifted",
    entityType: "trip",
    entityId: tripId,
    entityName: "Trip dates",
    description: `${req.user!.displayName} shifted all dates ${absOffset} day${absOffset !== 1 ? "s" : ""} ${direction}`,
  });

  res.json({ shifted: days.length, offsetDays });
});

export default router;
