/**
 * MAYBES (Oct 2 2026, Ken: "a shared list of maybes") — invented trip and people.
 * - A maybe is one sentence on a city's list; a link in the words is kept as its link; saying it is being in on it
 * - The same words sent twice from a phone with no signal is one maybe; empty words, a city on another trip, and
 *   someone not on the trip are refused
 * - "I'm in" on her idea and on a maybe, taken back; "Julie's in too" shows as "Julie (via Andy)"
 * - A new Guide copy replaces her X marks only — never Wander's "I'm in"; a renamed idea carries it across
 * - Seen: each person's last look at a city's list, readable by the trip's own people only
 * - Recent: the last two weeks' maybes and group notes, not private ones
 * - Scout: add_maybe and im_in do the same; retract_interest never takes away her X or someone else's "I'm in"
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-maybes";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { executeTool } = await import("../src/routes/chat.js");
const { replaceGuideMarks, keepWhatPeopleAdded } = await import("../src/services/guide/importSnapshot.js");
const { wordsAndLink } = await import("../src/services/maybes.js");
const prisma = new PrismaClient();

const TRIP = "MB Maybes Trip";
let tripId = "", otherTripId = "", cityId = "", otherCityId = "", herIdea = "";
let andyId = "", kenId = "", outsiderId = "";
let andy = "", ken = "", outsider = "";

beforeAll(async () => {
  tripId = (await prisma.trip.create({ data: { name: TRIP, status: "archived" } })).id;
  otherTripId = (await prisma.trip.create({ data: { name: `${TRIP} (other)`, status: "archived" } })).id;
  const mk = async (name: string) => prisma.traveler.upsert({ where: { displayName: name }, update: {}, create: { displayName: name } });
  const a = await mk("MBAndy B"), k = await mk("MBKen"), o = await mk("MBOutsider");
  andyId = a.id; kenId = k.id; outsiderId = o.id;
  for (const t of [a, k]) await prisma.tripMember.create({ data: { tripId, travelerId: t.id, role: "traveler" } });
  andy = signToken({ code: "MBAndy B", displayName: "MBAndy B", travelerId: a.id });
  ken = signToken({ code: "MBKen", displayName: "MBKen", travelerId: k.id });
  outsider = signToken({ code: "MBOutsider", displayName: "MBOutsider", travelerId: o.id });
  cityId = (await prisma.city.create({ data: { tripId, name: "Mossvale", sequenceOrder: 1 } })).id;
  otherCityId = (await prisma.city.create({ data: { tripId: otherTripId, name: "Elsewhere", sequenceOrder: 1 } })).id;
  herIdea = (await prisma.experience.create({ data: { tripId, cityId, name: "Lantern museum", sheetRowRef: "Activities Template|Lantern museum", createdBy: "Larisa" } })).id;
  await replaceGuideMarks(prisma, herIdea, tripId, ["Larisa", "Julie"]);
});
afterAll(async () => {
  await prisma.trip.deleteMany({ where: { name: { startsWith: TRIP } } });
  await prisma.traveler.deleteMany({ where: { displayName: { in: ["MBAndy B", "MBKen", "MBOutsider"] } } }).catch(() => {});
  await prisma.$disconnect();
});

const as = (token: string) => ({ post: (p: string) => request(app).post(p).set("Authorization", `Bearer ${token}`), get: (p: string) => request(app).get(p).set("Authorization", `Bearer ${token}`) });
const marks = async (id: string) => (await prisma.experienceInterest.findMany({ where: { experienceId: id }, orderBy: { displayName: "asc" } })).map((i) => i.displayName);

describe("putting a maybe out", () => {
  it("one sentence on the city's list; a link in it is its link; saying it is being in", async () => {
    const r = await as(andy).post("/api/maybes").send({ tripId, cityId, words: "maybe the coffee place https://www.instagram.com/reel/abc123/ Thursday morning?" });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe("maybe the coffee place Thursday morning?");
    expect(r.body.sourceUrl).toBe("https://www.instagram.com/reel/abc123/");
    expect(r.body.sheetRowRef).toBeNull();
    expect(r.body.createdBy).toBe("MBAndy B");
    expect(await marks(r.body.id)).toEqual(["MBAndy B"]);
    // the reply carries the mark, so the phone shows "✓ You're in" at once
    expect(r.body.interests).toEqual([{ displayName: "MBAndy B", userCode: `wander:${andyId}` }]);
  });
  it("tea or ice cream, sent twice with no signal, is one maybe", async () => {
    const one = await as(ken).post("/api/maybes").send({ tripId, cityId, words: "tea or ice cream after the museum?" });
    const two = await as(ken).post("/api/maybes").send({ tripId, cityId, words: "  tea or ice cream after the museum?  " });
    expect(one.status).toBe(201);
    expect(two.status).toBe(200);
    expect(two.body.id).toBe(one.body.id);
    expect(await prisma.experience.count({ where: { tripId, name: "tea or ice cream after the museum?" } })).toBe(1);
  });
  it("just a link gets plain words", () => {
    expect(wordsAndLink("https://www.tabelog.com/x")).toEqual({ words: "A link from tabelog.com", link: "https://www.tabelog.com/x" });
    expect(wordsAndLink("ramen?", "not a link")).toEqual({ words: "ramen?", link: null });
  });
  it("refuses empty words, a city from another trip, and someone not on the trip", async () => {
    expect((await as(andy).post("/api/maybes").send({ tripId, cityId, words: "   " })).status).toBe(400);
    // (refused: the trip-privacy guard answers first, 403; the route's own check would say 404)
    expect([403, 404]).toContain((await as(andy).post("/api/maybes").send({ tripId, cityId: otherCityId, words: "a walk" })).status);
    expect((await as(outsider).post("/api/maybes").send({ tripId, cityId, words: "a walk" })).status).toBe(403);
  });
});

describe("I'm in", () => {
  it("on her idea: one line with her X marks; taken back; Julie via Andy", async () => {
    const r = await as(andy).post(`/api/maybes/${herIdea}/in`).send({ on: true });
    expect(r.status).toBe(200);
    expect(await marks(herIdea)).toEqual(["Julie", "Larisa", "MBAndy B"]);
    await as(andy).post(`/api/maybes/${herIdea}/in`).send({ on: true, forName: "Julie D." });
    expect(await marks(herIdea)).toContain("Julie (via MBAndy)");
    await as(andy).post(`/api/maybes/${herIdea}/in`).send({ on: false });
    expect(await marks(herIdea)).toEqual(["Julie", "Julie (via MBAndy)", "Larisa"]);
    // again: no doubles
    await as(andy).post(`/api/maybes/${herIdea}/in`).send({ on: true });
    await as(andy).post(`/api/maybes/${herIdea}/in`).send({ on: true });
    expect((await marks(herIdea)).filter((n) => n === "MBAndy B").length).toBe(1);
  });
  it("the idea list says which marks are Wander's", async () => {
    const list = await as(ken).get(`/api/experiences/trip/${tripId}`);
    const idea = list.body.find((e: any) => e.id === herIdea);
    expect(idea.interests.some((i: any) => i.displayName === "MBAndy B" && i.userCode === `wander:${andyId}`)).toBe(true);
    expect(idea.interests.some((i: any) => i.displayName === "Larisa" && i.userCode === "Larisa")).toBe(true);
  });
  it("not for someone off the trip, nor a missing idea", async () => {
    expect([403, 404]).toContain((await as(outsider).post(`/api/maybes/${herIdea}/in`).send({ on: true })).status);
    expect([403, 404]).toContain((await as(andy).post(`/api/maybes/nope-not-an-id/in`).send({ on: true })).status);
    expect(await marks(herIdea)).not.toContain("MBOutsider");
  });
});

describe("a new copy of her Guide", () => {
  it("replaces her X marks only — Wander's I'm in stays", async () => {
    await prisma.$transaction((tx) => replaceGuideMarks(tx, herIdea, tripId, ["Larisa"]));
    const now = await marks(herIdea);
    expect(now).toContain("Larisa");
    expect(now).not.toContain("Julie"); // her X came off in her sheet
    expect(now).toContain("MBAndy B");
    expect(now).toContain("Julie (via MBAndy)");
  });
  it("a renamed idea carries Wander's I'm in across", async () => {
    // (its own pair of ideas, in its own city — the others stay as they are for the tests below)
    const town = (await prisma.city.create({ data: { tripId, name: "Kilnford", sequenceOrder: 2 } })).id;
    const old = (await prisma.experience.create({ data: { tripId, cityId: town, name: "Paper lantern workshop", sheetRowRef: "Activities Template|Paper lantern workshop", createdBy: "Larisa" } })).id;
    await as(andy).post(`/api/maybes/${old}/in`).send({ on: true });
    const renamed = (await prisma.experience.create({ data: { tripId, cityId: town, name: "Paper lantern workshop (evening)", sheetRowRef: "Activities Template|Paper lantern workshop (evening)", createdBy: "Larisa" } })).id;
    const report = { warnings: [] as string[] };
    await prisma.$transaction((tx) => keepWhatPeopleAdded(tx, tripId, ["Activities Template|Lantern museum", "Activities Template|Paper lantern workshop (evening)"], [{ id: renamed, cityId: town, name: "Paper lantern workshop (evening)" }], report));
    expect(await marks(renamed)).toEqual(["MBAndy B"]);
  });
});

describe("taking a maybe back", () => {
  it("only its writer, never one of her ideas; a day it was put on keeps the plan", async () => {
    const m = await as(andy).post("/api/maybes").send({ tripId, cityId, words: "never mind — sake bar at 5?" });
    await prisma.dayChoice.create({ data: { tripId, date: "2027-01-02", text: "sake bar at 5", experienceId: m.body.id, travelerId: andyId } });
    expect((await request(app).delete(`/api/maybes/${m.body.id}`).set("Authorization", `Bearer ${ken}`)).status).toBe(403);
    expect((await request(app).delete(`/api/maybes/${herIdea}`).set("Authorization", `Bearer ${andy}`)).status).toBe(403);
    expect(await prisma.experience.count({ where: { id: herIdea } })).toBe(1);
    const gone = await request(app).delete(`/api/maybes/${m.body.id}`).set("Authorization", `Bearer ${andy}`);
    expect(gone.status).toBe(200);
    expect(await prisma.experience.count({ where: { id: m.body.id } })).toBe(0);
    const plan = await prisma.dayChoice.findFirst({ where: { tripId, text: "sake bar at 5" } });
    expect(plan?.experienceId).toBeNull();
  });
  it("Scout's take_back_maybe: the same rules", async () => {
    const m = await as(andy).post("/api/maybes").send({ tripId, cityId, words: "karaoke later?" });
    const asKen = { code: "MBKen", displayName: "MBKen", travelerId: kenId } as any;
    expect((await executeTool("take_back_maybe", { experienceId: m.body.id }, asKen)).result.error).toMatch(/only they can take it back/);
    expect((await executeTool("take_back_maybe", { experienceId: herIdea }, asKen)).result.error).toMatch(/Larisa's ideas/);
    const r = await executeTool("take_back_maybe", { experienceId: m.body.id }, { code: "MBAndy B", displayName: "MBAndy B", travelerId: andyId } as any);
    expect(r.actionDescription).toBe(`Took back the maybe "karaoke later?"`);
  });
});

describe("seen and recent", () => {
  it("each person's last look at a city, for the trip's people only", async () => {
    const before = Date.now();
    expect((await as(ken).post("/api/maybes/seen").send({ tripId, cityId })).status).toBe(200);
    const seen = await as(andy).get(`/api/maybes/seen/${tripId}`);
    const k = seen.body.find((p: any) => p.name === "MBKen");
    expect(new Date(k.seen[cityId]).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(seen.body.find((p: any) => p.name === "MBAndy B").me).toBe(true);
    // other settings kept
    const prefs = (await prisma.traveler.findUnique({ where: { id: kenId } }))!.preferences as any;
    expect(prefs.maybesSeen[tripId][cityId]).toBeTruthy();
    expect([403, 404]).toContain((await as(outsider).get(`/api/maybes/seen/${tripId}`)).status);
    expect((await as(outsider).post("/api/maybes/seen").send({ tripId, cityId })).status).toBe(403);
  });
  it("recent: maybes and group notes, never a private note", async () => {
    await prisma.experienceNote.create({ data: { experienceId: herIdea, travelerId: andyId, content: "go at dusk", visibility: "group" } });
    await prisma.experienceNote.create({ data: { experienceId: herIdea, travelerId: andyId, content: "my secret", visibility: "private" } });
    const r = await as(ken).get(`/api/maybes/recent/${tripId}`);
    expect(r.body.maybes.map((m: any) => m.words)).toEqual(expect.arrayContaining(["tea or ice cream after the museum?", "maybe the coffee place Thursday morning?"]));
    expect(r.body.maybes.some((m: any) => m.words === "Lantern museum")).toBe(false); // hers, not a maybe
    expect(r.body.notes.length).toBe(1);
    expect(r.body.notes[0].by).toBe("MBAndy B");
  });
});

describe("Scout", () => {
  const scoutAndy = () => ({ code: "MBAndy B", displayName: "MBAndy B", travelerId: andyId });
  it("add_maybe puts it on the list, the same as the screen", async () => {
    const r = await executeTool("add_maybe", { tripId, cityId, words: "the kiln the innkeeper told us about" }, scoutAndy() as any);
    expect(r.actionDescription).toBe(`On Mossvale's maybes: "the kiln the innkeeper told us about"`);
    expect(await prisma.experience.count({ where: { tripId, name: "the kiln the innkeeper told us about", sheetRowRef: null } })).toBe(1);
    const bad = await executeTool("add_maybe", { tripId, cityId: otherCityId, words: "x" }, scoutAndy() as any);
    expect(bad.result.error).toMatch(/City not found/);
  });
  it("im_in and float_to_group are one kind of I'm in; Julie via Andy", async () => {
    const kiln = (await prisma.experience.findFirst({ where: { tripId, name: "the kiln the innkeeper told us about" } }))!.id;
    await executeTool("im_in", { experienceId: kiln, forName: "Julie" }, scoutAndy() as any);
    expect(await marks(kiln)).toEqual(["Julie (via MBAndy)", "MBAndy B"]);
    await executeTool("float_to_group", { experienceId: herIdea }, { code: "MBKen", displayName: "MBKen", travelerId: kenId } as any);
    const k = await prisma.experienceInterest.findFirst({ where: { experienceId: herIdea, displayName: "MBKen" } });
    expect(k?.userCode).toBe(`wander:${kenId}`);
  });
  it("retract_interest never takes away her X or someone else's I'm in", async () => {
    const hers = (await prisma.experienceInterest.findFirst({ where: { experienceId: herIdea, userCode: "Larisa" } }))!;
    const andys = (await prisma.experienceInterest.findFirst({ where: { experienceId: herIdea, userCode: `wander:${andyId}` } }))!;
    const kens = (await prisma.experienceInterest.findFirst({ where: { experienceId: herIdea, userCode: `wander:${kenId}` } }))!;
    const asKen = { code: "MBKen", displayName: "MBKen", travelerId: kenId } as any;
    expect((await executeTool("retract_interest", { interestId: hers.id }, asKen)).result.error).toMatch(/Larisa's Guide/);
    expect((await executeTool("retract_interest", { interestId: andys.id }, asKen)).result.error).toMatch(/only they can take it back/);
    expect((await executeTool("retract_interest", { interestId: kens.id }, asKen)).result.error).toBeUndefined();
    expect(await marks(herIdea)).toContain("Larisa");
    expect(await marks(herIdea)).toContain("MBAndy B");
    expect(await marks(herIdea)).not.toContain("MBKen");
  });
});
