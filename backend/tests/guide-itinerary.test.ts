/**
 * GUIDE ITINERARY INTERPRETER TESTS (Sep 2026)
 *
 * Built from small made-up sheets (never real trip data — the repository is public).
 * Pins the faithfulness rules: columns found by header name, Larisa's words kept, times only
 * when stated, SKIP sections left out, undated rows attached, conflicts flagged not resolved.
 */

import { describe, it, expect } from "vitest";
import type { GuideCell, GuideTab } from "../src/services/guide/reader.js";
import { interpretItinerary, parseStatedTimes, cityFromSection } from "../src/services/guide/itinerary.js";
import { parseIdeasTab } from "../src/services/guide/importSnapshot.js";

let letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
letters = [...letters, ...letters.map((l) => "A" + l)];

/** Build a tab from rows of { column letter: value }. Dates as "d:YYYY-MM-DD", times as "t:HH:MM", bold as "b:text". */
function tab(name: string, rows: Record<string, string>[]): GuideTab {
  const cells: GuideCell[] = [];
  rows.forEach((row, i) => {
    for (const [col, raw] of Object.entries(row)) {
      const c = letters.indexOf(col) + 1;
      const r = i + 1;
      const base = { a1: `${col}${r}`, r, c };
      if (raw.startsWith("d:")) cells.push({ ...base, kind: "date", date: raw.slice(2), text: raw.slice(2) });
      else if (raw.startsWith("t:")) cells.push({ ...base, kind: "time", time: raw.slice(2), text: raw.slice(2) });
      else if (raw.startsWith("b:")) cells.push({ ...base, kind: "text", text: raw.slice(2), bold: true });
      else cells.push({ ...base, kind: "text", text: raw });
    }
  });
  return { name, index: 0, cells, merged: [], images: [] };
}

// Header like the real sheet, with an extra inserted column ("Daily Rate") to prove header-driven parsing
const HEADER = {
  C: "b:Date", D: "b:Chk Out", E: "b:Nights", F: "b:Description", G: "b:From", H: "b:To", N: "b:Time", O: "b:To", P: "b:Time",
  Q: "b:Total", T: "b:Hotel (Daily Rate)", U: "Daily Rate", X: "b:cancellation date", Y: "b:Notes",
};

const SHEET = tab("My Trip Itinerary", [
  HEADER,
  { C: "b:Home Town" },
  { C: "d:2026-05-01", F: "We depart", G: "SFO - UA99", N: "t:10:45", O: "Osaka", P: "t:14:50", Q: "12h" },
  { F: "confirmation: : ABC123" },
  { C: "b:Somewhere Far - SKIP (too much travel)" },
  { C: "d:2025-12-05", T: "Floathouse" },
  { C: "b:Kyoto (day trip to Nara)" },
  { C: "d:2026-05-02", D: "d:2026-05-05", E: "3", T: "Hotel Alpha (chk in 3p, chk out 12p)", U: "400", X: "d:2026-04-28", Y: "Meet the guide 8:30a at the station" },
  { C: "d:2026-05-02", F: "Arrive -> travel to hotel", G: "Osaka", N: "6:15 or later", O: "Kyoto", P: "7ish" },
  { F: "Cheesecake shop" },
  { C: "d:2026-05-03", F: "Temple tour - entry window: 11-11:30a" },
  { C: "d:2026-05-04", D: "d:2026-05-06", E: "2", T: "Hotel Beta" },
  { C: "d:2026-05-05", T: "Hotel Gamma" },
  { C: "Total", F: "ignored" },
  { C: "d:2030-01-01", F: "after the totals — ignored" },
]);

describe("parseStatedTimes", () => {
  it("reads times only when stated with a.m./p.m.", () => {
    expect(parseStatedTimes("8:30a meet Backroads").start).toBe("08:30");
    expect(parseStatedTimes("~3p").start).toBe("15:00");
    expect(parseStatedTimes("6:30p flight").start).toBe("18:30");
    expect(parseStatedTimes("12p Kyoto station").start).toBe("12:00");
    expect(parseStatedTimes("entry window: 11-11:30a")).toEqual({ start: "11:00", end: "11:30" });
  });
  it("never guesses", () => {
    expect(parseStatedTimes("6:15 or later").start).toBeNull();
    expect(parseStatedTimes("7ish").start).toBeNull();
    expect(parseStatedTimes("day 3 - TBD").start).toBeNull();
  });
});

describe("cityFromSection", () => {
  it("drops the parenthetical detail and reads Backroads legs", () => {
    expect(cityFromSection("Karatsu (tour Karatsu, day trip to Arita)")).toBe("Karatsu");
    expect(cityFromSection("Backroads - Tokyo->Nikko (Day 1-4)")).toBe("Nikko");
    expect(cityFromSection("Backroads - Kyoto (Day 6-8)")).toBe("Kyoto");
    expect(cityFromSection("Kyoto ")).toBe("Kyoto");
  });
});

describe("interpretItinerary", () => {
  const r = interpretItinerary([tab("Actions", [{ A: "Actions" }]), SHEET])!;

  it("finds the itinerary tab by its headers, not its name", () => {
    expect(r.tabName).toBe("My Trip Itinerary");
  });

  it("leaves out sections Larisa marked SKIP, and says so", () => {
    expect(r.cityOrder).toEqual(["Home Town", "Kyoto"]);
    expect(r.skippedSections.map((s) => s.title)[0]).toMatch(/SKIP/);
    expect(r.stays.some((s) => s.hotel === "Floathouse")).toBe(false);
  });

  it("stops at the totals row", () => {
    expect(r.lastDate).toBe("2026-05-06");
    expect(r.items.some((i) => i.title.includes("ignored"))).toBe(false);
  });

  it("reads stays by header name even with an inserted column", () => {
    const alpha = r.stays.find((s) => s.hotel.startsWith("Hotel Alpha"))!;
    expect(alpha.checkIn).toBe("2026-05-02");
    expect(alpha.checkOut).toBe("2026-05-05");
    expect(alpha.cancellationDate).toBe("2026-04-28");
    expect(alpha.notes).toEqual(["Meet the guide 8:30a at the station"]);
  });

  it("keeps a flight with its stated times", () => {
    const f = r.items.find((i) => i.kind === "flight")!;
    expect(f.title).toBe("SFO - UA99 → Osaka");
    expect(f.time).toBe("10:45");
    expect(f.endTime).toBe("14:50");
  });

  it("attaches an undated row to the dated row above it", () => {
    const conf = r.items.find((i) => i.confirmation === "ABC123")!;
    expect(conf.date).toBe("2026-05-01");
    const shop = r.items.find((i) => i.title === "Cheesecake shop")!;
    expect(shop.date).toBe("2026-05-02");
  });

  it("keeps approximate times as words, never guessing", () => {
    const leg = r.items.find((i) => i.title === "Osaka → Kyoto")!;
    expect(leg.time).toBeNull();
    expect(leg.detail).toContain("6:15 or later");
    expect(leg.detail).toContain("7ish");
  });

  it("turns the Notes column into a timed note on that date", () => {
    const meet = r.items.find((i) => i.title === "Meet the guide 8:30a at the station")!;
    expect(meet.date).toBe("2026-05-02");
    expect(meet.time).toBe("08:30");
    expect(meet.kind).toBe("meeting");
  });

  it("reads an entry window from the description", () => {
    const tour = r.items.find((i) => i.title.startsWith("Temple tour"))!;
    expect(tour.time).toBe("11:00");
    expect(tour.endTime).toBe("11:30");
  });

  it("makes a cancellation-date column a deadline", () => {
    const d = r.items.find((i) => i.kind === "deadline")!;
    expect(d.date).toBe("2026-04-28");
    expect(d.title).toContain("Hotel Alpha");
  });

  it("flags two hotels on the same night instead of choosing", () => {
    expect(r.warnings.some((w) => w.includes("2026-05-04") && w.includes("Hotel Alpha") && w.includes("Hotel Beta"))).toBe(true);
  });

  it("says plainly when a stay has no check-out date", () => {
    const gamma = r.stays.find((s) => s.hotel === "Hotel Gamma")!;
    expect(gamma.checkOut).toBe(r.lastDate);
    expect(r.warnings.some((w) => w.startsWith("Hotel Gamma: the Guide gives no check-out date"))).toBe(true);
  });

  it("returns null when there is no itinerary tab", () => {
    expect(interpretItinerary([tab("Notes", [{ A: "hello" }])])).toBeNull();
  });
});

describe("Activities tab date marks", () => {
  const ACTIVITIES = tab("Activities Template", [
    { A: "b:Julie", B: "b:Andy", C: "b:Larisa", D: "b:Ken", E: "b:Kyoto - Activities", H: "b:Comment", J: "b:5/2/2026 (travel day)", K: "b:Day 1: 5/3/2026" },
    { A: "X", F: "Pottery town", H: "Day trip", J: "X, if Julie isn't interested", K: "X" },
    { C: "X", F: "Tea house", K: "maybe" },
  ]);

  it("puts an idea on a day only for a plain mark; a mark with words stays a maybe, in Larisa's words", () => {
    const ideas = parseIdeasTab([ACTIVITIES], "2026");
    const pottery = ideas.find((i) => i.name === "Pottery town")!;
    expect(pottery.city).toBe("Kyoto");
    expect(pottery.interested).toEqual(["Julie"]);
    expect(pottery.dates).toEqual(["2026-05-03"]);
    expect(pottery.marks).toContainEqual({ date: "2026-05-02", text: "X, if Julie isn't interested", firm: false });
    expect(pottery.dateNotes).toEqual(["05/02: X, if Julie isn't interested"]);
    const tea = ideas.find((i) => i.name === "Tea house")!;
    expect(tea.dates).toEqual([]);
    expect(tea.marks).toEqual([{ date: "2026-05-03", text: "maybe", firm: false }]);
  });
});
