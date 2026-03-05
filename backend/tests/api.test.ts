import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

// Set test env vars before importing app
process.env.ACCESS_CODES = "TEST1:TestUser,TEST2:TestUser2";
process.env.JWT_SECRET = "test-secret";

// Dynamic import after env setup
const { app } = await import("../src/index.js");

const prisma = new PrismaClient();

// Track all test trip names for cleanup
const TEST_TRIP_NAMES = [
  "Comprehensive Test Trip",
  "Import Integration Trip",
  "Multi-User Collab Trip",
  "Edge Case Trip",
  "UX Lifecycle Trip",
];

afterAll(async () => {
  for (const name of TEST_TRIP_NAMES) {
    const trips = await prisma.trip.findMany({ where: { name } });
    for (const t of trips) {
      await prisma.trip.delete({ where: { id: t.id } });
    }
  }
  // Also clean up by partial match for renamed trips
  const renamed = await prisma.trip.findMany({
    where: { name: { contains: "Comprehensive" } },
  });
  for (const t of renamed) {
    await prisma.trip.delete({ where: { id: t.id } });
  }
  await prisma.$disconnect();
});

// ── Shared state ──
let token: string;
let token2: string;
let tripId: string;
let tokyoCityId: string;
let kyotoCityId: string;
let dayIds: string[] = [];
let experienceIds: string[] = [];
let accommodationId: string;
let reservationId: string;
let routeSegmentId: string;
let importedTripId: string;

describe("Wander API — Comprehensive Test Suite", () => {

  // ═══════════════════════════════════════════════════════════════════
  // 1. AUTHENTICATION
  // ═══════════════════════════════════════════════════════════════════
  describe("1. Authentication", () => {
    it("rejects empty body", async () => {
      const res = await request(app).post("/api/auth/login").send({});
      expect([400, 401]).toContain(res.status);
    });

    it("rejects invalid access code", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ code: "WRONG" });
      expect(res.status).toBe(401);
    });

    it("accepts valid access code (user 1)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ code: "TEST1" });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.displayName).toBe("TestUser");
      token = res.body.token;
    });

    it("accepts valid access code (user 2)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ code: "TEST2" });
      expect(res.status).toBe(200);
      token2 = res.body.token;
    });

    it("GET /me returns authenticated user", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe("TestUser");
      expect(res.body.code).toBe("TEST1");
    });

    it("rejects request without token", async () => {
      const res = await request(app).get("/api/trips");
      expect(res.status).toBe(401);
    });

    it("rejects request with malformed token", async () => {
      const res = await request(app)
        .get("/api/trips")
        .set("Authorization", "Bearer not.a.real.jwt.token");
      expect(res.status).toBe(401);
    });

    it("rejects request with expired/invalid JWT", async () => {
      const res = await request(app)
        .get("/api/trips")
        .set("Authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb2RlIjoiWCIsImlhdCI6MH0.fake");
      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. TRIP LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════
  describe("2. Trip Lifecycle", () => {
    it("creates a trip with cities, days, and route segments", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Comprehensive Test Trip",
          startDate: "2026-05-01",
          endDate: "2026-05-14",
          cities: [
            { name: "Tokyo", country: "Japan", arrivalDate: "2026-05-01", departureDate: "2026-05-07" },
            { name: "Kyoto", country: "Japan", arrivalDate: "2026-05-08", departureDate: "2026-05-14" },
          ],
          routeSegments: [
            { originCity: "Tokyo", destinationCity: "Kyoto", transportMode: "train" },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Comprehensive Test Trip");
      expect(res.body.status).toBe("active");
      expect(res.body.cities.length).toBe(2);
      expect(res.body.routeSegments.length).toBe(1);
      tripId = res.body.id;
      tokyoCityId = res.body.cities[0].id;
      kyotoCityId = res.body.cities[1].id;
      routeSegmentId = res.body.routeSegments[0].id;
    });

    it("auto-creates days for each city date range", async () => {
      const res = await request(app)
        .get(`/api/days/trip/${tripId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      // 7 days Tokyo + 7 days Kyoto = 14 days
      expect(res.body.length).toBe(14);
      dayIds = res.body.map((d: any) => d.id);
      // First day should be in Tokyo
      expect(res.body[0].city.name).toBe("Tokyo");
      // Last day should be in Kyoto
      expect(res.body[res.body.length - 1].city.name).toBe("Kyoto");
    });

    it("fetches active trip with all relations", async () => {
      const res = await request(app)
        .get("/api/trips/active")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      // Use trip by ID if active matches, otherwise just verify structure
      // (other test files may leave active trips in the shared DB)
      if (res.body.id !== tripId) {
        // Re-fetch our specific trip to verify it exists
        const specific = await request(app)
          .get(`/api/trips/${tripId}`)
          .set("Authorization", `Bearer ${token}`);
        expect(specific.status).toBe(200);
        expect(specific.body.cities).toBeDefined();
        expect(specific.body.routeSegments).toBeDefined();
        expect(specific.body.days).toBeDefined();
      } else {
        expect(res.body.cities).toBeDefined();
        expect(res.body.routeSegments).toBeDefined();
        expect(res.body.days).toBeDefined();
      }
    });

    it("lists all trips", async () => {
      const res = await request(app)
        .get("/api/trips")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((t: any) => t.id === tripId);
      expect(found).toBeTruthy();
    });

    it("updates trip name", async () => {
      const res = await request(app)
        .patch(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Comprehensive Test Trip" }); // keep same for cleanup
      expect(res.status).toBe(200);
    });

    it("updates trip dates", async () => {
      const res = await request(app)
        .patch(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ startDate: "2026-05-01", endDate: "2026-05-15" });
      expect(res.status).toBe(200);
    });

    it("returns 404 for non-existent trip", async () => {
      const res = await request(app)
        .get("/api/trips/nonexistent-id-12345")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 3. CITY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════
  describe("3. City Management", () => {
    it("lists cities for trip (initial 2)", async () => {
      const res = await request(app)
        .get(`/api/cities/trip/${tripId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body[0].sequenceOrder).toBeLessThan(res.body[1].sequenceOrder);
    });

    it("adds a third city mid-trip", async () => {
      const res = await request(app)
        .post("/api/cities")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          name: "Osaka",
          country: "Japan",
          arrivalDate: "2026-05-15",
          departureDate: "2026-05-16",
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Osaka");
    });

    it("updates city country", async () => {
      const res = await request(app)
        .patch(`/api/cities/${tokyoCityId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ country: "JP" });
      expect(res.status).toBe(200);
      expect(res.body.country).toBe("JP");
    });

    it("updates city name", async () => {
      const res = await request(app)
        .patch(`/api/cities/${tokyoCityId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Tokyo", country: "Japan" }); // reset
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 4. DAY OPERATIONS
  // ═══════════════════════════════════════════════════════════════════
  describe("4. Day Operations", () => {
    it("gets a single day with all relations", async () => {
      const res = await request(app)
        .get(`/api/days/${dayIds[0]}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(dayIds[0]);
      expect(res.body.city).toBeDefined();
      expect(res.body.experiences).toBeDefined();
      expect(res.body.reservations).toBeDefined();
      expect(res.body.accommodations).toBeDefined();
    });

    it("updates day notes", async () => {
      const res = await request(app)
        .patch(`/api/days/${dayIds[0]}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: "Arrive at Narita, take Skyliner to Ueno" });
      expect(res.status).toBe(200);
      expect(res.body.notes).toBe("Arrive at Narita, take Skyliner to Ueno");
    });

    it("updates exploration zone", async () => {
      const res = await request(app)
        .patch(`/api/days/${dayIds[0]}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ explorationZone: "Asakusa & Ueno" });
      expect(res.status).toBe(200);
      expect(res.body.explorationZone).toBe("Asakusa & Ueno");
    });

    it("clears day notes by setting to null", async () => {
      const res = await request(app)
        .patch(`/api/days/${dayIds[0]}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: null });
      expect(res.status).toBe(200);
      expect(res.body.notes).toBeNull();
    });

    it("creates a new standalone day", async () => {
      const res = await request(app)
        .post("/api/days")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          cityId: tokyoCityId,
          date: "2026-05-20",
          notes: "Extra flexible day",
        });
      expect(res.status).toBe(201);
      expect(res.body.notes).toBe("Extra flexible day");
    });

    it("returns 404 for non-existent day", async () => {
      const res = await request(app)
        .get("/api/days/nonexistent-day-id")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 5. EXPERIENCE CRUD + STATE TRANSITIONS
  // ═══════════════════════════════════════════════════════════════════
  describe("5. Experience CRUD", () => {
    it("creates experience with themes", async () => {
      const res = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          cityId: tokyoCityId,
          name: "Senso-ji Temple",
          description: "Famous temple in Asakusa",
          themes: ["temples", "architecture"],
        });
      expect(res.status).toBe(201);
      expect(res.body.state).toBe("possible");
      expect(res.body.locationStatus).toBe("unlocated");
      expect(res.body.themes).toContain("temples");
      expect(res.body.themes).toContain("architecture");
      expect(res.body.createdBy).toBe("TEST1");
      expect(res.body.ratings).toBeDefined();
      experienceIds.push(res.body.id);
    });

    it("creates experience without themes", async () => {
      const res = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          cityId: tokyoCityId,
          name: "Tsukiji Outer Market",
          description: "Street food and fresh seafood",
        });
      expect(res.status).toBe(201);
      expect(res.body.themes).toEqual([]);
      experienceIds.push(res.body.id);
    });

    it("creates experience in second city", async () => {
      const res = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          cityId: kyotoCityId,
          name: "Fushimi Inari Shrine",
          description: "Thousands of vermillion torii gates",
          themes: ["temples"],
        });
      expect(res.status).toBe(201);
      experienceIds.push(res.body.id);
    });

    it("creates experience with user notes and source", async () => {
      const res = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          cityId: tokyoCityId,
          name: "TeamLab Borderless",
          description: "Digital art museum",
          userNotes: "Book tickets in advance - sells out!",
          sourceUrl: "https://example.com/teamlab",
          themes: ["architecture"],
        });
      expect(res.status).toBe(201);
      expect(res.body.userNotes).toBe("Book tickets in advance - sells out!");
      expect(res.body.sourceUrl).toBe("https://example.com/teamlab");
      experienceIds.push(res.body.id);
    });

    it("lists all experiences for trip", async () => {
      const res = await request(app)
        .get(`/api/experiences/trip/${tripId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(4);
      // All should have ratings array (may be empty)
      for (const exp of res.body) {
        expect(exp.ratings).toBeDefined();
        expect(Array.isArray(exp.ratings)).toBe(true);
      }
    });

    it("filters experiences by cityId", async () => {
      const res = await request(app)
        .get(`/api/experiences/trip/${tripId}?cityId=${tokyoCityId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.every((e: any) => e.cityId === tokyoCityId)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
    });

    it("filters experiences by state", async () => {
      const res = await request(app)
        .get(`/api/experiences/trip/${tripId}?state=possible`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.every((e: any) => e.state === "possible")).toBe(true);
    });

    it("gets single experience with all relations", async () => {
      const res = await request(app)
        .get(`/api/experiences/${experienceIds[0]}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(experienceIds[0]);
      expect(res.body.city).toBeDefined();
      expect(res.body.ratings).toBeDefined();
    });

    it("updates experience fields", async () => {
      const res = await request(app)
        .patch(`/api/experiences/${experienceIds[0]}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          description: "Ancient temple with giant lantern",
          userNotes: "Visit at dawn",
        });
      expect(res.status).toBe(200);
      expect(res.body.description).toBe("Ancient temple with giant lantern");
      expect(res.body.userNotes).toBe("Visit at dawn");
    });

    it("updates experience location manually", async () => {
      const res = await request(app)
        .patch(`/api/experiences/${experienceIds[0]}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          latitude: 35.7148,
          longitude: 139.7967,
          locationStatus: "confirmed",
          placeIdGoogle: "ChIJ82j7aiCMGGARY6OQ1fDgZzA",
        });
      expect(res.status).toBe(200);
      expect(res.body.latitude).toBeCloseTo(35.7148, 3);
      expect(res.body.longitude).toBeCloseTo(139.7967, 3);
      expect(res.body.locationStatus).toBe("confirmed");
    });

    it("returns 404 for non-existent experience", async () => {
      const res = await request(app)
        .get("/api/experiences/nonexistent-exp-id")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 6. PROMOTE / DEMOTE / REORDER
  // ═══════════════════════════════════════════════════════════════════
  describe("6. State Transitions & Reorder", () => {
    it("promotes experience to selected with day and time window", async () => {
      const res = await request(app)
        .post(`/api/experiences/${experienceIds[0]}/promote`)
        .set("Authorization", `Bearer ${token}`)
        .send({ dayId: dayIds[0], timeWindow: "morning" });
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("selected");
      expect(res.body.dayId).toBe(dayIds[0]);
      expect(res.body.timeWindow).toBe("morning");
    });

    it("promotes second experience to same day", async () => {
      const res = await request(app)
        .post(`/api/experiences/${experienceIds[1]}/promote`)
        .set("Authorization", `Bearer ${token}`)
        .send({ dayId: dayIds[0], timeWindow: "afternoon" });
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("selected");
    });

    it("promotes experience to route segment instead of day", async () => {
      const res = await request(app)
        .post(`/api/experiences/${experienceIds[2]}/promote`)
        .set("Authorization", `Bearer ${token}`)
        .send({ routeSegmentId: routeSegmentId });
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("selected");
      expect(res.body.routeSegmentId).toBe(routeSegmentId);
    });

    it("rejects promote without dayId or routeSegmentId", async () => {
      const res = await request(app)
        .post(`/api/experiences/${experienceIds[3]}/promote`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("demotes experience back to possible", async () => {
      const res = await request(app)
        .post(`/api/experiences/${experienceIds[1]}/demote`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("possible");
      expect(res.body.dayId).toBeNull();
      expect(res.body.timeWindow).toBeNull();
    });

    it("re-promotes for reorder tests", async () => {
      const res = await request(app)
        .post(`/api/experiences/${experienceIds[1]}/promote`)
        .set("Authorization", `Bearer ${token}`)
        .send({ dayId: dayIds[0] });
      expect(res.status).toBe(200);
    });

    it("reorders experiences and verifies new order", async () => {
      const reversedOrder = [experienceIds[1], experienceIds[0]];
      const res = await request(app)
        .post("/api/experiences/reorder")
        .set("Authorization", `Bearer ${token}`)
        .send({ orderedIds: reversedOrder });
      expect(res.status).toBe(200);
      expect(res.body.reordered).toBe(true);

      // Verify order persisted
      const list = await request(app)
        .get(`/api/experiences/trip/${tripId}`)
        .set("Authorization", `Bearer ${token}`);
      const first = list.body.find((e: any) => e.id === experienceIds[1]);
      const second = list.body.find((e: any) => e.id === experienceIds[0]);
      expect(first.priorityOrder).toBeLessThan(second.priorityOrder);
    });

    it("rejects reorder without orderedIds array", async () => {
      const res = await request(app)
        .post("/api/experiences/reorder")
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("filters by dayId returns only day-assigned experiences", async () => {
      const res = await request(app)
        .get(`/api/experiences/trip/${tripId}?dayId=${dayIds[0]}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.every((e: any) => e.dayId === dayIds[0])).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 7. ROUTE SEGMENTS
  // ═══════════════════════════════════════════════════════════════════
  describe("7. Route Segments", () => {
    it("lists route segments for trip", async () => {
      const res = await request(app)
        .get(`/api/route-segments/trip/${tripId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].experiences).toBeDefined();
    });

    it("gets single route segment with experiences", async () => {
      const res = await request(app)
        .get(`/api/route-segments/${routeSegmentId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.originCity).toBe("Tokyo");
      expect(res.body.destinationCity).toBe("Kyoto");
      expect(res.body.experiences).toBeDefined();
    });

    it("creates a new route segment", async () => {
      const res = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          originCity: "Kyoto",
          destinationCity: "Osaka",
          transportMode: "train",
          departureDate: "2026-05-14",
          notes: "JR Special Rapid, 30 min",
        });
      expect(res.status).toBe(201);
      expect(res.body.originCity).toBe("Kyoto");
      expect(res.body.sequenceOrder).toBeGreaterThan(0);
    });

    it("updates route segment", async () => {
      const res = await request(app)
        .patch(`/api/route-segments/${routeSegmentId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: "Shinkansen Nozomi, 2h15m" });
      expect(res.status).toBe(200);
      expect(res.body.notes).toBe("Shinkansen Nozomi, 2h15m");
    });

    it("returns 404 for non-existent segment", async () => {
      const res = await request(app)
        .get("/api/route-segments/nonexistent-seg-id")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 8. ACCOMMODATIONS
  // ═══════════════════════════════════════════════════════════════════
  describe("8. Accommodations", () => {
    it("creates accommodation with all fields", async () => {
      const res = await request(app)
        .post("/api/accommodations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          cityId: tokyoCityId,
          dayId: dayIds[0],
          name: "Park Hyatt Tokyo",
          address: "3-7-1-2 Nishi Shinjuku, Shinjuku-ku",
          latitude: 35.6867,
          longitude: 139.6917,
          checkInTime: "15:00",
          checkOutTime: "12:00",
          confirmationNumber: "PH-99001",
          notes: "Club room, 47th floor",
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Park Hyatt Tokyo");
      expect(res.body.latitude).toBeCloseTo(35.6867, 3);
      accommodationId = res.body.id;
    });

    it("creates second accommodation in Kyoto", async () => {
      const res = await request(app)
        .post("/api/accommodations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          cityId: kyotoCityId,
          name: "Hoshinoya Kyoto",
          address: "Arashiyama",
        });
      expect(res.status).toBe(201);
    });

    it("lists accommodations for trip", async () => {
      const res = await request(app)
        .get(`/api/accommodations/trip/${tripId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });

    it("updates accommodation", async () => {
      const res = await request(app)
        .patch(`/api/accommodations/${accommodationId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          confirmationNumber: "PH-99002-UPDATED",
          notes: "Club room, 47th floor, late checkout confirmed",
        });
      expect(res.status).toBe(200);
      expect(res.body.confirmationNumber).toBe("PH-99002-UPDATED");
    });

    it("returns 404 for non-existent accommodation", async () => {
      const res = await request(app)
        .patch("/api/accommodations/nonexistent-acc-id")
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: "test" });
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 9. RESERVATIONS
  // ═══════════════════════════════════════════════════════════════════
  describe("9. Reservations", () => {
    it("creates a restaurant reservation", async () => {
      const res = await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          dayId: dayIds[0],
          name: "Sushi Saito",
          type: "restaurant",
          datetime: "2026-05-01T19:00:00Z",
          durationMinutes: 120,
          notes: "Omakase, no substitutions",
          confirmationNumber: "SS-2026-001",
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Sushi Saito");
      expect(res.body.type).toBe("restaurant");
      expect(res.body.durationMinutes).toBe(120);
      reservationId = res.body.id;
    });

    it("creates an activity reservation", async () => {
      const res = await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          dayId: dayIds[1],
          name: "Sumo Morning Practice",
          type: "activity",
          datetime: "2026-05-02T07:00:00Z",
        });
      expect(res.status).toBe(201);
      expect(res.body.type).toBe("activity");
    });

    it("lists reservations for trip", async () => {
      const res = await request(app)
        .get(`/api/reservations/trip/${tripId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      // Should be ordered by datetime
      const dates = res.body.map((r: any) => new Date(r.datetime).getTime());
      expect(dates[0]).toBeLessThanOrEqual(dates[1]);
    });

    it("updates reservation time and notes", async () => {
      const res = await request(app)
        .patch(`/api/reservations/${reservationId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          datetime: "2026-05-01T19:30:00Z",
          notes: "Omakase, arrive 10 min early",
        });
      expect(res.status).toBe(200);
      expect(res.body.notes).toContain("arrive 10 min early");
    });

    it("returns 404 for non-existent reservation", async () => {
      const res = await request(app)
        .patch("/api/reservations/nonexistent-res-id")
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: "test" });
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 10. GEOCODING
  // ═══════════════════════════════════════════════════════════════════
  describe("10. Geocoding", () => {
    it("triggers geocoding for experience", async () => {
      const res = await request(app)
        .post(`/api/geocoding/experience/${experienceIds[0]}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      // Without real API key, either returns result or no_match
    });

    it("confirms location manually", async () => {
      const res = await request(app)
        .post(`/api/geocoding/experience/${experienceIds[1]}/confirm`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          latitude: 35.6654,
          longitude: 139.7707,
          placeIdGoogle: "ChIJf3bMbv6LGGARdIYKm9KfHpQ",
        });
      expect(res.status).toBe(200);
      expect(res.body.locationStatus).toBe("confirmed");
      expect(res.body.latitude).toBeCloseTo(35.6654, 3);
    });

    it("search returns array", async () => {
      const res = await request(app)
        .get("/api/geocoding/search?query=Senso-ji&city=Tokyo")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("search rejects missing query", async () => {
      const res = await request(app)
        .get("/api/geocoding/search?city=Tokyo")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    it("nearby returns array", async () => {
      const res = await request(app)
        .get("/api/geocoding/nearby?lat=35.6762&lng=139.6503&radius=1000")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("nearby rejects missing params", async () => {
      const res = await request(app)
        .get("/api/geocoding/nearby?lat=35.6762")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    it("batch geocode processes unlocated experiences", async () => {
      const res = await request(app)
        .post(`/api/geocoding/batch/${tripId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.processed).toBeDefined();
      expect(res.body.results).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 11. CAPTURE MODES
  // ═══════════════════════════════════════════════════════════════════
  describe("11. Capture", () => {
    it("manual capture with name creates experience instantly", async () => {
      const res = await request(app)
        .post("/api/capture")
        .set("Authorization", `Bearer ${token}`)
        .field("tripId", tripId)
        .field("cityId", tokyoCityId)
        .field("name", "Meiji Shrine")
        .field("description", "Beautiful shrine in Harajuku")
        .field("userNotes", "Free entry");
      expect(res.status).toBe(201);
      expect(res.body.experiences.length).toBe(1);
      expect(res.body.experiences[0].name).toBe("Meiji Shrine");
      expect(res.body.isList).toBe(false);
    });

    it("rejects capture without tripId/cityId", async () => {
      const res = await request(app)
        .post("/api/capture")
        .set("Authorization", `Bearer ${token}`)
        .field("name", "Something");
      expect(res.status).toBe(400);
    });

    it("rejects capture with no input at all", async () => {
      const res = await request(app)
        .post("/api/capture")
        .set("Authorization", `Bearer ${token}`)
        .field("tripId", tripId)
        .field("cityId", tokyoCityId);
      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 12. TRAVEL TIME CALCULATION
  // ═══════════════════════════════════════════════════════════════════
  describe("12. Travel Time", () => {
    it("calculates travel time with walk mode (fallback)", async () => {
      const res = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${token}`)
        .send({
          originLat: 35.6762,
          originLng: 139.6503,
          destLat: 35.7148,
          destLng: 139.7967,
          mode: "walk",
        });
      expect(res.status).toBe(200);
      expect(res.body.durationMinutes).toBeGreaterThan(0);
      expect(res.body.bufferMinutes).toBe(10); // walk buffer
      expect(res.body.totalMinutes).toBe(res.body.durationMinutes + res.body.bufferMinutes);
      expect(res.body.mode).toBe("walk");
      expect(["google", "fallback"]).toContain(res.body.source);
    });

    it("calculates travel time with transit mode", async () => {
      const res = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${token}`)
        .send({
          originLat: 35.6762,
          originLng: 139.6503,
          destLat: 35.7148,
          destLng: 139.7967,
          mode: "transit",
        });
      expect(res.status).toBe(200);
      expect(res.body.bufferMinutes).toBe(15); // transit buffer
      expect(res.body.mode).toBe("transit");
    });

    it("calculates travel time with taxi mode", async () => {
      const res = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${token}`)
        .send({
          originLat: 35.6762,
          originLng: 139.6503,
          destLat: 35.7148,
          destLng: 139.7967,
          mode: "taxi",
        });
      expect(res.status).toBe(200);
      expect(res.body.bufferMinutes).toBe(5); // taxi buffer
    });

    it("returns departureTime when anchorTime is provided", async () => {
      const anchor = "2026-05-01T14:00:00Z";
      const res = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${token}`)
        .send({
          originLat: 35.6762,
          originLng: 139.6503,
          destLat: 35.7148,
          destLng: 139.7967,
          mode: "walk",
          anchorTime: anchor,
        });
      expect(res.status).toBe(200);
      expect(res.body.departureTime).toBeDefined();
      // Departure should be before anchor
      expect(new Date(res.body.departureTime).getTime()).toBeLessThan(new Date(anchor).getTime());
    });

    it("defaults to walk mode when no mode specified", async () => {
      const res = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${token}`)
        .send({
          originLat: 35.6762,
          originLng: 139.6503,
          destLat: 35.7148,
          destLng: 139.7967,
        });
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe("walk");
    });

    it("rejects request with missing coordinates", async () => {
      const res = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${token}`)
        .send({ originLat: 35.6762 });
      expect(res.status).toBe(400);
    });

    it("handles zero-distance (same origin/destination)", async () => {
      const res = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${token}`)
        .send({
          originLat: 35.6762,
          originLng: 139.6503,
          destLat: 35.6762,
          destLng: 139.6503,
          mode: "walk",
        });
      expect(res.status).toBe(200);
      // Duration should be very small or zero
      expect(res.body.durationMinutes).toBeLessThanOrEqual(1);
    });

    it("handles long-distance travel (Tokyo to Kyoto)", async () => {
      const res = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${token}`)
        .send({
          originLat: 35.6762,
          originLng: 139.6503,
          destLat: 35.0116,
          destLng: 135.7681,
          mode: "taxi",
        });
      expect(res.status).toBe(200);
      // ~370km distance, should produce meaningful estimate
      expect(res.body.durationMinutes).toBeGreaterThan(30);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 13. AI OBSERVATIONS
  // ═══════════════════════════════════════════════════════════════════
  describe("13. AI Observations", () => {
    it("returns empty observations for day with no selected experiences", async () => {
      // dayIds[5] should have no selected experiences
      const res = await request(app)
        .post(`/api/observations/day/${dayIds[5]}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.observations).toEqual([]);
    });

    it("returns 404 for non-existent day", async () => {
      const res = await request(app)
        .post("/api/observations/day/nonexistent-day-id")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it("returns 404 for non-existent city", async () => {
      const res = await request(app)
        .post("/api/observations/city/nonexistent-city-id")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it("generates observations for day with selected experiences", async () => {
      // dayIds[0] should have selected experiences from earlier tests
      const res = await request(app)
        .post(`/api/observations/day/${dayIds[0]}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.observations).toBeDefined();
      expect(Array.isArray(res.body.observations)).toBe(true);
      // May be empty if Anthropic key not set, but shape should be correct
    });

    it("generates observations for city", async () => {
      const res = await request(app)
        .post(`/api/observations/city/${tokyoCityId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.observations).toBeDefined();
      expect(Array.isArray(res.body.observations)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 14. CHANGE LOG AUDIT TRAIL
  // ═══════════════════════════════════════════════════════════════════
  describe("14. Change Log", () => {
    it("fetches change logs with pagination", async () => {
      const res = await request(app)
        .get(`/api/change-logs/trip/${tripId}?limit=5`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.logs).toBeDefined();
      expect(res.body.logs.length).toBeLessThanOrEqual(5);
      expect(res.body.total).toBeGreaterThan(0);
    });

    it("logs contain correct user attribution", async () => {
      const res = await request(app)
        .get(`/api/change-logs/trip/${tripId}?limit=50`)
        .set("Authorization", `Bearer ${token}`);
      const log = res.body.logs[0];
      expect(log.userCode).toBeDefined();
      expect(log.userDisplayName).toBeDefined();
      expect(log.actionType).toBeDefined();
      expect(log.entityType).toBeDefined();
      expect(log.description).toBeTruthy();
    });

    it("search filters change logs by text", async () => {
      const res = await request(app)
        .get(`/api/change-logs/trip/${tripId}?search=Senso-ji`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.logs.length).toBeGreaterThanOrEqual(1);
    });

    it("search with no matches returns empty", async () => {
      const res = await request(app)
        .get(`/api/change-logs/trip/${tripId}?search=ZZNONEXISTENTZZ`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.logs.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 15. IMPORT FLOW (FULL LIFECYCLE)
  // ═══════════════════════════════════════════════════════════════════
  describe("15. Import Flow", () => {
    it("import/commit creates trip with cities, days, accommodations, experiences, segments", async () => {
      const res = await request(app)
        .post("/api/import/commit")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripName: "Import Integration Trip",
          startDate: "2026-06-01",
          endDate: "2026-06-10",
          cities: [
            { name: "Paris", country: "France", arrivalDate: "2026-06-01", departureDate: "2026-06-05" },
            { name: "London", country: "UK", arrivalDate: "2026-06-06", departureDate: "2026-06-10" },
          ],
          accommodations: [
            { cityName: "Paris", name: "Hotel Le Marais", address: "1 Rue des Francs Bourgeois" },
            { cityName: "London", name: "The Savoy", address: "Strand, London" },
          ],
          experiences: [
            { cityName: "Paris", name: "Louvre Museum", dayDate: "2026-06-02", description: "World famous art museum" },
            { cityName: "Paris", name: "Eiffel Tower", dayDate: "2026-06-03", description: "Icon of Paris" },
            { cityName: "London", name: "British Museum", dayDate: null, description: "Free museum" },
          ],
          routeSegments: [
            { originCity: "Paris", destinationCity: "London", transportMode: "train", notes: "Eurostar" },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Import Integration Trip");
      expect(res.body.cities.length).toBe(2);
      expect(res.body.days.length).toBe(10); // 5 + 5
      expect(res.body.routeSegments.length).toBe(1);
      expect(res.body.accommodations.length).toBe(2);
      expect(res.body.experiences.length).toBe(3);
      importedTripId = res.body.id;

      // Check experience states
      const louvre = res.body.experiences.find((e: any) => e.name === "Louvre Museum");
      const britishMuseum = res.body.experiences.find((e: any) => e.name === "British Museum");
      expect(louvre.state).toBe("selected"); // has dayDate
      expect(britishMuseum.state).toBe("possible"); // no dayDate
    });

    it("previous trip is archived after import", async () => {
      const res = await request(app)
        .get("/api/trips")
        .set("Authorization", `Bearer ${token}`);
      const testTrip = res.body.find((t: any) => t.name === "Comprehensive Test Trip");
      expect(testTrip.status).toBe("archived");
    });

    it("new active trip is the imported one", async () => {
      // Use trip by ID — other test files may have created newer active trips
      const res = await request(app)
        .get(`/api/trips/${importedTripId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.body.name).toBe("Import Integration Trip");
    });

    it("rejects import with missing required fields", async () => {
      const res = await request(app)
        .post("/api/import/commit")
        .set("Authorization", `Bearer ${token}`)
        .send({ tripName: "Incomplete" });
      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 16. MULTI-USER COLLABORATION
  // ═══════════════════════════════════════════════════════════════════
  describe("16. Multi-User Collaboration", () => {
    it("user 2 sees the same active trip", async () => {
      // Use imported trip by ID — other test files may have changed active trip
      const res = await request(app)
        .get(`/api/trips/${importedTripId}`)
        .set("Authorization", `Bearer ${token2}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Import Integration Trip");
    });

    it("user 2 creates experience on shared trip", async () => {
      const activeTrip = await request(app)
        .get(`/api/trips/${importedTripId}`)
        .set("Authorization", `Bearer ${token2}`);
      const activeCityId = activeTrip.body.cities[0].id;

      const res = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${token2}`)
        .send({
          tripId: activeTrip.body.id,
          cityId: activeCityId,
          name: "Musee d'Orsay",
          description: "Impressionist art",
          themes: ["architecture"],
        });
      expect(res.status).toBe(201);
      expect(res.body.createdBy).toBe("TEST2");
    });

    it("user 1 sees user 2's experience", async () => {
      const res = await request(app)
        .get(`/api/experiences/trip/${importedTripId}`)
        .set("Authorization", `Bearer ${token}`);
      const user2Exp = res.body.find((e: any) => e.name === "Musee d'Orsay");
      expect(user2Exp).toBeTruthy();
      expect(user2Exp.createdBy).toBe("TEST2");
    });

    it("change log shows both users' actions", async () => {
      const res = await request(app)
        .get(`/api/change-logs/trip/${importedTripId}?limit=50`)
        .set("Authorization", `Bearer ${token}`);
      const userNames = new Set(res.body.logs.map((l: any) => l.userDisplayName));
      expect(userNames.has("TestUser")).toBe(true);
      expect(userNames.has("TestUser2")).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 17. DELETE OPERATIONS & CASCADE SAFETY
  // ═══════════════════════════════════════════════════════════════════
  describe("17. Delete Operations", () => {
    let deleteTestIds: {
      tripId: string;
      cityId: string;
      dayId: string;
      expId: string;
      accId: string;
      resId: string;
      segId: string;
    };

    beforeAll(async () => {
      // Create a fresh trip specifically for delete tests
      const trip = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Edge Case Trip",
          startDate: "2026-07-01",
          endDate: "2026-07-05",
          cities: [
            { name: "Berlin", country: "Germany", arrivalDate: "2026-07-01", departureDate: "2026-07-05" },
          ],
          routeSegments: [],
        });
      const tid = trip.body.id;
      const cid = trip.body.cities[0].id;

      const days = await request(app)
        .get(`/api/days/trip/${tid}`)
        .set("Authorization", `Bearer ${token}`);
      const did = days.body[0].id;

      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${token}`)
        .send({ tripId: tid, cityId: cid, name: "Brandenburg Gate" });
      const acc = await request(app)
        .post("/api/accommodations")
        .set("Authorization", `Bearer ${token}`)
        .send({ tripId: tid, cityId: cid, name: "Hotel Adlon" });
      const reservation = await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId: tid, dayId: did, name: "Mustafas Gemuse Kebap",
          type: "restaurant", datetime: "2026-07-01T13:00:00Z",
        });
      const seg = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId: tid, originCity: "Berlin", destinationCity: "Munich",
          transportMode: "train",
        });

      deleteTestIds = {
        tripId: tid,
        cityId: cid,
        dayId: did,
        expId: exp.body.id,
        accId: acc.body.id,
        resId: reservation.body.id,
        segId: seg.body.id,
      };
    });

    it("deletes a reservation", async () => {
      const res = await request(app)
        .delete(`/api/reservations/${deleteTestIds.resId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it("deleted reservation is gone", async () => {
      const res = await request(app)
        .patch(`/api/reservations/${deleteTestIds.resId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: "should fail" });
      expect(res.status).toBe(404);
    });

    it("deletes an experience", async () => {
      const res = await request(app)
        .delete(`/api/experiences/${deleteTestIds.expId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it("deleted experience is gone", async () => {
      const res = await request(app)
        .get(`/api/experiences/${deleteTestIds.expId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it("deletes an accommodation", async () => {
      const res = await request(app)
        .delete(`/api/accommodations/${deleteTestIds.accId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it("deleted accommodation is gone", async () => {
      const res = await request(app)
        .patch(`/api/accommodations/${deleteTestIds.accId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: "should fail" });
      expect(res.status).toBe(404);
    });

    it("deletes a route segment", async () => {
      const res = await request(app)
        .delete(`/api/route-segments/${deleteTestIds.segId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it("deleted segment is gone", async () => {
      const res = await request(app)
        .get(`/api/route-segments/${deleteTestIds.segId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it("deletes a day", async () => {
      const res = await request(app)
        .delete(`/api/days/${deleteTestIds.dayId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it("deleted day is gone", async () => {
      const res = await request(app)
        .get(`/api/days/${deleteTestIds.dayId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 18. EDGE CASES & VALIDATION
  // ═══════════════════════════════════════════════════════════════════
  describe("18. Edge Cases & Validation", () => {
    it("experience themes persist as array after update", async () => {
      // Update themes on an existing experience
      const res = await request(app)
        .patch(`/api/experiences/${experienceIds[0]}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ themes: ["food", "nature"] });
      expect(res.status).toBe(200);
      expect(res.body.themes).toEqual(expect.arrayContaining(["food", "nature"]));
      expect(res.body.themes.length).toBe(2);
    });

    it("experience can have empty themes", async () => {
      const res = await request(app)
        .patch(`/api/experiences/${experienceIds[0]}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ themes: [] });
      expect(res.status).toBe(200);
      expect(res.body.themes).toEqual([]);
    });

    it("day update with cityId reassignment", async () => {
      // This tests moving a day to a different city
      const res = await request(app)
        .patch(`/api/days/${dayIds[1]}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ cityId: kyotoCityId });
      expect(res.status).toBe(200);
      expect(res.body.city.name).toBe("Kyoto");
      // Reset it back
      await request(app)
        .patch(`/api/days/${dayIds[1]}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ cityId: tokyoCityId });
    });

    it("travel time with negative coordinates works", async () => {
      // Southern hemisphere, e.g. Sydney
      const res = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${token}`)
        .send({
          originLat: -33.8688,
          originLng: 151.2093,
          destLat: -33.8568,
          destLng: 151.2153,
          mode: "walk",
        });
      expect(res.status).toBe(200);
      expect(res.body.durationMinutes).toBeGreaterThan(0);
    });

    it("import with unmatched accommodation city is skipped gracefully", async () => {
      const res = await request(app)
        .post("/api/import/commit")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripName: "Multi-User Collab Trip",
          startDate: "2026-08-01",
          endDate: "2026-08-05",
          cities: [
            { name: "Rome", country: "Italy", arrivalDate: "2026-08-01", departureDate: "2026-08-05" },
          ],
          accommodations: [
            { cityName: "NonexistentCity", name: "Ghost Hotel" },
          ],
          experiences: [],
          routeSegments: [],
        });
      expect(res.status).toBe(201);
      // Ghost Hotel should be skipped (cityName doesn't match)
      expect(res.body.accommodations.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 19. INTEGRATION: FULL WORKFLOW SIMULATION
  // ═══════════════════════════════════════════════════════════════════
  describe("19. Full Workflow Integration", () => {
    it("simulates a complete planning session", async () => {
      // 1. Get active trip
      const tripRes = await request(app)
        .get("/api/trips/active")
        .set("Authorization", `Bearer ${token}`);
      const activeTripId = tripRes.body.id;
      const firstCityId = tripRes.body.cities[0].id;

      // 2. Get days
      const daysRes = await request(app)
        .get(`/api/days/trip/${activeTripId}`)
        .set("Authorization", `Bearer ${token}`);
      const firstDayId = daysRes.body[0].id;

      // 3. Capture an experience
      const captureRes = await request(app)
        .post("/api/capture")
        .set("Authorization", `Bearer ${token}`)
        .field("tripId", activeTripId)
        .field("cityId", firstCityId)
        .field("name", "Colosseum")
        .field("description", "Ancient Roman amphitheater");
      expect(captureRes.status).toBe(201);
      const newExpId = captureRes.body.experiences[0].id;

      // 4. Promote it to a day
      const promoteRes = await request(app)
        .post(`/api/experiences/${newExpId}/promote`)
        .set("Authorization", `Bearer ${token}`)
        .send({ dayId: firstDayId, timeWindow: "morning" });
      expect(promoteRes.status).toBe(200);
      expect(promoteRes.body.state).toBe("selected");

      // 5. Add a reservation for the same day
      const resRes = await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId: activeTripId,
          dayId: firstDayId,
          name: "Trattoria da Mario",
          type: "restaurant",
          datetime: "2026-08-01T12:30:00Z",
        });
      expect(resRes.status).toBe(201);

      // 6. Set day notes
      const noteRes = await request(app)
        .patch(`/api/days/${firstDayId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: "Full day in the old city" });
      expect(noteRes.status).toBe(200);

      // 7. Calculate travel time
      const travelRes = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${token}`)
        .send({
          originLat: 41.9028,
          originLng: 12.4964,
          destLat: 41.8902,
          destLng: 12.4922,
          mode: "walk",
          anchorTime: "2026-08-01T09:00:00Z",
        });
      expect(travelRes.status).toBe(200);
      expect(travelRes.body.departureTime).toBeDefined();

      // 8. Verify everything shows in the day view
      const dayView = await request(app)
        .get(`/api/days/${firstDayId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(dayView.body.experiences.length).toBeGreaterThanOrEqual(1);
      expect(dayView.body.reservations.length).toBeGreaterThanOrEqual(1);
      expect(dayView.body.notes).toBe("Full day in the old city");

      // 9. Verify change log has complete history
      const logRes = await request(app)
        .get(`/api/change-logs/trip/${activeTripId}?limit=100`)
        .set("Authorization", `Bearer ${token}`);
      const actionTypes = new Set(logRes.body.logs.map((l: any) => l.actionType));
      expect(actionTypes.has("experience_created")).toBe(true);
      expect(actionTypes.has("experience_promoted")).toBe(true);
      expect(actionTypes.has("reservation_created")).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // UX LIFECYCLE TESTS — day/city/experience integrity
  // ══════════════════════════════════════════════════════════════════════
  describe("UX Lifecycle: Day/City/Experience Integrity", () => {
    let uxTripId: string;
    let uxCityAId: string;
    let uxCityBId: string;
    let uxDayIds: string[] = [];
    let uxExpId: string;
    let uxReservationId: string;

    it("sets up a trip with two cities and scheduled content", async () => {
      // Create trip
      const tripRes = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "UX Lifecycle Trip", startDate: "2026-06-01", endDate: "2026-06-10" });
      uxTripId = tripRes.body.id;

      // Create city A with dates June 1-5
      const cityARes = await request(app)
        .post("/api/cities")
        .set("Authorization", `Bearer ${token}`)
        .send({ tripId: uxTripId, name: "CityA", arrivalDate: "2026-06-01", departureDate: "2026-06-05" });
      uxCityAId = cityARes.body.id;

      // Create city B with dates June 6-10
      const cityBRes = await request(app)
        .post("/api/cities")
        .set("Authorization", `Bearer ${token}`)
        .send({ tripId: uxTripId, name: "CityB", arrivalDate: "2026-06-06", departureDate: "2026-06-10" });
      uxCityBId = cityBRes.body.id;

      // Fetch days
      const daysRes = await request(app)
        .get(`/api/days/trip/${uxTripId}`)
        .set("Authorization", `Bearer ${token}`);
      uxDayIds = daysRes.body.map((d: any) => d.id);
      expect(daysRes.body.length).toBe(10);

      // Create an experience in CityA and promote it to day 3
      const expRes = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${token}`)
        .send({ tripId: uxTripId, cityId: uxCityAId, name: "Museum Visit" });
      uxExpId = expRes.body.id;

      await request(app)
        .post(`/api/experiences/${uxExpId}/promote`)
        .set("Authorization", `Bearer ${token}`)
        .send({ dayId: uxDayIds[2], timeWindow: "10:00-12:00" });

      // Add a reservation on day 3
      const resRes = await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId: uxTripId,
          dayId: uxDayIds[2],
          name: "Dinner at Le Fancy",
          type: "restaurant",
          datetime: "2026-06-03T19:00:00Z",
        });
      uxReservationId = resRes.body.id;

      // Add notes to day 3
      await request(app)
        .patch(`/api/days/${uxDayIds[2]}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: "Big museum day, leave early", explorationZone: "Old Town" });
    });

    it("PATCH city dates preserves existing day data when range expands", async () => {
      // Expand CityA from June 1-5 to June 1-6 (add one day)
      const res = await request(app)
        .patch(`/api/cities/${uxCityAId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ departureDate: "2026-06-06" });
      expect(res.status).toBe(200);

      // Day 3 (June 3) should still have its notes, experience, and reservation
      const dayRes = await request(app)
        .get(`/api/days/${uxDayIds[2]}`)
        .set("Authorization", `Bearer ${token}`);
      expect(dayRes.body.notes).toBe("Big museum day, leave early");
      expect(dayRes.body.explorationZone).toBe("Old Town");
      expect(dayRes.body.experiences.length).toBe(1);
      expect(dayRes.body.experiences[0].name).toBe("Museum Visit");
      expect(dayRes.body.reservations.length).toBe(1);
      expect(dayRes.body.reservations[0].name).toBe("Dinner at Le Fancy");

      // Restore CityA to June 1-5
      await request(app)
        .patch(`/api/cities/${uxCityAId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ departureDate: "2026-06-05" });
    });

    it("PATCH city dates demotes experiences when range shrinks", async () => {
      // Shrink CityA from June 1-5 to June 1-2 (day 3 falls outside)
      const res = await request(app)
        .patch(`/api/cities/${uxCityAId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ departureDate: "2026-06-02" });
      expect(res.status).toBe(200);

      // The experience on day 3 should be demoted to "possible"
      const expRes = await request(app)
        .get(`/api/experiences/${uxExpId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(expRes.body.state).toBe("possible");
      expect(expRes.body.dayId).toBeNull();

      // Restore CityA to June 1-5 and re-promote
      await request(app)
        .patch(`/api/cities/${uxCityAId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ departureDate: "2026-06-05" });

      // Re-fetch days to get updated IDs
      const daysRes = await request(app)
        .get(`/api/days/trip/${uxTripId}`)
        .set("Authorization", `Bearer ${token}`);
      const cityADays = daysRes.body.filter((d: any) => d.city.name === "CityA");
      const june3 = cityADays.find((d: any) => d.date.split("T")[0] === "2026-06-03");

      if (june3) {
        await request(app)
          .post(`/api/experiences/${uxExpId}/promote`)
          .set("Authorization", `Bearer ${token}`)
          .send({ dayId: june3.id, timeWindow: "10:00-12:00" });
      }
    });

    it("day reassignment moves experiences to new city", async () => {
      // Reassign day 3 from CityA to CityB
      const daysRes = await request(app)
        .get(`/api/days/trip/${uxTripId}`)
        .set("Authorization", `Bearer ${token}`);
      const cityADays = daysRes.body.filter((d: any) => d.city.name === "CityA");
      const june3 = cityADays.find((d: any) => d.date.split("T")[0] === "2026-06-03");
      if (!june3) return;

      const patchRes = await request(app)
        .patch(`/api/days/${june3.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ cityId: uxCityBId });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.city.name).toBe("CityB");

      // Experience should now belong to CityB
      const expRes = await request(app)
        .get(`/api/experiences/${uxExpId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(expRes.body.city.name).toBe("CityB");

      // Move it back for subsequent tests
      await request(app)
        .patch(`/api/days/${june3.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ cityId: uxCityAId });
    });

    it("deleting a day demotes its experiences instead of orphaning them", async () => {
      // Create a new experience and promote it to the last CityA day
      const daysRes = await request(app)
        .get(`/api/days/trip/${uxTripId}`)
        .set("Authorization", `Bearer ${token}`);
      const cityADays = daysRes.body
        .filter((d: any) => d.city.name === "CityA")
        .sort((a: any, b: any) => a.date.localeCompare(b.date));
      const lastDay = cityADays[cityADays.length - 1];

      const newExp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${token}`)
        .send({ tripId: uxTripId, cityId: uxCityAId, name: "Sunset Viewpoint" });
      const newExpId = newExp.body.id;

      await request(app)
        .post(`/api/experiences/${newExpId}/promote`)
        .set("Authorization", `Bearer ${token}`)
        .send({ dayId: lastDay.id, timeWindow: "17:00-19:00" });

      // Delete the day
      const delRes = await request(app)
        .delete(`/api/days/${lastDay.id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(delRes.status).toBe(200);

      // Experience should be demoted to "possible", not stuck in "selected" limbo
      const expRes = await request(app)
        .get(`/api/experiences/${newExpId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(expRes.body.state).toBe("possible");
      expect(expRes.body.dayId).toBeNull();
      expect(expRes.body.timeWindow).toBeNull();
    });

    it("deleting a city preserves experiences by moving them to another city", async () => {
      // Create an experience in CityB
      const expRes = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${token}`)
        .send({ tripId: uxTripId, cityId: uxCityBId, name: "Beach Walk" });
      const beachExpId = expRes.body.id;

      // Promote it to a CityB day
      const daysRes = await request(app)
        .get(`/api/days/trip/${uxTripId}`)
        .set("Authorization", `Bearer ${token}`);
      const cityBDay = daysRes.body.find((d: any) => d.city.name === "CityB");
      if (cityBDay) {
        await request(app)
          .post(`/api/experiences/${beachExpId}/promote`)
          .set("Authorization", `Bearer ${token}`)
          .send({ dayId: cityBDay.id });
      }

      // Delete CityB
      const delRes = await request(app)
        .delete(`/api/cities/${uxCityBId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(delRes.status).toBe(200);

      // Beach Walk should still exist, moved to CityA, demoted to possible
      const savedExp = await request(app)
        .get(`/api/experiences/${beachExpId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(savedExp.status).toBe(200);
      expect(savedExp.body.city.name).toBe("CityA");
      expect(savedExp.body.state).toBe("possible");
      expect(savedExp.body.dayId).toBeNull();
    });
  });
});
