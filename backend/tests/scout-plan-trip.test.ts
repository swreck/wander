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
import { PrismaClient } from "@prisma/client";
import { cleanFixtures, makePlan, NAMES_OF } from "./fixtures/scout-fixtures.js";

const sentToModel = vi.hoisted(() => [] as any[]);
vi.mock("@anthropic-ai/sdk", async (orig) => {
  const real: any = await orig();
  class Fake extends real.default {
    constructor(o?: any) {
      super({ apiKey: "test", ...o });
      (this as any).messages = {
        create: async (p: any) => {
          sentToModel.push(p);
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
  it("and nothing in the server's source reads sample_entries but the plan tool (a source check)", async () => {
    const { execFileSync } = await import("child_process");
    // (grep exits 1 when nothing matches: that is the pass)
    let hits: string[] = [];
    try { hits = execFileSync("grep", ["-rlE", "sampleEntry|sample_entries", "src"], { cwd: new URL("..", import.meta.url).pathname }).toString().trim().split("\n").filter(Boolean); } catch { /* no match */ }
    expect(hits).toEqual([]);
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
  can't keep that currency yet, and keep nothing.`;
  // (rules 61 and 63 of the prompt: what Japan's says, and what a plan trip's says in its place)
  const SWAPS: [string, string][] = [
    ["the amount as said, yen unless they said dollars, and what it was for", "the amount as said, the currency only if they said one (on a day in Japan, yen unless they said dollars), and what it was for"],
    ["gets until: that moment, Japan time; it's gone", "gets until: that moment on that day's own clock; it's gone"],
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
  it("F5 rules 61 and 63 say the currency only if said, and the day's own clock", () => {
    for (const [was, now] of SWAPS) {
      expect(system).toContain(now);
      expect(system).not.toContain(was);
    }
  });
  it("and nothing else differs from Japan's prompt: undo the four changes and it is Japan's, by its hash", () => {
    const firstEnd = system.indexOf("\n\n");
    let undone = (system.slice(0, firstEnd + 2) + system.slice(firstEnd + 2 + BLOCK.length + 2)).replace(NEW_RULE, OLD_RULE);
    for (const [was, now] of SWAPS) undone = undone.replace(now, was);
    expect(sha(undone)).toBe(JAPAN_SYSTEM_HASH);
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
      expect(text).toContain("  2027-02-01 (Mon): Stay E Hotel and Stay F Hotel");
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
