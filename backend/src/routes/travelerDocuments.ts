import { Router } from "express";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { verifyVaultToken } from "./vault.js";

const router = Router();
router.use(requireAuth);

// Sensitive document types that require vault unlock to view details
const SENSITIVE_TYPES = ["passport", "visa", "insurance"];

// Redact sensitive fields from documents unless vault is unlocked
function redactDocuments(docs: any[], userCode: string, vaultUnlocked: boolean) {
  return docs.map((d) => {
    if (!SENSITIVE_TYPES.includes(d.type)) return d;
    if (vaultUnlocked && d.profile?.userCode === userCode) return d; // Own docs, vault open
    if (vaultUnlocked) {
      // Others' non-private docs: show type and label but redact data
      return { ...d, data: { redacted: true } };
    }
    // Vault locked: show existence but redact data
    return { ...d, data: { locked: true } };
  });
}

// Check if the request has a valid vault token
function isVaultUnlocked(req: AuthRequest): boolean {
  const vaultHeader = req.headers["x-vault-token"] as string;
  if (!vaultHeader) return false;
  try {
    const payload = verifyVaultToken(vaultHeader);
    return payload.travelerId === req.user!.travelerId;
  } catch {
    return false;
  }
}

// Valid document types and their expected data fields (all optional within data)
const VALID_TYPES = ["passport", "visa", "frequent_flyer", "insurance", "ticket", "custom"] as const;

// Get current user's profile + documents for a trip
router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const vaultOpen = isVaultUnlocked(req);
  const profile = await prisma.travelerProfile.findUnique({
    where: {
      tripId_userCode: {
        tripId: req.params.tripId as string,
        userCode: req.user!.code,
      },
    },
    include: { documents: { orderBy: { createdAt: "asc" } } },
  });
  if (!profile) { res.json({ documents: [] }); return; }

  // Redact sensitive document data if vault is locked
  const docs = profile.documents.map((d) => {
    if (!SENSITIVE_TYPES.includes(d.type) || vaultOpen) return d;
    return { ...d, data: { locked: true } };
  });
  res.json({ ...profile, documents: docs });
});

// Get all travelers' shared (non-private) documents for a trip
router.get("/trip/:tripId/shared", async (req: AuthRequest, res) => {
  const profiles = await prisma.travelerProfile.findMany({
    where: { tripId: req.params.tripId as string },
    include: {
      documents: { orderBy: { createdAt: "asc" } },
    },
  });

  // Filter: show all own docs, only non-private from others
  const result = profiles.map((p) => ({
    ...p,
    documents: p.documents.filter(
      (d) => p.userCode === req.user!.code || !d.isPrivate,
    ),
  }));

  res.json(result);
});

// Readiness check — what documents are stored vs. what's needed
router.get("/trip/:tripId/readiness", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
      travelerProfiles: {
        include: { documents: true },
      },
    },
  });

  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  const countries = [...new Set(trip.cities.map((c) => c.country).filter(Boolean))];
  const travelers = trip.travelerProfiles.map((p) => {
    const docs = p.documents;
    const hasPassport = docs.some((d) => d.type === "passport");
    const passportDoc = docs.find((d) => d.type === "passport");
    const passportExpiry = passportDoc ? (passportDoc.data as any)?.expiry : null;
    const hasInsurance = docs.some((d) => d.type === "insurance");
    const visaCountries = docs
      .filter((d) => d.type === "visa")
      .map((d) => (d.data as any)?.country)
      .filter(Boolean);
    const frequentFlyers = docs.filter((d) => d.type === "frequent_flyer");

    return {
      displayName: p.displayName,
      userCode: p.userCode,
      hasPassport,
      passportExpiry,
      hasInsurance,
      visaCountries,
      frequentFlyerCount: frequentFlyers.length,
      documentCount: docs.length,
    };
  });

  res.json({
    tripName: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    destinationCountries: countries,
    travelers,
  });
});

// Create a document (auto-creates profile if needed)
router.post("/", async (req: AuthRequest, res) => {
  const { tripId, type, data, isPrivate, label } = req.body;

  if (!tripId || !type) {
    res.status(400).json({ error: "tripId and type are required" });
    return;
  }
  if (!VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` });
    return;
  }

  // Upsert profile
  const profile = await prisma.travelerProfile.upsert({
    where: {
      tripId_userCode: {
        tripId,
        userCode: req.user!.code,
      },
    },
    update: { displayName: req.user!.displayName },
    create: {
      tripId,
      userCode: req.user!.code,
      displayName: req.user!.displayName,
    },
  });

  const doc = await prisma.travelerDocument.create({
    data: {
      profileId: profile.id,
      type,
      label: label || null,
      data: data || {},
      isPrivate: isPrivate ?? false,
    },
  });

  await logChange({
    user: req.user!,
    tripId,
    actionType: "document_added",
    entityType: "traveler_document",
    entityId: doc.id,
    entityName: `${type}${label ? ` (${label})` : ""}`,
    description: `${req.user!.displayName} added a ${type.replace("_", " ")} document`,
    newState: doc,
  });

  res.status(201).json(doc);
});

// Update a document (owner only)
router.patch("/:id", async (req: AuthRequest, res) => {
  const doc = await prisma.travelerDocument.findUnique({
    where: { id: req.params.id as string },
    include: { profile: true },
  });

  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (doc.profile.userCode !== req.user!.code) {
    res.status(403).json({ error: "You can only edit your own documents" });
    return;
  }

  const { data, isPrivate, label } = req.body;
  const updated = await prisma.travelerDocument.update({
    where: { id: req.params.id as string },
    data: {
      ...(data !== undefined ? { data } : {}),
      ...(isPrivate !== undefined ? { isPrivate } : {}),
      ...(label !== undefined ? { label } : {}),
    },
  });

  await logChange({
    user: req.user!,
    tripId: doc.profile.tripId,
    actionType: "document_updated",
    entityType: "traveler_document",
    entityId: updated.id,
    entityName: `${updated.type}${updated.label ? ` (${updated.label})` : ""}`,
    description: `${req.user!.displayName} updated a ${updated.type.replace("_", " ")} document`,
    previousState: doc,
    newState: updated,
  });

  res.json(updated);
});

// Delete a document (owner only)
router.delete("/:id", async (req: AuthRequest, res) => {
  const doc = await prisma.travelerDocument.findUnique({
    where: { id: req.params.id as string },
    include: { profile: true },
  });

  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (doc.profile.userCode !== req.user!.code) {
    res.status(403).json({ error: "You can only delete your own documents" });
    return;
  }

  await prisma.travelerDocument.delete({ where: { id: req.params.id as string } });

  await logChange({
    user: req.user!,
    tripId: doc.profile.tripId,
    actionType: "document_deleted",
    entityType: "traveler_document",
    entityId: doc.id,
    entityName: `${doc.type}${doc.label ? ` (${doc.label})` : ""}`,
    description: `${req.user!.displayName} deleted a ${doc.type.replace("_", " ")} document`,
    previousState: doc,
  });

  res.json({ deleted: true });
});

export default router;
