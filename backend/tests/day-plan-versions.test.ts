/**
 * A day planned twice in one tab (Oct 2: Larisa added a revised Day 2 below the old one and kept the old): Wander
 * follows one the same way every time — the one new since its last copy; with none, the one lower in the tab — and
 * says so. Synthetic tabs; no database.
 */
import { describe, it, expect } from "vitest";
import { dayPlanVersions } from "../src/services/guide/importSnapshot.js";

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
