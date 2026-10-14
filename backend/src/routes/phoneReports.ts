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

// (only the words the app itself says — verify10 put "dinner-at-jiro-bring-cash" in by hand)
const oneOf = (...words: string[]) => (v: unknown) => typeof v === "string" && words.includes(v);
const NUM = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 100_000;
const FIELDS: Record<string, Record<string, (v: unknown) => boolean>> = {
  // (placed-for-moved-screen: iOS left the screen moved down the page after the keyboard, and the bar followed it —
  // "short" is then how far; Ken's Home, Oct 13 11:29)
  tabbar: { result: oneOf("measured-again-fixed-it", "bar-placed-at-real-bottom", "placed-for-moved-screen"), short: NUM, page: NUM, phone: NUM,
    at: oneOf("/", "/now", "/ideas", "/notes", "/people", "/settings", "/whole-trip", "/history", "/profile", "/guide", "/day", "/checklist", "/city", "/story") },
  "scout-drop": { result: oneOf("answer-found", "answer-found-while-stalled", "not-found", "asked-again", "still-no-signal"), secs: NUM, noSignal: (v) => typeof v === "boolean", status: NUM },
  // (where an iPhone thinks Scout's box is once it's tapped — Ken, Oct 13: no cursor, no spacebar cursor, iOS's Paste
  // menu at the very top of the screen; measured before anything in the keyboard area is changed)
  // (and when the keyboard goes up or down — Ken, Oct 13 10:24: Scout's panel stuck near the top, the day bright below)
  "scout-caret": { when: oneOf("focus", "settled", "resize"), sy: NUM, vvTop: NUM, vvH: NUM, page: NUM, inner: NUM, boxTop: NUM, boxBottom: NUM,
    panelTop: NUM, panelBottom: NUM, active: (v) => typeof v === "boolean", selStart: NUM, holds: NUM },
  // (the Notes box, tapped: where the phone thinks it is, and when Wander put the page back after iOS threw it — Ken,
  // Oct 13 10:56 PM: no cursor, the page jumped to its bottom at the first letter)
  "notes-caret": { when: oneOf("focus", "settled", "held"), sy: NUM, vvTop: NUM, vvH: NUM, inner: NUM, boxTop: NUM, boxBottom: NUM,
    jump: NUM, holds: NUM },
  // (a paper's send that broke partway — Ken, Oct 13 10:01 JST: "Why? I have signal"; it worked the second time)
  paper: { result: oneOf("kept-after-retry", "failed-after-retries"), tries: NUM, kb: NUM, secs: NUM,
    online: (v) => typeof v === "boolean", hidden: (v) => typeof v === "boolean" },
  // (Home's map that Google wouldn't load — Andy, Oct 15 ~8:30 AM JST: "an error instead of his home page map"; Google's
  // refusals never reach this server otherwise)
  map: { result: oneOf("load-failed", "auth-failure"), online: (v) => typeof v === "boolean" },
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
