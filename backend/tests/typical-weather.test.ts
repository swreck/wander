/**
 * A day too far ahead for a forecast (Nov 23 2026): what that week was like in the last five years, from Open-Meteo's
 * archive, said as past years and never as a forecast. Written before the service. The Hoi An and Shiga Kogen numbers
 * are what the archive really returned on Nov 23 2026.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { sameWeeks, summarize, typicalWeek, typicalWords, forgetTypical, type PastDay } from "../src/services/typicalWeather.js";

afterEach(() => { vi.unstubAllGlobals(); });

describe("the same week in the five years before", () => {
  it("is the three days either side of the date, in each of the five years before the date's own", () => {
    expect(sameWeeks("2026-12-29")).toEqual([
      { year: 2025, start: "2025-12-26", end: "2026-01-01" },
      { year: 2024, start: "2024-12-26", end: "2025-01-01" },
      { year: 2023, start: "2023-12-26", end: "2024-01-01" },
      { year: 2022, start: "2022-12-26", end: "2023-01-01" },
      { year: 2021, start: "2021-12-26", end: "2022-01-01" },
    ]);
  });
  it("a January day's five years start with the January just gone", () => {
    const w = sameWeeks("2027-01-04");
    expect(w[0]).toEqual({ year: 2026, start: "2026-01-01", end: "2026-01-07" });
    expect(w[4]).toEqual({ year: 2022, start: "2022-01-01", end: "2022-01-07" });
  });
  it("Feb 29 falls on Mar 1 in a year without one", () => {
    expect(sameWeeks("2028-02-29")[0]).toEqual({ year: 2027, start: "2027-02-26", end: "2027-03-04" });
    expect(sameWeeks("2028-02-29")[3]).toEqual({ year: 2024, start: "2024-02-26", end: "2024-03-03" });
  });
  it("a date that isn't one gives no weeks", () => {
    expect(sameWeeks("soon")).toEqual([]);
    expect(sameWeeks("2026-13-40")).toEqual([]);
  });
});

const day = (hi: number, lo: number, wet: number, snow = 0): PastDay => ({ hi, lo, wet, snow });
const many = (n: number, d: PastDay) => Array.from({ length: n }, () => d);

describe("what the days add up to", () => {
  it("highs and lows as their usual value and their span, in whole degrees", () => {
    const s = summarize([...many(10, day(70.6, 63.5, 0)), ...many(10, day(78.9, 73.1, 0))])!;
    expect(s.hi).toEqual({ usual: 75, from: 71, to: 79 });
    expect(s.lo).toEqual({ usual: 68, from: 64, to: 73 });
    expect(s.days).toBe(20);
  });
  it("a day counts as rain from 0.04 inches (1 mm), as heavy from 0.4 (10 mm)", () => {
    const s = summarize([...many(5, day(75, 68, 0.039)), ...many(4, day(75, 68, 0.04)), ...many(3, day(75, 68, 0.399)), ...many(3, day(75, 68, 0.4)), day(75, 68, 3.8)])!;
    expect(s.rainDays).toBe(11);
    expect(s.heavyDays).toBe(4);
    expect(s.snowDays).toBe(0);
  });
  it("a day with 0.4 inches of snow or more is a snow day, never also a rain day", () => {
    const s = summarize([...many(10, day(20, 8, 0.2, 1.5)), ...many(3, day(33, 20, 0.3, 0.1)), ...many(3, day(25, 5, 0, 0))])!;
    expect(s.snowDays).toBe(10);
    expect(s.rainDays).toBe(3);
    expect(s.heavyDays).toBe(0);
  });
  it("fewer than 15 days is too little to speak from", () => {
    expect(summarize(many(14, day(75, 68, 0)))).toBeNull();
    expect(summarize([])).toBeNull();
  });
});

const base = { from: "2026-12-26", to: "2027-01-01", days: 35 };
describe("the words Scout is given", () => {
  it("says past years, names them, and never says forecast as if it were one", () => {
    const w = typicalWords({ ...base, years: [2025, 2024, 2023, 2022, 2021], hi: { usual: 75, from: 71, to: 79 }, lo: { usual: 68, from: 64, to: 73 }, rainDays: 32, heavyDays: 13, snowDays: 0 }, "Hoi An");
    expect(w).toBe("Past years, not a forecast: in the same week of 2021–2025, Hoi An's highs were around 75°F (71 to 79) and its lows around 68°F (64 to 73). It rained on 32 of those 35 days, heavily on 13.");
  });
  it("snow is said as snow", () => {
    const w = typicalWords({ from: "2027-01-01", to: "2027-01-07", days: 35, years: [2026, 2025, 2024, 2023, 2022], hi: { usual: 21, from: 9, to: 34 }, lo: { usual: 8, from: 0, to: 20 }, rainDays: 0, heavyDays: 0, snowDays: 25 }, "Shiga Kogen");
    expect(w).toBe("Past years, not a forecast: in the same week of 2022–2026, Shiga Kogen's highs were around 21°F (9 to 34) and its lows around 8°F (0 to 20). It snowed on 25 of those 35 days.");
  });
  it("snow and rain both, a dry week, one day, and years with a gap", () => {
    const t = { ...base, hi: { usual: 40, from: 33, to: 48 }, lo: { usual: 30, from: 22, to: 36 } };
    expect(typicalWords({ ...t, years: [2025, 2024, 2023, 2022, 2021], rainDays: 6, heavyDays: 0, snowDays: 9 }, "Nagano")).toContain("It snowed on 9 of those 35 days and rained on 6.");
    expect(typicalWords({ ...t, years: [2025, 2024, 2023, 2022, 2021], rainDays: 0, heavyDays: 0, snowDays: 0 }, "Siem Reap")).toContain("None of those 35 days had rain.");
    expect(typicalWords({ ...t, years: [2025, 2024, 2023, 2022, 2021], rainDays: 1, heavyDays: 1, snowDays: 0 }, "Siem Reap")).toContain("It rained on 1 of those 35 days, heavily.");
    expect(typicalWords({ ...t, days: 21, years: [2025, 2023, 2021], rainDays: 2, heavyDays: 0, snowDays: 0 }, "Hanoi")).toContain("in the same week of 2021, 2023 and 2025, Hanoi's highs");
    expect(typicalWords({ ...t, days: 28, years: [2025, 2024, 2022, 2021], rainDays: 2, heavyDays: 0, snowDays: 0 }, "Hanoi")).toContain("of 2021, 2022, 2024 and 2025,");
    expect(typicalWords({ ...t, years: [2025, 2024, 2023, 2022, 2021], hi: { usual: 75, from: 75, to: 75 }, rainDays: 2, heavyDays: 0, snowDays: 0 }, "Hanoi")).toContain("highs were around 75°F and its lows");
  });
});

// (what the archive really returned for Hoi An, Dec 26–Jan 1, on Nov 23 2026)
const HOI_AN: Record<number, [number[], number[], number[]]> = {
  2025: [[70.6, 72.8, 75.2, 76.5, 78.2, 78.1, 78.9], [68, 67.7, 67.6, 67.6, 67.4, 65.5, 63.5], [1.866, 0.224, 0.094, 0.083, 0.043, 0.004, 0]],
  2024: [[73.9, 74.8, 71.4, 72.9, 76, 73.7, 74.6], [69.4, 71.4, 68.6, 67.3, 66.7, 68.3, 65.1], [1.756, 1.417, 1.713, 0.157, 0.098, 0.272, 0.012]],
  2023: [[72.8, 73.3, 76.9, 76.5, 78.4, 78, 78], [68.4, 70.3, 70.4, 71, 73.1, 72.5, 70.7], [0.449, 1.575, 1.256, 2.098, 0.209, 0.248, 0.122]],
  2022: [[74.2, 75.9, 72.5, 72.7, 73.1, 73.8, 71.3], [64.8, 67.2, 66.7, 69.3, 68.3, 65.9, 66.5], [0.197, 0.087, 0.394, 0.654, 0.213, 0.11, 0.28]],
  2021: [[73.6, 72.8, 73.9, 76.8, 76.4, 77, 75.3], [71.3, 69.1, 69.1, 71.1, 70.9, 67.9, 68.5], [1.358, 3.835, 3.047, 0.22, 0.197, 0.197, 0.524]],
};
let urls: URL[] = [];
let failYears: number[] = [];
function stub() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = new URL(String(url));
    urls.push(u);
    const year = Number(u.searchParams.get("start_date")!.slice(0, 4));
    if (failYears.includes(year)) return new Response("no", { status: 500 });
    const [hi, lo, wet] = HOI_AN[year];
    return new Response(JSON.stringify({ daily: { time: hi.map((_, i) => `d${i}`), temperature_2m_max: hi, temperature_2m_min: lo, precipitation_sum: wet, snowfall_sum: hi.map(() => 0) } }), { status: 200 });
  }));
}
const HOI_AN_PT = { lat: 15.87944, lng: 108.335 };

describe("asking the archive", () => {
  beforeEach(() => { urls = []; failYears = []; forgetTypical(); stub(); });

  it("asks for each of the five weeks, on the place's own clock, in °F and inches, and adds them up", async () => {
    const t = await typicalWeek(HOI_AN_PT, "2026-12-29", "Asia/Ho_Chi_Minh");
    expect(urls.length).toBe(5);
    urls.forEach((u) => {
      expect(u.host).toBe("archive-api.open-meteo.com");
      expect(u.searchParams.get("timezone")).toBe("Asia/Ho_Chi_Minh");
      expect(u.searchParams.get("temperature_unit")).toBe("fahrenheit");
      expect(u.searchParams.get("precipitation_unit")).toBe("inch");
      expect(u.searchParams.get("daily")).toBe("temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum");
      expect(u.searchParams.get("latitude")).toBe("15.87944");
    });
    expect(urls.map((u) => `${u.searchParams.get("start_date")}..${u.searchParams.get("end_date")}`).sort()).toEqual(
      ["2021-12-26..2022-01-01", "2022-12-26..2023-01-01", "2023-12-26..2024-01-01", "2024-12-26..2025-01-01", "2025-12-26..2026-01-01"]);
    expect(t).toEqual({ from: "2026-12-26", to: "2027-01-01", years: [2025, 2024, 2023, 2022, 2021], days: 35,
      hi: { usual: 75, from: 71, to: 79 }, lo: { usual: 68, from: 64, to: 73 }, rainDays: 32, heavyDays: 13, snowDays: 0 });
  });
  it("is asked once per place and date: the second time comes from what it kept", async () => {
    await typicalWeek(HOI_AN_PT, "2026-12-29", "Asia/Ho_Chi_Minh");
    await typicalWeek(HOI_AN_PT, "2026-12-29", "Asia/Ho_Chi_Minh");
    expect(urls.length).toBe(5);
    await typicalWeek(HOI_AN_PT, "2026-12-30", "Asia/Ho_Chi_Minh");
    expect(urls.length).toBe(10);
  });
  it("two asks at the same moment share one set of requests", async () => {
    const [a, b] = await Promise.all([typicalWeek(HOI_AN_PT, "2026-12-29", "Asia/Ho_Chi_Minh"), typicalWeek(HOI_AN_PT, "2026-12-29", "Asia/Ho_Chi_Minh")]);
    expect(urls.length).toBe(5);
    expect(a).toEqual(b);
  });
  it("a year the archive didn't answer is left out, and the years said are the ones used", async () => {
    failYears = [2023];
    const t = await typicalWeek(HOI_AN_PT, "2026-12-29", "Asia/Ho_Chi_Minh");
    expect(t?.years).toEqual([2025, 2024, 2022, 2021]);
    expect(t?.days).toBe(28);
  });
  it("with fewer than three years answered there is nothing to say, and it is asked again next time", async () => {
    failYears = [2025, 2024, 2023];
    expect(await typicalWeek(HOI_AN_PT, "2026-12-29", "Asia/Ho_Chi_Minh")).toBeNull();
    failYears = [];
    expect((await typicalWeek(HOI_AN_PT, "2026-12-29", "Asia/Ho_Chi_Minh"))?.days).toBe(35);
  });
  it("days the archive left blank are skipped, not counted as zero", async () => {
    HOI_AN[2021][0][6] = null as any;
    const t = await typicalWeek(HOI_AN_PT, "2026-12-29", "Asia/Ho_Chi_Minh");
    HOI_AN[2021][0][6] = 75.3;
    expect(t?.days).toBe(34);
  });
  it("a date that isn't one asks nothing", async () => {
    expect(await typicalWeek(HOI_AN_PT, "soon", "Asia/Ho_Chi_Minh")).toBeNull();
    expect(urls.length).toBe(0);
  });
});
