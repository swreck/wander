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

  // Auto-create days if dates provided
  if (arrivalDate && departureDate) {
    const arrival = new Date(arrivalDate);
    const departure = new Date(departureDate);
    for (let d = new Date(arrival); d <= departure; d.setDate(d.getDate() + 1)) {
      await prisma.day.create({
        data: {
          tripId,
          cityId: city.id,
          date: new Date(d),
        },
      });
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

  const { name, country, arrivalDate, departureDate, sequenceOrder } = req.body;

  const city = await prisma.city.update({
    where: { id: req.params.id as string },
    data: {
      ...(name !== undefined && { name }),
      ...(country !== undefined && { country }),
      ...(sequenceOrder !== undefined && { sequenceOrder }),
      ...(arrivalDate !== undefined && { arrivalDate: arrivalDate ? new Date(arrivalDate) : null }),
      ...(departureDate !== undefined && { departureDate: departureDate ? new Date(departureDate) : null }),
    },
  });

  // If dates changed, sync days
  if (arrivalDate !== undefined || departureDate !== undefined) {
    // Delete existing days for this city
    await prisma.day.deleteMany({ where: { cityId: city.id } });

    // Recreate if both dates present
    const arrival = city.arrivalDate;
    const departure = city.departureDate;
    if (arrival && departure) {
      for (let d = new Date(arrival); d <= departure; d.setDate(d.getDate() + 1)) {
        await prisma.day.create({
          data: {
            tripId: city.tripId,
            cityId: city.id,
            date: new Date(d),
          },
        });
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
