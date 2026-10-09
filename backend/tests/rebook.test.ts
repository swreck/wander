/**
 * REBOOKING (Oct 8 2026) — Ken cancelled five trains and rebooked each on a new card, in a "REBOOK — ACTION" tab
 * ("Cancelled | Rebooked | Date | FROM | TO | Train | … | OLD res # | Receipt | NEW res # | NEW seats | Notes"), leaving
 * the old rows in "OLD — Rail Detail". Wander must never say a cancelled booking's number, seats or pickup notes as
 * current; it says the train was rebooked, and shows the new number and seats once they're in the sheet.
 *
 * All data here is invented (the repository is public).
 */
import { describe, it, expect } from "vitest";
import type { GuideTab } from "../src/services/guide/reader.js";

const { railRows, rebookRows, applyRebooks } = await import("../src/services/sources/shapes.js");
const { sourceDocuments } = await import("../src/services/sources/context.js");

function tab(name: string, rows: string[][]): GuideTab {
  const cells = rows.flatMap((row, ri) => row.map((text, ci) => ({ a1: `${String.fromCharCode(65 + ci)}${ri + 1}`, r: ri + 1, c: ci + 1, text, kind: "text" as const })).filter((c) => c.text));
  return { name, index: 0, cells, merged: [], images: [] };
}

const OLD = tab("OLD — Rail Detail", [
  ["Status", "Date", "Route", "Depart", "Arrive", "Train", "Car / seat", "Reso #", "Cost", "Notes", "Boarding readiness (separate from booking status)"],
  ["TRUE", "Oct 8", "Alpha → Beta", "10:26", "12:09", "NOZOMI 99", "Car 9, 1A/1B", "11111", "¥1", "Kept booking.", "PENDING — collect at Alpha Oct 6"],
  ["TRUE", "Oct 14", "Beta → Gamma", "08:07", "09:00", "YAMABIKO 21", "Car 10, 4A/4B", "22222", "¥2", "Ken + Larisa only. Bring the old card and reservation #22222.", "PENDING — collect at Alpha Oct 6"],
  ["TRUE", "Oct 14", "Gamma → Beta", "16:58", "17:48", "YAMABIKO 22", "Car 10, 2A/2B", "33333", "¥3", "Ken + Larisa only.", ""],
  ["TRUE", "Oct 29", "Delta → Airport", "13:30", "14:50", "HARUKA 31", "Car 1", "44444", "¥4", "", ""],
  ["TRUE", "Oct 30", "Airport → Home", "09:00", "10:00", "HARUKA 32", "Car 2", "55555", "¥5", "", ""],
]);
const REBOOK = tab("REBOOK — ACTION", [
  ["RAIL REBOOK — ACTION CHECKLIST"],
  ["KEEP OCT 8: NOZOMI 99. DO NOT CANCEL."],
  ["For every row below: CANCEL the old reservation, then REBOOK."],
  ["Cancelled", "Rebooked", "Date", "FROM", "TO", "Train", "Depart", "Arrive", "Class", "Seats", "OLD res #", "Receipt", "NEW res #", "NEW seats", "Notes"],
  ["TRUE", "TRUE", "Oct 14", "Beta", "Gamma", "YAMABIKO 21", "08:07", "09:00", "GranClass", "Car 10 — 4A/4B", "22222", "R1", "", "", ""],
  ["TRUE", "TRUE", "Oct 14", "Gamma", "Beta", "Yamabiko 22", "16:58", "17:48", "GranClass", "Car 10 — 2A/2B", "33333", "R2", "77777", "Car 7 — 5A/5B", ""],
  ["TRUE", "FALSE", "Oct 29", "Delta", "Airport", "HARUKA 31", "13:30", "14:50", "Green", "Car 1", "44444", "R3", "", "", ""],
  ["FALSE", "FALSE", "Oct 30", "Airport", "Home", "HARUKA 32", "09:00", "10:00", "Green", "Car 2", "55555", "R4", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["HOW TO CANCEL + REBOOK EACH RESERVATION"],
]);

const rail = () => applyRebooks(railRows(OLD, 2026)!, rebookRows(REBOOK, 2026)!);
const byTrain = (t: string) => rail().find((r) => r.cols["Train"]?.text === t)!;

describe("a rebooking tab", () => {
  it("is recognized by its header (cancelled, rebooked, date, train) even below a title — and isn't taken for a train tab", () => {
    expect(railRows(REBOOK, 2026)).toBeNull();
    const rows = rebookRows(REBOOK, 2026)!;
    expect(rows.map((r) => `${r.date} ${r.train} ${r.cancelled}/${r.rebooked}`)).toEqual([
      "2026-10-14 YAMABIKO 21 true/true", "2026-10-14 Yamabiko 22 true/true", "2026-10-29 HARUKA 31 true/false", "2026-10-30 HARUKA 32 false/false",
    ]);
    expect(rebookRows(OLD, 2026)).toBeNull();
  });

  it("leaves a train it doesn't list exactly as it was (Oct 8's kept booking)", () => {
    const r = byTrain("NOZOMI 99");
    expect(r.rebook).toBeUndefined();
    expect(r.cols["Reso #"].text).toBe("11111");
    expect(r.cols["Car / seat"].text).toBe("Car 9, 1A/1B");
  });

  it("never says a cancelled booking's number, seats, cost, notes or boarding note as current", () => {
    const r = byTrain("YAMABIKO 21");
    expect(r.rebook).toMatchObject({ cancelled: true, rebooked: true, oldRes: "22222", newRes: null, newSeats: null });
    expect(Object.keys(r.cols).filter((k) => /^(reso|reservation|car|cost|notes$)|readiness/i.test(k))).toEqual([]);
    expect(r.cols["Cancelled booking — reservation #"].text).toBe("22222");
    expect(r.cols["Cancelled booking — seats"].text).toBe("Car 10, 4A/4B");
    expect(r.cols["Cancelled booking — notes"].text).toMatch(/old card/);
    expect(r.cols["Cancelled booking — boarding note"].text).toMatch(/collect at Alpha/);
  });

  it("keeps who it's for, which is about the trip, not the booking", () => {
    expect(byTrain("YAMABIKO 21").cols["Who"].text).toBe("Ken + Larisa only");
  });

  it("shows the new number and seats once they're in the sheet, cited to the rebooking tab (train names in any case)", () => {
    const r = byTrain("YAMABIKO 22");
    expect(r.cols["Reservation #"]).toMatchObject({ text: "77777", tab: "REBOOK — ACTION" });
    expect(r.cols["Car / seat"]).toMatchObject({ text: "Car 7 — 5A/5B", tab: "REBOOK — ACTION" });
    expect(r.cols["Cancelled booking — reservation #"].text).toBe("33333");
  });

  it("says a cancelled, not-yet-rebooked train has no booking; a not-yet-cancelled one keeps its booking", () => {
    const cancelledOnly = byTrain("HARUKA 31");
    expect(cancelledOnly.rebook).toMatchObject({ cancelled: true, rebooked: false });
    expect(cancelledOnly.cols["Reso #"]).toBeUndefined();
    const notYet = byTrain("HARUKA 32");
    expect(notYet.rebook).toMatchObject({ cancelled: false, rebooked: false });
    expect(notYet.cols["Reso #"].text).toBe("55555");
  });

  it("tells Scout, train by train, what's cancelled, what's rebooked, and never to give the old details as current", () => {
    const view = { meta: { id: "s", name: "Rail sheet", owner: "Ken", authorship: null, about: null, title: "Rail", readAt: new Date().toISOString(), lastTriedAt: null, lastError: null },
      rail: rail(), checklists: [], otherTabs: [REBOOK], differs: [] } as any;
    const lines = sourceDocuments([view])[0].lines.map((l) => l.text);
    const say = (train: string) => lines.find((l) => l.startsWith("REBOOKING") && l.includes(train))!;
    expect(say("YAMABIKO 21")).toMatch(/reservation #22222\) is CANCELLED and the same train is REBOOKED on the new card\. New reservation #: not in the sheet\. New seats: not in the sheet\. Never give/);
    expect(say("Yamabiko 22") ?? say("YAMABIKO 22")).toMatch(/New reservation #: 77777\. New seats: Car 7 — 5A\/5B/);
    expect(say("HARUKA 31")).toMatch(/CANCELLED and NOT rebooked yet — there is no booking/);
    expect(say("HARUKA 32")).toMatch(/still to be cancelled and rebooked — until then the booking in the row above stands/);
    // a paper-ticket booking with no new number in the sheet: not a to-do (Ken, Oct 8: tickets picked up before cancelling)
    const paperRail = rail().map((r) => (r.cols["Train"]?.text === "YAMABIKO 21" ? { ...r, cols: { ...r.cols, "Ticket / IC": { text: "Paper tickets; JR-West pickup", a1: "L3" } } } : r));
    const paperLines = sourceDocuments([{ ...view, rail: paperRail }])[0].lines.map((l) => l.text);
    expect(paperLines.find((l) => l.startsWith("REBOOKING") && l.includes("YAMABIKO 21"))).toMatch(/car and seats are printed on the tickets; don't suggest finding or adding it/);
    // the rebooking tab itself stays readable for Scout, whole
    expect(lines.some((l) => /REBOOK — ACTION tab, row 2 — KEEP OCT 8/.test(l))).toBe(true);
  });
});
