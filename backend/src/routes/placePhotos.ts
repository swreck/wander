// A day's stops' photos (services/placePhotos.ts).
//   POST /lookup { tripId, cityId?, places: [{ key, query, line }] } → { places: { [key]: { id, name, photos: [{ credit }] } | null } }
//   GET  /:id/:n → the picture (no sign-in: an <img> can't send one; the id is a long random one, as the city photo's)
import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { placePhotosFor, placePicture, knownHit, freshenHours, freshenPlaces, type PlaceHit } from "../services/placePhotos.js";

const router = Router();

router.post("/lookup", requireAuth, async (req: AuthRequest, res) => {
  const b = (req.body || {}) as { tripId?: string; cityId?: string; places?: { key?: string; query?: string; line?: string }[] };
  const me = req.user?.travelerId;
  if (!b.tripId || !me || !(await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId: b.tripId, travelerId: me } } }))) {
    res.status(403).json({ error: "Not your trip" }); return;
  }
  const city = b.cityId ? await prisma.city.findFirst({ where: { id: b.cityId, tripId: b.tripId }, select: { latitude: true, longitude: true } }) : null;
  const near = city?.latitude != null && city?.longitude != null ? { lat: city.latitude, lng: city.longitude } : null;
  const asked = (b.places || []).filter((p) => p?.key && p?.query).slice(0, 30);
  const out: Record<string, PlaceHit> = {};
  // (all at once; whatever isn't found in 9 s is left for the next look — the day never waits on a picture)
  await Promise.all(asked.map((p) => Promise.race([
    placePhotosFor(String(p.query), String(p.line || p.query), near).then((h) => { out[p.key!] = h; }).catch(() => { out[p.key!] = null; }),
    new Promise<void>((ok) => setTimeout(ok, 9000)),
  ])));
  res.json({ places: out });
});

// GET /known — every stop Wander has looked at (her line, its search, the answer), so a phone opening any day draws
// its photos in the first frame instead of moving the day as they come (tourist63: the page jumped ~8 s in)
router.get("/known", requireAuth, async (_req, res) => {
  const rows = await prisma.placePhoto.findMany({ where: { verdict: { in: ["yes", "no", "none"] } }, select: { id: true, query: true, line: true, name: true, photos: true, verdict: true, checkedAt: true, hours: true } });
  res.set("Cache-Control", "private, max-age=600");
  res.json({ places: rows.map((r) => ({ query: r.query, line: r.line, hit: knownHit(r) })) });
  // (their hours, when missing or three days old, are fetched in the background — the next look has them; and each
  // place checked before the current rules — every photo shown checked, up to six — checked once more)
  freshenHours();
  freshenPlaces();
});

// GET /about/:id — "About this place" for a checked place (services/placeAbout.ts): kept, or written now (~15–30 s)
// (before /:id/:n, which would take "about" for an id)
router.get("/about/:id", requireAuth, async (req, res) => {
  const { aboutPlace } = await import("../services/placeAbout.js");
  const r = await aboutPlace(String(req.params.id)).catch((e) => { console.warn("[place-about]", e?.message || e); return { error: "Wander couldn't write this just now. Try again in a minute." }; });
  if ("error" in r) { res.status(404).json(r); return; }
  res.set("Cache-Control", "private, max-age=3600");
  res.json(r);
});

router.get("/:id/:n", async (req, res) => {
  const n = Number(req.params.n);
  const p = Number.isInteger(n) && n >= 0 && n < 6 ? await placePicture(String(req.params.id), n, req.query.size === "small").catch(() => null) : null;
  if (!p) { res.status(404).end(); return; }
  res.set("Cache-Control", "public, max-age=604800, immutable");
  res.type(p.type).send(p.bytes);
});

export default router;
