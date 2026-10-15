/**
 * Where a line of her plan is, for Maps and for its photo — one reading for every screen (the day page and Home), so a
 * line shows the same place, and the same checked photo, wherever it appears. Moved here from DayPage (Oct 16) when
 * Home's list took its places' photos.
 */
import { useEffect, useMemo, useState } from "react";
import type { GuideItem } from "./guideData";
import { mapsQueryFor, mapsLink, saidAgain, linksIn } from "./guideDisplay";
import { keptPlacePhotos, lookUpPlacePhotos, mapsQueryOf, type PlaceHit } from "./placePhotos";

/** Her choices on a line: [{ name: "Omen", note: "udon near Ginkaku-ji" }] */
export function choicesOf(b: GuideItem): { name: string; note: string }[] {
  return (b.detail || "").split("\n").filter((l) => l.startsWith("Choice: ")).map((l) => {
    const [name, ...rest] = l.slice(8).split(" — ");
    return { name: name.trim(), note: rest.join(" — ").trim() };
  });
}
// Lines that are moves, not places ("Taxi north", "Leave Shiraume", "Shower/change/rest") get no Maps link
export const NOT_A_PLACE = /^(taxi|leave|return|depart|arrive|collect|check|shower|split|breakfast|lunch$|evening|refresh|flight|board|drop|continue|finish|optional|traditional)/i;
/**
 * The place a line of her plan names, for Maps — only when her words name one. Her own stop links come
 * first (the Guide reader attaches them); this is the fallback. Round 6: "Ginza Premium Retail Walk, Tokyo"
 * and "Complimentary Residence transfer to Kyoto Station" were searched as if they were places.
 */
export function placeOf(label: string): string | null {
  const t = label.trim();
  // Named outright: "… ideally Shoraian", "transfer to Kyoto Station", "Refresh at the Imperial Hotel"
  const explicit = t.match(/\bideally\s+(?:at\s+)?([^,;()]+)/i) || t.match(/\b(?:to|at)\s+(?:the\s+)?([A-Z][^,;()—–/]*)$/);
  if (explicit) return explicit[1].trim() || null;
  if (NOT_A_PLACE.test(t)) return null;
  // A heading-style line: "LIGHT LUNCH – Ginza Mitsukoshi Depachika", "DINNER RESERVATION – UNE IMMERSION (Shibuya)"
  const caps = t.match(/^[A-Z][A-Z &-]+\s+[–-]\s+(.+)$/);
  if (caps) return caps[1].replace(/\s*\([^)]*\)\s*$/, "").trim();
  // A short proper name ("Tenryu-ji", "Nishiki Market", "Hassun — Michelin…"); a longer line is a description
  const name = t.split(/\s+[—–]\s+/)[0].replace(/\s+(lunch|dinner|breakfast)$/i, "").trim();
  const words = name.split(/\s+/);
  return words.length <= 3 && words.every((w) => /^[A-Z]/.test(w)) && !name.includes("/") ? name : null;
}
/**
 * Where a line of her plan is on a map: her own link, else a search for the place her words name. "The hotel"
 * is that night's stay (hotel: its Maps search), and no link when Wander can't tell which (round 11: "Strict
 * Formalwear Prep at the Hotel" searched Maps for any hotel in Tokyo, not the Imperial)
 */
export interface MapContext { hotel?: string | null; dayWords?: string; bookings?: GuideItem[] }
export function planMapHref(b: GuideItem, ctx: MapContext = {}): string | null {
  const hotel = ctx.hotel ?? null;
  // A line with choices ("Lunch") isn't a place — each choice is (round 6: "Test lunch, Kyoto")
  if (choicesOf(b).length) return null;
  // Leaving a place isn't going there — no map of the hotel you're standing in
  if (/^\s*(leave|depart)\b/i.test(b.title)) return null;
  // Her tabs put the place in different areas: no second map here — the booking's own address is the one link, and
  // the "tabs differ" note says both (round 12: Yazawa had two Maps links to two different places)
  if (/^Tabs differ: .* puts it in /m.test(b.detail || "")) return null;
  if (linksIn(b.link)[0]) return linksIn(b.link)[0];
  // The stop her tab names for a line that only says what it's for ("Taxi to e-bike meeting point" → Cycle Kyoto)
  const where = (b.detail || "").match(/^Where: (.+?) — the stop her tab lists/m)?.[1];
  if (where) return mapsLink(`${where}, ${areaOf(b, ctx.dayWords)}Japan`);
  // The same place as one of her bookings that day: the booking's own address (round 12: her Oct 26 "Hassun" line
  // searched a name; the Hassun booking has her Gion address)
  const booked = (ctx.bookings || []).find((m) => m.time === b.time && saidAgain(b, m));
  if (booked) {
    const q = mapsQueryFor(booked);
    if (q) return mapsLink(q);
    if (linksIn(booked.link)[0]) return linksIn(booked.link)[0];
  }
  const p = placeOf(b.title);
  if (p && /^(?:the\s+|our\s+)?(?:hotel|ryokan|room|hotel room|lobby|residence)$/i.test(p)) return hotel ? mapsLink(hotel) : null;
  // Tonight's hotel by its name: the hotel's own search, never the day tab's area (round 12: "Refresh at the Imperial
  // Hotel" searched "Imperial Hotel, Ginza" — it isn't in Ginza)
  const bare = (s: string) => s.toLowerCase().replace(/^the\s+/, "").trim();
  if (p && hotel && bare(hotel).includes(bare(p))) return mapsLink(hotel);
  return p ? mapsLink(`${p}, ${areaOf(b, ctx.dayWords)}Japan`) : null;
}
/**
 * The city her day tab is about, for a Maps search ("Kyoto Tue, 1027…" → "Kyoto, "). Round 7: "TeamLab,
 * Japan" could land on the Tokyo teamLab. Only the city: the rest of a tab name is cut short by the
 * sheet ("Kappabashi & Akihab", "1027Kiyomizu-dera Te") and would mislead a search.
 */
export function areaOf(b: GuideItem, dayWords = ""): string {
  const tab = b.source.split(" · ")[0];
  const city = tab.match(/^([A-Z][a-z]{2,})\s/)?.[1];
  if (!city || /^(Day|Dining|Flight)$/.test(city)) return "";
  // The place her tab names after its date goes in too — only when her Itinerary line for the day names it, so it's
  // the whole day's place ("Kyoto Wed, 1028 Shigaraki" + "Kyoto day 4 - Shigaraki": Maruni Toryo, Shigaraki), never
  // just the morning's (round 12: "Kyoto Mon, 1026 Arashiyama-…" sent Gion's Hassun to "Hassun, Arashiyama")
  const town = tab.match(/(?:\d{3,4}|Day \d+)\s*([A-Z][a-z]{3,})(?![a-z])/)?.[1];
  // (the town alone: Shigaraki isn't in Kyoto's prefecture — "Shigaraki, Kyoto" could mislead a search)
  return town && town !== city && dayWords.toLowerCase().includes(town.toLowerCase()) ? `${town}, ` : `${city}, `;
}

// (no photo on a line about getting somewhere — "Taxi to Raku Museum", "Continue same taxi to TeamLab": the photo is
// the place's, on its own line; tourist63 saw TeamLab's three times in a row)
export const TRAVEL = /^\W*(taxi|train|bus|shuttle|ride|drive|board|transfer|continue|return(ing)?|head(ing)?|go(ing)?|walk(ing)?\s+(to|back|over)|complimentary\b.*\btransfer)\b|→/i;

/** The checked photo for each line of her plan that is a place — as the day page finds them (its Maps search, her tab's
 *  named stop), each place once, on the first of its lines. For Home's list (Oct 16: "50-100% further" toward the visual). */
export function useLinePhotos(tripId: string | null, cityId: string | null | undefined, blocks: GuideItem[], ctx: MapContext): (b: GuideItem) => PlaceHit | null {
  const queries = useMemo(() => blocks.map((b) => {
    if (choicesOf(b).length || TRAVEL.test(b.title)) return null;
    const query = mapsQueryOf(planMapHref(b, ctx));
    const where = (b.detail || "").match(/^Where: (.+?) — the stop her tab lists/m)?.[1];
    return query ? { id: b.id, query, line: where ? `${b.title} (her tab names the stop: ${where})` : b.title } : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }).filter((x): x is { id: string; query: string; line: string } => !!x), [blocks.map((b) => b.id).join(), ctx.hotel, ctx.dayWords, (ctx.bookings || []).map((m) => m.id).join()]);
  const [photos, setPhotos] = useState<Record<string, PlaceHit | null>>(() => keptPlacePhotos(queries));
  useEffect(() => {
    if (!tripId || !queries.length) return;
    let live = true;
    setPhotos(keptPlacePhotos(queries));
    lookUpPlacePhotos(tripId, cityId, queries.map((q) => ({ query: q.query, line: q.line }))).then((p) => { if (live) setPhotos(p); }).catch(() => { /* drawn without */ });
    return () => { live = false; };
  }, [tripId, cityId, queries]);
  const firstFor = new Map<string, string>();
  for (const q of queries) { const h = photos[q.query]; if (h && !firstFor.has(h.id)) firstFor.set(h.id, q.id); }
  return (b: GuideItem) => { const q = queries.find((x) => x.id === b.id)?.query; const h = q ? photos[q] || null : null; return h && firstFor.get(h.id) === b.id ? h : null; };
}
