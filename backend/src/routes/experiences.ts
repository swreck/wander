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
  if (state) {
    const VALID_STATES = ["possible", "selected", "voting"];
    if (!VALID_STATES.includes(state)) {
      res.status(400).json({ error: `Invalid state: ${state}. Valid: ${VALID_STATES.join(", ")}` });
      return;
    }
    where.state = state;
  }
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

  if (!tripId) { res.status(400).json({ error: "tripId is required" }); return; }
  if (!cityId) { res.status(400).json({ error: "cityId is required" }); return; }
  if (!name?.trim()) { res.status(400).json({ error: "Experience name is required" }); return; }

  // Verify the city exists and belongs to this trip
  const city = await prisma.city.findUnique({ where: { id: cityId } });
  if (!city || city.tripId !== tripId) {
    res.status(404).json({ error: "City not found on this trip" });
    return;
  }

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

  // Validate theme enum values
  const VALID_THEMES = ["ceramics", "architecture", "food", "temples", "nature", "other"];
  if (themes !== undefined && Array.isArray(themes)) {
    const invalid = themes.filter((t: string) => !VALID_THEMES.includes(t));
    if (invalid.length > 0) {
      res.status(400).json({ error: `Invalid themes: ${invalid.join(", ")}. Valid: ${VALID_THEMES.join(", ")}` });
      return;
    }
  }

  // Validate cityId if being changed
  if (cityId !== undefined) {
    const cityCheck = await prisma.city.findUnique({ where: { id: cityId } });
    if (!cityCheck || cityCheck.tripId !== existing.tripId) {
      res.status(404).json({ error: "City not found on this trip" });
      return;
    }
  }

  // Validate dayId if being changed — must exist and belong to same trip
  if (dayId !== undefined && dayId !== null) {
    const dayCheck = await prisma.day.findUnique({ where: { id: dayId } });
    if (!dayCheck || dayCheck.tripId !== existing.tripId) {
      res.status(404).json({ error: "Day not found on this trip" });
      return;
    }
  }

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

  // Validate references exist and belong to same trip
  if (dayId) {
    const dayCheck = await prisma.day.findUnique({ where: { id: dayId } });
    if (!dayCheck || dayCheck.tripId !== existing.tripId) {
      res.status(404).json({ error: "Day not found on this trip" });
      return;
    }
  }
  if (routeSegmentId) {
    const segCheck = await prisma.routeSegment.findUnique({ where: { id: routeSegmentId } });
    if (!segCheck) {
      res.status(404).json({ error: "Route segment not found" });
      return;
    }
  }

  let exp;
  try {
    exp = await prisma.experience.update({
      where: { id: req.params.id as string },
      data: {
        state: "selected",
        dayId: dayId || null,
        routeSegmentId: routeSegmentId || null,
        timeWindow: timeWindow || null,
        transportModeToHere: transportModeToHere || null,
      },
    });
  } catch (e: any) {
    // FK violation — day or route segment was deleted between validation and update
    if (e.code === "P2003") {
      res.status(404).json({ error: "Day or route segment was removed" });
      return;
    }
    throw e;
  }

  const full = await prisma.experience.findUniqueOrThrow({
    where: { id: exp.id },
    include: { ratings: true, city: true, day: true, routeSegment: true },
  });

  const target = full.day
    ? full.day.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : `route ${full.routeSegment?.originCity} to ${full.routeSegment?.destinationCity}`;

  await logChange({
    user: req.user!,
    tripId: existing.tripId,
    actionType: "experience_promoted",
    entityType: "experience",
    entityId: exp.id,
    entityName: full.name,
    description: `${req.user!.displayName} added "${full.name}" to ${target}`,
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

  const changeLog = await logChange({
    user: req.user!,
    tripId: existing.tripId,
    actionType: "experience_deleted",
    entityType: "experience",
    entityId: existing.id,
    entityName: existing.name,
    description: `${req.user!.displayName} deleted "${existing.name}"`,
    previousState: existing,
  });

  res.json({ deleted: true, changeLogId: changeLog.id, name: existing.name });
});

// Reorder experiences
router.post("/reorder", async (req: AuthRequest, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    res.status(400).json({ error: "orderedIds array required" });
    return;
  }

  try {
    await prisma.$transaction(
      orderedIds.map((id: string, i: number) =>
        prisma.experience.update({ where: { id }, data: { priorityOrder: i } })
      )
    );
    res.json({ reordered: true });
  } catch {
    res.status(400).json({ error: "One or more experience IDs not found" });
  }
});

export default router;
