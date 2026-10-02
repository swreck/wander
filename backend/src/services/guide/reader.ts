/**
 * Guide reader — turns a snapshot of Larisa's sheet into one normalized, source-neutral form.
 *
 * Today the source is an .xlsx file exported from Google Sheets. Later the same shape will be
 * produced from the live sheet (read-only). Everything downstream (interpretation, Scout,
 * "From the Guide") works from this shape, so it never cares where the snapshot came from.
 *
 * Faithfulness rules:
 * - Every non-empty cell is kept, with its address. Nothing is dropped or reworded.
 * - Dates and times of day are recognized as such (Excel stores both as numbers/dates).
 * - Bold, merged cells, and links are kept — the sheet's structure is carried by them.
 * - Every pasted picture is kept (bytes stored once, by content hash) with its tab + cell.
 */

import crypto from "crypto";
import ExcelJS from "exceljs";

export interface GuideCell {
  a1: string;           // "F45"
  r: number;            // 1-based row
  c: number;            // 1-based column
  text: string;         // what a person sees in the cell
  kind: "text" | "number" | "date" | "time" | "datetime";
  date?: string;        // "2026-10-18" when kind is date/datetime
  time?: string;        // "08:30" when kind is time/datetime
  bold?: boolean;
  link?: string;
}

export interface GuideImagePlacement {
  anchor: string;       // top-left cell, e.g. "A2"
  sha256: string;
}

export interface GuideTab {
  name: string;
  index: number;        // order in the sheet
  cells: GuideCell[];   // non-empty cells, row-major
  merged: string[];     // e.g. ["C46:J46"]
  images: GuideImagePlacement[];
  /** the tab's id in a Google Sheet Wander reads directly (Ken's rail sheet); a downloaded copy has none */
  gid?: number;
}

export interface GuideImageFile {
  sha256: string;
  mimeType: string;
  bytes: Buffer;
}

export interface GuideReadResult {
  tabs: GuideTab[];
  images: GuideImageFile[];
  contentHash: string;
}

function columnLetter(col: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Excel stores a time of day as a date on 1899-12-30; a calendar date as UTC midnight. */
function describeDate(d: Date): Pick<GuideCell, "kind" | "date" | "time" | "text"> {
  const y = d.getUTCFullYear();
  const hhmm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  const ymd = `${y}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (y <= 1900) return { kind: "time", time: hhmm, text: hhmm };
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return { kind: "date", date: ymd, text: ymd };
  }
  return { kind: "datetime", date: ymd, time: hhmm, text: `${ymd} ${hhmm}` };
}

function cellToGuideCell(cell: ExcelJS.Cell, r: number, c: number): GuideCell | null {
  const base = { a1: `${columnLetter(c)}${r}`, r, c, bold: cell.font?.bold ? true : undefined };
  let v: unknown = cell.value;
  if (v === null || v === undefined || v === "") return null;

  // Formula cells: use the computed result
  if (typeof v === "object" && v !== null && "result" in (v as any)) v = (v as any).result;
  if (v === null || v === undefined || v === "") return null;
  // A formula the download kept no answer for (her Itinerary's shared "R44+V44+AA44" totals) has no words to show —
  // it was read as "[object Object]" (round 15: a source could have quoted that)
  if (typeof v === "object" && ("formula" in (v as any) || "sharedFormula" in (v as any))) return null;

  if (v instanceof Date) return { ...base, ...describeDate(v) };
  if (typeof v === "number") return { ...base, kind: "number", text: String(v) };
  if (typeof v === "boolean") return { ...base, kind: "text", text: v ? "TRUE" : "FALSE" };
  if (typeof v === "string") return v.trim() === "" ? null : { ...base, kind: "text", text: v };

  if (typeof v === "object") {
    const o = v as any;
    // Hyperlink: { text, hyperlink }  (text may itself be rich text)
    if (o.hyperlink) {
      const text = typeof o.text === "string" ? o.text
        : Array.isArray(o.text?.richText) ? o.text.richText.map((t: any) => t.text).join("")
        : String(o.hyperlink);
      return { ...base, kind: "text", text, link: String(o.hyperlink) };
    }
    // Rich text: { richText: [{ text, font }] }
    if (Array.isArray(o.richText)) {
      const text = o.richText.map((t: any) => t.text ?? "").join("");
      const bold = base.bold || o.richText.some((t: any) => t.font?.bold) ? true : undefined;
      return text.trim() === "" ? null : { ...base, bold, kind: "text", text };
    }
    if (typeof o.error === "string") return { ...base, kind: "text", text: o.error };
  }
  const text = String(v);
  return text.trim() === "" ? null : { ...base, kind: "text", text };
}

/** Read an .xlsx snapshot (from a Google Sheets download) into the normalized Guide shape. */
export async function readGuideXlsx(buffer: Buffer): Promise<GuideReadResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);

  // Pictures: ExcelJS keeps the files in wb.model.media and placements per sheet.
  const media = ((wb.model as any).media || []) as Array<{ buffer: Buffer; extension: string; name?: string }>;
  const imageById = new Map<number, GuideImageFile>();
  const imagesBySha = new Map<string, GuideImageFile>();
  media.forEach((m, i) => {
    if (!m?.buffer) return;
    const sha256 = crypto.createHash("sha256").update(m.buffer).digest("hex");
    const ext = (m.extension || "png").toLowerCase();
    const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/png";
    const file = { sha256, mimeType, bytes: Buffer.from(m.buffer) };
    imageById.set(i, file);
    imagesBySha.set(sha256, file);
  });

  const tabs: GuideTab[] = [];
  let index = 0;
  wb.eachSheet((ws) => {
    const cells: GuideCell[] = [];
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        // Merged cells repeat the master's value; keep it only once, at the master.
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) return;
        const gc = cellToGuideCell(cell, r, c);
        if (gc) cells.push(gc);
      });
    });
    const merged = Object.keys(((ws as any)._merges || {}) as Record<string, unknown>)
      .map((k) => (ws as any)._merges[k]?.range || (ws as any)._merges[k]?.shortRange || k)
      .filter(Boolean)
      .map(String);
    const images: GuideImagePlacement[] = ws.getImages().flatMap((img) => {
      const file = imageById.get(Number(img.imageId));
      if (!file) return [];
      const col = Math.floor(img.range.tl.nativeCol) + 1;
      const row = Math.floor(img.range.tl.nativeRow) + 1;
      return [{ anchor: `${columnLetter(col)}${row}`, sha256: file.sha256 }];
    });
    tabs.push({ name: ws.name, index: index++, cells, merged, images });
  });

  const contentHash = crypto.createHash("sha256")
    .update(JSON.stringify(tabs.map((t) => [t.name, t.cells.map((c) => [c.a1, c.text, c.link || ""]), t.images])))
    .digest("hex");

  return { tabs, images: Array.from(imagesBySha.values()), contentHash };
}

/** Convenience lookups used by the interpreter and by Scout's context. */
export function cellAt(tab: GuideTab, a1: string): GuideCell | undefined {
  return tab.cells.find((c) => c.a1 === a1);
}

export function rowsOf(tab: GuideTab): Map<number, GuideCell[]> {
  const rows = new Map<number, GuideCell[]>();
  for (const c of tab.cells) {
    const list = rows.get(c.r) || [];
    list.push(c);
    rows.set(c.r, list);
  }
  return rows;
}

export { columnLetter };
