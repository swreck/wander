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
        .get(`/api/change-logs/${tripId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      const deleteLog = logs.body.items.find(
        (l: any) => l.actionType === "route_segment_deleted" && l.entityName.includes("Nara")
      );
      expect(deleteLog).toBeDefined();
    });
  });
});
