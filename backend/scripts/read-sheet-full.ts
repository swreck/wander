import { google } from "googleapis";
import fs from "fs";

const CREDENTIALS_PATH = "/Users/kenrosen/Documents/Projects/WanderDocumentationAndResources/actionmgr-e5d782f7349e.json";
const SPREADSHEET_ID = "1n-sPoMuk3rz5iZko8Gbd_wEpOTXEHsEIKtJX118JM00";

async function main() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  // Read all data from the key tabs
  for (const name of ["Japan-Oct'26-Itinerary", "Tokyo Hotel Template", "Kyoto Hotel Template", "Activities Template"]) {
    console.log(`\n========== TAB: ${name} ==========`);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${name}'`,
    });
    const rows = res.data.values || [];
    console.log(`Total rows: ${rows.length}`);
    for (let i = 0; i < rows.length; i++) {
      console.log(`[${i}] ${JSON.stringify(rows[i])}`);
    }
  }
}

main().catch(e => console.error("ERROR:", e.message));
