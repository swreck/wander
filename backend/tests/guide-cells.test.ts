/**
 * Where each line of the Guide came from — the cell and her exact words — worked out at import from her
 * cells, so Scout's "Sources" can show it (Ken, Sep 30: a wrong source is worse than none). Synthetic tabs;
 * no database.
 */
import { describe, it, expect } from "vitest";
import { cellsHolding, cellWordsFor } from "../src/services/guide/importSnapshot.js";

const cell = (a1: string, text: string) => {
  const m = a1.match(/^([A-Z]+)(\d+)$/)!;
  return { a1, r: Number(m[2]), c: m[1].charCodeAt(0) - 64, text };
};
const tab = (name: string, cells: ReturnType<typeof cell>[], images: { anchor: string; sha256: string }[] = []) =>
  ({ name, cells, images, merged: [] } as any);

describe("the cell a line came from", () => {
  const tokyo = tab("Tokyo Day 1 Ginza", [
    cell("A40", "🏺 Day 1: Ginza\n8:30 AM – 11:00 AM: Tsukiji Outer Market\n11:15 AM – 12:30 PM: ART AQUARIUM MUSEUM Ginza\nTransit: walk"),
    cell("A43", "🎨 Stop 2: ART AQUARIUM MUSEUM GINZA (inside Ginza Mitsukoshi)"),
  ]);

  it("with a time, the cell holding her time too — not the stop list without it", () => {
    expect(cellsHolding(tokyo, "ART AQUARIUM MUSEUM Ginza", "11:15 AM – 12:30 PM")).toEqual(["Tokyo Day 1 Ginza!A40"]);
  });

  it("without a time, the smallest cell holding her words", () => {
    expect(cellsHolding(tokyo, "ART AQUARIUM MUSEUM Ginza")).toEqual(["Tokyo Day 1 Ginza!A43"]);
  });

  it("in a Time | Plan table, the time cell beside the plan cell", () => {
    const kyoto = tab("Kyoto Sun, 1025", [cell("A49", "12:15"), cell("B49", "Taxi to e-bike meeting point"), cell("B50", "Lunch")]);
    expect(cellsHolding(kyoto, "Taxi to e-bike meeting point", "12:15")).toEqual(["Kyoto Sun, 1025!A49", "Kyoto Sun, 1025!B49"]);
  });

  it("nothing when her words aren't in the tab — never a nearby guess", () => {
    const kyoto = tab("Kyoto Sun, 1025", [cell("B49", "Taxi to e-bike meeting point")]);
    expect(cellsHolding(kyoto, "Private boat on the Hozu river", "3:00")).toEqual([]);
  });
});

describe("her words at each source", () => {
  const read = {
    tabs: [
      tab("Japan-Oct26-Itinerary", [cell("F65", "Kyoto day 3 - Team Lab Kyoto (entry window: 11-11:30a)")]),
      tab("Activities Template", [cell("A37", "Mashiko (ceramics town)"), cell("C37", "Ceramics town day trip"), cell("E37", "Larisa")]),
      tab("Flight info", [], [{ anchor: "J1", sha256: "abc123" }]),
    ],
  } as any;

  it("a cell: the tab, the cell and exactly what's in it", () => {
    expect(cellWordsFor(["Japan-Oct26-Itinerary!F65"], read)).toEqual([
      { kind: "cell", tab: "Japan-Oct26-Itinerary", a1: "F65", text: "Kyoto day 3 - Team Lab Kyoto (entry window: 11-11:30a)" },
    ]);
  });

  it("a whole row: its filled cells, left to right", () => {
    expect(cellWordsFor(["Activities Template!37"], read).map((c: any) => c.a1)).toEqual(["A37", "C37", "E37"]);
  });

  it("a screenshot: the picture and where it sits", () => {
    expect(cellWordsFor(["image:abc123"], read)).toEqual([{ kind: "picture", tab: "Flight info", anchor: "J1", sha256: "abc123" }]);
  });

  it("a tab where the one cell couldn't be pinned says so — the tab only", () => {
    expect(cellWordsFor(["Kyoto Wed, 1028 Shigaraki!plan"], read)).toEqual([{ kind: "tab", tab: "Kyoto Wed, 1028 Shigaraki" }]);
  });

  it("the same source twice is listed once", () => {
    expect(cellWordsFor(["Japan-Oct26-Itinerary!F65", "Japan-Oct26-Itinerary!F65"], read)).toHaveLength(1);
  });
});
