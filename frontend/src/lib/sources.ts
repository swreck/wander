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
export interface RailDiffer { date: string; row: number; tab: string; train: string; railSays: string; guideSays: string; guideSource: string }

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
  return s.replace(/\b(1[3-9]|2[0-3]):([0-5]\d)\b(?!\s*\()/g, (m) => `${m} (${twelveHour(m)})`);
}

/** "Wed, Oct 1, 2:46 AM" — when Wander last read a source, on this phone's clock */
export function readWords(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
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
