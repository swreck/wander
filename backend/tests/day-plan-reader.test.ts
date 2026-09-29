/**
 * Larisa's day-plan tabs are read by a model, then CHECKED against her text (dayPlanReader.ts): nothing
 * that isn't in her tab reaches a day screen or Scout. Made-up tab text below.
 */
import { describe, it, expect } from "vitest";
import { verifyAgainstTab, looksLikeDayPlan, type DayPlanReading } from "../src/services/guide/dayPlanReader.js";

const TAB = `Day 2: Monday 5/4 — Riverside, Market & Dinner
Time | Plan
07:45:00 | Leave the inn
~8:30–9:15 | Bamboo Forest
11:30 AM–1:00 PM | Tofu lunch — ideally Shoraku
10:15–10:35 | You + June: pottery stop
~10:15–12:35 | Kip + Abe: Hill Museum
Evening | Dinner at the inn — kaiseki`;

const days = new Set(["2026-05-03", "2026-05-04", "2026-05-05"]);
const block = (o: Record<string, unknown>) => ({ timeText: null, who: null, start: null, end: null, approx: false, kind: "activity", choices: [], notes: null, ...o }) as any;

describe("verifyAgainstTab — only her words get through", () => {
  it("keeps blocks whose words are in the tab, with her time as written", () => {
    const r: DayPlanReading = { plans: [{ heading: "Day 2: Monday 5/4 — Riverside, Market & Dinner", date: "2026-05-04", matchedDate: null, matchReason: null, blocks: [
      block({ timeText: "~8:30–9:15", start: "08:30", end: "09:15", approx: true, label: "Bamboo Forest", quote: "~8:30–9:15 | Bamboo Forest" }),
    ] }] };
    const { reading, dropped } = verifyAgainstTab(r, TAB, days);
    expect(dropped).toBe(0);
    expect(reading.plans[0].blocks[0].timeText).toBe("~8:30–9:15");
  });

  it("drops a block the tab doesn't say (an invented stop)", () => {
    const r: DayPlanReading = { plans: [{ heading: "", date: "2026-05-04", matchedDate: null, matchReason: null, blocks: [
      block({ label: "Bamboo Forest", quote: "Bamboo Forest" }),
      block({ start: "15:00", label: "Tea ceremony", quote: "3:00 PM Tea ceremony" }),
    ] }] };
    const { reading, dropped } = verifyAgainstTab(r, TAB, days);
    expect(dropped).toBe(1);
    expect(reading.plans[0].blocks.map((b) => b.label)).toEqual(["Bamboo Forest"]);
  });

  it("drops a choice that isn't hers, and a 'who' that isn't hers", () => {
    const r: DayPlanReading = { plans: [{ heading: "", date: "2026-05-04", matchedDate: null, matchReason: null, blocks: [
      block({ label: "Tofu lunch — ideally Shoraku", quote: "Tofu lunch — ideally Shoraku", choices: [{ name: "Shoraku", note: "" }, { name: "Okutan", note: "" }] }),
      block({ label: "pottery stop", who: "You + June", quote: "You + June: pottery stop" }),
      block({ label: "Hill Museum", who: "Everyone", quote: "Kip + Abe: Hill Museum" }),
    ] }] };
    const { reading } = verifyAgainstTab(r, TAB, days);
    const [lunch, pottery, museum] = reading.plans[0].blocks;
    expect(lunch.choices.map((c) => c.name)).toEqual(["Shoraku"]);
    expect(pottery.who).toBe("You + June");
    expect(museum.who).toBeNull();
  });

  it("a plan with no stated date needs a trip day AND a reason, or it stays off the days", () => {
    const undated = (matchedDate: string, matchReason: string): DayPlanReading => ({ plans: [{ heading: "", date: null, matchedDate, matchReason, blocks: [block({ label: "Bamboo Forest", quote: "Bamboo Forest" })] }] });
    expect(verifyAgainstTab(undated("2026-05-04", "both are the riverside day"), TAB, days).reading.plans).toHaveLength(1);
    expect(verifyAgainstTab(undated("2026-05-04", ""), TAB, days).reading.plans).toHaveLength(0);
    expect(verifyAgainstTab(undated("2026-06-01", "a reason"), TAB, days).reading.plans).toHaveLength(0);
  });

  it("a stated date outside the trip is not used", () => {
    const r: DayPlanReading = { plans: [{ heading: "", date: "2026-09-09", matchedDate: null, matchReason: null, blocks: [block({ label: "Bamboo Forest", quote: "Bamboo Forest" })] }] };
    expect(verifyAgainstTab(r, TAB, days).reading.plans).toHaveLength(0);
  });
});

describe("looksLikeDayPlan", () => {
  it("a timed day plan is read; a hotel comparison is not", () => {
    expect(looksLikeDayPlan(TAB)).toBe(true);
    expect(looksLikeDayPlan("Hotel options: Park Hyatt — great views, pricey. Aman — quiet. Andaz — central. ".repeat(4))).toBe(false);
  });
  it("a pasted booking email is never a day plan, even with times in it", () => {
    const email = "We are pleased to confirm the following reservation. Arrive Tuesday 3:00 pm, depart Thursday 12:00 pm. Confirmation # - 12345. Cancellations by 3:00 pm Kyoto time 24 hours before arrival. Day 1 welcome drink. ".repeat(2);
    expect(looksLikeDayPlan(email)).toBe(false);
  });
});
