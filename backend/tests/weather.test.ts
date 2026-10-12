/**
 * THE DAY'S FORECAST WHERE YOU SLEEP (Oct 13 2026 — Ken's weather plan). The route answers a trip's own people only,
 * refuses a date it can't read, and says nothing for a day that's over or beyond the forecast's 16 days (no guess).
 * The forecast itself comes from Open-Meteo and is checked by hand against her real stays (scratchpad day-weather.mjs).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-weather";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { dayWeather } = await import("../src/services/dayWeather.js");
const prisma = new PrismaClient();

let tripId = "", inId = "", outId = "", member = "", stranger = "";
beforeAll(async () => {
  const a = await prisma.traveler.create({ data: { displayName: "Weather In Q." } });
  const b = await prisma.traveler.create({ data: { displayName: "Weather Out Q." } });
  inId = a.id; outId = b.id;
  tripId = (await prisma.trip.create({ data: { name: "WX Trip", status: "archived", timeZone: "Asia/Tokyo", startDate: new Date("2026-10-05"), endDate: new Date("2026-10-29") } })).id;
  await prisma.tripMember.create({ data: { tripId, travelerId: a.id, role: "member" } });
  member = signToken({ code: "Weather In Q.", displayName: "Weather In Q.", travelerId: a.id });
  stranger = signToken({ code: "Weather Out Q.", displayName: "Weather Out Q.", travelerId: b.id });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.traveler.deleteMany({ where: { id: { in: [inId, outId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe("the day's forecast route", () => {
  it("is for the trip's own people", async () => {
    const r = await request(app).get(`/api/weather/trip/${tripId}/day/2026-10-19`).set("Authorization", `Bearer ${stranger}`);
    expect([403, 404]).toContain(r.status);
    const none = await request(app).get(`/api/weather/trip/${tripId}/day/2026-10-19`);
    expect(none.status).toBe(401);
  });
  it("refuses a date it can't read", async () => {
    const r = await request(app).get(`/api/weather/trip/${tripId}/day/Oct-19`).set("Authorization", `Bearer ${member}`);
    expect(r.status).toBe(400);
  });
  it("says nothing for a day that's over, or past the forecast's 16 days — never a guess", async () => {
    expect(await dayWeather(tripId, "Weather In Q.", "2026-10-11", "2026-10-13")).toBeNull();
    expect(await dayWeather(tripId, "Weather In Q.", "2026-10-30", "2026-10-13")).toBeNull();
  });
  it("with no stay that night and no town on the day, nothing (no made-up place)", async () => {
    expect(await dayWeather(tripId, "Weather In Q.", "2026-10-19", "2026-10-13")).toBeNull();
    const r = await request(app).get(`/api/weather/trip/${tripId}/day/2026-10-19`).set("Authorization", `Bearer ${member}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ weather: null });
  });
});
