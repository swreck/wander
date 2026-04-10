/**
 * Backfill the historical Ritz-Carlton dedup as a DedupSuggestion record
 * so planners see an example of what the system caught.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TRIP_ID = "cmnov3ldh00008oc86ljnr628";

async function main() {
  // Check if already exists
  const existing = await prisma.dedupSuggestion.findFirst({
    where: { tripId: TRIP_ID, removeName: { contains: "Ritz-Carlton" } },
  });
  if (existing) {
    console.log(`Already exists: ${existing.id}`);
    return;
  }

  const created = await prisma.dedupSuggestion.create({
    data: {
      tripId: TRIP_ID,
      entityType: "accommodation",
      keepId: "cmnqnzv2n00018ow32a8idih9",
      removeId: "cmnov3uqi004i8oc8v93segri",
      keepName: "The Ritz-Carlton, Nikko",
      removeName: "Ritz-Carlton, Nikko",
      confidence: "high",
      autoExecuted: true,
      status: "pending",
      description: "I noticed two Nikko hotels with nearly identical names. I kept 'The Ritz-Carlton, Nikko' and removed 'Ritz-Carlton, Nikko'. Tap reject if this was a mistake.",
    },
  });
  console.log(`Created dedup suggestion: ${created.id}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
