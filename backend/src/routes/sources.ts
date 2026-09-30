/**
 * Other sources — API (Sep 30 2026)
 *
 * GET /api/sources/:tripId   The trip's other sources (Ken's rail sheet): each with whose it is, how it was written,
 *                            when Wander last read it (and why a read failed), its train rows, its checklists and
 *                            where it and Larisa's Guide disagree. Read-only: there is no route that writes a source.
 */
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getUserRole } from "../middleware/role.js";
import { sourceViews } from "../services/sources/context.js";

const router = Router();
router.use(requireAuth);

router.get("/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!req.user?.travelerId || !(await getUserRole(req.user.travelerId, tripId))) {
    res.status(403).json({ error: "Not a member of this trip" });
    return;
  }
  const views = await sourceViews(tripId);
  res.json(views.map((v) => ({
    ...v.meta,
    rail: v.rail,
    checklists: v.checklists,
    // Tabs Wander doesn't have a screen for are still Scout's to cite; screens get their names only
    otherTabs: v.otherTabs.map((t) => t.name),
    differs: v.differs,
  })));
});

export default router;
