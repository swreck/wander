/**
 * Data fixes from Apr 9 Chrome testing session:
 * 1. Reassign 6 misplaced Backroads experiences to correct Nikko days
 * 2. Deduplicate Ritz-Carlton accommodation records
 * 3. Create test users (Andy, Julie) for full-flow testing
 *
 * Run: cd backend && npx tsx scripts/fix-data-apr9.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TRIP_ID = "cmnov3ldh00008oc86ljnr628";

// Day IDs from the trip (Oct 18 = Day 1, Oct 20 = Day 3)
const DAY_OCT_18 = "cmnov3pki001a8oc8164zo6bz";
const DAY_OCT_20 = "cmnov3pz9001g8oc8st89tcn4";

async function fixBackroadsExperiences() {
  console.log("\n=== 1. Reassigning misplaced Backroads experiences ===\n");

  const moveToDay1 = ["Scenic ride through Ashio Mountains"];
  const moveToDay3 = [
    "Senjogahara Plateau",
    "Nikko National Park activities",
    "Lake Chuzenji",
    "Ryuzu Falls",
    "Yudaki Falls",
  ];

  for (const name of moveToDay1) {
    const exp = await prisma.experience.findFirst({
      where: { tripId: TRIP_ID, name },
    });
    if (!exp) {
      console.log(`  ✗ Not found: "${name}"`);
      continue;
    }
    const oldDayId = exp.dayId;
    await prisma.experience.update({
      where: { id: exp.id },
      data: { dayId: DAY_OCT_18 },
    });
    console.log(`  ✓ "${name}" moved to Oct 18 (was dayId: ${oldDayId})`);
  }

  for (const name of moveToDay3) {
    const exp = await prisma.experience.findFirst({
      where: { tripId: TRIP_ID, name },
    });
    if (!exp) {
      console.log(`  ✗ Not found: "${name}"`);
      continue;
    }
    const oldDayId = exp.dayId;
    await prisma.experience.update({
      where: { id: exp.id },
      data: { dayId: DAY_OCT_20 },
    });
    console.log(`  ✓ "${name}" moved to Oct 20 (was dayId: ${oldDayId})`);
  }

  // Log to changelog
  await prisma.changeLog.create({
    data: {
      tripId: TRIP_ID,
      userCode: "system",
      userDisplayName: "System",
      actionType: "update",
      entityType: "experience",
      entityId: "batch",
      entityName: "6 Backroads experiences",
      description: "Moved 6 Backroads experiences from Oct 15-17 (Tokyo) to correct Nikko days (Oct 18, Oct 20) per Backroads PDF itinerary",
    },
  });
  console.log("  Logged to changelog");
}

async function deduplicateRitzCarlton() {
  console.log("\n=== 2. Deduplicating Ritz-Carlton accommodations ===\n");

  const accoms = await prisma.accommodation.findMany({
    where: {
      tripId: TRIP_ID,
      name: { contains: "Ritz-Carlton", mode: "insensitive" },
    },
  });

  console.log(`  Found ${accoms.length} Ritz-Carlton accommodations:`);
  for (const a of accoms) {
    console.log(`    - "${a.name}" (id: ${a.id}, cityId: ${a.cityId})`);
  }

  if (accoms.length <= 1) {
    console.log("  No duplicates to fix");
    return;
  }

  // Keep the one with "The" prefix (more formal/correct), delete the other
  const keep = accoms.find((a) => a.name.startsWith("The ")) || accoms[0];
  const remove = accoms.filter((a) => a.id !== keep.id);

  for (const a of remove) {
    // Copy any non-null fields from the one being removed to the keeper
    const updates: Record<string, any> = {};
    if (!keep.address && a.address) updates.address = a.address;
    if (!keep.latitude && a.latitude) updates.latitude = a.latitude;
    if (!keep.longitude && a.longitude) updates.longitude = a.longitude;
    if (!keep.checkInTime && a.checkInTime) updates.checkInTime = a.checkInTime;
    if (!keep.checkOutTime && a.checkOutTime) updates.checkOutTime = a.checkOutTime;

    if (Object.keys(updates).length > 0) {
      await prisma.accommodation.update({
        where: { id: keep.id },
        data: updates,
      });
      console.log(`  Merged fields from "${a.name}" into "${keep.name}"`);
    }

    await prisma.accommodation.delete({ where: { id: a.id } });
    console.log(`  ✓ Deleted duplicate: "${a.name}" (id: ${a.id})`);
  }

  console.log(`  ✓ Kept: "${keep.name}" (id: ${keep.id})`);

  // Log to changelog
  await prisma.changeLog.create({
    data: {
      tripId: TRIP_ID,
      userCode: "system",
      userDisplayName: "System",
      actionType: "delete",
      entityType: "accommodation",
      entityId: remove[0]?.id || "unknown",
      entityName: "Ritz-Carlton duplicate",
      description: `Deduplicated Ritz-Carlton accommodations: kept "${keep.name}", removed ${remove.length} duplicate(s)`,
    },
  });
  console.log("  Logged to changelog");
}

async function createTestUsers() {
  console.log("\n=== 3. Creating test users (Andy, Julie) ===\n");

  const names = ["Andy", "Julie"];
  for (const name of names) {
    const existing = await prisma.traveler.findFirst({
      where: { displayName: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      console.log(`  ✓ "${name}" already exists (id: ${existing.id})`);

      // Make sure they're on the trip
      const member = await prisma.tripMember.findFirst({
        where: { travelerId: existing.id, tripId: TRIP_ID },
      });
      if (!member) {
        await prisma.tripMember.create({
          data: { travelerId: existing.id, tripId: TRIP_ID, role: "member" },
        });
        console.log(`    Added to trip as member`);
      } else {
        console.log(`    Already on trip (role: ${member.role})`);
      }
      continue;
    }

    const traveler = await prisma.traveler.create({
      data: { displayName: name },
    });
    await prisma.tripMember.create({
      data: { travelerId: traveler.id, tripId: TRIP_ID, role: "member" },
    });
    console.log(`  ✓ Created "${name}" (id: ${traveler.id}) as trip viewer`);
  }
}

async function main() {
  console.log("=== Apr 9 Data Fixes ===");
  console.log(`Trip: ${TRIP_ID}\n`);

  await fixBackroadsExperiences();
  await deduplicateRitzCarlton();
  await createTestUsers();

  console.log("\n=== All done ===\n");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
