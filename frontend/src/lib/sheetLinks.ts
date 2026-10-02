/**
 * Her sheet's address and its tabs' ids (backend sheetLink.ts), for "Open at this spot in her sheet ↗" — under a
 * Scout answer's Sources and under each line of a day (Ken, Oct 2: asking Wander should be the fastest way to the exact
 * spot). Wander never opens her sheet itself; the phone does, and Google decides who may see it.
 */
import { api } from "./api";

export interface SheetLink { url: string; tabs: Record<string, number> }
export interface SheetLinks { link: SheetLink | null; others: Record<string, SheetLink> }

const byTrip = new Map<string, Promise<SheetLinks>>();
/** Once per trip per visit (a failed ask is tried again next time) */
export function sheetLinks(tripId: string): Promise<SheetLinks> {
  if (!byTrip.has(tripId)) {
    const p = api.get<SheetLinks>(`/guide/sheet-link/${tripId}`).catch(() => { byTrip.delete(tripId); return { link: null, others: {} }; });
    byTrip.set(tripId, p);
  }
  return byTrip.get(tripId)!;
}

const colNum = (a1: string) => a1.replace(/\d+$/, "").split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (n: number): string => (n > 26 ? colName(Math.floor((n - 1) / 26)) : "") + String.fromCharCode(65 + ((n - 1) % 26));
/** The smallest block of cells holding them all ("C52:T52"), so the sheet opens with every one of them in view */
export function rangeOf(a1s: string[]): string {
  const ok = a1s.filter((a) => /^[A-Z]+\d+$/.test(a));
  if (ok.length <= 1) return ok[0] || "";
  const cols = ok.map(colNum), rows = ok.map((a) => Number(a.match(/\d+$/)![0]));
  return `${colName(Math.min(...cols))}${Math.min(...rows)}:${colName(Math.max(...cols))}${Math.max(...rows)}`;
}

/** The address of a spot: the tab and its cells when Wander knows the tab's id (exact); otherwise her sheet itself */
export function spotHref(link: SheetLink, tab: string, a1s: string[]): { href: string; exact: boolean; range: string } {
  const gid = link.tabs[tab];
  const range = rangeOf(a1s);
  if (gid === undefined) return { href: link.url, exact: false, range };
  return { href: `${link.url}?gid=${gid}#gid=${gid}${range ? `&range=${range}` : ""}`, exact: true, range };
}
