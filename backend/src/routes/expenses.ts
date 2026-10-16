// Who paid for what, couple by couple (services/expenses.ts — Larisa's idea, Oct 15 2026). Every member sees it all.
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { tripMemberParam } from "../middleware/role.js";
import { ledger, addExpense, removeExpense, changeExpense, restoreExpense, expenseHistory } from "../services/expenses.js";

const router = Router();
router.use(requireAuth);
router.param("tripId", tripMemberParam);

// GET /trip/:tripId — the couples, their totals, who pays next, what's owed, every payment (newest first)
router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  res.json(await ledger(req.params.tripId as string, { travelerId: req.user?.travelerId, displayName: req.user?.displayName }));
});

// POST /trip/:tripId — { paidBy: "Andy & Julie" | "Andy", amount, currency: "JPY" | "USD", what?, dayDate?, forParty? }
// (forParty: the couple it's wholly for; left out, it's shared half and half)
router.post("/trip/:tripId", async (req: AuthRequest, res) => {
  const b = req.body || {};
  const r = await addExpense({ tripId: req.params.tripId as string, paidBy: String(b.paidBy || ""), amount: Number(b.amount), currency: b.currency, what: b.what ?? null, dayDate: b.dayDate ?? null, forParty: b.forParty ?? null,
    addedById: req.user?.travelerId ?? null, addedByName: req.user?.displayName || "Someone", clientKey: typeof b.clientKey === "string" ? b.clientKey : null });
  if ("error" in r) { res.status(400).json(r); return; }
  res.json(r);
});

// GET /trip/:tripId/history — every add, change and removal, newest first: { at, by, action }
router.get("/trip/:tripId/history", async (req: AuthRequest, res) => {
  res.json({ history: await expenseHistory(req.params.tripId as string, { travelerId: req.user?.travelerId, displayName: req.user?.displayName || "" }) });
});

// POST /trip/:tripId/:id/back — a payment taken away, put back (counts again), by who kept it or the trip's first member
router.post("/trip/:tripId/:id/back", async (req: AuthRequest, res) => {
  const r = await restoreExpense(req.params.tripId as string, req.params.id as string, { travelerId: req.user?.travelerId, displayName: req.user?.displayName || "" });
  if (r === "not-yours") { res.status(403).json({ error: "Only whoever kept it, or Ken, can put it back." }); return; }
  if (r === "gone") { res.status(404).json({ error: "That payment isn't there." }); return; }
  res.json({ ok: true, already: r === "already" });
});

// PATCH /trip/:tripId/:id — { amount?, currency?, paidBy?, what?, forParty? (null: shared) }, by who added it or the trip's first member
router.patch("/trip/:tripId/:id", async (req: AuthRequest, res) => {
  const b = req.body || {};
  const r = await changeExpense(req.params.tripId as string, req.params.id as string, { travelerId: req.user?.travelerId, displayName: req.user?.displayName || "Someone" },
    { amount: b.amount === undefined ? undefined : Number(b.amount), currency: b.currency, paidBy: b.paidBy, what: b.what, forParty: b.forParty });
  if (r === "not-yours") { res.status(403).json({ error: "Only whoever added it, or Ken, can change it." }); return; }
  if (r === "gone") { res.status(404).json({ error: "That payment isn't there anymore." }); return; }
  if ("error" in r) { res.status(400).json(r); return; }
  res.json(r);
});

// DELETE /trip/:tripId/:id — taken away (hidden), by who added it or the trip's first member
router.delete("/trip/:tripId/:id", async (req: AuthRequest, res) => {
  const r = await removeExpense(req.params.tripId as string, req.params.id as string, { travelerId: req.user?.travelerId, displayName: req.user?.displayName || "" });
  if (r === "not-yours") { res.status(403).json({ error: "Only whoever added it, or Ken, can take it away." }); return; }
  if (!r) { res.status(404).json({ error: "That payment isn't there anymore." }); return; }
  res.json({ ok: true });
});

export default router;
