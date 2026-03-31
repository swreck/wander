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
  const { tripId, originCity, destinationCity, transportMode, departureDate, notes,
          confirmationNumber, serviceNumber, departureTime, arrivalTime,
          departureStation, arrivalStation, seatInfo } = req.body;

  if (!tripId) { res.status(400).json({ error: "tripId is required" }); return; }
  if (!originCity?.trim()) { res.status(400).json({ error: "Origin city is required" }); return; }
  if (!destinationCity?.trim()) { res.status(400).json({ error: "Destination city is required" }); return; }

  const VALID_TRANSPORT_MODES = ["flight", "train", "ferry", "drive", "other"];
  if (transportMode && !VALID_TRANSPORT_MODES.includes(transportMode)) {
    res.status(400).json({ error: `Invalid transport mode: ${transportMode}. Valid: ${VALID_TRANSPORT_MODES.join(", ")}` });
    return;
  }

  // Validate departureDate if provided
  if (departureDate) {
    const d = new Date(departureDate);
    if (isNaN(d.getTime())) {
      res.status(400).json({ error: "Invalid departure date format" });
      return;
    }
  }

  // Verify trip exists
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

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
      confirmationNumber: confirmationNumber || null,
      serviceNumber: serviceNumber || null,
      departureTime: departureTime || null,
      arrivalTime: arrivalTime || null,
      departureStation: departureStation || null,
      arrivalStation: arrivalStation || null,
      seatInfo: seatInfo || null,
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

  const { transportMode, departureDate, notes,
          confirmationNumber, serviceNumber, departureTime, arrivalTime,
          departureStation, arrivalStation, seatInfo } = req.body;

  const VALID_TRANSPORT_MODES = ["flight", "train", "ferry", "drive", "other"];
  if (transportMode !== undefined && !VALID_TRANSPORT_MODES.includes(transportMode)) {
    res.status(400).json({ error: `Invalid transport mode: ${transportMode}. Valid: ${VALID_TRANSPORT_MODES.join(", ")}` });
    return;
  }

  // Validate departureDate if provided
  if (departureDate !== undefined && departureDate !== null) {
    const d = new Date(departureDate);
    if (isNaN(d.getTime())) {
      res.status(400).json({ error: "Invalid departure date format" });
      return;
    }
  }

  const segment = await prisma.routeSegment.update({
    where: { id: req.params.id as string },
    data: {
      ...(transportMode !== undefined && { transportMode }),
      ...(departureDate !== undefined && { departureDate: departureDate ? new Date(departureDate) : null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(confirmationNumber !== undefined && { confirmationNumber: confirmationNumber || null }),
      ...(serviceNumber !== undefined && { serviceNumber: serviceNumber || null }),
      ...(departureTime !== undefined && { departureTime: departureTime || null }),
      ...(arrivalTime !== undefined && { arrivalTime: arrivalTime || null }),
      ...(departureStation !== undefined && { departureStation: departureStation || null }),
      ...(arrivalStation !== undefined && { arrivalStation: arrivalStation || null }),
      ...(seatInfo !== undefined && { seatInfo: seatInfo || null }),
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

  // Demote selected experiences on this segment back to "possible" before deleting
  await prisma.experience.updateMany({
    where: { routeSegmentId: req.params.id as string, state: "selected" },
    data: { state: "possible", routeSegmentId: null, timeWindow: null },
  });

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
