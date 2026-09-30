/**
 * Tab readers that recognize a tab by its header row, not by which sheet it's in — so the rail tabs read the same
 * from Ken's rail sheet today or from Larisa's Guide if they move there (Ken, Sep 30 2026). Every value keeps its
 * cell address, for "Sources". Nothing is interpreted beyond splitting columns: the words stay the sheet's own.
 */
import type { GuideTab } from "../guide/reader.js";

export interface Cited { text: string; a1: string }

/** One row of a train-bookings tab ("Rail Detail"): its columns by header name, each with its cell */
export interface RailRow {
  tab: string;
  row: number;
  date: string | null;          // YYYY-MM-DD, from "Oct 6" and the trip's year
  cols: Record<string, Cited>;  // header (as written) → the cell under it
}

/** One step of a checklist tab ("Tix pick up — Shin-Osaka") */
export interface ChecklistStep { tab: string; row: number; cols: Record<string, Cited> }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();

function headerRow(tab: GuideTab, needs: RegExp[]): { row: number; heads: Map<number, string> } | null {
  const rows = new Map<number, typeof tab.cells>();
  for (const c of tab.cells) rows.set(c.r, [...(rows.get(c.r) || []), c]);
  for (const [r, cells] of [...rows.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6)) {
    const texts = cells.map((c) => norm(c.text));
    if (needs.every((n) => texts.some((t) => n.test(t)))) return { row: r, heads: new Map(cells.map((c) => [c.c, c.text.trim()])) };
  }
  return null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** "Oct 6" / "10/6" → "2026-10-06" in the trip's year */
export function dateIn(text: string, year: number): string | null {
  const m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i);
  const n = text.match(/^\s*(\d{1,2})\/(\d{1,2})\b/);
  const month = m ? MONTHS[m[1].toLowerCase()] : n ? Number(n[1]) : 0;
  const day = m ? Number(m[2]) : n ? Number(n[2]) : 0;
  if (!month || !day || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function rowsUnder(tab: GuideTab, header: { row: number; heads: Map<number, string> }) {
  const out = new Map<number, Record<string, Cited>>();
  for (const c of tab.cells) {
    if (c.r <= header.row) continue;
    const head = header.heads.get(c.c);
    if (!head) continue;
    const cols = out.get(c.r) || {};
    cols[head] = { text: c.text, a1: c.a1 };
    out.set(c.r, cols);
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]);
}

/** Is this a train-bookings tab? Its header has a date, a route, a train and a departure or arrival */
export function railRows(tab: GuideTab, year: number): RailRow[] | null {
  const header = headerRow(tab, [/^date$/, /^route$/, /^train$/, /^(depart|arrive)/]);
  if (!header) return null;
  const dateHead = [...header.heads.values()].find((h) => norm(h) === "date")!;
  const routeHead = [...header.heads.values()].find((h) => norm(h) === "route")!;
  return rowsUnder(tab, header)
    // A row is a leg only when it has a date and a route (not "STATION PLAN →")
    .filter(([, cols]) => cols[dateHead] && cols[routeHead] && dateIn(cols[dateHead].text, year))
    .map(([row, cols]) => ({ tab: tab.name, row, date: dateIn(cols[dateHead].text, year), cols }));
}

/** Is this a step-by-step checklist tab? Its header has a step and what to do */
export function checklistSteps(tab: GuideTab): ChecklistStep[] | null {
  const header = headerRow(tab, [/^step$/, /^what to do$/]);
  if (!header) return null;
  return rowsUnder(tab, header).map(([row, cols]) => ({ tab: tab.name, row, cols }));
}

/** The one value under a header, whatever its exact spelling ("Car / seat", "Reservation #") */
export function col(cols: Record<string, Cited>, ...names: RegExp[]): Cited | undefined {
  for (const [head, v] of Object.entries(cols)) if (names.some((n) => n.test(norm(head)))) return v;
  return undefined;
}

/** "18:17" → "6:17 PM"; anything else as written */
export function twelveHour(t: string): string {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t.trim();
  const h = Number(m[1]);
  if (h > 23) return t.trim();
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}
