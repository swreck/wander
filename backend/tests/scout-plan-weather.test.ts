/**
 * Scout's weather on a trip built from a plan (Nov 23 2026): a town on the way in any of the trip's countries, on that
 * town's own clock; a town Wander can't place is said as not placed; a day more than 16 days ahead comes with what that
 * week was like there in past years, said as past years. Japan's own trip is as it was: no place search, no past years.
 * No network is reached: Open-Meteo's forecast, place search and archive are stubbed. Invented trips and people only.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { cleanFixtures, makePlan, makeJapan, NAMES_OF } from "./fixtures/scout-fixtures.js";

process.env.JWT_SECRET = "test-secret-scout-plan-weather";
const { executeTool, scoutTools } = await import("../src/routes/chat.js");
const { planTools, planSystemPrompt } = await import("../src/services/planTrip.js");
const { forgetTowns } = await import("../src/services/townSearch.js");
const { forgetTypical } = await import("../src/services/typicalWeather.js");
const prisma = new PrismaClient();

const VN = "Asia/Ho_Chi_Minh";
const who = (n: string, id: string) => ({ code: n, displayName: n, travelerId: id });
const clockAt = (iso: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(iso)); };
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// What the place search answers, by "<country code>|<name asked>" (shapes as Open-Meteo gives them)
const PLACES: Record<string, any[]> = {
  "VN|Da Nang": [{ name: "Da Nang", feature_code: "PPLA", country: "Vietnam", country_code: "VN", admin1: "Da Nang City", population: 988561, latitude: 16.06778, longitude: 108.22083, timezone: VN }],
  "JP|Nagano": [{ name: "Nagano", feature_code: "PPLA", country: "Japan", country_code: "JP", admin1: "Nagano", population: 360176, latitude: 36.65, longitude: 138.18333, timezone: "Asia/Tokyo" }],
};
let asked: string[] = [];          // every address fetched, in order
let archiveDown = false;
const jsonOf = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const stub = async (input: any) => {
  const url = String(input);
  asked.push(url);
  const u = new URL(url);
  if (u.hostname === "geocoding-api.open-meteo.com") return jsonOf({ results: PLACES[`${u.searchParams.get("countryCode") ?? ""}|${u.searchParams.get("name")}`] });
  if (u.hostname === "archive-api.open-meteo.com") {
    if (archiveDown) return jsonOf({ error: true }, 500);
    const start = u.searchParams.get("start_date")!;
    const time = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    // (every past week the same: 75 and 68, heavy rain on its first two days, no snow)
    return jsonOf({ daily: { time, temperature_2m_max: time.map(() => 75), temperature_2m_min: time.map(() => 68), precipitation_sum: time.map((_, i) => (i < 2 ? 0.5 : 0)), snowfall_sum: time.map(() => 0) } });
  }
  if (u.hostname === "api.open-meteo.com" && (u.searchParams.get("hourly") || "").startsWith("temperature_2m")) {
    const d = u.searchParams.get("start_date")!;
    return jsonOf({ elevation: 10, hourly: { time: Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`), temperature_2m_best_match: Array(24).fill(77), precipitation_probability_best_match: Array(24).fill(20) } });
  }
  if (u.hostname === "api.open-meteo.com" && u.searchParams.get("daily")) {
    const start = u.searchParams.get("start_date")!;
    const time = Array.from({ length: 15 }, (_, i) => addDays(start, i));
    return jsonOf({ daily: { time, temperature_2m_max: time.map(() => 80), temperature_2m_min: time.map(() => 70), precipitation_probability_max: time.map(() => 10), precipitation_sum: time.map(() => 0), weather_code: time.map(() => 1) } });
  }
  return jsonOf({});   // (anything else: no answer worth reading)
};
const to = (host: string) => asked.filter((a) => new URL(a).hostname === host);
const SEARCH = "geocoding-api.open-meteo.com", ARCHIVE = "archive-api.open-meteo.com", FORECAST = "api.open-meteo.com";

let plan: Awaited<ReturnType<typeof makePlan>>;
let japan: Awaited<ReturnType<typeof makeJapan>>;
let pat: ReturnType<typeof who>;
let patJp: ReturnType<typeof who>;
const weather = async (input: Record<string, unknown>, as = pat, tripId = plan.tripId) => (await executeTool("get_weather", { tripId, ...input }, as)).result as any;

beforeAll(async () => {
  await cleanFixtures(prisma, "weather-plan");
  await cleanFixtures(prisma, "weather-japan");
  plan = await makePlan(prisma, "weather-plan");
  japan = await makeJapan(prisma, "weather-japan");
  // (a city of the trip whose name carries an accent, and one the trip no longer shows)
  await prisma.city.create({ data: { tripId: plan.tripId, name: "Hué", country: "Vietnam", timeZone: VN, sequenceOrder: 7, planKey: "city-hue", latitude: 16.4637, longitude: 107.5909 } });
  await prisma.city.create({ data: { tripId: plan.tripId, name: "Goneville", country: "Thailand", timeZone: "Asia/Bangkok", sequenceOrder: 8, planKey: "city-gone", latitude: 13.75, longitude: 100.5, hidden: true } });
  pat = who(NAMES_OF["weather-plan"].a, plan.travelers.pat);
  patJp = who(NAMES_OF["weather-japan"].a, japan.travelers.pat);
  vi.spyOn(globalThis, "fetch").mockImplementation(stub as any);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await cleanFixtures(prisma, "weather-plan");
  await cleanFixtures(prisma, "weather-japan");
  await prisma.$disconnect();
});
afterEach(() => { vi.useRealTimers(); asked = []; archiveDown = false; forgetTowns(); forgetTypical(); });

// 11:00 PM Dec 20 in Vietnam and Cambodia; 1:00 AM Dec 21 in Japan
const ON_TRIP = "2026-12-20T16:00:00Z";
// 10:00 AM Nov 23 in California: three weeks before the trip, every day of it more than 16 days ahead
const BEFORE = "2026-11-23T18:00:00Z";

describe("W1 a town that is one of the trip's own cities, accents aside", () => {
  it("'Hue' is the trip's Hué: its own point and clock, named as the trip names it, and no place search", async () => {
    clockAt(ON_TRIP);
    const r = await weather({ town: "Hue", dates: ["2026-12-21"] });
    expect(r.days[0].none).toBeUndefined();
    expect(r.days[0].lines[0]).toContain("Hué");
    expect(to(SEARCH)).toEqual([]);
    expect(to(FORECAST).some((a) => a.includes("latitude=16.4637&longitude=107.5909") && a.includes("timezone=Asia%2FHo_Chi_Minh"))).toBe(true);
    expect(r.source).toBe("Wander's forecast for Hué (Open-Meteo), the same source as the day pages");
    expect(r.placed).toBeUndefined();
    expect(JSON.stringify(r)).not.toMatch(/Japan time/);
  });
  it("a city the trip no longer shows is not one of its towns, and its country is not one of the trip's", async () => {
    clockAt(ON_TRIP);
    const r = await weather({ town: "Goneville", dates: ["2026-12-21"] });
    expect(r.days[0].none).toBe("No forecast for Goneville: Wander couldn't place a town of that name in Vietnam, Cambodia or Japan.");
    expect(to(SEARCH).map((a) => new URL(a).searchParams.get("countryCode")).sort()).toEqual(["JP", "KH", "VN"]);
  });
});

describe("W2 a town on the way, found by the place search inside the trip's countries", () => {
  it("'Da Nang': searched once in each of the trip's countries, forecast at the town found, on its own clock", async () => {
    clockAt(ON_TRIP);
    const r = await weather({ town: "Da Nang", dates: ["2026-12-21"] });
    expect(to(SEARCH).map((a) => `${new URL(a).searchParams.get("countryCode")}|${new URL(a).searchParams.get("name")}`).sort()).toEqual(["JP|Da Nang", "KH|Da Nang", "VN|Da Nang"]);
    expect(to(FORECAST).some((a) => a.includes("latitude=16.06778&longitude=108.22083") && a.includes("timezone=Asia%2FHo_Chi_Minh"))).toBe(true);
    expect(to(FORECAST).some((a) => a.includes("latitude=16.06778") && a.includes("Asia%2FTokyo"))).toBe(false);
    expect(r.days[0].lines[0]).toContain("Da Nang");
    expect(r.days[0].lines[0]).toContain("80");
    expect(r.placed).toBe("Da Nang in Vietnam, found by Open-Meteo's place search");
    expect(r.source).toBe("Wander's forecast for Da Nang (Open-Meteo), the same source as the day pages");
    expect(r.townHow).toBeUndefined();
    expect(JSON.stringify(r)).not.toMatch(/Japan time/);
    // (a named town has no storm watch and no forecasts kept for the day page)
    expect(r.stormWatch).toBeUndefined();
  });
  it("hour by hour for it: the town's own hours, said on its own clock", async () => {
    clockAt(ON_TRIP);
    const r = await weather({ town: "Da Nang", dates: ["2026-12-21"], hours: { from: 13, to: 15 } });
    expect(r.days[0].hourly).toHaveLength(1);
    expect(r.days[0].hourly[0].place).toBe("Da Nang");
    expect(r.days[0].hourly[0].hours).toEqual(["1 PM: 77°F, 20% chance of rain", "2 PM: 77°F, 20% chance of rain", "3 PM: 77°F, 20% chance of rain"]);
    const hourly = to(FORECAST).filter((a) => a.includes("hourly=temperature_2m"));
    expect(hourly.length).toBe(1);
    expect(hourly[0]).toContain("latitude=16.06778&longitude=108.22083");
    expect(hourly[0]).toContain("timezone=Asia%2FHo_Chi_Minh");
    expect(r.hourlyHow).toContain("Vietnam time");
    expect(r.hourlyHow).not.toContain("Japan time");
  });
  it("a town in the trip's Japan is found too, on Japan's clock", async () => {
    clockAt(ON_TRIP);
    const r = await weather({ town: "Nagano", dates: ["2026-12-22"] });
    expect(r.days[0].lines[0]).toContain("Nagano");
    expect(to(FORECAST).some((a) => a.includes("latitude=36.65&longitude=138.18333") && a.includes("timezone=Asia%2FTokyo"))).toBe(true);
    expect(r.placed).toBe("Nagano in Japan, found by Open-Meteo's place search");
  });
});

describe("W3 a town's days are counted on the town's own clock", () => {
  it("at 11 PM Dec 20 in Vietnam, Dec 20 is over in the trip's Japan city and not in Da Nang", async () => {
    clockAt(ON_TRIP);
    const jp = await weather({ town: "City C", dates: ["2026-12-20"] });
    expect(jp.days[0].none).toBe("No forecast: that day is over.");
    const vn = await weather({ town: "Da Nang", dates: ["2026-12-20"] });
    expect(vn.days[0].none).toBeUndefined();
    expect(vn.days[0].lines[0]).toContain("Da Nang");
  });
  it("no date asked: the town's own today", async () => {
    clockAt(ON_TRIP);
    expect((await weather({ town: "City C" })).days.map((d: any) => d.date)).toEqual(["2026-12-21"]);
    expect((await weather({ town: "Da Nang" })).days.map((d: any) => d.date)).toEqual(["2026-12-20"]);
  });
});

describe("W4 a town Wander can't place is said as not placed", () => {
  it("a sight ('Angkor Wat'): no forecast, the trip's countries named, and how to ask again", async () => {
    clockAt(ON_TRIP);
    const r = await weather({ town: "Angkor Wat", dates: ["2026-12-30", "2026-12-31"] });
    for (const d of r.days) {
      expect(d.none).toBe("No forecast for Angkor Wat: Wander couldn't place a town of that name in Vietnam, Cambodia or Japan.");
      expect(d.lines).toBeUndefined();
      expect(d.typical).toBeUndefined();
    }
    expect(r.townHow).toBe("Wander places towns by their own names, not sights. Ask again with the town people stay in to see it, only if you are sure which town that is, and say that the forecast is that town's. Otherwise say Wander couldn't place it. Never give a forecast of your own.");
    expect(to(FORECAST)).toEqual([]);
    expect(to(ARCHIVE)).toEqual([]);
    expect(r.placed).toBeUndefined();
  });
  it("a day that is over is still said as over", async () => {
    clockAt(ON_TRIP);
    const r = await weather({ town: "Angkor Wat", dates: ["2026-12-01"] });
    expect(r.days[0].none).toBe("No forecast: that day is over.");
  });
});

describe("W5 a day more than 16 days ahead: no forecast yet, and what that week was like in past years", () => {
  // (the last five years whose same week is past: a January week of 2027 is read from 2022–2026)
  const SENTENCE = (place: string, years = "2021–2025") => `Past years, not a forecast: in the same week of ${years}, ${place}'s highs were around 75°F and its lows around 68°F. It rained on 10 of those 35 days, heavily.`;
  const HOW = "A day with \"typical\" has no forecast yet. Say that first, then give its typical sentence as what past years were like there: its years and its counts as they are. Never as a forecast, a chance or what to expect (\"it will\", \"likely\", \"expect\"), and never a percentage worked out from the counts. They can ask again closer to the day.";
  it("a Vietnam day, asked in November: the town where they sleep, the same week of the last five years", async () => {
    clockAt(BEFORE);
    const r = await weather({ dates: ["2026-12-20"] });
    expect(r.days[0].none).toBe("No forecast yet: more than 16 days ahead.");
    expect(r.days[0].typical).toBe(SENTENCE("City A"));
    expect(r.days[0].lines).toBeUndefined();
    expect(r.typicalHow).toBe(HOW);
    const past = to(ARCHIVE);
    expect(past).toHaveLength(5);
    for (const a of past) expect(a).toContain("timezone=Asia%2FHo_Chi_Minh");
    for (const a of past) expect(a).toContain("latitude=21.0245&longitude=105.84117");
    expect(past.map((a) => new URL(a).searchParams.get("start_date")).sort()).toEqual(["2021-12-17", "2022-12-17", "2023-12-17", "2024-12-17", "2025-12-17"]);
    expect(to(FORECAST).filter((a) => a.includes("daily="))).toEqual([]);
  });
  it("a Japan day of the same trip: its own town and Japan's clock", async () => {
    clockAt(BEFORE);
    const r = await weather({ dates: ["2027-01-02"] });
    expect(r.days[0].typical).toBe(SENTENCE("City C", "2022–2026"));
    for (const a of to(ARCHIVE)) expect(a).toContain("timezone=Asia%2FTokyo");
    expect(to(ARCHIVE).some((a) => a.includes("latitude=35.6895&longitude=139.69171"))).toBe(true);
  });
  it("a town on the way, far ahead: past years at the town found", async () => {
    clockAt(BEFORE);
    const r = await weather({ town: "Da Nang", dates: ["2026-12-29"] });
    expect(r.days[0].none).toBe("No forecast yet: more than 16 days ahead.");
    expect(r.days[0].typical).toBe(SENTENCE("Da Nang"));
    expect(to(ARCHIVE)).toHaveLength(5);
    for (const a of to(ARCHIVE)) expect(a).toContain("latitude=16.06778&longitude=108.22083");
    expect(r.typicalHow).toBe(HOW);
    expect(r.placed).toBe("Da Nang in Vietnam, found by Open-Meteo's place search");
  });
  it("when the archive doesn't answer: no forecast yet, and nothing about past years", async () => {
    clockAt(BEFORE);
    archiveDown = true;
    const r = await weather({ dates: ["2026-12-20"] });
    expect(r.days[0].none).toBe("No forecast yet: more than 16 days ahead.");
    expect(r.days[0].typical).toBeUndefined();
    expect(r.typicalHow).toBeUndefined();
  });
  it("a day 16 days ahead or less has its forecast and no past years; a day that is over has neither", async () => {
    clockAt(ON_TRIP);
    const r = await weather({ dates: ["2026-12-19", "2026-12-25", "2027-01-02"] });
    const by = Object.fromEntries(r.days.map((d: any) => [d.date, d]));
    expect(by["2026-12-19"].none).toBe("No forecast: that day is over.");
    expect(by["2026-12-19"].typical).toBeUndefined();
    expect(by["2026-12-25"].lines?.length).toBeGreaterThan(0);
    expect(by["2026-12-25"].typical).toBeUndefined();
    expect(by["2027-01-02"].lines?.length).toBeGreaterThan(0);
    expect(by["2027-01-02"].typical).toBeUndefined();
    expect(r.typicalHow).toBeUndefined();
    expect(to(ARCHIVE)).toEqual([]);
  });
  const ONCE = "Past years are given once for each town: on the middle day of its days asked about, for the week around that day.";
  it("a week of far-off days in one town: past years once, on the middle day, and one reading of the archive", async () => {
    clockAt(BEFORE);
    const dates = ["2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18", "2026-12-19", "2026-12-20", "2026-12-21"];
    const r = await weather({ dates });
    for (const d of r.days) expect(d.none).toBe("No forecast yet: more than 16 days ahead.");
    expect(r.days.filter((d: any) => d.typical).map((d: any) => d.date)).toEqual(["2026-12-18"]);
    expect(r.days.find((d: any) => d.date === "2026-12-18").typical).toBe(SENTENCE("City A"));
    expect(to(ARCHIVE)).toHaveLength(5);
    expect(to(ARCHIVE).map((a) => new URL(a).searchParams.get("start_date")).sort()).toEqual(["2021-12-15", "2022-12-15", "2023-12-15", "2024-12-15", "2025-12-15"]);
    expect(r.typicalHow).toBe(HOW);
    expect(r.typicalOnce).toBe(ONCE);
  });
  it("far-off days in two towns: each town's own past years, and nothing said about sharing", async () => {
    clockAt(BEFORE);
    const r = await weather({ dates: ["2026-12-20", "2027-01-02"] });
    const by = Object.fromEntries(r.days.map((d: any) => [d.date, d]));
    expect(by["2026-12-20"].typical).toBe(SENTENCE("City A"));
    expect(by["2027-01-02"].typical).toBe(SENTENCE("City C", "2022–2026"));
    expect(to(ARCHIVE)).toHaveLength(10);
    expect(r.typicalOnce).toBeUndefined();
  });
  it("a town on the way over several far-off days: once, on the middle day", async () => {
    clockAt(BEFORE);
    const r = await weather({ town: "Da Nang", dates: ["2026-12-28", "2026-12-29", "2026-12-30"] });
    expect(r.days.filter((d: any) => d.typical).map((d: any) => d.date)).toEqual(["2026-12-29"]);
    expect(to(ARCHIVE)).toHaveLength(5);
    expect(r.typicalOnce).toBe(ONCE);
  });
  it("a day the plan has no place for: no past years", async () => {
    clockAt(BEFORE);
    const r = await weather({ dates: ["2026-12-29"] });   // (no day row and no stay that night: nowhere to read)
    expect(r.days[0].none).toBe("No forecast yet: more than 16 days ahead.");
    expect(r.days[0].typical).toBeUndefined();
    expect(to(ARCHIVE)).toEqual([]);
  });
});

describe("W6 Japan's own trip is as it was", () => {
  it("a day more than 16 days ahead: no forecast yet, no past years, the archive never asked", async () => {
    clockAt("2026-09-20T03:00:00Z");
    const r = await weather({ dates: ["2026-10-14"] }, patJp, japan.tripId);
    expect(r.days[0].none).toBe("No forecast yet: more than 16 days ahead.");
    expect(r.days[0].typical).toBeUndefined();
    expect(r.typicalHow).toBeUndefined();
    expect(to(ARCHIVE)).toEqual([]);
  });
  it("a named town: never the place search, and the words it always had", async () => {
    clockAt("2026-10-10T03:00:00Z");
    const r = await weather({ town: "Nagano", dates: ["2026-10-14"] }, patJp, japan.tripId);
    expect(to(SEARCH)).toEqual([]);
    expect(r.placed).toBeUndefined();
    expect(r.townHow).toBeUndefined();
    expect(r.source).toBe("Wander's forecast for Nagano (Open-Meteo), the same source as the day pages");
    if (r.days[0].none) expect(r.days[0].none).toBe("No forecast for Nagano: Wander couldn't find it in Japan.");
    expect(r.say).toBe("Give the numbers exactly as the lines have them, and say in a short clause that it's not where their plan has them that day, unless their day passes through it (say where it does, from DAY BY DAY).");
  });
});

describe("W7 what a plan trip is told about get_weather", () => {
  const OLD = {
    description: "With town: any other town in Japan on those days",
    town: "Only for a town in Japan that isn't where their plan has them, e.g. 'Kanazawa', or one their day passes through, e.g. 'Kanuma' on a ride.",
    hours: "Japan's hours, 0–23, both included: { from: 13, to: 18 } for 1 to 6 PM. For a question about part of a day ('this afternoon', 'from 1 to 6', 'when we ride').",
  };
  const NEW = {
    description: "Wander's own forecast: the one the day pages and Home show, for the person asking, in every country of the trip. For each day: where they sleep that night (their hotel), and where the plan takes them that day when that's somewhere else (a day trip, or where a travel day starts); the temperatures, the chance of rain and how much, the hours rain is most likely (up to 3 days out), and how sure. Use for ANY weather question about the trip's days: today, tonight, tomorrow, this week, 'do I need an umbrella', 'will it be cold in the north'. With town: any other town in the trip's countries on those days, including one their day passes through (where a ride, walk or tour goes). With hours: the temperature and chance of rain hour by hour for that part of the day, and how far Europe's and the US forecasts run from it. A day more than 16 days ahead has no forecast yet: it comes with what that week was like there in past years.",
    town: "Only for a town that isn't where the plan has them, or one their day passes through. The town's own name, in one of the trip's countries: for a sight (a temple, a bay), the town people stay in to see it.",
    hours: "Hours on that day's own clock (with town, the town's), 0–23, both included: { from: 13, to: 18 } for 1 to 6 PM. For a question about part of a day ('this afternoon', 'from 1 to 6', 'when we ride').",
  };
  const tool = (tools: any[]) => tools.find((t) => t.name === "get_weather");
  it("the plan trip's copy: the tool's own words, its town and its hours no longer say Japan", () => {
    const t = tool(planTools(scoutTools as any[]));
    expect(t.description).toBe(NEW.description);
    expect(t.input_schema.properties.town.description).toBe(NEW.town);
    expect(t.input_schema.properties.hours.description).toBe(NEW.hours);
    expect(t.input_schema.properties.dates.description).toBe("The trip's dates, YYYY-MM-DD (today if none). Up to 16.");
  });
  it("the shared list is never changed by it", () => {
    const t = tool(scoutTools as any[]);
    expect(t.description).toContain(OLD.description);
    expect(t.input_schema.properties.town.description).toBe(OLD.town);
    expect(t.input_schema.properties.hours.description).toBe(OLD.hours);
  });
});

describe("W8 what a plan trip's prompt says about the weather", () => {
  // (Japan's sentences, and what a plan trip is told in their place: rule 46g and the look-it-up rule)
  const SWAPS: [string, string][] = [
    ["how to get from A to B, the weather outside Japan (in Japan it's get_weather, rule 46g), what a station exit is", "how to get from A to B, what a station exit is"],
    ["For a town in Japan that isn't where their plan has them that day, get_weather with town, and say in a short clause that their plan has them elsewhere.",
      "For a town in any of the trip's countries that isn't where the plan has them that day, get_weather with town, and say in a short clause that the plan has them elsewhere. It takes a town's own name: for a sight (a temple, a bay, a park), give the town people stay in to see it, only if you are sure which town that is, and say that the forecast is that town's. When it can't place a town, say so; never give a forecast of your own for it."],
    ["(the service they named first; else Japan's weather agency or tenki.jp)", "(the service they named first; else, for a town in Japan, Japan's weather agency or tenki.jp)"],
    ["Unasked, never a weather site's numbers in Japan. Outside Japan, web_search, said as found online.", "Unasked, never a weather site's numbers, in any country of the trip: the weather is get_weather's."],
    ["When get_weather has no forecast for a day (over, or more than 16 days ahead), say so; her pre-trip forecast in the Guide may be given then, said as hers, written before the trip.",
      "When get_weather has no forecast for a day (over, or more than 16 days ahead), say so. A day too far ahead may come with \"typical\": what that week was like there in past years. Say first that there's no forecast yet, then give it as past years, with its years and its counts as they are (\"in the same week of 2021–2025 it rained on 32 of those 35 days\"); never as a forecast, a chance or what to expect, and never a percentage worked out from the counts."],
  ];
  // (the least of Scout's prompt that planSystemPrompt needs, with Japan's five sentences in it)
  const BASE = [
    "You are Scout.", "",
    "- Every date in the Guide is a Japan date. More.",
    "61. the amount as said, yen unless they said dollars, and what it was for",
    "63. gets until: that moment, Japan time; it's gone",
    ...SWAPS.map(([was], i) => `w${i}. ${was}`),
    "46f. Packing: Japan's own list, the one Scout offered Julie.",
    "46h. The rule after it.",
    "55. Use get_travel_advisories for visas and shots: the April list.",
    "56. The last rule.",
  ].join("\n");
  it("each of Japan's five sentences gives way to the plan trip's", () => {
    const made = planSystemPrompt(BASE);
    for (const [was, now] of SWAPS) {
      expect(made).toContain(now);
      expect(made).not.toContain(was);
    }
    expect(made).not.toMatch(/weather outside Japan/);
    expect(made).not.toMatch(/Outside Japan, web_search/);
  });
  it("a prompt missing one of them is refused out loud, never sent half-changed", () => {
    for (const [was] of SWAPS) expect(() => planSystemPrompt(BASE.replace(was, "gone"))).toThrow(/no longer has the spots/);
    // (the packing rule too, Nov 24 2026: a prompt whose rule 46f has moved is refused the same way)
    expect(() => planSystemPrompt(BASE.replace("46f. Packing:", "46f. Bags:"))).toThrow(/no longer has the spots/);
    // (and rule 55, the advisory list's: a plan trip is never sent Japan's by a moved line)
    expect(() => planSystemPrompt(BASE.replace("55. Use get_travel_advisories", "55. For visas use get_travel_advisories"))).toThrow(/no longer has the spots/);
  });
  it("Japan's packing rule gives way whole, and the rule after it is left alone", () => {
    const made = planSystemPrompt(BASE);
    expect(made).not.toContain("the one Scout offered Julie");
    expect(made).toMatch(/\n46f\. Packing: [^\n]*answer only from what it returns[^\n]*\n46h\. The rule after it\.\n/);
  });
  it("rule 55 gives way whole too, and the rule after it is left alone", () => {
    const made = planSystemPrompt(BASE);
    expect(made).not.toMatch(/get_travel_advisories|the April list/);
    expect(made).toMatch(/\n55\. Visas, entry papers[^\n]*Wander has no checked note on it[^\n]*\n56\. The last rule\.$/);
    // (the last rule of a prompt gives way the same)
    expect(planSystemPrompt(BASE.replace("\n56. The last rule.", ""))).toMatch(/\n55\. Visas, entry papers[^\n]*$/);
  });
});
