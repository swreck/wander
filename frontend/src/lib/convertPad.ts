/**
 * Convert, the calculator on the bottom bar (Nov 22 2026; trip-data/december-plan/convert-spec.md). A traveler at a
 * market stall hears a price in dong and wants dollars in two seconds, one thumb, maybe no signal. Here: what its number
 * pad types and how the amount reads as it's typed, the two rows' rules (shared with Budget's entry sheet, Nov 24), the banknotes, a split, which countries' money a trip offers and
 * which one it opens on, when the button shows at all, and the small note the phone keeps of each trip so the button is
 * in the bar's very first drawing. Pinned by backend/tests/convert-phone.test.ts. No text box: nothing here ever brings
 * up the iPhone's keyboard.
 */
import { convert, currencyOfCountry, money, MONEY_SIGNS, type Currency, type Foreign, type Rates } from "./rates";
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

// ── The two rows (Convert and Budget's entry sheet share them: components/MoneyPad.tsx) ──

/** Each money as a person says it: "Type in dollars" (the swap button), "tap to type dong" (a row, to a screen reader) */
export const MONEY_WORDS: Record<Currency, string> = { VND: "dong", KHR: "riel", JPY: "yen", USD: "dollars" };

/** The first row holds a money that isn't dollars; the second, US dollars */
export type PadRow = "local" | "usd";
/**
 * typing: the row the pad types in. from: the row the amount was typed in (the other shows it converted; on Budget, the
 * money paid). fresh: the next key starts a new amount, after a tap on the other row, a banknote, or opening again.
 */
export type Pad = { typing: PadRow; from: PadRow; text: string; fresh: boolean };

/** Nothing typed, the pad typing in `row` */
export const padStart = (row: PadRow = "local"): Pad => ({ typing: row, from: row, text: "", fresh: false });

const rowMoney = (row: PadRow, local: Foreign): Currency => (row === "local" ? local : "USD");

/** One key on the pad. The first key after a fresh start replaces the amount, never adds to it, and its row becomes the one typed in. */
export function padKey(p: Pad, key: PadKey, local: Foreign): Pad {
  const cur = rowMoney(p.typing, local);
  // (⌫ on an amount standing in its own row takes back one digit, even when a digit would start afresh: a kept entry,
  // a banknote, the keys opened again. On the other row the amount is only the converted one, so ⌫ there clears.)
  if (p.fresh && key === "back" && p.typing === p.from) return { ...p, text: padPress(p.text, key, cur), fresh: false };
  return p.fresh ? { typing: p.typing, from: p.typing, text: padPress("", key, cur), fresh: false } : { ...p, text: padPress(p.text, key, cur) };
}

/**
 * A tap on a row (or the swap button): the pad types there next; both amounts stay until the first key. With nothing
 * typed there is no amount to keep, so the row tapped is the one typed in from then on (on Budget, the money paid moves
 * with the caret: never the caret on one row and "Paid in" on the other over a zero).
 */
export function padTap(p: Pad, row: PadRow): Pad {
  if (p.typing === row) return p;
  return p.text === "" ? padStart(row) : { ...p, typing: row, fresh: true };
}

/** The keys folded away (Budget): the pressed row goes back to the money paid. An amount already there is then like a
 *  kept entry's: opened again ("tap to change"), the first key starts a new amount and never adds to the old one (typed
 *  90,000, went to "What for", came back and typed 120,000: it read 90,000,120,000). ⌫ still takes back one digit. */
export function padFold(p: Pad): Pad {
  return p.text === "" ? p : { ...p, typing: p.from, fresh: true };
}

/** The ✕: nothing typed, in the row being typed in */
export function padClear(p: Pad): Pad {
  return { typing: p.typing, from: p.typing, text: "", fresh: false };
}

/** Another money in the first row: dollars typed are kept and shown in the new money; an amount in the old money means nothing there */
export function padNewMoney(p: Pad): Pad {
  return p.from === "usd" ? p : padStart("local");
}

/** What was typed, in its own money: on Budget, the amount paid. A tap on the other row alone never changes it. */
export function padPaid(p: Pad, local: Foreign): { amount: number; currency: Currency } {
  return { amount: padAmount(p.text), currency: rowMoney(p.from, local) };
}

/** Each row's amount and how it reads: the typed row as typed, the other converted (a rate it can't stand behind shows as zero) */
export function padFigures(p: Pad, local: Foreign, rates: Rates): { amount: (row: PadRow) => number; shown: (row: PadRow) => string } {
  const fromCur = rowMoney(p.from, local);
  const typed = padAmount(p.text);
  const converted = convert(typed, fromCur, rowMoney(p.from === "local" ? "usd" : "local", local), rates) ?? 0;
  return {
    amount: (row) => (row === p.from ? typed : converted),
    shown: (row) => (row === p.from ? padShown(p.text, fromCur) : money(converted, rowMoney(row, local))),
  };
}

/** An amount already kept, as the pad's text: whole dong, riel and yen; dollars with their cents ("48.60"), none when whole */
export function padText(amount: number, currency: Currency): string {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return "";
  if (currency !== "USD") return String(Math.round(amount));
  const c = Math.round(Number((amount * 100).toPrecision(12)));
  return c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2);
}

// ── Banknotes and a split ──────────────────────────────────────

/** The notes a traveler is handed: Vietnam's six polymer notes, Cambodia's everyday riel notes (the 500 and 2,000 too:
 *  change under a dollar comes back in them), Japan's three */
export const NOTES: Record<Foreign, number[]> = {
  VND: [10_000, 20_000, 50_000, 100_000, 200_000, 500_000],
  KHR: [500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000],
  JPY: [1_000, 5_000, 10_000],
};

/** A note's own colour on its button, so the note in a hand finds its button (Ken, Nov 24 2026: "color where
 *  appropriate to match the currency of the country"). The button is a soft fill with a stripe at its left in the
 *  note's ink (edge). One note that carries two colours (500,000 dong, 5,000 riel) has a fill that runs from the first
 *  to the second. A value in use in two issues of different colours (edge2) is drawn as the two notes side by side:
 *  the older issue's colour on the left half with its stripe at the left, the newer one's on the right half with its
 *  stripe at the right, no blend between them (blended, a fresh review read both such buttons as beige).
 *  Dong: the State Bank of Vietnam's own description of each note, quoted beside it (its banknote pages, read Nov 24
 *  2026). The 20,000 and the 500,000 are both blue there too, which is why Convert's tip says to count the zeros.
 *  Yen: the Bank of Japan's own pictures of the notes in circulation, opened Nov 25 2026.
 *  Riel: the National Bank of Cambodia's own pictures of its notes, opened Nov 25 2026. Where two issues of one value
 *  circulate, both colours are on the button. A colour goes in only with its source read. */
export type NoteTint = { fill: string; edge: string; edge2?: string };
export const NOTE_TINT: Partial<Record<Foreign, Record<number, NoteTint>>> = {
  VND: {
    // (deepened Nov 24 2026 after a fresh review named the first, paler 50,000 "pink" and the 200,000 "peach": the
    // fill as deep as the two lines of text allow, the edge the note's colour at full strength)
    10_000: { fill: "#e9e39a", edge: "#8f7f3a" }, // "dark brown on a greenish yellow background"
    20_000: { fill: "#b4c8ec", edge: "#2f4f95" }, // "dark blue"
    50_000: { fill: "#ea8c90", edge: "#b23a4c" }, // "red and purplish brown" (a third review still read #eeb0b6 as pink)
    100_000: { fill: "#b3d9ae", edge: "#2e6b3a" }, // "dark green"
    200_000: { fill: "#e3ab92", edge: "#8f3d26" }, // "brownish red"
    500_000: { fill: "linear-gradient(90deg, #bcd3f2, #d2c4f0)", edge: "#5560b5" }, // "blue and bluish purple"
  },
  JPY: {
    1_000: { fill: "#c3d3e6", edge: "#3f5878" }, // blue
    5_000: { fill: "#dcc4d6", edge: "#7a5672" }, // purple
    10_000: { fill: "#dccfae", edge: "#6a5a36" }, // brown
  },
  KHR: {
    500: { fill: "#f4b6bb", edge: "#b0485a" }, // pink-red
    1_000: { fill: "#b3c4ea", edge: "#3f5aa0" }, // blue
    2_000: { fill: "linear-gradient(90deg, #b5dcab 50%, #e0cf8a 50%)", edge: "#3f7d47", edge2: "#86702a" }, // the 2013 green note and the 2022 grey-and-gold one
    5_000: { fill: "linear-gradient(90deg, #d6c3de, #b5cfc4)", edge: "#7b5c93" }, // one note: lilac, with a green portrait
    10_000: { fill: "#a9d6cf", edge: "#2f7d74" }, // teal
    20_000: { fill: "#d9b3d0", edge: "#7d4470" }, // plum
    50_000: { fill: "linear-gradient(90deg, #c9cdb0 50%, #eaa66c 50%)", edge: "#5f6a52", edge2: "#9a4f1e" }, // the 2014 olive note and the orange-brown one issued Sep 2026
  },
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
