/**
 * "About this place" (Ken, Oct 27: a quick button on each line, "a summary description of the place, either reviews of
 * its a restaurant or background if it's a historical site… about 3 to 5 paragraphs"). Backend: services/placeAbout.ts.
 * Kept on the phone once read, so it opens at once again — and with no signal.
 */
export type About = { name: string; kind: "reviews" | "background"; gist: string; paragraphs: string[]; rating: number | null; ratingCount: number | null; sources: { title: string; url: string }[]; writtenAt: string };

const KEY = (id: string) => `wander:place-about:${id}`;
export const keptAbout = (id: string): About | null => { try { return JSON.parse(localStorage.getItem(KEY(id)) || "null"); } catch { return null; } };

/** A line of her plan with no Google place (Wednesday's studios) has its own piece, written ahead by Wander: the same
 *  key the server keeps it under */
export const lineKey = (title: string) => `line:${title.split("\n")[0].trim().toLowerCase().replace(/\s+/g, " ")}`;
let lines: Promise<Set<string>> | null = null;
/** Which lines have a piece of their own — asked once per opening of Wander, kept on the phone for no signal */
export function aboutLines(): Promise<Set<string>> {
  lines ??= (async () => {
    try {
      const token = localStorage.getItem("wander_token");
      const r = await fetch("/api/place-photos/about-lines", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const body = r.ok ? await r.json() : null;
      if (Array.isArray(body?.lines)) { try { localStorage.setItem("wander:about-lines", JSON.stringify(body.lines)); } catch { /* full */ } return new Set<string>(body.lines); }
    } catch { /* no signal: the phone's copy */ }
    try { return new Set<string>(JSON.parse(localStorage.getItem("wander:about-lines") || "[]")); } catch { return new Set<string>(); }
  })();
  return lines;
}

/** The piece for a checked place (`id`) or for a line of her plan (`line:` key) — a place's is written on the first ask
 *  anywhere (up to a minute), so this waits longer than a read */
export async function aboutOf(id: string): Promise<About | { error: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 90_000);
  try {
    const token = localStorage.getItem("wander_token");
    const path = id.startsWith("line:") ? `/api/place-photos/about-line?title=${encodeURIComponent(id.slice(5))}` : `/api/place-photos/about/${encodeURIComponent(id)}`;
    const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctl.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) return { error: body?.error || "Wander couldn't write this just now. Try again in a minute." };
    try { localStorage.setItem(KEY(id), JSON.stringify(body)); } catch { /* full */ }
    return body as About;
  } catch {
    return { error: navigator.onLine === false ? "No signal right now. It opens once there's signal." : "That took too long. Try again in a moment." };
  } finally { clearTimeout(t); }
}
