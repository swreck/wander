/**
 * SCOUT'S "GET THERE" BUTTONS GO TO HER PLACE (Oct 2 2026: "what's next, when, and how do I get there?"). Scout's
 * directions tool turns a place into Apple Maps and Google Maps links, from wherever the phone is. The destination is
 * her own, best first — the pin of a place she linked, the address she wrote, a hotel's booked address, the place her
 * map link names — and only then Scout's words with the town. Never a guess at another place:
 * - "Ginza" is not her "ART AQUARIUM MUSEUM GINZA"; "Kyoto" (a town) is not any of her Kyoto lines
 * - two of her lines naming one place with different pins: no pin, the plain name instead
 * - walk, train and taxi each open their own way of travel; a way Scout makes up becomes walking
 * Invented data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-scout-directions";
const { executeTool } = await import("../src/routes/chat.js");
const prisma = new PrismaClient();

let tripId = "";
const user = { travelerId: "x", code: "DirTester", displayName: "DirTester" } as any;
const go = async (place: string, town: string, way: string) =>
  (await executeTool("directions", { tripId, place, town, way }, user)).route!;
const dest = (href: string) => new URL(href).searchParams.get("daddr");

beforeAll(async () => {
  tripId = (await prisma.trip.create({ data: { name: "Directions Trip", status: "archived", timeZone: "Asia/Tokyo" } })).id;
  const city = await prisma.city.create({ data: { tripId, name: "Kyoto", sequenceOrder: 0 } });
  await prisma.city.create({ data: { tripId, name: "Tokyo", sequenceOrder: 1 } });
  const snap = await prisma.guideSnapshot.create({ data: { tripId, sourceName: "test.xlsx", sourceKind: "xlsx", contentHash: "dir", tabs: [] } });
  const item = (title: string, link: string | null, detail: string | null = null) =>
    prisma.guideItem.create({ data: { tripId, snapshotId: snap.id, kind: "plan", title, link, detail, source: "Test", sourceRef: "T!A1" } });
  await item("🌸 Pen Shop Main Showroom (Yotsuya)", "https://www.google.co.jp/maps/place/X/@35.1111111,139.2222222,17z/data=!3m1");
  await item("Dinner Bistro Sora", "https://guide.michelin.com/x", "(French)\nAddress: DINNER BISTRO SORA · 9-9-9 Hommachi, Shibuya-ku, Tokyo, Japan");
  await item("🍽️ DINNER RESERVATION: DINNER BISTRO SORA (Hatsudai)", null, "Transit: Take the Chiyoda Line.");
  await item("⚡ Electric Town", "https://maps.apple.com/?q=Akihabara+Electric+Town");
  await item("ART AQUARIUM MUSEUM GINZA", "https://www.google.com/maps/place/Art+Aquarium/@35.67,139.76,17z");
  await item("Kyoto Tower lunch", "https://www.google.com/maps/place/Tower/@34.98,135.75,17z");
  await item("Twin Temple", "https://www.google.com/maps/place/A/@34.1,135.1,17z");
  await item("Twin Temple", "https://www.google.com/maps/place/B/@34.9,135.9,17z");
  await item("Evening Prep at the Grand Hotel", null);
  await prisma.accommodation.create({ data: { tripId, cityId: city.id, name: "Grand Hotel", address: "1-1 Uchisaiwai-cho, Chiyoda-ku, Tokyo, Japan" } });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("her own place, best first", () => {
  it("the pin of the place she linked", async () => {
    const r = await go("Pen Shop Main Showroom (Yotsuya)", "Tokyo", "walk");
    expect(dest(r.apple)).toBe("35.1111111,139.2222222");
    expect(r.label).toBe("Walk to Pen Shop Main Showroom");
    expect(r.google).toContain("destination=35.1111111%2C139.2222222");
  });
  it("the address she wrote, for either of her lines' names", async () => {
    expect(dest((await go("DINNER BISTRO SORA", "Tokyo", "taxi")).apple)).toBe("9-9-9 Hommachi, Shibuya-ku, Tokyo, Japan");
    expect(dest((await go("Dinner Bistro Sora (Hatsudai)", "Tokyo", "train")).apple)).toBe("9-9-9 Hommachi, Shibuya-ku, Tokyo, Japan");
  });
  it("a hotel's booked address when none of her lines gives one", async () => {
    expect(dest((await go("Grand Hotel", "Tokyo", "train")).apple)).toBe("1-1 Uchisaiwai-cho, Chiyoda-ku, Tokyo, Japan");
  });
  it("the place her own map link names", async () => {
    expect(dest((await go("Electric Town", "Tokyo", "walk")).apple)).toBe("Akihabara Electric Town, Tokyo");
  });
  it("nothing of hers: Scout's words and the town — and the button and Scout both say it's only a search", async () => {
    const r = await executeTool("directions", { tripId, place: "Nowhere Cafe", town: "Kyoto", way: "walk" }, user);
    expect(dest(r.route!.apple)).toBe("Nowhere Cafe, Kyoto, Japan");
    expect(r.route!.search).toBe("Nowhere Cafe, Kyoto");
    expect(r.result.say).toMatch(/no address/);
  });
  it("her own place is not called a search", async () => {
    for (const p of ["Pen Shop Main Showroom", "Dinner Bistro Sora", "Grand Hotel", "Electric Town"]) {
      const r = await executeTool("directions", { tripId, place: p, town: "Tokyo", way: "walk" }, user);
      expect(r.route!.search).toBeUndefined();
      expect(r.result.say).toBeUndefined();
    }
  });
});

describe("never another place", () => {
  it("a word inside a longer name isn't that place", async () => {
    expect(dest((await go("Ginza", "Tokyo", "walk")).apple)).toBe("Ginza, Tokyo, Japan");
  });
  it("a town is no one place", async () => {
    expect(dest((await go("Kyoto", "Kyoto", "walk")).apple)).toBe("Kyoto, Japan");
  });
  it("her lines disagree on the pin: the plain name", async () => {
    expect(dest((await go("Twin Temple", "Kyoto", "walk")).apple)).toBe("Twin Temple, Kyoto, Japan");
  });
});

describe("the way of travel", () => {
  it("walk, train and taxi each open their own", async () => {
    const [w, t, x] = [await go("Nowhere Cafe", "Kyoto", "walk"), await go("Nowhere Cafe", "Kyoto", "train"), await go("Nowhere Cafe", "Kyoto", "taxi")];
    expect([new URL(w.apple).searchParams.get("dirflg"), new URL(t.apple).searchParams.get("dirflg"), new URL(x.apple).searchParams.get("dirflg")]).toEqual(["w", "r", "d"]);
    expect([w.google, t.google, x.google].map((g) => new URL(g).searchParams.get("travelmode"))).toEqual(["walking", "transit", "driving"]);
    expect([w.label, t.label, x.label]).toEqual(["Walk to Nowhere Cafe", "Train to Nowhere Cafe", "Taxi to Nowhere Cafe"]);
  });
  it("a made-up way is walking; no place is an error, not a button", async () => {
    expect(new URL((await go("Nowhere Cafe", "Kyoto", "rickshaw")).apple).searchParams.get("dirflg")).toBe("w");
    const none = await executeTool("directions", { tripId, place: "  ", town: "Kyoto", way: "walk" }, user);
    expect(none.route).toBeUndefined();
    expect(none.result.error).toBeTruthy();
  });
});
