import { Router } from "express";
import multer from "multer";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { extractItinerary, type ExtractionResult } from "../services/itineraryExtractor.js";
import { geocodeExperience, geocodeCity } from "../services/geocoding.js";
import { syncTripDates } from "../services/syncTripDates.js";

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for large PDFs
});

// Extract itinerary from text or images — returns structured data for review
router.post("/extract", upload.array("images", 10), async (req: AuthRequest, res) => {
  try {
    const { text, startDate } = req.body;
    const files = req.files as Express.Multer.File[] | undefined;

    if (!text && (!files || files.length === 0)) {
      res.status(400).json({ error: "Provide text or upload images" });
      return;
    }

    const images = files?.map((f) => ({
      base64: f.buffer.toString("base64"),
      mediaType: f.mimetype,
    }));

    const hints = startDate ? { startDate } : undefined;
    const result = await extractItinerary(text || "", images, hints);
    res.json(result);
  } catch (err: any) {
    console.error("Extraction error:", err);
    res.status(500).json({ error: err.message || "Extraction failed" });
  }
});

// Extract itinerary from a URL — fetches the page content, then extracts
router.post("/extract-url", async (req: AuthRequest, res) => {
  try {
    const { url, startDate } = req.body;

    if (!url) {
      res.status(400).json({ error: "URL is required" });
      return;
    }

    // Fetch the page
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Wander/1.0)",
        "Accept": "text/html,application/xhtml+xml,text/plain,*/*",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      res.status(400).json({ error: `Couldn't fetch that URL (${response.status})` });
      return;
    }

    const contentType = response.headers.get("content-type") || "";
    let text: string;

    if (contentType.includes("application/pdf")) {
      // PDF URL — fetch as buffer and send as document to Claude
      const buffer = Buffer.from(await response.arrayBuffer());
      const images = [{
        base64: buffer.toString("base64"),
        mediaType: "application/pdf",
      }];
      const hints = startDate ? { startDate } : undefined;
      const result = await extractItinerary("", images, hints);
      res.json(result);
      return;
    }

    // HTML/text — strip tags and extract text content
    const html = await response.text();
    text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!text || text.length < 50) {
      res.status(400).json({ error: "Couldn't extract readable content from that URL" });
      return;
    }

    const hints = startDate ? { startDate } : undefined;
    const result = await extractItinerary(text, undefined, hints);
    res.json(result);
  } catch (err: any) {
    console.error("URL extraction error:", err);
    if (err.name === "TimeoutError") {
      res.status(400).json({ error: "URL took too long to respond" });
      return;
    }
    res.status(500).json({ error: err.message || "URL extraction failed" });
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

    // Guard: if any dates are in the past, shift everything forward
    {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const parsedStart = new Date(data.startDate);
      if (parsedStart < today) {
        const shiftMs = today.getTime() - parsedStart.getTime();
        const shiftDays = Math.ceil(shiftMs / 86400000);
        console.log(`[Import] Dates in the past — shifting forward by ${shiftDays} days`);

        const shiftDate = (d: string | null | undefined): string | null | undefined => {
          if (!d) return d;
          const date = new Date(d);
          date.setUTCDate(date.getUTCDate() + shiftDays);
          return date.toISOString().split("T")[0];
        };

        data.startDate = shiftDate(data.startDate)!;
        data.endDate = shiftDate(data.endDate)!;
        for (const c of data.cities) {
          c.arrivalDate = shiftDate(c.arrivalDate) ?? null;
          c.departureDate = shiftDate(c.departureDate) ?? null;
        }
        if (data.experiences) {
          for (const e of data.experiences) {
            e.dayDate = shiftDate(e.dayDate) ?? null;
          }
        }
        if (data.routeSegments) {
          for (const rs of data.routeSegments) {
            rs.departureDate = shiftDate(rs.departureDate) as string | undefined;
          }
        }
      }
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

    await syncTripDates(trip.id);

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

    // Trigger async batch geocoding for all created cities and experiences
    const allCities = await prisma.city.findMany({
      where: { tripId: trip.id },
      select: { id: true },
    });
    Promise.all(
      allCities.map((c) => geocodeCity(c.id).catch(() => {}))
    ).catch(() => {});

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

// Merge extracted data into an existing trip (add cities, experiences, etc.)
router.post("/merge", async (req: AuthRequest, res) => {
  try {
    const { tripId, ...data } = req.body as ExtractionResult & { tripId: string };

    if (!tripId) {
      res.status(400).json({ error: "tripId is required" });
      return;
    }

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { cities: true },
    });
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }

    // Build city map: match extracted cities to existing ones (case-insensitive),
    // create new cities for unmatched ones
    const cityMap = new Map<string, string>(); // extractedName (lower) -> cityId
    for (const existing of trip.cities) {
      cityMap.set(existing.name.toLowerCase(), existing.id);
    }

    let maxOrder = Math.max(0, ...trip.cities.map((c) => c.sequenceOrder));

    if (data.cities?.length) {
      for (const c of data.cities) {
        const key = c.name.toLowerCase();
        if (cityMap.has(key)) continue; // already exists

        maxOrder++;
        const city = await prisma.city.create({
          data: {
            tripId,
            name: c.name,
            country: c.country || null,
            sequenceOrder: maxOrder,
            arrivalDate: c.arrivalDate ? new Date(c.arrivalDate) : null,
            departureDate: c.departureDate ? new Date(c.departureDate) : null,
          },
        });
        cityMap.set(key, city.id);

        // Create days for new city date ranges
        if (c.arrivalDate && c.departureDate) {
          const arrival = new Date(c.arrivalDate);
          const departure = new Date(c.departureDate);
          for (let d = new Date(arrival); d <= departure; d.setDate(d.getDate() + 1)) {
            const dateStart = new Date(d);
            dateStart.setUTCHours(0, 0, 0, 0);
            const dateEnd = new Date(d);
            dateEnd.setUTCHours(23, 59, 59, 999);
            const existingDay = await prisma.day.findFirst({
              where: { tripId, date: { gte: dateStart, lte: dateEnd } },
            });
            if (existingDay) {
              const updateData: any = { cityId: city.id };
              if (existingDay.notes === "Unassigned — add city and activities") updateData.notes = null;
              await prisma.day.update({ where: { id: existingDay.id }, data: updateData });
            } else {
              await prisma.day.create({ data: { tripId, cityId: city.id, date: new Date(d) } });
            }
          }
        }
      }
    }

    // Sync trip date range to match actual days
    await syncTripDates(tripId);

    // Create route segments
    if (data.routeSegments?.length) {
      const existingSegs = await prisma.routeSegment.findMany({ where: { tripId } });
      let segOrder = Math.max(0, ...existingSegs.map((s) => s.sequenceOrder));
      for (const rs of data.routeSegments) {
        segOrder++;
        await prisma.routeSegment.create({
          data: {
            tripId,
            originCity: rs.originCity,
            destinationCity: rs.destinationCity,
            sequenceOrder: segOrder,
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
            tripId,
            cityId,
            name: acc.name,
            address: acc.address || null,
            notes: acc.notes || null,
          },
        });
      }
    }

    // Create experiences
    if (data.experiences?.length) {
      const allTripDays = await prisma.day.findMany({
        where: { tripId },
        orderBy: { date: "asc" },
      });

      for (const exp of data.experiences) {
        const cityId = cityMap.get(exp.cityName.toLowerCase());
        if (!cityId) continue;

        let dayId: string | null = null;
        if (exp.dayDate) {
          const matchingDay = allTripDays.find(
            (d) => d.date.toISOString().split("T")[0] === exp.dayDate
          );
          if (matchingDay) dayId = matchingDay.id;
        }

        await prisma.experience.create({
          data: {
            tripId,
            cityId,
            name: exp.name,
            description: exp.description || null,
            state: dayId ? "selected" : "possible",
            dayId,
            timeWindow: exp.timeWindow || null,
            createdBy: req.user!.code,
            sourceText: "Merged from imported text",
          },
        });
      }
    }

    await logChange({
      user: req.user!,
      tripId,
      actionType: "trip_merged",
      entityType: "trip",
      entityId: tripId,
      entityName: trip.name,
      description: `${req.user!.displayName} merged imported content into "${trip.name}"`,
      newState: data,
    });

    // Batch geocode new cities and experiences
    const allMergeCities = await prisma.city.findMany({
      where: { tripId },
      select: { id: true },
    });
    Promise.all(
      allMergeCities.map((c) => geocodeCity(c.id).catch(() => {}))
    ).catch(() => {});

    const newExps = await prisma.experience.findMany({
      where: { tripId, sourceText: "Merged from imported text" },
      select: { id: true },
    });
    Promise.all(
      newExps.map((e) => geocodeExperience(e.id).catch(() => {}))
    ).catch(() => {});

    // Return updated trip
    const full = await prisma.trip.findUnique({
      where: { id: tripId },
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
    console.error("Merge error:", err);
    res.status(500).json({ error: err.message || "Failed to merge import" });
  }
});

export default router;
