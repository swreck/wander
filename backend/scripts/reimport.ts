import "dotenv/config";
import prisma from "../src/services/db.js";
import { importFromSpreadsheet } from "../src/services/sheetImport.js";

const OLD_TRIP_ID = "cmnobsbng00008oemedi46f50";
const SPREADSHEET_ID = "1n-sPoMuk3rz5iZko8Gbd_wEpOTXEHsEIKtJX118JM00";

async function main() {
  // Delete old import
  console.log("Deleting old import...");
  try {
    await prisma.trip.delete({ where: { id: OLD_TRIP_ID } });
    console.log("Old trip deleted.");
  } catch {
    console.log("Old trip not found (already deleted).");
  }

  // Re-import
  const result = await importFromSpreadsheet(SPREADSHEET_ID, "Ken");
  console.log("\n=== IMPORT COMPLETE ===");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => console.error(e.message, e.stack)).finally(() => prisma.$disconnect());
