/**
 * A few sentences atop each day: what kind of day it is and its shape (Ken, Oct 2 2026: "the kind of thing an LLM
 * should be great at… 2-3 sentences summarizing the theme of the day").
 *
 * Written from the same day block Scout reads (her lines that day, which city, "with Backroads", and who isn't in
 * Japan yet) and the words on her pictures in those tabs — never a fact they don't hold. Written once per Guide copy,
 * read by a person (Claude, for Ken) before it's published, and shown only while the day is unchanged: each summary
 * keeps a fingerprint of her lines and pictures that day, and a new copy that changes the day hides it until it's
 * rewritten and read again. Kept beside her sheet's address; every import keeps it.
 */
import crypto from "crypto";
import prisma from "../db.js";
import { buildGuideContextParts } from "./scoutContext.js";

export interface DaySummary { text: string; hash: string; writtenAt: string }

/** Each day's fingerprint: her lines that day and the words on her pictures in those tabs (not Wander's wording of
 *  them, so a change to how Scout's text is laid out doesn't hide every summary) */
export async function dayHashes(tripId: string): Promise<Record<string, { hash: string; tabs: string[] }>> {
  const items = await prisma.guideItem.findMany({ where: { tripId, date: { not: null } }, orderBy: [{ time: "asc" }, { sortOrder: "asc" }],
    select: { date: true, time: true, endTime: true, kind: true, title: true, detail: true, forWhom: true, source: true } });
  const notes = await prisma.sheetNote.findMany({ where: { tripId, rowIndex: { gte: 100000 } }, select: { tabName: true, text: true } });
  const byDate = new Map<string, typeof items>();
  for (const i of items) { const d = i.date!.toISOString().slice(0, 10); (byDate.get(d) || byDate.set(d, []).get(d)!).push(i); }
  const out: Record<string, { hash: string; tabs: string[] }> = {};
  for (const [date, list] of byDate) {
    const tabs = [...new Set(list.map((i) => i.source.split(" · ")[0]))];
    const pics = notes.filter((n) => tabs.includes(n.tabName)).map((n) => n.text).sort();
    const raw = JSON.stringify([list.map((i) => [i.time, i.endTime, i.kind, i.title, i.detail, i.forWhom, i.source]), pics]);
    out[date] = { hash: crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16), tabs };
  }
  return out;
}

/** What a day's summary is written from: Scout's block for that day, and her pictures' words in its tabs */
export async function dayInputs(tripId: string): Promise<Record<string, { block: string; pictures: string; hash: string }>> {
  const hashes = await dayHashes(tripId);
  const { stable } = await buildGuideContextParts(tripId, {});
  const dd = stable.slice(Math.max(0, stable.indexOf("DAY BY DAY")));
  const head = /^\S+day, \S+ \d{1,2} \((\d{4}-\d{2}-\d{2})\)[^\n]*$/gm;
  const marks = [...dd.matchAll(head)].map((m) => ({ date: m[1], at: m.index! }));
  const notes = await prisma.sheetNote.findMany({ where: { tripId, rowIndex: { gte: 100000 } }, select: { tabName: true, text: true } });
  const out: Record<string, { block: string; pictures: string; hash: string }> = {};
  marks.forEach((m, i) => {
    if (!hashes[m.date]) return;
    let block = dd.slice(m.at, marks[i + 1]?.at ?? dd.length);
    const end = block.search(/\n\n[A-Z][A-Z' ]{4,}/); // the next section, after the last day
    if (end > 0) block = block.slice(0, end);
    const pictures = notes.filter((n) => hashes[m.date].tabs.includes(n.tabName) && /Its words, as Wander read them/.test(n.text))
      .map((n) => `[A picture in her ${n.tabName} tab]\n${n.text}`).join("\n\n");
    out[m.date] = { block: block.trim(), pictures, hash: hashes[m.date].hash };
  });
  return out;
}

/** The instruction for one day (Ken's voice: plain, warm, one thought per sentence; never a fact the lines don't hold) */
export function summaryPrompt(input: { block: string; pictures: string }): string {
  return `This is one day of a family trip to Japan (Ken, Larisa, Andy, Julie), as Wander reads it from Larisa's trip spreadsheet. The first line names the day, where everyone sleeps, and "with Backroads" on days Backroads (a guided tour company) runs. Lines in [WHERE: …] say who is not in Japan yet. Lines in square brackets are Wander's notes on her lines; "(source: …)" names her tab.

${input.block}
${input.pictures ? `\nPictures in those tabs (her illustrated maps; they can be older than the lines above — the lines are the plan, and only use a picture for what the lines leave out, such as who goes where):\n${input.pictures}\n` : ""}
Write a short summary of the day's theme for the top of the day's screen: 2 or 3 sentences, about 40–60 words in all.
- Say what kind of day it is and its shape: where it centres, how it moves, what anchors the evening.
- Only what these lines say. Never add a fact, a place, a time or a quality they don't contain (no "stunning", "famous", "unforgettable", nothing from your own knowledge of Japan).
- Who: only the people who are there. If a [WHERE] line says someone is still at home, never say "everyone" or "the group" — name who is travelling. If the group splits, say who does what by name. Several people read this, so never "you" or "your".
- A day "with Backroads": Backroads' guides lead it — say so, and never call its hours "open" or "free" unless her lines do. A day with few lines isn't empty; say only what's there.
- A flight: its arrival is on the date her lines give — never move it to this day.
- Plain, warm words, as a friend at a small table would say it. One thought per sentence. No metaphorical verbs (unlock, immerse, fuel), no "from X to Y", no "not X but Y", no exclamation marks, no advice.
- Times only if one really anchors the day (a dinner booking, a train, a flight), written like 2:50 PM or 8:30 AM — never 14:50. Never a list of stops — name two or three at most.
- Never number or rank the day ("the last Backroads day", "day seven") unless her lines say exactly that.
- Where her lines disagree (two dinners at one time, two versions of the day, two meeting points for one tour), say so neutrally ("her tabs name two places for dinner") — never pick one, never judge. A meeting point at another hotel is not a disagreement.
Reply with the summary only.`;
}

/** The published summaries, as recorded */
export async function storedSummaries(tripId: string): Promise<Record<string, DaySummary>> {
  const cfg = await prisma.sheetSyncConfig.findUnique({ where: { tripId }, select: { tabMappings: true } });
  const s = (cfg?.tabMappings as any)?.daySummaries;
  return s && typeof s === "object" ? s : {};
}

/** The summaries that still match their day (a changed day's summary is left out until rewritten and read) */
export async function currentSummaries(tripId: string): Promise<Record<string, string>> {
  const [stored, hashes] = await Promise.all([storedSummaries(tripId), dayHashes(tripId)]);
  const out: Record<string, string> = {};
  for (const [date, s] of Object.entries(stored)) if (hashes[date] && hashes[date].hash === s.hash && s.text?.trim()) out[date] = s.text.trim();
  return out;
}
