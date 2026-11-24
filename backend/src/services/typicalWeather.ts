/**
 * A day too far ahead for a forecast (more than 16 days): what that week was like in the last five years, at the same
 * point, from Open-Meteo's archive. Free, no key. It is said as past years and never as a forecast (Ken, Oct 13 2026:
 * "If it is real, use it. If not, don't. Scout does not lie."): the years are named, the counts are counts of real
 * days, and nothing is predicted. For December's trip, asked in November: Hoi An's last week of December had rain on
 * 32 of 35 days in 2021–2025, which is worth knowing while packing.
 *
 * A rain day is 0.04 inches or more (1 mm, the usual line for a wet day); a heavy one 0.4 or more (10 mm). A day
 * with 0.4 inches of snow or more is a snow day and never also a rain day.
 */
import { meteo } from "./meteo.js";

export interface PastDay { hi: number; lo: number; wet: number; snow: number }
export interface Span { usual: number; from: number; to: number }
export interface Typical {
  /** the week asked about: the date and three days either side */
  from: string; to: string;
  /** the past years whose same week was read, newest first, and how many days they gave */
  years: number[]; days: number;
  hi: Span; lo: Span; rainDays: number; heavyDays: number; snowDays: number;
}

const DAY = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The same week (the date and three days either side) in each of the `n` years before the date's own, newest first.
 *  Feb 29 falls on Mar 1 in a year without one. */
export function sameWeeks(date: string, n = 5): { year: number; start: string; end: string }[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || ymd(Date.parse(`${date}T00:00:00Z`)) !== date) return [];
  const [y, m, d] = date.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const centre = Date.UTC(y - 1 - i, m - 1, d);
    return { year: y - 1 - i, start: ymd(centre - 3 * DAY), end: ymd(centre + 3 * DAY) };
  });
}

const RAIN = 0.04, HEAVY = 0.4, SNOW = 0.4;
/** What the days add up to; null when there are fewer than 15 (three weeks of five) */
export function summarize(days: PastDay[]): Pick<Typical, "days" | "hi" | "lo" | "rainDays" | "heavyDays" | "snowDays"> | null {
  if (days.length < 15) return null;
  const span = (xs: number[]): Span => ({ usual: Math.round(xs.reduce((s, x) => s + x, 0) / xs.length), from: Math.round(Math.min(...xs)), to: Math.round(Math.max(...xs)) });
  const snowy = (x: PastDay) => x.snow >= SNOW;
  return {
    days: days.length, hi: span(days.map((x) => x.hi)), lo: span(days.map((x) => x.lo)),
    snowDays: days.filter(snowy).length,
    rainDays: days.filter((x) => !snowy(x) && x.wet >= RAIN).length,
    heavyDays: days.filter((x) => !snowy(x) && x.wet >= HEAVY).length,
  };
}

/** The years as said: "2021–2025" when they run on, "2021, 2023 and 2025" when one is missing */
function yearsWords(years: number[]): string {
  const ys = [...years].sort((a, b) => a - b);
  if (ys.length > 1 && ys[ys.length - 1] - ys[0] === ys.length - 1) return `${ys[0]}–${ys[ys.length - 1]}`;
  return ys.length < 2 ? String(ys[0] ?? "") : `${ys.slice(0, -1).join(", ")} and ${ys[ys.length - 1]}`;
}
const spanWords = (s: Span) => `around ${s.usual}°F${s.from === s.to ? "" : ` (${s.from} to ${s.to})`}`;

/** The sentence Scout is given: past years, named, never a forecast */
export function typicalWords(t: Typical, place: string): string {
  const of = `of those ${t.days} days`;
  const heavy = !t.heavyDays ? "" : t.heavyDays === t.rainDays ? ", heavily" : `, heavily on ${t.heavyDays}`;
  const wet = t.snowDays && t.rainDays ? `It snowed on ${t.snowDays} ${of} and rained on ${t.rainDays}${heavy}.`
    : t.snowDays ? `It snowed on ${t.snowDays} ${of}.`
    : t.rainDays ? `It rained on ${t.rainDays} ${of}${heavy}.`
    : `None ${of} had rain.`;
  return `Past years, not a forecast: in the same week of ${yearsWords(t.years)}, ${place}'s highs were ${spanWords(t.hi)} and its lows ${spanWords(t.lo)}. ${wet}`;
}

const kept = new Map<string, { at: number; t: Typical }>();
const asking = new Map<string, Promise<Typical | null>>();
export const forgetTypical = () => { kept.clear(); asking.clear(); };

/** One past week's days, or null when the archive didn't answer. Days it left blank are skipped. */
async function pastWeek(point: { lat: number; lng: number }, start: string, end: string, zone: string): Promise<PastDay[] | null> {
  try {
    const r = await meteo(`https://archive-api.open-meteo.com/v1/archive?latitude=${point.lat}&longitude=${point.lng}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=${encodeURIComponent(zone)}`);
    if (!r.ok) return null;
    const d = (await r.json())?.daily;
    if (!Array.isArray(d?.time)) return null;
    const out: PastDay[] = [];
    d.time.forEach((_: string, i: number) => {
      const hi = d.temperature_2m_max?.[i], lo = d.temperature_2m_min?.[i];
      if (typeof hi !== "number" || typeof lo !== "number") return;
      out.push({ hi, lo, wet: typeof d.precipitation_sum?.[i] === "number" ? d.precipitation_sum[i] : 0, snow: typeof d.snowfall_sum?.[i] === "number" ? d.snowfall_sum[i] : 0 });
    });
    return out;
  } catch { return null; }
}

/** What the week of `date` was like at this point in the last five years, on the place's own clock. Null when fewer
 *  than three of the years answered (asked again next time). Kept a day: the past doesn't change. */
export async function typicalWeek(point: { lat: number; lng: number }, date: string, zone: string): Promise<Typical | null> {
  const weeks = sameWeeks(date);
  if (!weeks.length) return null;
  const key = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}|${date}|${zone}`;
  const k = kept.get(key);
  if (k && Date.now() - k.at < 24 * 3_600_000) return k.t;
  if (asking.has(key)) return asking.get(key)!;
  const go = (async () => {
    const got = await Promise.all(weeks.map((w) => pastWeek(point, w.start, w.end, zone)));
    const used = weeks.filter((_, i) => got[i]?.length);
    if (used.length < 3) return null;
    const sum = summarize(got.flatMap((g) => g ?? []));
    if (!sum) return null;
    const at = Date.parse(`${date}T00:00:00Z`);
    const t: Typical = { from: ymd(at - 3 * DAY), to: ymd(at + 3 * DAY), years: used.map((w) => w.year), ...sum };
    kept.set(key, { at: Date.now(), t });
    return t;
  })().finally(() => asking.delete(key));
  asking.set(key, go);
  return go;
}
