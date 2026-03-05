import { Router } from "express";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/trip/:tripId", async (req, res) => {
  const segments = await prisma.routeSegment.findMany({
    where: { tripId: req.params.tripId as string },
    orderBy: { sequenceOrder: "asc" },
    include: {
      experiences: { where: { state: "selected" }, orderBy: { priorityOrder: "asc" } },
    },
  });
  res.json(segments);
});

router.get("/:id", async (req, res) => {
  const segment = await prisma.routeSegment.findUnique({
    where: { id: req.params.id as string },
    include: { experiences: { orderBy: { priorityOrder: "asc" } } },
  });
  if (!segment) { res.status(404).json({ error: "Route segment not found" }); return; }
  res.json(segment);
});

router.post("/", async (req: AuthRequest, res) => {
  const { tripId, originCity, destinationCity, transportMode, departureDate, notes } = req.body;

  const maxSeg = await prisma.routeSegment.findFirst({
    where: { tripId },
    orderBy: { sequenceOrder: "desc" },
  });

  const segment = await prisma.routeSegment.create({
    data: {
      tripId,
      originCity,
      destinationCity,
      sequenceOrder: maxSeg ? maxSeg.sequenceOrder + 1 : 0,
      transportMode: transportMode || "other",
      departureDate: departureDate ? new Date(departureDate) : null,
      notes: notes || null,
    },
  });

  await logChange({
    user: req.user!,
    tripId,
    actionType: "route_segment_added",
    entityType: "routeSegment",
    entityId: segment.id,
    entityName: `${segment.originCity} → ${segment.destinationCity}`,
    description: `${req.user!.displayName} added route ${segment.originCity} → ${segment.destinationCity}`,
    newState: segment,
  });

  res.status(201).json(segment);
});

router.patch("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.routeSegment.findUnique({ where: { id: req.params.id as string } });
  if (!existing) { res.status(404).json({ error: "Route segment not found" }); return; }

  const { transportMode, departureDate, notes } = req.body;
  const segment = await prisma.routeSegment.update({
    where: { id: req.params.id as string },
    data: {
      ...(transportMode !== undefined && { transportMode }),
      ...(departureDate !== undefined && { departureDate: departureDate ? new Date(departureDate) : null }),
      ...(notes !== undefined && { notes }),
    },
  });

  await logChange({
    user: req.user!,
    tripId: segment.tripId,
    actionType: "route_segment_edited",
    entityType: "routeSegment",
    entityId: segment.id,
    entityName: `${segment.originCity} → ${segment.destinationCity}`,
    description: `${req.user!.displayName} updated route ${segment.originCity} → ${segment.destinationCity}`,
    previousState: existing,
    newState: segment,
  });

  res.json(segment);
});

router.delete("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.routeSegment.findUnique({ where: { id: req.params.id as string } });
  if (!existing) { res.status(404).json({ error: "Route segment not found" }); return; }

  await prisma.routeSegment.delete({ where: { id: req.params.id as string } });

  await logChange({
    user: req.user!,
    tripId: existing.tripId,
    actionType: "route_segment_deleted",
    entityType: "routeSegment",
    entityId: existing.id,
    entityName: `${existing.originCity} → ${existing.destinationCity}`,
    description: `${req.user!.displayName} removed route ${existing.originCity} → ${existing.destinationCity}`,
    previousState: existing,
  });

  res.json({ deleted: true });
});

export default router;
