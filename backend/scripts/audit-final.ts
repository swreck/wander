/**
 * Final audit: verify complete trip state after Backroads fix.
 * Run: cd backend && npx tsx scripts/audit-final.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TRIP_ID = "cmmellfyd0000qt014z9viuwe";

async function audit() {
  const days = await prisma.day.findMany({
    where: { tripId: TRIP_ID },
    orderBy: { date: "asc" },
    include: {
      city: true,
      experiences: { orderBy: { priorityOrder: "asc" } },
      reservations: { orderBy: { datetime: "asc" } },
      accommodations: true,
    },
  });

  console.log("=== COMPLETE TRIP — ALL 23 DAYS ===\n");

  for (const day of days) {
    const date = day.date.toISOString().slice(0, 10);
    const city = day.city?.name || "NO CITY";
    const brCount = day.experiences.filter(e => e.sourceText === "Imported from itinerary document").length;
    const brTag = brCount > 0 ? ` [${brCount} Backroads]` : "";

    console.log(`── ${date} | ${city}${brTag} ──`);

    for (const exp of day.experiences) {
      const br = exp.sourceText === "Imported from itinerary document" ? " [B]" : "";
      console.log(`  ${exp.state}: ${exp.name} (${exp.timeWindow || "-"})${br}`);
    }
    for (const res of day.reservations) {
      const time = res.datetime ? res.datetime.toISOString().slice(11, 16) : "-";
      console.log(`  RES: ${res.name} @ ${time}`);
    }
    for (const acc of day.accommodations) {
      console.log(`  ACC: ${acc.name}`);
    }
    if (day.experiences.length === 0 && day.reservations.length === 0 && day.accommodations.length === 0) {
      console.log("  (empty)");
    }
    console.log("");
  }

  // Backroads badge range check
  const allExps = await prisma.experience.findMany({
    where: { tripId: TRIP_ID, sourceText: "Imported from itinerary document" },
    include: { day: true },
  });
  const brDates = allExps
    .filter(e => e.day)
    .map(e => e.day!.date.toISOString().slice(0, 10))
    .sort();

  if (brDates.length > 0) {
    console.log(`=== BACKROADS BADGE RANGE ===`);
    console.log(`  First: ${brDates[0]}`);
    console.log(`  Last: ${brDates[brDates.length - 1]}`);
    console.log(`  Badge will show on: ${brDates[0]} through ${brDates[brDates.length - 1]}`);
  }
}

audit().catch(console.error).finally(() => prisma.$disconnect());
