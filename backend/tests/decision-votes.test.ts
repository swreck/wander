/**
 * VOTES ON A GROUP DECISION (Sep 30 2026) — the app's route and Scout's tool, read back from the database
 *
 * Bugs behind it (older chaos tests S111, S116, S306):
 * - "Happy with any" in the app said "Got it — you're flexible" and saved nothing (Scout's tool did save it).
 * - A pick that isn't one of the decision's choices wiped the person's old votes, then failed with a server error.
 *
 * The trip is built directly in the database (not POST /api/trips, which switches Wander's active trip and
 * would disturb other test files running at the same time).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-decision-votes";

const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { executeTool } = await import("../src/routes/chat.js");
const prisma = new PrismaClient();

const NAMES = ["DVAlice", "DVBob", "DVOutsider"];
const people: Record<string, { token: string; travelerId: string }> = {};
let tripId = "";
let decisionId = "";
let otherDecisionId = "";
const option: Record<string, string> = {};

beforeAll(async () => {
  for (const name of NAMES) {
    let t = await prisma.traveler.findFirst({ where: { displayName: name } });
    if (!t) t = await prisma.traveler.create({ data: { displayName: name } });
    people[name] = { token: signToken({ code: name, displayName: name, travelerId: t.id }), travelerId: t.id };
  }
  const trip = await prisma.trip.create({ data: { name: "DV Votes Trip", status: "archived" } });
  tripId = trip.id;
  for (const name of ["DVAlice", "DVBob"]) await prisma.tripMember.create({ data: { tripId, travelerId: people[name].travelerId, role: "planner" } });
  const city = await prisma.city.create({ data: { tripId, name: "DV City", sequenceOrder: 1 } });
  decisionId = (await prisma.decision.create({ data: { tripId, cityId: city.id, title: "DV Lunch?", createdBy: "DVAlice" } })).id;
  otherDecisionId = (await prisma.decision.create({ data: { tripId, cityId: city.id, title: "DV Dinner?", createdBy: "DVAlice" } })).id;
  for (const name of ["Soba", "Tempura", "Udon"]) {
    option[name] = (await prisma.experience.create({ data: { tripId, cityId: city.id, name: `DV ${name}`, createdBy: "DVAlice", decisionId } })).id;
  }
  option.Sushi = (await prisma.experience.create({ data: { tripId, cityId: city.id, name: "DV Sushi", createdBy: "DVAlice", decisionId: otherDecisionId } })).id;
});

afterAll(async () => {
  if (tripId) await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.traveler.deleteMany({ where: { displayName: { in: NAMES } } }).catch(() => {});
  await prisma.$disconnect();
});

const auth = (who: string) => ({ Authorization: `Bearer ${people[who].token}` });
const vote = (who: string, body: object, id = decisionId) => request(app).post(`/api/decisions/${id}/vote`).set(auth(who)).send(body);
const votesOf = (who: string, id = decisionId) =>
  prisma.decisionVote.findMany({ where: { decisionId: id, userCode: who }, orderBy: { rank: "asc" }, select: { optionId: true, rank: true } });

describe("Voting in the app", () => {
  it("one pick is saved as a first choice", async () => {
    const res = await vote("DVAlice", { optionId: option.Soba });
    expect(res.status).toBe(200);
    expect(res.body.optionId).toBe(option.Soba);
    expect(await votesOf("DVAlice")).toEqual([{ optionId: option.Soba, rank: 1 }]);
  });

  it("a pick that isn't one of the choices is refused plainly, and the old vote stays", async () => {
    const res = await vote("DVAlice", { optionId: "nonexistent-experience-id" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't one of the choices/);
    expect(await votesOf("DVAlice")).toEqual([{ optionId: option.Soba, rank: 1 }]);
  });

  it("a choice from another decision is refused, and nothing changes", async () => {
    const res = await vote("DVAlice", { rankings: [{ optionId: option.Tempura, rank: 1 }, { optionId: option.Sushi, rank: 2 }] });
    expect(res.status).toBe(400);
    expect(await votesOf("DVAlice")).toEqual([{ optionId: option.Soba, rank: 1 }]);
  });

  it("top picks replace the old ones; a repeated rank or choice is dropped, not a crash", async () => {
    const res = await vote("DVAlice", { rankings: [
      { optionId: option.Tempura, rank: 1 }, { optionId: option.Tempura, rank: 2 },
      { optionId: option.Udon, rank: 1 }, { optionId: option.Udon, rank: 2 }, { optionId: option.Soba, rank: 7 },
    ] });
    expect(res.status).toBe(200);
    expect(await votesOf("DVAlice")).toEqual([{ optionId: option.Tempura, rank: 1 }, { optionId: option.Udon, rank: 2 }]);
  });

  it("\"happy with any\" is saved, so the others see who's flexible", async () => {
    const res = await vote("DVBob", {});
    expect(res.status).toBe(200);
    expect(res.body.optionId).toBeNull();
    expect(await votesOf("DVBob")).toEqual([{ optionId: null, rank: 1 }]);
  });

  it("both people's votes are there, as the decision list shows them", async () => {
    const list = await request(app).get(`/api/decisions/trip/${tripId}`).set(auth("DVAlice"));
    const d = list.body.find((x: { id: string }) => x.id === decisionId);
    expect(d.votes.map((v: { userCode: string }) => v.userCode).sort()).toEqual(["DVAlice", "DVAlice", "DVBob"]);
    expect(d.votes.filter((v: { optionId: string | null }) => v.optionId === null).map((v: { displayName: string }) => v.displayName)).toEqual(["DVBob"]);
  });

  it("removing the last pick (an empty list) clears that person's votes only", async () => {
    const res = await vote("DVAlice", { rankings: [] });
    expect(res.status).toBe(200);
    expect(await votesOf("DVAlice")).toEqual([]);
    expect(await votesOf("DVBob")).toEqual([{ optionId: null, rank: 1 }]);
  });

  it("a decision that doesn't exist says so", async () => {
    expect((await vote("DVAlice", { optionId: option.Soba }, "nonexistent-decision")).status).toBe(404);
  });

  it("someone not on the trip can't vote on its decisions, and nothing is saved", async () => {
    const res = await vote("DVOutsider", { optionId: option.Soba });
    expect(res.status).toBe(403);
    expect(await votesOf("DVOutsider")).toEqual([]);
  });
});

describe("Voting through Scout", () => {
  const as = (name: string) => ({ code: name, displayName: name });

  it("votes for a choice", async () => {
    const out = await executeTool("cast_decision_vote", { decisionId, optionId: option.Udon }, as("DVAlice"));
    expect(out.result.voted).toBe(true);
    expect(await votesOf("DVAlice")).toEqual([{ optionId: option.Udon, rank: 1 }]);
  });

  it("a made-up choice is refused, and the vote Scout made before stays", async () => {
    const out = await executeTool("cast_decision_vote", { decisionId, optionId: "made-up" }, as("DVAlice"));
    expect(out.result.error).toMatch(/isn't one of the choices/);
    expect(await votesOf("DVAlice")).toEqual([{ optionId: option.Udon, rank: 1 }]);
  });

  it("won't vote for someone who isn't on the trip", async () => {
    const out = await executeTool("cast_decision_vote", { decisionId, optionId: option.Soba }, as("DVOutsider"));
    expect(out.result.error).toMatch(/isn't one of yours/);
    expect(await votesOf("DVOutsider")).toEqual([]);
  });

  it("\"happy with any\" is saved the same way the app saves it", async () => {
    const out = await executeTool("cast_decision_vote", { decisionId, optionId: null }, as("DVAlice"));
    expect(out.result.voted).toBe(true);
    expect(await votesOf("DVAlice")).toEqual([{ optionId: null, rank: 1 }]);
  });

  it("a decision that's already settled takes no more votes, from Scout or the app", async () => {
    await prisma.decision.update({ where: { id: otherDecisionId }, data: { status: "resolved" } });
    const out = await executeTool("cast_decision_vote", { decisionId: otherDecisionId, optionId: option.Sushi }, as("DVBob"));
    expect(out.result.error).toMatch(/already resolved/);
    expect((await vote("DVBob", { optionId: option.Sushi }, otherDecisionId)).status).toBe(400);
    expect(await votesOf("DVBob", otherDecisionId)).toEqual([]);
  });
});
