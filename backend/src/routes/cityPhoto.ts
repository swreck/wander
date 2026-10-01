/**
 * A city's photo for the arrival splash (charm item C2, Oct 1 2026) — fetched by Wander's server from Google Places and
 * passed on as the picture itself, so the Google key never reaches a phone (the old /geocoding/city-photo handed out a
 * Google address with the key in it). Asked for by Wander's own city id only — not an open photo service — and kept in
 * memory, so each city costs Google one lookup. Google asks that its photographers be credited: /info says who.
 *   GET /:cityId/info   → { image: "/api/city-photo/<id>/image", place: "Nikkō Tōshō-gū", credit: "Photo: …" } or { image: null }
 *   GET /:cityId/image  → the JPEG
 * No sign-in needed (an <img> can't send one); a city id is a long random id, and nothing else is reachable here.
 */
import { Router } from "express";
import prisma from "../services/db.js";

const router = Router();
type Photo = { bytes: Buffer; type: string; place: string | null; credit: string | null; at: number };
const kept = new Map<string, Photo | null>();
const missedAt = new Map<string, number>();
const asking = new Map<string, Promise<Photo | null>>();
const KEEP_MS = 7 * 24 * 3600_000;
const MISS_MS = 3600_000; // a city with no photo is asked about again after an hour (Google may have hiccupped)

function photoFor(cityId: string): Promise<Photo | null> {
  const had = kept.get(cityId);
  if (had && Date.now() - had.at < KEEP_MS) return Promise.resolve(had);
  if (had === null && Date.now() - (missedAt.get(cityId) || 0) < MISS_MS) return Promise.resolve(null);
  // the splash asks for /info and then /image at once: one Google lookup serves both
  if (!asking.has(cityId)) asking.set(cityId, lookUp(cityId).then((p) => { kept.set(cityId, p); if (!p) missedAt.set(cityId, Date.now()); return p; }).finally(() => asking.delete(cityId)));
  return asking.get(cityId)!;
}

async function lookUp(cityId: string): Promise<Photo | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const city = await prisma.city.findUnique({ where: { id: cityId }, select: { name: true, country: true, latitude: true, longitude: true } }).catch(() => null);
  // Only a city that's on the map: its photo is looked for near where it is, so a place whose location isn't settled
  // (Oct 1: Shirakabeso) shows no photo rather than somewhere else's
  if (!key || !city || city.latitude == null || city.longitude == null) return null;
  try {
    // The city's best-known sight: the most-reviewed tourist attraction near it (a "<city> landmark" search took
    // Google's first hit — for Nikko, a supermarket called Nikko)
    const find: any = await (await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(`${city.name} sights`)}&location=${city.latitude},${city.longitude}&radius=12000&type=tourist_attraction&key=${key}`)).json();
    const lat = city.latitude, lng = city.longitude;
    const kmFrom = (at: any) => Math.hypot((at.lat - lat) * 111, (at.lng - lng) * 111 * Math.cos((lat * Math.PI) / 180));
    // Not a mall, shop, theme park or hotel (Hakata's most-reviewed "sight" is a mall, Tokyo's is Disneyland), and in
    // the city itself — location only prefers, and "Okayama" would otherwise be Kurashiki, a town 17 km away. (12 km:
    // Nikko's pin is its town hall, 9 km from Tōshō-gū.)
    const NOT_A_SIGHT = new Set(["shopping_mall", "store", "department_store", "amusement_park", "lodging", "clothing_store", "restaurant"]);
    const best = (find?.results || [])
      .filter((r: any) => r.photos?.[0]?.photo_reference && r.geometry?.location && kmFrom(r.geometry.location) <= 12)
      .filter((r: any) => !(r.types || []).some((t: string) => NOT_A_SIGHT.has(t)))
      .sort((a: any, b: any) => (b.user_ratings_total || 0) - (a.user_ratings_total || 0))[0];
    const p = best?.photos?.[0];
    if (!p) return null;
    const img = await fetch(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photo_reference=${p.photo_reference}&key=${key}`);
    if (!img.ok) return null;
    const bytes = Buffer.from(await img.arrayBuffer());
    // "<a href=…>Name</a>" → "Name"
    const who = ((p.html_attributions || [])[0] || "").replace(/<[^>]+>/g, "").trim();
    // the sight spelled as her Guide spells places ("Nikko", not Google's "Nikkō")
    const place = best.name ? String(best.name).normalize("NFD").replace(/\p{M}/gu, "") : null;
    return { bytes, type: img.headers.get("content-type") || "image/jpeg", place, credit: who ? `Photo: ${who}` : null, at: Date.now() };
  } catch {
    return null;
  }
}

router.get("/:cityId/info", async (req, res) => {
  const photo = await photoFor(req.params.cityId);
  res.set("Cache-Control", photo ? "private, max-age=86400" : "no-store");
  res.json(photo ? { image: `/api/city-photo/${req.params.cityId}/image`, place: photo.place, credit: photo.credit } : { image: null });
});

router.get("/:cityId/image", async (req, res) => {
  const photo = await photoFor(req.params.cityId);
  if (!photo) { res.status(404).end(); return; }
  res.set("Cache-Control", "public, max-age=604800, immutable");
  res.type(photo.type).send(photo.bytes);
});

export default router;
