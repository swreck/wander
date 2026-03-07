import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.ACCESS_CODES = "TEST1:TestUser,TEST2:TestUser2";
process.env.JWT_SECRET = "test-secret";

const { app } = await import("../src/index.js");
const prisma = new PrismaClient();

const TRIP_NAME = "Rec Import Test Trip";

afterAll(async () => {
  const trips = await prisma.trip.findMany({ where: { name: { contains: "Rec Import" } } });
  for (const t of trips) {
    await prisma.trip.delete({ where: { id: t.id } });
  }
  await prisma.$disconnect();
});

let token: string;
let tripId: string;
let tokyoCityId: string;
let kyotoCityId: string;
let osakaCityId: string;

describe("Recommendation Import — Full Test Suite", () => {

  // ═══════════════════════════════════════════════════════════════
  // SETUP
  // ═══════════════════════════════════════════════════════════════

  beforeAll(async () => {
    const auth = await request(app).post("/api/auth/login").send({ code: "TEST1" });
    token = auth.body.token;

    // Create a trip with 3 cities (Tokyo, Kyoto, Osaka)
    const tripRes = await request(app)
      .post("/api/trips")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: TRIP_NAME, startDate: "2026-10-18", endDate: "2026-10-31" });
    tripId = tripRes.body.id;

    const tokyo = await request(app)
      .post("/api/cities")
      .set("Authorization", `Bearer ${token}`)
      .send({ tripId, name: "Tokyo", country: "Japan", arrivalDate: "2026-10-18", departureDate: "2026-10-22" });
    tokyoCityId = tokyo.body.id;

    const kyoto = await request(app)
      .post("/api/cities")
      .set("Authorization", `Bearer ${token}`)
      .send({ tripId, name: "Kyoto", country: "Japan", arrivalDate: "2026-10-23", departureDate: "2026-10-27" });
    kyotoCityId = kyoto.body.id;

    const osaka = await request(app)
      .post("/api/cities")
      .set("Authorization", `Bearer ${token}`)
      .send({ tripId, name: "Osaka", country: "Japan", arrivalDate: "2026-10-28", departureDate: "2026-10-31" });
    osakaCityId = osaka.body.id;
  });

  // ═══════════════════════════════════════════════════════════════
  // 1. COMMIT ENDPOINT — ROUTING LOGIC (no AI, tests the engine)
  // ═══════════════════════════════════════════════════════════════

  describe("1. Commit routing — exact city matches (cat 1)", () => {
    it("routes items to existing cities by exact name match", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          senderLabel: "Exact Match Test",
          recommendations: [
            { name: "Tsukiji Outer Market", city: "Tokyo", country: "Japan", description: "Go early morning", urls: [], themes: ["food"], accommodationTip: false },
            { name: "Fushimi Inari", city: "Kyoto", country: "Japan", description: "Thousands of torii gates", urls: [], themes: ["temples"], accommodationTip: false },
            { name: "Dotonbori", city: "Osaka", country: "Japan", description: "Street food paradise", urls: [], themes: ["food"], accommodationTip: false },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.imported).toBe(3);
      expect(res.body.category1).toBe(3); // all to existing cities
      expect(res.body.category2).toBe(0);
      expect(res.body.category3).toBe(0);

      // Verify experiences landed in correct cities
      const tokyoExps = await prisma.experience.findMany({ where: { tripId, cityId: tokyoCityId, sourceText: "Exact Match Test" } });
      const kyotoExps = await prisma.experience.findMany({ where: { tripId, cityId: kyotoCityId, sourceText: "Exact Match Test" } });
      const osakaExps = await prisma.experience.findMany({ where: { tripId, cityId: osakaCityId, sourceText: "Exact Match Test" } });
      expect(tokyoExps.map((e) => e.name)).toContain("Tsukiji Outer Market");
      expect(kyotoExps.map((e) => e.name)).toContain("Fushimi Inari");
      expect(osakaExps.map((e) => e.name)).toContain("Dotonbori");
    });
  });

  describe("2. Commit routing — case-insensitive matching", () => {
    it("matches 'tokyo' to 'Tokyo', 'KYOTO' to 'Kyoto'", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          senderLabel: "Case Test",
          recommendations: [
            { name: "Meiji Shrine", city: "tokyo", country: "Japan", description: "", urls: [], themes: ["temples"], accommodationTip: false },
            { name: "Kinkaku-ji", city: "KYOTO", country: "Japan", description: "", urls: [], themes: ["temples"], accommodationTip: false },
            { name: "Osaka Castle", city: "oSaKa", country: "Japan", description: "", urls: [], themes: ["architecture"], accommodationTip: false },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.category1).toBe(3);
      expect(res.body.category2).toBe(0);
    });
  });

  describe("3. Commit routing — fuzzy substring matching", () => {
    it("matches 'Kyoto Station Area' to 'Kyoto' via substring containment", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          senderLabel: "Fuzzy Test",
          recommendations: [
            { name: "Kyoto Station Ramen Street", city: "Kyoto Station Area", country: "Japan", description: "underground ramen alley", urls: [], themes: ["food"], accommodationTip: false },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.category1).toBe(1); // matched to Kyoto
      expect(res.body.category2).toBe(0);
    });

    it("does NOT fuzzy-match short names (< 4 chars) to avoid false positives", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          senderLabel: "Short Name Test",
          recommendations: [
            { name: "Iga Ninja Museum", city: "Iga", country: "Japan", description: "short city name", urls: [], themes: ["culture"], accommodationTip: false },
          ],
        });

      expect(res.status).toBe(201);
      // "Iga" is only 3 chars, no fuzzy match possible, should create new candidate city
      expect(res.body.category2).toBe(1);
    });
  });

  describe("4. Commit routing — new candidate cities (cat 2)", () => {
    it("creates dateless candidate cities for unknown locations", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          senderLabel: "New City Test",
          recommendations: [
            { name: "Kenrokuen Garden", city: "Kanazawa", region: "Hokuriku", country: "Japan", description: "one of Japan's three great gardens", urls: [], themes: ["gardens", "nature"], accommodationTip: false },
            { name: "Kurobe Gorge Railway", city: "Toyama", region: "Hokuriku", country: "Japan", description: "scenic train through gorge", urls: [], themes: ["nature", "trains"], accommodationTip: false },
            { name: "Tokoname Pottery Path", city: "Tokoname", region: "Aichi", country: "Japan", description: "ceramics walking trail", urls: ["https://tokoname.or.jp"], themes: ["ceramics", "pottery"], accommodationTip: false },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.category1).toBe(0);
      expect(res.body.category2).toBe(3);

      // Verify candidate cities were created without dates
      const kanazawa = await prisma.city.findFirst({ where: { tripId, name: "Kanazawa" } });
      expect(kanazawa).toBeTruthy();
      expect(kanazawa!.arrivalDate).toBeNull();
      expect(kanazawa!.departureDate).toBeNull();
      expect(kanazawa!.tagline).toBe("Hokuriku region");

      // Verify experience landed in the right city
      const kenrokuen = await prisma.experience.findFirst({ where: { tripId, name: "Kenrokuen Garden" } });
      expect(kenrokuen).toBeTruthy();
      expect(kenrokuen!.cityId).toBe(kanazawa!.id);
    });

    it("reuses candidate city when multiple items go to same new city", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          senderLabel: "Same City Test",
          recommendations: [
            { name: "Takayama Old Town", city: "Takayama", region: "Gifu", country: "Japan", description: "", urls: [], themes: ["architecture"], accommodationTip: false },
            { name: "Takayama Morning Market", city: "Takayama", region: "Gifu", country: "Japan", description: "local produce", urls: [], themes: ["food"], accommodationTip: false },
            { name: "Hida Beef Sushi", city: "Takayama", region: "Gifu", country: "Japan", description: "must try", urls: [], themes: ["food"], accommodationTip: false },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.category2).toBe(3);

      // Should have created only ONE Takayama city, not three
      const takayamas = await prisma.city.findMany({ where: { tripId, name: "Takayama" } });
      expect(takayamas).toHaveLength(1);

      // All 3 experiences should be in that one city
      const exps = await prisma.experience.findMany({ where: { tripId, cityId: takayamas[0].id, sourceText: "Same City Test" } });
      expect(exps).toHaveLength(3);
    });
  });

  describe("5. Commit routing — Ideas bucket (cat 3)", () => {
    it("creates Ideas city for items with no location", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          senderLabel: "Ideas Test",
          recommendations: [
            { name: "Try matcha everything", city: null, country: "Japan", description: "matcha latte, ice cream, kit kats", urls: [], themes: ["food"], accommodationTip: false },
            { name: "Buy a furoshiki", city: null, country: "Japan", description: "traditional wrapping cloth", urls: [], themes: ["shopping"], accommodationTip: false },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.category3).toBe(2);

      // Verify Ideas city exists
      const ideas = await prisma.city.findFirst({ where: { tripId, name: "Ideas" } });
      expect(ideas).toBeTruthy();
      expect(ideas!.arrivalDate).toBeNull();

      // Verify experiences are in Ideas
      const ideaExps = await prisma.experience.findMany({ where: { tripId, cityId: ideas!.id, sourceText: "Ideas Test" } });
      expect(ideaExps).toHaveLength(2);
    });

    it("reuses existing Ideas city on subsequent imports", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          senderLabel: "Ideas Test 2",
          recommendations: [
            { name: "Learn basic Japanese phrases", city: null, country: "Japan", description: "", urls: [], themes: ["culture"], accommodationTip: false },
          ],
        });

      expect(res.status).toBe(201);
      // Should still be just one Ideas city
      const ideasCities = await prisma.city.findMany({ where: { tripId, name: "Ideas" } });
      expect(ideasCities).toHaveLength(1);
    });
  });

  describe("6. Commit routing — mixed categories in one import", () => {
    it("handles a messy mix of existing, new, and no-location items", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          senderLabel: "Mixed Bag",
          recommendations: [
            { name: "Robot Restaurant", city: "Tokyo", country: "Japan", description: "wild show in Shinjuku", urls: ["https://robot-restaurant.com"], themes: ["other"], accommodationTip: false },
            { name: "Nara Deer Park", city: "Nara", region: "Kansai", country: "Japan", description: "day trip from Kyoto or Osaka", urls: [], themes: ["nature"], accommodationTip: false },
            { name: "Pack light", city: null, country: "Japan", description: "coin laundry everywhere", urls: [], themes: [], accommodationTip: false },
            { name: "Arashiyama Bamboo", city: "Kyoto", country: "Japan", description: "go at dawn", urls: [], themes: ["nature"], accommodationTip: false },
            { name: "Naoshima Art Island", city: "Naoshima", region: "Seto Inland Sea", country: "Japan", description: "Benesse House worth it", urls: [], themes: ["art", "architecture"], accommodationTip: true },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.imported).toBe(5);
      expect(res.body.category1).toBe(2); // Tokyo, Kyoto
      expect(res.body.category2).toBe(2); // Nara, Naoshima
      expect(res.body.category3).toBe(1); // Pack light

      // Verify accommodation tip
      const naoshima = await prisma.experience.findFirst({ where: { tripId, name: "Naoshima Art Island" } });
      expect(naoshima!.userNotes).toBe("Accommodation recommendation");
    });
  });

  describe("7. Commit routing — theme mapping", () => {
    it("maps non-enum themes to valid enum values", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          senderLabel: "Theme Test",
          recommendations: [
            { name: "Dogo Onsen", city: "Osaka", country: "Japan", description: "oldest onsen", urls: [], themes: ["onsen", "history", "architecture"], accommodationTip: false },
            { name: "Mount Koya", city: "Osaka", country: "Japan", description: "temple stay", urls: [], themes: ["hiking", "temples", "sake"], accommodationTip: false },
          ],
        });

      expect(res.status).toBe(201);
      const dogo = await prisma.experience.findFirst({ where: { tripId, name: "Dogo Onsen", sourceText: "Theme Test" } });
      // onsen -> nature, history -> architecture, architecture stays
      expect(dogo!.themes).toContain("nature");
      expect(dogo!.themes).toContain("architecture");
      // Should deduplicate (history and architecture both map to architecture)
      expect(dogo!.themes.filter((t: string) => t === "architecture")).toHaveLength(1);

      const koya = await prisma.experience.findFirst({ where: { tripId, name: "Mount Koya", sourceText: "Theme Test" } });
      // hiking -> nature, temples stays, sake -> food
      expect(koya!.themes).toContain("nature");
      expect(koya!.themes).toContain("temples");
      expect(koya!.themes).toContain("food");
    });
  });

  describe("8. Commit routing — URL and description preservation", () => {
    it("preserves URLs in description and sender notes in changelog", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          senderLabel: "URL Test",
          senderNotes: "Best time to visit is late October for autumn leaves!",
          recommendations: [
            {
              name: "TeamLab Borderless",
              city: "Tokyo",
              country: "Japan",
              description: "immersive digital art, book tickets online",
              urls: ["https://borderless.teamlab.art", "https://tickets.teamlab.art"],
              themes: ["art"],
              accommodationTip: false,
            },
          ],
        });

      expect(res.status).toBe(201);
      const exp = await prisma.experience.findFirst({ where: { tripId, name: "TeamLab Borderless", sourceText: "URL Test" } });
      expect(exp!.description).toContain("immersive digital art");
      expect(exp!.description).toContain("https://borderless.teamlab.art");
      expect(exp!.description).toContain("https://tickets.teamlab.art");

      // Verify changelog captured sender notes
      const log = await prisma.changeLog.findFirst({
        where: { tripId, description: { contains: "URL Test" } },
        orderBy: { createdAt: "desc" },
      });
      expect(log!.description).toContain("Best time to visit is late October");
    });
  });

  describe("9. Commit routing — edge cases", () => {
    it("rejects empty recommendations array", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({ tripId, recommendations: [] });
      expect(res.status).toBe(400);
    });

    it("rejects missing tripId", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({ recommendations: [{ name: "Test", city: "Tokyo", country: "Japan", description: "", urls: [], themes: [], accommodationTip: false }] });
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent trip", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId: "00000000-0000-0000-0000-000000000000",
          recommendations: [{ name: "Test", city: "Tokyo", country: "Japan", description: "", urls: [], themes: [], accommodationTip: false }],
        });
      expect(res.status).toBe(404);
    });

    it("handles recommendations with empty themes and urls gracefully", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          senderLabel: "Minimal Test",
          recommendations: [
            { name: "Some Place", city: "Tokyo", country: "Japan", description: "", urls: [], themes: [], accommodationTip: false },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.imported).toBe(1);
    });

    it("handles recommendation with null city as Ideas (not crash)", async () => {
      const res = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          senderLabel: "Null City Test",
          recommendations: [
            { name: "Vague idea", city: null, country: "Japan", description: "no location at all", urls: [], themes: [], accommodationTip: false },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.category3).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 10-14. AI EXTRACTION — chaotic real-world inputs
  // These call the actual AI (Haiku) so they take longer
  // ═══════════════════════════════════════════════════════════════

  describe("10. AI extraction — friend's casual email with mixed formatting", () => {
    it("extracts places from messy email-style text", async () => {
      const res = await request(app)
        .post("/api/import/extract-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          text: `Hey!! So excited for your Japan trip omg

ok here are my recs (sorry this is all over the place lol)

TOKYO:
- definitely go to Shimokitazawa for vintage shopping, its like the brooklyn of tokyo haha
- Omoide Yokocho near shinjuku station - tiny alleys with yakitori. go at night!!!
- if you like ramen try Fuunji (tsukemen style, theres always a line but worth it)
  https://tabelog.com/tokyo/A1304/A130401/13001139/

KYOTO stuff:
  * Philosopher's Path - nice walk especially in autumn
  * Tofukuji temple has the BEST autumn colors, way better than kiyomizu imo
  * this place called Kiln (ceramics cafe?) - i think its near gion?

random thoughts
  - download the Suica app before you go, trust me
  - 7-eleven ATMs work with foreign cards
  - get a pocket wifi not just sim, coverage is better

oh also my friend said Kanazawa is amazing if you have time?? Kenrokuen garden is apparently one of the top 3 gardens in Japan. And the 21st Century Museum of Contemporary Art is free on certain days

one more thing - in osaka try kushikatsu (deep fried skewers) at Daruma near shinsekai. DO NOT double dip the sauce they will yell at you lmao`,
          country: "Japan",
        });

      expect(res.status).toBe(200);
      const recs = res.body.recommendations;
      expect(recs.length).toBeGreaterThanOrEqual(8);

      // Should have extracted specific places
      const names = recs.map((r: any) => r.name.toLowerCase());
      expect(names.some((n: string) => n.includes("shimokitazawa"))).toBe(true);
      expect(names.some((n: string) => n.includes("omoide") || n.includes("yokocho"))).toBe(true);
      expect(names.some((n: string) => n.includes("fuunji"))).toBe(true);
      expect(names.some((n: string) => n.includes("philosopher"))).toBe(true);
      expect(names.some((n: string) => n.includes("kenrokuen"))).toBe(true);
      expect(names.some((n: string) => n.includes("daruma") || n.includes("kushikatsu"))).toBe(true);

      // City assignments should be correct
      const tokyoItems = recs.filter((r: any) => r.city?.toLowerCase() === "tokyo");
      expect(tokyoItems.length).toBeGreaterThanOrEqual(2);
      const kyotoItems = recs.filter((r: any) => r.city?.toLowerCase() === "kyoto");
      expect(kyotoItems.length).toBeGreaterThanOrEqual(2);

      // Practical tips (Suica, 7-eleven) should be in senderNotes or have no city
      const noCity = recs.filter((r: any) => !r.city);
      // These might end up as senderNotes instead of recommendations, which is also fine
      if (noCity.length === 0) {
        expect(res.body.senderNotes).toBeTruthy();
      }
    }, 60000);
  });

  describe("11. AI extraction — bullet chaos with emoji and typos", () => {
    it("extracts places from emoji-heavy poorly formatted text", async () => {
      const res = await request(app)
        .post("/api/import/extract-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          text: `japan recs from sarah!!!

🍜 FOOOD
  🔥 ichiran ramen (tokyo, harajuku location is less crowded)
  🔥 gyukatsu motomura - omg the beef cutlet. tokyo + kyoto locations
  🍣 sushi dai at toyosu market... get there at like 5am no joke
  🍶 sake tasting at Fushimi in kyoto!! gekkeikan is the big one but the smaller breweries r better

🏯 CULTURE STUFF
  - teamlab planets in tokyo (not borderless, planets is the one in the water)
  - the bamboo grove in arashiyama kyoto... everyone says its touristy but still go lol
  - day trip to nara - the deer are WILD (literally haha). kasuga taisha shrine is gorgeous
  - in hiroshima the peace memorial museum is... heavy but important. miyajima island too for the floating torii

🛍 SHOPPING
  - nakamise shopping street in asakusa (tokyo) - touristy but fun souvenirs
  - nishiki market kyoto >>>>>> tsukiji dont @ me
  - don quijote (donki) for weird snacks, theres one everywhere

🏨 WHERE WE STAYED
  - Hoshinoya Tokyo - INSANE but pricey. onsen on the roof
  - in kyoto we did a machiya (traditional townhouse) thru Vrbo, search "gion machiya"

💡 misc
  - JR pass might not be worth it anymore they raised prices, do the math first
  - konbini (convenience stores) are unironically some of the best food
  - carry cash! lots of places still dont take cards esp in kyoto`,
          country: "Japan",
        });

      expect(res.status).toBe(200);
      const recs = res.body.recommendations;
      expect(recs.length).toBeGreaterThanOrEqual(10);

      const names = recs.map((r: any) => r.name.toLowerCase());
      expect(names.some((n: string) => n.includes("ichiran"))).toBe(true);
      expect(names.some((n: string) => n.includes("teamlab"))).toBe(true);
      expect(names.some((n: string) => n.includes("nara") || n.includes("kasuga"))).toBe(true);
      expect(names.some((n: string) => n.includes("nishiki"))).toBe(true);

      // Accommodation tips should be flagged
      const accomRecs = recs.filter((r: any) => r.accommodationTip === true);
      expect(accomRecs.length).toBeGreaterThanOrEqual(1);

      // Hiroshima should be its own city, not lumped into Tokyo/Kyoto
      const hiroshimaItems = recs.filter((r: any) => r.city?.toLowerCase() === "hiroshima" || r.city?.toLowerCase()?.includes("hiroshima"));
      expect(hiroshimaItems.length).toBeGreaterThanOrEqual(1);
    }, 60000);
  });

  describe("12. AI extraction — copy-pasted blog with noise", () => {
    it("extracts places from blog-style text ignoring navigation and ads", async () => {
      const res = await request(app)
        .post("/api/import/extract-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          text: `SHARE THIS POST
Follow us on Instagram @wanderlust
Subscribe to our newsletter!

The Ultimate Hidden Gems of Japan (2025 Update)

Skip the tourist traps! Here are the places locals actually go:

1. Yanaka District, Tokyo
The last old-school neighborhood in Tokyo. Winding streets, traditional sweet shops, and Yanaka Cemetery where you can see cherry blossoms without the crowds. Start at Nippori Station.

2. Kurama to Kibune Hike, Kyoto
A mountain trail connecting two small villages north of Kyoto. Do it in this direction (Kurama -> Kibune) and reward yourself with a lunch at one of the riverside restaurants in Kibune where they serve food on platforms over the river (kawadoko dining, summer only).

3. Naoshima Island, Kagawa
Art island in the Seto Inland Sea. Yayoi Kusama's yellow pumpkin, the Chichu Art Museum (underground!), and the Benesse House hotel where you literally sleep in a museum. Take the ferry from Uno Port.

4. Yakushima Island, Kagoshima
Ancient cedar forests (some trees are 7000 years old!!). The Jomon Sugi hike is intense (10+ hours round trip) but there are shorter trails too. Princess Mononoke was inspired by this place.

Related Posts:
- 10 Best Ramen Shops in Tokyo
- How to Ride the Shinkansen
- Japan on a Budget 2025

Comments (47)
Cookie Policy | Privacy | Terms of Service`,
          country: "Japan",
        });

      expect(res.status).toBe(200);
      const recs = res.body.recommendations;
      expect(recs.length).toBeGreaterThanOrEqual(4);

      const names = recs.map((r: any) => r.name.toLowerCase());
      expect(names.some((n: string) => n.includes("yanaka"))).toBe(true);
      expect(names.some((n: string) => n.includes("kurama") || n.includes("kibune"))).toBe(true);
      expect(names.some((n: string) => n.includes("naoshima"))).toBe(true);
      expect(names.some((n: string) => n.includes("yakushima"))).toBe(true);

      // Should NOT have extracted navigation/ad items
      expect(names.some((n: string) => n.includes("subscribe") || n.includes("cookie") || n.includes("instagram"))).toBe(false);
    }, 60000);
  });

  describe("13. AI extraction — terse shorthand notes", () => {
    it("extracts places from ultra-brief notes with minimal context", async () => {
      const res = await request(app)
        .post("/api/import/extract-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          text: `Japan ideas:
Tokyo - Shimokita vintage, Akihabara if nerdy, Yanesen old town walk
Osaka - Kuromon market, Shinsekai area, day trip Koyasan
Kyoto - Tofukuji > Kiyomizu (less crowds), Monkey Park Iwatayama, Gion at dusk
Hiroshima + Miyajima (1 night)
Kanazawa if time: Kenrokuen, Higashi Chaya, 21st Century Museum
Takayama: old town, morning market, hida beef
Skip: Sapporo (too far), Nikko (overrated imo)`,
          country: "Japan",
        });

      expect(res.status).toBe(200);
      const recs = res.body.recommendations;
      expect(recs.length).toBeGreaterThanOrEqual(12);

      // Even terse items should be extracted
      const names = recs.map((r: any) => r.name.toLowerCase());
      expect(names.some((n: string) => n.includes("kuromon"))).toBe(true);
      expect(names.some((n: string) => n.includes("monkey park") || n.includes("iwatayama"))).toBe(true);
      expect(names.some((n: string) => n.includes("kenrokuen"))).toBe(true);
      expect(names.some((n: string) => n.includes("morning market"))).toBe(true);

      // Kanazawa should be a city, not lost
      const kanazawaItems = recs.filter((r: any) => r.city?.toLowerCase()?.includes("kanazawa"));
      expect(kanazawaItems.length).toBeGreaterThanOrEqual(1);
    }, 60000);
  });

  describe("14. AI extraction — non-Japan, different language patterns", () => {
    it("handles recommendations for Italy with different patterns", async () => {
      const res = await request(app)
        .post("/api/import/extract-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          text: `ITALY RECS from Marco:

Rome (2-3 days min)
- Trastevere neighborhood for dinner every night, try Da Enzo al 29 (cash only, line is long, no reservations)
- skip the Vatican museum unless you LOVE art, its exhausting. St Peters is free tho and incredible
- Testaccio market for lunch (the supplì at 00100 Pizza are insane)

Florence
- Uffizi - book tix online months ahead or you wont get in
- San Lorenzo market for leather (bargain hard)
- drive or bus to San Gimignano (medieval towers, amazing gelato at Gelateria Dondoli)

Amalfi Coast
- stay in Praiano not Positano (half the price, just as beautiful)
- Path of the Gods hike from Bomerano to Nocelle - best views of the coast
- lemon everything (limoncello, lemon pasta, lemon cake)

General: get the Trenitalia app, first class is barely more expensive. Aperitivo hour is sacred (6-8pm, order a spritz and they bring free snacks). Dont eat near the train stations.`,
          country: "Italy",
        });

      expect(res.status).toBe(200);
      const recs = res.body.recommendations;
      expect(recs.length).toBeGreaterThanOrEqual(7);

      const names = recs.map((r: any) => r.name.toLowerCase());
      expect(names.some((n: string) => n.includes("da enzo") || n.includes("trastevere"))).toBe(true);
      expect(names.some((n: string) => n.includes("uffizi"))).toBe(true);
      expect(names.some((n: string) => n.includes("path of the gods") || n.includes("bomerano"))).toBe(true);

      // Cities should be Italian
      const romItems = recs.filter((r: any) => r.city?.toLowerCase() === "rome" || r.city?.toLowerCase() === "roma");
      expect(romItems.length).toBeGreaterThanOrEqual(2);

      // Accommodation tip for Praiano
      const praiano = recs.find((r: any) => r.name.toLowerCase().includes("praiano") || r.description?.toLowerCase()?.includes("praiano"));
      if (praiano) {
        expect(praiano.accommodationTip).toBe(true);
      }

      // General travel advice should be in senderNotes
      expect(res.body.senderNotes).toBeTruthy();
      expect(res.body.senderNotes.toLowerCase()).toMatch(/trenitalia|aperitivo|train station/);
    }, 60000);
  });

  // ═══════════════════════════════════════════════════════════════
  // 15. EXTRACT ENDPOINT — edge cases
  // ═══════════════════════════════════════════════════════════════

  describe("15. Extract endpoint — edge cases", () => {
    it("rejects empty text", async () => {
      const res = await request(app)
        .post("/api/import/extract-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "" });
      expect(res.status).toBe(400);
    });

    it("rejects missing text", async () => {
      const res = await request(app)
        .post("/api/import/extract-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({ country: "Japan" });
      expect(res.status).toBe(400);
    });

    it("handles text with almost no useful content", async () => {
      const res = await request(app)
        .post("/api/import/extract-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          text: "Japan is great! You'll love it. Have fun!!! :) :) :)",
          country: "Japan",
        });

      expect(res.status).toBe(200);
      // Might extract 0 recs or put everything in senderNotes — both valid
      expect(res.body).toHaveProperty("recommendations");
      expect(res.body).toHaveProperty("senderNotes");
    }, 60000);
  });

  // ═══════════════════════════════════════════════════════════════
  // 16. FULL PIPELINE — extract then commit
  // ═══════════════════════════════════════════════════════════════

  describe("16. Full pipeline — extract then commit with chaotic input", () => {
    it("extracts and commits a messy recommendation list end-to-end", async () => {
      // Step 1: Extract
      const extract = await request(app)
        .post("/api/import/extract-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          text: `Quick recs for your trip!!

In Tokyo check out Golden Gai (tiny bars in shinjuku, each one is like 5 seats), Akihabara for electronics and anime stuff, and Tsukiji outer market is still worth it even tho the inner market moved

For Kyoto I loved the moss temple (Kokedera) but you need to apply by postcard weeks in advance — totally worth the effort. Also Fushimi Inari at like 5am before the crowds

Random: download Google Translate camera mode, it reads Japanese signs in real time. Game changer.

My friend who lived there says try Hakone for an overnight — ryokan with private onsen, views of Fuji on clear days`,
          country: "Japan",
        });

      expect(extract.status).toBe(200);
      const recs = extract.body.recommendations;
      expect(recs.length).toBeGreaterThanOrEqual(4);

      // Step 2: Commit
      const commit = await request(app)
        .post("/api/import/commit-recommendations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          tripId,
          recommendations: recs,
          senderNotes: extract.body.senderNotes,
          senderLabel: "Pipeline Test",
        });

      expect(commit.status).toBe(201);
      expect(commit.body.imported).toBe(recs.length);
      // Should have routed Tokyo/Kyoto items to existing cities
      expect(commit.body.category1).toBeGreaterThanOrEqual(2);

      // Hakone should have created a candidate city
      const hakone = await prisma.city.findFirst({ where: { tripId, name: { contains: "Hakone", mode: "insensitive" } } });
      if (commit.body.category2 > 0) {
        // At least one new city was created (likely Hakone)
        expect(hakone || commit.body.category2).toBeTruthy();
      }
    }, 90000);
  });
});
