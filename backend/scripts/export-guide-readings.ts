/**
 * Export the AI readings of a trip's current Guide snapshot (pictures, pasted text, day-plan tabs), so
 * the same file can be imported into another copy of the database without reading anything twice.
 *
 *   npx tsx scripts/export-guide-readings.ts --trip <tripId> --out <file.json>
 *
 * The output holds trip facts: write it under trip-data/ (git-ignored), never into the repository.
 */
import "dotenv/config";
import fs from "fs";
import prisma from "../src/services/db.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const tripId = arg("trip");
  const out = arg("out");
  if (!tripId || !out) throw new Error("Pass --trip <tripId> and --out <file.json>.");
  const snapshot = await prisma.guideSnapshot.findFirst({ where: { tripId, status: "current" }, orderBy: { importedAt: "desc" } });
  if (!snapshot) throw new Error("That trip has no current Guide snapshot.");
  const report = (snapshot.report || {}) as any;
  const images = await prisma.guideImage.findMany({ where: { tripId, readStatus: "read" }, select: { sha256: true, transcription: true, facts: true } });
  const seed = {
    from: { tripId, snapshotId: snapshot.id, sourceName: snapshot.sourceName, contentHash: snapshot.contentHash },
    textReadings: report.textReadings || {},
    dayPlanReadings: report.dayPlanReadings || {},
    images: Object.fromEntries(images.map((i) => [i.sha256, { transcription: i.transcription, facts: i.facts }])),
  };
  fs.writeFileSync(out, JSON.stringify(seed));
  console.log(`${snapshot.sourceName}: ${Object.keys(seed.textReadings).length} text, ${Object.keys(seed.dayPlanReadings).length} day-plan, ${images.length} picture readings → ${out}`);
}

main().catch((e) => { console.error("Export failed:", e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
