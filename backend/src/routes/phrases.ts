import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { tripMemberParam } from "../middleware/role.js";
import { itemMemberParam } from "../middleware/role.js";
import { tripOf } from "../middleware/tripGuard.js";
import { phrasePrefsOf, savePhrasePrefs, mayRemoveForAll, firstOnAddersCard, cardPhrases, samePhrase } from "../services/phrasePrefs.js";

const router = Router();
router.use(requireAuth);
// Is the signed-in person on this trip? (the translation routes take the trip in the body)
const onThisTrip = async (req: AuthRequest, tripId: string) => {
  const me = req.user?.travelerId;
  return !!me && !!(await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId, travelerId: me } }, select: { tripId: true } }));
};
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

// POST /suggest — the card's Add: English in, the line (or a choice of two or three) out; nothing is saved until the
// person taps one (services/phraseSuggest). Each option says when the card already has it.
router.post("/suggest", async (req: AuthRequest, res) => {
  const { tripId, english } = req.body || {};
  const asked = typeof english === "string" ? english.trim() : "";
  if (!tripId || !asked) { res.status(400).json({ error: "Say or type what you want in English first." }); return; }
  // (a trip that isn't there, or isn't theirs, costs no translation — verify53, verify58)
  if (!(await onThisTrip(req, String(tripId)))) { res.status(404).json({ error: "Trip not found" }); return; }
  try {
    const { suggestPhrase } = await import("../services/phraseSuggest.js");
    const onCard = (await cardPhrases(String(tripId))).filter((p) => !p.removedAt);
    const { options, why } = await suggestPhrase(asked, onCard.map((p) => ({ english: p.english, local: p.local })));
    const mine = req.user?.travelerId ? await phrasePrefsOf(req.user.travelerId, String(tripId)) : { order: [], hidden: [] };
    res.json({
      options: options.map(({ sameAs, ...o }) => {
        // (the same meaning, as the translator judged it from the card's lines; or the same words or English title:
        // asked twice, the Japanese can come back worded a little differently — "tsukaemasu ka" then "haraemasu ka")
        const twin = (sameAs ? onCard.find((p) => samePhrase(p.english, sameAs)) : undefined)
          || onCard.find((p) => samePhrase(p.local, o.romaji) || samePhrase(p.english, o.english));
        // (one this person took off their own card: offered back, not a dead end — verify53)
        return { ...o, ...(twin ? (mine.hidden.includes(twin.key) ? { offYourCard: twin.key, onCardAs: twin.english } : { onCardAs: twin.english }) : {}) };
      }),
      ...(why ? { why } : {}),
    });
  } catch (e) {
    console.warn("[phrase-suggest] failed:", (e as Error)?.message);
    res.status(502).json({ error: "The translation didn't come back. Try again in a moment?" });
  }
});

// POST /one-off — Show large's "Ask something else": English in, the Japanese to show now and what it says; nothing
// saved (Ken, Oct 14: "make it a smart option for the user to ask what they want")
router.post("/one-off", async (req: AuthRequest, res) => {
  const { tripId, english, card } = req.body || {};
  const asked = typeof english === "string" ? english.trim() : "";
  if (!tripId || !asked) { res.status(400).json({ error: "Say or type what you want to ask, in English." }); return; }
  if (!(await onThisTrip(req, String(tripId)))) { res.status(404).json({ error: "Trip not found" }); return; }
  try {
    const { oneOffToShow } = await import("../services/phraseSuggest.js");
    const c = card && typeof card.english === "string" ? { english: String(card.english).slice(0, 300), script: typeof card.script === "string" ? card.script.slice(0, 600) : null } : undefined;
    res.json(await oneOffToShow(asked, c));
  } catch (e) {
    console.warn("[phrase-one-off] failed:", (e as Error)?.message);
    res.status(502).json({ error: "The translation didn't come back. Try again in a moment?" });
  }
});

// POST / — add a phrase (appears at bottom for everyone)
router.post("/", async (req: AuthRequest, res) => {
  const { tripId, english, romaji, pronunciation, script, followUps } = req.body;
  if (!tripId || !english || !romaji) {
    res.status(400).json({ error: "tripId, english, and romaji are required" });
    return;
  }

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }
  // The same line already on the card is that line, not a second one: two quick taps on Add's "Add to the card" put it
  // on everyone's card twice (verify53)
  const twin = (await prisma.tripPhrase.findMany({ where: { tripId, removedAt: null } }))
    .find((p) => samePhrase(p.romaji, String(romaji)) && samePhrase(p.english, String(english)));
  if (twin) { res.status(200).json(twin); return; }

  const phrase = await prisma.tripPhrase.create({
    data: {
      tripId,
      english,
      romaji,
      ...(typeof pronunciation === "string" && pronunciation.trim() ? { pronunciation: pronunciation.trim().slice(0, 300) } : {}),
      // (the Japanese writing to show someone — only real Japanese is kept)
      ...(typeof script === "string" && /[぀-ヿ㐀-鿿]/.test(script) ? { script: script.trim().slice(0, 600) } : {}),
      // (the questions to ask next, checked as the translator's are)
      ...(Array.isArray(followUps) && followUps.length ? { followUps: (await import("../services/phraseSuggest.js")).checkedFollowUps(followUps) } : {}),
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
