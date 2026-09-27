/**
 * Guide (sheet) API Routes — read-only view of what Wander holds from Larisa's Guide
 *
 * GET    /api/sheets-sync/status/:tripId     — When Wander last read the Guide
 * GET    /api/sheets-sync/conflicts/:tripId  — Past conflict log entries
 * GET    /api/sheets-sync/actions/:tripId    — Planning actions from the Guide
 * GET    /api/sheets-sync/notes/:tripId      — Notes captured from the Guide's tabs
 * POST/PATCH/DELETE /api/sheets-sync/actions — Wander's own copy of actions (never written to the sheet)
 *
 * Wander is downstream of Larisa's sheet (Sep 2026): it never writes to a sheet.
 * The old import/pull/push/config routes were removed; reading the Guide from a
 * snapshot file replaces import/pull.
 */

import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// ── GET /status — Current sync status ────────────────────────
router.get("/status/:tripId", async (req: AuthRequest, res) => {
  try {
    const tripId = req.params.tripId as string;
    const config = await prisma.sheetSyncConfig.findUnique({
      where: { tripId },
    });

    if (!config) {
      res.json({ configured: false });
      return;
    }

    res.json({
      configured: true,
      spreadsheetId: config.spreadsheetId,
      syncIntervalMs: config.syncIntervalMs,
      lastSyncAt: config.lastSyncAt,
      lastSyncStatus: config.lastSyncStatus,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /conflicts — Recent conflict log ─────────────────────
router.get("/conflicts/:tripId", async (req: AuthRequest, res) => {
  try {
    const tripId = req.params.tripId as string;
    const logs = await prisma.$queryRawUnsafe(`
      SELECT * FROM sheet_sync_logs
      WHERE trip_id = $1 AND status = 'conflict'
      ORDER BY created_at DESC
      LIMIT 20
    `, tripId) as any[];

    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /actions — Planning actions from Guide ───────────────
router.get("/actions/:tripId", async (req: AuthRequest, res) => {
  try {
    const tripId = req.params.tripId as string;
    const actions = await prisma.planningAction.findMany({
      where: { tripId },
      orderBy: { createdAt: "asc" },
    });
    res.json(actions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /notes — Sheet notes from narrative tabs ─────────────
// Returns all text rows captured from Flight info, Tokyo Hotel Info, meeting summaries, etc.
// Grouped by tab so the UI can render a "Notes from the Guide" section per source tab.
router.get("/notes/:tripId", async (req: AuthRequest, res) => {
  try {
    const tripId = req.params.tripId as string;
    const notes = await prisma.sheetNote.findMany({
      where: { tripId },
      orderBy: [{ tabName: "asc" }, { rowIndex: "asc" }],
    });
    // Group by tab for easier frontend rendering
    const byTab: Record<string, { rowIndex: number; text: string }[]> = {};
    for (const n of notes) {
      if (!byTab[n.tabName]) byTab[n.tabName] = [];
      byTab[n.tabName].push({ rowIndex: n.rowIndex, text: n.text });
    }
    // Include tabGids from sync config for deep-linked sheet URLs
    const config = await prisma.sheetSyncConfig.findUnique({ where: { tripId } });
    const tabGids = (config?.tabMappings as any)?.tabGids || {};
    res.json({ notes, byTab, tabGids });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /actions — Create a new planning action ─────────────
router.post("/actions", async (req: AuthRequest, res) => {
  try {
    const { tripId, action, owner, dueDate, notes } = req.body;
    if (!tripId || !action?.trim()) {
      res.status(400).json({ error: "tripId and action are required" });
      return;
    }

    const created = await prisma.planningAction.create({
      data: {
        tripId,
        action: action.trim(),
        owner: owner?.trim() || "Both",
        dueDate: dueDate?.trim() || null,
        notes: notes?.trim() || null,
        status: "open",
      },
    });

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /actions/:id — Update an action ────────────────────
router.patch("/actions/:id", async (req: AuthRequest, res) => {
  try {
    const { action, owner, dueDate, notes, status } = req.body;

    const updated = await prisma.planningAction.update({
      where: { id: req.params.id as string },
      data: {
        ...(action !== undefined && { action: action.trim() }),
        ...(owner !== undefined && { owner: owner.trim() }),
        ...(dueDate !== undefined && { dueDate: dueDate?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(status !== undefined && { status }),
      },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /actions/:id — Remove an action ───────────────────
router.delete("/actions/:id", async (req: AuthRequest, res) => {
  try {
    await prisma.planningAction.delete({
      where: { id: req.params.id as string },
    });
    res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
