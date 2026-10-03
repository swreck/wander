/**
 * WANDER'S OWN NOTES ON HER PLACES (Oct 2 2026): her Guide names "Shirakabeso" and nothing more; Backroads describes it
 * as a ryokan in a forested valley on the Izu Peninsula, 1594 Yugashima, Izu (added by Ken).
 * - Scout reads it beside her stay, marked as Wander's addition with its source — never as her Guide
 * - Sources lists it apart, as Wander's note
 * - Walk/Train/Taxi goes to its location when nothing of hers gives one
 * - a name is matched as a whole name, not a piece of a word
 * Invented data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-place-notes";
const { executeTool } = await import("../src/routes/chat.js");
const { buildGuideContextParts } = await import("../src/services/guide/scoutContext.js");
const { noteFor, placeNotesOf } = await import("../src/services/guide/placeNotes.js");
const prisma = new PrismaClient();

let tripId = "";
beforeAll(async () => {
  tripId = (await prisma.trip.create({ data: { name: "Place Notes Trip", status: "archived", timeZone: "Asia/Tokyo", startDate: new Date("2027-05-01"), endDate: new Date("2027-05-05") } })).id;
  await prisma.guideSnapshot.create({ data: { tripId, sourceName: "pn.xlsx", sourceKind: "xlsx", contentHash: "pn", status: "current", tabs: [] } });
  const city = await prisma.city.create({ data: { tripId, name: "Mossvale", sequenceOrder: 0, latitude: 34.89, longitude: 138.92 } });
  await prisma.accommodation.create({ data: { tripId, cityId: city.id, name: "Mossvale", checkInDate: new Date("2027-05-02T00:00:00Z"), checkOutDate: new Date("2027-05-04T00:00:00Z") } });
  await prisma.sheetSyncConfig.create({ data: { tripId, spreadsheetId: "", tabMappings: { source: "snapshot", placeNotes: [
    { name: "Mossvale", what: "an inn in a forested valley on the Kiri Peninsula", address: "12 Valley Road, Kiri", lat: 34.89, lng: 138.92, from: "the tour company's description, added by Kip", addedAt: "2027-04-01T00:00:00Z" },
  ] } } });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("Wander's note on her place", () => {
  it("Scout reads it beside her stay, as Wander's addition with its source", async () => {
    const { stableLines } = await buildGuideContextParts(tripId, {});
    const line = stableLines.find((l) => l.text.startsWith("- Mossvale") && /sleeping there/.test(l.text))!;
    expect(line.text).toMatch(/\[WANDER'S ADDITION, not her Guide — the tour company's description, added by Kip: Mossvale is an inn in a forested valley on the Kiri Peninsula; address 12 Valley Road, Kiri\]/);
    expect((line.src as any).wanderNotes).toEqual(["Where it is comes from the tour company's description, added by Kip: an inn in a forested valley on the Kiri Peninsula, 12 Valley Road, Kiri"]);
  });
  it("Walk/Train/Taxi goes to its location", async () => {
    const r = await executeTool("directions", { tripId, place: "Mossvale", town: "Kiri", way: "train" }, { travelerId: "x", code: "K", displayName: "Kip" } as any);
    expect(new URL(r.route!.apple).searchParams.get("daddr")).toBe("34.89,138.92");
    expect(r.route!.search).toBeUndefined();
  });
  it("a whole name, not a piece of a word", async () => {
    const notes = await placeNotesOf(tripId);
    expect(noteFor(notes, "Check out · Mossvale")?.name).toBe("Mossvale");
    expect(noteFor(notes, "Mossvalebrook Inn")).toBeUndefined();
  });
});
