/**
 * WHO SEES A PAPER (Oct 25 2026). Ken, on the Baian ryokan's welcome sheet: "At this screen should be able to zoom in or
 * change the distribution between self and group" · "If a note added for group alert each person on next login that
 * the doc is available with a small picture that can expand".
 * - a paper is its keeper's until shared; shared with everyone, each other person on the trip sees it, and gets ONE card
 *   (GET /api/alerts/pending) carrying a small picture and the full one; another trip's people never
 * - kept back again, or removed: gone from the others and the card taken back; shared again: one card, not two
 * - only the keeper changes it; bad values are refused; "pair" only for someone who shares papers (Ken and Larisa)
 * - Scout: share_paper does the same; THEIR PAPERS says who sees each
 * - a paper read with no day on it goes under the day it was kept
 * Invented data (names that aren't Ken or Larisa, so the pair never applies).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-papers-share";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { executeTool } = await import("../src/routes/chat.js");
const { paperLines, shareOf } = await import("../src/services/papers.js");
const prisma = new PrismaClient();

const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
let tripId = "", otherTrip = "", paperId = "";
const who = (n: string) => ({ code: n, displayName: n, travelerId: ids[n] });
const as = (n: string) => ({ Authorization: `Bearer ${tok[n]}` });
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/", "base64");

beforeAll(async () => {
  for (const n of ["PSKeeper", "PSFriend", "PSThird", "PSOutsider"]) {
    const t = (await prisma.traveler.findFirst({ where: { displayName: n } })) || await prisma.traveler.create({ data: { displayName: n } });
    ids[n] = t.id; tok[n] = signToken({ code: n, displayName: n, travelerId: t.id });
  }
  tripId = (await prisma.trip.create({ data: { name: "PS Trip", status: "archived", timeZone: "Asia/Tokyo", startDate: new Date("2031-10-05"), endDate: new Date("2031-10-29") } })).id;
  otherTrip = (await prisma.trip.create({ data: { name: "PS Other", status: "archived", timeZone: "Asia/Tokyo", startDate: new Date("2031-11-05"), endDate: new Date("2031-11-09") } })).id;
  await prisma.tripMember.create({ data: { tripId, travelerId: ids.PSKeeper, role: "planner", joinedAt: new Date("2031-01-01") } });
  await prisma.tripMember.create({ data: { tripId, travelerId: ids.PSFriend, joinedAt: new Date("2031-02-01") } });
  await prisma.tripMember.create({ data: { tripId, travelerId: ids.PSThird, joinedAt: new Date("2031-03-01") } });
  await prisma.tripMember.create({ data: { tripId: otherTrip, travelerId: ids.PSOutsider, joinedAt: new Date("2031-01-01") } });
  paperId = (await prisma.tripPaper.create({ data: { tripId, travelerId: ids.PSKeeper, authorName: "PSKeeper", dayDate: "2031-10-25", title: "Ryokan welcome sheet",
    summary: "Dinner at 6, 6:30 or 7 PM; breakfast 8–9:30; check-out noon; Wi-Fi on each floor.", mimeType: "image/jpeg", bytes: JPEG, thumb: JPEG } })).id;
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.trip.delete({ where: { id: otherTrip } }).catch(() => {});
  await prisma.$disconnect();
});
const list = async (n: string, trip = tripId) => (await request(app).get(`/api/papers/trip/${trip}`).set(as(n))).body.papers as { id: string; share: string; mine: boolean }[] | undefined;
const pending = async (n: string) => (await request(app).get("/api/alerts/pending").set(as(n))).body.alerts as { id: string; from: string; paper?: { id: string; title: string; url: string; smallUrl: string | null } }[];
const share = (n: string, s: unknown, id = paperId) => request(app).post(`/api/papers/${id}/share`).set(as(n)).send({ share: s });

describe("who sees a paper", () => {
  it("as kept: only its keeper", async () => {
    expect((await list("PSKeeper"))!.map((p) => [p.id, p.share, p.mine])).toEqual([[paperId, "me", true]]);
    expect(await list("PSFriend")).toEqual([]);
    expect(await pending("PSFriend")).toEqual([]);
  });
  it("only the keeper changes it; bad values and made-up ids are refused", async () => {
    expect((await share("PSFriend", "group")).status).toBe(403);
    expect((await share("PSKeeper", "everyone")).status).toBe(400);
    expect((await share("PSKeeper", undefined)).status).toBe(400);
    expect((await share("PSKeeper", "group", "no-such-paper")).status).toBe(404);
    // ("the two of you" — nobody shares papers with this keeper)
    expect((await share("PSKeeper", "pair")).status).toBe(400);
    expect(await list("PSFriend")).toEqual([]);
    expect(await prisma.tripAlert.count({ where: { paperId } })).toBe(0);
  });
  it("shared with everyone: the others see it, with one card each carrying its small picture; never another trip", async () => {
    const r = await share("PSKeeper", "group");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ share: "group", told: ["PSFriend", "PSThird"] });
    expect((await list("PSFriend"))!.map((p) => [p.id, p.share, p.mine])).toEqual([[paperId, "group", false]]);
    expect((await list("PSThird"))!.length).toBe(1);
    const card = (await pending("PSFriend"))[0];
    expect(card.from).toBe("PSKeeper");
    expect(card.paper).toMatchObject({ id: paperId, title: "Ryokan welcome sheet" });
    expect(card.paper!.smallUrl).toMatch(/small=1/);
    // (the links open the picture without a sign-in, as an <img> needs)
    expect((await request(app).get(card.paper!.smallUrl!)).status).toBe(200);
    expect((await request(app).get(card.paper!.url)).headers["content-type"]).toMatch(/image\/jpeg/);
    expect(await pending("PSKeeper")).toEqual([]);
    expect(await pending("PSOutsider")).toEqual([]);
    expect((await request(app).get(`/api/papers/trip/${tripId}`).set(as("PSOutsider"))).status).toBe(403);
  });
  it("shared again while the card shows: still one card", async () => {
    expect((await share("PSKeeper", "group")).status).toBe(200);
    expect(await prisma.tripAlert.count({ where: { paperId } })).toBe(1);
  });
  it("Got it: gone from that person's screen; the paper stays theirs to see", async () => {
    const card = (await pending("PSFriend"))[0];
    await request(app).post(`/api/alerts/${card.id}/seen`).set(as("PSFriend")).send({ state: "got" });
    expect(await pending("PSFriend")).toEqual([]);
    expect((await list("PSFriend"))!.length).toBe(1);
    expect((await pending("PSThird")).length).toBe(1);
  });
  it("kept back again: gone from the others, the card taken back (never deleted), and its open picture refused", async () => {
    const card = (await pending("PSThird"))[0];
    expect((await share("PSKeeper", "me")).body.share).toBe("me");
    expect(await list("PSThird")).toEqual([]);
    expect(await pending("PSThird")).toEqual([]);
    expect(await prisma.tripAlert.count({ where: { paperId } })).toBe(1);
    // (a card still on their screen: its picture no longer opens for them)
    expect((await request(app).get(card.paper!.url)).status).toBe(403);
    expect((await request(app).get(card.paper!.smallUrl!)).status).toBe(403);
  });
  it("shared again: the same card comes back — not to whoever already tapped Got it", async () => {
    const r = await share("PSKeeper", "group");
    expect(r.status).toBe(200);
    // (the keeper is told only who the card reaches)
    expect(r.body.told).toEqual(["PSThird"]);
    expect(await prisma.tripAlert.count({ where: { paperId } })).toBe(1);
    expect(await pending("PSFriend")).toEqual([]);
    expect((await pending("PSThird")).map((a) => a.paper?.id)).toEqual([paperId]);
    await share("PSKeeper", "me");
  });
  it("Scout's share_paper does the same, and THEIR PAPERS says who sees it", async () => {
    const r = await executeTool("share_paper", { paperId, with: "group" }, who("PSKeeper"));
    // (PSFriend already tapped Got it on this paper's card: it reaches PSThird only)
    expect(r.result).toMatchObject({ share: "group", cardTo: ["PSThird"] });
    expect((await pending("PSThird")).map((a) => a.paper?.id)).toEqual([paperId]);
    expect((await paperLines(tripId, ids.PSKeeper))[0]).toMatch(/they shared it with everyone/);
    expect((await paperLines(tripId, ids.PSThird))[0]).toMatch(/Wi-Fi.*kept by PSKeeper, shared with everyone/);
    // (the words printed on it go to Scout too — the summary said only that the sheet lists the Wi-Fi)
    await prisma.tripPaper.update({ where: { id: paperId }, data: { text: "Wi-Fi 2F: ps-2F\npassword: kyoto2222" } });
    expect((await paperLines(tripId, ids.PSThird))[0]).toMatch(/Printed on it: Wi-Fi 2F: ps-2F \/ password: kyoto2222/);
    expect((await executeTool("share_paper", { paperId, with: "me" }, who("PSFriend"))).result.error).toMatch(/Only the person/);
    expect((await executeTool("share_paper", { paperId, with: "all" }, who("PSKeeper"))).result.error).toBeTruthy();
    expect((await executeTool("share_paper", { paperId: "nope", with: "group" }, who("PSKeeper"))).result.error).toBeTruthy();
  });
  it("removed by its keeper: gone for everyone, its card too", async () => {
    expect((await request(app).post(`/api/papers/${paperId}/remove`).set(as("PSKeeper"))).status).toBe(200);
    expect(await list("PSFriend")).toEqual([]);
    expect(await pending("PSThird")).toEqual([]);
    expect((await share("PSKeeper", "group")).status).toBe(404);
  });
});

describe("what a stored choice means", () => {
  it("null is the pair for someone who shares papers, else just them", () => {
    expect(shareOf(null, true)).toBe("pair");
    expect(shareOf(null, false)).toBe("me");
    expect(shareOf("me", true)).toBe("me");
    expect(shareOf("group", false)).toBe("group");
  });
});
