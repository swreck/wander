/**
 * Day choices: same-day plans the group adds in Wander ("Ken and Andy: Musée Tomo this afternoon").
 *
 * They are Wander's own. Larisa's Guide is the plan and is never changed; a choice sits beside it on
 * that day, labelled with who added it. A re-read of the Guide never touches these.
 * Shared by the /api/day-choices routes and Scout's tools, so both behave the same.
 */

import prisma from "./db.js";

export interface DayChoiceView {
  id: string;
  date: string;
  time: string | null;
  text: string;
  experienceId: string | null;
  addedBy: string;
  addedById: string;
  createdAt: string;
  /** Picked from one of Larisa's own ideas (her Activities tab), rather than something new */
  fromGuideIdea: boolean;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-16" → "Fri, Oct 16" (for History, notices and Scout's confirmations) */
export function plainDay(date: string): string {
  if (!DATE.test(date)) return date;
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function listDayChoices(tripId: string, date?: string): Promise<DayChoiceView[]> {
  const rows = await prisma.dayChoice.findMany({
    where: { tripId, ...(date ? { date } : {}) },
    include: { traveler: { select: { displayName: true } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const ideaIds = Array.from(new Set(rows.map((r) => r.experienceId).filter(Boolean) as string[]));
  const guideIdeas = new Set(ideaIds.length
    ? (await prisma.experience.findMany({ where: { id: { in: ideaIds }, sheetRowRef: { not: null }, NOT: { sheetRowRef: { startsWith: "Removed from Guide|" } } }, select: { id: true } })).map((e) => e.id)
    : []);
  return rows.map((r) => ({
    id: r.id, date: r.date, time: r.time, text: r.text, experienceId: r.experienceId,
    addedBy: r.traveler.displayName, addedById: r.travelerId, createdAt: r.createdAt.toISOString(),
    fromGuideIdea: !!r.experienceId && guideIdeas.has(r.experienceId),
  }));
}

export type AddResult = { ok: true; choice: DayChoiceView } | { ok: false; status: number; error: string };

export async function addDayChoice(input: {
  tripId: string; travelerId: string; date: string; text?: string | null; time?: string | null; experienceId?: string | null;
}): Promise<AddResult> {
  const date = String(input.date || "").slice(0, 10);
  if (!DATE.test(date)) return { ok: false, status: 400, error: "Which day is this for?" };
  const time = input.time ? String(input.time).slice(0, 5) : null;
  if (time && !TIME.test(time)) return { ok: false, status: 400, error: "That time didn't make sense — try something like 14:30." };

  let text = (input.text || "").trim();
  let experienceId: string | null = null;
  if (input.experienceId) {
    const exp = await prisma.experience.findFirst({ where: { id: input.experienceId, tripId: input.tripId }, select: { id: true, name: true } });
    if (!exp) return { ok: false, status: 404, error: "We couldn't find that idea on this trip." };
    experienceId = exp.id;
    if (!text) text = exp.name;
  }
  if (!text) return { ok: false, status: 400, error: "What's the plan?" };
  if (text.length > 500) text = text.slice(0, 500);

  // The day has to be one of the trip's days
  const day = await prisma.day.findFirst({ where: { tripId: input.tripId, date: new Date(`${date}T00:00:00.000Z`) }, select: { id: true } });
  if (!day) return { ok: false, status: 400, error: "That day isn't part of this trip." };

  // The same idea on the same day once is enough
  if (experienceId) {
    const dup = await prisma.dayChoice.findFirst({ where: { tripId: input.tripId, date, experienceId } });
    if (dup) return { ok: true, choice: (await listDayChoices(input.tripId, date)).find((c) => c.id === dup.id)! };
  }

  const row = await prisma.dayChoice.create({
    data: { tripId: input.tripId, travelerId: input.travelerId, date, time, text, experienceId },
  });
  return { ok: true, choice: (await listDayChoices(input.tripId, date)).find((c) => c.id === row.id)! };
}

export type RemoveResult = { ok: true; removed: DayChoiceView } | { ok: false; status: number; error: string };

/** Anyone on the trip may take a choice off a day; it's the group's own note, not the Guide. */
export async function removeDayChoice(tripId: string, id: string): Promise<RemoveResult> {
  const found = (await listDayChoices(tripId)).find((c) => c.id === id);
  if (!found) return { ok: false, status: 404, error: "That's already off the day." };
  await prisma.dayChoice.delete({ where: { id } });
  return { ok: true, removed: found };
}
