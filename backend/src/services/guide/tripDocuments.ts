/**
 * Documents someone on the trip gave Wander, apart from Larisa's Guide (Oct 4 2026: Backroads' detailed itinerary,
 * a PDF Ken put in Wander's resources — "the most detailed PDF" for the Backroads week, Oct 18–25). Her sheet gives
 * that week a line a day ("day 7 - hike, lunch"); the document gives each day in full: where to meet and what to
 * bring, the rides and hikes with their distances, which meals are included, when the trip ends.
 *
 * Recorded beside her sheet's address (scripts/set-trip-document.ts, from a transcription kept in trip-data) and kept
 * by every import. Scout reads it as its own labelled section and cites it by day and page — never as her Guide.
 * Backroads' own words, as written; its days are dated from Day 1 = the day her Guide meets Backroads.
 */
import prisma from "../db.js";

export interface TripDocumentSection {
  heading: string;
  /** The trip day it describes (Day 1 = `dayOne`), when it's a day */
  day?: number;
  page: number;
  paragraphs: string[];
}
export interface TripDocument {
  /** what travelers see: "Backroads' itinerary" */
  name: string;
  /** whose words: "Backroads" */
  from: string;
  title: string;
  /** "their general itinerary …, dated May 7, 2026" */
  version: string;
  /** said with it, always: what it is and isn't */
  caution: string;
  /** a short line under its words in Sources ("Details can differ for your departure.") */
  aside?: string;
  addedBy: string;
  file: string;
  /** YYYY-MM-DD of Day 1 */
  dayOne: string | null;
  sections: TripDocumentSection[];
}

const isDoc = (d: any): d is TripDocument =>
  d && typeof d.name === "string" && typeof d.from === "string" && typeof d.caution === "string" && Array.isArray(d.sections)
  && d.sections.every((s: any) => s && typeof s.heading === "string" && typeof s.page === "number" && Array.isArray(s.paragraphs) && s.paragraphs.every((p: any) => typeof p === "string"));

export async function tripDocumentsOf(tripId: string): Promise<TripDocument[]> {
  const cfg = await prisma.sheetSyncConfig.findUnique({ where: { tripId }, select: { tabMappings: true } });
  const list = (cfg?.tabMappings as any)?.documents;
  return Array.isArray(list) ? list.filter(isDoc) : [];
}

/** "Day 1 (Sun, Oct 18)" — the day it falls on, counted from Day 1 */
export function dayWords(doc: Pick<TripDocument, "dayOne">, day: number): string {
  if (!doc.dayOne || !/^\d{4}-\d{2}-\d{2}$/.test(doc.dayOne)) return `Day ${day}`;
  const d = new Date(`${doc.dayOne}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day - 1);
  return `Day ${day} (${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })})`;
}

/** "Backroads'" / "Ken's" */
export const whose = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);

/** Where one paragraph sits: "Day 1 (Sun, Oct 18) · page 4" or "Meet & depart · page 9" */
export const placeIn = (doc: TripDocument, s: TripDocumentSection) => `${s.day ? dayWords(doc, s.day) : s.heading} · page ${s.page}`;
