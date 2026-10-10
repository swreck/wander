/**
 * The day's real forecast for where you are, from Open-Meteo (free, no key) — Ken, Oct 10: "It should be your best
 * internet forecast available at run time." Her sheet's line ("Larisa's forecast: lows 57-63…") was written before the
 * trip; it's said only when no live forecast exists (more than 16 days ahead, or never fetched on this phone).
 *
 * Kept on the phone (by place and date) so the day draws it at once and it still shows with no signal; fetched again
 * when the copy is more than an hour old.
 */
export interface DayForecast { lo: number; hi: number; rain: number | null; code: number | null; at: string }

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
  if (saved && Date.now() - Date.parse(saved.at) < FRESH) return saved;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code`
      + `&temperature_unit=fahrenheit&timezone=${encodeURIComponent(zone)}&start_date=${date}&end_date=${date}`;
    const r = await fetch(url);
    if (!r.ok) return saved;
    const d = (await r.json())?.daily;
    if (!d || d.temperature_2m_max?.[0] == null) return saved;
    const f: DayForecast = { hi: Math.round(d.temperature_2m_max[0]), lo: Math.round(d.temperature_2m_min[0]), rain: d.precipitation_probability_max?.[0] ?? null, code: d.weather_code?.[0] ?? null, at: new Date().toISOString() };
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

/** Rain likely: a 40%+ chance, or a rainy sky in the weather code (drizzle, rain, showers, thunder) */
export const rainLikely = (f: DayForecast) => (f.rain ?? 0) >= 40 || (f.code !== null && ((f.code >= 51 && f.code <= 67) || (f.code >= 80 && f.code <= 99)));
/** A clear sky: weather code 0–1 and little chance of rain */
export const clearSky = (f: DayForecast) => f.code !== null && f.code <= 1 && (f.rain ?? 0) < 20;
