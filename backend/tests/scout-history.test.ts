/**
 * YOUR SCOUT CONVERSATION ON EVERY DEVICE (Oct 4 2026, Ken: "When I change devices or change between a webpage and web
 * app … I seem to lose the history"). Read back through the API, as a second device would:
 * - your own questions and answers on the trip, oldest first, a question before its answer saved at the same moment
 * - an answer's sources, place cards, screens and directions come back with it; a question's files by name
 * - another traveller on the trip never sees yours; someone not on the trip is refused
 * - "Start fresh" on one device starts fresh on all — a marker; nothing said is deleted
 * Invented data; no Scout API calls.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-scout-history";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const prisma = new PrismaClient();

let tripId = "", a = "", b = "", outsider = "", aId = "", bId = "";
const as = (t: string) => ({
  get: (u: string) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u: string, body: object) => request(app).post(u).set("Authorization", `Bearer ${t}`).send(body),
});

beforeAll(async () => {
  const mk = async (n: string) => (await prisma.traveler.findFirst({ where: { displayName: n } })) || prisma.traveler.create({ data: { displayName: n } });
  const ta = await mk("SHAsker"), tb = await mk("SHFriend"), to = await mk("SHOutsider");
  aId = ta.id; bId = tb.id;
  tripId = (await prisma.trip.create({ data: { name: "SH History Trip", status: "archived", timeZone: "Asia/Tokyo" } })).id;
  for (const t of [ta, tb]) await prisma.tripMember.create({ data: { tripId, travelerId: t.id, role: "traveler" } });
  a = signToken({ code: "SHAsker", displayName: "SHAsker", travelerId: ta.id });
  b = signToken({ code: "SHFriend", displayName: "SHFriend", travelerId: tb.id });
  outsider = signToken({ code: "SHOutsider", displayName: "SHOutsider", travelerId: to.id });
  const at = new Date("2026-10-04T22:00:00Z");
  // (as the chat route saves them: a question and its answer in one write, at one moment)
  await prisma.chatMessage.createMany({ data: [
    { tripId, travelerId: aId, role: "assistant", content: "Tap **Details**.", createdAt: at, sources: { copy: "x", claims: [], ownWords: ["Tap Details."] },
      toolUse: { places: [{ name: "Shin-Osaka" }], shows: [{ path: "/day/2026-10-06", label: "Open Tue, Oct 6", go: false }], routes: [] } },
    { tripId, travelerId: aId, role: "user", content: "now what (with image.png)", createdAt: at },
    { tripId, travelerId: aId, role: "user", content: "How do I pick up the paper tickets?", createdAt: new Date(at.getTime() - 60_000) },
    { tripId, travelerId: aId, role: "assistant", content: "At Shin-Osaka, at a 5489 machine.", createdAt: new Date(at.getTime() - 60_000) },
    { tripId, travelerId: bId, role: "user", content: "SHFriend's own question", createdAt: at },
    { tripId, travelerId: bId, role: "assistant", content: "SHFriend's own answer", createdAt: at },
  ] });
});

afterAll(async () => {
  await prisma.chatMessage.deleteMany({ where: { tripId } });
  await prisma.tripMember.deleteMany({ where: { tripId } });
  await prisma.trip.delete({ where: { id: tripId } });
  await prisma.$disconnect();
});

describe("your conversation, read back on another device", () => {
  it("your own questions and answers, oldest first, each question before its answer", async () => {
    const r = await as(a).get(`/api/chat/history?tripId=${tripId}`);
    expect(r.status).toBe(200);
    expect(r.body.messages.map((m: any) => `${m.role}: ${m.text}`)).toEqual([
      "user: How do I pick up the paper tickets?",
      "assistant: At Shin-Osaka, at a 5489 machine.",
      "user: now what",
      "assistant: Tap **Details**.",
    ]);
    expect(r.body.freshAt).toBeNull();
  });
  it("an answer keeps its sources, cards and screens; a question its files by name", async () => {
    const m = (await as(a).get(`/api/chat/history?tripId=${tripId}`)).body.messages;
    expect(m[2].files).toEqual([{ name: "image.png" }]);
    expect(m[3].sources.ownWords).toEqual(["Tap Details."]);
    expect(m[3].places).toEqual([{ name: "Shin-Osaka" }]);
    expect(m[3].shows[0].path).toBe("/day/2026-10-06");
    expect(m[3].routes).toBeUndefined();
  });
  it("another traveller on the trip sees only their own", async () => {
    const m = (await as(b).get(`/api/chat/history?tripId=${tripId}`)).body.messages;
    expect(m.map((x: any) => x.text)).toEqual(["SHFriend's own question", "SHFriend's own answer"]);
  });
  it("someone not on the trip is refused", async () => {
    expect((await as(outsider).get(`/api/chat/history?tripId=${tripId}`)).status).toBe(403);
    expect((await as(outsider).post("/api/chat/fresh", { tripId })).status).toBe(403);
  });
  it("without signing in, nothing", async () => {
    expect((await request(app).get(`/api/chat/history?tripId=${tripId}`)).status).toBe(401);
  });
});

describe("Start fresh, on every device", () => {
  it("one device starts fresh: the others see an empty conversation; nothing said is deleted", async () => {
    const before = await prisma.chatMessage.count({ where: { tripId, travelerId: aId, role: { in: ["user", "assistant"] } } });
    expect((await as(a).post("/api/chat/fresh", { tripId })).status).toBe(200);
    const r = (await as(a).get(`/api/chat/history?tripId=${tripId}`)).body;
    expect(r.messages).toEqual([]);
    expect(typeof r.freshAt).toBe("string");
    expect(await prisma.chatMessage.count({ where: { tripId, travelerId: aId, role: { in: ["user", "assistant"] } } })).toBe(before);
    // (the friend's conversation is untouched)
    expect((await as(b).get(`/api/chat/history?tripId=${tripId}`)).body.messages).toHaveLength(2);
  });
  it("what's said after Start fresh comes back", async () => {
    await new Promise((r) => setTimeout(r, 20));
    await prisma.chatMessage.createMany({ data: [
      { tripId, travelerId: aId, role: "user", content: "a new topic" },
      { tripId, travelerId: aId, role: "assistant", content: "a new answer" },
    ] });
    expect((await as(a).get(`/api/chat/history?tripId=${tripId}`)).body.messages.map((m: any) => m.text)).toEqual(["a new topic", "a new answer"]);
  });
});
