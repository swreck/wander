/**
 * The latest Guide import for a trip, in short — accepted or refused and why, counts, warnings, what changed, pictures,
 * and any day her tab plans twice (which version Wander follows). Read-only; no readings printed.
 *
 *   npx tsx scripts/guide-import-summary.ts <tripId>
 */
import "dotenv/config";
import prisma from "../src/services/db.js";

const tripId = process.argv[2];
if (!tripId) throw new Error("Usage: guide-import-summary.ts <tripId>");
const s = await prisma.guideSnapshot.findFirst({ where: { tripId }, orderBy: { importedAt: "desc" }, select: { sourceName: true, status: true, importedAt: true, report: true } });
const r = (s?.report || {}) as any;
console.log(JSON.stringify({
  sourceName: s?.sourceName, status: s?.status, importedAt: s?.importedAt, accepted: r.accepted, reasons: r.reasons,
  counts: r.counts, warnings: r.warnings, changes: r.changes, pictures: r.pictures, supersededPlans: r.supersededPlans,
}, null, 1));
await prisma.$disconnect();
