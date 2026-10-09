/**
 * To-dos and deadlines marked done in Wander (Ken, Oct 9). Her Guide's to-dos are hers to tick in her sheet, and some of
 * her lists have no status column at all ("AB / JD Actions") — so in Wander they could never be finished. The person a
 * to-do is for ticks it here; it's said as done, by whom and when, and can be undone. Never written to her sheet.
 *
 * Keys stay the same across re-reads of her Guide: "todo:<her list's row ref>" (or the Wander to-do's id), and
 * "deadline:<title>|<YYYY-MM-DD>".
 */
import prisma from "./db.js";

export interface Mark { key: string; label: string; byName: string; at: string }

const MAX_KEY = 400;
export const todoKey = (a: { id: string; sheetRowRef: string | null }) => `todo:${a.sheetRowRef || a.id}`;
export const deadlineKey = (i: { title: string; date: Date | string | null }) =>
  `deadline:${i.title.trim().replace(/\s+/g, " ")}|${i.date ? (typeof i.date === "string" ? i.date : i.date.toISOString()).slice(0, 10) : ""}`;

export async function listMarks(tripId: string): Promise<Mark[]> {
  const rows = await prisma.actionMark.findMany({ where: { tripId }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({ key: r.key, label: r.label, byName: r.byName, at: r.createdAt.toISOString() }));
}

/** Done (or not) — one mark per key; ticking again keeps the first */
export async function setMark(tripId: string, who: { travelerId: string; name: string }, key: string, label: string, done: boolean)
  : Promise<{ ok: true; mark: Mark | null } | { ok: false; status: number; error: string }> {
  if (typeof key !== "string" || !/^(todo|deadline):/.test(key) || key.length > MAX_KEY) return { ok: false, status: 400, error: "That isn't something Wander can mark done." };
  if (!done) {
    await prisma.actionMark.deleteMany({ where: { tripId, key } });
    return { ok: true, mark: null };
  }
  const text = typeof label === "string" && label.trim() ? label.trim().slice(0, 300) : key.replace(/^(todo|deadline):/, "");
  const row = await prisma.actionMark.upsert({
    where: { tripId_key: { tripId, key } },
    create: { tripId, key, label: text, byName: who.name, travelerId: who.travelerId },
    update: {},
  });
  return { ok: true, mark: { key: row.key, label: row.label, byName: row.byName, at: row.createdAt.toISOString() } };
}
