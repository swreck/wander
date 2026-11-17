/**
 * S2d D1-D3, D5-D8 (Nov 17 2026): the screens' words on a trip built from a plan. A plan trip never says Guide, sheet,
 * spreadsheet, tab, cell, "her Itinerary" or "rail sheet"; every sheet trip's words stay exactly as they were (the
 * sheet-trip expectations below are the literal strings of build 7145670, and two fixtures saved from it). Read straight
 * from the phone's own files, as samples-phone.test.ts does. Invented people and plan lines; no network.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";

// A phone's storage
const store = new Map<string, string>();
let storageBroken = false;
const fakeStorage = {
  getItem: (k: string) => { if (storageBroken) throw new Error("private mode"); return store.get(k) ?? null; },
  setItem: (k: string, v: string) => { if (storageBroken) throw new Error("private mode"); store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
(globalThis as any).localStorage = fakeStorage;

const ROOT = new URL("../..", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const P = await import("../../frontend/src/lib/planTrip.ts");
const G = await import("../../frontend/src/lib/guideDisplay.ts");
const { sectionsFor } = await import("../../frontend/src/lib/helpSections.ts");
const { dayText } = await import("../../frontend/src/components/SendOut.tsx");

beforeEach(() => { store.clear(); storageBroken = false; P.forgetPlanTripsInMemory(); });

describe("D1 voiceFor", () => {
  const sheet = (them: boolean) => ({
    guide: them ? "Larisa's Guide" : "your Guide", Guide: them ? "Larisa's Guide" : "Your Guide",
    herGuide: them ? "her Guide" : "your Guide", HerGuide: them ? "Her Guide" : "Your Guide",
    ownersPlan: them ? "Larisa's plan" : "your plan", OwnersPlan: them ? "Larisa's plan" : "Your plan",
    herPlan: them ? "her plan" : "your plan", HerPlan: them ? "Her plan" : "Your plan",
    her: them ? "her" : "your", Her: them ? "Her" : "Your", owners: them ? "Larisa's" : "your", Owners: them ? "Larisa's" : "Your",
    checkWith: them ? "worth checking with Larisa" : "worth a second look", mine: !them,
  });
  const plan = (them: boolean) => ({
    ...sheet(them), guide: "the plan", Guide: "The plan", herGuide: "the plan", HerGuide: "The plan",
    ownersPlan: "the plan", OwnersPlan: "The plan", herPlan: "the plan", HerPlan: "The plan",
  });
  for (const [me, them] of [["Ken", true], [null, true], ["Larisa", false]] as const) {
    it(`a sheet trip says what the glued words said, to ${me ?? "nobody"}`, () => {
      const v = G.voiceFor(me, "Larisa", false);
      expect(v).toMatchObject(sheet(them));
      expect(v.plan).toBe(false);
    });
    it(`a plan trip says "the plan" in every whole-phrase field, to ${me ?? "nobody"}`, () => {
      const v = G.voiceFor(me, "Larisa", true);
      expect(v).toMatchObject(plan(them));
      expect(v.plan).toBe(true);
    });
  }
  it("the sheet fields are what the old sites glued together", () => {
    for (const me of ["Ken", "Larisa", null]) {
      const v = G.voiceFor(me, "Larisa", false);
      expect(v.Guide).toBe(v.guide.charAt(0).toUpperCase() + v.guide.slice(1));
      expect(v.herGuide).toBe(`${v.her} Guide`);
      expect(v.HerGuide).toBe(`${v.Her} Guide`);
      expect(v.ownersPlan).toBe(`${v.owners} plan`);
      expect(v.OwnersPlan).toBe(`${v.Owners} plan`);
      expect(v.herPlan).toBe(`${v.her} plan`);
      expect(v.HerPlan).toBe(`${v.Her} plan`);
    }
  });
  it("say is the same on either kind of trip", () => {
    for (const me of ["Ken", "Larisa"]) {
      const text = "Larisa's Guide says the stop her tab lists; worth checking with Larisa";
      expect(G.voiceFor(me, "Larisa", true).say(text)).toBe(G.voiceFor(me, "Larisa", false).say(text));
    }
  });
  it("with no third argument it asks the phone about the open trip", () => {
    store.set("wander:last-trip-id", "trip-p");
    expect(G.voiceFor("Ken").plan).toBe(false);
    P.notePlanTrip("trip-p", true, ["Larisa's notes"]);
    expect(G.voiceFor("Ken").plan).toBe(true);
    expect(G.voiceFor("Ken").guide).toBe("the plan");
  });
});

describe("D2 friendlySource", () => {
  // five real source strings from Japan (the local copy of the trip), and what 7145670 said of each
  const JAPAN: [string, string, string][] = [
    ["Tokyo Day 1 Ginza · Tokyo Day 1: Ginza (Relaxed Start) - Japanese Sporting Goods & Stationary", "the Tokyo Day 1 Ginza tab", "a"],
    ["Screenshot in Tokyo Hotel Info", "a screenshot in the Tokyo Hotel Info tab", "b"],
    ["1027 & 1028 Four Seasons (pasted text)", "the 1027 & 1028 Four Seasons tab", "c"],
    ["Kyoto Tue, 1027Kiyomizu-dera Te · Day 3: Tuesday 10/27 — Kiyomizu, TeamLab, Raku Museum & Ristorante Dono", "the Kyoto Tue, 1027Kiyomizu-dera… tab", "d"],
    ["Itinerary (heading)", "the Itinerary (heading) tab", "e"],
  ];
  it("a sheet trip's five Japan sources read as they did", () => {
    for (const [source, words] of JAPAN) {
      expect(G.friendlySource(source, "Ken", false)).toBe(`From Larisa's Guide — ${words}`);
      expect(G.friendlySource(source, null, false)).toBe(`From Larisa's Guide — ${words}`);
      expect(G.friendlySource(source, "Larisa", false)).toBe(`From your Guide — ${words}`);
    }
  });
  it("a plan trip names the source as stored", () => {
    expect(G.friendlySource("Larisa's notes", "Ken", true)).toBe("From Larisa's notes");
    expect(G.friendlySource("Backroads' itinerary", "Ken", true)).toBe("From Backroads' itinerary");
    expect(G.friendlySource("Larisa's notes + Backroads' itinerary", "Ken", true)).toBe("From Larisa's notes and Backroads' itinerary");
    expect(G.friendlySource("Backroads' itinerary + Larisa's notes", null, true)).toBe("From Backroads' itinerary and Larisa's notes");
  });
  it("to the person whose name starts it, it is 'your notes'", () => {
    expect(G.friendlySource("Larisa's notes", "Larisa", true)).toBe("From your notes");
    expect(G.friendlySource("Larisa's notes + Backroads' itinerary", "Larisa", true)).toBe("From your notes and Backroads' itinerary");
    expect(G.friendlySource("Backroads' itinerary", "Larisa", true)).toBe("From Backroads' itinerary");
  });
  it("says the same source once when two parts are the same", () => {
    expect(G.friendlySource("Larisa's notes + Larisa's notes", "Ken", true)).toBe("From Larisa's notes");
  });
  it("with no third argument it asks the phone about the open trip", () => {
    store.set("wander:last-trip-id", "trip-p");
    expect(G.friendlySource("Larisa's notes", "Ken")).toBe("From Larisa's Guide — the Larisa's notes tab");
    P.notePlanTrip("trip-p", true, []);
    expect(G.friendlySource("Larisa's notes", "Ken")).toBe("From Larisa's notes");
  });
  it("planSourceNames says 'Your notes' first in a heading", () => {
    expect(G.planSourceNames(["Larisa's notes", "Backroads' itinerary"], "Larisa", true)).toEqual(["Your notes", "Backroads' itinerary"]);
    expect(G.planSourceNames(["Larisa's notes", "Backroads' itinerary"], "Ken")).toEqual(["Larisa's notes", "Backroads' itinerary"]);
  });
});

describe("D3 freshness", () => {
  const SOURCES_BOTH = ["Larisa's notes", "Backroads' itinerary"];
  const SOURCES_ONE = ["Backroads' itinerary"];
  const NOW = new Date("2026-11-18T20:00:00Z");
  const withPhoneIn = (zone: string, run: () => void) => {
    const was = process.env.TZ;
    process.env.TZ = zone;
    try { run(); } finally { if (was === undefined) delete process.env.TZ; else process.env.TZ = was; }
  };
  it("a sheet trip says what it said: Japan's date, 'Japan time' when the phone is elsewhere", () => {
    withPhoneIn("America/Los_Angeles", () => {
      expect(G.freshness("2026-11-14T03:00:00Z", NOW, "Asia/Tokyo", { plan: false })).toMatchObject({ text: "Larisa's Guide, as Wander last read it on Nov 14, Japan time", old: false, days: 4, line: "" });
      expect(G.freshness("2026-11-01T03:00:00Z", NOW, "Asia/Tokyo", { plan: false })).toMatchObject({ text: "Larisa's Guide, as Wander last read it on Nov 1, Japan time", old: true });
      expect(G.freshness("2026-11-14T03:00:00Z", NOW, "Asia/Ho_Chi_Minh", { plan: false })?.text).toBe("Larisa's Guide, as Wander last read it on Nov 14, Vietnam time");
    });
    withPhoneIn("Asia/Tokyo", () => {
      expect(G.freshness("2026-11-14T03:00:00Z", NOW, "Asia/Tokyo", { plan: false })?.text).toBe("Larisa's Guide, as Wander last read it on Nov 14");
    });
  });
  it("a sheet trip with no options is the same as before (the phone is asked, and says sheet)", () => {
    withPhoneIn("America/Los_Angeles", () => {
      expect(G.freshness("2026-11-14T03:00:00Z", NOW)?.text).toBe("Larisa's Guide, as Wander last read it on Nov 14, Japan time");
    });
  });
  it("a plan trip says when the plan was last updated, in the phone's own zone, with no zone words", () => {
    withPhoneIn("America/Los_Angeles", () => {
      const f = G.freshness("2026-11-17T16:22:00Z", NOW, "Asia/Ho_Chi_Minh", { plan: true, me: "Ken", sources: SOURCES_BOTH })!;
      expect(f.line).toBe("The plan was last updated Nov 17.");
      expect(f.old).toBe(false);
    });
    withPhoneIn("Asia/Tokyo", () => {
      // (the same moment is the next day on a phone in Japan: the phone's own zone, not the trip's)
      expect(G.freshness("2026-11-17T16:22:00Z", NOW, "Asia/Ho_Chi_Minh", { plan: true, me: "Ken", sources: SOURCES_BOTH })?.line).toBe("The plan was last updated Nov 18.");
    });
  });
  it("older than 7 days, to Ken, it adds that Larisa's notes may have changed, only when they are a source", () => {
    withPhoneIn("America/Los_Angeles", () => {
      const old = "2026-11-01T16:00:00Z";
      expect(G.freshness(old, NOW, "Asia/Ho_Chi_Minh", { plan: true, me: "Ken", sources: SOURCES_BOTH })).toMatchObject({ old: true, line: "The plan was last updated Nov 1. Larisa's notes may have changed since." });
      expect(G.freshness(old, NOW, "Asia/Ho_Chi_Minh", { plan: true, me: "Ken", sources: SOURCES_ONE })).toMatchObject({ old: true, line: "The plan was last updated Nov 1." });
      expect(G.freshness(old, NOW, "Asia/Ho_Chi_Minh", { plan: true, me: "Ken", sources: [] })?.line).toBe("The plan was last updated Nov 1.");
    });
  });
  it("to Larisa nothing is added, old or not", () => {
    withPhoneIn("America/Los_Angeles", () => {
      expect(G.freshness("2026-11-01T16:00:00Z", NOW, "Asia/Ho_Chi_Minh", { plan: true, me: "Larisa", sources: SOURCES_BOTH })?.line).toBe("The plan was last updated Nov 1.");
    });
  });
  it("seven days is not yet old", () => {
    withPhoneIn("America/Los_Angeles", () => {
      expect(G.freshness("2026-11-11T20:00:00Z", NOW, "Asia/Ho_Chi_Minh", { plan: true, me: "Ken", sources: SOURCES_BOTH })).toMatchObject({ old: false, line: "The plan was last updated Nov 11." });
    });
  });
  it("no date, no line", () => {
    expect(G.freshness(null, NOW, "Asia/Tokyo", { plan: true })).toBeNull();
  });
});

describe("D5 the phone's note of which trips are plans", () => {
  it("notes a trip and reads it back, with its sources", () => {
    expect(P.isPlanTrip("trip-p")).toBe(false);
    P.notePlanTrip("trip-p", true, ["Larisa's notes", "Backroads' itinerary"]);
    expect(P.isPlanTrip("trip-p")).toBe(true);
    expect(P.planSourcesOf("trip-p")).toEqual(["Larisa's notes", "Backroads' itinerary"]);
    expect(P.isPlanTrip("trip-j")).toBe(false);
    expect(P.planSourcesOf("trip-j")).toEqual([]);
  });
  it("defaults to the open trip", () => {
    store.set("wander:last-trip-id", "trip-p");
    P.notePlanTrip("trip-p", true, ["Larisa's notes"]);
    expect(P.isPlanTrip()).toBe(true);
    expect(P.planSourcesOf()).toEqual(["Larisa's notes"]);
    store.set("wander:last-trip-id", "trip-j");
    expect(P.isPlanTrip()).toBe(false);
  });
  it("survives a new module load, from localStorage", async () => {
    P.notePlanTrip("trip-p", true, ["Larisa's notes"]);
    vi.resetModules();
    const again = await import("../../frontend/src/lib/planTrip.ts");
    expect(again.isPlanTrip("trip-p")).toBe(true);
    expect(again.planSourcesOf("trip-p")).toEqual(["Larisa's notes"]);
    // (kept as ids and source names only)
    expect(JSON.parse(store.get("wander:plan-trips")!)).toEqual({ "trip-p": ["Larisa's notes"] });
  });
  it("a trip the server says is not a plan is forgotten", () => {
    P.notePlanTrip("trip-p", true, ["Larisa's notes"]);
    P.notePlanTrip("trip-p", false);
    expect(P.isPlanTrip("trip-p")).toBe(false);
    expect(JSON.parse(store.get("wander:plan-trips")!)).toEqual({});
  });
  it("a trip list that says plan with no sources keeps the sources already known", () => {
    P.notePlanTrip("trip-p", true, ["Larisa's notes"]);
    P.notePlanTrip("trip-p", true);
    expect(P.planSourcesOf("trip-p")).toEqual(["Larisa's notes"]);
  });
  it("an answer of undefined says nothing either way", () => {
    P.notePlanTrip("trip-p", true, ["Larisa's notes"]);
    P.notePlanTrip("trip-p", undefined);
    expect(P.isPlanTrip("trip-p")).toBe(true);
  });
  it("a localStorage that throws reads as 'not a plan trip', with no error, and memory still holds what was noted", () => {
    storageBroken = true;
    P.forgetPlanTripsInMemory();
    expect(() => P.isPlanTrip("trip-p")).not.toThrow();
    expect(P.isPlanTrip("trip-p")).toBe(false);
    expect(P.isPlanTrip()).toBe(false);
    expect(() => P.notePlanTrip("trip-p", true, ["Larisa's notes"])).not.toThrow();
    expect(P.isPlanTrip("trip-p")).toBe(true);
    expect(P.planSourcesOf()).toEqual([]);
  });
  it("a stored note that is not what was written reads as none", () => {
    store.set("wander:plan-trips", "{not json");
    expect(P.isPlanTrip("trip-p")).toBe(false);
    P.forgetPlanTripsInMemory();
    store.set("wander:plan-trips", JSON.stringify(["a", "b"]));
    expect(P.isPlanTrip("a")).toBe(false);
  });
});

describe("D6 the help page", () => {
  const FIXTURE = JSON.parse(read("backend/tests/fixtures/help-sheet-7145670.json"));
  const SOURCES = ["Larisa's notes", "Backroads' itinerary"];
  it("a sheet trip's text is the text of 7145670, to Ken, to Larisa and to Andy", () => {
    expect(sectionsFor(false, "Ken")).toEqual(FIXTURE.Ken);
    expect(sectionsFor(true, "Larisa")).toEqual(FIXTURE.Larisa);
    expect(sectionsFor(false, "Andy")).toEqual(FIXTURE.Andy);
    expect(sectionsFor(false, "Ken", false, SOURCES)).toEqual(FIXTURE.Ken);
  });
  // Allowed as whole phrases only (the lead, Nov 17): Wander's own Next and Notes tabs, a paper welcome sheet, a trip guide
  // in a person's story. A bare "tab" or "sheet" anywhere else still fails.
  const ALLOWED = [/our guide took us/gi, /the (\*\*)?Next(\*\*)? tab/gi, /the (\*\*)?Notes(\*\*)? tab/gi, /welcome sheet/gi];
  const FORBIDDEN = /\b(guide|guides|sheet|sheets|spreadsheet|spreadsheets|tab|tabs|cell|cells)\b|her itinerary/i;
  for (const [who, mine] of [["Ken", false], ["Larisa", true], ["Andy", false]] as const) {
    it(`a plan trip's help holds none of rule 2's words, to ${who}`, () => {
      const text = sectionsFor(mine, who, true, SOURCES).map((s) => `${s.title}\n${s.body}`).join("\n\n");
      let rest = text;
      for (const a of ALLOWED) rest = rest.replace(a, "");
      expect(rest.match(FORBIDDEN)?.[0] ?? null).toBeNull();
    });
  }
  it("a plan trip's help has the same sections in the same order", () => {
    const ids = (s: { id: string; title: string }[]) => s.map((x) => `${x.id}|${x.title}`);
    expect(ids(sectionsFor(false, "Ken", true, SOURCES))).toEqual(ids(FIXTURE.Ken));
  });
  it("a plan trip's help says what the brief says", () => {
    const by = (who: string, mine: boolean, sources = SOURCES) => Object.fromEntries(sectionsFor(mine, who, true, sources).map((s) => [s.id, s.body]));
    const ken = by("Ken", false), larisa = by("Larisa", true);
    expect(ken["quick-start"]).toContain("Wander shows the trip's plan on your phone, arranged by day.");
    expect(ken["quick-start"]).toContain("**Budget** (what's been paid for the group, and who pays next)");
    expect(ken["quick-start"]).not.toMatch(/KL|AJ|weather/);
    expect(ken["getting-around"]).toContain("Each line says where it came from, and the bottom says when the plan was last updated.");
    expect(ken["getting-around"]).not.toMatch(/weather|Larisa wrote a detailed plan/);
    expect(ken["getting-around"]).toContain("Everyone sees it, marked as added in Wander.");
    expect(ken["travel-days"]).toContain("where the plan has you right now");
    expect(ken["chat"]).toContain("Scout has read the whole plan and knows what day and time it is where you are.");
    for (const q of ['"Where are we sleeping tonight?"', '"What time do we meet Backroads?"', '"When do we land in Tokyo?"', '"Anywhere for coffee near here?"']) expect(ken["chat"]).toContain(q);
    expect(ken["chat"]).toContain("Send Scout a photo or a file");
    expect(ken["the-guide"]).toBe("The plan is built from Larisa's notes and Backroads' itinerary. Wander never changes either. Where something is still open, like a train that isn't booked yet, Wander shows it as open.\n\nIf something in Wander looks different from what Larisa told you, trust Larisa. Wander may not have her latest yet.");
    expect(larisa["the-guide"]).toBe("The plan is built from your notes and Backroads' itinerary. Wander never changes either. Where something is still open, like a train that isn't booked yet, Wander shows it as open.\n\nIf something in Wander looks different from your notes, your notes are right. Wander may not have your latest yet.");
    expect(by("Ken", false, ["Backroads' itinerary"])["the-guide"]).toMatch(/^The plan is built from Backroads' itinerary\. Wander never changes it\. /);
    expect(by("Ken", false, [])["the-guide"]).toMatch(/^Wander holds the trip's plan\. Where something is still open/);
    expect(ken["notes"]).toContain('("our guide took us to her family\'s noodle shop")');
    expect(ken["notes"]).not.toContain("Arita");
    expect(ken["notes"]).toContain('"Interested" shows everyone who\'s in. A line on Home says when there\'s something new.');
    expect(ken["notes"]).toContain("Larisa sees yours, and you see hers.");
    expect(larisa["notes"]).toContain("Ken sees yours, and you see his.");
  });
  it("the paragraphs the brief leaves as today are today's, word for word", () => {
    const sheet = Object.fromEntries(FIXTURE.Ken.map((s: any) => [s.id, s.body]));
    const plan = Object.fromEntries(sectionsFor(false, "Ken", true, SOURCES).map((s) => [s.id, s.body]));
    for (const id of ["phrases", "no-signal", "travel-info", "feedback", "getting-in"]) expect(plan[id]).toBe(sheet[id]);
    expect(plan["chat"].split("\n\n").slice(2)).toEqual(sheet["chat"].split("\n\n").slice(2));
    expect(plan["notes"].split("\n\n").slice(2)).toEqual(sheet["notes"].split("\n\n").slice(2));
  });
});

describe("D7 the glued words are gone from the source", () => {
  it("no {v.her} Guide, {v.Her} Guide, {v.Owners} Guide, {v.owners} plan, {v.her} plan, {v.Her} plan or a template twin", () => {
    let hits = "";
    try { hits = execFileSync("grep", ["-rnE", "\\.(her|Her|Owners|owners)\\}? (Guide|plan)\\b", "frontend/src"], { cwd: ROOT }).toString(); } catch { hits = ""; }
    expect(hits).toBe("");
  });
  it("and none of the literal 'Larisa's Guide' picked by a name test", () => {
    let hits = "";
    try { hits = execFileSync("grep", ["-rnE", "\\.mine \\? \"(Your|your) Guide\" : \"Larisa's Guide\"", "frontend/src"], { cwd: ROOT }).toString(); } catch { hits = ""; }
    expect(hits).toBe("");
  });
});

describe("D8 the day sent as text", () => {
  const line = (over: Record<string, unknown>) => ({ id: "x", date: "2026-12-17", time: null, endTime: null, timeZone: null, kind: "plan", title: "A line", detail: null, forWhom: null, place: null, confirmation: null, link: null, source: "Larisa's notes", ...over }) as any;
  const args = {
    date: "2026-12-17", city: "City A", overview: [], sleep: ["Stay A Hotel"], owner: "Larisa", tripZone: "Asia/Ho_Chi_Minh",
    plan: [], others: [
      line({ id: "a", kind: "meal", title: "Lunch at Place A", time: "12:00", source: "Larisa's notes" }),
      line({ id: "b", kind: "tour", title: "Cycle the old town", time: "14:00", source: "Backroads' itinerary" }),
    ],
  };
  it("a plan trip's day holds none of rule 2's words and ends 'from the plan for the trip'", () => {
    const text = dayText({ ...args, fromPlan: true });
    expect(text).toContain("Lunch at Place A");
    expect(text).toContain("Cycle the old town");
    expect(text).toMatch(/— from the plan for the trip$/);
    expect(text.match(/\b(guide|sheet|spreadsheet|tab|tabs|cell|cells)\b|her itinerary|rail sheet/i)?.[0] ?? null).toBeNull();
  });
  it("a Japan day is what it was", () => {
    const text = dayText({ ...args, fromPlan: false });
    expect(text).toBe("Thursday, December 17 — City A\n\n12:00 PM  Lunch at Place A\n2:00 PM  Cycle the old town\n\nSleeping at: Stay A Hotel\n\n— from Larisa's plan for the trip");
  });
  it("with no option it asks the phone about the open trip", () => {
    store.set("wander:last-trip-id", "trip-p");
    expect(dayText(args)).toMatch(/— from Larisa's plan for the trip$/);
    P.notePlanTrip("trip-p", true, []);
    expect(dayText(args)).toMatch(/— from the plan for the trip$/);
  });
});
