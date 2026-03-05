import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

// Set test env vars before importing app
process.env.ACCESS_CODES = "TEST1:TestUser,TEST2:TestUser2";
process.env.JWT_SECRET = "test-secret";

// Dynamic import after env setup
const { app } = await import("../src/index.js");

let token: string;
let tripId: string;
let cityId: string;
let dayId: string;
let experienceId: string;
let accommodationId: string;
let reservationId: string;

describe("Wander API", () => {

  // ─── Auth ───
  describe("Auth", () => {
    it("rejects invalid access code", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ code: "INVALID" });
      expect(res.status).toBe(401);
    });

    it("accepts valid access code and returns token", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ code: "TEST1" });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.displayName).toBe("TestUser");
      token = res.body.token;
    });

    it("GET /me returns current user", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe("TestUser");
    });

    it("rejects requests without token", async () => {
      const res = await request(app).get("/api/trips");
      expect(res.status).toBe(401);
    });
  });

  // ─── Trips ───
  describe("Trips", () => {
    it("creates a trip", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Test Japan Trip",
          startDate: "2026-05-01",
          endDate: "2026-05-22",
          cities: [
            { name: "Tokyo", country: "Japan", arrivalDate: "2026-05-01", departureDate: "2026-05-05" },
            { name: "Kyoto", country: "Japan", arrivalDate: "2026-05-06", departureDate: "2026-05-10" },
          ],
          routeSegments: [
            { originCity: "Tokyo", destinationCity: "Kyoto", transportMode: "train" },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Test Japan Trip");
      expect(res.body.cities.length).toBe(2);
      expect(res.body.routeSegments.length).toBe(1);
      tripId = res.body.id;
      cityId = res.body.cities[0].id;
    });

    it("fetches active trip", async () => {
      const res = await request(app)
        .get("/api/trips/active")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(tripId);
    });

    it("lists all trips", async () => {
      const res = await request(app)
        .get("/api/trips")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it("updates trip name and dates", async () => {
      const res = await request(app)
        .patch(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Japan 2026 Updated" });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Japan 2026 Updated");
    });
  });

  // ─── Cities ───
  describe("Cities", () => {
    it("lists cities for trip", async () => {
      const res = await request(app)
        .get(`/api/cities/trip/${tripId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });

    it("adds a new city", async () => {
      const res = await request(app)
        .post("/api/cities")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          name: "Osaka",
          country: "Japan",
          arrivalDate: "2026-05-11",
          departureDate: "2026-05-14",
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Osaka");
    });

    it("updates a city", async () => {
      const res = await request(app)
        .patch(`/api/cities/${cityId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ country: "JP" });
      expect(res.status).toBe(200);
      expect(res.body.country).toBe("JP");
    });
  });

  // ─── Days ───
  describe("Days", () => {
    it("lists days for trip", async () => {
      const res = await request(app)
        .get(`/api/days/trip/${tripId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      dayId = res.body[0].id;
    });

    it("updates day notes", async () => {
      const res = await request(app)
        .patch(`/api/days/${dayId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: "Arrive early, check into hotel" });
      expect(res.status).toBe(200);
      expect(res.body.notes).toBe("Arrive early, check into hotel");
    });

    it("updates exploration zone", async () => {
      const res = await request(app)
        .patch(`/api/days/${dayId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ explorationZone: "Shibuya" });
      expect(res.status).toBe(200);
      expect(res.body.explorationZone).toBe("Shibuya");
    });
  });

  // ─── Experiences ───
  describe("Experiences", () => {
    it("creates an experience (capture)", async () => {
      const res = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          cityId,
          name: "Senso-ji Temple",
          description: "Famous temple in Asakusa",
          themes: ["temples"],
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Senso-ji Temple");
      expect(res.body.state).toBe("possible");
      experienceId = res.body.id;
    });

    it("lists experiences for trip", async () => {
      const res = await request(app)
        .get(`/api/experiences/trip/${tripId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it("filters experiences by city", async () => {
      const res = await request(app)
        .get(`/api/experiences/trip/${tripId}?cityId=${cityId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.every((e: any) => e.cityId === cityId)).toBe(true);
    });

    it("gets single experience with details", async () => {
      const res = await request(app)
        .get(`/api/experiences/${experienceId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(experienceId);
      expect(res.body.ratings).toBeDefined();
    });

    it("updates experience", async () => {
      const res = await request(app)
        .patch(`/api/experiences/${experienceId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ userNotes: "Must visit early morning" });
      expect(res.status).toBe(200);
      expect(res.body.userNotes).toBe("Must visit early morning");
    });

    it("promotes experience to selected", async () => {
      const res = await request(app)
        .post(`/api/experiences/${experienceId}/promote`)
        .set("Authorization", `Bearer ${token}`)
        .send({ dayId, timeWindow: "morning" });
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("selected");
      expect(res.body.dayId).toBe(dayId);
    });

    it("demotes experience to possible", async () => {
      const res = await request(app)
        .post(`/api/experiences/${experienceId}/demote`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("possible");
      expect(res.body.dayId).toBeNull();
    });

    it("re-promotes for further tests", async () => {
      const res = await request(app)
        .post(`/api/experiences/${experienceId}/promote`)
        .set("Authorization", `Bearer ${token}`)
        .send({ dayId });
      expect(res.status).toBe(200);
    });

    it("reorders experiences", async () => {
      // Create a second experience
      const create = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          cityId,
          name: "Tsukiji Market",
          description: "Fish market",
        });
      const secondId = create.body.id;

      const res = await request(app)
        .post("/api/experiences/reorder")
        .set("Authorization", `Bearer ${token}`)
        .send({ orderedIds: [secondId, experienceId] });
      expect(res.status).toBe(200);
    });
  });

  // ─── Accommodations ───
  describe("Accommodations", () => {
    it("creates an accommodation", async () => {
      const res = await request(app)
        .post("/api/accommodations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          cityId,
          dayId,
          name: "Park Hyatt Tokyo",
          address: "3-7-1-2 Nishi Shinjuku",
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Park Hyatt Tokyo");
      accommodationId = res.body.id;
    });

    it("lists accommodations for trip", async () => {
      const res = await request(app)
        .get(`/api/accommodations/trip/${tripId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it("updates accommodation", async () => {
      const res = await request(app)
        .patch(`/api/accommodations/${accommodationId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ confirmationNumber: "PH-12345" });
      expect(res.status).toBe(200);
      expect(res.body.confirmationNumber).toBe("PH-12345");
    });
  });

  // ─── Reservations ───
  describe("Reservations", () => {
    it("creates a reservation", async () => {
      const res = await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          dayId,
          name: "Sushi Saito",
          type: "restaurant",
          datetime: "2026-05-01T19:00:00Z",
          notes: "8 course omakase",
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Sushi Saito");
      reservationId = res.body.id;
    });

    it("lists reservations for trip", async () => {
      const res = await request(app)
        .get(`/api/reservations/trip/${tripId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it("updates a reservation", async () => {
      const res = await request(app)
        .patch(`/api/reservations/${reservationId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: "8 course omakase, arrive 10 min early" });
      expect(res.status).toBe(200);
      expect(res.body.notes).toContain("arrive 10 min early");
    });
  });

  // ─── Change Logs ───
  describe("Change Logs", () => {
    it("fetches change logs for trip", async () => {
      const res = await request(app)
        .get(`/api/change-logs/trip/${tripId}?limit=50`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.logs).toBeDefined();
      expect(res.body.logs.length).toBeGreaterThan(0);
      expect(res.body.total).toBeGreaterThan(0);
    });

    it("supports search in change logs", async () => {
      const res = await request(app)
        .get(`/api/change-logs/trip/${tripId}?search=Senso-ji`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      // Should find at least the experience creation log
      expect(res.body.logs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Capture (manual mode) ───
  describe("Capture", () => {
    it("captures experience via manual mode", async () => {
      const res = await request(app)
        .post("/api/capture")
        .set("Authorization", `Bearer ${token}`)
        .field("tripId", tripId)
        .field("cityId", cityId)
        .field("name", "Meiji Shrine")
        .field("description", "Beautiful shrine in Harajuku");
      expect(res.status).toBe(201);
      expect(res.body.experiences.length).toBe(1);
      expect(res.body.experiences[0].name).toBe("Meiji Shrine");
    });
  });

  // ─── Geocoding ───
  describe("Geocoding", () => {
    it("triggers geocoding (returns no_match without valid API key)", async () => {
      const res = await request(app)
        .post(`/api/geocoding/experience/${experienceId}`)
        .set("Authorization", `Bearer ${token}`);
      // Without GOOGLE_MAPS_API_KEY, returns no_match
      expect(res.status).toBe(200);
    });

    it("search endpoint works", async () => {
      const res = await request(app)
        .get("/api/geocoding/search?query=Senso-ji&city=Tokyo")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("nearby endpoint works", async () => {
      const res = await request(app)
        .get("/api/geocoding/nearby?lat=35.6762&lng=139.6503")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Import flow ───
  describe("Import", () => {
    it("commit creates a trip from extraction data", async () => {
      const res = await request(app)
        .post("/api/import/commit")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripName: "Import Test Trip",
          startDate: "2026-06-01",
          endDate: "2026-06-10",
          cities: [
            { name: "Paris", country: "France", arrivalDate: "2026-06-01", departureDate: "2026-06-05" },
            { name: "London", country: "UK", arrivalDate: "2026-06-06", departureDate: "2026-06-10" },
          ],
          accommodations: [
            { cityName: "Paris", name: "Hotel Le Marais" },
          ],
          experiences: [
            { cityName: "Paris", name: "Louvre Museum", dayDate: "2026-06-02", description: "World famous art museum" },
            { cityName: "London", name: "British Museum", dayDate: null, description: "Free museum" },
          ],
          routeSegments: [
            { originCity: "Paris", destinationCity: "London", transportMode: "train" },
          ],
          notes: "Test import",
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Import Test Trip");
      expect(res.body.cities.length).toBe(2);
      // Previous trip should be archived
    });

    it("previous trip is archived after import creates new active trip", async () => {
      const res = await request(app)
        .get("/api/trips")
        .set("Authorization", `Bearer ${token}`);
      const archived = res.body.filter((t: any) => t.status === "archived");
      expect(archived.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Cleanup tests ───
  describe("Delete operations", () => {
    it("deletes a reservation", async () => {
      // Re-fetch active trip since import created a new one
      const activeRes = await request(app)
        .get("/api/trips/active")
        .set("Authorization", `Bearer ${token}`);
      const activeTripId = activeRes.body.id;
      const activeCityId = activeRes.body.cities[0].id;

      // Get days for the new active trip
      const daysRes = await request(app)
        .get(`/api/days/trip/${activeTripId}`)
        .set("Authorization", `Bearer ${token}`);
      const activeDayId = daysRes.body[0].id;

      // Create a reservation to delete
      const createRes = await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId: activeTripId,
          dayId: activeDayId,
          name: "To Delete",
          type: "restaurant",
          datetime: "2026-06-02T12:00:00Z",
        });
      const delId = createRes.body.id;

      const res = await request(app)
        .delete(`/api/reservations/${delId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it("deletes an experience", async () => {
      const activeRes = await request(app)
        .get("/api/trips/active")
        .set("Authorization", `Bearer ${token}`);
      const activeTripId = activeRes.body.id;
      const activeCityId = activeRes.body.cities[0].id;

      const createRes = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId: activeTripId,
          cityId: activeCityId,
          name: "To Delete Exp",
        });
      const delId = createRes.body.id;

      const res = await request(app)
        .delete(`/api/experiences/${delId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });
  });

  // ─── Multi-user ───
  describe("Multi-user", () => {
    it("second user can authenticate and modify same trip", async () => {
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ code: "TEST2" });
      expect(loginRes.status).toBe(200);
      const token2 = loginRes.body.token;

      // Get active trip
      const tripRes = await request(app)
        .get("/api/trips/active")
        .set("Authorization", `Bearer ${token2}`);
      expect(tripRes.status).toBe(200);

      const activeTripId = tripRes.body.id;
      const activeCityId = tripRes.body.cities[0].id;

      // Create experience as second user
      const res = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${token2}`)
        .send({
          tripId: activeTripId,
          cityId: activeCityId,
          name: "User2 Experience",
        });
      expect(res.status).toBe(201);
      expect(res.body.createdBy).toBe("TEST2");

      // Verify change log shows second user's name
      const logRes = await request(app)
        .get(`/api/change-logs/trip/${activeTripId}?search=User2`)
        .set("Authorization", `Bearer ${token2}`);
      expect(logRes.body.logs.length).toBeGreaterThanOrEqual(1);
      expect(logRes.body.logs[0].userDisplayName).toBe("TestUser2");
    });
  });
});
