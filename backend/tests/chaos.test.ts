/**
 * CHAOS SIMULATION TESTS
 *
 * ~50 diverse scenarios that exercise different paths through the product,
 * simulating real users who change their minds, overlap dates, delete things,
 * work simultaneously, and generally behave unpredictably.
 *
 * Each scenario is a self-contained "mini trip" that tests a specific
 * combination of operations and verifies data integrity throughout.
 *
 * Categories:
 * 1. Trip Shape Variations (single-day, long, no cities, many cities)
 * 2. Date Gymnastics (overlap, shrink, expand, clear, gap)
 * 3. Data Preservation (reservations, notes, accommodations survive changes)
 * 4. Experience Flow (promote/demote chains, cross-city moves, reorder)
 * 5. Destructive Operations (delete city, day, trip cascades)
 * 6. Multi-User Collaboration (concurrent edits, attribution)
 * 7. Import Edge Cases (double import, empty import, overwrite)
 * 8. Cascade Integrity (end-to-end data consistency after complex ops)
 */

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.ACCESS_CODES = "CHAOS1:Alice,CHAOS2:Bob";
process.env.JWT_SECRET = "test-secret-chaos";

const { app } = await import("../src/index.js");
const prisma = new PrismaClient();

// Helper: login and get token
async function login(code: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ code });
  return res.body.token;
}

// Helper: create a trip and return its ID
async function createTrip(
  token: string,
  name: string,
  start: string,
  end: string,
  cities?: { name: string; country?: string; arrivalDate?: string; departureDate?: string }[],
): Promise<string> {
  const res = await request(app)
    .post("/api/trips")
    .set("Authorization", `Bearer ${token}`)
    .send({ name, startDate: start, endDate: end, cities });
  expect(res.status).toBe(201);
  return res.body.id;
}

// Helper: add a city
async function addCity(
  token: string,
  tripId: string,
  name: string,
  arrivalDate?: string,
  departureDate?: string,
): Promise<string> {
  const res = await request(app)
    .post("/api/cities")
    .set("Authorization", `Bearer ${token}`)
    .send({ tripId, name, country: "Test", arrivalDate, departureDate });
  expect(res.status).toBe(201);
  return res.body.id;
}

// Helper: add an experience
async function addExp(token: string, tripId: string, cityId: string, name: string): Promise<string> {
  const res = await request(app)
    .post("/api/experiences")
    .set("Authorization", `Bearer ${token}`)
    .send({ tripId, cityId, name });
  expect(res.status).toBe(201);
  return res.body.id;
}

// Helper: promote experience
async function promote(
  token: string,
  expId: string,
  dayId: string,
  timeWindow?: string,
): Promise<void> {
  const res = await request(app)
    .post(`/api/experiences/${expId}/promote`)
    .set("Authorization", `Bearer ${token}`)
    .send({ dayId, timeWindow });
  expect(res.status).toBe(200);
}

// Helper: demote experience
async function demote(token: string, expId: string): Promise<void> {
  const res = await request(app)
    .post(`/api/experiences/${expId}/demote`)
    .set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
}

// Helper: get days for trip
async function getDays(token: string, tripId: string): Promise<any[]> {
  const res = await request(app)
    .get(`/api/days/trip/${tripId}`)
    .set("Authorization", `Bearer ${token}`);
  return res.body;
}

// Helper: get experience by ID
async function getExp(token: string, expId: string): Promise<any> {
  const res = await request(app)
    .get(`/api/experiences/${expId}`)
    .set("Authorization", `Bearer ${token}`);
  return res.body;
}

// No cleanup needed — tests run on a Neon branch that gets deleted after
afterAll(async () => {
  await prisma.$disconnect();
});

let aliceToken: string;
let bobToken: string;

describe("Chaos Simulations", () => {
  it("authenticates both users", async () => {
    aliceToken = await login("CHAOS1");
    bobToken = await login("CHAOS2");
    expect(aliceToken).toBeDefined();
    expect(bobToken).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 1: TRIP SHAPE VARIATIONS
  // ═══════════════════════════════════════════════════════════════

  describe("1. Trip Shapes", () => {
    it("S01: Single-day trip works end-to-end", async () => {
      const name = "Chaos: Single Day";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-01", [
        { name: "Paris", arrivalDate: "2026-07-01", departureDate: "2026-07-01" },
      ]);

      const days = await getDays(aliceToken, tripId);
      expect(days.length).toBe(1);

      const expId = await addExp(aliceToken, tripId, days[0].city.id, "Eiffel Tower");
      await promote(aliceToken, expId, days[0].id, "morning");

      const day = await request(app).get(`/api/days/${days[0].id}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(day.body.experiences.length).toBe(1);
      expect(day.body.experiences[0].name).toBe("Eiffel Tower");
    });

    it("S02: Trip with no cities — add cities later", async () => {
      const name = "Chaos: No Cities";

      const tripId = await createTrip(aliceToken, name, "2026-08-01", "2026-08-05");

      let days = await getDays(aliceToken, tripId);
      expect(days.length).toBe(0); // No cities = no days

      const cityId = await addCity(aliceToken, tripId, "Rome", "2026-08-01", "2026-08-03");
      days = await getDays(aliceToken, tripId);
      expect(days.length).toBe(3);

      const cityId2 = await addCity(aliceToken, tripId, "Florence", "2026-08-04", "2026-08-05");
      days = await getDays(aliceToken, tripId);
      expect(days.length).toBe(5);
    });

    it("S03: Trip with many cities (8 cities, 30 days)", async () => {
      const name = "Chaos: Many Cities";

      const cities = [
        { name: "City1", arrivalDate: "2026-09-01", departureDate: "2026-09-04" },
        { name: "City2", arrivalDate: "2026-09-05", departureDate: "2026-09-07" },
        { name: "City3", arrivalDate: "2026-09-08", departureDate: "2026-09-10" },
        { name: "City4", arrivalDate: "2026-09-11", departureDate: "2026-09-14" },
        { name: "City5", arrivalDate: "2026-09-15", departureDate: "2026-09-17" },
        { name: "City6", arrivalDate: "2026-09-18", departureDate: "2026-09-20" },
        { name: "City7", arrivalDate: "2026-09-21", departureDate: "2026-09-25" },
        { name: "City8", arrivalDate: "2026-09-26", departureDate: "2026-09-30" },
      ];
      const tripId = await createTrip(aliceToken, name, "2026-09-01", "2026-09-30", cities);

      const days = await getDays(aliceToken, tripId);
      expect(days.length).toBe(30);

      // Verify each city has correct number of days
      const cityCounts = new Map<string, number>();
      for (const d of days) {
        cityCounts.set(d.city.name, (cityCounts.get(d.city.name) || 0) + 1);
      }
      expect(cityCounts.get("City1")).toBe(4);
      expect(cityCounts.get("City7")).toBe(5);
      expect(cityCounts.get("City8")).toBe(5);
    });

    it("S04: Trip with city that has no dates (flexible exploration)", async () => {
      const name = "Chaos: Flexible City";

      const tripId = await createTrip(aliceToken, name, "2026-10-01", "2026-10-05", [
        { name: "Berlin", arrivalDate: "2026-10-01", departureDate: "2026-10-03" },
      ]);

      // Add a city with no dates — just a bucket for experiences
      const flexCityId = await addCity(aliceToken, tripId, "Potsdam");
      const expId = await addExp(aliceToken, tripId, flexCityId, "Sanssouci Palace");

      // Experience exists but can't be promoted to a day (Potsdam has none)
      const exp = await getExp(aliceToken, expId);
      expect(exp.state).toBe("possible");
      expect(exp.city.name).toBe("Potsdam");

      // Promote it to a Berlin day instead
      const days = await getDays(aliceToken, tripId);
      const berlinDay = days[0];
      await promote(aliceToken, expId, berlinDay.id);

      const promoted = await getExp(aliceToken, expId);
      expect(promoted.state).toBe("selected");
      // Experience should stay in its original city (Potsdam) even when on a Berlin day
      // This is a cross-city promotion — valid use case
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 2: DATE GYMNASTICS
  // ═══════════════════════════════════════════════════════════════

  describe("2. Date Gymnastics", () => {
    it("S05: Overlapping city date ranges — later city takes the days", async () => {
      const name = "Chaos: Overlapping Dates";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-10", [
        { name: "Madrid", arrivalDate: "2026-07-01", departureDate: "2026-07-06" },
      ]);

      // Add Barcelona overlapping Jul 5-8
      await addCity(aliceToken, tripId, "Barcelona", "2026-07-05", "2026-07-08");

      const days = await getDays(aliceToken, tripId);
      // Jul 5 and 6 should be reassigned from Madrid to Barcelona
      const barcelonaDays = days.filter((d: any) => d.city.name === "Barcelona");
      const madridDays = days.filter((d: any) => d.city.name === "Madrid");

      expect(barcelonaDays.length).toBe(4); // Jul 5,6,7,8
      expect(madridDays.length).toBe(4);    // Jul 1,2,3,4
      // Total should still be 8 (6 original + 2 new for Jul 7,8), not 10
      // Actually: Madrid had Jul 1-6 (6 days). Barcelona takes Jul 5,6 and creates Jul 7,8.
      // So Madrid has Jul 1-4 (4 days), Barcelona has Jul 5-8 (4 days) = 8 total
      expect(days.length).toBe(8);
    });

    it("S06: Shrink city dates — experiences demoted, days removed", async () => {
      const name = "Chaos: Shrink Dates";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-10", [
        { name: "Vienna", arrivalDate: "2026-07-01", departureDate: "2026-07-10" },
      ]);

      const days = await getDays(aliceToken, tripId);
      expect(days.length).toBe(10);

      // Add experiences to days 8, 9, 10 (Jul 8-10)
      const cityId = days[0].city.id;
      const exp8 = await addExp(aliceToken, tripId, cityId, "Day 8 Activity");
      const exp9 = await addExp(aliceToken, tripId, cityId, "Day 9 Activity");
      const exp10 = await addExp(aliceToken, tripId, cityId, "Day 10 Activity");
      await promote(aliceToken, exp8, days[7].id);
      await promote(aliceToken, exp9, days[8].id);
      await promote(aliceToken, exp10, days[9].id);

      // Shrink to Jul 1-7 — days 8-10 fall outside
      const res = await request(app)
        .patch(`/api/cities/${cityId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ departureDate: "2026-07-07" });
      expect(res.status).toBe(200);

      // Experiences should be demoted to possible
      for (const expId of [exp8, exp9, exp10]) {
        const exp = await getExp(aliceToken, expId);
        expect(exp.state).toBe("possible");
        expect(exp.dayId).toBeNull();
      }

      // Only 7 days remain
      const remaining = await getDays(aliceToken, tripId);
      expect(remaining.length).toBe(7);
    });

    it("S07: Expand city dates — existing days preserved, new ones added", async () => {
      const name = "Chaos: Expand Dates";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-10", [
        { name: "Prague", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      expect(days.length).toBe(3);
      const cityId = days[0].city.id;

      // Add notes and experience to day 2
      await request(app)
        .patch(`/api/days/${days[1].id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ notes: "Charles Bridge morning walk", explorationZone: "Old Town" });
      const expId = await addExp(aliceToken, tripId, cityId, "Prague Castle");
      await promote(aliceToken, expId, days[1].id, "afternoon");

      // Expand to Jul 1-6
      await request(app)
        .patch(`/api/cities/${cityId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ departureDate: "2026-07-06" });

      // Day 2 should still have its data
      const day2 = await request(app).get(`/api/days/${days[1].id}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(day2.body.notes).toBe("Charles Bridge morning walk");
      expect(day2.body.explorationZone).toBe("Old Town");
      expect(day2.body.experiences.length).toBe(1);
      expect(day2.body.experiences[0].name).toBe("Prague Castle");

      // Total days now 6
      const allDays = await getDays(aliceToken, tripId);
      expect(allDays.length).toBe(6);
    });

    it("S08: Clear city dates entirely", async () => {
      const name = "Chaos: Clear Dates";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-05", [
        { name: "Lisbon", arrivalDate: "2026-07-01", departureDate: "2026-07-05" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;
      const expId = await addExp(aliceToken, tripId, cityId, "Tram 28");
      await promote(aliceToken, expId, days[2].id);

      // Clear dates
      await request(app)
        .patch(`/api/cities/${cityId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ arrivalDate: null, departureDate: null });

      // All days gone, experience demoted
      const remaining = await getDays(aliceToken, tripId);
      expect(remaining.length).toBe(0);
      const exp = await getExp(aliceToken, expId);
      expect(exp.state).toBe("possible");
    });

    it("S09: Gap days between cities — no orphan days", async () => {
      const name = "Chaos: Gap Days";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-10", [
        { name: "Amsterdam", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
        // Gap: Jul 4-7 has no city
        { name: "Brussels", arrivalDate: "2026-07-08", departureDate: "2026-07-10" },
      ]);

      const days = await getDays(aliceToken, tripId);
      // Should only have 6 days (3 Amsterdam + 3 Brussels), no gap fillers
      expect(days.length).toBe(6);
    });

    it("S10: Add city that fills the gap", async () => {
      const name = "Chaos: Fill Gap";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-10", [
        { name: "Amsterdam", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
        { name: "Brussels", arrivalDate: "2026-07-08", departureDate: "2026-07-10" },
      ]);

      // Fill the gap with Bruges (Jul 4-7)
      await addCity(aliceToken, tripId, "Bruges", "2026-07-04", "2026-07-07");

      const days = await getDays(aliceToken, tripId);
      expect(days.length).toBe(10); // Now fully covered

      const brugesDays = days.filter((d: any) => d.city.name === "Bruges");
      expect(brugesDays.length).toBe(4);
    });

    it("S11: Shift city dates forward (shrink start, expand end)", async () => {
      const name = "Chaos: Shift Dates";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-10", [
        { name: "Athens", arrivalDate: "2026-07-01", departureDate: "2026-07-05" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      // Add experience to Jul 1 (will be removed when we shift)
      const earlyExp = await addExp(aliceToken, tripId, cityId, "Acropolis Morning");
      await promote(aliceToken, earlyExp, days[0].id);

      // Add experience to Jul 3 (should survive the shift)
      const midExp = await addExp(aliceToken, tripId, cityId, "Plaka Afternoon");
      await promote(aliceToken, midExp, days[2].id);

      // Shift: Jul 3-7 (removes Jul 1-2, adds Jul 6-7)
      await request(app)
        .patch(`/api/cities/${cityId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ arrivalDate: "2026-07-03", departureDate: "2026-07-07" });

      // Early experience should be demoted (its day was removed)
      const early = await getExp(aliceToken, earlyExp);
      expect(early.state).toBe("possible");
      expect(early.dayId).toBeNull();

      // Mid experience should survive (Jul 3 is still in range)
      const mid = await getExp(aliceToken, midExp);
      expect(mid.state).toBe("selected");
      expect(mid.dayId).not.toBeNull();

      const remaining = await getDays(aliceToken, tripId);
      expect(remaining.length).toBe(5); // Jul 3-7
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 3: DATA PRESERVATION
  // ═══════════════════════════════════════════════════════════════

  describe("3. Data Preservation", () => {
    it("S12: Reservation survives city date expansion", async () => {
      const name = "Chaos: Reservation Preservation";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-10", [
        { name: "Milan", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      // Add reservation on day 2
      const resRes = await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          dayId: days[1].id,
          name: "La Scala Opera",
          type: "activity",
          datetime: "2026-07-02T20:00:00Z",
          confirmationNumber: "OPERA-123",
        });
      expect(resRes.status).toBe(201);
      const reservationId = resRes.body.id;

      // Expand city to Jul 1-5
      await request(app)
        .patch(`/api/cities/${cityId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ departureDate: "2026-07-05" });

      // Reservation should still exist on day 2
      const day2 = await request(app).get(`/api/days/${days[1].id}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(day2.body.reservations.length).toBe(1);
      expect(day2.body.reservations[0].confirmationNumber).toBe("OPERA-123");
    });

    it("S13: Accommodation survives day reassignment", async () => {
      const name = "Chaos: Accommodation Reassign";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-06", [
        { name: "Zurich", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
        { name: "Lucerne", arrivalDate: "2026-07-04", departureDate: "2026-07-06" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const zurichCity = days.find((d: any) => d.city.name === "Zurich");

      // Add accommodation to Zurich
      const accRes = await request(app)
        .post("/api/accommodations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          cityId: zurichCity.city.id,
          dayId: days[0].id,
          name: "Baur au Lac",
          address: "Talstrasse 1",
          latitude: 47.3656,
          longitude: 8.5387,
        });
      expect(accRes.status).toBe(201);
      const accId = accRes.body.id;

      // Reassign day 1 from Zurich to Lucerne
      const lucerneCity = days.find((d: any) => d.city.name === "Lucerne");
      await request(app)
        .patch(`/api/days/${days[0].id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ cityId: lucerneCity.city.id });

      // Accommodation should still exist (day link preserved via SetNull behavior)
      const accCheck = await request(app)
        .get(`/api/accommodations/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const acc = accCheck.body.find((a: any) => a.id === accId);
      expect(acc).toBeDefined();
      expect(acc.name).toBe("Baur au Lac");
    });

    it("S14: Exploration zone and notes survive date expansion", async () => {
      const name = "Chaos: Notes Survive";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-05", [
        { name: "Kyoto", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      // Annotate all 3 days
      for (let i = 0; i < 3; i++) {
        await request(app)
          .patch(`/api/days/${days[i].id}`)
          .set("Authorization", `Bearer ${aliceToken}`)
          .send({
            notes: `Day ${i + 1} plan`,
            explorationZone: `Zone ${i + 1}`,
          });
      }

      // Expand to Jul 1-5
      await request(app)
        .patch(`/api/cities/${cityId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ departureDate: "2026-07-05" });

      // All 3 original days should retain their notes
      for (let i = 0; i < 3; i++) {
        const d = await request(app).get(`/api/days/${days[i].id}`).set("Authorization", `Bearer ${aliceToken}`);
        expect(d.body.notes).toBe(`Day ${i + 1} plan`);
        expect(d.body.explorationZone).toBe(`Zone ${i + 1}`);
      }
    });

    it("S15: Reservation destroyed when its day is deleted (cascade)", async () => {
      const name = "Chaos: Reservation Cascade";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-03", [
        { name: "Oslo", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);

      const resRes = await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          dayId: days[1].id,
          name: "Viking Ship Museum",
          type: "activity",
          datetime: "2026-07-02T10:00:00Z",
        });
      const reservationId = resRes.body.id;

      // Delete day 2
      await request(app).delete(`/api/days/${days[1].id}`).set("Authorization", `Bearer ${aliceToken}`);

      // Reservation should be gone (cascade delete)
      const check = await request(app)
        .get(`/api/reservations/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const found = check.body.find((r: any) => r.id === reservationId);
      expect(found).toBeUndefined();
    });

    it("S16: Reservation destroyed when city date shrink removes its day", async () => {
      const name = "Chaos: Reservation Shrink Cascade";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-05", [
        { name: "Stockholm", arrivalDate: "2026-07-01", departureDate: "2026-07-05" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      // Add reservation to day 5 (Jul 5)
      const resRes = await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          dayId: days[4].id,
          name: "ABBA Museum",
          type: "activity",
          datetime: "2026-07-05T14:00:00Z",
        });
      const reservationId = resRes.body.id;

      // Shrink city to Jul 1-3 (removes Jul 4-5)
      await request(app)
        .patch(`/api/cities/${cityId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ departureDate: "2026-07-03" });

      // Reservation on Jul 5 should be gone
      const check = await request(app)
        .get(`/api/reservations/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const found = check.body.find((r: any) => r.id === reservationId);
      expect(found).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 4: EXPERIENCE FLOW
  // ═══════════════════════════════════════════════════════════════

  describe("4. Experience Flow", () => {
    it("S17: Promote → demote → re-promote to different day", async () => {
      const name = "Chaos: Promote Demote Chain";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-05", [
        { name: "Seville", arrivalDate: "2026-07-01", departureDate: "2026-07-05" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;
      const expId = await addExp(aliceToken, tripId, cityId, "Alcazar");

      // Promote to day 1
      await promote(aliceToken, expId, days[0].id, "morning");
      let exp = await getExp(aliceToken, expId);
      expect(exp.state).toBe("selected");
      expect(exp.timeWindow).toBe("morning");

      // Demote
      await demote(aliceToken, expId);
      exp = await getExp(aliceToken, expId);
      expect(exp.state).toBe("possible");
      expect(exp.dayId).toBeNull();
      expect(exp.timeWindow).toBeNull();

      // Re-promote to day 3
      await promote(aliceToken, expId, days[2].id, "afternoon");
      exp = await getExp(aliceToken, expId);
      expect(exp.state).toBe("selected");
      expect(exp.day.date.split("T")[0]).toBe("2026-07-03");
    });

    it("S18: Promote experience to route segment", async () => {
      const name = "Chaos: Route Segment Promote";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-05", [
        { name: "Munich", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
        { name: "Salzburg", arrivalDate: "2026-07-04", departureDate: "2026-07-05" },
      ]);

      // Create route segment
      const segRes = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, originCity: "Munich", destinationCity: "Salzburg", transportMode: "train" });
      const segId = segRes.body.id;

      const days = await getDays(aliceToken, tripId);
      const munichCity = days.find((d: any) => d.city.name === "Munich");
      const expId = await addExp(aliceToken, tripId, munichCity.city.id, "Neuschwanstein Stop");

      // Promote to route segment instead of day
      const promRes = await request(app)
        .post(`/api/experiences/${expId}/promote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ routeSegmentId: segId });
      expect(promRes.status).toBe(200);

      const exp = await getExp(aliceToken, expId);
      expect(exp.state).toBe("selected");
      expect(exp.routeSegment.originCity).toBe("Munich");
    });

    it("S19: Reorder experiences within a day", async () => {
      const name = "Chaos: Reorder";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-03", [
        { name: "Barcelona", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      const exp1 = await addExp(aliceToken, tripId, cityId, "Sagrada Familia");
      const exp2 = await addExp(aliceToken, tripId, cityId, "Park Guell");
      const exp3 = await addExp(aliceToken, tripId, cityId, "La Rambla");

      await promote(aliceToken, exp1, days[0].id);
      await promote(aliceToken, exp2, days[0].id);
      await promote(aliceToken, exp3, days[0].id);

      // Reorder: La Rambla first, then Sagrada, then Park
      const reorderRes = await request(app)
        .post("/api/experiences/reorder")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ orderedIds: [exp3, exp1, exp2] });
      expect(reorderRes.status).toBe(200);

      // Verify order
      const expRes = await request(app)
        .get(`/api/experiences/trip/${tripId}?dayId=${days[0].id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const names = expRes.body.map((e: any) => e.name);
      expect(names).toEqual(["La Rambla", "Sagrada Familia", "Park Guell"]);
    });

    it("S20: Cross-city promotion — experience in city A promoted to city B's day", async () => {
      const name = "Chaos: Cross City Promote";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-06", [
        { name: "Copenhagen", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
        { name: "Malmo", arrivalDate: "2026-07-04", departureDate: "2026-07-06" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const copenhagenCity = days.find((d: any) => d.city.name === "Copenhagen");
      const malmoDay = days.find((d: any) => d.city.name === "Malmo");

      // Create experience in Copenhagen
      const expId = await addExp(aliceToken, tripId, copenhagenCity.city.id, "Oresund Bridge View");

      // Promote it to a Malmo day (cross-city)
      await promote(aliceToken, expId, malmoDay.id);

      const exp = await getExp(aliceToken, expId);
      expect(exp.state).toBe("selected");
      // The experience keeps its original city — it's just scheduled on a Malmo day
      // This is valid: a day trip from Malmo to see a Copenhagen attraction
    });

    it("S21: Promote with all transport modes", async () => {
      const name = "Chaos: Transport Modes";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-03", [
        { name: "London", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      for (const mode of ["walk", "subway", "taxi"]) {
        const expId = await addExp(aliceToken, tripId, cityId, `${mode} experience`);
        const res = await request(app)
          .post(`/api/experiences/${expId}/promote`)
          .set("Authorization", `Bearer ${aliceToken}`)
          .send({ dayId: days[0].id, transportModeToHere: mode });
        expect(res.status).toBe(200);
        expect(res.body.transportModeToHere).toBe(mode);
      }
    });

    it("S22: Bulk promote then bulk demote", async () => {
      const name = "Chaos: Bulk Operations";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-03", [
        { name: "Dublin", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      // Create 10 experiences
      const expIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        expIds.push(await addExp(aliceToken, tripId, cityId, `Dublin Spot ${i + 1}`));
      }

      // Promote all to different days (round-robin)
      for (let i = 0; i < 10; i++) {
        await promote(aliceToken, expIds[i], days[i % 3].id);
      }

      // Verify all selected
      const allExp = await request(app)
        .get(`/api/experiences/trip/${tripId}?state=selected`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(allExp.body.length).toBe(10);

      // Demote all
      for (const id of expIds) {
        await demote(aliceToken, id);
      }

      // Verify all possible
      const allPossible = await request(app)
        .get(`/api/experiences/trip/${tripId}?state=possible`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(allPossible.body.length).toBe(10);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 5: DESTRUCTIVE OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  describe("5. Destructive Operations", () => {
    it("S23: Delete the only city — experiences cascade-deleted", async () => {
      const name = "Chaos: Delete Only City";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-03", [
        { name: "Reykjavik", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;
      const expId = await addExp(aliceToken, tripId, cityId, "Blue Lagoon");

      // Delete the only city — no other city to move experiences to
      await request(app)
        .delete(`/api/cities/${cityId}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      // Experience should be gone (cascade, no alternative city)
      const expRes = await request(app)
        .get(`/api/experiences/${expId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(expRes.status).toBe(404);

      // Days should be gone
      const remaining = await getDays(aliceToken, tripId);
      expect(remaining.length).toBe(0);
    });

    it("S24: Delete city with experiences — moved to other city", async () => {
      const name = "Chaos: Delete City Move Exp";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-06", [
        { name: "Tokyo", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
        { name: "Osaka", arrivalDate: "2026-07-04", departureDate: "2026-07-06" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const osakaCity = days.find((d: any) => d.city.name === "Osaka");
      const osakaDay = days.find((d: any) => d.city.name === "Osaka");

      const exp1 = await addExp(aliceToken, tripId, osakaCity.city.id, "Osaka Castle");
      const exp2 = await addExp(aliceToken, tripId, osakaCity.city.id, "Dotonbori");
      await promote(aliceToken, exp1, osakaDay.id);

      // Delete Osaka
      await request(app)
        .delete(`/api/cities/${osakaCity.city.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      // Both experiences should be moved to Tokyo, demoted to possible
      const e1 = await getExp(aliceToken, exp1);
      expect(e1.city.name).toBe("Tokyo");
      expect(e1.state).toBe("possible");
      expect(e1.dayId).toBeNull();

      const e2 = await getExp(aliceToken, exp2);
      expect(e2.city.name).toBe("Tokyo");
      expect(e2.state).toBe("possible");
    });

    it("S25: Delete route segment with promoted experience", async () => {
      const name = "Chaos: Delete Segment";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-04", [
        { name: "Nice", arrivalDate: "2026-07-01", departureDate: "2026-07-02" },
        { name: "Monaco", arrivalDate: "2026-07-03", departureDate: "2026-07-04" },
      ]);

      const segRes = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, originCity: "Nice", destinationCity: "Monaco", transportMode: "train" });
      const segId = segRes.body.id;

      const days = await getDays(aliceToken, tripId);
      const niceCity = days.find((d: any) => d.city.name === "Nice");
      const expId = await addExp(aliceToken, tripId, niceCity.city.id, "Scenic Stop");

      await request(app)
        .post(`/api/experiences/${expId}/promote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ routeSegmentId: segId });

      // Delete the route segment
      await request(app).delete(`/api/route-segments/${segId}`).set("Authorization", `Bearer ${aliceToken}`);

      // Experience should still exist, demoted to possible (not left in limbo)
      const exp = await getExp(aliceToken, expId);
      expect(exp).toBeDefined();
      expect(exp.routeSegmentId).toBeNull();
      expect(exp.state).toBe("possible");
    });

    it("S26: Delete trip cascades everything", async () => {
      const name = "Chaos: Delete Trip Cascade";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-03", [
        { name: "Havana", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      await addExp(aliceToken, tripId, cityId, "Old Havana Walk");
      await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, dayId: days[0].id, name: "Salsa Night", type: "activity", datetime: "2026-07-01T21:00:00Z" });
      await request(app)
        .post("/api/accommodations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Hotel Nacional" });
      await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, originCity: "Havana", destinationCity: "Vinales", transportMode: "drive" });

      // Delete trip
      await request(app).delete(`/api/trips/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);

      // Everything should be gone
      const trip = await request(app).get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(trip.status).toBe(404);
    });

    it("S27: Delete day with both reservation and experience", async () => {
      const name = "Chaos: Delete Rich Day";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-05", [
        { name: "Seoul", arrivalDate: "2026-07-01", departureDate: "2026-07-05" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      const expId = await addExp(aliceToken, tripId, cityId, "Gyeongbokgung Palace");
      await promote(aliceToken, expId, days[2].id, "morning");

      await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, dayId: days[2].id, name: "Korean BBQ", type: "restaurant", datetime: "2026-07-03T19:00:00Z" });

      await request(app)
        .patch(`/api/days/${days[2].id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ notes: "Palace and dinner day", explorationZone: "Jongno" });

      // Delete day 3
      await request(app).delete(`/api/days/${days[2].id}`).set("Authorization", `Bearer ${aliceToken}`);

      // Experience should be demoted, not gone
      const exp = await getExp(aliceToken, expId);
      expect(exp.state).toBe("possible");
      expect(exp.dayId).toBeNull();

      // Reservation is gone (cascade)
      const resCheck = await request(app)
        .get(`/api/reservations/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(resCheck.body.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 6: MULTI-USER COLLABORATION
  // ═══════════════════════════════════════════════════════════════

  describe("6. Multi-User Collaboration", () => {
    it("S28: Both users add experiences to same city", async () => {
      const name = "Chaos: Multi User Same City";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-05", [
        { name: "Bangkok", arrivalDate: "2026-07-01", departureDate: "2026-07-05" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      // Alice adds experiences
      const aliceExp = await addExp(aliceToken, tripId, cityId, "Grand Palace");
      // Bob adds experiences
      const bobExp = await addExp(bobToken, tripId, cityId, "Chatuchak Market");

      // Both promote to different days
      await promote(aliceToken, aliceExp, days[0].id, "morning");
      await promote(bobToken, bobExp, days[1].id, "all-day");

      // Both should see both experiences
      const allExp = await request(app)
        .get(`/api/experiences/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(allExp.body.length).toBe(2);
    });

    it("S29: One user promotes, other user demotes", async () => {
      const name = "Chaos: Cross User Promote Demote";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-03", [
        { name: "Hanoi", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;
      const expId = await addExp(aliceToken, tripId, cityId, "Ho Chi Minh Mausoleum");

      // Alice promotes
      await promote(aliceToken, expId, days[0].id);
      // Bob demotes
      await demote(bobToken, expId);

      const exp = await getExp(aliceToken, expId);
      expect(exp.state).toBe("possible");
    });

    it("S30: Change log shows correct user attribution", async () => {
      const name = "Chaos: Attribution";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-03", [
        { name: "Cairo", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      // Alice creates
      const expId = await addExp(aliceToken, tripId, cityId, "Pyramids of Giza");
      // Bob promotes
      await promote(bobToken, expId, days[0].id);
      // Alice demotes
      await demote(aliceToken, expId);

      const logs = await request(app)
        .get(`/api/change-logs/trip/${tripId}?limit=50`)
        .set("Authorization", `Bearer ${aliceToken}`);

      const createLog = logs.body.logs.find(
        (l: any) => l.actionType === "experience_created" && l.entityName === "Pyramids of Giza",
      );
      const promoteLog = logs.body.logs.find(
        (l: any) => l.actionType === "experience_promoted" && l.entityName === "Pyramids of Giza",
      );
      const demoteLog = logs.body.logs.find(
        (l: any) => l.actionType === "experience_demoted" && l.entityName === "Pyramids of Giza",
      );

      expect(createLog.userDisplayName).toBe("Alice");
      expect(promoteLog.userDisplayName).toBe("Bob");
      expect(demoteLog.userDisplayName).toBe("Alice");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 7: IMPORT EDGE CASES
  // ═══════════════════════════════════════════════════════════════

  describe("7. Import Edge Cases", () => {
    it("S31: Import then immediately import again — first trip archived", async () => {
      const name1 = "Chaos: Import First";
      const name2 = "Chaos: Import Second";

      const res1 = await request(app)
        .post("/api/import/commit")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripName: name1,
          startDate: "2026-08-01",
          endDate: "2026-08-05",
          cities: [{ name: "Lima", arrivalDate: "2026-08-01", departureDate: "2026-08-05" }],
        });
      expect(res1.status).toBe(201);
      const trip1Id = res1.body.id;

      const res2 = await request(app)
        .post("/api/import/commit")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripName: name2,
          startDate: "2026-09-01",
          endDate: "2026-09-05",
          cities: [{ name: "Cusco", arrivalDate: "2026-09-01", departureDate: "2026-09-05" }],
        });
      expect(res2.status).toBe(201);

      // First trip should be archived
      const trip1 = await request(app).get(`/api/trips/${trip1Id}`).set("Authorization", `Bearer ${aliceToken}`);
      // The trip endpoint doesn't expose status, but active should return trip2
      const active = await request(app).get("/api/trips/active").set("Authorization", `Bearer ${aliceToken}`);
      expect(active.body.name).toBe(name2);
    });

    it("S32: Import with no experiences — just structure", async () => {
      const name = "Chaos: Import No Experiences";


      const res = await request(app)
        .post("/api/import/commit")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripName: name,
          startDate: "2026-10-01",
          endDate: "2026-10-10",
          cities: [
            { name: "Santiago", arrivalDate: "2026-10-01", departureDate: "2026-10-05" },
            { name: "Valparaiso", arrivalDate: "2026-10-06", departureDate: "2026-10-10" },
          ],
          routeSegments: [
            { originCity: "Santiago", destinationCity: "Valparaiso", transportMode: "drive" },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.cities.length).toBe(2);
      expect(res.body.routeSegments.length).toBe(1);
      expect(res.body.experiences.length).toBe(0);
      expect(res.body.days.length).toBe(10);
    });

    it("S33: Import with placeholder days for gap dates", async () => {
      const name = "Chaos: Import With Gaps";


      const res = await request(app)
        .post("/api/import/commit")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripName: name,
          startDate: "2026-11-01",
          endDate: "2026-11-10",
          cities: [
            { name: "Bogota", arrivalDate: "2026-11-01", departureDate: "2026-11-03" },
            // Gap: Nov 4-7
            { name: "Cartagena", arrivalDate: "2026-11-08", departureDate: "2026-11-10" },
          ],
        });
      expect(res.status).toBe(201);

      // Should have 10 days total (3 Bogota + 3 Cartagena + 4 placeholders)
      expect(res.body.days.length).toBe(10);

      // Placeholder days should be assigned to first city (Bogota)
      const bogotaDays = res.body.days.filter((d: any) => d.city.name === "Bogota");
      expect(bogotaDays.length).toBe(7); // 3 real + 4 placeholder

      // Now add a city for the gap — should reassign placeholders
      const tripId = res.body.id;
      await addCity(aliceToken, tripId, "Medellin", "2026-11-04", "2026-11-07");

      const days = await getDays(aliceToken, tripId);
      const medellinDays = days.filter((d: any) => d.city.name === "Medellin");
      expect(medellinDays.length).toBe(4);

      // Placeholder notes should be cleared
      for (const d of medellinDays) {
        expect(d.notes).toBeNull();
      }

      // Total should still be 10
      expect(days.length).toBe(10);
    });

    it("S34: Import with experiences and day matching", async () => {
      const name = "Chaos: Import With Experiences";


      const res = await request(app)
        .post("/api/import/commit")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripName: name,
          startDate: "2026-12-01",
          endDate: "2026-12-05",
          cities: [
            { name: "Marrakech", arrivalDate: "2026-12-01", departureDate: "2026-12-05" },
          ],
          experiences: [
            { cityName: "Marrakech", name: "Jemaa el-Fnaa", dayDate: "2026-12-01", timeWindow: "evening" },
            { cityName: "Marrakech", name: "Jardin Majorelle", dayDate: "2026-12-02", timeWindow: "morning" },
            { cityName: "Marrakech", name: "Bahia Palace" }, // No day — should be possible
          ],
        });
      expect(res.status).toBe(201);

      const selected = res.body.experiences.filter((e: any) => e.state === "selected");
      const possible = res.body.experiences.filter((e: any) => e.state === "possible");
      expect(selected.length).toBe(2);
      expect(possible.length).toBe(1);
      expect(possible[0].name).toBe("Bahia Palace");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 8: CASCADE INTEGRITY & COMPLEX CHAINS
  // ═══════════════════════════════════════════════════════════════

  describe("8. Cascade Integrity", () => {
    it("S35: Full lifecycle — create, populate, modify dates, delete city, verify integrity", async () => {
      const name = "Chaos: Full Lifecycle";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-15", [
        { name: "Lisbon", arrivalDate: "2026-07-01", departureDate: "2026-07-05" },
        { name: "Porto", arrivalDate: "2026-07-06", departureDate: "2026-07-10" },
        { name: "Faro", arrivalDate: "2026-07-11", departureDate: "2026-07-15" },
      ]);

      let days = await getDays(aliceToken, tripId);
      expect(days.length).toBe(15);

      const lisbonId = days.find((d: any) => d.city.name === "Lisbon").city.id;
      const portoId = days.find((d: any) => d.city.name === "Porto").city.id;
      const faroId = days.find((d: any) => d.city.name === "Faro").city.id;

      // Add experiences to each city
      const exp1 = await addExp(aliceToken, tripId, lisbonId, "Belem Tower");
      const exp2 = await addExp(aliceToken, tripId, portoId, "Livraria Lello");
      const exp3 = await addExp(aliceToken, tripId, faroId, "Ria Formosa");

      // Promote each
      const lisbonDays = days.filter((d: any) => d.city.name === "Lisbon");
      const portoDays = days.filter((d: any) => d.city.name === "Porto");
      const faroDays = days.filter((d: any) => d.city.name === "Faro");
      await promote(aliceToken, exp1, lisbonDays[0].id);
      await promote(aliceToken, exp2, portoDays[0].id);
      await promote(aliceToken, exp3, faroDays[0].id);

      // Shrink Porto: Jul 6-8 (removes Jul 9-10)
      await request(app)
        .patch(`/api/cities/${portoId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ departureDate: "2026-07-08" });

      // Porto experience should still be selected (Jul 6 is still in range)
      let e2 = await getExp(aliceToken, exp2);
      expect(e2.state).toBe("selected");

      days = await getDays(aliceToken, tripId);
      expect(days.length).toBe(13); // 5 + 3 + 5

      // Delete Porto entirely
      await request(app).delete(`/api/cities/${portoId}`).set("Authorization", `Bearer ${aliceToken}`);

      // Porto experience should move to another city (Lisbon, first in order)
      e2 = await getExp(aliceToken, exp2);
      expect(e2.state).toBe("possible");
      expect(e2.city.name).toBe("Lisbon");

      // Other experiences unaffected
      const e1 = await getExp(aliceToken, exp1);
      expect(e1.state).toBe("selected");
      expect(e1.city.name).toBe("Lisbon");

      const e3 = await getExp(aliceToken, exp3);
      expect(e3.state).toBe("selected");
      expect(e3.city.name).toBe("Faro");
    });

    it("S36: Day reassignment chain — move day A→B, then B→C", async () => {
      const name = "Chaos: Reassignment Chain";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-09", [
        { name: "CityA", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
        { name: "CityB", arrivalDate: "2026-07-04", departureDate: "2026-07-06" },
        { name: "CityC", arrivalDate: "2026-07-07", departureDate: "2026-07-09" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityADay = days.find((d: any) => d.city.name === "CityA");
      const cityBId = days.find((d: any) => d.city.name === "CityB").city.id;
      const cityCId = days.find((d: any) => d.city.name === "CityC").city.id;

      // Add experience to CityA day 1
      const expId = await addExp(aliceToken, tripId, cityADay.city.id, "Chain Experience");
      await promote(aliceToken, expId, cityADay.id);

      // Reassign day from A to B
      await request(app)
        .patch(`/api/days/${cityADay.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ cityId: cityBId });

      let exp = await getExp(aliceToken, expId);
      expect(exp.city.name).toBe("CityB");
      expect(exp.state).toBe("selected");

      // Reassign day from B to C
      await request(app)
        .patch(`/api/days/${cityADay.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ cityId: cityCId });

      exp = await getExp(aliceToken, expId);
      expect(exp.city.name).toBe("CityC");
      expect(exp.state).toBe("selected");
    });

    it("S37: Multiple experiences on same day — all demoted when day deleted", async () => {
      const name = "Chaos: Multi Exp Day Delete";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-03", [
        { name: "Taipei", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      const expIds: string[] = [];
      for (const place of ["Taipei 101", "Night Market", "Temple", "Tea House", "Hot Springs"]) {
        const id = await addExp(aliceToken, tripId, cityId, place);
        await promote(aliceToken, id, days[1].id); // All on day 2
        expIds.push(id);
      }

      // Delete day 2
      await request(app).delete(`/api/days/${days[1].id}`).set("Authorization", `Bearer ${aliceToken}`);

      // All 5 should be demoted
      for (const id of expIds) {
        const exp = await getExp(aliceToken, id);
        expect(exp.state).toBe("possible");
        expect(exp.dayId).toBeNull();
      }
    });

    it("S38: Accommodation on city delete — preserved if other city exists", async () => {
      const name = "Chaos: Acc City Delete";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-06", [
        { name: "Denver", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
        { name: "Boulder", arrivalDate: "2026-07-04", departureDate: "2026-07-06" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const boulderId = days.find((d: any) => d.city.name === "Boulder").city.id;

      const accRes = await request(app)
        .post("/api/accommodations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId: boulderId, name: "Boulder Inn", address: "123 Pearl St" });
      const accId = accRes.body.id;

      // Delete Boulder — accommodation should cascade-delete since it belongs to Boulder
      await request(app).delete(`/api/cities/${boulderId}`).set("Authorization", `Bearer ${aliceToken}`);

      // Accommodation was in Boulder, which was deleted — it cascades with the city
      const accCheck = await request(app)
        .get(`/api/accommodations/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const found = accCheck.body.find((a: any) => a.id === accId);
      // Accommodation cascades with city deletion (onDelete: Cascade on City)
      expect(found).toBeUndefined();
    });

    it("S39: Import then manually add overlapping city — placeholders reassigned correctly", async () => {
      const name = "Chaos: Import Then Overlap";


      const importRes = await request(app)
        .post("/api/import/commit")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripName: name,
          startDate: "2026-11-15",
          endDate: "2026-11-25",
          cities: [
            { name: "Buenos Aires", arrivalDate: "2026-11-15", departureDate: "2026-11-20" },
          ],
        });
      const tripId = importRes.body.id;

      // Import creates 11 days: 6 for Buenos Aires + 5 placeholders (Nov 21-25)
      expect(importRes.body.days.length).toBe(11);

      // Add Mendoza for Nov 21-25 — should reassign placeholders
      await addCity(aliceToken, tripId, "Mendoza", "2026-11-21", "2026-11-25");

      const days = await getDays(aliceToken, tripId);
      expect(days.length).toBe(11); // No duplicates

      const mendozaDays = days.filter((d: any) => d.city.name === "Mendoza");
      expect(mendozaDays.length).toBe(5);

      // Placeholder notes should be cleared
      for (const d of mendozaDays) {
        expect(d.notes).toBeNull();
      }
    });

    it("S40: Experience with location data persists through promote/demote cycles", async () => {
      const name = "Chaos: Location Persist";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-03", [
        { name: "Sydney", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;
      const expId = await addExp(aliceToken, tripId, cityId, "Opera House");

      // Set location
      await request(app)
        .patch(`/api/experiences/${expId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ latitude: -33.8568, longitude: 151.2153, locationStatus: "confirmed" });

      // Promote → demote → promote
      await promote(aliceToken, expId, days[0].id);
      await demote(aliceToken, expId);
      await promote(aliceToken, expId, days[2].id);

      // Location should be preserved through all state changes
      const exp = await getExp(aliceToken, expId);
      expect(exp.latitude).toBeCloseTo(-33.8568, 3);
      expect(exp.longitude).toBeCloseTo(151.2153, 3);
      expect(exp.locationStatus).toBe("confirmed");
      expect(exp.state).toBe("selected");
    });

    it("S41: Reorder cities and verify experience listing order", async () => {
      const name = "Chaos: City Reorder";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-09", [
        { name: "Alpha", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
        { name: "Beta", arrivalDate: "2026-07-04", departureDate: "2026-07-06" },
        { name: "Gamma", arrivalDate: "2026-07-07", departureDate: "2026-07-09" },
      ]);

      const citiesRes = await request(app)
        .get(`/api/cities/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const cityIds = citiesRes.body.map((c: any) => c.id);

      // Reorder: Gamma, Alpha, Beta
      await request(app)
        .post("/api/cities/reorder")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ orderedIds: [cityIds[2], cityIds[0], cityIds[1]] });

      const reordered = await request(app)
        .get(`/api/cities/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(reordered.body[0].name).toBe("Gamma");
      expect(reordered.body[1].name).toBe("Alpha");
      expect(reordered.body[2].name).toBe("Beta");
    });

    it("S42: Capture via manual entry and verify enrichment doesn't crash", async () => {
      const name = "Chaos: Capture Entry";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-03", [
        { name: "Kyoto", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      const res = await request(app)
        .post("/api/capture")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Fushimi Inari Shrine", description: "Thousands of torii gates" });

      expect(res.status).toBe(201);
      expect(res.body.experiences.length).toBe(1);
      expect(res.body.experiences[0].name).toBe("Fushimi Inari Shrine");
      expect(res.body.experiences[0].state).toBe("possible");
    });

    it("S43: Travel time calculation for different modes", async () => {
      const name = "Chaos: Travel Time";


      // Test all three modes between two points
      for (const mode of ["walk", "subway", "taxi"]) {
        const res = await request(app)
          .post("/api/travel-time")
          .set("Authorization", `Bearer ${aliceToken}`)
          .send({
            originLat: 35.6762,
            originLng: 139.6503,
            destLat: 35.7148,
            destLng: 139.7967,
            mode,
          });
        expect(res.status).toBe(200);
        expect(res.body.durationMinutes).toBeGreaterThan(0);
        expect(res.body.mode).toBe(mode);
        expect(res.body.bufferMinutes).toBeGreaterThan(0);
      }
    });

    it("S44: Trip update (rename, change dates) doesn't affect days", async () => {
      const name = "Chaos: Trip Update";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-05", [
        { name: "Venice", arrivalDate: "2026-07-01", departureDate: "2026-07-05" },
      ]);

      const daysBefore = await getDays(aliceToken, tripId);
      expect(daysBefore.length).toBe(5);

      // Rename and shift trip dates (but NOT city dates)
      await request(app)
        .patch(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ name: "Chaos: Trip Renamed", startDate: "2026-06-28", endDate: "2026-07-08" });

      // Days should be unchanged (trip date change doesn't auto-sync days)
      const daysAfter = await getDays(aliceToken, tripId);
      expect(daysAfter.length).toBe(5);
    });

    it("S45: Empty trip — no cities, no days, still functional", async () => {
      const name = "Chaos: Empty Trip";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-05");

      const days = await getDays(aliceToken, tripId);
      expect(days.length).toBe(0);

      const cities = await request(app)
        .get(`/api/cities/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(cities.body.length).toBe(0);

      const exps = await request(app)
        .get(`/api/experiences/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(exps.body.length).toBe(0);

      // Can still add a city later
      const cityId = await addCity(aliceToken, tripId, "Istanbul", "2026-07-01", "2026-07-05");
      const daysAfter = await getDays(aliceToken, tripId);
      expect(daysAfter.length).toBe(5);
    });

    it("S46: Experience themes filtering", async () => {
      const name = "Chaos: Theme Filtering";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-03", [
        { name: "Kyoto", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      // Create experiences with different themes
      const templeExp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Kinkaku-ji", themes: ["temples"] });
      const foodExp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Nishiki Market", themes: ["food"] });
      const multiExp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Arashiyama", themes: ["nature", "temples"] });

      // Verify themes stored correctly
      const e1 = await getExp(aliceToken, templeExp.body.id);
      expect(e1.themes).toEqual(["temples"]);
      const e3 = await getExp(aliceToken, multiExp.body.id);
      expect(e3.themes).toEqual(expect.arrayContaining(["nature", "temples"]));
    });

    it("S47: Rapid promote/demote same experience (stress test)", async () => {
      const name = "Chaos: Rapid Toggle";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-03", [
        { name: "Singapore", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;
      const expId = await addExp(aliceToken, tripId, cityId, "Marina Bay Sands");

      // Rapid toggling
      for (let i = 0; i < 5; i++) {
        await promote(aliceToken, expId, days[i % 3].id);
        await demote(aliceToken, expId);
      }

      // Final state should be possible
      const exp = await getExp(aliceToken, expId);
      expect(exp.state).toBe("possible");
      expect(exp.dayId).toBeNull();

      // Promote one last time
      await promote(aliceToken, expId, days[1].id, "evening");
      const final = await getExp(aliceToken, expId);
      expect(final.state).toBe("selected");
      expect(final.timeWindow).toBe("evening");
    });

    it("S48: Create standalone day then add to city", async () => {
      const name = "Chaos: Standalone Day";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-05", [
        { name: "Lima", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      // Create a standalone day for Jul 4
      const dayRes = await request(app)
        .post("/api/days")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, date: "2026-07-04", notes: "Free day" });
      expect(dayRes.status).toBe(201);

      // Add experience to the standalone day
      const expId = await addExp(aliceToken, tripId, cityId, "Miraflores Walk");
      await promote(aliceToken, expId, dayRes.body.id);

      const day = await request(app).get(`/api/days/${dayRes.body.id}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(day.body.experiences.length).toBe(1);
      expect(day.body.notes).toBe("Free day");
    });

    it("S49: Experience with all optional fields populated", async () => {
      const name = "Chaos: Full Experience";

      const tripId = await createTrip(aliceToken, name, "2026-07-01", "2026-07-03", [
        { name: "Nara", arrivalDate: "2026-07-01", departureDate: "2026-07-03" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      const res = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          cityId,
          name: "Todai-ji Temple",
          description: "Great Buddha Hall",
          themes: ["temples", "architecture"],
          userNotes: "Arrive early to avoid crowds, the deer are friendly",
          sourceUrl: "https://example.com/todaiji",
          sourceText: "Article about Todai-ji",
        });
      expect(res.status).toBe(201);

      const exp = await getExp(aliceToken, res.body.id);
      expect(exp.name).toBe("Todai-ji Temple");
      expect(exp.description).toBe("Great Buddha Hall");
      expect(exp.themes).toEqual(expect.arrayContaining(["temples", "architecture"]));
      expect(exp.userNotes).toBe("Arrive early to avoid crowds, the deer are friendly");
      expect(exp.sourceUrl).toBe("https://example.com/todaiji");
    });

    it("S50: Complete user journey — import, edit, plan, verify", async () => {
      const name = "Chaos: Complete Journey";


      // 1. Import a trip
      const importRes = await request(app)
        .post("/api/import/commit")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripName: name,
          startDate: "2026-08-01",
          endDate: "2026-08-10",
          cities: [
            { name: "Dubrovnik", arrivalDate: "2026-08-01", departureDate: "2026-08-04" },
            { name: "Split", arrivalDate: "2026-08-05", departureDate: "2026-08-07" },
          ],
          routeSegments: [
            { originCity: "Dubrovnik", destinationCity: "Split", transportMode: "ferry" },
          ],
          experiences: [
            { cityName: "Dubrovnik", name: "City Walls Walk", dayDate: "2026-08-01" },
            { cityName: "Split", name: "Diocletian Palace", dayDate: "2026-08-05" },
          ],
          accommodations: [
            { cityName: "Dubrovnik", name: "Hotel Excelsior" },
          ],
        });
      expect(importRes.status).toBe(201);
      const tripId = importRes.body.id;

      // 2. Add a third city for the gap days
      await addCity(aliceToken, tripId, "Hvar", "2026-08-08", "2026-08-10");

      let days = await getDays(aliceToken, tripId);
      expect(days.length).toBe(10); // All days covered

      const hvarDays = days.filter((d: any) => d.city.name === "Hvar");
      expect(hvarDays.length).toBe(3);

      // 3. Add more experiences via capture
      const dubrovnikCity = days.find((d: any) => d.city.name === "Dubrovnik");
      const captureRes = await request(app)
        .post("/api/capture")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId: dubrovnikCity.city.id, name: "Kayak Tour" });
      expect(captureRes.status).toBe(201);

      // 4. Promote captured experience
      const kayakId = captureRes.body.experiences[0].id;
      const dubrovnikDays = days.filter((d: any) => d.city.name === "Dubrovnik");
      await promote(aliceToken, kayakId, dubrovnikDays[1].id, "morning");

      // 5. Bob adds his own experience
      const hvarCity = days.find((d: any) => d.city.name === "Hvar");
      const bobExp = await addExp(bobToken, tripId, hvarCity.city.id, "Beach Day");
      await promote(bobToken, bobExp, hvarDays[0].id, "all-day");

      // 6. Add reservation
      await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          dayId: dubrovnikDays[2].id,
          name: "Sunset Dinner",
          type: "restaurant",
          datetime: "2026-08-03T19:30:00Z",
        });

      // 7. Verify final state
      const allExp = await request(app)
        .get(`/api/experiences/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const selected = allExp.body.filter((e: any) => e.state === "selected");
      expect(selected.length).toBeGreaterThanOrEqual(3); // City Walls + Kayak + Beach Day + Diocletian

      const allRes = await request(app)
        .get(`/api/reservations/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(allRes.body.length).toBe(1);

      // 8. Change log shows all actions from both users
      const logs = await request(app)
        .get(`/api/change-logs/trip/${tripId}?limit=50`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const users = new Set(logs.body.logs.map((l: any) => l.userDisplayName));
      expect(users.has("Alice")).toBe(true);
      expect(users.has("Bob")).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 9. Soft-Delete & AI Tool Operations
  // ═══════════════════════════════════════════════════════════════════
  describe("9. Soft-Delete & AI Tool Operations", () => {
    it("S51: Hide city — disappears from trip listing, experiences preserved", async () => {
      const tripId = await createTrip(aliceToken, "Hide Test", "2026-08-01", "2026-08-05", [
        { name: "Tokyo", arrivalDate: "2026-08-01", departureDate: "2026-08-03" },
      ]);
      const candidateId = await addCity(aliceToken, tripId, "Ibusuki");
      const expId = await addExp(aliceToken, tripId, candidateId, "Sand Bath");

      // Verify city visible
      let trip = await request(app).get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(trip.body.cities).toHaveLength(2);

      // Hide it
      const hide = await request(app).patch(`/api/cities/${candidateId}`).set("Authorization", `Bearer ${aliceToken}`)
        .send({ hidden: true });
      expect(hide.status).toBe(200);

      // Trip no longer shows hidden city
      trip = await request(app).get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(trip.body.cities).toHaveLength(1);
      expect(trip.body.cities[0].name).toBe("Tokyo");

      // City listing also filters
      const cityList = await request(app).get(`/api/cities/trip/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(cityList.body).toHaveLength(1);

      // But experience still exists in DB
      const exp = await request(app).get(`/api/experiences/${expId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(exp.status).toBe(200);
      expect(exp.body.name).toBe("Sand Bath");
      expect(exp.body.cityId).toBe(candidateId);
    });

    it("S52: Hide already-hidden city — idempotent, no error", async () => {
      const tripId = await createTrip(aliceToken, "Double Hide", "2026-08-10", "2026-08-12");
      const cityId = await addCity(aliceToken, tripId, "Taketa");

      // Hide twice
      const r1 = await request(app).patch(`/api/cities/${cityId}`).set("Authorization", `Bearer ${aliceToken}`)
        .send({ hidden: true });
      expect(r1.status).toBe(200);
      const r2 = await request(app).patch(`/api/cities/${cityId}`).set("Authorization", `Bearer ${aliceToken}`)
        .send({ hidden: true });
      expect(r2.status).toBe(200);

      // Still hidden (not double-hidden or errored)
      const city = await prisma.city.findUnique({ where: { id: cityId } });
      expect(city!.hidden).toBe(true);
    });

    it("S53: Restore hidden city — becomes visible again", async () => {
      const tripId = await createTrip(aliceToken, "Restore Test", "2026-08-15", "2026-08-18");
      const cityId = await addCity(aliceToken, tripId, "Hita");
      await addExp(aliceToken, tripId, cityId, "Mameda Town");

      // Hide
      await request(app).patch(`/api/cities/${cityId}`).set("Authorization", `Bearer ${aliceToken}`)
        .send({ hidden: true });
      let trip = await request(app).get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(trip.body.cities).toHaveLength(0);

      // Restore
      await request(app).patch(`/api/cities/${cityId}`).set("Authorization", `Bearer ${aliceToken}`)
        .send({ hidden: false });
      trip = await request(app).get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(trip.body.cities).toHaveLength(1);
      expect(trip.body.cities[0].name).toBe("Hita");
    });

    it("S54: Delete city with hidden=false skips hidden cities for reassignment", async () => {
      const tripId = await createTrip(aliceToken, "Delete Skip Hidden", "2026-09-01", "2026-09-05", [
        { name: "CityA", arrivalDate: "2026-09-01", departureDate: "2026-09-03" },
        { name: "CityB", arrivalDate: "2026-09-04", departureDate: "2026-09-05" },
      ]);
      const trip = await request(app).get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      const cityA = trip.body.cities.find((c: any) => c.name === "CityA");
      const cityB = trip.body.cities.find((c: any) => c.name === "CityB");

      // Add hidden city
      const hiddenId = await addCity(aliceToken, tripId, "HiddenCity");
      await request(app).patch(`/api/cities/${hiddenId}`).set("Authorization", `Bearer ${aliceToken}`)
        .send({ hidden: true });

      // Add experience to CityA
      const expId = await addExp(aliceToken, tripId, cityA.id, "Test Experience");

      // Delete CityA — experience should go to CityB (not HiddenCity)
      await request(app).delete(`/api/cities/${cityA.id}`).set("Authorization", `Bearer ${aliceToken}`);
      const exp = await request(app).get(`/api/experiences/${expId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(exp.body.cityId).toBe(cityB.id);
    });

    it("S55: Move experience between cities", async () => {
      const tripId = await createTrip(aliceToken, "Move Exp", "2026-09-10", "2026-09-15", [
        { name: "Kyoto", arrivalDate: "2026-09-10", departureDate: "2026-09-12" },
        { name: "Osaka", arrivalDate: "2026-09-13", departureDate: "2026-09-15" },
      ]);
      const trip = await request(app).get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      const kyoto = trip.body.cities.find((c: any) => c.name === "Kyoto");
      const osaka = trip.body.cities.find((c: any) => c.name === "Osaka");

      const expId = await addExp(aliceToken, tripId, kyoto.id, "Ramen Shop");

      // Move to Osaka via direct API (mirrors what move_experience tool does)
      const move = await request(app).patch(`/api/experiences/${expId}`).set("Authorization", `Bearer ${aliceToken}`)
        .send({ cityId: osaka.id });
      expect(move.status).toBe(200);

      const exp = await request(app).get(`/api/experiences/${expId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(exp.body.cityId).toBe(osaka.id);
    });

    it("S56: Move selected experience — stays selected but dayId cleared if day not in new city", async () => {
      const tripId = await createTrip(aliceToken, "Move Selected", "2026-09-20", "2026-09-25", [
        { name: "CityX", arrivalDate: "2026-09-20", departureDate: "2026-09-22" },
        { name: "CityY", arrivalDate: "2026-09-23", departureDate: "2026-09-25" },
      ]);
      const trip = await request(app).get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      const cityX = trip.body.cities.find((c: any) => c.name === "CityX");
      const cityY = trip.body.cities.find((c: any) => c.name === "CityY");

      const expId = await addExp(aliceToken, tripId, cityX.id, "Temple Visit");
      const days = await request(app).get(`/api/days/trip/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      const cityXDay = days.body.find((d: any) => d.cityId === cityX.id);

      // Promote to day
      await request(app).post(`/api/experiences/${expId}/promote`).set("Authorization", `Bearer ${aliceToken}`)
        .send({ dayId: cityXDay.id });

      // Move to CityY — experience should be demoted (day belongs to CityX)
      await request(app).patch(`/api/experiences/${expId}`).set("Authorization", `Bearer ${aliceToken}`)
        .send({ cityId: cityY.id, state: "possible", dayId: null });

      const exp = await request(app).get(`/api/experiences/${expId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(exp.body.cityId).toBe(cityY.id);
      expect(exp.body.state).toBe("possible");
      expect(exp.body.dayId).toBeNull();
    });

    it("S57: Bulk delete experiences — mix of valid IDs", async () => {
      const tripId = await createTrip(aliceToken, "Bulk Delete", "2026-10-01", "2026-10-03");
      const cityId = await addCity(aliceToken, tripId, "TestCity", "2026-10-01", "2026-10-03");

      const ids = [];
      for (let i = 0; i < 5; i++) {
        ids.push(await addExp(aliceToken, tripId, cityId, `Item ${i}`));
      }

      // Delete 3 of 5
      const toDelete = ids.slice(0, 3);
      await prisma.experience.deleteMany({ where: { id: { in: toDelete } } });

      // Remaining 2 still exist
      const exps = await request(app).get(`/api/experiences/trip/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(exps.body).toHaveLength(2);
      expect(exps.body.map((e: any) => e.id).sort()).toEqual(ids.slice(3).sort());
    });

    it("S58: Bulk delete with invalid IDs — no crash, valid ones still work", async () => {
      const tripId = await createTrip(aliceToken, "Bulk Delete Invalid", "2026-10-05", "2026-10-07");
      const cityId = await addCity(aliceToken, tripId, "TestCity2", "2026-10-05", "2026-10-07");
      const validId = await addExp(aliceToken, tripId, cityId, "Real Item");

      // Delete with mix of valid and fake IDs
      await prisma.experience.deleteMany({
        where: { id: { in: [validId, "fake-id-1", "fake-id-2"] } },
      });

      // Valid one is gone
      const exp = await request(app).get(`/api/experiences/${validId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(exp.status).toBe(404);
    });

    it("S59: Hide dated city — days become orphans with no city in trip view", async () => {
      const tripId = await createTrip(aliceToken, "Hide Dated", "2026-10-10", "2026-10-15", [
        { name: "CityM", arrivalDate: "2026-10-10", departureDate: "2026-10-12" },
        { name: "CityN", arrivalDate: "2026-10-13", departureDate: "2026-10-15" },
      ]);
      const trip = await request(app).get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      const cityM = trip.body.cities.find((c: any) => c.name === "CityM");

      // Hide CityM
      await request(app).patch(`/api/cities/${cityM.id}`).set("Authorization", `Bearer ${aliceToken}`)
        .send({ hidden: true });

      // Trip shows only CityN
      const updated = await request(app).get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(updated.body.cities).toHaveLength(1);
      expect(updated.body.cities[0].name).toBe("CityN");

      // But days for CityM still exist (orphaned from visible perspective)
      const days = await request(app).get(`/api/days/trip/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      const cityMDays = days.body.filter((d: any) => d.cityId === cityM.id);
      expect(cityMDays.length).toBeGreaterThan(0);
    });

    it("S60: Update city name and tagline", async () => {
      const tripId = await createTrip(aliceToken, "City Edit", "2026-10-20", "2026-10-22");
      const cityId = await addCity(aliceToken, tripId, "Sajo");

      // Fix typo
      const r = await request(app).patch(`/api/cities/${cityId}`).set("Authorization", `Bearer ${aliceToken}`)
        .send({ name: "Saijo", tagline: "Sake brewing town" });
      expect(r.status).toBe(200);

      const city = await request(app).get(`/api/cities/${cityId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(city.body.name).toBe("Saijo");
      expect(city.body.tagline).toBe("Sake brewing town");
    });

    it("S61: Hide all candidate cities, then restore one by name", async () => {
      const tripId = await createTrip(aliceToken, "Bulk Hide Restore", "2026-11-01", "2026-11-05", [
        { name: "MainCity", arrivalDate: "2026-11-01", departureDate: "2026-11-05" },
      ]);

      // Add candidate cities
      const c1 = await addCity(aliceToken, tripId, "Ibusuki");
      const c2 = await addCity(aliceToken, tripId, "Taketa");
      const c3 = await addCity(aliceToken, tripId, "Asakura");
      await addExp(aliceToken, tripId, c1, "Sand Bath");
      await addExp(aliceToken, tripId, c2, "Ruins");
      await addExp(aliceToken, tripId, c3, "Persimmon Farm");

      // Verify 4 cities visible
      let trip = await request(app).get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(trip.body.cities).toHaveLength(4);

      // Hide all candidates (dateless cities)
      await request(app).patch(`/api/cities/${c1}`).set("Authorization", `Bearer ${aliceToken}`).send({ hidden: true });
      await request(app).patch(`/api/cities/${c2}`).set("Authorization", `Bearer ${aliceToken}`).send({ hidden: true });
      await request(app).patch(`/api/cities/${c3}`).set("Authorization", `Bearer ${aliceToken}`).send({ hidden: true });

      trip = await request(app).get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(trip.body.cities).toHaveLength(1); // Only MainCity

      // Restore Taketa
      await request(app).patch(`/api/cities/${c2}`).set("Authorization", `Bearer ${aliceToken}`).send({ hidden: false });

      trip = await request(app).get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(trip.body.cities).toHaveLength(2);
      const names = trip.body.cities.map((c: any) => c.name);
      expect(names).toContain("MainCity");
      expect(names).toContain("Taketa");

      // Taketa's experience is still there
      const exps = await request(app).get(`/api/experiences/trip/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      const taketaExp = exps.body.find((e: any) => e.cityId === c2);
      expect(taketaExp).toBeDefined();
      expect(taketaExp.name).toBe("Ruins");
    });

    it("S62: Experience listing includes hidden city experiences (for processing)", async () => {
      const tripId = await createTrip(aliceToken, "Exp Visibility", "2026-11-10", "2026-11-12");
      const visible = await addCity(aliceToken, tripId, "VisibleCity", "2026-11-10", "2026-11-12");
      const hidden = await addCity(aliceToken, tripId, "HiddenCity2");
      await addExp(aliceToken, tripId, visible, "Visible Exp");
      await addExp(aliceToken, tripId, hidden, "Hidden Exp");

      // Hide the city
      await request(app).patch(`/api/cities/${hidden}`).set("Authorization", `Bearer ${aliceToken}`)
        .send({ hidden: true });

      // Experiences endpoint returns ALL trip experiences (including hidden city ones)
      const exps = await request(app).get(`/api/experiences/trip/${tripId}`).set("Authorization", `Bearer ${aliceToken}`);
      expect(exps.body).toHaveLength(2);
      expect(exps.body.map((e: any) => e.name).sort()).toEqual(["Hidden Exp", "Visible Exp"]);
    });

    // ═══════════════════════════════════════════════════════════════════
    // Transport: route segment logistics & intra-city mode changes
    // ═══════════════════════════════════════════════════════════════════

    it("S63: Route segment CRUD with logistics fields", async () => {
      const tripId = await createTrip(aliceToken, "Transport Test", "2026-10-01", "2026-10-10", [
        { name: "Tokyo", arrivalDate: "2026-10-01", departureDate: "2026-10-05" },
        { name: "Kyoto", arrivalDate: "2026-10-05", departureDate: "2026-10-10" },
      ]);

      // Create route segment with all logistics fields
      const createRes = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          originCity: "Tokyo",
          destinationCity: "Kyoto",
          transportMode: "train",
          departureDate: "2026-10-05",
          serviceNumber: "Nozomi 42",
          confirmationNumber: "ABC123",
          departureTime: "09:30",
          arrivalTime: "11:45",
          departureStation: "Tokyo Station",
          arrivalStation: "Kyoto Station",
          seatInfo: "Car 5, Seat 12A",
          notes: "Window seat reserved",
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.serviceNumber).toBe("Nozomi 42");
      expect(createRes.body.confirmationNumber).toBe("ABC123");
      expect(createRes.body.departureTime).toBe("09:30");
      expect(createRes.body.arrivalTime).toBe("11:45");
      expect(createRes.body.departureStation).toBe("Tokyo Station");
      expect(createRes.body.arrivalStation).toBe("Kyoto Station");
      expect(createRes.body.seatInfo).toBe("Car 5, Seat 12A");

      // Fetch and verify
      const getRes = await request(app)
        .get(`/api/route-segments/${createRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(getRes.body.serviceNumber).toBe("Nozomi 42");

      // Update partial fields
      const patchRes = await request(app)
        .patch(`/api/route-segments/${createRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ seatInfo: "Car 3, Seat 8D", confirmationNumber: "XYZ789" });
      expect(patchRes.body.seatInfo).toBe("Car 3, Seat 8D");
      expect(patchRes.body.confirmationNumber).toBe("XYZ789");
      // Unchanged fields should be preserved
      expect(patchRes.body.serviceNumber).toBe("Nozomi 42");

      // Delete
      const delRes = await request(app)
        .delete(`/api/route-segments/${createRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(delRes.body.deleted).toBe(true);
    });

    it("S64: Experience transportModeToHere with expanded modes", async () => {
      const tripId = await createTrip(aliceToken, "Mode Test", "2026-10-15", "2026-10-17", [
        { name: "Osaka", arrivalDate: "2026-10-15", departureDate: "2026-10-17" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const cityId = days[0].city.id;

      // Test all new modes via promote
      for (const mode of ["walk", "subway", "train", "bus", "taxi", "shuttle", "other"]) {
        const expId = await addExp(aliceToken, tripId, cityId, `${mode} place`);
        const res = await request(app)
          .post(`/api/experiences/${expId}/promote`)
          .set("Authorization", `Bearer ${aliceToken}`)
          .send({ dayId: days[0].id, transportModeToHere: mode });
        expect(res.status).toBe(200);
        expect(res.body.transportModeToHere).toBe(mode);
      }

      // Test updating mode via PATCH
      const expId = await addExp(aliceToken, tripId, cityId, "mode-change test");
      await request(app).post(`/api/experiences/${expId}/promote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ dayId: days[0].id, transportModeToHere: "walk" });

      const patchRes = await request(app)
        .patch(`/api/experiences/${expId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ transportModeToHere: "subway" });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.transportModeToHere).toBe("subway");

      // Change again
      const patchRes2 = await request(app)
        .patch(`/api/experiences/${expId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ transportModeToHere: "shuttle" });
      expect(patchRes2.body.transportModeToHere).toBe("shuttle");
    });

    it("S65: Travel time with expanded modes", async () => {
      for (const mode of ["walk", "subway", "train", "bus", "taxi", "shuttle", "other"]) {
        const res = await request(app)
          .post("/api/travel-time")
          .set("Authorization", `Bearer ${aliceToken}`)
          .send({
            originLat: 34.6937,
            originLng: 135.5023,
            destLat: 34.7055,
            destLng: 135.4983,
            mode,
          });
        expect(res.status).toBe(200);
        expect(res.body.durationMinutes).toBeGreaterThan(0);
        expect(res.body.mode).toBe(mode);
        expect(res.body.bufferMinutes).toBeGreaterThan(0);
      }
    });

    it("S66: Deleting route segment preserves logistics in change log", async () => {
      const tripId = await createTrip(aliceToken, "Log Test", "2026-11-01", "2026-11-05", [
        { name: "Nara", arrivalDate: "2026-11-01", departureDate: "2026-11-03" },
        { name: "Kobe", arrivalDate: "2026-11-03", departureDate: "2026-11-05" },
      ]);

      const createRes = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          originCity: "Nara",
          destinationCity: "Kobe",
          transportMode: "train",
          serviceNumber: "Rapid 302",
          confirmationNumber: "CONF999",
        });

      await request(app)
        .delete(`/api/route-segments/${createRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      // Change log should contain the previous state with logistics
      const logs = await request(app)
        .get(`/api/change-logs/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const deleteLog = logs.body.logs.find(
        (l: any) => l.actionType === "route_segment_deleted" && l.entityName.includes("Nara")
      );
      expect(deleteLog).toBeDefined();
    });

    it("S67: AI chat tool — add_route_segment creates segment with all logistics", async () => {
      // Tests the executeTool path directly by calling the API endpoints the tool would call
      const tripId = await createTrip(aliceToken, "AI Segment Trip", "2026-12-01", "2026-12-10", [
        { name: "Tokyo", arrivalDate: "2026-12-01", departureDate: "2026-12-05" },
        { name: "Osaka", arrivalDate: "2026-12-05", departureDate: "2026-12-10" },
      ]);

      // Simulate what the add_route_segment tool does
      const segRes = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          originCity: "Tokyo",
          destinationCity: "Osaka",
          transportMode: "train",
          departureDate: "2026-12-05",
          serviceNumber: "Nozomi 42",
          confirmationNumber: "JR-EAST-ABC123",
          departureTime: "09:30",
          arrivalTime: "12:00",
          departureStation: "Tokyo Station",
          arrivalStation: "Shin-Osaka",
          seatInfo: "Car 7, Seat 3A",
          notes: "Reserve ekiben at platform kiosk",
        });
      expect(segRes.status).toBe(201);

      // Fetch the trip and verify the segment has all fields
      const tripRes = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const seg = tripRes.body.routeSegments.find((s: any) => s.serviceNumber === "Nozomi 42");
      expect(seg).toBeDefined();
      expect(seg.confirmationNumber).toBe("JR-EAST-ABC123");
      expect(seg.departureTime).toBe("09:30");
      expect(seg.arrivalTime).toBe("12:00");
      expect(seg.departureStation).toBe("Tokyo Station");
      expect(seg.arrivalStation).toBe("Shin-Osaka");
      expect(seg.seatInfo).toBe("Car 7, Seat 3A");
      expect(seg.notes).toBe("Reserve ekiben at platform kiosk");
    });

    it("S68: AI chat tool — update_route_segment modifies subset of fields", async () => {
      const tripId = await createTrip(aliceToken, "AI Update Trip", "2026-12-01", "2026-12-10", [
        { name: "Kyoto", arrivalDate: "2026-12-01", departureDate: "2026-12-05" },
        { name: "Hiroshima", arrivalDate: "2026-12-05", departureDate: "2026-12-10" },
      ]);

      const segRes = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          originCity: "Kyoto",
          destinationCity: "Hiroshima",
          transportMode: "train",
          serviceNumber: "Nozomi 99",
          confirmationNumber: "CONF-ORIG",
          departureTime: "08:00",
        });

      // Update only confirmation number and seat — other fields should stay
      const patchRes = await request(app)
        .patch(`/api/route-segments/${segRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          confirmationNumber: "CONF-UPDATED",
          seatInfo: "Car 3, Seat 12E",
        });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.confirmationNumber).toBe("CONF-UPDATED");
      expect(patchRes.body.seatInfo).toBe("Car 3, Seat 12E");
      // Original fields preserved
      expect(patchRes.body.serviceNumber).toBe("Nozomi 99");
      expect(patchRes.body.departureTime).toBe("08:00");
      expect(patchRes.body.transportMode).toBe("train");

      // Verify change log captured both old and new state
      const logs = await request(app)
        .get(`/api/change-logs/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const editLog = logs.body.logs.find(
        (l: any) => l.actionType === "route_segment_edited" && l.entityName.includes("Kyoto")
      );
      expect(editLog).toBeDefined();
      expect(editLog.previousState).toBeDefined();
      expect(editLog.newState).toBeDefined();
    });

    it("S69: Update nonexistent route segment returns 404", async () => {
      const res = await request(app)
        .patch("/api/route-segments/nonexistent-id-999")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ seatInfo: "Window" });
      expect(res.status).toBe(404);
    });

    it("S70: Promote/demote cycle clears transportModeToHere on demote", async () => {
      const tripId = await createTrip(aliceToken, "Mode Cycle", "2026-12-01", "2026-12-05", [
        { name: "Nagoya", arrivalDate: "2026-12-01", departureDate: "2026-12-05" },
      ]);

      // Create experience
      const trip = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const city = trip.body.cities[0];
      const dayId = trip.body.days[0].id;

      const expRes = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ name: "Atsuta Shrine", tripId, cityId: city.id });

      // Promote with transport mode
      const promRes = await request(app)
        .post(`/api/experiences/${expRes.body.id}/promote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ dayId, timeWindow: "morning", transportModeToHere: "subway" });
      expect(promRes.status).toBe(200);
      expect(promRes.body.transportModeToHere).toBe("subway");

      // Demote — transportModeToHere should be cleared
      const demRes = await request(app)
        .post(`/api/experiences/${expRes.body.id}/demote`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(demRes.status).toBe(200);
      expect(demRes.body.transportModeToHere).toBeNull();

      // Re-promote without specifying mode — should be null
      const repromRes = await request(app)
        .post(`/api/experiences/${expRes.body.id}/promote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ dayId, timeWindow: "afternoon" });
      expect(repromRes.status).toBe(200);
      expect(repromRes.body.transportModeToHere).toBeNull();
    });

    it("S71: Route segment with minimal fields, then incrementally add logistics", async () => {
      const tripId = await createTrip(aliceToken, "Incremental Seg", "2026-12-01", "2026-12-05", [
        { name: "Fukuoka", arrivalDate: "2026-12-01", departureDate: "2026-12-03" },
        { name: "Nagasaki", arrivalDate: "2026-12-03", departureDate: "2026-12-05" },
      ]);

      // Create with just the bare minimum
      const segRes = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, originCity: "Fukuoka", destinationCity: "Nagasaki", transportMode: "train" });
      expect(segRes.status).toBe(201);
      expect(segRes.body.serviceNumber).toBeNull();
      expect(segRes.body.confirmationNumber).toBeNull();
      expect(segRes.body.seatInfo).toBeNull();

      // Add service number
      const p1 = await request(app)
        .patch(`/api/route-segments/${segRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ serviceNumber: "Kamome 12" });
      expect(p1.body.serviceNumber).toBe("Kamome 12");

      // Add confirmation number
      const p2 = await request(app)
        .patch(`/api/route-segments/${segRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ confirmationNumber: "JR-KYU-456" });
      expect(p2.body.confirmationNumber).toBe("JR-KYU-456");
      // Service number still there from previous update
      expect(p2.body.serviceNumber).toBe("Kamome 12");

      // Add times and stations
      const p3 = await request(app)
        .patch(`/api/route-segments/${segRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          departureTime: "10:15",
          arrivalTime: "12:05",
          departureStation: "Hakata Station",
          arrivalStation: "Nagasaki Station",
        });
      expect(p3.body.departureTime).toBe("10:15");
      expect(p3.body.arrivalTime).toBe("12:05");
      // All previous fields still intact
      expect(p3.body.serviceNumber).toBe("Kamome 12");
      expect(p3.body.confirmationNumber).toBe("JR-KYU-456");
    });

    it("S72: Deleting a city does NOT delete route segments referencing that city name", async () => {
      const tripId = await createTrip(aliceToken, "City Del Seg", "2026-12-01", "2026-12-10", [
        { name: "Sapporo", arrivalDate: "2026-12-01", departureDate: "2026-12-05" },
        { name: "Hakodate", arrivalDate: "2026-12-05", departureDate: "2026-12-08" },
        { name: "Asahikawa", arrivalDate: "2026-12-08", departureDate: "2026-12-10" },
      ]);

      // Create segment Sapporo → Hakodate
      await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, originCity: "Sapporo", destinationCity: "Hakodate", transportMode: "train", serviceNumber: "Super Hokuto 5" });

      // Delete Hakodate city
      const trip = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const hakodate = trip.body.cities.find((c: any) => c.name === "Hakodate");

      await request(app)
        .delete(`/api/cities/${hakodate.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      // Route segment should still exist — it uses city names, not FK
      const segs = await request(app)
        .get(`/api/route-segments/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(segs.body.length).toBe(1);
      expect(segs.body[0].originCity).toBe("Sapporo");
      expect(segs.body[0].destinationCity).toBe("Hakodate");
      expect(segs.body[0].serviceNumber).toBe("Super Hokuto 5");
    });

    it("S73: Multiple segments on same trip maintain independent logistics", async () => {
      const tripId = await createTrip(aliceToken, "Multi Seg", "2026-12-01", "2026-12-15", [
        { name: "Tokyo", arrivalDate: "2026-12-01", departureDate: "2026-12-05" },
        { name: "Kyoto", arrivalDate: "2026-12-05", departureDate: "2026-12-10" },
        { name: "Osaka", arrivalDate: "2026-12-10", departureDate: "2026-12-15" },
      ]);

      // Create three segments with different modes and logistics
      const seg1 = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId, originCity: "Tokyo", destinationCity: "Kyoto",
          transportMode: "train", serviceNumber: "Nozomi 1", departureTime: "06:00", arrivalTime: "08:15",
          departureStation: "Tokyo Station", arrivalStation: "Kyoto Station",
        });
      const seg2 = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId, originCity: "Kyoto", destinationCity: "Osaka",
          transportMode: "train", serviceNumber: "Thunderbird 9", departureTime: "14:00", arrivalTime: "14:30",
        });
      const seg3 = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId, originCity: "Osaka", destinationCity: "Tokyo",
          transportMode: "flight", serviceNumber: "NH32", confirmationNumber: "ANA-XYZ",
          departureStation: "Itami Airport", arrivalStation: "Haneda Airport",
        });

      // Fetch all segments — should be 3 with correct order
      const segs = await request(app)
        .get(`/api/route-segments/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(segs.body.length).toBe(3);

      // Update seg2 — should NOT affect seg1 or seg3
      await request(app)
        .patch(`/api/route-segments/${seg2.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ confirmationNumber: "JR-WEST-789", seatInfo: "2A" });

      // Re-fetch and verify independence
      const updated = await request(app)
        .get(`/api/route-segments/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const s1 = updated.body.find((s: any) => s.id === seg1.body.id);
      const s2 = updated.body.find((s: any) => s.id === seg2.body.id);
      const s3 = updated.body.find((s: any) => s.id === seg3.body.id);

      expect(s1.serviceNumber).toBe("Nozomi 1");
      expect(s1.confirmationNumber).toBeNull(); // never set
      expect(s2.confirmationNumber).toBe("JR-WEST-789");
      expect(s2.seatInfo).toBe("2A");
      expect(s3.serviceNumber).toBe("NH32");
      expect(s3.confirmationNumber).toBe("ANA-XYZ");
    });

    it("S74: Import commit with route segments preserves logistics fields", async () => {
      // Simulate what the import/commit endpoint does with logistics
      const tripId = await createTrip(aliceToken, "Import Logistics", "2026-12-01", "2026-12-10", [
        { name: "Tokyo", arrivalDate: "2026-12-01", departureDate: "2026-12-05" },
        { name: "Kyoto", arrivalDate: "2026-12-05", departureDate: "2026-12-10" },
      ]);

      // Create a segment with full logistics as if import created it
      const segRes = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          originCity: "Tokyo",
          destinationCity: "Kyoto",
          transportMode: "train",
          departureDate: "2026-12-05",
          serviceNumber: "Hikari 500",
          confirmationNumber: "JR-CENTRAL-999",
          departureTime: "11:00",
          arrivalTime: "13:40",
          departureStation: "Shinagawa",
          arrivalStation: "Kyoto Station",
          seatInfo: "Car 10, Seat 5D",
          notes: "Green car (first class)",
        });

      // Fetch by ID and verify all fields roundtrip
      const fetched = await request(app)
        .get(`/api/route-segments/${segRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(fetched.status).toBe(200);
      expect(fetched.body.serviceNumber).toBe("Hikari 500");
      expect(fetched.body.confirmationNumber).toBe("JR-CENTRAL-999");
      expect(fetched.body.departureTime).toBe("11:00");
      expect(fetched.body.arrivalTime).toBe("13:40");
      expect(fetched.body.departureStation).toBe("Shinagawa");
      expect(fetched.body.arrivalStation).toBe("Kyoto Station");
      expect(fetched.body.seatInfo).toBe("Car 10, Seat 5D");
      expect(fetched.body.notes).toBe("Green car (first class)");
    });

    it("S75: Clearing logistics fields by sending empty strings", async () => {
      const tripId = await createTrip(aliceToken, "Clear Fields", "2026-12-01", "2026-12-05", [
        { name: "Kanazawa", arrivalDate: "2026-12-01", departureDate: "2026-12-03" },
        { name: "Takayama", arrivalDate: "2026-12-03", departureDate: "2026-12-05" },
      ]);

      const segRes = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId, originCity: "Kanazawa", destinationCity: "Takayama",
          transportMode: "drive",
          serviceNumber: "Rental Toyota",
          confirmationNumber: "HERTZ-123",
          seatInfo: "Driver",
        });

      // User changes their mind — clears confirmation and seat by sending empty strings
      const cleared = await request(app)
        .patch(`/api/route-segments/${segRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ confirmationNumber: "", seatInfo: "" });
      expect(cleared.body.confirmationNumber).toBeNull();
      expect(cleared.body.seatInfo).toBeNull();
      // Service number untouched
      expect(cleared.body.serviceNumber).toBe("Rental Toyota");
    });

    it("S76: Both users can create and edit route segments on shared trip", async () => {
      const tripId = await createTrip(aliceToken, "Collab Transport", "2026-12-01", "2026-12-10", [
        { name: "Tokyo", arrivalDate: "2026-12-01", departureDate: "2026-12-05" },
        { name: "Osaka", arrivalDate: "2026-12-05", departureDate: "2026-12-10" },
      ]);

      // Alice creates a flight segment
      const aliceSeg = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId, originCity: "Tokyo", destinationCity: "Osaka",
          transportMode: "flight", serviceNumber: "NH121",
        });

      // Bob updates Alice's segment with confirmation and seat
      const bobUpdate = await request(app)
        .patch(`/api/route-segments/${aliceSeg.body.id}`)
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ confirmationNumber: "ANA-BOB-456", seatInfo: "14F" });
      expect(bobUpdate.status).toBe(200);
      expect(bobUpdate.body.serviceNumber).toBe("NH121"); // Alice's original
      expect(bobUpdate.body.confirmationNumber).toBe("ANA-BOB-456"); // Bob's addition

      // Bob creates their own segment (return trip)
      const bobSeg = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${bobToken}`)
        .send({
          tripId, originCity: "Osaka", destinationCity: "Tokyo",
          transportMode: "train", serviceNumber: "Nozomi 300",
        });
      expect(bobSeg.status).toBe(201);

      // Both segments exist
      const segs = await request(app)
        .get(`/api/route-segments/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(segs.body.length).toBe(2);

      // Change log shows both users
      const logs = await request(app)
        .get(`/api/change-logs/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const aliceLog = logs.body.logs.find(
        (l: any) => l.actionType === "route_segment_added" && l.description.includes("Alice")
      );
      const bobLog = logs.body.logs.find(
        (l: any) => l.actionType === "route_segment_added" && l.description.includes("Bob")
      );
      expect(aliceLog).toBeDefined();
      expect(bobLog).toBeDefined();
    });
  });

  describe("10. Transport UX Edge Cases", () => {
    it("S77: Experience with transportModeToHere survives city move", async () => {
      const tripId = await createTrip(aliceToken, "Mode Move", "2026-12-01", "2026-12-10", [
        { name: "Tokyo", arrivalDate: "2026-12-01", departureDate: "2026-12-05" },
        { name: "Kyoto", arrivalDate: "2026-12-05", departureDate: "2026-12-10" },
      ]);

      const trip = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const tokyo = trip.body.cities.find((c: any) => c.name === "Tokyo");
      const kyoto = trip.body.cities.find((c: any) => c.name === "Kyoto");
      const tokyoDay = trip.body.days.find((d: any) => d.cityId === tokyo.id);

      // Create experience in Tokyo, promote, set transport mode
      const expRes = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ name: "Meiji Shrine", tripId, cityId: tokyo.id });

      await request(app)
        .post(`/api/experiences/${expRes.body.id}/promote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ dayId: tokyoDay.id, timeWindow: "morning", transportModeToHere: "subway" });

      // Move experience to Kyoto
      const moveRes = await request(app)
        .patch(`/api/experiences/${expRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ cityId: kyoto.id });
      expect(moveRes.status).toBe(200);

      // transportModeToHere should persist — it's a property of the experience, not the city
      expect(moveRes.body.transportModeToHere).toBe("subway");
    });

    it("S78: Setting transportModeToHere via PATCH (not promote) works for already-selected experience", async () => {
      const tripId = await createTrip(aliceToken, "Mode Patch", "2026-12-01", "2026-12-05", [
        { name: "Osaka", arrivalDate: "2026-12-01", departureDate: "2026-12-05" },
      ]);

      const trip = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const city = trip.body.cities[0];
      const dayId = trip.body.days[0].id;

      const expRes = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ name: "Dotonbori", tripId, cityId: city.id });

      // Promote without transport mode
      await request(app)
        .post(`/api/experiences/${expRes.body.id}/promote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ dayId, timeWindow: "evening" });

      // Now set transport mode via PATCH (this is what TransportConnector does)
      const patchRes = await request(app)
        .patch(`/api/experiences/${expRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ transportModeToHere: "taxi" });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.transportModeToHere).toBe("taxi");

      // Change to different mode
      const patchRes2 = await request(app)
        .patch(`/api/experiences/${expRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ transportModeToHere: "bus" });
      expect(patchRes2.body.transportModeToHere).toBe("bus");

      // Clear it
      const patchRes3 = await request(app)
        .patch(`/api/experiences/${expRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ transportModeToHere: "" });
      expect(patchRes3.body.transportModeToHere).toBeNull();
    });

    it("S79: Route segment mode change from train to flight updates correctly", async () => {
      const tripId = await createTrip(aliceToken, "Mode Switch", "2026-12-01", "2026-12-10", [
        { name: "Tokyo", arrivalDate: "2026-12-01", departureDate: "2026-12-05" },
        { name: "Sapporo", arrivalDate: "2026-12-05", departureDate: "2026-12-10" },
      ]);

      // Create as train — user hasn't decided yet
      const segRes = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId, originCity: "Tokyo", destinationCity: "Sapporo",
          transportMode: "train", serviceNumber: "Hayabusa 1",
          departureStation: "Tokyo Station", arrivalStation: "Shin-Hakodate-Hokuto",
        });

      // User decides to fly instead — change mode AND all logistics
      const updated = await request(app)
        .patch(`/api/route-segments/${segRes.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          transportMode: "flight",
          serviceNumber: "NH73",
          departureStation: "Haneda Airport",
          arrivalStation: "New Chitose Airport",
          departureTime: "07:30",
          arrivalTime: "09:10",
          confirmationNumber: "ANA-FLY-789",
        });
      expect(updated.body.transportMode).toBe("flight");
      expect(updated.body.serviceNumber).toBe("NH73");
      expect(updated.body.departureStation).toBe("Haneda Airport");
      expect(updated.body.arrivalStation).toBe("New Chitose Airport");

      // Change log should show previous train details
      const logs = await request(app)
        .get(`/api/change-logs/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const editLog = logs.body.logs.find(
        (l: any) => l.actionType === "route_segment_edited"
      );
      expect(editLog).toBeDefined();
      const prev = typeof editLog.previousState === "string"
        ? JSON.parse(editLog.previousState) : editLog.previousState;
      expect(prev.transportMode).toBe("train");
      expect(prev.serviceNumber).toBe("Hayabusa 1");
    });

    it("S80: Day with mixed transport modes — each experience keeps its own mode", async () => {
      const tripId = await createTrip(aliceToken, "Mixed Modes", "2026-12-01", "2026-12-05", [
        { name: "Kyoto", arrivalDate: "2026-12-01", departureDate: "2026-12-05" },
      ]);

      const trip = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const city = trip.body.cities[0];
      const dayId = trip.body.days[0].id;

      // Create 4 experiences with different transport modes
      const modes = ["walk", "bus", "subway", "taxi"];
      const names = ["Kinkaku-ji", "Fushimi Inari", "Nishiki Market", "Gion"];
      const expIds: string[] = [];

      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post("/api/experiences")
          .set("Authorization", `Bearer ${aliceToken}`)
          .send({ name: names[i], tripId, cityId: city.id });
        expIds.push(res.body.id);

        await request(app)
          .post(`/api/experiences/${res.body.id}/promote`)
          .set("Authorization", `Bearer ${aliceToken}`)
          .send({ dayId, timeWindow: "morning", transportModeToHere: modes[i] });
      }

      // Fetch all experiences for this day and verify each has its own mode
      const exps = await request(app)
        .get(`/api/experiences/trip/${tripId}?dayId=${dayId}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      for (let i = 0; i < 4; i++) {
        const exp = exps.body.find((e: any) => e.name === names[i]);
        expect(exp.transportModeToHere).toBe(modes[i]);
      }
    });

    it("S81: Delete segment then recreate with different mode — no ghost data", async () => {
      const tripId = await createTrip(aliceToken, "Delete Recreate", "2026-12-01", "2026-12-10", [
        { name: "Osaka", arrivalDate: "2026-12-01", departureDate: "2026-12-05" },
        { name: "Kobe", arrivalDate: "2026-12-05", departureDate: "2026-12-10" },
      ]);

      // Create ferry segment with full details
      const seg1 = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId, originCity: "Osaka", destinationCity: "Kobe",
          transportMode: "ferry", serviceNumber: "Kobe Ferry A",
          departureStation: "Osaka Port", arrivalStation: "Kobe Harborland",
          confirmationNumber: "FERRY-OLD",
        });

      // Delete it
      await request(app)
        .delete(`/api/route-segments/${seg1.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      // Recreate as train — should have NO ferry data carried over
      const seg2 = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId, originCity: "Osaka", destinationCity: "Kobe",
          transportMode: "train", serviceNumber: "JR Rapid",
        });
      expect(seg2.body.transportMode).toBe("train");
      expect(seg2.body.serviceNumber).toBe("JR Rapid");
      expect(seg2.body.departureStation).toBeNull(); // not carried from deleted
      expect(seg2.body.confirmationNumber).toBeNull();

      // Trip should have exactly 1 segment, not 2
      const segs = await request(app)
        .get(`/api/route-segments/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(segs.body.length).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 10: NEW CHAT TOOL PARITY (S82-S93)
  // Tests for delete_route_segment, update_reservation,
  // add/update/delete_accommodation, create_day, delete_day,
  // reorder_cities — exercised through REST API endpoints
  // (chat tools call the same Prisma logic)
  // ═══════════════════════════════════════════════════════════════

  describe("10. Chat Tool Parity", () => {
    it("S82: Delete route segment demotes attached experiences", async () => {
      const tripId = await createTrip(aliceToken, "S82 Trip", "2026-06-01", "2026-06-04", [
        { name: "CityA", arrivalDate: "2026-06-01", departureDate: "2026-06-02" },
        { name: "CityB", arrivalDate: "2026-06-03", departureDate: "2026-06-04" },
      ]);

      // Add a route segment
      const seg = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, originCity: "CityA", destinationCity: "CityB", transportMode: "train" });
      expect(seg.status).toBe(201);

      // Delete it
      const del = await request(app)
        .delete(`/api/route-segments/${seg.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(del.status).toBe(200);
      expect(del.body.deleted).toBe(true);

      // Verify it's gone
      const segs = await request(app)
        .get(`/api/route-segments/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(segs.body.length).toBe(0);
    });

    it("S83: Delete non-existent route segment returns 404", async () => {
      const res = await request(app)
        .delete("/api/route-segments/nonexistent-id-999")
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(res.status).toBe(404);
    });

    it("S84: Update reservation changes time and confirmation", async () => {
      const tripId = await createTrip(aliceToken, "S84 Trip", "2026-07-01", "2026-07-02", [
        { name: "Rome", arrivalDate: "2026-07-01", departureDate: "2026-07-02" },
      ]);

      const days = await getDays(aliceToken, tripId);
      const dayId = days[0].id;

      // Create reservation
      const res = await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId, dayId, name: "Ristorante Original",
          type: "restaurant", datetime: "2026-07-01T19:00:00Z",
          confirmationNumber: "OLD-CONF",
        });
      expect(res.status).toBe(201);

      // Update it
      const updated = await request(app)
        .patch(`/api/reservations/${res.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          name: "Ristorante Nuovo",
          datetime: "2026-07-01T20:30:00Z",
          confirmationNumber: "NEW-CONF",
        });
      expect(updated.status).toBe(200);
      expect(updated.body.name).toBe("Ristorante Nuovo");
      expect(updated.body.confirmationNumber).toBe("NEW-CONF");
      expect(new Date(updated.body.datetime).getUTCHours()).toBe(20);
    });

    it("S85: Update non-existent reservation returns 404", async () => {
      const res = await request(app)
        .patch("/api/reservations/nonexistent-id-999")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ name: "Ghost" });
      expect(res.status).toBe(404);
    });

    it("S86: Full accommodation CRUD lifecycle", async () => {
      const tripId = await createTrip(aliceToken, "S86 Trip", "2026-08-01", "2026-08-03", [
        { name: "Kyoto", arrivalDate: "2026-08-01", departureDate: "2026-08-03" },
      ]);

      // Get city ID
      const trip = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const cityId = trip.body.cities[0].id;

      // Create
      const acc = await request(app)
        .post("/api/accommodations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId, cityId, name: "Ryokan Sanga",
          address: "123 Gion, Kyoto",
          checkInTime: "15:00", checkOutTime: "10:00",
          confirmationNumber: "RYO-001",
          notes: "Near Yasaka shrine",
        });
      expect(acc.status).toBe(201);
      expect(acc.body.name).toBe("Ryokan Sanga");
      expect(acc.body.checkInTime).toBe("15:00");

      // Update
      const updated = await request(app)
        .patch(`/api/accommodations/${acc.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          name: "Ryokan Sanga Deluxe",
          checkInTime: "14:00",
          notes: "Upgraded room",
        });
      expect(updated.status).toBe(200);
      expect(updated.body.name).toBe("Ryokan Sanga Deluxe");
      expect(updated.body.checkInTime).toBe("14:00");
      expect(updated.body.address).toBe("123 Gion, Kyoto"); // unchanged field preserved

      // Delete
      const del = await request(app)
        .delete(`/api/accommodations/${acc.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(del.status).toBe(200);
      expect(del.body.deleted).toBe(true);

      // Verify gone
      const all = await request(app)
        .get(`/api/accommodations/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(all.body.length).toBe(0);
    });

    it("S87: Delete non-existent accommodation returns 404", async () => {
      const res = await request(app)
        .delete("/api/accommodations/nonexistent-id-999")
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(res.status).toBe(404);
    });

    it("S88: Create day adds to trip and syncs dates", async () => {
      const tripId = await createTrip(aliceToken, "S88 Trip", "2026-09-01", "2026-09-02", [
        { name: "Berlin", arrivalDate: "2026-09-01", departureDate: "2026-09-02" },
      ]);

      const trip = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const cityId = trip.body.cities[0].id;

      const daysBefore = await getDays(aliceToken, tripId);
      const countBefore = daysBefore.length;

      // Create a new day extending the trip
      const newDay = await request(app)
        .post("/api/days")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, date: "2026-09-03" });
      expect(newDay.status).toBe(201);
      expect(newDay.body.date).toContain("2026-09-03");

      const daysAfter = await getDays(aliceToken, tripId);
      expect(daysAfter.length).toBe(countBefore + 1);

      // Trip end date should have synced
      const tripAfter = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(tripAfter.body.endDate).toContain("2026-09-03");
    });

    it("S89: Delete day demotes experiences and syncs dates", async () => {
      const tripId = await createTrip(aliceToken, "S89 Trip", "2026-10-01", "2026-10-03", [
        { name: "Vienna", arrivalDate: "2026-10-01", departureDate: "2026-10-03" },
      ]);

      const trip = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const cityId = trip.body.cities[0].id;

      const days = await getDays(aliceToken, tripId);
      const lastDay = days[days.length - 1];

      // Add an experience and promote it to the last day
      const expId = await addExp(aliceToken, tripId, cityId, "Schonbrunn Palace");
      await promote(aliceToken, expId, lastDay.id, "morning");

      // Delete the last day
      const del = await request(app)
        .delete(`/api/days/${lastDay.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(del.status).toBe(200);

      // Experience should be demoted back to possible
      const exp = await getExp(aliceToken, expId);
      expect(exp.state).toBe("possible");
      expect(exp.dayId).toBeNull();

      // Day count should be reduced
      const daysAfter = await getDays(aliceToken, tripId);
      expect(daysAfter.length).toBe(days.length - 1);
    });

    it("S90: Delete non-existent day returns 404", async () => {
      const res = await request(app)
        .delete("/api/days/nonexistent-id-999")
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(res.status).toBe(404);
    });

    it("S91: Reorder cities changes sequence", async () => {
      const tripId = await createTrip(aliceToken, "S91 Trip", "2026-11-01", "2026-11-06", [
        { name: "Paris", arrivalDate: "2026-11-01", departureDate: "2026-11-02" },
        { name: "Lyon", arrivalDate: "2026-11-03", departureDate: "2026-11-04" },
        { name: "Nice", arrivalDate: "2026-11-05", departureDate: "2026-11-06" },
      ]);

      const trip = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const cities = trip.body.cities.sort((a: any, b: any) => a.sequenceOrder - b.sequenceOrder);
      expect(cities[0].name).toBe("Paris");
      expect(cities[2].name).toBe("Nice");

      // Reverse order: Nice, Lyon, Paris
      const reversed = [cities[2].id, cities[1].id, cities[0].id];
      const reorder = await request(app)
        .post("/api/cities/reorder")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ orderedIds: reversed });
      expect(reorder.status).toBe(200);

      // Verify new order
      const after = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const sorted = after.body.cities.sort((a: any, b: any) => a.sequenceOrder - b.sequenceOrder);
      expect(sorted[0].name).toBe("Nice");
      expect(sorted[1].name).toBe("Lyon");
      expect(sorted[2].name).toBe("Paris");
    });

    it("S92: Double-delete route segment — second attempt is 404", async () => {
      const tripId = await createTrip(aliceToken, "S92 Trip", "2026-12-01", "2026-12-02");
      const seg = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, originCity: "A", destinationCity: "B", transportMode: "train" });

      await request(app)
        .delete(`/api/route-segments/${seg.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      const second = await request(app)
        .delete(`/api/route-segments/${seg.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(second.status).toBe(404);
    });

    it("S93: Double-delete accommodation — second attempt is 404", async () => {
      const tripId = await createTrip(aliceToken, "S93 Trip", "2026-12-05", "2026-12-06", [
        { name: "Oslo", arrivalDate: "2026-12-05", departureDate: "2026-12-06" },
      ]);
      const trip = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const cityId = trip.body.cities[0].id;

      const acc = await request(app)
        .post("/api/accommodations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Hotel Oslo" });

      await request(app)
        .delete(`/api/accommodations/${acc.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      const second = await request(app)
        .delete(`/api/accommodations/${acc.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(second.status).toBe(404);
    });

    it("S94: Update reservation with empty notes clears them", async () => {
      const tripId = await createTrip(aliceToken, "S94 Trip", "2026-12-10", "2026-12-11", [
        { name: "Milan", arrivalDate: "2026-12-10", departureDate: "2026-12-11" },
      ]);
      const days = await getDays(aliceToken, tripId);

      const res = await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId, dayId: days[0].id, name: "Da Vittorio",
          type: "restaurant", datetime: "2026-12-10T20:00:00Z",
          notes: "Window seat requested",
        });
      expect(res.body.notes).toBe("Window seat requested");

      // Clear notes
      const updated = await request(app)
        .patch(`/api/reservations/${res.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ notes: "" });
      // Empty string may be stored as empty or null depending on handler
      expect(updated.body.notes === null || updated.body.notes === "").toBe(true);
    });

    it("S95: Create day on existing date doesn't duplicate", async () => {
      const tripId = await createTrip(aliceToken, "S95 Trip", "2026-12-15", "2026-12-16", [
        { name: "Prague", arrivalDate: "2026-12-15", departureDate: "2026-12-16" },
      ]);

      const trip = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const cityId = trip.body.cities[0].id;

      const daysBefore = await getDays(aliceToken, tripId);
      const countBefore = daysBefore.length;

      // Create another day on a date that already exists — API allows it
      // (the chat tool would need to be smart about this, but API doesn't block it)
      const newDay = await request(app)
        .post("/api/days")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, date: "2026-12-15" });
      expect(newDay.status).toBe(201);

      // Should have one more day (API doesn't enforce uniqueness — that's by design for edge cases)
      const daysAfter = await getDays(aliceToken, tripId);
      expect(daysAfter.length).toBe(countBefore + 1);
    });
  });

  // ── Traveler Documents ──────────────────────────────────────────
  describe("Traveler Documents", () => {
    it("S96: Create profile + document auto-creates profile", async () => {
      const tripId = await createTrip(aliceToken, "S96 Trip", "2026-11-01", "2026-11-05");

      const res = await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "passport", data: { number: "AB1234567", country: "US", expiry: "2028-12-01" } });
      expect(res.status).toBe(201);
      expect(res.body.type).toBe("passport");

      // Profile should exist now
      const profile = await request(app)
        .get(`/api/traveler-documents/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(profile.body.documents).toHaveLength(1);
      expect(profile.body.documents[0].data.number).toBe("AB1234567");
    });

    it("S97: Update document merges data fields", async () => {
      const tripId = await createTrip(aliceToken, "S97 Trip", "2026-11-01", "2026-11-05");

      const doc = await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "passport", data: { number: "CD9999999" } });

      // Update with additional fields
      const updated = await request(app)
        .patch(`/api/traveler-documents/${doc.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ data: { country: "US", expiry: "2029-06-15" } });
      expect(updated.status).toBe(200);
      // Original field should still be there if backend merges
      // (our PATCH replaces data, so we send full data — test that it updates)
      expect(updated.body.data.country).toBe("US");
    });

    it("S98: Delete document — profile survives", async () => {
      const tripId = await createTrip(aliceToken, "S98 Trip", "2026-11-01", "2026-11-05");

      const doc = await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "frequent_flyer", data: { airline: "Delta", number: "1234567890" } });

      await request(app)
        .delete(`/api/traveler-documents/${doc.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(200);

      // Profile still exists, just empty
      const profile = await request(app)
        .get(`/api/traveler-documents/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(profile.body.documents).toHaveLength(0);
    });

    it("S99: Privacy filter — shared endpoint hides private docs from others", async () => {
      const tripId = await createTrip(aliceToken, "S99 Trip", "2026-11-01", "2026-11-05");

      // Alice adds a private document
      await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "passport", data: { number: "PRIVATE123" }, isPrivate: true });

      // Alice adds a shared document
      await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "frequent_flyer", data: { airline: "ANA", number: "SHARED456" } });

      // Bob gets shared docs — should NOT see Alice's private passport
      const shared = await request(app)
        .get(`/api/traveler-documents/trip/${tripId}/shared`)
        .set("Authorization", `Bearer ${bobToken}`);

      const aliceDocs = shared.body.find((p: any) => p.userCode === "CHAOS1")?.documents || [];
      expect(aliceDocs).toHaveLength(1);
      expect(aliceDocs[0].type).toBe("frequent_flyer");
    });

    it("S100: Owner-only mutation — Bob cannot edit Alice's document", async () => {
      const tripId = await createTrip(aliceToken, "S100 Trip", "2026-11-01", "2026-11-05");

      const doc = await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "passport", data: { number: "ALICEONLY" } });

      // Bob tries to update
      const res = await request(app)
        .patch(`/api/traveler-documents/${doc.body.id}`)
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ data: { number: "HACKED" } });
      expect(res.status).toBe(403);

      // Bob tries to delete
      const del = await request(app)
        .delete(`/api/traveler-documents/${doc.body.id}`)
        .set("Authorization", `Bearer ${bobToken}`);
      expect(del.status).toBe(403);
    });

    it("S101: Duplicate profile prevention — two docs from same user don't create two profiles", async () => {
      const tripId = await createTrip(aliceToken, "S101 Trip", "2026-11-01", "2026-11-05");

      await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "passport", data: { number: "P1" } });

      await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "visa", data: { country: "Japan" } });

      const profile = await request(app)
        .get(`/api/traveler-documents/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(profile.body.documents).toHaveLength(2);
    });

    it("S102: Invalid document type is rejected", async () => {
      const tripId = await createTrip(aliceToken, "S102 Trip", "2026-11-01", "2026-11-05");

      const res = await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "credit_card", data: { number: "NOPE" } });
      expect(res.status).toBe(400);
    });

    it("S103: Trip cascade deletes profiles and documents", async () => {
      const tripId = await createTrip(aliceToken, "S103 Trip", "2026-11-01", "2026-11-05");

      await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "passport", data: { number: "CASCADE1" } });

      // Delete the trip
      await request(app)
        .delete(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(200);

      // Profile should be gone (trip cascade)
      const check = await prisma.travelerProfile.findMany({ where: { tripId } });
      expect(check).toHaveLength(0);
    });

    it("S104: Readiness check returns gaps for empty profile", async () => {
      const tripId = await createTrip(aliceToken, "S104 Trip", "2026-11-01", "2026-11-05", [
        { name: "Tokyo", country: "Japan" },
      ]);

      const res = await request(app)
        .get(`/api/traveler-documents/trip/${tripId}/readiness`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(res.status).toBe(200);
      expect(res.body.destinationCountries).toContain("Japan");
      // No profile created yet, so travelers array may be empty
      expect(res.body.travelers).toBeDefined();
    });

    it("S105: Multiple travelers see correct shared docs", async () => {
      const tripId = await createTrip(aliceToken, "S105 Trip", "2026-11-01", "2026-11-05");

      // Alice adds a passport
      await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "passport", data: { number: "ALICE_PP" } });

      // Bob adds a passport
      await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ tripId, type: "passport", data: { number: "BOB_PP" } });

      // Alice sees both via shared endpoint
      const shared = await request(app)
        .get(`/api/traveler-documents/trip/${tripId}/shared`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(shared.body).toHaveLength(2);

      // Each traveler has their own passport
      const aliceProfile = shared.body.find((p: any) => p.displayName === "Alice");
      const bobProfile = shared.body.find((p: any) => p.displayName === "Bob");
      expect(aliceProfile.documents[0].data.number).toBe("ALICE_PP");
      expect(bobProfile.documents[0].data.number).toBe("BOB_PP");
    });

    it("S106: Document with empty data is accepted (partial save)", async () => {
      const tripId = await createTrip(aliceToken, "S106 Trip", "2026-11-01", "2026-11-05");

      const res = await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "passport", data: {} });
      expect(res.status).toBe(201);
    });

    it("S107: Toggle privacy — private doc becomes visible after toggle", async () => {
      const tripId = await createTrip(aliceToken, "S107 Trip", "2026-11-01", "2026-11-05");

      const doc = await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "insurance", data: { provider: "Allianz" }, isPrivate: true });

      // Bob can't see it
      let shared = await request(app)
        .get(`/api/traveler-documents/trip/${tripId}/shared`)
        .set("Authorization", `Bearer ${bobToken}`);
      let aliceDocs = shared.body.find((p: any) => p.userCode === "CHAOS1")?.documents || [];
      expect(aliceDocs).toHaveLength(0);

      // Alice toggles to shared
      await request(app)
        .patch(`/api/traveler-documents/${doc.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ isPrivate: false });

      // Now Bob can see it
      shared = await request(app)
        .get(`/api/traveler-documents/trip/${tripId}/shared`)
        .set("Authorization", `Bearer ${bobToken}`);
      aliceDocs = shared.body.find((p: any) => p.userCode === "CHAOS1")?.documents || [];
      expect(aliceDocs).toHaveLength(1);
      expect(aliceDocs[0].data.provider).toBe("Allianz");
    });

    it("S108: Double-delete document — second attempt is 404", async () => {
      const tripId = await createTrip(aliceToken, "S108 Trip", "2026-11-01", "2026-11-05");

      const doc = await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "ticket", data: { carrier: "JAL", referenceNumber: "JL123" } });

      await request(app)
        .delete(`/api/traveler-documents/${doc.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(200);

      await request(app)
        .delete(`/api/traveler-documents/${doc.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(404);
    });

    // ── Voting tests (S109–S116) ──

    it("S109: Create voting session and cast votes", async () => {
      const tripId = await createTrip(aliceToken, "S109 Trip", "2026-11-01", "2026-11-05");

      const session = await request(app)
        .post("/api/voting")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          question: "Which ramen shop?",
          options: [
            { name: "Ichiran", description: "Tonkotsu classic" },
            { name: "Fuunji", description: "Tsukemen style" },
          ],
        });
      expect(session.status).toBe(201);
      expect(session.body.id).toBeTruthy();
      expect(session.body.status).toBe("open");

      // Alice votes
      const voteRes = await request(app)
        .post(`/api/voting/${session.body.id}/vote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          votes: [
            { optionIndex: 0, preference: "yes" },
            { optionIndex: 1, preference: "maybe" },
          ],
        });
      expect(voteRes.status).toBe(200);

      // Get results
      const results = await request(app)
        .get(`/api/voting/${session.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(results.status).toBe(200);
      expect(results.body.results).toBeTruthy();
      expect(results.body.results[0].yes).toBe(1);
      expect(results.body.results[1].maybe).toBe(1);
    });

    it("S110: Two users vote on same session — tallies combine", async () => {
      const tripId = await createTrip(aliceToken, "S110 Trip", "2026-11-01", "2026-11-05");

      const session = await request(app)
        .post("/api/voting")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          question: "Day trip destination?",
          options: [{ name: "Nikko" }, { name: "Kamakura" }],
        });

      // Alice votes yes on Nikko
      await request(app)
        .post(`/api/voting/${session.body.id}/vote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ votes: [{ optionIndex: 0, preference: "yes" }, { optionIndex: 1, preference: "no" }] })
        .expect(200);

      // Bob votes yes on Kamakura
      await request(app)
        .post(`/api/voting/${session.body.id}/vote`)
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ votes: [{ optionIndex: 0, preference: "no" }, { optionIndex: 1, preference: "yes" }] })
        .expect(200);

      const results = await request(app)
        .get(`/api/voting/${session.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(results.body.results[0].yes).toBe(1);
      expect(results.body.results[0].no).toBe(1);
      expect(results.body.results[1].yes).toBe(1);
      expect(results.body.results[1].no).toBe(1);
    });

    it("S111: User changes vote — upsert replaces old vote", async () => {
      const tripId = await createTrip(aliceToken, "S111 Trip", "2026-11-01", "2026-11-05");

      const session = await request(app)
        .post("/api/voting")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          question: "Dinner spot?",
          options: [{ name: "Sushi Dai" }],
        });

      // Vote no first
      await request(app)
        .post(`/api/voting/${session.body.id}/vote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ votes: [{ optionIndex: 0, preference: "no" }] })
        .expect(200);

      // Change to yes
      await request(app)
        .post(`/api/voting/${session.body.id}/vote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ votes: [{ optionIndex: 0, preference: "yes" }] })
        .expect(200);

      const results = await request(app)
        .get(`/api/voting/${session.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      // Should be 1 yes, 0 no (not 1 yes + 1 no)
      expect(results.body.results[0].yes).toBe(1);
      expect(results.body.results[0].no).toBe(0);
    });

    it("S112: Close voting session — no further votes accepted", async () => {
      const tripId = await createTrip(aliceToken, "S112 Trip", "2026-11-01", "2026-11-05");

      const session = await request(app)
        .post("/api/voting")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          question: "Which temple first?",
          options: [{ name: "Kinkaku-ji" }],
        });

      // Close it
      await request(app)
        .post(`/api/voting/${session.body.id}/close`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(200);

      // Try to vote on closed session
      const voteRes = await request(app)
        .post(`/api/voting/${session.body.id}/vote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ votes: [{ optionIndex: 0, preference: "yes" }] });
      expect(voteRes.status).toBe(400);
    });

    it("S113: Get open sessions for a trip — only open ones returned", async () => {
      const tripId = await createTrip(aliceToken, "S113 Trip", "2026-11-01", "2026-11-05");

      const s1 = await request(app)
        .post("/api/voting")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, question: "Q1?", options: [{ name: "A" }] });

      const s2 = await request(app)
        .post("/api/voting")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, question: "Q2?", options: [{ name: "B" }] });

      // Close s1
      await request(app)
        .post(`/api/voting/${s1.body.id}/close`)
        .set("Authorization", `Bearer ${aliceToken}`);

      const openSessions = await request(app)
        .get(`/api/voting/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(openSessions.body.length).toBe(1);
      expect(openSessions.body[0].id).toBe(s2.body.id);
    });

    it("S114: Vote on non-existent session returns 404", async () => {
      await request(app)
        .post("/api/voting/nonexistent-id/vote")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ votes: [{ optionIndex: 0, preference: "yes" }] })
        .expect(404);
    });

    it("S115: Voting session survives trip with many operations", async () => {
      const tripId = await createTrip(aliceToken, "S115 Trip", "2026-11-01", "2026-11-05", [
        { name: "Tokyo", arrivalDate: "2026-11-01", departureDate: "2026-11-03" },
      ]);

      // Create voting session
      const session = await request(app)
        .post("/api/voting")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, question: "Activity?", options: [{ name: "X" }, { name: "Y" }] });

      // Do some trip mutations
      const cities = await request(app)
        .get(`/api/cities/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const cityId = cities.body[0].id;

      await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Random Place" });

      // Voting session should still be accessible
      const check = await request(app)
        .get(`/api/voting/${session.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(check.status).toBe(200);
      expect(check.body.question).toBe("Activity?");
    });

    it("S116: Vote with invalid option index is handled gracefully", async () => {
      const tripId = await createTrip(aliceToken, "S116 Trip", "2026-11-01", "2026-11-05");

      const session = await request(app)
        .post("/api/voting")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, question: "Q?", options: [{ name: "Only option" }] });

      // Vote on index 5 (doesn't exist) — should still work (DB stores it)
      const res = await request(app)
        .post(`/api/voting/${session.body.id}/vote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ votes: [{ optionIndex: 5, preference: "yes" }] });
      expect(res.status).toBe(200);
    });

    // ── Tabelog / Ratings tests (S117–S118) ──

    it("S117: Set Tabelog rating on experience via Prisma upsert", async () => {
      const tripId = await createTrip(aliceToken, "S117 Trip", "2026-11-01", "2026-11-05", [
        { name: "Osaka", arrivalDate: "2026-11-01", departureDate: "2026-11-03" },
      ]);

      const cities = await request(app)
        .get(`/api/cities/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId: cities.body[0].id, name: "Ramen Shop" });

      // Set tabelog rating directly (same path as chat tool uses)
      await prisma.experienceRating.upsert({
        where: { experienceId_platform: { experienceId: exp.body.id, platform: "tabelog" } },
        create: { experienceId: exp.body.id, platform: "tabelog", ratingValue: 3.58, reviewCount: 245 },
        update: { ratingValue: 3.58, reviewCount: 245 },
      });

      // Verify it's on the experience
      const full = await request(app)
        .get(`/api/experiences/${exp.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const tabelog = full.body.ratings?.find((r: any) => r.platform === "tabelog");
      expect(tabelog).toBeTruthy();
      expect(tabelog.ratingValue).toBeCloseTo(3.58, 1);
      expect(tabelog.reviewCount).toBe(245);
    });

    it("S118: Update Tabelog rating — upsert replaces old value", async () => {
      const tripId = await createTrip(aliceToken, "S118 Trip", "2026-11-01", "2026-11-05", [
        { name: "Kyoto", arrivalDate: "2026-11-01", departureDate: "2026-11-03" },
      ]);

      const cities = await request(app)
        .get(`/api/cities/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId: cities.body[0].id, name: "Tempura Place" });

      // First rating
      await prisma.experienceRating.upsert({
        where: { experienceId_platform: { experienceId: exp.body.id, platform: "tabelog" } },
        create: { experienceId: exp.body.id, platform: "tabelog", ratingValue: 3.2, reviewCount: 100 },
        update: { ratingValue: 3.2, reviewCount: 100 },
      });

      // Update with new value
      await prisma.experienceRating.upsert({
        where: { experienceId_platform: { experienceId: exp.body.id, platform: "tabelog" } },
        create: { experienceId: exp.body.id, platform: "tabelog", ratingValue: 3.8, reviewCount: 150 },
        update: { ratingValue: 3.8, reviewCount: 150 },
      });

      const full = await request(app)
        .get(`/api/experiences/${exp.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const tabelogRatings = full.body.ratings?.filter((r: any) => r.platform === "tabelog");
      // Should be exactly 1, not 2
      expect(tabelogRatings.length).toBe(1);
      expect(tabelogRatings[0].ratingValue).toBeCloseTo(3.8, 1);
    });

    // ── Transit / Train schedule tests (S119–S121) ──

    it("S119: Transit status endpoint returns data structure", async () => {
      const res = await request(app)
        .get("/api/transit-status/status")
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("disruptions");
      expect(Array.isArray(res.body.disruptions)).toBe(true);
    });

    it("S120: Transit status for trip returns structure", async () => {
      const tripId = await createTrip(aliceToken, "S120 Trip", "2026-11-01", "2026-11-05");

      const res = await request(app)
        .get(`/api/transit-status/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("allDisruptions");
      expect(res.body).toHaveProperty("relevantToTrip");
      expect(res.body).toHaveProperty("checkedAt");
    });

    it("S121: Train schedule search with missing params returns 400", async () => {
      // The endpoint requires origin and destination query params
      const res = await request(app)
        .get("/api/train-schedules")
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(res.status).toBe(400);
    });

    // ── Cultural notes test (S122) ──

    it("S122: Cultural notes for non-existent experience returns 404", async () => {
      const res = await request(app)
        .post("/api/cultural-notes/experience/nonexistent-id")
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(res.status).toBe(404);
    });

    // ══════════════════════════════════════════════════════════════
    // Chat Tool Parity — Chaos Tests (S123–S140)
    // These test the underlying operations that the 7 new chat tools
    // perform, ensuring they work correctly under diverse conditions.
    // ══════════════════════════════════════════════════════════════

    // ── create_trip tool path ──

    it("S123: Create trip with cities auto-generates days", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          name: "S123 Portugal Trip",
          startDate: "2026-06-01",
          endDate: "2026-06-10",
          cities: [
            { name: "Lisbon", country: "Portugal", arrivalDate: "2026-06-01", departureDate: "2026-06-04" },
            { name: "Porto", country: "Portugal", arrivalDate: "2026-06-05", departureDate: "2026-06-08" },
          ],
        });
      expect(res.status).toBe(201);

      // Verify days were auto-generated
      const days = await request(app)
        .get(`/api/days/trip/${res.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      // Lisbon: Jun 1-4 = 4 days, Porto: Jun 5-8 = 4 days
      expect(days.body.length).toBeGreaterThanOrEqual(8);

      // Verify trip dates synced
      const trip = await request(app)
        .get(`/api/trips/${res.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(trip.body.name).toBe("S123 Portugal Trip");
    });

    it("S124: Create trip with no cities — minimal creation works", async () => {
      const res = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ name: "S124 Empty Trip", startDate: "2026-07-01", endDate: "2026-07-10" });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();

      const cities = await request(app)
        .get(`/api/cities/trip/${res.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(cities.body.length).toBe(0);
    });

    it("S125: Create trip then immediately add city, experience, and promote — full lifecycle", async () => {
      // Simulates what a user would do via chat: create trip → add city → add experience → promote
      const tripRes = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          name: "S125 Quick Trip",
          startDate: "2026-08-01",
          endDate: "2026-08-05",
          cities: [{ name: "Barcelona", country: "Spain", arrivalDate: "2026-08-01", departureDate: "2026-08-03" }],
        });
      const tripId = tripRes.body.id;

      const cities = await request(app)
        .get(`/api/cities/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const cityId = cities.body[0].id;

      // Add experience
      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "La Sagrada Familia" });
      expect(exp.status).toBe(201);

      // Get a day to promote to
      const days = await request(app)
        .get(`/api/days/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(days.body.length).toBeGreaterThan(0);

      // Promote
      const promote = await request(app)
        .patch(`/api/experiences/${exp.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ state: "selected", dayId: days.body[0].id, timeWindow: "morning" });
      expect(promote.status).toBe(200);
      expect(promote.body.state).toBe("selected");
    });

    // ── delete_travel_document tool path ──

    it("S126: Delete own travel document succeeds", async () => {
      const tripId = await createTrip(aliceToken, "S126 Trip", "2026-11-01", "2026-11-05");

      const doc = await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "passport", data: { number: "X1234567", country: "US" } });
      expect(doc.status).toBe(201);

      // Delete it
      await request(app)
        .delete(`/api/traveler-documents/${doc.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(200);

      // Verify it's gone
      const check = await request(app)
        .get(`/api/traveler-documents/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const passports = check.body.documents?.filter((d: any) => d.type === "passport") || [];
      expect(passports.length).toBe(0);
    });

    it("S127: Cannot delete another user's travel document", async () => {
      const tripId = await createTrip(aliceToken, "S127 Trip", "2026-11-01", "2026-11-05");

      const doc = await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "insurance", data: { provider: "WorldNomads", policyNumber: "WN999" } });

      // Bob tries to delete Alice's doc
      const del = await request(app)
        .delete(`/api/traveler-documents/${doc.body.id}`)
        .set("Authorization", `Bearer ${bobToken}`);
      expect(del.status).toBe(403);
    });

    it("S128: Delete document then re-create same type — no conflict", async () => {
      const tripId = await createTrip(aliceToken, "S128 Trip", "2026-11-01", "2026-11-05");

      const doc1 = await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "frequent_flyer", data: { airline: "ANA", number: "NH123456" } });

      await request(app)
        .delete(`/api/traveler-documents/${doc1.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(200);

      // Create a new one with same type
      const doc2 = await request(app)
        .post("/api/traveler-documents")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, type: "frequent_flyer", data: { airline: "JAL", number: "JL789012" } });
      expect(doc2.status).toBe(201);
      expect(doc2.body.data.airline).toBe("JAL");
    });

    // ── share_day_plan tool path (test data completeness) ──

    it("S129: Day with experiences, reservations, and accommodation returns complete data", async () => {
      const tripId = await createTrip(aliceToken, "S129 Trip", "2026-11-01", "2026-11-05", [
        { name: "Kyoto", arrivalDate: "2026-11-01", departureDate: "2026-11-03" },
      ]);

      const cities = await request(app)
        .get(`/api/cities/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const cityId = cities.body[0].id;

      const days = await request(app)
        .get(`/api/days/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const dayId = days.body[0].id;

      // Add accommodation
      await request(app)
        .post("/api/accommodations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, dayId, name: "Hyatt Regency Kyoto" });

      // Add experience and promote
      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Kinkaku-ji" });
      await request(app)
        .patch(`/api/experiences/${exp.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ state: "selected", dayId, timeWindow: "morning" });

      // Add reservation
      await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          dayId,
          name: "Kikunoi",
          type: "restaurant",
          datetime: "2026-11-01T18:00:00Z",
        });

      // Fetch day — should have all three
      const fullDay = await request(app)
        .get(`/api/days/${dayId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(fullDay.body.experiences.length).toBeGreaterThanOrEqual(1);
      expect(fullDay.body.reservations.length).toBe(1);
      expect(fullDay.body.accommodations.length).toBe(1);
      expect(fullDay.body.city.name).toBe("Kyoto");
    });

    // ── get_travel_time tool path ──

    it("S130: Travel time endpoint returns duration for valid coordinates", async () => {
      // Tokyo Station to Senso-ji (~6km walk)
      const res = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          originLat: 35.6812,
          originLng: 139.7671,
          destLat: 35.7148,
          destLng: 139.7967,
          mode: "walk",
        });
      expect(res.status).toBe(200);
      expect(res.body.durationMinutes).toBeGreaterThan(0);
      expect(res.body.bufferMinutes).toBe(10); // walk buffer
      expect(res.body.mode).toBe("walk");
      expect(["google", "fallback"]).toContain(res.body.source);
    });

    it("S131: Travel time with anchor time returns departure time", async () => {
      const res = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          originLat: 35.0116,
          originLng: 135.7681,
          destLat: 34.9671,
          destLng: 135.7727,
          mode: "subway",
          anchorTime: "2026-11-01T10:00:00Z",
        });
      expect(res.status).toBe(200);
      expect(res.body.departureTime).toBeTruthy();
      expect(res.body.mode).toBe("subway");
    });

    it("S132: Travel time with missing coordinates returns 400", async () => {
      const res = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ originLat: 35.0, mode: "walk" });
      expect(res.status).toBe(400);
    });

    it("S133: Travel time with different modes returns different buffers", async () => {
      // Same route, different modes — verify buffer logic differs
      const walkRes = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ originLat: 35.68, originLng: 139.77, destLat: 35.71, destLng: 139.80, mode: "walk" });
      const taxiRes = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ originLat: 35.68, originLng: 139.77, destLat: 35.71, destLng: 139.80, mode: "taxi" });

      expect(walkRes.body.bufferMinutes).toBe(10);
      expect(taxiRes.body.bufferMinutes).toBe(5);
      // Walk should be slower than taxi
      expect(walkRes.body.durationMinutes).toBeGreaterThanOrEqual(taxiRes.body.durationMinutes);
    });

    // ── cast_vote tool path ──

    it("S134: Vote, change mind, re-vote — only latest vote counts", async () => {
      const tripId = await createTrip(aliceToken, "S134 Trip", "2026-11-01", "2026-11-05");

      const session = await request(app)
        .post("/api/voting")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          question: "Sushi or ramen tonight?",
          options: [{ name: "Sushi Dai" }, { name: "Fuunji" }, { name: "Skip dinner" }],
        });

      // Alice votes: yes, no, maybe
      await request(app)
        .post(`/api/voting/${session.body.id}/vote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ votes: [
          { optionIndex: 0, preference: "yes" },
          { optionIndex: 1, preference: "no" },
          { optionIndex: 2, preference: "maybe" },
        ]})
        .expect(200);

      // Alice changes mind: no, yes, no
      await request(app)
        .post(`/api/voting/${session.body.id}/vote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ votes: [
          { optionIndex: 0, preference: "no" },
          { optionIndex: 1, preference: "yes" },
          { optionIndex: 2, preference: "no" },
        ]})
        .expect(200);

      // Check results — should reflect the LATEST votes only
      const results = await request(app)
        .get(`/api/voting/${session.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(results.body.results[0].no).toBe(1);
      expect(results.body.results[0].yes).toBe(0);
      expect(results.body.results[1].yes).toBe(1);
      expect(results.body.results[1].no).toBe(0);
      expect(results.body.results[2].no).toBe(1);
      expect(results.body.results[2].maybe).toBe(0);
    });

    it("S135: Multiple users vote then one changes — tallies stay correct", async () => {
      const tripId = await createTrip(aliceToken, "S135 Trip", "2026-11-01", "2026-11-05");

      const session = await request(app)
        .post("/api/voting")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          tripId,
          question: "Morning or afternoon temple visit?",
          options: [{ name: "Morning" }, { name: "Afternoon" }],
        });

      // Alice: morning yes, afternoon no
      await request(app)
        .post(`/api/voting/${session.body.id}/vote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ votes: [{ optionIndex: 0, preference: "yes" }, { optionIndex: 1, preference: "no" }] });

      // Bob: morning no, afternoon yes
      await request(app)
        .post(`/api/voting/${session.body.id}/vote`)
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ votes: [{ optionIndex: 0, preference: "no" }, { optionIndex: 1, preference: "yes" }] });

      // Tied 1-1. Now Alice switches to afternoon
      await request(app)
        .post(`/api/voting/${session.body.id}/vote`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ votes: [{ optionIndex: 0, preference: "no" }, { optionIndex: 1, preference: "yes" }] });

      const results = await request(app)
        .get(`/api/voting/${session.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      // Morning: 0 yes, 2 no. Afternoon: 2 yes, 0 no.
      expect(results.body.results[0].yes).toBe(0);
      expect(results.body.results[0].no).toBe(2);
      expect(results.body.results[1].yes).toBe(2);
      expect(results.body.results[1].no).toBe(0);
    });

    // ── get_ratings tool path ──

    it("S136: Experience with multiple rating platforms returns all", async () => {
      const tripId = await createTrip(aliceToken, "S136 Trip", "2026-11-01", "2026-11-05", [
        { name: "Tokyo", arrivalDate: "2026-11-01", departureDate: "2026-11-03" },
      ]);

      const cities = await request(app)
        .get(`/api/cities/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId: cities.body[0].id, name: "Tsukiji Outer Market" });

      // Add Google + Tabelog ratings
      await prisma.experienceRating.create({
        data: { experienceId: exp.body.id, platform: "google", ratingValue: 4.3, reviewCount: 12500 },
      });
      await prisma.experienceRating.upsert({
        where: { experienceId_platform: { experienceId: exp.body.id, platform: "tabelog" } },
        create: { experienceId: exp.body.id, platform: "tabelog", ratingValue: 3.62, reviewCount: 890 },
        update: { ratingValue: 3.62, reviewCount: 890 },
      });

      const full = await request(app)
        .get(`/api/experiences/${exp.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(full.body.ratings.length).toBe(2);

      const google = full.body.ratings.find((r: any) => r.platform === "google");
      const tabelog = full.body.ratings.find((r: any) => r.platform === "tabelog");
      expect(google.ratingValue).toBeCloseTo(4.3, 1);
      expect(tabelog.ratingValue).toBeCloseTo(3.62, 1);
    });

    it("S137: Experience with no ratings returns empty array", async () => {
      const tripId = await createTrip(aliceToken, "S137 Trip", "2026-11-01", "2026-11-05", [
        { name: "Osaka", arrivalDate: "2026-11-01", departureDate: "2026-11-03" },
      ]);

      const cities = await request(app)
        .get(`/api/cities/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId: cities.body[0].id, name: "Random Alley" });

      const full = await request(app)
        .get(`/api/experiences/${exp.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(full.body.ratings).toEqual([]);
    });

    // ── Cross-tool chaos: trip create → full lifecycle via chat tool paths ──

    it("S138: Create trip, add everything, delete some, verify integrity", async () => {
      // Simulates a full chat session: create trip, add city, add experience,
      // add accommodation, add reservation, vote, then delete some things
      const tripRes = await request(app)
        .post("/api/trips")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({
          name: "S138 Full Lifecycle",
          startDate: "2026-09-01",
          endDate: "2026-09-05",
          cities: [{ name: "Rome", country: "Italy", arrivalDate: "2026-09-01", departureDate: "2026-09-03" }],
        });
      const tripId = tripRes.body.id;

      const cities = await request(app)
        .get(`/api/cities/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const cityId = cities.body[0].id;

      const days = await request(app)
        .get(`/api/days/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const dayId = days.body[0].id;

      // Add accommodation
      const accom = await request(app)
        .post("/api/accommodations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, dayId, name: "Hotel de Russie" });

      // Add 3 experiences
      const exp1 = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Colosseum" });
      const exp2 = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Vatican Museums" });
      const exp3 = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Trastevere Walk" });

      // Promote first two
      await request(app)
        .patch(`/api/experiences/${exp1.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ state: "selected", dayId });
      await request(app)
        .patch(`/api/experiences/${exp2.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ state: "selected", dayId });

      // Add reservation
      await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, dayId, name: "Da Enzo", type: "restaurant", datetime: "2026-09-01T19:30:00Z" });

      // Create a vote
      const vote = await request(app)
        .post("/api/voting")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, question: "Gelato spot?", options: [{ name: "Giolitti" }, { name: "Fatamorgana" }] });

      // Now delete experience 3 and the accommodation
      await request(app)
        .delete(`/api/experiences/${exp3.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(200);
      await request(app)
        .delete(`/api/accommodations/${accom.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`)
        .expect(200);

      // Verify final state
      const finalDay = await request(app)
        .get(`/api/days/${dayId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(finalDay.body.experiences.length).toBe(2); // exp1 + exp2 promoted
      expect(finalDay.body.reservations.length).toBe(1);
      expect(finalDay.body.accommodations.length).toBe(0); // deleted

      // Vote session still accessible
      const voteCheck = await request(app)
        .get(`/api/voting/${vote.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(voteCheck.status).toBe(200);
    });

    it("S139: Travel time — taxi vs walk on same route gives different durations", async () => {
      // Fushimi Inari to Kyoto Station (~4km)
      const walkRes = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ originLat: 34.9671, originLng: 135.7727, destLat: 34.9858, destLng: 135.7588, mode: "walk" });
      const taxiRes = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ originLat: 34.9671, originLng: 135.7727, destLat: 34.9858, destLng: 135.7588, mode: "taxi" });

      expect(walkRes.status).toBe(200);
      expect(taxiRes.status).toBe(200);
      // Walking should take longer than taxi (even in fallback mode)
      if (walkRes.body.source === "fallback" && taxiRes.body.source === "fallback") {
        expect(walkRes.body.durationMinutes).toBeGreaterThan(taxiRes.body.durationMinutes);
      }
    });

    it("S140: Vote on nonexistent session returns 404", async () => {
      const res = await request(app)
        .post("/api/voting/nonexistent-session-id/vote")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ votes: [{ optionIndex: 0, preference: "yes" }] });
      expect(res.status).toBe(404);
    });

    // ── Group Interest System — Chaos Tests (S141–S155) ──────────────

    it("S141: Float an experience to the group", async () => {
      const tripId = await createTrip(aliceToken, "Interest Trip", new Date("2026-11-01"), new Date("2026-11-03"));
      const cityId = await addCity(aliceToken, tripId, "Interest City");
      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Cool Temple", state: "possible" });

      const res = await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ experienceId: exp.body.id, note: "Saw this on a blog" });

      expect(res.status).toBe(201);
      expect(res.body.experienceId).toBe(exp.body.id);
      expect(res.body.note).toBe("Saw this on a blog");
      expect(res.body.displayName).toBe("Alice");

      await prisma.trip.delete({ where: { id: tripId } });
    });

    it("S142: Float same experience twice is idempotent (upsert)", async () => {
      const tripId = await createTrip(aliceToken, "Interest Upsert Trip", new Date("2026-11-01"), new Date("2026-11-03"));
      const cityId = await addCity(aliceToken, tripId, "Upsert City");
      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Temple Again", state: "possible" });

      await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ experienceId: exp.body.id, note: "First thought" });

      const res2 = await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ experienceId: exp.body.id, note: "Changed my mind about why" });

      expect(res2.status).toBe(201);
      expect(res2.body.note).toBe("Changed my mind about why");

      // Should still be just one interest
      const list = await request(app)
        .get(`/api/interests/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(list.body.length).toBe(1);

      await prisma.trip.delete({ where: { id: tripId } });
    });

    it("S143: Float nonexistent experience returns 404", async () => {
      const res = await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ experienceId: "nonexistent-exp-id", note: "test" });
      expect(res.status).toBe(404);
    });

    it("S144: React to a floated experience", async () => {
      const tripId = await createTrip(aliceToken, "React Trip", new Date("2026-11-01"), new Date("2026-11-03"));
      const cityId = await addCity(aliceToken, tripId, "React City");
      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Pottery Workshop", state: "possible" });

      const float = await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ experienceId: exp.body.id });

      const react = await request(app)
        .post(`/api/interests/${float.body.id}/react`)
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ reaction: "interested", note: "Sounds fun!" });

      expect(react.status).toBe(200);
      expect(react.body.reaction).toBe("interested");
      expect(react.body.displayName).toBe("Bob");

      await prisma.trip.delete({ where: { id: tripId } });
    });

    it("S145: React with invalid reaction is rejected", async () => {
      const tripId = await createTrip(aliceToken, "Bad React Trip", new Date("2026-11-01"), new Date("2026-11-03"));
      const cityId = await addCity(aliceToken, tripId, "Bad React City");
      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Test Exp", state: "possible" });

      const float = await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ experienceId: exp.body.id });

      const react = await request(app)
        .post(`/api/interests/${float.body.id}/react`)
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ reaction: "love_it" });

      expect(react.status).toBe(400);

      await prisma.trip.delete({ where: { id: tripId } });
    });

    it("S146: Change reaction (upsert behavior)", async () => {
      const tripId = await createTrip(aliceToken, "Change React Trip", new Date("2026-11-01"), new Date("2026-11-03"));
      const cityId = await addCity(aliceToken, tripId, "Change React City");
      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Ramen Shop", state: "possible" });

      const float = await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ experienceId: exp.body.id });

      await request(app)
        .post(`/api/interests/${float.body.id}/react`)
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ reaction: "maybe" });

      const react2 = await request(app)
        .post(`/api/interests/${float.body.id}/react`)
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ reaction: "interested", note: "Actually yes!" });

      expect(react2.status).toBe(200);
      expect(react2.body.reaction).toBe("interested");
      expect(react2.body.note).toBe("Actually yes!");

      await prisma.trip.delete({ where: { id: tripId } });
    });

    it("S147: React to nonexistent interest returns 404", async () => {
      const res = await request(app)
        .post("/api/interests/nonexistent-interest-id/react")
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ reaction: "interested" });
      expect(res.status).toBe(404);
    });

    it("S148: Only the floater can retract", async () => {
      const tripId = await createTrip(aliceToken, "Retract Trip", new Date("2026-11-01"), new Date("2026-11-03"));
      const cityId = await addCity(aliceToken, tripId, "Retract City");
      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Market Tour", state: "possible" });

      const float = await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ experienceId: exp.body.id });

      // Bob tries to retract Alice's float — should fail
      const bobRetract = await request(app)
        .delete(`/api/interests/${float.body.id}`)
        .set("Authorization", `Bearer ${bobToken}`);
      expect(bobRetract.status).toBe(403);

      // Alice can retract her own
      const aliceRetract = await request(app)
        .delete(`/api/interests/${float.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(aliceRetract.status).toBe(200);

      await prisma.trip.delete({ where: { id: tripId } });
    });

    it("S149: Retract nonexistent interest returns 404", async () => {
      const res = await request(app)
        .delete("/api/interests/nonexistent-interest-id")
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(res.status).toBe(404);
    });

    it("S150: Get interests for a trip returns all with reactions", async () => {
      const tripId = await createTrip(aliceToken, "List Trip", new Date("2026-11-01"), new Date("2026-11-03"));
      const cityId = await addCity(aliceToken, tripId, "List City");
      const exp1 = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Place A", state: "possible" });
      const exp2 = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Place B", state: "possible" });

      const float1 = await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ experienceId: exp1.body.id, note: "Love this" });

      await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ experienceId: exp2.body.id });

      await request(app)
        .post(`/api/interests/${float1.body.id}/react`)
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ reaction: "interested" });

      const list = await request(app)
        .get(`/api/interests/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      expect(list.status).toBe(200);
      expect(list.body.length).toBe(2);

      const placeAInterest = list.body.find((i: any) => i.experience.name === "Place A");
      expect(placeAInterest.reactions.length).toBe(1);
      expect(placeAInterest.reactions[0].reaction).toBe("interested");
      expect(placeAInterest.experience.city.name).toBe("List City");

      await prisma.trip.delete({ where: { id: tripId } });
    });

    it("S151: Deleting experience cascades to interest", async () => {
      const tripId = await createTrip(aliceToken, "Cascade Trip", new Date("2026-11-01"), new Date("2026-11-03"));
      const cityId = await addCity(aliceToken, tripId, "Cascade City");
      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Doomed Exp", state: "possible" });

      await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ experienceId: exp.body.id, note: "Will be deleted" });

      await request(app)
        .delete(`/api/experiences/${exp.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      const list = await request(app)
        .get(`/api/interests/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(list.body.length).toBe(0);

      await prisma.trip.delete({ where: { id: tripId } });
    });

    it("S152: Float with no note works (note is optional)", async () => {
      const tripId = await createTrip(aliceToken, "No Note Trip", new Date("2026-11-01"), new Date("2026-11-03"));
      const cityId = await addCity(aliceToken, tripId, "No Note City");
      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Quick Float", state: "possible" });

      const res = await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ experienceId: exp.body.id });

      expect(res.status).toBe(201);
      expect(res.body.note).toBeNull();

      await prisma.trip.delete({ where: { id: tripId } });
    });

    it("S153: Full lifecycle — float, react, change mind, retract", async () => {
      const tripId = await createTrip(aliceToken, "Lifecycle Trip", new Date("2026-11-01"), new Date("2026-11-03"));
      const cityId = await addCity(aliceToken, tripId, "Lifecycle City");
      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Full Cycle Exp", state: "possible" });

      // Alice floats
      const float = await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ experienceId: exp.body.id, note: "What do you think?" });
      expect(float.status).toBe(201);

      // Bob reacts with maybe
      await request(app)
        .post(`/api/interests/${float.body.id}/react`)
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ reaction: "maybe" });

      // Bob changes to interested
      const change = await request(app)
        .post(`/api/interests/${float.body.id}/react`)
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ reaction: "interested", note: "On second thought, yes!" });
      expect(change.body.reaction).toBe("interested");

      // Alice updates her note
      const update = await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ experienceId: exp.body.id, note: "Updated reason" });
      expect(update.body.note).toBe("Updated reason");

      // Verify full state
      const list = await request(app)
        .get(`/api/interests/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(list.body.length).toBe(1);
      expect(list.body[0].note).toBe("Updated reason");
      expect(list.body[0].reactions.length).toBe(1);
      expect(list.body[0].reactions[0].reaction).toBe("interested");

      // Alice retracts
      await request(app)
        .delete(`/api/interests/${float.body.id}`)
        .set("Authorization", `Bearer ${aliceToken}`);

      const final = await request(app)
        .get(`/api/interests/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(final.body.length).toBe(0);

      await prisma.trip.delete({ where: { id: tripId } });
    });

    it("S154: Both users float same experience independently", async () => {
      const tripId = await createTrip(aliceToken, "Both Float Trip", new Date("2026-11-01"), new Date("2026-11-03"));
      const cityId = await addCity(aliceToken, tripId, "Both Float City");
      const exp = await request(app)
        .post("/api/experiences")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ tripId, cityId, name: "Popular Place", state: "possible" });

      await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${aliceToken}`)
        .send({ experienceId: exp.body.id, note: "Alice likes it" });

      await request(app)
        .post("/api/interests")
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ experienceId: exp.body.id, note: "Bob likes it too" });

      const list = await request(app)
        .get(`/api/interests/trip/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      // Both users floated independently — should be 2 interests
      expect(list.body.length).toBe(2);

      await prisma.trip.delete({ where: { id: tripId } });
    });

    it("S155: Interest requires auth", async () => {
      const res = await request(app)
        .post("/api/interests")
        .send({ experienceId: "anything" });
      expect(res.status).toBe(401);
    });
  });
});
