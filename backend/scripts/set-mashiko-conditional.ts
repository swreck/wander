import "dotenv/config";
import prisma from "../src/services/db.js";

const TRIP_ID = "cmnoc9fuk00008o0iww01qp6w";

async function main() {
  // Find Mashiko experience
  const mashiko = await prisma.experience.findFirst({
    where: { tripId: TRIP_ID, name: { contains: "Mashiko" } },
  });

  if (!mashiko) {
    console.log("Mashiko not found");
    return;
  }

  // Set conditional assignment and revert to possible (the assignment depends on Julie)
  await prisma.experience.update({
    where: { id: mashiko.id },
    data: {
      state: "possible",
      dayId: null,
      conditionalAssignment: {
        fallbackDate: "2026-10-13",
        waitFor: "Julie",
        ifInterested: "Schedule together during Tokyo days (Oct 14-17)",
        ifNot: "Larisa goes Oct 13 (pre-trip)",
      },
    },
  });

  console.log(`Mashiko updated: conditional on Julie's interest`);
  console.log(`  If Julie interested → keep flexible for shared Tokyo days`);
  console.log(`  If not → assign to Oct 13 (K/L pre-trip day)`);
}

main().finally(() => prisma.$disconnect());
