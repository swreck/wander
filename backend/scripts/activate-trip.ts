import "dotenv/config";
import prisma from "../src/services/db.js";

const NEW_TRIP_ID = "cmnoc9fuk00008o0iww01qp6w";

async function main() {
  // Archive all other trips
  await prisma.trip.updateMany({
    where: { status: "active", id: { not: NEW_TRIP_ID } },
    data: { status: "archived" },
  });

  // Ensure new trip is active
  await prisma.trip.update({
    where: { id: NEW_TRIP_ID },
    data: { status: "active" },
  });

  const trips = await prisma.trip.findMany({ select: { id: true, name: true, status: true } });
  for (const t of trips) console.log(t.id, t.status, t.name);
}

main().finally(() => prisma.$disconnect());
