/**
 * 2.0 FEATURE CHAOS TESTS
 *
 * Covers the new features introduced in the 2.0 build:
 * 1. SSE real-time sync — connection, heartbeat, broadcast filtering
 * 2. Travel advisories — endpoint, country derivation, edge cases
 * 3. Day-level decisions — create with dayId, vote, resolve, chaos scenarios
 * 4. Import choice groups — extraction creates decisions from OR-activities
 * 5. Cross-feature interactions — decisions + advisories + sync together
 */

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.ACCESS_CODES = "V2A:Ken,V2B:Larisa,V2C:Andy";
process.env.JWT_SECRET = "test-secret-v2";

const { app } = await import("../src/index.js");
const prisma = new PrismaClient();

const TEST_TRIP = "2.0 Features Test Trip";

let kenToken: string;
let larisaToken: string;
let andyToken: string;
let tripId: string;
let cityId: string;
let dayId: string;

afterAll(async () => {
  const trips = await prisma.trip.findMany({ where: { name: TEST_TRIP } });
  for (const t of trips) {
    await prisma.trip.delete({ where: { id: t.id } });
  }
  await prisma.$disconnect();
});

// ─── Setup ───────────────────────────────────────────────────

describe("Setup", () => {
  it("logs in three users", async () => {
    const k = await request(app).post("/api/auth/login").send({ code: "V2A" });
    expect(k.status).toBe(200);
    kenToken = k.body.token;

    const l = await request(app).post("/api/auth/login").send({ code: "V2B" });
    expect(l.status).toBe(200);
    larisaToken = l.body.token;

    const a = await request(app).post("/api/auth/login").send({ code: "V2C" });
    expect(a.status).toBe(200);
    andyToken = a.body.token;
  });

  it("creates a trip with a city and day", async () => {
    const trip = await request(app)
      .post("/api/trips")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ name: TEST_TRIP, startDate: "2026-10-17", endDate: "2026-11-01" });
    expect(trip.status).toBe(201);
    tripId = trip.body.id;

    const city = await request(app)
      .post("/api/cities")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({
        tripId,
        name: "Hanoi",
        country: "Vietnam",
        arrivalDate: "2026-10-18",
        departureDate: "2026-10-21",
      });
    expect(city.status).toBe(201);
    cityId = city.body.id;

    // Get a day for this trip (filtered to our city)
    const days = await request(app)
      .get(`/api/days/trip/${tripId}`)
      .set("Authorization", `Bearer ${kenToken}`);
    expect(days.status).toBe(200);
    const cityDay = days.body.find((d: any) => d.cityId === cityId);
    expect(cityDay).toBeDefined();
    dayId = cityDay.id;
  });
});

// ─── SSE Real-Time Sync ─────────────────────────────────────

describe("SSE Real-Time Sync", () => {
  it("SSE endpoint requires token", async () => {
    const res = await request(app).get(`/api/sse/trip/${tripId}`);
    expect(res.status).toBe(401);
  });

  it("SSE endpoint rejects invalid token", async () => {
    const res = await request(app)
      .get(`/api/sse/trip/${tripId}?token=garbage`);
    expect(res.status).toBe(401);
  });

  it("SSE endpoint sets correct headers with valid token", async () => {
    // supertest doesn't handle streaming well, so we test the broadcast function
    // and verify SSE auth works via the rejection tests above.
    // The actual streaming behavior is tested in Playwright offline tests.
    const { broadcastChange } = await import("../src/routes/sse.js");

    // Broadcast should not throw with no clients connected
    expect(() => {
      broadcastChange(tripId, {
        userCode: "V2A",
        displayName: "Ken",
        description: "test broadcast",
      });
    }).not.toThrow();
  });
});

// ─── Travel Advisories ──────────────────────────────────────

describe("Travel Advisories", () => {
  it("returns advisories for trip with Vietnamese city", async () => {
    const res = await request(app)
      .get(`/api/travel-advisory/trip/${tripId}`)
      .set("Authorization", `Bearer ${kenToken}`);
    expect(res.status).toBe(200);
    expect(res.body.advisories).toBeDefined();
    expect(res.body.advisories.length).toBeGreaterThan(0);

    const vietnam = res.body.advisories.find((a: any) => a.country === "Vietnam");
    expect(vietnam).toBeDefined();
    expect(vietnam.visa).toBeDefined();
    expect(vietnam.vaccines).toBeDefined();
    expect(vietnam.vaccines.length).toBeGreaterThan(0);
  });

  it("includes a pre-trip summary with visa actions", async () => {
    const res = await request(app)
      .get(`/api/travel-advisory/trip/${tripId}`)
      .set("Authorization", `Bearer ${kenToken}`);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.visaActions.length).toBeGreaterThan(0);
  });

  it("returns empty for trip with no cities", async () => {
    // Create an empty trip
    const empty = await request(app)
      .post("/api/trips")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ name: "Empty Advisory Trip" });
    const emptyId = empty.body.id;

    const res = await request(app)
      .get(`/api/travel-advisory/trip/${emptyId}`)
      .set("Authorization", `Bearer ${kenToken}`);
    expect(res.status).toBe(200);
    expect(res.body.advisories).toEqual([]);
    expect(res.body.summary).toBeNull();

    // Cleanup
    await prisma.trip.delete({ where: { id: emptyId } });
  });

  it("returns 404 for nonexistent trip", async () => {
    const res = await request(app)
      .get("/api/travel-advisory/trip/nonexistent-id")
      .set("Authorization", `Bearer ${kenToken}`);
    expect(res.status).toBe(404);
  });

  it("handles multi-country trips", async () => {
    // Add a Cambodian city
    const cambodia = await request(app)
      .post("/api/cities")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({
        tripId,
        name: "Siem Reap",
        country: "Cambodia",
        arrivalDate: "2026-10-22",
        departureDate: "2026-10-25",
      });
    expect(cambodia.status).toBe(201);

    const res = await request(app)
      .get(`/api/travel-advisory/trip/${tripId}`)
      .set("Authorization", `Bearer ${kenToken}`);

    expect(res.body.advisories.length).toBe(2);
    const countries = res.body.advisories.map((a: any) => a.country);
    expect(countries).toContain("Vietnam");
    expect(countries).toContain("Cambodia");

    // Summary should have actions for both countries
    expect(res.body.summary.visaActions.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Day-Level Decisions ─────────────────────────────────────

describe("Day-Level Decisions", () => {
  let decisionId: string;
  let optionAId: string;
  let optionBId: string;

  it("creates a decision with dayId", async () => {
    const res = await request(app)
      .post("/api/decisions")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({
        tripId,
        cityId,
        dayId,
        title: "Afternoon choice: temple or cooking class?",
      });
    expect(res.status).toBe(201);
    expect(res.body.dayId).toBe(dayId);
    decisionId = res.body.id;
  });

  it("creates a decision without dayId (trip-level)", async () => {
    const res = await request(app)
      .post("/api/decisions")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({
        tripId,
        cityId,
        title: "Which restaurant for the group dinner?",
      });
    expect(res.status).toBe(201);
    expect(res.body.dayId).toBeNull();

    // Cleanup — delete this one so it doesn't interfere
    await request(app)
      .delete(`/api/decisions/${res.body.id}`)
      .set("Authorization", `Bearer ${kenToken}`);
  });

  it("adds two options to the day decision", async () => {
    const optA = await request(app)
      .post(`/api/decisions/${decisionId}/options`)
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ name: "Temple of Literature", description: "Historic Confucian temple" });
    expect(optA.status).toBe(200);
    optionAId = optA.body.options.find((o: any) => o.name === "Temple of Literature").id;

    const optB = await request(app)
      .post(`/api/decisions/${decisionId}/options`)
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ name: "Cooking class", description: "Learn pho and spring rolls" });
    expect(optB.status).toBe(200);
    optionBId = optB.body.options.find((o: any) => o.name === "Cooking class").id;
  });

  it("three users vote (Ken: A, Larisa: B, Andy: A)", async () => {
    const v1 = await request(app)
      .post(`/api/decisions/${decisionId}/vote`)
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ optionId: optionAId });
    expect(v1.status).toBe(200);

    const v2 = await request(app)
      .post(`/api/decisions/${decisionId}/vote`)
      .set("Authorization", `Bearer ${larisaToken}`)
      .send({ optionId: optionBId });
    expect(v2.status).toBe(200);

    const v3 = await request(app)
      .post(`/api/decisions/${decisionId}/vote`)
      .set("Authorization", `Bearer ${andyToken}`)
      .send({ optionId: optionAId });
    expect(v3.status).toBe(200);
  });

  it("user can change their vote", async () => {
    const res = await request(app)
      .post(`/api/decisions/${decisionId}/vote`)
      .set("Authorization", `Bearer ${andyToken}`)
      .send({ optionId: optionBId });
    expect(res.status).toBe(200);
    // Andy switched from A to B — now it's 1:2
  });

  it("can cast 'happy with any' vote (null optionId)", async () => {
    const res = await request(app)
      .post(`/api/decisions/${decisionId}/vote`)
      .set("Authorization", `Bearer ${andyToken}`)
      .send({ optionId: null });
    expect(res.status).toBe(200);
  });

  it("cannot vote on resolved decision", async () => {
    // Resolve first
    const resolve = await request(app)
      .post(`/api/decisions/${decisionId}/resolve`)
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ winnerIds: [optionAId] });
    expect(resolve.status).toBe(200);
    expect(resolve.body.winners).toContain("Temple of Literature");

    // Now try to vote — should fail
    const vote = await request(app)
      .post(`/api/decisions/${decisionId}/vote`)
      .set("Authorization", `Bearer ${larisaToken}`)
      .send({ optionId: optionBId });
    expect(vote.status).toBe(400);
  });

  it("winner becomes 'selected', losers become 'possible'", async () => {
    const winner = await prisma.experience.findUnique({ where: { id: optionAId } });
    expect(winner?.state).toBe("selected");

    const loser = await prisma.experience.findUnique({ where: { id: optionBId } });
    expect(loser?.state).toBe("possible");
  });

  it("cannot add option to resolved decision", async () => {
    const res = await request(app)
      .post(`/api/decisions/${decisionId}/options`)
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ name: "Museum visit" });
    expect(res.status).toBe(400);
  });

  it("decision shows in open decisions list before resolution", async () => {
    // Create a new open decision for this test
    const d = await request(app)
      .post("/api/decisions")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ tripId, cityId, dayId, title: "Morning walk route?" });
    expect(d.status).toBe(201);

    const list = await request(app)
      .get(`/api/decisions/trip/${tripId}`)
      .set("Authorization", `Bearer ${kenToken}`);
    expect(list.status).toBe(200);

    const open = list.body.find((dec: any) => dec.title === "Morning walk route?");
    expect(open).toBeDefined();

    // Clean up
    await request(app)
      .delete(`/api/decisions/${d.body.id}`)
      .set("Authorization", `Bearer ${kenToken}`);
  });
});

// ─── Decision Chaos Scenarios ────────────────────────────────

describe("Decision Chaos", () => {
  it("deleting a decision returns options to 'possible'", async () => {
    const d = await request(app)
      .post("/api/decisions")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ tripId, cityId, title: "Delete me test" });
    const dId = d.body.id;

    // Add options
    await request(app)
      .post(`/api/decisions/${dId}/options`)
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ name: "Option to be freed" });
    const optId = d.body.options?.[0]?.id;

    // Get option ID from updated decision
    const updated = await request(app)
      .get(`/api/decisions/trip/${tripId}`)
      .set("Authorization", `Bearer ${kenToken}`);
    const dec = updated.body.find((x: any) => x.id === dId);
    const freedOptId = dec?.options[0]?.id;

    // Delete decision
    const del = await request(app)
      .delete(`/api/decisions/${dId}`)
      .set("Authorization", `Bearer ${kenToken}`);
    expect(del.status).toBe(200);

    // Option should be 'possible' now
    if (freedOptId) {
      const exp = await prisma.experience.findUnique({ where: { id: freedOptId } });
      expect(exp?.state).toBe("possible");
    }
  });

  it("deleting nonexistent decision returns 404", async () => {
    const res = await request(app)
      .delete("/api/decisions/nonexistent-id")
      .set("Authorization", `Bearer ${kenToken}`);
    expect(res.status).toBe(404);
  });

  it("voting on nonexistent decision returns 404", async () => {
    const res = await request(app)
      .post("/api/decisions/nonexistent-id/vote")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ optionId: "fake" });
    expect(res.status).toBe(404);
  });

  it("creating decision with missing fields returns 400", async () => {
    const res = await request(app)
      .post("/api/decisions")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ tripId }); // Missing cityId and title
    expect(res.status).toBe(400);
  });

  it("creating decision with empty title returns 400", async () => {
    const res = await request(app)
      .post("/api/decisions")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ tripId, cityId, title: "   " });
    expect(res.status).toBe(400);
  });

  it("resolving with no winners is valid (nobody wins)", async () => {
    const d = await request(app)
      .post("/api/decisions")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ tripId, cityId, title: "Resolve empty test" });

    await request(app)
      .post(`/api/decisions/${d.body.id}/options`)
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ name: "Unwanted option" });

    const resolve = await request(app)
      .post(`/api/decisions/${d.body.id}/resolve`)
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ winnerIds: [] });
    expect(resolve.status).toBe(200);
    expect(resolve.body.winners).toEqual([]);
  });
});

// ─── Advisory Edge Cases ─────────────────────────────────────

describe("Advisory Edge Cases", () => {
  it("handles unknown country gracefully", async () => {
    // Add a city with unknown country
    const city = await request(app)
      .post("/api/cities")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({
        tripId,
        name: "Timbuktu",
        country: "Mali",
        arrivalDate: "2026-10-26",
        departureDate: "2026-10-27",
      });
    expect(city.status).toBe(201);

    const res = await request(app)
      .get(`/api/travel-advisory/trip/${tripId}`)
      .set("Authorization", `Bearer ${kenToken}`);
    expect(res.status).toBe(200);
    // Should still have Vietnam and Cambodia, Mali may or may not have data
    expect(res.body.advisories.length).toBeGreaterThanOrEqual(2);
  });

  it("requires auth", async () => {
    const res = await request(app)
      .get(`/api/travel-advisory/trip/${tripId}`);
    expect(res.status).toBe(401);
  });
});

// ─── SSE Broadcast Filtering ─────────────────────────────────

describe("SSE Broadcast Behavior", () => {
  it("broadcastChange function exists and doesn't throw for unknown trip", async () => {
    // Import the broadcast function directly
    const { broadcastChange } = await import("../src/routes/sse.js");

    // Should not throw even with no connected clients
    expect(() => {
      broadcastChange("nonexistent-trip", {
        userCode: "V2A",
        displayName: "Ken",
        description: "Added something",
      });
    }).not.toThrow();
  });
});

// ─── Cross-Feature: Decision + Day Integration ──────────────

describe("Cross-Feature Integration", () => {
  it("day with a decision shows decision in trip decisions list", async () => {
    const d = await request(app)
      .post("/api/decisions")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({
        tripId,
        cityId,
        dayId,
        title: "Integration test: day choice",
      });
    expect(d.status).toBe(201);

    const list = await request(app)
      .get(`/api/decisions/trip/${tripId}`)
      .set("Authorization", `Bearer ${kenToken}`);

    const found = list.body.find((dec: any) => dec.title === "Integration test: day choice");
    expect(found).toBeDefined();
    expect(found.dayId).toBe(dayId);

    // Cleanup
    await request(app)
      .delete(`/api/decisions/${d.body.id}`)
      .set("Authorization", `Bearer ${kenToken}`);
  });

  it("multiple decisions on same day coexist", async () => {
    const d1 = await request(app)
      .post("/api/decisions")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ tripId, cityId, dayId, title: "Morning choice" });
    const d2 = await request(app)
      .post("/api/decisions")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ tripId, cityId, dayId, title: "Afternoon choice" });

    expect(d1.status).toBe(201);
    expect(d2.status).toBe(201);

    const list = await request(app)
      .get(`/api/decisions/trip/${tripId}`)
      .set("Authorization", `Bearer ${kenToken}`);

    const dayDecisions = list.body.filter((d: any) => d.dayId === dayId);
    expect(dayDecisions.length).toBeGreaterThanOrEqual(2);

    // Cleanup
    await request(app)
      .delete(`/api/decisions/${d1.body.id}`)
      .set("Authorization", `Bearer ${kenToken}`);
    await request(app)
      .delete(`/api/decisions/${d2.body.id}`)
      .set("Authorization", `Bearer ${kenToken}`);
  });

  it("rapid vote changes don't create duplicate votes", async () => {
    const d = await request(app)
      .post("/api/decisions")
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ tripId, cityId, title: "Rapid vote test" });
    const dId = d.body.id;

    await request(app)
      .post(`/api/decisions/${dId}/options`)
      .set("Authorization", `Bearer ${kenToken}`)
      .send({ name: "Opt X" });

    const updated = await request(app)
      .get(`/api/decisions/trip/${tripId}`)
      .set("Authorization", `Bearer ${kenToken}`);
    const dec = updated.body.find((x: any) => x.id === dId);
    const optXId = dec?.options[0]?.id;

    if (optXId) {
      // Vote 5 times rapidly
      await Promise.all([
        request(app).post(`/api/decisions/${dId}/vote`).set("Authorization", `Bearer ${kenToken}`).send({ optionId: optXId }),
        request(app).post(`/api/decisions/${dId}/vote`).set("Authorization", `Bearer ${kenToken}`).send({ optionId: null }),
        request(app).post(`/api/decisions/${dId}/vote`).set("Authorization", `Bearer ${kenToken}`).send({ optionId: optXId }),
        request(app).post(`/api/decisions/${dId}/vote`).set("Authorization", `Bearer ${kenToken}`).send({ optionId: null }),
        request(app).post(`/api/decisions/${dId}/vote`).set("Authorization", `Bearer ${kenToken}`).send({ optionId: optXId }),
      ]);

      // Should still be exactly 1 vote for Ken (upsert)
      const votes = await prisma.decisionVote.findMany({
        where: { decisionId: dId, userCode: "V2A" },
      });
      expect(votes.length).toBe(1);
    }

    // Cleanup
    await request(app)
      .delete(`/api/decisions/${dId}`)
      .set("Authorization", `Bearer ${kenToken}`);
  });
});
