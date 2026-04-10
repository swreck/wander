/**
 * Apr 10 data fix: more misplaced Backroads experiences found in Chrome testing
 * with the peek card. Reassigns 5 more experiences based on Backroads PDF.
 *
 * Run: cd backend && npx tsx scripts/fix-data-apr10.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TRIP_ID = "cmnov3ldh00008oc86ljnr628";

const DAY_OCT_21 = "cmnov3q3f001i8oc81gh3x5hz"; // Day 4 - Shirakabeso (Izu)
const DAY_OCT_22 = "cmnov3qdu001m8oc87y4ckofn"; // Day 5 - Shirakabeso (coastal)
const DAY_OCT_23 = "cmnov3qhy001o8oc8oi9s402n"; // Day 6 - Kyoto (Jogasaki + train)
const DAY_OCT_24 = "cmnov3qsa001s8oc8jrq3zoco"; // Day 7 - Kyoto (Philosopher's + Daimonji)

const moves = [
  { name: "Wasabi birthplace tour",                    targetDay: DAY_OCT_21, targetDate: "Oct 21" },
  { name: "Bike along the serpentine coast",           targetDay: DAY_OCT_22, targetDate: "Oct 22" },
  { name: "Local delicacies tasting",                  targetDay: DAY_OCT_22, targetDate: "Oct 22" },
  { name: "Explore coastal trails along Jogasaki Coast", targetDay: DAY_OCT_23, targetDate: "Oct 23" },
  { name: "Climb to Daimonji lookout",                 targetDay: DAY_OCT_24, targetDate: "Oct 24" },
];

async function main() {
  console.log("=== Apr 10 Backroads day reassignment ===\n");

  for (const m of moves) {
    const exp = await prisma.experience.findFirst({
      where: { tripId: TRIP_ID, name: m.name },
    });
    if (!exp) {
      console.log(`  ✗ Not found: "${m.name}"`);
      continue;
    }
    await prisma.experience.update({
      where: { id: exp.id },
      data: { dayId: m.targetDay },
    });
    console.log(`  ✓ "${m.name}" → ${m.targetDate}`);
  }

  await prisma.changeLog.create({
    data: {
      tripId: TRIP_ID,
      userCode: "system",
      userDisplayName: "System",
      actionType: "update",
      entityType: "experience",
      entityId: "batch",
      entityName: "5 Backroads experiences",
      description: "Moved 5 more Backroads experiences to correct days per PDF (round 2): Wasabi tour→Day4, serpentine bike→Day5, delicacies→Day5, Jogasaki trails→Day6, Daimonji→Day7",
    },
  });
  console.log("\n  Logged to changelog");
  console.log("\n=== Done ===\n");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
