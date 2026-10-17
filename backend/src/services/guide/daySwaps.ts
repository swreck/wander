/**
 * A day of her plan set aside for another list of hers (Oct 17 2026). Ken, sending Larisa's Google Maps list "Tokyo Day
 * 3": "Adjust this day on wander to reflect these places. Remove existing wander places not on the Google map. (Ie, treat
 * as a replacement set). If order is not clear pick an order that makes sense and we can use the day plan without
 * trusting "next." Robichon is last". Her tab's lines for that day are hidden, never deleted; her list's places stand in
 * their place, in the order kept here, and the lines named in `keep` follow them (the dinner). Her sheet and Wander's copy
 * of it are untouched, and a new Guide copy doesn't undo it. Every reader of a day's lines goes through here: the day's
 * screens (routes/guide.ts), Scout (scoutContext.ts, sources/context.ts) and the day's summary (daySummaries.ts).
 */
import prisma from "../db.js";

/** detail: her list's own words for the place (shown); note: Wander's (distances between her pins — Scout only, said as
 *  Wander's, never shown as hers) */
export type SwapLine = { title: string; detail?: string | null; note?: string | null; link?: string | null; time?: string | null };
type Swap = { date: string; fromTab: string; keep: string[]; lines: SwapLine[]; label: string; setBy: string; why: string; createdAt: Date };
type Line = { id?: string; date: Date | null; kind: string; source: string; title: string; sortOrder?: number };

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function daySwapsOf(tripId: string): Promise<Swap[]> {
  const rows = await prisma.dayPlanSwap.findMany({ where: { tripId }, orderBy: { date: "asc" } });
  return rows.map((r) => ({ date: r.date, fromTab: r.fromTab, keep: (r.keep as string[]) || [], lines: (r.lines as SwapLine[]) || [], label: r.label, setBy: r.setBy, why: r.why, createdAt: r.createdAt }));
}

/** Her tab's line that a swap sets aside (not one it keeps) */
const setAside = (s: Swap, i: Line) => i.kind === "block" && ymd(i.date) === s.date && i.source.startsWith(s.fromTab) && !s.keep.some((k) => i.title.startsWith(k));
const kept = (s: Swap, i: Line) => i.kind === "block" && ymd(i.date) === s.date && i.source.startsWith(s.fromTab) && s.keep.some((k) => i.title.startsWith(k));

/**
 * The lines with each swapped day's lines in place: her list's places where her tab's first line stood, then the lines
 * kept, each numbered after them. A swap whose tab has no lines that day changes nothing (her plan moved: it's hers).
 */
export async function withDaySwaps<T extends Line>(tripId: string, items: T[]): Promise<T[]> {
  const swaps = await daySwapsOf(tripId).catch(() => [] as Swap[]);
  if (!swaps.length) return items;
  let out = items;
  for (const s of swaps) {
    const first = out.findIndex((i) => setAside(s, i));
    if (first < 0) continue;
    const base = out[first];
    const stays = out.filter((i) => kept(s, i));
    const order0 = Math.min(...out.filter((i) => setAside(s, i) || kept(s, i)).map((i) => i.sortOrder ?? 0));
    const lines = s.lines.map((l, n) => ({
      ...base,
      id: `swap-${s.date}-${n}`,
      title: l.title,
      detail: l.detail ?? null,
      link: l.link ?? null,
      time: l.time ?? null,
      endTime: null,
      timeText: null,
      forWhom: null,
      place: null,
      confirmation: null,
      source: `${s.fromTab.trim()} · ${s.label}`,
      sourceRef: `${s.label} #${n + 1}`,
      cells: [],
      sortOrder: order0 + n,
    })) as unknown as T[];
    const after = stays.map((i, n) => ({ ...i, sortOrder: order0 + s.lines.length + n }));
    const rest = out.filter((i) => !setAside(s, i) && !kept(s, i));
    // (her list's places, then the kept lines, where her tab's first line for the day stood)
    const at = out.slice(0, first).filter((i) => !setAside(s, i) && !kept(s, i)).length;
    out = [...rest.slice(0, at), ...lines, ...after, ...rest.slice(at)];
  }
  return out;
}

/** For Scout: what each swap set aside, in a sentence, so a question about her tab's earlier plan gets the truth */
export async function daySwapWords(tripId: string, items: Line[]): Promise<string[]> {
  const swaps = await daySwapsOf(tripId).catch(() => [] as Swap[]);
  return swaps.map((s) => {
    const aside = items.filter((i) => setAside(s, i)).map((i) => i.title.split("\n")[0]);
    if (!aside.length) return "";
    const notes = s.lines.filter((l) => l.note).map((l) => `${l.title}: ${l.note}`);
    return `${s.date}: ${s.setBy} chose (${s.createdAt.toISOString().slice(0, 10)}) to follow ${s.label} for this day, in the order its lines are given here; her "${s.fromTab.trim()}" tab's plan for the day is set aside in Wander (her sheet still has it): ${aside.join("; ")}. The order of her list's places is Wander's, not hers, and they have no times — never give one. If asked about a line set aside, say ${s.setBy} chose her map list instead. ${s.setBy}'s own words for this day (quote them when they answer the question, as his): ${s.why}${notes.length ? ` Wander's own notes on her list's places (straight-line distances between her pins — say they're Wander's, never hers): ${notes.join(" · ")}` : ""}`;
  }).filter(Boolean);
}
