/**
 * WHERE THE DAY GOES, FOR THE WEATHER (Oct 13 2026). Ken: "staying at the Imperial Hotel, but the day plan is to go to
 * Mashiko, so both weathers should be there… That should always be true if you can identify a different location from
 * the plan." Her real lines for Oct 14 (Japan 2026, Itinerary), read for each person.
 */
import { describe, it, expect } from "vitest";
const { dayTripTown } = await import("../src/services/dayWeather.js");

const OCT14 = [
  "Day trip from Tokyo to Mashiko (Finish at Mashiko Station by 3:45p-4p)",   // [Ken & Larisa]
  "day 1 - JA Arrive (evening), KL day trip to Mashiko",                       // [] — her initials say whose
];
describe("a day trip in her plan", () => {
  it("Ken and Larisa: Mashiko", () => {
    expect(dayTripTown(OCT14, "Ken")).toBe("Mashiko");
    expect(dayTripTown(OCT14, "Larisa")).toBe("Mashiko");
  });
  it("Julie and Andy: not theirs (KL), so no second place", () => {
    // (the first line is filtered out for them by its "Ken & Larisa"; only the unassigned one reaches here)
    expect(dayTripTown([OCT14[1]], "Julie")).toBeNull();
    expect(dayTripTown([OCT14[1]], "Andy")).toBeNull();
  });
  it("other ways she might write it", () => {
    expect(dayTripTown(["Nara day trip"], "Ken")).toBe("Nara");
    expect(dayTripTown(["day-trip to Kamakura with Kenji"], "Ken")).toBe("Kamakura");
    expect(dayTripTown(["Day trip from Kyoto to Nara Park"], "Ken")).toBe("Nara Park");
    expect(dayTripTown(["Ginza shopping day", "Refresh at the Imperial Hotel"], "Ken")).toBeNull();
    expect(dayTripTown(["The day trip to the lake"], "Ken")).toBeNull();
  });
});
