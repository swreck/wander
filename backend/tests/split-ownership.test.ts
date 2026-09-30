/**
 * While the group is split, a plan line with no name on it belongs to nobody we can name. Scout once
 * told Julie "you're on the other track: … then Maruni Toryo" — her tab never says whose it is.
 * (Pure logic; no database.)
 */
import { describe, it, expect } from "vitest";
import { ownerlessInSplit } from "../src/services/guide/scoutContext.js";

const line = (id: string, time: string | null, endTime: string | null, forWhom: string | null = null, kind = "block") =>
  ({ id, kind, time, endTime, forWhom });

// Her Oct 28 Shigaraki tab, as read
const oct28 = [
  line("van", "08:00", null),
  line("orientation", "09:15", "10:00"),
  line("split", "10:00", null),
  line("ceramics", "10:15", "10:35", "Larisa & Julie"),
  line("maruni", "10:35", "11:35"),
  line("woodfire", "11:35", "12:35"),
  line("miho", "10:15", "12:35", "Ken & Andy"),
  line("lunch", "13:00", "14:30"),
  line("dinner", "20:00", null),
];

describe("lines nobody's name is on during a split", () => {
  it("marks the unlabeled lines inside the split, and only those", () => {
    const none = ownerlessInSplit(oct28);
    expect([...none].sort()).toEqual(["maruni", "woodfire"]);
  });

  it("leaves lines before the split and after everyone is back together alone", () => {
    const none = ownerlessInSplit(oct28);
    for (const id of ["van", "orientation", "split", "lunch", "dinner"]) expect(none.has(id)).toBe(false);
  });

  it("never marks a line that names its people", () => {
    const none = ownerlessInSplit(oct28);
    expect(none.has("ceramics")).toBe(false);
    expect(none.has("miho")).toBe(false);
  });

  it("finds nothing on a day with no split", () => {
    expect(ownerlessInSplit([line("a", "09:00", "10:00"), line("b", "10:00", "11:00")]).size).toBe(0);
  });

  it("treats 'Everyone' as together, not as a split", () => {
    expect(ownerlessInSplit([line("a", "09:00", "12:00", "Everyone"), line("b", "10:00", "11:00")]).size).toBe(0);
  });

  it("ignores lines that aren't her day plan (an Itinerary meal at the same time)", () => {
    const withMeal = [...oct28, line("meal", "11:00", null, null, "meal")];
    expect(ownerlessInSplit(withMeal).has("meal")).toBe(false);
  });

  it("uses the start time alone when a labeled line has no end", () => {
    const none = ownerlessInSplit([line("x", "10:00", null, "Ken & Andy"), line("y", "10:00", "11:00"), line("z", "10:30", null)]);
    expect(none.size).toBe(0);
  });
});
