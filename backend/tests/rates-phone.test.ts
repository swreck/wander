/**
 * The phone's side of recent rates (frontend/src/lib/rates.ts, Nov 22 2026): the copy it keeps so the calculator and the
 * currency pop-up work with no signal, the money of the day's country, converting through dollars, and the words a
 * person reads. Written before the file existed. Read straight from the phone's own file, as samples-phone.test.ts does.
 * No network: every test hands in its own getter and clock.
 */
import { describe, it, expect, beforeEach } from "vitest";

// A phone's storage
const store = new Map<string, string>();
let storageBroken = false;
(globalThis as any).localStorage = {
  getItem: (k: string) => { if (storageBroken) throw new Error("private mode"); return store.get(k) ?? null; },
  setItem: (k: string, v: string) => { if (storageBroken) throw new Error("private mode"); store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; },
};

const R = await import("../../frontend/src/lib/rates.ts");

const HOUR = 3600_000;
const NB = " ";
const GOOD = {
  JPY: { rate: 159.78, asOf: "2026-11-22", approx: false },
  VND: { rate: 25715.74, asOf: "2026-11-22", approx: false },
  KHR: { rate: 4064.11, asOf: "2026-11-22", approx: false },
};
const ROUND = {
  JPY: { rate: 150, asOf: null, approx: true },
  VND: { rate: 25000, asOf: null, approx: true },
  KHR: { rate: 4100, asOf: null, approx: true },
};
function server(answer: () => unknown = () => ({ rates: GOOD, source: "open.er-api.com" })) {
  const s = { paths: [] as string[], answer, get: async (path: string) => { s.paths.push(path); return s.answer(); } };
  return s;
}
const down = () => { throw new TypeError("Failed to fetch"); };

beforeEach(() => { store.clear(); storageBroken = false; });

describe("the phone's copy of the rates", () => {
  it("nothing kept yet: savedRates() is null", () => {
    expect(R.savedRates()).toBeNull();
  });

  it("loadRates asks /rates once, gives the rates, and keeps them under wander:rates", async () => {
    const s = server();
    expect(await R.loadRates({ get: s.get, now: () => 1000 })).toEqual(GOOD);
    expect(s.paths).toEqual(["/rates"]);
    expect(R.savedRates()).toEqual(GOOD);
    expect(store.has("wander:rates")).toBe(true);
  });

  it("a copy under 12 hours old is used without asking again", async () => {
    const s = server();
    await R.loadRates({ get: s.get, now: () => 0 });
    expect(await R.loadRates({ get: s.get, now: () => 12 * HOUR - 1 })).toEqual(GOOD);
    expect(s.paths.length).toBe(1);
  });

  it("a copy 12 hours old is asked for again, and the new answer replaces it", async () => {
    const s = server();
    await R.loadRates({ get: s.get, now: () => 0 });
    const newer = { ...GOOD, VND: { rate: 25800, asOf: "2026-11-23", approx: false } };
    s.answer = () => ({ rates: newer, source: "open.er-api.com" });
    expect(await R.loadRates({ get: s.get, now: () => 12 * HOUR })).toEqual(newer);
    expect(s.paths.length).toBe(2);
    expect(R.savedRates()).toEqual(newer);
  });

  it("no signal: the phone's copy, however old", async () => {
    const s = server();
    await R.loadRates({ get: s.get, now: () => 0 });
    s.answer = down;
    expect(await R.loadRates({ get: s.get, now: () => 900 * HOUR })).toEqual(GOOD);
  });

  it("no signal and nothing kept: round figures marked approximate, and they are NOT kept as if they were a rate", async () => {
    const s = server(down);
    expect(await R.loadRates({ get: s.get, now: () => 0 })).toEqual(ROUND);
    expect(R.savedRates()).toBeNull();
    expect(R.ROUND_RATES).toEqual(ROUND);
  });

  it("the server's own round figures (its source was down) never replace a real rate the phone has", async () => {
    const s = server();
    await R.loadRates({ get: s.get, now: () => 0 });
    s.answer = () => ({ rates: ROUND, source: "open.er-api.com" });
    expect(await R.loadRates({ get: s.get, now: () => 13 * HOUR })).toEqual(GOOD);
    expect(R.savedRates()).toEqual(GOOD);
  });

  it("the server's round figures with nothing kept: given as they are (approximate), not kept, and asked for again next time", async () => {
    const s = server(() => ({ rates: ROUND, source: "open.er-api.com" }));
    expect(await R.loadRates({ get: s.get, now: () => 0 })).toEqual(ROUND);
    expect(R.savedRates()).toBeNull();
    await R.loadRates({ get: s.get, now: () => 60_000 });
    expect(s.paths.length).toBe(2);
  });

  it("one currency approximate from the server: the phone keeps its own real rate for that one and takes the others", async () => {
    const s = server();
    await R.loadRates({ get: s.get, now: () => 0 });
    const mixed = { JPY: { rate: 161, asOf: "2026-11-23", approx: false }, VND: ROUND.VND, KHR: { rate: 4070, asOf: "2026-11-23", approx: false } };
    s.answer = () => ({ rates: mixed, source: "open.er-api.com" });
    expect(await R.loadRates({ get: s.get, now: () => 13 * HOUR })).toEqual({ JPY: mixed.JPY, VND: GOOD.VND, KHR: mixed.KHR });
  });

  for (const [name, bad] of [
    ["null", null], ["a string", "rates"], ["no rates", { source: "x" }], ["a missing currency", { rates: { JPY: GOOD.JPY, VND: GOOD.VND } }],
    ["a rate of zero", { rates: { ...GOOD, KHR: { rate: 0, asOf: null, approx: false } } }],
    ["a rate that isn't a number", { rates: { ...GOOD, VND: { rate: "25000", asOf: null, approx: false } } }],
    ["a negative rate", { rates: { ...GOOD, JPY: { rate: -150, asOf: null, approx: false } } }],
  ] as const) {
    it(`a bad answer (${name}) is never kept or used: round figures with nothing kept`, async () => {
      const s = server(() => bad);
      expect(await R.loadRates({ get: s.get, now: () => 0 })).toEqual(ROUND);
      expect(R.savedRates()).toBeNull();
    });
  }

  it("a copy kept in another shape (an older Wander, or damaged) reads as nothing kept", () => {
    store.set("wander:rates", JSON.stringify({ JPY: 150 }));
    expect(R.savedRates()).toBeNull();
    store.set("wander:rates", "{not json");
    expect(R.savedRates()).toBeNull();
    store.set("wander:rates", JSON.stringify({ v: 999, at: 0, rates: GOOD }));
    expect(R.savedRates()).toBeNull();
  });

  it("storage that throws (private mode): loadRates still gives the server's rates, and nothing throws", async () => {
    storageBroken = true;
    const s = server();
    expect(R.savedRates()).toBeNull();
    expect(await R.loadRates({ get: s.get, now: () => 0 })).toEqual(GOOD);
  });
});

describe("the money of a country", () => {
  it("Vietnam is dong, Cambodia riel, Japan yen, whatever the case or spaces", () => {
    expect(R.currencyOfCountry("Vietnam")).toBe("VND");
    expect(R.currencyOfCountry(" vietnam ")).toBe("VND");
    expect(R.currencyOfCountry("Viet Nam")).toBe("VND");
    expect(R.currencyOfCountry("Cambodia")).toBe("KHR");
    expect(R.currencyOfCountry("JAPAN")).toBe("JPY");
  });
  it("a country whose money Wander doesn't know, or none: null, never a guess", () => {
    for (const c of ["Thailand", "South Korea", "United States", "", null, undefined]) expect(R.currencyOfCountry(c as any)).toBeNull();
  });
});

describe("converting through dollars", () => {
  it("dong, riel and yen to dollars, to the cent", () => {
    expect(R.convert(1_250_000, "VND", "USD", GOOD)).toBe(48.61);
    expect(R.convert(20_000, "KHR", "USD", GOOD)).toBe(4.92);
    expect(R.convert(7_300, "JPY", "USD", GOOD)).toBe(45.69);
  });
  it("dollars to dong, riel and yen, in whole units", () => {
    // (by hand from the rate as printed: 20 × 25,716 · 5 × 4,064 · 100 × 159.78)
    expect(R.convert(20, "USD", "VND", GOOD)).toBe(514_320);
    expect(R.convert(5, "USD", "KHR", GOOD)).toBe(20_320);
    expect(R.convert(100, "USD", "JPY", GOOD)).toBe(15_978);
  });
  it("one foreign money to another goes through dollars", () => {
    // (500,000 ÷ 25,716 × 4,064 = 79,016.95 · 10,000 ÷ 159.78 × 25,716 = 1,609,463.01)
    expect(R.convert(500_000, "VND", "KHR", GOOD)).toBe(79_017);
    expect(R.convert(10_000, "JPY", "VND", GOOD)).toBe(1_609_463);
  });
  it("the rate the sums use is the rate a person reads: yen to the hundredth, dong and riel whole", () => {
    expect(R.printedRate("JPY", 158.701406)).toBe(158.7);
    expect(R.printedRate("JPY", 159.785)).toBe(159.79);
    expect(R.printedRate("VND", 25779.206142)).toBe(25_779);
    expect(R.printedRate("KHR", 4065.944525)).toBe(4_066);
    // (the rates a fresh reviewer met on Nov 22 2026, when the line said "¥159" and the sums used 158.70)
    const met = { JPY: { rate: 158.701406, asOf: "2026-11-23", approx: false }, VND: { rate: 25779.206142, asOf: "2026-11-23", approx: false }, KHR: { rate: 4065.944525, asOf: "2026-11-23", approx: false } };
    expect(R.rateWords("JPY", met)).toBe("¥158.70 to the dollar, the rate on Nov 23");
    expect(R.convert(150, "USD", "JPY", met)).toBe(23_805); // 150 × 158.70
    expect(R.convert(450_000, "JPY", "USD", met)).toBe(2835.54); // 450,000 ÷ 158.70 = 2,835.538
    expect(R.convert(10_000, "JPY", "USD", met)).toBe(63.01); // 10,000 ÷ 158.70 = 63.012
    expect(R.convert(100, "USD", "VND", met)).toBe(2_577_900); // 100 × 25,779
    expect(R.convert(100, "USD", "KHR", met)).toBe(406_600); // 100 × 4,066
  });
  it("a rate too small to print is no rate", () => {
    expect(R.convert(10, "USD", "VND", { ...GOOD, VND: { rate: 0.2, asOf: null, approx: false } })).toBeNull();
    expect(R.convert(10, "JPY", "USD", { ...GOOD, JPY: { rate: 0.004, asOf: null, approx: false } })).toBeNull();
  });
  it("the same money comes back as it went in (dollars to the cent, the rest whole)", () => {
    expect(R.convert(12.345, "USD", "USD", GOOD)).toBe(12.35);
    expect(R.convert(1999.6, "VND", "VND", GOOD)).toBe(2000);
  });
  it("zero is zero", () => {
    expect(R.convert(0, "VND", "USD", GOOD)).toBe(0);
    expect(R.convert(0, "USD", "KHR", GOOD)).toBe(0);
  });
  it("an amount it can't stand behind is null, never a number", () => {
    for (const bad of [NaN, Infinity, -Infinity, "12" as any, null as any, undefined as any]) expect(R.convert(bad, "VND", "USD", GOOD)).toBeNull();
  });
  it("a currency Wander doesn't keep is null", () => {
    expect(R.convert(10, "EUR" as any, "USD", GOOD)).toBeNull();
    expect(R.convert(10, "USD", "THB" as any, GOOD)).toBeNull();
    expect(R.convert(10, "toString" as any, "USD", GOOD)).toBeNull();
  });
});

describe("the words a person reads", () => {
  it("dollars always carry cents; dong and riel carry their sign after the number; yen its sign before", () => {
    expect(R.money(48.6, "USD")).toBe("$48.60");
    expect(R.money(1250, "USD")).toBe("$1,250.00");
    expect(R.money(0, "USD")).toBe("$0.00");
    expect(R.money(1_250_000, "VND")).toBe(`1,250,000${NB}₫`);
    expect(R.money(20_000, "KHR")).toBe(`20,000${NB}៛`);
    expect(R.money(7_300, "JPY")).toBe("¥7,300");
  });
  it("dong, riel and yen are said whole", () => {
    expect(R.money(514_315.4, "VND")).toBe(`514,315${NB}₫`);
    expect(R.money(99.5, "JPY")).toBe("¥100");
  });
  it("each money has a plain name and a sign", () => {
    expect(R.MONEY_NAMES).toEqual({ USD: "US dollars", VND: "Vietnamese dong", KHR: "Cambodian riel", JPY: "Japanese yen" });
    expect(R.MONEY_SIGNS).toEqual({ USD: "$", VND: "₫", KHR: "៛", JPY: "¥" });
  });
  it("a real rate is said with its day", () => {
    expect(R.rateWords("VND", GOOD)).toBe(`25,716${NB}₫ to the dollar, the rate on Nov 22`);
    expect(R.rateWords("KHR", GOOD)).toBe(`4,064${NB}៛ to the dollar, the rate on Nov 22`);
    expect(R.rateWords("JPY", GOOD)).toBe("¥159.78 to the dollar, the rate on Nov 22");
    expect(R.rateWords("JPY", { ...GOOD, JPY: { rate: 161, asOf: "2026-11-22", approx: false } })).toBe("¥161 to the dollar, the rate on Nov 22");
  });
  it("a real rate whose day isn't known says it's recent, never a made-up day", () => {
    expect(R.rateWords("VND", { ...GOOD, VND: { rate: 25715.74, asOf: null, approx: false } })).toBe(`25,716${NB}₫ to the dollar, a recent rate`);
  });
  it("a round figure says so plainly", () => {
    expect(R.rateWords("VND", ROUND)).toBe(`About 25,000${NB}₫ to the dollar. A rough figure: Wander couldn't get a recent rate.`);
    expect(R.rateWords("KHR", ROUND)).toBe(`About 4,100${NB}៛ to the dollar. A rough figure: Wander couldn't get a recent rate.`);
    expect(R.rateWords("JPY", ROUND)).toBe("About ¥150 to the dollar. A rough figure: Wander couldn't get a recent rate.");
  });
});
// (typedAmount, "125.000 is 125,000 dong", went with the amount box in batch 114, Nov 24 2026: Budget's amount is typed
// on Convert's pad, whose dong has no point, so a dot can't be typed there. Its cases went with it.)
