/**
 * A DATE WHEN CHARGES START (Oct 4 2026): her new copy's reading of a booking says "… (Oct 17): free cancellation ends —
 * 60% charge from this date" on Oct 10. Scout's status called it "OPEN NOW — last chance Oct 10", so it would have said
 * cancelling was still free on the 10th. Such a deadline closes as its day begins. Invented booking.
 * - the day before: open, free through the end of that day; charges start the next
 * - on the day: passed — charges apply; a plain last-day deadline is unchanged
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-charges-from";
const { buildGuideContextParts } = await import("../src/services/guide/scoutContext.js");
const prisma = new PrismaClient();
let tripId = "";
beforeAll(async () => {
  tripId = (await prisma.trip.create({ data: { name: "Charges From Trip", status: "archived", timeZone: "Asia/Tokyo", startDate: new Date("2031-10-05"), endDate: new Date("2031-10-29") } })).id;
  const snap = await prisma.guideSnapshot.create({ data: { tripId, sourceName: "cf.xlsx", sourceKind: "xlsx", contentHash: "cf", status: "current", tabs: [] } });
  const base = { tripId, snapshotId: snap.id, kind: "deadline", source: "Dining Resos (row 11)", sourceRef: "Dining Resos!J11" };
  await prisma.guideItem.createMany({ data: [
    { ...base, date: new Date("2031-10-10T00:00:00Z"), title: "Harbor Grill (Oct 17): free cancellation ends — 60% charge from this date" },
    { ...base, date: new Date("2031-10-12T00:00:00Z"), title: "Free cancellation ends · Pier Hotel" },
  ] });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});
const statusAt = async (iso: string, name: RegExp) => {
  const { liveLines } = await buildGuideContextParts(tripId, { now: new Date(iso), phoneZone: "Asia/Tokyo" });
  return liveLines.find((l) => name.test(l.text))?.text || "";
};

describe("a date when charges start", () => {
  it("the day before: free through the end of that day; charges start the next", async () => {
    expect(await statusAt("2031-10-09T20:00:00+09:00", /Harbor Grill/)).toMatch(/OPEN NOW — free through the end of 2031-10-09 in Japan; charges start 2031-10-10/);
  });
  it("on the day itself: passed — charges apply", async () => {
    expect(await statusAt("2031-10-10T08:00:00+09:00", /Harbor Grill/)).toMatch(/PASSED — charges apply from 2031-10-10/);
  });
  it("a plain last-day deadline is still open all that day", async () => {
    expect(await statusAt("2031-10-12T20:00:00+09:00", /Pier Hotel/)).toMatch(/OPEN NOW — last chance 2031-10-12, by the end of that day/);
  });
});
