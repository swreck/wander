import { Router } from "express";
import prisma from "../services/db.js";
import crypto from "crypto";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { parseAccessCodes, signToken, requireAuth, type AuthRequest } from "../middleware/auth.js";
import { stringSimilarity } from "../services/geocoding.js";
import { getUserRole } from "../middleware/role.js";
import {
  RP_ID,
  RP_NAME,
  EXPECTED_ORIGINS,
  normalizeCredentials,
  publicKeyBytes,
  signChallenge,
  readChallenge,
  findTravelerByCredentialId,
  saveCounter,
  isLinkRetired,
} from "../services/passkeys.js";

/** What the link page says when a personal link has done its job. */
function retiredMessage(name: string) {
  return `${name} already uses Face ID, so this link has done its job. On that phone, open Wander and tap Sign in with Face ID. On a new phone, ask Ken or Larisa to send a new link from People in Wander.`;
}

const OPEN_LINK_OFF = "This trip no longer has an open invitation link. Ask Ken or Larisa to send you your own link from People in Wander.";

/** The person a personal link belongs to (the claimer, or the named traveler it was made for). */
async function linkOwnerId(invite: { claimedByTravelerId: string | null; expectedName: string }) {
  if (invite.claimedByTravelerId) return invite.claimedByTravelerId;
  const t = await prisma.traveler.findFirst({ where: { displayName: { equals: invite.expectedName, mode: "insensitive" } }, select: { id: true } });
  return t?.id || null;
}

const router = Router();

// Tapping a name used to sign anyone in as that person. In production, sign-in is by
// Face ID passkey or a personal invite link. Name sign-in stays for local development
// and tests, or when explicitly re-enabled with ALLOW_NAME_LOGIN=true.
function isNameLoginAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_NAME_LOGIN === "true";
}

async function issueLogin(traveler: { id: string; displayName: string }) {
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
  return { token, displayName: traveler.displayName, travelerId: traveler.id, role };
}

// ── GET /login-methods ─────────────────────────────────────────
// Tells the login screen which ways of signing in are available (no auth required).
router.get("/login-methods", (_req, res) => {
  res.json({ nameLogin: isNameLoginAllowed(), passkey: true });
});

// ── Passkey sign-in (Face ID) — no auth required ──────────────
router.post("/passkey/login-options", async (_req, res) => {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "required",
    allowCredentials: [], // discoverable: the phone offers whichever Wander passkey it holds
  });
  res.json({ options, challengeToken: signChallenge(options.challenge, "login") });
});

router.post("/passkey/login-verify", async (req, res) => {
  const { challengeToken, response } = req.body || {};
  if (!challengeToken || !response?.id) {
    res.status(400).json({ error: "Missing sign-in details" });
    return;
  }
  try {
    const expectedChallenge = readChallenge(challengeToken, "login");
    const found = await findTravelerByCredentialId(response.id);
    if (!found) {
      console.warn(`[passkey] sign-in with an unknown key (${String(response.id).slice(0, 8)}…)`);
      res.status(401).json({ error: "This Face ID isn't set up for Wander yet. Open your personal link to set it up." });
      return;
    }
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID,
      credential: {
        id: found.cred.id,
        publicKey: publicKeyBytes(found.cred),
        counter: found.cred.counter,
        transports: found.cred.transports,
      },
      requireUserVerification: true,
    });
    if (!verification.verified) {
      console.warn(`[passkey] sign-in not verified for ${found.traveler.displayName}`);
      res.status(401).json({ error: "Face ID didn't check out. Try again?" });
      return;
    }
    await saveCounter(found.traveler.id, found.creds, found.cred.id, verification.authenticationInfo.newCounter);
    res.json(await issueLogin(found.traveler));
  } catch (err: any) {
    console.warn(`[passkey] sign-in failed: ${err.message}`);
    res.status(401).json({ error: "Face ID didn't check out. Try again?", detail: err.message });
  }
});

// ── Passkey setup — signed-in traveler adds Face ID on this device ──
router.get("/passkey/status", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.travelerId) { res.json({ count: 0 }); return; }
  const t = await prisma.traveler.findUnique({ where: { id: req.user.travelerId }, select: { webauthnCredentials: true } });
  res.json({ count: normalizeCredentials(t?.webauthnCredentials).length });
});

router.post("/passkey/register-options", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.travelerId) {
    res.status(400).json({ error: "Open your personal link first, then set up Face ID." });
    return;
  }
  const traveler = await prisma.traveler.findUnique({
    where: { id: req.user.travelerId },
    select: { id: true, displayName: true, webauthnCredentials: true },
  });
  if (!traveler) { res.status(404).json({ error: "Traveler not found" }); return; }
  const existing = normalizeCredentials(traveler.webauthnCredentials);
  // replace: the phone holds a Wander key that no longer signs in — let it make a fresh one in its place
  const replace = req.body?.replace === true;
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: traveler.displayName,
    userDisplayName: traveler.displayName,
    userID: new TextEncoder().encode(traveler.id),
    attestationType: "none",
    excludeCredentials: replace ? [] : existing.map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: {
      residentKey: "required",       // lets Face ID sign in without typing a name
      userVerification: "required",
    },
  });
  res.json({ options, challengeToken: signChallenge(options.challenge, "register", traveler.id) });
});

router.post("/passkey/register-verify", requireAuth, async (req: AuthRequest, res) => {
  const { challengeToken, response } = req.body || {};
  if (!req.user?.travelerId || !challengeToken || !response) {
    res.status(400).json({ error: "Missing setup details" });
    return;
  }
  try {
    const expectedChallenge = readChallenge(challengeToken, "register", req.user.travelerId);
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      console.warn(`[passkey] setup not verified for ${req.user.displayName}`);
      res.status(400).json({ error: "Face ID setup didn't finish. Try again?" });
      return;
    }
    const { credential } = verification.registrationInfo;
    const traveler = await prisma.traveler.findUnique({ where: { id: req.user.travelerId }, select: { webauthnCredentials: true } });
    const existing = normalizeCredentials(traveler?.webauthnCredentials);
    const added = {
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports || response.response?.transports || [],
      createdAt: new Date().toISOString(),
    };
    await prisma.traveler.update({
      where: { id: req.user.travelerId },
      data: { webauthnCredentials: [...existing.filter((c) => c.id !== added.id), added] as any },
    });
    res.json({ success: true });
  } catch (err: any) {
    console.warn(`[passkey] setup failed for ${req.user?.displayName}: ${err.message}`);
    res.status(400).json({ error: "Face ID setup didn't finish. Try again?", detail: err.message });
  }
});

// ── Face ID problems seen on the phone ──
// Some failures happen entirely on the device (it refuses before anything reaches the server).
// The phone reports them here so they show up in the server log with their real cause.
router.post("/passkey/client-problem", (req, res) => {
  const clip = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").slice(0, 200);
  const { stage, name, code, message } = req.body || {};
  console.warn(`[passkey] phone reported: stage=${clip(stage)} name=${clip(name)} code=${clip(code)} message=${clip(message)} ua=${clip(req.headers["user-agent"])}`);
  res.json({ ok: true });
});

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
    if (!isNameLoginAllowed()) {
      res.status(403).json({ error: "Sign in with Face ID, or open your personal link." });
      return;
    }
    res.json(await issueLogin(traveler));
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
    if (await isLinkRetired(await linkOwnerId(personalInvite), personalInvite.createdAt)) {
      res.status(410).json({ error: retiredMessage(personalInvite.expectedName), retired: true, expectedName: personalInvite.expectedName });
      return;
    }
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

  // 2. The trip-wide open link (anyone with it could join under any name) is switched off:
  //    Wander now holds booking codes, so everyone gets their own link from People.
  const trip = await prisma.trip.findUnique({ where: { inviteToken: tokenValue }, select: { id: true } });
  if (trip) {
    res.status(410).json({ error: OPEN_LINK_OFF });
    return;
  }
  res.status(404).json({ error: "This link doesn't open anything — part of it may have been cut off when it was copied. Ask Ken or Larisa to send it again from People in Wander." });
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
    if (await isLinkRetired(await linkOwnerId(personalInvite), personalInvite.createdAt)) {
      res.status(410).json({ error: retiredMessage(personalInvite.expectedName), retired: true });
      return;
    }
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

  // 2. The trip-wide open link is switched off (anyone holding it could join under any name).
  const trip = await prisma.trip.findUnique({ where: { inviteToken: tokenValue }, select: { id: true } });
  if (trip) {
    res.status(410).json({ error: OPEN_LINK_OFF });
    return;
  }
  res.status(404).json({ error: "This link doesn't open anything — part of it may have been cut off when it was copied. Ask Ken or Larisa to send it again from People in Wander." });
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
  // Ownership check — users can only edit their own profile
  if (req.user!.travelerId !== id) {
    res.status(403).json({ error: "You can only update your own profile" });
    return;
  }
  const { preferences } = req.body;
  const traveler = await prisma.traveler.update({
    where: { id },
    data: { preferences },
    select: { id: true, displayName: true, preferences: true },
  });
  res.json(traveler);
});

export default router;
