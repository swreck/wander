/**
 * Gives every idea on a trip that has no theme yet one theme for the Maybes filters (services/themes.ts): her
 * restaurant section is already "food"; the rest are read once by a fast model. Safe to run again — only untagged ideas.
 *   npx tsx scripts/tag-themes.ts --trip <tripId> [--dry]
 */
import prisma from "../src/services/db.js";
import { tagMissingThemes, THEME_LABELS } from "../src/services/themes.js";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const tripId = arg("--trip");
if (!tripId) throw new Error("Needs --trip");
const untagged = await prisma.experience.count({ where: { tripId, themes: { isEmpty: true } } });
console.log(`${untagged} ideas without a theme`);
if (!process.argv.includes("--dry")) {
  const n = await tagMissingThemes(tripId);
  console.log(`read ${n}`);
}
const all = await prisma.experience.findMany({ where: { tripId }, select: { themes: true } });
const counts: Record<string, number> = {};
for (const e of all) for (const t of e.themes.length ? e.themes : ["(none)"]) counts[t] = (counts[t] || 0) + 1;
console.log(Object.entries(counts).map(([t, n]) => `${THEME_LABELS[t] || t}: ${n}`).join(" · "));
await prisma.$disconnect();
