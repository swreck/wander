import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { tripMemberParam } from "../middleware/role.js";
import { itemMemberParam } from "../middleware/role.js";
import { tripOf } from "../middleware/tripGuard.js";
import { phrasePrefsOf, savePhrasePrefs, mayRemoveForAll, firstOnAddersCard } from "../services/phrasePrefs.js";

const router = Router();
router.use(requireAuth);
// A route naming one item is for the people on that item's trip (Oct 1 2026)
router.param("id", itemMemberParam(tripOf.phrase));
// A route naming a trip is for that trip's own people (Sep 30 2026)
router.param("tripId", tripMemberParam);
// GET /trip/:tripId — the phrases added on a trip (ordered by creation); one taken off everyone's card comes only to
// those who may put it back (its adder and the trip's organizer), marked removed
router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const phrases = await prisma.tripPhrase.findMany({
    where: { tripId: req.params.tripId as string },
    orderBy: { createdAt: "asc" },
  });
  const who = { travelerId: req.user?.travelerId, displayName: req.user?.displayName || "" };
  const out = [];
  for (const p of phrases) {
    const may = await mayRemoveForAll(who, p);
    if (p.removedAt && !may) continue;
    out.push({ ...p, mayRemoveForAll: may });
  }
  res.json(out);
});

// POST /:id/remove — off everyone's card (hidden, never deleted): its adder or the trip's organizer only
router.post("/:id/remove", async (req: AuthRequest, res) => {
  const p = await prisma.tripPhrase.findUnique({ where: { id: req.params.id as string } });
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await mayRemoveForAll({ travelerId: req.user?.travelerId, displayName: req.user?.displayName || "" }, p))) {
    res.status(403).json({ error: `That's ${p.addedBy.split(/\s+/)[0]}'s phrase. You can take it off your own card.` }); return;
  }
  if (!p.removedAt) await prisma.tripPhrase.update({ where: { id: p.id }, data: { removedAt: new Date(), removedBy: req.user!.displayName } });
  res.json({ removed: true });
});
// POST /:id/put-back — back on everyone's card, by the same people
router.post("/:id/put-back", async (req: AuthRequest, res) => {
  const p = await prisma.tripPhrase.findUnique({ where: { id: req.params.id as string } });
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await mayRemoveForAll({ travelerId: req.user?.travelerId, displayName: req.user?.displayName || "" }, p))) {
    res.status(403).json({ error: "Only the person who added it, or the trip's organizer, can put it back." }); return;
  }
  await prisma.tripPhrase.update({ where: { id: p.id }, data: { removedAt: null, removedBy: null } });
  res.json({ putBack: true });
});

// GET /trip/:tripId/mine — this person's own card: phrases taken off and their order (services/phrasePrefs)
router.get("/trip/:tripId/mine", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  if (!me) { res.status(400).json({ error: "Phrases are arranged per person — this sign-in has no person." }); return; }
  res.json(await phrasePrefsOf(me, req.params.tripId as string));
});
// PATCH /trip/:tripId/mine { order?, hidden? } — save how this person arranged their own card
router.patch("/trip/:tripId/mine", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  if (!me) { res.status(400).json({ error: "Phrases are arranged per person — this sign-in has no person." }); return; }
  if (JSON.stringify(req.body || {}).length > 40_000) { res.status(413).json({ error: "Too long" }); return; }
  res.json(await savePhrasePrefs(me, req.params.tripId as string, { order: req.body?.order, hidden: req.body?.hidden }));
});

// POST / — add a phrase (appears at bottom for everyone)
router.post("/", async (req: AuthRequest, res) => {
  const { tripId, english, romaji } = req.body;
  if (!tripId || !english || !romaji) {
    res.status(400).json({ error: "tripId, english, and romaji are required" });
    return;
  }

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }

  const phrase = await prisma.tripPhrase.create({
    data: {
      tripId,
      english,
      romaji,
      addedBy: req.user!.displayName,
    },
  });
  // (first on the adder's card, at the bottom of everyone else's — services/phrasePrefs)
  await firstOnAddersCard(req.user?.travelerId, tripId, phrase.id).catch(() => {});

  res.status(201).json(phrase);
});

// DELETE /:id — (April's) now the same as remove: off everyone's card, never deleted, by its adder or the organizer only
// (it deleted for good, by anyone on the trip — nothing in the app calls it; Ken's rule: remove hides, never deletes)
router.delete("/:id", async (req: AuthRequest, res) => {
  const p = await prisma.tripPhrase.findUnique({ where: { id: req.params.id as string } });
  if (!p) { res.status(404).json({ error: "Phrase not found" }); return; }
  if (!(await mayRemoveForAll({ travelerId: req.user?.travelerId, displayName: req.user?.displayName || "" }, p))) {
    res.status(403).json({ error: `That's ${p.addedBy.split(/\s+/)[0]}'s phrase. You can take it off your own card.` }); return;
  }
  if (!p.removedAt) await prisma.tripPhrase.update({ where: { id: p.id }, data: { removedAt: new Date(), removedBy: req.user!.displayName } });
  res.json({ removed: true });
});

export default router;
