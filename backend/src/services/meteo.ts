/**
 * Every call to Open-Meteo goes through here: at most 3 at a time, and a "busy" answer tried again after a short
 * pause. Open-Meteo refuses bursts — of 21 calls at once (Scout asked about a week: three per day), 16 came back "Too
 * many concurrent requests" (429) or "The service is overloaded" (503), and those days read as having no forecast
 * (Oct 14). Free and keyless: being polite is the price.
 */
const MAX = 3;
let running = 0;
const waiting: (() => void)[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX) await new Promise<void>((r) => waiting.push(r));
  running++;
  try { return await work(); } finally { running--; waiting.shift()?.(); }
}

/** fetch() for Open-Meteo: queued, and tried up to 3 times when it says it's busy (429, 503). Each try gets 12 s from
 *  when it starts, the whole answer read inside them — never counting the wait for its turn (on a slow morning a call
 *  took 2.8 s, and queued calls were timed out before they began), and never letting a reply that stalls after its
 *  first bytes hold a slot (verify47: a stalled body waited 90 s and more). The answer comes back already read.
 *  `signal` still stops it all, queued or not. */
export async function meteo(url: string, signal?: AbortSignal, tryMs = 12_000): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(400 * attempt + Math.random() * 300);
    if (signal?.aborted) break;
    last = await slot(async () => {
      // (given up while it waited for its turn: don't take the slot for nothing)
      if (signal?.aborted) return new Response(null, { status: 499 });
      const ctl = new AbortController();
      const stop = () => ctl.abort();
      signal?.addEventListener("abort", stop);
      const t = setTimeout(stop, tryMs);
      try {
        const r = await fetch(url, { signal: ctl.signal });
        const body = await r.text();
        return new Response(body, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json" } });
      } catch {
        // (a try that ran out of time counts as busy; one stopped from outside, as given up)
        return new Response(null, { status: signal?.aborted ? 499 : 503 });
      } finally { clearTimeout(t); signal?.removeEventListener("abort", stop); }
    });
    if (last.status !== 429 && last.status !== 503) return last;
  }
  if (last && last.status !== 499) console.warn(`[meteo] Open-Meteo busy (${last.status}) after 3 tries`);
  return last ?? new Response(null, { status: 499 });
}
