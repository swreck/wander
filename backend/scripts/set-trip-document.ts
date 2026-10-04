/**
 * Records a document someone gave Wander on a trip (services/guide/tripDocuments.ts) — Oct 4 2026: Backroads'
 * itinerary, transcribed from Ken's PDF into trip-data (never committed; the repo is public). Replaces a document of the
 * same name; every import keeps it. Prints counts only.
 *
 *   npx tsx scripts/set-trip-document.ts --trip <tripId> --file <document.json> [--dry]
 *   npx tsx scripts/set-trip-document.ts --trip <tripId> --remove "<name>"
 */
import fs from "fs";
import prisma from "../src/services/db.js";
import type { TripDocument } from "../src/services/guide/tripDocuments.js";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const tripId = arg("--trip");
if (!tripId) throw new Error("Needs --trip");
const cfg = await prisma.sheetSyncConfig.findUnique({ where: { tripId } });
if (!cfg) throw new Error("That trip has no import record yet — import her Guide first");
const tm = (cfg.tabMappings || {}) as any;
const docs: TripDocument[] = Array.isArray(tm.documents) ? tm.documents : [];

const remove = arg("--remove");
if (remove) {
  const left = docs.filter((d) => d.name !== remove);
  await prisma.sheetSyncConfig.update({ where: { tripId }, data: { tabMappings: { ...tm, documents: left } } });
  console.log(`removed ${docs.length - left.length}; ${left.length} left`);
  await prisma.$disconnect();
  process.exit(0);
}

const file = arg("--file");
if (!file) throw new Error("Needs --file or --remove");
const doc = JSON.parse(fs.readFileSync(file, "utf-8")) as TripDocument;
const problems: string[] = [];
for (const k of ["name", "from", "title", "version", "caution", "addedBy", "file"] as const) if (typeof doc[k] !== "string" || !doc[k]) problems.push(`no ${k}`);
if (doc.dayOne && !/^\d{4}-\d{2}-\d{2}$/.test(doc.dayOne)) problems.push("dayOne isn't YYYY-MM-DD");
if (!Array.isArray(doc.sections) || !doc.sections.length) problems.push("no sections");
for (const [i, s] of (doc.sections || []).entries()) {
  if (typeof s.heading !== "string" || typeof s.page !== "number" || !Array.isArray(s.paragraphs) || !s.paragraphs.length) problems.push(`section ${i + 1} is incomplete`);
}
if (problems.length) throw new Error(`Not recorded: ${problems.join("; ")}`);
const days = doc.sections.filter((s) => s.day).map((s) => s.day);
const words = doc.sections.reduce((n, s) => n + s.paragraphs.join(" ").split(/\s+/).length, 0);
console.log(`"${doc.name}": ${doc.sections.length} sections, days ${days.join(", ") || "none"}, ${words} words, Day 1 = ${doc.dayOne || "not dated"}`);
if (process.argv.includes("--dry")) { console.log("(dry run — nothing written)"); await prisma.$disconnect(); process.exit(0); }
await prisma.sheetSyncConfig.update({ where: { tripId }, data: { tabMappings: { ...tm, documents: [...docs.filter((d) => d.name !== doc.name), doc] } } });
console.log("recorded.");
await prisma.$disconnect();
