/**
 * ENTITY RESTORE TESTS
 *
 * Tests recovery of deleted entities from ChangeLog:
 * 1. Delete experience → restore from ChangeLog
 * 2. Delete reservation → restore
 * 3. Delete accommodation → restore
 * 4. 404 for nonexistent changelog entry
 * 5. 409 if entity ID already exists (double restore)
 */

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.ACCESS_CODES = "REST1:Restorer";
process.env.JWT_SECRET = "test-secret-restore";

const { app } = await import("../src/index.js");
const prisma = new PrismaClient();

const TEST_TRIP_NAME = "Restore Test Trip";

let token: string;
let tripId: string;
let cityId: string;
let dayId: string;

afterAll(async () => {
  const trips = await prisma.trip.findMany({ where: { name: TEST_TRIP_NAME } });
  for (const t of trips) {
    await prisma.trip.delete({ where: { id: t.id } });
  }
  await prisma.$disconnect();
});

// ─── Setup ───────────────────────────────────────────────────

describe("Setup", () => {
  it("logs in and creates trip", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ code: "REST1" });
    token = loginRes.body.token;

    const tripRes = await request(app)
      .post("/api/trips")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: TEST_TRIP_NAME,
        startDate: "2026-12-25",
        endDate: "2026-12-28",
        cities: [
          { name: "Hoi An", country: "Vietnam", arrivalDate: "2026-12-25", departureDate: "2026-12-28" },
        ],
        skipDocumentCarryOver: true,
      });
    expect(tripRes.status).toBe(201);
    tripId = tripRes.body.id;
    cityId = tripRes.body.cities[0].id;

    // Get a day ID
    const daysRes = await request(app)
      .get(`/api/days/trip/${tripId}`)
      .set("Authorization", `Bearer ${token}`);
    dayId = daysRes.body[0].id;
  });
});

// ─── Experience Restore ──────────────────────────────────────

describe("Restore Deleted Experience", () => {
  let experienceId: string;
  let changeLogId: string;

  it("creates an experience", async () => {
    const res = await request(app)
      .post("/api/experiences")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tripId,
        cityId,
        name: "Hoi An Ancient Town",
        description: "UNESCO heritage old quarter",
        themes: ["architecture"],
      });
    expect(res.status).toBe(201);
    experienceId = res.body.id;
  });

  it("deletes the experience and gets changeLogId", async () => {
    const res = await request(app)
      .delete(`/api/experiences/${experienceId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.changeLogId).toBeDefined();
    changeLogId = res.body.changeLogId;
  });

  it("verifies experience is gone", async () => {
    const res = await request(app)
      .get(`/api/experiences/${experienceId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("restores from ChangeLog", async () => {
    const res = await request(app)
      .post(`/api/restore/${changeLogId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.restored).toBeDefined();
    expect(res.body.entityType).toBe("experience");
  });

  it("restored experience is accessible", async () => {
    const res = await request(app)
      .get(`/api/experiences/${experienceId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Hoi An Ancient Town");
  });

  it("double restore returns 409 conflict", async () => {
    const res = await request(app)
      .post(`/api/restore/${changeLogId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});

// ─── Reservation Restore ─────────────────────────────────────

describe("Restore Deleted Reservation", () => {
  let reservationId: string;
  let changeLogId: string;

  it("creates a reservation", async () => {
    const res = await request(app)
      .post("/api/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tripId,
        dayId,
        name: "Morning Glory Restaurant",
        type: "restaurant",
        datetime: "2026-12-25T19:00:00+07:00",
        notes: "Book table by the river",
      });
    expect(res.status).toBe(201);
    reservationId = res.body.id;
  });

  it("deletes reservation", async () => {
    const res = await request(app)
      .delete(`/api/reservations/${reservationId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    // Find the changeLog entry for this deletion
    const log = await prisma.changeLog.findFirst({
      where: {
        entityType: "reservation",
        entityId: reservationId,
        actionType: "reservation_deleted",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    changeLogId = log!.id;
  });

  it("restores reservation from ChangeLog", async () => {
    const res = await request(app)
      .post(`/api/restore/${changeLogId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.entityType).toBe("reservation");
  });

  it("restored reservation is accessible", async () => {
    const res = await request(app)
      .get(`/api/reservations/trip/${tripId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const found = res.body.find((r: any) => r.id === reservationId);
    expect(found).toBeDefined();
    expect(found.name).toBe("Morning Glory Restaurant");
  });
});

// ─── Accommodation Restore ───────────────────────────────────

describe("Restore Deleted Accommodation", () => {
  let accommodationId: string;
  let changeLogId: string;

  it("creates an accommodation", async () => {
    const res = await request(app)
      .post("/api/accommodations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tripId,
        cityId,
        name: "Anantara Hoi An Resort",
        address: "1 Pham Hong Thai, Hoi An",
        checkInTime: "14:00",
        checkOutTime: "12:00",
      });
    expect(res.status).toBe(201);
    accommodationId = res.body.id;
  });

  it("deletes accommodation", async () => {
    const res = await request(app)
      .delete(`/api/accommodations/${accommodationId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    // Find ChangeLog
    const log = await prisma.changeLog.findFirst({
      where: {
        entityType: "accommodation",
        entityId: accommodationId,
        actionType: "accommodation_deleted",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    changeLogId = log!.id;
  });

  it("restores accommodation from ChangeLog", async () => {
    const res = await request(app)
      .post(`/api/restore/${changeLogId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.entityType).toBe("accommodation");
  });

  it("restored accommodation is accessible", async () => {
    const res = await request(app)
      .get(`/api/accommodations/trip/${tripId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const found = res.body.find((a: any) => a.id === accommodationId);
    expect(found).toBeDefined();
    expect(found.name).toBe("Anantara Hoi An Resort");
  });
});

// ─── Edge Cases ──────────────────────────────────────────────

describe("Restore Edge Cases", () => {
  it("returns 404 for nonexistent changeLogId", async () => {
    const res = await request(app)
      .post("/api/restore/nonexistent_changelog_id")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
