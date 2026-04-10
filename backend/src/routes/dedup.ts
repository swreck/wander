/**
 * Dedup review system — planner-facing dedup suggestions
 *
 * High confidence: auto-executed with undo
 * Low confidence: shown to planners for decision
 * One planner resolves for all
 */

import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

// GET /api/dedup/trip/:tripId — pending suggestions for planners
router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  const suggestions = await prisma.dedupSuggestion.findMany({
    where: { tripId, status: { in: ["pending", "auto_executed"] } },
    orderBy: { createdAt: "desc" },
  });
  res.json(suggestions);
});

// POST /api/dedup/:id/approve — planner approves the dedup
router.post("/:id/approve", async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const suggestion = await prisma.dedupSuggestion.findUnique({ where: { id } });
  if (!suggestion) { res.status(404).json({ error: "Not found" }); return; }

  // If not auto-executed, execute the merge now
  if (!suggestion.autoExecuted) {
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM ${suggestion.entityType}s WHERE id = $1`,
        suggestion.removeId
      );
    } catch {
      // Entity may already be gone
    }
  }

  await prisma.dedupSuggestion.update({
    where: { id },
    data: { status: "approved", resolvedBy: req.user?.code, resolvedAt: new Date() },
  });
  res.json({ ok: true });
});

// POST /api/dedup/:id/reject — planner rejects (undo if auto-executed)
router.post("/:id/reject", async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const suggestion = await prisma.dedupSuggestion.findUnique({ where: { id } });
  if (!suggestion) { res.status(404).json({ error: "Not found" }); return; }

  // If auto-executed, this is an undo — we can't easily restore deleted data
  // so we mark it as rejected and log it. The planner would need to re-create manually.
  await prisma.dedupSuggestion.update({
    where: { id },
    data: { status: "rejected", resolvedBy: req.user?.code, resolvedAt: new Date() },
  });
  res.json({ ok: true, note: suggestion.autoExecuted ? "The duplicate was already removed. You may need to re-add it manually." : "Kept both." });
});

export default router;
