import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { geocodeExperience, confirmLocation, searchPlace, nearbyPlaces } from "../services/geocoding.js";
import { logChange } from "../services/changeLog.js";
import prisma from "../services/db.js";

const router = Router();
router.use(requireAuth);

// Trigger geocoding for an experience
router.post("/experience/:id", async (req, res) => {
  const result = await geocodeExperience(req.params.id as string);
  if (!result) {
    res.json({ status: "no_match" });
    return;
  }
  res.json(result);
});

// Confirm a location for an experience
router.post("/experience/:id/confirm", async (req: AuthRequest, res) => {
  const { latitude, longitude, placeIdGoogle } = req.body;
  const exp = await confirmLocation(req.params.id as string, latitude, longitude, placeIdGoogle);

  await logChange({
    user: req.user!,
    tripId: exp.tripId,
    actionType: "experience_edited",
    entityType: "experience",
    entityId: exp.id,
    entityName: exp.name,
    description: `${req.user!.displayName} confirmed location for "${exp.name}"`,
    newState: exp,
  });

  res.json(exp);
});

// Search for a place
router.get("/search", async (req, res) => {
  const { query, city } = req.query as Record<string, string | undefined>;
  if (!query) { res.status(400).json({ error: "query required" }); return; }
  const results = await searchPlace(query, city || "");
  res.json(results);
});

// Get nearby high-rated places (Tier 3 markers)
router.get("/nearby", async (req, res) => {
  const { lat, lng, radius } = req.query as Record<string, string | undefined>;
  if (!lat || !lng) { res.status(400).json({ error: "lat and lng required" }); return; }
  const results = await nearbyPlaces(
    parseFloat(lat),
    parseFloat(lng),
    radius ? parseInt(radius) : 1000
  );
  res.json(results);
});

// Batch geocode all unlocated experiences for a trip
router.post("/batch/:tripId", async (req, res) => {
  const experiences = await prisma.experience.findMany({
    where: {
      tripId: req.params.tripId as string,
      locationStatus: "unlocated",
    },
  });

  const results = [];
  for (const exp of experiences) {
    const result = await geocodeExperience(exp.id);
    results.push({ id: exp.id, name: exp.name, result: result ? result.confidence : "no_match" });
  }

  res.json({ processed: results.length, results });
});

export default router;
