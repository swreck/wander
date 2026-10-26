/**
 * "About this place" (Ken, Oct 27: a quick button on each line, "a summary description of the place, either reviews of
 * its a restaurant or background if it's a historical site… about 3 to 5 paragraphs"). Backend: services/placeAbout.ts.
 * Kept on the phone once read, so it opens at once again — and with no signal.
 */
export type About = { name: string; kind: "reviews" | "background"; gist: string; paragraphs: string[]; rating: number | null; ratingCount: number | null; sources: { title: string; url: string }[]; writtenAt: string };

const KEY = (id: string) => `wander:place-about:${id}`;
export const keptAbout = (id: string): About | null => { try { return JSON.parse(localStorage.getItem(KEY(id)) || "null"); } catch { return null; } };

/** The piece for a checked place — written on the first ask anywhere (up to ~30 s), so this waits longer than a read */
export async function aboutOf(id: string): Promise<About | { error: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 90_000);
  try {
    const token = localStorage.getItem("wander_token");
    const res = await fetch(`/api/place-photos/about/${encodeURIComponent(id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctl.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) return { error: body?.error || "Wander couldn't write this just now. Try again in a minute." };
    try { localStorage.setItem(KEY(id), JSON.stringify(body)); } catch { /* full */ }
    return body as About;
  } catch {
    return { error: navigator.onLine === false ? "No signal right now. It opens once there's signal." : "That took too long. Try again in a moment." };
  } finally { clearTimeout(t); }
}
