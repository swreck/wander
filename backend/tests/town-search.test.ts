/**
 * A town on the way, found for a trip that crosses countries (Nov 23 2026). Scout cannot lie about where: a town is
 * accepted only inside one of the trip's countries, only when its name is the name asked for, and only when the map
 * knows it as a real town (a population, or a seat of its province). The answers below are what Open-Meteo's place
 * search really returned on Nov 23 2026, cut to the fields read: "Ninh Binh" came back as four hamlets hundreds of
 * miles from the city, and "Hue" with look-alikes.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { findTown, pickTown, plainName, forgetTowns } from "../src/services/townSearch.js";

type Row = { name: string; feature_code: string; country: string; country_code: string; admin1?: string; population?: number; latitude: number; longitude: number; timezone: string };
const VN = (name: string, feature_code: string, admin1: string, latitude: number, longitude: number, population?: number, timezone = "Asia/Ho_Chi_Minh"): Row =>
  ({ name, feature_code, country: "Vietnam", country_code: "VN", admin1, latitude, longitude, timezone, ...(population ? { population } : {}) });

const ANSWERS: Record<string, Row[]> = {
  "VN|Hoi An": [
    VN("Hoi An", "PPL", "Da Nang City", 15.87944, 108.335, 32757),
    VN("Hội An", "PPL", "Quang Ngai", 14.9, 108.95),
    VN("Hội An", "PPL", "Da Nang City", 15.5, 108.28333),
    VN("Hội An Đông", "PPL", "Dong Thap", 10.4, 105.53333),
  ],
  "VN|Hue": [
    VN("Huế", "PPLA", "Thừa Thiên Huế Province", 16.4619, 107.59546, 1380000, "Asia/Bangkok"),
    VN("Hue Ốc", "PPL", "Hà Tĩnh Province", 18.5, 105.56667, undefined, "Asia/Bangkok"),
    VN("Huệ An", "PPL", "Dak Lak", 12.99049, 108.28988),
  ],
  "VN|Ninh Binh": [
    VN("Ninh Bình", "PPL", "Da Nang City", 15.7, 108.01667),
    VN("Ninh Bình", "PPL", "Khanh Hoa", 12.48333, 109.06667),
    VN("Ninh Bình", "PPL", "Dong Thap", 10.46784, 106.37711),
    VN("Ninh Bình", "PPL", "Khanh Hoa", 11.77257, 108.789),
  ],
  "VN|Sapa": [VN("Sapa", "PPL", "Lao Cai", 22.35, 103.86667, undefined, "Asia/Bangkok")],
  "VN|Sa Pa": [VN("Sa Pa", "PPL", "Lao Cai", 22.34023, 103.84415, 10554, "Asia/Bangkok"), VN("Sa Parr", "PPL", "Quang Tri", 16.55, 106.93333, undefined, "Asia/Bangkok")],
  "VN|Ha Long": [
    VN("Ha Long", "PPLA", "Quảng Ninh", 20.95045, 107.07336, 270054, "Asia/Bangkok"),
    VN("Hạ Long", "PPL", "Phu Tho", 21.35, 105.06667, undefined, "Asia/Bangkok"),
  ],
  "VN|Da Nang": [
    VN("Da Nang", "PPLA", "Da Nang City", 16.06778, 108.22083, 1276000),
    VN("Đa Năng", "PPL", "Tuyen Quang", 21.71222, 105.35498, undefined, "Asia/Bangkok"),
    VN("Da Nang International Airport", "AIRP", "Da Nang City", 16.04392, 108.19937),
  ],
  "KH|Angkor": [
    { name: "Angkor Thum", feature_code: "PPLA2", country: "Cambodia", country_code: "KH", admin1: "Siem Reap", latitude: 13.48339, longitude: 103.87413, timezone: "Asia/Phnom_Penh" },
    { name: "Angkor Sar", feature_code: "PPL", country: "Cambodia", country_code: "KH", admin1: "Prey Veng", population: 9851, latitude: 11.25152, longitude: 105.62256, timezone: "Asia/Phnom_Penh" },
  ],
  "KH|Kampot": [
    { name: "Kampot", feature_code: "PPLA", country: "Cambodia", country_code: "KH", admin1: "Kampot", population: 22691, latitude: 10.61041, longitude: 104.18145, timezone: "Asia/Phnom_Penh" },
    { name: "Kampot", feature_code: "PPLA2", country: "Cambodia", country_code: "KH", admin1: "Kampot", latitude: 10.60421, longitude: 104.25611, timezone: "Asia/Phnom_Penh" },
    { name: "Kampot", feature_code: "PPL", country: "Cambodia", country_code: "KH", admin1: "Preah Vihear", latitude: 13.36281, longitude: 105.12623, timezone: "Asia/Phnom_Penh" },
  ],
  "JP|Nagano": [
    { name: "Nagano", feature_code: "PPLA", country: "Japan", country_code: "JP", admin1: "Nagano", population: 372760, latitude: 36.65, longitude: 138.18333, timezone: "Asia/Tokyo" },
    { name: "Nagano", feature_code: "PPL", country: "Japan", country_code: "JP", admin1: "Miyagi", population: 11418, latitude: 38.09083, longitude: 140.65527, timezone: "Asia/Tokyo" },
    { name: "Nagano", feature_code: "PPL", country: "Japan", country_code: "JP", admin1: "Osaka", latitude: 34.45, longitude: 135.56667, timezone: "Asia/Tokyo" },
  ],
  // (asked with no country: what an unknown country's search falls back to)
  "|Springfield": [
    { name: "Springfield", feature_code: "PPLA2", country: "United States", country_code: "US", admin1: "Missouri", population: 170188, latitude: 37.21533, longitude: -93.29824, timezone: "America/Chicago" },
  ],
  "|Luang Prabang": [
    { name: "Luang Prabang", feature_code: "PPLA", country: "Laos", country_code: "LA", admin1: "Luang Prabang", population: 47378, latitude: 19.88601, longitude: 102.13503, timezone: "Asia/Vientiane" },
    { name: "Luang Prabang", feature_code: "PPL", country: "Thailand", country_code: "TH", admin1: "Nan", population: 900, latitude: 19.1, longitude: 100.9, timezone: "Asia/Bangkok" },
  ],
};

let asked: string[] = [];
let down = false;
function stub() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = new URL(String(url));
    expect(u.host).toBe("geocoding-api.open-meteo.com");
    const key = `${u.searchParams.get("countryCode") ?? ""}|${u.searchParams.get("name")}`;
    asked.push(key);
    if (down) return new Response("no", { status: 500 });
    const rows = ANSWERS[key];
    return new Response(JSON.stringify(rows ? { results: rows } : {}), { status: 200 });
  }));
}
const TRIP = ["Vietnam", "Cambodia", "Japan"];

beforeEach(() => { asked = []; down = false; forgetTowns(); stub(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("a name, made plain for comparing", () => {
  it("drops accents, case, spaces and hyphens; đ is d", () => {
    expect(plainName("Hội An")).toBe("hoian");
    expect(plainName("Huế")).toBe("hue");
    expect(plainName("Đà Nẵng")).toBe("danang");
    expect(plainName("Shiga Kōgen")).toBe("shigakogen");
    expect(plainName(" Sa-Pa ")).toBe("sapa");
  });
});

describe("which answer is the town asked for", () => {
  it("takes the one with the most people among those with the asked name", () => {
    expect(pickTown(ANSWERS["JP|Nagano"], "Nagano", TRIP)).toMatchObject({ name: "Nagano", region: "Nagano", lat: 36.65, lng: 138.18333, zone: "Asia/Tokyo", country: "Japan" });
    expect(pickTown(ANSWERS["VN|Hoi An"], "hoi an", TRIP)).toMatchObject({ name: "Hoi An", lat: 15.87944, lng: 108.335, country: "Vietnam" });
  });
  it("a look-alike is never the town: Huệ An is not Hue, an airport is not Da Nang, Angkor Thum is not Angkor", () => {
    expect(pickTown(ANSWERS["VN|Hue"], "Hue", TRIP)?.name).toBe("Huế");
    expect(pickTown(ANSWERS["VN|Hue"].slice(1), "Hue", TRIP)).toBeNull();
    expect(pickTown(ANSWERS["VN|Da Nang"].slice(1), "Da Nang", TRIP)).toBeNull();
    expect(pickTown(ANSWERS["KH|Angkor"], "Angkor", TRIP)).toBeNull();
  });
  it("hamlets that share a name are refused, however many: Ninh Binh came back as four, none the city", () => {
    expect(pickTown(ANSWERS["VN|Ninh Binh"], "Ninh Binh", TRIP)).toBeNull();
    expect(pickTown(ANSWERS["VN|Sapa"], "Sapa", TRIP)).toBeNull();          // (one hamlet-sized dot with no people counted: not sure enough)
  });
  it("a province's seat with no people counted is taken when nothing bigger has the name", () => {
    expect(pickTown(ANSWERS["KH|Kampot"].slice(1), "Kampot", TRIP)).toMatchObject({ lat: 10.60421, region: "Kampot" });
    expect(pickTown(ANSWERS["KH|Kampot"], "Kampot", TRIP)).toMatchObject({ lat: 10.61041 });
  });
  it("a town outside the trip's countries is never taken", () => {
    expect(pickTown(ANSWERS["|Springfield"], "Springfield", TRIP)).toBeNull();
    expect(pickTown(ANSWERS["JP|Nagano"], "Nagano", ["Vietnam", "Cambodia"])).toBeNull();
    expect(pickTown(ANSWERS["|Luang Prabang"], "Luang Prabang", ["Laos"])).toMatchObject({ country: "Laos", lat: 19.88601 });
  });
  it("answers with nothing usable are nothing", () => {
    expect(pickTown([], "Hoi An", TRIP)).toBeNull();
    expect(pickTown([{ name: "Hoi An", country: "Vietnam", country_code: "VN", population: 5 } as any], "Hoi An", TRIP)).toBeNull();   // (no point)
  });
});

describe("finding a town for a trip", () => {
  it("asks once per country of the trip, and returns the town with its own clock", async () => {
    const t = await findTown("Hoi An", TRIP);
    expect(t).toEqual({ name: "Hoi An", lat: 15.87944, lng: 108.335, zone: "Asia/Ho_Chi_Minh", country: "Vietnam", region: "Da Nang City" });
    expect(asked.sort()).toEqual(["JP|Hoi An", "KH|Hoi An", "VN|Hoi An"]);
  });
  it("is asked once: the second time comes from what it kept, whatever the spelling's case", async () => {
    await findTown("Da Nang", TRIP);
    const n = asked.length;
    expect((await findTown("da nang", TRIP))?.name).toBe("Da Nang");
    expect(asked.length).toBe(n);
  });
  it("\"Ha Long Bay\" has no answer of its own: the town on it is found, and named as the town", async () => {
    const t = await findTown("Ha Long Bay", TRIP);
    expect(t).toMatchObject({ name: "Ha Long", lat: 20.95045, region: "Quảng Ninh" });
    expect(asked).toContain("VN|Ha Long Bay");
    expect(asked).toContain("VN|Ha Long");
  });
  it("a sight that isn't a town is not guessed at: Angkor Wat, Ninh Binh's hamlets", async () => {
    expect(await findTown("Angkor Wat", TRIP)).toBeNull();
    expect(await findTown("Ninh Binh", TRIP)).toBeNull();
    expect(await findTown("Springfield", TRIP)).toBeNull();
  });
  it("a trip with no countries known finds nothing, and asks nothing", async () => {
    expect(await findTown("Hoi An", [])).toBeNull();
    expect(asked).toEqual([]);
  });
  it("a country Wander has no code for is searched by its name", async () => {
    expect(await findTown("Luang Prabang", ["Laos PDR"])).toBeNull();
    expect(asked).toEqual(["|Luang Prabang"]);
  });
  it("an empty or absurd name asks nothing", async () => {
    expect(await findTown("  ", TRIP)).toBeNull();
    expect(await findTown("x".repeat(200), TRIP)).toBeNull();
    expect(asked).toEqual([]);
  });
  it("when the search is down, nothing is found, and nothing is kept: it is asked again later", async () => {
    down = true;
    expect(await findTown("Hoi An", TRIP)).toBeNull();
    down = false;
    expect((await findTown("Hoi An", TRIP))?.name).toBe("Hoi An");
  });
});
