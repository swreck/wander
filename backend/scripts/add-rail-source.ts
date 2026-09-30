/**
 * Adds Ken's rail sheet ("Japan 2026 — Rail Reservations") to a trip as a source Wander reads, then reads it once.
 * Read-only: Wander's robot has view access only. Idempotent — running it again only reads the sheet again.
 *
 *   npx tsx scripts/add-rail-source.ts --trip <tripId> --sheet <Google Sheet id> [--show]
 *
 * (The sheet's id isn't written here: the repository is public.)
 */
import prisma from "../src/services/db.js";
import { refreshSource } from "../src/services/sources/refresh.js";
import { sourceViews } from "../src/services/sources/context.js";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const tripId = arg("--trip");
const RAIL_SHEET = arg("--sheet");
if (!tripId || !RAIL_SHEET) throw new Error("Pass --trip <tripId> --sheet <Google Sheet id>");
const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { name: true } });
if (!trip) throw new Error(`No trip ${tripId}`);

let source = await prisma.tripSource.findFirst({ where: { tripId, kind: "google_sheet", ref: RAIL_SHEET } });
if (!source) {
  source = await prisma.tripSource.create({
    data: {
      tripId, kind: "google_sheet", ref: RAIL_SHEET, name: "Rail sheet", owner: "Ken", authorship: "written with AI help",
      about: "train bookings and the Shin-Osaka ticket pickup",
    },
  });
  console.log(`Added the rail sheet to "${trip.name}"`);
}
const r = await refreshSource(source.id);
console.log(r.error ? `Read failed: ${r.error}` : r.changed ? "Read it — new copy kept" : "Read it — unchanged");

if (process.argv.includes("--show")) {
  for (const v of await sourceViews(tripId)) {
    console.log(`\n${v.meta.name}: "${v.meta.title}", read ${v.meta.readAt}`);
    console.log(`  train rows: ${v.rail.length} (${v.rail.map((x) => `${x.date} r${x.row}`).join(", ")})`);
    for (const c of v.checklists) console.log(`  checklist "${c.tab}" for ${c.date}: ${c.steps.length} steps`);
    console.log(`  other tabs: ${v.otherTabs.map((t) => t.name).join(", ") || "none"}`);
    console.log(`  sources differ: ${v.differs.length}`);
    for (const d of v.differs) console.log(`    ${d.date} ${d.train}: rail ${d.railSays} | Guide (${d.guideSource}) ${d.guideSays}`);
  }
}
await prisma.$disconnect();
