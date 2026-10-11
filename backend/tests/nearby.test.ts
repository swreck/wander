/**
 * "What's near me?" (nearby.ts): her closest pinned places to the phone, in the words people use, which way, and whether
 * that's toward their hotel — or plainly that nothing of hers is near. Pure logic on made-up places; no database.
 */
import { describe, it, expect } from "vitest";
import { parseHere, nearbyLines, pinFor, farWords, type Pin, type Anchor } from "../src/services/guide/nearby.js";
import { strayKeys, pinKey } from "../src/services/guide/appleGuides.js";
import { myMapLines } from "../src/services/guide/googleMyMap.js";

const here = { lat: 35.0, lng: 136.0, acc: 30, age: 5 };
const pins: Pin[] = [
  { name: "Kiln Cafe", lat: 35.0036, lng: 136.0, note: "Cash only", from: 'her Google map, layer "Pottery Town"' },
  { name: "Tea Garden", lat: 34.98476, lng: 136.01861, note: null, from: 'her Google map, layer "Pottery Town"' },
  { name: "Tea Garden", lat: 34.98477, lng: 136.01862, note: null, from: 'her Apple Maps guide "Day 3"' },
  { name: "Riverside Hotel", lat: 34.98095, lng: 136.02326, note: null, from: 'her Google map, layer "Pottery Town"' },
  { name: "Far Museum", lat: 35.5, lng: 136.5, note: null, from: 'her Google map, layer "Elsewhere"' },
];
const hotel: Anchor = { name: "Riverside Hotel", lat: 34.98095, lng: 136.02326, when: "tonight" };

describe("what's near them", () => {
  it("takes only a real position or a plain reason from the phone", () => {
    expect(parseHere({ lat: 35, lng: 136, acc: 20, age: 3 })).toEqual({ lat: 35, lng: 136, acc: 20, age: 3 });
    expect(parseHere({ none: "denied" })).toEqual({ none: "denied" });
    expect(parseHere({ lat: 200, lng: 136 })).toBeNull();
    expect(parseHere({ lat: "35", lng: 136 })).toBeNull();
    expect(parseHere({ none: "whatever" })).toBeNull();
    expect(parseHere(null)).toBeNull();
  });

  it("names her closest places with blocks or miles, which way, and toward their hotel — the hotel said once, a twice-pinned place once", () => {
    const lines = nearbyLines(here, pins, [hotel]).join("\n");
    expect(lines).toContain("Their hotel tonight, Riverside Hotel (her pin): about 3.0 km — 1.9 miles to the south-east");
    expect(lines).toMatch(/- Kiln Cafe — about 400 m — roughly 4 blocks to the north · her Google map, layer "Pottery Town" · her note: "Cash only"/);
    expect(lines).toContain("- Tea Garden — about 2.4 km — 1.5 miles to the south-east, toward their hotel");
    expect(lines.match(/Tea Garden/g)).toHaveLength(1);
    expect(lines).not.toMatch(/- Riverside Hotel/);
    expect(lines).not.toMatch(/minute/);
  });

  it("says plainly when nothing of hers is near — never 'nearby' from California", () => {
    const lines = nearbyLines({ lat: 37.77, lng: -122.42, acc: 15, age: 2 }, pins, []).join("\n");
    expect(lines).toContain("None of Larisa's pinned places is near them");
    expect(lines).toContain("they may not be in Japan yet");
    expect(lines).not.toMatch(/^- Kiln Cafe/m);
  });

  it("says why it doesn't know where they are", () => {
    expect(nearbyLines({ none: "denied" }, pins, []).join(" ")).toMatch(/said no to sharing their location/);
    expect(nearbyLines({ none: "not-asked" }, pins, []).join(" ")).toMatch(/didn't send it/);
  });

  it("says a rough or old fix is rough or old", () => {
    expect(nearbyLines({ ...here, acc: 900, age: 900 }, pins, [])[0]).toMatch(/rough — within about 900 m, as of 15 minutes ago/);
  });

  it("finds her pin for a hotel by a word of its name, accents and all", () => {
    const p: Pin[] = [{ name: "Yōyōkaku", lat: 1, lng: 1, note: null, from: "x" }, { name: "Grand Station", lat: 2, lng: 2, note: null, from: "x" }];
    expect(pinFor("Yoyokaku - Ryokan", p)?.name).toBe("Yōyōkaku");
    expect(pinFor("Hotel Tokyo", p)).toBeNull();
  });

  it("knows a pin far from the whole trip (a street of the same name 100 km away) — and keeps a real far one", () => {
    const towns = [{ lat: 35.012, lng: 135.768 }, { lat: 35.182, lng: 136.905 }];
    const kyoto = [{ lat: 34.9984, lng: 135.7808 }, { lat: 34.9983, lng: 135.7808 }];
    const wrongSpot = { lat: 34.2257, lng: 135.1712 };
    const hotelNearTown = { lat: 35.1709, lng: 136.8832 };
    const stray = strayKeys([...kyoto, wrongSpot, hotelNearTown], towns);
    expect([...stray]).toEqual([pinKey(wrongSpot)]);
    expect(strayKeys([wrongSpot], [])).toEqual(new Set());
  });

  it("tells Scout her misplaced pin is misplaced, and leaves it out of what's close to what", () => {
    const wrongSpot = { name: "Old Lane", note: null, lat: 34.2257, lng: 135.1712 };
    const m = { mid: "TestMapId_12345", title: "T", readAt: "2030-01-11T03:00:00.000Z", hash: "x",
      layers: [{ name: "Day 2", places: [{ name: "Pagoda", note: null, lat: 34.9929, lng: 135.785 }, { name: "Tea House", note: null, lat: 34.9984, lng: 135.7808 }, wrongSpot] }] };
    const lines = myMapLines(m, new Set([pinKey(wrongSpot)])).join("\n");
    expect(lines).toMatch(/- Old Lane \[her pin for this sits far from every town and place of the trip/);
    expect(lines).not.toMatch(/Old Lane: nothing else/);
    expect(lines).not.toMatch(/km/);
  });

  it("keeps distances round", () => {
    expect(farWords(90)).toMatch(/under 150 m/);
    expect(farWords(12_000)).toBe("about 12.0 km — 7.5 miles");
    expect(farWords(8_300_000)).toBe("about 8,300 km (5,157 miles)");
  });
});
