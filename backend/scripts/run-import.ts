import "dotenv/config";
import { importFromSpreadsheet } from "../src/services/sheetImport.js";

const SPREADSHEET_ID = "1n-sPoMuk3rz5iZko8Gbd_wEpOTXEHsEIKtJX118JM00";

async function main() {
  try {
    const result = await importFromSpreadsheet(SPREADSHEET_ID, "Ken");
    console.log("\n=== IMPORT COMPLETE ===");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("Import failed:", err.message);
    console.error(err.stack);
  }
}

main();
