/**
 * The day's real forecast for where you are, from Open-Meteo (free, no key) — Ken, Oct 10: "It should be your best
 * internet forecast available at run time." Her sheet's line ("Larisa's forecast: lows 57-63…") was written before the
 * trip; it's said only when no live forecast exists (more than 16 days ahead, or never fetched on this phone).
 *
 * Kept on the phone (by place and date) so the day draws it at once and it still shows with no signal; fetched again
 * when the copy is more than an hour old.
 */
import { api } from "./api";

/** The day's expected rain in inches, said right after the chance: " (.42\")" — Ken, Oct 13: "rain percentage is
 *  important, but especially in Japan, the quantity of rain matters… in parentheses right after the percentage" */
export const rainInches = (x: number | null | undefined) =>
  x == null ? "" : ` (${x >= 1 ? x.toFixed(2) : x === 0 ? "0" : "." + x.toFixed(2).split(".")[1]}")`;

export interface DayForecast {
  lo: number; hi: number; rain: number | null; code: number | null; at: string;
  /** the day's expected rain, inches */
  inches?: number | null;
  /** From Wander's server (dayForecastFor): where — that night's hotel, or the town — and how sure */
  place?: string; atHotel?: boolean; models?: "wet" | "dry" | "split" | "unknown"; outlook?: "forecast" | "early outlook";
  /** the town of that night's stay, to name the line when there are two */
  town?: string;
  /** the day's other place, when her plan names one: a day trip ("day") or where a travel day starts ("morning") —
   *  Ken, Oct 13: "both weathers should be there" */
  also?: { place: string; when: "day" | "morning"; lo: number; hi: number; rain: number | null; inches?: number | null; code: number | null; models?: "wet" | "dry" | "split" | "unknown"; outlook?: "forecast" | "early outlook" };
}

const KEY = "wander:forecast";
const FRESH = 60 * 60_000;

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
  if (saved && Date.now() - Date.parse(saved.at) < FRESH && "inches" in saved) return saved;
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
      all[keyOf(lat, lon, date)] = f;
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
  if (saved && Date.now() - Date.parse(saved.at) < FRESH && "inches" in saved) return saved;
  try {
    const { weather: w } = await api.get<{ weather: (DayForecast & { place: string; atHotel: boolean }) | null }>(`/weather/trip/${tripId}/day/${date}`);
    if (!w) return saved;
    const f: DayForecast = { hi: w.hi, lo: w.lo, rain: w.rain, inches: w.inches ?? null, code: w.code, at: w.at, place: w.place, atHotel: w.atHotel, models: w.models, outlook: w.outlook,
      town: w.town, ...(w.also ? { also: { place: w.also.place, when: w.also.when, lo: w.also.lo, hi: w.also.hi, rain: w.also.rain, inches: w.also.inches ?? null, code: w.also.code, models: w.also.models, outlook: w.also.outlook } } : {}) };
    try {
      const all = readAll();
      all[dayKey(tripId, date)] = f;
      const keys = Object.keys(all);
      for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete all[k];
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* storage full or private: fetched again next time */ }
    return f;
  } catch {
    return saved; // no signal: this phone's copy, however old
  }
}

/** On a day the main forecast gives a real chance of rain, what the other forecasts say: none of them shows rain to
 *  speak of ("drier"), some do and some don't ("split"), or null when they agree or weren't compared. Said which way —
 *  "disagree" alone didn't answer "will it rain?", and on Oct 19 all three showed only a trace (verify25) */
export const rainDisputed = (f: DayForecast): "drier" | "split" | null =>
  (f.rain ?? 0) < 30 ? null : f.models === "dry" ? "drier" : f.models === "split" ? "split" : null;

/** Rain likely: a 40%+ chance, or a rainy sky in the weather code (drizzle, rain, showers, thunder) */
export const rainLikely = (f: DayForecast) => (f.rain ?? 0) >= 40 || (f.code !== null && ((f.code >= 51 && f.code <= 67) || (f.code >= 80 && f.code <= 99)));
/** A clear sky: weather code 0–1 and little chance of rain */
export const clearSky = (f: DayForecast) => f.code !== null && f.code <= 1 && (f.rain ?? 0) < 20;
