import { Router } from "express";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/trip/:tripId", async (req, res) => {
  const cities = await prisma.city.findMany({
    where: { tripId: req.params.tripId as string },
    orderBy: { sequenceOrder: "asc" },
    include: {
      _count: { select: { experiences: true, days: true } },
    },
  });
  res.json(cities);
});

router.get("/:id", async (req, res) => {
  const city = await prisma.city.findUnique({
    where: { id: req.params.id as string },
    include: {
      days: { orderBy: { date: "asc" } },
      experiences: { orderBy: { priorityOrder: "asc" } },
    },
  });
  if (!city) { res.status(404).json({ error: "City not found" }); return; }
  res.json(city);
});

// Add city to trip
router.post("/", async (req: AuthRequest, res) => {
  const { tripId, name, country, arrivalDate, departureDate, sequenceOrder } = req.body;

  // Default sequence order to end
  let order = sequenceOrder;
  if (order === undefined) {
    const maxCity = await prisma.city.findFirst({
      where: { tripId },
      orderBy: { sequenceOrder: "desc" },
    });
    order = maxCity ? maxCity.sequenceOrder + 1 : 0;
  }

  const city = await prisma.city.create({
    data: {
      tripId,
      name,
      country: country || null,
      sequenceOrder: order,
      arrivalDate: arrivalDate ? new Date(arrivalDate) : null,
      departureDate: departureDate ? new Date(departureDate) : null,
    },
  });

  // Auto-create days if dates provided — reassign existing days on overlapping dates
  if (arrivalDate && departureDate) {
    const arrival = new Date(arrivalDate);
    const departure = new Date(departureDate);
    for (let d = new Date(arrival); d <= departure; d.setDate(d.getDate() + 1)) {
      const dateStart = new Date(d);
      dateStart.setUTCHours(0, 0, 0, 0);
      const dateEnd = new Date(d);
      dateEnd.setUTCHours(23, 59, 59, 999);

      const existing = await prisma.day.findFirst({
        where: {
          tripId,
          date: { gte: dateStart, lte: dateEnd },
        },
      });

      if (existing) {
        // Reassign the existing day to this city
        const updateData: any = { cityId: city.id };
        if (existing.notes === "Unassigned — add city and activities") {
          updateData.notes = null;
        }
        await prisma.day.update({
          where: { id: existing.id },
          data: updateData,
        });
        // Update experiences on this day to match the new city
        await prisma.experience.updateMany({
          where: { dayId: existing.id },
          data: { cityId: city.id },
        });
      } else {
        await prisma.day.create({
          data: {
            tripId,
            cityId: city.id,
            date: new Date(d),
          },
        });
      }
    }
  }

  await logChange({
    user: req.user!,
    tripId,
    actionType: "city_added",
    entityType: "city",
    entityId: city.id,
    entityName: city.name,
    description: `${req.user!.displayName} added city "${city.name}"`,
    newState: city,
  });

  res.status(201).json(city);
});

// Update city
router.patch("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.city.findUnique({ where: { id: req.params.id as string } });
  if (!existing) { res.status(404).json({ error: "City not found" }); return; }

  const { name, tagline, country, arrivalDate, departureDate, sequenceOrder } = req.body;

  const city = await prisma.city.update({
    where: { id: req.params.id as string },
    data: {
      ...(name !== undefined && { name }),
      ...(tagline !== undefined && { tagline: tagline || null }),
      ...(country !== undefined && { country }),
      ...(sequenceOrder !== undefined && { sequenceOrder }),
      ...(arrivalDate !== undefined && { arrivalDate: arrivalDate ? new Date(arrivalDate) : null }),
      ...(departureDate !== undefined && { departureDate: departureDate ? new Date(departureDate) : null }),
    },
  });

  // If dates changed, sync days — preserve existing day data
  if (arrivalDate !== undefined || departureDate !== undefined) {
    const arrival = city.arrivalDate;
    const departure = city.departureDate;

    if (arrival && departure) {
      const arrivalStart = new Date(arrival);
      arrivalStart.setUTCHours(0, 0, 0, 0);
      const departureEnd = new Date(departure);
      departureEnd.setUTCHours(23, 59, 59, 999);

      // Remove days that fall OUTSIDE the new date range — demote their experiences first
      const orphanedDays = await prisma.day.findMany({
        where: {
          cityId: city.id,
          OR: [
            { date: { lt: arrivalStart } },
            { date: { gt: departureEnd } },
          ],
        },
        select: { id: true },
      });

      if (orphanedDays.length > 0) {
        const orphanedDayIds = orphanedDays.map((d) => d.id);
        // Demote experiences on removed days back to "possible"
        await prisma.experience.updateMany({
          where: { dayId: { in: orphanedDayIds }, state: "selected" },
          data: { state: "possible", dayId: null, timeWindow: null },
        });
        await prisma.day.deleteMany({
          where: { id: { in: orphanedDayIds } },
        });
      }

      // Ensure days exist for every date in the new range
      for (let d = new Date(arrival); d <= departure; d.setDate(d.getDate() + 1)) {
        const dateStart = new Date(d);
        dateStart.setUTCHours(0, 0, 0, 0);
        const dateEnd = new Date(d);
        dateEnd.setUTCHours(23, 59, 59, 999);

        // Check if this city already has a day on this date
        const ownDay = await prisma.day.findFirst({
          where: { cityId: city.id, date: { gte: dateStart, lte: dateEnd } },
        });
        if (ownDay) continue; // Already exists, keep it with all its data

        // Check if another city in the trip has a day on this date (placeholder)
        const otherDay = await prisma.day.findFirst({
          where: { tripId: city.tripId, date: { gte: dateStart, lte: dateEnd } },
        });

        if (otherDay) {
          // Reassign the existing day and clear placeholder notes
          const updateData: any = { cityId: city.id };
          if (otherDay.notes === "Unassigned — add city and activities") {
            updateData.notes = null;
          }
          await prisma.day.update({ where: { id: otherDay.id }, data: updateData });
          // Update experiences on this day to match the new city
          await prisma.experience.updateMany({
            where: { dayId: otherDay.id },
            data: { cityId: city.id },
          });
        } else {
          await prisma.day.create({
            data: { tripId: city.tripId, cityId: city.id, date: new Date(d) },
          });
        }
      }
    } else {
      // Dates cleared — demote experiences on this city's days, then remove them
      const cityDays = await prisma.day.findMany({
        where: { cityId: city.id },
        select: { id: true },
      });
      if (cityDays.length > 0) {
        await prisma.experience.updateMany({
          where: { dayId: { in: cityDays.map((d) => d.id) }, state: "selected" },
          data: { state: "possible", dayId: null, timeWindow: null },
        });
        await prisma.day.deleteMany({ where: { cityId: city.id } });
      }
    }
  }

  await logChange({
    user: req.user!,
    tripId: city.tripId,
    actionType: "city_edited",
    entityType: "city",
    entityId: city.id,
    entityName: city.name,
    description: `${req.user!.displayName} updated city "${city.name}"`,
    previousState: existing,
    newState: city,
  });

  res.json(city);
});

// Delete city
router.delete("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.city.findUnique({ where: { id: req.params.id as string } });
  if (!existing) { res.status(404).json({ error: "City not found" }); return; }

  // Find another city in the trip to reassign experiences to (if any)
  const otherCity = await prisma.city.findFirst({
    where: { tripId: existing.tripId, id: { not: existing.id } },
    orderBy: { sequenceOrder: "asc" },
  });

  if (otherCity) {
    // Demote selected experiences to possible and move them to the other city
    await prisma.experience.updateMany({
      where: { cityId: existing.id, state: "selected" },
      data: { state: "possible", dayId: null, timeWindow: null, routeSegmentId: null },
    });
    await prisma.experience.updateMany({
      where: { cityId: existing.id },
      data: { cityId: otherCity.id },
    });
  }
  // If no other city exists, cascade delete is the only option

  await prisma.city.delete({ where: { id: req.params.id as string } });

  await logChange({
    user: req.user!,
    tripId: existing.tripId,
    actionType: "city_deleted",
    entityType: "city",
    entityId: existing.id,
    entityName: existing.name,
    description: `${req.user!.displayName} removed city "${existing.name}"`,
    previousState: existing,
  });

  res.json({ deleted: true });
});

// Reorder cities
router.post("/reorder", async (req: AuthRequest, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    res.status(400).json({ error: "orderedIds array required" });
    return;
  }

  for (let i = 0; i < orderedIds.length; i++) {
    await prisma.city.update({
      where: { id: orderedIds[i] },
      data: { sequenceOrder: i },
    });
  }

  res.json({ reordered: true });
});

export default router;
