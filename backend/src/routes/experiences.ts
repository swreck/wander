import { Router } from "express";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// List experiences for a trip (optionally filter by city, state, day)
router.get("/trip/:tripId", async (req, res) => {
  const { cityId, state, dayId } = req.query as Record<string, string | undefined>;
  const where: any = { tripId: req.params.tripId as string };
  if (cityId) where.cityId = cityId;
  if (state) where.state = state;
  if (dayId) where.dayId = dayId;

  const experiences = await prisma.experience.findMany({
    where,
    orderBy: { priorityOrder: "asc" },
    include: { ratings: true, city: true, day: true },
  });
  res.json(experiences);
});

// Get single experience
router.get("/:id", async (req, res) => {
  const exp = await prisma.experience.findUnique({
    where: { id: req.params.id as string },
    include: { ratings: true, city: true, day: true, routeSegment: true },
  });
  if (!exp) { res.status(404).json({ error: "Experience not found" }); return; }
  res.json(exp);
});

// Create experience (capture)
router.post("/", async (req: AuthRequest, res) => {
  const { tripId, cityId, name, description, sourceUrl, sourceText, themes, userNotes,
    latitude, longitude, locationStatus, placeIdGoogle } = req.body;

  const exp = await prisma.experience.create({
    data: {
      tripId,
      cityId,
      name,
      description: description || null,
      sourceUrl: sourceUrl || null,
      sourceText: sourceText || null,
      themes: themes || [],
      userNotes: userNotes || null,
      createdBy: req.user!.code,
      state: "possible",
      locationStatus: latitude && longitude && locationStatus === "confirmed" ? "confirmed" : "unlocated",
      ...(latitude != null && { latitude }),
      ...(longitude != null && { longitude }),
      ...(placeIdGoogle && { placeIdGoogle }),
    },
    include: { ratings: true, city: true },
  });

  await logChange({
    user: req.user!,
    tripId,
    actionType: "experience_created",
    entityType: "experience",
    entityId: exp.id,
    entityName: exp.name,
    description: `${req.user!.displayName} added "${exp.name}" to ${exp.city.name}`,
    newState: exp,
  });

  res.status(201).json(exp);
});

// Update experience
router.patch("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.experience.findUnique({
    where: { id: req.params.id as string },
    include: { city: true },
  });
  if (!existing) { res.status(404).json({ error: "Experience not found" }); return; }

  const { name, description, themes, userNotes, latitude, longitude, locationStatus, placeIdGoogle, cloudinaryImageId, priorityOrder, cityId, state, dayId, timeWindow, transportModeToHere } = req.body;

  const exp = await prisma.experience.update({
    where: { id: req.params.id as string },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(themes !== undefined && { themes }),
      ...(userNotes !== undefined && { userNotes }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(locationStatus !== undefined && { locationStatus }),
      ...(placeIdGoogle !== undefined && { placeIdGoogle }),
      ...(cloudinaryImageId !== undefined && { cloudinaryImageId }),
      ...(priorityOrder !== undefined && { priorityOrder }),
      ...(cityId !== undefined && { cityId }),
      ...(state !== undefined && { state }),
      ...(dayId !== undefined && { dayId: dayId || null }),
      ...(timeWindow !== undefined && { timeWindow: timeWindow || null }),
      ...(transportModeToHere !== undefined && { transportModeToHere: transportModeToHere || null }),
      lastEditedBy: req.user!.code,
    },
    include: { ratings: true, city: true, day: true },
  });

  await logChange({
    user: req.user!,
    tripId: existing.tripId,
    actionType: "experience_edited",
    entityType: "experience",
    entityId: exp.id,
    entityName: exp.name,
    description: `${req.user!.displayName} edited "${exp.name}"`,
    previousState: existing,
    newState: exp,
  });

  res.json(exp);
});

// Promote to selected
router.post("/:id/promote", async (req: AuthRequest, res) => {
  const existing = await prisma.experience.findUnique({
    where: { id: req.params.id as string },
    include: { city: true },
  });
  if (!existing) { res.status(404).json({ error: "Experience not found" }); return; }

  const { dayId, routeSegmentId, timeWindow, transportModeToHere } = req.body;
  if (!dayId && !routeSegmentId) {
    res.status(400).json({ error: "Either dayId or routeSegmentId is required" });
    return;
  }

  const exp = await prisma.experience.update({
    where: { id: req.params.id as string },
    data: {
      state: "selected",
      dayId: dayId || null,
      routeSegmentId: routeSegmentId || null,
      timeWindow: timeWindow || null,
      transportModeToHere: transportModeToHere || null,
    },
  });

  const full = await prisma.experience.findUniqueOrThrow({
    where: { id: exp.id },
    include: { ratings: true, city: true, day: true, routeSegment: true },
  });

  const target = full.day
    ? `Day ${full.day.date.toISOString().slice(0, 10)}`
    : `route ${full.routeSegment?.originCity} to ${full.routeSegment?.destinationCity}`;

  await logChange({
    user: req.user!,
    tripId: existing.tripId,
    actionType: "experience_promoted",
    entityType: "experience",
    entityId: exp.id,
    entityName: full.name,
    description: `${req.user!.displayName} promoted "${full.name}" to ${target}`,
    previousState: existing,
    newState: full,
  });

  res.json(full);
});

// Demote to possible
router.post("/:id/demote", async (req: AuthRequest, res) => {
  const existing = await prisma.experience.findUnique({
    where: { id: req.params.id as string },
    include: { city: true, day: true },
  });
  if (!existing) { res.status(404).json({ error: "Experience not found" }); return; }

  const exp = await prisma.experience.update({
    where: { id: req.params.id as string },
    data: {
      state: "possible",
      dayId: null,
      routeSegmentId: null,
      timeWindow: null,
      transportModeToHere: null,
    },
    include: { ratings: true, city: true },
  });

  await logChange({
    user: req.user!,
    tripId: existing.tripId,
    actionType: "experience_demoted",
    entityType: "experience",
    entityId: exp.id,
    entityName: exp.name,
    description: `${req.user!.displayName} moved "${exp.name}" back to candidates`,
    previousState: existing,
    newState: exp,
  });

  res.json(exp);
});

// Delete experience
router.delete("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.experience.findUnique({
    where: { id: req.params.id as string },
    include: { city: true },
  });
  if (!existing) { res.status(404).json({ error: "Experience not found" }); return; }

  await prisma.experience.delete({ where: { id: req.params.id as string } });

  await logChange({
    user: req.user!,
    tripId: existing.tripId,
    actionType: "experience_deleted",
    entityType: "experience",
    entityId: existing.id,
    entityName: existing.name,
    description: `${req.user!.displayName} deleted "${existing.name}"`,
    previousState: existing,
  });

  res.json({ deleted: true });
});

// Reorder experiences
router.post("/reorder", async (req: AuthRequest, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    res.status(400).json({ error: "orderedIds array required" });
    return;
  }

  for (let i = 0; i < orderedIds.length; i++) {
    await prisma.experience.update({
      where: { id: orderedIds[i] },
      data: { priorityOrder: i },
    });
  }

  res.json({ reordered: true });
});

export default router;
