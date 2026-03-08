import { Router } from "express";
import multer from "multer";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { extractItinerary, extractRecommendations, type ExtractionResult, type RecommendationResult } from "../services/itineraryExtractor.js";
import { geocodeExperience, geocodeCity } from "../services/geocoding.js";
import { syncTripDates } from "../services/syncTripDates.js";
import { findDuplicate } from "../services/dedup.js";

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
            serviceNumber: rs.serviceNumber || null,
            confirmationNumber: rs.confirmationNumber || null,
            departureTime: rs.departureTime || null,
            arrivalTime: rs.arrivalTime || null,
            departureStation: rs.departureStation || null,
            arrivalStation: rs.arrivalStation || null,
            seatInfo: rs.seatInfo || null,
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

    // Batch geocode all created cities and experiences before responding
    const allCities = await prisma.city.findMany({
      where: { tripId: trip.id },
      select: { id: true },
    });
    await Promise.all(
      allCities.map((c) => geocodeCity(c.id).catch(() => {}))
    );

    const allExperiences = await prisma.experience.findMany({
      where: { tripId: trip.id },
      select: { id: true },
    });
    await Promise.all(
      allExperiences.map((e) => geocodeExperience(e.id).catch(() => {}))
    );

    // Return the full trip
    const full = await prisma.trip.findUnique({
      where: { id: trip.id },
      include: {
        cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
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
            serviceNumber: rs.serviceNumber || null,
            confirmationNumber: rs.confirmationNumber || null,
            departureTime: rs.departureTime || null,
            arrivalTime: rs.arrivalTime || null,
            departureStation: rs.departureStation || null,
            arrivalStation: rs.arrivalStation || null,
            seatInfo: rs.seatInfo || null,
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
    await Promise.all(
      allMergeCities.map((c) => geocodeCity(c.id).catch(() => {}))
    );

    const newExps = await prisma.experience.findMany({
      where: { tripId, sourceText: "Merged from imported text" },
      select: { id: true },
    });
    await Promise.all(
      newExps.map((e) => geocodeExperience(e.id).catch(() => {}))
    );

    // Return updated trip
    const full = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
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

// Replace the "backbone" (imported itinerary) block of a trip with a new one.
// Archives old Backroads days/experiences into a separate trip, imports new content,
// and repositions non-Backroads days to maintain their relative position.
router.post("/replace-backbone", async (req: AuthRequest, res) => {
  try {
    const { tripId, ...data } = req.body as ExtractionResult & { tripId: string };

    if (!tripId) {
      res.status(400).json({ error: "tripId is required" });
      return;
    }
    if (!data.tripName || !data.startDate || !data.endDate || !data.cities?.length) {
      res.status(400).json({ error: "New itinerary data is required (tripName, startDate, endDate, cities)" });
      return;
    }

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
        routeSegments: { orderBy: { sequenceOrder: "asc" } },
      },
    });
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }

    // ── 1. Identify Backroads experiences and days ──────────────
    const backroadsExps = await prisma.experience.findMany({
      where: {
        tripId,
        sourceText: { in: ["Imported from itinerary document", "Merged from imported text"] },
      },
    });
    const backroadsDayIds = new Set(
      backroadsExps.filter((e) => e.dayId).map((e) => e.dayId!)
    );
    const allDays = await prisma.day.findMany({
      where: { tripId },
      orderBy: { date: "asc" },
    });
    const backroadsDays = allDays.filter((d) => backroadsDayIds.has(d.id));
    const nonBackroadsDays = allDays.filter((d) => !backroadsDayIds.has(d.id));

    if (backroadsDays.length === 0) {
      res.status(400).json({ error: "No imported backbone days found in this trip to replace" });
      return;
    }

    // Determine the old backbone's date range
    const oldStart = backroadsDays[0].date;
    const oldEnd = backroadsDays[backroadsDays.length - 1].date;

    // Classify non-Backroads days as "before" or "after" the backbone
    const beforeDays = nonBackroadsDays.filter((d) => d.date < oldStart);
    const afterDays = nonBackroadsDays.filter((d) => d.date >= oldEnd); // on or after last Backroads day

    // Gap from backbone start: how many days before?
    const beforeGapMs = beforeDays.length > 0
      ? oldStart.getTime() - beforeDays[beforeDays.length - 1].date.getTime()
      : 0;
    const afterGapMs = afterDays.length > 0
      ? afterDays[0].date.getTime() - oldEnd.getTime()
      : 0;

    // ── 2. Archive old Backroads block as a separate trip ───────
    const backroadsCityIds = new Set(backroadsDays.map((d) => d.cityId));
    const backroadsCities = trip.cities.filter((c) => backroadsCityIds.has(c.id));
    // Also archive route segments tied to Backroads cities
    const backroadsSegments = trip.routeSegments.filter(
      (s) => backroadsCities.some((c) => c.name === s.originCity || c.name === s.destinationCity)
    );

    const archiveName = `${trip.name} [archived backbone ${oldStart.toISOString().slice(0, 10)}]`;
    const archivedTrip = await prisma.trip.create({
      data: {
        name: archiveName,
        startDate: oldStart,
        endDate: oldEnd,
        status: "archived",
      },
    });

    // Clone cities into archive
    const archiveCityMap = new Map<string, string>(); // old cityId -> archive cityId
    for (const c of backroadsCities) {
      const archived = await prisma.city.create({
        data: {
          tripId: archivedTrip.id,
          name: c.name,
          country: c.country,
          latitude: c.latitude,
          longitude: c.longitude,
          sequenceOrder: c.sequenceOrder,
          arrivalDate: c.arrivalDate,
          departureDate: c.departureDate,
          tagline: c.tagline,
        },
      });
      archiveCityMap.set(c.id, archived.id);
    }

    // Clone days into archive
    const archiveDayMap = new Map<string, string>(); // old dayId -> archive dayId
    for (const d of backroadsDays) {
      const newCityId = archiveCityMap.get(d.cityId);
      if (!newCityId) continue;
      const archived = await prisma.day.create({
        data: {
          tripId: archivedTrip.id,
          cityId: newCityId,
          date: d.date,
          notes: d.notes,
          explorationZone: d.explorationZone,
        },
      });
      archiveDayMap.set(d.id, archived.id);
    }

    // Clone experiences into archive
    for (const exp of backroadsExps) {
      const newCityId = archiveCityMap.get(exp.cityId);
      if (!newCityId) continue;
      const newDayId = exp.dayId ? archiveDayMap.get(exp.dayId) || null : null;
      await prisma.experience.create({
        data: {
          tripId: archivedTrip.id,
          cityId: newCityId,
          dayId: newDayId,
          name: exp.name,
          description: exp.description,
          state: exp.state,
          themes: exp.themes,
          timeWindow: exp.timeWindow,
          sourceText: exp.sourceText,
          createdBy: exp.createdBy,
          latitude: exp.latitude,
          longitude: exp.longitude,
          locationStatus: exp.locationStatus,
          placeIdGoogle: exp.placeIdGoogle,
        },
      });
    }

    // Clone route segments into archive
    for (const seg of backroadsSegments) {
      await prisma.routeSegment.create({
        data: {
          tripId: archivedTrip.id,
          originCity: seg.originCity,
          destinationCity: seg.destinationCity,
          sequenceOrder: seg.sequenceOrder,
          transportMode: seg.transportMode,
          departureDate: seg.departureDate,
          notes: seg.notes,
        },
      });
    }

    // ── 3. Delete old Backroads content from current trip ───────
    // Delete experiences first (FK constraint)
    await prisma.experience.deleteMany({
      where: { id: { in: backroadsExps.map((e) => e.id) } },
    });
    // Delete Backroads days
    await prisma.day.deleteMany({
      where: { id: { in: backroadsDays.map((d) => d.id) } },
    });
    // Delete route segments for old Backroads cities
    if (backroadsSegments.length > 0) {
      await prisma.routeSegment.deleteMany({
        where: { id: { in: backroadsSegments.map((s) => s.id) } },
      });
    }
    // Delete cities that were exclusively Backroads (no remaining days)
    for (const c of backroadsCities) {
      const remainingDays = await prisma.day.count({ where: { cityId: c.id } });
      const remainingExps = await prisma.experience.count({ where: { cityId: c.id } });
      if (remainingDays === 0 && remainingExps === 0) {
        await prisma.city.delete({ where: { id: c.id } });
      }
    }

    // ── 4. Import new backbone content ─────────────────────────
    const newStart = new Date(data.startDate);
    const newEnd = new Date(data.endDate);

    const newCityMap = new Map<string, string>(); // cityName -> cityId
    let maxOrder = 0;
    const remainingCities = await prisma.city.findMany({ where: { tripId } });
    if (remainingCities.length > 0) {
      maxOrder = Math.max(...remainingCities.map((c) => c.sequenceOrder));
    }

    for (let i = 0; i < data.cities.length; i++) {
      const c = data.cities[i];
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
      newCityMap.set(c.name.toLowerCase(), city.id);

      // Create days
      if (c.arrivalDate && c.departureDate) {
        const arrival = new Date(c.arrivalDate);
        const departure = new Date(c.departureDate);
        for (let d = new Date(arrival); d <= departure; d.setDate(d.getDate() + 1)) {
          await prisma.day.create({
            data: { tripId, cityId: city.id, date: new Date(d) },
          });
        }
      }
    }

    // Create route segments
    if (data.routeSegments?.length) {
      const existingSegs = await prisma.routeSegment.findMany({ where: { tripId } });
      let segOrder = existingSegs.length > 0
        ? Math.max(...existingSegs.map((s) => s.sequenceOrder))
        : 0;
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
            serviceNumber: rs.serviceNumber || null,
            confirmationNumber: rs.confirmationNumber || null,
            departureTime: rs.departureTime || null,
            arrivalTime: rs.arrivalTime || null,
            departureStation: rs.departureStation || null,
            arrivalStation: rs.arrivalStation || null,
            seatInfo: rs.seatInfo || null,
            notes: rs.notes || null,
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
        const cityId = newCityMap.get(exp.cityName.toLowerCase());
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
            sourceText: "Imported from itinerary document",
          },
        });
      }
    }

    // Create accommodations
    if (data.accommodations?.length) {
      for (const acc of data.accommodations) {
        const cityId = newCityMap.get(acc.cityName.toLowerCase());
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

    // ── 5. Reposition non-Backroads days relative to new backbone ──
    // "Before" days maintain the same gap from the new start
    if (beforeDays.length > 0) {
      const lastBeforeDate = beforeDays[beforeDays.length - 1].date;
      const newBeforeAnchor = new Date(newStart.getTime() - beforeGapMs);
      const shiftMs = newBeforeAnchor.getTime() - lastBeforeDate.getTime();
      if (shiftMs !== 0) {
        for (const d of beforeDays) {
          await prisma.day.update({
            where: { id: d.id },
            data: { date: new Date(d.date.getTime() + shiftMs) },
          });
        }
        // Shift cities that own these days
        const beforeCityIds = new Set(beforeDays.map((d) => d.cityId));
        for (const cid of beforeCityIds) {
          const c = await prisma.city.findUnique({ where: { id: cid } });
          if (!c) continue;
          const upd: any = {};
          if (c.arrivalDate) upd.arrivalDate = new Date(c.arrivalDate.getTime() + shiftMs);
          if (c.departureDate) upd.departureDate = new Date(c.departureDate.getTime() + shiftMs);
          if (Object.keys(upd).length > 0) {
            await prisma.city.update({ where: { id: cid }, data: upd });
          }
        }
      }
    }

    // "After" days maintain the same gap from the new end
    if (afterDays.length > 0) {
      const firstAfterDate = afterDays[0].date;
      const newAfterAnchor = new Date(newEnd.getTime() + afterGapMs);
      const shiftMs = newAfterAnchor.getTime() - firstAfterDate.getTime();
      if (shiftMs !== 0) {
        for (const d of afterDays) {
          await prisma.day.update({
            where: { id: d.id },
            data: { date: new Date(d.date.getTime() + shiftMs) },
          });
        }
        const afterCityIds = new Set(afterDays.map((d) => d.cityId));
        for (const cid of afterCityIds) {
          const c = await prisma.city.findUnique({ where: { id: cid } });
          if (!c) continue;
          const upd: any = {};
          if (c.arrivalDate) upd.arrivalDate = new Date(c.arrivalDate.getTime() + shiftMs);
          if (c.departureDate) upd.departureDate = new Date(c.departureDate.getTime() + shiftMs);
          if (Object.keys(upd).length > 0) {
            await prisma.city.update({ where: { id: cid }, data: upd });
          }
        }
      }
    }

    await syncTripDates(tripId);

    // Geocode new cities and experiences
    const newCities = await prisma.city.findMany({
      where: { tripId, id: { in: [...newCityMap.values()] } },
      select: { id: true },
    });
    await Promise.all(newCities.map((c) => geocodeCity(c.id).catch(() => {})));
    const newExps = await prisma.experience.findMany({
      where: { tripId, sourceText: "Imported from itinerary document" },
      select: { id: true },
    });
    await Promise.all(newExps.map((e) => geocodeExperience(e.id).catch(() => {})));

    await logChange({
      user: req.user!,
      tripId,
      actionType: "backbone_replaced",
      entityType: "trip",
      entityId: tripId,
      entityName: trip.name,
      description: `${req.user!.displayName} replaced backbone itinerary. Old plan archived as "${archiveName}". ${beforeDays.length} pre-days and ${afterDays.length} post-days repositioned.`,
      newState: { archiveTripId: archivedTrip.id, newStart: data.startDate, newEnd: data.endDate },
    });

    const full = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
        routeSegments: { orderBy: { sequenceOrder: "asc" } },
        days: { orderBy: { date: "asc" }, include: { city: true } },
        experiences: { orderBy: { createdAt: "asc" } },
        accommodations: true,
      },
    });

    res.status(201).json({
      trip: full,
      archivedTripId: archivedTrip.id,
      archivedTripName: archiveName,
      repositioned: {
        before: beforeDays.length,
        after: afterDays.length,
      },
    });
  } catch (err: any) {
    console.error("Replace backbone error:", err);
    res.status(500).json({ error: err.message || "Failed to replace backbone" });
  }
});

// ── Recommendations extraction + commit ─────────────────────────

// Extract recommendations from unstructured text (friend's email, etc.)
router.post("/extract-recommendations", async (req: AuthRequest, res) => {
  try {
    const { text, country } = req.body;
    if (!text) {
      res.status(400).json({ error: "text is required" });
      return;
    }
    const result = await extractRecommendations(text, country);
    res.json(result);
  } catch (err: any) {
    console.error("Recommendation extraction error:", err);
    res.status(500).json({ error: err.message || "Extraction failed" });
  }
});

// Commit extracted recommendations into a trip's experience pool.
// Category 1: item city matches an existing trip city → add as candidate experience
// Category 2: item city doesn't match → create a dateless "candidate city" and add experiences
// Category 3: no city at all → add to a special "Ideas" city
router.post("/commit-recommendations", async (req: AuthRequest, res) => {
  try {
    const { tripId, recommendations, senderNotes, senderLabel } = req.body as {
      tripId: string;
      recommendations: RecommendationResult["recommendations"];
      senderNotes?: string;
      senderLabel?: string; // e.g. "Larisa's recommendations"
    };

    if (!tripId || !recommendations?.length) {
      res.status(400).json({ error: "tripId and recommendations are required" });
      return;
    }

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } } },
    });
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }

    // Build a lookup of existing city names (case-insensitive)
    // Include both exact and substring matching for resilience
    const existingCities = trip.cities.map((c) => ({ id: c.id, lower: c.name.toLowerCase() }));
    function findExistingCity(name: string): string | null {
      const lower = name.toLowerCase();
      // Exact match
      const exact = existingCities.find((c) => c.lower === lower);
      if (exact) return exact.id;
      // Rec city contained in trip city or vice versa (e.g., "Karatsu" matches "Karatsu")
      // But skip very short names to avoid false positives
      if (lower.length >= 4) {
        const contained = existingCities.find(
          (c) => c.lower.includes(lower) || lower.includes(c.lower)
        );
        if (contained) return contained.id;
      }
      return null;
    }

    // Track new candidate cities we create
    const newCityMap = new Map<string, string>(); // lowercase name → cityId
    let maxOrder = Math.max(0, ...trip.cities.map((c) => c.sequenceOrder));

    // Create or find the "Ideas" city for category 3
    let ideasCityId: string | null = null;

    const sourceLabel = senderLabel || "Friend's recommendations";
    let cat1Count = 0;
    let cat2Count = 0;
    let cat3Count = 0;

    for (const rec of recommendations) {
      let cityId: string | null = null;

      if (rec.city) {
        const cityKey = rec.city.toLowerCase();

        // Try existing trip city (exact + substring)
        cityId = findExistingCity(rec.city);

        // Try new candidate cities we already created this session
        if (!cityId) cityId = newCityMap.get(cityKey) || null;

        if (cityId) {
          // Check if it's an existing trip city or a new candidate we created
          const isExisting = existingCities.some((c) => c.id === cityId);
          if (isExisting) cat1Count++;
          else cat2Count++;
        } else {
          // Category 2 — new candidate city (no dates, no days)
          maxOrder++;
          const city = await prisma.city.create({
            data: {
              tripId,
              name: rec.city,
              country: rec.country || null,
              sequenceOrder: maxOrder,
              // No arrivalDate/departureDate — this is a candidate city
              tagline: rec.region ? `${rec.region} region` : null,
            },
          });
          newCityMap.set(cityKey, city.id);
          cityId = city.id;
          cat2Count++;

          // Geocode the new city
          await geocodeCity(city.id).catch(() => {});
        }
      } else {
        // Category 3 — no location, goes to Ideas city
        if (!ideasCityId) {
          const existing = findExistingCity("Ideas") || newCityMap.get("ideas");
          if (existing) {
            ideasCityId = existing;
          } else {
            maxOrder++;
            const ideasCity = await prisma.city.create({
              data: {
                tripId,
                name: "Ideas",
                country: trip.cities[0]?.country || rec.country || null,
                sequenceOrder: maxOrder,
                tagline: "General trip ideas — no specific location",
              },
            });
            newCityMap.set("ideas", ideasCity.id);
            ideasCityId = ideasCity.id;
          }
        }
        cityId = ideasCityId;
        cat3Count++;
      }

      // Build description from rec fields
      const descParts: string[] = [];
      if (rec.description) descParts.push(rec.description);
      if (rec.urls.length > 0) descParts.push(rec.urls.join("\n"));

      // Map extracted themes to valid enum values
      const validThemes = new Set(["ceramics", "architecture", "food", "temples", "nature", "other"]);
      const themeMap: Record<string, string> = {
        pottery: "ceramics", onsen: "nature", hiking: "nature", gardens: "nature",
        museums: "architecture", art: "architecture", history: "architecture",
        sake: "food", shopping: "other", culture: "other", trains: "other",
      };
      const mappedThemes = rec.themes
        .map((t: string) => validThemes.has(t) ? t : (themeMap[t] || "other"))
        .filter((t: string, i: number, arr: string[]) => arr.indexOf(t) === i);

      // Dedup: skip if a fuzzy-matching experience already exists
      const dupName = await findDuplicate(tripId, rec.name, cityId!);
      if (dupName) continue;

      await prisma.experience.create({
        data: {
          tripId,
          cityId,
          name: rec.name,
          description: descParts.join("\n\n") || null,
          state: "possible",
          themes: mappedThemes as any,
          createdBy: req.user!.code,
          sourceText: sourceLabel,
          userNotes: rec.accommodationTip ? "Accommodation recommendation" : null,
        },
      });
    }

    // Store sender notes as a log entry if present
    if (senderNotes) {
      await logChange({
        user: req.user!,
        tripId,
        actionType: "recommendations_imported",
        entityType: "trip",
        entityId: tripId,
        entityName: trip.name,
        description: `${req.user!.displayName} imported ${recommendations.length} recommendations (${sourceLabel}). General notes: ${senderNotes}`,
      });
    } else {
      await logChange({
        user: req.user!,
        tripId,
        actionType: "recommendations_imported",
        entityType: "trip",
        entityId: tripId,
        entityName: trip.name,
        description: `${req.user!.displayName} imported ${recommendations.length} recommendations (${sourceLabel})`,
      });
    }

    // Geocode all new experiences
    const newExps = await prisma.experience.findMany({
      where: { tripId, sourceText: sourceLabel },
      select: { id: true },
    });
    await Promise.all(newExps.map((e) => geocodeExperience(e.id).catch(() => {})));

    res.status(201).json({
      imported: recommendations.length,
      category1: cat1Count,
      category2: cat2Count,
      category3: cat3Count,
      newCities: [...newCityMap.entries()].map(([name, id]) => ({ name, id })),
    });
  } catch (err: any) {
    console.error("Commit recommendations error:", err);
    res.status(500).json({ error: err.message || "Failed to commit recommendations" });
  }
});

export default router;
