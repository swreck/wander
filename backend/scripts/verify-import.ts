import "dotenv/config";
import prisma from "../src/services/db.js";

const TRIP_ID = "cmnobkne600008o1cmzabjvwi";

async function main() {
  const trip = await prisma.trip.findUnique({
    where: { id: TRIP_ID },
    include: {
      cities: { orderBy: { sequenceOrder: "asc" } },
      days: { orderBy: { date: "asc" }, include: { city: true } },
      experiences: { include: { city: true, day: true, ratings: true, decision: true } },
      accommodations: { include: { city: true } },
      decisions: { include: { options: true, votes: true, city: true } },
      tripMembers: { include: { traveler: true } },
      sheetSyncConfig: true,
    },
  });

  if (!trip) { console.log("Trip not found"); return; }

  console.log(`\n=== TRIP: ${trip.name} ===`);
  console.log(`ID: ${trip.id}`);
  console.log(`Dates: ${trip.startDate?.toISOString().split("T")[0]} → ${trip.endDate?.toISOString().split("T")[0]}`);
  console.log(`Status: ${trip.status}`);

  console.log(`\n--- Members (${trip.tripMembers.length}) ---`);
  for (const m of trip.tripMembers) {
    console.log(`  ${m.traveler.displayName} (${m.role})`);
  }

  console.log(`\n--- Cities (${trip.cities.length}) ---`);
  for (const c of trip.cities) {
    console.log(`  ${c.sequenceOrder}. ${c.name} — ${c.arrivalDate?.toISOString().split("T")[0] || "?"} to ${c.departureDate?.toISOString().split("T")[0] || "?"}`);
  }

  console.log(`\n--- Days (${trip.days.length}) ---`);
  for (const d of trip.days) {
    console.log(`  ${d.date.toISOString().split("T")[0]} | ${d.city.name} | ${d.dayType} | ${d.notes || ""}`);
  }

  console.log(`\n--- Experiences (${trip.experiences.length}) ---`);
  for (const e of trip.experiences) {
    const state = e.state === "voting" ? `voting (decision: ${e.decision?.title})` : e.state;
    console.log(`  [${state}] ${e.name} — ${e.city?.name || "?"}${e.day ? ` → ${e.day.date.toISOString().split("T")[0]}` : ""}`);
  }

  console.log(`\n--- Accommodations (${trip.accommodations.length}) ---`);
  for (const a of trip.accommodations) {
    console.log(`  ${a.name} — ${a.city.name}`);
  }

  console.log(`\n--- Decisions (${trip.decisions.length}) ---`);
  for (const d of trip.decisions) {
    console.log(`  "${d.title}" (${d.status}) — ${d.city.name}`);
    for (const o of d.options) {
      const voters = d.votes.filter(v => v.optionId === o.id).map(v => v.displayName);
      console.log(`    - ${o.name}${voters.length ? ` ← votes: ${voters.join(", ")}` : ""}`);
    }
  }

  // Count interests
  const interests = await prisma.experienceInterest.findMany({
    where: { tripId: TRIP_ID },
    include: { experience: true },
  });
  console.log(`\n--- Interest Marks (${interests.length}) ---`);
  const byExp = new Map<string, string[]>();
  for (const i of interests) {
    const key = i.experience.name;
    if (!byExp.has(key)) byExp.set(key, []);
    byExp.get(key)!.push(i.displayName);
  }
  for (const [name, users] of byExp) {
    console.log(`  ${name}: ${users.join(", ")}`);
  }

  console.log(`\n--- Sync Config ---`);
  if (trip.sheetSyncConfig) {
    console.log(`  Spreadsheet: ${trip.sheetSyncConfig.spreadsheetId}`);
    console.log(`  Interval: ${trip.sheetSyncConfig.syncIntervalMs}ms`);
    console.log(`  Last sync: ${trip.sheetSyncConfig.lastSyncAt || "never"}`);
  }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
