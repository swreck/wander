/**
 * Keeps each source's copy fresh (Sep 30 2026). Every few minutes Wander reads a source again; a new copy is kept
 * only when something changed, so Scout's cached reading stays the same until the sheet does. A failed read keeps
 * the last good copy in use and records why, so screens and Scout can say how old their copy is. Every answer
 * cites one fixed copy — a sheet being edited mid-answer can't shift a citation.
 */
import prisma from "../db.js";
import { readGoogleSheet, type SheetRead } from "./googleSheet.js";

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

/** Every enabled source due for a read ("every 10 minutes" by default) */
export async function refreshDueSources(read?: SheetReader): Promise<number> {
  const sources = await prisma.tripSource.findMany({ where: { enabled: true } });
  let n = 0;
  for (const s of sources) {
    const due = !s.lastTriedAt || Date.now() - s.lastTriedAt.getTime() >= s.refreshMinutes * 60_000;
    if (due) { await refreshSource(s.id, read); n++; }
  }
  return n;
}

let timer: NodeJS.Timeout | null = null;
/** Started once by the server (not in tests). Checks every minute which sources are due. */
export function startSourceRefresher() {
  if (timer || process.env.VITEST || process.env.NODE_ENV === "test" || process.env.WANDER_NO_SOURCE_REFRESH) return;
  const tick = () => { refreshDueSources().catch((e) => console.warn("[sources] refresh failed:", e?.message)); };
  setTimeout(tick, 5_000);
  timer = setInterval(tick, 60_000);
  timer.unref?.();
}

/** A trip's enabled sources with their current copy (null when none has been read yet) */
export async function currentSources(tripId: string) {
  const sources = await prisma.tripSource.findMany({ where: { tripId, enabled: true }, orderBy: { createdAt: "asc" } });
  return Promise.all(sources.map(async (s) => ({
    source: s,
    copy: await prisma.sourceCopy.findFirst({ where: { sourceId: s.id, status: "current" }, orderBy: { readAt: "desc" } }),
  })));
}
