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
import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../services/db.js";
import { cityTripOver } from "../services/tripOver.js";
import { googleFetch, note } from "../services/usage.js";
import { plainCredit } from "../services/photoCredit.js";

const router = Router();
type Photo = { bytes: Buffer; type: string; place: string | null; credit: string | null; at: number };
const kept = new Map<string, Photo | null>();
const missedAt = new Map<string, number>();
const asking = new Map<string, Promise<Photo | null>>();
const KEEP_MS = 7 * 24 * 3600_000;
const MISS_MS = 3600_000; // a lookup that failed (Google or Claude hiccupped) is tried again after an hour

function photoFor(cityId: string): Promise<Photo | null> {
  const had = kept.get(cityId);
  if (had && Date.now() - had.at < KEEP_MS) return Promise.resolve(had);
  if (had === null && Date.now() - (missedAt.get(cityId) || 0) < MISS_MS) return Promise.resolve(null);
  // the splash asks for /info and then /image at once: one Google lookup serves both
  if (!asking.has(cityId)) asking.set(cityId, chosen(cityId).then((p) => { kept.set(cityId, p); if (!p) missedAt.set(cityId, Date.now()); return p; }).finally(() => asking.delete(cityId)));
  return asking.get(cityId)!;
}

/** The photo as chosen this week — kept in the database, so a restart (every deploy) fetches just that one photo instead
 *  of a search and up to five photos judged by Claude; and "none fits" holds for the week (it was asked again hourly).
 *  Only a lookup that failed is tried again within the week. (cost audit, Oct 16) */
async function chosen(cityId: string): Promise<Photo | null> {
  const pick = await prisma.cityPhotoPick.findUnique({ where: { cityId } }).catch(() => null);
  const key = process.env.GOOGLE_MAPS_API_KEY;
  // (a finished trip's city keeps the photo it had, never picked again by Google and Claude each week — Ken, Nov 15, on
  // old Japan: "they don't need to update"; it's held here a week at a time)
  const over = !!pick && await cityTripOver(cityId);
  if (pick && (over || Date.now() - pick.checkedAt.getTime() < KEEP_MS)) {
    if (!pick.ref) return null;
    const img = key ? await googleFetch("google.photo", `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${pick.ref}&key=${key}`).catch(() => null) : null;
    if (img?.ok) return { bytes: Buffer.from(await img.arrayBuffer()), type: img.headers.get("content-type") || "image/jpeg", place: pick.place, credit: pick.credit, at: over ? Date.now() : pick.checkedAt.getTime() };
    // (the kept photo can't be fetched: looked at afresh)
  }
  const found = await lookUp(cityId);
  if (found === "failed") return null;
  const data = found ? { ref: found.ref, place: found.photo.place, credit: found.photo.credit, checkedAt: new Date() } : { ref: null, place: null, credit: null, checkedAt: new Date() };
  await prisma.cityPhotoPick.upsert({ where: { cityId }, create: { cityId, ...data }, update: data }).catch((e) => console.warn("[city-photo] not kept:", e?.message || e));
  return found ? found.photo : null;
}

/** A photo that can stand for the city this trip: a view of the place, nothing in it saying another season.
 *  Claude looks at the whole picture and names what it sees before judging (Oct 10 re-audit: a one-word glance by a
 *  small model passed Fukuoka Tower with Christmas trees and Santa figures along its foot, and Okayama's winter garden).
 *  True: fits. False: doesn't. Null: couldn't be judged (an error, a decline) — never shown on a guess, and never kept
 *  as "none fits". With no key at all (local work) every photo stands. */
const SEASON_SCHEMA = {
  type: "object",
  properties: {
    seen: { type: "string", description: "What in the photo tells the season or an occasion, briefly — or that it isn't a view of a place" },
    fits: { type: "boolean" },
  },
  required: ["seen", "fits"],
  additionalProperties: false,
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** What Claude is asked about a photo. Japan's October trip keeps its own words, exactly. Any other city is judged by
 *  its own country and the days the trip is there (Nov 17: Hanoi in December was being judged as "Hanoi, Japan, in
 *  mid-to-late October", and a ski town in January would have had every snowy photo turned away). */
export function seasonQuestion(cityName: string, country: string | null = null, dates: Date[] = []): string {
  const days = dates.map((d) => d.toISOString().slice(0, 10)).sort();
  const japan = !country || /^japan$/i.test(country.trim());
  if (japan && days.every((d) => d.slice(5, 7) === "10")) {
    return `This photo will fill a phone's screen to greet travelers arriving in ${cityName}, Japan, in mid-to-late October. Look at the whole picture, including small things at its edges and along the bottom. It fits only if it is a view of the place (a landmark, street, garden or landscape — not a close-up of food, a portrait or a sign) and nothing in it belongs to another season: no Christmas trees, Santa figures, Christmas or New Year decorations or illuminations; no snow or ice; no bare leafless trees or brown dormant lawns (winter); no cherry blossoms (spring). Green trees or autumn color are fine. In "seen", say briefly what in the photo tells the season or occasion; then set "fits".`;
  }
  // (no dates at all, outside Japan: nothing to judge a season by, so only "is it a view of the place")
  if (!days.length) return `This photo will fill a phone's screen to greet travelers arriving in ${cityName}, ${country!.trim()}. Look at the whole picture, including small things at its edges and along the bottom. It fits only if it is a view of the place (a landmark, street, garden or landscape — not a close-up of food, a portrait, a sign, or a show on a stage inside a hall). In "seen", say briefly what the photo shows; then set "fits".`;
  const say = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
  const first = days[0], last = days[days.length - 1];
  const when = first === last ? `on ${say(first)}` : `from ${say(first)} to ${say(last)}`;
  return `This photo will fill a phone's screen to greet travelers arriving in ${cityName}${country ? `, ${country.trim()}` : ""}, who are there ${when}. Look at the whole picture, including small things at its edges and along the bottom. It fits only if it is a view of the place (a landmark, street, garden or landscape — not a close-up of food, a portrait, a sign, or a show on a stage inside a hall) and nothing in it belongs to another time of year there. What ${cityName} really looks like on those dates is fine: snow at a mountain resort in winter, bare trees in a city with cold winters, green in the tropics, lights or decorations for a holiday within a few weeks of those dates. It doesn't fit if it shows a season those dates can't have there (cherry blossoms or autumn color in midwinter, snow where it doesn't snow then, summer green on a ski mountain in January) or a holiday months away. In "seen", say briefly what in the photo tells the season or occasion; then set "fits".`;
}

export async function fitsTheSeason(bytes: Buffer, type: string, cityName: string, country: string | null = null, dates: Date[] = []): Promise<boolean | null> {
  if (!process.env.ANTHROPIC_API_KEY) return true;
  if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return false;
  try {
    const r = await new Anthropic().messages.create({
      model: "claude-opus-5", max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: SEASON_SCHEMA } },
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: type as "image/jpeg", data: bytes.toString("base64") } },
        { type: "text", text: seasonQuestion(cityName, country, dates) },
      ] }],
    });
    note("ai.city_photo_check", { in: r.usage?.input_tokens, out: r.usage?.output_tokens });
    if (r.stop_reason === "refusal" || r.stop_reason === "max_tokens") return null;
    const text = r.content.filter((c): c is Anthropic.TextBlock => c.type === "text").map((c) => c.text).join("");
    const said = JSON.parse(text) as { seen: string; fits: boolean };
    console.log(`[city-photo] ${cityName}: ${said.fits ? "fits" : "doesn't fit"} — ${said.seen}`);
    return said.fits === true;
  } catch (err) {
    console.warn(`[city-photo] ${cityName}: couldn't judge the photo —`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** The photo that fits and Google's reference for it; null when none fits; "failed" when the look itself failed */
async function lookUp(cityId: string): Promise<{ photo: Photo; ref: string } | null | "failed"> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const city = await prisma.city.findUnique({ where: { id: cityId }, select: { name: true, country: true, latitude: true, longitude: true } }).catch(() => null);
  // Only a city that's on the map: its photo is looked for near where it is, so a place whose location isn't settled
  // (Oct 1: Shirakabeso) shows no photo rather than somewhere else's
  if (!key) return "failed";
  if (!city || city.latitude == null || city.longitude == null) return null;
  // (the days the trip is in this city: the season a photo is judged by)
  let dates = (await prisma.day.findMany({ where: { cityId }, select: { date: true } }).catch(() => [])).map((d) => d.date);
  // (a city with no day of its own, such as one that only holds maybes: the trip's own dates)
  if (!dates.length) {
    const trip = await prisma.trip.findFirst({ where: { cities: { some: { id: cityId } } }, select: { startDate: true, endDate: true } }).catch(() => null);
    dates = [trip?.startDate, trip?.endDate].filter((d): d is Date => d instanceof Date);
  }
  try {
    // The city's best-known sight: the most-reviewed tourist attraction near it (a "<city> landmark" search took
    // Google's first hit — for Nikko, a supermarket called Nikko)
    const find: any = await (await googleFetch("google.search", `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(`${city.name} sights`)}&location=${city.latitude},${city.longitude}&radius=12000&type=tourist_attraction&key=${key}`)).json();
    const lat = city.latitude, lng = city.longitude;
    const kmFrom = (at: any) => Math.hypot((at.lat - lat) * 111, (at.lng - lng) * 111 * Math.cos((lat * Math.PI) / 180));
    // Not a mall, shop, theme park or hotel (Hakata's most-reviewed "sight" is a mall, Tokyo's is Disneyland), and in
    // the city itself — location only prefers, and "Okayama" would otherwise be Kurashiki, a town 17 km away. (12 km:
    // Nikko's pin is its town hall, 9 km from Tōshō-gū.)
    const NOT_A_SIGHT = new Set(["shopping_mall", "store", "department_store", "amusement_park", "lodging", "clothing_store", "restaurant"]);
    const sights = (find?.results || [])
      .filter((r: any) => r.photos?.[0]?.photo_reference && r.geometry?.location && kmFrom(r.geometry.location) <= 12)
      .filter((r: any) => !(r.types || []).some((t: string) => NOT_A_SIGHT.has(t)))
      .sort((a: any, b: any) => (b.user_ratings_total || 0) - (a.user_ratings_total || 0));
    // The best-known sight's photo — unless it shows another season or isn't a view of the place (Oct 10 audit: Hakata's
    // was Fukuoka Tower with Santas and a Christmas tree, in October); then the next sight's. A careful look by Claude,
    // once per city while it's kept. None that fits: no photo (Oct 10 re-audit: the first one used to stand anyway).
    if (find?.status && !["OK", "ZERO_RESULTS"].includes(find.status)) return "failed";
    let best: any = null, bytes: Buffer | null = null, type = "image/jpeg", unsure = false;
    for (const s of sights.slice(0, 5)) {
      // (1200 wide: a phone's full screen, at a third less to send than 1600 — it has to be ready before the day draws)
      const img = await googleFetch("google.photo", `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${s.photos[0].photo_reference}&key=${key}`);
      if (!img.ok) { unsure = true; continue; }
      const b = Buffer.from(await img.arrayBuffer());
      const t = img.headers.get("content-type") || "image/jpeg";
      const fits = await fitsTheSeason(b, t, city.name, city.country, dates);
      if (fits === null) unsure = true;
      if (fits) { best = s; bytes = b; type = t; break; }
    }
    const p = best?.photos?.[0];
    // (none fit — or none could be judged: only a plain "none fits" is kept for the week)
    if (!p || !bytes) return unsure ? "failed" : null;
    // "<a href=…>Name</a>" → "Name"
    const who = ((p.html_attributions || [])[0] || "").replace(/<[^>]+>/g, "").trim();
    // the sight spelled as her Guide spells places ("Nikko", not Google's "Nikkō")
    const place = best.name ? String(best.name).normalize("NFD").replace(/\p{M}/gu, "") : null;
    return { photo: { bytes, type, place, credit: who ? `Photo: ${who}` : null, at: Date.now() }, ref: p.photo_reference };
  } catch {
    return "failed";
  }
}

router.get("/:cityId/info", async (req, res) => {
  const photo = await photoFor(req.params.cityId);
  res.set("Cache-Control", photo ? "private, max-age=86400" : "no-store");
  // (the picture's address names this photo — a phone keeps an image a week, and kept showing one Wander had replaced)
  res.json(photo ? { image: `/api/city-photo/${req.params.cityId}/image?v=${createHash("sha1").update(photo.bytes).digest("hex").slice(0, 10)}`, place: photo.place, credit: plainCredit(photo.credit) } : { image: null });
});

router.get("/:cityId/image", async (req, res) => {
  const photo = await photoFor(req.params.cityId);
  if (!photo) { res.status(404).end(); return; }
  res.set("Cache-Control", "public, max-age=604800, immutable");
  res.type(photo.type).send(photo.bytes);
});

export default router;
