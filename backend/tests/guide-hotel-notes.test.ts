/**
 * Two things in Larisa's Oct 4 copy (made-up sheets — the repository is public):
 * - a sentence written in her Hotel column is her note for the day, never a second hotel (T40: "AI estimates our arrival
 *   to the hotel (6:15-6:45p) and your arrival (6-6:30p) and to aim for dinner between 7-7:30p" made Oct 14–17 two-hotel
 *   nights); a hotel named with a bracketed note ("Hotel Alpha (chk in 3p, chk out 12p)") is still a hotel
 * - a pasted copy of Ken's rail sheet is known by its own column headings, whatever its tab is called
 */
import { describe, it, expect } from "vitest";
import type { GuideCell, GuideTab } from "../src/services/guide/reader.js";
import { interpretItinerary } from "../src/services/guide/itinerary.js";
import { isRailSheetCopy } from "../src/services/guide/importSnapshot.js";

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
function tab(name: string, rows: Record<string, string>[]): GuideTab {
  const cells: GuideCell[] = [];
  rows.forEach((row, i) => {
    for (const [col, raw] of Object.entries(row)) {
      const base = { a1: `${col}${i + 1}`, r: i + 1, c: letters.indexOf(col) + 1 };
      if (raw.startsWith("d:")) cells.push({ ...base, kind: "date", date: raw.slice(2), text: raw.slice(2) });
      else if (raw.startsWith("b:")) cells.push({ ...base, kind: "text", text: raw.slice(2), bold: true });
      else cells.push({ ...base, kind: "text", text: raw });
    }
  });
  return { name, index: 0, cells, merged: [], images: [] };
}
const HEADER = { C: "b:Date", D: "b:Chk Out", E: "b:Nights", F: "b:Description", G: "b:From", H: "b:To", T: "b:Hotel (Daily Rate)", Y: "b:Notes" };
const NOTE = "AI estimates our arrival to the hotel (6:15-6:45p) and your arrival (6-6:30p) and to aim for dinner between 7-7:30p";

describe("a sentence in her Hotel column", () => {
  const r = interpretItinerary([tab("My Trip Itinerary", [
    HEADER,
    { C: "b:Tokyo" },
    { C: "d:2026-05-02", D: "d:2026-05-06", E: "4", T: "Hotel Alpha (chk in 3p, chk out 12p)" },
    { C: "d:2026-05-03", T: NOTE },
  ])])!;
  it("is her note for that day, word for word — not a hotel", () => {
    expect(r.stays.map((s) => s.hotel)).toEqual(["Hotel Alpha (chk in 3p, chk out 12p)"]);
    const note = r.items.find((i) => i.title === NOTE);
    expect(note).toMatchObject({ date: "2026-05-03", kind: "note", time: null });
    expect(r.warnings.some((w) => /more than one hotel/.test(w))).toBe(false);
  });
  it("a hotel with a bracketed note is still the hotel, with its nights", () => {
    expect(r.stays[0]).toMatchObject({ checkIn: "2026-05-02", checkOut: "2026-05-06" });
  });
});

describe("a pasted copy of Ken's rail sheet", () => {
  const RAIL_HEADER = { A: "Status", B: "Date", C: "Purpose", D: "Route", L: "Train", M: "Class", N: "Depart", O: "Arrive", P: "Car / seat", Q: "Reservation #", U: "Boarding readiness (separate from booking status)" };
  it("is known by its columns, whatever the tab is called", () => {
    expect(isRailSheetCopy(tab("COPY of Ken Rail sheet", [RAIL_HEADER, { A: "Booked", L: "NOZOMI 77" }]))).toBe(true);
    expect(isRailSheetCopy(tab("Trains backup", [RAIL_HEADER]))).toBe(true);
  });
  it("her own tabs aren't — not even one that mentions trains and reservations", () => {
    expect(isRailSheetCopy(tab("Dining Resos", [{ A: "Date", B: "Restaurant", C: "Reservation #" }, { B: "Train station café" }]))).toBe(false);
    expect(isRailSheetCopy(tab("Tokyo Day 1", [{ A: "Time", B: "Plan" }, { B: "Train to Ginza" }]))).toBe(false);
  });
});
