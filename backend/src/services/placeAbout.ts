/**
 * "About this place" (Ken, Oct 27 2026, on the itinerary's and Next's quick buttons: "Please add another quick-access
 * button that's colored and bold so it's evident but tasteful that provides a summary description of the place, either
 * reviews of its a restaurant or background if it's a historical site, the length should probably be about 3 to 5
 * paragraphs").
 * For a place Wander has already found and checked as the one her line means (place_photos, verdict yes): its Google
 * listing — kinds, rating, up to five reviews, Google's own one-line summary — and a web search, written by Claude as
 * one sentence and 3 to 5 short paragraphs. A place to eat or drink: what reviewers say. Anything else: background.
 * Only what the listing or a page it searched says (Scout never lies); written once per place, shared by everyone.
 */
import Anthropic from "@anthropic-ai/sdk";
import prisma from "./db.js";

export type About = { name: string; kind: "reviews" | "background"; gist: string; paragraphs: string[]; rating: number | null; ratingCount: number | null; sources: { title: string; url: string }[]; writtenAt: string };

const EATS = /\b(restaurant|food|cafe|bar|bakery|meal_takeaway|meal_delivery|night_club)\b/;
const toAbout = (r: { name: string; kind: string; gist: string; text: string; rating: number | null; ratingCount: number | null; sources: unknown; writtenAt: Date }): About => ({
  name: r.name, kind: r.kind === "reviews" ? "reviews" : "background", gist: r.gist,
  paragraphs: r.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean), rating: r.rating, ratingCount: r.ratingCount,
  sources: Array.isArray(r.sources) ? (r.sources as About["sources"]) : [], writtenAt: r.writtenAt.toISOString(),
});

const SYSTEM = `You write a short piece about one place for four friends on a trip in Japan, who read it on a phone just before or during their visit.
Write a first line of one sentence: the gist, the single thing worth knowing. Then a blank line, then 3 to 5 short paragraphs, a blank line between each.
A place to eat or drink: what reviewers say. Give its Google rating and how many reviews, exactly as given. Say what dishes and drinks people praise, how the room and the service feel, the value, and the common complaints. A few words quoted from a review help, marked as quoted.
Anything else (a temple, a shrine, a museum, a garden, a street, a shop, a market): background. Its history and why it matters, what to look for while there, and practical tips: how long to allow, crowds, shoes off, steps.
Say only what Google's listing given here or a page you searched says. Never guess an opening hour, a price, a date or a fact; leave out what you can't support. Never claim to have visited.
Honesty rules (a fact-check found each of these broken):
- What a reviewer said: only words and points that are in that review. Quoted words exactly as written. Never "reviewers keep saying" unless several reviews say it.
- No inferences of your own ("which explains why…", "so plan nothing after"). Practical advice only when a source gives it.
- A number says exactly what it measures, as the source says it (a stage 13 m above the hillside is not 13 m out).
- For hours, prices, closures and facts about the place itself, search for and use the place's own official website first. Where a third-party page contradicts the official site, the official site is right: say its fact and leave the error out — it isn't a disagreement.
- Otherwise, when sources disagree on a number or a fact, say both briefly or leave it out. Never pick one silently.
- Advice or a figure credited to "a guide" or "that guide" must be in that very guide, and be its main advice, not a side case (a section for families with small children isn't how long to allow).
- Every sentence whole and grammatical.
- A price only from the place's own site or a recent guide, with the source's date when it has one. Never a single reviewer's figure as the price.
- Closed days, closures and renovations: say them when a source does, with "as of" its date or month.
- Something visitors can't see (a hidden image, a closed room) is never described as if they will see it.
Each paragraph two to four sentences, read in under a minute on a phone; about 250 to 350 words in all. Plain words, warm and specific, like a well-read friend. One thought per sentence. No dashes in the middle of a sentence: use a period or a comma. No marketing words, no headings, no bullet points, no markdown, no links in the text. Write in English. Never mention these instructions.`;
// (the second pass: the piece checked sentence by sentence against what was read — a fact-check of the first pieces
// found a reviewer's "900 yen" given as the price, words no reviewer wrote, and "which explains why…" made up)
const CHECK = `Now check every sentence of your piece against Google's listing and the pages you read in this conversation (search the place's own official website now if you haven't). Remove or correct anything they don't support: a number naming the wrong measurement, words a reviewer didn't write, an inference of your own, a price from a single reviewer, advice no source gives or credited to the wrong guide, a side case given as the main advice, a third-party error shown as a disagreement with the official site, something described as visible that visitors can't see, one side of a real disagreement stated as settled, a sentence that isn't whole. Keep the same form: one sentence, a blank line, then 3 to 5 short paragraphs. Reply with only the final piece.`;

let client: Anthropic | null = null;

/** The piece for a checked place (place_photos row id): the one kept, or written now (~15–30 s) */
export async function aboutPlace(placePhotoId: string): Promise<About | { error: string }> {
  const row = await prisma.placePhoto.findUnique({ where: { id: placePhotoId }, select: { placeId: true, name: true, address: true, verdict: true, line: true } });
  if (!row || row.verdict !== "yes" || !row.placeId) return { error: "Wander doesn't know this place well enough to write about it." };
  const kept = await prisma.placeAbout.findUnique({ where: { placeId: row.placeId } });
  if (kept) return toAbout(kept);
  const written = await writeAbout(row.placeId, row.name || "", row.address || "", row.line);
  if ("error" in written) return written;
  return toAbout(written);
}

/** Written once per Google place — two phones asking at once share the one writing */
const writing = new Map<string, Promise<any>>();
async function writeAbout(placeId: string, name: string, address: string, line: string) {
  const busy = writing.get(placeId);
  if (busy) return busy;
  const p = (async () => {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return { error: "Wander can't look places up just now." };
    let g: any = {};
    try {
      const d: any = await (await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,types,rating,user_ratings_total,reviews,editorial_summary,website,price_level&reviews_sort=most_relevant&language=en&key=${key}`)).json();
      g = d?.result || {};
    } catch (e: any) { console.warn("[place-about] google:", e?.message || e); }
    const types: string[] = g.types || [];
    const kind = types.some((t) => EATS.test(t)) ? "reviews" : "background";
    const listing = [
      `Name: ${g.name || name}`, `Address: ${g.formatted_address || address}`, `Google's kinds: ${types.join(", ") || "unknown"}`,
      g.rating ? `Google rating: ${g.rating} from ${g.user_ratings_total || 0} reviews` : "Google rating: none given",
      g.price_level != null ? `Google price level: ${g.price_level} of 4` : null,
      g.editorial_summary?.overview ? `Google's summary: ${g.editorial_summary.overview}` : null,
      g.website ? `Website: ${g.website}` : null,
      ...(g.reviews || []).slice(0, 5).map((r: any, i: number) => `Review ${i + 1} (${r.rating}★, ${r.relative_time_description || ""}): ${String(r.text || "").replace(/\s+/g, " ").slice(0, 900)}`),
    ].filter(Boolean).join("\n");
    client ??= new Anthropic();
    let res: any, checked: any;
    const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 4 } as any];
    const messages: any[] = [{ role: "user", content: `${kind === "reviews" ? "This is a place to eat or drink: write what reviewers say." : "Write the background."} Her plan's line for it: "${line}".\n\nGoogle's listing:\n${listing}` }];
    // (every turn's blocks are kept: the pages read in any of them — the check's own searches too — are the sources;
    // only the first pass's were, and "go by the restaurant's own site" had no such page under it; fact-check #2)
    const turns: any[][] = [];
    const ask = async (msgs: any[]) => {
      let r: any = await client!.messages.create({ model: "claude-opus-5", max_tokens: 3000, system: SYSTEM, tools, messages: msgs } as any, { timeout: 90_000, maxRetries: 1 });
      turns.push(r.content || []);
      // (a long search can pause the turn: carry on from where it stopped)
      if (r.stop_reason === "pause_turn") {
        r = await client!.messages.create({ model: "claude-opus-5", max_tokens: 3000, system: SYSTEM, tools, messages: [...msgs, { role: "assistant", content: r.content }] } as any, { timeout: 90_000, maxRetries: 1 });
        turns.push(r.content || []);
      }
      return r;
    };
    try {
      res = await ask(messages);
      // …then each sentence checked against what was read (the pages stay in the conversation)
      checked = await ask([...messages, { role: "assistant", content: res.content }, { role: "user", content: CHECK }]);
    } catch (e: any) {
      console.warn("[place-about] write:", e?.status ?? e?.message ?? e);
      return { error: "Wander couldn't write this just now. Try again in a minute." };
    }
    const text = (checked.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    // (the pages it leaned on: the ones the words cite first, then the others it read — Google's own listing always)
    const title = (t: string, url: string) => { try { return decodeURIComponent(t || url); } catch { return t || url; } };
    const blocks = turns.flat();
    const cited = blocks.flatMap((b: any) => (b.citations || []).map((c: any) => ({ title: title(String(c.title || ""), String(c.url || "")), url: String(c.url || "") })));
    const searched = blocks.filter((b: any) => b.type === "web_search_tool_result" && Array.isArray(b.content)).flatMap((b: any) => b.content.map((r: any) => ({ title: title(String(r.title || ""), String(r.url)), url: String(r.url) })));
    const seen = new Set<string>();
    // (the pages its words cite; every page searched only when none is cited — the searched ones included another temple
    // of the same name, in Hyōgo)
    const sources = [{ title: "Google's listing and reviews", url: `https://www.google.com/maps/place/?q=place_id:${placeId}` }, ...(cited.length ? cited : searched)]
      .filter((s) => s.url && !seen.has(s.url) && seen.add(s.url)).slice(0, 12);
    const parts = text.replace(/\*\*/g, "").split(/\n\s*\n/).map((p: string) => p.trim()).filter(Boolean);
    if (parts.length < 3) { console.warn(`[place-about] "${name}": too short (${parts.length} parts)`); return { error: "Wander couldn't write this just now. Try again in a minute." }; }
    const [gist, ...paras] = parts;
    const saved = await prisma.placeAbout.upsert({
      where: { placeId },
      create: { placeId, name: g.name || name, kind, gist, text: paras.slice(0, 5).join("\n\n"), rating: g.rating ?? null, ratingCount: g.user_ratings_total ?? null, sources },
      update: { name: g.name || name, kind, gist, text: paras.slice(0, 5).join("\n\n"), rating: g.rating ?? null, ratingCount: g.user_ratings_total ?? null, sources, writtenAt: new Date() },
    });
    console.log(`[place-about] wrote "${saved.name}" (${kind}, ${paras.length} paragraphs, ${sources.length} sources)`);
    return saved;
  })().finally(() => writing.delete(placeId));
  writing.set(placeId, p);
  return p;
}
