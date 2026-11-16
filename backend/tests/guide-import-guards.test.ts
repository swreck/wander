/**
 * Keeping a finished trip's plan, and the import's stored settings (Nov 16 2026, before a second trip exists).
 * - A Guide copy sent to a finished trip is refused before anything is read or written (Japan, after the trip: a
 *   December Vietnam/Cambodia/Japan Guide would have replaced its plan).
 * - A copy whose dates don't fit the trip is refused, nothing written.
 * - An import keeps every stored setting it doesn't own (it rebuilt them from a list of five, dropping the rest).
 * - A finished trip's live sources aren't read again in the background.
 * Invented trips. The real-copy cases use her Japan Guide from this Mac's private folder and are skipped without it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-guide-guards";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { importGuideSnapshot, datesDontMatch, mappingsAfterImport } = await import("../src/services/guide/importSnapshot.js");
const { refreshDueSources } = await import("../src/services/sources/refresh.js");
const { forgetTripsOver } = await import("../src/services/tripOver.js");
const prisma = new PrismaClient();

const TAG = `gg-${Date.now()}`;
const DAY = 86400_000;
// (the private trip-data folder beside the repo's code; absent elsewhere, so these cases skip)
const REAL = path.join(import.meta.dirname, "../../trip-data/Japan Oct 2026,oct 27 b.xlsx");
const ids = { travelers: [] as string[], trips: [] as string[] };
let tok = "", finished = "";

const trip = async (name: string, start: Date, end: Date) => {
  const t = await prisma.trip.create({ data: { name: `${TAG} ${name}`, status: "active", startDate: start, endDate: end } });
  ids.trips.push(t.id);
  return t.id;
};
const rowsOf = async (tripId: string) => ({
  snapshots: await prisma.guideSnapshot.count({ where: { tripId } }),
  items: await prisma.guideItem.count({ where: { tripId } }),
  days: await prisma.day.count({ where: { tripId } }),
  trip: await prisma.trip.findUnique({ where: { id: tripId }, select: { startDate: true, endDate: true, tagline: true, status: true } }),
});

beforeAll(async () => {
  const t = await prisma.traveler.create({ data: { displayName: `${TAG}-ken` } });
  ids.travelers.push(t.id);
  tok = signToken({ code: t.displayName, displayName: t.displayName, travelerId: t.id });
  finished = await trip("finished", new Date(Date.now() - 45 * DAY), new Date(Date.now() - 20 * DAY));
  await prisma.tripMember.create({ data: { tripId: finished, travelerId: t.id, role: "planner" } });
});
afterAll(async () => {
  vi.useRealTimers();
  await prisma.sourceCopy.deleteMany({ where: { source: { tripId: { in: ids.trips } } } });
  await prisma.tripSource.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.tripMember.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.trip.deleteMany({ where: { id: { in: ids.trips } } });
  await prisma.traveler.deleteMany({ where: { id: { in: ids.travelers } } });
  await prisma.$disconnect();
});

describe("a finished trip keeps its plan", () => {
  it("the import refuses it before reading the file — nothing written", async () => {
    const before = await rowsOf(finished);
    // (not a spreadsheet at all: refused before it's read)
    const r = await importGuideSnapshot({ buffer: Buffer.from("not a spreadsheet"), sourceName: "Vietnam Dec 2026.xlsx", importedBy: "Ken", tripId: finished, readPictures: false, readText: false, readDayPlans: false });
    expect(r.accepted).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/ended on .* keeps its plan as it was\. Nothing was changed\./);
    expect(await rowsOf(finished)).toEqual(before);
  });

  it("the upload route says so to the planner (422), nothing written", async () => {
    const before = await rowsOf(finished);
    const r = await request(app).post("/api/guide/import").set({ Authorization: `Bearer ${tok}` })
      .field("tripId", finished).attach("file", Buffer.from("x"), "Japan Oct 2026.xlsx");
    expect(r.status).toBe(422);
    expect(r.body.reasons.join(" ")).toMatch(/keeps its plan/);
    expect(await rowsOf(finished)).toEqual(before);
  });

  it("a trip that doesn't exist is refused", async () => {
    const r = await importGuideSnapshot({ buffer: Buffer.from("x"), sourceName: "a.xlsx", importedBy: "Ken", tripId: `${TAG}-none` });
    expect(r.accepted).toBe(false);
    expect(r.reasons[0]).toMatch(/doesn't exist/);
  });
});

describe("a copy for other dates belongs to another trip", () => {
  const japan = { startDate: new Date("2026-10-05T00:00:00Z"), endDate: new Date("2026-10-29T00:00:00Z") };
  it("refuses December's dates for Japan's trip, in plain words", () => {
    expect(datesDontMatch(japan, "2026-12-15", "2027-01-08")).toBe("This copy's dates (Dec 15, 2026 to Jan 8, 2027) don't match this trip's (Oct 5, 2026 to Oct 29, 2026), so it belongs to another trip. Nothing was changed.");
  });
  it("accepts her copies moving a day or two, or a shorter copy inside the trip", () => {
    expect(datesDontMatch(japan, "2026-10-04", "2026-10-29")).toBeNull();
    expect(datesDontMatch(japan, "2026-10-06", "2026-10-31")).toBeNull();
    expect(datesDontMatch(japan, "2026-10-10", "2026-10-14")).toBeNull();
  });
  it("refuses a copy overlapping less than half", () => {
    expect(datesDontMatch(japan, "2026-10-25", "2026-11-30")).toMatch(/don't match/);
  });
  it("a trip without dates takes any copy", () => {
    expect(datesDontMatch({ startDate: null, endDate: null }, "2026-12-15", "2027-01-08")).toBeNull();
  });

  it.skipIf(!fs.existsSync(REAL))("her real Japan copy sent to a December trip: refused, nothing written", async () => {
    const dec = await trip("december", new Date(Date.now() + 29 * DAY), new Date(Date.now() + 53 * DAY));
    const before = await rowsOf(dec);
    const r = await importGuideSnapshot({ buffer: fs.readFileSync(REAL), sourceName: "Japan Oct 2026.xlsx", importedBy: "Ken", tripId: dec, readPictures: false, readText: false, readDayPlans: false });
    expect(r.accepted).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/belongs to another trip/);
    expect(await rowsOf(dec)).toEqual(before);
  }, 120_000);
});

describe("the import keeps stored settings it doesn't own", () => {
  it("keeps every key, replaces only its own two", () => {
    const prior = { sheetLink: { id: "s" }, appleGuides: [1], daySummaries: { "2026-10-05": "x" }, placeNotes: [2], documents: [3], legs: [{ who: "Kyler" }], readiness: { a: 1 }, source: "old", sourceName: "old.xlsx" };
    expect(mappingsAfterImport(prior, "Japan Oct 2026-8.xlsx")).toEqual({ ...prior, source: "snapshot", sourceName: "Japan Oct 2026-8.xlsx" });
  });
  it("starts clean from nothing, or from something that isn't a set of keys", () => {
    for (const p of [null, undefined, [], "x", 3]) expect(mappingsAfterImport(p, "a.xlsx")).toEqual({ source: "snapshot", sourceName: "a.xlsx" });
  });

  it.skipIf(!fs.existsSync(REAL))("a real import into a trip under way keeps a key added after the last copy", async () => {
    // (her Japan copy, imported "during" Japan: the clock set to Oct 20 2026 — only Date is faked)
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T03:00:00Z"));
    forgetTripsOver();
    try {
      const during = await trip("under way", new Date("2026-10-05T00:00:00Z"), new Date("2026-10-29T00:00:00Z"));
      await prisma.sheetSyncConfig.create({ data: { tripId: during, spreadsheetId: "", tabMappings: { sourceName: "before.xlsx", daySummaries: { "2026-10-05": { text: "kept" } }, legs: [{ who: "Kyler", from: "2026-12-22" }] } } });
      const r = await importGuideSnapshot({ buffer: fs.readFileSync(REAL), sourceName: "Japan Oct 2026,oct 27 b.xlsx", importedBy: "Ken", tripId: during, readPictures: false, readText: false, readDayPlans: false });
      expect(r.reasons).toEqual([]);
      expect(r.accepted).toBe(true);
      const tm = (await prisma.sheetSyncConfig.findUnique({ where: { tripId: during } }))!.tabMappings as any;
      expect(tm.legs).toEqual([{ who: "Kyler", from: "2026-12-22" }]);
      expect(tm.daySummaries).toEqual({ "2026-10-05": { text: "kept" } });
      expect(tm.sourceName).toBe("Japan Oct 2026,oct 27 b.xlsx");
      expect(tm.source).toBe("snapshot");
    } finally {
      vi.useRealTimers();
      forgetTripsOver();
    }
  }, 300_000);
});

describe("a finished trip's live sources rest", () => {
  it("only the trip still to come is read", async () => {
    const coming = await trip("coming", new Date(Date.now() + 30 * DAY), new Date(Date.now() + 50 * DAY));
    const over = await trip("over", new Date(Date.now() - 50 * DAY), new Date(Date.now() - 30 * DAY));
    await prisma.tripSource.create({ data: { tripId: coming, name: "Rail sheet", kind: "google_sheet", ref: `${TAG}-coming`, owner: "Ken" } });
    await prisma.tripSource.create({ data: { tripId: over, name: "Rail sheet", kind: "google_sheet", ref: `${TAG}-over`, owner: "Ken" } });
    const read: string[] = [];
    await refreshDueSources(async (ref: string) => { read.push(ref); return { title: "t", tabs: [] } as any; });
    expect(read).toContain(`${TAG}-coming`);
    expect(read).not.toContain(`${TAG}-over`);
    expect((await prisma.tripSource.findFirst({ where: { tripId: over } }))!.lastTriedAt).toBeNull();
  });
});
