/**
 * Tab readers that recognize a tab by its header row, not by which sheet it's in — so the rail tabs read the same
 * from Ken's rail sheet today or from Larisa's Guide if they move there (Ken, Sep 30 2026). Every value keeps its
 * cell address, for "Sources". Nothing is interpreted beyond splitting columns: the words stay the sheet's own.
 */
import type { GuideTab } from "../guide/reader.js";

/** A cell's words and address; `tab` when it's from another tab than its row's (a rebooking tab's new reservation #) */
export interface Cited { text: string; a1: string; tab?: string }

/** One row of a train-bookings tab ("Rail Detail"): its columns by header name, each with its cell */
export interface RailRow {
  tab: string;
  row: number;
  date: string | null;          // YYYY-MM-DD, from "Oct 6" and the trip's year
  cols: Record<string, Cited>;  // header (as written) → the cell under it
  /** A rebooking tab's word on this booking (cancelled, rebooked, its new number) — see applyRebooks */
  rebook?: Rebook;
}

/** What a rebooking tab says about one train (Ken, Oct 8: "REBOOK — ACTION": cancel each, rebook it on the new card) */
export interface Rebook {
  tab: string; row: number;
  cancelled: boolean; rebooked: boolean;
  oldRes: string | null; newRes: Cited | null; newSeats: Cited | null;
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

/**
 * Is this a rebooking tab? Its header has a date, a train, and marks for cancelled and rebooked (Ken's "REBOOK — ACTION",
 * Oct 8: "Cancelled | Rebooked | Date | FROM | TO | Train | … | OLD res # | Receipt | NEW res # | NEW seats | Notes").
 * One entry per train it names, by its date and train.
 */
const TICKED = /^(true|yes|y|x|✓|✔|done|☑)$/i;
export function rebookRows(tab: GuideTab, year: number): (Rebook & { date: string; train: string })[] | null {
  const header = headerRow(tab, [/^date$/, /^train$/, /^cancel/, /^rebook/]);
  if (!header) return null;
  const heads = [...header.heads.values()];
  const h = (re: RegExp) => heads.find((x) => re.test(norm(x)));
  const [dateH, trainH, cancelH, rebookH] = [h(/^date$/)!, h(/^train$/)!, h(/^cancel/)!, h(/^rebook/)!];
  const oldH = h(/^old res/), newResH = h(/^new res/), newSeatH = h(/^new seat/);
  return rowsUnder(tab, header)
    .filter(([, cols]) => cols[dateH] && cols[trainH]?.text.trim() && dateIn(cols[dateH].text, year))
    .map(([row, cols]) => {
      const filled = (k?: string) => (k && cols[k] && cols[k].text.trim() && cols[k].text.trim() !== "—" ? { ...cols[k], tab: tab.name } : null);
      return {
        tab: tab.name, row, date: dateIn(cols[dateH].text, year)!, train: cols[trainH].text.trim(),
        cancelled: TICKED.test(cols[cancelH]?.text.trim() || ""), rebooked: TICKED.test(cols[rebookH]?.text.trim() || ""),
        oldRes: filled(oldH)?.text.trim() || null, newRes: filled(newResH), newSeats: filled(newSeatH),
      };
    });
}

/**
 * A booking the rebooking tab marks cancelled is never said as current: its reservation #, seats, cost, notes and
 * boarding note are kept, renamed as the cancelled booking's ("Cancelled booking — reservation #"), so no screen or
 * Scout reads them as today's; the new number and seats take their place once they're in the sheet. A train it lists
 * but hasn't cancelled yet keeps its booking, with the rebooking still to do said beside it.
 */
export function applyRebooks(rail: RailRow[], rebooks: (Rebook & { date: string; train: string })[]): RailRow[] {
  const key = (s: string) => norm(s).replace(/\s+/g, "");
  return rail.map((r) => {
    const train = col(r.cols, /^train$/)?.text || "";
    const rb = train ? rebooks.find((x) => x.date === r.date && key(x.train) === key(train)) : undefined;
    if (!rb) return r;
    const rebook: Rebook = { tab: rb.tab, row: rb.row, cancelled: rb.cancelled, rebooked: rb.rebooked, oldRes: rb.oldRes, newRes: rb.newRes, newSeats: rb.newSeats };
    if (!rb.cancelled) return { ...r, rebook };
    const cols: Record<string, Cited> = {};
    for (const [head, v] of Object.entries(r.cols)) {
      const n = norm(head);
      const old = /^(reso|reservation|res #|res$)/.test(n) ? "reservation #"
        : /^car/.test(n) ? "seats"
        : /^cost/.test(n) ? "cost"
        : /^notes$/.test(n) ? "notes"
        : /readiness/.test(n) ? "boarding note"
        : null;
      cols[old ? `Cancelled booking — ${old}` : head] = v;
    }
    // (who it's for — "Ken + Larisa only" — is about the trip, not the booking: it stays where the screens look for it)
    const only = col(r.cols, /^notes$/)?.text.match(/^\s*([A-Z][a-z]+(?:\s*(?:\+|&|and)\s*[A-Z][a-z]+)*\s+only)\b/)?.[1];
    if (only) cols["Who"] = { text: only, a1: col(r.cols, /^notes$/)!.a1 };
    if (rb.newRes) cols["Reservation #"] = rb.newRes;
    if (rb.newSeats) cols["Car / seat"] = rb.newSeats;
    return { ...r, cols, rebook };
  });
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
