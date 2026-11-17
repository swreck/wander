/**
 * Samples: what only Ken sees (December plan S2c, Nov 17 2026). December is mostly open days, so Ken can ask to see
 * marked placeholder entries in the open slots, to judge how a full trip will look. They live in their own table
 * (sample_entries), come out of ONE route (GET /api/samples/:tripId, routes/samples.ts), and this file is the only
 * place in the server that reads the table. Larisa, or anyone whose membership doesn't ask for them, gets [].
 *
 *  - The marker: every string of a row's data (but timeZone) ends with it (U+2063 U+2063, invisible). A row with a string
 *    that doesn't is never emitted — its slot is logged, never its words.
 *  - A filled slot hides its sample: a real line in the part of the day, a real summary, two real maybes in the city,
 *    the asker's own real note or photo for the date, any real expense. An unconfirmed reading is always there (the plan
 *    tool removes it when it turns real).
 *  - None once the asker is abroad: today on the trip's clock has reached their abroadFrom (the trip's first day when null).
 */
import prisma from "./db.js";
import { currentSummaries } from "./guide/daySummaries.js";
import { dateIn } from "./zoneWords.js";

/** U+2063 U+2063 — the same marker the plan tool writes (plan-lib's HIDDEN) */
export const SAMPLE_MARKER = "⁣⁣";
export type SampleOut = { id: string; kind: string; date: string | null; slot: string; data: unknown };

/** Every string in the data ends with the marker, except a timeZone (a zone name is a name, not words anyone reads) */
export function markedThrough(data: unknown, key = ""): boolean {
  if (typeof data === "string") return key === "timeZone" || data.endsWith(SAMPLE_MARKER);
  if (Array.isArray(data)) return data.every((v) => markedThrough(v, key));
  if (data && typeof data === "object") return Object.entries(data as Record<string, unknown>).every(([k, v]) => markedThrough(v, k));
  return true;
}

const PARTS = ["morning", "midday", "afternoon", "evening"] as const;
/** Which part of the day a clock time is in: before 11:30; 11:30 to before 14:00; 14:00 to before 17:30; from 17:30 */
export function partOf(time: string): (typeof PARTS)[number] | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time || "");
  if (!m) return null;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return min < 11 * 60 + 30 ? "morning" : min < 14 * 60 ? "midday" : min < 17 * 60 + 30 ? "afternoon" : "evening";
}

export async function samplesFor(tripId: string, travelerId: string | undefined, now: Date = new Date()): Promise<SampleOut[]> {
  if (!travelerId) return [];
  const member = await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId, travelerId } }, select: { showSamples: true, abroadFrom: true } });
  if (!member?.showSamples) return [];

  // None once abroad
  const [trip, firstDay] = await Promise.all([
    prisma.trip.findUnique({ where: { id: tripId }, select: { timeZone: true, startDate: true } }),
    prisma.day.findFirst({ where: { tripId }, orderBy: { date: "asc" }, select: { date: true } }),
  ]);
  const from = member.abroadFrom || firstDay?.date || trip?.startDate || null;
  if (from && dateIn(trip?.timeZone || "Asia/Tokyo", now) >= from.toISOString().slice(0, 10)) return [];

  const rows = await prisma.sampleEntry.findMany({ where: { tripId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
  const marked = rows.filter((r) => {
    if (markedThrough(r.data)) return true;
    console.warn(`A sample without its marker is not shown (slot ${r.slot})`);
    return false;
  });
  if (!marked.length) return [];

  // What is real, read once for the kinds that are there
  const kinds = new Set(marked.map((r) => r.kind));
  const filled = new Set<string>();   // "<date>|<part>"
  if (kinds.has("line")) {
    const dates = [...new Set(marked.filter((r) => r.kind === "line" && r.date).map((r) => r.date!))];
    const real = await prisma.guideItem.findMany({ where: { tripId, kind: { in: ["tour", "meal", "plan", "meeting"] }, date: { in: dates.map((d) => new Date(`${d}T00:00:00Z`)) }, time: { not: null } }, select: { date: true, time: true } });
    for (const g of real) { const p = partOf(g.time || ""); if (p && g.date) filled.add(`${g.date.toISOString().slice(0, 10)}|${p}`); }
  }
  const summaries = kinds.has("summary") ? await currentSummaries(tripId) : {};
  const maybeCount = new Map<string, number>();
  if (kinds.has("maybe")) {
    const cities = await prisma.city.findMany({ where: { tripId, planKey: { not: null } }, select: { id: true, planKey: true } });
    for (const c of cities) maybeCount.set(c.planKey!, await prisma.experience.count({ where: { tripId, cityId: c.id, sheetRowRef: null, removedAt: null } }));
  }
  const notes = kinds.has("note") ? new Set((await prisma.tripNote.findMany({ where: { tripId, travelerId, dayDate: { not: null } }, select: { dayDate: true } })).map((n) => n.dayDate!)) : new Set<string>();
  const photos = kinds.has("trip_photo") ? new Set((await prisma.tripPhoto.findMany({ where: { tripId, travelerId }, select: { dayDate: true } })).map((p) => p.dayDate)) : new Set<string>();
  const anyExpense = kinds.has("expense") ? (await prisma.tripExpense.count({ where: { tripId, removedAt: null } })) > 0 : false;

  const hidden = (r: (typeof rows)[number]): boolean => {
    switch (r.kind) {
      case "line": {
        const [date, part] = r.slot.split("|");
        return (PARTS as readonly string[]).includes(part) && filled.has(`${date}|${part}`);
      }
      case "summary": return !!summaries[r.slot.split("|")[0]];
      case "maybe": return (maybeCount.get(r.slot.split("|")[0]) || 0) >= 2;
      case "note": return notes.has(r.slot.split("|")[0]);
      case "trip_photo": return photos.has(r.slot.split("|")[0]);
      case "expense": return anyExpense;
      default: return false;   // unconfirmed: always there
    }
  };
  return marked.filter((r) => !hidden(r)).map((r) => ({ id: `sample:${r.id}`, kind: r.kind, date: r.date, slot: r.slot, data: r.data }));
}
