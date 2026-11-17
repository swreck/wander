/**
 * A day's own clock and country on the phone (December plan S2a, Nov 17 2026). December runs Vietnam, Cambodia and Japan,
 * flown from California through Seoul and Bangkok, so "Japan time" and Tokyo's date can't be assumed. Read straight from
 * the phone's own files, as line-places-country-links.test.ts does. Invented people and flights only ("Flight 1").
 * Japan's trip must read as it always did: the old functions are copied below as the reference.
 */
import { describe, it, expect } from "vitest";

const dz = await import("../../frontend/src/lib/dayZone.ts");
const gd = await import("../../frontend/src/lib/guideDisplay.ts");
const server = await import("../src/services/zoneWords.js");
const { ZONE_WORDS, zoneWords, zoneFromWords, momentOn, stillHomeOn, firstDayIn, zoneOfDay, countryOfDay } = dz;
const { travelerToday, scheduledLanding, scheduledLandingAt, sortDay, landingStatus, departureInTripZone, nowMinutesOn, zonedMoment, partyOf, isFor, isLanding, deadlineTimeWords } = gd;

const VN = "Asia/Ho_Chi_Minh", KR = "Asia/Seoul", JP = "Asia/Tokyo", CA = "America/Los_Angeles";
const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

const item = (o: Record<string, unknown>): any => ({
  id: `i-${Math.random()}`, date: null, time: null, endTime: null, timeZone: null, kind: "plan", title: "A line", detail: null, forWhom: null,
  place: null, confirmation: null, link: null, source: "Backroads' itinerary", sortOrder: 0, ...o,
});
const flight = (date: string, time: string, timeZone: string, title: string, detail: string | null, forWhom = "Ken & Larisa") =>
  item({ kind: "flight", date: `${date}T00:00:00.000Z`, time, timeZone, title, detail, forWhom });

// A made-up December: California → Seoul → Hanoi, Hanoi → Tokyo on Jan 2, Tokyo → California on Jan 8
const december = [
  flight("2026-12-14", "11:45", CA, "Flight 1 · San Francisco → Seoul", "Lands at Seoul Incheon (ICN) Tue, Dec 15, 5:40 PM Korea time"),
  flight("2026-12-15", "18:45", KR, "Flight 2 · Seoul → Hanoi", "Lands at Hanoi (HAN) Tue, Dec 15, 9:30 PM Vietnam time"),
  flight("2027-01-02", "10:00", VN, "Flight 3 · Hanoi → Tokyo", "Lands at Tokyo Haneda (HND) Sat, Jan 2, 8:00 PM Japan time"),
  flight("2027-01-08", "18:00", JP, "Flight 4 · Tokyo → San Francisco", "Lands at San Francisco (SFO) Fri, Jan 8, 11:00 AM California time"),
];
const at = (iso: string) => new Date(iso);

describe("T1 the words for a clock", () => {
  it("the six zones read as the plan says", () => {
    expect(zoneWords(CA)).toBe("California time");
    expect(zoneWords(JP)).toBe("Japan time");
    expect(zoneWords(VN)).toBe("Vietnam time");
    expect(zoneWords("Asia/Phnom_Penh")).toBe("Cambodia time");
    expect(zoneWords(KR)).toBe("Korea time");
    expect(zoneWords("Asia/Bangkok")).toBe("Thailand time");
  });
  it("a zone off the table reads as its last part plus time, and never as a raw Asia/ name", () => {
    expect(zoneWords("Asia/Singapore")).toBe("Singapore time");
    expect(zoneWords("America/New_York")).toBe("New York time");
    expect(zoneWords("Europe/Paris")).not.toMatch(/\//);
  });
  it("the phone's table and the server's are equal, and read the same for any zone", () => {
    expect(server.ZONE_WORDS).toEqual(ZONE_WORDS);
    for (const z of [...Object.keys(ZONE_WORDS), "Asia/Singapore", "Pacific/Auckland"]) expect(server.zoneWords(z)).toBe(zoneWords(z));
  });
  it("a spoken clock names its zone back", () => {
    expect(zoneFromWords("Korea time")).toBe(KR);
    expect(zoneFromWords("Vietnam")).toBe(VN);
    expect(zoneFromWords("Narnia time")).toBeNull();
  });
  it("one place decides a day's zone and country: its city's, else the trip's", () => {
    const days = [{ date: "2026-12-20T00:00:00.000Z", city: { timeZone: VN, country: "Vietnam" } }, { date: "2027-01-05T00:00:00.000Z", city: { timeZone: null, country: "Japan" } }, { date: "2027-01-06T00:00:00.000Z", city: null }];
    expect(zoneOfDay(days, "2026-12-20", JP)).toBe(VN);
    expect(zoneOfDay(days, "2027-01-05", JP)).toBe(JP);
    expect(zoneOfDay(days, "2027-01-06", VN)).toBe(VN);
    expect(zoneOfDay(days, "2030-01-01", VN)).toBe(VN);
    expect(countryOfDay(days, "2026-12-20")).toBe("Vietnam");
    expect(countryOfDay(days, "2027-01-06")).toBeNull();
  });
});

describe("T2 a landing is read from its own clock", () => {
  it("Seoul, Vietnam, Cambodia and Thailand landings read to the right instant", () => {
    const seoul = scheduledLandingAt("Lands at Seoul Incheon (ICN) Tue, Dec 15, 5:40 PM Korea time", "2026");
    expect(seoul?.at.toISOString()).toBe("2026-12-15T08:40:00.000Z");
    expect(seoul?.zone).toBe(KR);
    expect(scheduledLanding("Lands at Hanoi (HAN) Tue, Dec 15, 9:30 PM Vietnam time", "2026")?.toISOString()).toBe("2026-12-15T14:30:00.000Z");
    expect(scheduledLanding("Lands at Siem Reap (SAI) Fri, Jan 1, 7:25 PM Cambodia time", "2027")?.toISOString()).toBe("2027-01-01T12:25:00.000Z");
    expect(scheduledLanding("Lands at Bangkok (BKK) Fri, Jan 1, 10:05 PM Thailand time", "2027")?.toISOString()).toBe("2027-01-01T15:05:00.000Z");
  });
  it("Japan's and California's read as they did: the same instants", () => {
    const old = (detail: string, year: string) => {
      const m = detail.match(/Lands at [^\n|]*?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w* (\d{1,2}), (\d{1,2}):(\d{2}) ?([AP]M) (California|Japan) time/i)!;
      const month = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(m[1].slice(0, 3)) / 3 + 1;
      const h = (Number(m[3]) % 12) + (/p/i.test(m[5]) ? 12 : 0);
      return zonedMoment(`${year}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`, h * 60 + Number(m[4]), /california/i.test(m[6]) ? CA : JP);
    };
    for (const d of ["Lands at Narita (NRT) Wed, Oct 14, 3:00 PM Japan time", "Lands at San Francisco (SFO) Thu, Oct 29, 12:30 PM California time", "Lands at Kansai (KIX) Wed, Oct 14, 12:05 AM Japan time"]) {
      expect(scheduledLanding(d, "2026")?.getTime()).toBe(old(d, "2026").getTime());
    }
  });
  it("a landing in January after a December take-off is next year's", () => {
    expect(scheduledLandingAt("Lands at Hanoi (HAN) Fri, Jan 1, 1:00 AM Vietnam time", "2026", "2026-12-31")?.at.toISOString()).toBe("2026-12-31T18:00:00.000Z");
  });
});

describe("T3 today is the date where the plan has the person", () => {
  const me = "Ken";
  it("a. 9 AM Dec 14, phone in California: Dec 14, and the 11:45 AM California flight is still ahead", () => {
    const now = at("2026-12-14T17:00:00Z");
    expect(travelerToday(december, me, VN, "2026-12-14", now)).toBe("2026-12-14");
    expect(nowMinutesOn("2026-12-14", CA, now)).toBeLessThan(hm("11:45"));
  });
  it("b. 8 PM Dec 13, phone in California (already Dec 14 in Vietnam): Dec 13, before the trip", () => {
    expect(travelerToday(december, me, VN, "2026-12-13", at("2026-12-14T04:00:00Z"))).toBe("2026-12-13");
  });
  it("c. 6 PM Dec 15 Korea time, phone in Seoul: Dec 15, the 5:40 PM landing is behind and the 6:45 PM flight is next", () => {
    const now = at("2026-12-15T09:00:00Z");
    expect(travelerToday(december, me, VN, "2026-12-15", now)).toBe("2026-12-15");
    expect(nowMinutesOn("2026-12-15", KR, now)).toBeGreaterThan(hm("17:40"));
    expect(nowMinutesOn("2026-12-15", KR, now)).toBeLessThan(hm("18:45"));
  });
  it("d. 10 AM Dec 16, phone in Vietnam: Dec 16", () => {
    expect(travelerToday(december, me, VN, "2026-12-16", at("2026-12-16T03:00:00Z"))).toBe("2026-12-16");
  });
  it("e. 12:30 AM Jan 3 Japan time, phone in Japan: Jan 3, not Jan 2 (Vietnam's date at that moment)", () => {
    expect(travelerToday(december, me, VN, "2027-01-03", at("2027-01-02T15:30:00Z"))).toBe("2027-01-03");
  });
  it("f. a phone left on California time, 10 AM Dec 16 in Vietnam, after the landing: Dec 16", () => {
    // (the California phone's own date is still Dec 15)
    expect(travelerToday(december, me, VN, "2026-12-15", at("2026-12-16T03:00:00Z"))).toBe("2026-12-16");
  });
  it("after the flight home takes off, the phone's own date", () => {
    expect(travelerToday(december, me, VN, "2027-01-08", at("2027-01-08T10:00:00Z"))).toBe("2027-01-08");
  });

  // g. Japan's trip: the old function copied as the reference; the same date at every hour of the trip
  const oldToday = (items: any[], who: string, tripZone: string, phoneDay: string, now: Date) => {
    const party = partyOf(items, who);
    if (!party) return phoneDay;
    const mine = items.filter((i) => i.kind === "flight" && i.date && i.time && (i.forWhom === party || isFor(i, who)));
    const oldLanding = (detail: string, year: string) => {
      const m = detail.match(/Lands at [^\n|]*?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w* (\d{1,2}), (\d{1,2}):(\d{2}) ?([AP]M) (California|Japan) time/i);
      if (!m) return null;
      const month = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(m[1].slice(0, 3)) / 3 + 1;
      const h = (Number(m[3]) % 12) + (/p/i.test(m[5]) ? 12 : 0);
      return zonedMoment(`${year}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`, h * 60 + Number(m[4]), /california/i.test(m[6]) ? CA : JP);
    };
    const arrivals = [
      ...mine.filter((i) => isLanding(i)).map((i) => zonedMoment(String(i.date).slice(0, 10), hm(i.time), i.timeZone || tripZone)),
      ...mine.filter((i) => !isLanding(i) && /Lands at [^\n|]*Japan time/i.test(i.detail || "")).map((i) => oldLanding(i.detail, String(i.date).slice(0, 4))).filter((d: any): d is Date => !!d),
    ].filter((d) => !isNaN(d.getTime())).sort((a, b) => a.getTime() - b.getTime());
    const departures = mine.filter((i) => !isLanding(i)).map((i) => zonedMoment(String(i.date).slice(0, 10), hm(i.time), i.timeZone || tripZone)).sort((a, b) => a.getTime() - b.getTime());
    const landed = arrivals[0];
    const home = departures.filter((d) => !landed || d.getTime() > landed.getTime()).pop();
    if (!landed || now.getTime() < landed.getTime() || (home && now.getTime() >= home.getTime())) return phoneDay;
    return new Intl.DateTimeFormat("en-CA", { timeZone: tripZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  };
  const japan = [
    flight("2026-10-13", "12:00", CA, "Flight 1 · San Francisco → Tokyo", "Lands at Narita (NRT) Wed, Oct 14, 3:00 PM Japan time", "Julie & Andy"),
    item({ kind: "flight", date: "2026-10-14T00:00:00.000Z", time: "15:00", timeZone: JP, title: "Land at Narita (NRT) · Airline", forWhom: "Julie & Andy" }),
    flight("2026-10-28", "17:00", JP, "Flight 2 · Tokyo → San Francisco", "Lands at San Francisco (SFO) Wed, Oct 28, 10:30 AM California time", "Julie & Andy"),
    item({ kind: "flight", date: "2026-10-28T00:00:00.000Z", time: "10:30", timeZone: CA, title: "Land at San Francisco (SFO) · Airline", forWhom: "Julie & Andy" }),
  ];
  it("g. Japan's trip: the same date as the old rule at every hour from before the flight to after the landing home", () => {
    const start = Date.parse("2026-10-12T00:00:00Z");
    let checked = 0;
    for (let h = 0; h < 24 * 20; h++) {
      const now = new Date(start + h * 3600_000);
      for (const phoneZone of [CA, JP]) {
        const phoneDay = new Intl.DateTimeFormat("en-CA", { timeZone: phoneZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
        expect(travelerToday(japan, "Julie", JP, phoneDay, now)).toBe(oldToday(japan, "Julie", JP, phoneDay, now));
        checked++;
      }
    }
    expect(checked).toBe(960);
  });
  it("g. Japan's own landing row only (no flight detail) reads as the old rule too", () => {
    const rows = japan.filter((i) => i.kind === "flight");
    const now = at("2026-10-14T07:00:00Z");
    expect(travelerToday(rows, "Julie", JP, "2026-10-13", now)).toBe(oldToday(rows, "Julie", JP, "2026-10-13", now));
    expect(travelerToday(rows, "Julie", JP, "2026-10-13", now)).toBe("2026-10-14");
  });
});

describe("T4 a day across zones", () => {
  it("Jan 1: Cambodia 7:25 PM and Thailand 10:05 PM sit in order of the instant, whatever order they arrive in", () => {
    const sai = flight("2027-01-01", "19:25", "Asia/Phnom_Penh", "Flight 5 · Siem Reap → Bangkok", "Lands at Bangkok (BKK) Fri, Jan 1, 9:00 PM Thailand time");
    const bkk = flight("2027-01-01", "22:05", "Asia/Bangkok", "Flight 6 · Bangkok → Seoul", null);
    expect(sortDay([bkk, sai], VN).map((i: any) => i.title)).toEqual([sai.title, bkk.title]);
    expect(sortDay([sai, bkk], VN).map((i: any) => i.title)).toEqual([sai.title, bkk.title]);
    // a line on California's clock the same morning sits by its instant in the trip's day (4:00 AM Jan 2 in Vietnam)
    const home = flight("2027-01-01", "13:00", CA, "Flight 7 · San Francisco → Seoul", null);
    expect(sortDay([home, sai, bkk], VN).map((i: any) => i.title)).toEqual([sai.title, bkk.title, home.title]);
  });
  it("ahead or behind uses the line's own zone: a Seoul landing at 5:40 PM is behind at 5:41 PM Korea time (3:41 PM in Vietnam)", () => {
    const landing = item({ kind: "flight", date: "2026-12-15T00:00:00.000Z", time: "17:40", timeZone: KR, title: "Land at Seoul Incheon (ICN) · Airline", forWhom: "Ken & Larisa" });
    const takeoff = december[0];
    const before = landingStatus(landing, [landing, takeoff], VN, at("2026-12-15T08:00:00Z"));
    const after = landingStatus(landing, [landing, takeoff], VN, at("2026-12-15T08:41:00Z"));
    expect(before).toMatch(/Should be in the air now/);
    expect(before).not.toMatch(/Vietnam time/);
    expect(after).toMatch(/Was due to land/);
    // the clock words are the landing's own, never the trip's
    const away = landingStatus(landing, [landing, takeoff], VN, at("2026-12-14T20:00:00Z"));
    expect(away).toBeTruthy();
  });
});

describe("T5 the fixed words take the day's country and clock", () => {
  it("a Vietnam day holds no 'Japan'; a Japan day of the same trip reads as today", () => {
    expect(stillHomeOn("Vietnam")).toBe("On this Vietnam date");
    expect(stillHomeOn("Japan")).toBe("On this Japan date");
    expect(firstDayIn("Vietnam")).toBe("your first day in Vietnam");
    expect(firstDayIn("Japan")).toBe("your first day in Japan");
    // (no country known: no country named, never Japan)
    expect(stillHomeOn(null)).toBe("On this date");
    expect(firstDayIn(undefined)).toBe("your first day");
    for (const s of [stillHomeOn("Vietnam"), firstDayIn("Vietnam"), zoneWords(VN), zoneWords(KR)]) expect(s).not.toMatch(/japan/i);
  });
  it("a take-off from home on a Vietnam trip is said in Vietnam time; on Japan's trip, in Japan time as before", () => {
    // (a take-off on a clock that isn't this machine's, so the phone's own zone doesn't hide it)
    const f = flight("2026-12-15", "18:45", KR, "Flight 2 · Seoul → Hanoi", null);
    const vn = departureInTripZone(f, VN);
    expect(vn).toMatch(/Vietnam time$/);
    expect(vn).not.toMatch(/japan/i);
    const jp = departureInTripZone(flight("2026-10-13", "12:00", KR, "Flight 1", null), JP);
    expect(jp).toMatch(/Japan time$/);
  });
  it("a landing on a Vietnam trip reads its own clock, and Japan's landing reads 'Japan time' as before", () => {
    const hanoi = item({ kind: "flight", date: "2026-12-15T00:00:00.000Z", time: "21:30", timeZone: VN, title: "Land at Hanoi (HAN) · Airline", forWhom: "Ken & Larisa" });
    const f = december[1];
    const s = landingStatus(hanoi, [hanoi, f], VN, at("2026-12-15T10:00:00Z"));
    expect(s).toBeTruthy();
    expect(s).not.toMatch(/japan/i);
    const narita = item({ kind: "flight", date: "2026-10-14T00:00:00.000Z", time: "15:00", timeZone: JP, title: "Land at Narita (NRT) · Airline", forWhom: "Julie & Andy" });
    const s2 = landingStatus(narita, [narita], JP, at("2026-10-14T01:00:00Z"));
    expect(s2).toMatch(/3:00 PM/);
  });
  it("a deadline's words use the trip's clock words, never 'local time'", () => {
    const d = item({ kind: "deadline", date: "2026-12-20T00:00:00.000Z", time: "23:59", title: "Pay the balance" });
    expect(deadlineTimeWords(d, VN) ?? "").not.toMatch(/local time|Asia\//);
  });
});

describe("T6 the evening question's hour", () => {
  it("6 PM in Vietnam is 11:00 UTC, not seven hours off; in Japan, as today", () => {
    expect(momentOn("2026-12-20", "18:00", VN).toISOString()).toBe("2026-12-20T11:00:00.000Z");
    expect(momentOn("2026-12-20", "18:00", JP).toISOString()).toBe("2026-12-20T09:00:00.000Z");
    expect(momentOn("2026-10-20", "18:00", JP).getTime()).toBe(new Date("2026-10-20T18:00:00+09:00").getTime());
    expect(momentOn("2026-12-20", "18:00", KR).toISOString()).toBe("2026-12-20T09:00:00.000Z");
  });
});
