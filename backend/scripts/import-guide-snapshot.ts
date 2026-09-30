/**
 * Import a snapshot of Larisa's Guide (an .xlsx saved from her Google Sheet) into Wander.
 *
 *   npx tsx scripts/import-guide-snapshot.ts --file "<path to .xlsx>" [--trip <tripId>] [--name "Japan 2026"] [--by Ken] [--skip-pictures]
 *       [--seed <readings.json>] [--no-ai]
 *
 * --seed reuses readings made from the same file in another copy of the database (see
 * export-guide-readings.ts); --no-ai makes no Claude calls at all, and anything not already read is
 * listed in the report's warnings instead.
 *
 * Without --trip, creates a new trip (planners: Ken, Larisa) and makes it the active trip.
 * With --trip, updates that trip in place; a read that looks broken is refused and nothing changes.
 * Reads the file only — never contacts Google.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import prisma from "../src/services/db.js";
import { importGuideSnapshot } from "../src/services/guide/importSnapshot.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = arg("file");
  if (!file || !fs.existsSync(file)) throw new Error("Pass --file with the path to the .xlsx snapshot.");
  const seed = arg("seed");
  if (seed && !fs.existsSync(seed)) throw new Error(`No readings file at ${seed}.`);
  const noAi = process.argv.includes("--no-ai");
  const started = Date.now();
  const report = await importGuideSnapshot({
    buffer: fs.readFileSync(file),
    sourceName: path.basename(file),
    importedBy: arg("by") || "Ken",
    tripId: arg("trip"),
    tripName: arg("name"),
    readPictures: !process.argv.includes("--skip-pictures") && !noAi,
    readText: !noAi,
    readDayPlans: !noAi,
    seedReadings: seed ? JSON.parse(fs.readFileSync(seed, "utf-8")) : undefined,
  });
  console.log(JSON.stringify({ ...report, seconds: Math.round((Date.now() - started) / 1000) }, null, 2));
  if (!report.accepted) process.exitCode = 2;
}

main().catch((e) => { console.error("Import failed:", e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
