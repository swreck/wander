/**
 * S2a-fix (Nov 17 2026): a landing's time reads with the LANDING's clock words; the page's clock is the day's; the
 * trip is over by its last day's clock; more airports. Invented flights only ("Flight 1"); Japan's strings are the old ones.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const dz = await import("../../frontend/src/lib/dayZone.ts");
const gd = await import("../../frontend/src/lib/guideDisplay.ts");
const phase = await import("../../frontend/src/lib/tripPhase.ts");
const { zoneOfDay, zoneOfLastDay } = dz;
const { nightOf, nowMinutesOn } = gd;
const { finishedLastDay } = phase;

const VN = "Asia/Ho_Chi_Minh", KR = "Asia/Seoul", JP = "Asia/Tokyo", CA = "America/Los_Angeles";

const item = (o: Record<string, unknown>): any => ({
  id: `i-${Math.random()}`, date: null, time: null, endTime: null, timeZone: null, kind: "plan", title: "A line", detail: null, forWhom: null,
  place: null, confirmation: null, link: null, source: "Backroads' itinerary", sortOrder: 0, ...o,
});
const takeoff = (date: string, time: string, timeZone: string, title: string) =>
  item({ kind: "flight", date: `${date}T00:00:00.000Z`, time, timeZone, title, forWhom: "Ken & Larisa" });
const landing = (date: string, time: string, timeZone: string | null, title: string) =>
  item({ kind: "flight", date: `${date}T00:00:00.000Z`, time, timeZone, title, forWhom: "Ken & Larisa" });

const phoneIn = (zone: string) => { process.env.TZ = zone; };
const realTz = process.env.TZ;
afterEach(() => { vi.useRealTimers(); if (realTz === undefined) delete process.env.TZ; else process.env.TZ = realTz; });

const text = (n: any) => n.away.map((a: any) => a.text);

describe("F1 the night's flight words: a landing's time carries the landing's own clock", () => {
  // December: take off from California Mon Dec 14 11:45 AM, land at Seoul Tue Dec 15 5:40 PM Korea time
  const items = [takeoff("2026-12-14", "11:45", CA, "Flight 1 · San Francisco → Seoul"), landing("2026-12-15", "17:40", KR, "Land at ICN · Airline")];
  const when = () => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-12-01T00:00:00Z")); };

  it("form 1 (a phone still at the take-off, Home's Tonight): 5:40 PM is Korea time, never Vietnam time", () => {
    when(); phoneIn(CA);
    const [t] = text(nightOf("2026-12-14", [], items, VN, true));
    expect(t).toContain("lands at Seoul Incheon 5:40 PM Tue Korea time");
    expect(t).not.toMatch(/Vietnam time/);
  });
  it("form 2 (the same phone on a day screen): Korea time too", () => {
    when(); phoneIn(CA);
    const [t] = text(nightOf("2026-12-14", [], items, VN, false));
    expect(t).toBe("On the plane overnight — lands at Seoul Incheon 5:40 PM Tue Korea time");
  });
  it("form 3, neither clock is the trip's: the take-off is said on its own clock, not converted", () => {
    when(); phoneIn(VN);
    const [t] = text(nightOf("2026-12-14", [], items, VN, false));
    expect(t).toBe("Take off Mon 11:45 AM California time — lands at Seoul Incheon 5:40 PM Tue Korea time");
    expect(t).not.toMatch(/Vietnam time/);
  });
  it("form 3, the landing is on the trip's clock: the take-off is converted to it, as before", () => {
    when(); phoneIn(VN);
    const more = [takeoff("2026-12-14", "20:00", CA, "Flight 2 · San Francisco → Hanoi"), landing("2026-12-15", "21:30", VN, "Land at HAN · Airline")];
    expect(text(nightOf("2026-12-14", [], more, VN, false))[0]).toBe("Take off Tue 11:00 AM Vietnam time — lands at Hanoi 9:30 PM Tue");
  });
  it("form 3, the take-off is on the trip's clock and the landing is not: 'Flying overnight', the landing with its own words", () => {
    when(); phoneIn(VN);
    const more = [takeoff("2026-12-14", "22:00", VN, "Flight 3 · Hanoi → Seoul"), landing("2026-12-15", "17:40", KR, "Land at ICN · Airline")];
    expect(text(nightOf("2026-12-14", [], more, VN, false))[0]).toBe("Flying overnight — lands at Seoul Incheon 5:40 PM Tue Korea time");
  });
});

describe("F1 Japan reads exactly as it did", () => {
  // Japan: take off from California Tue Oct 13 12:00 PM, land at Narita Wed Oct 14 3:00 PM (Japan's own clock, or none given)
  const when = () => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z")); };
  for (const landZone of [JP, null]) {
    it(`a landing on ${landZone ?? "no recorded"} clock: the three forms are the old strings`, () => {
      const items = [takeoff("2026-10-13", "12:00", CA, "Flight 1 · San Francisco → Tokyo"), landing("2026-10-14", "15:00", landZone, "Land at NRT · Airline")];
      when(); phoneIn(CA);
      expect(text(nightOf("2026-10-13", [], items, JP, false))[0]).toBe("On the plane overnight — lands at Narita 3:00 PM Wed Japan time");
      expect(text(nightOf("2026-10-13", [], items, JP, true))[0]).toMatch(/^On the plane — lands at Narita 3:00 PM Wed Japan time \(.+ your time\)$/);
      phoneIn(JP);
      expect(text(nightOf("2026-10-13", [], items, JP, false))[0]).toBe("Take off Wed 4:00 AM Japan time — lands at Narita 3:00 PM Wed");
    });
  }
});

describe("F2 the page's clock is the day's", () => {
  const trip = VN;
  const days = [
    { date: "2026-12-30T00:00:00.000Z", city: { timeZone: VN, country: "Vietnam" } },
    { date: "2027-01-04T00:00:00.000Z", city: { timeZone: JP, country: "Japan" } },
  ];
  it("on December's Japan day the page is on Tokyo's clock, on a Vietnam day on Vietnam's, on an unknown day on the trip's", () => {
    expect(zoneOfDay(days, "2027-01-04", trip)).toBe(JP);
    expect(zoneOfDay(days, "2026-12-30", trip)).toBe(VN);
    expect(zoneOfDay(days, "2027-02-01", trip)).toBe(VN);
  });
  it("a line with no zone of its own is 'now' by the day's clock: 9:00 AM Tokyo is not two hours off", () => {
    const at = new Date("2027-01-04T00:30:00Z"); // 9:30 AM in Tokyo, 7:30 AM in Hanoi
    expect(nowMinutesOn("2027-01-04", zoneOfDay(days, "2027-01-04", trip), at)).toBe(9 * 60 + 30);
    expect(nowMinutesOn("2027-01-04", trip, at)).toBe(7 * 60 + 30);
  });
  it("Japan's trip: its cities carry no zone, so every date's page zone is the trip's, as it was", () => {
    const japan = Array.from({ length: 40 }, (_, k) => ({ date: new Date(Date.UTC(2026, 9, 5 + k)).toISOString(), city: { country: "Japan" } }));
    for (const d of japan) expect(zoneOfDay(japan, d.date, JP)).toBe(JP);
    expect(zoneOfDay(japan, "2026-12-31", JP)).toBe(JP);
    expect(zoneOfDay([], "2026-10-05", JP)).toBe(JP);
  });
});

describe("F4 the trip is over by its last day's clock", () => {
  const dates = ["2027-01-07", "2027-01-08"];
  const tokyoLast = [{ date: "2027-01-07", city: { timeZone: VN } }, { date: "2027-01-08", city: { timeZone: JP } }];
  const now = new Date("2027-01-08T16:30:00Z"); // Jan 8 11:30 PM in Vietnam, Jan 9 1:30 AM in Tokyo
  it("zoneOfLastDay is the last day's", () => {
    expect(zoneOfLastDay(tokyoLast, null, VN)).toBe(JP);
    expect(zoneOfLastDay(tokyoLast, "2027-01-08T00:00:00Z", VN)).toBe(JP);
    expect(zoneOfLastDay([], null, VN)).toBe(VN);
  });
  it("Jan 8 11:30 PM Vietnam time is finished for a trip whose last day is Tokyo's, not by the trip's Vietnam clock", () => {
    expect(finishedLastDay(dates, zoneOfLastDay(tokyoLast, null, VN), now)).toBe("2027-01-08");
    expect(finishedLastDay(dates, VN, now)).toBeNull();
  });
  it("Japan's trip is as before: no zones on its cities, the trip's clock", () => {
    const japan = [{ date: "2026-11-01", city: { country: "Japan" } }, { date: "2026-11-02", city: { country: "Japan" } }];
    const at = new Date("2026-11-02T14:59:00Z"); // 11:59 PM Nov 2 in Tokyo
    expect(finishedLastDay(["2026-11-01", "2026-11-02"], zoneOfLastDay(japan, null, JP), at)).toBeNull();
    expect(finishedLastDay(["2026-11-01", "2026-11-02"], zoneOfLastDay(japan, null, JP), new Date("2026-11-02T15:01:00Z"))).toBe("2026-11-02");
  });
});

describe("F5 the airports", () => {
  it("each code reads as its name in the night's words", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-12-01T00:00:00Z")); phoneIn(VN);
    const names: Record<string, string> = { ICN: "Seoul Incheon", HAN: "Hanoi", BKK: "Bangkok", SAI: "Siem Reap", HUI: "Hué", DAD: "Da Nang" };
    for (const [code, name] of Object.entries(names)) {
      const items = [takeoff("2026-12-20", "22:00", VN, "Flight 1 · A → B"), landing("2026-12-21", "01:30", VN, `Land at ${code} · Airline`)];
      expect(text(nightOf("2026-12-20", [], items, VN, false))[0]).toBe(`Flying overnight — lands at ${name} 1:30 AM Mon`);
    }
  });
});
