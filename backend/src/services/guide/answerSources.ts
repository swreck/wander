/**
 * An answer's sources, from the citations Scout wrote as it answered (Anthropic citations: each cited piece
 * of the answer points at lines of the Guide document or at a web page). Every pointer resolves to the
 * source recorded with that line when the line was written (sources.ts) — nothing is matched up afterwards,
 * except an exact quote of her words Scout left uncited, which is labelled as Wander's match (quotedLine).
 * Parts of the answer with no citation are Scout's own words, and are listed as that. (Ken, Sep 30 2026.)
 */
import type { ContextLine, SourceView } from "./sources.js";

export interface Claim {
  said: string;              // the part of Scout's answer, as shown
  sources: SourceView[];
  // A time in what Scout said that isn't in the words it cited: Scout worked it out, or got it wrong —
  // shown as that, never vouched for
  unmatchedTimes?: string[];
  // Scout quoted these words without citing them; Wander found the one line holding them, word for word (quotedLine)
  matched?: boolean;
}

export interface AnswerSources {
  copy: string | null;       // which copy of her Guide ("Japan Oct 2026-2")
  claims: Claim[];
  ownWords: string[];        // parts with no source: Scout's own words or reasoning
}

/** A document sent to Scout with citations on: its title and the lines behind its blocks, in order */
export interface CitedDocument { title: string; lines: ContextLine[] }

/** A piece of Scout's answer with the citations the API attached to it */
export interface AnswerPiece { text: string; citations: any[] }

/**
 * The text pieces of one step of Scout's answer, grouped: pieces side by side (split only where a citation
 * starts or ends) join as written; a tool call between them starts a new group. A piece can end one sentence
 * and the next start another with no space between ("…Sakyo-ku, Kyoto.Her day plan…", seen Sep 30), so the
 * group joins its pieces with the same spacing rule as answer steps (chat.ts joinAnswerPieces): a space only
 * after a finished sentence, before a capital.
 */
export function piecesOfStep(content: any[]): { groups: string[]; pieces: AnswerPiece[] } {
  const groups: string[] = [];
  const pieces: AnswerPiece[] = [];
  let current: string | null = null;
  for (const b of content) {
    if (b?.type === "text") {
      const t = b.text || "";
      current = current === null ? t : current + (/[.!?]\**$/.test(current) && /^[A-Z*]/.test(t) ? " " : "") + t;
      pieces.push({ text: b.text || "", citations: Array.isArray(b.citations) ? b.citations : [] });
    } else if (current !== null) {
      groups.push(current);
      current = null;
    }
  }
  if (current !== null) groups.push(current);
  return { groups, pieces };
}

/** The line(s) a citation points at, as the sources recorded with them; a web citation as its page */
export function resolveCitation(c: any, docs: CitedDocument[], fetched: { url: string; title: string }[] = []): SourceView[] {
  if (!c || typeof c !== "object") return [];
  if (c.type === "web_search_result_location" && c.url) {
    return [{ type: "web", title: c.title || c.url, url: c.url, quote: c.cited_text || "" }];
  }
  const doc = docs.find((d) => d.title === c.document_title);
  if (doc && c.type === "content_block_location") {
    const from = Math.max(0, Number(c.start_block_index) || 0);
    const to = Math.min(doc.lines.length, Number(c.end_block_index) || from + 1);
    return doc.lines.slice(from, Math.max(to, from + 1)).map((l) => l.src).filter((s): s is SourceView => !!s);
  }
  // A page Scout fetched and cited (its citations name the page by title)
  const page = fetched.find((p) => p.title && p.title === c.document_title);
  if (page) return [{ type: "web", title: page.title, url: page.url, quote: c.cited_text || "" }];
  return [];
}

// Times as minutes after midnight. "6:30 PM", "6:30p", "6 PM" are exact; a bare "18:30" is exact; a bare
// "6:30" could be morning or evening, so it stands for both.
const TIME = /\b(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?\s*m?\.?(?![a-z])|\b(\d{1,2}):([0-5]\d)\b/gi;
export function minutesIn(text: string): { said: string; minutes: number[] }[] {
  const out: { said: string; minutes: number[] }[] = [];
  for (const m of text.matchAll(TIME)) {
    if (m[3]) {
      const h = Number(m[1]);
      if (h < 1 || h > 12) continue;
      out.push({ said: m[0].trim(), minutes: [((h % 12) + (/p/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2] || 0)] });
    } else {
      const h = Number(m[4]);
      const min = Number(m[5]);
      if (h > 23) continue;
      out.push({ said: m[0].trim(), minutes: h >= 13 || h === 0 ? [h * 60 + min] : [h * 60 + min, ((h % 12) + 12) * 60 + min] });
    }
  }
  return out;
}

/** Times in what Scout said that aren't in the words it cited */
export function timesNotInSources(said: string, citedTexts: string[]): string[] {
  const inSources = new Set(citedTexts.flatMap((t) => minutesIn(t).flatMap((x) => x.minutes)));
  return minutesIn(said).filter((t) => !t.minutes.some((m) => inSources.has(m))).map((t) => t.said);
}

// A long cell (a pasted email, a whole day's narrative) is shown by its lines that bear on what Scout said —
// her words, picked by the words they share with the sentence, and marked as part of the cell
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]{2,}/gu;
const STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "your", "you", "are", "her", "his", "our", "its", "into", "then", "there", "they", "what", "when", "where", "which", "will", "about", "after", "before", "has", "have", "can", "not", "but", "all"]);
export function excerptFor(text: string, said: string, max = 400): { text: string; part: boolean } {
  if (text.length <= 300) return { text, part: false };
  const want = new Set((said.toLowerCase().match(WORD) || []).filter((w) => !STOP.has(w)));
  let lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) lines = text.split(/(?<=[.!?])\s+/).map((l) => l.trim()).filter(Boolean);
  const scored = lines
    .map((l, i) => ({ l, i, score: new Set((l.toLowerCase().match(WORD) || []).filter((w) => want.has(w))).size }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 3)
    .sort((a, b) => a.i - b.i);
  const picked = (scored.length ? scored.map((x) => x.l) : lines.slice(0, 1)).join("\n");
  return { text: picked.length > max ? `${picked.slice(0, max).trimEnd()}…` : picked, part: true };
}
function trimmed(s: SourceView, said: string): SourceView {
  const cut = (cells: any[]) => cells.map((c) => (c.kind === "cell" && c.text.length > 300 ? { ...c, ...excerptFor(c.text, said) } : c));
  if (s.type === "guide" || s.type === "sheet") return { ...s, cells: cut(s.cells) };
  if (s.type === "wander") return { ...s, from: s.from.map((f) => ({ ...f, cells: cut(f.cells) })) };
  return s;
}

/** What's left of a piece once formatting is gone — "**Dinner:**" alone isn't a claim */
const plain = (s: string) => s.replace(/\*\*|__|`|^#+\s*/gm, "").replace(/\s+/g, " ").trim().replace(/^[.,;:)\]—–-]+\s*/, "");

/**
 * The answer's sources: each cited piece with what it cites (in the order said, the same source listed
 * once per piece), and the parts with no citation as Scout's own words. Only pieces that are still in the
 * answer as shown count (narration and an unasked draft are taken out before it's shown).
 */
export function answerSources(shown: string, pieces: AnswerPiece[], docs: CitedDocument[], copy: string | null,
  fetched: { url: string; title: string }[] = []): AnswerSources {
  const claims: Claim[] = [];
  const ownWords: string[] = [];
  const seen = new Set<string>();
  const spaced = (s: string) => s.replace(/\s+/g, " ").trim();
  const shownFlat = spaced(shown);
  for (const p of pieces) {
    const said = plain(p.text);
    if (!said || !shownFlat.includes(spaced(p.text))) continue;
    if (p.citations.length) {
      const sources: SourceView[] = [];
      for (const c of p.citations) {
        for (const whole of resolveCitation(c, docs, fetched)) {
          const s = trimmed(whole, said);
          const key = JSON.stringify(s);
          if (!sources.some((x) => JSON.stringify(x) === key)) sources.push(s);
        }
      }
      if (sources.length) {
        const unmatched = timesNotInSources(said, p.citations.map((c: any) => String(c.cited_text || "")));
        claims.push({ said, sources, ...(unmatched.length ? { unmatchedTimes: unmatched } : {}) });
      }
    }
  }
  // Scout's own words: whole sentences of the answer with no sourced part in them — what it concluded or
  // added itself. (The words between two sourced parts of one sentence are just grammar: "…land at Narita
  // on", listed alone, read as nonsense.) An unasked draft or its Send line is never part of it.
  const sourced = claims.map((c) => c.said).filter((s) => s.length >= 6);
  const sentences = shown
    .replace(/^\s*\**Message for [\s\S]*$/m, "")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z"“*(])/))
    .map(plain)
    .filter(Boolean);
  // "That's from Larisa's Guide." says where, not what — the list below says where better
  const ATTRIBUTION = /^(that's|that is|this is|all of (that|this) is|both are|it's)\s+(all\s+)?(from|in|straight from)\s+((larisa's|her)\s+guide|(ken's|the|your)\s+rail sheet)\.?$/i;
  for (const s of sentences) {
    if (s.split(/\s+/).length < 4 || !/[a-z]/i.test(s) || seen.has(s) || ATTRIBUTION.test(s)) continue;
    const touches = sourced.some((c) => s.includes(c) || c.includes(s) || s.includes(c.slice(0, 20)) || s.includes(c.slice(-20)));
    if (!touches) {
      seen.add(s);
      const found = quotedLine(s, docs);
      if (found) claims.push({ said: s, sources: [trimmed(found, s)], matched: true });
      else ownWords.push(s);
    }
  }
  return { copy, claims, ownWords };
}

/**
 * A sentence Scout left uncited that quotes her words exactly — "08:00 · Depart Four Seasons by private van" — and the
 * one line of the documents holding those words, word for word (round 15: asked where something is in her sheet,
 * Scout quoted the right line but didn't point to it, so Sources couldn't open the spot). Only an exact quote of 15+
 * characters found in lines that all share one source; anything less stays Scout's own words. Shown as matched by
 * Wander, never as Scout's citation.
 */
export function quotedLine(sentence: string, docs: CitedDocument[]): SourceView | null {
  const flat = (t: string) => t.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  for (const m of sentence.matchAll(/(?:^|[\s:(\[—-])[“"]([^”"\n]{15,}?)[”"](?=[\s.,;:)\]—-]|$)/g)) {
    const q = flat(m[1]);
    const lines = docs.flatMap((d) => d.lines).filter((l) => l.src && flat(l.text).includes(q));
    const kinds = new Set(lines.map((l) => JSON.stringify(l.src)));
    if (lines.length && kinds.size === 1) return lines[0].src!;
  }
  return null;
}
