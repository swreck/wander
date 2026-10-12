/**
 * The weather where this person will actually sleep, for packing (Ken, Oct 12 2026: "Might be worth adding weather
 * guidance to what you proactively give andy and Julie in these last days of packing… Help Scout be helpful!" — then
 * "Adjust your packing tips for this. Don't say obvious things. Be helpful."). From the live forecast (Open-Meteo, the
 * day headers' source; free, no key, 16 days ahead), stay by stay — at her own pin for the hotel when she has one (the
 * Ritz-Carlton Nikko is on Lake Chuzenji, ~4,200 ft, far colder than Nikko town's point), else the town's.
 */
import prisma from "./db.js";
import { appleGuidesOf } from "./guide/appleGuides.js";
import { myMapOf } from "./guide/googleMyMap.js";
import { pinFor, type Pin } from "./guide/nearby.js";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return ymd(x); };
const say = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Where a hotel is, by its name, from Google Places (Wander's own key) — once per hotel while the server runs */
const points = new Map<string, { lat: number; lng: number } | null>();
async function hotelPoint(query: string): Promise<{ lat: number; lng: number } | null> {
  if (points.has(query)) return points.get(query)!;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  let p: { lat: number; lng: number } | null = null;
  if (key) {
    try {
      const r = await (await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=geometry&key=${key}`)).json() as any;
      const g = r?.candidates?.[0]?.geometry?.location;
      if (typeof g?.lat === "number" && typeof g?.lng === "number") p = { lat: g.lat, lng: g.lng };
    } catch { /* the town's point instead */ }
  }
  points.set(query, p);
  return p;
}

export interface StayWeather {
  stay: string; town: string; nights: string; firstNight: string; daysAway: number;
  /** whose point the numbers are for — the hotel's own, or the town's when Wander doesn't know where the hotel is */
  at: string;
  /** "forecast" (all within a week), "early outlook" (all beyond), or "forecast to <day>, then early outlook" */
  outlook: string;
  highs: string; lows: string; coldestLow: number; warmestHigh: number;
  /** models: "agree" when Europe's, Japan's and the US forecasts all show rain that day; "disagree" when one shows
   *  little or none (then it only may rain); "unknown" when the comparison couldn't be read */
  wetDays: { day: string; chance: number; inches: number; outlook: "forecast" | "early outlook"; models: "agree" | "disagree" | "unknown" }[];
}

/** The stays this person sleeps in from today on (her Guide's "who" — empty means everyone), with their forecast */
export async function packingWeather(tripId: string, person: string, today: string): Promise<StayWeather[]> {
  const me = person.toLowerCase();
  // (from their own first night: her Guide's first check-in for them — Julie & Andy's Imperial, Oct 14; the nights
  // before are the others', in Japan while they're at home)
  const ownIn = (await prisma.guideItem.findMany({ where: { tripId, kind: "checkin", forWhom: { contains: person, mode: "insensitive" } }, select: { date: true }, orderBy: { date: "asc" }, take: 1 }))[0]?.date;
  const start = ownIn && ymd(ownIn) > today ? ymd(ownIn) : today;
  const stays = (await prisma.accommodation.findMany({ where: { tripId }, select: { name: true, forWhom: true, checkInDate: true, checkOutDate: true, latitude: true, longitude: true, city: { select: { name: true, latitude: true, longitude: true } } }, orderBy: { checkInDate: "asc" } }))
    .filter((s) => s.checkInDate && s.checkOutDate && ymd(s.checkOutDate) > start && (!s.forWhom || /everyone/i.test(s.forWhom) || s.forWhom.toLowerCase().includes(me)));
  if (!stays.length) return [];
  const pins: Pin[] = [];
  const map = await myMapOf(tripId).catch(() => null);
  for (const l of map?.layers ?? []) for (const p of l.places) pins.push({ name: p.name, lat: p.lat, lng: p.lng, note: null, from: "her Google map" });
  for (const g of await appleGuidesOf(tripId).catch(() => [])) for (const p of g.places) if (p.name && p.lat != null && p.lng != null) pins.push({ name: p.name, lat: p.lat, lng: p.lng, note: null, from: "her Apple Maps guide" });
  const last = addDays(today, 15);   // (Open-Meteo's 16 days)
  const out: StayWeather[] = [];
  for (const s of stays) {
    const from = ymd(s.checkInDate!) > start ? ymd(s.checkInDate!) : start;
    const to = addDays(ymd(s.checkOutDate!), -1) < last ? addDays(ymd(s.checkOutDate!), -1) : last;
    if (from > to) continue;
    const pin = pinFor(s.name, pins);
    // (the hotel itself — the Ritz-Carlton Nikko is on Lake Chuzenji, ~4,200 ft, 6–9°F colder than Nikko town's point)
    const found = s.latitude == null && !pin ? await hotelPoint(`${s.name} ${s.city.name.split(/\s+-\s+|\s*\(|,/)[0]} Japan`) : null;
    const lat = s.latitude ?? pin?.lat ?? found?.lat ?? s.city.latitude, lng = s.longitude ?? pin?.lng ?? found?.lng ?? s.city.longitude;
    if (lat == null || lng == null) continue;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=Asia%2FTokyo&start_date=${from}&end_date=${to}`, { signal: ctl.signal });
      clearTimeout(t);
      const d = (await r.json())?.daily;
      if (!d?.time?.length) continue;
      const hi = (d.temperature_2m_max as number[]).map(Math.round), lo = (d.temperature_2m_min as number[]).map(Math.round);
      const range = (xs: number[]) => (Math.min(...xs) === Math.max(...xs) ? `${xs[0]}°F` : `${Math.min(...xs)}–${Math.max(...xs)}°F`);
      const away = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      // (beyond a week a forecast is an outlook — day by day, not by the stay's first night: Nikko's Tue, Oct 20 is 8 days
      // out though its stay starts in 6, and "rain likely" was said of it as fact; verify23)
      const sure = (day: string): "forecast" | "early outlook" => (away(day) <= 7 ? "forecast" : "early outlook");
      const days = d.time as string[];
      const lastSure = [...days].reverse().find((day) => sure(day) === "forecast");
      // (the default above follows one model; the "68%" for the lake on Mon, Oct 19 was Europe's 13 mm while Japan's
      // model had 1.4 mm and the US model none — said as "likely" all the same. So: do all three show rain? Oct 12)
      const rainIn: Record<string, number[]> = {};
      try {
        const ctl2 = new AbortController();
        const t2 = setTimeout(() => ctl2.abort(), 8000);
        const m = (await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum&models=ecmwf_ifs025,jma_seamless,gfs_seamless&precipitation_unit=inch&timezone=Asia%2FTokyo&start_date=${from}&end_date=${to}`, { signal: ctl2.signal })).json())?.daily;
        clearTimeout(t2);
        (m?.time as string[] | undefined)?.forEach((day, i) => {
          const xs = ["ecmwf_ifs025", "jma_seamless", "gfs_seamless"].map((k) => m[`precipitation_sum_${k}`]?.[i]);
          if (xs.every((x) => typeof x === "number")) rainIn[day] = xs;
        });
      } catch { /* compared nowhere — "unknown", said as the default alone */ }
      const models = (day: string): "agree" | "disagree" | "unknown" => (!rainIn[day] ? "unknown" : rainIn[day].every((x) => x >= 0.04) ? "agree" : "disagree");
      out.push({
        stay: s.name, town: s.city.name.split(/\s+-\s+|\s*\(|,/)[0].trim(),
        nights: from === to ? say(from) : `${say(from)} – ${say(to)}`, firstNight: from, daysAway: away(from),
        at: s.latitude != null || pin || found ? "the hotel itself" : "the town (Wander doesn't know where the hotel is)",
        outlook: !lastSure ? "early outlook" : lastSure === days[days.length - 1] ? "forecast" : `forecast to ${say(lastSure)}, then early outlook`,
        highs: range(hi), lows: range(lo), coldestLow: Math.min(...lo), warmestHigh: Math.max(...hi),
        wetDays: days.map((day, i) => ({ day: say(day), chance: d.precipitation_probability_max?.[i] ?? 0, inches: Math.round((d.precipitation_sum?.[i] ?? 0) * 10) / 10, outlook: sure(day), models: models(day) }))
          .filter((w) => w.chance >= 60 || w.inches >= 0.4),
      });
    } catch { /* no forecast for this stay — left out, never guessed */ }
  }
  return out;
}
