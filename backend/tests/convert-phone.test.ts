/**
 * Convert, the calculator on the bottom bar (frontend/src/lib/convertPad.ts, Nov 22 2026): what its number pad types,
 * what the row shows as it's typed, the banknotes, a split, which countries' money a trip offers and in what order,
 * which one it opens on, when the button shows at all, and what the phone remembers so the bar never waits for the
 * network. Written before the file existed. Read straight from the phone's own file, as rates-phone.test.ts does.
 * The cities are places, the people nobody.
 */
import { describe, it, expect, beforeEach } from "vitest";

const store = new Map<string, string>();
let storageBroken = false;
(globalThis as any).localStorage = {
  getItem: (k: string) => { if (storageBroken) throw new Error("private mode"); return store.get(k) ?? null; },
  setItem: (k: string, v: string) => { if (storageBroken) throw new Error("private mode"); store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; },
};

const C = await import("../../frontend/src/lib/convertPad.ts");

const NB = " ";
const TRIP = [
  { name: "Hanoi", country: "Vietnam", arrivalDate: "2026-12-15T00:00:00.000Z", departureDate: "2026-12-26T00:00:00.000Z", sequenceOrder: 0 },
  { name: "Hue", country: "Vietnam", arrivalDate: "2026-12-26", departureDate: "2026-12-28", sequenceOrder: 1 },
  { name: "Hoi An", country: "Vietnam", arrivalDate: "2026-12-28", departureDate: "2026-12-30", sequenceOrder: 2 },
  { name: "Siem Reap", country: "Cambodia", arrivalDate: "2026-12-30", departureDate: "2027-01-01", sequenceOrder: 3 },
  { name: "Shiga Kogen", country: "Japan", arrivalDate: "2027-01-02", departureDate: "2027-01-07", sequenceOrder: 4 },
  { name: "Tokyo", country: "Japan", arrivalDate: "2027-01-07", departureDate: "2027-01-08", sequenceOrder: 5 },
];
const DATES = ["2026-12-14", "2026-12-30", "2027-01-08"];
const type = (keys: string[], currency: any, from = "") => keys.reduce((t, k) => C.padPress(t, k as any, currency), from);

beforeEach(() => { store.clear(); storageBroken = false; });

describe("the number pad", () => {
  it("digits build the amount; a leading zero never stays in front", () => {
    expect(type(["1", "2", "5"], "VND")).toBe("125");
    expect(type(["0"], "VND")).toBe("0");
    expect(type(["0", "0"], "VND")).toBe("0");
    expect(type(["0", "5"], "VND")).toBe("5");
  });

  it("000 and 00 add zeros to an amount, and do nothing to an empty one or a zero", () => {
    expect(type(["1", "2", "5", "000"], "VND")).toBe("125000");
    expect(type(["2", "000", "000"], "KHR")).toBe("2000000");
    expect(type(["2", "5", "00"], "JPY")).toBe("2500");
    expect(type(["000"], "VND")).toBe("");
    expect(type(["0", "000"], "VND")).toBe("0");
    expect(type(["00"], "JPY")).toBe("");
  });

  it("dong, riel and yen take at most 12 digits; a key that would pass that changes nothing", () => {
    const twelve = "123456789012";
    expect(C.padPress(twelve, "3", "VND")).toBe(twelve);
    expect(C.padPress("12345678901", "3", "VND")).toBe(twelve.slice(0, 11) + "3");
    expect(C.padPress("1234567890", "000", "VND")).toBe("1234567890");
    expect(C.padPress("123456789", "000", "KHR")).toBe("123456789000");
    expect(C.padPress("12345678901", "00", "JPY")).toBe("12345678901");
  });

  it("dong, riel and yen have no decimal point", () => {
    expect(C.padPress("125", ".", "VND")).toBe("125");
    expect(C.padPress("", ".", "KHR")).toBe("");
    expect(C.padPress("7", ".", "JPY")).toBe("7");
  });

  it("dollars take one point and two digits after it", () => {
    expect(type(["1", "2", ".", "5"], "USD")).toBe("12.5");
    expect(type(["1", "2", ".", "5", "0"], "USD")).toBe("12.50");
    expect(type(["1", "2", ".", "5", "0", "9"], "USD")).toBe("12.50");
    expect(type(["1", "2", ".", "."], "USD")).toBe("12.");
    expect(type(["."], "USD")).toBe("0.");
    expect(type([".", "0", "5"], "USD")).toBe("0.05");
    expect(type(["0", ".", "5"], "USD")).toBe("0.5");
  });

  it("dollars take at most 7 digits before the point, and the zero shortcuts aren't theirs", () => {
    expect(C.padPress("1234567", "8", "USD")).toBe("1234567");
    expect(C.padPress("1234567", ".", "USD")).toBe("1234567.");
    expect(C.padPress("1234567.", "8", "USD")).toBe("1234567.8");
    expect(C.padPress("12", "000", "USD")).toBe("12");
    expect(C.padPress("12", "00", "USD")).toBe("12");
  });

  it("back removes the last key, down to nothing", () => {
    expect(C.padPress("125", "back", "VND")).toBe("12");
    expect(C.padPress("1", "back", "VND")).toBe("");
    expect(C.padPress("", "back", "VND")).toBe("");
    expect(C.padPress("12.5", "back", "USD")).toBe("12.");
    expect(C.padPress("12.", "back", "USD")).toBe("12");
    expect(C.padPress("0.", "back", "USD")).toBe("0");
  });

  it("a key it doesn't know changes nothing", () => {
    for (const k of ["x", "-", "10", "", "e", " "]) expect(C.padPress("125", k as any, "VND")).toBe("125");
  });

  it("each money has its own shortcut key: 000 for dong and riel, 00 for yen, the point for dollars", () => {
    expect(C.shortcutKey("VND")).toBe("000");
    expect(C.shortcutKey("KHR")).toBe("000");
    expect(C.shortcutKey("JPY")).toBe("00");
    expect(C.shortcutKey("USD")).toBe(".");
  });

  it("the typed text as a number", () => {
    expect(C.padAmount("")).toBe(0);
    expect(C.padAmount("125000")).toBe(125000);
    expect(C.padAmount("12.")).toBe(12);
    expect(C.padAmount("0.5")).toBe(0.5);
    expect(C.padAmount("12.34")).toBe(12.34);
    expect(C.padAmount("0.")).toBe(0);
  });

  it("the row shows what was typed, grouped, with the point and zeros exactly as typed", () => {
    expect(C.padShown("", "VND")).toBe(`0${NB}₫`);
    expect(C.padShown("1250000", "VND")).toBe(`1,250,000${NB}₫`);
    expect(C.padShown("20000", "KHR")).toBe(`20,000${NB}៛`);
    expect(C.padShown("7300", "JPY")).toBe("¥7,300");
    expect(C.padShown("", "USD")).toBe("$0");
    expect(C.padShown("12", "USD")).toBe("$12");
    expect(C.padShown("12.", "USD")).toBe("$12.");
    expect(C.padShown("12.5", "USD")).toBe("$12.5");
    expect(C.padShown("1250.50", "USD")).toBe("$1,250.50");
    expect(C.padShown("0.05", "USD")).toBe("$0.05");
  });
});

// (batch 114, Nov 24 2026, written before the functions: Convert and Budget's entry sheet draw the same two rows and pad,
// components/MoneyPad.tsx; these are its rules, and on Budget the money paid is the row the amount was typed in)
describe("the two rows, shared by Convert and Budget's entry sheet", () => {
  const RATES = { JPY: { rate: 159.78, asOf: "2026-11-22", approx: false }, VND: { rate: 25715.74, asOf: "2026-11-22", approx: false }, KHR: { rate: 4064.11, asOf: "2026-11-22", approx: false } };
  const keys = (p: any, list: string[], local: any = "VND") => list.reduce((q, k) => C.padKey(q, k as any, local), p);

  it("a new pad types in the row it's given, with nothing typed", () => {
    expect(C.padStart()).toEqual({ typing: "local", from: "local", text: "", fresh: false });
    expect(C.padStart("usd")).toEqual({ typing: "usd", from: "usd", text: "", fresh: false });
  });

  it("keys type in the row being typed in, with that money's rules", () => {
    expect(keys(C.padStart(), ["5", "0", "0", "000"]).text).toBe("500000");
    expect(keys(C.padStart("usd"), ["1", "2", ".", "5"]).text).toBe("12.5");
    // (dong has no point; dollars have no 000)
    expect(keys(C.padStart(), ["1", "."]).text).toBe("1");
    expect(keys(C.padStart("usd"), ["1", "000"]).text).toBe("1");
  });

  it("500,000 typed in dong, then a tap on the dollars row: the money paid is still 500,000 dong", () => {
    const typed = keys(C.padStart(), ["5", "0", "0", "000"]);
    const tapped = C.padTap(typed, "usd");
    expect(tapped).toEqual({ typing: "usd", from: "local", text: "500000", fresh: true });
    expect(C.padPaid(tapped, "VND")).toEqual({ amount: 500000, currency: "VND" });
    // (and the rows: dong as typed, dollars converted at the printed rate, 500,000 ÷ 25,716)
    const fig = C.padFigures(tapped, "VND", RATES);
    expect(fig.shown("local")).toBe(`500,000${NB}₫`);
    expect(fig.shown("usd")).toBe("$19.44");
    expect(fig.amount("usd")).toBe(19.44);
  });

  it("a tap on the row already typed in changes nothing", () => {
    const typed = keys(C.padStart(), ["7"]);
    expect(C.padTap(typed, "local")).toBe(typed);
  });

  it("with nothing typed, a tap on the other row makes it the one typed in and the one paid", () => {
    expect(C.padTap(C.padStart(), "usd")).toEqual({ typing: "usd", from: "usd", text: "", fresh: false });
    expect(C.padTap(C.padStart("usd"), "local")).toEqual({ typing: "local", from: "local", text: "", fresh: false });
    expect(C.padPaid(C.padTap(C.padStart(), "usd"), "VND").currency).toBe("USD");
    // (the keys then type there exactly as they did before: the point first reads "0.")
    expect(C.padKey(C.padTap(C.padStart(), "usd"), ".", "VND").text).toBe("0.");
    // (a tap back on an emptied row, after the ✕, the same)
    const cleared = C.padClear(C.padTap(keys(C.padStart(), ["9", "000"]), "usd"));
    expect(C.padTap(cleared, "local")).toEqual({ typing: "local", from: "local", text: "", fresh: false });
  });

  it("folding the keys puts the pressed row back on the money paid; the next key still starts afresh", () => {
    const dong = keys(C.padStart(), ["5", "0", "0", "000"]);
    const folded = C.padFold(C.padTap(dong, "usd"));
    expect(folded).toEqual({ typing: "local", from: "local", text: "500000", fresh: true });
    expect(C.padPaid(folded, "VND")).toEqual({ amount: 500000, currency: "VND" });
    expect(C.padKey(folded, "7", "VND").text).toBe("7");
    // (nothing typed: unchanged, the same object)
    const empty = C.padStart("usd");
    expect(C.padFold(empty)).toBe(empty);
  });

  it("90,000 typed, the keys folded, opened again, 120,000 typed: it reads 120,000, never 90,000,120,000", () => {
    const first = keys(C.padStart(), ["9", "0", "000"]);
    const folded = C.padFold(first);
    expect(folded).toEqual({ typing: "local", from: "local", text: "90000", fresh: true });
    // ("tap to change" is a tap on the row already pressed: nothing changes until a key)
    const again = C.padTap(folded, "local");
    expect(again).toBe(folded);
    expect(keys(again, ["1", "2", "0", "000"])).toEqual({ typing: "local", from: "local", text: "120000", fresh: false });
    // (folded twice is the same as once, and the money paid never moved)
    expect(C.padFold(folded)).toEqual(folded);
    expect(C.padPaid(folded, "VND")).toEqual({ amount: 90000, currency: "VND" });
    // (dollars the same)
    const usd = C.padFold(keys(C.padStart("usd"), ["4", "8", ".", "6"]));
    expect(keys(usd, ["5", "0"])).toEqual({ typing: "usd", from: "usd", text: "50", fresh: false });
  });

  it("⌫ on an amount standing in its own row takes back one digit, even when a digit would start afresh", () => {
    // (the keys opened again)
    const folded = C.padFold(keys(C.padStart(), ["9", "0", "000"]));
    const back = C.padKey(folded, "back", "VND");
    expect(back).toEqual({ typing: "local", from: "local", text: "9000", fresh: false });
    // (and the next digit then adds, as on any amount being typed)
    expect(C.padKey(back, "5", "VND").text).toBe("90005");
    // (a kept entry's amount: 48.60 → 48.6)
    expect(C.padKey({ typing: "usd", from: "usd", text: "48.60", fresh: true }, "back", "VND")).toEqual({ typing: "usd", from: "usd", text: "48.6", fresh: false });
    // (on the other row the amount is only the converted one: ⌫ there still clears)
    const tapped = C.padTap(keys(C.padStart(), ["9", "000"]), "usd");
    expect(C.padKey(tapped, "back", "VND").text).toBe("");
  });

  it("the first key after a row tap replaces the amount, in the new row, and the money paid follows it", () => {
    const tapped = C.padTap(keys(C.padStart(), ["5", "0", "0", "000"]), "usd");
    const next = C.padKey(tapped, "2", "VND");
    expect(next).toEqual({ typing: "usd", from: "usd", text: "2", fresh: false });
    expect(C.padPaid(next, "VND")).toEqual({ amount: 2, currency: "USD" });
    expect(C.padKey(next, "0", "VND").text).toBe("20");
    // (⌫ as the first key after a tap empties it, never deletes from the old amount)
    expect(C.padKey(tapped, "back", "VND")).toEqual({ typing: "usd", from: "usd", text: "", fresh: false });
  });

  it("the ✕ empties the row being typed in, and it becomes the one paid", () => {
    const tapped = C.padTap(keys(C.padStart(), ["9", "000"]), "usd");
    expect(C.padClear(tapped)).toEqual({ typing: "usd", from: "usd", text: "", fresh: false });
  });

  it("another money in the first row: dollars typed stay; an amount typed in the old money is cleared", () => {
    const dollars = keys(C.padStart("usd"), ["2", "0"]);
    expect(C.padNewMoney(dollars)).toBe(dollars);
    expect(C.padPaid(C.padNewMoney(dollars), "JPY")).toEqual({ amount: 20, currency: "USD" });
    expect(C.padFigures(dollars, "JPY", RATES).shown("local")).toBe("¥3,196");
    const dong = keys(C.padStart(), ["5", "000"]);
    expect(C.padNewMoney(dong)).toEqual({ typing: "local", from: "local", text: "", fresh: false });
    // (dong typed, then the dollars row tapped: the amount is still dong's, so it's cleared too)
    expect(C.padNewMoney(C.padTap(dong, "usd"))).toEqual({ typing: "local", from: "local", text: "", fresh: false });
  });

  it("a rate it can't stand behind shows the other row as zero, never a guess", () => {
    const bad = { ...RATES, VND: { rate: 0, asOf: null, approx: true } } as any;
    const fig = C.padFigures(keys(C.padStart(), ["5", "000"]), "VND", bad);
    expect(fig.shown("usd")).toBe("$0.00");
    expect(fig.amount("usd")).toBe(0);
  });

  it("an amount already kept, as the pad's text: whole dong, riel and yen; dollars with their cents", () => {
    expect(C.padText(500000, "VND")).toBe("500000");
    expect(C.padText(16000, "JPY")).toBe("16000");
    expect(C.padText(60, "USD")).toBe("60");
    expect(C.padText(48.6, "USD")).toBe("48.60");
    expect(C.padText(0.1 + 0.2, "USD")).toBe("0.30");
    expect(C.padText(12.345, "USD")).toBe("12.35");
    expect(C.padText(0, "USD")).toBe("");
    expect(C.padText(NaN, "VND")).toBe("");
    expect(C.padText(-5, "VND")).toBe("");
    // (shown as it was kept)
    expect(C.padShown(C.padText(48.6, "USD"), "USD")).toBe("$48.60");
    expect(C.padAmount(C.padText(48.6, "USD"))).toBe(48.6);
  });

  it("each money's word, for \"tap to type …\" and the swap button", () => {
    expect(C.MONEY_WORDS).toEqual({ VND: "dong", KHR: "riel", JPY: "yen", USD: "dollars" });
  });
});

describe("banknotes and a split", () => {
  it("the notes offered: Vietnam's six polymer notes, seven riel notes (the 500 and 2,000 that change comes back in), Japan's three", () => {
    expect(C.NOTES).toEqual({
      VND: [10_000, 20_000, 50_000, 100_000, 200_000, 500_000],
      KHR: [500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000],
      JPY: [1_000, 5_000, 10_000],
    });
  });

  it("each person's share: whole dong, riel and yen; cents for dollars", () => {
    expect(C.eachShare(1_250_000, 4, "VND")).toBe(312_500);
    expect(C.eachShare(1_000_000, 3, "VND")).toBe(333_333);
    expect(C.eachShare(100, 3, "USD")).toBe(33.33);
    expect(C.eachShare(48.6, 1, "USD")).toBe(48.6);
    expect(C.eachShare(7_300, 2, "JPY")).toBe(3_650);
  });

  it("a split by nobody, a fraction or nonsense is a split by one; more than 20 is 20", () => {
    for (const n of [0, -3, NaN, Infinity, "4" as any, null as any, undefined as any, 0.4]) expect(C.eachShare(1_000, n, "VND")).toBe(1_000);
    expect(C.eachShare(1_000, 2.9, "VND")).toBe(500);
    expect(C.eachShare(100_000, 50, "VND")).toBe(5_000);
    expect(C.SPLIT_MAX).toBe(20);
  });

  it("an amount it can't stand behind is zero", () => {
    for (const a of [NaN, Infinity, "12" as any, null as any]) expect(C.eachShare(a, 2, "VND")).toBe(0);
  });

  // (the two amounts are the ones on the sheet's rows; each share by hand from them. A review on Nov 22 found a split
  // typed in dollars reading 859,214 ₫ each under 2,577,900 ₫: the dollar share had been converted instead)
  it("a split in both moneys: each share is its own row's amount shared, whichever row was typed in", () => {
    // typed in dollars: $100 at 25,779 ₫, $10 at 4,066 ៛, $100 at ¥158.70
    expect(C.eachOfBoth(2_577_900, 100, 3, "VND")).toEqual({ local: 859_300, usd: 33.33 });
    expect(C.eachOfBoth(40_660, 10, 3, "KHR")).toEqual({ local: 13_553, usd: 3.33 });
    expect(C.eachOfBoth(15_870, 100, 7, "JPY")).toEqual({ local: 2_267, usd: 14.29 });
    // typed in the country's money
    expect(C.eachOfBoth(2_350_000, 91.16, 10, "VND")).toEqual({ local: 235_000, usd: 9.12 });
    expect(C.eachOfBoth(50_000, 12.3, 7, "KHR")).toEqual({ local: 7_143, usd: 1.76 });
    expect(C.eachOfBoth(7_300, 46, 3, "JPY")).toEqual({ local: 2_433, usd: 15.33 });
    // one person: the amounts themselves
    expect(C.eachOfBoth(125_000, 4.86, 1, "VND")).toEqual({ local: 125_000, usd: 4.86 });
  });
});

describe("which money a trip offers", () => {
  it("each country's money once, in the order the trip visits them", () => {
    const want = [{ country: "Vietnam", currency: "VND" }, { country: "Cambodia", currency: "KHR" }, { country: "Japan", currency: "JPY" }];
    expect(C.moneyCountries(TRIP)).toEqual(want);
    expect(C.moneyCountries([TRIP[5], TRIP[3], TRIP[0], TRIP[4], TRIP[1], TRIP[2]])).toEqual(want);
  });

  it("a city whose country isn't given, or whose money Wander doesn't keep, is passed over; never guessed from its name", () => {
    expect(C.moneyCountries([{ name: "Tokyo" }, { name: "Hanoi", country: null }, { name: "Bangkok", country: "Thailand" }])).toEqual([]);
    expect(C.moneyCountries([{ name: "Seoul", country: "South Korea", arrivalDate: "2026-12-14" }, ...TRIP]).map((m) => m.currency)).toEqual(["VND", "KHR", "JPY"]);
    expect(C.moneyCountries([])).toEqual([]);
  });

  it("the country's name is kept as the trip writes it, trimmed", () => {
    expect(C.moneyCountries([{ name: "Hanoi", country: " Viet Nam " }])).toEqual([{ country: "Viet Nam", currency: "VND" }]);
  });

  it("opens on today's country: the first before the trip, each country from the day its first city is reached", () => {
    expect(C.openingMoney(TRIP, "2026-11-22")).toBe("VND");
    expect(C.openingMoney(TRIP, "2026-12-15")).toBe("VND");
    expect(C.openingMoney(TRIP, "2026-12-29")).toBe("VND");
    expect(C.openingMoney(TRIP, "2026-12-30")).toBe("KHR");
    expect(C.openingMoney(TRIP, "2027-01-01")).toBe("KHR");
    expect(C.openingMoney(TRIP, "2027-01-02")).toBe("JPY");
    expect(C.openingMoney(TRIP, "2027-01-08")).toBe("JPY");
  });

  it("after the trip, the first country again; one country, that one; none, null", () => {
    expect(C.openingMoney(TRIP, "2027-01-09")).toBe("VND");
    expect(C.openingMoney([TRIP[3]], "2026-06-01")).toBe("KHR");
    expect(C.openingMoney([], "2026-12-20")).toBeNull();
    expect(C.openingMoney([{ name: "Bangkok", country: "Thailand" }], "2026-12-20")).toBeNull();
  });

  it("a last city with no departure ends on the trip's end date", () => {
    const open = TRIP.map((c, i) => (i === 5 ? { ...c, departureDate: null } : c));
    expect(C.openingMoney(open, "2027-01-08", "2027-01-08")).toBe("JPY");
    expect(C.openingMoney(open, "2027-01-09", "2027-01-08")).toBe("VND");
  });
});

describe("when the button shows", () => {
  it("before the trip and on every day of it, to the last minute of the last day on that day's own clock", () => {
    expect(C.showsConvert(TRIP, DATES, "Asia/Tokyo", new Date("2026-11-23T04:00:00Z"))).toBe(true);
    expect(C.showsConvert(TRIP, DATES, "Asia/Tokyo", new Date("2026-12-31T04:00:00Z"))).toBe(true);
    expect(C.showsConvert(TRIP, DATES, "Asia/Tokyo", new Date("2027-01-08T14:59:00Z"))).toBe(true);
  });

  it("not once the trip is over", () => {
    expect(C.showsConvert(TRIP, DATES, "Asia/Tokyo", new Date("2027-01-08T15:00:00Z"))).toBe(false);
    // (the same moment is still the last day on Vietnam's clock)
    expect(C.showsConvert(TRIP, DATES, "Asia/Ho_Chi_Minh", new Date("2027-01-08T15:00:00Z"))).toBe(true);
    expect(C.showsConvert([{ name: "Tokyo", country: "Japan", arrivalDate: "2026-10-01" }], ["2026-10-01", "2026-10-22"], "Asia/Tokyo", new Date("2026-11-23T04:00:00Z"))).toBe(false);
  });

  it("not on a trip with no money Wander keeps; a trip with no dates yet shows it", () => {
    expect(C.showsConvert([{ name: "Lisbon", country: "Portugal" }], DATES, "Europe/Lisbon", new Date("2026-12-20T00:00:00Z"))).toBe(false);
    expect(C.showsConvert([], DATES, "Asia/Tokyo", new Date("2026-12-20T00:00:00Z"))).toBe(false);
    expect(C.showsConvert(TRIP, [], "Asia/Tokyo", new Date("2030-01-01T00:00:00Z"))).toBe(true);
    expect(C.showsConvert(TRIP, [null, undefined] as any, "Asia/Tokyo", new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("what the phone remembers of a trip, so the bar never waits", () => {
  const answer = {
    id: "t1", timeZone: "America/Los_Angeles", endDate: "2027-01-08T00:00:00.000Z",
    cities: TRIP.map((c, i) => ({ ...c, id: `c${i}`, tripId: "t1", hidden: false, timeZone: i < 3 ? "Asia/Ho_Chi_Minh" : i === 3 ? "Asia/Phnom_Penh" : "Asia/Tokyo", latitude: 1, longitude: 2 })),
    days: [
      { date: "2026-12-14T00:00:00.000Z", city: null },
      { date: "2026-12-30T00:00:00.000Z", city: { timeZone: "Asia/Phnom_Penh", country: "Cambodia" } },
      { date: "2027-01-08T00:00:00.000Z", city: { timeZone: "Asia/Tokyo", country: "Japan" } },
    ],
  };

  it("from the server's trip: only what Convert needs (each city's name, country, dates and order; the days; the last day's clock)", () => {
    expect(C.convertTripFrom(answer)).toEqual({ cities: TRIP, dates: ["2026-12-14", "2026-12-30", "2027-01-08"], zone: "Asia/Tokyo" });
  });

  it("the last day's own clock decides; with no clock on its city, the trip's; with none at all, Japan's as everywhere in Wander", () => {
    const hanoiLast = { ...answer, days: [{ date: "2026-12-20", city: { timeZone: "Asia/Ho_Chi_Minh" } }], endDate: "2026-12-20" };
    expect(C.convertTripFrom(hanoiLast)!.zone).toBe("Asia/Ho_Chi_Minh");
    expect(C.convertTripFrom({ ...answer, days: [{ date: "2027-01-08", city: {} }] })!.zone).toBe("America/Los_Angeles");
    expect(C.convertTripFrom({ ...answer, timeZone: null, days: [] })!.zone).toBe("Asia/Tokyo");
  });

  it("the end date counts as a day even when no day row has it", () => {
    expect(C.convertTripFrom({ ...answer, days: [] })!.dates).toEqual(["2027-01-08"]);
    expect(C.convertTripFrom({ ...answer, days: [], endDate: null })!.dates).toEqual([]);
  });

  it("an answer that isn't a trip is null", () => {
    for (const bad of [null, undefined, "trip", 4, [], { cities: "x" }]) expect(C.convertTripFrom(bad)).toBeNull();
  });

  it("nothing remembered: null", () => {
    expect(C.rememberedConvertTrip("t1")).toBeNull();
    expect(C.rememberedConvertTrip(null)).toBeNull();
    expect(C.rememberedConvertTrip("")).toBeNull();
  });

  it("remembered per trip, under wander:convert, and read back whole", () => {
    const t = C.convertTripFrom(answer)!;
    C.rememberConvertTrip("t1", t);
    expect(store.has("wander:convert")).toBe(true);
    expect(C.rememberedConvertTrip("t1")).toEqual(t);
    expect(C.rememberedConvertTrip("t2")).toBeNull();
    C.rememberConvertTrip("t2", { cities: [], dates: [], zone: "Asia/Tokyo" });
    expect(C.rememberedConvertTrip("t1")).toEqual(t);
    expect(C.rememberedConvertTrip("t2")).toEqual({ cities: [], dates: [], zone: "Asia/Tokyo" });
  });

  it("nothing private is kept: no ids, no coordinates, nothing but the fields above", () => {
    C.rememberConvertTrip("t1", C.convertTripFrom(answer)!);
    const kept = store.get("wander:convert")!;
    for (const word of ["latitude", "longitude", "tripId", "hidden", "\"id\""]) expect(kept).not.toContain(word);
  });

  it("a damaged note, or one in another shape, reads as nothing remembered", () => {
    store.set("wander:convert", "{not json");
    expect(C.rememberedConvertTrip("t1")).toBeNull();
    store.set("wander:convert", JSON.stringify({ t1: { cities: [] } }));
    expect(C.rememberedConvertTrip("t1")).toBeNull();
    store.set("wander:convert", JSON.stringify({ v: 1, trips: { t1: { cities: "x", dates: [], zone: "Asia/Tokyo" } } }));
    expect(C.rememberedConvertTrip("t1")).toBeNull();
    store.set("wander:convert", JSON.stringify({ v: 1, trips: { toString: 1 } }));
    expect(C.rememberedConvertTrip("toString")).toBeNull();
  });

  it("storage that throws (private mode): nothing throws, nothing is remembered", () => {
    storageBroken = true;
    expect(() => C.rememberConvertTrip("t1", { cities: TRIP, dates: DATES, zone: "Asia/Tokyo" })).not.toThrow();
    expect(C.rememberedConvertTrip("t1")).toBeNull();
  });
});
