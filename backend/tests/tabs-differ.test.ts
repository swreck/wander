/**
 * When her tabs disagree about the same thing, both lines say so and nothing settles it (round 6: Home
 * showed "~12:30 Board reserved HARUKA" as the plan while her Itinerary note says 1:30–2:00p).
 * Pure logic on in-memory lines; no database.
 */
import { describe, it, expect } from "vitest";
import { markTabsDiffer, distinctWords, unwrapSearchLink } from "../src/services/guide/importSnapshot.js";

describe("her pasted map links", () => {
  it("a Google search of a Maps address becomes the Maps address", () => {
    expect(unwrapSearchLink("https://www.google.com/search?q=https://maps.apple.com/%3Fq%3DFour%2BSeasons%2BHotel%2BKyoto"))
      .toBe("https://maps.apple.com/?q=Four+Seasons+Hotel+Kyoto");
  });
  it("a link encoded twice (Gemini's, in her Day 2 tab) becomes a working Maps search (round 9)", () => {
    expect(unwrapSearchLink("https://www.google.com/search?q=https://maps.apple.com/%253Fq%253DOchanomizu%252BOrigami%252BKaikan&utm_source=gemini"))
      .toBe("https://maps.apple.com/?q=Ochanomizu+Origami+Kaikan");
  });
  it("any other link is left as it is", () => {
    expect(unwrapSearchLink("https://maps.apple.com/?q=Montbell+Ginza")).toBe("https://maps.apple.com/?q=Montbell+Ginza");
    expect(unwrapSearchLink("https://www.google.com/search?q=ensou+shigaraki")).toBe("https://www.google.com/search?q=ensou+shigaraki");
    expect(unwrapSearchLink("not a url")).toBe("not a url");
  });
});

const line = (o: any) => ({ date: "2030-01-29", time: null, endTime: null, kind: "plan", title: "", detail: null, place: null,
  confirmation: null, forWhom: null, source: "Japan-Oct26-Itinerary (row 67)", sourceRef: "x", city: null, ...o });

describe("distinct words", () => {
  it("keeps the words that name one thing", () => {
    expect(distinctWords("Board reserved HARUKA")).toEqual(["haruka"]);
    expect(distinctWords("Café ENSOU lunch")).toEqual(["ensou"]);
    expect(distinctWords("Taxi back to Four Seasons")).toEqual(["four", "seasons"]);
  });
});

describe("tabs differ", () => {
  it("marks the Haruka on both lines, quoting each other", () => {
    const block = line({ kind: "block", time: "12:30", timeText: "~12:30–1:00", title: "Board reserved HARUKA", source: "Kyoto Thu, 0129 (Flight Home) · Day 5" });
    const flight = line({ kind: "flight", time: "18:35", title: "United UA34 · Kansai (KIX) → San Francisco (SFO)",
      detail: "Larisa's note: \"6:30p flight - travel day\"\nLarisa's travel note: 1:30-2:00p Haruka from Kyoto to KIX (if stop at Rikuro need to modify)" });
    markTabsDiffer([block, flight] as any);
    expect(block.detail).toContain('Tabs differ: her Itinerary tab says "1:30-2:00p Haruka from Kyoto to KIX');
    expect(flight.detail).toContain('Tabs differ: her Kyoto Thu, 0129 (Flight Home) tab has "Board reserved HARUKA" at ~12:30–1:00.');
  });

  it("marks a place listed at two different times (Cafe Ensou: lunch in the day tab, 8 PM in Dining Resos)", () => {
    const block = line({ date: "2030-01-28", kind: "block", time: "13:00", timeText: "1:00–2:30 PM", title: "Café ENSOU lunch", source: "Kyoto Wed, 0128 Shigaraki · Day 4" });
    const meal = line({ date: "2030-01-28", kind: "meal", time: "20:00", title: "Cafe Ensou", source: "Dining Resos (row 30)" });
    markTabsDiffer([block, meal] as any);
    expect(block.detail).toContain('Tabs differ: her Dining Resos tab has "Cafe Ensou" at 8:00 PM.');
    expect(meal.detail).toContain('Tabs differ: her Kyoto Wed, 0128 Shigaraki tab has "Café ENSOU lunch" at 1:00–2:30 PM.');
  });

  it("leaves agreeing lines alone (Hassun at 6 PM in both, a star rating isn't a time)", () => {
    const block = line({ date: "2030-01-26", kind: "block", time: "18:00", title: "Hassun — Michelin 1★ kappo-style Japanese", source: "Kyoto Mon, 1026 · Day 2" });
    const meal = line({ date: "2030-01-26", kind: "meal", time: "18:00", title: "Hassun", detail: "(Michelin 1 star - Japanese Kappo Style) · Kyoto seasonal", source: "Dining Resos (row 20)" });
    markTabsDiffer([block, meal] as any);
    expect(block.detail).toBeNull();
    expect(meal.detail).not.toContain("Tabs differ");
  });

  it("never compares a plan line with a hotel's check-out time", () => {
    const block = line({ kind: "block", time: "18:45", title: "Return Four Seasons", source: "Kyoto Wed · Day 4" });
    const checkout = line({ kind: "checkout", time: "12:00", title: "Check out · Four Seasons Hotel Kyoto" });
    markTabsDiffer([block, checkout] as any);
    expect(block.detail).toBeNull();
  });

  it("only compares lines on the same day", () => {
    const block = line({ kind: "block", time: "12:30", title: "Board reserved HARUKA", source: "Kyoto Thu · Day 5" });
    const other = line({ date: "2030-01-06", kind: "travel", title: "Haruka to Shin-Osaka", time: "18:15" });
    markTabsDiffer([block, other] as any);
    expect(block.detail).toBeNull();
  });

  it("never reads Wander's own notes as hers (no chain reaction)", () => {
    // Round 6: after Café ENSOU was marked, "Depart Shigaraki" matched the tab name inside that mark
    const lunch = line({ date: "2030-01-28", kind: "block", time: "13:00", timeText: "1:00–2:30 PM", title: "Café ENSOU lunch", source: "Kyoto Wed, 0128 Shigaraki · Day 4" });
    const depart = line({ date: "2030-01-28", kind: "block", time: "17:30", timeText: "~5:30", title: "Depart Shigaraki", source: "Kyoto Wed, 0128 Shigaraki · Day 4" });
    const meal = line({ date: "2030-01-28", kind: "meal", time: "20:00", title: "Cafe Ensou", source: "Dining Resos (row 30)" });
    markTabsDiffer([lunch, depart, meal] as any);
    expect(depart.detail).toBeNull();
    expect((meal.detail!.match(/Tabs differ/g) || []).length).toBe(1);
  });

  it("a booked place her day tab puts in another neighbourhood than its address says (Ginza vs Yaesu)", () => {
    const block = line({ date: "2030-01-15", kind: "block", time: "18:30", title: "DINNER RESERVATION – Yakiniku Yazawa Tokyo (Ginza)", source: "Tokyo Day 1 Ginza · Day 1" });
    const meal = line({ date: "2030-01-15", kind: "meal", time: "18:30", title: "Yakiniku Yazawa Tokyo", source: "Dining Resos (row 5)",
      detail: "(Wagu Omakase)\nAddress: Yakiniku Yazawa Tokyo · Toin Yaesu Building 1F, 5-10 Yaesu 1-chome, Chuo-ku, Tokyo 103-0028" });
    markTabsDiffer([block, meal] as any);
    expect(block.detail).toContain("Tabs differ: her Tokyo Day 1 Ginza tab puts it in Ginza; her Dining Resos address is");
    expect(meal.detail).toContain("Tabs differ: her Tokyo Day 1 Ginza tab puts it in Ginza");
  });

  it("no note when the address does name the neighbourhood (Shibuya, Ebisu in Yebisu)", () => {
    const b1 = line({ date: "2030-01-16", kind: "block", time: "19:00", title: "DINNER RESERVATION – UNE IMMERSION (Shibuya/Hatsudai)", source: "Tokyo Day 2 · Day 2" });
    const m1 = line({ date: "2030-01-16", kind: "meal", time: "19:00", title: "Une Immersion", source: "Dining Resos (row 8)", detail: "Address: UNE IMMERSION · 1-28-8 Hommachi, Shibuya-ku, Tokyo" });
    const b2 = line({ date: "2030-01-17", kind: "block", time: "18:00", title: "DINNER RESERVATION – Gastronomy \"Joël Robuchon\" (Ebisu)", source: "Tokyo Day 3 · Day 3" });
    const m2 = line({ date: "2030-01-17", kind: "meal", time: "18:00", title: "LeTable de Joel Robuchon - 1F", source: "Dining Resos (row 11)", detail: "Address: Château Restaurant Joël Robuchon · Yebisu Garden Place 1-13-1" });
    markTabsDiffer([b1, m1, b2, m2] as any);
    expect(b1.detail).toBeNull();
    expect(b2.detail).toBeNull();
  });

  it("saying it twice adds one note, not two", () => {
    const block = line({ kind: "block", time: "12:30", title: "Board reserved HARUKA", source: "Kyoto Thu · Day 5" });
    const flight = line({ kind: "flight", time: "18:35", title: "UA34", detail: "Larisa's travel note: 1:30-2:00p Haruka from Kyoto to KIX" });
    markTabsDiffer([block, flight] as any);
    markTabsDiffer([block, flight] as any);
    expect((block.detail!.match(/Tabs differ/g) || []).length).toBe(1);
  });
});
