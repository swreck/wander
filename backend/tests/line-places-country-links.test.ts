/**
 * Map links and routes end in the country of the day (December plan S1, D9; Nov 17 2026). DayPage and TripGlance
 * added a fixed ", Japan" to her route stops, her choices and the airport in "Directions in Maps". A Hanoi place sent a
 * person to the wrong place. A Japan trip's links must stay character for character what they were: the old code is
 * copied below as the reference.
 */
import { describe, it, expect } from "vitest";

const { placedRoute, choiceMapHref, airportDirectionsHref } = await import("../../frontend/src/lib/linePlaces.ts");
const { mapsLink } = await import("../../frontend/src/lib/guideDisplay.ts");
const { areaOf } = await import("../../frontend/src/lib/linePlaces.ts");

// The old DayPage.placedRoute, as it was before this change
function oldPlacedRoute(url: string, area: string): string {
  try {
    const u = new URL(url);
    const [before, path] = u.pathname.split("/maps/dir/");
    if (path === undefined) return url;
    const town = area.replace(/,\s*$/, "");
    const stops = path.split("/").map((s) => {
      if (!s || s.startsWith("@") || s.startsWith("data=")) return s;
      const name = decodeURIComponent(s.replace(/\+/g, " "));
      const named = town && new RegExp(`\\b${town.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(name);
      const placed = /japan|日本/i.test(name) ? name : named ? `${name}, Japan` : `${name}, ${area}Japan`;
      return encodeURIComponent(placed).replace(/%20/g, "+").replace(/%2C/g, ",");
    });
    u.pathname = `${before}/maps/dir/${stops.join("/")}`;
    return u.toString();
  } catch { return url; }
}

const line = (source: string): any => ({
  id: "l1", tripId: "t", date: "2026-12-25", time: null, endTime: null, timeZone: null, kind: "tour", title: "A stop", detail: null,
  forWhom: null, place: null, confirmation: null, link: null, source, sourceRef: "x", sortOrder: 0,
});

const routes = [
  "https://www.google.com/maps/dir/Umeno+Vase+Shop/Tokyodo+Main+Showroom/Tokyo+Station,+Japan/@35.68,139.76,12z/data=!4m2",
  "https://www.google.com/maps/dir/Cycle+Kyoto/Arashiyama+Bamboo+Grove/",
  "https://www.google.com/maps/dir/Shibuya+Crossing,+Tokyo/Meiji+Shrine",
  "https://example.com/not-a-route",
];

describe("a route's stops end in the country of the day", () => {
  it("Japan: every route is character for character what the old code gave", () => {
    for (const r of routes) for (const area of ["Tokyo, ", "Kyoto, ", ""]) expect(placedRoute(r, area, "Japan")).toBe(oldPlacedRoute(r, area));
  });
  it("a day whose country isn't known names no country, never Japan", () => {
    for (const c of [undefined, null, "  "]) {
      const out = placedRoute("https://www.google.com/maps/dir/Dong+Xuan+Market/Hoan+Kiem+Lake/", "Hanoi, ", c);
      expect(out).toBe("https://www.google.com/maps/dir/Dong+Xuan+Market,+Hanoi/Hoan+Kiem+Lake,+Hanoi/");
      expect(placedRoute("https://www.google.com/maps/dir/Dong+Xuan+Market/", "", c)).toBe("https://www.google.com/maps/dir/Dong+Xuan+Market/");
    }
  });
  it("Hanoi: a stop is searched in Vietnam and the word Japan is nowhere in the link", () => {
    const out = placedRoute("https://www.google.com/maps/dir/Dong+Xuan+Market/Hoan+Kiem+Lake/", "Hanoi, ", "Vietnam");
    expect(out).toBe("https://www.google.com/maps/dir/Dong+Xuan+Market,+Hanoi,+Vietnam/Hoan+Kiem+Lake,+Hanoi,+Vietnam/");
    expect(out).not.toMatch(/japan/i);
  });
  it("a stop that already names the country or the town is not doubled", () => {
    expect(placedRoute("https://www.google.com/maps/dir/Hanoi+Opera+House/Ben+Thanh,+Vietnam/", "Hanoi, ", "Vietnam"))
      .toBe("https://www.google.com/maps/dir/Hanoi+Opera+House,+Vietnam/Ben+Thanh,+Vietnam/");
  });
});

describe("a choice's map ends in the country of the day", () => {
  it("Japan: the same as the old fixed ending", () => {
    for (const src of ["Kyoto Mon, 1026 Arashiyama", "Tokyo Day 3", "Itinerary · Notes (row 4)"]) {
      const b = line(src);
      expect(choiceMapHref({ name: "Omen" }, b, "Japan")).toBe(mapsLink(`Omen, ${areaOf(b)}Japan`));
    }
  });
  it("a day whose country isn't known names no country, never Japan", () => {
    for (const c of [undefined, null, " "]) {
      const href = choiceMapHref({ name: "Omen" }, line("Kyoto Mon, 1026 Arashiyama"), c);
      expect(href).toBe(mapsLink("Omen, Kyoto"));
      expect(choiceMapHref({ name: "Omen" }, line("Itinerary · Notes (row 4)"), c)).toBe(mapsLink("Omen"));
    }
  });
  it("Hanoi: Vietnam", () => {
    const href = choiceMapHref({ name: "Bun Cha Huong Lien" }, line("Day 3 Hanoi"), "Vietnam");
    expect(decodeURIComponent(href)).toContain("Bun Cha Huong Lien");
    expect(decodeURIComponent(href)).toContain("Vietnam");
    expect(href).not.toMatch(/japan/i);
  });
});

describe("the airport in 'Directions in Maps'", () => {
  it("Japan: exactly the old link", () => {
    const old = (airport: string, dest: string) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${airport} Airport, Japan`)}&destination=${encodeURIComponent(dest)}&travelmode=transit`;
    expect(airportDirectionsHref("Narita", "Hotel A, Tokyo", "Japan")).toBe(old("Narita", "Hotel A, Tokyo"));
  });
  it("a day whose country isn't known names no country, never Japan", () => {
    for (const c of [undefined, null, ""]) {
      const href = airportDirectionsHref("Haneda", "Hotel A", c);
      expect(decodeURIComponent(href)).toContain("origin=Haneda Airport&destination=Hotel A");
    }
  });
  it("Hanoi: Noi Bai is searched in Vietnam", () => {
    const href = airportDirectionsHref("Noi Bai", "Stay A, Hanoi", "Vietnam");
    expect(decodeURIComponent(href)).toContain("origin=Noi Bai Airport, Vietnam");
    expect(href).not.toMatch(/japan/i);
  });
});
