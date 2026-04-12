import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, "../.env") });

import { readSpreadsheet } from "../src/services/sheetsSync.js";

const SHEET_ID = process.argv[2] || "1lfgozrp7j1Fi-E-7woPfKynvXYI6dj_yX72e90NytnQ";

async function main() {
  console.log(`Reading sheet: ${SHEET_ID}\n`);
  const data = await readSpreadsheet(SHEET_ID);

  console.log(`=== PARSER RESULTS ===`);
  console.log(`Cities: ${data.cities.length}`);
  console.log(`Activities: ${data.activities.length}`);
  console.log(`Tokyo hotels: ${data.tokyoHotels.length}`);
  console.log(`Kyoto hotels: ${data.kyotoHotels.length}`);
  console.log(`Actions: ${data.actions.length}`);

  console.log(`\n=== TOKYO HOTELS ===`);
  data.tokyoHotels.forEach((h, i) => {
    console.log(`  [${i}] ${h.name}`);
    console.log(`       votes: J=${h.votes.julie} L=${h.votes.larisa} K=${h.votes.ken} A=${h.votes.andy}`);
    console.log(`       location: ${h.location}`);
  });

  console.log(`\n=== KYOTO HOTELS ===`);
  data.kyotoHotels.forEach((h, i) => {
    console.log(`  [${i}] ${h.name}`);
    console.log(`       votes: J=${h.votes.julie} L=${h.votes.larisa} K=${h.votes.ken} A=${h.votes.andy}`);
  });

  console.log(`\n=== ACTIONS (${data.actions.length}) ===`);
  data.actions.forEach((a, i) => {
    console.log(`  [${i}] "${a.action}" / owner: ${a.owner} / due: ${a.dueDate}`);
    console.log(`       notes: ${a.notes}`);
  });

  // Print raw Tokyo hotel tab for inspection
  const tokyoRaw = data.rawTabData["Tokyo Hotel Template"];
  if (tokyoRaw) {
    console.log(`\n=== RAW TOKYO HOTEL TEMPLATE (first 15 rows) ===`);
    for (let i = 0; i < Math.min(tokyoRaw.length, 15); i++) {
      const row = tokyoRaw[i] || [];
      // Show column 16 (expected Hotels column) explicitly
      console.log(`  [row ${i}] col16="${row[16] || ''}" | votes cols 11-14: ${row[11]||''} ${row[12]||''} ${row[13]||''} ${row[14]||''}`);
    }
  } else {
    console.log(`\n⚠️  Raw "Tokyo Hotel Template" tab not found in rawTabData. Tab names found: ${Object.keys(data.rawTabData).join(", ")}`);
  }
}

main().catch(e => {
  console.error("ERROR:", e);
  process.exit(1);
});
