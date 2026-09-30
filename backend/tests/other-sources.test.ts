/**
 * OTHER SOURCES (Sep 30 2026) — Ken's rail sheet, read beside Larisa's Guide, never merged into it.
 *
 * - Card digits and card IDs never reach Wander (it captures no financial information).
 * - Tabs are recognized by their header row, whichever sheet they're in (so they can move into her Guide).
 * - "Sources differ" is found by rule: a real difference is said; a window, "or later", or another leg's time is not.
 * - A copy is kept only when the sheet changed; a failed read keeps the last good copy and says why.
 * - The API gives members its trains and checklists; non-members get nothing; nothing can write a source.
 *
 * All data here is invented (the repository is public).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import type { GuideTab } from "../src/services/guide/reader.js";

process.env.JWT_SECRET = "test-secret-other-sources";

const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { withoutFinancialDetails } = await import("../src/services/sources/filter.js");
const { railRows, checklistSteps, dateIn, twelveHour } = await import("../src/services/sources/shapes.js");
const { railDiffers, sourceDocuments, sourceViews } = await import("../src/services/sources/context.js");
const { refreshSource } = await import("../src/services/sources/refresh.js");
const prisma = new PrismaClient();

/** A tab from rows of text, the way the reader stores one */
function tab(name: string, rows: string[][]): GuideTab {
  const cells = rows.flatMap((row, ri) => row.map((text, ci) => ({ a1: `${String.fromCharCode(65 + ci)}${ri + 1}`, r: ri + 1, c: ci + 1, text, kind: "text" as const })).filter((c) => c.text));
  return { name, index: 0, cells, merged: [], images: [] };
}

// Columns in a different order from Ken's sheet, plus one it doesn't have: the reader goes by header names
const RAIL = tab("Trains", [
  ["Status", "Route", "Date", "Purpose", "Train", "Pax", "Depart", "Arrive", "Car / seat", "Reservation #", "Extra", "Boarding readiness (separate from booking status)"],
  ["TRUE", "Alpha → Beta", "Oct 6", "Move", "NOZOMI 11", "2", "18:17", "19:05", "Car 8 — 10A/10B", "11111", "x", "PENDING — collect at Alpha Oct 6"],
  ["?", "Beta → Gamma", "Oct 7", "Day trip", "", "2", "", "", "", "", "", ""],
  ["TRUE", "Gamma → Delta", "Oct 14", "Day trip", "YAMABIKO 22", "2", "16:58", "17:48", "Car 10, 2A/2B", "22222", "", ""],
  ["TRUE", "Delta → Gamma", "Oct 14", "Day trip", "YAMABIKO 21", "2", "08:07", "09:00", "Car 10, 4A/4B", "33333", "", ""],
  ["TRUE", "Kyoto → KIX (airport)", "Oct 29", "Home", "HARUKA 31", "4", "13:30", "14:50", "Car 1", "44444", "", ""],
  ["STATION PLAN →", "Open station plan →"],
]);
const STEPS = tab("Tix pick up — Alpha", [
  ["Step", "When / where", "What to do", "Have ready", "Confirm before leaving"],
  ["Before travel", "Before travel", "Check the IC cards", "Both phones", "Both assigned"],
  ["1", "Alpha, Oct 6; allow an hour", "Go to the machines", "The card", "All six"],
  ["Source", "Pickup instructions", "https://example.com/pickup"],
]);

describe("what Wander keeps out", () => {
  it("keeps a card's last four digits, the standard safe way to say which card", () => {
    expect(withoutFinancialDetails("Bring Larisa's physical Mastercard ending 1234.")).toBe("Bring Larisa's physical Mastercard ending 1234.");
    expect(withoutFinancialDetails("card ending in 9876")).toBe("card ending in 9876");
  });
  it("cuts a whole card number to its last four, and leaves a transit card's full ID out", () => {
    expect(withoutFinancialDetails("Card 4111 2222 3333 4444 on file")).toBe("Card [card ending 4444] on file");
    expect(withoutFinancialDetails("4111222233334444")).toBe("[card ending 4444]");
    expect(withoutFinancialDetails("Suica JE80 1234 5678 9012 3456")).toBe("Suica JE… [card ID left out by Wander]");
  });
  it("keeps reservation numbers, phone numbers, times and prices", () => {
    const s = "Reservation #12345 · 03-1111-2222 · 18:17 · ¥10,000 total · receipt ABC1234X";
    expect(withoutFinancialDetails(s)).toBe(s);
  });
});

describe("tabs recognized by their headers", () => {
  it("reads a train tab whatever its column order, skipping rows that aren't legs", () => {
    const rows = railRows(RAIL, 2026)!;
    expect(rows.map((r) => r.date)).toEqual(["2026-10-06", "2026-10-07", "2026-10-14", "2026-10-14", "2026-10-29"]);
    expect(rows[0].cols["Train"]).toEqual({ text: "NOZOMI 11", a1: "E2" });
    expect(rows[0].cols["Boarding readiness (separate from booking status)"].text).toBe("PENDING — collect at Alpha Oct 6");
  });
  it("reads a checklist and knows its day from its steps", () => {
    const steps = checklistSteps(STEPS)!;
    expect(steps).toHaveLength(3);
    expect(steps[1].cols["When / where"].text).toBe("Alpha, Oct 6; allow an hour");
  });
  it("leaves other tabs alone (they still reach Scout row by row)", () => {
    expect(railRows(STEPS, 2026)).toBeNull();
    expect(checklistSteps(RAIL)).toBeNull();
  });
  it("dates and times in words", () => {
    expect(dateIn("Oct 6", 2026)).toBe("2026-10-06");
    expect(dateIn("10/29", 2026)).toBe("2026-10-29");
    expect(dateIn("STATION PLAN →", 2026)).toBeNull();
    expect(twelveHour("18:17")).toBe("6:17 PM");
    expect(twelveHour("08:07")).toBe("8:07 AM");
    expect(twelveHour("After landing")).toBe("After landing");
  });
});

describe("sources differ — said only when they do", () => {
  const rows = railRows(RAIL, 2026)!;
  const line = (date: string, title: string, detail: string | null, extra: Record<string, unknown> = {}) =>
    ({ date: new Date(`${date}T00:00:00Z`), time: null, endTime: null, kind: "plan", title, detail, source: "Itinerary · travel (row 7)", ...extra });
  it("'leave 6:15 or later' agrees with a 6:17 train", () => {
    expect(railDiffers(rows, [line("2026-10-06", "Alpha → Beta", "leave 6:15 or later · arrive 7ish")])).toEqual([]);
  });
  it("a window that holds the departure agrees; the morning's other train isn't about this leg", () => {
    expect(railDiffers(rows, [line("2026-10-14", "Day trip", "Delta → 8:07a Gamma ... Return: Gamma → Delta ideally around 4:45–5:00 PM")])).toEqual([]);
  });
  it("a day-plan line that boards the same train at another time differs", () => {
    const d = railDiffers(rows, [line("2026-10-29", "Board reserved HARUKA", "Times are Larisa's estimate.\nTabs differ: her Itinerary tab says \"1:30-2:00p Haruka\"",
      { kind: "block", time: "12:30", endTime: "13:00", source: "Kyoto day 5 · Departure" })]);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ date: "2026-10-29", railSays: "HARUKA 31 leaving 1:30 PM", guideSays: "12:30 PM–1:00 PM" });
  });
  it("a different time for the same route differs; a line with no time says nothing", () => {
    expect(railDiffers(rows, [line("2026-10-06", "Alpha → Beta", "the 5:30 train")])[0]?.guideSays).toBe("5:30");
    expect(railDiffers(rows, [line("2026-10-06", "Alpha → Beta", "by bullet train")])).toEqual([]);
  });
});

describe("copies, the API, and Scout's document", () => {
  let tripId = "";
  let sourceId = "";
  let member = "";
  let outsider = "";
  let sheet = { title: "Invented Rail Sheet", tabs: [RAIL, STEPS], contentHash: "h1" };
  const reader = async () => {
    if (sheet.contentHash === "fail") throw new Error("The robot can't open this sheet");
    return sheet;
  };

  beforeAll(async () => {
    const trip = await prisma.trip.create({ data: { name: "OS Other Sources Trip", status: "archived", startDate: new Date("2026-10-05T00:00:00Z") } });
    tripId = trip.id;
    const a = await prisma.traveler.findFirst({ where: { displayName: "OSMember" } }) || await prisma.traveler.create({ data: { displayName: "OSMember" } });
    const b = await prisma.traveler.findFirst({ where: { displayName: "OSOutsider" } }) || await prisma.traveler.create({ data: { displayName: "OSOutsider" } });
    await prisma.tripMember.create({ data: { tripId, travelerId: a.id, role: "planner" } });
    member = signToken({ code: "OSMember", displayName: "OSMember", travelerId: a.id });
    outsider = signToken({ code: "OSOutsider", displayName: "OSOutsider", travelerId: b.id });
    sourceId = (await prisma.tripSource.create({ data: { tripId, name: "Rail sheet", kind: "google_sheet", ref: "invented", owner: "OSMember", authorship: "written with AI help" } })).id;
  });
  afterAll(async () => {
    await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("keeps a copy on the first read", async () => {
    expect(await refreshSource(sourceId, reader)).toEqual({ changed: true });
    const copies = await prisma.sourceCopy.findMany({ where: { sourceId } });
    expect(copies).toHaveLength(1);
    expect(copies[0].status).toBe("current");
  });
  it("keeps no new copy when nothing changed", async () => {
    expect(await refreshSource(sourceId, reader)).toEqual({ changed: false });
    expect(await prisma.sourceCopy.count({ where: { sourceId } })).toBe(1);
  });
  it("a change becomes the current copy; the old one stays as previous", async () => {
    sheet = { ...sheet, contentHash: "h2" };
    expect(await refreshSource(sourceId, reader)).toEqual({ changed: true });
    const copies = await prisma.sourceCopy.findMany({ where: { sourceId }, orderBy: { readAt: "asc" } });
    expect(copies.map((c) => c.status)).toEqual(["previous", "current"]);
  });
  it("a failed read keeps the last good copy and records why", async () => {
    sheet = { ...sheet, contentHash: "fail" };
    const r = await refreshSource(sourceId, reader);
    expect(r.changed).toBe(false);
    expect(r.error).toContain("can't open");
    expect((await prisma.tripSource.findUnique({ where: { id: sourceId } }))!.lastError).toContain("can't open");
    expect(await prisma.sourceCopy.count({ where: { sourceId, status: "current" } })).toBe(1);
    sheet = { ...sheet, contentHash: "h2" };
    await refreshSource(sourceId, reader);
    expect((await prisma.tripSource.findUnique({ where: { id: sourceId } }))!.lastError).toBeNull();
  });

  it("members get its trains and checklist; others get nothing", async () => {
    const res = await request(app).get(`/api/sources/${tripId}`).set("Authorization", `Bearer ${member}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: "Rail sheet", owner: "OSMember", authorship: "written with AI help", title: "Invented Rail Sheet", lastError: null });
    expect(res.body[0].rail).toHaveLength(5);
    expect(res.body[0].checklists[0]).toMatchObject({ tab: "Tix pick up — Alpha", date: "2026-10-06" });
    const no = await request(app).get(`/api/sources/${tripId}`).set("Authorization", `Bearer ${outsider}`);
    expect(no.status).toBe(403);
  });
  it("there is no way to write a source", async () => {
    for (const method of ["post", "put", "patch", "delete"] as const) {
      const res = await (request(app) as any)[method](`/api/sources/${tripId}`).set("Authorization", `Bearer ${member}`).send({});
      expect(res.status).toBe(404);
    }
  });

  it("Scout's document names the sheet and whose it is, and every row carries its cells", async () => {
    const docs = sourceDocuments(await sourceViews(tripId));
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe("Rail sheet (OSMember's, written with AI help)");
    expect(docs[0].lines[0].text).toContain("It is NOT Larisa's Guide");
    const nozomi = docs[0].lines.find((l) => l.text.includes("NOZOMI 11"))!;
    expect(nozomi.text).toContain("Depart: 6:17 PM (written 18:17)");
    expect(nozomi.src).toMatchObject({ type: "sheet", source: "Rail sheet", owner: "OSMember", label: "Trains tab, row 2" });
    expect((nozomi.src as any).cells.some((c: any) => c.a1 === "E2" && c.text === "NOZOMI 11")).toBe(true);
    expect(docs[0].lines.some((l) => l.text.startsWith("Tix pick up — Alpha tab, row 3"))).toBe(true);
  });
});
