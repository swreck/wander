/**
 * A finished trip isn't looked at again in the background (Nov 15 2026; Ken, on old Japan: "they don't need to
 * update"). Every app open refreshed 91 places' hours from Google, a stop over a week old was re-checked by Google and
 * Claude, and each city's photo was picked again weekly. For a trip still to come or under way, all of that goes on.
 * Invented data; Google is never reached (its answers are made up here).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-past-trip-quiet";
process.env.GOOGLE_MAPS_API_KEY = "test-key";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const prisma = new PrismaClient();

const TAG = `ptq-${Date.now()}`;
const DAY = 24 * 3600_000;
const google: string[] = [];
const realFetch = globalThis.fetch;
vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (!url.includes("maps.googleapis.com")) return realFetch(input, init);
  google.push(url);
  if (url.includes("/place/photo")) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { "content-type": "image/jpeg" } });
  if (url.includes("/textsearch/")) return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), { headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify({ status: "OK", result: {} }), { headers: { "content-type": "application/json" } });
});
const asked = (bit: string) => google.filter((u) => u.includes(bit));
const until = async (ok: () => boolean, ms: number) => { const end = Date.now() + ms; while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 100)); return ok(); };

let doneTok = "", onTok = "", doneTrip = "", onTrip = "", doneCity = "", onCity = "";
const ids: { travelers: string[]; trips: string[] } = { travelers: [], trips: [] };

beforeAll(async () => {
  const make = async (who: string, endInDays: number) => {
    const t = await prisma.traveler.create({ data: { displayName: `${TAG}-${who}` } });
    const trip = await prisma.trip.create({ data: { name: `${TAG} ${who}`, startDate: new Date(Date.now() + (endInDays - 20) * DAY), endDate: new Date(Date.now() + endInDays * DAY), status: "active" } });
    await prisma.tripMember.create({ data: { tripId: trip.id, travelerId: t.id, role: "planner" } as any });
    const city = await prisma.city.create({ data: { tripId: trip.id, name: `${TAG} ${who} town`, latitude: 35, longitude: 135, sequenceOrder: 1 } });
    ids.travelers.push(t.id); ids.trips.push(trip.id);
    return { tok: signToken({ code: t.displayName, displayName: t.displayName, travelerId: t.id }), trip: trip.id, city: city.id };
  };
  ({ tok: doneTok, trip: doneTrip, city: doneCity } = await make("done", -20));
  ({ tok: onTok, trip: onTrip, city: onCity } = await make("on", 5));
  const old = new Date(Date.now() - 30 * DAY);
  // a checked place a month old, its hours too
  for (const which of ["done", "on"]) {
    await prisma.placePhoto.create({ data: { query: `${TAG} ${which} museum`, line: `${TAG} ${which} museum`, placeId: `${TAG}-${which}`, name: "A museum", verdict: "yes", why: "[2] same",
      photos: [{ ref: `${TAG}-ref`, credit: null }], hours: { weekly: [], dated: [], status: null, at: 0 }, checkedAt: old } });
  }
  // each city's photo, picked a month ago
  await prisma.cityPhotoPick.create({ data: { cityId: doneCity, ref: `${TAG}-cityref`, place: "A sight", credit: null, checkedAt: old } });
  await prisma.cityPhotoPick.create({ data: { cityId: onCity, ref: `${TAG}-cityref2`, place: "A sight", credit: null, checkedAt: old } });
});
afterAll(async () => {
  await prisma.cityPhotoPick.deleteMany({ where: { cityId: { in: [doneCity, onCity] } } });
  await prisma.placePhoto.deleteMany({ where: { query: { startsWith: TAG } } });
  await prisma.city.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.tripMember.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.trip.deleteMany({ where: { id: { in: ids.trips } } });
  await prisma.traveler.deleteMany({ where: { id: { in: ids.travelers } } });
  await prisma.$disconnect();
});

describe("a finished trip isn't looked at again", () => {
  it("an app open by someone whose trips are all over refreshes no place's hours", async () => {
    const r = await request(app).get("/api/place-photos/known").set("Authorization", `Bearer ${doneTok}`);
    expect(r.status).toBe(200);
    expect(r.body.places.some((p: any) => p.query === `${TAG} done museum` && p.hit?.name === "A museum")).toBe(true);
    await new Promise((ok) => setTimeout(ok, 2500));
    expect(asked("/place/details")).toEqual([]);
  });

  it("a finished trip's stop a month old comes back as kept: no re-check by Google (or Claude)", async () => {
    const before = google.length;
    const r = await request(app).post("/api/place-photos/lookup").set("Authorization", `Bearer ${doneTok}`)
      .send({ tripId: doneTrip, cityId: doneCity, places: [{ key: "a", query: `${TAG} done museum`, line: `${TAG} done museum` }] });
    expect(r.status).toBe(200);
    expect(r.body.places.a?.name).toBe("A museum");
    expect(r.body.places.a?.photos?.length).toBe(1);
    expect(google.slice(before)).toEqual([]);
  });

  it("a finished trip's city keeps its photo: fetched as kept, never searched for again", async () => {
    const before = google.length;
    const r = await request(app).get(`/api/city-photo/${doneCity}/info`);
    expect(r.status).toBe(200);
    expect(r.body.image).toMatch(new RegExp(`/api/city-photo/${doneCity}/image`));
    expect(google.slice(before).filter((u) => u.includes("/textsearch/"))).toEqual([]);
    expect(google.slice(before).some((u) => u.includes(`${TAG}-cityref`))).toBe(true);
  });

  it("a trip under way: the stop a month old is checked again, the city's photo picked again, and hours refreshed", async () => {
    let before = google.length;
    await request(app).post("/api/place-photos/lookup").set("Authorization", `Bearer ${onTok}`)
      .send({ tripId: onTrip, cityId: onCity, places: [{ key: "a", query: `${TAG} on museum`, line: `${TAG} on museum` }] });
    expect(google.slice(before).some((u) => u.includes("/place/details") && u.includes(`${TAG}-on`))).toBe(true);
    before = google.length;
    await request(app).get(`/api/city-photo/${onCity}/info`);
    expect(google.slice(before).some((u) => u.includes("/textsearch/"))).toBe(true);
    // (an app open by someone on it: the hours run starts — a museum whose hours are a month old is looked at)
    await prisma.placePhoto.update({ where: { query: `${TAG} done museum` }, data: { hours: { weekly: [], dated: [], status: null, at: 0 } } });
    await request(app).get("/api/place-photos/known").set("Authorization", `Bearer ${onTok}`);
    expect(await until(() => asked("/place/details").some((u) => u.includes(`${TAG}-done`)), 20000)).toBe(true);
  }, 30000);
});
