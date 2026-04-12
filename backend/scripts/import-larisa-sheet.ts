/**
 * Import a Larisa sheet as a new, isolated trip.
 *
 * - Creates a fresh trip via the existing importFromSpreadsheet service
 * - Post-processes to:
 *     - set tagline to "Synced with <filename>"
 *     - remove all travelers EXCEPT Ken (trip is isolated to planner for verification)
 *     - set sync interval to 0 (manual-only; no auto-sync until Ken says go)
 * - Prints the resulting trip ID, subtitle, and member list so Ken can verify.
 *
 * Usage:
 *   SHEET_ID=<id> npx tsx scripts/import-larisa-sheet.ts
 *   or
 *   npx tsx scripts/import-larisa-sheet.ts <id>
 */

import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, "../.env") });

import { google } from "googleapis";
import fs from "fs";
import prisma from "../src/services/db.js";
import { importFromSpreadsheet } from "../src/services/sheetImport.js";

const CREDENTIALS_PATH = "/Users/kenrosen/Documents/Projects/WanderDocumentationAndResources/actionmgr-e5d782f7349e.json";

const SHEET_ID = process.env.SHEET_ID || process.argv[2];
if (!SHEET_ID) {
  console.error("Usage: npx tsx scripts/import-larisa-sheet.ts <sheet-id>");
  process.exit(1);
}

async function getSpreadsheetFilename(spreadsheetId: string): Promise<string> {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  return meta.data.properties?.title || "(untitled sheet)";
}

async function main() {
  console.log(`\n[larisa-import] Sheet ID: ${SHEET_ID}`);
  const filename = await getSpreadsheetFilename(SHEET_ID!);
  console.log(`[larisa-import] Sheet title: ${filename}`);

  // Step 1 — run the existing importer
  console.log(`\n[larisa-import] Running import (this takes a moment)...`);
  const result = await importFromSpreadsheet(SHEET_ID!, "Ken");
  console.log(`[larisa-import] Importer finished.`);
  console.log(`  Trip ID: ${result.tripId}`);
  console.log(`  Cities: ${result.cities}`);
  console.log(`  Days: ${result.days}`);
  console.log(`  Activities: ${result.experiences}`);
  console.log(`  Accommodations: ${result.accommodations}`);
  console.log(`  Decisions: ${result.decisions}`);
  console.log(`  Interests: ${result.interests}`);

  // Step 2 — update trip name + tagline to reflect the source sheet
  // Tagline format per Ken: "Synced with <filename>"
  const newTagline = `Synced with ${filename}`;
  await prisma.trip.update({
    where: { id: result.tripId },
    data: {
      tagline: newTagline,
    },
  });
  console.log(`\n[larisa-import] Updated tagline: "${newTagline}"`);

  // Step 3 — scope trip to planners only (Ken + Larisa), remove travelers.
  // Per Ken's mission rule: all planners see all trips. Travelers get added when a planner invites them.
  const planners = await prisma.traveler.findMany({
    where: { displayName: { in: ["Ken", "Larisa"] } },
  });
  const plannerIds = planners.map(p => p.id);
  if (plannerIds.length === 0) {
    console.error("[larisa-import] FATAL: No planner traveler records found. Aborting cleanup.");
    process.exit(1);
  }

  // Ensure planners are members with role=planner
  for (const planner of planners) {
    await prisma.tripMember.upsert({
      where: { tripId_travelerId: { tripId: result.tripId, travelerId: planner.id } },
      create: { tripId: result.tripId, travelerId: planner.id, role: "planner" },
      update: { role: "planner" },
    });
  }

  // Remove any non-planner members (travelers)
  const deleted = await prisma.tripMember.deleteMany({
    where: {
      tripId: result.tripId,
      travelerId: { notIn: plannerIds },
    },
  });
  console.log(`[larisa-import] Ensured planners (${planners.map(p => p.displayName).join(", ")}) on trip; removed ${deleted.count} non-planner members.`);

  // Step 4 — set sync interval to manual-only (0)
  await prisma.sheetSyncConfig.updateMany({
    where: { tripId: result.tripId },
    data: { syncIntervalMs: 0 },
  });
  console.log(`[larisa-import] Sync interval set to Manual only (syncIntervalMs = 0).`);

  // Step 5 — print final state for verification
  const trip = await prisma.trip.findUnique({
    where: { id: result.tripId },
    include: {
      tripMembers: { include: { traveler: true } },
      cities: { include: { days: true } },
      accommodations: true,
      decisions: { include: { options: true } },
      experiences: true,
    },
  });

  if (!trip) {
    console.error("[larisa-import] FATAL: Could not re-read trip after import.");
    process.exit(1);
  }

  console.log(`\n========== FINAL STATE ==========`);
  console.log(`Trip: "${trip.name}"`);
  console.log(`Tagline: "${trip.tagline}"`);
  console.log(`ID: ${trip.id}`);
  console.log(`Dates: ${trip.startDate?.toISOString().slice(0, 10)} → ${trip.endDate?.toISOString().slice(0, 10)}`);
  console.log(`\nMembers (should only be Ken):`);
  trip.tripMembers.forEach(m => {
    console.log(`  - ${m.traveler.displayName} (${m.role})`);
  });
  console.log(`\nCities (${trip.cities.length}):`);
  trip.cities.forEach(c => {
    console.log(`  - ${c.name}: ${c.days.length} day(s)`);
  });
  console.log(`\nAccommodations (${trip.accommodations.length}):`);
  trip.accommodations.forEach(a => {
    const cityName = trip.cities.find(c => c.id === a.cityId)?.name || "?";
    console.log(`  - ${a.name} (${cityName})`);
  });
  console.log(`\nDecisions (${trip.decisions.length}):`);
  trip.decisions.forEach(d => {
    console.log(`  - ${d.title}: ${d.options.length} option(s)`);
  });
  console.log(`\nExperiences total: ${trip.experiences.length}`);

  console.log(`\n[larisa-import] DONE. Trip is isolated, sync is manual-only, ready for Chrome verification.`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error("[larisa-import] ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
