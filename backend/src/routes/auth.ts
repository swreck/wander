import { Router } from "express";
import prisma from "../services/db.js";
import crypto from "crypto";
import { parseAccessCodes, signToken, requireAuth, type AuthRequest } from "../middleware/auth.js";
import { stringSimilarity } from "../services/geocoding.js";
import { getUserRole } from "../middleware/role.js";

const router = Router();

// ── GET /travelers ─────────────────────────────────────────────
// Returns traveler names for the login page (no auth required)
router.get("/travelers", async (_req, res) => {
  const travelers = await prisma.traveler.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, displayName: true },
  });

  if (travelers.length > 0) {
    res.json(travelers);
    return;
  }

  // Fallback to ACCESS_CODES if no travelers seeded yet
  const codes = parseAccessCodes();
  const list = Array.from(codes.entries()).map(([code, name]) => ({
    id: code,
    displayName: name,
  }));
  res.json(list);
});

// ── POST /login ────────────────────────────────────────────────
// Accepts { code: "displayName" } — looks up Traveler table first,
// then falls back to ACCESS_CODES for backward compatibility.
router.post("/login", async (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Access code required" });
    return;
  }

  const trimmed = code.trim();

  // Try Traveler table first (case-insensitive)
  const traveler = await prisma.traveler.findFirst({
    where: { displayName: { equals: trimmed, mode: "insensitive" } },
  });

  if (traveler) {
    // Get role on active trip
    const activeTrip = await prisma.trip.findFirst({ where: { status: "active" } });
    let role: string | undefined;
    if (activeTrip) {
      const r = await getUserRole(traveler.id, activeTrip.id);
      if (r) role = r;
    }
    const token = signToken({
      code: traveler.displayName,
      displayName: traveler.displayName,
      travelerId: traveler.id,
      role,
    });
    res.json({ token, displayName: traveler.displayName, travelerId: traveler.id, role });
    return;
  }

  // Fallback to ACCESS_CODES
  const codes = parseAccessCodes();
  const displayName = codes.get(trimmed);
  if (!displayName) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  const token = signToken({ code: trimmed, displayName });
  res.json({ token, displayName });
});

// ── GET /me ────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  // Look up current role on active trip
  let role: string | undefined;
  if (req.user!.travelerId) {
    const activeTrip = await prisma.trip.findFirst({ where: { status: "active" } });
    if (activeTrip) {
      const r = await getUserRole(req.user!.travelerId, activeTrip.id);
      if (r) role = r;
    }
  }
  res.json({
    code: req.user!.code,
    displayName: req.user!.displayName,
    travelerId: req.user!.travelerId,
    role: role || req.user!.role,
  });
});

// ── POST /login-event ─────────────────────────────────────────
// Record device/IP on login for anomaly detection
router.post("/login-event", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.travelerId) {
    res.json({ recorded: false });
    return;
  }
  try {
    const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      || req.socket.remoteAddress || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    await prisma.loginEvent.create({
      data: {
        travelerId: req.user.travelerId,
        ipAddress,
        userAgent,
      },
    });
    res.json({ recorded: true });
  } catch {
    res.json({ recorded: false });
  }
});

// ── GET /join/:token ───────────────────────────────────────────
// Public endpoint — shows trip info for an invite link.
// Checks personal invite tokens first, then trip-level tokens.
router.get("/join/:token", async (req, res) => {
  const tokenValue = req.params.token as string;

  // 1. Check personal invite token first
  const personalInvite = await prisma.tripInvite.findUnique({
    where: { inviteToken: tokenValue },
    include: {
      trip: {
        include: {
          tripMembers: { include: { traveler: true } },
          tripInvites: true,
        },
      },
    },
  });

  if (personalInvite) {
    const trip = personalInvite.trip;
    const members = trip.tripMembers.map((m) => m.traveler.displayName);
    // Count cities and experiences for the trip snapshot
    const [cityCount, experienceCount, firstCity] = await Promise.all([
      prisma.city.count({ where: { tripId: trip.id, hidden: false } }),
      prisma.experience.count({ where: { tripId: trip.id } }),
      prisma.city.findFirst({ where: { tripId: trip.id, hidden: false }, orderBy: { sequenceOrder: "asc" }, select: { name: true } }),
    ]);
    const dateRange = trip.startDate && trip.endDate
      ? `${new Date(trip.startDate).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })} – ${new Date(trip.endDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}`
      : null;
    res.json({
      tripId: trip.id,
      tripName: trip.name,
      personalInvite: true,
      expectedName: personalInvite.expectedName,
      alreadyClaimed: !!personalInvite.claimedByTravelerId,
      expectedNames: [],
      currentMembers: members,
      cityCount,
      experienceCount,
      dateRange,
      firstCityName: firstCity?.name || null,
    });
    return;
  }

  // 2. Fall back to trip-level invite token
  const trip = await prisma.trip.findUnique({
    where: { inviteToken: tokenValue },
    include: {
      tripInvites: true,
      tripMembers: { include: { traveler: true } },
    },
  });

  if (!trip) {
    res.status(404).json({ error: "Invalid or expired invite link" });
    return;
  }

  const unclaimed = trip.tripInvites.filter((i) => !i.claimedByTravelerId);
  const members = trip.tripMembers.map((m) => m.traveler.displayName);

  res.json({
    tripId: trip.id,
    tripName: trip.name,
    personalInvite: false,
    expectedNames: unclaimed.map((i) => i.expectedName),
    currentMembers: members,
  });
});

// ── POST /join/:token ──────────────────────────────────────────
// Public endpoint — join a trip via invite link.
// Personal tokens: auto-identify by name, no name entry needed.
// Trip-level tokens: require name, fuzzy-match against expected list.
router.post("/join/:token", async (req, res) => {
  const tokenValue = req.params.token as string;

  // 1. Check personal invite token first
  const personalInvite = await prisma.tripInvite.findUnique({
    where: { inviteToken: tokenValue },
    include: { trip: true },
  });

  if (personalInvite) {
    if (personalInvite.claimedByTravelerId) {
      // Already claimed — return existing traveler's token
      const existingTraveler = await prisma.traveler.findUnique({
        where: { id: personalInvite.claimedByTravelerId },
      });
      if (existingTraveler) {
        const role = await getUserRole(existingTraveler.id, personalInvite.tripId);
        const token = signToken({
          code: existingTraveler.displayName,
          displayName: existingTraveler.displayName,
          travelerId: existingTraveler.id,
          role: role || "traveler",
        });
        res.json({ token, displayName: existingTraveler.displayName, alreadyMember: true, tripId: personalInvite.tripId });
        return;
      }
    }

    // Claim the personal invite
    const cleanName = personalInvite.expectedName;
    let traveler = await prisma.traveler.findFirst({
      where: { displayName: { equals: cleanName, mode: "insensitive" } },
    });
    if (!traveler) {
      traveler = await prisma.traveler.create({
        data: { displayName: cleanName },
      });
    }

    // Check if already a member
    const existingMember = await prisma.tripMember.findUnique({
      where: { tripId_travelerId: { tripId: personalInvite.tripId, travelerId: traveler.id } },
    });
    if (!existingMember) {
      await prisma.tripMember.create({
        data: { tripId: personalInvite.tripId, travelerId: traveler.id, role: "traveler" },
      });
    }

    // Mark invite as claimed
    await prisma.tripInvite.update({
      where: { id: personalInvite.id },
      data: { claimedByTravelerId: traveler.id, claimedAt: new Date() },
    });

    // Activate trip for this user
    await prisma.trip.updateMany({
      where: { status: "active" },
      data: { status: "archived" },
    });
    await prisma.trip.update({
      where: { id: personalInvite.tripId },
      data: { status: "active" },
    });

    const role = await getUserRole(traveler.id, personalInvite.tripId);
    const token = signToken({
      code: traveler.displayName,
      displayName: traveler.displayName,
      travelerId: traveler.id,
      role: role || "traveler",
    });

    res.json({
      token,
      displayName: traveler.displayName,
      tripId: personalInvite.tripId,
      matched: true,
      unexpected: false,
    });
    return;
  }

  // 2. Fall back to trip-level invite token
  const { name } = req.body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  const cleanName = name.trim();
  const trip = await prisma.trip.findUnique({
    where: { inviteToken: tokenValue },
    include: { tripInvites: true },
  });

  if (!trip) {
    res.status(404).json({ error: "Invalid or expired invite link" });
    return;
  }

  // Find or create traveler
  let traveler = await prisma.traveler.findFirst({
    where: { displayName: { equals: cleanName, mode: "insensitive" } },
  });
  if (!traveler) {
    traveler = await prisma.traveler.create({
      data: { displayName: cleanName },
    });
  }

  // Check if already a member
  const existing = await prisma.tripMember.findUnique({
    where: {
      tripId_travelerId: { tripId: trip.id, travelerId: traveler.id },
    },
  });
  if (existing) {
    const role = await getUserRole(traveler.id, trip.id);
    const token = signToken({
      code: traveler.displayName,
      displayName: traveler.displayName,
      travelerId: traveler.id,
      role: role || "traveler",
    });
    res.json({ token, displayName: traveler.displayName, alreadyMember: true, tripId: trip.id });
    return;
  }

  // Fuzzy match against unclaimed invites
  const unclaimed = trip.tripInvites.filter((i) => !i.claimedByTravelerId);
  const match = unclaimed.find((i) => {
    if (i.expectedName.toLowerCase() === cleanName.toLowerCase()) return true;
    return stringSimilarity(
      i.expectedName.toLowerCase(),
      cleanName.toLowerCase(),
    ) > 0.85;
  });

  // Create membership — new joiners via trip-level token are travelers
  await prisma.tripMember.create({
    data: { tripId: trip.id, travelerId: traveler.id, role: "traveler" },
  });

  // Claim invite if matched
  let unexpected = false;
  if (match) {
    await prisma.tripInvite.update({
      where: { id: match.id },
      data: { claimedByTravelerId: traveler.id, claimedAt: new Date() },
    });
  } else if (unclaimed.length > 0) {
    unexpected = true;
    console.warn(
      `[invite] UNEXPECTED JOIN: "${cleanName}" joined trip "${trip.name}" but wasn't on the expected list. Expected: ${unclaimed.map((i) => i.expectedName).join(", ")}`,
    );
  }

  const role = await getUserRole(traveler.id, trip.id);
  const token = signToken({
    code: traveler.displayName,
    displayName: traveler.displayName,
    travelerId: traveler.id,
    role: role || "traveler",
  });

  res.json({
    token,
    displayName: traveler.displayName,
    tripId: trip.id,
    matched: !!match,
    unexpected,
  });
});

// ── GET /travelers/:id ──────────────────────────────────────────
// Returns a single traveler with preferences
router.get("/travelers/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const traveler = await prisma.traveler.findUnique({
    where: { id },
    select: { id: true, displayName: true, preferences: true, createdAt: true },
  });
  if (!traveler) {
    res.status(404).json({ error: "Traveler not found" });
    return;
  }
  res.json(traveler);
});

// ── PATCH /travelers/:id ──────────────────────────────────────────
// Update traveler preferences
router.patch("/travelers/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const { preferences } = req.body;
  const traveler = await prisma.traveler.update({
    where: { id },
    data: { preferences },
    select: { id: true, displayName: true, preferences: true },
  });
  res.json(traveler);
});

export default router;
