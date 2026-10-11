/**
 * What a phone saw when Wander stepped in for something only a real phone does (Oct 11 2026): the tab bar finding iOS's
 * screen keyboard-short, Scout finding an answer the line dropped. Written to the server's log only — nothing stored,
 * nothing shown — so Ken's ordinary use is the evidence ("at 1:21 PM iOS reported the screen 244 pt short; the bar was
 * moved"). Signed-in people only; a few short fields, never words anyone wrote.
 *
 * POST /api/phone-reports   { what: "tabbar" | "scout-drop", ...numbers and short words }
 */
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const WHAT = new Set(["tabbar", "scout-drop"]);
router.post("/", (req: AuthRequest, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const what = String(body.what || "");
  if (!WHAT.has(what)) { res.status(400).json({ error: "Unknown report" }); return; }
  // (numbers and short plain words only — a phone can't put anything long or personal in the log)
  const fields = Object.entries(body)
    .filter(([k, v]) => k !== "what" && /^[a-zA-Z]{1,20}$/.test(k) && (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && /^[\w :./-]{0,40}$/.test(v))))
    .slice(0, 12)
    .map(([k, v]) => `${k}=${v}`).join(" ");
  console.log(`[phone] ${req.user?.displayName || "?"} ${what} ${fields}`);
  res.status(204).end();
});

export default router;
