/**
 * Her sheet's own address, so "Sources" under a Scout answer can open the exact spot in it (Ken, Oct 2 2026: "if
 * Larisa wanted to check something in her spreadsheet, asking Scout would be the fastest way to find the exact spot").
 *
 * Wander never reaches her sheet: this is only an address a person taps on their own phone, where Google decides
 * whether they may see it. It lives in the database (the repo is public), beside the trip's import record, and every
 * import keeps it. Each tab's id ("gid") comes from Ken — her downloaded copy has none — and a tab Wander has no id for
 * still opens her sheet, with the tab and cell said in words.
 */
import prisma from "../db.js";
import { currentSources } from "../sources/refresh.js";

export interface SheetLink {
  /** https://docs.google.com/spreadsheets/d/<id>/edit */
  url: string;
  /** her tab names as her downloaded copy spells them → the tab's id in her sheet */
  tabs: Record<string, number>;
}

/** A sheet tab's name as Google's .xlsx download spells it: no ' / ? * [ ] :, at most 31 characters
 *  ("Japan-Oct'26-Itinerary" → "Japan-Oct26-Itinerary", "4/6 Mtg Summary" → "46 Mtg Summary") */
export const xlsxTabName = (name: string) => name.replace(/[\\/?*[\]:']/g, "").slice(0, 31);

/** The address of one spot: the tab and cell when Wander knows the tab's id; otherwise her sheet itself */
export function spotUrl(link: SheetLink, tab: string, a1?: string): { url: string; exact: boolean } {
  const gid = link.tabs[tab];
  if (gid === undefined) return { url: link.url, exact: false };
  return { url: `${link.url}?gid=${gid}#gid=${gid}${a1 ? `&range=${a1}` : ""}`, exact: true };
}

/** The other sheets Wander reads for a trip (Ken's rail sheet), by name: its own address, and the tab ids its last
 *  read recorded */
export async function otherSheetLinks(tripId: string): Promise<Record<string, SheetLink>> {
  const out: Record<string, SheetLink> = {};
  for (const { source, copy } of await currentSources(tripId)) {
    if (source.kind !== "google_sheet" || !/^[\w-]+$/.test(source.ref)) continue;
    const tabs: Record<string, number> = {};
    for (const t of ((copy?.tabs as unknown) as { name: string; gid?: number }[]) || []) if (typeof t.gid === "number") tabs[t.name] = t.gid;
    out[source.name] = { url: `https://docs.google.com/spreadsheets/d/${source.ref}/edit`, tabs };
  }
  return out;
}

export async function sheetLinkOf(tripId: string): Promise<SheetLink | null> {
  const cfg = await prisma.sheetSyncConfig.findUnique({ where: { tripId }, select: { tabMappings: true } });
  const link = (cfg?.tabMappings as any)?.sheetLink;
  return link && typeof link.url === "string" && /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+\/edit$/.test(link.url)
    ? { url: link.url, tabs: link.tabs && typeof link.tabs === "object" ? link.tabs : {} }
    : null;
}
