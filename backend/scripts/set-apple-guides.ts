/**
 * Records Larisa's Apple Maps guides for a trip (appleGuides.ts) from what read-apple-guides.mjs read from their share
 * links (view-only). Each map is matched to her day tab of the same day ("Tokyo Day 1" → "Tokyo Day 1 Ginza", "Tokyo
 * 2026 - Day 2" → "Tokyo Day 2 Kappabashi & …"); a map no tab matches is said, not guessed. Every import keeps them.
 * Prints names and days only — never a link (the repo is public; so is this output in a session log).
 *
 *   npx tsx scripts/set-apple-guides.ts --trip <tripId> --file <apple-guides.json> [--dry]
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const tripId = arg("--trip"), file = arg("--file");
if (!tripId || !file) throw new Error("Needs --trip and --file");
const read = JSON.parse(fs.readFileSync(file, "utf-8")) as { guides: { name: string; link: string; readAt: string; places: unknown[] }[] };

const cfg = await prisma.sheetSyncConfig.findUnique({ where: { tripId } });
if (!cfg) throw new Error("That trip has no import record yet — import her Guide first");
const snap = await prisma.guideSnapshot.findFirst({ where: { tripId, status: "current" }, orderBy: { importedAt: "desc" }, select: { tabs: true } });
const tabNames = (((snap?.tabs as unknown) as { name: string }[]) || []).map((t) => t.name);

const guides = [];
for (const g of read.guides) {
  if (!/^https:\/\/maps\.apple\/ug\/[\w~-]+$/.test(g.link)) { console.log(`skipped "${g.name}": not an Apple Maps guide link`); continue; }
  // "<City> … Day <n>" in the map's name → her tab "<City> Day <n> …"
  const city = g.name.match(/^\s*([A-Za-z]+)/)?.[1];
  const n = g.name.match(/\bDay\s*(\d+)\b/i)?.[1];
  const tab = city && n ? tabNames.find((t) => new RegExp(`^${city}\\s+Day\\s*${n}\\b`, "i").test(t)) || null : null;
  let date: string | null = null;
  if (tab) {
    const items = await prisma.guideItem.findMany({ where: { tripId, source: { startsWith: tab }, date: { not: null } }, select: { date: true } });
    const count = new Map<string, number>();
    for (const i of items) { const d = i.date!.toISOString().slice(0, 10); count.set(d, (count.get(d) || 0) + 1); }
    date = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
  console.log(`"${g.name}" (${g.places.length} places) → ${tab ? `her "${tab}" tab, ${date || "no date yet"}` : "NO day tab matches — not shown on a day (Scout still has it)"}`);
  guides.push({ name: g.name, link: g.link, readAt: g.readAt, tab, date, places: g.places });
}
if (process.argv.includes("--dry")) { console.log("(dry run — nothing written)"); await prisma.$disconnect(); process.exit(0); }
const tm = (cfg.tabMappings || {}) as any;
await prisma.sheetSyncConfig.update({ where: { tripId }, data: { tabMappings: { ...tm, appleGuides: guides } } });
console.log(`recorded ${guides.length} map(s).`);
await prisma.$disconnect();
