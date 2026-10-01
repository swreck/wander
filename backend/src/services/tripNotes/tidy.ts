/**
 * "Tidy my dictation" (Oct 1 2026, Ken — like Wispr Flow): fix what dictation clearly misheard ("adoring" → "durable"),
 * add punctuation, drop filler. Never rephrase, shorten, summarize or add. The tidied copy is kept beside the original,
 * never instead of it, and is thrown away (the original stands) when it doesn't keep the writer's words: Ken once had a
 * notes tool keep only "themes" of what he said.
 */
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const FILLER = new Set(["um", "uh", "uhm", "erm", "er", "ah", "hmm", "mm"]);
const wordsOf = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9']+/).filter(Boolean);

/** Whether a tidied copy kept the writer's words: nearly every non-filler word still there, about the same length */
export function keepsTheWords(original: string, tidied: string): boolean {
  const before = wordsOf(original).filter((w) => !FILLER.has(w));
  const after = wordsOf(tidied);
  if (!before.length) return false;
  if (after.length < before.length * 0.8 || after.length > before.length * 1.15 + 3) return false;
  const pool = new Map<string, number>();
  for (const w of after) pool.set(w, (pool.get(w) || 0) + 1);
  let kept = 0;
  for (const w of before) { const n = pool.get(w) || 0; if (n > 0) { kept++; pool.set(w, n - 1); } }
  // (a short note with one misheard word fixed is still the writer's: two changed words, or 15% of a longer one)
  return before.length - kept <= Math.max(2, Math.ceil(before.length * 0.15));
}

export async function tidyDictation(text: string): Promise<{ tidied: string | null; status: "done" | "kept-original" | "failed" }> {
  try {
    const r = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: Math.min(8000, Math.ceil(text.length / 2) + 200),
      temperature: 0,
      system: "You clean up dictated travel notes. Fix only words that speech recognition clearly misheard, punctuation, " +
        "capitalization and filler sounds (um, uh). Keep every other word exactly as the person said it — never rephrase, " +
        "summarize, shorten, reorder, add, or change the meaning, tone or opinions. If you're unsure whether a word was " +
        "misheard, keep it. Reply with the cleaned text only — no preface, no quotes, no notes.",
      messages: [{ role: "user", content: text }],
    });
    const out = r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
    if (!out || out === text.trim()) return { tidied: null, status: "kept-original" };
    return keepsTheWords(text, out) ? { tidied: out, status: "done" } : { tidied: null, status: "kept-original" };
  } catch {
    return { tidied: null, status: "failed" };
  }
}
