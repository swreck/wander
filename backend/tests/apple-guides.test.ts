/**
 * HER APPLE MAPS GUIDES (Oct 2 2026): maps Larisa made in Apple Maps, one per day, apart from her sheet.
 * - straight-line distances between a map's own places, said in rounded words; what's close (≤ 1.2 km) and what isn't
 * - the same place twice on a map (her hotel as start and end) said once; a place with no name or location left out
 * - each map's day comes from her day tab as the current Guide copy dates it, not the date stored with it
 * - only Apple Maps guide links are kept; only the trip's people can see them
 * - Walk/Train/Taxi uses a map's own location for a place her sheet gives no pin or address for — by its name, never
 *   a different branch
 * - Scout's lines say it's her map (not her sheet), not in visiting order, with straight-line distances
 * Invented data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-apple-guides";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { executeTool } = await import("../src/routes/chat.js");
const { appleGuidesOf, guideLinksByDay, closeness, guideLines, metres, distanceWords } = await import("../src/services/guide/appleGuides.js");
const { buildGuideContext } = await import("../src/services/guide/scoutContext.js");
const prisma = new PrismaClient();

let tripId = "", member = "", outsider = "";
const LINK = "https://maps.apple/ug/AbcDef123~xyz";
// Three shops a few hundred metres apart, and one across town
const SHOP_A = { name: "Paper Shop", address: "1-1 Ginza", lat: 35.6720, lng: 139.7650 };
const SHOP_B = { name: "Knife Shop", address: "2-2 Ginza", lat: 35.6735, lng: 139.7665 };
const HOTEL = { name: "GRAND HOTEL", address: "1-1 Uchisaiwai-cho", lat: 35.6730, lng: 139.7580 };
const FAR = { name: "Hill Temple", address: "9 Hill Road", lat: 35.7150, lng: 139.7960 };

beforeAll(async () => {
  tripId = (await prisma.trip.create({ data: { name: "Apple Guides Trip", status: "archived", timeZone: "Asia/Tokyo" } })).id;
  const snap = await prisma.guideSnapshot.create({ data: { tripId, sourceName: "test.xlsx", sourceKind: "xlsx", contentHash: "ag", tabs: [] } });
  // Her day tab "City Day 1 Shops": most of its lines on May 3, one stray line on May 4
  for (const [title, d] of [["Paper Shop", "2027-05-03"], ["Knife Shop", "2027-05-03"], ["Dinner", "2027-05-03"], ["Note", "2027-05-04"]] as const)
    await prisma.guideItem.create({ data: { tripId, snapshotId: snap.id, kind: "plan", title, date: new Date(`${d}T00:00:00Z`), source: "City Day 1 Shops · Stops", sourceRef: "City Day 1 Shops!A1" } });
  await prisma.sheetSyncConfig.create({ data: { tripId, spreadsheetId: "", tabMappings: { source: "snapshot", appleGuides: [
    { name: "City Day 1", link: LINK, readAt: "2027-04-01T00:00:00Z", tab: "City Day 1 Shops", date: "2027-05-09", places: [HOTEL, SHOP_A, SHOP_B, FAR, { ...HOTEL }, { name: null, address: null, lat: null, lng: null }] },
    { name: "Not a guide", link: "https://evil.example/ug/x", readAt: "2027-04-01T00:00:00Z", tab: null, date: "2027-05-05", places: [] },
  ] } } });
  const mk = async (n: string) => (await prisma.traveler.findFirst({ where: { displayName: n } })) || prisma.traveler.create({ data: { displayName: n } });
  const a = await mk("AGMember"), o = await mk("AGOutsider");
  await prisma.tripMember.create({ data: { tripId, travelerId: a.id, role: "traveler" } });
  member = signToken({ code: "AGMember", displayName: "AGMember", travelerId: a.id });
  outsider = signToken({ code: "AGOutsider", displayName: "AGOutsider", travelerId: o.id });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("distances", () => {
  it("straight-line metres, rounded in words", () => {
    const m = metres(SHOP_A, SHOP_B);
    expect(m).toBeGreaterThan(150);
    expect(m).toBeLessThan(250);
    expect(distanceWords(m)).toMatch(/^about (150|200|250) m$/);
    expect(distanceWords(40)).toBe("under 100 m");
    expect(distanceWords(4630)).toBe("about 4.6 km");
  });
  it("what's close to what; the far one has nothing within 1.2 km; the hotel twice is said once", async () => {
    const [g] = await appleGuidesOf(tripId);
    const c = closeness(g);
    expect(c.map((x) => x.place)).toEqual(["GRAND HOTEL", "Paper Shop", "Knife Shop", "Hill Temple"]);
    expect(c.find((x) => x.place === "Paper Shop")!.near.map((n) => n.name)).toEqual(["Knife Shop", "GRAND HOTEL"]);
    const far = c.find((x) => x.place === "Hill Temple")!;
    expect(far.near).toEqual([]);
    expect(far.nearestM).toBeGreaterThan(4000);
  });
});

describe("which day, and who sees it", () => {
  it("the day comes from her tab as the Guide dates it (not the stored date); a non-Apple link is dropped", async () => {
    const gs = await appleGuidesOf(tripId);
    expect(gs.map((g) => g.name)).toEqual(["City Day 1"]);
    expect(gs[0].date).toBe("2027-05-03");
    expect(await guideLinksByDay(tripId)).toEqual({ "2027-05-03": [{ name: "City Day 1", link: LINK }] });
  });
  it("the trip's people get the links; someone else doesn't", async () => {
    const ok = await request(app).get(`/api/guide/apple-guides/${tripId}`).set("Authorization", `Bearer ${member}`);
    expect(ok.status).toBe(200);
    expect(ok.body.byDay["2027-05-03"][0].link).toBe(LINK);
    const no = await request(app).get(`/api/guide/apple-guides/${tripId}`).set("Authorization", `Bearer ${outsider}`);
    expect(no.status).toBe(403);
  });
});

describe("Scout", () => {
  it("lines say it's her map, not in visiting order, with straight-line distances", async () => {
    const [g] = await appleGuidesOf(tripId);
    const lines = guideLines(g, "Monday, May 3").join("\n");
    expect(lines).toMatch(/Her Apple Maps guide "City Day 1" — for Monday, May 3, the day of her "City Day 1 Shops" tab/);
    expect(lines).toMatch(/NOT in visiting order/);
    expect(lines).toMatch(/straight-line distance .* not a walking time/);
    expect(lines).toMatch(/Paper Shop: Knife Shop about (150|200|250) m/);
    expect(lines).toMatch(/Hill Temple: nothing else on this map within 1\.2 km \(nearest about \d\.\d km\)/);
    expect(lines).toMatch(/1 more on her map that Apple shows no name or address for/);
    const ctx = await buildGuideContext(tripId);
    expect(ctx).toMatch(/HER APPLE MAPS GUIDES/);
    expect(ctx).toMatch(/for Monday, May 3/);
  });
  it("Walk/Train/Taxi goes to her map's own location for a place her sheet has none for — by name only", async () => {
    const u = { travelerId: "x", code: "AGMember", displayName: "AGMember" } as any;
    const knife = await executeTool("directions", { tripId, place: "Knife Shop", town: "Tokyo", way: "walk" }, u);
    expect(new URL(knife.route!.apple).searchParams.get("daddr")).toBe(`${SHOP_B.lat},${SHOP_B.lng}`);
    expect(knife.route!.search).toBeUndefined();
    // a name her map doesn't have: a search, said as one
    const other = await executeTool("directions", { tripId, place: "Knife Shop Annex Kyoto Branch", town: "Kyoto", way: "walk" }, u);
    expect(other.route!.search).toBeTruthy();
  });
});
