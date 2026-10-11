/**
 * Where the phone is, sent with a Scout question so "what's near me?" gets her closest places (Ken, Oct 11 2026).
 * The phone is asked (and may show the iPhone's "Allow location?" box) only for a question that's about where they are.
 * Any other question never waits: once location is allowed it carries only what the phone already knew in the last ten
 * minutes, and quietly reads it again for next time. Never saved by Wander.
 */
export type Here =
  | { lat: number; lng: number; acc: number | null; age: number | null }
  | { none: "denied" | "unavailable" | "not-asked" };

// (only words that are about where they are — verify12: "close" in "when does the pool close?", "far" in "how far is
// Nikko from Tokyo?" and "Here's a photo of the menu" each brought up the iPhone's location box; a question this misses
// gets Scout asking what they're near, which is honest)
const NEAR_WORDS = new RegExp([
  String.raw`\bnear (?:me|here|us|by)\b`, String.raw`\bnearby\b`, String.raw`\bnearest\b`, String.raw`\bclose by\b`,
  String.raw`\bclosest\b`, String.raw`\bclose to (?:me|us|here)\b`, String.raw`\baround (?:here|me|us)\b`,
  String.raw`\bwhere am i\b`, String.raw`\bwhere are we(?: now)?\s*[?.!]*\s*$`, String.raw`\bfrom here\b`, String.raw`\bwalking distance\b`,
  String.raw`\b(?:this|the) (?:area|neighbou?rhood)\b`, String.raw`\bhow far (?:is|to|away is) (?:my|our|the) (?:hotel|ryokan|room)\b`,
  String.raw`\bhow far (?:am i|are we)\b`, String.raw`\baround\s*[?.!]*\s*$`, String.raw`\bwhat'?s (?:good )?around\b`,
].join("|"), "i");
export const isNearQuestion = (q: string) => NEAR_WORDS.test(q);

let last: { lat: number; lng: number; acc: number | null; at: number } | null = null;

function read(timeout: number): Promise<Here> {
  return new Promise<Here>((resolve) => {
    // (the iPhone's "allow location?" question isn't counted in the timeout: one left unanswered can't hold Scout up)
    setTimeout(() => resolve({ none: "unavailable" }), 20_000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const acc = Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null;
        last = { lat: p.coords.latitude, lng: p.coords.longitude, acc, at: p.timestamp || Date.now() };
        resolve({ lat: last.lat, lng: last.lng, acc, age: Math.max(0, Math.round((Date.now() - last.at) / 1000)) });
      },
      (e) => resolve({ none: e.code === 1 ? "denied" : "unavailable" }),
      { enableHighAccuracy: false, timeout, maximumAge: 60_000 },
    );
  });
}

export async function whereAmI(question: string): Promise<Here> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return { none: "unavailable" };
  let state: PermissionState | "unknown" = "unknown";
  try { state = (await navigator.permissions?.query({ name: "geolocation" as PermissionName }))?.state ?? "unknown"; } catch { /* older Safari: ask by the words */ }
  if (state === "denied") return { none: "denied" };
  // A question about where they are waits a little for a fix (and may ask the first time) — unless the phone knew where
  // it was within the last minute
  if (isNearQuestion(question)) {
    if (state === "granted" && last && Date.now() - last.at < 60_000) { void read(10_000); return { lat: last.lat, lng: last.lng, acc: last.acc, age: Math.round((Date.now() - last.at) / 1000) }; }
    return read(7000);
  }
  if (state !== "granted") return { none: "not-asked" };
  // Any other question: what the phone already knew, at once — and a fresh reading for next time, in the background
  void read(10_000);
  if (last && Date.now() - last.at < 10 * 60_000) return { lat: last.lat, lng: last.lng, acc: last.acc, age: Math.round((Date.now() - last.at) / 1000) };
  return { none: "not-asked" };
}
