import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import {
  RP_ID,
  RP_NAME,
  EXPECTED_ORIGINS,
  normalizeCredentials,
  publicKeyBytes,
  saveCounter,
} from "../services/passkeys.js";

const router = Router();
router.use(requireAuth);

const VAULT_SECRET = process.env.JWT_SECRET || "dev-secret";

// ── Vault token: short-lived, separate from auth JWT ─────────
function signVaultToken(travelerId: string): string {
  return jwt.sign({ travelerId, vault: true }, VAULT_SECRET, { expiresIn: "5m" });
}

export function verifyVaultToken(token: string): { travelerId: string } {
  const payload = jwt.verify(token, VAULT_SECRET) as any;
  if (!payload.vault) throw new Error("Not a vault token");
  return { travelerId: payload.travelerId };
}

// Guard: all vault routes require a linked traveler identity
router.use((req: AuthRequest, res, next) => {
  if (!req.user?.travelerId) {
    res.status(400).json({ error: "No traveler identity linked to your account" });
    return;
  }
  next();
});

// ── Check vault status (has PIN? has biometrics?) ────────────
router.get("/status", async (req: AuthRequest, res) => {
  const traveler = await prisma.traveler.findUnique({
    where: { id: req.user!.travelerId },
    select: { pinHash: true, webauthnCredentials: true },
  });

  if (!traveler) { res.status(404).json({ error: "Traveler not found" }); return; }

  res.json({
    hasPin: !!traveler.pinHash,
    hasBiometric: Array.isArray(traveler.webauthnCredentials) && traveler.webauthnCredentials.length > 0,
  });
});

// ── Set PIN (first time or after reset) ──────────────────────
router.post("/set-pin", async (req: AuthRequest, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 4 digits" });
    return;
  }

  const traveler = await prisma.traveler.findUnique({
    where: { id: req.user!.travelerId },
    select: { pinHash: true },
  });
  if (!traveler) { res.status(404).json({ error: "Traveler not found" }); return; }

  // Don't allow overwriting existing PIN (must use reset flow)
  if (traveler.pinHash) {
    res.status(400).json({ error: "PIN already set. Ask a planner to reset it if you forgot it." });
    return;
  }

  const hash = await bcrypt.hash(pin, 10);
  await prisma.traveler.update({
    where: { id: req.user!.travelerId },
    data: { pinHash: hash },
  });

  // Return a vault token so they can immediately add their document
  const vaultToken = signVaultToken(req.user!.travelerId!);
  res.json({ success: true, vaultToken });
});

// ── Unlock with PIN ──────────────────────────────────────────
router.post("/unlock", async (req: AuthRequest, res) => {
  const { pin } = req.body;
  if (!pin) { res.status(400).json({ error: "PIN required" }); return; }

  const traveler = await prisma.traveler.findUnique({
    where: { id: req.user!.travelerId },
    select: { pinHash: true },
  });
  if (!traveler?.pinHash) {
    res.status(400).json({ error: "No PIN set" });
    return;
  }

  const match = await bcrypt.compare(pin, traveler.pinHash);
  if (!match) {
    res.status(401).json({ error: "Wrong PIN" });
    return;
  }

  const vaultToken = signVaultToken(req.user!.travelerId!);
  res.json({ vaultToken });
});

// ── Reset PIN (planner only) ─────────────────────────────────
router.post("/reset-pin/:travelerId", async (req: AuthRequest, res) => {
  // Verify the requester is a planner on a shared trip
  const targetId = req.params.travelerId as string;
  const requester = req.user!;

  // Find any trip where requester is planner and target is member
  const plannerMemberships = await prisma.tripMember.findMany({
    where: { travelerId: requester.travelerId, role: "planner" },
    select: { tripId: true },
  });
  const plannerTripIds = plannerMemberships.map((m) => m.tripId);

  const sharedTrip = await prisma.tripMember.findFirst({
    where: { travelerId: targetId, tripId: { in: plannerTripIds } },
  });
  if (!sharedTrip) {
    res.status(403).json({ error: "You must be a planner on a shared trip to reset someone's PIN" });
    return;
  }

  // Clear the PIN only. Face ID passkeys are also how people sign in to Wander,
  // so wiping them here would lock the person out of the app entirely.
  await prisma.traveler.update({
    where: { id: targetId },
    data: { pinHash: null },
  });

  const target = await prisma.traveler.findUnique({
    where: { id: targetId },
    select: { displayName: true },
  });

  res.json({ success: true, message: `${target?.displayName}'s vault PIN has been reset` });
});

// ── WebAuthn: Start registration (after PIN is set) ──────────
router.post("/webauthn/register-options", async (req: AuthRequest, res) => {
  const traveler = await prisma.traveler.findUnique({
    where: { id: req.user!.travelerId },
    select: { id: true, displayName: true, pinHash: true, webauthnCredentials: true },
  });
  if (!traveler) { res.status(404).json({ error: "Traveler not found" }); return; }
  if (!traveler.pinHash) {
    res.status(400).json({ error: "Set a PIN first" });
    return;
  }

  const existingCreds = normalizeCredentials(traveler.webauthnCredentials);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: traveler.displayName,
    userID: new TextEncoder().encode(traveler.id),
    attestationType: "none",
    excludeCredentials: existingCreds.map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
    authenticatorSelection: {
      residentKey: "required", // the same passkey also signs in to Wander
      userVerification: "required",
    },
  });

  // Store challenge for verification
  await prisma.traveler.update({
    where: { id: traveler.id },
    data: { webauthnChallenge: options.challenge },
  });

  res.json(options);
});

// ── WebAuthn: Complete registration ──────────────────────────
router.post("/webauthn/register-verify", async (req: AuthRequest, res) => {
  const traveler = await prisma.traveler.findUnique({
    where: { id: req.user!.travelerId },
    select: { id: true, webauthnChallenge: true, webauthnCredentials: true },
  });
  if (!traveler?.webauthnChallenge) {
    res.status(400).json({ error: "No pending registration" });
    return;
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: traveler.webauthnChallenge,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: "Verification failed" });
      return;
    }

    const { credential } = verification.registrationInfo;
    const existingCreds = normalizeCredentials(traveler.webauthnCredentials);

    const newCred = {
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports || req.body.response?.transports || [],
      createdAt: new Date().toISOString(),
    };

    await prisma.traveler.update({
      where: { id: traveler.id },
      data: {
        webauthnCredentials: [...existingCreds.filter((c) => c.id !== newCred.id), newCred] as any,
        webauthnChallenge: null,
      },
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── WebAuthn: Start authentication ───────────────────────────
router.post("/webauthn/auth-options", async (req: AuthRequest, res) => {
  const traveler = await prisma.traveler.findUnique({
    where: { id: req.user!.travelerId },
    select: { id: true, webauthnCredentials: true },
  });
  if (!traveler) { res.status(404).json({ error: "Traveler not found" }); return; }

  const creds = normalizeCredentials(traveler.webauthnCredentials);
  if (creds.length === 0) {
    res.status(400).json({ error: "No biometric credentials registered" });
    return;
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: creds.map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
    userVerification: "required",
  });

  await prisma.traveler.update({
    where: { id: traveler.id },
    data: { webauthnChallenge: options.challenge },
  });

  res.json(options);
});

// ── WebAuthn: Verify authentication → vault token ────────────
router.post("/webauthn/auth-verify", async (req: AuthRequest, res) => {
  const traveler = await prisma.traveler.findUnique({
    where: { id: req.user!.travelerId },
    select: { id: true, webauthnChallenge: true, webauthnCredentials: true },
  });
  if (!traveler?.webauthnChallenge) {
    res.status(400).json({ error: "No pending authentication" });
    return;
  }

  const creds = normalizeCredentials(traveler.webauthnCredentials);

  try {
    // Find the credential used (credential IDs are base64url strings on both sides)
    const matchedCred = creds.find((c) => c.id === req.body.id);

    if (!matchedCred) {
      res.status(400).json({ error: "Credential not recognized" });
      return;
    }

    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: traveler.webauthnChallenge,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID,
      credential: {
        id: matchedCred.id,
        publicKey: publicKeyBytes(matchedCred),
        counter: matchedCred.counter,
        transports: matchedCred.transports,
      },
    });

    if (!verification.verified) {
      res.status(400).json({ error: "Verification failed" });
      return;
    }

    // Update counter (and store any legacy-shaped credentials in the current shape)
    await saveCounter(traveler.id, creds, matchedCred.id, verification.authenticationInfo.newCounter);
    await prisma.traveler.update({
      where: { id: traveler.id },
      data: { webauthnChallenge: null },
    });

    const vaultToken = signVaultToken(traveler.id);
    res.json({ vaultToken });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
