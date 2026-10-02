/**
 * Day summaries (daySummaries.ts): write them to a file for a person to read, then publish what was read.
 *
 *   npx tsx scripts/day-summaries.ts --trip <tripId> --write <file.json> [--changed] [--dates 2026-10-16,2026-10-28]
 *       writes a summary for each day (or only days whose published summary no longer matches: --changed) and prints
 *       them to read. Nothing is published.
 *   npx tsx scripts/day-summaries.ts --trip <tripId> --publish <file.json> [--dry]
 *       publishes the file's summaries — each only if its day is still exactly what it was written from.
 *
 * The file goes in trip-data/ (private). Edit or delete a summary in the file before publishing if it needs it.
 */
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import prisma from "../src/services/db.js";
import { dayInputs, summaryPrompt, storedSummaries, type DaySummary } from "../src/services/guide/daySummaries.js";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const tripId = arg("--trip");
const writeTo = arg("--write"), publish = arg("--publish");
if (!tripId || (!writeTo && !publish)) throw new Error("Needs --trip and --write <file> or --publish <file>");
const inputs = await dayInputs(tripId);

if (writeTo) {
  const client = new Anthropic();
  const only = arg("--dates")?.split(",");
  const stored = process.argv.includes("--changed") ? await storedSummaries(tripId) : {};
  const out: Record<string, DaySummary> = fs.existsSync(writeTo) ? JSON.parse(fs.readFileSync(writeTo, "utf-8")) : {};
  // (the trip's own days — a cancel-by date weeks before isn't a day of the trip)
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { startDate: true, endDate: true } });
  const from = trip?.startDate?.toISOString().slice(0, 10) || "0000", to = trip?.endDate?.toISOString().slice(0, 10) || "9999";
  for (const [date, input] of Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b))) {
    if (only && !only.includes(date)) continue;
    if (date < from || date > to) continue;
    if (stored[date]?.hash === input.hash) continue;
    const r = await client.messages.create({ model: "claude-opus-5", max_tokens: 2000, messages: [{ role: "user", content: summaryPrompt(input) }] });
    if (r.stop_reason === "max_tokens") { console.log(`${date}: CUT OFF — not written`); continue; }
    const text = r.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    out[date] = { text, hash: input.hash, writtenAt: new Date().toISOString() };
    console.log(`\n=== ${date} ===\n${text}`);
    fs.writeFileSync(writeTo, JSON.stringify(out, null, 1));
  }
  console.log(`\nwritten to the file — read each before publishing`);
}

if (publish) {
  const file: Record<string, DaySummary> = JSON.parse(fs.readFileSync(publish, "utf-8"));
  const ok: Record<string, DaySummary> = {};
  for (const [date, s] of Object.entries(file)) {
    if (!inputs[date]) console.log(`${date}: no such day now — left out`);
    else if (inputs[date].hash !== s.hash) console.log(`${date}: the day has changed since it was written — left out (write it again)`);
    else ok[date] = s;
  }
  console.log(`${Object.keys(ok).length} of ${Object.keys(file).length} summaries match their days`);
  if (!process.argv.includes("--dry")) {
    const cfg = await prisma.sheetSyncConfig.findUnique({ where: { tripId } });
    if (!cfg) throw new Error("That trip has no import record yet");
    const tm = (cfg.tabMappings || {}) as any;
    await prisma.sheetSyncConfig.update({ where: { tripId }, data: { tabMappings: { ...tm, daySummaries: { ...(tm.daySummaries || {}), ...ok } } } });
    console.log("published.");
  } else console.log("(dry run — nothing published)");
}
await prisma.$disconnect();
