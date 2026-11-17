/**
 * A day's own clock and country on the server (December plan S2a, Nov 17 2026): the forecast's "today" and its Open-Meteo
 * zone follow the day, a stay's lookup names its city's country, and a trip is over by the clock of its last day.
 * Invented trip, cities and people only. No network: fetch and the Google lookup are spies.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const googled: string[] = [];
vi.mock("../src/services/usage.js", async (orig) => {
  const real: any = await orig();
  return { ...real, googleFetch: vi.fn(async (_what: string, url: string) => { googled.push(url); return new Response(JSON.stringify({ candidates: [] }), { status: 200 }); }) };
});

process.env.GOOGLE_MAPS_API_KEY = "test-key-not-real";
const { dayWeather } = await import("../src/services/dayWeather.js");
const { stayLookup, stayPoint, packingWeather } = await import("../src/services/packingWeather.js");
const { tripOver, tripIsOver, forgetTripsOver } = await import("../src/services/tripOver.js");
const { dayZone } = await import("../src/services/dayCountry.js");
const prisma = new PrismaClient();

const TAG = `dz-${Date.now()}`;
const at0 = (s: string) => new Date(`${s}T00:00:00Z`);
const ids = { trips: [] as string[], travelers: [] as string[] };
let hanoiTrip = "", japanTrip = "", ken = "";

const fetched: string[] = [];
const forecast = (date: string) => ({
  daily: { time: [date], temperature_2m_max: [80], temperature_2m_min: [70], precipitation_probability_max: [10], precipitation_sum: [0], weather_code: [1] },
});

beforeAll(async () => {
  const k = await prisma.traveler.create({ data: { displayName: `${TAG}-Ken` } });
  ken = k.id; ids.travelers.push(k.id);
  // A trip through Vietnam then Japan, its zone Vietnam's
  const t = await prisma.trip.create({ data: { name: `${TAG} Trip A`, status: "active", startDate: at0("2026-12-14"), endDate: at0("2027-01-08"), timeZone: "Asia/Ho_Chi_Minh" } });
  hanoiTrip = t.id; ids.trips.push(t.id);
  await prisma.tripMember.create({ data: { tripId: t.id, travelerId: k.id, role: "planner" } });
  const hanoi = await prisma.city.create({ data: { tripId: t.id, name: "City A", country: "Vietnam", timeZone: "Asia/Ho_Chi_Minh", latitude: 21.0245, longitude: 105.84117, sequenceOrder: 0 } });
  const tokyo = await prisma.city.create({ data: { tripId: t.id, name: "City B", country: "Japan", timeZone: "Asia/Tokyo", latitude: 35.6895, longitude: 139.69171, sequenceOrder: 1 } });
  await prisma.day.create({ data: { tripId: t.id, cityId: hanoi.id, date: at0("2026-12-20") } });
  await prisma.day.create({ data: { tripId: t.id, cityId: tokyo.id, date: at0("2027-01-05") } });
  await prisma.day.create({ data: { tripId: t.id, cityId: tokyo.id, date: at0("2027-01-08") } });
  // A Japan-style trip: no zone on its cities, the trip's zone Tokyo's
  const j = await prisma.trip.create({ data: { name: `${TAG} Trip B`, status: "active", startDate: at0("2026-10-13"), endDate: at0("2026-10-29"), timeZone: "Asia/Tokyo" } });
  japanTrip = j.id; ids.trips.push(j.id);
  const kyoto = await prisma.city.create({ data: { tripId: j.id, name: "City C", country: "Japan", latitude: 35.0116, longitude: 135.7681, sequenceOrder: 0 } });
  await prisma.day.create({ data: { tripId: j.id, cityId: kyoto.id, date: at0("2026-10-29") } });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    const url = String(input);
    fetched.push(url);
    const d = url.match(/start_date=(\d{4}-\d{2}-\d{2})/)?.[1] || "2026-12-20";
    return new Response(JSON.stringify(forecast(d)), { status: 200, headers: { "content-type": "application/json" } });
  });
});
afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.accommodation.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.day.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.city.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.tripMember.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.trip.deleteMany({ where: { id: { in: ids.trips } } });
  await prisma.traveler.deleteMany({ where: { id: { in: ids.travelers } } });
  await prisma.$disconnect();
});

describe("T7 a day's forecast is asked on the clock the day is lived on", () => {
  // 11:00 PM Dec 20 in Vietnam is 1:00 AM Dec 21 in Japan
  const now = new Date("2026-12-20T16:00:00Z");
  const japansDate = "2026-12-21";

  it("the Hanoi day is asked for on Dec 20, with the Vietnam zone", async () => {
    fetched.length = 0;
    const w = await dayWeather(hanoiTrip, `${TAG}-Ken`, "2026-12-20", japansDate, now);
    expect(w).not.toBeNull();
    const urls = fetched.filter((u) => u.includes("open-meteo"));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u).toContain("timezone=Asia%2FHo_Chi_Minh");
      expect(u).not.toContain("Asia%2FTokyo");
      expect(u).toContain("start_date=2026-12-20");
    }
  });

  it("a Tokyo day of the same trip is asked in Japan's zone, on Japan's date", async () => {
    fetched.length = 0;
    await dayWeather(hanoiTrip, `${TAG}-Ken`, "2027-01-05", japansDate, now);
    const urls = fetched.filter((u) => u.includes("open-meteo"));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u).toContain("timezone=Asia%2FTokyo");
      expect(u).toContain("start_date=2026-12-21");
    }
  });

  it("Japan's trip: its day is asked in Tokyo's zone with the date it was given, exactly as before", async () => {
    fetched.length = 0;
    await dayWeather(japanTrip, `${TAG}-Ken`, "2026-10-29", "2026-10-29", new Date("2026-10-28T15:30:00Z"));
    const urls = fetched.filter((u) => u.includes("open-meteo"));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) { expect(u).toContain("timezone=Asia%2FTokyo"); expect(u).toContain("start_date=2026-10-29"); }
  });

  it("a day's zone is its city's, else the trip's, else Japan's", async () => {
    expect(await dayZone(hanoiTrip, "2026-12-20")).toBe("Asia/Ho_Chi_Minh");
    expect(await dayZone(hanoiTrip, "2027-01-05")).toBe("Asia/Tokyo");
    expect(await dayZone(hanoiTrip, "2026-12-30")).toBe("Asia/Ho_Chi_Minh");
    expect(await dayZone(japanTrip, "2026-10-29")).toBe("Asia/Tokyo");
    expect(await dayZone(`${TAG}-none`, "2026-10-29")).toBe("Asia/Tokyo");
  });
});

describe("T8 the packing lookup names the stay's country", () => {
  it("a Hanoi stay asks for '… Vietnam'; a Japan stay asks for exactly today's words", async () => {
    const row = (name: string, city: string, country: string | null) => ({ name, latitude: null, longitude: null, city: { name: city, latitude: null, longitude: null, country } });
    expect(stayLookup(row("Stay A", "City A", "Vietnam"))).toBe("Stay A City A Vietnam");
    // the old words: `${name} ${city.name.split(/\s+-\s+|\s*\(|,/)[0]} Japan`
    const old = (name: string, city: string) => `${name} ${city.split(/\s+-\s+|\s*\(|,/)[0]} Japan`;
    for (const [n, c] of [["Stay B", "Kyoto"], ["Stay C", "Tokyo - Ginza"], ["Stay D", "Nikko (Chuzenji)"], ["Stay E", "Osaka, Namba"]]) {
      expect(stayLookup(row(n, c, "Japan"))).toBe(old(n, c));
    }
    // (a city that doesn't say its country names none: never Japan by default)
    expect(stayLookup(row("Stay F", "City D", null))).toBe("Stay F City D");
  });

  it("the Google lookup actually carries it", async () => {
    googled.length = 0;
    await stayPoint({ name: "Stay Q", latitude: null, longitude: null, city: { name: "City Q", latitude: 1, longitude: 2, country: "Vietnam" } }, []);
    await stayPoint({ name: "Stay R", latitude: null, longitude: null, city: { name: "City R", latitude: 1, longitude: 2, country: "Japan" } }, []);
    const inputs = googled.map((u) => decodeURIComponent(u.match(/input=([^&]+)/)?.[1] || ""));
    expect(inputs).toContain("Stay Q City Q Vietnam");
    expect(inputs).toContain("Stay R City R Japan");
    expect(inputs.join(" ")).not.toContain("Stay Q City Q Japan");
  });

  it("a stay's forecast is asked on its city's clock, else the trip's", async () => {
    const stay = await prisma.accommodation.create({ data: { tripId: hanoiTrip, cityId: (await prisma.city.findFirstOrThrow({ where: { tripId: hanoiTrip, name: "City A" } })).id, name: "Stay A", checkInDate: at0("2099-12-20"), checkOutDate: at0("2099-12-22"), latitude: 21.03, longitude: 105.85 } });
    void stay;
    fetched.length = 0;
    await packingWeather(hanoiTrip, `${TAG}-Ken`.toLowerCase(), "2099-12-19");
    const urls = fetched.filter((u) => u.includes("open-meteo"));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) { expect(u).toContain("timezone=Asia%2FHo_Chi_Minh"); expect(u).not.toContain("Asia%2FTokyo"); }
  });
});

describe("T9 a trip is over by the clock of its last day", () => {
  it("a trip ending Jan 8 in Japan is over once it is Jan 9 by Tokyo's clock, not before", () => {
    // 4:00 PM UTC Jan 8 is 1:00 AM Jan 9 in Tokyo, 11:00 PM Jan 8 in Vietnam
    const moment = new Date("2027-01-08T16:00:00Z");
    expect(tripOver("2027-01-08", moment, "Asia/Tokyo")).toBe(true);
    expect(tripOver("2027-01-08", moment, "Asia/Ho_Chi_Minh")).toBe(false);
    expect(tripOver("2027-01-08", moment)).toBe(true);
  });

  it("the trip's own last day sets the clock: Hanoi's last day is over by Vietnam's clock", async () => {
    forgetTripsOver();
    const t = await prisma.trip.create({ data: { name: `${TAG} Trip C`, status: "active", startDate: at0("2026-12-14"), endDate: at0("2026-12-20"), timeZone: "Asia/Ho_Chi_Minh" } });
    ids.trips.push(t.id);
    const city = await prisma.city.create({ data: { tripId: t.id, name: "City A", country: "Vietnam", timeZone: "Asia/Ho_Chi_Minh", sequenceOrder: 0 } });
    await prisma.day.create({ data: { tripId: t.id, cityId: city.id, date: at0("2026-12-20") } });
    // 11:00 PM Dec 20 in Vietnam is already Dec 21 in Tokyo
    expect(await tripIsOver(t.id, new Date("2026-12-20T16:00:00Z"))).toBe(false);
    forgetTripsOver();
    expect(await tripIsOver(t.id, new Date("2026-12-20T17:30:00Z"))).toBe(true);
  });

  it("December's last day (Jan 8, Tokyo) is over after Jan 8 by Tokyo's clock", async () => {
    forgetTripsOver();
    expect(await tripIsOver(hanoiTrip, new Date("2027-01-08T14:00:00Z"))).toBe(false);
    forgetTripsOver();
    expect(await tripIsOver(hanoiTrip, new Date("2027-01-08T16:00:00Z"))).toBe(true);
  });

  it("Japan's trip is over as today: by Tokyo's clock", async () => {
    forgetTripsOver();
    expect(await tripIsOver(japanTrip, new Date("2026-10-29T14:00:00Z"))).toBe(false);
    forgetTripsOver();
    expect(await tripIsOver(japanTrip, new Date("2026-10-29T15:30:00Z"))).toBe(true);
  });
});
