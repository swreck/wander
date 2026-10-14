/**
 * The forecast's words are the same on the day page and in Scout's answers (Ken, Oct 13: "yes. One unified and correct
 * source"): the two copies of forecastWords.ts are the same file, and Scout's lines read as the day page's do.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { forecastLines, rainWhen } from "../src/services/forecastWords.js";

describe("forecast words: day page and Scout", () => {
  it("the frontend and backend copies are identical", () => {
    const front = fs.readFileSync(path.resolve(__dirname, "../../frontend/src/lib/forecastWords.ts"), "utf-8");
    const back = fs.readFileSync(path.resolve(__dirname, "../src/services/forecastWords.ts"), "utf-8");
    expect(back).toBe(front);
  });

  it("a day trip: the day's place first, then the hotel, with the hours still to come", () => {
    // (Ken's Oct 14 at 7 AM Japan, as the day page drew it)
    const now = new Date("2026-10-13T22:00:00Z");
    const lines = forecastLines({ lo: 62, hi: 69, rain: 94, inches: 0.13, code: 61, models: "wet", outlook: "forecast", wet: [[10, 19]], showers: [[9, 10]],
      place: "Imperial Hotel", atHotel: true, town: "Tokyo",
      also: { place: "Mashiko", when: "day", lo: 60, hi: 68, rain: 90, inches: 0.2, code: 63, models: "wet", outlook: "forecast", wet: [[15, 19]], showers: [[8, 10]] } }, "2026-10-14", "Tokyo", now);
    expect(lines.map((l) => l.text.replace(/ /g, " ").replace(/⁠/g, "").replace(/‑/g, "-"))).toEqual([
      'Forecast for Mashiko, the day trip: 60-68°F, 90% chance of rain (.20"), most likely 3–7 PM, with showers possible 8–10 AM',
      'Forecast at the Imperial Hotel: 62-69°F, 94% chance of rain (.13"), most likely 10 AM–7 PM, with showers possible 9–10 AM',
    ]);
    expect(lines[0].icon).toBe("rain");
  });

  it("past hours drop off on today", () => {
    expect(rainWhen({ wet: [[10, 19]] }, "2026-10-14", new Date("2026-10-14T05:30:00Z")).replace(/ /g, " ").replace(/⁠/g, "")).toBe(", most likely until 7 PM");
  });
});
