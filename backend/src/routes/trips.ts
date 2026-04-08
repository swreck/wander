import { Router } from "express";
import prisma from "../services/db.js";
import crypto from "crypto";
import { logChange } from "../services/changeLog.js";
import { syncTripDates } from "../services/syncTripDates.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getUserRole } from "../middleware/role.js";

const router = Router();
router.use(requireAuth);

// List all trips
router.get("/", async (_req, res) => {
  const trips = await prisma.trip.findMany({
    orderBy: { lastOpenedAt: { sort: "desc", nulls: "last" } },
    include: {
      cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
      _count: { select: { experiences: true, days: true } },
      sheetSyncConfig: { select: { lastSyncAt: true } },
    },
  });
  res.json(trips);
});

// Get active trip
router.get("/active", async (_req, res) => {
  const trip = await prisma.trip.findFirst({
    where: { status: "active" },
    orderBy: { updatedAt: "desc" },
    include: {
      cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
      routeSegments: { orderBy: { sequenceOrder: "asc" } },
      days: { orderBy: { date: "asc" }, include: { city: true } },
      sheetSyncConfig: { select: { lastSyncAt: true } },
    },
  });
  // Stamp lastOpenedAt
  if (trip) {
    prisma.trip.update({ where: { id: trip.id }, data: { lastOpenedAt: new Date() } }).catch(() => {});
  }
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
  const { name, startDate, endDate, cities, routeSegments, skipDocumentCarryOver, members, dateState } = req.body;

  if (!name?.trim()) { res.status(400).json({ error: "Trip name is required" }); return; }

  // Validate dates if both provided
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    res.status(400).json({
      error: "Looks like the dates are swapped — did you mean " +
        `${new Date(endDate).toISOString().slice(0, 10)} to ${new Date(startDate).toISOString().slice(0, 10)}?`,
    });
    return;
  }

  // Dateless trips: startDate/endDate no longer required
  const datesKnown = dateState !== "not_yet";

  // Deactivate other trips (they remain accessible, just not "current")
  await prisma.trip.updateMany({
    where: { status: "active" },
    data: { status: "archived" },
  });

  const trip = await prisma.trip.create({
    data: {
      name,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      datesKnown,
      status: "active",
      inviteToken: crypto.randomBytes(6).toString("hex"),
    },
  });

  // Add creator as planner (was "owner", now "planner")
  if (req.user?.travelerId) {
    await prisma.tripMember.create({
      data: { tripId: trip.id, travelerId: req.user.travelerId, role: "planner" },
    });
  }

  // Generate personal invite tokens for named members
  if (members && Array.isArray(members)) {
    for (const rawName of members) {
      const memberName = (rawName as string).trim();
      if (!memberName) continue;
      const personalToken = crypto.randomBytes(8).toString("hex");
      await prisma.tripInvite.create({
        data: {
          tripId: trip.id,
          expectedName: memberName,
          inviteToken: personalToken,
        },
      });
    }
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
          latitude: c.latitude ?? null,
          longitude: c.longitude ?? null,
          sequenceOrder: i,
          arrivalDate: c.arrivalDate ? new Date(c.arrivalDate) : null,
          departureDate: c.departureDate ? new Date(c.departureDate) : null,
        },
      });

      // Create days for each city based on arrival/departure
      if (c.arrivalDate && c.departureDate) {
        const arrival = new Date(c.arrivalDate);
        const departure = new Date(c.departureDate);
        for (let d = new Date(arrival); d <= departure; d.setUTCDate(d.getUTCDate() + 1)) {
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

  // Carry forward portable documents (passport, frequent_flyer, insurance) from the creating user's most recent other trip
  if (!skipDocumentCarryOver) try {
    const portableTypes = ["passport", "frequent_flyer", "insurance"];
    // Find the most recent trip where this user has a traveler profile with portable documents
    const recentProfile = await prisma.travelerProfile.findFirst({
      where: {
        userCode: req.user!.code,
        tripId: { not: trip.id },
        documents: { some: { type: { in: portableTypes as any[] } } },
      },
      orderBy: { createdAt: "desc" },
      include: { documents: { where: { type: { in: portableTypes as any[] } } } },
    });

    if (recentProfile) {
      // Also carry over other users' portable docs from the same trip
      const allProfiles = await prisma.travelerProfile.findMany({
        where: { tripId: recentProfile.tripId },
        include: { documents: { where: { type: { in: portableTypes as any[] } } } },
      });

      for (const profile of allProfiles) {
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

  // Ensure this trip is still active (guards against concurrent trip creation by another user)
  await prisma.trip.update({ where: { id: trip.id }, data: { status: "active" } });

  const full = await prisma.trip.findUnique({
    where: { id: trip.id },
    include: {
      cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
      routeSegments: { orderBy: { sequenceOrder: "asc" } },
      days: { orderBy: { date: "asc" }, include: { city: true } },
    },
  });

  // Include invite data so the frontend can show invite links immediately after creation
  const invites = await prisma.tripInvite.findMany({
    where: { tripId: trip.id },
    select: { expectedName: true, inviteToken: true },
  });

  res.status(201).json({ ...full, invites });
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
    data: { status: "active", lastOpenedAt: new Date() },
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

  if (name !== undefined && !name?.trim()) {
    res.status(400).json({ error: "Trip name can't be empty" });
    return;
  }

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

  // Create TripInvite records for each expected name — with personal tokens
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

      const personalToken = crypto.randomBytes(8).toString("hex");
      await prisma.tripInvite.create({
        data: { tripId: trip.id, expectedName, inviteToken: personalToken },
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

  // Build personal invite links
  const personalLinks = invites
    .filter((i) => i.inviteToken && !i.claimedByTravelerId)
    .map((i) => ({
      name: i.expectedName,
      link: `${protocol}://${host}/join/${i.inviteToken}`,
      token: i.inviteToken,
    }));

  res.json({ inviteLink, inviteToken, invites, created, personalLinks });
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
    inviteToken: i.inviteToken,
    claimed: !!i.claimedByTravelerId,
    claimedAt: i.claimedAt,
  }));

  res.json({ members, invites, inviteToken: trip.inviteToken });
});

// ── POST /:id/resend-invite ──────────────────────────────────
// Regenerate a personal invite token for a specific person (invalidates old one)
router.post("/:id/resend-invite", async (req: AuthRequest, res) => {
  const { inviteId } = req.body;
  if (!inviteId) {
    res.status(400).json({ error: "Invite ID required" });
    return;
  }

  const invite = await prisma.tripInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.tripId !== (req.params.id as string)) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  // Generate new token (old one becomes invalid)
  const newToken = crypto.randomBytes(8).toString("hex");
  const updated = await prisma.tripInvite.update({
    where: { id: inviteId },
    data: { inviteToken: newToken, claimedByTravelerId: null, claimedAt: null },
  });

  const protocol = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("host");

  res.json({
    invite: updated,
    personalLink: `${protocol}://${host}/join/${newToken}`,
  });
});

// ── POST /:id/add-members ────────────────────────────────────
// Add new members to a trip (generates personal invite tokens)
router.post("/:id/add-members", async (req: AuthRequest, res) => {
  const { names } = req.body;
  const tripId = req.params.id as string;

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  const created: Array<{ name: string; link: string; token: string }> = [];
  const protocol = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("host");

  if (names && Array.isArray(names)) {
    for (const rawName of names) {
      const memberName = (rawName as string).trim();
      if (!memberName) continue;

      // Skip if already invited
      const existing = await prisma.tripInvite.findFirst({
        where: {
          tripId,
          expectedName: { equals: memberName, mode: "insensitive" },
        },
      });
      if (existing) continue;

      const personalToken = crypto.randomBytes(8).toString("hex");
      await prisma.tripInvite.create({
        data: { tripId, expectedName: memberName, inviteToken: personalToken },
      });
      created.push({
        name: memberName,
        link: `${protocol}://${host}/join/${personalToken}`,
        token: personalToken,
      });
    }
  }

  res.json({ created });
});

// ── PATCH /:id/member-role ───────────────────────────────────
// Change a member's role (planner/traveler)
router.patch("/:id/member-role", async (req: AuthRequest, res) => {
  const { travelerId, role } = req.body;
  const tripId = req.params.id as string;

  if (!travelerId || !["planner", "traveler"].includes(role)) {
    res.status(400).json({ error: "Valid travelerId and role (planner/traveler) required" });
    return;
  }

  // Only planners can change roles
  if (req.user?.travelerId) {
    const callerRole = await getUserRole(req.user.travelerId, tripId);
    if (callerRole !== "planner") {
      res.status(403).json({ error: "Only planners can change roles" });
      return;
    }
  }

  const member = await prisma.tripMember.findUnique({
    where: { tripId_travelerId: { tripId, travelerId } },
  });
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const updated = await prisma.tripMember.update({
    where: { id: member.id },
    data: { role },
    include: { traveler: true },
  });

  res.json({
    id: updated.id,
    travelerId: updated.travelerId,
    displayName: updated.traveler.displayName,
    role: updated.role,
  });
});

export default router;
