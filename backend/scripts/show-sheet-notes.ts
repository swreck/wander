import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, "../.env") });

import prisma from "../src/services/db.js";

const TRIP_ID = process.argv[2];
if (!TRIP_ID) {
  console.error("Usage: npx tsx scripts/show-sheet-notes.ts <tripId>");
  process.exit(1);
}

async function main() {
  const notes = await prisma.sheetNote.findMany({
    where: { tripId: TRIP_ID! },
    orderBy: [{ tabName: "asc" }, { rowIndex: "asc" }],
  });
  const byTab: Record<string, typeof notes> = {};
  for (const n of notes) {
    (byTab[n.tabName] = byTab[n.tabName] || []).push(n);
  }
  for (const [tab, tabNotes] of Object.entries(byTab)) {
    console.log(`\n=== ${tab} ===`);
    for (const n of tabNotes) {
      console.log(`  [row ${n.rowIndex}] ${n.text.slice(0, 100)}`);
    }
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
