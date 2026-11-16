/**
 * Her own description of a stop reaches the photo check (Nov 16 2026, the second look). Her "Tokyo Day 3" list pins an
 * udon shop's building with her description "3D panda billboard"; the check read only the pin's name and kept a plate of
 * udon to lead. Now the words a place's photos were judged against are kept, and words that change are judged again —
 * once — the photos' addresses staying the same. A photo is shown only when it shows what her words name.
 * Google is made up; the photo check passes what the words name: a "billboard" photo for words naming a billboard, else
 * any "good" photo. A finished trip, so the place is never searched again.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-photo-words";
process.env.GOOGLE_MAPS_API_KEY = "test-key";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { setJudgeForTests, setPlaceCheckForTests } = await import("../src/services/photoJudge.js") as any;
const checks = await import("../src/services/placePhotoChecks.js");
const prisma = new PrismaClient();

const TAG = `ppw-${Date.now()}`;
const DAY = 86400_000;
let issued = 0;
const realFetch = globalThis.fetch;
const photos = [{ id: "good-udon", credit: "Shop", w: 1024, h: 704 }, { id: "billboard-screen", credit: "Ana", w: 4032, h: 3024 }, { id: "good-street", credit: "Ben", w: 4000, h: 3000 }];
vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
  const url = new URL(String(input?.url ?? input));
  if (url.hostname !== "maps.googleapis.com") return realFetch(input, init);
  if (url.pathname.includes("/place/details/")) {
    issued++;
    return new Response(JSON.stringify({ status: "OK", result: { photos: photos.map((p) => ({ photo_reference: `${p.id}~${issued}`, width: p.w, height: p.h, html_attributions: [`<a>${p.credit}</a>`] })) } }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
  }
  if (url.pathname.includes("/place/photo")) {
    const ref = url.searchParams.get("photo_reference") || "";
    return new Response(new TextEncoder().encode(`${ref.split("~")[0]}@${url.searchParams.get("maxwidth")}`), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" } });
  }
  return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), { headers: { "content-type": "application/json" } });
});

const judged: string[] = [];
// (the place check: Google's place fits her words unless they name a "screen" — the rule-(b) case below)
const placeAsked: string[] = [];
let tok = "", tripId = "", rowId = "", travelerId = "";
const PIN = `${TAG} Yamashita Honki Udon - Shibuya Center Street`;
const HERS = `${PIN} (her list says: 3D panda billboard)`;
const QUERY = `${TAG} Yamashita Honki Udon Shibuya Center Street`;
const lookup = (line: string) => request(app).post("/api/place-photos/lookup").set({ Authorization: `Bearer ${tok}` }).send({ tripId, places: [{ key: QUERY, query: QUERY, line }] });
const first = async () => Buffer.from((await request(app).get(`/api/place-photos/${rowId}/0?v=1&size=small`)).body).toString();

beforeAll(async () => {
  setJudgeForTests(async (words, _name, images, most) => {
    judged.push(words);
    const wants = /billboard/i.test(words) ? /^billboard/ : /^(good|billboard)/;
    return images.map((im, i) => (wants.test(im.bytes.toString()) ? i : -1)).filter((i) => i >= 0).slice(0, most);
  });
  setPlaceCheckForTests?.(async (words: string) => { placeAsked.push(words); return { same: !/screen/i.test(words), why: "test" }; });
  const t = await prisma.traveler.create({ data: { displayName: `${TAG}-ken` } });
  travelerId = t.id;
  tok = signToken({ code: t.displayName, displayName: t.displayName, travelerId: t.id });
  const trip = await prisma.trip.create({ data: { name: `${TAG} finished`, startDate: new Date(Date.now() - 45 * DAY), endDate: new Date(Date.now() - 20 * DAY) } });
  tripId = trip.id;
  await prisma.tripMember.create({ data: { tripId, travelerId: t.id, role: "planner" } });
  // the place as Japan's was: judged by the pin's name alone, the udon first
  const row = await prisma.placePhoto.create({ data: { query: QUERY, line: PIN, placeId: `${TAG}-place`, name: "Yamashita Honki Udon", photos: [], verdict: "yes", why: "[2] same", checkedAt: new Date(Date.now() - 30 * DAY) } });
  rowId = row.id;
  const key = (p: (typeof photos)[number]) => checks.keyOf(p.credit, p.w, p.h);
  await prisma.placePhotoCheck.createMany({ data: [
    { placeRowId: rowId, keyHash: key(photos[0]), imageHash: checks.imageHashOf(Buffer.from("good-udon@640")), pass: true, rank: 0, credit: "Shop", source: "check" },
    { placeRowId: rowId, keyHash: key(photos[1]), imageHash: checks.imageHashOf(Buffer.from("billboard-screen@640")), pass: true, rank: 1, credit: "Ana", source: "check" },
    { placeRowId: rowId, keyHash: key(photos[2]), imageHash: checks.imageHashOf(Buffer.from("good-street@640")), pass: true, rank: 2, credit: "Ben", source: "check" },
  ] });
});
beforeEach(() => { (checks as any).forgetForTests?.(); });
afterAll(async () => {
  setJudgeForTests(null);
  setPlaceCheckForTests?.(null);
  await prisma.placePhotoCheck.deleteMany({ where: { placeRowId: rowId } });
  await prisma.placePhoto.deleteMany({ where: { query: { startsWith: TAG } } });
  await prisma.tripMember.deleteMany({ where: { tripId } });
  await prisma.trip.deleteMany({ where: { id: tripId } });
  await prisma.traveler.deleteMany({ where: { id: travelerId } });
  await prisma.$disconnect();
});

describe("her description of a stop reaches the photo check", () => {
  it("the phone sends her description: the photos are judged against it, and only what it names is shown", async () => {
    const ids = (await prisma.placePhotoCheck.findMany({ where: { placeRowId: rowId }, orderBy: { rank: "asc" } })).map((c) => c.id);
    const r = await lookup(HERS);
    expect(r.status).toBe(200);
    expect(judged.some((w) => w.includes("her list says: 3D panda billboard"))).toBe(true);
    const hit = r.body.places[QUERY];
    expect(hit.photos.map((p: any) => p.credit)).toEqual(["Ana"]);
    expect(await first()).toBe("billboard-screen@640");
    // (the photos' addresses stay the same: the billboard's verdict is the one it had)
    expect(hit.photos[0].id).toBe(ids[1]);
  }, 60_000);

  it("the same words again, or an older phone sending only the pin's name: not judged again", async () => {
    const n = judged.length;
    await lookup(HERS);
    await lookup(PIN);
    expect(judged.length).toBe(n);
    expect(await first()).toBe("billboard-screen@640");
  });

  it("verdicts judged before words were kept are judged again when the place is opened — once", async () => {
    await prisma.placePhotoCheck.updateMany({ where: { placeRowId: rowId }, data: { words: null } });
    const n = judged.length;
    await request(app).get(`/api/place-photos/${rowId}/0?v=1&size=small`);
    await new Promise((r) => setTimeout(r, 300));
    expect(judged.length).toBe(n + 1);
    await request(app).get(`/api/place-photos/${rowId}/0?v=1&size=small`);
    await new Promise((r) => setTimeout(r, 300));
    expect(judged.length).toBe(n + 1);
    expect((await prisma.placePhotoCheck.findFirst({ where: { placeRowId: rowId } }))!.words).toBe(PIN);
  });

  it("when Google's place doesn't fit her words, no photo shows for them — asked once, the place not searched again", async () => {
    const words = `${PIN} (her list says: the big screen across the street)`;
    const asked = placeAsked.length, j = judged.length;
    const r = await lookup(words);
    expect(r.status).toBe(200);
    expect(r.body.places[QUERY]).toBeNull();
    expect(placeAsked.length).toBe(asked + 1);
    expect(judged.length).toBe(j);   // (no photo judged for a place that doesn't fit)
    expect((await request(app).get(`/api/place-photos/${rowId}/0?v=1&size=small`)).status).toBe(404);
    const all = await prisma.placePhotoCheck.findMany({ where: { placeRowId: rowId } });
    expect(all.every((v) => !v.pass && v.words === words)).toBe(true);
    expect((await prisma.placePhoto.findUnique({ where: { id: rowId } }))!.placeId).toBe(`${TAG}-place`);
    await lookup(words);
    expect(placeAsked.length).toBe(asked + 1);
  });
});
