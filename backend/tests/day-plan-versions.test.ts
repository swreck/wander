/**
 * A day planned twice in one tab (Oct 2: Larisa added a revised Day 2 below the old one and kept the old): Wander
 * follows one the same way every time — the one new since its last copy; with none, the one lower in the tab — and
 * says so. Synthetic tabs; no database.
 */
import { describe, it, expect } from "vitest";
import { dayPlanVersions, planTableVersions } from "../src/services/guide/importSnapshot.js";

const cell = (a1: string, text: string) => ({ a1, r: Number(a1.slice(1)), c: a1.charCodeAt(0) - 64, text, kind: "text" as const });
const OLD = "🏺 Day 2: The Craft, Kitchenware & Tech Metro Corridor\n• 9:00 AM – 11:30 AM: Kappabashi\n• 11:45 AM – 12:45 PM: Origami Kaikan\n• 1:00 PM – 2:00 PM: LIGHT LUNCH";
const NEW = "🏺 Day 2: The Craft, Kitchenware, Tech & Ikebana Route\n• 9:00 AM – 11:15 AM: Kappabashi\n• 11:25 AM – 12:10 PM: Origami Kaikan\n• 12:15 PM – 1:30 PM: Akihabara";
const tab = (cells: ReturnType<typeof cell>[]) => ({ name: "Tokyo Day 2", index: 0, cells, images: [] } as any);

describe("a day planned twice in one tab", () => {
  it("follows the version new since Wander's last copy, and says which", () => {
    const now = tab([cell("A44", OLD), cell("A46", NEW)]);
    const before = tab([cell("A44", OLD)]);
    const v = dayPlanVersions(now, before, []);
    expect([...v.superseded]).toEqual(["A44"]);
    expect(v.notes.get("2")).toMatchObject({ current: "A46", earlier: ["A44"] });
    expect(v.notes.get("2")!.note).toBe("Her tab has 2 versions of this day's plan: Wander follows A46 (the one she added most recently); A44 has other times — worth checking with Larisa which is current.");
  });

  it("re-reading the same copy keeps the choice and its reason (it doesn't flip to \"lower in the tab\")", () => {
    const now = tab([cell("A44", OLD), cell("A46", NEW)]);
    const kept = [{ tab: "Tokyo Day 2", day: "2", current: "A46", earlier: ["A44"], why: "the one she added most recently" }];
    const v = dayPlanVersions(now, now, kept);
    expect(v.notes.get("2")).toMatchObject({ current: "A46", why: "the one she added most recently" });
  });

  it("…but not once she changes the versions: the new rule applies afresh", () => {
    const later = tab([cell("A44", OLD), cell("A46", NEW), cell("A48", NEW.replace("Ikebana Route", "Final Route"))]);
    const before = tab([cell("A44", OLD), cell("A46", NEW)]);
    const kept = [{ tab: "Tokyo Day 2", day: "2", current: "A46", earlier: ["A44"], why: "the one she added most recently" }];
    const v = dayPlanVersions(later, before, kept);
    expect(v.notes.get("2")).toMatchObject({ current: "A48", why: "the one she added most recently" });
    expect([...v.superseded].sort()).toEqual(["A44", "A46"]);
  });

  it("the new one first in the tab is still the one followed", () => {
    const now = tab([cell("A44", NEW), cell("A46", OLD)]);
    const before = tab([cell("A46", OLD)]);
    expect(dayPlanVersions(now, before).notes.get("2")?.current).toBe("A44");
  });

  it("with no last copy to tell by: the one lower in the tab, said so", () => {
    const v = dayPlanVersions(tab([cell("A44", OLD), cell("A46", NEW)]), undefined);
    expect(v.notes.get("2")?.current).toBe("A46");
    expect(v.notes.get("2")?.note).toContain("(the one lower in the tab)");
  });

  it("one plan per day: nothing set aside", () => {
    const v = dayPlanVersions(tab([cell("A44", OLD), cell("A50", NEW.replace("Day 2", "Day 3"))]), undefined);
    expect(v.superseded.size).toBe(0);
    expect(v.notes.size).toBe(0);
  });

  it("a cell that only mentions the day (a stop list, no times) isn't a version", () => {
    const v = dayPlanVersions(tab([cell("A40", "Day 2: stops — Kappabashi, Origami Kaikan"), cell("A44", OLD)]), undefined);
    expect(v.superseded.size).toBe(0);
  });
});

// A plan written as a TABLE (Oct 26 copy: her Shigaraki tab kept its old plan in A–B and added a new one beside it in
// G–I, "Time | You & Julie | Ken & Andy"; Wander read both into the day)
describe("a day planned as a table", () => {
  const days = new Set(["2026-10-27", "2026-10-28", "2026-10-29"]);
  const people = new Set(["larisa", "ken", "andy", "julie"]);
  const oldTable = [
    cell("A48", "Wednesday 10/28 — Shigaraki"), cell("A50", "Time"), cell("B50", "Plan"),
    cell("A51", "8:00"), cell("B51", "Depart by private van"),
    cell("A52", "10:35–11:35"), cell("B52", "Maruni Toryo"),
    cell("A53", "~5:30"), cell("B53", "Depart Shigaraki"),
  ];
  const newTable = [
    cell("G50", "Wednesday, October 28 — Shigaraki itinerary"),
    cell("G52", "Time"), cell("H52", "You & Julie"), cell("I52", "Ken & Andy"),
    cell("G53", "8:00–9:15 AM"), cell("H53", "Drive to Shigaraki"), cell("I53", "Together"),
    cell("G54", "9:45–10:45"), cell("H54", "Maruni Toryo — tools and materials"), cell("I54", "Driver takes them to MIHO Museum"),
    cell("G55", "12:30–1:00"), cell("H55", "Driver collects you"), cell("I55", "Rejoin you and Julie"),
    cell("G56", "17:00"), cell("H56", "Depart Shigaraki for Kyoto"), cell("I56", "Together"),
  ];
  const t = (cells: ReturnType<typeof cell>[]) => ({ name: "Kyoto Wed, 1028 Shigaraki", index: 0, cells, images: [] } as any);

  it("two tables for the same date: follows the one new since the last copy, leaves the other out, and says so", () => {
    const v = planTableVersions(t([...oldTable, ...newTable]), t(oldTable), [], days, people, "Larisa");
    expect([...v.superseded].sort()).toEqual(oldTable.map((c) => c.a1).sort());
    expect(v.notes.get("2026-10-28")).toMatchObject({ current: "G50", earlier: ["A48"], why: "the one she added most recently" });
    expect(v.notes.get("2026-10-28")!.note).toMatch(/^Her tab has 2 versions of this day's plan: Wander follows the one at G50/);
  });
  it("re-reading the same copy keeps the choice", () => {
    const kept = [{ tab: "Kyoto Wed, 1028 Shigaraki", day: "2026-10-28", current: "G50", earlier: ["A48"], why: "the one she added most recently" }];
    const both = t([...oldTable, ...newTable]);
    expect(planTableVersions(both, both, kept, days, people, "Larisa").notes.get("2026-10-28")).toMatchObject({ current: "G50", why: "the one she added most recently" });
  });
  it("a column per couple: each couple's own line; 'Together' is everyone's; her 'you' in their column is Larisa", () => {
    const v = planTableVersions(t([...oldTable, ...newTable]), t(oldTable), [], days, people, "Larisa");
    expect(v.rowLines.get(53)!.lines).toEqual(["8:00–9:15 AM | Everyone: Drive to Shigaraki"]);
    expect(v.rowLines.get(54)!.lines).toEqual(["9:45–10:45 | You & Julie: Maruni Toryo — tools and materials", "9:45–10:45 | Ken & Andy: Driver takes them to MIHO Museum"]);
    expect(v.rowLines.get(55)!.lines).toEqual(["12:30–1:00 | You & Julie: Driver collects you", "12:30–1:00 | Ken & Andy: Rejoin Larisa and Julie"]);
  });
  it("tables for different dates aren't versions of each other; one table alone is just read", () => {
    const other = oldTable.map((c) => (c.a1 === "A48" ? cell("A48", "Tuesday 10/27 — Kyoto") : c));
    expect(planTableVersions(t([...other, ...newTable]), t(other), [], days, people, "Larisa").superseded.size).toBe(0);
    expect(planTableVersions(t(oldTable), undefined, [], days, people, "Larisa").superseded.size).toBe(0);
  });
});
