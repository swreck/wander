import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, "../.env") });

import prisma from "../src/services/db.js";

const TRIP_ID = process.argv[2];
if (!TRIP_ID) {
  console.error("Usage: npx tsx scripts/add-larisa-as-planner.ts <tripId>");
  process.exit(1);
}

async function main() {
  const larisa = await prisma.traveler.findFirst({ where: { displayName: "Larisa" } });
  if (!larisa) {
    console.error("Larisa traveler record not found");
    process.exit(1);
  }

  const existing = await prisma.tripMember.findUnique({
    where: { tripId_travelerId: { tripId: TRIP_ID!, travelerId: larisa.id } },
  });

  if (existing) {
    if (existing.role !== "planner") {
      await prisma.tripMember.update({
        where: { tripId_travelerId: { tripId: TRIP_ID!, travelerId: larisa.id } },
        data: { role: "planner" },
      });
      console.log(`[fix] Larisa was already on trip but as ${existing.role}, upgraded to planner.`);
    } else {
      console.log(`[fix] Larisa already on trip as planner, nothing to do.`);
    }
  } else {
    await prisma.tripMember.create({
      data: { tripId: TRIP_ID!, travelerId: larisa.id, role: "planner" },
    });
    console.log(`[fix] Added Larisa as planner on trip ${TRIP_ID}.`);
  }

  const members = await prisma.tripMember.findMany({
    where: { tripId: TRIP_ID! },
    include: { traveler: true },
  });
  console.log(`\nCurrent members:`);
  members.forEach(m => console.log(`  - ${m.traveler.displayName} (${m.role})`));

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error("[fix] ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
