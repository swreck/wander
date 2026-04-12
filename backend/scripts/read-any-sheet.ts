import "dotenv/config";
import { google } from "googleapis";
import fs from "fs";

const CREDENTIALS_PATH = "/Users/kenrosen/Documents/Projects/WanderDocumentationAndResources/actionmgr-e5d782f7349e.json";
const SPREADSHEET_ID = process.env.SHEET_ID || process.argv[2];

if (!SPREADSHEET_ID) {
  console.error("Usage: SHEET_ID=<id> npx tsx scripts/read-any-sheet.ts");
  console.error("   or: npx tsx scripts/read-any-sheet.ts <id>");
  process.exit(1);
}

async function main() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const title = meta.data.properties?.title || "(untitled)";
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title).filter(Boolean) as string[];

  console.log(`=== SPREADSHEET: ${title} ===`);
  console.log(`ID: ${SPREADSHEET_ID}`);
  console.log(`Tabs (${sheetNames.length}): ${sheetNames.join(", ")}`);
  console.log("");

  for (const name of sheetNames) {
    console.log(`========== TAB: ${name} ==========`);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${name}'`,
    });
    const rows = res.data.values || [];
    console.log(`Rows: ${rows.length}`);
    const limit = Math.min(rows.length, 50);
    for (let i = 0; i < limit; i++) {
      const cells = (rows[i] || []).map(c => String(c).slice(0, 40));
      console.log(`  [${i}] ${cells.join(" | ")}`);
    }
    if (rows.length > limit) {
      console.log(`  ... (${rows.length - limit} more rows)`);
    }
    console.log("");
  }
}

main().catch(e => {
  console.error("ERROR:", e.message);
  if (e.message?.includes("has not been granted") || e.message?.includes("permission")) {
    console.error("\n>>> The spreadsheet has not been shared with the service account.");
    console.error(">>> Share it with: wander-sheets@actionmgr.iam.gserviceaccount.com as Editor.");
  }
});
