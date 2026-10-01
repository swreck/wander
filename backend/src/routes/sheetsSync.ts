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
import { getUserRole } from "../middleware/role.js";
import { logChange } from "../services/changeLog.js";
import { itemMemberParam } from "../middleware/role.js";
import { tripOf } from "../middleware/tripGuard.js";

const router = Router();
router.use(requireAuth);
// A route naming one item is for the people on that item's trip (Oct 1 2026)
router.param("id", itemMemberParam(tripOf.planningAction));
// Every route that names a trip (status, conflicts, actions, notes) is for that trip's own people only
router.param("tripId", async (req: AuthRequest, res, next, tripId: string) => {
  if (req.user?.travelerId && !(await getUserRole(req.user.travelerId, tripId))) {
    res.status(403).json({ error: "That trip isn't one of yours." });
    return;
  }
  next();
});

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
    // Her sheet's own tab order, from the copy Wander read (the list was A–Z: "Kyoto Tue, 1027…" among the K's)
    const snap = await prisma.guideSnapshot.findFirst({ where: { tripId, status: "current" }, orderBy: { importedAt: "desc" }, select: { tabs: true } });
    const tabOrder = (((snap?.tabs as any[]) || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((t) => t.name as string));
    res.json({ notes, byTab, tabGids, tabOrder });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Only the trip's own people touch its to-dos (Sep 30 2026: these routes checked sign-in only, so anyone signed in
// could change or delete another trip's to-dos). Sign-ins by code without a traveler aren't limited, as in trips.ts.
async function onTrip(req: AuthRequest, tripId: string) {
  if (!req.user?.travelerId) return true;
  return !!(await getUserRole(req.user.travelerId, tripId));
}

// ── POST /actions — Create a new planning action ─────────────
router.post("/actions", async (req: AuthRequest, res) => {
  try {
    const { tripId, action, owner, dueDate, notes } = req.body;
    if (!tripId || !action?.trim()) {
      res.status(400).json({ error: "tripId and action are required" });
      return;
    }
    if (!(await onTrip(req, tripId))) { res.status(403).json({ error: "That trip isn't one of yours." }); return; }

    const created = await prisma.planningAction.create({
      data: {
        tripId,
        action: action.trim(),
        owner: owner?.trim() || "Both",
        dueDate: dueDate?.trim() || null,
        notes: notes?.trim() || null,
        status: "open",
        createdBy: req.user!.displayName,
      },
    });

    // In History, like Scout's (round 12: a to-do added on screen left no trace; one added through Scout did)
    logChange({ tripId, user: req.user!, actionType: "action_added", entityType: "planning_action", entityId: created.id, entityName: created.action, description: `added a to-do: "${created.action}"` }).catch(() => {});
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /actions/:id — Update an action ────────────────────
router.patch("/actions/:id", async (req: AuthRequest, res) => {
  try {
    const { action, owner, dueDate, notes, status } = req.body;
    const existing = await prisma.planningAction.findUnique({ where: { id: req.params.id as string }, select: { tripId: true } });
    if (!existing) { res.status(404).json({ error: "That to-do isn't there any more." }); return; }
    if (!(await onTrip(req, existing.tripId))) { res.status(403).json({ error: "That trip isn't one of yours." }); return; }

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

    if (status !== undefined) {
      logChange({ tripId: updated.tripId, user: req.user!, actionType: status === "done" ? "action_done" : "action_reopened", entityType: "planning_action", entityId: updated.id, entityName: updated.action, description: status === "done" ? `ticked off "${updated.action}"` : `marked "${updated.action}" not done` }).catch(() => {});
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /actions/:id — Remove an action ───────────────────
// Only one added in Wander: a to-do from Larisa's Guide stays until she changes her sheet (Wander is downstream)
router.delete("/actions/:id", async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.planningAction.findUnique({ where: { id: req.params.id as string }, select: { tripId: true, sheetRowRef: true, createdBy: true } });
    if (!existing) { res.status(404).json({ error: "That to-do isn't there any more." }); return; }
    if (!(await onTrip(req, existing.tripId))) { res.status(403).json({ error: "That trip isn't one of yours." }); return; }
    if (existing.sheetRowRef) { res.status(403).json({ error: "That to-do is from Larisa's Guide — it goes when she takes it out of her sheet." }); return; }
    // Only whoever added it takes it out, like a note or a plan (round 12: Ken was offered "Take out" on Larisa's)
    if (existing.createdBy && existing.createdBy !== req.user!.displayName) { res.status(403).json({ error: `That's ${existing.createdBy}'s to-do — only ${existing.createdBy} can take it out.` }); return; }
    const gone = await prisma.planningAction.delete({
      where: { id: req.params.id as string },
    });
    logChange({ tripId: gone.tripId, user: req.user!, actionType: "action_removed", entityType: "planning_action", entityId: gone.id, entityName: gone.action, description: `took out the to-do "${gone.action}"`, previousState: gone }).catch(() => {});
    res.json({ deleted: true });
  } catch (err: any) {
    // Two quick taps: the second finds it already gone — that's the result asked for, not an error (round 12)
    if (err?.code === "P2025") { res.json({ deleted: true }); return; }
    res.status(500).json({ error: err.message });
  }
});

export default router;
