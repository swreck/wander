/**
 * APPROVAL SYSTEM TESTS
 *
 * Tests the Planner approval workflow:
 * 1. Traveler creates approval requests
 * 2. Planner lists pending approvals
 * 3. Planner approves → payload auto-executes
 * 4. Planner rejects → no side effects
 * 5. Pending count for badge display
 * 6. Payload types: bulk_delete, shift_dates, rearrange_day
 */

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.ACCESS_CODES = "APPR1:PlannerAli,APPR2:TravelerBee";
process.env.JWT_SECRET = "test-secret-approvals";

const { app } = await import("../src/index.js");
const prisma = new PrismaClient();

const TEST_TRIP_NAME = "Approvals Test Trip";

let plannerToken: string;
let travelerToken: string;
let tripId: string;
let cityId: string;
let dayIds: string[] = [];
let experienceIds: string[] = [];
let approvalId: string;

afterAll(async () => {
  const trips = await prisma.trip.findMany({ where: { name: TEST_TRIP_NAME } });
  for (const t of trips) {
    await prisma.trip.delete({ where: { id: t.id } });
  }
  await prisma.$disconnect();
});

// ─── Setup ───────────────────────────────────────────────────

describe("Setup", () => {
  it("logs in both users", async () => {
    const p = await request(app).post("/api/auth/login").send({ code: "APPR1" });
    expect(p.status).toBe(200);
    plannerToken = p.body.token;

    const t = await request(app).post("/api/auth/login").send({ code: "APPR2" });
    expect(t.status).toBe(200);
    travelerToken = t.body.token;
  });

  it("creates trip with experiences", async () => {
    const res = await request(app)
      .post("/api/trips")
      .set("Authorization", `Bearer ${plannerToken}`)
      .send({
        name: TEST_TRIP_NAME,
        startDate: "2026-12-25",
        endDate: "2026-12-28",
        cities: [
          { name: "Saigon", country: "Vietnam", arrivalDate: "2026-12-25", departureDate: "2026-12-28" },
        ],
        members: ["TravelerBee"],
        skipDocumentCarryOver: true,
      });
    expect(res.status).toBe(201);
    tripId = res.body.id;
    cityId = res.body.cities[0].id;

    // Trip creation sets status: "active" automatically

    // Create Traveler records and TripMember records
    // (ACCESS_CODE login doesn't auto-create Traveler records)
    let aliTraveler = await prisma.traveler.findFirst({ where: { displayName: "PlannerAli" } });
    if (!aliTraveler) {
      aliTraveler = await prisma.traveler.create({ data: { displayName: "PlannerAli" } });
    }
    await prisma.tripMember.upsert({
      where: { tripId_travelerId: { tripId, travelerId: aliTraveler.id } },
      create: { tripId, travelerId: aliTraveler.id, role: "planner" },
      update: {},
    });

    let beeTraveler = await prisma.traveler.findFirst({ where: { displayName: "TravelerBee" } });
    if (!beeTraveler) {
      beeTraveler = await prisma.traveler.create({ data: { displayName: "TravelerBee" } });
    }
    await prisma.tripMember.upsert({
      where: { tripId_travelerId: { tripId, travelerId: beeTraveler.id } },
      create: { tripId, travelerId: beeTraveler.id, role: "traveler" },
      update: {},
    });

    // Re-login using displayNames (Traveler table lookup, not ACCESS_CODE)
    const p = await request(app).post("/api/auth/login").send({ code: "PlannerAli" });
    plannerToken = p.body.token;
    expect(p.body.travelerId).toBeDefined();
    const t = await request(app).post("/api/auth/login").send({ code: "TravelerBee" });
    travelerToken = t.body.token;
    expect(t.body.travelerId).toBeDefined();

    // Get days
    const daysRes = await request(app)
      .get(`/api/days/trip/${tripId}`)
      .set("Authorization", `Bearer ${plannerToken}`);
    dayIds = daysRes.body.map((d: any) => d.id);
    expect(dayIds.length).toBeGreaterThanOrEqual(3);

    // Create some experiences to use in payloads
    for (const name of ["Pho Thin", "War Remnants Museum", "Cu Chi Tunnels"]) {
      const expRes = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${plannerToken}`)
        .send({ tripId, cityId, name, themes: ["food"] });
      expect(expRes.status).toBe(201);
      experienceIds.push(expRes.body.id);
    }

    // Promote first two to days
    for (let i = 0; i < 2; i++) {
      await request(app)
        .post(`/api/experiences/${experienceIds[i]}/promote`)
        .set("Authorization", `Bearer ${plannerToken}`)
        .send({ dayId: dayIds[i], timeWindow: "morning" });
    }
  });
});

// ─── Create Approval Requests ────────────────────────────────

describe("Create Approval Requests", () => {
  it("traveler creates a bulk_delete approval request", async () => {
    const res = await request(app)
      .post("/api/approvals")
      .set("Authorization", `Bearer ${travelerToken}`)
      .send({
        tripId,
        type: "bulk_delete",
        description: "Remove old restaurant picks",
        payload: { experienceIds: [experienceIds[2]] },
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe("pending");
    expect(res.body.type).toBe("bulk_delete");
    approvalId = res.body.id;
  });

  it("traveler creates a rearrange_day approval request", async () => {
    const res = await request(app)
      .post("/api/approvals")
      .set("Authorization", `Bearer ${travelerToken}`)
      .send({
        tripId,
        type: "rearrange_day",
        description: "Rearrange morning activities",
        payload: {
          dayId: dayIds[0],
          experienceOrder: [experienceIds[1], experienceIds[0]],
        },
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
  });
});

// ─── Pending Count ───────────────────────────────────────────

describe("Pending Approval Count", () => {
  it("returns pending count for badge", async () => {
    const res = await request(app)
      .get(`/api/approvals/${tripId}/pending`)
      .set("Authorization", `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(2);
  });
});

// ─── List Approvals ──────────────────────────────────────────

describe("List Approvals", () => {
  it("planner sees all approvals", async () => {
    const res = await request(app)
      .get(`/api/approvals/${tripId}`)
      .set("Authorization", `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    // Should include requester name
    expect(res.body[0].requester).toBeDefined();
    expect(res.body[0].requester.displayName).toBeDefined();
  });
});

// ─── Reject Approval ─────────────────────────────────────────

describe("Reject Approval", () => {
  it("planner rejects rearrange request with note", async () => {
    // Find the rearrange approval
    const listRes = await request(app)
      .get(`/api/approvals/${tripId}`)
      .set("Authorization", `Bearer ${plannerToken}`);
    const rearrangeApproval = listRes.body.find(
      (a: any) => a.type === "rearrange_day" && a.status === "pending"
    );
    expect(rearrangeApproval).toBeDefined();

    const res = await request(app)
      .patch(`/api/approvals/${rearrangeApproval.id}/review`)
      .set("Authorization", `Bearer ${plannerToken}`)
      .send({
        status: "rejected",
        reviewNote: "Let's keep the original order for now",
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(res.body.reviewNote).toBe("Let's keep the original order for now");
    expect(res.body.reviewedBy).toBeDefined();
  });

  it("rejection doesn't execute payload (experiences unchanged)", async () => {
    // The rearrange was rejected, so priority orders should be unchanged
    const exp0 = await request(app)
      .get(`/api/experiences/${experienceIds[0]}`)
      .set("Authorization", `Bearer ${plannerToken}`);
    const exp1 = await request(app)
      .get(`/api/experiences/${experienceIds[1]}`)
      .set("Authorization", `Bearer ${plannerToken}`);
    // Priority order should NOT be swapped
    expect(exp0.body.priorityOrder).toBeLessThanOrEqual(exp1.body.priorityOrder);
  });
});

// ─── Approve with Auto-Execution ─────────────────────────────

describe("Approve with Payload Execution", () => {
  it("planner approves bulk_delete → experiences actually deleted", async () => {
    // Verify experience exists before approval
    const beforeRes = await request(app)
      .get(`/api/experiences/${experienceIds[2]}`)
      .set("Authorization", `Bearer ${plannerToken}`);
    expect(beforeRes.status).toBe(200);

    // Approve the bulk_delete
    const res = await request(app)
      .patch(`/api/approvals/${approvalId}/review`)
      .set("Authorization", `Bearer ${plannerToken}`)
      .send({ status: "approved" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");

    // Verify experience was actually deleted
    const afterRes = await request(app)
      .get(`/api/experiences/${experienceIds[2]}`)
      .set("Authorization", `Bearer ${plannerToken}`);
    expect(afterRes.status).toBe(404);
  });
});

// ─── Validation ──────────────────────────────────────────────

describe("Approval Validation", () => {
  it("rejects invalid status value", async () => {
    // Create a new approval to test with
    const createRes = await request(app)
      .post("/api/approvals")
      .set("Authorization", `Bearer ${travelerToken}`)
      .send({
        tripId,
        type: "bulk_delete",
        description: "test",
        payload: { experienceIds: [] },
      });
    const newId = createRes.body.id;

    const res = await request(app)
      .patch(`/api/approvals/${newId}/review`)
      .set("Authorization", `Bearer ${plannerToken}`)
      .send({ status: "maybe" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for nonexistent approval", async () => {
    const res = await request(app)
      .patch("/api/approvals/nonexistent_id/review")
      .set("Authorization", `Bearer ${plannerToken}`)
      .send({ status: "approved" });
    expect(res.status).toBe(404);
  });
});

// ─── Shift Dates Approval ────────────────────────────────────

describe("Shift Dates Approval Auto-Execution", () => {
  it("creates and approves shift_dates → trip dates shift", async () => {
    // Get original day dates
    const daysBeforeRes = await request(app)
      .get(`/api/days/trip/${tripId}`)
      .set("Authorization", `Bearer ${plannerToken}`);
    const daysBefore = daysBeforeRes.body;
    const originalDate = daysBefore[0].date;

    // Create shift_dates approval
    const createRes = await request(app)
      .post("/api/approvals")
      .set("Authorization", `Bearer ${travelerToken}`)
      .send({
        tripId,
        type: "shift_dates",
        description: "Push everything back 2 days",
        payload: { tripId, offsetDays: 2 },
      });
    expect(createRes.status).toBe(201);

    // Approve it
    const approveRes = await request(app)
      .patch(`/api/approvals/${createRes.body.id}/review`)
      .set("Authorization", `Bearer ${plannerToken}`)
      .send({ status: "approved" });
    expect(approveRes.status).toBe(200);

    // Verify days shifted
    const daysAfterRes = await request(app)
      .get(`/api/days/trip/${tripId}`)
      .set("Authorization", `Bearer ${plannerToken}`);
    const daysAfter = daysAfterRes.body;

    // First day should be 2 days later than original
    const origDate = new Date(originalDate);
    const newDate = new Date(daysAfter[0].date);
    const diffMs = newDate.getTime() - origDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(2);
  });
});
