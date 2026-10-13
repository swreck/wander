/**
 * The day's real forecast for where you are, from Open-Meteo (free, no key) — Ken, Oct 10: "It should be your best
 * internet forecast available at run time." Her sheet's line ("Larisa's forecast: lows 57-63…") was written before the
 * trip; it's said only when no live forecast exists (more than 16 days ahead, or never fetched on this phone).
 *
 * Kept on the phone (by place and date) so the day draws it at once and it still shows with no signal; fetched again
 * when the copy is more than an hour old.
 */
import { api } from "./api";

// (the words: the same file Scout's answers are made with, backend/src/services/forecastWords.ts)
export { rainInches, rainWhen, rainDisputed, rainLikely, clearSky } from "./forecastWords";

export interface DayForecast {
  lo: number; hi: number; rain: number | null; code: number | null; at: string;
  /** the shape of a copy kept on the phone (SHAPE) */
  v?: number;
  /** the day's expected rain, inches */
  inches?: number | null;
  /** From Wander's server (dayForecastFor): where — that night's hotel, or the town — and how sure */
  place?: string; atHotel?: boolean; models?: "wet" | "dry" | "split" | "unknown"; outlook?: "forecast" | "early outlook";
  /** the town of that night's stay, to name the line when there are two */
  town?: string;
  /** the hours rain is likeliest, [from, to) on Japan's clock — a day up to 3 days out with a real chance (rainWhen) */
  wet?: [number, number][];
  /** hours one model alone sees showers in, outside those (rainWhen) */
  showers?: [number, number][];
  /** the day's other place, when her plan names one: a day trip ("day") or where a travel day starts ("morning") —
   *  Ken, Oct 13: "both weathers should be there" */
  also?: { place: string; when: "day" | "morning"; lo: number; hi: number; rain: number | null; inches?: number | null; code: number | null; models?: "wet" | "dry" | "split" | "unknown"; outlook?: "forecast" | "early outlook"; wet?: [number, number][]; showers?: [number, number][] };
}

const KEY = "wander:forecast";
const FRESH = 60 * 60_000;
// (the shape of a kept copy: one kept by an older Wander is fetched again however fresh — on Oct 13 the old app kept
// Oct 14 at 7:46 PM without the rain hours, the update came a minute later, and the new app showed that copy for an
// hour with no hours in it; Ken's phone. Raise it whenever the server sends something new)
const SHAPE = 2;

const keyOf = (lat: number, lon: number, date: string) => `${lat.toFixed(2)},${lon.toFixed(2)}|${date}`;
function readAll(): Record<string, DayForecast> {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

/** This phone's copy for that place and day, if any (for the first drawing) */
export function savedForecast(lat: number | null | undefined, lon: number | null | undefined, date: string): DayForecast | null {
  if (lat == null || lon == null) return null;
  return readAll()[keyOf(lat, lon, date)] || null;
}

/** The live forecast for that place and day (in the trip's zone); null when there's none to be had */
export async function forecastFor(lat: number | null | undefined, lon: number | null | undefined, date: string, zone = "Asia/Tokyo"): Promise<DayForecast | null> {
  if (lat == null || lon == null) return null;
  const saved = savedForecast(lat, lon, date);
  // (a copy from before the rain amount was asked for is fetched again — Oct 13)
  if (saved && Date.now() - Date.parse(saved.at) < FRESH && saved.v === SHAPE) return saved;
  try {
    const url =`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code`
      + `&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=${encodeURIComponent(zone)}&start_date=${date}&end_date=${date}`;
    const r = await fetch(url);
    if (!r.ok) return saved;
    const d = (await r.json())?.daily;
    if (!d || d.temperature_2m_max?.[0] == null) return saved;
    const f: DayForecast = { hi: Math.round(d.temperature_2m_max[0]), lo: Math.round(d.temperature_2m_min[0]), rain: d.precipitation_probability_max?.[0] ?? null,
      inches: typeof d.precipitation_sum?.[0] === "number" ? Math.round(d.precipitation_sum[0] * 100) / 100 : null, code: d.weather_code?.[0] ?? null, at: new Date().toISOString() };
    try {
      const all = readAll();
      all[keyOf(lat, lon, date)] = { ...f, v: SHAPE };
      // (the newest few dozen only)
      const keys = Object.keys(all);
      for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete all[k];
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* storage full or private: fetched again next time */ }
    return f;
  } catch {
    return saved; // no signal: this phone's copy, however old
  }
}

/**
 * The day's forecast where you sleep that night, from Wander's server (Oct 13 2026, Ken's weather plan): the night's
 * hotel — the Ritz-Carlton on Lake Chuzenji, not Nikko town ~2,000 ft below, 5–10°F warmer — and how sure it is (more
 * than a week out, an early outlook; rain checked against Europe's, Japan's and the US models). Kept on the phone by
 * trip and day, like the forecast above, so it draws at once and still shows with no signal.
 */
const dayKey = (tripId: string, date: string) => `trip:${tripId}|${date}`;
export function savedDayForecast(tripId: string, date: string): DayForecast | null {
  return readAll()[dayKey(tripId, date)] || null;
}
export async function dayForecastFor(tripId: string, date: string): Promise<DayForecast | null> {
  const saved = savedDayForecast(tripId, date);
  if (saved && Date.now() - Date.parse(saved.at) < FRESH && saved.v === SHAPE) return saved;
  try {
    const { weather: w } = await api.get<{ weather: ServerDay | null }>(`/weather/trip/${tripId}/day/${date}`);
    if (!w) return saved;
    return keepDayForecast(tripId, date, w, false) || saved;
  } catch {
    return saved; // no signal: this phone's copy, however old
  }
}

type ServerDay = DayForecast & { place: string; atHotel: boolean };
/** Keep Wander's forecast for a day as this phone's copy. Also used for the forecast Scout read for an answer (Ken, Oct
 *  13: "One unified and correct source"): when Scout read a newer one than the phone has, the day page and Home show the
 *  same numbers Scout just said — at once, if they're on screen (`tell`). An older one never replaces a newer. */
export function keepDayForecast(tripId: string, date: string, w: ServerDay, tell = true): DayForecast | null {
  // (a forecast without its numbers never replaces a good copy — verify43: "undefined‑undefined°F… Invalid Date")
  if (!w || typeof w !== "object" || typeof w.lo !== "number" || typeof w.hi !== "number" || isNaN(Date.parse(w.at))) return null;
  const f: DayForecast = { hi: w.hi, lo: w.lo, rain: w.rain, inches: w.inches ?? null, code: w.code, at: w.at, place: w.place, atHotel: w.atHotel, models: w.models, outlook: w.outlook,
    town: w.town, ...(w.wet ? { wet: w.wet } : {}), ...(w.showers ? { showers: w.showers } : {}),
    ...(w.also && typeof w.also.lo === "number" && typeof w.also.hi === "number" ? { also: { place: w.also.place, when: w.also.when, lo: w.also.lo, hi: w.also.hi, rain: w.also.rain, inches: w.also.inches ?? null, code: w.also.code, models: w.also.models, outlook: w.also.outlook, ...(w.also.wet ? { wet: w.also.wet } : {}), ...(w.also.showers ? { showers: w.also.showers } : {}) } } : {}) };
  try {
    const all = readAll();
    const had = all[dayKey(tripId, date)];
    if (tell && had && had.v === SHAPE && Date.parse(had.at) >= Date.parse(f.at)) return had;
    all[dayKey(tripId, date)] = { ...f, v: SHAPE };
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete all[k];
    localStorage.setItem(KEY, JSON.stringify(all));
    if (tell) window.dispatchEvent(new CustomEvent(FORECAST_KEPT, { detail: { tripId, date } }));
  } catch { /* storage full or private: fetched again next time */ }
  return f;
}
/** Said on the window when a forecast Scout read is kept: { tripId, date } */
export const FORECAST_KEPT = "wander:forecast-kept";
