/**
 * A city's photo is judged by the season the trip is really there (Nov 17 2026: on production, Hanoi in December was
 * judged as "Hanoi, Japan, in mid-to-late October"; a ski town in January would have had its snow turned away).
 * Japan's October trip keeps its question word for word.
 */
import { describe, it, expect } from "vitest";
import { seasonQuestion } from "../src/routes/cityPhoto.js";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const JAPAN_OCTOBER = (city: string) => `This photo will fill a phone's screen to greet travelers arriving in ${city}, Japan, in mid-to-late October. Look at the whole picture, including small things at its edges and along the bottom. It fits only if it is a view of the place (a landmark, street, garden or landscape — not a close-up of food, a portrait or a sign) and nothing in it belongs to another season: no Christmas trees, Santa figures, Christmas or New Year decorations or illuminations; no snow or ice; no bare leafless trees or brown dormant lawns (winter); no cherry blossoms (spring). Green trees or autumn color are fine. In "seen", say briefly what in the photo tells the season or occasion; then set "fits".`;

describe("the question asked about a city's photo", () => {
  it("Japan in October: the same words as before, whether or not the country is recorded", () => {
    expect(seasonQuestion("Nikko", "Japan", [day("2026-10-06"), day("2026-10-07")])).toBe(JAPAN_OCTOBER("Nikko"));
    expect(seasonQuestion("Kyoto", null, [day("2026-10-27"), day("2026-10-29")])).toBe(JAPAN_OCTOBER("Kyoto"));
    expect(seasonQuestion("Tokyo", " japan ", [day("2026-10-16")])).toBe(JAPAN_OCTOBER("Tokyo"));
  });
  it("no days: Japan keeps the old question; another country is asked only whether it is a view of the place", () => {
    expect(seasonQuestion("Nikko")).toBe(JAPAN_OCTOBER("Nikko"));
    expect(seasonQuestion("Nikko", "Japan", [])).toBe(JAPAN_OCTOBER("Nikko"));
    const q = seasonQuestion("Hanoi", "Vietnam", []);
    expect(q).toContain("arriving in Hanoi, Vietnam.");
    expect(q).not.toMatch(/Japan|October|season|snow/);
  });
  it("Hanoi in December: its own country and its own days, never Japan or October", () => {
    const q = seasonQuestion("Hanoi", "Vietnam", [day("2026-12-25"), day("2026-12-15"), day("2026-12-20")]);
    expect(q).toContain("arriving in Hanoi, Vietnam, who are there from December 15 to December 25.");
    expect(q).not.toMatch(/Japan|October|autumn color are fine/);
    expect(q).not.toMatch(/no snow or ice|no Christmas/);
    expect(q).toContain(`In "seen", say briefly what in the photo tells the season or occasion; then set "fits".`);
  });
  it("a Japanese ski town in January: January, and snow is said to be fine", () => {
    const q = seasonQuestion("Shiga Kogen", "Japan", [day("2027-01-02"), day("2027-01-06")]);
    expect(q).toContain("arriving in Shiga Kogen, Japan, who are there from January 2 to January 6.");
    expect(q).not.toMatch(/October|no snow or ice/);
    expect(q).toContain("snow at a mountain resort in winter");
    expect(q).toContain("summer green on a ski mountain in January");
  });
  it("one day: 'on January 8'; days across a new year are read in order", () => {
    expect(seasonQuestion("Tokyo", "Japan", [day("2027-01-08")])).toContain("who are there on January 8.");
    expect(seasonQuestion("Siem Reap", "Cambodia", [day("2027-01-01"), day("2026-12-30")])).toContain("who are there from December 30 to January 1.");
  });
  it("October somewhere else is not Japan's question", () => {
    const q = seasonQuestion("Hanoi", "Vietnam", [day("2026-10-10")]);
    expect(q).toContain("arriving in Hanoi, Vietnam, who are there on October 10.");
    expect(q).not.toContain("Japan");
  });
  it("a show on a stage is not a view of the place (Hanoi's first pick was the inside of a theatre); Japan's October words don't change", () => {
    expect(seasonQuestion("Hanoi", "Vietnam", [day("2026-12-15")])).toContain("or a show on a stage inside a hall)");
    expect(seasonQuestion("Hanoi", "Vietnam", [])).toContain("or a show on a stage inside a hall)");
    expect(seasonQuestion("Kyoto", "Japan", [day("2026-10-27")])).not.toContain("stage");
  });
  it("the same question is the one sent to the judge and the days come from the city's own rows", async () => {
    const src = (await import("fs")).readFileSync(new URL("../src/routes/cityPhoto.ts", import.meta.url), "utf8");
    expect(src).toContain("text: seasonQuestion(cityName, country, dates)");
    expect(src).toContain("fitsTheSeason(b, t, city.name, city.country, dates)");
    expect(src).toContain("prisma.day.findMany({ where: { cityId }, select: { date: true } })");
    expect(src).toContain("select: { startDate: true, endDate: true }");
  });
});
