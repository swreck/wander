/**
 * Where the phone is, sent with a Scout question so "what's near me?" gets her closest places (Ken, Oct 11 2026).
 * The phone is asked (and may show the iPhone's "Allow location?" box) only for a question that's about where they are.
 * Any other question never waits: once location is allowed it carries only what the phone already knew in the last ten
 * minutes, and quietly reads it again for next time. Once allowed, Wander also reads it when the app opens or comes back
 * to the front, so even the first question has it. Never saved by Wander.
 */
export type Here =
  | { lat: number; lng: number; acc: number | null; age: number | null }
  | { none: "denied" | "unavailable" | "not-asked" };

// (only words that are about where they are — verify12: "close" in "when does the pool close?", "far" in "how far is
// Nikko from Tokyo?" and "Here's a photo of the menu" each brought up the iPhone's location box; verify13: "is it easy
// to get around?" and "the area code" too. A question this misses gets Scout asking what they're near — honest — and
// once location is allowed, every question carries it anyway)
const NEAR_WORDS = new RegExp([
  String.raw`\bnear (?:me|here|by)\b`, String.raw`\bnearby\b`, String.raw`\bclose by\b`,
  String.raw`\bclosest (?:to (?:me|us|here)|\w+\s*[?.!]*\s*$)`, String.raw`\bnearest (?:to (?:me|us|here)|\w+\s*[?.!]*\s*$)`,
  String.raw`\bclose to (?:me|us|here)\b`, String.raw`\baround (?:here|me|us)\b`,
  String.raw`\bwhere am i\b`, String.raw`\bwhere are we(?: now)?\s*[?.!]*\s*$`, String.raw`\bfrom here\b`,
  String.raw`\bwalking distance\b`, String.raw`\bthis (?:area|neighbou?rhood)\b`, String.raw`\bin the (?:area|neighbou?rhood)\b`,
  String.raw`\bhow far (?:is it |away is )?(?:to |is )?(?:my|our|the) (?:hotel|ryokan|room)\s*[?.!]*\s*$`,
  String.raw`\bhow far (?:am i|are we)\b`, String.raw`\bwhat'?s (?:good )?around\s*(?:here)?\s*[?.!]*\s*$`,
  String.raw`\b(?:is there|are there|anything|any)\b[^?.!]{0,40}\b(?:around|close)\s*[?.!]*\s*$`,
  String.raw`\b(?:eat|see|do|drink|buy|shop)\s+here\s*[?.!]*\s*$`, String.raw`\bhere\s*[?.!]*\s*$`,
].join("|"), "i");
export const isNearQuestion = (q: string) => NEAR_WORDS.test(q);

let last: { lat: number; lng: number; acc: number | null; at: number } | null = null;
const fromLast = (): Here | null => (last && Date.now() - last.at < 10 * 60_000
  ? { lat: last.lat, lng: last.lng, acc: last.acc, age: Math.round((Date.now() - last.at) / 1000) } : null);

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

async function permission(): Promise<PermissionState | "unknown"> {
  try { return (await navigator.permissions?.query({ name: "geolocation" as PermissionName }))?.state ?? "unknown"; } catch { return "unknown"; /* older Safari: ask by the words */ }
}

export async function whereAmI(question: string): Promise<Here> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return { none: "unavailable" };
  const state = await permission();
  if (state === "denied") return { none: "denied" };
  if (isNearQuestion(question)) {
    // (the phone knew where it was within the last minute: that, at once)
    if (state === "granted" && last && Date.now() - last.at < 60_000) { void read(10_000); return fromLast()!; }
    // A question about where they are waits a little for a fix (and may ask the first time); no fix in time — a station,
    // a basement — what it knew in the last ten minutes, said with its age (verify13: "unknown", though it knew)
    const fresh = await read(7000);
    return "lat" in fresh ? fresh : fresh.none === "denied" ? fresh : fromLast() ?? fresh;
  }
  if (state !== "granted") return { none: "not-asked" };
  // Any other question: what the phone already knew, at once — and a fresh reading for next time, in the background
  void read(10_000);
  return fromLast() ?? { none: "not-asked" };
}

// (once location is allowed: read when the app opens and when it comes back to the front, so the first question after
// opening has it too — verify13: "How far is it to my hotel?" as the first question went without it)
function warm() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  void permission().then((s) => { if (s === "granted") void read(10_000); });
}
if (typeof window !== "undefined") {
  warm();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") warm(); });
}
