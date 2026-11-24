/**
 * S2-S4, S6-S11 (December plan, S2b, Nov 17 2026): Scout on a trip built from a plan across Vietnam, Cambodia and Japan.
 * Its words are "the plan", every day names its country and clock, a line on another clock says so, Scout never sees a
 * sample, the storm watch is Japan's, a number outside Japan is not yen, and a notice's "until" is on the day's clock.
 * The model is stubbed and no network is reached. Invented trip, people and plan lines only. (S1 and S5 are in
 * scout-japan-unchanged.test.ts: Japan's trip is held by hash, and still has its "still at home" lines.)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { cleanFixtures, makePlan, NAMES_OF } from "./fixtures/scout-fixtures.js";

const sentToModel = vi.hoisted(() => [] as any[]);
// (steps a test wants the stubbed model to take, in order; when empty the stub answers "(stub)")
const script = vi.hoisted(() => [] as { stop_reason: string; content: any[] }[]);
vi.mock("@anthropic-ai/sdk", async (orig) => {
  const real: any = await orig();
  class Fake extends real.default {
    constructor(o?: any) {
      super({ apiKey: "test", ...o });
      (this as any).messages = {
        create: async (p: any) => {
          sentToModel.push(p);
          const next = script.shift();
          if (next) return { id: "stub", type: "message", role: "assistant", model: "stub", stop_sequence: null, ...next, usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
          return { id: "stub", type: "message", role: "assistant", model: "stub", stop_reason: "end_turn", stop_sequence: null,
            content: [{ type: "text", text: "(stub)", citations: null }], usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
        },
      };
    }
  }
  return { ...real, default: Fake };
});

process.env.JWT_SECRET = "test-secret-scout-plan";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { buildGuideContextParts } = await import("../src/services/guide/scoutContext.js");
const { executeTool, scoutTools } = await import("../src/routes/chat.js");
const { PLAN_PACKING_RULE, PLAN_ADVISORY_RULE } = await import("../src/services/planTrip.js");
const prisma = new PrismaClient();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// 11:00 PM on Dec 20 in Vietnam (1:00 AM Dec 21 in Japan); the phone is still in California (Dec 20, 9:00 AM)
const NOW = new Date("2026-12-20T16:00:00Z");
const PHONE = "America/Los_Angeles";
const NAMES = NAMES_OF.plan;
const SAMPLE_WORDS = "Quincy Phantom Grand";
const JAPAN_SYSTEM_HASH = "e5dd26ef13ca3ace29a7ede276935086ea1936a09df321420b194f50583f64e1";   // (scout-japan-unchanged.test.ts)

let plan: Awaited<ReturnType<typeof makePlan>>;
let tok = "";
const who = (n: string, id: string) => ({ code: n, displayName: n, travelerId: id });
let ken: ReturnType<typeof who>;
let stable = "", live = "";
const forecast = (date: string) => ({ daily: { time: [date], temperature_2m_max: [80], temperature_2m_min: [70], precipitation_probability_max: [10], precipitation_sum: [0], weather_code: [1] } });

beforeAll(async () => {
  await cleanFixtures(prisma, "plan");
  plan = await makePlan(prisma);
  // one unconfirmed entry: lives in sample_entries, which Scout never reads
  await prisma.sampleEntry.create({ data: { tripId: plan.tripId, kind: "unconfirmed", slot: "leg:leg-x", date: "2026-12-17", data: { title: `${SAMPLE_WORDS} flight`, detail: `${SAMPLE_WORDS} room`, from: SAMPLE_WORDS } } });
  tok = signToken({ code: NAMES.a, displayName: NAMES.a, travelerId: plan.travelers.pat });
  ken = who(NAMES.a, plan.travelers.pat);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    const url = String(input);
    const d = url.match(/start_date=(\d{4}-\d{2}-\d{2})/)?.[1] || "2026-12-20";
    return new Response(JSON.stringify(forecast(d)), { status: 200, headers: { "content-type": "application/json" } });
  });
  const parts = await buildGuideContextParts(plan.tripId, { phoneZone: PHONE, now: NOW });
  stable = parts.stable; live = parts.live;
  if (process.env.DUMP_DIR) (await import("fs")).writeFileSync(`${process.env.DUMP_DIR}/plan.txt`, `${stable}\n\n=====LIVE=====\n${live}\n`);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.tripAlert.deleteMany({ where: { tripId: plan.tripId } }).catch(() => {});
  await cleanFixtures(prisma, "plan");
  await prisma.$disconnect();
});
afterEach(() => { vi.useRealTimers(); });

const clockAt = (iso: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(iso)); };
/** The lines of one day of DAY BY DAY, from its heading to the next */
const dayBlock = (date: string) => {
  const from = stable.indexOf(`(${date})`);
  const heads = [...stable.matchAll(/^\w+day, \w+ \d{1,2} \(\d{4}-\d{2}-\d{2}\)/gm)].map((m) => m.index!);
  const to = heads.find((h) => h > from);
  return stable.slice(stable.lastIndexOf("\n", from) + 1, to ?? stable.length);
};

describe("S2 a plan trip's context never says the Guide, a sheet, a tab or a cell", () => {
  it("in the stable or the live text", () => {
    for (const [name, text] of [["stable", stable], ["live", live]] as const) {
      expect(text.length, name).toBeGreaterThan(200);
      for (const word of [/\bGuide\b/i, /\bsheet\b/i, /spreadsheet/i, /her tab/i, /\btabs?\b/i, /\bcell\b/i, /rail sheet/i, /\bxlsx\b/i]) expect(text, `${name} ${word}`).not.toMatch(word);
    }
    // (it says "the plan", and the plan's own source words on a line)
    expect(stable).toContain("DAY BY DAY (from the plan;");
    expect(stable).toContain("(source: Larisa's notes)");
    expect(stable).toContain("(source: Backroads' itinerary)");
    expect(live).toContain("The plan last changed");
  });
  it("and the documents sent with it carry the plan's names", async () => {
    sentToModel.length = 0;
    const r = await request(app).post("/api/chat").set("Authorization", `Bearer ${tok}`).send({
      message: "Where do we sleep on the 22nd?", context: { page: "Home", tripId: plan.tripId }, history: [],
      clientTime: { iso: NOW.toISOString(), localDate: "2026-12-20", localTime: "9:00 AM", weekday: "Sunday", timeZone: PHONE },
    });
    expect(r.status).toBe(200);
    const sent = JSON.stringify(sentToModel[0]);
    expect(sent).toContain("The plan, as Wander holds it");
    expect(sent).not.toContain("Larisa's Guide (the plan, as Wander last read it)");
    expect(sent).not.toContain("her Guide's deadlines and flights");
  });
});

describe("S3 every day names its city, country and clock", () => {
  it("each day's heading", () => {
    expect(stable).toMatch(/^Sunday, December 20 \(2026-12-20\) — City A, Vietnam \(Vietnam time\)$/m);
    expect(stable).toMatch(/^Friday, December 25 \(2026-12-25\) — City A, Vietnam \(Vietnam time\), with Backroads$/m);
    expect(stable).toMatch(/^Friday, January 1 \(2027-01-01\) — City B, Cambodia \(Cambodia time\), with Backroads$/m);
    expect(stable).toMatch(/^Saturday, January 2 \(2027-01-02\) — City C, Japan \(Japan time\)$/m);
  });
  it("a Vietnam or Cambodia day's lines never say Japan; and no raw zone name is anywhere", () => {
    for (const d of ["2026-12-14", "2026-12-15", "2026-12-20", "2026-12-25"]) expect(dayBlock(d), d).not.toMatch(/Japan/);
    // (Cambodia's day holds Japan only in the one flight that lands there, said as that flight's landing)
    expect(dayBlock("2027-01-01").split("\n").filter((l) => /Japan/.test(l)).every((l) => l.includes("Flight 4"))).toBe(true);
    for (const text of [stable, live]) expect(text).not.toMatch(/\b(Asia|America)\//);
    // (the asker's own clock, in the live text, in words)
    expect(live).toContain("on the asker's own clock (California time)");
  });
  it("a deadline and a flight's windows are on their own day's clock, with its words", () => {
    expect(live).toMatch(/Pay Stay A's balance \(For Everyone\): OPEN NOW — last chance 2026-12-20 \(Sun\), by the end of that day \(Vietnam time\)/);
    expect(stable).toMatch(/departs Mon, Dec 14, 11:45 AM California time; lands at Seoul Incheon \(ICN\) Tue, Dec 15, 5:40 PM Korea time;/);
    expect(stable).toMatch(/lands at Tokyo Haneda \(HND\) Sat, Jan 2, 5:40 AM Japan time;/);
    expect(stable).not.toMatch(/\(= /);                      // (no two-zone conversion that assumes California and Japan)
    expect(stable).not.toMatch(/on Japan's/);
  });
});

describe("S4 a line on another clock than its day's says so in brackets", () => {
  const line = (date: string, words: string) => dayBlock(date).split("\n").find((l) => l.includes(words)) || "";
  it("the California take-off and the Korea flight on Vietnam days; Thailand's on a Cambodia day", () => {
    expect(line("2026-12-14", "Flight 1")).toContain("[California time]");
    expect(line("2026-12-15", "Flight 2")).toContain("[Korea time]");
    expect(line("2026-12-15", "Land at ICN")).toContain("[Korea time]");
    expect(line("2027-01-01", "Flight 4")).toContain("[Thailand time]");
  });
  it("a line on the day's own clock carries none", () => {
    expect(line("2026-12-15", "Land at HAN")).not.toMatch(/\[[^\]]*time\]/);
    expect(line("2026-12-25", "Meet the Backroads leaders")).not.toMatch(/\[[^\]]*time\]/);
    expect(line("2027-01-01", "Flight 3")).not.toMatch(/\[[^\]]*time\]/);          // (Cambodia's clock, on a Cambodia day)
    expect(line("2027-01-02", "Land at HND")).not.toMatch(/\[[^\]]*time\]/);
  });
});

describe("S6 Scout never sees a sample or an unconfirmed entry", () => {
  it("not in the context, not in anything sent to the model, not in a tool's result", async () => {
    expect(stable).not.toContain(SAMPLE_WORDS);
    expect(live).not.toContain(SAMPLE_WORDS);
    const seen = [JSON.stringify(sentToModel)];
    for (const [tool, input] of [["get_trip_summary", { tripId: plan.tripId }], ["get_all_days", { tripId: plan.tripId }], ["get_weather", { tripId: plan.tripId, dates: ["2026-12-17"] }],
      ["get_my_notes", { tripId: plan.tripId }], ["money_so_far", { tripId: plan.tripId }]] as const) {
      seen.push(JSON.stringify((await executeTool(tool, input as any, ken)).result));
    }
    for (const s of seen) expect(s).not.toContain(SAMPLE_WORDS);
  });
  it("and nothing in the server's source reads sample_entries but the samples route and its service (a source check; S2c rule 3)", async () => {
    const { execFileSync } = await import("child_process");
    // (grep exits 1 when nothing matches: that is the pass)
    let hits: string[] = [];
    try { hits = execFileSync("grep", ["-rlE", "sampleEntry|sample_entries", "src"], { cwd: new URL("..", import.meta.url).pathname }).toString().trim().split("\n").filter(Boolean); } catch { /* no match */ }
    expect(hits.filter((f) => !["src/routes/samples.ts", "src/services/samples.ts"].includes(f))).toEqual([]);
  }, 30_000);
});

describe("S7 the plan trip's prompt", () => {
  // (copied here from the brief, apart from the source file, so a drift in either shows)
  const BLOCK = `THIS TRIP IS BUILT FROM A PLAN, NOT A SPREADSHEET. Read this first. Where it differs from a rule below, this wins.
- The plan is the one Larisa and Ken are building for this trip. Wander holds it as plan lines, and each line says
  where it came from ("Larisa's notes", "Backroads' itinerary"). Call it "the plan": "the plan has…", "that isn't in
  the plan yet". On this trip there is no Guide, no sheet, no tab, no cell and no rail sheet: never say those words.
  Where a rule below says "the Guide" or "her sheet", read "the plan". A fact from Larisa's notes is Larisa's; a fact
  from Backroads' itinerary is Backroads'.
- The plan is unfinished, and many days have nothing in it yet. Of a day with no lines, say that nothing is in the
  plan for it yet, and name where they sleep that night if the plan has it. Never fill a day with ideas said as
  plans. A person whose travel the plan doesn't hold: say the plan doesn't have their travel yet.
- The trip crosses countries. Each day in DAY BY DAY names its country and its clock, and a line on another clock
  says so in brackets. A date is the date where the people are that day: the day they leave home is the date at
  home. Every time you give names its clock ("9:45 PM Vietnam time", "11:45 AM California time"). Never say "Japan
  time" for a time outside Japan, and never give two flights' times as if they were on one clock.
- Backroads days are marked "with Backroads". Their lines are Backroads' itinerary, and the leaders set the times on
  the day. When a line has no time, say the plan gives none; never estimate one as the plan.
- What is Japan's only: the storm watch, Tabelog, search_train_schedules and the JR pages. Use them for the days in
  Japan. On a day outside Japan, storms, typhoons and warnings: say Wander's storm watch covers Japan only and has
  not checked that country; if they want, web_search, said as found online.
- Languages: "INTO JAPANESE" is for Japan. In Vietnam the same rule gives Vietnamese, in Cambodia Khmer. The phrase
  card holds Japanese only so far: outside Japan give the words in your answer, and never add_phrase them.
- Money: Wander keeps yen and US dollars only so far. Outside Japan a number with no currency is not yen: ask which
  currency. Pass add_expense a currency only when they said one. For dong, riel or any other currency, say Wander
  can't keep that currency yet, and keep nothing.
- Past, now and ahead come from RIGHT NOW. Before saying something has happened (checked in, landed, left),
  compare its date and clock with RIGHT NOW; what is still ahead is said as ahead ("you check in Sun, Dec 20").
  Say "today", "tonight" or "tomorrow" of a plan line only when its date is that day on the calendar in RIGHT
  NOW; otherwise give its weekday and date. A weekday is the one written beside the date in DAY BY DAY or WHERE
  EVERYONE SLEEPS: never work one out.`;
  // (rules 61 and 63 of the prompt: what Japan's says, and what a plan trip's says in its place)
  const SWAPS: [string, string][] = [
    ["the amount as said, yen unless they said dollars, and what it was for", "the amount as said, the currency only if they said one (on a day in Japan, yen unless they said dollars), and what it was for"],
    ["gets until: that moment, Japan time; it's gone", "gets until: that moment on that day's own clock; it's gone"],
    // (the weather, Nov 23 2026: the look-it-up rule and rule 46g — scout-plan-weather.test.ts W8 has the reasons)
    ["how to get from A to B, the weather outside Japan (in Japan it's get_weather, rule 46g), what a station exit is", "how to get from A to B, what a station exit is"],
    ["For a town in Japan that isn't where their plan has them that day, get_weather with town, and say in a short clause that their plan has them elsewhere.",
      "For a town in any of the trip's countries that isn't where the plan has them that day, get_weather with town, and say in a short clause that the plan has them elsewhere. It takes a town's own name: for a sight (a temple, a bay, a park), give the town people stay in to see it, only if you are sure which town that is, and say that the forecast is that town's. When it can't place a town, say so; never give a forecast of your own for it."],
    ["(the service they named first; else Japan's weather agency or tenki.jp)", "(the service they named first; else, for a town in Japan, Japan's weather agency or tenki.jp)"],
    ["Unasked, never a weather site's numbers in Japan. Outside Japan, web_search, said as found online.", "Unasked, never a weather site's numbers, in any country of the trip: the weather is get_weather's."],
    ["When get_weather has no forecast for a day (over, or more than 16 days ahead), say so; her pre-trip forecast in the Guide may be given then, said as hers, written before the trip.",
      "When get_weather has no forecast for a day (over, or more than 16 days ahead), say so. A day too far ahead may come with \"typical\": what that week was like there in past years. Say first that there's no forecast yet, then give it as past years, with its years and its counts as they are (\"in the same week of 2021–2025 it rained on 32 of those 35 days\"); never as a forecast, a chance or what to expect, and never a percentage worked out from the counts."],
  ];
  const OLD_RULE = `- Every date in the Guide is a Japan date. A person still at home lives on another calendar: Julie's "Oct 13" in California (the day she flies) is not the Guide's Oct 13 (when she is still at home). Before saying where someone is on a Guide date, read that date's WHERE line in DAY BY DAY; never map a Japan date onto their own calendar day.`;
  const NEW_RULE = `- Every date is the date in that day's country, as DAY BY DAY names it. Before saying where someone is on a date, read that date's lines; never map a date onto another country's calendar.`;
  let system = "";
  beforeAll(async () => {
    sentToModel.length = 0;
    await request(app).post("/api/chat").set("Authorization", `Bearer ${tok}`).send({
      message: "Hello", context: { page: "Home", tripId: plan.tripId }, history: [],
      clientTime: { iso: NOW.toISOString(), localDate: "2026-12-20", localTime: "9:00 AM", weekday: "Sunday", timeZone: PHONE },
    });
    system = sentToModel[0].system[0].text;
  });
  it("holds the block word for word right after the first paragraph", () => {
    const firstEnd = system.indexOf("\n\n");
    expect(system.slice(0, firstEnd)).toMatch(/^You are Scout, the travel companion built into Wander\..*remembers everything\.$/);
    expect(system.slice(firstEnd + 2, firstEnd + 2 + BLOCK.length)).toBe(BLOCK);
    expect(system.slice(firstEnd + 2 + BLOCK.length, firstEnd + 4 + BLOCK.length)).toBe("\n\nWander is the family's window".slice(0, 2));
    expect(system.slice(firstEnd + 2 + BLOCK.length + 2)).toMatch(/^Wander is the family's window into Larisa's Guide/);
  });
  it("holds the new date sentence and not the old one", () => {
    expect(system).toContain(NEW_RULE);
    expect(system).not.toContain("Every date in the Guide is a Japan date");
    expect(system).not.toContain(OLD_RULE);
  });
  it("F5 rules 61 and 63 say the currency only if said, and the day's own clock; the weather rules say every country of the trip", () => {
    for (const [was, now] of SWAPS) {
      expect(system).toContain(now);
      expect(system).not.toContain(was);
    }
  });
  // (Japan's packing rule, read from where it is written: one line of Scout's prompt, with no escapes in it)
  const japanPacking = readFileSync(new URL("../src/routes/chat.ts", import.meta.url), "utf8").split("\n").find((l) => l.startsWith("46f. Packing:")) ?? "";
  it("the packing rule is the plan trip's own, whole: none of Japan's list, Julie's offer or ryokans", () => {
    expect(japanPacking).toContain("the packing list Scout offered Julie");
    expect(system).toContain(`\n${PLAN_PACKING_RULE}\n`);
    expect(system).not.toContain("the packing list Scout offered Julie");
    expect(system).not.toContain("a big suitcase → their bullet-train days");
  });
  it("and nothing else differs from Japan's prompt: undo the changes and it is Japan's, by its hash", () => {
    const firstEnd = system.indexOf("\n\n");
    let undone = (system.slice(0, firstEnd + 2) + system.slice(firstEnd + 2 + BLOCK.length + 2)).replace(NEW_RULE, OLD_RULE);
    for (const [was, now] of SWAPS) undone = undone.replace(now, was);
    undone = undone.replace(PLAN_PACKING_RULE, () => japanPacking).replace(PLAN_ADVISORY_RULE, () => japanAdvisory);
    expect(sha(undone)).toBe(JAPAN_SYSTEM_HASH);
  });
  // (Nov 24 2026: "Do I need a visa for Cambodia?" was answered with prices from the April advisory list, whose sources
  // were never opened. A plan trip has neither Japan's rule 55 nor that tool.)
  const japanAdvisory = readFileSync(new URL("../src/routes/chat.ts", import.meta.url), "utf8").split("\n").find((l) => l.startsWith("55. Use get_travel_advisories")) ?? "";
  it("rule 55 is the plan trip's own, whole: the checked notes or 'no checked note', never the advisory list", () => {
    expect(japanAdvisory).toContain("use it PROACTIVELY");
    expect(system).toContain(`\n${PLAN_ADVISORY_RULE}\n`);
    expect(system).not.toContain("get_travel_advisories");
    expect(PLAN_ADVISORY_RULE).not.toContain("\n");
    expect(PLAN_ADVISORY_RULE).toMatch(/packing_tips with notesOnly: true/);
    expect(PLAN_ADVISORY_RULE).toMatch(/"Wander has no checked note on it"/);
    expect(PLAN_ADVISORY_RULE).toMatch(/no answer from your own memory/);
    expect(PLAN_ADVISORY_RULE).toMatch(/doctor or a travel clinic/);
    expect(PLAN_ADVISORY_RULE).not.toMatch(/\$\d|\bGuide\b|\bsheet\b|\btab\b|\bcell\b/);
  });
  it("and the tools sent hold no get_travel_advisories, while Japan's list still does", () => {
    const names = (sentToModel[0].tools as any[]).map((t) => t.name);
    expect(names).not.toContain("get_travel_advisories");
    expect(names).toContain("packing_tips");
    expect((sentToModel[0].tools as any[]).find((t) => t.name === "packing_tips").input_schema.properties.notesOnly.type).toBe("boolean");
    expect((scoutTools as any[]).map((t) => t.name)).toContain("get_travel_advisories");
    expect((scoutTools as any[]).find((t) => t.name === "packing_tips").input_schema.properties.notesOnly).toBeUndefined();
  });
  it("called anyway on a plan trip, the advisory tool gives none of its list", async () => {
    const r = (await executeTool("get_travel_advisories", { tripId: plan.tripId, countries: ["Cambodia"] }, ken)).result as any;
    expect(Object.keys(r)).toEqual(["noNote"]);
    expect(JSON.stringify(r)).not.toMatch(/\$\d|e-?Visa|advisories/i);
  });
});

describe("S8 the storm watch is Japan's (get_weather)", () => {
  const SENTENCE = (c: string) => `Wander's storm watch covers Japan only. ${c} has not been checked.`;
  it("a Vietnam day: exactly the one sentence, with the day's country, and none of the watch's words", async () => {
    clockAt("2026-12-20T16:00:00Z");
    const r: any = (await executeTool("get_weather", { tripId: plan.tripId, dates: ["2026-12-20"] }, ken)).result;
    expect(r.days[0].stormCheck).toBe(SENTENCE("Vietnam"));
    expect(r.stormWatch).toBeUndefined();
    const all = JSON.stringify(r);
    for (const w of [/checked/i.test(all.replace(SENTENCE("Vietnam"), "")), /nothing found/i.test(all), /Nothing near/i.test(all)]) expect(w).toBe(false);
  });
  it("a Cambodia day says Cambodia", async () => {
    clockAt("2026-12-20T16:00:00Z");
    const r: any = (await executeTool("get_weather", { tripId: plan.tripId, dates: ["2027-01-01"] }, ken)).result;
    expect(r.days[0].stormCheck).toBe(SENTENCE("Cambodia"));
  });
  it("a Japan day of the same trip reads as Japan's does: the watch's own words, not the sentence", async () => {
    clockAt("2026-12-20T16:00:00Z");
    const r: any = (await executeTool("get_weather", { tripId: plan.tripId, dates: ["2027-01-02"] }, ken)).result;
    expect(r.days[0].stormCheck ?? "").not.toContain("covers Japan only");
    expect(r.stormWatch).toBeDefined();
    expect(r.stormWatch.checked).toBeDefined();
  });
  it("a span over both: each day its own", async () => {
    clockAt("2026-12-20T16:00:00Z");
    const r: any = (await executeTool("get_weather", { tripId: plan.tripId, dates: ["2026-12-20", "2027-01-02"] }, ken)).result;
    const byDate = Object.fromEntries(r.days.map((d: any) => [d.date, d]));
    expect(byDate["2026-12-20"].stormCheck).toBe(SENTENCE("Vietnam"));
    expect(byDate["2027-01-02"].stormCheck ?? "").not.toContain("covers Japan only");
    expect(r.stormWatch).toBeDefined();
  });
});

describe("S9 get_weather's today is the date on the day's own clock", () => {
  it("at 11:00 PM Dec 20 Vietnam time (1:00 AM Dec 21 in Japan) with no date asked, it is Dec 20", async () => {
    clockAt("2026-12-20T16:00:00Z");
    const r: any = (await executeTool("get_weather", { tripId: plan.tripId }, ken)).result;
    expect(r.days.map((d: any) => d.date)).toEqual(["2026-12-20"]);
  });
  it("Dec 20 is not 'over' at that hour, and Dec 19 is", async () => {
    clockAt("2026-12-20T16:00:00Z");
    const r: any = (await executeTool("get_weather", { tripId: plan.tripId, dates: ["2026-12-19", "2026-12-20"] }, ken)).result;
    const byDate = Object.fromEntries(r.days.map((d: any) => [d.date, d]));
    expect(byDate["2026-12-19"].none).toBe("No forecast: that day is over.");
    expect(byDate["2026-12-20"].none).toBeUndefined();
  });
  it("the forecast was read on the day's clock, said in its words (not Japan time)", async () => {
    clockAt("2026-12-20T16:00:00Z");
    const r: any = (await executeTool("get_weather", { tripId: plan.tripId, dates: ["2026-12-20"] }, ken)).result;
    expect(r.days[0].read).toMatch(/Vietnam time$/);
    expect(JSON.stringify(r)).not.toMatch(/Japan time/);
  });
});

describe("S10 money: never yen by default outside Japan", () => {
  const ASK = "Which currency? Wander keeps yen and US dollars only so far.";
  const rows = () => prisma.tripExpense.count({ where: { tripId: plan.tripId } });
  it("a Vietnam day, no currency: nothing is written, and the sentence comes back", async () => {
    const r: any = (await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", amount: 600000, what: "Dinner", date: "2026-12-20" }, ken)).result;
    expect(JSON.stringify(r)).toContain(ASK);
    expect(r.kept).toBe(false);
    expect(await rows()).toBe(0);
  });
  it("with no date said, it is today's day (Dec 20, a Vietnam day)", async () => {
    clockAt("2026-12-20T16:00:00Z");
    const r: any = (await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", amount: 600000 }, ken)).result;
    expect(JSON.stringify(r)).toContain(ASK);
    expect(await rows()).toBe(0);
  });
  it("with dollars said it is kept, as today", async () => {
    const r: any = (await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", amount: 30, currency: "USD", what: "Taxi", date: "2026-12-20" }, ken)).result;
    expect(r.kept).toBe(true);
    expect(await rows()).toBe(1);
  });
  it("a Japan day with no currency: yen, as today", async () => {
    const r: any = (await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", amount: 1200, what: "Lunch", date: "2027-01-02" }, ken)).result;
    expect(r.kept).toBe(true);
    const row = await prisma.tripExpense.findFirst({ where: { tripId: plan.tripId, what: "Lunch" } });
    expect(row?.currency).toBe("JPY");
    expect(await rows()).toBe(2);
  });
  it("chaos: asked twice, an empty amount, a deleted trip: nothing more is written", async () => {
    const before = await rows();
    for (let n = 0; n < 2; n++) expect(JSON.stringify((await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", amount: 500, date: "2026-12-25" }, ken)).result)).toContain(ASK);
    expect(JSON.stringify((await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", date: "2026-12-25" }, ken)).result)).toContain(ASK);
    const gone: any = (await executeTool("add_expense", { tripId: "no-such-trip", paidBy: "Pat", amount: 500, date: "2026-12-25" }, ken)).result;
    expect(gone.error).toBeTruthy();
    const empty: any = (await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", currency: "USD", date: "2026-12-25" }, ken)).result;
    expect(empty.kept).not.toBe(true);
    expect(await rows()).toBe(before);
  });
});

describe("S11 a notice's 'until' is that moment on the day's own clock", () => {
  it("on a Vietnam day: 9:00 AM Dec 25 is 2:00 AM UTC, and the confirmation says Vietnam time", async () => {
    clockAt("2026-12-20T16:00:00Z");
    const say: any = (await executeTool("tell_everyone", { tripId: plan.tripId, words: "The bus leaves at 9", until: "2026-12-25T09:00" }, ken)).result;
    expect(say.notSentYet).toBe(true);
    expect(say.say).toContain("until Fri 9:00 AM Vietnam time");
    const sent: any = (await executeTool("tell_everyone", { tripId: plan.tripId, words: "The bus leaves at 9", until: "2026-12-25T09:00", confirmed: true }, ken)).result;
    expect(sent.sent).toBe(true);
    const row = await prisma.tripAlert.findUnique({ where: { id: sent.id } });
    expect(row?.until?.toISOString()).toBe("2026-12-25T02:00:00.000Z");
  });
  it("on a Japan day of the same trip: 9:00 AM Jan 2 is midnight UTC", async () => {
    clockAt("2026-12-20T16:00:00Z");
    const sent: any = (await executeTool("tell_everyone", { tripId: plan.tripId, words: "The train leaves at 9", until: "2027-01-02T09:00", confirmed: true }, ken)).result;
    expect((await prisma.tripAlert.findUnique({ where: { id: sent.id } }))?.until?.toISOString()).toBe("2027-01-02T00:00:00.000Z");
  });
  it("a wrong date is refused, as before", async () => {
    clockAt("2026-12-20T16:00:00Z");
    const r: any = (await executeTool("tell_everyone", { tripId: plan.tripId, words: "x", until: "2026-13-45T09:00" }, ken)).result;
    expect(r.error).toMatch(/until must be/);
  });
});

// ── The fix round (Nov 17 2026) ──────────────────────────────────────────────────────────────────

describe("F1 two rooms in one hotel are two bookings, not an open question", () => {
  it("Stay D Hotel twice on one night, one row for Pat and one for Sam: no OPEN QUESTION, no SEPARATE BOOKINGS", () => {
    expect(stable.split("\n").filter((l) => l.startsWith("- Stay D Hotel")).length).toBe(2);
    expect(stable).toMatch(/^- Stay D Hotel \(City A\); sleeping there the nights of 2026-12-27 \(Sun\); check out the morning of 2026-12-28 \(Mon\);.*; for Pat$/m);
    expect(stable).toMatch(/^- Stay D Hotel \(City A\); sleeping there the nights of 2026-12-27 \(Sun\); check out the morning of 2026-12-28 \(Mon\);.*; for Sam$/m);
    expect(stable).not.toMatch(/OPEN QUESTION/);
    expect(stable).not.toMatch(/SEPARATE BOOKINGS/);
    expect(stable).not.toMatch(/Each couple's first night/);
  });
  it("and on the morning they check out, the check-out line carries no open question either", () => {
    const co = dayBlock("2026-12-28");
    expect(co).toContain("Check out · Stay D Hotel");
    expect(co).not.toMatch(/OPEN QUESTION|lists two places/);
  });
  it("two different stays, both for Everyone (or one with no 'for'), on one night: the open question still prints, in plan words", async () => {
    const cityA = plan.cities.get("city-a")!;
    const day = (s: string) => new Date(`${s}T00:00:00Z`);
    const made = await Promise.all([
      prisma.accommodation.create({ data: { tripId: plan.tripId, cityId: cityA, name: "Stay E Hotel", checkInDate: day("2027-02-01"), checkOutDate: day("2027-02-02"), forWhom: "Everyone" } }),
      prisma.accommodation.create({ data: { tripId: plan.tripId, cityId: cityA, name: "Stay F Hotel", checkInDate: day("2027-02-01"), checkOutDate: day("2027-02-02"), forWhom: "Everyone" } }),
      prisma.accommodation.create({ data: { tripId: plan.tripId, cityId: cityA, name: "Stay G Hotel", checkInDate: day("2027-02-05"), checkOutDate: day("2027-02-06"), forWhom: "" } }),
      prisma.accommodation.create({ data: { tripId: plan.tripId, cityId: cityA, name: "Stay H Hotel", checkInDate: day("2027-02-05"), checkOutDate: day("2027-02-06"), forWhom: "Sam" } }),
    ]);
    try {
      const text = (await buildGuideContextParts(plan.tripId, { phoneZone: PHONE, now: NOW })).stable;
      expect(text).toContain("OPEN QUESTION in the plan: more than one place is listed for these nights");
      // (either order: the four are made at once, and the context lists a night's places by id)
      expect(text).toMatch(/^ {2}2027-02-01 \(Mon\): Stay (E|F) Hotel and Stay (E|F) Hotel$/m);
      expect(text).toMatch(/^ {2}2027-02-05 \(Fri\): Stay (G|H) Hotel and Stay (G|H) Hotel$/m);
      expect(text).not.toMatch(/OPEN QUESTION in the Guide/);
      expect(text).not.toMatch(/Stay D Hotel and/);
    } finally {
      await prisma.accommodation.deleteMany({ where: { id: { in: made.map((m) => m.id) } } });
    }
  });
});

describe("F2 the people line says the plan has more people than Wander", () => {
  it("word for word, and not the old sentence", () => {
    expect(stable).toContain(`${NAMES.a}, ${NAMES.b}. The plan is for more people than have joined Wander, and Wander does not hold the full list yet. A line's "For" says who it applies to; "For Everyone" means everyone traveling that day. Asked who is on the trip, name who has joined Wander and say the plan's full list is not in Wander yet.`);
    expect(stable).not.toContain("may be smaller");
  });
});

describe("F3 a day spent getting there is headed 'on the way to'", () => {
  it("Dec 14 (a take-off on California's clock, no stay the night before) and Dec 15 (a take-off on Korea's, no stay the night before)", () => {
    expect(stable).toMatch(/^Monday, December 14 \(2026-12-14\) — on the way to City A, Vietnam \(Vietnam time\)$/m);
    expect(stable).toMatch(/^Tuesday, December 15 \(2026-12-15\) — on the way to City A, Vietnam \(Vietnam time\)$/m);
  });
  it("Jan 1 (a stay the night before) and Jan 2 (only a landing) are headed as before", () => {
    expect(stable).toMatch(/^Friday, January 1 \(2027-01-01\) — City B, Cambodia \(Cambodia time\), with Backroads$/m);
    expect(stable).toMatch(/^Saturday, January 2 \(2027-01-02\) — City C, Japan \(Japan time\)$/m);
    expect(stable).not.toMatch(/on the way to City (B|C)/);
  });
  it("no other day of the trip says it", () => {
    expect(stable.match(/on the way to/g)?.length).toBe(2);
  });
});

describe("F6 a plan trip is sent three tool descriptions that no longer say Japan", () => {
  const OLD = [
    "Japan time, YYYY-MM-DDTHH:MM, when its moment has passed (a bus leaving at 8:15 tomorrow → that time). Only for a message about a moment; otherwise leave out (it shows for 3 days).",
    "JPY (yen) unless they said dollars",
    "Japan dates, YYYY-MM-DD (today if none). Up to 16.",
  ];
  const NEW = [
    "That day's own clock, YYYY-MM-DDTHH:MM, when its moment has passed (a bus leaving at 8:15 tomorrow → that time). Only for a message about a moment; otherwise leave out (it shows for 3 days).",
    "Only the currency they said: JPY (yen) or USD (dollars). Leave out when they said none.",
    "The trip's dates, YYYY-MM-DD (today if none). Up to 16.",
  ];
  it("the request's tools hold the three new descriptions and none of the three old", async () => {
    sentToModel.length = 0;
    const r = await request(app).post("/api/chat").set("Authorization", `Bearer ${tok}`).send({
      message: "Hello", context: { page: "Home", tripId: plan.tripId }, history: [],
      clientTime: { iso: NOW.toISOString(), localDate: "2026-12-20", localTime: "9:00 AM", weekday: "Sunday", timeZone: PHONE },
    });
    expect(r.status).toBe(200);
    const sentTools = JSON.stringify(sentToModel[0].tools);
    for (const w of NEW) expect(sentTools).toContain(JSON.stringify(w).slice(1, -1));
    for (const w of OLD) expect(sentTools).not.toContain(JSON.stringify(w).slice(1, -1));
  });
  it("the shared list is never changed by it", () => {
    const shared = JSON.stringify(scoutTools);
    for (const w of OLD) expect(shared).toContain(JSON.stringify(w).slice(1, -1));
    for (const w of NEW) expect(shared).not.toContain(JSON.stringify(w).slice(1, -1));
  });
});

describe("F7 a currency Wander can't keep is never kept as yen", () => {
  const rows = () => prisma.tripExpense.count({ where: { tripId: plan.tripId } });
  const NO_KEEP = "Wander keeps yen and US dollars only so far, so nothing was kept.";
  it("plan trip, Vietnam day, VND: nothing is written", async () => {
    const before = await rows();
    const r: any = (await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", amount: 600000, currency: "VND", what: "Dinner", date: "2026-12-20" }, ken)).result;
    expect(r).toEqual({ kept: false, question: NO_KEEP });
    expect(await rows()).toBe(before);
  });
  it("plan trip, Vietnam day, JPY said: kept as yen", async () => {
    const before = await rows();
    const r: any = (await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", amount: 1500, currency: "JPY", what: "Yen on a Vietnam day", date: "2026-12-20" }, ken)).result;
    expect(r.kept).toBe(true);
    expect((await prisma.tripExpense.findFirst({ where: { tripId: plan.tripId, what: "Yen on a Vietnam day" } }))?.currency).toBe("JPY");
    expect(await rows()).toBe(before + 1);
  });
  it("every spelling of yen and dollars is still kept; every other currency is refused (EUR, dong, riel, an empty word is 'none said')", async () => {
    const before = await rows();
    for (const c of ["yen", "¥", "円", "usd", "$", "dollar", "Dollars"]) {
      expect(((await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", amount: 5, currency: c, what: `spelled ${c}`, date: "2027-01-02" }, ken)).result as any).kept, c).toBe(true);
    }
    expect(await rows()).toBe(before + 7);
    for (const c of ["EUR", "dong", "riel", "THB", "VND "]) {
      expect(((await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", amount: 5, currency: c, what: "nope", date: "2027-01-02" }, ken)).result as any).kept, c).toBe(false);
    }
    expect(await rows()).toBe(before + 7);
  });
  it("change_expense with VND: the row is as it was", async () => {
    const kept: any = (await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", amount: 40, currency: "USD", what: "Change me", date: "2027-01-02" }, ken)).result;
    expect(kept.kept).toBe(true);
    const was = await prisma.tripExpense.findUnique({ where: { id: kept.id } });
    const r: any = (await executeTool("change_expense", { tripId: plan.tripId, id: kept.id, amount: 600000, currency: "VND" }, ken)).result;
    expect(r).toEqual({ changed: false, question: "Wander keeps yen and US dollars only so far, so nothing was changed." });
    expect(await prisma.tripExpense.findUnique({ where: { id: kept.id } })).toEqual(was);
  });
});

describe("F8 Scout's notes and notices are on the day's clock on a plan trip", () => {
  const made: { notes: string[]; alerts: string[] } = { notes: [], alerts: [] };
  afterAll(async () => {
    await prisma.tripNote.deleteMany({ where: { id: { in: made.notes } } });
    await prisma.tripAlert.deleteMany({ where: { id: { in: made.alerts } } });
  });
  it("a note and a notice made at 11:30 PM Dec 20 in Vietnam, asked ten minutes later: still Dec 20", async () => {
    const created = new Date("2026-12-20T16:30:00Z");
    const mk = (source: string, text: string, n: number) => prisma.tripNote.create({ data: { tripId: plan.tripId, travelerId: plan.travelers.pat, authorName: NAMES.a, clientId: `f8-${n}`, original: text, text, source, createdAt: created } });
    made.notes.push((await mk("typed", "Bring the tea to Place C", 1)).id, (await mk("scout-answer", "The list Scout made", 2)).id);
    made.alerts.push((await prisma.tripAlert.create({ data: { tripId: plan.tripId, fromId: plan.travelers.sam, fromName: NAMES.b, text: "The bus leaves at nine", createdAt: created } })).id);
    clockAt("2026-12-20T16:40:00Z");
    sentToModel.length = 0;
    const r = await request(app).post("/api/chat").set("Authorization", `Bearer ${tok}`).send({
      message: "What did I keep?", context: { page: "Home", tripId: plan.tripId }, history: [],
      clientTime: { iso: "2026-12-20T16:40:00Z", localDate: "2026-12-20", localTime: "8:40 AM", weekday: "Sunday", timeZone: PHONE },
    });
    expect(r.status).toBe(200);
    const sent = JSON.stringify(sentToModel[0].messages);
    expect(sent).toContain("kept today");
    expect(sent).toContain("kept Dec 20, 11:30 PM Vietnam time");
    expect(sent).toContain("From Sam Hashplan, Sun, Dec 20: ");        // (a notice's day, in the form Scout is always given one)
    expect(sent).toContain("The bus leaves at nine");
    // (the phone's own calendar line says "tomorrow is Monday, Dec 21", which is true; nothing KEPT or TOLD says it)
    expect(sent).not.toContain("December 21");
    expect(sent).not.toMatch(/kept [^"]*Dec 21|kept Monday|Mon, Dec 21: /);
  });
});

describe("F9 a plan trip's tool results never say the Guide, a sheet, a tab or a cell", () => {
  const WORDS = [/\bGuide\b/i, /\bsheet\b/i, /spreadsheet/i, /her tab/i, /\btabs?\b/i, /\bcell\b/i, /rail sheet/i, /\bxlsx\b/i];
  it("every read tool", async () => {
    clockAt("2026-12-20T16:00:00Z");
    const t = plan.tripId;
    const dayId = (await prisma.day.findFirst({ where: { tripId: t, date: new Date("2026-12-20T00:00:00Z") } }))!.id;
    const calls: [string, any][] = [
      ["get_trip_summary", { tripId: t }], ["get_all_days", { tripId: t }], ["get_day_details", { dayId }], ["get_city_experiences", { tripId: t, cityId: plan.cities.get("city-a")! }],
      ["get_weather", { tripId: t, dates: ["2026-12-20"] }], ["packing_tips", { tripId: t }], ["money_so_far", { tripId: t }],
      ["my_alerts", { tripId: t }], ["get_my_notes", { tripId: t }], ["get_todos", { tripId: t }], ["get_same_day_plans", { tripId: t, date: "2026-12-20" }],
      ["check_travel_readiness", { tripId: t }], ["get_open_decisions", { tripId: t }], ["get_group_interests", { tripId: t }], ["list_hidden_cities", { tripId: t }],
    ];
    const hits: string[] = [];
    for (const [tool, input] of calls) {
      // (a web address is a link's own text, not a sentence of Wander's: packing_tips' source link has "guide" in its path)
      const text = JSON.stringify((await executeTool(tool, input, ken)).result).replace(/https?:\/\/[^"\s\\]+/g, "(link)");
      for (const w of WORDS) { const m = text.match(new RegExp(`.{0,60}${w.source}.{0,40}`, "i")); if (w.test(text)) hits.push(`${tool} ${w}: …${m?.[0]}…`); }
    }
    expect(hits).toEqual([]);
  });
});

describe("F11 on a plan trip with no currency said: ask unless the day is known to be in Japan", () => {
  const ASK = "Which currency? Wander keeps yen and US dollars only so far.";
  const rows = () => prisma.tripExpense.count({ where: { tripId: plan.tripId } });
  it("a date outside the trip's days (2026-11-17): kept false, nothing written", async () => {
    const before = await rows();
    const r: any = (await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", amount: 20000, what: "A deposit", date: "2026-11-17" }, ken)).result;
    expect(r.kept).toBe(false);
    expect(JSON.stringify(r)).toContain(ASK);
    expect(await rows()).toBe(before);
  });
  it("no date, at a clock before the trip starts: the same", async () => {
    clockAt("2026-11-17T18:00:00Z");
    const before = await rows();
    const r: any = (await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", amount: 20000, what: "Before we leave" }, ken)).result;
    expect(r.kept).toBe(false);
    expect(JSON.stringify(r)).toContain(ASK);
    expect(await rows()).toBe(before);
  });
  it("a Japan day: kept as yen, as before", async () => {
    const before = await rows();
    const r: any = (await executeTool("add_expense", { tripId: plan.tripId, paidBy: "Pat", amount: 900, what: "Tea in Japan", date: "2027-01-02" }, ken)).result;
    expect(r.kept).toBe(true);
    expect((await prisma.tripExpense.findFirst({ where: { tripId: plan.tripId, what: "Tea in Japan" } }))?.currency).toBe("JPY");
    expect(await rows()).toBe(before + 1);
  });
});

// ---- S2b-fix2 (Nov 17 2026) ----
const say = (t: string) => ({ type: "text", text: t, citations: null });
const callTool = (name: string, input: any) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id: `tu-${name}`, name, input }] });
const endWith = (t: string) => ({ stop_reason: "end_turn", content: [say(t)] });
const askChat = (message: string, extra: any = {}) => request(app).post("/api/chat").set("Authorization", `Bearer ${tok}`).send({
  message, context: { page: "Home", tripId: plan.tripId }, history: [], ...extra,
  clientTime: { iso: "2026-12-20T16:40:00Z", localDate: "2026-12-20", localTime: "8:40 AM", weekday: "Sunday", timeZone: PHONE },
});
const JPEG = "/9j/4AAQSkZJRgABAQEASABIAAD/";

describe("G1 get_my_notes says when a note was kept on the day's clock", () => {
  const ids: string[] = [];
  afterAll(async () => { await prisma.tripNote.deleteMany({ where: { id: { in: ids } } }); });
  it("a note made at 11:30 PM Dec 20 in Vietnam: 'Dec 20', '11:30 PM', 'Vietnam time'; never 'Dec 21' or 'Japan time'", async () => {
    ids.push((await prisma.tripNote.create({ data: { tripId: plan.tripId, travelerId: plan.travelers.pat, authorName: NAMES.a, clientId: "g1-1", original: "Tea for Place C", text: "Tea for Place C", source: "typed", createdAt: new Date("2026-12-20T16:30:00Z") } })).id);
    clockAt("2026-12-20T16:40:00Z");
    const r: any = (await executeTool("get_my_notes", { tripId: plan.tripId }, ken)).result;
    const text = JSON.stringify(r);
    expect(r.notes[0].kept).toBe("Sun, Dec 20, 11:30 PM Vietnam time");
    expect(r.order).toBe("newest first — 'kept' says when, with its clock");
    expect(text).not.toContain("Dec 21");
    expect(text).not.toContain("Japan time");
  });
});

describe("G2 change_my_note's 'add' stamps the time on the day's clock", () => {
  const ids: string[] = [];
  afterAll(async () => { await prisma.tripNote.deleteMany({ where: { id: { in: ids } } }); });
  const mk = async (n: number, at: string) => { const row = await prisma.tripNote.create({ data: { tripId: plan.tripId, travelerId: plan.travelers.pat, authorName: NAMES.a, clientId: `g2-${n}`, original: "First words", text: "First words", source: "typed", createdAt: new Date(at) } }); ids.push(row.id); return row.id; };
  it("a note made earlier the same day on Vietnam's clock: '11:40 PM — ', no weekday", async () => {
    const id = await mk(1, "2026-12-20T15:00:00Z");
    clockAt("2026-12-20T16:40:00Z");
    expect(((await executeTool("change_my_note", { tripId: plan.tripId, noteId: id, add: "Bought the tea" }, ken)).result as any).changed).toBe(true);
    expect((await prisma.tripNote.findUnique({ where: { id } }))!.text).toMatch(/\n\n11:40 PM — Bought the tea$/);
  });
  it("a note made the day before: 'Sun, Dec 20, 11:40 PM — '", async () => {
    const id = await mk(2, "2026-12-19T15:00:00Z");
    clockAt("2026-12-20T16:40:00Z");
    await executeTool("change_my_note", { tripId: plan.tripId, noteId: id, add: "Bought the tea" }, ken);
    expect((await prisma.tripNote.findUnique({ where: { id } }))!.text).toMatch(/\n\nSun, Dec 20, 11:40 PM — Bought the tea$/);
  });
});

describe("G3 and G4 a paper and a photo kept with no day go under today on the day's clock", () => {
  afterAll(async () => {
    await prisma.tripPaper.deleteMany({ where: { tripId: plan.tripId, title: "G3 ticket" } });
    await prisma.tripPhoto.deleteMany({ where: { tripId: plan.tripId } });
  });
  it("keep_paper at 11:40 PM Dec 20 in Vietnam, no date: the row's day is 2026-12-20", async () => {
    clockAt("2026-12-20T16:40:00Z");
    script.push(callTool("keep_paper", { title: "G3 ticket", summary: "A ticket" }), endWith("Kept it under Dec 20."));
    const r = await askChat("Keep this paper", { attachments: [{ mediaType: "image/jpeg", name: "ticket.jpg", data: JPEG }] });
    expect(r.status).toBe(200);
    const row = await prisma.tripPaper.findFirst({ where: { tripId: plan.tripId, title: "G3 ticket" } });
    expect(row?.dayDate).toBe("2026-12-20");
  });
  it("keep_photo at 11:40 PM Dec 20 in Vietnam, no date: the row's day is 2026-12-20", async () => {
    clockAt("2026-12-20T16:40:00Z");
    script.push(callTool("keep_photo", { caption: "G4 view" }), endWith("Kept it under Dec 20."));
    const r = await askChat("Keep this photo", { attachments: [{ mediaType: "image/jpeg", name: "view.jpg", data: JPEG }] });
    expect(r.status).toBe(200);
    const row = await prisma.tripPhoto.findFirst({ where: { tripId: plan.tripId }, orderBy: { createdAt: "desc" } });   // (a caption is kept only in the person's own words, so none)
    expect(row?.dayDate).toBe("2026-12-20");
  });
});

describe("G5 a step that stops for a tool and calls none never sends an empty message", () => {
  const emptyUser = () => sentToModel.some((p) => (p.messages || []).some((m: any) => m.role === "user" && Array.isArray(m.content) && m.content.length === 0));
  afterEach(() => { script.length = 0; });
  it("(a) a tool_use stop with no content, then a plain answer: that answer, 200, no empty user message", async () => {
    sentToModel.length = 0;
    script.push({ stop_reason: "tool_use", content: [] }, endWith("The plan has Stay A for that night."));
    const r = await askChat("Where do we sleep tonight?");
    expect(r.status).toBe(200);
    expect(r.body.reply).toContain("The plan has Stay A for that night.");
    expect(sentToModel.length).toBe(2);
    expect(emptyUser()).toBe(false);
  });
  it("(b) a tool_use stop with a few words and no tool ('Checking...'): not an answer, so asked again once; the answer is the second step's alone", async () => {
    sentToModel.length = 0;
    script.push({ stop_reason: "tool_use", content: [say("Checking...")] }, endWith("The plan has Stay A for that night."));
    const r = await askChat("Where do we sleep tonight?");
    expect(r.status).toBe(200);
    expect(r.body.reply).toBe("The plan has Stay A for that night.");
    expect(sentToModel.length).toBe(2);
    expect(emptyUser()).toBe(false);
  });
  it("(c) two such steps in a row: no third model call, and the phone gets the failure it has words and a Try again for, never an empty answer", async () => {
    sentToModel.length = 0;
    script.push({ stop_reason: "tool_use", content: [] }, { stop_reason: "tool_use", content: [] }, endWith("never reached"));
    const r = await askChat("Where do we sleep tonight?");
    expect(r.status).toBe(500);
    expect(r.body.error).toBe("Chat failed");
    expect(sentToModel.length).toBe(2);
    expect(emptyUser()).toBe(false);
  });
  it("(d) a tool_use stop with a whole answer written and no tool: the answer stands, one model call", async () => {
    sentToModel.length = 0;
    script.push({ stop_reason: "tool_use", content: [say("The plan has Stay A for that night, with check-in from 3:00 PM.")] }, endWith("never reached"));
    const r = await askChat("Where do we sleep tonight?");
    expect(r.status).toBe(200);
    expect(r.body.reply).toBe("The plan has Stay A for that night, with check-in from 3:00 PM.");
    expect(sentToModel.length).toBe(1);
    expect(emptyUser()).toBe(false);
  });
});

describe("G6 a weekday Scout says is checked against the calendar", () => {
  afterEach(() => { script.length = 0; });
  it("a first answer with 'Monday, Dec 22', a second with 'Tuesday, Dec 22': the second is the reply, two model calls, and the second call was told", async () => {
    sentToModel.length = 0;
    script.push(endWith("You sleep at Stay A the night of Monday, Dec 22."), endWith("You sleep at Stay A the night of Tuesday, Dec 22."));
    const r = await askChat("Where are we sleeping on the 22nd?");
    expect(r.status).toBe(200);
    expect(r.body.reply).toContain("Tuesday, Dec 22");
    expect(r.body.reply).not.toContain("Monday");
    expect(sentToModel.length).toBe(2);
    const told = JSON.stringify(sentToModel[1].messages.at(-1));
    expect(told).toContain(`(Wander) Your answer says \\"Monday, Dec 22\\", but on this trip's calendar that date is a Tuesday. Read the date again in DAY BY DAY or WHERE EVERYONE SLEEPS: the weekday written beside a date there is right. Then write your whole answer again, as your reply to the question — don't mention this check.`);
  });
  it("both answers wrong: the reply reads 'Dec 22' with no weekday", async () => {
    sentToModel.length = 0;
    script.push(endWith("You sleep at Stay A the night of Monday, Dec 22."), endWith("It is Stay A on Monday, Dec 22."));
    const r = await askChat("Where are we sleeping on the 22nd?");
    expect(r.status).toBe(200);
    expect(r.body.reply).toContain("It is Stay A on Dec 22.");
    expect(r.body.reply).not.toMatch(/Monday/);
    expect(sentToModel.length).toBe(2);
  });
  it("two wrong in one answer: one note naming both, each with the weekday it is", async () => {
    sentToModel.length = 0;
    script.push(endWith("Monday, Dec 22 and then Wed, Dec 24."), endWith("Tuesday, Dec 22 and then Thu, Dec 24."));
    await askChat("Walk me through it");
    expect(JSON.stringify(sentToModel[1].messages.at(-1))).toContain(`\\"Monday, Dec 22\\" (that date is a Tuesday) and \\"Wed, Dec 24\\" (that date is a Thursday). Read each date again in DAY BY DAY or WHERE EVERYONE SLEEPS`);
  });
  it("a right first answer: one model call, the reply unchanged", async () => {
    sentToModel.length = 0;
    script.push(endWith("You sleep at Stay A the night of Tuesday, Dec 22."));
    const r = await askChat("Where are we sleeping on the 22nd?");
    expect(r.body.reply).toBe("You sleep at Stay A the night of Tuesday, Dec 22.");
    expect(sentToModel.length).toBe(1);
  });
});
