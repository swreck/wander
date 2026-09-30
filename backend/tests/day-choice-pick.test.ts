/**
 * ONE PICK PER LINE OF HER PLAN (round 6, Sep 29 2026)
 *
 * A pick among Larisa's choices ("We're going here") is one step that replaces any other pick for that line.
 * Before, a switch was two steps (take off, then add); changing your mind twice with no signal left two
 * "group picks" for everyone once the phone reconnected.
 *
 * Chaos: switching, the same pick twice, picks queued offline replayed in order, another line's pick
 * untouched, a plain same-day plan untouched, a pick that doesn't match its line, someone not on the trip.
 * The trip is built directly in the database.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-day-pick";

const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const prisma = new PrismaClient();

const NAMES = ["DPKen", "DPLarisa", "DPOutsider"];
const people: Record<string, { token: string; travelerId: string }> = {};
let tripId = "";
const DATE = "2026-10-27";

beforeAll(async () => {
  for (const name of NAMES) {
    let t = await prisma.traveler.findFirst({ where: { displayName: name } });
    if (!t) t = await prisma.traveler.create({ data: { displayName: name } });
    people[name] = { token: signToken({ code: name, displayName: name, travelerId: t.id }), travelerId: t.id };
  }
  const trip = await prisma.trip.create({ data: { name: "DP Pick Trip", status: "archived" } });
  tripId = trip.id;
  await prisma.tripMember.create({ data: { tripId, travelerId: people.DPKen.travelerId, role: "planner" } });
  await prisma.tripMember.create({ data: { tripId, travelerId: people.DPLarisa.travelerId, role: "planner" } });
  const city = await prisma.city.create({ data: { tripId, name: "DP Kyoto", sequenceOrder: 1 } });
  await prisma.day.create({ data: { tripId, cityId: city.id, date: new Date(`${DATE}T00:00:00.000Z`) } });
  // Her plan's lines with choices, as the Guide reader stores them
  const snap = await prisma.guideSnapshot.create({ data: { tripId, sourceName: "DP.xlsx", sourceKind: "xlsx", contentHash: "dp", tabs: [] } });
  const at = new Date(`${DATE}T00:00:00.000Z`);
  await prisma.guideItem.create({ data: { tripId, snapshotId: snap.id, date: at, time: "12:30", kind: "block", title: "Lunch",
    detail: "Choice: Honke Owariya — soba since 1465\nChoice: Omen — udon near Ginkaku-ji", source: "Kyoto Tue · Day 3", sourceRef: "dp!plan" } });
  await prisma.guideItem.create({ data: { tripId, snapshotId: snap.id, date: at, time: "20:00", kind: "block", title: "Dinner",
    detail: "Choice: Enyuan Kobayashi\nChoice: Hassun", source: "Kyoto Tue · Day 3", sourceRef: "dp!plan" } });
});

afterAll(async () => {
  if (tripId) await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.traveler.deleteMany({ where: { displayName: { in: NAMES } } }).catch(() => {});
  await prisma.$disconnect();
});

const auth = (who: string) => ({ Authorization: `Bearer ${people[who].token}` });
const pick = (who: string, name: string, line = "Lunch") =>
  request(app).post(`/api/day-choices/${tripId}`).set(auth(who)).send({ date: DATE, time: "12:30", text: `${line}: ${name}`, pickFor: line });
const picksFor = async (line: string) =>
  (await prisma.dayChoice.findMany({ where: { tripId, date: DATE, text: { startsWith: `${line}: ` } } })).map((c) => c.text);

describe("One pick per line of her plan", () => {
  it("picking a place records it", async () => {
    const res = await pick("DPKen", "Honke Owariya");
    expect(res.status).toBe(201);
    expect(await picksFor("Lunch")).toEqual(["Lunch: Honke Owariya"]);
  });

  it("switching replaces the pick in one step — never two picks, never none", async () => {
    const res = await pick("DPKen", "Omen");
    expect(res.status).toBe(201);
    expect(await picksFor("Lunch")).toEqual(["Lunch: Omen"]);
  });

  it("the same pick again is the same pick", async () => {
    const before = (await prisma.dayChoice.findFirst({ where: { tripId, text: "Lunch: Omen" } }))!.id;
    const res = await pick("DPLarisa", "Omen");
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(before);
    expect(await picksFor("Lunch")).toEqual(["Lunch: Omen"]);
  });

  it("picks queued with no signal replay in order, and the last one wins", async () => {
    // Offline: Honke, then back to Omen, then Honke again — sent in that order when the signal returns
    for (const name of ["Honke Owariya", "Omen", "Honke Owariya"]) expect((await pick("DPKen", name)).status).toBe(201);
    expect(await picksFor("Lunch")).toEqual(["Lunch: Honke Owariya"]);
  });

  it("another line's pick, and a plan someone typed, are never replaced", async () => {
    expect((await pick("DPKen", "Enyuan Kobayashi", "Dinner")).status).toBe(201);
    const plain = await request(app).post(`/api/day-choices/${tripId}`).set(auth("DPLarisa")).send({ date: DATE, text: "Lunch: we'll decide at the station" });
    expect(plain.status).toBe(201);
    expect((await pick("DPKen", "Omen")).status).toBe(201);
    expect(await picksFor("Dinner")).toEqual(["Dinner: Enyuan Kobayashi"]);
    // A plan someone typed that happens to start "Lunch: " is theirs — only her listed choices are picks
    expect((await picksFor("Lunch")).sort()).toEqual(["Lunch: Omen", "Lunch: we'll decide at the station"]);
    await prisma.dayChoice.deleteMany({ where: { tripId, text: "Lunch: we'll decide at the station" } });
  });

  it("a pick that doesn't match its line is refused and changes nothing", async () => {
    const res = await request(app).post(`/api/day-choices/${tripId}`).set(auth("DPKen")).send({ date: DATE, text: "Omen", pickFor: "Lunch" });
    expect(res.status).toBe(400);
    expect(await picksFor("Lunch")).toEqual(["Lunch: Omen"]);
  });

  it("a place her line doesn't list is refused", async () => {
    const res = await pick("DPKen", "Somewhere Else");
    expect(res.status).toBe(400);
    expect(await picksFor("Lunch")).toEqual(["Lunch: Omen"]);
  });

  it("someone not on the trip can't pick", async () => {
    expect((await pick("DPOutsider", "Honke Owariya")).status).toBe(403);
    expect(await picksFor("Lunch")).toEqual(["Lunch: Omen"]);
  });

  it("History says a switch in one line", async () => {
    await new Promise((r) => setTimeout(r, 300));
    const logged = await prisma.changeLog.findMany({ where: { tripId, actionType: "day_choice_added" }, orderBy: { createdAt: "asc" } });
    expect(logged.some((l) => /switched "Lunch" to Omen/.test(l.description || ""))).toBe(true);
    expect(logged.some((l) => /picked Honke Owariya for "Lunch"/.test(l.description || ""))).toBe(true);
  });
});
