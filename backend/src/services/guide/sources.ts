/**
 * Where each line Scout reads came from — built in the same pass that writes the line (scoutContext.ts), so
 * a line and its source can't drift apart. When Scout answers, the API's citations point at lines; each
 * pointer resolves to one of these, recorded with the answer. Nothing here is worked out after the fact.
 * (Ken, Sep 30 2026: "A wrong source is worse than none.")
 */
import prisma from "../db.js";
import { cellWordsFor, flatWords, type GuideCellWords } from "./importSnapshot.js";
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

/**
 * A line's cells, completed from her rows: every filled cell in the line's rows whose words are in the line, and the
 * one cell anywhere in her Guide holding a passage the line quotes. Round 15 found lines whose recorded cells missed
 * where their words were — a stay's dates (C52, D52 beside "Shirakabeso" in T52), a merged line's second row (her
 * Itinerary note in Q67 on the flight line of row 69), the ninth cell of a row (the Imperial's airport words in Y13)
 * — so Sources pointed at the right row but not the right cell, or at the wrong row. Decided only from her cells:
 * a cell's whole words must be in the line, or a quoted passage of 20+ characters must be in exactly one cell.
 * The rows are the line's own cells' rows and any "(row N)" its label names.
 */
export function completeCells(line: string, cells: GuideCellWords[], tabs: GuideTab[], label = ""): GuideCellWords[] {
  if (!tabs.length) return cells;
  const said = flatWords(line);
  const have = new Set(cells.filter((c) => c.kind === "cell").map((c) => `${c.tab}!${(c as any).a1}`));
  const rows = new Map<string, Set<number>>();
  const addRow = (tab: string, r: number) => { if (!rows.has(tab)) rows.set(tab, new Set()); rows.get(tab)!.add(r); };
  for (const c of cells) if (c.kind === "cell") addRow(c.tab, Number(c.a1.replace(/^[A-Z]+/, "")));
  // "Itinerary · travel (row 69) + Screenshot in Flight info + Itinerary · Description (row 67)"
  for (const part of label.split(/\s+\+\s+/)) {
    const m = part.match(/^(.+?) · .*\(row (\d+)\)/);
    if (!m) continue;
    const name = m[1].trim().toLowerCase();
    const tab = tabs.find((t) => t.name.toLowerCase() === name) || tabs.find((t) => t.name.toLowerCase().includes(name));
    if (tab) addRow(tab.name, Number(m[2]));
  }
  const added: { tab: string; c: { a1: string; r: number; c: number; text: string } }[] = [];
  const add = (tab: string, c: { a1: string; r: number; c: number; text: string }) => {
    const key = `${tab}!${c.a1}`;
    if (have.has(key)) return;
    have.add(key);
    added.push({ tab, c });
  };
  // The times Wander writes from her own ("08:30" from "8:30a", "15:00" from "~3p")
  const lineTimes = new Set([...line.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].map((m) => `${Number(m[1])}:${m[2]}`));
  const timeOf = (w: string) => {
    const m = w.match(/^~?\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/);
    if (!m) return null;
    const h = (Number(m[1]) % 12) + (m[3] === "p" ? 12 : 0);
    return `${h}:${m[2] || "00"}`;
  };
  for (const [tabName, rs] of rows) {
    const tab = tabs.find((t) => t.name === tabName);
    if (!tab) continue;
    for (const c of tab.cells) {
      if (!rs.has(c.r) || !c.text?.trim()) continue;
      const w = flatWords(c.text);
      const t = timeOf(w);
      if (t) { if (lineTimes.has(t)) add(tabName, c); continue; }
      // (short cells — "3", "X" — are too easily found by accident; a bare number never counts)
      if (w.length >= 4 && !/^[\d.,]+$/.test(w) && said.includes(w)) add(tabName, c);
    }
  }
  // (a quote opens after a space, colon or bracket and closes before one — so the end of one quote and the start of
  // the next are never read as a quote of the words between them)
  for (const m of line.matchAll(/(?:^|[\s:(\[])[“"]([^”"\n]{20,}?)[”"](?=[\s.,;:)\]]|$)/g)) {
    const q = flatWords(m[1]);
    const holding = tabs.flatMap((t) => t.cells.filter((c) => c.text && flatWords(c.text).includes(q)).map((c) => ({ tab: t.name, c })));
    if (holding.length === 1) add(holding[0].tab, holding[0].c);
  }
  const lineTabs = [...rows.keys()];
  // A stretch of her words the line carries from another row of the same tab ("WHERE IS BIZEN TOUR STARTING", from
  // her city heading in C16 above the hotel's row 17): the one cell in that tab holding it
  const herWords = line.replace(/\[[^\]]*\]/g, " ").replace(/\(source: [^\n]*/g, " ").replace(/Larisa's (travel )?note:/g, " ");
  for (const seg of herWords.split(/\s+—\s+|;\s+|,\s+|\n+/)) {
    // (without Wander's own lead-in: "- (no time given) stop: ", "- 08:30–09:30 travel: ")
    const q = flatWords(seg.replace(/^\s*-?\s*(?:\(no time given\)|\d{1,2}:\d{2}(?:–\d{1,2}:\d{2})?)\s+[a-z]+:\s*/, "").replace(/^[\s\-–(]+|[\s\-–)]+$/g, ""));
    if (q.length < 20) continue;
    for (const tabName of lineTabs) {
      const hits = (tabs.find((t) => t.name === tabName)?.cells || []).filter((c) => c.text && flatWords(c.text).includes(q));
      if (hits.length === 1) add(tabName, hits[0]);
    }
  }
  // "Where: Gion Tsujiri Main Shop — the stop her tab lists for this": that stop's cell in the same tab (the
  // smallest cell holding its name)
  for (const m of line.matchAll(/Where: (.+?) — the stop her tab lists/g)) {
    const name = flatWords(m[1]);
    for (const tabName of lineTabs) {
      const hits = (tabs.find((t) => t.name === tabName)?.cells || []).filter((c) => c.text && flatWords(c.text).includes(name)).sort((a, b) => a.text.length - b.text.length);
      if (hits.length) { add(tabName, hits[0]); break; }
    }
  }
  // "A picture in her tab lists this under …": the picture, when her tab has just the one
  const pictures: GuideCellWords[] = [];
  if (/A picture in her tab lists this under/.test(line)) {
    for (const tabName of lineTabs) {
      const imgs = tabs.find((t) => t.name === tabName)?.images || [];
      if (imgs.length === 1 && !cells.some((c) => c.kind === "picture" && c.sha256 === imgs[0].sha256)) pictures.push({ kind: "picture", tab: tabName, anchor: imgs[0].anchor, sha256: imgs[0].sha256 });
    }
  }
  if (!added.length && !pictures.length) return cells;
  added.sort((a, b) => a.tab.localeCompare(b.tab) || a.c.r - b.c.r || a.c.c - b.c.c);
  return [...cells, ...added.map(({ tab, c }) => ({ kind: "cell" as const, tab, a1: c.a1, text: c.text })), ...pictures];
}

/** Where a line is in her sheet, for a screen's "Open this spot": each tab with its cell addresses (a picture by the
 *  cell it sits on), in the order first named */
export function spotsOf(cells: GuideCellWords[]): { tab: string; a1s: string[] }[] {
  const out: { tab: string; a1s: string[] }[] = [];
  for (const c of cells) {
    if (!c.tab) continue;
    const at = c.kind === "cell" ? c.a1 : c.kind === "picture" ? c.anchor : "";
    let s = out.find((x) => x.tab === c.tab);
    if (!s) out.push((s = { tab: c.tab, a1s: [] }));
    if (at && !s.a1s.includes(at)) s.a1s.push(at);
  }
  return out;
}

/** A readable name for a source label: "Japan-Oct26-Itinerary · Description (row 65)" → "Itinerary tab, row 65" */
export function friendlyLabel(source: string): string {
  return source
    .replace(/Japan-Oct26-Itinerary|Itinerary/g, "Itinerary")
    .replace(/^Itinerary · (\w[^()]*)\(row (\d+)\)/, "Itinerary tab, $1(row $2)")
    .replace(/\s+/g, " ")
    .trim();
}
