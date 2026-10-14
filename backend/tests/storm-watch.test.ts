/**
 * Storm, warning and train watch (services/stormWatch.ts — Ken's decision 2, Oct 13). JMA's real files from Oct 14 2026
 * (tests/fixtures/jma, trimmed to the trip's prefectures and two Hokkaido offices, where storm-wind warnings were in
 * force), and made-up ones for what wasn't happening that morning. verify45's findings each have a test here.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { warningsNow, chancesAhead, stormTrack, stormNear, stormName, regionOf, watchFrom, decodePolyline, LINKS, type Storm, type Region } from "../src/services/stormWatch.js";

const fx = (f: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/jma", f), "utf-8"));
const MAP_TIME = { latestControlDatetime: "2026-10-13T23:03:28Z" };
const NOW = new Date("2026-10-13T23:30:00Z");   // 8:30 AM Oct 14 in Japan
const bulletin = (at: string, type: string, town: string, kinds: { code?: string; status: string }[]) =>
  ({ reportDatetime: at, dataTypeCode: type, warning: { class10Items: [], class20Items: [{ areaCode: town, kinds }] } });

describe("JMA warnings since May 29 2026, by town", () => {
  it("reads Oct 14's real file: storm-wind warnings in force in Wakkanai, none in Chiyoda (Tokyo)", () => {
    const w = warningsNow(fx("warnings-2026-10-14.json"), MAP_TIME, NOW);
    expect(w.get("0121400")).toEqual([expect.objectContaining({ el: "wind", level: 3 })]);   // 稚内市
    expect(w.get("1310100")).toBeUndefined();   // 千代田区
    // (the advisories there — waves, thunder — are Level 2: not in the watch)
    expect([...w.values()].flat().every((x) => x.level >= 3)).toBe(true);
  });

  it("a file JMA stopped updating, or one reshaped, is an error — never 'no warnings'", () => {
    expect(() => warningsNow(fx("warnings-2026-10-14.json"), MAP_TIME, new Date("2026-10-14T06:00:00Z"))).toThrow(/stale/);
    expect(() => warningsNow({ not: "a list" }, MAP_TIME, NOW)).toThrow();
    expect(() => warningsNow([], MAP_TIME, NOW)).toThrow();
    // (fields renamed inside the bulletins — verify45: these read as "nothing")
    const renamed = fx("warnings-2026-10-14.json").map((b: any) => ({ ...b, warning: { regions: b.warning.class20Items } }));
    expect(() => warningsNow(renamed, MAP_TIME, NOW)).toThrow(/changed/);
    // (status words and codes renamed inside — verify46)
    const english = fx("warnings-2026-10-14.json").map((b: any) => ({ ...b, warning: { ...b.warning, class20Items: b.warning.class20Items.map((it: any) => ({ ...it, kinds: it.kinds.map((k: any) => ({ ...k, status: "issued" })) })) } }));
    expect(() => warningsNow(english, MAP_TIME, NOW)).toThrow(/changed/);
    const recoded = fx("warnings-2026-10-14.json").map((b: any) => ({ ...b, warning: { ...b.warning, class20Items: b.warning.class20Items.map((it: any) => ({ ...it, kinds: it.kinds.map((k: any) => (k.code ? { ...k, code: `R${k.code}` } : { ...k, code: "R1" })) })) } }));
    expect(() => warningsNow(recoded, MAP_TIME, NOW)).toThrow(/changed/);
  });

  it("each kind's newest bulletin decides: rain lifted, wind still in force; an unknown code is never guessed", () => {
    const w = warningsNow([
      bulletin("2026-10-19T06:00:00+09:00", "VPWW55", "1310100", [{ code: "03", status: "発表" }]),
      bulletin("2026-10-19T07:00:00+09:00", "VPWW58", "1310100", [{ code: "05", status: "発表" }]),
      bulletin("2026-10-19T09:00:00+09:00", "VPWW55", "1310100", [{ code: "03", status: "解除" }]),
      bulletin("2026-10-19T09:30:00+09:00", "VPWW56", "1310100", [{ status: "発表警報・注意報はなし" }]),
      bulletin("2026-10-19T09:40:00+09:00", "VPWW99", "1310100", [{ code: "99", status: "発表" }]),
    ], { latestControlDatetime: "2026-10-19T00:45:00Z" }, new Date("2026-10-19T01:00:00Z"));
    expect(w.get("1310100")).toEqual([expect.objectContaining({ el: "wind", level: 3 })]);
  });
});

describe("JMA's chance of warning-level weather", () => {
  it("reads Oct 14's real file, and records what each area was checked for", () => {
    const c = chancesAhead(fx("chances-2026-10-14.json"));
    expect(c.by.get("011000")?.get("2026-10-14")).toEqual(expect.arrayContaining([{ what: "storm winds", chance: "high" }]));
    expect([...(c.by.get("130010")?.values() || [])].flat()).toEqual([]);   // (nothing in Tokyo that morning)
    expect(c.covered.get("130010")?.has("2026-10-14")).toBe(true);
    // (days 2–5 are by prefecture: Shizuoka's 220000, not Izu's 220020 — verify45)
    expect(c.covered.get("220000")?.has("2026-10-17")).toBe(true);
  });
  it("a changed file is an error", () => {
    expect(() => chancesAhead({})).toThrow();
    expect(() => chancesAhead([[{ timeSeries: [{ timeDefines: ["2026-10-14"], areas: [{ code: "130010", things: [] }] }] }]])).toThrow(/no chances/);
    // (a renamed date field, or new value words — verify46)
    const real = fx("chances-2026-10-14.json");
    const noDates = real.map((o: any) => o.map((r: any) => ({ ...r, timeSeries: r.timeSeries.map((ts: any) => ({ ...ts, timeDefines: undefined, times: ts.timeDefines })) })));
    expect(() => chancesAhead(noDates)).toThrow(/no dates/);
    const english = real.map((o: any) => o.map((r: any) => ({ ...r, timeSeries: r.timeSeries.map((ts: any) => ({ ...ts, areas: ts.areas.map((a: any) => ({ ...a, properties: a.properties.map((p: any) => ({ ...p, probabilities: p.probabilities.map((v: string) => (v === "中" ? "medium" : v === "高" ? "high" : v)) })) })) })) })));
    expect(() => chancesAhead(english)).toThrow(/values/);
  });
});

describe("typhoons", () => {
  it("reads Koguma's track (Oct 14): far out in the Pacific, near none of the trip's places", () => {
    const s = stormTrack(fx("typhoon-2629-2026-10-14.json"), "STS")!;
    expect(stormName(s)).toBe("Severe Tropical Storm Koguma (No. 29)");
    expect(s.points.length).toBeGreaterThanOrEqual(3);
    expect(stormNear(s, { lat: 35.67, lng: 139.76 }, Date.parse("2026-10-13T15:00:00Z"), Date.parse("2026-10-19T15:00:00Z"))).toBeNull();
  });
  it("a track it can't read is null (the watch then says it couldn't check), and a storm without a name is still named", () => {
    expect(stormTrack([{ part: "title" }])).toBeNull();
    expect(stormTrack("x")).toBeNull();
    expect(stormName({ number: "", name: "", category: "TY", points: [] })).toBe("A typhoon");
    // (JMA's "LOW" — Koguma, live on Oct 14 — is no typhoon; an unknown category is never promoted to one; verify47)
    expect(stormName({ number: "29", name: "Koguma", category: "LOW", points: [] })).toBe("The remains of Koguma (No. 29), now an ordinary low,");
    expect(stormName({ number: "30", name: "Bualoi", category: "", points: [] })).toBe("Tropical Storm Bualoi (No. 30)");
  });
  it("codes sent as numbers read the same as JMA's text codes (verify48)", () => {
    const numeric = fx("warnings-2026-10-14.json").map((b: any) => ({ ...b, warning: { ...b.warning, class20Items: b.warning.class20Items.map((it: any) => ({ ...it, kinds: it.kinds.map((k: any) => (k.code ? { ...k, code: Number(k.code) } : k)) })) } }));
    expect(warningsNow(numeric, MAP_TIME, NOW).get("0121400")).toEqual([expect.objectContaining({ el: "wind", level: 3 })]);
  });
  it("a renamed code field is refused, never 'no warnings' (verify47)", () => {
    const renamed = fx("warnings-2026-10-14.json").map((b: any) => ({ ...b, warning: { ...b.warning, class20Items: b.warning.class20Items.map((it: any) => ({ ...it, kinds: it.kinds.map(({ code, ...k }: any) => ({ ...k, kindCode: code })) })) } }));
    expect(() => warningsNow(renamed, MAP_TIME, NOW)).toThrow(/changed/);
  });
  it("the distance said is to the storm's center, not its uncertainty circle (verify45)", () => {
    const s: Storm = { number: "31", name: "Nakri", category: "TY", points: [{ at: "2026-10-21T03:00:00Z", lat: 30.0, lng: 139.0, radiusKm: 400 }] };
    const n = stormNear(s, { lat: 34.86, lng: 138.94 }, Date.parse("2026-10-20T15:00:00Z"), Date.parse("2026-10-21T15:00:00Z"))!;
    expect(Math.round(n.km / 10) * 10).toBe(540);   // (~540 km from the center; within reach only by the 400 km circle)
  });
});

describe("which area a place is in (JMA's own list)", () => {
  const area = fx("area-trimmed.json");
  it("the trip's towns, with all of a town's areas", () => {
    expect(regionOf(area, "栃木県", "日光市")).toMatchObject({ code: "090020", office: "090000", town: "Nikko" });
    expect(regionOf(area, "栃木県", "日光市")!.towns.length).toBe(5);
    expect(regionOf(area, "栃木県", "益子町")?.code).toBe("090010");
    expect(regionOf(area, "東京都", "千代田区")).toMatchObject({ code: "130010", towns: ["1310100"] });
    expect(regionOf(area, "静岡県", "伊豆市")).toMatchObject({ code: "220020", office: "220000", area: "Izu" });
    expect(regionOf(area, "神奈川県", "小田原市")?.area).toBe("western Kanagawa");
    expect(regionOf(area, "京都府", "京都市")?.code).toBe("260010");
  });
  it("never a town of the same name in another prefecture, never an empty name", () => {
    expect(regionOf(area, "京都府", "日光市")).toBeNull();
    expect(regionOf(area, "東京都", "")).toBeNull();
  });
});

describe("the route's points", () => {
  it("decodes Google's line (its own documented example)", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }]);
  });
});

describe("the watch, day by day", () => {
  const R = (code: string, office: string, towns: string[], town: string, area = town, pref = ""): Region => ({ code, office, towns, town, area, pref, regionTowns: towns });
  const nikko = R("090020", "090000", ["0920601", "0920602", "0920603", "0920604", "0920605"], "Nikko");
  const izu = R("220020", "220000", ["2222200"], "Izu", "Izu", "Shizuoka");
  const tokyo = R("130010", "130000", ["1310100"], "Chiyoda", "Tokyo");
  const kanagawaW: Region = { ...R("140020", "140000", ["1420600"], "Odawara", "western Kanagawa", "Kanagawa"), regionTowns: ["1420600", "1438200"] };   // (Odawara, Hakone)
  const places = {
    "2026-10-19": [{ name: "Tokyo", lat: 35.67, lng: 139.76, role: "night" as const, region: tokyo }],
    "2026-10-20": [{ name: "Nikko", lat: 36.74, lng: 139.49, role: "night" as const, region: nikko }],
    "2026-10-21": [
      { name: "Nikko", lat: 36.74, lng: 139.49, role: "morning" as const, region: nikko },
      { name: "western Kanagawa", lat: 35.26, lng: 139.15, role: "way" as const, region: kanagawaW },
      { name: "Shirakabeso", lat: 34.86, lng: 138.94, role: "night" as const, region: izu },
    ],
  };
  const covered = new Map([["130010", new Set(["2026-10-19", "2026-10-20"])], ["090020", new Set(["2026-10-19", "2026-10-20"])], ["090000", new Set(["2026-10-21"])], ["140000", new Set(["2026-10-21"])], ["220000", new Set(["2026-10-21"])]]);
  const quiet = { today: "2026-10-19", now: new Date("2026-10-18T23:00:00Z"), places, travelDays: new Set(["2026-10-21"]), warnings: new Map(), chances: { by: new Map(), covered }, storms: [] as Storm[] };

  it("nothing up: nothing said, and how far each check reached", () => {
    const r = watchFrom(quiet);
    expect(r.days).toEqual({});
    expect(r.through).toEqual({ warnings: "2026-10-19", chances: "2026-10-21", typhoons: "2026-10-24" });
  });
  it("a check that reached only so far says so (verify45: 'through Oct 19' when Sunday wasn't checked)", () => {
    const short = new Map([["130010", new Set(["2026-10-19"])], ["090020", new Set(["2026-10-19"])]]);
    expect(watchFrom({ ...quiet, chances: { by: new Map(), covered: short } }).through.chances).toBe("2026-10-19");
    expect(watchFrom({ ...quiet, chances: null, warnings: null, storms: null }).through).toEqual({ warnings: null, chances: null, typhoons: null });
  });

  it("a warning in force today is for the town: the whole of it, or part of it (verify45: Okutama alone read as Tokyo)", () => {
    const today = { ...quiet, today: "2026-10-20" };
    const all = watchFrom({ ...today, warnings: new Map(nikko.towns.map((t) => [t, [{ el: "rain", level: 3, since: "" }]])) });
    expect(all.days["2026-10-20"]).toEqual([{ date: "2026-10-20", kind: "warning", link: LINKS.warnings, text: "A Level 3 warning for heavy rain is in force for Nikko, from Japan's weather agency." }]);
    const part = watchFrom({ ...today, warnings: new Map([["0920605", [{ el: "landslide", level: 4, since: "" }]]]) });
    expect(part.days["2026-10-20"][0].text).toBe("A Level 4 urgent warning for landslides is in force for part of Nikko, from Japan's weather agency.");
    // (another region's warning, or a warning now said on a later day: nothing)
    expect(watchFrom({ ...today, warnings: new Map([["1310100", [{ el: "rain", level: 3, since: "" }]]]) }).days).toEqual({});
  });

  it("the chance by prefecture reaches a day the region file doesn't (verify45: Izu on Oct 21), and a travel day adds JR's rule", () => {
    const chances = { by: new Map([["220000", new Map([["2026-10-21", [{ what: "heavy rain", chance: "high" as const }, { what: "storm winds", chance: "medium" as const }]]])]]), covered };
    const d = watchFrom({ ...quiet, chances }).days["2026-10-21"];
    expect(d.map((l) => l.text)).toEqual([
      "Japan's weather agency sees a high chance of warning-level heavy rain for Shizuoka, where Shirakabeso is, on Wed, Oct 21.",
      "Japan's weather agency sees a medium chance of warning-level storm winds for Shizuoka, where Shirakabeso is, on Wed, Oct 21.",
      "For a train that day: JR usually announces planned stops the day before, and a train it cancels is refunded in full, with no fee.",
    ]);
    expect(d[2].link).toEqual(LINKS.tokaido);   // (Kanagawa and Shizuoka: Tokaido country)
  });
  it("a chance only on the way is said as on your way", () => {
    const chances = { by: new Map([["140000", new Map([["2026-10-21", [{ what: "heavy rain", chance: "high" as const }]]])]]), covered };
    expect(watchFrom({ ...quiet, chances }).days["2026-10-21"][0].text).toBe("Japan's weather agency sees a high chance of warning-level heavy rain for Kanagawa, on your way, on Wed, Oct 21.");
  });

  it("a typhoon near where they'll be, within 5 days, named as JMA does, in miles from its center", () => {
    const storm: Storm = { number: "31", name: "Nakri", category: "TY", points: [
      { at: "2026-10-21T00:00:00Z", lat: 32.5, lng: 137.5, radiusKm: 120 },
      { at: "2026-10-21T12:00:00Z", lat: 34.2, lng: 138.7, radiusKm: 150 },
    ] };
    const d = watchFrom({ ...quiet, storms: [storm] }).days;
    expect(d["2026-10-21"][0].text).toBe("Typhoon Nakri (No. 31) is forecast to pass about 50 miles from Shirakabeso on Wed, Oct 21, from Japan's weather agency.");
    expect(d["2026-10-21"][0].link).toEqual(LINKS.typhoon);
    expect(d["2026-10-19"]).toBeUndefined();
    const over = { ...storm, points: [{ at: "2026-10-21T12:00:00Z", lat: 34.8, lng: 138.95, radiusKm: 100 }] };
    expect(watchFrom({ ...quiet, storms: [over] }).days["2026-10-21"][0].text).toMatch(/^Typhoon Nakri \(No\. 31\) is forecast to pass over or near Shirakabeso/);
    const far = { ...storm, points: storm.points.map((p) => ({ ...p, lat: p.lat - 6 })) };
    expect(watchFrom({ ...quiet, storms: [far] }).days).toEqual({});
  });

  it("the region's value wins over the prefecture's when JMA lists the region that day (verify46)", () => {
    const chances = { by: new Map([["220000", new Map([["2026-10-21", [{ what: "heavy rain", chance: "high" as const }]]])]]),
      covered: new Map([...covered, ["220020", new Set(["2026-10-21"])]]) };   // (Izu listed that day, with nothing)
    expect(watchFrom({ ...quiet, chances }).days["2026-10-21"]).toBeUndefined();
  });

  it("an area on the way: a warning anywhere in it counts (verify46: Hakone's, the point in Odawara)", () => {
    const today = { ...quiet, today: "2026-10-21" };
    const d = watchFrom({ ...today, warnings: new Map([["1438200", [{ el: "rain", level: 3, since: "" }]]]) }).days["2026-10-21"];
    expect(d[0].text).toBe("A Level 3 warning for heavy rain is in force for part of western Kanagawa, on your way, from Japan's weather agency.");
  });

  it("a fast storm crossing between two forecast points 24 hours apart is seen (verify46)", () => {
    const fast: Storm = { number: "32", name: "Halong", category: "TY", points: [
      { at: "2026-10-19T00:00:00Z", lat: 31.0, lng: 137.0, radiusKm: 100 },
      { at: "2026-10-20T00:00:00Z", lat: 41.0, lng: 143.0, radiusKm: 150 },
    ] };
    const d = watchFrom({ ...quiet, storms: [fast] }).days;
    expect(d["2026-10-19"]?.[0].text).toMatch(/^Typhoon Halong \(No\. 32\) is forecast to pass (over or near|about \d+ miles from) Tokyo today/);
  });

  it("a place nobody could place isn't checked — and the chance check stops there", () => {
    const r = watchFrom({ ...quiet, places: { ...places, "2026-10-19": [{ name: "Tokyo", lat: 35.67, lng: 139.76, role: "night", region: null }] }, warnings: new Map([["1310100", [{ el: "rain", level: 3, since: "" }]]]) });
    expect(r.days).toEqual({});
    expect(r.through.chances).toBeNull();
  });
});
