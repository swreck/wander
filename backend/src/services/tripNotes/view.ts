/**
 * What one person may see of a trip note — the one rule the Notes screens, search and Scout all use.
 *   The writer: all of it (the words now, the words as first saved, a tidied copy).
 *   Anyone else (only ever a note shared with the trip): its words as they read now, and nothing behind them — not the
 *   words as first saved, not a dictation before tidying, not the phone's id for it.
 * (Oct 1 2026, privacy tester: words Ken had taken out of a shared note stayed readable to Andy through "Show the words
 * as first saved", search, and Scout.)
 */
import type { TripNote } from "@prisma/client";

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** The words a person sees when the note isn't theirs */
export const sharedWords = (n: Pick<TripNote, "text" | "tidied">) => n.tidied || n.text;

export function noteFor(n: TripNote, me: string) {
  if (n.travelerId === me) return { ...n, mine: true, wordCount: wordCount(n.text) };
  const words = sharedWords(n);
  return {
    id: n.id, tripId: n.tripId, travelerId: n.travelerId, authorName: n.authorName,
    text: words, original: words, tidied: null, tidyStatus: null,
    source: n.source, visibility: n.visibility, dayDate: n.dayDate, city: n.city,
    createdAt: n.createdAt, updatedAt: n.updatedAt, editedAt: null,
    mine: false, wordCount: wordCount(words),
  };
}

/** Does a search find this note, for this person? (theirs: any of its words; someone else's: only what they can see) */
export function noteMatches(n: TripNote, me: string, q: string) {
  const want = q.toLowerCase();
  const seen = n.travelerId === me ? [n.text, n.original, n.tidied || ""] : [sharedWords(n)];
  return seen.some((w) => w.toLowerCase().includes(want));
}
