/**
 * "Let everyone know" (services/tripAlerts.ts) — what the phone asks for at each opening, and Got it / Remind me.
 *   GET  /pending        what this person should see now (others' alerts on their trips, oldest first)
 *   POST /:id/seen       { state: "got" | "later" }
 * Made only through Scout (tell_everyone); Scout's my_alerts says who has seen what, and takes one back.
 */
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { pendingFor, markSeen } from "../services/tripAlerts.js";

const router = Router();
router.use(requireAuth);

router.get("/pending", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  if (!me) { res.json({ alerts: [] }); return; }
  try { res.json({ alerts: await pendingFor(me) }); }
  catch (e: any) { console.warn("[alerts] pending:", e?.message); res.status(500).json({ error: "Couldn't look just now" }); }
});

router.post("/:id/seen", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  const state = req.body?.state;
  if (!me || (state !== "got" && state !== "later")) { res.status(400).json({ error: "Got it, or Remind me?" }); return; }
  try {
    const openSeconds = typeof req.body?.openSeconds === "number" ? req.body.openSeconds : null;
    const button = req.body?.button === "tell" ? "tell" : null;
    if (!(await markSeen(String(req.params.id), me, state, { openSeconds, button }))) { res.status(404).json({ error: "Not one of yours to see" }); return; }
    res.json({ ok: true });
  } catch (e: any) { console.warn("[alerts] seen:", e?.message); res.status(500).json({ error: "Couldn't save that just now" }); }
});

// POST /:id/shown — a note from Scout to this person is on their screen (Ken hears it; services/tripAlerts)
router.post("/:id/shown", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  if (!me) { res.status(400).json({ error: "Who?" }); return; }
  const { scoutNoteShown } = await import("../services/tripAlerts.js");
  await scoutNoteShown(String(req.params.id), me).catch((e) => console.warn("[alerts] shown:", e?.message));
  res.json({ ok: true });
});

export default router;
