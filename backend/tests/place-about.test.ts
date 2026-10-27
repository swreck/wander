/**
 * "About this place" (Oct 27; services/placeAbout.ts, GET /api/place-photos/about/:id). Only a place Wander found and
 * checked as the one her line means gets a piece; one already written comes back as kept (nothing written again); its
 * paragraphs come apart at blank lines. Invented data; no Google or Claude call is made.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-place-about";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const prisma = new PrismaClient();
let tok = "", yesId = "", noId = "";
const PLACE = `test-place-about-${Date.now()}`;

beforeAll(async () => {
  const t = (await prisma.traveler.findFirst({ where: { displayName: "PAReader" } })) || await prisma.traveler.create({ data: { displayName: "PAReader" } });
  tok = signToken({ code: "PAReader", displayName: "PAReader", travelerId: t.id });
  yesId = (await prisma.placePhoto.create({ data: { query: `${PLACE} yes`, line: "Raku Museum", placeId: PLACE, name: "Raku Museum", verdict: "yes" } })).id;
  noId = (await prisma.placePhoto.create({ data: { query: `${PLACE} no`, line: "Taxi to Raku Museum", placeId: `${PLACE}-no`, name: "Somewhere else", verdict: "no" } })).id;
  await prisma.placeAbout.create({ data: { placeId: PLACE, name: "Raku Museum", kind: "background", gist: "A small museum beside the family's kiln.",
    text: "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.", rating: 4.3, ratingCount: 516, sources: [{ title: "Google's listing and reviews", url: "https://www.google.com/maps" }] } });
});
afterAll(async () => {
  await prisma.placeAbout.deleteMany({ where: { placeId: { startsWith: PLACE } } });
  await prisma.placePhoto.deleteMany({ where: { query: { startsWith: PLACE } } });
  await prisma.$disconnect();
});
const get = (id: string, auth = true) => { const r = request(app).get(`/api/place-photos/about/${id}`); return auth ? r.set("Authorization", `Bearer ${tok}`) : r; };

describe("About this place", () => {
  it("a written piece comes back as kept, in paragraphs, with its rating and sources", async () => {
    const r = await get(yesId);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ name: "Raku Museum", kind: "background", gist: "A small museum beside the family's kiln.", rating: 4.3, ratingCount: 516 });
    expect(r.body.paragraphs).toEqual(["First paragraph.", "Second paragraph.", "Third paragraph."]);
    expect(r.body.sources[0].title).toMatch(/Google/);
  });
  it("a place not checked as the one her line means, or no such place: refused, said plainly", async () => {
    expect((await get(noId)).status).toBe(404);
    expect((await get(noId)).body.error).toMatch(/doesn't know this place/);
    expect((await get("no-such-place")).status).toBe(404);
  });
  it("only signed in", async () => {
    expect((await get(yesId, false)).status).toBe(401);
  });
  it("a line with a piece of its own (no Google place): listed, and found by her words; one without isn't", async () => {
    const title = `Studio 9: ${PLACE} and family`;
    await prisma.placeAbout.create({ data: { placeId: `line:${title.toLowerCase()}`, name: `${PLACE} and family`, kind: "background", gist: "A family kiln.", text: "One.\n\nTwo.\n\nThree." } });
    const lines = (await request(app).get("/api/place-photos/about-lines").set("Authorization", `Bearer ${tok}`)).body.lines as string[];
    expect(lines).toContain(`line:${title.toLowerCase()}`);
    const r = await request(app).get(`/api/place-photos/about-line?title=${encodeURIComponent(title)}`).set("Authorization", `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body.paragraphs).toEqual(["One.", "Two.", "Three."]);
    expect((await request(app).get(`/api/place-photos/about-line?title=${encodeURIComponent("Taxi to nowhere")}`).set("Authorization", `Bearer ${tok}`)).status).toBe(404);
    expect((await request(app).get("/api/place-photos/about-lines")).status).toBe(401);
    await prisma.placeAbout.deleteMany({ where: { placeId: `line:${title.toLowerCase()}` } });
  });
});
