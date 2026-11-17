/**
 * Samples on the phone (December plan S2c, Nov 17 2026): what only Ken sees, drawn grey and italic and marked, so he can
 * judge how a full trip will look. This is the ONE file that asks the server for them (GET /api/samples/:tripId).
 *
 *  - They are held in memory only, per person and trip: nothing here writes them to the phone's storage or to any copy a
 *    screen keeps. The service worker never keeps the route (sw.ts), and forgetSamples() empties the memory when
 *    someone signs out or another person signs in.
 *  - mergeSamples / sampleFor are called only where a list is DRAWN, after every copy a screen keeps is made, and never
 *    upstream of outgoing text, Next, the now-line, Play the day, a count, a total or a search.
 *  - Every string of a sample keeps its marker (U+2063 U+2063, invisible), so a leak is findable. `time` is the one
 *    exception: the marker is stripped before the time is read.
 *  - noSampleText is the last wall for words: every sender of text off the phone passes its text through it.
 */
import { api, signedInToken } from "./api";

export const SAMPLE_MARKER = "⁣⁣";
export type SampleKind = "line" | "summary" | "maybe" | "note" | "expense" | "trip_photo" | "unconfirmed";
export interface Sample { id: string; kind: SampleKind; date: string | null; slot: string; data: Record<string, unknown> }
/** A sample as a list holds it among real rows */
export type SampleItem = Sample & { sample: true };

const memory = new Map<string, Promise<Sample[]>>();
const keyOf = (tripId: string) => `${signedInToken() || ""}|${tripId}`;

/** This person's samples for the trip, asked for once and kept in memory. [] when offline, refused, or on any error. */
export function loadSamples(tripId: string): Promise<Sample[]> {
  if (!tripId) return Promise.resolve([]);
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve([]);
  const key = keyOf(tripId);
  const kept = memory.get(key);
  if (kept) return kept;
  // (with a header, api.get asks afresh instead of sharing a read from a moment ago: after forgetSamples() the next ask is real)
  const asked = api.get<Sample[]>(`/samples/${tripId}`, { "Cache-Control": "no-store" })
    .then((rows) => (Array.isArray(rows) ? rows.filter((r) => r && typeof r.id === "string" && r.id.startsWith("sample:") && r.data && typeof r.data === "object") : []))
    .catch(() => { memory.delete(key); return [] as Sample[]; });
  memory.set(key, asked);
  return asked;
}

/** Empties the memory: sign-out, or another person signing in */
export function forgetSamples(): void { memory.clear(); }

/** The rows of a list with the samples of one kind added after them (for one day, or for one city's plan key). The SAME
 *  array comes back when there is nothing to add, so no screen redraws differently. `rows` is never changed. */
export function mergeSamples<T>(kind: SampleKind, rows: T[], samples: Sample[], where: { date?: string; cityKey?: string } = {}): (T | SampleItem)[] {
  const mine = samples.filter((s) => s.kind === kind
    && (where.date === undefined || s.date === where.date)
    && (where.cityKey === undefined || s.slot.split("|")[0] === where.cityKey));
  if (!mine.length) return rows;
  return [...rows, ...mine.map((s): SampleItem => ({ ...s, sample: true }))];
}

/** The one sample of a kind for a date (a day's summary, a day's photo), or null */
export function sampleFor(kind: SampleKind, date: string, samples: Sample[]): SampleItem | null {
  const s = samples.find((x) => x.kind === kind && x.date === date);
  return s ? { ...s, sample: true } : null;
}

export const isSample = (x: unknown): x is SampleItem => !!x && typeof x === "object" && (x as { sample?: unknown }).sample === true;

/** A sample's text without its marker (for reading a time: "10:30" + marker) */
export const withoutMarker = (s: unknown): string => (typeof s === "string" ? s.split(SAMPLE_MARKER).join("") : "");

/** The text itself, or null when it holds a sample's marker: nothing is sent, shared or copied then */
export function noSampleText(text: string): string | null {
  return text.includes(SAMPLE_MARKER) ? null : text;
}
