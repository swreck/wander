/**
 * To-dos and deadlines marked done in Wander (services/actionMarks.ts). Trip members only.
 *
 * GET /api/action-marks/:tripId
 * PUT /api/action-marks/:tripId   { key, label, done }
 */
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getUserRole } from "../middleware/role.js";
import { logChange } from "../services/changeLog.js";
import { listMarks, setMark } from "../services/actionMarks.js";

const router = Router();
router.use(requireAuth);

async function member(req: AuthRequest, tripId: string) {
  return req.user?.travelerId ? !!(await getUserRole(req.user.travelerId, tripId)) : false;
}

router.get("/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!(await member(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  res.json(await listMarks(tripId));
});

// (PUT or POST — the phone's helper sends POST)
const mark = async (req: AuthRequest, res: import("express").Response) => {
  const tripId = req.params.tripId as string;
  if (!(await member(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const { key, label, done } = req.body || {};
  const result = await setMark(tripId, { travelerId: req.user!.travelerId!, name: req.user!.displayName }, key, label, done !== false);
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  logChange({
    tripId, user: req.user!, actionType: done !== false ? "action_marked_done" : "action_marked_open", entityType: "action_mark", entityId: String(key),
    entityName: String(label || key), description: done !== false ? `marked "${label || key}" done` : `marked "${label || key}" not done yet`,
    newState: result.mark ?? undefined,
  }).catch(() => {});
  res.json({ mark: result.mark });
};
router.put("/:tripId", mark);
router.post("/:tripId", mark);

export default router;
