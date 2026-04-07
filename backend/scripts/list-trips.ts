import "dotenv/config";
import prisma from "../src/services/db.js";

async function main() {
  const trips = await prisma.trip.findMany({ select: { id: true, name: true, status: true } });
  for (const t of trips) console.log(t.id, t.status, t.name);
}

main().finally(() => prisma.$disconnect());
