/**
 * Japan's import comes out the same after the plan work (Nov 17 2026, December plan S1, T-b): her real Japan copy read
 * into a fresh trip gives the same counts and the same lines (title, date, time, whom for) as it did before the plan's
 * changes to the import. The expected numbers were taken from the code as it stood before those changes and are kept in
 * the private trip-data folder with her copy; without both files this skips. WRITE_GOLDEN=1 writes them afresh.
 */
import { describe, it, expect, afterAll, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-japan-golden";
const { importGuideSnapshot } = await import("../src/services/guide/importSnapshot.js");
const { forgetTripsOver } = await import("../src/services/tripOver.js");
const prisma = new PrismaClient();

const REAL = path.join(import.meta.dirname, "../../trip-data/Japan Oct 2026,oct 27 b.xlsx");
const GOLDEN = path.join(import.meta.dirname, "../../trip-data/december-plan/japan-import-golden.json");
const writing = process.env.WRITE_GOLDEN === "1";
const TAG = `jg-${Date.now()}`;
const ids: string[] = [];

afterAll(async () => {
  vi.useRealTimers();
  forgetTripsOver();
  await prisma.sheetSyncConfig.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.trip.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

async function digest(tripId: string) {
  const items = await prisma.guideItem.findMany({ where: { tripId }, select: { title: true, date: true, time: true, forWhom: true, kind: true } });
  const lines = items.map((i) => `${i.title}|${i.date ? i.date.toISOString().slice(0, 10) : ""}|${i.time || ""}|${i.forWhom || ""}`).sort();
  const kinds: Record<string, number> = {};
  for (const i of items) kinds[i.kind] = (kinds[i.kind] || 0) + 1;
  return {
    counts: {
      items: items.length,
      snapshots: await prisma.guideSnapshot.count({ where: { tripId } }),
      cities: await prisma.city.count({ where: { tripId } }),
      days: await prisma.day.count({ where: { tripId } }),
      accommodations: await prisma.accommodation.count({ where: { tripId } }),
      experiences: await prisma.experience.count({ where: { tripId } }),
      planningActions: await prisma.planningAction.count({ where: { tripId } }),
      sheetNotes: await prisma.sheetNote.count({ where: { tripId } }),
    },
    kinds: Object.fromEntries(Object.entries(kinds).sort()),
    linesHash: crypto.createHash("sha256").update(lines.join("\n")).digest("hex"),
  };
}

describe.skipIf(!fs.existsSync(REAL) || (!writing && !fs.existsSync(GOLDEN)))("Japan's import, before and after the plan work", () => {
  it("her real copy gives the same counts and the same lines", async () => {
    // (the clock set to Oct 20 2026, inside the trip; only Date is faked)
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T03:00:00Z"));
    forgetTripsOver();
    const t = await prisma.trip.create({ data: { name: `${TAG} golden`, status: "active", startDate: new Date("2026-10-05T00:00:00Z"), endDate: new Date("2026-10-29T00:00:00Z") } });
    ids.push(t.id);
    const r = await importGuideSnapshot({ buffer: fs.readFileSync(REAL), sourceName: "Japan Oct 2026,oct 27 b.xlsx", importedBy: "Ken", tripId: t.id, readPictures: false, readText: false, readDayPlans: false });
    expect(r.reasons).toEqual([]);
    expect(r.accepted).toBe(true);
    const got = await digest(t.id);
    if (writing) { fs.writeFileSync(GOLDEN, JSON.stringify(got, null, 2)); return; }
    expect(got).toEqual(JSON.parse(fs.readFileSync(GOLDEN, "utf-8")));
  }, 300_000);
});
