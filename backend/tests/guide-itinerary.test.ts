/**
 * GUIDE ITINERARY INTERPRETER TESTS (Sep 2026)
 *
 * Built from small made-up sheets (never real trip data — the repository is public).
 * Pins the faithfulness rules: columns found by header name, Larisa's words kept, times only
 * when stated, SKIP sections left out, undated rows attached, conflicts flagged not resolved.
 */

import { describe, it, expect } from "vitest";
import type { GuideCell, GuideTab } from "../src/services/guide/reader.js";
import { interpretItinerary, parseStatedTimes, cityFromSection, withoutStatedTime, mergeSameMoment } from "../src/services/guide/itinerary.js";
import { parseIdeasTab, tidyItems } from "../src/services/guide/importSnapshot.js";

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
    // Her working notes after the name (Sep 29 copy) — the city is still the city
    expect(cityFromSection("Tokyo (day trip to Mashiko - 1.5 hrs Shinkansen) - ASK KENJI TO INTEGRATE THE 2 TOURS AND FINISH 3:45-4p AT TRAIN)")).toBe("Tokyo");
    expect(cityFromSection("Hakata - NOT AN OVERNIGHT (travel through)")).toBe("Hakata");
    expect(cityFromSection("Karatsu (tour Karatsu - coordinate pu for tour), day trip to Arita)")).toBe("Karatsu");
    expect(cityFromSection("Okayama (day trip to Bizen - 40 min JR train) - WHERE IS BIZEN TOUR STARTING")).toBe("Okayama");
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
    // A time mid-sentence stays in her words; nothing else about the row (which hotel it sat beside) is shown
    const meet = r.items.find((i) => i.title === "Meet the guide 8:30a at the station")!;
    expect(meet.date).toBe("2026-05-02");
    expect(meet.time).toBe("08:30");
    expect(meet.kind).toBe("meeting");
    expect(meet.detail).toBeNull();
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

describe("reading a line the way a traveler reads it", () => {
  it("drops a time only when it opens the line — anywhere else her words stay as written", () => {
    expect(withoutStatedTime("8:30a meet the guide")).toBe("Meet the guide");
    expect(withoutStatedTime("6:30p flight - travel day")).toBe("Flight - travel day");
    expect(withoutStatedTime("Meet the guide 8:30a at the station")).toBe("Meet the guide 8:30a at the station");
    expect(withoutStatedTime("Museum (entry window: 11-11:30a)")).toBe("Museum (entry window: 11-11:30a)");
    expect(withoutStatedTime("Ends: 11:30a hotel/12p station")).toBe("Ends: 11:30a hotel/12p station");
    expect(withoutStatedTime("6:30p")).toBe("6:30p"); // nothing else to say — keep her words
  });

  it("merges two lines about the same moment into one, keeping the fuller wording and both sources", () => {
    const base = { endTime: null, detail: null, place: null, confirmation: null, city: "Kyoto" };
    const merged = mergeSameMoment([
      { ...base, date: "2026-05-03", time: "08:30", kind: "meeting", title: "Meet the Zephyr group", sourceRef: "a", source: "Itinerary · Description (row 5)" },
      { ...base, date: "2026-05-03", time: "08:30", kind: "meeting", title: "Meet the Zephyr group at the North Station lobby", sourceRef: "b", source: "Itinerary · Notes (row 7)" },
      { ...base, date: "2026-05-03", time: "08:30", kind: "plan", title: "Breakfast downstairs", sourceRef: "c", source: "Itinerary · Description (row 6)" },
      { ...base, date: "2026-05-04", time: "08:30", kind: "meeting", title: "Meet the Zephyr group", sourceRef: "d", source: "Itinerary · Description (row 8)" },
    ]);
    expect(merged).toHaveLength(3);
    expect(merged[0].title).toBe("Meet the Zephyr group at the North Station lobby");
    expect(merged[0].source).toBe("Itinerary · Description (row 5) + Itinerary · Notes (row 7)");
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

// ── The last pass over a day's items (made-up trip) ─────────────────────
describe("tidyItems", () => {
  const base = { endTime: null, detail: null, place: null, confirmation: null, forWhom: null, link: null, city: null, timeZone: "Asia/Tokyo", sourceRef: "x" };
  const item = (o: Record<string, unknown>) => ({ ...base, ...o }) as any;

  it("never gives a flight an end time, and uses the departure airport's time zone", () => {
    const items = [item({ date: "2026-05-10", time: "18:35", endTime: "12:30", kind: "flight", title: "KIX - XX12 → SFO", timeZone: "America/Los_Angeles", source: "Itinerary (row 9)" })];
    tidyItems(items, []);
    expect(items[0].endTime).toBeNull();
    expect(items[0].timeZone).toBe("Asia/Tokyo");
  });

  it("folds a day note that is really the flight into the flight, in her words", () => {
    const items = [
      item({ date: "2026-05-10", time: "18:35", kind: "flight", title: "Airline XX12 · Kansai (KIX) → San Francisco (SFO)", source: "Screenshot in Flights" }),
      item({ date: "2026-05-10", time: "18:30", kind: "note", title: "Flight - travel day", source: "Itinerary (row 9)" }),
      item({ date: "2026-05-10", time: "09:00", kind: "note", title: "Pack", source: "Itinerary (row 8)" }),
    ];
    tidyItems(items, []);
    expect(items.map((i) => i.title)).toEqual(["Airline XX12 · Kansai (KIX) → San Francisco (SFO)", "Pack"]);
    expect(items[0].detail).toContain('Larisa\'s note: "Flight - travel day"');
  });

  it("quotes her note exactly as written, time included", () => {
    const items = [
      item({ date: "2026-05-10", time: "18:35", kind: "flight", title: "Airline XX12 · Kansai (KIX) → San Francisco (SFO)", source: "Screenshot in Flights" }),
      item({ date: "2026-05-10", time: "18:30", kind: "note", title: "Flight - travel day", said: "6:30p flight - travel day", source: "Itinerary · Description (row 9)" }),
    ];
    tidyItems(items, []);
    expect(items[0].detail).toContain('Larisa\'s note: "6:30p flight - travel day"');
  });

  it("folds an untimed note on the flight's own row into that flight (and only that one)", () => {
    const items = [
      item({ date: "2026-05-01", time: "10:45", kind: "flight", forWhom: "Pat & Sam", title: "Airline XX35 · SFO → KIX", source: "Itinerary · travel (row 3) + Screenshot in Flights" }),
      item({ date: "2026-05-01", time: null, kind: "note", title: "Part of Star Alliance", source: "Itinerary · Notes (row 3)" }),
      item({ date: "2026-05-01", time: null, kind: "note", title: "Bring snacks", source: "Itinerary · Notes (row 4)" }),
      item({ date: "2026-05-01", time: null, kind: "note", title: "Other tab's row 3", source: "Packing · Notes (row 3)" }),
    ];
    tidyItems(items, []);
    expect(items.map((i) => i.title)).toEqual(["Airline XX35 · SFO → KIX", "Bring snacks", "Other tab's row 3"]);
    expect(items[0].detail).toContain('Larisa\'s note: "Part of Star Alliance"');
  });

  it("leaves a note alone when its time is far from the flight", () => {
    const items = [
      item({ date: "2026-05-10", time: "18:35", kind: "flight", title: "Airline XX12 · KIX → SFO", source: "s" }),
      item({ date: "2026-05-10", time: "10:00", kind: "note", title: "Flight check-in opens online", source: "s" }),
    ];
    tidyItems(items, []);
    expect(items).toHaveLength(2);
  });

  it("drops a row that only repeats a confirmation code already on that day", () => {
    const items = [
      item({ date: "2026-05-01", time: "10:45", kind: "flight", title: "Airline XX35 · SFO → KIX", confirmation: "ABC123", source: "s" }),
      item({ date: "2026-05-01", time: null, kind: "note", title: "confirmation: : ABC123", source: "s" }),
    ];
    tidyItems(items, []);
    expect(items).toHaveLength(1);
  });

  it("keeps an open question open on other days that mention the same trip", () => {
    const items = [item({ date: "2026-05-04", time: null, kind: "plan", title: "day trip to Mashiko", source: "Itinerary (row 20)" })];
    tidyItems(items, [{ name: "Mashiko (ceramics town)", text: "if Julie isn't interested", date: "2026-05-03" }]);
    expect(items[0].detail).toContain("Still open in the Guide: Mashiko (ceramics town) is also marked for Sun, May 3");
  });
});
