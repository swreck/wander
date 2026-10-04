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
 * - Remove (Oct 3, Ken): off the list for everyone, by whoever put it there (Larisa for her ideas) or the trip's
 *   organizer (its first member) — nobody else; nothing deleted; put back by the same people; a new copy keeps it off
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
let andyId = "", kenId = "", outsiderId = "", larisaId = "";
let andy = "", ken = "", outsider = "", larisa = "";

beforeAll(async () => {
  tripId = (await prisma.trip.create({ data: { name: TRIP, status: "archived" } })).id;
  otherTripId = (await prisma.trip.create({ data: { name: `${TRIP} (other)`, status: "archived" } })).id;
  const mk = async (name: string) => prisma.traveler.upsert({ where: { displayName: name }, update: {}, create: { displayName: name } });
  const a = await mk("MBAndy B"), k = await mk("MBKen"), o = await mk("MBOutsider"), l = await mk("MBLarisa");
  andyId = a.id; kenId = k.id; outsiderId = o.id; larisaId = l.id;
  // (Ken set the trip up: its first member is its organizer)
  const t0 = Date.now() - 60_000;
  for (const [i, t] of [k, l, a].entries()) await prisma.tripMember.create({ data: { tripId, travelerId: t.id, role: i < 2 ? "planner" : "traveler", joinedAt: new Date(t0 + i * 1000) } });
  larisa = signToken({ code: "MBLarisa", displayName: "MBLarisa", travelerId: l.id });
  andy = signToken({ code: "MBAndy B", displayName: "MBAndy B", travelerId: a.id });
  ken = signToken({ code: "MBKen", displayName: "MBKen", travelerId: k.id });
  outsider = signToken({ code: "MBOutsider", displayName: "MBOutsider", travelerId: o.id });
  cityId = (await prisma.city.create({ data: { tripId, name: "Mossvale", sequenceOrder: 1 } })).id;
  otherCityId = (await prisma.city.create({ data: { tripId: otherTripId, name: "Elsewhere", sequenceOrder: 1 } })).id;
  herIdea = (await prisma.experience.create({ data: { tripId, cityId, name: "Lantern museum", sheetRowRef: "Activities Template|Lantern museum", createdBy: "MBLarisa" } })).id;
  await replaceGuideMarks(prisma, herIdea, tripId, ["Larisa", "Julie"]);
});
afterAll(async () => {
  await prisma.trip.deleteMany({ where: { name: { startsWith: TRIP } } });
  await prisma.traveler.deleteMany({ where: { displayName: { in: ["MBAndy B", "MBKen", "MBOutsider", "MBLarisa"] } } }).catch(() => {});
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

describe("off the list (Remove)", () => {
  const del = (id: string, token: string) => request(app).delete(`/api/maybes/${id}`).set("Authorization", `Bearer ${token}`);
  const back = (id: string, token: string) => request(app).post(`/api/maybes/${id}/back`).set("Authorization", `Bearer ${token}`);
  const row = (id: string) => prisma.experience.findUnique({ where: { id } });

  it("whoever put it there, or the organizer — nobody else; nothing is deleted; a day plan keeps it", async () => {
    const m = await as(andy).post("/api/maybes").send({ tripId, cityId, words: "never mind — sake bar at 5?" });
    await prisma.dayChoice.create({ data: { tripId, date: "2027-01-02", text: "sake bar at 5", experienceId: m.body.id, travelerId: andyId } });
    const no = await del(m.body.id, larisa);
    expect(no.status).toBe(403);
    expect(no.body.error).toBe("That's MBAndy's maybe — only MBAndy or MBKen can take it off the list.");
    const notHers = await del(herIdea, andy);
    expect(notHers.status).toBe(403);
    expect(notHers.body.error).toBe("That's from MBLarisa's Guide — only MBLarisa or MBKen can take it off the list.");
    expect([403, 404]).toContain((await del(m.body.id, outsider)).status);
    expect((await row(herIdea))?.removedAt).toBeNull();
    const off = await del(m.body.id, andy);
    expect(off.status).toBe(200);
    expect((await row(m.body.id))?.removedBy).toBe("MBAndy B");
    expect((await prisma.dayChoice.findFirst({ where: { tripId, text: "sake bar at 5" } }))?.experienceId).toBe(m.body.id);
    // again (a second phone, a double tap): fine, still off
    expect((await del(m.body.id, andy)).status).toBe(200);
    // not news any more
    expect((await as(ken).get(`/api/maybes/recent/${tripId}`)).body.maybes.some((x: any) => x.id === m.body.id)).toBe(false);
  });

  it("the organizer takes her idea off; only she or he puts it back", async () => {
    expect((await del(herIdea, ken)).status).toBe(200);
    expect((await row(herIdea))?.removedBy).toBe("MBKen");
    const list = await as(andy).get(`/api/experiences/trip/${tripId}`);
    expect(list.body.find((e: any) => e.id === herIdea).removedBy).toBe("MBKen");
    const no = await back(herIdea, andy);
    expect(no.status).toBe(403);
    expect(no.body.error).toBe("Only MBLarisa or MBKen can put that back on the list.");
    expect((await back(herIdea, larisa)).status).toBe(200);
    expect((await row(herIdea))?.removedAt).toBeNull();
    // her marks and Wander's I'm in were never touched
    expect(await marks(herIdea)).toContain("Larisa");
  });

  it("the organizer can take anyone's maybe off, and the seen rows say who the organizer is", async () => {
    const m = await as(andy).post("/api/maybes").send({ tripId, cityId, words: "the night market?" });
    expect((await del(m.body.id, ken)).status).toBe(200);
    expect((await back(m.body.id, andy)).status).toBe(200);
    const seen = await as(andy).get(`/api/maybes/seen/${tripId}`);
    expect(seen.body.filter((p: any) => p.organizer).map((p: any) => p.name)).toEqual(["MBKen"]);
  });

  it("a new copy of her Guide keeps it off — renamed, it stays off; gone with nothing on it, it goes", async () => {
    const town = (await prisma.city.create({ data: { tripId, name: "Reedby", sequenceOrder: 3 } })).id;
    const old = (await prisma.experience.create({ data: { tripId, cityId: town, name: "Indigo dye studio", sheetRowRef: "Activities Template|Indigo dye studio", createdBy: "MBLarisa" } })).id;
    const lone = (await prisma.experience.create({ data: { tripId, cityId: town, name: "Clock tower", sheetRowRef: "Activities Template|Clock tower", createdBy: "MBLarisa" } })).id;
    await del(old, ken);
    await del(lone, ken);
    const renamed = (await prisma.experience.create({ data: { tripId, cityId: town, name: "Indigo dye studio (morning)", sheetRowRef: "Activities Template|Indigo dye studio (morning)", createdBy: "MBLarisa" } })).id;
    const report = { warnings: [] as string[] };
    const keep = ["Activities Template|Lantern museum", "Activities Template|Paper lantern workshop (evening)", "Activities Template|Indigo dye studio (morning)"];
    await prisma.$transaction((tx) => keepWhatPeopleAdded(tx, tripId, keep, [{ id: renamed, cityId: town, name: "Indigo dye studio (morning)" }], report));
    expect((await row(renamed))?.removedBy).toBe("MBKen");
    // (the import deletes what's gone and unmarked right after; the lone one wasn't kept as "no longer in her Guide")
    expect((await row(lone))?.sheetRowRef).toBe("Activities Template|Clock tower");
  });

  it("Scout: remove_from_maybes and put_back_on_maybes, the same rules; take_back_maybe still works", async () => {
    const m = await as(andy).post("/api/maybes").send({ tripId, cityId, words: "karaoke later?" });
    const asLarisa = { code: "MBLarisa", displayName: "MBLarisa", travelerId: larisaId } as any;
    const asKen = { code: "MBKen", displayName: "MBKen", travelerId: kenId } as any;
    const asAndy = { code: "MBAndy B", displayName: "MBAndy B", travelerId: andyId } as any;
    expect((await executeTool("remove_from_maybes", { experienceId: m.body.id }, asLarisa)).result.error).toMatch(/only MBAndy or MBKen/);
    expect((await executeTool("remove_from_maybes", { experienceId: m.body.id }, asKen)).actionDescription).toBe(`Off Mossvale's maybes: "karaoke later?"`);
    expect((await executeTool("put_back_on_maybes", { experienceId: m.body.id }, asAndy)).actionDescription).toBe(`Back on Mossvale's maybes: "karaoke later?"`);
    expect((await executeTool("take_back_maybe", { experienceId: m.body.id }, asAndy)).actionDescription).toBe(`Off Mossvale's maybes: "karaoke later?"`);
    expect((await row(m.body.id))?.removedBy).toBe("MBAndy B");
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
  it("Home's Recent activity: an I'm in taken back, a no-longer-in and a put-back aren't news; a removal hides the item", async () => {
    const town = (await prisma.city.create({ data: { tripId, name: "Feedham", sequenceOrder: 4 } })).id;
    const idea = (await prisma.experience.create({ data: { tripId, cityId: town, name: "Rope bridge walk", sheetRowRef: "Activities Template|Rope bridge walk", createdBy: "MBLarisa" } })).id;
    await as(andy).post(`/api/maybes/${idea}/in`).send({ on: true });
    await as(andy).post(`/api/maybes/${idea}/in`).send({ on: false });
    await as(ken).post(`/api/maybes/${idea}/in`).send({ on: true });
    const feed = async () => (await as(ken).get(`/api/activity-feed/trip/${tripId}?limit=50`)).body.feed.map((f: any) => `${f.userDisplayName}: ${f.description}`).filter((d: string) => d.includes("Rope bridge"));
    expect(await feed()).toEqual([`MBKen: MBKen is in on "Rope bridge walk"`]);
    await request(app).delete(`/api/maybes/${idea}`).set("Authorization", `Bearer ${ken}`);
    expect(await feed()).toEqual([]);
    await as(larisa).post(`/api/maybes/${idea}/back`);
    // (back on the list: what people said shows again; the taking off and putting back don't)
    expect(await feed()).toEqual([`MBKen: MBKen is in on "Rope bridge walk"`]);
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
