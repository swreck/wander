/**
 * Keeps each source's copy fresh (Sep 30 2026). Every few minutes Wander reads a source again; a new copy is kept
 * only when something changed, so Scout's cached reading stays the same until the sheet does. A failed read keeps
 * the last good copy in use and records why, so screens and Scout can say how old their copy is. Every answer
 * cites one fixed copy — a sheet being edited mid-answer can't shift a citation.
 */
import prisma from "../db.js";
import { readGoogleSheet, type SheetRead } from "./googleSheet.js";
import { quietFor } from "../activity.js";

const KEEP_COPIES = 20;

export type SheetReader = (ref: string) => Promise<SheetRead>;

/** Read one source now. Returns whether a new copy was kept. Never throws: a failure is recorded on the source. */
export async function refreshSource(sourceId: string, read: SheetReader = readGoogleSheet): Promise<{ changed: boolean; error?: string }> {
  const source = await prisma.tripSource.findUnique({ where: { id: sourceId } });
  if (!source || !source.enabled) return { changed: false, error: "not an enabled source" };
  try {
    if (source.kind !== "google_sheet") throw new Error(`Wander can't read a "${source.kind}" source yet`);
    const got = await read(source.ref);
    const current = await prisma.sourceCopy.findFirst({ where: { sourceId, status: "current" }, orderBy: { readAt: "desc" } });
    const changed = !current || current.contentHash !== got.contentHash;
    await prisma.$transaction(async (tx) => {
      if (changed) {
        await tx.sourceCopy.updateMany({ where: { sourceId, status: "current" }, data: { status: "previous" } });
        await tx.sourceCopy.create({ data: { sourceId, title: got.title, contentHash: got.contentHash, tabs: got.tabs as any } });
      } else {
        // Unchanged: the copy is still right as of now
        await tx.sourceCopy.update({ where: { id: current!.id }, data: { readAt: new Date() } });
      }
      await tx.tripSource.update({ where: { id: sourceId }, data: { lastTriedAt: new Date(), lastError: null } });
    });
    if (changed) {
      const old = await prisma.sourceCopy.findMany({ where: { sourceId }, orderBy: { readAt: "desc" }, skip: KEEP_COPIES, select: { id: true } });
      if (old.length) await prisma.sourceCopy.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    }
    return { changed };
  } catch (e: any) {
    const error = String(e?.message || e).slice(0, 300);
    await prisma.tripSource.update({ where: { id: sourceId }, data: { lastTriedAt: new Date(), lastError: error } }).catch(() => {});
    return { changed: false, error };
  }
}

/** When the next source is due, as of the last look — so the minute's check needs no database query until then (a source
 *  added straight to the database is picked up at the next due read, within its minutes) */
let nextDueAt = 0;

/** Every enabled source due for a read ("every 10 minutes" by default) */
export async function refreshDueSources(read?: SheetReader): Promise<number> {
  const sources = await prisma.tripSource.findMany({ where: { enabled: true } });
  let n = 0;
  let next = Infinity;
  for (const s of sources) {
    const due = !s.lastTriedAt || Date.now() - s.lastTriedAt.getTime() >= s.refreshMinutes * 60_000;
    if (due) { await refreshSource(s.id, read); n++; }
    next = Math.min(next, (due ? Date.now() : s.lastTriedAt!.getTime()) + s.refreshMinutes * 60_000);
  }
  nextDueAt = next;
  return n;
}

let timer: NodeJS.Timeout | null = null;
let running: Promise<unknown> | null = null;
const QUIET = 30 * 60_000;
/** Started once by the server (not in tests). Each minute: is a source due? — answered from memory, so the database is
 *  asked only when one is (it was asked every minute, all day and night, and Neon never slept; cost audit, Oct 16). While
 *  nobody has used Wander for half an hour the reads rest; the first question after that waits for one (currentSources). */
export function startSourceRefresher() {
  if (timer || process.env.VITEST || process.env.NODE_ENV === "test" || process.env.WANDER_NO_SOURCE_REFRESH) return;
  const tick = () => {
    if (running || Date.now() < nextDueAt || (nextDueAt > 0 && quietFor(QUIET))) return;
    running = refreshDueSources().catch((e) => console.warn("[sources] refresh failed:", e?.message)).finally(() => { running = null; });
  };
  setTimeout(tick, 5_000);
  timer = setInterval(tick, 60_000);
  timer.unref?.();
}

/** A trip's enabled sources with their current copy (null when none has been read yet). After a quiet spell, when a read
 *  is due, it waits up to 3 s for it — so an answer after the night isn't given from a copy the sheet has moved past. */
export async function currentSources(tripId: string) {
  if (timer && !running && nextDueAt > 0 && Date.now() >= nextDueAt) {
    running = refreshDueSources().catch((e) => console.warn("[sources] refresh failed:", e?.message)).finally(() => { running = null; });
  }
  if (running) await Promise.race([running, new Promise((r) => setTimeout(r, 3_000))]);
  const sources = await prisma.tripSource.findMany({ where: { tripId, enabled: true }, orderBy: { createdAt: "asc" } });
  return Promise.all(sources.map(async (s) => ({
    source: s,
    copy: await prisma.sourceCopy.findFirst({ where: { sourceId: s.id, status: "current" }, orderBy: { readAt: "desc" } }),
  })));
}
