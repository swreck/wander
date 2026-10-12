/**
 * A phone's "buzz me when Scout answers" (services/push.ts). Signed-in people only; a phone's address is kept under the
 * person who allowed it.
 *
 * GET  /api/push/key          → { key } (the site's public key, for the phone to subscribe) or { key: null }
 * POST /api/push/subscribe    { subscription } → { ok }
 * POST /api/push/unsubscribe  { endpoint } → { ok }
 */
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import prisma from "../services/db.js";
import { pushKey, parseSubscription } from "../services/push.js";

const router = Router();
router.use(requireAuth);

router.get("/key", (_req, res) => { res.json({ key: pushKey() }); });

router.post("/subscribe", async (req: AuthRequest, res) => {
  const travelerId = req.user?.travelerId;
  const sub = parseSubscription(req.body?.subscription);
  if (!travelerId || !sub) { res.status(400).json({ error: "That phone's notification address couldn't be read." }); return; }
  // (the same phone signing in as someone else moves to them — one phone, one person)
  await prisma.pushSubscription.upsert({ where: { endpoint: sub.endpoint }, create: { travelerId, ...sub }, update: { travelerId, p256dh: sub.p256dh, auth: sub.auth } });
  res.json({ ok: true });
});

router.post("/unsubscribe", async (req: AuthRequest, res) => {
  const travelerId = req.user?.travelerId;
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  if (!travelerId || !endpoint) { res.status(400).json({ error: "Which phone?" }); return; }
  await prisma.pushSubscription.deleteMany({ where: { endpoint, travelerId } });
  res.json({ ok: true });
});

export default router;
