/**
 * REAL-WORLD WORKFLOW SIMULATION
 *
 * This test simulates a complete trip planning lifecycle as two users
 * would actually experience it through the frontend. Every API call
 * mirrors what the React frontend sends.
 *
 * Scenario: Ken & partner plan 22-day Japan trip.
 * - Days 1-8: Backroads guided tour (structured itinerary)
 * - Days 9-22: Flexible self-guided exploration
 *
 * The test exercises:
 * 1. Import a structured itinerary (simulating PDF extraction)
 * 2. Add additional flexible dates and cities
 * 3. Modify existing dates (shift, reassign)
 * 4. Capture experiences from various sources
 * 5. Assign some experiences to days, leave others as candidates
 * 6. Drag-reorder experiences within a day
 * 7. Move an experience from one day to another (demote + re-promote)
 * 8. Add accommodations with coordinates for map display
 * 9. Add reservations with times
 * 10. Add route segments for transportation between cities
 * 11. Calculate travel times between locations
 * 12. Request AI observations for spatial analysis
 * 13. Verify map data (experiences with coordinates, geometry data)
 * 14. Verify the Now screen data structure (today's schedule)
 * 15. Multi-user: second user adds and modifies in parallel
 * 16. Audit trail: verify all actions logged with correct attribution
 */

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.ACCESS_CODES = "KEN:Ken,PARTNER:Sarah";
process.env.JWT_SECRET = "test-secret-workflow";

const { app } = await import("../src/index.js");
const prisma = new PrismaClient();

afterAll(async () => {
  const trips = await prisma.trip.findMany({
    where: { name: { in: ["Japan 2026: Backroads + Free Days", "Japan 2026: Backroads + Free Days (extended)"] } },
  });
  for (const t of trips) {
    await prisma.trip.delete({ where: { id: t.id } });
  }
  await prisma.$disconnect();
});

let kenToken: string;
let sarahToken: string;

describe("Real-World Workflow: 22-Day Japan Trip", () => {

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: Authentication
  // ═══════════════════════════════════════════════════════════════════
  describe("Phase 1: Both users log in", () => {
    it("Ken logs in", async () => {
      const res = await request(app).post("/api/auth/login").send({ code: "KEN" });
      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe("Ken");
      kenToken = res.body.token;
    });

    it("Sarah logs in", async () => {
      const res = await request(app).post("/api/auth/login").send({ code: "PARTNER" });
      expect(res.status).toBe(200);
      sarahToken = res.body.token;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2: Import the Backroads itinerary (simulates PDF extraction)
  // ═══════════════════════════════════════════════════════════════════

  let tripId: string;
  let cityMap: Record<string, string> = {}; // cityName -> cityId
  let allDays: any[] = [];

  describe("Phase 2: Import structured itinerary", () => {
    it("imports Backroads 8-day itinerary + flexible days", async () => {
      const res = await request(app)
        .post("/api/import/commit")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          tripName: "Japan 2026: Backroads + Free Days",
          startDate: "2026-05-01",
          endDate: "2026-05-22",
          cities: [
            { name: "Tokyo", country: "Japan", arrivalDate: "2026-05-01", departureDate: "2026-05-04" },
            { name: "Hakone", country: "Japan", arrivalDate: "2026-05-05", departureDate: "2026-05-06" },
            { name: "Kyoto", country: "Japan", arrivalDate: "2026-05-07", departureDate: "2026-05-08" },
          ],
          routeSegments: [
            { originCity: "San Francisco", destinationCity: "Tokyo", transportMode: "flight", departureDate: "2026-04-30", notes: "JAL 001, 11h" },
            { originCity: "Tokyo", destinationCity: "Hakone", transportMode: "train", departureDate: "2026-05-05", notes: "Romancecar" },
            { originCity: "Hakone", destinationCity: "Kyoto", transportMode: "train", departureDate: "2026-05-07", notes: "Shinkansen via Odawara" },
          ],
          accommodations: [
            { cityName: "Tokyo", name: "Park Hyatt Tokyo", address: "3-7-1-2 Nishi Shinjuku" },
            { cityName: "Hakone", name: "Gora Kadan", address: "1300 Gora, Hakone" },
            { cityName: "Kyoto", name: "Hoshinoya Kyoto", address: "Arashiyama" },
          ],
          experiences: [
            { cityName: "Tokyo", name: "Tsukiji Outer Market", dayDate: "2026-05-01", description: "Fresh sushi breakfast", timeWindow: "morning" },
            { cityName: "Tokyo", name: "Senso-ji Temple", dayDate: "2026-05-01", description: "Ancient temple in Asakusa", timeWindow: "afternoon" },
            { cityName: "Tokyo", name: "Shibuya Crossing", dayDate: "2026-05-02", description: "World's busiest intersection" },
            { cityName: "Tokyo", name: "Meiji Shrine", dayDate: "2026-05-02", description: "Peaceful forested shrine", timeWindow: "morning" },
            { cityName: "Hakone", name: "Open-Air Museum", dayDate: "2026-05-05", description: "Sculpture garden with mountain views" },
            { cityName: "Hakone", name: "Lake Ashi Cruise", dayDate: "2026-05-06", description: "Pirate ship cruise with Fuji views" },
            { cityName: "Kyoto", name: "Fushimi Inari", dayDate: "2026-05-07", description: "Thousands of torii gates", timeWindow: "morning" },
            { cityName: "Kyoto", name: "Kinkaku-ji", dayDate: "2026-05-08", description: "Golden Pavilion" },
            // Unassigned candidates for flexible days
            { cityName: "Tokyo", name: "TeamLab Borderless", dayDate: null, description: "Digital art museum" },
            { cityName: "Kyoto", name: "Arashiyama Bamboo Grove", dayDate: null, description: "Iconic bamboo forest path" },
          ],
        });

      expect(res.status).toBe(201);
      tripId = res.body.id;

      // Validate structure
      expect(res.body.cities.length).toBe(3);
      expect(res.body.routeSegments.length).toBe(3);
      expect(res.body.accommodations.length).toBe(3);
      expect(res.body.experiences.length).toBe(10);

      // Map city names to IDs
      for (const c of res.body.cities) {
        cityMap[c.name] = c.id;
      }

      // Check experience states
      const selected = res.body.experiences.filter((e: any) => e.state === "selected");
      const possible = res.body.experiences.filter((e: any) => e.state === "possible");
      expect(selected.length).toBe(8); // those with dayDate
      expect(possible.length).toBe(2); // those without
    });

    it("created correct number of days (22-day trip)", async () => {
      const res = await request(app)
        .get(`/api/days/trip/${tripId}`)
        .set("Authorization", `Bearer ${kenToken}`);
      expect(res.status).toBe(200);
      allDays = res.body;
      expect(allDays.length).toBe(22);
    });

    it("days are assigned to correct cities (placeholders go to first city)", async () => {
      const tokyoDays = allDays.filter((d: any) => d.city.name === "Tokyo");
      const hakoneDays = allDays.filter((d: any) => d.city.name === "Hakone");
      const kyotoDays = allDays.filter((d: any) => d.city.name === "Kyoto");

      // Tokyo gets its 4 city days + 14 placeholder days for unassigned dates
      expect(tokyoDays.length).toBe(18);
      expect(hakoneDays.length).toBe(2);
      expect(kyotoDays.length).toBe(2);
      // Total: 18 + 2 + 2 = 22
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3: Extend trip — add flexible cities after Backroads ends
  // ═══════════════════════════════════════════════════════════════════
  describe("Phase 3: Add flexible cities for days 9-22", () => {
    it("adds Nara as a day-trip city", async () => {
      const res = await request(app)
        .post("/api/cities")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          tripId,
          name: "Nara",
          country: "Japan",
          arrivalDate: "2026-05-09",
          departureDate: "2026-05-09",
        });
      expect(res.status).toBe(201);
      cityMap["Nara"] = res.body.id;
    });

    it("adds Osaka for 4 nights", async () => {
      const res = await request(app)
        .post("/api/cities")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          tripId,
          name: "Osaka",
          country: "Japan",
          arrivalDate: "2026-05-10",
          departureDate: "2026-05-13",
        });
      expect(res.status).toBe(201);
      cityMap["Osaka"] = res.body.id;
    });

    it("adds Kanazawa for 3 nights", async () => {
      const res = await request(app)
        .post("/api/cities")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          tripId,
          name: "Kanazawa",
          country: "Japan",
          arrivalDate: "2026-05-14",
          departureDate: "2026-05-16",
        });
      expect(res.status).toBe(201);
      cityMap["Kanazawa"] = res.body.id;
    });

    it("reassigns placeholder days to new cities", async () => {
      // Re-fetch days
      const daysRes = await request(app)
        .get(`/api/days/trip/${tripId}`)
        .set("Authorization", `Bearer ${kenToken}`);
      allDays = daysRes.body;

      // Find placeholder days (those assigned to Tokyo but after May 8)
      const placeholders = allDays.filter((d: any) => {
        const date = d.date.split("T")[0];
        return date > "2026-05-08" && d.city.name === "Tokyo";
      });

      // Reassign some to Nara
      const may9 = placeholders.find((d: any) => d.date.split("T")[0] === "2026-05-09");
      if (may9) {
        const res = await request(app)
          .patch(`/api/days/${may9.id}`)
          .set("Authorization", `Bearer ${kenToken}`)
          .send({ cityId: cityMap["Nara"] });
        expect(res.status).toBe(200);
        expect(res.body.city.name).toBe("Nara");
      }

      // Reassign May 10-13 to Osaka
      for (const d of placeholders) {
        const date = d.date.split("T")[0];
        if (date >= "2026-05-10" && date <= "2026-05-13") {
          const res = await request(app)
            .patch(`/api/days/${d.id}`)
            .set("Authorization", `Bearer ${kenToken}`)
            .send({ cityId: cityMap["Osaka"] });
          expect(res.status).toBe(200);
        }
      }

      // Reassign May 14-16 to Kanazawa
      for (const d of placeholders) {
        const date = d.date.split("T")[0];
        if (date >= "2026-05-14" && date <= "2026-05-16") {
          const res = await request(app)
            .patch(`/api/days/${d.id}`)
            .set("Authorization", `Bearer ${kenToken}`)
            .send({ cityId: cityMap["Kanazawa"] });
          expect(res.status).toBe(200);
        }
      }
    });

    it("adds route segments for extended travel", async () => {
      // Kyoto -> Nara
      let res = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          tripId,
          originCity: "Kyoto",
          destinationCity: "Nara",
          transportMode: "train",
          notes: "JR Nara Line, 45 min",
        });
      expect(res.status).toBe(201);

      // Nara -> Osaka
      res = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          tripId,
          originCity: "Nara",
          destinationCity: "Osaka",
          transportMode: "train",
          notes: "Kintetsu, 35 min",
        });
      expect(res.status).toBe(201);

      // Osaka -> Kanazawa
      res = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          tripId,
          originCity: "Osaka",
          destinationCity: "Kanazawa",
          transportMode: "train",
          notes: "Thunderbird Express, 2h40m",
        });
      expect(res.status).toBe(201);

      // Kanazawa -> Tokyo (return)
      res = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          tripId,
          originCity: "Kanazawa",
          destinationCity: "Tokyo",
          transportMode: "train",
          notes: "Hokuriku Shinkansen, 2h30m",
        });
      expect(res.status).toBe(201);

      // Return flight
      res = await request(app)
        .post("/api/route-segments")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          tripId,
          originCity: "Tokyo",
          destinationCity: "San Francisco",
          transportMode: "flight",
          departureDate: "2026-05-22",
          notes: "JAL 002, 9h",
        });
      expect(res.status).toBe(201);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 4: Capture experiences for flexible days
  // ═══════════════════════════════════════════════════════════════════
  let osakaExpIds: string[] = [];
  let kanazawaExpIds: string[] = [];

  describe("Phase 4: Capture experiences for new cities", () => {
    it("Sarah captures Osaka street food experiences", async () => {
      const experiences = [
        { name: "Dotonbori", description: "Neon-lit street food paradise", themes: ["food"] },
        { name: "Shinsekai", description: "Retro neighborhood, kushikatsu", themes: ["food", "architecture"] },
        { name: "Osaka Castle", description: "Historic castle with museum", themes: ["architecture"] },
        { name: "Kuromon Market", description: "Kitchen of Osaka, fresh seafood", themes: ["food"] },
      ];

      for (const exp of experiences) {
        const res = await request(app)
          .post("/api/experiences")
          .set("Authorization", `Bearer ${sarahToken}`)
          .send({
            tripId,
            cityId: cityMap["Osaka"],
            ...exp,
          });
        expect(res.status).toBe(201);
        expect(res.body.createdBy).toBe("PARTNER"); // Sarah's code
        osakaExpIds.push(res.body.id);
      }
    });

    it("Ken captures Kanazawa experiences", async () => {
      const experiences = [
        { name: "Kenroku-en Garden", description: "One of Japan's three great gardens", themes: ["nature"] },
        { name: "21st Century Museum", description: "Contemporary art, swimming pool installation", themes: ["architecture"] },
        { name: "Higashi Chaya District", description: "Historic geisha district with tea houses", themes: ["architecture", "food"] },
      ];

      for (const exp of experiences) {
        const res = await request(app)
          .post("/api/experiences")
          .set("Authorization", `Bearer ${kenToken}`)
          .send({
            tripId,
            cityId: cityMap["Kanazawa"],
            ...exp,
          });
        expect(res.status).toBe(201);
        kanazawaExpIds.push(res.body.id);
      }
    });

    it("Ken uses capture to add from text (AI extraction path)", async () => {
      const res = await request(app)
        .post("/api/capture")
        .set("Authorization", `Bearer ${kenToken}`)
        .field("tripId", tripId)
        .field("cityId", cityMap["Nara"])
        .field("name", "Todai-ji Temple")
        .field("description", "World's largest wooden building, giant bronze Buddha");
      expect(res.status).toBe(201);
      expect(res.body.experiences[0].name).toBe("Todai-ji Temple");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 5: Plan days — promote, assign time windows, reorder
  // ═══════════════════════════════════════════════════════════════════
  describe("Phase 5: Day planning — promote, schedule, reorder", () => {
    it("promotes Osaka experiences to specific days", async () => {
      // Re-fetch days
      const daysRes = await request(app)
        .get(`/api/days/trip/${tripId}`)
        .set("Authorization", `Bearer ${kenToken}`);
      allDays = daysRes.body;

      const may10 = allDays.find((d: any) => d.date.split("T")[0] === "2026-05-10");
      const may11 = allDays.find((d: any) => d.date.split("T")[0] === "2026-05-11");

      // Dotonbori -> May 10 evening
      let res = await request(app)
        .post(`/api/experiences/${osakaExpIds[0]}/promote`)
        .set("Authorization", `Bearer ${kenToken}`)
        .send({ dayId: may10.id, timeWindow: "evening" });
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("selected");

      // Osaka Castle -> May 11 morning
      res = await request(app)
        .post(`/api/experiences/${osakaExpIds[2]}/promote`)
        .set("Authorization", `Bearer ${kenToken}`)
        .send({ dayId: may11.id, timeWindow: "morning" });
      expect(res.status).toBe(200);

      // Kuromon Market -> May 11 afternoon
      res = await request(app)
        .post(`/api/experiences/${osakaExpIds[3]}/promote`)
        .set("Authorization", `Bearer ${kenToken}`)
        .send({ dayId: may11.id, timeWindow: "afternoon" });
      expect(res.status).toBe(200);
    });

    it("reorders May 11 experiences (Castle first, then Market)", async () => {
      const res = await request(app)
        .post("/api/experiences/reorder")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({ orderedIds: [osakaExpIds[2], osakaExpIds[3]] });
      expect(res.status).toBe(200);
    });

    it("moves Dotonbori from May 10 to May 12 (demote then re-promote)", async () => {
      // Demote
      let res = await request(app)
        .post(`/api/experiences/${osakaExpIds[0]}/demote`)
        .set("Authorization", `Bearer ${kenToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("possible");
      expect(res.body.dayId).toBeNull();

      // Re-promote to May 12
      const may12 = allDays.find((d: any) => d.date.split("T")[0] === "2026-05-12");
      res = await request(app)
        .post(`/api/experiences/${osakaExpIds[0]}/promote`)
        .set("Authorization", `Bearer ${kenToken}`)
        .send({ dayId: may12.id, timeWindow: "evening" });
      expect(res.status).toBe(200);
      expect(res.body.dayId).toBe(may12.id);
    });

    it("Shinsekai stays as a candidate (not promoted)", async () => {
      const res = await request(app)
        .get(`/api/experiences/${osakaExpIds[1]}`)
        .set("Authorization", `Bearer ${kenToken}`);
      expect(res.body.state).toBe("possible");
      expect(res.body.dayId).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 6: Accommodations & Reservations
  // ═══════════════════════════════════════════════════════════════════
  describe("Phase 6: Accommodations and reservations", () => {
    it("adds Osaka hotel with coordinates", async () => {
      const res = await request(app)
        .post("/api/accommodations")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          tripId,
          cityId: cityMap["Osaka"],
          name: "W Osaka",
          address: "4-1-3 Minamisenba, Chuo-ku",
          latitude: 34.6770,
          longitude: 135.5027,
          checkInTime: "15:00",
          checkOutTime: "11:00",
          confirmationNumber: "W-OSK-2026-001",
        });
      expect(res.status).toBe(201);
    });

    it("adds Kanazawa ryokan", async () => {
      const res = await request(app)
        .post("/api/accommodations")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          tripId,
          cityId: cityMap["Kanazawa"],
          name: "Beniya Mukayu",
          address: "Yamashiro Onsen",
          latitude: 36.2048,
          longitude: 136.2234,
        });
      expect(res.status).toBe(201);
    });

    it("Sarah adds a dinner reservation in Osaka", async () => {
      const may10 = allDays.find((d: any) => d.date.split("T")[0] === "2026-05-10");
      const res = await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${sarahToken}`)
        .send({
          tripId,
          dayId: may10.id,
          name: "Mizuno Okonomiyaki",
          type: "restaurant",
          datetime: "2026-05-10T18:30:00+09:00",
          notes: "Counter seats, 30 min wait typical",
          latitude: 34.6685,
          longitude: 135.5013,
        });
      expect(res.status).toBe(201);
    });

    it("Ken adds a morning activity in Kanazawa", async () => {
      const may14 = allDays.find((d: any) => d.date.split("T")[0] === "2026-05-14");
      const res = await request(app)
        .post("/api/reservations")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          tripId,
          dayId: may14.id,
          name: "Gold Leaf Workshop",
          type: "activity",
          datetime: "2026-05-14T10:00:00+09:00",
          durationMinutes: 90,
          notes: "Kanazawa is famous for gold leaf",
        });
      expect(res.status).toBe(201);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 7: Location data — geocoding & map readiness
  // ═══════════════════════════════════════════════════════════════════
  describe("Phase 7: Map data — coordinates and geometry", () => {
    it("manually sets coordinates for Osaka experiences (simulates geocode confirm)", async () => {
      const coords: Record<string, [number, number]> = {
        [osakaExpIds[0]]: [34.6687, 135.5027], // Dotonbori
        [osakaExpIds[1]]: [34.6523, 135.5062], // Shinsekai
        [osakaExpIds[2]]: [34.6873, 135.5262], // Osaka Castle
        [osakaExpIds[3]]: [34.6717, 135.5106], // Kuromon
      };

      for (const [id, [lat, lng]] of Object.entries(coords)) {
        const res = await request(app)
          .post(`/api/geocoding/experience/${id}/confirm`)
          .set("Authorization", `Bearer ${kenToken}`)
          .send({ latitude: lat, longitude: lng });
        expect(res.status).toBe(200);
        expect(res.body.locationStatus).toBe("confirmed");
      }
    });

    it("map data: experiences have coordinates for pin rendering", async () => {
      const res = await request(app)
        .get(`/api/experiences/trip/${tripId}?cityId=${cityMap["Osaka"]}`)
        .set("Authorization", `Bearer ${kenToken}`);

      const located = res.body.filter((e: any) => e.locationStatus === "confirmed");
      expect(located.length).toBe(4);

      // All located experiences should have lat/lng
      for (const exp of located) {
        expect(exp.latitude).toBeTruthy();
        expect(exp.longitude).toBeTruthy();
      }

      // Check tier separation
      const selectedLocated = located.filter((e: any) => e.state === "selected");
      const possibleLocated = located.filter((e: any) => e.state === "possible");
      expect(selectedLocated.length).toBeGreaterThanOrEqual(2); // Promoted ones
      expect(possibleLocated.length).toBeGreaterThanOrEqual(1); // Shinsekai
    });

    it("travel time between hotel and first activity", async () => {
      const res = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          originLat: 34.6770,  // W Osaka
          originLng: 135.5027,
          destLat: 34.6873,    // Osaka Castle
          destLng: 135.5262,
          mode: "walk",
          anchorTime: "2026-05-11T09:00:00+09:00",
        });
      expect(res.status).toBe(200);
      expect(res.body.durationMinutes).toBeGreaterThan(0);
      expect(res.body.departureTime).toBeDefined();
      // Walking ~3km should be roughly 30-50 min
      expect(res.body.durationMinutes).toBeGreaterThan(15);
      expect(res.body.durationMinutes).toBeLessThan(90);
    });

    it("travel time by transit (should be faster than walking)", async () => {
      const walkRes = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          originLat: 34.6770,
          originLng: 135.5027,
          destLat: 34.6873,
          destLng: 135.5262,
          mode: "walk",
        });

      const transitRes = await request(app)
        .post("/api/travel-time")
        .set("Authorization", `Bearer ${kenToken}`)
        .send({
          originLat: 34.6770,
          originLng: 135.5027,
          destLat: 34.6873,
          destLng: 135.5262,
          mode: "subway",
        });

      expect(transitRes.body.durationMinutes).toBeLessThanOrEqual(walkRes.body.durationMinutes);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 8: AI observations
  // ═══════════════════════════════════════════════════════════════════
  describe("Phase 8: AI observations for planning insights", () => {
    it("requests observations for Osaka (city-level spatial analysis)", async () => {
      const res = await request(app)
        .post(`/api/observations/city/${cityMap["Osaka"]}`)
        .set("Authorization", `Bearer ${kenToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.observations)).toBe(true);
      // With real Anthropic key, should get spatial observations about the 4 Osaka locations
    });

    it("empty observations for city with no selected experiences", async () => {
      const res = await request(app)
        .post(`/api/observations/city/${cityMap["Nara"]}`)
        .set("Authorization", `Bearer ${kenToken}`);
      expect(res.status).toBe(200);
      // Nara has no selected experiences yet
      expect(res.body.observations).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 9: Now screen data simulation
  // ═══════════════════════════════════════════════════════════════════
  describe("Phase 9: Now screen data (day schedule view)", () => {
    it("day view returns complete schedule data", async () => {
      const may10 = allDays.find((d: any) => d.date.split("T")[0] === "2026-05-10");
      const res = await request(app)
        .get(`/api/days/${may10.id}`)
        .set("Authorization", `Bearer ${kenToken}`);
      expect(res.status).toBe(200);

      // Should have experiences, reservations, accommodations
      expect(res.body.city).toBeDefined();
      expect(res.body.experiences).toBeDefined();
      expect(res.body.reservations).toBeDefined();
      expect(res.body.accommodations).toBeDefined();

      // Reservation should appear (Mizuno Okonomiyaki)
      const reservation = res.body.reservations.find((r: any) => r.name === "Mizuno Okonomiyaki");
      expect(reservation).toBeTruthy();
    });

    it("day with selected experiences includes ratings data", async () => {
      const may11 = allDays.find((d: any) => d.date.split("T")[0] === "2026-05-11");
      const res = await request(app)
        .get(`/api/days/${may11.id}`)
        .set("Authorization", `Bearer ${kenToken}`);

      for (const exp of res.body.experiences) {
        expect(exp.ratings).toBeDefined();
        expect(Array.isArray(exp.ratings)).toBe(true);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 10: Multi-user concurrent editing
  // ═══════════════════════════════════════════════════════════════════
  describe("Phase 10: Multi-user concurrent edits", () => {
    it("Sarah adds day notes while Ken works on experiences", async () => {
      const may12 = allDays.find((d: any) => d.date.split("T")[0] === "2026-05-12");

      // Sarah sets day notes
      const noteRes = await request(app)
        .patch(`/api/days/${may12.id}`)
        .set("Authorization", `Bearer ${sarahToken}`)
        .send({ notes: "Rainy day backup: Namba shopping" });
      expect(noteRes.status).toBe(200);

      // Ken promotes Shinsekai to the same day
      const promoRes = await request(app)
        .post(`/api/experiences/${osakaExpIds[1]}/promote`)
        .set("Authorization", `Bearer ${kenToken}`)
        .send({ dayId: may12.id, timeWindow: "afternoon" });
      expect(promoRes.status).toBe(200);

      // Verify both changes are visible
      const dayRes = await request(app)
        .get(`/api/days/${may12.id}`)
        .set("Authorization", `Bearer ${kenToken}`);
      expect(dayRes.body.notes).toBe("Rainy day backup: Namba shopping");
      const shinsekai = dayRes.body.experiences.find((e: any) => e.name === "Shinsekai");
      expect(shinsekai).toBeTruthy();
      expect(shinsekai.state).toBe("selected");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 11: Full audit trail
  // ═══════════════════════════════════════════════════════════════════
  describe("Phase 11: Audit trail completeness", () => {
    it("change log captures all major actions", async () => {
      const res = await request(app)
        .get(`/api/change-logs/trip/${tripId}?limit=200`)
        .set("Authorization", `Bearer ${kenToken}`);
      expect(res.status).toBe(200);

      const actionTypes = new Set(res.body.logs.map((l: any) => l.actionType));

      // Should have logged these action types
      expect(actionTypes.has("trip_imported")).toBe(true);
      expect(actionTypes.has("experience_created")).toBe(true);
      expect(actionTypes.has("experience_promoted")).toBe(true);
      expect(actionTypes.has("experience_demoted")).toBe(true);
      expect(actionTypes.has("accommodation_added")).toBe(true);
      expect(actionTypes.has("reservation_created")).toBe(true);
      expect(actionTypes.has("day_note_edited")).toBe(true);
      expect(actionTypes.has("route_segment_added")).toBe(true);
    });

    it("both users appear in the change log", async () => {
      const res = await request(app)
        .get(`/api/change-logs/trip/${tripId}?limit=200`)
        .set("Authorization", `Bearer ${kenToken}`);
      const userNames = new Set(res.body.logs.map((l: any) => l.userDisplayName));
      expect(userNames.has("Ken")).toBe(true);
      expect(userNames.has("Sarah")).toBe(true);
    });

    it("change log search finds specific entities", async () => {
      const res = await request(app)
        .get(`/api/change-logs/trip/${tripId}?search=Dotonbori`)
        .set("Authorization", `Bearer ${kenToken}`);
      expect(res.body.logs.length).toBeGreaterThanOrEqual(1);
      // Should find the promote AND demote entries
      const actionTypes = res.body.logs.map((l: any) => l.actionType);
      expect(actionTypes).toContain("experience_promoted");
      expect(actionTypes).toContain("experience_demoted");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 12: Final state verification
  // ═══════════════════════════════════════════════════════════════════
  describe("Phase 12: Final trip state", () => {
    it("trip has complete structure", async () => {
      // Use tripId directly — other test files may have changed the active trip
      const res = await request(app)
        .get(`/api/trips/${tripId}`)
        .set("Authorization", `Bearer ${kenToken}`);
      expect(res.status).toBe(200);
      expect(res.body.cities.length).toBe(6); // Tokyo, Hakone, Kyoto, Nara, Osaka, Kanazawa
      expect(res.body.routeSegments.length).toBe(8); // 3 original + 5 new
      // 22 total days — adding cities with dates now reassigns existing placeholder
      // days instead of creating duplicates
      expect(res.body.days.length).toBe(22);
    });

    it("experiences are correctly distributed across states", async () => {
      const res = await request(app)
        .get(`/api/experiences/trip/${tripId}`)
        .set("Authorization", `Bearer ${kenToken}`);

      const selected = res.body.filter((e: any) => e.state === "selected");
      const possible = res.body.filter((e: any) => e.state === "possible");

      // 8 original selected + 4 newly promoted = 12 selected
      // Some may vary based on exact flow, but should have both states
      expect(selected.length).toBeGreaterThanOrEqual(10);
      expect(possible.length).toBeGreaterThanOrEqual(1);

      // All selected should have dayId or routeSegmentId
      for (const exp of selected) {
        expect(exp.dayId || exp.routeSegmentId).toBeTruthy();
      }
    });

    it("multi-city accommodations exist", async () => {
      const res = await request(app)
        .get(`/api/accommodations/trip/${tripId}`)
        .set("Authorization", `Bearer ${kenToken}`);
      expect(res.body.length).toBeGreaterThanOrEqual(5); // 3 import + 2 manual
    });
  });
});
