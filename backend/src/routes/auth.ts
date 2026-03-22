import { Router } from "express";
import prisma from "../services/db.js";
import crypto from "crypto";
import { parseAccessCodes, signToken, requireAuth, type AuthRequest } from "../middleware/auth.js";
import { stringSimilarity } from "../services/geocoding.js";

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
    const token = signToken({
      code: traveler.displayName,
      displayName: traveler.displayName,
      travelerId: traveler.id,
    });
    res.json({ token, displayName: traveler.displayName });
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
router.get("/me", requireAuth, (req: AuthRequest, res) => {
  res.json({
    code: req.user!.code,
    displayName: req.user!.displayName,
    travelerId: req.user!.travelerId,
  });
});

// ── GET /join/:token ───────────────────────────────────────────
// Public endpoint — shows trip info for an invite link
router.get("/join/:token", async (req, res) => {
  const trip = await prisma.trip.findUnique({
    where: { inviteToken: req.params.token as string },
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
    expectedNames: unclaimed.map((i) => i.expectedName),
    currentMembers: members,
  });
});

// ── POST /join/:token ──────────────────────────────────────────
// Public endpoint — join a trip via invite link.
// Creates Traveler if new, creates TripMember, claims matching invite.
// Alerts if the joiner wasn't on the expected list.
router.post("/join/:token", async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  const cleanName = name.trim();
  const trip = await prisma.trip.findUnique({
    where: { inviteToken: req.params.token as string },
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
    const token = signToken({
      code: traveler.displayName,
      displayName: traveler.displayName,
      travelerId: traveler.id,
    });
    res.json({ token, displayName: traveler.displayName, alreadyMember: true });
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

  // Create membership
  await prisma.tripMember.create({
    data: { tripId: trip.id, travelerId: traveler.id, role: "member" },
  });

  // Claim invite if matched
  let unexpected = false;
  if (match) {
    await prisma.tripInvite.update({
      where: { id: match.id },
      data: { claimedByTravelerId: traveler.id, claimedAt: new Date() },
    });
  } else if (unclaimed.length > 0) {
    // There were expected names but this person wasn't one of them
    unexpected = true;
    console.warn(
      `[invite] UNEXPECTED JOIN: "${cleanName}" joined trip "${trip.name}" but wasn't on the expected list. Expected: ${unclaimed.map((i) => i.expectedName).join(", ")}`,
    );
  }
  // If unclaimed.length === 0, the invite had no expected names — open invite, no alert

  const token = signToken({
    code: traveler.displayName,
    displayName: traveler.displayName,
    travelerId: traveler.id,
  });

  res.json({
    token,
    displayName: traveler.displayName,
    tripId: trip.id,
    matched: !!match,
    unexpected,
  });
});

export default router;
