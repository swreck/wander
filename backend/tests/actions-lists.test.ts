/**
 * HER LISTS OUTSIDE THE ACTIONS TABLE (Oct 4 2026 copy): under her Actions table, in the Notes column, she started
 * "AB / JD Actions" (four to-dos) and, beside it, "LT actions" (one). Rows with nothing in the Actions column were
 * skipped, so they reached neither the Actions screen nor Scout. Invented to-dos, her layout.
 * - a cell ending "actions"/"to do" heads a list; the cells under it in that column are its to-dos, in her words,
 *   for whoever its heading names, noted as from that list
 * - the table's own rows are read as before; a stray note with no heading above it isn't a to-do
 */
import { describe, it, expect } from "vitest";
import { parseActionsTab, parseReservations } from "../src/services/guide/importSnapshot.js";

const cell = (a1: string, text: string) => {
  const m = a1.match(/^([A-Z]+)(\d+)$/)!;
  return { a1, r: Number(m[2]), c: m[1].charCodeAt(0) - 64, text, kind: "text" as const };
};
const TAB = { name: "Actions", index: 0, merged: [], images: [], cells: [
  cell("A1", "Actions"), cell("B1", "Owner"), cell("C1", "Due Dates"), cell("D1", "Notes"), cell("E1", "Andy Status"), cell("F1", "Larisa Status"),
  cell("A2", "Boat deposit"), cell("B2", "Both"), cell("C2", "2027-01-07"), cell("D2", "paid"), cell("E2", "DONE"), cell("F2", "DONE"),
  cell("A3", "Ferry times"), cell("B3", "LF"), cell("D3", "check the winter timetable"),
  cell("D5", "a stray thought with no heading"),
  cell("D12", "AB / JD Actions"), cell("D13", "Bus to the inn "), cell("D14", "Coins for lockers"), cell("D16", "Tell the bank about the trip"), cell("F16", "LT actions"),
  cell("F17", "Rewards card"),
] };

describe("her Actions tab", () => {
  const got = parseActionsTab([TAB as any]);
  it("reads the table as before", () => {
    expect(got.filter((a) => !a.ref.includes("|AB") && !a.ref.includes("|LT")).map((a) => [a.action, a.owner])).toEqual([["Boat deposit", "Both"], ["Ferry times", "LF"]]);
  });
  it("reads each list under its heading — her words, for whoever the heading names", () => {
    const lists = got.filter((a) => a.notes?.startsWith("In her"));
    expect(lists.map((a) => [a.action, a.owner, a.notes])).toEqual([
      ["Bus to the inn", "AB / JD", "In her “AB / JD Actions” list"],
      ["Coins for lockers", "AB / JD", "In her “AB / JD Actions” list"],
      ["Tell the bank about the trip", "AB / JD", "In her “AB / JD Actions” list"],
      ["Rewards card", "LT", "In her “LT actions” list"],
    ]);
    expect(new Set(got.map((a) => a.ref)).size).toBe(got.length);
  });
  it("a stray note with no heading above it isn't a to-do", () => {
    expect(got.some((a) => a.action.includes("stray thought"))).toBe(false);
  });
});

/**
 * HER BACKROADS DINNERS AS "DAY N" (same copy): under a "Backroads" heading in her reservations tab, rows say "Day 1" …
 * "Day 7" instead of a date. Each is that day of the tour, counted from the first Backroads night in her Itinerary,
 * and says it was dated that way; the column beside it is her note, not an address. Dated rows read as before.
 */
describe("her reservations tab", () => {
  const RESOS = { name: "Dining Resos", index: 1, merged: [], images: [], cells: [
    cell("B11", "Sa, 10/17 @ 6p"), cell("C11", "Harbor Grill"), cell("D11", "1-2-3 Pier Street"),
    cell("A13", "Backroads"), cell("B13", "Day 1"), cell("C13", "Lodge - welcome dinner"),
    cell("B15", "Day 3"), cell("C15", "Lounge - Ramen"),
    cell("B18", "Day 6"), cell("C18", "Dine on Your Own - soba"), cell("D18", "see below"),
    cell("A20", "Kyoto"), cell("B20", "Fr, 10/23 @ 7p"), cell("C20", "Soba House"),
    cell("B22", "Day 2"), cell("C22", "not under Backroads any more"),
  ] };
  const got = parseReservations([RESOS as any], "2031", "2031-10-18");
  const row = (title: string) => got.find((g) => g.title === title)!;
  it("dated rows as before", () => {
    expect([row("Harbor Grill").date, row("Harbor Grill").time]).toEqual(["2031-10-17", "18:00"]);
    expect(row("Harbor Grill").detail).toBe("Address: 1-2-3 Pier Street");
    expect(row("Soba House").date).toBe("2031-10-23");
  });
  it("Backroads Day N: that day of the tour, said as Wander's dating; her note beside it is a note", () => {
    expect(row("Lodge - welcome dinner").date).toBe("2031-10-18");
    expect(row("Lounge - Ramen").date).toBe("2031-10-20");
    expect(row("Lounge - Ramen").time).toBeNull();
    expect(row("Lounge - Ramen").detail).toBe("Her Dining Resos tab lists this under Backroads, Day 3 — Wander dated it from the first Backroads night in her Itinerary.");
    expect(row("Dine on Your Own - soba").detail).toMatch(/^Her note: see below\n/);
    expect(row("Dine on Your Own - soba").date).toBe("2031-10-23");
  });
  it("a Day N row outside the Backroads section, or with no Backroads in her Itinerary, isn't dated", () => {
    expect(got.some((g) => g.title === "not under Backroads any more")).toBe(false);
    expect(parseReservations([RESOS as any], "2031", null).some((g) => g.title === "Lounge - Ramen")).toBe(false);
  });
});
