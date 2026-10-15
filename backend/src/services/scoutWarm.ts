/**
 * Keeps Scout's reading in Anthropic's cache between questions (Oct 15 2026). Ken: "I want Scout to be brilliant, and I
 * want Scout to be cheap… keep good model and better architecture please."
 *
 * Every question has Scout read its instructions, its tools, her Guide and Ken's rail sheet — about 197,000 tokens,
 * the same for everyone. Read from the cache that costs about $0.10; stored again after an hour without a question it
 * costs about $2 (Opus 5: one-hour cache writes $10/M, reads $0.50/M). Scout was storing it again 3–5 times a day, most
 * of them a question one to four hours after the last. So after each question, a one-token request every 55 minutes
 * keeps the same reading cached for the next four hours, between 7 AM and 11 PM in Japan (overnight, an hourly ping
 * costs about what the morning's one storing does). It reads nothing new and answers nothing: Scout's answers are
 * unchanged.
 *
 * The cache can miss now and then even when warm (Oct 15 test: one ping in five stored it all again, and the question
 * right after read it): one miss is carried on through; two in a row stop warming until the next question.
 */
import Anthropic from "@anthropic-ai/sdk";

// (SCOUT_WARM_EVERY_MS: a test server's shorter wait, to see a ping read the cache)
const EVERY = Number(process.env.SCOUT_WARM_EVERY_MS) || 55 * 60_000;
const FOR = 4 * 3600_000;
// (Japan's clock: the trip's people are all there now)
const awakeInJapan = () => { const h = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hour12: false })) % 24; return h >= 7 && h < 23; };

type Reading = { model: string; system: Anthropic.TextBlockParam[]; tools: Anthropic.ToolUnion[]; docs: any[] };
const kept = new Map<string, { reading: Reading; askedAt: number; timer: ReturnType<typeof setTimeout> | null }>();
let client: Anthropic | null = null;

/** After a real question: keep this trip's reading (exactly as that question sent it) cached from now on */
export function keepScoutWarm(tripId: string, reading: Reading): void {
  // (never inside the test suite's workers — the test-copy server sets VITEST for name sign-in, and warms like production)
  if (process.env.VITEST_WORKER_ID || process.env.SCOUT_WARM === "off") return;
  const was = kept.get(tripId);
  if (was?.timer) clearTimeout(was.timer);
  const entry = { reading, askedAt: Date.now(), timer: null as ReturnType<typeof setTimeout> | null, missed: 0 };
  kept.set(tripId, entry);
  const next = () => {
    entry.timer = setTimeout(async () => {
      if (kept.get(tripId) !== entry || Date.now() - entry.askedAt > FOR || !awakeInJapan()) return;
      const stored = await ping(entry.reading);
      entry.missed = stored !== null && stored > 1000 ? entry.missed + 1 : 0;
      // (SCOUT_WARM_PROBE: a test server keeps pinging through misses, to measure how often they happen)
      if (stored === null || (entry.missed >= 2 && !process.env.SCOUT_WARM_PROBE)) { console.log(`[scout-warm] stopped for trip ${tripId.slice(0, 8)}${stored ? " (two misses in a row)" : ""}`); return; }
      next();
    }, EVERY);
    entry.timer.unref?.();
  };
  next();
}

/** One request that reads the cached part and stops at once; returns how many tokens it had to store afresh */
async function ping(r: Reading): Promise<number | null> {
  try {
    client ??= new Anthropic();
    const res = await client.messages.create({
      model: r.model, max_tokens: 1, system: r.system, tools: r.tools,
      messages: [{ role: "user", content: [...r.docs, { type: "text", text: "(No question: Wander is keeping this reading ready.)" }] }],
    });
    const u: any = res.usage || {};
    const write = u.cache_creation_input_tokens || 0, read = u.cache_read_input_tokens || 0;
    const dollars = ((u.input_tokens || 0) * 5 + write * 10 + read * 0.5 + (u.output_tokens || 0) * 25) / 1e6;
    console.log(`Scout keep-warm: cacheRead=${read} cacheWrite=${write} ≈ $${dollars.toFixed(3)}`);
    return write;
  } catch (e: any) {
    console.warn(`[scout-warm] ${e?.status || ""} ${e?.message || e}`);
    return null;
  }
}
