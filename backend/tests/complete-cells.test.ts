/**
 * A Scout line's cells, completed from her rows (sources.ts completeCells). Round 15 graded Scout's saved sources
 * against her downloaded Guide: every cited cell held the words shown, but some answers' words were in a cell the
 * source left out — a stay's dates, a merged line's second row, the ninth cell of a row, a quote from another tab.
 * Synthetic tabs; no database.
 */
import { describe, it, expect } from "vitest";
import { completeCells } from "../src/services/guide/sources.js";

const cell = (a1: string, text: string) => {
  const m = a1.match(/^([A-Z]+)(\d+)$/)!;
  const c = m[1].split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  return { a1, r: Number(m[2]), c, text, kind: "text" };
};
const tab = (name: string, cells: ReturnType<typeof cell>[], images: { anchor: string; sha256: string }[] = []) =>
  ({ name, index: 0, cells, images } as any);
const at = (t: string, a1: string, text: string) => ({ kind: "cell" as const, tab: t, a1, text });
const refs = (cells: any[]) => cells.map((c) => (c.kind === "cell" ? `${c.tab}!${c.a1}` : `${c.kind}:${c.sha256 || c.tab}`));

const IT = "Japan-Oct26-Itinerary";
const itinerary = tab(IT, [
  cell("C16", "Okayama (day trip to Bizen - 40 min JR train) - WHERE IS BIZEN TOUR STARTING"),
  cell("C52", "2026-10-21"), cell("D52", "2026-10-23"), cell("E52", "2"), cell("T52", "Shirakabeso"), cell("V52", "1440.56"),
  cell("C18", "2026-10-07"), cell("F18", "10/7 Bizen Tour - Trip Advisor"), cell("N18", "8:30a"), cell("P18", "9:30a"),
  cell("F67", "6:30p flight - travel day (1/2 day - TBD"),
  cell("Q67", "1:30-2:00p Haruka from Kyoto to KIX (if stop at Rikuro need to modify from Kyoto->Osaka, Osaka->KIX)"),
  cell("G69", "KIX - UA34"), cell("N69", "18:35"),
  cell("Y46", "Meet Backroads 8:30a Courtyard by Marriott Tokyo Station"),
  cell("F44", "8:30a meet Backroads"),
]);
const hotels = tab("Tokyo Areas & Hotel Options", [
  ...["M", "Q", "R", "S", "T", "U", "V", "X"].map((col, i) => cell(`${col}13`, ["1", "Imperial", "Chiyoda City", "4.5 Google Rating", "323", "450.538", "2252.69", "https://example.test/imperial"][i])),
  cell("Y13", "Booked direct. Airport access is good: the hotel has Airport Limousine Bus service from the main entrance."),
]);
const day = tab("Kyoto Thu, 1029 (Flight Home))", [cell("A57", "~12:30–1:00"), cell("B57", "Board reserved HARUKA"), cell("A48", "🍵 Stop 7: Gion Tsujiri Main Shop (Traditional sweets/matcha)")],
  [{ anchor: "A2", sha256: "abc123" }]);
const tabs = [itinerary, hotels, day];

describe("a line's cells, completed from her rows", () => {
  it("a stay's dates are in their own cells beside the hotel's name (Shirakabeso: C52, D52)", () => {
    const got = completeCells("- Shirakabeso (Shirakabeso); sleeping there the nights of 2026-10-21, 2026-10-22; check out the morning of 2026-10-23",
      [at(IT, "T52", "Shirakabeso")], tabs);
    expect(refs(got)).toEqual([`${IT}!T52`, `${IT}!C52`, `${IT}!D52`]);
  });

  it("never a bare number or a short cell that happens to be in the line (E52 \"2\", V52 a price)", () => {
    const got = completeCells("- Shirakabeso; 2 nights; 2026-10-21", [at(IT, "T52", "Shirakabeso")], tabs);
    expect(refs(got)).not.toContain(`${IT}!E52`);
    expect(refs(got)).not.toContain(`${IT}!V52`);
  });

  it("her \"8:30a\" and \"9:30a\" are the line's 08:30–09:30", () => {
    const got = completeCells("- 08:30–09:30 travel: Okayama → Bizen — 10/7 Bizen Tour - Trip Advisor", [at(IT, "F18", "10/7 Bizen Tour - Trip Advisor")], tabs);
    expect(refs(got)).toEqual([`${IT}!F18`, `${IT}!N18`, `${IT}!P18`]);
  });

  it("a time cell the line doesn't say isn't added", () => {
    const got = completeCells("- 10:00 travel: 10/7 Bizen Tour - Trip Advisor", [at(IT, "F18", "10/7 Bizen Tour - Trip Advisor")], tabs);
    expect(refs(got)).toEqual([`${IT}!F18`]);
  });

  it("the second row its label names (the flight on row 69 carries her row 67 note)", () => {
    const line = "- 18:35 flight: KIX - UA34\nLarisa's note: \"6:30p flight - travel day (1/2 day - TBD\"\nLarisa's travel note: 1:30-2:00p Haruka from Kyoto to KIX (if stop at Rikuro need to modify from Kyoto->Osaka, Osaka->KIX)";
    const got = completeCells(line, [at(IT, "G69", "KIX - UA34")], tabs, "Itinerary · travel (row 69) + Screenshot in Flight info + Itinerary · Description (row 67)");
    expect(refs(got)).toEqual([`${IT}!G69`, `${IT}!F67`, `${IT}!Q67`, `${IT}!N69`]);
  });

  it("the ninth cell of a row, when the line quotes it (the Imperial's airport words in Y13)", () => {
    const first8 = ["M", "Q", "R", "S", "T", "U", "V", "X"].map((col) => at("Tokyo Areas & Hotel Options", `${col}13`, "x"));
    const got = completeCells("- Imperial Hotel: “Airport access is good: the hotel has Airport Limousine Bus service from the main entrance.” (her Tokyo Areas & Hotel Options tab)", first8, tabs);
    expect(refs(got)).toContain("Tokyo Areas & Hotel Options!Y13");
  });

  it("a quote from another tab, when exactly one cell holds it", () => {
    const line = "- 12:30–13:00 [as she wrote the time: \"~12:30–1:00\"] block: Board reserved HARUKA\nTabs differ: her Itinerary tab says \"1:30-2:00p Haruka from Kyoto to KIX (if stop at Rikuro need to modify from Kyoto->Osaka, Osaka->KIX)\".";
    const got = completeCells(line, [at(day.name, "A57", "~12:30–1:00"), at(day.name, "B57", "Board reserved HARUKA")], tabs);
    expect(refs(got)).toContain(`${IT}!Q67`);
  });

  it("a quote two cells hold is left alone — never a guess", () => {
    const twice = [tab("A", [cell("A1", "the same sentence in two places, word for word")]), tab("B", [cell("B1", "the same sentence in two places, word for word")])];
    const got = completeCells("note: \"the same sentence in two places, word for word\"", [], twice);
    expect(got).toEqual([]);
  });

  it("her city heading one row up (C16), from a stretch of her words the line carries", () => {
    const got = completeCells("- (no time given) stop: day trip to Bizen - 40 min JR train — WHERE IS BIZEN TOUR STARTING", [at(IT, "C18", "2026-10-07")], tabs);
    expect(refs(got)).toContain(`${IT}!C16`);
  });

  it("a merged line's other row, from her words (the Backroads meeting place in Y46)", () => {
    const got = completeCells("- 08:30 meeting: Meet Backroads 8:30a Courtyard by Marriott Tokyo Station", [at(IT, "F44", "8:30a meet Backroads")], tabs,
      "Itinerary · Description (row 44) + Itinerary · Notes (row 46)");
    expect(refs(got)).toContain(`${IT}!Y46`);
  });

  it("\"the stop her tab lists\": that stop's cell", () => {
    const got = completeCells("- 16:30 block: matcha in Gion — Where: Gion Tsujiri Main Shop — the stop her tab lists for this", [at(day.name, "B57", "Board reserved HARUKA")], tabs);
    expect(refs(got)).toContain(`${day.name}!A48`);
  });

  it("\"a picture in her tab\": the picture, when her tab has just one", () => {
    const got = completeCells("- block: Maruni — A picture in her tab lists this under “You & Julie (morning)”", [at(day.name, "B57", "Board reserved HARUKA")], tabs);
    expect(refs(got)).toContain("picture:abc123");
  });

  it("nothing to add: the same cells back", () => {
    const cells = [at(IT, "T52", "Shirakabeso")];
    expect(completeCells("- Shirakabeso", cells, tabs)).toBe(cells);
  });
});
