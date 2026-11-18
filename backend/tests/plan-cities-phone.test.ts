/**
 * Every city of a trip built from a plan is part of the trip (Nov 17 2026). On production, December's Siem Reap, Shiga
 * Kogen and Tokyo had no photo, no place on the Home map and no count in the story: the phone took "the trip's country"
 * to be the one most of its cities are in (Vietnam), a rule made to leave out the city a sheet trip flies from.
 * The phone's own file, read straight from frontend/src as plan-words-phone.test.ts does.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";

const C = await import("../../frontend/src/lib/cityColors.ts");

const sheet = [
  { name: "San Francisco", country: "USA" }, { name: "Tokyo", country: "Japan" }, { name: "Nikko", country: "Japan" },
  { name: "Kyoto", country: "Japan" }, { name: "A town with no country", country: null },
];
const plan = [
  { name: "Hanoi", country: "Vietnam" }, { name: "Hué", country: "Vietnam" }, { name: "Hoi An", country: "Vietnam" },
  { name: "Siem Reap", country: "Cambodia" }, { name: "Shiga Kogen", country: "Japan" }, { name: "Tokyo", country: "Japan" },
];

describe("which cities are part of where the trip goes", () => {
  it("a sheet trip, as before: the city you fly from is out; its country's cities and a city with no country are in", () => {
    expect(sheet.map((c) => C.cityInTrip(c, sheet, false))).toEqual([false, true, true, true, true]);
    expect(C.tripCountryOf(sheet)).toBe("Japan");
  });
  it("a plan trip: all six cities, in three countries", () => {
    expect(plan.map((c) => C.cityInTrip(c, plan, true))).toEqual([true, true, true, true, true, true]);
  });
  it("the same six read as a sheet trip would lose three (what production showed)", () => {
    expect(plan.map((c) => C.cityInTrip(c, plan, false))).toEqual([true, true, true, false, false, false]);
  });
  it("no cities with a country at all: every city is in", () => {
    const bare = [{ country: null }, {}];
    expect(bare.map((c) => C.cityInTrip(c, bare, false))).toEqual([true, true]);
  });
  it("each screen asks through cityInTrip with the trip's plan answer; none compares a city with one country itself", () => {
    const read = (f: string) => fs.readFileSync(new URL(`../../frontend/src/${f}`, import.meta.url), "utf8");
    const day = read("pages/DayPage.tsx"), home = read("pages/TripOverview.tsx"), glance = read("components/TripGlance.tsx"), story = read("pages/TripStoryPage.tsx");
    expect(day).toContain("cityInTrip(dayCity, d.trip.cities, isPlanTrip(tid))");
    expect(day).toContain("cityInTrip(bandCity, trip.cities, isPlanTrip(trip.id))");
    expect(day).toContain("cityInTrip(c, trip!.cities, isPlanTrip(trip!.id))");
    expect(home).toContain("const inTripCountry = (c: City) => cityInTrip(c, cities, planTrip);");
    expect(glance).toContain("!cityInTrip(city, data.trip.cities, isPlanTrip(tripId))");
    expect(story).toContain("cityInTrip(c, data.trip.cities || [], plan)");
    expect(story).toContain("const country = plan ? null : tripCountryOf(data.trip.cities || []);");
    for (const src of [day, home, glance, story]) expect(src).not.toMatch(/country === tripCountryOf|country !== tripCountryOf/);
  });
});
