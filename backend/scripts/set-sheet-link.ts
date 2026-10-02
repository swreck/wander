/**
 * Records her sheet's address and tab ids for a trip, so Scout's Sources can open the exact spot (sheetLink.ts).
 * Never contacts Google. Prints counts and tab names only — never the address or an id (the repo is public; so is
 * this script's output in a session log).
 *
 *   npx tsx scripts/set-sheet-link.ts --trip <tripId> --xlsx <her downloaded .xlsx> [--from-trip <tripId>] [--file <links.txt>] [--dry]
 *
 *   --from-trip  the address and tab ids Wander recorded in April, when it was allowed to read her sheet
 *   --file       Ken's own links, one per line: "<tab name as in her sheet> <TAB> https://docs.google.com/…#gid=123"
 *                (tab-separated; a line without a tab name is skipped and said)
 *   --xlsx       her current download — its tab names are the names Wander's sources use
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import ExcelJS from "exceljs";
import { xlsxTabName } from "../src/services/guide/sheetLink.js";

const prisma = new PrismaClient();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const tripId = arg("--trip");
const xlsx = arg("--xlsx");
if (!tripId || !xlsx) throw new Error("Needs --trip and --xlsx");

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsx);
const current = wb.worksheets.map((w) => w.name);

const cfg = await prisma.sheetSyncConfig.findUnique({ where: { tripId } });
if (!cfg) throw new Error("That trip has no import record yet — import her Guide first");
const tm = (cfg.tabMappings || {}) as any;
let url: string | null = tm.sheetLink?.url || null;
const byGoogleName = new Map<string, number>();

const from = arg("--from-trip");
if (from) {
  // (the trip's id, or its start: "cmnvzj")
  const olds = await prisma.sheetSyncConfig.findMany({ where: { tripId: { startsWith: from } } });
  if (olds.length > 1) throw new Error("More than one trip starts that way — give more of its id");
  const old = olds[0]?.tabMappings as any;
  if (!old?.sourceSpreadsheetId) throw new Error("That trip has no April sheet record");
  url = `https://docs.google.com/spreadsheets/d/${old.sourceSpreadsheetId}/edit`;
  for (const [name, gid] of Object.entries(old.tabGids || {})) byGoogleName.set(name, Number(gid));
}
const file = arg("--file");
if (file) {
  for (const line of fs.readFileSync(file, "utf-8").split("\n").map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^(.*?)\t\s*(https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)\/[^\s]*?gid=(\d+)[^\s]*)$/);
    if (!m || !m[1].trim()) { console.log(`skipped a line without "<tab name><TAB><link>": ${line.slice(0, 40).replace(/https?:\S+/, "<link>")}`); continue; }
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${m[3]}/edit`;
    if (url && url !== sheetUrl) console.log("note: a link in the file is for a different sheet than the one recorded — the file's sheet is used");
    url = sheetUrl;
    byGoogleName.set(m[1].trim(), Number(m[4]));
  }
}
if (!url) throw new Error("No sheet address: give --from-trip or --file");

// Her current tabs, by the name her download gives them
const tabs: Record<string, number> = { ...(tm.sheetLink?.url === url ? tm.sheetLink.tabs || {} : {}) };
for (const [g, gid] of byGoogleName) {
  const t = current.find((c) => c === g || c === xlsxTabName(g));
  if (t) tabs[t] = gid;
}
const known = current.filter((t) => tabs[t] !== undefined);
console.log(`her tabs now: ${current.length} · with an id: ${known.length}`);
console.log(`without an id (they open her sheet, with the tab and cell in words): ${current.filter((t) => tabs[t] === undefined).join(" | ") || "none"}`);
console.log(`ids for tabs she no longer has (left out): ${[...byGoogleName.keys()].filter((g) => !current.some((c) => c === g || c === xlsxTabName(g))).join(" | ") || "none"}`);
if (process.argv.includes("--dry")) { console.log("(dry run — nothing written)"); await prisma.$disconnect(); process.exit(0); }
await prisma.sheetSyncConfig.update({ where: { tripId }, data: { tabMappings: { ...tm, sheetLink: { url, tabs: Object.fromEntries(known.map((t) => [t, tabs[t]])) } } } });
console.log("recorded.");
await prisma.$disconnect();
