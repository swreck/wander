/**
 * WHEN THE RAIN COMES (Oct 13 2026, Ken's weather plan item 3: the hourly rain window on the days just ahead). Open-Meteo's
 * real hours for Mashiko on Oct 14, fetched Oct 13: Japan's model had showers mid-morning, Europe's and the US models
 * rain late afternoon, and the main forecast's chance peaked at 90% at 6 PM.
 */
import { describe, it, expect } from "vitest";
const { wetHours, showerHours } = await import("../src/services/dayWeather.js");

const z = () => Array(24).fill(0) as number[];
const at = (xs: [number, number][]) => { const a = z(); for (const [h, v] of xs) a[h] = v; return a; };
const MASHIKO = {
  precipitation_jma_seamless: at([[8, 0.004], [9, 0.031], [10, 0.063], [11, 0.004], [14, 0.008], [15, 0.008]]),
  precipitation_ecmwf_ifs025: at([[7, 0.012], [8, 0.012], [9, 0.012], [10, 0.016], [11, 0.016], [12, 0.016], [16, 0.055], [17, 0.055], [18, 0.055]]),
  precipitation_gfs_seamless: at([[16, 0.004], [17, 0.039], [18, 0.031]]),
  precipitation_probability_best_match: at([[7, 8], [8, 20], [9, 29], [10, 35], [11, 39], [12, 41], [13, 40], [14, 38], [15, 41], [16, 58], [17, 81], [18, 90], [19, 74], [20, 44], [21, 20]]),
};

// (Europe's next run, an hour later: its morning rain down to a trace, so only Japan's model kept the showers)
const MASHIKO_LATER = {
  ...MASHIKO,
  precipitation_ecmwf_ifs025: at([[7, 0.004], [8, 0.004], [9, 0.004], [16, 0.079], [17, 0.079], [18, 0.079]]),
};

describe("showers one model alone sees", () => {
  it("Mashiko, the later run: 3–7 PM likeliest, Japan's 8–10 AM showers possible", () => {
    const likely = wetHours(MASHIKO_LATER);
    expect(likely).toEqual([[15, 19]]);
    expect(showerHours(MASHIKO_LATER, likely)).toEqual([[8, 10]]);
  });
  it("never inside the likeliest hours; a trace (under 0.02\") or a low chance (under 25%) isn't a shower", () => {
    expect(showerHours(MASHIKO, wetHours(MASHIKO))).toEqual([]);
    expect(showerHours({ precipitation_jma_seamless: at([[10, 0.015]]), precipitation_probability_best_match: at([[10, 40]]) }, [])).toEqual([]);
    expect(showerHours({ precipitation_jma_seamless: at([[10, 0.2]]), precipitation_probability_best_match: at([[10, 20]]) }, [])).toEqual([]);
  });
});

describe("the hours rain is likeliest", () => {
  it("Mashiko, Oct 14: Japan's morning showers and the others' late-afternoon rain, both", () => {
    // (each figure is the hour before its stamp: the 9:00 and 10:00 figures are 8–10 AM — verify34)
    expect(wetHours(MASHIKO)).toEqual([[8, 10], [15, 19]]);
  });
  it("a dry day: none", () => {
    expect(wetHours({ precipitation_probability_best_match: z() })).toEqual([]);
  });
  it("one model alone, under a 50% chance, isn't enough", () => {
    expect(wetHours({ precipitation_jma_seamless: at([[10, 0.2]]), precipitation_probability_best_match: at([[10, 45]]) })).toEqual([]);
  });
  it("spans one dry hour apart join; two apart stay two", () => {
    expect(wetHours({ precipitation_probability_best_match: at([[9, 60], [11, 60]]) })).toEqual([[8, 11]]);
    expect(wetHours({ precipitation_probability_best_match: at([[9, 60], [12, 60]]) })).toEqual([[8, 9], [11, 12]]);
  });
  it("only 7 AM to 10 PM: the 8:00 stamp is 7–8 AM, the 22:00 stamp 9–10 PM; 3 AM and 11 PM aren't the day's", () => {
    expect(wetHours({ precipitation_probability_best_match: at([[3, 90], [7, 90], [23, 90], [22, 70]]) })).toEqual([[21, 22]]);
    expect(wetHours({ precipitation_probability_best_match: at([[8, 90]]) })).toEqual([[7, 8]]);
  });
  it("missing figures read as dry, never a crash", () => {
    expect(wetHours({})).toEqual([]);
    expect(wetHours({ precipitation_probability_best_match: [null, null] as (number | null)[] })).toEqual([]);
  });
});
