/**
 * DAY SUMMARIES (Oct 2 2026, Ken: "2-3 sentences summarizing the theme of the day"). Written from her lines, read by a
 * person, published — and shown only while the day is exactly what it was written from:
 * - a published summary shows for its day
 * - when a new Guide copy changes that day (a time, a title, a picture's words), it's hidden until rewritten
 * - another day's unchanged summary still shows
 * - only the trip's people get them
 * - the instruction keeps to her lines, the people actually there, and her voice
 * Invented data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-day-summaries";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { dayHashes, currentSummaries, summaryPrompt } = await import("../src/services/guide/daySummaries.js");
const prisma = new PrismaClient();

let tripId = "", member = "", outsider = "", dinnerId = "";

beforeAll(async () => {
  tripId = (await prisma.trip.create({ data: { name: "Day Summaries Trip", status: "archived", timeZone: "Asia/Tokyo" } })).id;
  const snap = await prisma.guideSnapshot.create({ data: { tripId, sourceName: "ds.xlsx", sourceKind: "xlsx", contentHash: "ds", tabs: [] } });
  const mk = (title: string, date: string, time: string | null) => prisma.guideItem.create({ data: { tripId, snapshotId: snap.id, kind: "plan", title, date: new Date(`${date}T00:00:00Z`), time, source: "Town Day 1 · Stops", sourceRef: "Town Day 1!A1" } });
  await mk("Clay market", "2027-05-03", "09:00");
  dinnerId = (await mk("Dinner at the noodle house", "2027-05-03", "19:00")).id;
  await mk("Hike to the shrine", "2027-05-04", "08:00");
  await prisma.sheetSyncConfig.create({ data: { tripId, spreadsheetId: "", tabMappings: { source: "snapshot" } } });
  const h = await dayHashes(tripId);
  await prisma.sheetSyncConfig.update({ where: { tripId }, data: { tabMappings: { source: "snapshot", daySummaries: {
    "2027-05-03": { text: "A clay day, with the noodle house at 7:00 PM to finish.", hash: h["2027-05-03"].hash, writtenAt: "2027-04-01T00:00:00Z" },
    "2027-05-04": { text: "A morning hike to the shrine.", hash: h["2027-05-04"].hash, writtenAt: "2027-04-01T00:00:00Z" },
  } } } });
  const mkT = async (n: string) => (await prisma.traveler.findFirst({ where: { displayName: n } })) || prisma.traveler.create({ data: { displayName: n } });
  const a = await mkT("DSMember"), o = await mkT("DSOutsider");
  await prisma.tripMember.create({ data: { tripId, travelerId: a.id, role: "traveler" } });
  member = signToken({ code: "DSMember", displayName: "DSMember", travelerId: a.id });
  outsider = signToken({ code: "DSOutsider", displayName: "DSOutsider", travelerId: o.id });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("a day's summary", () => {
  it("shows for its day, to the trip's people only", async () => {
    const ok = await request(app).get(`/api/guide/day-summaries/${tripId}`).set("Authorization", `Bearer ${member}`);
    expect(ok.status).toBe(200);
    expect(ok.body.byDay).toEqual({ "2027-05-03": "A clay day, with the noodle house at 7:00 PM to finish.", "2027-05-04": "A morning hike to the shrine." });
    const no = await request(app).get(`/api/guide/day-summaries/${tripId}`).set("Authorization", `Bearer ${outsider}`);
    expect(no.status).toBe(403);
  });
  it("hides when a new copy changes that day — and only that day", async () => {
    await prisma.guideItem.update({ where: { id: dinnerId }, data: { time: "19:30" } });
    expect(await currentSummaries(tripId)).toEqual({ "2027-05-04": "A morning hike to the shrine." });
    await prisma.guideItem.update({ where: { id: dinnerId }, data: { time: "19:00" } });
    expect(Object.keys(await currentSummaries(tripId))).toEqual(["2027-05-03", "2027-05-04"]);
  });
  it("hides when a picture's words in that day's tab change", async () => {
    await prisma.sheetNote.create({ data: { tripId, tabName: "Town Day 1", rowIndex: 100000, text: "Picture: a map\nIts words, as Wander read them:\nClay market (Kip)" } });
    expect(Object.keys(await currentSummaries(tripId))).toEqual([]);
  });
});

describe("the instruction", () => {
  it("keeps to her lines, the people there, neutral disagreements, and plain times", () => {
    const p = summaryPrompt({ block: "Monday, May 3 (2027-05-03) — Town\n  - 19:00 meal: Dinner", pictures: "" });
    expect(p).toMatch(/Only what these lines say/);
    expect(p).toMatch(/never say "everyone" or "the group"/);
    expect(p).toMatch(/never "you" or "your"/);
    expect(p).toMatch(/never call its hours "open" or "free"/);
    expect(p).toMatch(/never pick one, never judge/);
    expect(p).toMatch(/2:50 PM or 8:30 AM — never 14:50/);
    expect(p).toMatch(/Monday, May 3 \(2027-05-03\)/);
  });
});
