import { google } from "googleapis";
import fs from "fs";

const CREDENTIALS_PATH = "/Users/kenrosen/Documents/Projects/WanderDocumentationAndResources/actionmgr-e5d782f7349e.json";
const SPREADSHEET_ID = "1n-sPoMuk3rz5iZko8Gbd_wEpOTXEHsEIKtJX118JM00";

async function main() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });

  const sheets = google.sheets({ version: "v4", auth });

  // Get spreadsheet metadata (all sheet names)
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title) || [];
  console.log("=== TABS ===");
  console.log(sheetNames.join("\n"));

  // Read each sheet
  for (const name of sheetNames) {
    if (!name) continue;
    console.log(`\n=== TAB: ${name} ===`);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${name}'`,
    });
    const rows = res.data.values || [];
    console.log(`Rows: ${rows.length}`);
    // Print first 30 rows to understand structure
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      console.log(`  [${i}] ${rows[i]?.join(" | ")}`);
    }
    if (rows.length > 30) {
      console.log(`  ... (${rows.length - 30} more rows)`);
    }
  }
}

main().catch(e => {
  console.error("ERROR:", e.message);
  if (e.message.includes("has not been granted")) {
    console.error("\n>>> The spreadsheet has not been shared with the service account yet.");
    console.error(">>> Share it with: wander-sheets@actionmgr.iam.gserviceaccount.com");
  }
});
