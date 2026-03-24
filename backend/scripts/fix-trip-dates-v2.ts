/**
 * Fix v2: Remove duplicate Kyoto days that overlap with other cities.
 * Kyoto spans Oct 5-23 but the user is only IN Kyoto on Oct 5-7 (pre-trip)
 * and Oct 20-23 (Backroads + extra day). Days Oct 8-19 belong to other cities.
 *
 * Run: cd backend && npx tsx scripts/fix-trip-dates-v2.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TRIP_ID = "cmmellfyd0000qt014z9viuwe";

async function fix() {
  // Get Kyoto city
  const kyoto = await prisma.city.findFirst({
    where: { tripId: TRIP_ID, name: "Kyoto" },
  });
  if (!kyoto) { console.error("Kyoto not found"); process.exit(1); }

  // Get all Kyoto days
  const kyotoDays = await prisma.day.findMany({
    where: { tripId: TRIP_ID, cityId: kyoto.id },
    orderBy: { date: "asc" },
    include: { experiences: true, reservations: true, accommodations: true },
  });

  console.log(`Kyoto has ${kyotoDays.length} days`);

  // Kyoto should only have days Oct 5-7 and Oct 20-23
  // Delete Oct 8-19 (those dates belong to other cities)
  const toDelete: string[] = [];
  const toKeep: string[] = [];

  for (const day of kyotoDays) {
    const date = day.date.toISOString().slice(0, 10);
    const dayNum = parseInt(date.slice(8, 10));

    // Keep Oct 5, 6, 7 (pre-trip) and Oct 20, 21, 22, 23 (Backroads + extra)
    if ((dayNum >= 5 && dayNum <= 7) || (dayNum >= 20 && dayNum <= 23)) {
      toKeep.push(date);

      // Check if any data is attached
      const hasData = day.experiences.length > 0 || day.reservations.length > 0 || day.accommodations.length > 0;
      if (hasData) {
        console.log(`  KEEP ${date} (has ${day.experiences.length} exp, ${day.reservations.length} res, ${day.accommodations.length} acc)`);
      } else {
        console.log(`  KEEP ${date} (empty)`);
      }
    } else {
      // Check if this day has data — if so, warn but still delete
      const hasData = day.experiences.length > 0 || day.reservations.length > 0 || day.accommodations.length > 0;
      if (hasData) {
        console.log(`  DELETE ${date} — WARNING: has ${day.experiences.length} exp, ${day.reservations.length} res (will demote experiences)`);
        // Demote any experiences on this day before deleting
      } else {
        console.log(`  DELETE ${date} (empty, safe)`);
      }
      toDelete.push(day.id);
    }
  }

  console.log(`\nPlan: keep ${toKeep.length}, delete ${toDelete.length}`);

  if (toDelete.length > 0) {
    // Demote any experiences on days we're about to delete
    await prisma.experience.updateMany({
      where: { dayId: { in: toDelete }, state: "selected" },
      data: { state: "possible", dayId: null, timeWindow: null },
    });

    // Delete the extra days
    await prisma.day.deleteMany({
      where: { id: { in: toDelete } },
    });

    console.log(`Deleted ${toDelete.length} overlapping Kyoto days`);
  }

  // Verify final state
  const allDays = await prisma.day.findMany({
    where: { tripId: TRIP_ID },
    orderBy: { date: "asc" },
    include: { city: true },
  });

  console.log("\n=== Final State ===");
  let prevDate = "";
  for (const day of allDays) {
    const date = day.date.toISOString().slice(0, 10);
    const dup = date === prevDate ? " *** DUPLICATE" : "";
    console.log(`  ${date} — ${day.city?.name}${dup}`);
    prevDate = date;
  }

  // Also fix Nagoya — the last day (Oct 15) overlaps with Nikko Oct 15
  // Nagoya should be Oct 13-14 only (2 nights = Oct 13 arrive, Oct 15 depart = days Oct 13, 14)
  // Check if there's a Nagoya day on Oct 15
  const nagoya = await prisma.city.findFirst({ where: { tripId: TRIP_ID, name: "Nagoya" } });
  if (nagoya) {
    const nagoyaDays = await prisma.day.findMany({
      where: { tripId: TRIP_ID, cityId: nagoya.id },
      orderBy: { date: "asc" },
    });
    console.log(`\nNagoya days: ${nagoyaDays.map(d => d.date.toISOString().slice(0, 10)).join(", ")}`);

    // Check for Oct 15 day in Nagoya — that's departure day, Nikko starts
    const oct15nagoya = nagoyaDays.find(d => d.date.toISOString().slice(0, 10) === "2026-10-15");
    if (oct15nagoya) {
      await prisma.day.delete({ where: { id: oct15nagoya.id } });
      console.log("Deleted Nagoya Oct 15 (departure day, Nikko starts)");
    }
  }

  // Fix Nikko — Oct 18 is departure day, Izu starts. Delete Nikko Oct 18 if exists
  const nikko = await prisma.city.findFirst({ where: { tripId: TRIP_ID, name: "Nikko" } });
  if (nikko) {
    const nikkoDays = await prisma.day.findMany({
      where: { tripId: TRIP_ID, cityId: nikko.id },
      orderBy: { date: "asc" },
    });
    console.log(`Nikko days: ${nikkoDays.map(d => d.date.toISOString().slice(0, 10)).join(", ")}`);

    const oct18nikko = nikkoDays.find(d => d.date.toISOString().slice(0, 10) === "2026-10-18");
    if (oct18nikko) {
      await prisma.day.delete({ where: { id: oct18nikko.id } });
      console.log("Deleted Nikko Oct 18 (departure day, Izu starts)");
    }
  }

  // Fix Izu — Oct 20 is departure day, Kyoto-Backroads starts. Delete Izu Oct 20 if exists
  const izu = await prisma.city.findFirst({ where: { tripId: TRIP_ID, name: "Izu Peninsula" } });
  if (izu) {
    const izuDays = await prisma.day.findMany({
      where: { tripId: TRIP_ID, cityId: izu.id },
      orderBy: { date: "asc" },
    });
    console.log(`Izu days: ${izuDays.map(d => d.date.toISOString().slice(0, 10)).join(", ")}`);

    const oct20izu = izuDays.find(d => d.date.toISOString().slice(0, 10) === "2026-10-20");
    if (oct20izu) {
      await prisma.day.delete({ where: { id: oct20izu.id } });
      console.log("Deleted Izu Oct 20 (departure day, Kyoto starts)");
    }
  }

  // Fix Tokyo — Oct 5 is departure day, Kyoto pre-trip starts. Delete Tokyo Oct 5 if exists
  const tokyo = await prisma.city.findFirst({ where: { tripId: TRIP_ID, name: "Tokyo" } });
  if (tokyo) {
    const tokyoDays = await prisma.day.findMany({
      where: { tripId: TRIP_ID, cityId: tokyo.id },
      orderBy: { date: "asc" },
    });
    console.log(`Tokyo days: ${tokyoDays.map(d => d.date.toISOString().slice(0, 10)).join(", ")}`);

    const oct5tokyo = tokyoDays.find(d => d.date.toISOString().slice(0, 10) === "2026-10-05");
    if (oct5tokyo) {
      await prisma.day.delete({ where: { id: oct5tokyo.id } });
      console.log("Deleted Tokyo Oct 5 (departure day, Kyoto starts)");
    }
  }

  // Fix Okayama — Oct 10 departure day
  const okayama = await prisma.city.findFirst({ where: { tripId: TRIP_ID, name: "Okayama" } });
  if (okayama) {
    const days = await prisma.day.findMany({
      where: { tripId: TRIP_ID, cityId: okayama.id },
      orderBy: { date: "asc" },
    });
    const oct10 = days.find(d => d.date.toISOString().slice(0, 10) === "2026-10-10");
    if (oct10) {
      await prisma.day.delete({ where: { id: oct10.id } });
      console.log("Deleted Okayama Oct 10 (departure day, Karatsu starts)");
    }
  }

  // Fix Karatsu — Oct 13 departure day
  const karatsu = await prisma.city.findFirst({ where: { tripId: TRIP_ID, name: "Karatsu" } });
  if (karatsu) {
    const days = await prisma.day.findMany({
      where: { tripId: TRIP_ID, cityId: karatsu.id },
      orderBy: { date: "asc" },
    });
    const oct13 = days.find(d => d.date.toISOString().slice(0, 10) === "2026-10-13");
    if (oct13) {
      await prisma.day.delete({ where: { id: oct13.id } });
      console.log("Deleted Karatsu Oct 13 (departure day, Nagoya starts)");
    }
  }

  // Sync trip dates
  const { syncTripDates } = await import("../src/services/syncTripDates.js");
  await syncTripDates(TRIP_ID);

  // Final verification
  const finalDays = await prisma.day.findMany({
    where: { tripId: TRIP_ID },
    orderBy: { date: "asc" },
    include: { city: true },
  });

  console.log("\n=== FINAL CLEAN STATE ===");
  for (const day of finalDays) {
    console.log(`  ${day.date.toISOString().slice(0, 10)} — ${day.city?.name}`);
  }

  const finalTrip = await prisma.trip.findUnique({ where: { id: TRIP_ID } });
  console.log(`\nTrip: ${finalTrip!.startDate.toISOString().slice(0, 10)} to ${finalTrip!.endDate.toISOString().slice(0, 10)}`);
}

fix()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
