/**
 * What a phone saw when Wander stepped in for something only a real phone does (Oct 11 2026): the tab bar finding iOS's
 * screen keyboard-short, Scout finding an answer the line dropped. Written to the server's log only — nothing stored,
 * nothing shown — so Ken's ordinary use is the evidence ("at 1:21 PM iOS reported the screen 244 pt short; the bar was
 * moved"). Signed-in people only. Only the fields the app sends, each in its own shape (verify9: a hand-made request
 * could put short sentences in the log, as often as it liked) — never words anyone wrote.
 *
 * POST /api/phone-reports   { what: "tabbar" | "scout-drop", ...its fields }
 */
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const RESULT = /^[a-z][a-z-]{0,39}$/;
const NUM = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 100_000;
const FIELDS: Record<string, Record<string, (v: unknown) => boolean>> = {
  tabbar: { result: (v) => typeof v === "string" && RESULT.test(v), short: NUM, page: NUM, phone: NUM, at: (v) => typeof v === "string" && /^\/[\w/-]{0,40}$/.test(v) },
  "scout-drop": { result: (v) => typeof v === "string" && RESULT.test(v), secs: NUM, noSignal: (v) => typeof v === "boolean", status: NUM },
};
// (a phone acting normally sends a few a day; more than 30 in 10 minutes from one person is not a phone)
const sent = new Map<string, number[]>();
const WINDOW = 10 * 60_000, MOST = 30;

router.post("/", (req: AuthRequest, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const what = String(body.what || "");
  const allowed = FIELDS[what];
  if (!allowed) { res.status(400).json({ error: "Unknown report" }); return; }
  if (JSON.stringify(body).length > 1000) { res.status(413).json({ error: "Too long" }); return; }
  const who = req.user?.travelerId || req.user?.displayName || "?";
  const now = Date.now();
  const recent = (sent.get(who) || []).filter((t) => now - t < WINDOW);
  if (recent.length >= MOST) { res.status(429).json({ error: "Too many" }); return; }
  recent.push(now);
  sent.set(who, recent);
  const fields = Object.entries(allowed).filter(([k, ok]) => k in body && ok(body[k])).map(([k]) => `${k}=${body[k]}`).join(" ");
  console.log(`[phone] ${req.user?.displayName || "?"} ${what} ${fields}`);
  res.status(204).end();
});

export default router;
