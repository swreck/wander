/**
 * Where each line Scout reads came from — built in the same pass that writes the line (scoutContext.ts), so
 * a line and its source can't drift apart. When Scout answers, the API's citations point at lines; each
 * pointer resolves to one of these, recorded with the answer. Nothing here is worked out after the fact.
 * (Ken, Sep 30 2026: "A wrong source is worse than none.")
 */
import prisma from "../db.js";
import { cellWordsFor, type GuideCellWords } from "./importSnapshot.js";
import type { GuideTab } from "./reader.js";

export type { GuideCellWords };

/** One place a line's facts came from */
export interface SourcePart { label: string; cells: GuideCellWords[] }

export type SourceView =
  // Her Guide: the cells and her exact words; Wander's own notes on the line listed apart, never as hers
  | { type: "guide"; label: string; cells: GuideCellWords[]; wanderNotes?: string[] }
  // Something Wander worked out (who's still at home on a date, where a flight stands now) and what from
  | { type: "wander"; what: string; from: SourcePart[] }
  // A plan someone added in Wander — not in her Guide
  | { type: "added"; by: string; text: string }
  // A web page Scout read
  | { type: "web"; title: string; url: string; quote: string }
  // Another source Wander reads (Ken's rail sheet): its name, whose it is, how it was written, and its exact cells
  | { type: "sheet"; source: string; owner: string; authorship: string | null; label: string; cells: GuideCellWords[] };

export interface ContextLine { text: string; src: SourceView | null }

// Her tabs for a Guide copy, read once per copy (a copy never changes; a new read is a new copy)
const tabsByCopy = new Map<string, GuideTab[]>();
export async function tabsOfCopy(snapshotId: string): Promise<GuideTab[]> {
  const kept = tabsByCopy.get(snapshotId);
  if (kept) return kept;
  const snap = await prisma.guideSnapshot.findUnique({ where: { id: snapshotId }, select: { tabs: true } });
  const tabs = ((snap?.tabs as unknown) as GuideTab[]) || [];
  if (tabsByCopy.size > 4) tabsByCopy.clear();
  tabsByCopy.set(snapshotId, tabs);
  return tabs;
}

/** Her words at these references ("Tab!F65", "Tab!37" for a row, "image:<sha>"), in the given copy */
export function wordsAt(refs: string[], tabs: GuideTab[]): GuideCellWords[] {
  return refs.length ? cellWordsFor(refs, { tabs } as any) : [];
}

/** An idea's row in her Activities tab ("Activities Template|Mashiko (ceramics town)" → "Activities Template!37") */
export function ideaRef(sheetRowRef: string, tabs: GuideTab[]): string | null {
  const bar = sheetRowRef.indexOf("|");
  if (bar < 0) return null;
  const tabName = sheetRowRef.slice(0, bar);
  const name = sheetRowRef.slice(bar + 1).trim();
  const cell = tabs.find((t) => t.name === tabName)?.cells.find((c) => c.text.trim() === name);
  return cell ? `${tabName}!${cell.r}` : null;
}

/** A Guide line's own recorded cells; an older copy without them is read from its reference */
export function cellsOfItem(i: { cells: unknown; sourceRef: string }, tabs: GuideTab[]): GuideCellWords[] {
  const kept = Array.isArray(i.cells) ? (i.cells as GuideCellWords[]) : null;
  return kept && kept.length ? kept : wordsAt([i.sourceRef], tabs);
}

/** A readable name for a source label: "Japan-Oct26-Itinerary · Description (row 65)" → "Itinerary tab, row 65" */
export function friendlyLabel(source: string): string {
  return source
    .replace(/Japan-Oct26-Itinerary|Itinerary/g, "Itinerary")
    .replace(/^Itinerary · (\w[^()]*)\(row (\d+)\)/, "Itinerary tab, $1(row $2)")
    .replace(/\s+/g, " ")
    .trim();
}
