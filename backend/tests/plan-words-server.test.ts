/**
 * S2d D4 and D9 (Nov 17 2026): the server tells the phone which trips are built from a plan, and names the plan's sources;
 * a sheet trip says plan false and nothing else changes. And the instruction for a day's summary: a sheet trip's is byte for
 * byte what it was (a fixture saved from build 7145670), a plan trip's names the trip by its own name and never "a trip to
 * Japan". Invented trips, people and lines.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-plan-words";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { summaryPrompt } = await import("../src/services/guide/daySummaries.js");
const prisma = new PrismaClient();

// (status "archived", not "active": choosing a trip stamps it as the most recently opened, and the tests that sign in by
// the old shared code take the newest ACTIVE trip as theirs; an archived one is never taken from them)
const TAG = "S2dwords";
const at = (s: string) => new Date(`${s}T00:00:00Z`);
let planTrip = "", sheetTrip = "", emptyTrip = "";
let member = "", outsider = "";

beforeAll(async () => {
  const mkT = async (n: string) => (await prisma.traveler.findFirst({ where: { displayName: n } })) || prisma.traveler.create({ data: { displayName: n } });
  const a = await mkT(`${TAG} Member`), o = await mkT(`${TAG} Outsider`);
  const mkTrip = async (name: string, kind: string | null) => {
    const t = await prisma.trip.create({ data: { name: `${TAG} ${name}`, status: "archived", startDate: at("2026-12-14"), endDate: at("2026-12-20"), timeZone: "Asia/Ho_Chi_Minh", datesKnown: true } });
    await prisma.tripMember.create({ data: { tripId: t.id, travelerId: a.id, role: "planner" } });
    if (kind) await prisma.guideSnapshot.create({ data: { tripId: t.id, sourceName: "x", sourceKind: kind, contentHash: `${TAG}-${name}`, status: "current", tabs: [] as any, importedBy: "test", importedAt: new Date("2026-11-17T16:22:00Z") } });
    return t.id;
  };
  planTrip = await mkTrip("Plan", "wander_plan");
  sheetTrip = await mkTrip("Sheet", "xlsx");
  emptyTrip = await mkTrip("None", null);
  const snap = (await prisma.guideSnapshot.findFirst({ where: { tripId: planTrip } }))!;
  const mk = (n: number, date: string, time: string | null, source: string) => prisma.guideItem.create({ data: { tripId: planTrip, snapshotId: snap.id, sortOrder: n, kind: "plan", title: `Line ${n}`, date: at(date), time, source, sourceRef: `plan:${n}` } });
  // (by date then time: the 17th at 09:00 is Backroads', then the 17th at 10:00 is Larisa's, then the 18th is two joined)
  await mk(1, "2026-12-18", "08:00", "Larisa's notes + A third source");
  await mk(2, "2026-12-17", "10:00", "Larisa's notes");
  await mk(3, "2026-12-17", "09:00", "Backroads' itinerary");
  await mk(4, "2026-12-19", null, "Backroads' itinerary");
  const sheetSnap = (await prisma.guideSnapshot.findFirst({ where: { tripId: sheetTrip } }))!;
  await prisma.guideItem.create({ data: { tripId: sheetTrip, snapshotId: sheetSnap.id, sortOrder: 1, kind: "plan", title: "A sheet line", date: at("2026-12-17"), time: "09:00", source: "Itinerary · Notes (row 4)", sourceRef: "Itinerary!A1" } });
  member = signToken({ code: `${TAG} Member`, displayName: `${TAG} Member`, travelerId: a.id });
  outsider = signToken({ code: `${TAG} Outsider`, displayName: `${TAG} Outsider`, travelerId: o.id });
});
afterAll(async () => {
  const ids = [planTrip, sheetTrip, emptyTrip].filter(Boolean);
  await prisma.guideItem.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.guideSnapshot.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.tripMember.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.trip.deleteMany({ where: { id: { in: ids } } });
  await prisma.traveler.deleteMany({ where: { displayName: { startsWith: TAG } } });
  await prisma.$disconnect();
});
const get = (url: string, token = member) => request(app).get(url).set("Authorization", `Bearer ${token}`);

describe("D4 the server says which trips are plans", () => {
  it("status: a plan trip says plan and names its sources in order of first use by date then time, a joined source as its parts", async () => {
    const r = await get(`/api/guide/status/${planTrip}`);
    expect(r.status).toBe(200);
    expect(r.body.current.plan).toBe(true);
    expect(r.body.current.planSources).toEqual(["Backroads' itinerary", "Larisa's notes", "A third source"]);
  });
  it("status: a sheet trip says plan false and has no planSources, and nothing else in current changed", async () => {
    const r = await get(`/api/guide/status/${sheetTrip}`);
    expect(r.status).toBe(200);
    expect(r.body.current.plan).toBe(false);
    expect("planSources" in r.body.current).toBe(false);
    expect(Object.keys(r.body.current).sort()).toEqual(["id", "importedAt", "importedBy", "plan", "report", "sourceName"]);
    expect("sourceKind" in r.body.current).toBe(false);
  });
  it("status: a trip with no copy still says current null", async () => {
    const r = await get(`/api/guide/status/${emptyTrip}`);
    expect(r.status).toBe(200);
    expect(r.body.current).toBeNull();
  });
  it("status: a person who is not on the trip still gets 403", async () => {
    expect((await get(`/api/guide/status/${planTrip}`, outsider)).status).toBe(403);
    expect((await get(`/api/guide/status/${sheetTrip}`, outsider)).status).toBe(403);
  });
  it("the trips list says plan for each trip, from one answer", async () => {
    const r = await get("/api/trips");
    expect(r.status).toBe(200);
    const mine = (name: string) => r.body.find((t: any) => t.name === `${TAG} ${name}`);
    expect(mine("Plan").plan).toBe(true);
    expect(mine("Sheet").plan).toBe(false);
    expect(mine("None").plan).toBe(false);
  });
  it("one trip says plan, and a person who is not on it is still refused", async () => {
    expect((await get(`/api/trips/${planTrip}`)).body.plan).toBe(true);
    expect((await get(`/api/trips/${sheetTrip}`)).body.plan).toBe(false);
    expect((await get(`/api/trips/${planTrip}`, outsider)).status).toBe(404);   // (as it always said: it doesn't confirm the trip exists)
  });
  it("activate answers with plan, and a person who is not on the trip is still refused with 403", async () => {
    const p = await request(app).post(`/api/trips/${planTrip}/activate`).set("Authorization", `Bearer ${member}`).send({});
    expect(p.status).toBe(200);
    expect(p.body.plan).toBe(true);
    expect((await request(app).post(`/api/trips/${sheetTrip}/activate`).set("Authorization", `Bearer ${member}`).send({})).body.plan).toBe(false);
    expect((await request(app).post(`/api/trips/${planTrip}/activate`).set("Authorization", `Bearer ${outsider}`).send({})).status).toBe(403);
  });
  it("active answers with plan for the trip this person chose", async () => {
    await request(app).post(`/api/trips/${planTrip}/activate`).set("Authorization", `Bearer ${member}`).send({});
    expect((await get("/api/trips/active")).body.plan).toBe(true);
    await request(app).post(`/api/trips/${sheetTrip}/activate`).set("Authorization", `Bearer ${member}`).send({});
    expect((await get("/api/trips/active")).body.plan).toBe(false);
  });
  it("the export of notes calls the trip as a whole 'The whole trip' on a plan trip, and 'Japan overall' on a sheet trip", async () => {
    const me = (await prisma.traveler.findFirst({ where: { displayName: `${TAG} Member` } }))!.id;
    for (const [tripId, words] of [[planTrip, "The whole trip"], [sheetTrip, "Japan overall"]] as const) {
      await prisma.tripNote.create({ data: { tripId, travelerId: me, authorName: `${TAG} Member`, clientId: `s2d-${words.length}-${tripId.slice(0, 6)}`, original: "A note", text: "A note", visibility: "private", source: "typed" } });
      const r = await get(`/api/trip-notes/trip/${tripId}/export`);
      expect(r.status).toBe(200);
      expect(r.text).toContain(`## ${words}`);
    }
    await prisma.tripNote.deleteMany({ where: { tripId: { in: [planTrip, sheetTrip] } } });
  });
});

describe("D9 the instruction for a day's summary", () => {
  const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/summary-prompt-sheet-7145670.json", import.meta.url), "utf8"));
  it("a sheet trip's instruction is byte for byte what it was", () => {
    for (const k of Object.keys(FIXTURE)) expect(summaryPrompt(FIXTURE[k].input), k).toBe(FIXTURE[k].prompt);
  });
  it("a plan trip's names the trip by its own name and never says a trip to Japan", () => {
    for (const k of Object.keys(FIXTURE)) {
      const p = summaryPrompt(FIXTURE[k].input, { tripName: "A Winter Trip" });
      expect(p, k).toContain(`This is one day of the trip "A Winter Trip"`);
      expect(p, k).not.toMatch(/trip to Japan/i);
      expect(p, k).not.toMatch(/family trip/i);
      expect(p, k).not.toContain("spreadsheet.");
      expect(p, k).not.toMatch(/Say "her Guide"|her tabs|her lines/);
      expect(p, k).toContain(`Say "the plan" for where it comes from`);
    }
  });
  it("a plan trip's names each day's country: the first line is said to hold the city and country", () => {
    expect(summaryPrompt({ block: "x", pictures: "" }, { tripName: "A Winter Trip" })).toContain("The first line names the day, its city and country");
  });
  it("the rest of a plan trip's instruction is today's", () => {
    const sheet = FIXTURE.plain.prompt as string;
    const plan = summaryPrompt(FIXTURE.plain.input, { tripName: "A Winter Trip" });
    expect(plan.slice(plan.indexOf("\n\n"))).toContain("Write a short summary of the day's theme for the top of the day's screen");
    expect(plan.split("\n").length).toBe(sheet.split("\n").length);
  });
});
