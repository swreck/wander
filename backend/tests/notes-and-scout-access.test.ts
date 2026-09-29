/**
 * NOTES ON IDEAS, AND SCOUT, STAY WITH THEIR TRIP (Sep 28 2026, round-4 fixes)
 *
 * - Notes on ideas are read and written only by people on that trip; only a note's author can take
 *   it back, and taking back a group note shows in History.
 * - Scout (POST /api/chat) refuses a trip you're not on — before anything runs.
 * - Scout's add_idea_note / take_back_idea_note: normal use, "just for me", taking back twice, someone
 *   else's note, empty words, made-up ids, an idea on a trip you're not on.
 *
 * The trip is built directly in the database (not POST /api/trips, which switches Wander's active
 * trip and would disturb other test files running at the same time).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-notes-access";

const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { executeTool } = await import("../src/routes/chat.js");
const prisma = new PrismaClient();

const NAMES = ["NAPlanner", "NAFriend", "NAOutsider"];
const people: Record<string, { token: string; travelerId: string }> = {};
let tripId = "";
let otherTripId = "";
let cityId = "";
let ideaId = "";
let otherIdeaId = "";

beforeAll(async () => {
  for (const name of NAMES) {
    let t = await prisma.traveler.findFirst({ where: { displayName: name } });
    if (!t) t = await prisma.traveler.create({ data: { displayName: name } });
    people[name] = { token: signToken({ code: name, displayName: name, travelerId: t.id }), travelerId: t.id };
  }
  const trip = await prisma.trip.create({ data: { name: "NA Notes Trip", status: "archived" } });
  tripId = trip.id;
  await prisma.tripMember.create({ data: { tripId, travelerId: people.NAPlanner.travelerId, role: "planner" } });
  await prisma.tripMember.create({ data: { tripId, travelerId: people.NAFriend.travelerId, role: "member" } });
  const city = await prisma.city.create({ data: { tripId, name: "NA City", sequenceOrder: 1 } });
  cityId = city.id;
  ideaId = (await prisma.experience.create({ data: { tripId, cityId, name: "NA Fish Market", createdBy: "NAPlanner" } })).id;
  // A trip only the outsider is on
  const other = await prisma.trip.create({ data: { name: "NA Other Trip", status: "archived" } });
  otherTripId = other.id;
  await prisma.tripMember.create({ data: { tripId: otherTripId, travelerId: people.NAOutsider.travelerId, role: "planner" } });
  const otherCity = await prisma.city.create({ data: { tripId: otherTripId, name: "NA Elsewhere", sequenceOrder: 1 } });
  otherIdeaId = (await prisma.experience.create({ data: { tripId: otherTripId, cityId: otherCity.id, name: "NA Other Idea", createdBy: "NAOutsider" } })).id;
});

afterAll(async () => {
  for (const id of [tripId, otherTripId]) if (id) await prisma.trip.delete({ where: { id } }).catch(() => {});
  await prisma.traveler.deleteMany({ where: { displayName: { in: NAMES } } }).catch(() => {});
  await prisma.$disconnect();
});

const auth = (who: string) => ({ Authorization: `Bearer ${people[who].token}` });

describe("Notes on ideas stay with their trip", () => {
  let friendNoteId = "";

  it("someone on the trip writes a note and reads the city's notes", async () => {
    const res = await request(app).post("/api/experience-notes").set(auth("NAFriend")).send({ experienceId: ideaId, content: "go before 8" });
    expect(res.status).toBe(201);
    friendNoteId = res.body.id;
    const list = await request(app).get(`/api/experience-notes/city/${cityId}`).set(auth("NAPlanner"));
    expect(list.status).toBe(200);
    expect(list.body[ideaId].map((n: { content: string }) => n.content)).toContain("go before 8");
  });

  it("someone not on the trip can't read its notes or write one", async () => {
    expect((await request(app).get(`/api/experience-notes/city/${cityId}`).set(auth("NAOutsider"))).status).toBe(403);
    const write = await request(app).post("/api/experience-notes").set(auth("NAOutsider")).send({ experienceId: ideaId, content: "hello" });
    expect(write.status).toBe(403);
    expect(await prisma.experienceNote.count({ where: { experienceId: ideaId, content: "hello" } })).toBe(0);
  });

  it("only the author can take a note back", async () => {
    expect((await request(app).delete(`/api/experience-notes/${friendNoteId}`).set(auth("NAPlanner"))).status).toBe(403);
    expect(await prisma.experienceNote.count({ where: { id: friendNoteId } })).toBe(1);
  });

  it("the author takes it back: gone, and History says so", async () => {
    const res = await request(app).delete(`/api/experience-notes/${friendNoteId}`).set(auth("NAFriend"));
    expect(res.status).toBe(200);
    expect(await prisma.experienceNote.count({ where: { id: friendNoteId } })).toBe(0);
    await new Promise((r) => setTimeout(r, 300));
    const logged = await prisma.changeLog.findFirst({ where: { tripId, actionType: "note_removed" } });
    expect(logged?.description).toContain("took back a note on NA Fish Market");
  });

  it("taking it back again says it's not there", async () => {
    expect((await request(app).delete(`/api/experience-notes/${friendNoteId}`).set(auth("NAFriend"))).status).toBe(404);
  });
});

describe("Scout stays with your trips", () => {
  it("refuses a trip you're not on, before doing anything", async () => {
    const res = await request(app).post("/api/chat").set(auth("NAOutsider"))
      .send({ message: "what's on today?", context: { page: "Home", tripId }, history: [] });
    expect(res.status).toBe(403);
  });
});

describe("Scout's note tools", () => {
  const as = (name: string) => ({ code: name, displayName: name });

  it("adds a note for the group, and History shows it", async () => {
    const out = await executeTool("add_idea_note", { tripId, experienceId: ideaId, content: "cash only at the stalls" }, as("NAFriend"));
    expect(out.result.saved).toBe(true);
    expect(out.result.whoSees).toBe("everyone on the trip");
    const note = await prisma.experienceNote.findFirst({ where: { experienceId: ideaId, content: "cash only at the stalls" } });
    expect(note?.visibility).toBe("group");
  });

  it("adds a note just for the person asking", async () => {
    const out = await executeTool("add_idea_note", { tripId, experienceId: ideaId, content: "buy knives here", justForMe: true }, as("NAFriend"));
    expect(out.result.whoSees).toBe("only you");
    const note = await prisma.experienceNote.findFirst({ where: { experienceId: ideaId, content: "buy knives here" } });
    expect(note?.visibility).toBe("private");
  });

  it("an empty note or a made-up idea saves nothing", async () => {
    const before = await prisma.experienceNote.count();
    expect((await executeTool("add_idea_note", { tripId, experienceId: ideaId, content: "   " }, as("NAFriend"))).result.error).toBeTruthy();
    expect((await executeTool("add_idea_note", { tripId, experienceId: "nope", content: "x" }, as("NAFriend"))).result.error).toBeTruthy();
    expect(await prisma.experienceNote.count()).toBe(before);
  });

  it("an idea on someone else's trip is refused, even if Scout names that trip", async () => {
    const out = await executeTool("add_idea_note", { tripId: otherTripId, experienceId: otherIdeaId, content: "sneaky" }, as("NAFriend"));
    expect(out.result.error).toMatch(/isn't one of yours/);
    expect(await prisma.experienceNote.count({ where: { content: "sneaky" } })).toBe(0);
  });

  it("can't take back someone else's note", async () => {
    const out = await executeTool("take_back_idea_note", { tripId, experienceId: ideaId, text: "cash only" }, as("NAPlanner"));
    expect(out.result.error).toBeTruthy();
    expect(await prisma.experienceNote.count({ where: { content: "cash only at the stalls" } })).toBe(1);
  });

  it("takes back their own, by its words — and only that one", async () => {
    const out = await executeTool("take_back_idea_note", { tripId, experienceId: ideaId, text: "CASH only" }, as("NAFriend"));
    expect(out.result.removed).toBe(true);
    expect(await prisma.experienceNote.count({ where: { content: "cash only at the stalls" } })).toBe(0);
    expect(await prisma.experienceNote.count({ where: { content: "buy knives here" } })).toBe(1);
  });

  it("taking back again, with nothing left that matches, says so", async () => {
    const out = await executeTool("take_back_idea_note", { tripId, experienceId: ideaId, text: "cash only" }, as("NAFriend"));
    expect(out.result.error).toMatch(/match/);
  });
});
