import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getCountryAdvisories, getPreTripSummary } from "../services/travelAdvisory.js";

const router = Router();
router.use(requireAuth);

// GET /travel-advisory/trip/:tripId
// Returns advisories for all countries in the trip
router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      cities: { where: { hidden: false }, select: { country: true } },
    },
  });

  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }

  const countries = [...new Set(trip.cities.map((c) => c.country).filter(Boolean))] as string[];
  if (countries.length === 0) {
    res.json({ advisories: [], summary: null });
    return;
  }

  const advisories = getCountryAdvisories(countries);
  const summary = getPreTripSummary(
    countries,
    trip.startDate?.toISOString().split("T")[0],
  );

  res.json({ advisories, summary });
});

export default router;
