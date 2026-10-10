/**
 * SCOUT'S FIRST WORD FOR JULIE (Oct 10 2026). Julie joked about getting Scout's help to pack; Ken: "Julie only. If it is
 * something useful, Andy should be able to say 'I want that too' and Scout should know, but don't impose it on him."
 * - Julie's empty Scout shows Ken's framing and one question to tap — until Oct 13 ends in Japan, and not once she's asked
 * - nobody else gets it (Andy included)
 * - the packing list Scout answers from is the checked one: a handful of items, each with why, rules with official sources
 * Invented accounts ("Julie Q." stands for a first name and an initial, as her invite makes it) on a throwaway trip.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-scout-hello";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { executeTool } = await import("../src/routes/chat.js");
const { helloFor, answerHello } = await import("../src/services/scoutHello.js");
const { PACKING } = await import("../src/services/packing.js");
const prisma = new PrismaClient();

let tripId = "", julieId = "", andyId = "", julie = "", andy = "";
const BEFORE = new Date("2026-10-11T03:00:00Z"), AFTER = new Date("2026-10-13T15:00:01Z");
beforeAll(async () => {
  const mk = async (n: string) => (await prisma.traveler.findFirst({ where: { displayName: n } })) || prisma.traveler.create({ data: { displayName: n } });
  const j = await mk("Julie Q."), a = await mk("Andy B");
  julieId = j.id; andyId = a.id;
  tripId = (await prisma.trip.create({ data: { name: "SH Trip", status: "archived", timeZone: "Asia/Tokyo", startDate: new Date("2026-10-05"), endDate: new Date("2026-10-29") } })).id;
  await prisma.tripMember.createMany({ data: [{ tripId, travelerId: j.id, role: "member" }, { tripId, travelerId: a.id, role: "member" }] });
  julie = signToken({ code: "Julie Q.", displayName: "Julie Q.", travelerId: j.id });
  andy = signToken({ code: "Andy B", displayName: "Andy B", travelerId: a.id });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("Scout's first word for Julie", () => {
  it("Julie gets Ken's framing and one question, until Oct 13 ends in Japan", async () => {
    const h = await helloFor(tripId, julieId, "Julie Q.", BEFORE);
    expect(h?.words).toMatch(/^Ken mentioned your quip about packing/);
    expect(h?.ask).toMatch(/pack/i);
    expect(await helloFor(tripId, julieId, "Julie Q.", AFTER)).toBeNull();
  });
  it("nobody else gets it — Andy included", async () => {
    expect(await helloFor(tripId, andyId, "Andy B", BEFORE)).toBeNull();
    expect(await helloFor(tripId, andyId, "Andy", BEFORE)).toBeNull();
    expect(await helloFor(tripId, andyId, "Julie (old April account)", BEFORE)).toBeNull();
    expect(await helloFor(tripId, andyId, "Julianne", BEFORE)).toBeNull();
    // (her account as renamed on Oct 10: "Julie")
    expect((await helloFor(tripId, julieId, "Julie", BEFORE))?.ask).toMatch(/pack/i);
  });
  it("it comes with the conversation Scout loads (Julie's only)", async () => {
    const live = Date.now() < Date.parse("2026-10-13T15:00:00Z");
    const j = await request(app).get(`/api/chat/history?tripId=${tripId}`).set("Authorization", `Bearer ${julie}`);
    expect(j.status).toBe(200);
    if (live) expect(j.body.hello?.ask).toMatch(/pack/i);
    else expect(j.body.hello).toBeUndefined();
    const a = await request(app).get(`/api/chat/history?tripId=${tripId}`).set("Authorization", `Bearer ${andy}`);
    expect(a.body.hello).toBeUndefined();
  });
  it("Later: back after a while, at most three offers, the last without Later (Ken: \"a show me later option\")", async () => {
    const at = (h: number) => new Date(BEFORE.getTime() + h * 3600_000);
    expect((await helloFor(tripId, julieId, "Julie Q.", at(0)))?.last).toBe(false);
    await answerHello(julieId, "Julie Q.", "later", at(0));
    expect(await helloFor(tripId, julieId, "Julie Q.", at(1))).toBeNull();          // not right away
    // (a second Later from another phone within the wait is the same one)
    await answerHello(julieId, "Julie Q.", "later", at(2));
    expect((await helloFor(tripId, julieId, "Julie Q.", at(6.5)))?.last).toBe(false); // back, the second offer
    await answerHello(julieId, "Julie Q.", "later", at(7));
    expect((await helloFor(tripId, julieId, "Julie Q.", at(13.5)))?.last).toBe(true); // the third offer is the last
    await answerHello(julieId, "Julie Q.", "later", at(14));
    expect(await helloFor(tripId, julieId, "Julie Q.", at(21))).toBeNull();          // three offers: done
    // (her other choices are kept as they were)
    await prisma.traveler.update({ where: { id: julieId }, data: { preferences: { tour: { offers: 1 } } } });
  });
  it("No thanks ends it; only her account can answer it", async () => {
    const r = await request(app).post("/api/chat/hello").set("Authorization", `Bearer ${julie}`).send({ answer: "no" });
    expect(r.status).toBe(200);
    // (answered for real only while the offer runs — until Oct 13 ends in Japan)
    if (Date.now() < Date.parse("2026-10-13T15:00:00Z")) expect(await helloFor(tripId, julieId, "Julie Q.", BEFORE)).toBeNull();
    const t = await prisma.traveler.findUnique({ where: { id: julieId }, select: { preferences: true } });
    expect((t!.preferences as any).tour).toEqual({ offers: 1 });
    const a = await request(app).post("/api/chat/hello").set("Authorization", `Bearer ${andy}`).send({ answer: "later" });
    expect(a.body.ok).toBe(false);
    // (start over for the next test)
    await prisma.traveler.update({ where: { id: julieId }, data: { preferences: {} } });
  });
  it("once she's asked, it's gone", async () => {
    const h = (await helloFor(tripId, julieId, "Julie Q.", BEFORE))!;
    await prisma.chatMessage.create({ data: { tripId, travelerId: julieId, role: "user", content: h.ask } });
    expect(await helloFor(tripId, julieId, "Julie Q.", BEFORE)).toBeNull();
  });
});

describe("the packing list Scout answers from", () => {
  it("a handful of items, each with why; rules carry an official source", async () => {
    const r = await executeTool("packing_tips", { tripId }, { code: "Andy B", displayName: "Andy B", travelerId: andyId });
    expect(r.result).toBe(PACKING);
    expect(PACKING.items.length).toBeGreaterThanOrEqual(5);
    expect(PACKING.items.length).toBeLessThanOrEqual(8);
    // (the list is the researched one — never the stand-in used while it was being checked)
    expect(JSON.stringify(PACKING)).not.toMatch(/DRAFT/);
    for (const i of PACKING.items) {
      expect(i.say.length).toBeGreaterThan(10);
      expect(i.why.length).toBeGreaterThan(10);
      if (i.rule) expect(i.source).toMatch(/^https:\/\//);
    }
  });
});
