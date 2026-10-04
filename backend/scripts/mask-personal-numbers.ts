/**
 * One time (Oct 4 2026): the words Wander already saved from her pictures, with people's own travel numbers left out
 * the way every new Guide copy now leaves them out (services/sources/filter.ts withoutPersonalNumbers). Changes only
 * rows whose words change. Prints counts and tab names — never the words or a number.
 *
 *   npx tsx scripts/mask-personal-numbers.ts --trip <tripId> [--apply]
 */
import prisma from "../src/services/db.js";
import { holdsPersonalNumbers, withoutPersonalNumbers } from "../src/services/sources/filter.js";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const tripId = arg("--trip");
if (!tripId) throw new Error("Needs --trip");
const apply = process.argv.includes("--apply");

const notes = (await prisma.sheetNote.findMany({ where: { tripId }, select: { id: true, tabName: true, text: true } }))
  .filter((n) => holdsPersonalNumbers(n.text));
console.log(`saved Guide words with people's own numbers: ${notes.length} (${[...new Set(notes.map((n) => n.tabName))].join(", ") || "none"})`);
const said = await prisma.chatMessage.count({ where: { tripId, OR: [{ content: { contains: "KTN" } }, { content: { contains: "eTicket" } }, { content: { contains: "MileagePlus" } }] } });
console.log(`Scout messages mentioning those labels (left as they are): ${said}`);
if (!apply) { console.log("(dry run — nothing written)"); await prisma.$disconnect(); process.exit(0); }
for (const n of notes) await prisma.sheetNote.update({ where: { id: n.id }, data: { text: withoutPersonalNumbers(n.text) } });
const left = (await prisma.sheetNote.findMany({ where: { tripId }, select: { text: true } })).filter((n) => holdsPersonalNumbers(n.text)).length;
console.log(`changed ${notes.length}; still holding numbers: ${left}`);
await prisma.$disconnect();
