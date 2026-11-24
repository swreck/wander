/**
 * Scout's packing answer on a trip built from a plan (Nov 23 2026). The plan's promise: "a checked list for each country
 * of the asker's own days, each fact with its source, never what Backroads already told them."
 *   - the asker's countries come from their own days abroad (the trip's list of who is abroad when); with no such list,
 *     or a person not on it, every country of the trip;
 *   - a note about one town (Hué's tombs, Angkor's temples, Shiga Kogen's cash) only when their days have that town;
 *   - the repellent note once, however many countries it covers;
 *   - each note keeps its page's own strength ("may refuse", "some", "discouraged", a habit is not a rule);
 *   - the weather: the forecast where they sleep when the days are near, past years when they are far off;
 *   - Japan's own trip gets Japan's list, exactly as it was.
 * Written before the code. No network is reached: Open-Meteo's forecast and archive are stubbed. Invented people only.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { cleanFixtures, makePlan, makeJapan, NAMES_OF } from "./fixtures/scout-fixtures.js";

process.env.JWT_SECRET = "test-secret-scout-plan-packing";
const { executeTool, scoutTools } = await import("../src/routes/chat.js");
const { planTools, PLAN_PACKING_RULE } = await import("../src/services/planTrip.js");
const { PACKING } = await import("../src/services/packing.js");
const { forgetTowns } = await import("../src/services/townSearch.js");
const { forgetTypical } = await import("../src/services/typicalWeather.js");
const prisma = new PrismaClient();

const VN = "Asia/Ho_Chi_Minh";
const who = (n: string, id: string) => ({ code: n, displayName: n, travelerId: id });
const clockAt = (iso: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(iso)); };
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const at0 = (s: string) => new Date(`${s}T00:00:00Z`);

let asked: string[] = [];
let archiveDown = false;
const jsonOf = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const stub = async (input: any) => {
  const url = String(input);
  asked.push(url);
  const u = new URL(url);
  if (u.hostname === "archive-api.open-meteo.com") {
    if (archiveDown) return jsonOf({ error: true }, 500);
    const start = u.searchParams.get("start_date")!;
    const time = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return jsonOf({ daily: { time, temperature_2m_max: time.map(() => 75), temperature_2m_min: time.map(() => 68), precipitation_sum: time.map((_, i) => (i < 2 ? 0.5 : 0)), snowfall_sum: time.map(() => 0) } });
  }
  if (u.hostname === "api.open-meteo.com" && u.searchParams.get("daily")) {
    const start = u.searchParams.get("start_date")!, end = u.searchParams.get("end_date") || addDays(start, 14);
    const time: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) time.push(d);
    return jsonOf({ daily: { time, temperature_2m_max: time.map(() => 80), temperature_2m_min: time.map(() => 70), precipitation_probability_max: time.map(() => 10), precipitation_sum: time.map(() => 0), weather_code: time.map(() => 1) } });
  }
  return jsonOf({});
};
const to = (host: string) => asked.filter((a) => new URL(a).hostname === host);
const ARCHIVE = "archive-api.open-meteo.com", FORECAST = "api.open-meteo.com";

let plan: Awaited<ReturnType<typeof makePlan>>;
let japan: Awaited<ReturnType<typeof makeJapan>>;
let pat: ReturnType<typeof who>, sam: ReturnType<typeof who>, lee: ReturnType<typeof who>, kim: ReturnType<typeof who>, patJp: ReturnType<typeof who>;
const packing = async (as = pat, tripId = plan.tripId) => (await executeTool("packing_tips", { tripId }, as)).result as any;
const section = (r: any, where: string) => r.sections.find((s: any) => s.where === where);
const says = (s: any) => (s?.notes ?? []).map((n: any) => n.say as string);
const noteOf = (r: any, re: RegExp) => r.sections.flatMap((s: any) => s.notes).find((n: any) => re.test(n.say));

beforeAll(async () => {
  await cleanFixtures(prisma, "packing-plan");
  await cleanFixtures(prisma, "packing-japan");
  plan = await makePlan(prisma, "packing-plan");
  japan = await makeJapan(prisma, "packing-japan");
  pat = who(NAMES_OF["packing-plan"].a, plan.travelers.pat);
  sam = who(NAMES_OF["packing-plan"].b, plan.travelers.sam);
  lee = who("Lee Hashplan", plan.travelers.pat);
  kim = who("Kim Hashplan", plan.travelers.pat);
  patJp = who(NAMES_OF["packing-japan"].a, japan.travelers.pat);
  vi.spyOn(globalThis, "fetch").mockImplementation(stub as any);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await cleanFixtures(prisma, "packing-plan");
  await cleanFixtures(prisma, "packing-japan");
  await prisma.$disconnect();
});
afterEach(() => { vi.useRealTimers(); asked = []; archiveDown = false; forgetTowns(); forgetTypical(); });

// 11:00 PM Dec 20 in Vietnam and Cambodia: on the trip, the days left all within reach of a forecast
const ON_TRIP = "2026-12-20T16:00:00Z";
// 10:00 AM Nov 23 in California: three weeks before the trip, every day of it more than 16 days ahead
const BEFORE = "2026-11-23T18:00:00Z";

describe("P1 a trip with no list of who is abroad when, and none of the towns a note is about", () => {
  it("every country of the trip in the trip's order, the repellent's own section after the two it covers", async () => {
    clockAt(ON_TRIP);
    const r = await packing();
    expect(r.sections.map((s: any) => s.where)).toEqual(["Vietnam", "Cambodia", "Vietnam and Cambodia", "Japan"]);
    expect(section(r, "Vietnam").towns).toEqual(["City A"]);
    expect(section(r, "Cambodia").towns).toEqual(["City B"]);
    expect(section(r, "Japan").towns).toEqual(["City C"]);
  });
  it("no note about Hué, Angkor or Shiga Kogen: the trip goes to none of them", async () => {
    clockAt(ON_TRIP);
    const r = await packing();
    expect(JSON.stringify(r.sections)).not.toMatch(/Hué|Angkor|Siem Reap|Shiga Kogen/);
    expect(says(section(r, "Vietnam"))).toHaveLength(2);
    expect(says(section(r, "Cambodia"))).toHaveLength(2);
    expect(says(section(r, "Vietnam and Cambodia"))).toHaveLength(1);
    expect(says(section(r, "Japan"))).toHaveLength(1);
  });
});

describe("P2 the asker's own countries and towns", () => {
  beforeAll(async () => {
    const city = async (name: string, country: string, timeZone: string, n: number, lat: number, lng: number, date: string) => {
      const c = await prisma.city.create({ data: { tripId: plan.tripId, name, country, timeZone, sequenceOrder: n, planKey: `pk-${n}`, latitude: lat, longitude: lng } });
      await prisma.day.create({ data: { tripId: plan.tripId, cityId: c.id, date: at0(date), dayType: "free" } });
    };
    await city("Hué", "Vietnam", VN, 11, 16.4637, 107.5909, "2026-12-27");
    await city("Siem Reap", "Cambodia", "Asia/Phnom_Penh", 12, 13.3671, 103.8448, "2026-12-31");
    await city("Shiga Kogen", "Japan", "Asia/Tokyo", 13, 36.7, 138.5, "2027-01-03");
    // (who is abroad when: Pat the whole trip; Sam for Vietnam and Cambodia; Lee for Vietnam alone; Kim is not listed.
    // Sam and Lee are listed by first name, as the real list is)
    const people: [string, number, string, string][] = [[NAMES_OF["packing-plan"].a, 1, "2026-12-14", "2027-01-03"], ["Sam", 2, "2026-12-25", "2027-01-01"], ["Lee", 3, "2026-12-14", "2026-12-28"]];
    for (const [i, [name, family, abroadFrom, abroadTo]] of people.entries())
      await prisma.tripPerson.create({ data: { tripId: plan.tripId, name, family, familyLabel: `Family ${family}`, abroadFrom, abroadTo, sortOrder: i } });
  });

  it("Pat, abroad the whole trip: every country, and each town's own notes", async () => {
    clockAt(ON_TRIP);
    const r = await packing(pat);
    expect(r.sections.map((s: any) => s.where)).toEqual(["Vietnam", "Cambodia", "Vietnam and Cambodia", "Japan"]);
    expect(section(r, "Vietnam").towns).toEqual(["City A", "Hué"]);
    expect(says(section(r, "Vietnam")).some((s: string) => /Hué/.test(s))).toBe(true);
    expect(says(section(r, "Cambodia")).some((s: string) => /Angkor/.test(s))).toBe(true);
    expect(says(section(r, "Japan")).filter((s: string) => /Shiga Kogen/.test(s))).toHaveLength(2);
  });
  it("Sam, abroad for Vietnam and Cambodia only: no Japan, and nothing of Shiga Kogen", async () => {
    clockAt(ON_TRIP);
    const r = await packing(sam);
    expect(r.sections.map((s: any) => s.where)).toEqual(["Vietnam", "Cambodia", "Vietnam and Cambodia"]);
    expect(section(r, "Vietnam").towns).toEqual(["City A", "Hué"]);
    expect(section(r, "Cambodia").towns).toEqual(["Siem Reap", "City B"]);
    expect(JSON.stringify(r)).not.toMatch(/Shiga Kogen|Japan/);
  });
  it("Lee, abroad for Vietnam alone: the repellent is one of Vietnam's notes, and says nothing of Cambodia", async () => {
    clockAt(ON_TRIP);
    const r = await packing(lee);
    expect(r.sections.map((s: any) => s.where)).toEqual(["Vietnam"]);
    const rep = noteOf(r, /repellent/i);
    expect(rep.say).toBe("An insect repellent with 20% or more DEET, for Vietnam.");
    expect(rep.why).toMatch(/CDC lists dengue, spread by mosquito bites, for Vietnam\./);
    expect(JSON.stringify(r)).not.toMatch(/Cambodia|Siem Reap|Angkor/);
    expect(r.noNote).toBeUndefined();
    // (yours, never theirs: Lee is home by Dec 28, so Stay B's nights, Dec 30 and 31, are no part of Lee's forecast)
    expect(r.weather.stays.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.weather)).not.toMatch(/City B|Stay B/);
  });
  it("Sam's forecast starts on his own first day, though the hotel is everyone's from Dec 15", async () => {
    clockAt(ON_TRIP);
    const r = await packing(sam);
    const a = r.weather.stays.find((s: any) => s.stay === "Stay A Hotel");
    expect(a.firstNight).toBe("2026-12-25");
    expect(a.nights).toBe("Fri, Dec 25");
  });
  it("Kim, who isn't on the list: every country of the trip", async () => {
    clockAt(ON_TRIP);
    const r = await packing(kim);
    expect(r.sections.map((s: any) => s.where)).toEqual(["Vietnam", "Cambodia", "Vietnam and Cambodia", "Japan"]);
  });
});

describe("P3 what the notes say, and how strongly", () => {
  let r: any;
  beforeAll(async () => { clockAt(ON_TRIP); r = await packing(pat); vi.useRealTimers(); });
  const all = () => r.sections.flatMap((s: any) => s.notes) as any[];

  it("every note has what to bring, why, who says so, and a link to the page", () => {
    expect(all().length).toBeGreaterThanOrEqual(10);
    for (const n of all()) {
      expect(n.say.length).toBeGreaterThan(10);
      expect(n.why.length).toBeGreaterThan(30);
      expect(n.from.length).toBeGreaterThan(2);
      expect(n.source).toMatch(/^https:\/\//);
    }
  });
  it("the repellent is said once, for both countries", () => {
    expect(all().filter((n) => /repellent/i.test(n.say))).toHaveLength(1);
    expect(noteOf(r, /repellent/i).say).toBe("An insect repellent with 20% or more DEET, for Vietnam and Cambodia.");
    expect(noteOf(r, /repellent/i).source).toMatch(/vietnam.*cambodia/);
  });
  it("dengue is said once, for the asker's own countries: CDC's table lists it for each", () => {
    // (both of CDC's pages list "Dengue · Mosquito bite · Avoid bug bites"; read Nov 24 2026)
    const sentences = (noteOf(r, /repellent/i).why as string).split(/(?<=\.)\s+/).filter((s) => /dengue/i.test(s));
    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toMatch(/CDC lists dengue, spread by mosquito bites, for Vietnam and Cambodia\.$/);
  });
  it("malaria: only what CDC's lists name; never 'no malaria' of a town they don't name; the rest is a doctor's question", () => {
    const why = noteOf(r, /repellent/i).why as string;
    expect(why).toMatch(/no \(or negligible\) transmission in the city of Siem Reap and at the main temple complex at Angkor Wat/);
    expect(why).toMatch(/don't name City A, Hué or City B/);
    expect(why).not.toMatch(/none in[^.]*(Hué|City A|City B)/i);
    expect(why).not.toMatch(/Hanoi/);   // (this trip has no Hanoi)
    expect(why).toMatch(/talk to your doctor/);
    expect(JSON.stringify(r.sections)).not.toMatch(/you (don't|do not) need (malaria )?(pills|medicine)/i);
  });
  it("Hué: staff 'may refuse', never 'will'; tied only to a tomb, temple, shrine or pagoda the plan shows", () => {
    const n = noteOf(r, /Hué/);
    expect(n.why).toMatch(/may refuse/);
    expect(n.why).not.toMatch(/\bwill\b|\bmust\b|required/i);
    expect(n.tieTo).toMatch(/tomb/);
    expect(n.from).toMatch(/Tuoi Tre/);
  });
  it("Angkor: its own code of conduct, 'prohibited' for the clothes and 'discouraged' for the bags", () => {
    const n = noteOf(r, /Angkor/);
    expect(n.why).toContain("\"Revealing clothes such as shorts and skirts above the knees and showing bare shoulders are prohibited in sacred places.\"");
    expect(n.why).toMatch(/discouraged/);
    expect(n.source).toBe("https://angkorenterprise.gov.kh/en/visitor-code-of-conduct");
  });
  it("Cambodia's dollar bills are a habit residents report, said as that", () => {
    const n = noteOf(r, /US bills/);
    expect(n.why).toMatch(/not an official rule/);
    expect(n.rule).toBeUndefined();
  });
  it("Shiga Kogen: 'some' places take only cash, never 'many' or 'most'", () => {
    const n = noteOf(r, /Yen in cash/);
    expect(n.why).toMatch(/some activities, restaurants and shops accept only cash/);
    expect(n.why).not.toMatch(/\bmany\b|\bmost\b|the one ATM|only ATM/i);
  });
  it("Vietnam's medicines note is the embassy's page, said as that and not as law", () => {
    const n = noteOf(r, /prescription/i);
    expect(n.why).toMatch(/names no law/);
    expect(n.why).toMatch(/7 days/);
    expect(n.why).toMatch(/10 days/);
  });
  it("Japan's medicines note is Japan's own, word for word", () => {
    const jp = PACKING.items.find((i) => (i.source || "").includes("jp.usembassy.gov"))!;
    const n = section(r, "Japan").notes.find((x: any) => x.say === jp.say);
    expect(n).toBeTruthy();
    expect(n.why).toBe(jp.why);
    expect(n.source).toBe(jp.source);
  });
  it("never what Backroads' own notes already tell them", () => {
    expect(JSON.stringify({ s: r.sections, a: r.about, e: r.end })).not.toMatch(/rain gear|rain jacket|wet-weather|fleece|long pants|light clothes|blank pages|six months|6 months/i);
  });
  it("no note for the Cambodian visa or Ho Chi Minh's Mausoleum: one unchecked, one not in the plan", () => {
    expect(all().some((n) => /visa/i.test(n.say) && /Cambodia/i.test(n.say))).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/Ho Chi Minh|Mausoleum/);
    expect(r.noNote.join(" ")).toMatch(/Cambodian visa/);
  });
  it("none of a spreadsheet trip's words, links aside", () => {
    const text = JSON.stringify(r).replace(/https?:\/\/[^"\s\\]+/g, "(link)");
    for (const w of [/\bGuide\b/i, /\bsheet\b/i, /spreadsheet/i, /\btabs?\b/i, /\bcell\b/i, /\bxlsx\b/i]) expect(text).not.toMatch(w);
  });
  it("ends with one line inviting them to say how they travel", () => {
    expect(r.end).toMatch(/how you like to travel/);
  });
});

describe("P4 the weather in the answer", () => {
  it("on the trip: the forecast where they sleep, and no past years", async () => {
    clockAt(ON_TRIP);
    const r = await packing(pat);
    expect(r.weather.stays.length).toBeGreaterThan(0);
    expect(r.weather.stays[0].town).toBe("City A");
    expect(r.weather.asOf).toBe("the live forecast (Open-Meteo), read 2026-12-20");
    expect(r.weather.pastYears).toBeUndefined();
    expect(to(ARCHIVE)).toEqual([]);
    expect(to(FORECAST).some((a) => a.includes("timezone=Asia%2FHo_Chi_Minh"))).toBe(true);
    // (the plan trip's own instructions: none of Japan's)
    expect(r.weather.how).not.toMatch(/her Guide|¥|convenience stores|warm layers and gloves/);
    expect(r.weather.how).toMatch(/Backroads' own notes already tell them to bring rain gear, wet-weather shoes, a fleece and long pants for the north, and light clothes: never mention any of those/);
  });
  it("three weeks before: no forecast yet, so past years for each town they sleep in, said as past years", async () => {
    clockAt(BEFORE);
    const r = await packing(pat);
    expect(r.weather.stays).toBeUndefined();
    expect(r.weather.asOf).toBeUndefined();
    expect(r.weather.pastYears.length).toBeGreaterThanOrEqual(3);
    for (const p of r.weather.pastYears) {
      // (the five years before the day's own: a December 2026 day reads 2021–2025, a January 2027 day 2022–2026)
      expect(p.typical).toMatch(p.around.includes("Jan") ? /^Past years, not a forecast: in the same week of 2022–2026, / : /^Past years, not a forecast: in the same week of 2021–2025, /);
      expect(p.around).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (Dec|Jan) \d+$/);
    }
    expect(r.weather.pastYears.some((p: any) => p.typical.includes("City A's highs"))).toBe(true);
    expect(r.weather.pastYears.some((p: any) => p.typical.includes("Shiga Kogen's highs"))).toBe(true);
    expect(r.weather.how).toMatch(/Never as a forecast, a chance or what to expect/);
    expect(to(FORECAST)).toEqual([]);
    // (one reading a town, five years each: never a reading for every day)
    expect(to(ARCHIVE).length).toBeLessThanOrEqual(6 * 5);
  });
  it("three weeks before, for Sam: only the towns of his own days", async () => {
    clockAt(BEFORE);
    const r = await packing(sam);
    expect(r.weather.pastYears.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(r.weather)).not.toMatch(/Shiga Kogen|City C/);
  });
  it("past years that can't be read: the notes all the same, and no weather said", async () => {
    clockAt(BEFORE);
    archiveDown = true;
    const r = await packing(pat);
    expect(r.weather).toBeUndefined();
    expect(r.sections.map((s: any) => s.where)).toEqual(["Vietnam", "Cambodia", "Vietnam and Cambodia", "Japan"]);
  });
});

// (Nov 24 2026: "Do I need a visa for Cambodia?" and "Is there malaria?" are answered from these notes, and from nothing else)
describe("P4b notesOnly: a visa, vaccine or malaria question gets the notes alone", () => {
  const only = async (as = pat, extra: any = { notesOnly: true }) => (await executeTool("packing_tips", { tripId: plan.tripId, ...extra }, as)).result as any;
  it("the same notes and the same 'no checked note' line, with no weather read and no closing line", async () => {
    clockAt(ON_TRIP);
    const whole = await packing(pat);
    asked = [];
    const r = await only();
    expect(Object.keys(r).sort()).toEqual(["about", "noNote", "sections"]);
    expect(r.sections).toEqual(whole.sections);
    expect(r.noNote).toEqual(whole.noNote);
    expect(r.noNote.join(" ")).toMatch(/The Cambodian visa: Wander has no checked note on it\./);
    expect(to(FORECAST)).toEqual([]);
    expect(to(ARCHIVE)).toEqual([]);
    expect(r.about).not.toMatch(/weather|forecast|how you like to travel/i);
  });
  it("still only the asker's own countries", async () => {
    const r = await only(sam);
    expect(r.sections.map((s: any) => s.where)).toEqual((await packing(sam)).sections.map((s: any) => s.where));
  });
  it("only a true notesOnly counts: 'true', 1 and an empty value give the whole answer", async () => {
    clockAt(ON_TRIP);
    for (const v of ["true", 1, null, undefined, {}]) expect((await only(pat, { notesOnly: v })).end, String(v)).toMatch(/how you like to travel/);
  });
  it("Japan's own trip ignores it: Japan's list, as it always did", async () => {
    clockAt(BEFORE);
    expect((await executeTool("packing_tips", { tripId: japan.tripId, notesOnly: true }, patJp)).result).toBe(PACKING);
  });
});

describe("P5 Japan's own trip gets Japan's list, as it always did", () => {
  it("with no stay in reach of a forecast: the list itself, nothing added", async () => {
    clockAt(BEFORE);
    const r = (await executeTool("packing_tips", { tripId: japan.tripId }, patJp)).result;
    expect(r).toBe(PACKING);
  });
  it("on the trip: the same seven items, with Japan's own weather instructions", async () => {
    // (the fixture's Tokyo has no point and the test no map key: give it one, so there is a forecast to read)
    await prisma.city.update({ where: { id: japan.cities.get("tokyo")! }, data: { latitude: 35.6895, longitude: 139.69171 } });
    clockAt("2026-10-13T03:00:00Z");
    const r = (await executeTool("packing_tips", { tripId: japan.tripId }, patJp)).result as any;
    expect(r.items).toEqual(PACKING.items);
    expect(r.sections).toBeUndefined();
    expect(r.weather.how).toContain("tied to what Backroads' itinerary or her Guide has them doing that day");
    expect(r.weather.how).toContain("convenience stores sell them for under ¥1,000");
  });
});

describe("P6 what a plan trip is told about packing_tips", () => {
  const NEW = "Wander's checked packing notes for this trip: for each country of the asker's own days, what to bring and why, each with who says so and a link to the page, and the weather where they sleep (the forecast when the days are near, past years when they are far off). Use when someone asks what to pack or bring, for the whole trip or for one country, and for a question about a visa, an entry paper, vaccines, malaria or medicines (then with notesOnly).";
  const tool = (tools: any[]) => tools.find((t) => t.name === "packing_tips");
  it("the plan trip's copy no longer says Japan", () => {
    expect(tool(planTools(scoutTools as any[])).description).toBe(NEW);
  });
  it("the shared list is never changed by it", () => {
    expect(tool(scoutTools as any[]).description).toContain("wish they'd brought to Japan");
  });
  it("the plan trip's packing rule is one line in rule 46f's place, with none of Japan's own", () => {
    expect(PLAN_PACKING_RULE.startsWith("46f. Packing:")).toBe(true);
    expect(PLAN_PACKING_RULE).not.toContain("\n");
    expect(PLAN_PACKING_RULE).not.toMatch(/Julie|ryokan|bullet train|Izu|Nikko|\bGuide\b|\bsheet\b|\btab\b|\bcell\b/);
    expect(PLAN_PACKING_RULE).toMatch(/answer only from what it returns/);
    expect(PLAN_PACKING_RULE).toMatch(/"may be refused" is never "will be"/);
    expect(PLAN_PACKING_RULE).toMatch(/Wander has no checked note on it/);
  });
});
