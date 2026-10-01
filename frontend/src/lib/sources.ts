/**
 * The trip's other sources (Sep 30 2026: Ken's rail sheet) — its trains, its step-by-step checklists, and where it
 * and Larisa's Guide disagree. Read-only, like the Guide. A copy is kept on the phone: the Shin-Osaka pickup steps
 * must open in the station with no signal.
 */
import { api } from "./api";
import { partiesOf, partyOf } from "./guideDisplay";
import type { GuideItem } from "./guideData";

/** The sheet owner's couple and the group's size, from her Guide's pairs ("Ken & Larisa", "Julie & Andy") */
export function railAudience(items: GuideItem[], owner: string): { ownerParty: string | null; groupSize: number } {
  const parties = partiesOf(items);
  return {
    ownerParty: partyOf(items, owner),
    groupSize: parties.reduce((n, p) => n + p.split(/\s*(?:&|and|,)\s*/i).filter(Boolean).length, 0),
  };
}

export interface Cited { text: string; a1: string }
export interface RailRow { tab: string; row: number; date: string | null; cols: Record<string, Cited> }
export interface ChecklistStep { tab: string; row: number; cols: Record<string, Cited> }
export interface Checklist { tab: string; steps: ChecklistStep[]; date: string | null }
export interface RailDiffer {
  date: string; row: number; tab: string; train: string; railSays: string; guideSays: string; guideSource: string;
  /** Her other lines for the same leg that agree with the rail sheet */
  agree?: { source: string; says: string }[];
}

/** "her Itinerary tab", "her “Kyoto Thu, 1029 (Flight Home))” tab" */
export const herTab = (source: string) => {
  const tab = source.split(" · ")[0].split(" + ")[0].trim();
  return /^itinerary$/i.test(tab) ? "her Itinerary tab" : `her “${tab}” tab`;
};

/** "the rail sheet has HARUKA 31 leaving 1:30 PM, and so does her Itinerary tab (“1:30-2:00p”); her “Kyoto …” tab has 12:30 PM–1:00 PM" */
export function differWords(d: RailDiffer): string {
  const agree = (d.agree || []).map((a) => `${herTab(a.source)} (“${withTwelveHour(a.says)}”)`);
  return `the rail sheet has ${d.railSays}${agree.length ? `, and so does ${agree.join(" and ")}` : ""}; ${herTab(d.guideSource)} has ${withTwelveHour(d.guideSays)}`;
}

export interface OtherSource {
  id: string;
  name: string;            // "Rail sheet"
  owner: string;           // "Ken"
  authorship: string | null; // "written with AI help"
  about: string | null;
  title: string | null;    // the sheet's own title
  readAt: string | null;
  lastTriedAt: string | null;
  lastError: string | null;
  rail: RailRow[];
  checklists: Checklist[];
  otherTabs: string[];
  differs: RailDiffer[];
}

export interface SourcesData { sources: OtherSource[]; fromSavedCopy?: boolean; savedAt?: string }

const cache = new Map<string, Promise<SourcesData>>();
const savedKey = (tripId: string) => `wander:sources-copy:${tripId}`;

async function load(tripId: string): Promise<SourcesData> {
  try {
    const sources = await api.get<OtherSource[]>(`/sources/${tripId}`);
    try { localStorage.setItem(savedKey(tripId), JSON.stringify({ sources, savedAt: new Date().toISOString() })); } catch { /* storage full */ }
    return { sources };
  } catch (err) {
    try {
      const raw = localStorage.getItem(savedKey(tripId));
      if (raw) return { ...(JSON.parse(raw) as SourcesData), fromSavedCopy: true };
    } catch { /* unreadable copy */ }
    throw err;
  }
}

/** A trip's other sources, fetched once and shared; a failure or a saved copy is forgotten so the next look retries */
export function sourcesData(tripId: string): Promise<SourcesData> {
  let p = cache.get(tripId);
  if (!p) {
    p = load(tripId);
    cache.set(tripId, p);
    p.then((d) => { if (d.fromSavedCopy) cache.delete(tripId); }, () => cache.delete(tripId));
  }
  return p;
}

/** The value under a header, whatever its exact spelling ("Car / seat", "Reservation #") */
export function colOf(cols: Record<string, Cited>, ...names: RegExp[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();
  for (const [head, v] of Object.entries(cols)) if (names.some((n) => n.test(norm(head)))) return v.text;
  return "";
}

/** "18:17" → "6:17 PM"; anything else as written */
export function twelveHour(t: string): string {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23) return t.trim();
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** The sheet's own words with a 12-hour time beside each 24-hour one: "by about 17:00 (5:00 PM)" */
export function withTwelveHour(s: string): string {
  // (and a morning written the 24-hour way, "08:07" — round 12: the pickup page kept "08:07" and "12:09" as they were)
  // (never one already said with AM/PM — "12:30 PM" became "12:30 (12:30 PM) PM")
  // (every two-digit hour — "Okayama 10:26" stayed bare while "08:07" got its words)
  return s.replace(/\b(0\d|1\d|2[0-3]):([0-5]\d)\b(?!\s*(?:\(|[AaPp]\.?[Mm]?\b))/g, (m) => `${m} (${twelveHour(m)})`);
}

/** "Wed, Oct 1, 2:46 AM Japan time" — when Wander last read a source, on the trip's clock and saying so, as her
 *  Guide's read date is (round 12: a California phone showed "Wed, Sep 30, 1:55 PM" beside the Guide's "Oct 1") */
export function readWords(iso: string | null, zone = "Asia/Tokyo"): string | null {
  if (!iso) return null;
  const when = new Date(iso).toLocaleString("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${when} ${zone === "Asia/Tokyo" ? "Japan time" : zone}`;
}

/** "Oct 6" in a status line, as YYYY-MM-DD in the given year */
export function dateInText(text: string, year: number): string | null {
  const m = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\b/);
  if (!m) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1].toLowerCase()) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}

/** "Ken's rail sheet, written with AI help" */
export function sourceWords(s: Pick<OtherSource, "owner" | "name" | "authorship">): string {
  return `${s.owner}'s ${s.name.toLowerCase()}${s.authorship ? `, ${s.authorship}` : ""}`;
}

/** How far the pickup steps are ticked on this phone: steps to do only (not its "Source" rows or its notes like "If
 *  help is needed") — the same count the pickup page shows, for Home's and Now's pickup cards (delight audit) */
export function pickupProgress(sourceId: string, c: Checklist): {
  done: number; of: number;
  /** In tickets — the six JR West pickups — the one count every screen uses (delight audit: the page said "6 of 11",
   *  Home "6 of 13") */
  tickets: { done: number; of: number; next: string | null; missing: string[] };
  /** Any station step ticked: the pickup has started (the airport train is behind you) */
  started: boolean;
  /** Whether this phone ticked the pickup step for a reservation number */
  tickedFor: (resv: string) => boolean | null;
} {
  const doable = c.steps.filter((x) => !/^(source|if help is needed|not part of)/i.test(colOf(x.cols, /^step$/)));
  let ticks: Record<string, boolean> = {};
  try { ticks = JSON.parse(localStorage.getItem(`wander:checklist-ticks:${sourceId}:${c.tab}`) || "{}"); } catch { /* unreadable */ }
  const tickets = c.steps.filter((x) => /^JR West \d/i.test(colOf(x.cols, /^step$/)));
  const missing = tickets.filter((x) => !ticks[x.row]).map((x) => colOf(x.cols, /^step$/));
  return {
    done: doable.filter((x) => ticks[x.row]).length, of: doable.length,
    tickets: { done: tickets.length - missing.length, of: tickets.length, next: missing[0] || null, missing },
    started: doable.some((x) => ticks[x.row] && !/^before travel/i.test(colOf(x.cols, /^step$/))),
    tickedFor: (resv: string) => {
      const step = tickets.find((x) => new RegExp(`#\\s*${resv.replace(/[^0-9A-Za-z]/g, "")}\\b`).test(colOf(x.cols, /^what to do$/)));
      return step ? !!ticks[step.row] : null;
    },
  };
}

/**
 * Today's trains whose paper ticket this phone never ticked at an earlier pickup — on the phones of the couple who did
 * the pickup only. Each with the sheet's own words on where it can still be collected, and who else may have ticked it
 * (delight audit: the warning sat three screens down, said "before boarding" for a ticket that "cannot be collected at
 * Utsunomiya", and Ken's second phone warned about a ticket the first had ticked).
 */
export function untickedTickets(sources: OtherSource[], date: string, me: string | null | undefined,
  partyOf: (s: OtherSource) => string | null, isMine: (r: RailRow, s: OtherSource) => boolean) {
  const out: { s: OtherSource; r: RailRow; where: string[]; others: string | null }[] = [];
  if (!me) return out;
  for (const s of sources) {
    const party = partyOf(s);
    const names = (party || "").split(/\s*(?:&|and|,)\s*/i).map((n) => n.trim()).filter(Boolean);
    if (!names.some((n) => n.toLowerCase() === me.trim().toLowerCase())) continue;
    const pickup = s.checklists.find((c) => c.date && c.date < date);
    if (!pickup) continue;
    const progress = pickupProgress(s.id, pickup);
    for (const r of s.rail.filter((x) => x.date === date && isBookedTrain(x) && isMine(x, s))) {
      const resv = colOf(r.cols, /^reservation/);
      if (!resv || progress.tickedFor(resv) !== false) continue;
      const text = `${colOf(r.cols, /^ticket/)}. ${colOf(r.cols, /^notes$/)}`;
      // Where it can still be had, first ("cannot be collected at Utsunomiya", "Tokyo Station's JR East Travel Service
      // Center"); then the general pickup words
      const score = (x: string) => (/cannot|travel service|tokyo station|ticket office|before .* boarding|or\b/i.test(x) ? 0 : 1);
      const where = text.split(/(?<=[.;])\s+/).map((x) => x.trim().replace(/[;.]$/, ".")).filter((x) => x.length > 3 && /collect|pick ?up|cannot|travel service|ticket office|machine|5489/i.test(x))
        .sort((a, b) => score(a) - score(b));
      out.push({ s, r, where: where.slice(0, 2), others: names.filter((n) => n.toLowerCase() !== me.trim().toLowerCase()).join(" & ") || null });
    }
  }
  return out;
}

/** The same, to the person looking: "your rail sheet" to Ken himself (delight audit: "From Ken's rail sheet" on Ken's
 *  own phone read as Wander not knowing who he is) */
export function sourceWordsFor(s: Pick<OtherSource, "owner" | "name" | "authorship">, me: string | null | undefined): string {
  return me && s.owner.toLowerCase() === me.trim().toLowerCase() ? `your ${s.name.toLowerCase()}` : sourceWords(s);
}

/** A leg is a booked train when the sheet gives it a train and a departure (not "Local train · No") */
export const isBookedTrain = (r: RailRow) => !!colOf(r.cols, /^train$/) && /^\d{1,2}:\d{2}$/.test(colOf(r.cols, /^depart/));

/**
 * Whose a leg is, for "your next train" on Home and Now. The sheet names no one per row, so Wander goes by its seats:
 * seats for the whole group are everyone's; fewer are the sheet owner's couple (Ken's sheet, 2 seats: Ken & Larisa —
 * its Oct 14 rows say "Ken + Larisa only"). Unknown → not claimed for anyone. Every leg still shows on the day screen.
 */
export function legIsFor(r: RailRow, s: OtherSource, me: string | null | undefined, ownerParty: string | null, groupSize: number): boolean {
  if (!me) return false;
  const pax = Number(colOf(r.cols, /^pax$/));
  if (pax && groupSize && pax >= groupSize) return true;
  if (!ownerParty) return false;
  const inParty = ownerParty.split(/\s*(?:&|and|,)\s*/i).some((n) => n.trim().toLowerCase() === me.trim().toLowerCase());
  return inParty && (!pax || pax <= ownerParty.split(/\s*(?:&|and|,)\s*/i).length) && !!s;
}
