/**
 * When Wander offers "Tell Ken" (Oct 14 2026). Ken: "It cannot be a nuisance, and it should be very easy, and it
 * probably needs to occasionally remind them during the next week" and "perhaps even signals based on them seemingly
 * clicking around and not getting value and treating that as a trigger to offer."
 *
 * 1. A quiet line inside Scout, only when they open Scout themselves: the first day, two days later, three days after
 *    that — three days at most — and never again once they've sent Ken one.
 * 2. Signs someone isn't getting what they came for, worked out ON THIS PHONE and never sent or kept anywhere. The offer
 *    needs two different kinds of sign (screen-hopping alone is showing a friend around — verify60), and comes at most
 *    once a day, never once they've sent Ken one.
 * Never for Ken himself (the trip's organizer — he reads these). Not knowing yet whether someone is the organizer
 * means nothing is shown.
 */
import { api } from "./api";

const KEY = "wander:tell-ken";
type State = { shown?: string[]; closed?: string[]; sent?: boolean; offered?: string; organizer?: boolean };
const read = (): State => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const write = (s: State) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window */ } };
// (days on Japan's clock, as the trip is lived)
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** Is this person the trip's organizer? true / false once the server has said so (remembered); null while it can't
 *  be told — no signal, a slow server — and then nothing is shown (verify60: one failed check made Ken a traveler) */
export async function amOrganizer(): Promise<boolean | null> {
  const s = read();
  if (typeof s.organizer === "boolean") return s.organizer;
  let tripId: string | null = null; try { tripId = localStorage.getItem("wander:last-trip-id"); } catch { /* none */ }
  if (!tripId) tripId = await api.get<{ id?: string }>("/trips/active").then((t) => t?.id || null).catch(() => null);
  if (!tripId) return null;
  const answer = await api.get(`/tell-ken/trip/${tripId}`).then(() => true).catch((e: { status?: number }) => (e?.status === 403 ? false : null));
  if (answer !== null) write({ ...read(), organizer: answer });
  return answer;
}

/** The line inside Scout: due now? The first day they open Scout, then two days after, then three days after that —
 *  three days in all — and it stays that day until they close it. Never after they've sent Ken one. */
export function tipDue(): boolean {
  const s = read();
  if (s.sent || s.organizer !== false) return false;
  const t = today(), shown = s.shown || [];
  if ((s.closed || []).includes(t)) return false;
  if (shown.includes(t)) return true;
  const gap = shown.length ? daysBetween(shown[shown.length - 1], t) : 0;
  return shown.length === 0 || (shown.length === 1 && gap >= 2) || (shown.length === 2 && gap >= 3);
}
/** It was shown today (counted once per day) */
export function tipShown() { const s = read(); const t = today(); if (!(s.shown || []).includes(t)) write({ ...s, shown: [...(s.shown || []), t] }); }
/** They closed it: not again today */
export function tipClosed() { const s = read(); write({ ...s, closed: [...new Set([...(s.closed || []), today()])] }); }
/** They sent Ken one: no more reminders or offers */
export function sentToKen() { write({ ...read(), sent: true }); }
export function hasSentToKen() { return !!read().sent; }
/** May the offer show now? (and, once it has, not again today) */
export function offerAllowed() { const s = read(); return s.organizer === false && !s.sent && s.offered !== today(); }
export function offerShown() { write({ ...read(), offered: today() }); }

// ── Signs of struggle, on this phone only ──────────────────────────────────────────────────────────────────────
type Kind = "hop" | "scout" | "deadTap" | "help";
type Sign = { at: number; w: number; kind: Kind };
let signs: Sign[] = [];
let lastPath = "";
let lastPathAt = 0;
let lastAnswerAt = 0;
const startedAt = Date.now();
// (5, from two kinds or more: quick screens + Scout opened and shut with nothing asked is a person hunting; quick
// screens alone are showing a friend around — verify60's seven sessions: both lost ones offered, five ordinary ones not)
const WINDOW = 3 * 60_000, ENOUGH = 5;

function note(w: number, kind: Kind) {
  const now = Date.now();
  signs = [...signs.filter((x) => now - x.at < WINDOW), { at: now, w, kind }];
  // (screen-hopping counts for at most 3 of the 6)
  const hops = Math.min(3, signs.filter((x) => x.kind === "hop").reduce((n, x) => n + x.w, 0));
  const rest = signs.filter((x) => x.kind !== "hop").reduce((n, x) => n + x.w, 0);
  const kinds = new Set(signs.map((x) => x.kind)).size;
  // (not in the first half minute — opening an app is looking around)
  if (hops + rest >= ENOUGH && kinds >= 2 && now - startedAt > 30_000) {
    signs = [];
    window.dispatchEvent(new CustomEvent("wander:tell-ken-offer"));
  }
}
/** A new screen: leaving one after under 6 seconds counts */
export function screenChanged(path: string) {
  const now = Date.now();
  if (lastPath && path !== lastPath && now - lastPathAt < 6_000) note(1, "hop");
  if (/^\/guide/.test(path)) note(2, "help");   // (the help: they're looking for how something works)
  lastPath = path; lastPathAt = now;
}
/** Scout answered (the phone heard it): closing Scout soon after is reading, not giving up */
export function scoutAnswered() { lastAnswerAt = Date.now(); }
/** Scout opened and closed with nothing asked — unless an answer came in the last two minutes (verify60: closing it
 *  while an answer comes and reopening to read it counted every time) */
export function scoutClosedUnasked() { if (Date.now() - lastAnswerAt > 120_000) note(2, "scout"); }
/** A tap on something that isn't a button, link or box (twice in a row counts) */
let lastDeadTap = 0;
export function startWatchingTaps() {
  const onTap = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t || t.closest("a, button, input, textarea, select, label, summary, [role='button'], [role='link'], [role='tab'], [onclick], [contenteditable='true']")) return;
    if (window.getSelection()?.toString()) return;   // (selecting words to copy isn't a dead tap)
    const now = Date.now();
    if (now - lastDeadTap < 8_000) note(1, "deadTap");
    lastDeadTap = now;
  };
  document.addEventListener("click", onTap, true);
  return () => document.removeEventListener("click", onTap, true);
}
