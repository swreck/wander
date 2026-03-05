import { Router } from "express";
import multer from "multer";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { extractItinerary, type ExtractionResult } from "../services/itineraryExtractor.js";
import { geocodeExperience } from "../services/geocoding.js";

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Extract itinerary from text or images — returns structured data for review
router.post("/extract", upload.array("images", 10), async (req: AuthRequest, res) => {
  try {
    const { text } = req.body;
    const files = req.files as Express.Multer.File[] | undefined;

    if (!text && (!files || files.length === 0)) {
      res.status(400).json({ error: "Provide text or upload images" });
      return;
    }

    const images = files?.map((f) => ({
      base64: f.buffer.toString("base64"),
      mediaType: f.mimetype,
    }));

    const result = await extractItinerary(text || "", images);
    res.json(result);
  } catch (err: any) {
    console.error("Extraction error:", err);
    res.status(500).json({ error: err.message || "Extraction failed" });
  }
});

// Commit reviewed extraction to create a trip
router.post("/commit", async (req: AuthRequest, res) => {
  try {
    const data: ExtractionResult = req.body;

    if (!data.tripName || !data.startDate || !data.endDate || !data.cities?.length) {
      res.status(400).json({ error: "Missing required fields: tripName, startDate, endDate, cities" });
      return;
    }

    // Archive any existing active trip
    await prisma.trip.updateMany({
      where: { status: "active" },
      data: { status: "archived" },
    });

    // Create trip
    const trip = await prisma.trip.create({
      data: {
        name: data.tripName,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: "active",
      },
    });

    // Create cities and collect mapping for later use
    const cityMap = new Map<string, string>(); // cityName -> cityId
    for (let i = 0; i < data.cities.length; i++) {
      const c = data.cities[i];
      const city = await prisma.city.create({
        data: {
          tripId: trip.id,
          name: c.name,
          country: c.country || null,
          sequenceOrder: i,
          arrivalDate: c.arrivalDate ? new Date(c.arrivalDate) : null,
          departureDate: c.departureDate ? new Date(c.departureDate) : null,
        },
      });
      cityMap.set(c.name.toLowerCase(), city.id);

      // Create days for each city
      if (c.arrivalDate && c.departureDate) {
        const arrival = new Date(c.arrivalDate);
        const departure = new Date(c.departureDate);
        for (let d = new Date(arrival); d <= departure; d.setDate(d.getDate() + 1)) {
          await prisma.day.create({
            data: {
              tripId: trip.id,
              cityId: city.id,
              date: new Date(d),
            },
          });
        }
      }
    }

    // Also create empty days for any gap between trip start/end and city coverage
    // (the spec says remaining days are created as empty placeholders)
    const allDays = await prisma.day.findMany({
      where: { tripId: trip.id },
      select: { date: true },
    });
    const existingDates = new Set(allDays.map((d) => d.date.toISOString().split("T")[0]));
    const tripStart = new Date(data.startDate);
    const tripEnd = new Date(data.endDate);

    // Find the first city to use as default for placeholder days
    const firstCityId = cityMap.values().next().value;
    if (firstCityId) {
      for (let d = new Date(tripStart); d <= tripEnd; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        if (!existingDates.has(dateStr)) {
          await prisma.day.create({
            data: {
              tripId: trip.id,
              cityId: firstCityId,
              date: new Date(d),
              notes: "Unassigned — add city and activities",
            },
          });
        }
      }
    }

    // Create route segments
    if (data.routeSegments?.length) {
      for (let i = 0; i < data.routeSegments.length; i++) {
        const rs = data.routeSegments[i];
        await prisma.routeSegment.create({
          data: {
            tripId: trip.id,
            originCity: rs.originCity,
            destinationCity: rs.destinationCity,
            sequenceOrder: i,
            transportMode: (rs.transportMode as any) || "other",
            departureDate: rs.departureDate ? new Date(rs.departureDate) : null,
            notes: rs.notes || null,
          },
        });
      }
    }

    // Create accommodations
    if (data.accommodations?.length) {
      for (const acc of data.accommodations) {
        const cityId = cityMap.get(acc.cityName.toLowerCase());
        if (!cityId) continue;

        await prisma.accommodation.create({
          data: {
            tripId: trip.id,
            cityId,
            name: acc.name,
            address: acc.address || null,
            notes: acc.notes || null,
          },
        });
      }
    }

    // Create experiences as Selected (assigned to days) per spec section 7.2
    if (data.experiences?.length) {
      const allTripDays = await prisma.day.findMany({
        where: { tripId: trip.id },
        orderBy: { date: "asc" },
      });

      for (const exp of data.experiences) {
        const cityId = cityMap.get(exp.cityName.toLowerCase());
        if (!cityId) continue;

        // Find matching day
        let dayId: string | null = null;
        if (exp.dayDate) {
          const targetDate = exp.dayDate;
          const matchingDay = allTripDays.find(
            (d) => d.date.toISOString().split("T")[0] === targetDate
          );
          if (matchingDay) {
            dayId = matchingDay.id;
          }
        }

        await prisma.experience.create({
          data: {
            tripId: trip.id,
            cityId,
            name: exp.name,
            description: exp.description || null,
            state: dayId ? "selected" : "possible",
            dayId,
            timeWindow: exp.timeWindow || null,
            createdBy: req.user!.code,
            sourceText: "Imported from itinerary document",
          },
        });
      }
    }

    await logChange({
      user: req.user!,
      tripId: trip.id,
      actionType: "trip_imported",
      entityType: "trip",
      entityId: trip.id,
      entityName: trip.name,
      description: `${req.user!.displayName} created trip "${trip.name}" from imported itinerary`,
      newState: data,
    });

    // Trigger async batch geocoding for all created experiences
    const allExperiences = await prisma.experience.findMany({
      where: { tripId: trip.id },
      select: { id: true },
    });
    // Fire-and-forget — don't block the response
    Promise.all(
      allExperiences.map((e) => geocodeExperience(e.id).catch(() => {}))
    ).catch(() => {});

    // Return the full trip
    const full = await prisma.trip.findUnique({
      where: { id: trip.id },
      include: {
        cities: { orderBy: { sequenceOrder: "asc" } },
        routeSegments: { orderBy: { sequenceOrder: "asc" } },
        days: { orderBy: { date: "asc" }, include: { city: true } },
        experiences: { orderBy: { createdAt: "asc" } },
        accommodations: true,
      },
    });
    res.status(201).json(full);
  } catch (err: any) {
    console.error("Commit error:", err);
    res.status(500).json({ error: err.message || "Failed to create trip" });
  }
});

export default router;
