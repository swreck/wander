import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const TRIP_ID = "cmmellfyd0000qt014z9viuwe";

async function fullAudit() {
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

  const unassigned = await prisma.experience.findMany({
    where: { tripId: TRIP_ID, dayId: null },
    include: { city: true },
    orderBy: { name: "asc" },
  });

  console.log("=== COMPLETE TRIP AUDIT — ALL DAYS ===\n");

  for (const day of days) {
    const date = day.date.toISOString().slice(0, 10);
    const city = day.city?.name || "NO CITY";

    console.log("── " + date + " | " + city + " ──");

    for (const exp of day.experiences) {
      const source = exp.sourceText === "Imported from itinerary document" ? " [BACKROADS]" : "";
      console.log("  EXP: " + exp.name + " (" + exp.state + ")" + source);
    }
    for (const res of day.reservations) {
      const time = res.datetime ? res.datetime.toISOString().slice(11, 16) : "no time";
      console.log("  RES: " + res.name + " @ " + time + " (" + res.type + ")");
    }
    for (const acc of day.accommodations) {
      console.log("  ACC: " + acc.name);
    }
    if (day.experiences.length === 0 && day.reservations.length === 0 && day.accommodations.length === 0) {
      console.log("  (empty)");
    }
    console.log("");
  }

  if (unassigned.length > 0) {
    console.log("=== UNASSIGNED EXPERIENCES (no day) ===\n");
    const byCity: Record<string, any[]> = {};
    for (const exp of unassigned) {
      const city = exp.city ? exp.city.name : "NO CITY";
      if (!(city in byCity)) byCity[city] = [];
      byCity[city].push(exp);
    }
    for (const city of Object.keys(byCity)) {
      console.log("  " + city + ":");
      for (const exp of byCity[city]) {
        const source = exp.sourceText === "Imported from itinerary document" ? " [BACKROADS]" : "";
        console.log("    - " + exp.name + " (" + exp.state + ")" + source);
      }
    }
  }
}

fullAudit().catch(console.error).finally(() => prisma.$disconnect());
