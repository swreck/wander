/**
 * A place's photo and map are looked up in the country of the day it's on (December plan S1, D9, T-k; Nov 17 2026).
 * linePlaces.ts ended every search with ", Japan": a Hanoi place would have been searched for in Japan. The country
 * now comes with the day (its city's country, from the trip's own cities); with none given the search is Japan's, as it
 * always was. Read straight from the phone's own file, as forecast-words-parity does for its copy.
 */
import { describe, it, expect } from "vitest";

const { planMapHref, photoQueryOf } = await import("../../frontend/src/lib/linePlaces.ts");
const { mapsQueryOf } = await import("../../frontend/src/lib/placePhotos.ts");

const line = (title: string, extra: Record<string, unknown> = {}): any => ({
  id: `l-${title}`, tripId: "t", date: "2026-12-25", time: null, endTime: null, timeZone: null, kind: "tour", title, detail: null,
  forWhom: null, place: null, confirmation: null, link: null, source: "Backroads' itinerary", sourceRef: "plan:day:2026-12-25:line:1", sortOrder: 0, ...extra,
});
const q = (href: string | null) => mapsQueryOf(href);

describe("the country of a place's search", () => {
  it("a Hanoi place is searched in Vietnam and never in Japan, for its map and for its photo", () => {
    const b = line("Dong Xuan Market");
    expect(q(planMapHref(b, { country: "Vietnam" }))).toBe("Dong Xuan Market, Vietnam");
    expect(photoQueryOf(b, { country: "Vietnam" })).toBe("Dong Xuan Market, Vietnam");
    // (a line that is a sentence, not a name: the photo's own fallback, with the day's city and country)
    const theatre = line("Visit Thang Long Theatre");
    expect(photoQueryOf(theatre, { country: "Vietnam", city: "Hanoi" })).toBe("Visit Thang Long Theatre, Hanoi, Vietnam");
  });

  it("a Tokyo place is searched in Japan, whether the country is said or left out", () => {
    const b = line("Nishiki Market");
    expect(q(planMapHref(b, { country: "Japan" }))).toBe("Nishiki Market, Japan");
    expect(q(planMapHref(b, {}))).toBe("Nishiki Market, Japan");
    expect(photoQueryOf(b, { country: "Japan", city: "Tokyo" })).toBe("Nishiki Market, Japan");
    const garden = line("Visit Meiji Shrine and its gardens");
    expect(photoQueryOf(garden, { country: "Japan", city: "Tokyo" })).toBe("Visit Meiji Shrine and its gardens, Tokyo, Japan");
    expect(photoQueryOf(garden, { city: "Tokyo" })).toBe("Visit Meiji Shrine and its gardens, Tokyo, Japan");
    expect(photoQueryOf(garden, { country: null, city: "Tokyo" })).toBe("Visit Meiji Shrine and its gardens, Tokyo, Japan");
    expect(photoQueryOf(garden, { country: "  ", city: "Tokyo" })).toBe("Visit Meiji Shrine and its gardens, Tokyo, Japan");
  });

  it("her Guide's own named stop ends in the country of the day too", () => {
    const stop = line("Taxi to e-bike meeting point", { detail: "Where: Cycle Kyoto — the stop her tab lists for this", source: "Kyoto Mon, 1026 Arashiyama" });
    expect(q(planMapHref(stop, {}))).toBe("Cycle Kyoto, Kyoto, Japan");
    expect(q(planMapHref(stop, { country: "Japan" }))).toBe("Cycle Kyoto, Kyoto, Japan");
    expect(q(planMapHref(stop, { country: "Vietnam" }))).toBe("Cycle Kyoto, Kyoto, Vietnam");
  });

  it("another country, and one with a space in its name", () => {
    expect(photoQueryOf(line("Visit the Banteay Srei temple at sunrise"), { country: "Cambodia", city: "Siem Reap" })).toBe("Visit the Banteay Srei temple at sunrise, Siem Reap, Cambodia");
    expect(photoQueryOf(line("Visit the Ferry Building and its market"), { country: "United States", city: "San Francisco" })).toBe("Visit the Ferry Building and its market, San Francisco, United States");
  });
});
