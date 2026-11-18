/**
 * S3 fix (Nov 17 2026): December's screens say only what is true. Pure functions of the phone's own files, read straight
 * from frontend/src as plan-words-phone.test.ts does; made-up airports' flights are real airline codes in shape only, no
 * booking codes, no phone numbers. Each item has a sheet-trip case showing the old result still stands. The clock is
 * fixed at Nov 17 2026 (27 days before Dec 14).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "../../frontend/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../frontend/node_modules/react-dom/server.js";

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); }, clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; },
};

const P = await import("../../frontend/src/lib/planTrip.ts");
const G = await import("../../frontend/src/lib/guideDisplay.ts");
const S = await import("../../frontend/src/lib/planScreens.ts");
const C = await import("../../frontend/src/lib/phraseCountries.ts");
const GT = await import("../../frontend/src/components/GetThere.tsx");

const KL = "Ken & Larisa";
let n = 0;
const item = (o: any): any => ({ id: `i${n++}`, detail: null, time: null, timeZone: null, forWhom: KL, source: "Larisa's notes", sortOrder: n, ...o });
const day = (d: string) => `${d}T00:00:00.000Z`;

beforeEach(() => { store.clear(); P.forgetPlanTripsInMemory(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-17T20:00:00Z")); });
afterEach(() => { vi.useRealTimers(); });
const asPlanTrip = () => { store.set("wander:last-trip-id", "t1"); P.forgetPlanTripsInMemory(); P.notePlanTrip("t1", true, ["Larisa's notes"]); };

// The December shapes (the brief's "data these tests should mirror")
const dec14 = item({ kind: "flight", title: "DL 7861 · San Francisco (SFO) → Seoul Incheon (ICN)", date: day("2026-12-14"), time: "11:45", timeZone: "America/Los_Angeles", detail: "Lands at Seoul Incheon (ICN) Tue, Dec 15, 5:40 PM Korea time" });
const land15 = item({ kind: "flight", title: "Land at Seoul Incheon (ICN) · DL 7861", date: day("2026-12-15"), time: "17:40", timeZone: "Asia/Seoul" });
const dep15 = item({ kind: "flight", title: "DL 7807 · Seoul Incheon (ICN) → Hanoi Noi Bai (HAN)", date: day("2026-12-15"), time: "18:45", timeZone: "Asia/Seoul", detail: "Business · Z Air\nLands at Hanoi Noi Bai (HAN) Tue, Dec 15, 9:45 PM Vietnam time" });
const checkin15 = item({ kind: "checkin", title: "Check in · A Made-Up Hanoi Hotel", date: day("2026-12-15"), time: "15:00", timeZone: "Asia/Ho_Chi_Minh" });
const jan1a = item({ kind: "flight", title: "PG908 · Siem Reap–Angkor (SAI) → Bangkok Suvarnabhumi (BKK)", date: day("2027-01-01"), time: "19:25", timeZone: "Asia/Phnom_Penh", detail: "Lands at Bangkok Suvarnabhumi (BKK) Fri, Jan 1, 8:50 PM Thailand time" });
const jan1b = item({ kind: "flight", title: "JL034 · Bangkok Suvarnabhumi (BKK) → Tokyo Haneda (HND), Terminal 3", date: day("2027-01-01"), time: "22:05", timeZone: "Asia/Bangkok", detail: "Lands at Tokyo Haneda (HND), Terminal 3 Sat, Jan 2, 5:40 AM Japan time" });
const land2 = item({ kind: "flight", title: "Land at Tokyo Haneda (HND), Terminal 3 · JL034", date: day("2027-01-02"), time: "05:40", timeZone: "Asia/Tokyo" });
const VN = "Asia/Ho_Chi_Minh";

describe("1. a change of planes is not 'the plan doesn't say how to get to the hotel'", () => {
  const items = [dec14, land15, dep15, checkin15];
  it("Dec 15 shape: the connection is DL 7807 to Hanoi Noi Bai (HAN) at 18:45 Korea time; the way to the hotel starts there", () => {
    const chain = G.connectionsAfter(land15, items, "Ken", VN);
    expect(chain.map((f: any) => f.title)).toEqual([dep15.title]);
    expect(G.flightService(chain[0].title)).toBe("DL 7807");
    expect(G.flightRoute(chain[0])).toEqual({ from: "Seoul Incheon (ICN)", to: "Hanoi Noi Bai (HAN)" });
    expect([chain[0].time, chain[0].timeZone]).toEqual(["18:45", "Asia/Seoul"]);
    expect(G.landsSameDay(chain[0], items)).toBe(true);
    expect(G.landedAt(land15)).toBe("Seoul Incheon (ICN)");
  });
  it("Jan 2 shape: no later flight, no connection (the help airport stays Haneda, as today)", () => {
    expect(G.connectionsAfter(land2, [jan1a, jan1b, land2], "Ken", VN)).toEqual([]);
  });
  it("a flight from another airport the same day is not a connection", () => {
    const other = item({ ...dep15, id: "x1", title: "XY 1 · Seoul Gimpo (GMP) → Busan (PUS)" });
    expect(G.connectionsAfter(land15, [land15, other], "Ken", VN)).toEqual([]);
  });
  it("a flight from the same airport BEFORE the landing is not a connection (each line on its own zone)", () => {
    const early = item({ ...dep15, id: "x2", time: "17:00" });
    expect(G.connectionsAfter(land15, [land15, early], "Ken", VN)).toEqual([]);
    // 5:30 PM Seoul is before 5:40 PM Seoul; 5:00 PM Vietnam time is 7:00 PM Seoul, after it
    const otherClock = item({ ...dep15, id: "x3", time: "17:00", timeZone: VN });
    expect(G.connectionsAfter(land15, [land15, otherClock], "Ken", VN).length).toBe(1);
  });
  it("a terminal tail and capital letters are ignored", () => {
    const l = item({ kind: "flight", title: "Land at Tokyo Haneda (HND), Terminal 3 · JL034", date: day("2027-01-02"), time: "05:40", timeZone: "Asia/Tokyo" });
    const f = item({ kind: "flight", title: "JL 99 · tokyo haneda (hnd) → Sapporo (CTS)", date: day("2027-01-02"), time: "09:00", timeZone: "Asia/Tokyo" });
    expect(G.connectionsAfter(l, [l, f], "Ken", VN)).toEqual([f]);
  });
  it("someone else's flight (not my party) is not a connection", () => {
    const theirs = item({ ...dep15, id: "x4", forWhom: "Andy & Julie" });
    expect(G.connectionsAfter(land15, [land15, theirs], "Ken", VN)).toEqual([]);
    expect(G.connectionsAfter(land15, [land15, theirs], "Andy", VN).length).toBe(1);
  });
  it("a second connection follows the first one's destination; a last flight that lands on a later date has no 'same day'", () => {
    const third = item({ kind: "flight", title: "VN 55 · Hanoi Noi Bai (HAN) → Da Nang (DAD)", date: day("2026-12-15"), time: "23:30", timeZone: VN });
    const chain = G.connectionsAfter(land15, [land15, dep15, third], "Ken", VN);
    expect(chain.map((f: any) => G.flightService(f.title))).toEqual(["DL 7807", "VN 55"]);
    const lands = item({ kind: "flight", title: "Land at Da Nang (DAD) · VN 55", date: day("2026-12-16"), time: "00:40", timeZone: VN });
    expect(G.landsSameDay(third, [third, lands])).toBe(false);
    expect(G.landsSameDay(dep15, [land15, dep15, lands])).toBe(true);
  });
});

describe("2. the night shows one line, for the flight that is in the air overnight", () => {
  const night = (date: string, items: any[], plan = true) => G.nightOf(date, [], items, VN, false, plan);
  it("Jan 1 shape: one line, built from JL034; the party is marked flying once", () => {
    const a = night("2027-01-01", [jan1a, jan1b, land2]).away;
    expect(a.length).toBe(1);
    expect(a[0].who).toBe(KL);
    expect(a[0].text).toBe("Take off Fri 10:05 PM Thailand time — lands at Haneda 5:40 AM Sat Japan time");
  });
  it("Dec 14 shape: the one line it gives today", () => {
    const a = night("2026-12-14", [dec14, land15, dep15]).away;
    expect(a.length).toBe(1);
    // ("On the plane overnight" when the machine running the test is itself on the flight's clock; either way the one line)
    expect(a[0].text).toMatch(/^(Take off .*|On the plane overnight) — lands at Seoul Incheon 5:40 PM Tue Korea time$/);
  });
  it("a landing title with no service and one departure: today's line", () => {
    const bare = item({ ...land2, title: "Land at Tokyo Haneda (HND), Terminal 3" });
    expect(night("2027-01-01", [jan1b, bare]).away.length).toBe(1);
  });
  it("a landing title with no service and two departures: no line for either (never guess)", () => {
    const bare = item({ ...land2, title: "Land at Tokyo Haneda (HND), Terminal 3" });
    expect(night("2027-01-01", [jan1a, jan1b, bare]).away).toEqual([]);
  });
  it("a flight with no landing of its own gets no night line", () => {
    expect(night("2027-01-01", [jan1a]).away).toEqual([]);
  });
  it("a sheet trip pairs as it always did (by the party), so Jan 1's two flights both find the landing", () => {
    expect(night("2027-01-01", [jan1a, jan1b, land2], false).away.length).toBe(2);
  });
});

describe("3. no 'Takes off' line that repeats the same clock time", () => {
  it("Asia/Bangkok flight on an Asia/Phnom_Penh day: no line (both seven hours from UTC)", () => {
    expect(G.departureInTripZone(jan1b, "Asia/Phnom_Penh", true)).toBeNull();
  });
  it("Asia/Seoul flight on an Asia/Ho_Chi_Minh day: the line", () => {
    expect(G.departureInTripZone(dep15, VN, true)).toBe("Takes off Tue, Dec 15, 4:45 PM Vietnam time");
  });
  it("a sheet trip keeps its words even when the two clocks agree (a Korea-clock flight on Japan's trip)", () => {
    expect(G.departureInTripZone(jan1b, "Asia/Phnom_Penh", false)).toBe("Takes off Fri, Jan 1, 10:05 PM Cambodia time");
    const seoul = item({ kind: "flight", title: "XX 1 · Seoul (ICN) → Tokyo (NRT)", date: day("2027-10-13"), time: "12:00", timeZone: "Asia/Seoul" });
    expect(G.departureInTripZone(seoul, "Asia/Tokyo", false)).toBe("Takes off Wed, Oct 13, 12:00 PM Japan time");
  });
  it("the default follows the open trip", () => {
    expect(G.departureInTripZone(jan1b, "Asia/Phnom_Penh")).toMatch(/^Takes off Fri, Jan 1/);
    asPlanTrip();
    expect(G.departureInTripZone(jan1b, "Asia/Phnom_Penh")).toBeNull();
  });
  it("a Japan trip's flight on another clock says what it said", () => {
    const chicago = item({ kind: "flight", title: "AA 1 · Chicago (ORD) → Tokyo Narita (NRT)", date: day("2027-10-13"), time: "12:00", timeZone: "America/Chicago" });
    expect(G.departureInTripZone(chicago, "Asia/Tokyo")).toBe("Takes off Thu, Oct 14, 2:00 AM Japan time");
    const ny = item({ kind: "flight", title: "AA 2 · New York (JFK) → Tokyo Narita (NRT)", date: day("2027-10-13"), time: "12:00", timeZone: "America/New_York" });
    expect(G.departureInTripZone(ny, "Asia/Tokyo")).toBe("Takes off Thu, Oct 14, 1:00 AM Japan time");
  });
});

describe("4. on a plan trip the first day is the day you leave", () => {
  const items = [dec14, land15, dep15, checkin15];
  it("plan trip, Dec 14 shape, today Nov 17: Next's day is Dec 14 and the count is 27, in the trip's own words", () => {
    const f = G.myFirstDay(items, "Ken", "2026-12-14", VN, true);
    expect(f).toMatchObject({ myStart: "2026-12-14", first: "2026-12-14" });
    expect(S.startWords(f.first, "2026-12-14", f.myStart!, "2026-11-17")).toBe("The trip starts in 27 days");
  });
  it("a sheet trip with the same lines keeps its rule: the first day is the next one (Vietnam's calendar is a day ahead)", () => {
    const f = G.myFirstDay(items, "Ken", "2026-12-14", VN, false);
    expect(f.first).toBe("2026-12-15");
    expect(S.startWords(f.first, "2026-12-14", f.myStart!, "2026-11-17")).toBe("You leave in 27 days");
  });
  it("startWords: today, tomorrow, and a later start for someone who leaves after the trip's first day", () => {
    expect(S.startWords("2026-12-14", "2026-12-14", "2026-12-14", "2026-12-14")).toBe("The trip starts today");
    expect(S.startWords("2026-12-14", "2026-12-14", "2026-12-14", "2026-12-13")).toBe("The trip starts tomorrow");
    expect(S.startWords("2026-12-20", "2026-12-14", "2026-12-20", "2026-12-13")).toBe("You leave in 7 days");
  });
  it("plan trip, Dec 14: no still-at-home sentence on the flight's own date; a date before it has the sentence", () => {
    expect(G.homeOnJapanDate(items, "Ken", "2026-12-14", VN, true)).toBeNull();
    expect(G.homeOnJapanDate(items, "Ken", "2026-12-13", VN, true)?.title).toBe(dec14.title);
  });
  it("sheet trip, a flight whose date in the trip's zone is a day later: today's behaviour, unchanged", () => {
    expect(G.homeOnJapanDate(items, "Ken", "2026-12-14", VN, false)?.title).toBe(dec14.title);
    expect(G.homeOnJapanDate(items, "Ken", "2026-12-15", VN, false)).toBeNull();
  });
  it("the default follows the open trip", () => {
    expect(G.homeOnJapanDate(items, "Ken", "2026-12-14", VN)?.title).toBe(dec14.title);
    asPlanTrip();
    expect(G.homeOnJapanDate(items, "Ken", "2026-12-14", VN)).toBeNull();
  });
});

describe("5. a hotel outside Japan is not searched for in Japan", () => {
  const stay = (name: string) => ({ name });
  it("a Vietnam city, a Cambodia city, a Japan city on a plan trip", () => {
    expect(G.stayMapsQuery(stay("Stay A Hotel"), "Hanoi", "Vietnam", true)).toBe("Stay A Hotel, Hanoi, Vietnam");
    expect(G.stayMapsQuery(stay("Stay B Resort"), "Siem Reap", "Cambodia", true)).toBe("Stay B Resort, Siem Reap, Cambodia");
    expect(G.stayMapsQuery(stay("Stay C Inn"), "Tokyo", "Japan", true)).toBe("Stay C Inn, Tokyo, Japan");
  });
  it("no country: Japan on a sheet trip, nothing added on a plan trip", () => {
    expect(G.stayMapsQuery(stay("Stay A Hotel"), "Tokyo", null, false)).toBe("Stay A Hotel, Tokyo, Japan");
    expect(G.stayMapsQuery(stay("Stay A Hotel"), "Hanoi", null, true)).toBe("Stay A Hotel, Hanoi");
  });
  it("a name that already holds the city does not repeat it", () => {
    expect(G.stayMapsQuery(stay("Imperial Hotel Tokyo"), "Tokyo", "Japan", false)).toBe("Imperial Hotel Tokyo, Japan");
    expect(G.stayMapsQuery(stay("Made-Up Hanoi Lake"), "Hanoi", "Vietnam", true)).toBe("Made-Up Hanoi Lake, Vietnam");
  });
  it("a sheet trip's own call (two arguments) is what it was", () => {
    expect(G.stayMapsQuery(stay("Stay A Hotel"), "Kyoto", undefined, false)).toBe("Stay A Hotel, Kyoto, Japan");
  });
  it("countryOfCity reads the stay's own city", () => {
    const cities = [{ id: "a", country: "Vietnam" }, { id: "b", country: null }];
    expect(G.countryOfCity(cities, "a")).toBe("Vietnam");
    expect(G.countryOfCity(cities, "b")).toBeNull();
    expect(G.countryOfCity(cities, "zzz")).toBeNull();
    expect(G.countryOfCity(cities, null)).toBeNull();
  });
});

describe("6. no 'Train' outside Japan", () => {
  it("which countries get a Train button", () => {
    for (const c of ["Japan", "japan", " Japan ", null, undefined, ""]) expect(G.countryHasTrain(c as any), String(c)).toBe(true);
    for (const c of ["Vietnam", "Cambodia", "Thailand"]) expect(G.countryHasTrain(c), c).toBe(false);
  });
  const href = "https://www.google.com/maps/search/?api=1&query=Stay%20A%20Hotel%2C%20Hanoi";
  const draw = (country: string | null | undefined) => renderToStaticMarkup(
    country === undefined ? createElement(GT.default, { href, name: "Stay A Hotel" })
      : createElement(GT.GetThereCountry.Provider, { value: country }, createElement(GT.default, { href, name: "Stay A Hotel" })));
  it("a plan trip in Vietnam or Cambodia: Walk and Taxi; in Japan or with no country: all three", () => {
    asPlanTrip();
    for (const c of ["Vietnam", "Cambodia"]) { const h = draw(c); expect(h).toContain("Walk ↗"); expect(h).toContain("Taxi ↗"); expect(h).not.toContain("Train"); }
    for (const c of ["Japan", null, undefined]) { const h = draw(c as any); expect(h).toContain("Walk ↗"); expect(h).toContain("Train ↗"); expect(h).toContain("Taxi ↗"); }
  });
  it("a sheet trip keeps all three, whatever the country", () => {
    for (const c of ["Vietnam", "Japan", null, undefined]) { const h = draw(c as any); expect(h).toContain("Train ↗"); expect(h).toContain("Walk ↗"); }
  });
});

describe("7. a day with a summary is not 'nothing set'", () => {
  it("a plan day with a real summary and no lines: no times set", () => {
    expect(S.emptyDayLine("The plan", { plan: true, hasRealSummary: true })).toBe("The plan has no times set for this day.");
  });
  it("with no summary (a sample summary is not one): unchanged", () => {
    expect(S.emptyDayLine("The plan", { plan: true, hasRealSummary: false })).toBe("The plan has nothing set for this day.");
  });
  it("a sheet trip is unchanged, summary or not", () => {
    expect(S.emptyDayLine("Larisa's Guide", { plan: false, hasRealSummary: true })).toBe("Larisa's Guide has nothing set for this day.");
    expect(S.emptyDayLine("Your Guide", { plan: false, hasRealSummary: false })).toBe("Your Guide has nothing set for this day.");
  });
});

describe("8. the phrase card opens on the country you are in", () => {
  // (shuffled, so the order comes from the dates)
  const cities = [
    { name: "Shiga Kogen", country: "Japan", arrivalDate: "2027-01-02", departureDate: "2027-01-07", sequenceOrder: 4 },
    { name: "Hanoi", country: "Vietnam", arrivalDate: "2026-12-14", departureDate: "2026-12-26", sequenceOrder: 0 },
    { name: "Tokyo", country: "Japan", arrivalDate: "2027-01-07", departureDate: "2027-01-09", sequenceOrder: 5 },
    { name: "Siem Reap", country: "Cambodia", arrivalDate: "2026-12-30", departureDate: "2027-01-02", sequenceOrder: 3 },
    { name: "Hué", country: "Vietnam", arrivalDate: "2026-12-26", departureDate: "2026-12-28", sequenceOrder: 1 },
    { name: "Hoi An", country: "Vietnam", arrivalDate: "2026-12-28", departureDate: "2026-12-30", sequenceOrder: 2 },
  ];
  it("this trip's cities → vietnam, cambodia, japan", () => { expect(C.countriesInVisitOrder(cities)).toEqual(["vietnam", "cambodia", "japan"]); });
  it("today Dec 31 → cambodia; Jan 3 → japan; Nov 17 → vietnam; Dec 26 (the day it changes) → vietnam; Jan 8 → japan", () => {
    expect(C.openingCountry(cities, "2026-12-31", "2027-01-09")).toBe("cambodia");
    expect(C.openingCountry(cities, "2027-01-03", "2027-01-09")).toBe("japan");
    expect(C.openingCountry(cities, "2026-11-17", "2027-01-09")).toBe("vietnam");
    expect(C.openingCountry(cities, "2026-12-26", "2027-01-09")).toBe("vietnam");
    expect(C.openingCountry(cities, "2027-01-08", "2027-01-09")).toBe("japan");
  });
  it("after the trip: the first country again", () => { expect(C.openingCountry(cities, "2027-02-01", "2027-01-09")).toBe("vietnam"); });
  it("a Japan-only trip → japan, and a city with no phrases is passed over", () => {
    const only = [{ name: "Tokyo", country: "Japan", arrivalDate: "2026-10-05", departureDate: "2026-10-12" }, { name: "Kyoto", country: "Japan", arrivalDate: "2026-10-12" }];
    expect(C.countriesInVisitOrder(only)).toEqual(["japan"]);
    expect(C.openingCountry(only, "2026-10-08", "2026-10-29")).toBe("japan");
    expect(C.countriesInVisitOrder([{ name: "Sleepy Town", country: "Elsewhere" }, ...only])).toEqual(["japan"]);
  });
});

describe("12. every city ahead has its Maybes tab on a plan trip", () => {
  const cities = [{ id: "c1", name: "Hanoi" }, { id: "c2", name: "Hué" }, { id: "c3", name: "Siem Reap", hidden: true }, { id: "c4", name: "Tokyo" }];
  const days = [
    { date: "2026-12-14", cityId: "c1" }, { date: "2026-12-25", cityId: "c1" }, { date: "2026-12-26", cityId: "c2" },
    { date: "2026-12-31", cityId: "c3" }, { date: "2027-01-08", cityId: "c4" },
  ];
  const names = (list: { name: string }[]) => list.map((c) => c.name);
  it("a plan trip with no maybes, before the trip: every city ahead, in order (a hidden one left out)", () => {
    expect(names(S.planMaybeCities(cities, days, "2026-11-17"))).toEqual(["Hanoi", "Hué", "Tokyo"]);
  });
  it("mid-trip: past cities drop, today's stays", () => {
    expect(names(S.planMaybeCities(cities, days, "2026-12-26"))).toEqual(["Hué", "Tokyo"]);
    expect(names(S.planMaybeCities(cities, days, "2026-12-25"))).toEqual(["Hanoi", "Hué", "Tokyo"]);
  });
  it("after the last day: none", () => { expect(S.planMaybeCities(cities, days, "2027-02-01")).toEqual([]); });
  it("a city with no day is not offered", () => { expect(names(S.planMaybeCities([...cities, { id: "c9", name: "Nowhere" }], days, "2026-11-17"))).not.toContain("Nowhere"); });
});

describe("12 (sheet trip). a sheet trip's Maybes still keeps a city only when it has ideas", () => {
  it("IdeasPage chooses planMaybeCities only for a plan trip; the sheet branch is the old filter", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync(new URL("../../frontend/src/pages/IdeasPage.tsx", import.meta.url), "utf8");
    expect(src).toContain("if (isPlanTrip()) return planMaybeCities(");
    expect(src).toContain("return inOrder.filter((c) => (((withIdeas.has(c.id) || sampled(c)) && ahead.has(c.id)) || c.id === here) && !c.hidden);");
  });
});
