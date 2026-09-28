/**
 * Larisa's Guide — API
 *
 * POST /api/guide/import            Upload a snapshot (.xlsx saved from her Google Sheet). Planners only.
 * GET  /api/guide/status/:tripId    The current snapshot: when it was read, what was understood, what changed.
 * GET  /api/guide/items/:tripId     Dated/timed facts from the Guide (optionally ?date=YYYY-MM-DD).
 * GET  /api/guide/pictures/:tripId  Pictures pasted into the Guide, with short-lived links to view them.
 * GET  /api/guide/picture/:tripId/:sha?t=...  One picture (link from the list above).
 *
 * Wander only reads snapshots here; nothing is ever written back to the sheet.
 */

import { Router } from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getUserRole } from "../middleware/role.js";
import { importGuideSnapshot } from "../services/guide/importSnapshot.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const PICTURE_SECRET = process.env.JWT_SECRET || "dev-secret";

// ── One picture, by short-lived link (no auth header: <img> tags can't send one) ──
router.get("/picture/:tripId/:sha", async (req, res) => {
  try {
    const payload = jwt.verify(String(req.query.t || ""), PICTURE_SECRET) as any;
    if (payload.picture !== `${req.params.tripId}:${req.params.sha}`) throw new Error("mismatch");
  } catch {
    res.status(403).json({ error: "This picture link has expired. Reopen the page to see it." });
    return;
  }
  const img = await prisma.guideImage.findUnique({
    where: { tripId_sha256: { tripId: req.params.tripId, sha256: req.params.sha } },
    select: { bytes: true, mimeType: true },
  });
  if (!img) { res.status(404).json({ error: "Picture not found" }); return; }
  res.setHeader("Content-Type", img.mimeType);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(Buffer.from(img.bytes));
});

router.use(requireAuth);

async function isMember(req: AuthRequest, tripId: string) {
  if (!req.user?.travelerId) return false;
  return !!(await getUserRole(req.user.travelerId, tripId));
}

// ── Import a snapshot ──
router.post("/import", upload.single("file"), async (req: AuthRequest, res) => {
  const file = (req as any).file as { buffer: Buffer; originalname: string } | undefined;
  if (!file) { res.status(400).json({ error: "Choose the Excel file you saved from Larisa's Guide." }); return; }
  if (!/\.xlsx$/i.test(file.originalname)) { res.status(400).json({ error: "That isn't an Excel file. In Google Sheets: File → Download → Microsoft Excel (.xlsx)." }); return; }
  const tripId = (req.body?.tripId as string) || undefined;
  if (!req.user?.travelerId) { res.status(403).json({ error: "Sign in first." }); return; }
  if (tripId) {
    if ((await getUserRole(req.user.travelerId, tripId)) !== "planner") {
      res.status(403).json({ error: "Only the trip's planners can bring in a new version of the Guide." });
      return;
    }
  } else {
    const plannerSomewhere = await prisma.tripMember.findFirst({ where: { travelerId: req.user.travelerId, role: { in: ["planner", "owner"] } } });
    if (!plannerSomewhere) { res.status(403).json({ error: "Only planners can start a trip from the Guide." }); return; }
  }
  try {
    const report = await importGuideSnapshot({
      buffer: file.buffer, sourceName: file.originalname, importedBy: req.user.displayName, tripId, tripName: req.body?.tripName,
    });
    res.status(report.accepted ? 200 : 422).json(report);
  } catch (err: any) {
    console.error("[guide] import failed:", err.message);
    res.status(500).json({ error: "That version didn't come in. Wander is still showing the previous one." });
  }
});

// ── Current snapshot status ──
router.get("/status/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!(await isMember(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const current = await prisma.guideSnapshot.findFirst({
    where: { tripId, status: "current" }, orderBy: { importedAt: "desc" },
    select: { id: true, sourceName: true, importedAt: true, importedBy: true, report: true },
  });
  const lastRejected = await prisma.guideSnapshot.findFirst({
    where: { tripId, status: "rejected" }, orderBy: { importedAt: "desc" },
    select: { sourceName: true, importedAt: true, report: true },
  });
  res.json({ current, lastRejected: lastRejected && current && lastRejected.importedAt > current.importedAt ? lastRejected : null });
});

// ── Dated facts ──
router.get("/items/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!(await isMember(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
  const items = await prisma.guideItem.findMany({
    where: { tripId, ...(date ? { date: new Date(`${date}T00:00:00Z`) } : {}) },
    orderBy: [{ date: "asc" }, { time: "asc" }, { sortOrder: "asc" }],
  });
  res.json(items);
});

// ── Pictures, with short-lived links ──
router.get("/pictures/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!(await isMember(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const current = await prisma.guideSnapshot.findFirst({ where: { tripId, status: "current" }, orderBy: { importedAt: "desc" }, select: { tabs: true } });
  const images = await prisma.guideImage.findMany({ where: { tripId }, select: { sha256: true, readStatus: true, facts: true } });
  const bySha = new Map(images.map((i) => [i.sha256, i]));
  const tabs = ((current?.tabs as any[]) || []).filter((t) => t.images?.length);
  res.json(tabs.map((t) => ({
    tab: t.name,
    pictures: t.images.map((p: { anchor: string; sha256: string }) => {
      const img = bySha.get(p.sha256);
      const token = jwt.sign({ picture: `${tripId}:${p.sha256}` }, PICTURE_SECRET, { expiresIn: "10m" });
      return {
        anchor: p.anchor,
        url: `/api/guide/picture/${tripId}/${p.sha256}?t=${token}`,
        summary: (img?.facts as any)?.summary || null,
        read: img?.readStatus === "read",
      };
    }),
  })));
});

export default router;
