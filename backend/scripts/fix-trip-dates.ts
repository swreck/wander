/**
 * One-time script to fix the Japan 2026 trip day dates.
 *
 * The AI chat updated city arrival/departure dates correctly but failed
 * to update the individual day dates within each city. This script
 * queries the current state and fixes all days to match their city date ranges.
 *
 * Run: cd backend && npx tsx scripts/fix-trip-dates.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TRIP_ID = "cmmellfyd0000qt014z9viuwe";

async function fixTripDates() {
  // 1. Get current state
  const trip = await prisma.trip.findUnique({
    where: { id: TRIP_ID },
    include: {
      cities: { orderBy: { sequenceOrder: "asc" } },
      days: { orderBy: { date: "asc" }, include: { city: true } },
    },
  });

  if (!trip) {
    console.error("Trip not found!");
    process.exit(1);
  }

  console.log(`\nTrip: ${trip.name}`);
  console.log(`Current dates: ${trip.startDate.toISOString().slice(0, 10)} to ${trip.endDate.toISOString().slice(0, 10)}`);

  console.log("\n=== Current Cities ===");
  for (const city of trip.cities) {
    const arrival = city.arrivalDate?.toISOString().slice(0, 10) || "no date";
    const departure = city.departureDate?.toISOString().slice(0, 10) || "no date";
    const hidden = city.hidden ? " [HIDDEN]" : "";
    console.log(`  ${city.name}: ${arrival} → ${departure} (order: ${city.sequenceOrder})${hidden}`);
  }

  console.log("\n=== Current Days ===");
  for (const day of trip.days) {
    const date = day.date.toISOString().slice(0, 10);
    console.log(`  ${date} — ${day.city?.name || "no city"} (id: ${day.id})`);
  }

  // 2. Target schedule (from user's conversation)
  // Cities with dates should already be correct from the AI's city date updates.
  // We need to: fix day dates to fall within their city's date range,
  // and create any missing days.

  const citiesWithDates = trip.cities.filter(c => c.arrivalDate && c.departureDate && !c.hidden);

  console.log("\n=== Target Day Dates ===");

  const updates: { dayId: string; newDate: Date; cityName: string }[] = [];
  const toCreate: { tripId: string; cityId: string; date: Date; cityName: string }[] = [];

  for (const city of citiesWithDates) {
    const arrival = city.arrivalDate!;
    const departure = city.departureDate!;

    // How many days should this city have?
    const msPerDay = 86400000;
    const totalDays = Math.round((departure.getTime() - arrival.getTime()) / msPerDay) + 1;

    // Get existing days for this city
    const cityDays = trip.days.filter(d => d.cityId === city.id);

    // Generate target dates
    const targetDates: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      targetDates.push(new Date(arrival.getTime() + i * msPerDay));
    }

    console.log(`  ${city.name}: needs ${totalDays} days (${arrival.toISOString().slice(0, 10)} to ${departure.toISOString().slice(0, 10)}), has ${cityDays.length}`);

    // Match existing days to target dates (by position, since dates are wrong)
    for (let i = 0; i < targetDates.length; i++) {
      if (i < cityDays.length) {
        // Update existing day
        const currentDate = cityDays[i].date.toISOString().slice(0, 10);
        const targetDate = targetDates[i].toISOString().slice(0, 10);
        if (currentDate !== targetDate) {
          updates.push({ dayId: cityDays[i].id, newDate: targetDates[i], cityName: city.name });
          console.log(`    UPDATE: ${currentDate} → ${targetDate} (${cityDays[i].id})`);
        } else {
          console.log(`    OK: ${currentDate} already correct`);
        }
      } else {
        // Create missing day
        toCreate.push({ tripId: TRIP_ID, cityId: city.id, date: targetDates[i], cityName: city.name });
        console.log(`    CREATE: ${targetDates[i].toISOString().slice(0, 10)} (new)`);
      }
    }

    // If city has more days than needed, log extras (don't delete — user might have data on them)
    if (cityDays.length > totalDays) {
      for (let i = totalDays; i < cityDays.length; i++) {
        console.log(`    EXTRA: ${cityDays[i].date.toISOString().slice(0, 10)} (${cityDays[i].id}) — will not delete`);
      }
    }
  }

  console.log(`\n=== Plan: ${updates.length} updates, ${toCreate.length} creates ===`);

  if (updates.length === 0 && toCreate.length === 0) {
    console.log("Nothing to do — all days are correct!");
    return;
  }

  // 3. Execute all changes in a transaction
  console.log("\nExecuting...");

  await prisma.$transaction([
    // Update existing days
    ...updates.map(u =>
      prisma.day.update({
        where: { id: u.dayId },
        data: { date: u.newDate },
      })
    ),
    // Create missing days
    ...toCreate.map(c =>
      prisma.day.create({
        data: {
          tripId: c.tripId,
          cityId: c.cityId,
          date: c.date,
        },
      })
    ),
  ]);

  // 4. Sync trip dates from days
  const { syncTripDates } = await import("../src/services/syncTripDates.js");
  await syncTripDates(TRIP_ID);

  // 5. Verify
  const updated = await prisma.day.findMany({
    where: { tripId: TRIP_ID },
    orderBy: { date: "asc" },
    include: { city: true },
  });

  console.log("\n=== Final State ===");
  for (const day of updated) {
    console.log(`  ${day.date.toISOString().slice(0, 10)} — ${day.city?.name}`);
  }

  const finalTrip = await prisma.trip.findUnique({ where: { id: TRIP_ID } });
  console.log(`\nTrip dates: ${finalTrip!.startDate.toISOString().slice(0, 10)} to ${finalTrip!.endDate.toISOString().slice(0, 10)}`);
  console.log("Done!");
}

fixTripDates()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
