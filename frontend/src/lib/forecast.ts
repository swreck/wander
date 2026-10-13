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
  // (a no-break space: at 375 pt "(1.91")" wrapped away from its "47%" — verify32)
  x == null ? "" : ` (${x >= 1 ? x.toFixed(2) : x === 0 ? "0" : "." + x.toFixed(2).split(".")[1]}")`;

export interface DayForecast {
  lo: number; hi: number; rain: number | null; code: number | null; at: string;
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

/** When in the day the rain is most likely, said after the chance: ", most likely 9–11 AM and 4–8 PM" (Ken's weather
 *  plan item 3, agreed Oct 13: the hourly rain window on the days just ahead). On today, only the hours still to come,
 *  worked out here on the phone so a copy kept from this morning never offers rain that's already been; "" when none
 *  is left. `now` is for tests. `part`: on a travel day, the hours they're in that place — the morning where the day
 *  starts (to 1 PM), the afternoon where they sleep (from noon); its hours ran to 10 PM, after they'd left (verify35). */
export function rainWhen(x: { wet?: [number, number][]; showers?: [number, number][] } | undefined, date: string, now = new Date(), part?: "morning" | "afternoon"): string {
  if (!x?.wet?.length && !x?.showers?.length) return "";
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  if (date < today) return "";
  const hour = date === today ? Number(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hourCycle: "h23" })) : 0;
  const [from, to] = part === "morning" ? [7, 13] : part === "afternoon" ? [12, 22] : [7, 22];
  const start = Math.max(from, hour);
  const ahead = (xs: [number, number][] | undefined) => (xs || []).map(([s, e]) => [Math.max(s, start), Math.min(e, to)] as [number, number]).filter(([s, e]) => s < e);
  const spans = ahead(x.wet), showers = ahead(x.showers);
  if (!spans.length && !showers.length) return "";
  const hours = spans.reduce((n, [s, e]) => n + e - s, 0);
  // (the day's hours, 7 AM to 10 PM — or what's left of today; not for part of a travel day)
  const left = 22 - start;
  // ("likely": beside "but the forecasts disagree", a bare "for the rest of the day" read oddly — verify34)
  if (!part && hour > 7 && left >= 2 && hours >= left) return ", likely for the rest of the day";
  if (!part && hours >= 10) return ", likely through most of the day";
  // (a time never splits across lines: "4–8" then "PM" did at 402 pt — no-break space, and a word joiner after the dash)
  const at = (h: number) => (h === 12 ? "noon" : `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`);
  const span = ([s, e]: [number, number]) => {
    // (rain under way — or from the first hour that counts — says when it ends: at 9:40 PM, "until 10 PM", not "from
    // 9 PM"; verify35)
    // (all of a travel day's part: "all morning" where it starts; "from noon" where they sleep)
    if (s <= start && e >= to && part === "morning" && start === 7) return "all morning";
    if (s <= start && e >= to && part === "afternoon" && start === 12) return "from noon";
    // (rain running past a travel morning's 1 PM: 1 PM is where Wander stops looking, not when the rain stops — "10 AM–1
    // PM" read as a forecast end; verify36)
    if (part === "morning" && e >= to) return s <= start ? "for the rest of the morning" : `from ${at(s)}`;
    if (s <= start) return `until ${at(e)}`;
    if (e >= 22) return `from ${at(s)}`;
    // ("9–11 AM", "4–8 PM"; "11 AM–1 PM", "10 AM–noon" when it crosses midday)
    const same = s !== 12 && e !== 12 && (s < 12) === (e < 12);
    return same ? `${s % 12 || 12}–⁠${at(e)}` : `${at(s)}–⁠${at(e)}`;
  };
  const main = !spans.length ? "" : spans.length > 2 ? `on and off ${at(spans[0][0])} to ${at(spans[spans.length - 1][1])}` : `most likely ${spans.map(span).join(" and ")}`;
  // (and showers one model alone sees — Japan's, for Mashiko's morning on Oct 14; two spans at most, or it's a list)
  const maybe = showers.length && showers.length <= 2 && spans.length <= 2 ? `showers possible ${showers.map(span).join(" and ")}` : "";
  return main && maybe ? `, ${main}, with ${maybe}` : main || maybe ? `, ${main || maybe}` : "";
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
      town: w.town, ...(w.wet ? { wet: w.wet } : {}), ...(w.showers ? { showers: w.showers } : {}),
      ...(w.also ? { also: { place: w.also.place, when: w.also.when, lo: w.also.lo, hi: w.also.hi, rain: w.also.rain, inches: w.also.inches ?? null, code: w.also.code, models: w.also.models, outlook: w.also.outlook, ...(w.also.wet ? { wet: w.also.wet } : {}), ...(w.also.showers ? { showers: w.also.showers } : {}) } } : {}) };
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
