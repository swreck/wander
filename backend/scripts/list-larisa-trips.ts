import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, "../.env") });

import prisma from "../src/services/db.js";

async function main() {
  const trips = await prisma.trip.findMany({
    where: { tagline: { contains: "Claude's Japan Oct 2026.4.8" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, tagline: true, createdAt: true },
  });
  console.log(`Found ${trips.length} trips with this source:`);
  for (const t of trips) {
    console.log(`  ${t.id} — "${t.name}" — created ${t.createdAt.toISOString()}`);
  }
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
