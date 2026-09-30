/**
 * Other sources, ready for Scout and the screens (Sep 30 2026). Each source becomes its own cited document —
 * never merged into Larisa's Guide — one line per row, every line carrying its cells (tab, address, exact words)
 * so "Sources" shows where each fact came from. Tabs Wander recognizes (train bookings, a step-by-step checklist)
 * are read by their headers; any other tab still reaches Scout row by row, so a new sheet needs no new code to be
 * cited. Where a source's train and her Guide disagree on a date, both are said ("Sources differ"), never settled.
 */
import prisma from "../db.js";
import type { GuideTab } from "../guide/reader.js";
import type { ContextLine, SourceView } from "../guide/sources.js";
import { currentSources } from "./refresh.js";
import { railRows, checklistSteps, col, twelveHour, dateIn, type RailRow, type ChecklistStep, type Cited } from "./shapes.js";

export interface SourceMeta { id: string; name: string; owner: string; authorship: string | null; about: string | null; title: string | null; readAt: string | null; lastTriedAt: string | null; lastError: string | null }

export interface SourceView2 {
  meta: SourceMeta;
  rail: RailRow[];
  checklists: { tab: string; steps: ChecklistStep[]; date: string | null }[];
  otherTabs: GuideTab[];
  differs: RailDiffer[];
}

export interface RailDiffer { date: string; row: number; tab: string; train: string; railSays: string; guideSays: string; guideSource: string }

type GuideLine = { date: Date | null; time: string | null; endTime?: string | null; kind: string; title: string; detail: string | null; source: string };
// Wander's own notes in a Guide line's detail (the same list scoutContext.ts keeps apart from her words)
const WANDER_NOTE = /^(Tabs differ:|Time from the |The .+ tab lists |Wander matched |Still open in the Guide|Worked out from:|Times are Larisa's estimate)/;

const TRAIN_FAMILIES = /\b(nozomi|hikari|kodama|sakura|mizuho|haruka|yamabiko|hayabusa|komachi|tsubasa|kagayaki|thunderbird|limited express)\b/i;
const TIME_WORDS = /\b(\d{1,2}):(\d{2})\s*(a\.?m?\.?|p\.?m?\.?)?(?![\d])/gi;
// "4:45–5:00 PM", "~1:30-2:00": a window, not two times (Oct 14: "ideally around 4:45–5:00 PM" and a 4:58 booking agree)
const TIME_RANGE = /\b(\d{1,2}):(\d{2})\s*(a\.?m?\.?|p\.?m?\.?)?\s*[–—-]\s*(\d{1,2}):(\d{2})\s*(a\.?m?\.?|p\.?m?\.?)?(?![\d])/gi;

function minutesOf(h: number, m: number, ap?: string) {
  let hh = h % 24;
  if (ap && /^p/i.test(ap) && hh < 12) hh += 12;
  if (ap && /^a/i.test(ap) && hh === 12) hh = 0;
  return hh * 60 + m;
}
/** Same clock time, allowing a bare "1:30" to mean 1:30 PM */
function sameTime(a: number, b: number, bare: boolean) {
  return a === b || (bare && a % 720 === b % 720);
}
const endpoints = (route: string) => route.split(/→|->|–>/).map((p) => p.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0]?.toLowerCase()).filter((w) => w && w.length > 2);

/**
 * Her Guide and a train row on the same date, about the same leg (the train's name, or both ends of the route),
 * giving a different departure. Conservative: a line that names no time for the leg says nothing either way.
 */
export function railDiffers(rows: RailRow[], guide: GuideLine[]): RailDiffer[] {
  const out: RailDiffer[] = [];
  const departOf = (r: RailRow) => {
    const d = col(r.cols, /^depart/)?.text.match(/^(\d{1,2}):(\d{2})$/);
    return d ? minutesOf(Number(d[1]), Number(d[2])) : null;
  };
  for (const r of rows) {
    const depart = col(r.cols, /^depart/)?.text.match(/^(\d{1,2}):(\d{2})$/);
    if (!r.date || !depart) continue;
    const dep = minutesOf(Number(depart[1]), Number(depart[2]));
    // Another leg's departure that day: a time her line gives for that leg isn't about this one (Oct 14: the
    // morning's 8:07 train sits in the same note as the 4:58 return)
    const otherLegs = rows.filter((o) => o !== r && o.date === r.date).map(departOf).filter((m): m is number => m !== null);
    const train = col(r.cols, /^train$/)?.text || "";
    const family = (train.match(TRAIN_FAMILIES) || [])[1]?.toLowerCase();
    const ends = endpoints(col(r.cols, /^route$/)?.text || "");
    for (const g of guide) {
      if (!g.date || g.date.toISOString().slice(0, 10) !== r.date) continue;
      // Her words only: Wander's own notes on a line (a "Tabs differ" quoting another tab) aren't this line's
      // (Oct 29: the day tab's 12:30 HARUKA line carried the Itinerary's "1:30-2:00p" in such a note)
      const own = (g.detail || "").split("\n").filter((l) => !WANDER_NOTE.test(l)).join("\n");
      const text = `${g.title}\n${own}`;
      const low = text.toLowerCase();
      const sameLeg = (family && low.includes(family)) || (ends.length === 2 && ends.every((e) => low.includes(e)));
      if (!sameLeg) continue;
      // Times her line gives for this leg: its own time (a day-plan line's is a window when it has an end), and any
      // time written next to the train or a station
      const near: { said: string; min: number; bare: boolean }[] = [];
      if (g.time && ["train", "travel", "block"].includes(g.kind)) {
        const a = minutesOf(Number(g.time.slice(0, 2)), Number(g.time.slice(3, 5)));
        const b = g.endTime ? minutesOf(Number(g.endTime.slice(0, 2)), Number(g.endTime.slice(3, 5))) : a;
        if (dep >= a && dep <= b) continue;
        near.push({ said: g.endTime ? `${twelveHour(g.time)}–${twelveHour(g.endTime)}` : twelveHour(g.time), min: a, bare: false });
      }
      const aboutThisLeg = (at: number, len: number) => {
        const around = low.slice(Math.max(0, at - 30), at + len + 30);
        return (family && around.includes(family)) || ends.some((e) => around.includes(e));
      };
      // A window her line gives that includes the departure: they agree
      let inWindow = false;
      const windows: [number, number][] = [];
      for (const m of text.matchAll(TIME_RANGE)) {
        if (!aboutThisLeg(m.index ?? 0, m[0].length)) continue;
        const ap = m[6] || m[3];
        const a = minutesOf(Number(m[1]), Number(m[2]), m[3] || ap), b = minutesOf(Number(m[4]), Number(m[5]), ap);
        windows.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
        if ((dep >= a && dep <= b) || (!ap && dep % 720 >= a % 720 && dep % 720 <= b % 720)) inWindow = true;
        else near.push({ said: m[0].trim(), min: a, bare: !ap });
      }
      if (inWindow) continue;
      let atOrAfter = false;
      for (const m of text.matchAll(TIME_WORDS)) {
        const at = m.index ?? 0;
        if (windows.some(([s, e]) => at >= s && at < e) || !aboutThisLeg(at, m[0].length)) continue;
        const min = minutesOf(Number(m[1]), Number(m[2]), m[3]);
        if (otherLegs.some((o) => sameTime(min, o, !m[3]))) continue;
        // "leave 6:15 or later", "6:15p+", "after 10:30": the earliest time, not the time (Oct 6: a 6:17 train agrees)
        const earliest = /^\s*(or later|or after|\+|and later)/i.test(text.slice(at + m[0].length)) || /\b(after|from|no earlier than)\s*$/i.test(text.slice(Math.max(0, at - 20), at));
        if (earliest && (dep >= min || (!m[3] && dep % 720 >= min % 720))) { atOrAfter = true; continue; }
        near.push({ said: m[0].trim(), min, bare: !m[3] });
      }
      if (atOrAfter && !near.length) continue;
      if (!near.length || near.some((n) => sameTime(n.min, dep, n.bare))) continue;
      out.push({
        date: r.date, row: r.row, tab: r.tab, train: train || (col(r.cols, /^route$/)?.text ?? ""),
        railSays: `${train ? `${train} ` : ""}leaving ${twelveHour(`${depart[1]}:${depart[2]}`)}`,
        guideSays: near.map((n) => n.said).join(" / "), guideSource: g.source,
      });
    }
  }
  return out;
}

/** A trip's other sources, read into what screens and Scout use */
export async function sourceViews(tripId: string): Promise<SourceView2[]> {
  const [trip, found, guide] = await Promise.all([
    prisma.trip.findUnique({ where: { id: tripId }, select: { startDate: true } }),
    currentSources(tripId),
    prisma.guideItem.findMany({ where: { tripId }, select: { date: true, time: true, endTime: true, kind: true, title: true, detail: true, source: true } }),
  ]);
  const year = trip?.startDate ? trip.startDate.getUTCFullYear() : new Date().getUTCFullYear();
  return found.map(({ source, copy }) => {
    const tabs = ((copy?.tabs as unknown) as GuideTab[]) || [];
    const rail: RailRow[] = [];
    const checklists: SourceView2["checklists"] = [];
    const otherTabs: GuideTab[] = [];
    for (const t of tabs) {
      const r = railRows(t, year);
      if (r) { rail.push(...r); continue; }
      const steps = checklistSteps(t);
      if (steps) {
        // The day it's for: the first date in its "When / where" steps ("Shin-Osaka, Oct 6")
        const when = steps.map((s) => col(s.cols, /^when/)?.text || "").map((w) => dateIn(w, year)).find(Boolean) || null;
        checklists.push({ tab: t.name, steps, date: when });
        continue;
      }
      otherTabs.push(t);
    }
    return {
      meta: {
        id: source.id, name: source.name, owner: source.owner, authorship: source.authorship, about: source.about,
        title: copy?.title || null, readAt: copy?.readAt.toISOString() || null,
        lastTriedAt: source.lastTriedAt?.toISOString() || null, lastError: source.lastError,
      },
      rail, checklists, otherTabs, differs: railDiffers(rail, guide),
    };
  });
}

const cellsOf = (tab: string, cols: Record<string, Cited>) => Object.values(cols).map((v) => ({ kind: "cell" as const, tab, a1: v.a1, text: v.text }));
const TIME_HEADS = /^(depart|arrive)/;
/** An afternoon time written 24-hour inside a sentence ("Hakata 10:36 → Nagoya 13:55") gets its 12-hour words beside it
 * (Scout copied "13:55" from the pickup tab's summaries; every Wander time is "1:55 PM") */
const withTwelveHour = (s: string) => s.replace(/\b(1[3-9]|2[0-3]):([0-5]\d)\b(?!\s*\()/g, (m) => `${m} (${twelveHour(m)})`);

/** "Head: value" for each column, in the tab's order, times in 12-hour words with the sheet's own beside them */
function rowWords(cols: Record<string, Cited>) {
  return Object.entries(cols)
    .filter(([, v]) => v.text && v.text !== "—")
    .map(([h, v]) => {
      const low = h.toLowerCase();
      const t = TIME_HEADS.test(low) && /^\d{1,2}:\d{2}$/.test(v.text) ? `${twelveHour(v.text)} (written ${v.text})` : withTwelveHour(v.text);
      return `${h}: ${t.replace(/\n+/g, " ")}`;
    })
    .join(" · ");
}

/** One cited document per source, for Scout */
export function sourceDocuments(views: SourceView2[]): { title: string; lines: ContextLine[] }[] {
  return views.filter((v) => v.meta.readAt).map((v) => {
    const m = v.meta;
    const title = `${m.name} (${m.owner}'s${m.authorship ? `, ${m.authorship}` : ""})`;
    const lines: ContextLine[] = [];
    const src = (label: string, cells: ReturnType<typeof cellsOf>): SourceView => ({ type: "sheet", source: m.name, owner: m.owner, authorship: m.authorship, label, cells });
    lines.push({ text: `${m.name.toUpperCase()}: "${m.title}" — ${m.owner}'s own sheet${m.authorship ? `, ${m.authorship}` : ""}${m.about ? ` (${m.about})` : ""}. It is NOT Larisa's Guide. Its words (statuses like TRUE, "?", PENDING) are its own.`, src: null });
    for (const r of v.rail) {
      const label = `${r.tab} tab, row ${r.row}`;
      lines.push({ text: `${label} — ${rowWords(r.cols)}`, src: src(label, cellsOf(r.tab, r.cols)) });
    }
    for (const c of v.checklists) {
      lines.push({ text: `${c.tab} tab — a step-by-step checklist${c.date ? ` for ${c.date}` : ""}, in its order:`, src: null });
      for (const s of c.steps) {
        const label = `${c.tab} tab, row ${s.row}`;
        lines.push({ text: `${label} — ${rowWords(s.cols)}`, src: src(label, cellsOf(c.tab, s.cols)) });
      }
    }
    for (const t of v.otherTabs) {
      const rows = new Map<number, typeof t.cells>();
      for (const c of t.cells) rows.set(c.r, [...(rows.get(c.r) || []), c]);
      for (const [r, cells] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
        const label = `${t.name} tab, row ${r}`;
        lines.push({ text: `${label} — ${cells.map((c) => c.text.replace(/\n+/g, " ")).join(" · ")}`, src: src(label, cells.map((c) => ({ kind: "cell" as const, tab: t.name, a1: c.a1, text: c.text }))) });
      }
    }
    for (const d of v.differs) {
      lines.push({
        text: `SOURCES DIFFER on ${d.date}: ${m.name} (${d.tab} tab, row ${d.row}) has ${d.railSays}; Larisa's Guide (${d.guideSource}) has ${d.guideSays}. Say both; never pick one.`,
        src: { type: "wander", what: `Wander compared ${m.name} with Larisa's Guide for ${d.date}`, from: [] },
      });
    }
    return { title, lines };
  });
}
