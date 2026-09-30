/**
 * Read a Google Sheet Wander has been given view-only access to, as tabs of cells with their addresses — the same
 * shape as a copy of Larisa's Guide (services/guide/reader.ts), so citations, "Sources" and the tab readers work
 * the same whichever source a tab came from. Read-only scope; nothing here can write to a sheet.
 * Never used on Larisa's Guide (Wander reads her sheet only from the copies Ken gives it).
 */
import crypto from "crypto";
import fs from "fs";
import { google } from "googleapis";
import type { GuideCell, GuideTab } from "../guide/reader.js";
import { columnLetter } from "../guide/reader.js";
import { withoutFinancialDetails } from "./filter.js";

function credentials(): Record<string, unknown> {
  if (process.env.GOOGLE_SHEETS_CREDENTIALS_B64) {
    return JSON.parse(Buffer.from(process.env.GOOGLE_SHEETS_CREDENTIALS_B64, "base64").toString("utf-8"));
  }
  const path = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH;
  if (!path) throw new Error("Wander has no Google key to read sheets with");
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

export interface SheetRead { title: string; tabs: GuideTab[]; contentHash: string }

export async function readGoogleSheet(spreadsheetId: string): Promise<SheetRead> {
  const auth = new google.auth.GoogleAuth({ credentials: credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "properties(title),sheets.properties(title,index)" });
  const title = meta.data.properties?.title || "";
  const tabs: GuideTab[] = [];
  for (const s of meta.data.sheets || []) {
    const name = s.properties?.title || "";
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId, range: `'${name.replace(/'/g, "''")}'`, valueRenderOption: "FORMATTED_VALUE",
    });
    const cells: GuideCell[] = [];
    (r.data.values || []).forEach((row, ri) => row.forEach((v, ci) => {
      const text = withoutFinancialDetails(String(v ?? "")).trim();
      if (text) cells.push({ a1: `${columnLetter(ci + 1)}${ri + 1}`, r: ri + 1, c: ci + 1, text, kind: "text" });
    }));
    tabs.push({ name, index: s.properties?.index ?? tabs.length, cells, merged: [], images: [] });
  }
  const contentHash = crypto.createHash("sha256").update(JSON.stringify({ title, tabs })).digest("hex");
  return { title, tabs, contentHash };
}
