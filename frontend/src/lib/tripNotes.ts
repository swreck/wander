/**
 * Trip notes (Oct 1 2026) — each person's own words, kept exactly (backend: routes/tripNotes.ts).
 * A note is saved with the phone's own id for it, so a resend on a weak signal is the same note, never two; with no
 * signal it's kept on the phone and sent later; what's being typed is kept as a draft on the phone until it's saved.
 */
import { api } from "./api";
import { queuedBodies, whoIs, updateQueued } from "./offlineStore";

export interface TripNote {
  id: string;
  tripId: string;
  travelerId: string;
  authorName: string;
  clientId: string;
  original: string;
  text: string;
  tidied: string | null;
  tidyStatus: string | null;
  // ("scout": told to Scout, kept word for word — Oct 10)
  source: "typed" | "voice" | "evening" | "scout";
  visibility: "private" | "trip";
  storyUse: boolean | null;
  dayDate: string | null;
  city: string | null;
  createdAt: string;
  editedAt: string | null;
  mine: boolean;
  wordCount: number;
}

export interface NoteSettings { tidy: boolean; storyUse: boolean | null }

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** The phone's own id for a note: sent with it every time, so the server keeps it once */
export function newClientId(): string {
  const c = (globalThis.crypto as Crypto | undefined);
  return c?.randomUUID ? c.randomUUID().replace(/-/g, "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** `writtenAt`: when it was written on the phone — a note kept with no signal arrives later and keeps its own time */
export type SaveBody = { clientId: string; text: string; source: TripNote["source"]; visibility: TripNote["visibility"]; dayDate: string | null; city: string | null; writtenAt: string; changedAt?: string };

/** Saved (the note, read back) or kept on the phone until there's signal */
export async function saveNote(tripId: string, body: SaveBody): Promise<{ note: TripNote } | { queued: true }> {
  const res = await api.postRepeatable<{ note?: TripNote; _queued?: boolean }>(`/trip-notes/trip/${tripId}`, body, 8000);
  if (res._queued) return { queued: true };
  return { note: res.note! };
}

/** Change a note still waiting for signal (Ken, Oct 9: "I wanted to edit the last note I added and could not"). It
 *  carries when it was changed, so if its first words already reached Wander the change arrives as an edit. */
export async function changeWaitingNote(tripId: string, clientId: string, text: string): Promise<boolean> {
  const n = await updateQueued(`/api/trip-notes/trip/${tripId}`, (b) => b.clientId === clientId, (b) => ({ ...b, text, changedAt: new Date().toISOString() }));
  return n > 0;
}

/** Notes this phone is still holding for signal — this person's only (a phone can be handed to someone else) */
export async function waitingNotes(tripId: string): Promise<(SaveBody & { _at: number })[]> {
  const me = whoIs(localStorage.getItem("wander_token"));
  const q = await queuedBodies(`/api/trip-notes/trip/${tripId}`);
  return q.filter((b) => typeof b.text === "string" && typeof b.clientId === "string" && !!me && b._who === me) as unknown as (SaveBody & { _at: number })[];
}

// The phone's copy of my notes and my half-written note are kept per person as well as per trip — on a phone handed
// from Ken to Andy, Andy saw Ken's notes and Ken's draft (privacy tester, Oct 1 2026)
const person = () => whoIs(localStorage.getItem("wander_token")) || "nobody";
const copyKey = (tripId: string) => `wander:notes-copy:${tripId}:${person()}`;
export function savedCopy(tripId: string): { notes: TripNote[]; savedAt: string } | null {
  try { const raw = localStorage.getItem(copyKey(tripId)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function keepCopy(tripId: string, notes: TripNote[]) {
  try { localStorage.setItem(copyKey(tripId), JSON.stringify({ notes, savedAt: new Date().toISOString() })); } catch { /* full */ }
}

const draftKey = (tripId: string) => `wander:note-draft:${tripId}:${person()}`;
/** A half-written note, and the day it's about — a draft started Sat Oct 17 and reopened Sun Oct 18 was about to be
 *  filed under Sunday in Nikko (tester t2) */
/** `sending`: the phone's id for it once Save was tapped — if Wander closed before the server answered, the words come
 *  back in the box, and saving them again (or finding the note already kept) is the same note, never a second one
 *  (tester t4: closed mid-save on a weak signal, saved again, two notes) */
export type Draft = { text: string; day: string | null; sending?: string; spoken?: boolean; place?: string };
export function readDraft(tripId: string): Draft {
  try {
    const raw = localStorage.getItem(draftKey(tripId)) || "";
    if (!raw) return { text: "", day: null };
    try {
      const j = JSON.parse(raw);
      if (j && typeof j.text === "string") return { text: j.text, day: typeof j.day === "string" ? j.day : null, ...(typeof j.sending === "string" ? { sending: j.sending } : {}), ...(j.spoken ? { spoken: true } : {}), ...(typeof j.place === "string" ? { place: j.place } : {}) };
    } catch { /* an older plain draft */ }
    return { text: raw, day: null };
  } catch { return { text: "", day: null }; }
}
/** `spoken`: said, not typed — kept with the draft so a spoken note saved later is still tidied (tester k1);
 *  `place`: what it's about ("Kyoto", "Backroads", "Japan overall"), when chosen */
export function keepDraft(tripId: string, text: string, day: string | null = null, sending?: string, spoken?: boolean, place?: string | null) {
  try { if (text) localStorage.setItem(draftKey(tripId), JSON.stringify({ text, day, ...(sending ? { sending } : {}), ...(spoken ? { spoken } : {}), ...(place ? { place } : {}) })); else localStorage.removeItem(draftKey(tripId)); } catch { /* full */ }
}

/** What a note is about: one of the trip's places, the Backroads week, or the trip as a whole (Ken, Oct 2). A note
 *  saved before places existed, with no day, is about Japan overall. */
export const JAPAN_OVERALL = "Japan overall";
export const BACKROADS = "Backroads";
export const placeOf = (n: { city: string | null }) => n.city || JAPAN_OVERALL;

/** How this phone shows the notes: whose, and in what order (kept on the phone) */
export type NotesView = { whose: "all" | "mine" | "others"; order: "newest" | "trip" };
const viewKey = () => `wander:notes-view:${person()}`;
export function readView(): NotesView {
  try {
    const j = JSON.parse(localStorage.getItem(viewKey()) || "{}");
    return { whose: ["all", "mine", "others"].includes(j.whose) ? j.whose : "all", order: j.order === "trip" ? "trip" : "newest" };
  } catch { return { whose: "all", order: "newest" }; }
}
export function keepView(v: NotesView) { try { localStorage.setItem(viewKey(), JSON.stringify(v)); } catch { /* private mode */ } }

/** Every word of my notes, as text (for "Export all my notes") */
export async function exportText(tripId: string): Promise<string> {
  const token = localStorage.getItem("wander_token");
  const res = await fetch(`/api/trip-notes/trip/${tripId}/export`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.text();
}

/** Today's date on the trip's clock, "2026-10-14" */
export function tripToday(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export const dayWords = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Hand a note's words to the phone's share sheet (Messages, Mail…); with no share sheet, copy them */
export async function sendCopy(words: string, title: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  try {
    if (navigator.share) { await navigator.share({ title, text: words }); return "shared"; }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return "cancelled";
  }
  try { await navigator.clipboard.writeText(words); return "copied"; } catch { return "failed"; }
}
