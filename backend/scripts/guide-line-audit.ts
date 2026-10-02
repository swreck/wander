// Read-only: for every Guide line Scout reads, are the line's telling words — dates, times, names — in the cells its
// source points to? Lists the lines that miss, so a person can read them. No API calls. Run after each new copy of
// her Guide is imported: the count of lines fully in their cells should hold (Oct 2: 484 of 552).
// Usage: npx tsx scripts/guide-line-audit.ts <tripId> [--all]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { buildGuideContextParts } from "../src/services/guide/scoutContext.js";
const prisma = new PrismaClient();
const [tripId, flag] = process.argv.slice(2);
const b = await buildGuideContextParts(tripId, { now: new Date("2026-10-20T10:40:00+09:00"), phoneZone: "Asia/Tokyo" });
const flat = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
const STOP = new Set(("your guide larisa larisa's ken's scout wander today tonight tomorrow this that there they then when what where which with from note tab day morning evening afternoon monday tuesday wednesday thursday friday saturday sunday october itinerary plan block detailed source check sleeping nights times estimate guided backroads her his says lists picture screenshot added for " +
  "address booked phone worked tabs still lands seats confirmation notes flight free until maybe both info dining resos japan time experience transit route whole separate bookings never everyone requested").split(" "));
// What Wander wraps around her words: its own bracketed notes, the "(source: …)" tag, its own detail notes, lead-ins
const WANDER_LINE = /^(Tabs differ:|Time from the |The .+ tab lists |Wander matched |Still open in the Guide|Worked out from:|Her whole route|Lands at |Seats requested)/;
const herPart = (t: string) => t.split("\n").filter((x) => !WANDER_LINE.test(x.trim())).join("\n")
  .replace(/\[[^\]]*\]/g, " ").replace(/\(source: [^\n]*/g, " ").replace(/^\s*-\s*/, "")
  // the nights between check-in and check-out are Wander's count, not a cell
  .replace(/sleeping there the nights of [\d\-, ]+;/, " ");
const twelve = (hm: string) => { const [h, m] = hm.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`; };
const tokens = (s: string) => {
  const out = new Set<string>();
  for (const m of s.matchAll(/\b20\d\d-\d\d-\d\d\b/g)) out.add(m[0]);
  for (const m of s.matchAll(/\b\d{1,2}:\d{2}\b/g)) out.add(m[0].replace(/^0/, ""));
  for (const m of s.matchAll(/\b[A-Z][A-Za-z'’-]{3,}/g)) if (!STOP.has(m[0].toLowerCase())) out.add(m[0].toLowerCase());
  return [...out];
};
// her "3p", "1:30 PM", "12p" carry Wander's 15:00, 13:30, 12:00
const timeIn = (t: string, hay: string) => {
  if (!/^\d{1,2}:\d{2}$/.test(t)) return hay.includes(t);
  const tw = twelve(t), h = tw.split(":")[0], m = tw.split(":")[1];
  return hay.includes(t) || hay.includes(tw) || (m === "00" && new RegExp(`\\b${h}\\s*(?:[ap]\\.?m?\\b|:00)`).test(hay));
};
let n = 0, ok = 0, pictured = 0;
const misses: string[] = [];
for (const l of [...b.stableLines, ...b.liveLines]) {
  const s: any = l.src;
  if (!s || (s.type !== "guide" && s.type !== "wander")) continue;
  const cells = s.type === "guide" ? s.cells : s.from.flatMap((f: any) => f.cells);
  const textCells = cells.filter((c: any) => c.kind === "cell");
  if (!textCells.length) continue; // pictures and tab-only sources: nothing to compare
  if (s.type === "wander") continue; // worked-out lines: their words are Wander's; the cells are what it worked from
  n++;
  const hay = flat(textCells.map((c: any) => c.text).join(" \n ")).replace(/\b0(\d:\d\d)/g, "$1");
  const tk = tokens(herPart(l.text));
  const hasPicture = cells.some((c: any) => c.kind === "picture");
  const miss = tk.filter((t) => !timeIn(t, hay));
  // a line that also cites a picture: what isn't in its cells may be in the picture — listed apart
  if (hasPicture && miss.length) { pictured++; if (flag !== "--all") continue; }
  if (!tk.length || miss.length === 0) { ok++; if (flag !== "--all") continue; }
  if (miss.length) misses.push(`${l.text.trim().slice(0, 230).replace(/\n/g, " ⏎ ")}\n     missing: ${miss.join(", ")}\n     cells: ${textCells.map((c: any) => `${c.tab}!${c.a1}`).join(" ")}`);
}
console.log(`Guide lines with cells: ${n}; every telling word in its cells: ${ok}; the rest may be in a picture it cites: ${pictured}; with a miss: ${misses.length}`);
for (const m of misses) console.log("\n· " + m);
await prisma.$disconnect();
