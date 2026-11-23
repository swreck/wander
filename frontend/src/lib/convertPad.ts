/**
 * Convert, the calculator on the bottom bar (Nov 22 2026; trip-data/december-plan/convert-spec.md). A traveler at a
 * market stall hears a price in dong and wants dollars in two seconds, one thumb, maybe no signal. Here: what its number
 * pad types and how the amount reads as it's typed, the banknotes, a split, which countries' money a trip offers and
 * which one it opens on, when the button shows at all, and the small note the phone keeps of each trip so the button is
 * in the bar's very first drawing. Pinned by backend/tests/convert-phone.test.ts. No text box: nothing here ever brings
 * up the iPhone's keyboard.
 */
import { currencyOfCountry, MONEY_SIGNS, type Currency, type Foreign } from "./rates";
import type { CityForPhrases } from "./phraseCountries";
import { finishedLastDay } from "./tripPhase";
import { zoneOfLastDay, type DayLike } from "./dayZone";

// ── The number pad ─────────────────────────────────────────────

export type PadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "000" | "00" | "." | "back";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
// (dong, riel and yen: up to 999 billion, more than any price; dollars: up to $9,999,999.99)
const WHOLE_MAX = 12;
const DOLLARS_MAX = 7;

/**
 * The amount as typed, after one more key: plain text, "" for nothing typed. Dong, riel and yen are whole numbers;
 * dollars take one point and two digits after it. A key that would break a rule changes nothing, so a quick extra tap
 * never turns into a wrong price.
 */
export function padPress(text: string, key: PadKey, currency: Currency): string {
  if (key === "back") return text.slice(0, -1);
  const dollars = currency === "USD";
  if (DIGITS.includes(key)) {
    // (a lone zero gives way to the next digit: "05" is never shown)
    if (text === "0") return key;
    if (dollars) {
      const [whole, cents] = text.split(".");
      if (cents !== undefined) return cents.length < 2 ? text + key : text;
      return whole.length < DOLLARS_MAX ? text + key : text;
    }
    return text.length < WHOLE_MAX ? text + key : text;
  }
  if (key === "000" || key === "00") {
    // (zeros after nothing, or after a zero, would only be zero)
    if (dollars || text === "" || text === "0") return text;
    return text.length + key.length <= WHOLE_MAX ? text + key : text;
  }
  if (key === ".") {
    if (!dollars || text.includes(".")) return text;
    return text === "" ? "0." : text + ".";
  }
  return text;
}

/** The typed text as a number: "" and "0." are 0, "12." is 12 */
export function padAmount(text: string): number {
  const n = Number(text || "0");
  return Number.isFinite(n) ? n : 0;
}

const NB = " "; // (so the sign never ends up alone on the next line, as money() does)
const grouped = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * The typed row as it reads while it's typed: grouped, the point and the zeros exactly as typed ("$12." while the cents
 * are still coming), the sign where money() puts it. Nothing typed reads "0 ₫" or "$0".
 */
export function padShown(text: string, currency: Currency): string {
  const [whole, cents] = (text || "0").split(".");
  const digits = grouped(whole || "0") + (cents !== undefined ? `.${cents}` : "");
  return currency === "VND" || currency === "KHR" ? `${digits}${NB}${MONEY_SIGNS[currency]}` : `${MONEY_SIGNS[currency]}${digits}`;
}

/** The pad's corner key, the one a price in that money needs most: three zeros for dong and riel, two for yen, the point for dollars */
export function shortcutKey(currency: Currency): PadKey {
  return currency === "USD" ? "." : currency === "JPY" ? "00" : "000";
}

// ── Banknotes and a split ──────────────────────────────────────

/** The notes a traveler is handed: Vietnam's six polymer notes, Cambodia's everyday riel notes (the 500 and 2,000 too:
 *  change under a dollar comes back in them), Japan's three */
export const NOTES: Record<Foreign, number[]> = {
  VND: [10_000, 20_000, 50_000, 100_000, 200_000, 500_000],
  KHR: [500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000],
  JPY: [1_000, 5_000, 10_000],
};

export const SPLIT_MAX = 20;

/** Each person's share of a bill: whole dong, riel and yen, cents for dollars. A split by nobody or nonsense is a split by one. */
export function eachShare(amount: number, people: number, currency: Currency): number {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return 0;
  const n = typeof people === "number" && Number.isFinite(people) ? Math.min(SPLIT_MAX, Math.max(1, Math.floor(people))) : 1;
  const share = amount / n;
  // (float noise, 0.1 + 0.2, never tips a half the wrong way)
  return currency === "USD" ? Math.round(Number((share * 100).toPrecision(12))) / 100 : Math.round(Number(share.toPrecision(12)));
}

/**
 * A split in both moneys: each share is the amount on its own row shared out, so the "Each" line always agrees with the
 * two amounts above it, whichever row was typed in. (Sharing one row and converting that share gave a second figure that
 * didn't: $100 between 3 read 857,114 ₫ each under 2,571,600 ₫.)
 */
export function eachOfBoth(local: number, usd: number, people: number, currency: Foreign): { local: number; usd: number } {
  return { local: eachShare(local, people, currency), usd: eachShare(usd, people, "USD") };
}

// ── Which money a trip offers ──────────────────────────────────

export type MoneyCountry = { country: string; currency: Foreign };

const ymd = (s?: string | null) => (typeof s === "string" ? s.slice(0, 10) : "");
// (the order the trip visits its cities: by arrival, then the trip's own order; a city with no date last — as the phrase card)
const inOrder = (cities: CityForPhrases[]) =>
  [...cities].sort((a, b) => (ymd(a.arrivalDate) || "9999").localeCompare(ymd(b.arrivalDate) || "9999") || (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
// (only a city whose country Wander keeps a rate for; its name is never used to guess)
const withMoney = (cities: CityForPhrases[]) => inOrder(cities).filter((c) => currencyOfCountry(c.country));

/** Each country's money once, in the order the trip visits them, with the country's name as the trip writes it */
export function moneyCountries(cities: CityForPhrases[]): MoneyCountry[] {
  const out: MoneyCountry[] = [];
  for (const c of withMoney(cities)) {
    const currency = currencyOfCountry(c.country)!;
    if (!out.some((m) => m.currency === currency)) out.push({ country: String(c.country).trim(), currency });
  }
  return out;
}

/**
 * The money the calculator opens on: today's country while the trip is under way (the latest city whose first day has
 * come), the first country before the trip and after it — the phrase card's rule (openingCountry). `today` is the phone's
 * date; `tripEnd` ends a trip whose last city has no departure. Null when the trip has no money Wander keeps.
 */
export function openingMoney(cities: CityForPhrases[], today: string, tripEnd?: string | null): Foreign | null {
  const offered = moneyCountries(cities);
  if (offered.length < 2) return offered[0]?.currency ?? null;
  const ordered = withMoney(cities);
  const first = ymd(ordered[0].arrivalDate);
  const end = ymd(ordered[ordered.length - 1].departureDate) || ymd(tripEnd);
  if (!first || today < first || (end && today > end)) return offered[0].currency;
  let here = ordered[0];
  for (const c of ordered) if (ymd(c.arrivalDate) && ymd(c.arrivalDate) <= today) here = c;
  return currencyOfCountry(here.country) ?? offered[0].currency;
}

/** The button shows before the trip and on every day of it, while the trip has some money to offer; never once it's over */
export function showsConvert(cities: CityForPhrases[], dates: (string | null | undefined)[], zone: string, now: Date = new Date()): boolean {
  return moneyCountries(cities).length > 0 && finishedLastDay(dates, zone, now) === null;
}

// ── What the phone remembers of a trip ─────────────────────────

export type ConvertTrip = { cities: CityForPhrases[]; dates: string[]; zone: string };

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

// (only the five things Convert reads of a city: no ids, no coordinates, nothing else of the trip)
const cityFrom = (c: Record<string, unknown>): CityForPhrases => ({
  name: typeof c.name === "string" ? c.name : "",
  country: c.country as string | null | undefined,
  arrivalDate: c.arrivalDate as string | null | undefined,
  departureDate: c.departureDate as string | null | undefined,
  sequenceOrder: c.sequenceOrder as number | undefined,
});

/** From the server's trip (GET /trips/:id): each city's name, country, dates and order; the days; the last day's clock. Null when it isn't a trip. */
export function convertTripFrom(answer: unknown): ConvertTrip | null {
  if (!isObject(answer) || !Array.isArray(answer.cities)) return null;
  const cities = answer.cities.filter(isObject).map(cityFrom);
  const days: DayLike[] = (Array.isArray(answer.days) ? answer.days : [])
    .filter((d): d is Record<string, unknown> => isObject(d) && typeof d.date === "string")
    .map((d) => ({ date: d.date as string, city: isObject(d.city) ? (d.city as DayLike["city"]) : null }));
  const endDate = typeof answer.endDate === "string" ? answer.endDate : null;
  const dates = [...new Set([...days.map((d) => d.date), endDate].filter((d): d is string => !!d).map((d) => d.slice(0, 10)))].sort();
  const tripZone = typeof answer.timeZone === "string" && answer.timeZone ? answer.timeZone : "Asia/Tokyo";
  return { cities, dates, zone: zoneOfLastDay(days, endDate, tripZone) };
}

const KEY = "wander:convert";
// (the shape of the note: one in any other shape reads as nothing remembered. Raise it whenever what's kept changes)
const SHAPE = 1;

/** A remembered trip as Convert can use it, or null */
function tripFrom(x: unknown): ConvertTrip | null {
  if (!isObject(x) || !Array.isArray(x.cities) || !Array.isArray(x.dates) || typeof x.zone !== "string") return null;
  if (!x.cities.every((c) => isObject(c) && typeof c.name === "string") || !x.dates.every((d) => typeof d === "string")) return null;
  return { cities: (x.cities as Record<string, unknown>[]).map(cityFrom), dates: [...(x.dates as string[])], zone: x.zone };
}

/** Every trip this phone remembers, or nothing when the note is missing, damaged or in another shape */
function readNote(): Record<string, unknown> {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) || "null");
    return isObject(kept) && kept.v === SHAPE && isObject(kept.trips) ? kept.trips : {};
  } catch {
    return {}; // damaged, or storage that throws (private mode)
  }
}

/** What this phone last read of a trip, so the button draws at once; null when nothing is remembered */
export function rememberedConvertTrip(tripId: string | null | undefined): ConvertTrip | null {
  if (!tripId) return null;
  const trips = readNote();
  return Object.hasOwn(trips, tripId) ? tripFrom(trips[tripId]) : null;
}

/** Remember a trip for next time, beside the others this phone has opened */
export function rememberConvertTrip(tripId: string, trip: ConvertTrip): void {
  const kept = tripFrom(trip);
  if (!tripId || !kept) return;
  try {
    const trips = Object.fromEntries([...Object.entries(readNote()), [tripId, kept]]);
    localStorage.setItem(KEY, JSON.stringify({ v: SHAPE, trips }));
  } catch { /* storage full or private: read from the server again next time */ }
}
