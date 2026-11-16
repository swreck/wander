/**
 * "Fixed" for Japan's place photos (Nov 16 2026), in Ken's and Larisa's words: Japan opens looking like its last day, and
 * its places show photos ("larisa loved the photos... several pictures is better than one"). On Nov 16, 75 of Japan's 91
 * places said "Photo not available": the Google references Wander had stored a month before were refused, though Google
 * still lists the places' photos. This check fails on the code before that day: the photo's address answers 404.
 * Google is made up here (fresh references on each listing; the stored one refused); the photo check's answers are known.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-photo-expired";
process.env.GOOGLE_MAPS_API_KEY = "test-key";
const { app } = await import("../src/index.js");
// (the code before Nov 16 has no photo check to set — then nothing is set, and the check below fails as it should)
const judge = await import("../src/services/photoJudge.js").catch(() => null);
const prisma = new PrismaClient();

const TAG = `ppx-${Date.now()}`;
let issued = 0;
const realFetch = globalThis.fetch;
vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
  const url = new URL(String(input?.url ?? input));
  if (url.hostname !== "maps.googleapis.com") return realFetch(input, init);
  if (url.pathname.includes("/place/details/")) {
    issued++;
    const photos = ["good-a", "bad-b", "good-c"].map((p) => ({ photo_reference: `${p}~${issued}`, width: 4032, height: 3024, html_attributions: [`<a href="x">${p} taker</a>`] }));
    return new Response(JSON.stringify({ status: "OK", result: { photos } }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
  }
  if (url.pathname.includes("/place/photo")) {
    const ref = url.searchParams.get("photo_reference") || "";
    if (!ref.includes("~")) return new Response("expired", { status: 400 });   // (the stored, month-old reference)
    return new Response(new TextEncoder().encode(`${ref.split("~")[0]}@${url.searchParams.get("maxwidth")}`), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" } });
  }
  return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), { headers: { "content-type": "application/json" } });
});

let rowId = "";
beforeAll(async () => {
  judge?.setJudgeForTests?.(async (_l, _n, images) => images.map((im, i) => (im.bytes.toString().startsWith("good") ? i : -1)).filter((i) => i >= 0));
  (judge as any)?.setPlaceCheckForTests?.(async () => ({ same: true, why: "the same place (test)" }));
  const row = await prisma.placePhoto.create({ data: { query: `${TAG} Tonkatsu, Aoyama, Japan`, line: `${TAG} Lunch at Tonkatsu`, placeId: `${TAG}-place`, name: "Tonkatsu",
    photos: [{ ref: "month-old-reference", credit: "good-a taker" }], verdict: "yes", why: "[2] same", checkedAt: new Date("2026-10-17T00:00:00Z") } });
  rowId = row.id;
});
afterAll(async () => {
  judge?.setJudgeForTests?.(null);
  (judge as any)?.setPlaceCheckForTests?.(null);
  await (prisma as any).placePhotoCheck?.deleteMany({ where: { placeRowId: rowId } }).catch(() => {});
  await prisma.placePhoto.deleteMany({ where: { query: { startsWith: TAG } } });
  await prisma.$disconnect();
});

describe("a place whose stored photo reference has expired", () => {
  it("still shows its checked photo, from Google's current listing", async () => {
    const r = await request(app).get(`/api/place-photos/${rowId}/0?v=1&size=small`);
    expect(r.status).toBe(200);
    expect(Buffer.from(r.body).toString()).toBe("good-a@640");
  }, 60_000);
  it("shows only photos that pass the check (the second shown is the other good one)", async () => {
    const r = await request(app).get(`/api/place-photos/${rowId}/1?v=1&size=small`);
    expect(r.status).toBe(200);
    expect(Buffer.from(r.body).toString()).toBe("good-c@640");
    expect((await request(app).get(`/api/place-photos/${rowId}/2?v=1&size=small`)).status).toBe(404);
  }, 60_000);
});
