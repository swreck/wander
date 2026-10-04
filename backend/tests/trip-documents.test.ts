/**
 * A DOCUMENT SOMEONE GAVE WANDER (Oct 4 2026: Backroads' itinerary, from Ken's PDF) — invented data.
 * - Scout reads it as its own section, headed as the tour company's own words and NOT her Guide, with what it is
 * - each paragraph is its own line, citing the document, the day (dated from Day 1) and the page
 * - a long paragraph cited in an answer shows the sentences that bear on what Scout said
 * - a malformed record is left out, never half-read
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-trip-documents";
const { buildGuideContextParts } = await import("../src/services/guide/scoutContext.js");
const { tripDocumentsOf, dayWords, whose } = await import("../src/services/guide/tripDocuments.js");
const { answerSources } = await import("../src/services/guide/answerSources.js");
const prisma = new PrismaClient();

const LONG = "Start the day with a stroll along the river path. " + "The path passes old mills and a tea house. ".repeat(6) + "We gather tonight at the lodge for a farewell dinner of regional dishes.";
const DOC = {
  name: "Trailmakers' itinerary", from: "Trailmakers", title: "Detailed Itinerary — Kiri Peninsula", version: "their general itinerary, dated Jan 2, 2027",
  caution: "Trailmakers' general itinerary, not one for your exact departure.", addedBy: "Kip", file: "kiri.pdf", dayOne: "2027-05-02",
  sections: [
    { heading: "Meet & depart", page: 9, paragraphs: ["Meeting Time: 8:30 a.m. at the Harbor Inn lobby."] },
    { heading: "Day 1", day: 1, page: 4, paragraphs: ["Bring a day pack with rain clothes."] },
    { heading: "Day 3", day: 3, page: 6, paragraphs: ["Tonight's dinner is at your leisure.", LONG] },
  ],
};
let tripId = "";
beforeAll(async () => {
  tripId = (await prisma.trip.create({ data: { name: "Trip Documents Trip", status: "archived", timeZone: "Asia/Tokyo", startDate: new Date("2027-05-01"), endDate: new Date("2027-05-06") } })).id;
  await prisma.guideSnapshot.create({ data: { tripId, sourceName: "td.xlsx", sourceKind: "xlsx", contentHash: "td", status: "current", tabs: [] } });
  await prisma.sheetSyncConfig.create({ data: { tripId, spreadsheetId: "", tabMappings: { source: "snapshot", documents: [DOC, { name: "half a record", sections: "nope" }] } as any } });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("a document someone gave Wander", () => {
  it("only a whole record is read", async () => {
    expect((await tripDocumentsOf(tripId)).map((d) => d.name)).toEqual(["Trailmakers' itinerary"]);
  });
  it("its days are dated from Day 1; its owner said rightly", () => {
    expect(dayWords(DOC, 1)).toBe("Day 1 (Sun, May 2)");
    expect(dayWords(DOC, 3)).toBe("Day 3 (Tue, May 4)");
    expect(dayWords({ dayOne: null }, 3)).toBe("Day 3");
    expect(whose("Trailmakers")).toBe("Trailmakers'");
    expect(whose("Kip")).toBe("Kip's");
  });
  it("Scout reads it as its own section — their words, not her Guide — each line citing the day and page", async () => {
    const { stableLines } = await buildGuideContextParts(tripId, {});
    const head = stableLines.find((l) => l.text.includes("TRAILMAKERS' ITINERARY"))!;
    expect(head.text).toMatch(/Trailmakers' own words, given to Wander by Kip — NOT Larisa's Guide; their general itinerary, dated Jan 2, 2027\)/);
    expect(head.text).toMatch(/Its Day 1 is Sun, May 2, the day her Guide meets Trailmakers/);
    const pack = stableLines.find((l) => l.text === "- Bring a day pack with rain clothes.")!;
    expect(pack.src).toEqual({ type: "document", document: "Trailmakers' itinerary", from: "Trailmakers", version: "their general itinerary, dated Jan 2, 2027", place: "Day 1 (Sun, May 2) · page 4", quote: "Bring a day pack with rain clothes." });
    const meet = stableLines.find((l) => l.text.startsWith("- Meeting Time"))!;
    expect((meet.src as any).place).toBe("Meet & depart · page 9");
    expect(stableLines.some((l) => l.text === "[Trailmakers' itinerary — Day 3 (Tue, May 4) (page 6)]")).toBe(true);
  });
  it("a long paragraph cited in an answer shows the sentences that matter", async () => {
    const { stableLines } = await buildGuideContextParts(tripId, {});
    const at = stableLines.findIndex((l) => l.text === `- ${LONG}`);
    const doc = { title: "Guide", lines: stableLines };
    const said = "The farewell dinner is at the lodge tonight.";
    const s = answerSources(said, [{ text: said, citations: [{ type: "content_block_location", document_title: "Guide", start_block_index: at, end_block_index: at + 1, cited_text: LONG } as any] }], [doc], null);
    const src = s.claims[0].sources[0] as any;
    expect(src.type).toBe("document");
    expect(src.quote).toContain("farewell dinner");
    expect(src.quote.length).toBeLessThan(LONG.length);
  });
});
