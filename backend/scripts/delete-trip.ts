import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, "../.env") });

import prisma from "../src/services/db.js";

const TRIP_ID = process.argv[2];
if (!TRIP_ID) {
  console.error("Usage: npx tsx scripts/delete-trip.ts <tripId>");
  process.exit(1);
}

async function main() {
  const trip = await prisma.trip.findUnique({
    where: { id: TRIP_ID! },
    select: { id: true, name: true, tagline: true },
  });
  if (!trip) {
    console.log(`Trip ${TRIP_ID} not found. Nothing to do.`);
    process.exit(0);
  }

  console.log(`Deleting trip: ${trip.name}`);
  console.log(`  Tagline: ${trip.tagline}`);
  console.log(`  ID: ${trip.id}`);

  // Prisma cascades deletes via onDelete: Cascade on relations
  await prisma.trip.delete({ where: { id: TRIP_ID! } });
  console.log(`✓ Trip deleted.`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error("ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
