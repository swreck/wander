/**
 * "JUST FOR ME" NOTES STAY PRIVATE (Sep 30 2026, round 12 blocker) — read back through the API.
 * Larisa's private note on an idea appeared on Ken's Home ("Recent activity") and stayed after she took it back.
 * - Another person's activity feed never shows a private note; a group note shows once (not twice).
 * - Taking a group note back takes its words out of the history.
 * - The feed is for the trip's own people.
 * Invented data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-private-notes";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const prisma = new PrismaClient();

let tripId = "", expId = "", writer = "", reader = "", outsider = "";

beforeAll(async () => {
  const trip = await prisma.trip.create({ data: { name: "PN Private Notes Trip", status: "archived" } });
  tripId = trip.id;
  const mk = async (name: string) => (await prisma.traveler.findFirst({ where: { displayName: name } })) || prisma.traveler.create({ data: { displayName: name } });
  const w = await mk("PNWriter"), r = await mk("PNReader"), o = await mk("PNOutsider");
  for (const t of [w, r]) await prisma.tripMember.create({ data: { tripId, travelerId: t.id, role: "traveler" } });
  writer = signToken({ code: "PNWriter", displayName: "PNWriter", travelerId: w.id });
  reader = signToken({ code: "PNReader", displayName: "PNReader", travelerId: r.id });
  outsider = signToken({ code: "PNOutsider", displayName: "PNOutsider", travelerId: o.id });
  const city = await prisma.city.create({ data: { tripId, name: "PN City", sequenceOrder: 1 } });
  expId = (await prisma.experience.create({ data: { tripId, cityId: city.id, name: "PN Paper Museum", createdBy: "PNWriter" } })).id;
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});

const feedFor = async (token: string) => (await request(app).get(`/api/activity-feed/trip/${tripId}`).set("Authorization", `Bearer ${token}`)).body.feed as { description: string }[];

describe("notes on ideas", () => {
  it("a just-for-me note never reaches anyone else's feed", async () => {
    const add = await request(app).post("/api/experience-notes").set("Authorization", `Bearer ${writer}`).send({ experienceId: expId, content: "Secret gift idea", visibility: "private" });
    expect(add.status).toBe(201);
    const seen = await feedFor(reader);
    expect(seen.some((f) => f.description.includes("Secret gift idea"))).toBe(false);
  });
  it("a group note shows once, and taking it back takes its words out of the history", async () => {
    const add = await request(app).post("/api/experience-notes").set("Authorization", `Bearer ${writer}`).send({ experienceId: expId, content: "Go early, it fills up", visibility: "group" });
    await new Promise((r) => setTimeout(r, 300)); // the history line is written just after the reply
    expect((await feedFor(reader)).filter((f) => f.description.includes("Go early")).length).toBe(1);
    await request(app).delete(`/api/experience-notes/${add.body.id}`).set("Authorization", `Bearer ${writer}`);
    await new Promise((r) => setTimeout(r, 300));
    const after = await feedFor(reader);
    // Recent activity drops both halves; History keeps that a note was there, without its words
    expect(after.some((f) => f.description.includes("Go early"))).toBe(false);
    expect(after.some((f) => /noted on PN Paper Museum|took back a note/.test(f.description))).toBe(false);
    const history = await request(app).get(`/api/change-logs/trip/${tripId}`).set("Authorization", `Bearer ${reader}`);
    const lines = (history.body.logs || []).map((l: any) => l.description as string);
    expect(lines.some((d: string) => d.includes("Go early"))).toBe(false);
    expect(lines.some((d: string) => d.includes("(since taken back)"))).toBe(true);
  });
  it("someone not on the trip can't read its activity", async () => {
    expect((await request(app).get(`/api/activity-feed/trip/${tripId}`).set("Authorization", `Bearer ${outsider}`)).status).toBe(403);
  });
});
