/**
 * Recent rates per US dollar for yen, dong and riel, from Wander's server (GET /api/rates, which asks open.er-api.com),
 * for the currency pop-up and the calculator. Kept on the phone so both still work with no signal; asked for again when
 * the copy is 12 hours old. Converting and the words a person reads are here too. Amounts are rounded the way the
 * server rounds (backend/src/services/rates.ts); the rate itself is first rounded to what the rate line prints
 * (`printedRate`), so a sum checked by hand from that line gives the figure on the screen.
 */
import { api } from "./api";

export type Foreign = "JPY" | "VND" | "KHR";
export type Currency = Foreign | "USD";
export type Rate = { rate: number; asOf: string | null; approx: boolean };
export type Rates = Record<Foreign, Rate>;

const FOREIGN: Foreign[] = ["JPY", "VND", "KHR"];
const CURRENCIES: Currency[] = ["USD", ...FOREIGN];

/** Round figures for when no rate has ever been had: said to be approximate, never kept as if they were a rate */
export const ROUND_RATES: Rates = {
  JPY: { rate: 150, asOf: null, approx: true },
  VND: { rate: 25000, asOf: null, approx: true },
  KHR: { rate: 4100, asOf: null, approx: true },
};

const KEY = "wander:rates";
// (as long as the server keeps its own answer, services/rates.ts KEEP_MS: asking sooner would only get the same one)
const FRESH = 12 * 3600_000;
// (the shape of a kept copy: one in any other shape reads as nothing kept. Raise it whenever what's kept changes)
const SHAPE = 1;

// (each screen gets its own copy, so one changing what it got never changes the round figures or another's rates)
const copyOf = (r: Rates): Rates => ({ JPY: { ...r.JPY }, VND: { ...r.VND }, KHR: { ...r.KHR } });

/** One currency's rate as Wander can stand behind it, or null. A rate that doesn't say it's real is taken as approximate. */
function rateFrom(x: unknown): Rate | null {
  if (!x || typeof x !== "object") return null;
  const { rate, asOf, approx } = x as Record<string, unknown>;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
  return { rate, asOf: typeof asOf === "string" ? asOf : null, approx: approx !== false };
}

/** All three currencies, or null when any is missing or bad */
function ratesFrom(x: unknown): Rates | null {
  if (!x || typeof x !== "object") return null;
  const out = {} as Rates;
  for (const c of FOREIGN) {
    const r = Object.hasOwn(x, c) ? rateFrom((x as Record<string, unknown>)[c]) : null;
    if (!r) return null;
    out[c] = r;
  }
  return out;
}

function readKept(): { at: number; rates: Rates } | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!kept || typeof kept !== "object" || kept.v !== SHAPE || typeof kept.at !== "number") return null;
    const rates = ratesFrom(kept.rates);
    return rates ? { at: kept.at, rates } : null;
  } catch {
    return null; // damaged, or storage that throws (private mode)
  }
}

/** The phone's copy at any age, or null when there's none */
export function savedRates(): Rates | null {
  return readKept()?.rates ?? null;
}

/**
 * Recent rates, never throwing: the phone's copy when it's under 12 hours old, else the server's answer. A real rate on
 * the phone is never replaced by the server's round figure (its own source was down). With no answer: the phone's copy
 * however old, else the round figures.
 */
export async function loadRates(opts: { get?: (path: string) => Promise<unknown>; now?: () => number } = {}): Promise<Rates> {
  const get = opts.get ?? ((path: string) => api.get<unknown>(path));
  const now = opts.now ?? Date.now;
  const kept = readKept();
  const age = kept ? now() - kept.at : Infinity;
  // (a copy from the future, after the phone's clock was wrong, isn't fresh)
  if (kept && age >= 0 && age < FRESH) return copyOf(kept.rates);
  try {
    const answer = await get("/rates");
    const given = answer && typeof answer === "object" ? ratesFrom((answer as Record<string, unknown>).rates) : null;
    if (given) {
      const merged = {} as Rates;
      for (const c of FOREIGN) merged[c] = given[c].approx && kept && !kept.rates[c].approx ? kept.rates[c] : given[c];
      // (only a copy of real rates is kept: round figures are asked about again next time)
      if (FOREIGN.every((c) => !merged[c].approx)) {
        try { localStorage.setItem(KEY, JSON.stringify({ v: SHAPE, at: now(), rates: merged })); }
        catch { /* storage full or private: asked again next time */ }
      }
      return copyOf(merged);
    }
  } catch { /* no signal: the phone's copy below */ }
  return copyOf(kept?.rates ?? ROUND_RATES);
}

/** The money of a trip day's country, for the countries Wander keeps a rate for; null for any other, never a guess */
export function currencyOfCountry(country?: string | null): Foreign | null {
  if (typeof country !== "string") return null;
  switch (country.trim().toLowerCase()) {
    case "vietnam": case "viet nam": return "VND";
    case "cambodia": return "KHR";
    case "japan": return "JPY";
    default: return null;
  }
}

/** To the nearest cent; halves go away from zero, float noise (12.345 * 100) doesn't tip them down, never -0 */
function cents(n: number): number {
  const r = Math.round(Number((Math.abs(n) * 100).toPrecision(12))) / 100;
  return (n < 0 ? -r : r) + 0;
}

/** To a whole unit, the same way */
function whole(n: number): number {
  const r = Math.round(Number(Math.abs(n).toPrecision(12)));
  return (n < 0 ? -r : r) + 0;
}

/**
 * The rate the phone works from is the rate it prints: yen to the hundredth, dong and riel to the whole unit. So a
 * person checking a figure by hand from the rate line gets the figure on the screen (Nov 22 2026: the line said
 * "¥159" while the sums used 158.70, and $150 showed ¥23,805 where ¥159 gives ¥23,850).
 */
export function printedRate(currency: Foreign, rate: number): number {
  return currency === "JPY" ? Math.round(Number((rate * 100).toPrecision(12))) / 100 : Math.round(rate);
}

// (a name that isn't one of the four, "toString" among them, has no rate. A rate too small to print has none either)
function rateOf(c: Currency, rates: Rates): number | null {
  if (!CURRENCIES.includes(c)) return null;
  if (c === "USD") return 1;
  const r = rates?.[c]?.rate;
  if (typeof r !== "number" || !Number.isFinite(r) || r <= 0) return null;
  const printed = printedRate(c, r);
  return printed > 0 ? printed : null;
}

/** An amount in one money as another, through dollars: cents for dollars, whole dong, riel and yen. Null for an amount
 *  or a currency it can't stand behind. Rounded once, at the end, so going through dollars loses nothing. */
export function convert(amount: number, from: Currency, to: Currency, rates: Rates): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  const a = rateOf(from, rates), b = rateOf(to, rates);
  if (a === null || b === null) return null;
  const out = to === "USD" ? cents((amount / a) * b) : whole((amount / a) * b);
  return Number.isFinite(out) ? out : null;
}

export const MONEY_NAMES: Record<Currency, string> = { USD: "US dollars", VND: "Vietnamese dong", KHR: "Cambodian riel", JPY: "Japanese yen" };
export const MONEY_SIGNS: Record<Currency, string> = { USD: "$", VND: "₫", KHR: "៛", JPY: "¥" };

const NB = " "; // (so the sign never ends up alone on the next line)
const dollarsFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wholeFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** An amount as a person reads it: "$48.60", "¥7,300", "1,250,000 ₫" (dong and riel carry their sign after the number) */
export function money(amount: number, currency: Currency): string {
  const n = currency === "USD" ? cents(amount) : whole(amount);
  const sign = n < 0 ? "-" : "";
  const digits = (currency === "USD" ? dollarsFmt : wholeFmt).format(Math.abs(n));
  return currency === "VND" || currency === "KHR"
    ? `${sign}${digits}${NB}${MONEY_SIGNS[currency]}`
    : `${sign}${MONEY_SIGNS[currency]}${digits}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 22" from "2026-11-22", or null when the day can't be read (never a made-up day) */
function dayWords(asOf: string | null): string | null {
  const m = asOf ? /^\d{4}-(\d{2})-(\d{2})$/.exec(asOf) : null;
  if (!m) return null;
  const month = Number(m[1]), day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${MONTHS[month - 1]} ${day}` : null;
}

/** A currency's rate in words: its day when real, "a recent rate" when the day isn't known, and plainly rough when it's a round figure */
export function rateWords(currency: Foreign, rates: Rates): string {
  const r = rates[currency];
  const printed = printedRate(currency, r.rate);
  // (yen with its hundredths when it has any: "¥158.70", and a round "¥150")
  const perDollar = `${currency === "JPY" && !Number.isInteger(printed) ? `¥${dollarsFmt.format(printed)}` : money(printed, currency)} to the dollar`;
  if (r.approx) return `About ${perDollar}. A rough figure: Wander couldn't get a recent rate.`;
  const day = dayWords(r.asOf);
  return day ? `${perDollar}, the rate on ${day}` : `${perDollar}, a recent rate`;
}
