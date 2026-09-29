/**
 * Same-day plans added in Wander (see services/dayChoices.ts). Trip members only.
 *
 * GET    /api/day-choices/:tripId?date=YYYY-MM-DD
 * POST   /api/day-choices/:tripId   { date, text?, time?, experienceId? }
 * DELETE /api/day-choices/:tripId/:id
 */

import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getUserRole } from "../middleware/role.js";
import { logChange } from "../services/changeLog.js";
import { addDayChoice, listDayChoices, removeDayChoice, plainDay } from "../services/dayChoices.js";

const router = Router();
router.use(requireAuth);

async function member(req: AuthRequest, tripId: string) {
  return req.user?.travelerId ? !!(await getUserRole(req.user.travelerId, tripId)) : false;
}

router.get("/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!(await member(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  res.json(await listDayChoices(tripId, date));
});

router.post("/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!(await member(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const result = await addDayChoice({ tripId, travelerId: req.user!.travelerId!, ...req.body });
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  logChange({
    tripId, user: req.user!, actionType: "day_choice_added", entityType: "day_choice", entityId: result.choice.id,
    entityName: result.choice.text, description: `added "${result.choice.text}" to ${plainDay(result.choice.date)}`,
    newState: result.choice,
  }).catch(() => {});
  res.status(201).json(result.choice);
});

router.delete("/:tripId/:id", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!(await member(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const result = await removeDayChoice(tripId, req.params.id as string);
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  logChange({
    tripId, user: req.user!, actionType: "day_choice_removed", entityType: "day_choice", entityId: result.removed.id,
    entityName: result.removed.text, description: `took "${result.removed.text}" off ${plainDay(result.removed.date)}`,
    previousState: result.removed,
  }).catch(() => {});
  res.json({ removed: true });
});

export default router;
