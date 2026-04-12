import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, "../.env") });

import { google } from "googleapis";
import fs from "fs";

const CREDENTIALS_PATH = "/Users/kenrosen/Documents/Projects/WanderDocumentationAndResources/actionmgr-e5d782f7349e.json";
const SHEET_ID = process.argv[2];
const TAB_NAME = process.argv[3];

if (!SHEET_ID || !TAB_NAME) {
  console.error("Usage: npx tsx scripts/dump-tab.ts <sheet-id> <tab-name>");
  process.exit(1);
}

async function main() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID!,
    range: `'${TAB_NAME}'`,
  });
  const rows = res.data.values || [];

  console.log(`=== TAB: ${TAB_NAME} (${rows.length} rows) ===\n`);
  rows.forEach((row, i) => {
    const cells = (row || []).map((c, j) => {
      const s = String(c || "").slice(0, 60);
      return s ? `[${j}]${s}` : "";
    }).filter(Boolean);
    if (cells.length > 0) {
      console.log(`  row ${String(i).padStart(2, "0")}: ${cells.join(" | ")}`);
    } else {
      console.log(`  row ${String(i).padStart(2, "0")}: (empty)`);
    }
  });
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
