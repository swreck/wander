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
const { executeTool } = await import("../src/routes/chat.js");
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
- Languages: "INTO JAPANESE" is for Japan. In Vietnam the same rule gives Vietnamese, in Cambodia Khmer.
- Money: Wander keeps yen and US dollars only so far. Outside Japan a number with no currency is not yen: ask which
  currency. For dong, riel or any other currency, say Wander can't keep that currency yet, and keep nothing.`;
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
  it("and nothing else differs from Japan's prompt: undo the two changes and it is Japan's, by its hash", () => {
    const firstEnd = system.indexOf("\n\n");
    const undone = (system.slice(0, firstEnd + 2) + system.slice(firstEnd + 2 + BLOCK.length + 2)).replace(NEW_RULE, OLD_RULE);
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
