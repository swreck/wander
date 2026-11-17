/**
 * S2c C1-C5 and C7 (Nov 17 2026): samples. One route (GET /api/samples/:tripId) hands them to the one person whose
 * membership asks for them; a sample is marked, hidden once its slot is real, gone once the asker is abroad; no other
 * route says a word of them; and a write that names one by its id is refused. Invented trip and people (the Scout
 * fixtures: "Pat" is the one who sees samples, "Sam" is the other), nothing real.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { cleanFixtures, makePlan, makeJapan, NAMES_OF } from "./fixtures/scout-fixtures.js";

process.env.JWT_SECRET = "test-secret-samples-route";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const prisma = new PrismaClient();

const M = "⁣⁣";
const SENTENCE = "A sample. Nothing is planned here yet.";
let plan: Awaited<ReturnType<typeof makePlan>>;
let japan: Awaited<ReturnType<typeof makeJapan>>;
let ken = "", larisa = "", stranger = "";
const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const tokenOf = (name: string, id: string) => signToken({ code: name, displayName: name, travelerId: id });
// (before the trip: nobody is abroad yet)
const clockAt = (iso: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(iso)); };
const mk = (kind: string, slot: string, date: string | null, data: Record<string, unknown>) => prisma.sampleEntry.create({ data: { tripId: plan.tripId, kind, slot, date, data: data as any } });
const clearSamples = () => prisma.sampleEntry.deleteMany({ where: { tripId: plan.tripId } });
const get = (token: string, tripId = plan.tripId) => request(app).get(`/api/samples/${tripId}`).set(as(token));
const slots = async (token: string) => ((await get(token)).body as any[]).map((r) => r.slot).sort();

beforeAll(async () => {
  await cleanFixtures(prisma, "plan");
  await cleanFixtures(prisma, "japan");
  plan = await makePlan(prisma);
  japan = await makeJapan(prisma);
  ken = tokenOf(NAMES_OF.plan.a, plan.travelers.pat);
  larisa = tokenOf(NAMES_OF.plan.b, plan.travelers.sam);
  stranger = tokenOf(NAMES_OF.japan.a, japan.travelers.pat);
  await prisma.tripMember.update({ where: { tripId_travelerId: { tripId: plan.tripId, travelerId: plan.travelers.pat } }, data: { showSamples: true } });
});
afterAll(async () => {
  vi.useRealTimers();
  await prisma.tripNote.deleteMany({ where: { tripId: plan.tripId } });
  await prisma.tripPhoto.deleteMany({ where: { tripId: plan.tripId } });
  await prisma.experience.deleteMany({ where: { tripId: plan.tripId } });
  await prisma.sheetSyncConfig.deleteMany({ where: { tripId: plan.tripId } });
  await cleanFixtures(prisma, "plan");
  await cleanFixtures(prisma, "japan");
  await prisma.$disconnect();
});
afterEach(async () => { vi.useRealTimers(); await clearSamples(); });

describe("C1 the route", () => {
  it("a non-member gets 403; Larisa (showSamples false) gets []; Ken gets his rows, each id starting sample:", async () => {
    clockAt("2026-11-17T18:00:00Z");
    await mk("line", "2026-12-17|morning", "2026-12-17", { title: `Slow morning${M}`, time: `10:00${M}` });
    await mk("unconfirmed", "leg:x", "2026-12-20", { title: `A flight${M}`, tag: `Not confirmed${M}`, timeZone: "Asia/Seoul" });
    expect((await get(stranger)).status).toBe(403);
    const l = await get(larisa);
    expect(l.status).toBe(200);
    expect(l.body).toEqual([]);
    const k = await get(ken);
    expect(k.status).toBe(200);
    expect(k.body.length).toBe(2);
    for (const r of k.body) expect(r.id).toMatch(/^sample:/);
    expect(k.headers["cache-control"]).toBe("no-store");
    expect(l.headers["cache-control"]).toBe("no-store");
  });
  it("a sheet trip whose member has showSamples gets [] (it has no sample rows)", async () => {
    await prisma.tripMember.update({ where: { tripId_travelerId: { tripId: japan.tripId, travelerId: japan.travelers.pat } }, data: { showSamples: true } });
    clockAt("2026-09-01T00:00:00Z");
    const r = await get(stranger, japan.tripId);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });
  it("without a sign-in: refused", async () => {
    expect((await request(app).get(`/api/samples/${plan.tripId}`)).status).toBe(401);
  });
});

describe("C2 the marker", () => {
  it("of two rows, the one with a string lacking the marker is not emitted; timeZone needs none", async () => {
    clockAt("2026-11-17T18:00:00Z");
    await mk("line", "2026-12-17|morning", "2026-12-17", { title: `Marked${M}`, detail: `Also marked${M}`, time: `09:00${M}` });
    await mk("line", "2026-12-17|evening", "2026-12-17", { title: `Marked${M}`, detail: "Not marked", time: `19:00${M}` });
    await mk("unconfirmed", "leg:z", "2026-12-20", { title: `Marked${M}`, timeZone: "Asia/Seoul", tag: `Not confirmed${M}` });
    expect(await slots(ken)).toEqual(["2026-12-17|morning", "leg:z"]);
  });
});

describe("C3 a filled slot hides its sample", () => {
  const D = "2026-12-17";
  const line = (part: string) => mk("line", `${D}|${part}`, D, { title: `Something${M}`, time: `10:00${M}` });
  const real = (time: string | null, kind = "plan") => prisma.guideItem.create({ data: { tripId: plan.tripId, snapshotId: plan.snapshotId, date: new Date(`${D}T00:00:00Z`), time, kind, title: "A real line", source: "Larisa's notes", sourceRef: `plan:s2c-${Math.random()}` } });
  const parts = ["morning", "midday", "afternoon", "evening"];
  afterEach(async () => { await prisma.guideItem.deleteMany({ where: { tripId: plan.tripId, title: "A real line" } }); });
  it("line: real items at 11:29, 11:30, 13:59, 14:00, 17:29, 17:30 each fill only their part", async () => {
    clockAt("2026-11-17T18:00:00Z");
    for (const p of parts) await line(p);
    const expected: [string, string][] = [["11:29", "morning"], ["11:30", "midday"], ["13:59", "midday"], ["14:00", "afternoon"], ["17:29", "afternoon"], ["17:30", "evening"]];
    for (const [time, part] of expected) {
      const item = await real(time);
      expect(await slots(ken), time).toEqual(parts.filter((p) => p !== part).map((p) => `${D}|${p}`).sort());
      await prisma.guideItem.delete({ where: { id: item.id } });
    }
    expect((await slots(ken)).length).toBe(4);
  });
  it("line: a tour, a meal and a meeting fill; a flight, a train, a check-in and a check-out at the same time fill none; a line with no time fills none", async () => {
    clockAt("2026-11-17T18:00:00Z");
    for (const p of parts) await line(p);
    for (const kind of ["flight", "train", "travel", "checkin", "checkout"]) await real("10:00", kind);
    await real(null, "plan");
    expect((await slots(ken)).length).toBe(4);
    await prisma.guideItem.deleteMany({ where: { tripId: plan.tripId, title: "A real line" } });
    for (const kind of ["tour", "meal", "meeting"]) {
      const item = await real("19:00", kind);
      expect((await slots(ken)).includes(`${D}|evening`), kind).toBe(false);
      await prisma.guideItem.delete({ where: { id: item.id } });
    }
  });
  it("maybe: one real maybe leaves it, two hide it; a removed one and one with a sheetRowRef don't count", async () => {
    clockAt("2026-11-17T18:00:00Z");
    await mk("maybe", "city-a|1", null, { title: `Try the market${M}` });
    const cityA = plan.cities.get("city-a")!;
    const maybe = (extra: Record<string, unknown> = {}) => prisma.experience.create({ data: { tripId: plan.tripId, cityId: cityA, name: "A real maybe", createdBy: "test", ...extra } as any });
    await maybe();
    expect(await slots(ken)).toEqual(["city-a|1"]);
    await maybe({ removedAt: new Date(), removedBy: "test" });
    await maybe({ sheetRowRef: "Tab:5" });
    expect(await slots(ken)).toEqual(["city-a|1"]);
    await maybe();
    expect(await slots(ken)).toEqual([]);
    await prisma.experience.deleteMany({ where: { tripId: plan.tripId } });
    // (another city's maybes don't hide this city's)
    await maybe();
    const cityB = plan.cities.get("city-b")!;
    await prisma.experience.create({ data: { tripId: plan.tripId, cityId: cityB, name: "Elsewhere", createdBy: "test" } as any });
    expect(await slots(ken)).toEqual(["city-a|1"]);
  });
  it("note: the asker's own real note for that date hides it; another person's doesn't", async () => {
    clockAt("2026-11-17T18:00:00Z");
    await mk("note", `${D}|note`, D, { text: `A thought${M}` });
    const note = (travelerId: string, who: string) => prisma.tripNote.create({ data: { tripId: plan.tripId, travelerId, authorName: who, clientId: `c3-${Math.random()}`, original: "x", text: "x", dayDate: D, visibility: "trip" } });
    await note(plan.travelers.sam, NAMES_OF.plan.b);
    expect(await slots(ken)).toEqual([`${D}|note`]);
    await note(plan.travelers.pat, NAMES_OF.plan.a);
    expect(await slots(ken)).toEqual([]);
    await prisma.tripNote.deleteMany({ where: { tripId: plan.tripId } });
  });
  it("trip_photo: the asker's own real photo for that date hides it; another person's doesn't", async () => {
    clockAt("2026-11-17T18:00:00Z");
    await mk("trip_photo", `${D}|photo`, D, { caption: `A view${M}` });
    const photo = (travelerId: string, who: string) => prisma.tripPhoto.create({ data: { tripId: plan.tripId, travelerId, authorName: who, dayDate: D, shared: true, image: Buffer.from([0xff, 0xd8, 0xff]), thumb: Buffer.from([0xff, 0xd8, 0xff]) } });
    await photo(plan.travelers.sam, NAMES_OF.plan.b);
    expect(await slots(ken)).toEqual([`${D}|photo`]);
    await photo(plan.travelers.pat, NAMES_OF.plan.a);
    expect(await slots(ken)).toEqual([]);
    await prisma.tripPhoto.deleteMany({ where: { tripId: plan.tripId } });
  });
  it("expense: any real expense hides it (a removed one does not)", async () => {
    clockAt("2026-11-17T18:00:00Z");
    await mk("expense", "expense|1", null, { text: `Dinner${M}` });
    const exp = (extra: Record<string, unknown> = {}) => prisma.tripExpense.create({ data: { tripId: plan.tripId, party: "Pat & Sam", amount: 10, currency: "USD", yen: 1500, addedByName: "Pat", ...extra } as any });
    const gone = await exp({ removedAt: new Date() });
    expect(await slots(ken)).toEqual(["expense|1"]);
    await exp();
    expect(await slots(ken)).toEqual([]);
    await prisma.tripExpense.deleteMany({ where: { tripId: plan.tripId } });
    void gone;
  });
  it("summary: a real summary for the date hides it", async () => {
    clockAt("2026-11-17T18:00:00Z");
    await mk("summary", `${D}|summary`, D, { text: `A quiet day${M}` });
    expect(await slots(ken)).toEqual([`${D}|summary`]);
    const { EMPTY_DAY_HASH } = await import("../src/services/guide/daySummaries.js");
    await prisma.sheetSyncConfig.create({ data: { tripId: plan.tripId, spreadsheetId: "none", tabMappings: { daySummaries: { [D]: { text: "A real summary.", hash: EMPTY_DAY_HASH, writtenAt: "2026-11-17T00:00:00Z" } } } } });
    expect(await slots(ken)).toEqual([]);
    await prisma.sheetSyncConfig.deleteMany({ where: { tripId: plan.tripId } });
  });
  it("unconfirmed: always there, whatever is real", async () => {
    clockAt("2026-11-17T18:00:00Z");
    await mk("unconfirmed", "leg:k", "2026-12-17", { title: `A flight${M}`, tag: `Not confirmed${M}` });
    await mk("unconfirmed", "stay:k", "2026-12-17", { title: `A room${M}`, tag: `Not confirmed${M}` });
    await real("10:00");
    await real("19:00", "meal");
    expect(await slots(ken)).toEqual(["leg:k", "stay:k"]);
  });
});

describe("C4 none once the asker is abroad", () => {
  const setFrom = (d: string | null) => prisma.tripMember.update({ where: { tripId_travelerId: { tripId: plan.tripId, travelerId: plan.travelers.pat } }, data: { abroadFrom: d ? new Date(`${d}T00:00:00Z`) : null } });
  afterEach(async () => { await setFrom(null); });
  it("abroadFrom Dec 14, Vietnam's clock: at 2026-12-13T16:59Z the samples are there; at 17:00Z the answer is []", async () => {
    await mk("line", "2026-12-17|morning", "2026-12-17", { title: `Slow morning${M}`, time: `10:00${M}` });
    await setFrom("2026-12-14");
    clockAt("2026-12-13T16:59:00Z");
    expect((await get(ken)).body.length).toBe(1);
    clockAt("2026-12-13T17:00:00Z");
    expect((await get(ken)).body).toEqual([]);
  });
  it("abroadFrom null: the trip's first day (Dec 14) decides", async () => {
    await mk("line", "2026-12-17|morning", "2026-12-17", { title: `Slow morning${M}`, time: `10:00${M}` });
    await setFrom(null);
    clockAt("2026-12-13T16:59:00Z");
    expect((await get(ken)).body.length).toBe(1);
    clockAt("2026-12-13T17:00:00Z");
    expect((await get(ken)).body).toEqual([]);
  });
  it("a later abroadFrom keeps the samples until then", async () => {
    await mk("line", "2026-12-17|morning", "2026-12-17", { title: `Slow morning${M}`, time: `10:00${M}` });
    await setFrom("2026-12-20");
    clockAt("2026-12-19T16:59:00Z");
    expect((await get(ken)).body.length).toBe(1);
    clockAt("2026-12-19T17:00:00Z");
    expect((await get(ken)).body).toEqual([]);
  });
});

describe("C5 no other route says a word of a sample", () => {
  it("a trip with samples of every kind: nine routes hold no marker and no 'sample:'; the equal ones are equal for both people", async () => {
    clockAt("2026-11-17T18:00:00Z");
    await mk("line", "2026-12-17|morning", "2026-12-17", { title: `Slow morning${M}`, time: `10:00${M}`, picture: true });
    await mk("summary", "2026-12-17|summary", "2026-12-17", { text: `A quiet day${M}` });
    await mk("maybe", "city-a|1", null, { title: `Try the market${M}` });
    await mk("note", "2026-12-17|note", "2026-12-17", { text: `A thought${M}` });
    await mk("expense", "expense|1", null, { text: `Dinner${M}` });
    await mk("trip_photo", "2026-12-17|photo", "2026-12-17", { caption: `A view${M}` });
    await mk("unconfirmed", "leg:q", "2026-12-20", { title: `A flight${M}`, tag: `Not confirmed${M}` });
    const t = plan.tripId;
    const paths = [`/api/guide/items/${t}`, `/api/days/trip/${t}`, `/api/guide/day-summaries/${t}`, `/api/experiences/trip/${t}`, `/api/trip-notes/trip/${t}`, `/api/expenses/trip/${t}`,
      `/api/trip-photos/trip/${t}`, `/api/guide/status/${t}`, `/api/trips/${t}`, `/api/accommodations/trip/${t}`];
    expect(await slots(ken)).toHaveLength(7);
    const bodies: Record<string, [string, string]> = {};
    for (const p of paths) {
      const a = await request(app).get(p).set(as(ken));
      const b = await request(app).get(p).set(as(larisa));
      expect(a.status, p).toBe(200);
      expect(b.status, p).toBe(200);
      for (const text of [a.text, b.text]) { expect(text, p).not.toContain(M); expect(text, p).not.toContain("sample:"); }
      bodies[p] = [a.text, b.text];
    }
    for (const p of [paths[0], paths[1], paths[2], paths[7], paths[8], paths[9]]) expect(bodies[p][0], p).toBe(bodies[p][1]);
  });
});

describe("C7 a write that names a sample is refused", () => {
  const T = () => plan.tripId;
  const calls: [string, (() => request.Test)][] = [
    ["POST /maybes/sample:x/in", () => request(app).post("/api/maybes/sample:x/in").set(as(ken)).send({})],
    ["POST /maybes/sample%3Ax/in (encoded)", () => request(app).post("/api/maybes/sample%3Ax/in").set(as(ken)).send({})],
    ["DELETE /maybes/sample:x", () => request(app).delete("/api/maybes/sample:x").set(as(ken))],
    ["POST /maybes/sample:x/back", () => request(app).post("/api/maybes/sample:x/back").set(as(ken)).send({})],
    ["POST /experience-notes {experienceId}", () => request(app).post("/api/experience-notes").set(as(ken)).send({ experienceId: "sample:x", text: "hi" })],
    ["POST /day-choices/:tripId {experienceId}", () => request(app).post(`/api/day-choices/${T()}`).set(as(ken)).send({ experienceId: "sample:x" })],
    ["DELETE /day-choices/:tripId/sample:x", () => request(app).delete(`/api/day-choices/${T()}/sample:x`).set(as(ken))],
    ["PATCH /trip-notes/sample:x", () => request(app).patch("/api/trip-notes/sample:x").set(as(ken)).send({ text: "x" })],
    ["DELETE /trip-notes/sample:x", () => request(app).delete("/api/trip-notes/sample:x").set(as(ken))],
    ["PATCH /expenses/trip/:tripId/sample:x", () => request(app).patch(`/api/expenses/trip/${T()}/sample:x`).set(as(ken)).send({ amount: 1 })],
    ["DELETE /expenses/trip/:tripId/sample:x", () => request(app).delete(`/api/expenses/trip/${T()}/sample:x`).set(as(ken))],
    ["PATCH /trip-photos/sample:x", () => request(app).patch("/api/trip-photos/sample:x").set(as(ken)).send({ shared: true })],
    ["DELETE /trip-photos/sample:x", () => request(app).delete("/api/trip-photos/sample:x").set(as(ken))],
    ["PATCH /experiences/sample:x", () => request(app).patch("/api/experiences/sample:x").set(as(ken)).send({ name: "x" })],
    ["an id key deep in the body, in an array: {a:{b:[{noteIds:['sample:x']}]}}", () => request(app).post("/api/trip-notes/trip/" + T()).set(as(ken)).send({ clientId: "c7-deep-1", text: "hi", a: { b: [{ noteIds: ["sample:x"] }] } })],
    ["a plain `id` key", () => request(app).post("/api/phrases").set(as(ken)).send({ id: "sample:x" })],
  ];
  for (const [name, call] of calls) {
    it(`${name}: 404 and the sentence`, async () => {
      const r = await call();
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ error: SENTENCE });
    });
  }
  it("a trip note whose text is 'sample: try the pho' is saved as today", async () => {
    const r = await request(app).post(`/api/trip-notes/trip/${T()}`).set(as(ken)).send({ clientId: "c7-note-1", text: "sample: try the pho", dayDate: "2026-12-17" });
    expect(r.status).toBe(201);
    const row = await prisma.tripNote.findFirst({ where: { tripId: T(), clientId: "c7-note-1" } });
    expect(row?.text).toBe("sample: try the pho");
  });
  it("a read of a path that holds sample: is not a write: a GET is never refused by it", async () => {
    const r = await request(app).get("/api/guide/items/sample:x").set(as(ken));
    expect((r.body as any)?.error).not.toBe(SENTENCE);
  });
});
