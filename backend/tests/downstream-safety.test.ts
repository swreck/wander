/**
 * DOWNSTREAM SAFETY TESTS (Sep 2026)
 *
 * Wander is downstream of Larisa's Guide (her Google Sheet). These tests pin the
 * protections that keep an app bug or an AI mistake from damaging the trip:
 * 1. A trip that comes from the Guide cannot be deleted — and is still there after the attempt
 * 2. An ordinary trip (not from the Guide) can still be deleted
 * 3. Every route that could write to a sheet is gone (push, pull, import, sync interval)
 * 4. Reading what Wander holds from the Guide still works
 */

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.ACCESS_CODES = "SAFE1:SafetyTester";
process.env.JWT_SECRET = "test-secret-downstream";

const { app } = await import("../src/index.js");
const prisma = new PrismaClient();

const GUIDE_TRIP_NAME = "Downstream Safety Guide Trip";
const PLAIN_TRIP_NAME = "Downstream Safety Plain Trip";

let token: string;
let guideTripId: string;
let plainTripId: string;

afterAll(async () => {
  const trips = await prisma.trip.findMany({
    where: { name: { in: [GUIDE_TRIP_NAME, PLAIN_TRIP_NAME] } },
  });
  for (const t of trips) {
    await prisma.sheetSyncConfig.deleteMany({ where: { tripId: t.id } });
    await prisma.trip.delete({ where: { id: t.id } });
  }
  await prisma.$disconnect();
});

async function createTrip(name: string): Promise<string> {
  const res = await request(app)
    .post("/api/trips")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name,
      startDate: "2026-10-05",
      endDate: "2026-10-07",
      cities: [{ name: "Okayama", country: "Japan", arrivalDate: "2026-10-05", departureDate: "2026-10-07" }],
      skipDocumentCarryOver: true,
    });
  expect(res.status).toBe(201);
  return res.body.id;
}

describe("Setup", () => {
  it("logs in and creates one Guide trip and one ordinary trip", async () => {
    const loginRes = await request(app).post("/api/auth/login").send({ code: "SAFE1" });
    token = loginRes.body.token;
    expect(token).toBeTruthy();

    guideTripId = await createTrip(GUIDE_TRIP_NAME);
    plainTripId = await createTrip(PLAIN_TRIP_NAME);

    // Mark the first trip as coming from the Guide, the way an import does
    await prisma.sheetSyncConfig.create({
      data: { tripId: guideTripId, spreadsheetId: "test-sheet-id", lastSyncAt: new Date(), lastSyncStatus: "success" },
    });
  });
});

describe("Trips from the Guide are never deleted", () => {
  it("refuses to delete a Guide trip", async () => {
    const res = await request(app)
      .delete(`/api/trips/${guideTripId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Larisa's Guide/);
  });

  it("the Guide trip, its city, and its days are all still there", async () => {
    const trip = await prisma.trip.findUnique({
      where: { id: guideTripId },
      include: { cities: true, days: true },
    });
    expect(trip).not.toBeNull();
    expect(trip!.cities.length).toBe(1);
    expect(trip!.days.length).toBeGreaterThan(0);
  });

  it("an ordinary trip can still be deleted", async () => {
    const res = await request(app)
      .delete(`/api/trips/${plainTripId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const gone = await prisma.trip.findUnique({ where: { id: plainTripId } });
    expect(gone).toBeNull();
  });
});

describe("Nothing can write to a sheet", () => {
  for (const path of ["/api/sheets-sync/push", "/api/sheets-sync/pull", "/api/sheets-sync/import"]) {
    it(`POST ${path} no longer exists`, async () => {
      const res = await request(app)
        .post(path)
        .set("Authorization", `Bearer ${token}`)
        .send({ tripId: guideTripId, spreadsheetId: "test-sheet-id" });
      expect(res.status).toBe(404);
    });
  }

  it("PATCH /api/sheets-sync/config (auto-sync interval) no longer exists", async () => {
    const res = await request(app)
      .patch("/api/sheets-sync/config")
      .set("Authorization", `Bearer ${token}`)
      .send({ tripId: guideTripId, syncIntervalMs: 900000 });
    expect(res.status).toBe(404);
    const config = await prisma.sheetSyncConfig.findUnique({ where: { tripId: guideTripId } });
    expect(config!.syncIntervalMs).toBe(0);
  });
});

describe("Reading what Wander holds from the Guide still works", () => {
  it("status shows when Wander last read the Guide", async () => {
    const res = await request(app)
      .get(`/api/sheets-sync/status/${guideTripId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.lastSyncAt).toBeTruthy();
  });
});
