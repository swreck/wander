/**
 * WHOSE A LINE IS, FROM HER OWN SHORTHAND ON THE SAME DATE (Sep 30, round 10). "day 1 - JA Arrive (evening), KL day
 * trip to Mashiko" gives Mashiko to Ken & Larisa that day; the unnamed Mashiko day-trip line becomes theirs, with
 * her words quoted. Pure data; no database, no Claude.
 */
import { describe, it, expect } from "vitest";
import { tagPartiesFromShorthand } from "../src/services/guide/importSnapshot.js";

const line = (over: Record<string, unknown>) => ({ date: "2026-10-14", time: null, endTime: null, kind: "plan", title: "", detail: null, forWhom: null, source: "Itinerary", sourceRef: "", city: null, ...over }) as any;
const couples = [
  line({ date: "2026-10-05", kind: "flight", title: "United UA35", forWhom: "Ken & Larisa" }),
  line({ date: "2026-10-13", kind: "flight", title: "United · SFO → NRT", forWhom: "Julie & Andy" }),
];

describe("her shorthand names whose a line is", () => {
  it("the Mashiko day trip on her 'KL day trip to Mashiko' date is Ken & Larisa's, quoted", () => {
    const trip = line({ title: "Day trip from Tokyo to Mashiko (Finish at Mashiko Station by 3:45p-4p)" });
    const hers = line({ title: "day 1 - JA Arrive (evening), KL day trip to Mashiko" });
    tagPartiesFromShorthand([...couples, trip, hers]);
    expect(trip.forWhom).toBe("Ken & Larisa");
    expect(trip.detail).toContain("KL day trip to Mashiko");
    expect(hers.forWhom).toBeNull(); // her own line names both couples — left as it is
  });

  it("never on another date, never over names already there, never on a generic word", () => {
    const otherDay = line({ date: "2026-10-13", title: "Maybe: Mashiko (ceramics town)" });
    const named = line({ title: "Mashiko pottery visit", forWhom: "Julie & Andy" });
    const generic = line({ title: "Evening at the hotel" });
    const hers = line({ title: "day 1 - JA Arrive (evening), KL day trip to Mashiko" });
    tagPartiesFromShorthand([...couples, otherDay, named, generic, hers]);
    expect(otherDay.forWhom).toBeNull();
    expect(named.forWhom).toBe("Julie & Andy");
    expect(generic.forWhom).toBeNull(); // "evening" is JA's word in her line, but it's not a place
  });

  it("two couples in one subject ('K/L, J/A depart Osaka') give the place to nobody", () => {
    const other = line({ date: "2026-10-29", title: "Osaka side trip" });
    tagPartiesFromShorthand([...couples, other, line({ date: "2026-10-29", title: "K/L, J/A depart Osaka (KIX)" })]);
    expect(other.forWhom).toBeNull();
  });

  it("two couples claiming the same place that day: nobody's", () => {
    const trip = line({ title: "Mashiko day trip" });
    tagPartiesFromShorthand([...couples, trip, line({ title: "KL Mashiko" }), line({ title: "JA Mashiko too" })]);
    expect(trip.forWhom).toBeNull();
  });
});
