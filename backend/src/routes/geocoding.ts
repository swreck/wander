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

// Theme-to-Google-Places type mapping
const THEME_TYPES: Record<string, string> = {
  ceramics: "museum|art_gallery|store",
  architecture: "church|hindu_temple|museum|landmark",
  food: "restaurant|cafe|bakery|bar",
  temples: "hindu_temple|buddhist_temple|place_of_worship",
  nature: "park|natural_feature",
};

// Get nearby high-rated places (Tier 3 markers)
router.get("/nearby", async (req, res) => {
  const { lat, lng, radius, themes } = req.query as Record<string, string | undefined>;
  if (!lat || !lng) { res.status(400).json({ error: "lat and lng required" }); return; }

  // Build type filter from themes if provided
  let typeFilter: string | undefined;
  if (themes) {
    const themeList = themes.split(",").filter(t => t in THEME_TYPES);
    if (themeList.length > 0) {
      const types = new Set<string>();
      for (const t of themeList) {
        THEME_TYPES[t].split("|").forEach(tp => types.add(tp));
      }
      typeFilter = [...types].join("|");
    }
  }

  const results = await nearbyPlaces(
    parseFloat(lat),
    parseFloat(lng),
    radius ? parseInt(radius) : 1000,
    typeFilter,
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

// City photo — returns a Google Places photo URL for a city name
router.get("/city-photo", async (req: AuthRequest, res) => {
  const { query } = req.query as { query?: string };
  if (!query) { res.status(400).json({ error: "query required" }); return; }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "No API key" }); return; }

  try {
    // Find place to get photo reference
    const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=photos,name&key=${apiKey}`;
    const findRes = await fetch(findUrl);
    const findData = await findRes.json() as any;
    const photos = findData?.candidates?.[0]?.photos;
    if (!photos || photos.length === 0) { res.json({ url: null }); return; }

    // Return the photo URL (maxwidth 800 for splash)
    const photoRef = photos[0].photo_reference;
    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${apiKey}`;
    res.json({ url: photoUrl });
  } catch {
    res.json({ url: null });
  }
});

export default router;
