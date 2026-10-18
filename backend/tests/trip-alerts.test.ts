/**
 * "LET EVERYONE KNOW" (Oct 18 2026). Ken: "Alert on next login function from anyone using anything to scout like 'let
 * everyone know' with 'got it' and 'remind me' as options. This is for logistics not general messaging."
 * - tell_everyone: to everyone else on the trip; the same words again within ten minutes are the same one
 * - each other member sees it (GET /api/alerts/pending) until Got it; Remind me brings it back after an hour
 * - never the sender's own; never one taken back; never another trip's
 * - my_alerts: who has seen what; take back — the sender or the trip's first member only, hidden never deleted
 * - and Stop (POST /api/chat/stop): a stopped question gets 409, nothing saved
 * Invented data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-trip-alerts";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { executeTool } = await import("../src/routes/chat.js");
const prisma = new PrismaClient();

let tripId = "", otherTrip = "";
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const who = (n: string) => ({ code: n, displayName: n, travelerId: ids[n] });
beforeAll(async () => {
  for (const n of ["TAFirst", "TASecond", "TAThird", "TAOutsider"]) {
    const t = (await prisma.traveler.findFirst({ where: { displayName: n } })) || await prisma.traveler.create({ data: { displayName: n } });
    ids[n] = t.id; tok[n] = signToken({ code: n, displayName: n, travelerId: t.id });
  }
  tripId = (await prisma.trip.create({ data: { name: "TA Trip", status: "archived", timeZone: "Asia/Tokyo", startDate: new Date("2031-10-05"), endDate: new Date("2031-10-29") } })).id;
  otherTrip = (await prisma.trip.create({ data: { name: "TA Other Trip", status: "archived", timeZone: "Asia/Tokyo", startDate: new Date("2031-11-05"), endDate: new Date("2031-11-09") } })).id;
  await prisma.tripMember.create({ data: { tripId, travelerId: ids.TAFirst, role: "planner", joinedAt: new Date("2031-01-01") } });
  await prisma.tripMember.create({ data: { tripId, travelerId: ids.TASecond, joinedAt: new Date("2031-02-01") } });
  await prisma.tripMember.create({ data: { tripId, travelerId: ids.TAThird, joinedAt: new Date("2031-03-01") } });
  await prisma.tripMember.create({ data: { tripId: otherTrip, travelerId: ids.TAOutsider, joinedAt: new Date("2031-01-01") } });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.trip.delete({ where: { id: otherTrip } }).catch(() => {});
  await prisma.$disconnect();
});
const pending = async (n: string) => (await request(app).get("/api/alerts/pending").set("Authorization", `Bearer ${tok[n]}`)).body.alerts as { id: string; text: string; from: string }[];

describe("let everyone know", () => {
  let first = "";
  it("unconfirmed, nothing is sent: Scout shows the words first", async () => {
    const r = await executeTool("tell_everyone", { tripId, words: "Bus leaves at 8:15, not 8:30." }, who("TASecond"));
    expect(r.result.notSentYet).toBe(true);
    expect(r.result.say).toMatch(/Got it\. Here's what I'll send: “Bus leaves at 8:15, not 8:30\.”/);
    expect(await prisma.tripAlert.count({ where: { tripId } })).toBe(0);
  });
  it("tell_everyone sends to everyone else once confirmed, and says who", async () => {
    const r = await executeTool("tell_everyone", { tripId, words: "Bus leaves at 8:15, not 8:30.", confirmed: true }, who("TASecond"));
    expect(r.result.sent).toBe(true);
    expect(r.result.to).toEqual(["TAFirst", "TAThird"]);
    first = r.result.id;
  });
  it("the same words again soon are the same one", async () => {
    const r = await executeTool("tell_everyone", { tripId, words: "  Bus leaves at 8:15, not 8:30.  ", confirmed: true }, who("TASecond"));
    expect(r.result.id).toBe(first);
    expect(await prisma.tripAlert.count({ where: { tripId } })).toBe(1);
  });
  it("nothing to send, or not on the trip, is refused", async () => {
    expect((await executeTool("tell_everyone", { tripId, words: "   ", confirmed: true }, who("TASecond"))).result.error).toBeTruthy();
    expect((await executeTool("tell_everyone", { tripId, words: "Hi", confirmed: true }, who("TAOutsider"))).result.error).toBeTruthy();
    expect((await executeTool("tell_everyone", { tripId: "no-such-trip", words: "Hi", confirmed: true }, who("TASecond"))).result.error).toBeTruthy();
  });
  it("the others see it; the sender and another trip's people don't", async () => {
    expect((await pending("TAFirst")).map((a) => a.id)).toEqual([first]);
    expect((await pending("TAThird"))[0].from).toBe("TASecond");
    expect(await pending("TASecond")).toEqual([]);
    expect(await pending("TAOutsider")).toEqual([]);
  });
  it("Got it: gone for that person only", async () => {
    const r = await request(app).post(`/api/alerts/${first}/seen`).set("Authorization", `Bearer ${tok.TAFirst}`).send({ state: "got" });
    expect(r.status).toBe(200);
    expect(await pending("TAFirst")).toEqual([]);
    expect((await pending("TAThird")).length).toBe(1);
  });
  it("Remind me: gone for the rest of the day (Japan's date), back the next day", async () => {
    await request(app).post(`/api/alerts/${first}/seen`).set("Authorization", `Bearer ${tok.TAThird}`).send({ state: "later" });
    expect(await pending("TAThird")).toEqual([]);
    // (two hours later the same day: still away — Ken: "start with the first login the following day")
    const sameDay = new Date(Date.now() - 2 * 3600_000);
    if (new Date(sameDay.getTime() + 9 * 3600_000).toISOString().slice(0, 10) === new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)) {
      await prisma.tripAlertSeen.updateMany({ where: { alertId: first, travelerId: ids.TAThird }, data: { at: sameDay } });
      expect(await pending("TAThird")).toEqual([]);
    }
    await prisma.tripAlertSeen.updateMany({ where: { alertId: first, travelerId: ids.TAThird }, data: { at: new Date(Date.now() - 26 * 3600_000) } });
    expect((await pending("TAThird")).map((a) => a.id)).toEqual([first]);
  });
  it("gone once its moment has passed, or after 3 days; a moment already passed isn't sent", async () => {
    const soon = new Date(Date.now() + 9 * 3600_000 + 2 * 3600_000).toISOString().slice(0, 16);
    const r = await executeTool("tell_everyone", { tripId, words: "Meet in the lobby in two hours.", confirmed: true, until: soon }, who("TASecond"));
    expect(r.result.sent).toBe(true);
    expect((await pending("TAFirst")).map((a) => a.text)).toContain("Meet in the lobby in two hours.");
    await prisma.tripAlert.update({ where: { id: r.result.id }, data: { until: new Date(Date.now() - 60_000) } });
    expect((await pending("TAFirst")).map((a) => a.text)).not.toContain("Meet in the lobby in two hours.");
    const past = new Date(Date.now() + 9 * 3600_000 - 3600_000).toISOString().slice(0, 16);
    expect((await executeTool("tell_everyone", { tripId, words: "Too late.", confirmed: true, until: past }, who("TASecond"))).result.error).toMatch(/passed/);
    expect((await executeTool("tell_everyone", { tripId, words: "Bad time.", confirmed: true, until: "tomorrow" }, who("TASecond"))).result.error).toBeTruthy();
    const old = await executeTool("tell_everyone", { tripId, words: "Old news.", confirmed: true }, who("TASecond"));
    await prisma.tripAlert.update({ where: { id: old.result.id }, data: { createdAt: new Date(Date.now() - 3 * 86_400_000 - 60_000) } });
    expect((await pending("TAFirst")).map((a) => a.text)).not.toContain("Old news.");
    await prisma.tripAlert.deleteMany({ where: { tripId, text: { in: ["Meet in the lobby in two hours.", "Old news."] } } });
  });
  it("bad answers are refused: a wrong state, someone off the trip, a made-up id", async () => {
    expect((await request(app).post(`/api/alerts/${first}/seen`).set("Authorization", `Bearer ${tok.TAThird}`).send({ state: "maybe" })).status).toBe(400);
    expect((await request(app).post(`/api/alerts/${first}/seen`).set("Authorization", `Bearer ${tok.TAOutsider}`).send({ state: "got" })).status).toBe(404);
    expect((await request(app).post(`/api/alerts/nope/seen`).set("Authorization", `Bearer ${tok.TAThird}`).send({ state: "got" })).status).toBe(404);
    expect((await request(app).get("/api/alerts/pending")).status).toBe(401);
  });
  it("my_alerts says who has seen it, by name", async () => {
    const r = await executeTool("my_alerts", { tripId }, who("TASecond"));
    expect(r.result.sent[0]).toMatchObject({ gotIt: ["TAFirst"], remindLater: ["TAThird"], noTapYet: [] });
    // (the trip's first member sees everyone's; another member only their own)
    expect((await executeTool("my_alerts", { tripId }, who("TAFirst"))).result.sent.length).toBe(1);
    expect((await executeTool("my_alerts", { tripId }, who("TAThird"))).result.sent.length).toBe(0);
  });
  it("take back: not someone else's; the first member may; a made-up id says so; never deleted", async () => {
    expect((await executeTool("my_alerts", { tripId, takeBack: first }, who("TAThird"))).result.error).toMatch(/Only/);
    expect((await executeTool("my_alerts", { tripId, takeBack: "nope" }, who("TASecond"))).result.error).toBeTruthy();
    expect((await executeTool("my_alerts", { tripId, takeBack: first }, who("TAFirst"))).result.takenBack).toBe(true);
    expect(await pending("TAThird")).toEqual([]);
    expect(await prisma.tripAlert.count({ where: { id: first } })).toBe(1);
    // (taken back twice is still done)
    expect((await executeTool("my_alerts", { tripId, takeBack: first }, who("TASecond"))).result.takenBack).toBe(true);
  });
});

describe("Stop", () => {
  it("a stopped question gets 409 and nothing is saved; a bad tag is refused", async () => {
    const askId = `ta-stop-${Date.now()}`;
    expect((await request(app).post("/api/chat/stop").set("Authorization", `Bearer ${tok.TASecond}`).send({ askId })).status).toBe(200);
    process.env.SCOUT_STUB = "1";
    const r = await request(app).post("/api/chat").set("Authorization", `Bearer ${tok.TASecond}`).send({ message: "When is dinner?", context: { page: "Home", tripId }, history: [], askId });
    delete process.env.SCOUT_STUB;
    expect(r.status).toBe(409);
    expect(await prisma.chatMessage.count({ where: { tripId, travelerId: ids.TASecond } })).toBe(0);
    expect((await request(app).post("/api/chat/stop").set("Authorization", `Bearer ${tok.TASecond}`).send({ askId: "x" })).status).toBe(400);
  });
});
