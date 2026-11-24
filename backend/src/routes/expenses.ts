// Who paid for what, couple by couple (services/expenses.ts — Larisa's idea, Oct 15 2026). Every member sees it all.
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { tripMemberParam } from "../middleware/role.js";
import { ledger, addExpense, removeExpense, changeExpense, restoreExpense, expenseHistory, readReceipt, receiptOf, attachReceipt } from "../services/expenses.js";
import { paperFile } from "../services/papers.js";
import { rosterOf, familyLedger, addFamilyExpense, changeFamilyExpense } from "../services/familyExpenses.js";
import { readFamilyReceipt } from "../services/familyReceipt.js";
import { isPlanTrip } from "../services/planTrip.js";

// A trip whose payers are families (it has a roster; services/familyExpenses.ts) answers with the couples' fields empty
// and its own sum under `family`, so a phone still running an older Wander shows an empty Budget, never dollars as yen.
const EMPTY = { parties: [] as string[], totals: {}, shared: 0, alone: 0, next: null, owes: null, items: [] as unknown[] };
/** A trip built from a plan whose families aren't in yet: nothing can be kept */
const NOT_SET_UP = "Budget isn't set up for this trip yet.";
/** Yen or US dollars, or none said: what a couples' trip keeps. Anything else was once kept as yen, unseen. */
const yenOrDollars = (c: unknown) => { const s = String(c ?? "").trim(); return !s || /^(jpy|yen|¥|円|usd|\$|dollars?)$/i.test(s); };

/** A receipt photo as the phone sent it (a JPEG it shrank), or null — anything else isn't a receipt photo */
// (and a real photo: a few bytes claiming to be a JPEG were kept as one — fresh tester)
const receiptFile = (x: unknown) => { const f = paperFile(x); return typeof f === "string" || !f.mediaType.startsWith("image/") || f.data.length < 2000 ? null : f; };

const router = Router();
router.use(requireAuth);
router.param("tripId", tripMemberParam);

// GET /trip/:tripId — the couples, their totals, who pays next, what's owed, every payment (newest first)
router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  const who = { travelerId: req.user?.travelerId, displayName: req.user?.displayName };
  const roster = await rosterOf(tripId);
  if (roster) { res.json({ ...EMPTY, family: await familyLedger(tripId, roster, who) }); return; }
  if (await isPlanTrip(tripId)) { res.json({ ...EMPTY, notSetUp: true }); return; }
  res.json(await ledger(tripId, who));
});

// POST /trip/:tripId — { paidBy: "Andy & Julie" | "Andy", amount, currency: "JPY" | "USD", what?, dayDate?, forParty? }
// (forParty: the couple it's wholly for; left out, it's shared half and half)
router.post("/trip/:tripId", async (req: AuthRequest, res) => {
  const b = req.body || {};
  const roster = await rosterOf(req.params.tripId as string);
  if (roster) {
    // { paidBy: a family or anyone in it, amount, currency: "VND" | "KHR" | "JPY" | "USD", what?, dayDate?, forPeople?: names (left out: everyone abroad that day) }
    const f = await addFamilyExpense(roster, { tripId: req.params.tripId as string, paidBy: String(b.paidBy || ""), amount: Number(b.amount), currency: b.currency, what: b.what ?? null, dayDate: b.dayDate ?? null, forPeople: b.forPeople,
      addedById: req.user?.travelerId ?? null, addedByName: req.user?.displayName || "Someone", clientKey: typeof b.clientKey === "string" ? b.clientKey : null,
      receipt: b.receipt ? receiptFile(b.receipt) : null });
    if ("error" in f) { res.status(400).json(f); return; }
    res.json(f);
    return;
  }
  if (await isPlanTrip(req.params.tripId as string)) { res.status(400).json({ error: NOT_SET_UP }); return; }
  if (!yenOrDollars(b.currency)) { res.status(400).json({ error: "This trip's Budget keeps yen and US dollars." }); return; }
  const r = await addExpense({ tripId: req.params.tripId as string, paidBy: String(b.paidBy || ""), amount: Number(b.amount), currency: b.currency, what: b.what ?? null, dayDate: b.dayDate ?? null, forParty: b.forParty ?? null,
    addedById: req.user?.travelerId ?? null, addedByName: req.user?.displayName || "Someone", clientKey: typeof b.clientKey === "string" ? b.clientKey : null,
    receipt: b.receipt ? receiptFile(b.receipt) : null });
  if ("error" in r) { res.status(400).json(r); return; }
  res.json(r);
});

// POST /trip/:tripId/receipt — { file: { mediaType, data, thumb? } } → what the receipt says: { amount, currency, what, date }
// (nothing kept yet: the person checks it, says who paid, and keeps it with the payment)
router.post("/trip/:tripId/receipt", async (req: AuthRequest, res) => {
  const file = receiptFile(req.body?.file);
  if (!file) { res.status(400).json({ error: "Only a photo of the receipt can be read." }); return; }
  // (a families' trip runs through Vietnam, Cambodia and Japan: its reader gives dong, riel, yen or dollars. Japan's is as it was.)
  const tripId = req.params.tripId as string;
  res.json({ read: (await rosterOf(tripId)) ? await readFamilyReceipt(tripId, file) : await readReceipt(tripId, file) });
});

// POST /trip/:tripId/:id/receipt — { file } — a receipt's photo added to a payment already kept (who kept it, or Ken)
router.post("/trip/:tripId/:id/receipt", async (req: AuthRequest, res) => {
  const file = receiptFile(req.body?.file);
  if (!file) { res.status(400).json({ error: "Only a photo of the receipt can be kept with it." }); return; }
  const r = await attachReceipt(req.params.tripId as string, req.params.id as string, { travelerId: req.user?.travelerId, displayName: req.user?.displayName || "" }, file);
  if (r === "not-yours") { res.status(403).json({ error: "Only whoever kept it, or Ken, can add its receipt." }); return; }
  if (r === "gone") { res.status(404).json({ error: "That payment isn't there anymore." }); return; }
  res.json({ ok: true });
});

// GET /trip/:tripId/:id/receipt[?small=1] — a payment's receipt photo, for the trip's members
router.get("/trip/:tripId/:id/receipt", async (req: AuthRequest, res) => {
  const r = await receiptOf(req.params.tripId as string, req.params.id as string, req.query.small === "1");
  if (!r) { res.status(404).json({ error: "No receipt kept with that payment." }); return; }
  res.setHeader("Content-Type", r.type);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(r.bytes);
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

// POST /trip/:tripId/:id/right — "That's right": a payment that isn't shared is as meant (off the "check these" box)
router.post("/trip/:tripId/:id/right", async (req: AuthRequest, res) => {
  const { checkNotShared } = await import("../services/expenses.js");
  const r = await checkNotShared(req.params.tripId as string, req.params.id as string, { travelerId: req.user?.travelerId, displayName: req.user?.displayName || "Someone" });
  if (r === "gone") { res.status(404).json({ error: "That payment isn't there anymore." }); return; }
  if (r === "not-member") { res.status(403).json({ error: "Not on this trip." }); return; }
  res.json({ ok: true, ...(r === "shared" ? { shared: true } : {}) });
});

// PATCH /trip/:tripId/:id — { amount?, currency?, paidBy?, what?, forParty? (null: shared) }, by who added it or the trip's first member
router.patch("/trip/:tripId/:id", async (req: AuthRequest, res) => {
  const b = req.body || {};
  const roster = await rosterOf(req.params.tripId as string);
  if (!roster && b.currency !== undefined && !yenOrDollars(b.currency)) { res.status(400).json({ error: "This trip's Budget keeps yen and US dollars." }); return; }
  const me = { travelerId: req.user?.travelerId, displayName: req.user?.displayName || "Someone" };
  // (a families' trip: { amount?, currency?, paidBy?, what?, forPeople? (null: everyone abroad that day), dayDate? })
  const r = roster
    ? await changeFamilyExpense(roster, req.params.tripId as string, req.params.id as string, me, { amount: b.amount === undefined ? undefined : Number(b.amount), currency: b.currency, paidBy: b.paidBy, what: b.what, forPeople: b.forPeople, dayDate: b.dayDate })
    : await changeExpense(req.params.tripId as string, req.params.id as string, me,
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
