import { Router } from "express";
import prisma from "../services/db.js";
import crypto from "crypto";
import { logChange } from "../services/changeLog.js";
import { syncTripDates } from "../services/syncTripDates.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// List all trips
router.get("/", async (_req, res) => {
  const trips = await prisma.trip.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
      _count: { select: { experiences: true, days: true } },
    },
  });
  res.json(trips);
});

// Get active trip
router.get("/active", async (_req, res) => {
  const trip = await prisma.trip.findFirst({
    where: { status: "active" },
    include: {
      cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
      routeSegments: { orderBy: { sequenceOrder: "asc" } },
      days: { orderBy: { date: "asc" }, include: { city: true } },
    },
  });
  res.json(trip);
});

// Get trip by ID
router.get("/:id", async (req, res) => {
  const trip = await prisma.trip.findUnique({
    where: { id: req.params.id },
    include: {
      cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
      routeSegments: { orderBy: { sequenceOrder: "asc" } },
      days: { orderBy: { date: "asc" }, include: { city: true } },
    },
  });
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }
  res.json(trip);
});

// Create trip
router.post("/", async (req: AuthRequest, res) => {
  const { name, startDate, endDate, cities, routeSegments } = req.body;

  if (!name?.trim()) { res.status(400).json({ error: "Trip name is required" }); return; }
  if (!startDate || !endDate) { res.status(400).json({ error: "Start and end dates are required" }); return; }

  // Deactivate other trips (they remain accessible, just not "current")
  await prisma.trip.updateMany({
    where: { status: "active" },
    data: { status: "archived" },
  });

  const trip = await prisma.trip.create({
    data: {
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: "active",
      inviteToken: crypto.randomBytes(6).toString("hex"),
    },
  });

  // Add creator as trip owner
  if (req.user?.travelerId) {
    await prisma.tripMember.create({
      data: { tripId: trip.id, travelerId: req.user.travelerId, role: "owner" },
    });
  }

  // Create cities if provided
  if (cities && Array.isArray(cities)) {
    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      const city = await prisma.city.create({
        data: {
          tripId: trip.id,
          name: c.name,
          country: c.country || null,
          latitude: c.latitude || null,
          longitude: c.longitude || null,
          sequenceOrder: i,
          arrivalDate: c.arrivalDate ? new Date(c.arrivalDate) : null,
          departureDate: c.departureDate ? new Date(c.departureDate) : null,
        },
      });

      // Create days for each city based on arrival/departure
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
  }

  // Create route segments if provided
  if (routeSegments && Array.isArray(routeSegments)) {
    for (let i = 0; i < routeSegments.length; i++) {
      const rs = routeSegments[i];
      await prisma.routeSegment.create({
        data: {
          tripId: trip.id,
          originCity: rs.originCity,
          destinationCity: rs.destinationCity,
          sequenceOrder: i,
          transportMode: rs.transportMode || "other",
          departureDate: rs.departureDate ? new Date(rs.departureDate) : null,
          notes: rs.notes || null,
        },
      });
    }
  }

  await syncTripDates(trip.id);

  await logChange({
    user: req.user!,
    tripId: trip.id,
    actionType: "trip_created",
    entityType: "trip",
    entityId: trip.id,
    entityName: trip.name,
    description: `${req.user!.displayName} created trip "${trip.name}"`,
    newState: trip,
  });

  // Carry forward portable documents (passport, frequent_flyer, insurance) from the most recent other trip
  try {
    const portableTypes = ["passport", "frequent_flyer", "insurance"];
    // Only look at the most recent other trip to avoid scanning all historical data
    const recentTrip = await prisma.trip.findFirst({
      where: { id: { not: trip.id } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (recentTrip) {
      const existingProfiles = await prisma.travelerProfile.findMany({
        where: { tripId: recentTrip.id },
        include: { documents: { where: { type: { in: portableTypes as any[] } } } },
      });

      for (const profile of existingProfiles) {
        if (profile.documents.length === 0) continue;

        const newProfile = await prisma.travelerProfile.upsert({
          where: { tripId_userCode: { tripId: trip.id, userCode: profile.userCode } },
          create: {
            tripId: trip.id,
            userCode: profile.userCode,
            displayName: profile.displayName,
          },
          update: {},
        });

        for (const doc of profile.documents) {
          const exists = await prisma.travelerDocument.findFirst({
            where: { profileId: newProfile.id, type: doc.type },
          });
          if (!exists) {
            await prisma.travelerDocument.create({
              data: {
                profileId: newProfile.id,
                type: doc.type,
                label: doc.label,
                data: doc.data as any,
                isPrivate: doc.isPrivate,
              },
            });
          }
        }
      }
    }
  } catch {
    // Document carry-over is best-effort — don't fail trip creation
  }

  const full = await prisma.trip.findUnique({
    where: { id: trip.id },
    include: {
      cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
      routeSegments: { orderBy: { sequenceOrder: "asc" } },
      days: { orderBy: { date: "asc" }, include: { city: true } },
    },
  });
  res.status(201).json(full);
});

// Activate a trip (set it as the current active trip)
router.post("/:id/activate", async (req: AuthRequest, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id as string } });
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  // Archive all other trips
  await prisma.trip.updateMany({
    where: { status: "active" },
    data: { status: "archived" },
  });

  const updated = await prisma.trip.update({
    where: { id: req.params.id as string },
    data: { status: "active" },
    include: {
      cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
      routeSegments: { orderBy: { sequenceOrder: "asc" } },
      days: { orderBy: { date: "asc" }, include: { city: true } },
    },
  });

  res.json(updated);
});

// Update trip (dates, name)
router.patch("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.trip.findUnique({ where: { id: req.params.id as string } });
  if (!existing) { res.status(404).json({ error: "Trip not found" }); return; }

  const { name, tagline } = req.body;
  const trip = await prisma.trip.update({
    where: { id: req.params.id as string },
    data: {
      ...(name !== undefined && { name }),
      ...(tagline !== undefined && { tagline: tagline || null }),
    },
  });

  // Trip dates always derived from actual day records
  await syncTripDates(trip.id);

  await logChange({
    user: req.user!,
    tripId: trip.id,
    actionType: "trip_edited",
    entityType: "trip",
    entityId: trip.id,
    entityName: trip.name,
    description: `${req.user!.displayName} updated trip "${trip.name}"`,
    previousState: existing,
    newState: trip,
  });

  const full = await prisma.trip.findUnique({
    where: { id: trip.id },
    include: {
      cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
      routeSegments: { orderBy: { sequenceOrder: "asc" } },
      days: { orderBy: { date: "asc" }, include: { city: true } },
    },
  });
  res.json(full);
});

// Delete trip
router.delete("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.trip.findUnique({ where: { id: req.params.id as string } });
  if (!existing) { res.status(404).json({ error: "Trip not found" }); return; }

  // Log before delete — the cascade will remove ChangeLogs too,
  // but the FK constraint prevents inserting after the trip is gone
  await logChange({
    user: req.user!,
    tripId: existing.id,
    actionType: "trip_deleted",
    entityType: "trip",
    entityId: existing.id,
    entityName: existing.name,
    description: `${req.user!.displayName} deleted trip "${existing.name}"`,
    previousState: existing,
  });

  await prisma.trip.delete({ where: { id: req.params.id as string } });

  res.json({ deleted: true });
});

// ── POST /:id/invite ─────────────────────────────────────────
// Add expected guest names and get/generate the invite link
router.post("/:id/invite", async (req: AuthRequest, res) => {
  const { names } = req.body; // string[]
  const trip = await prisma.trip.findUnique({
    where: { id: req.params.id as string },
  });
  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }

  // Generate invite token if missing
  let inviteToken = trip.inviteToken;
  if (!inviteToken) {
    inviteToken = crypto.randomBytes(6).toString("hex");
    await prisma.trip.update({
      where: { id: trip.id },
      data: { inviteToken },
    });
  }

  // Create TripInvite records for each expected name
  const created: string[] = [];
  if (names && Array.isArray(names)) {
    for (const rawName of names) {
      const expectedName = (rawName as string).trim();
      if (!expectedName) continue;

      // Skip if already invited (unclaimed)
      const existing = await prisma.tripInvite.findFirst({
        where: {
          tripId: trip.id,
          expectedName: { equals: expectedName, mode: "insensitive" },
          claimedByTravelerId: null,
        },
      });
      if (existing) continue;

      await prisma.tripInvite.create({
        data: { tripId: trip.id, expectedName },
      });
      created.push(expectedName);
    }
  }

  const protocol = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("host");
  const inviteLink = `${protocol}://${host}/join/${inviteToken}`;

  const invites = await prisma.tripInvite.findMany({
    where: { tripId: trip.id },
    orderBy: { createdAt: "asc" },
  });

  res.json({ inviteLink, inviteToken, invites, created });
});

// ── GET /:id/members ─────────────────────────────────────────
// List trip members and pending invites
router.get("/:id/members", async (req: AuthRequest, res) => {
  const trip = await prisma.trip.findUnique({
    where: { id: req.params.id as string },
    include: {
      tripMembers: { include: { traveler: true }, orderBy: { joinedAt: "asc" } },
      tripInvites: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }

  const members = trip.tripMembers.map((m) => ({
    id: m.id,
    travelerId: m.travelerId,
    displayName: m.traveler.displayName,
    role: m.role,
    joinedAt: m.joinedAt,
  }));

  const invites = trip.tripInvites.map((i) => ({
    id: i.id,
    expectedName: i.expectedName,
    claimed: !!i.claimedByTravelerId,
    claimedAt: i.claimedAt,
  }));

  res.json({ members, invites, inviteToken: trip.inviteToken });
});

export default router;
