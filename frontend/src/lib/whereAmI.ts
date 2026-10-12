/**
 * Where the phone is, sent with a Scout question so "what's near me?" gets her closest places (Ken, Oct 11 2026).
 * The phone is asked (and may show the iPhone's "Allow location?" box) only for a question that's about where they are.
 * Any other question never waits: once location is allowed it carries only what the phone already knew in the last ten
 * minutes, and quietly reads it again for next time. Once allowed, Wander also reads it when the app opens or comes back
 * to the front, so even the first question has it. When Scout needed it and didn't have it, its answer carries a "Use
 * my location" button (hereNow), which asks the phone and sends the same question again. Never saved by Wander.
 */
export type Here =
  // spd: metres a second, when the phone knows it — Scout says when they're on a train (Ken, Oct 12)
  | { lat: number; lng: number; acc: number | null; age: number | null; spd?: number | null }
  | { none: "denied" | "unavailable" | "not-asked" };

// (only words that are about where they are — verify12: "close" in "when does the pool close?", "far" in "how far is
// Nikko from Tokyo?" and "Here's a photo of the menu" each brought up the iPhone's location box; verify13: "is it easy
// to get around?" and "the area code" too. These words only decide when the phone is asked first: a question they miss
// gets Scout's "Use my location" button under its answer — any wording — and once location is allowed, every question
// carries it anyway. So they stay narrow: a box on the wrong question costs more than one tap — verify15: "Where can I
// get a Suica card?" and "which way does the Shinkansen go" brought it up, and a "Don't Allow" there keeps location
// off until Wander is opened again)
const NEAR_WORDS = new RegExp([
  // ("near us" — two travelling together say "us"; verify14 — but not "stay near us in Tokyo", which is about a town)
  // ("nearby our Kyoto hotel" is about the hotel — verify16)
  String.raw`\bnear (?:me|here|by)\b`, String.raw`\bnear us\b(?!\s+(?:in|at|on)\b)`, String.raw`\bnearby\b(?!\s+(?:our|the|my|your|a|an|to)\b)`, String.raw`\bclose by\b`,
  // ("the nearest train station", "closest thing on Larisa's map" — up to four words to the end; never "closest to the
  // Imperial", which is about somewhere else; verify14)
  String.raw`\b(?:closest|nearest) to (?:me|us|here)\b`, String.raw`\b(?:closest|nearest)(?:\s+(?!to\b|from\b)[\w'’-]+){0,4}\s*[?.!]*\s*$`,
  String.raw`\bclose to (?:me|us|here)\b`, String.raw`\baround (?:here|me|us)\b`,
  String.raw`\bwhere am i\b`, String.raw`\bwhere (?:exactly )?are we(?: now| exactly)?\s*[?.!]*\s*$`, String.raw`\bfrom (?:here|where (?:i am|i'm|we are|we're))\b`,
  String.raw`\b(?:i'?m|i am|we'?re|we are) lost\b`,
  // ("walking distance of Tokyo Station" is between two places — verify15)
  String.raw`\bwalking distance\b(?!\s+(?:of|from|to)\b)`, String.raw`\bwithin (?:a |an )?(?:short |easy |quick |\d+[- ]min(?:ute)?s? )?walk\b`,
  // ("festivals in the area while we're in Kyoto" is about the city — only at the end; verify16)
  String.raw`\bthis (?:area|neighbou?rhood|street|block|corner)\b`, String.raw`\bin the (?:area|neighbou?rhood)\s*[?.!]*\s*$`,
  String.raw`\bwhat'?s the (?:area|neighbou?rhood) like\s*[?.!]*\s*$`,
  // ("how far to the Marriott?" — but never "how far is the hotel from the station?", which is between two places)
  String.raw`\bhow far (?:is it |away is )?(?:to |is )?(?:my|our|the) (?!.*\bfrom\b)[\w'’ -]{2,40}?\s*[?.!]*\s*$`,
  String.raw`\bhow far (?:am i|are we)\b`, String.raw`\bwhat'?s (?:good )?around\s*(?:here)?\s*[?.!]*\s*$`,
  String.raw`\b(?:is there|are there|anything|any)\b[^?.!]{0,40}\b(?:around|close)\s*[?.!]*\s*$`,
  // (a bare "…here?" at the end is usually Japan or the town — verify16: "Is tap water safe to drink here?", "When do
  // Andy and Julie get here?" brought up the box; those that need the spot get Scout's button)
  String.raw`\b(?:good |anything |something )?to (?:eat|see|do)\s+here\s*[?.!]*\s*$`, String.raw`\bwhat'?s (?:good )?(?:to eat|to see|to do)? ?(?:around )?here\s*[?.!]*\s*$`,
].join("|"), "i");
// ("while we're here" is about the trip, not this spot — verify14: "what to do in Mashiko while we're here?"; "where
// do we go from here after Hakone" is the next stop — verify16; and "is Kyoto nearby Osaka?" is about two towns)
const NOT_HERE = /\bwhile (?:we'?re|we are|i'?m|i am) (?:around|here|there)\b|\bwhere (?:do|should|will|can) (?:we|i) go from here\b/gi;
export const isNearQuestion = (q: string) => !/\bnearby [A-Z]/.test(q) && NEAR_WORDS.test(q.replace(NOT_HERE, ""));

type Reading = { lat: number; lng: number; acc: number | null; at: number; spd?: number | null };
let last: Reading | null = null;
const asHere = (r: Reading): Here => ({ lat: r.lat, lng: r.lng, acc: r.acc, age: Math.max(0, Math.round((Date.now() - r.at) / 1000)), ...(r.spd != null ? { spd: r.spd } : {}) });
const recent = (ms: number) => (last && Date.now() - last.at < ms ? last : null);
const metres = (a: Reading, b: Reading) => {
  const k = Math.PI / 180, x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k), y = (b.lat - a.lat) * k;
  return Math.sqrt(x * x + y * y) * 6_371_000;
};

/** A new reading kept — unless it's a rough guess and a sharp one from the last few minutes sits inside it: the phone
 *  hasn't shown they moved, only that it can't see well (verify14: in a station, a cell-tower guess 1,800 m wide
 *  replaced a 25 m reading from 3 minutes before, and "near you" was a kilometre off). Outside it, they moved. */
function keep(r: Reading): Reading {
  const prev = last;
  if (prev && r.acc != null && r.acc > 300 && prev.acc != null && prev.acc <= 100 && r.at - prev.at < 5 * 60_000 && metres(prev, r) <= r.acc) return prev;
  // (no speed from the phone — usual for a quick, low-power reading: from two sharp readings 5 s to 5 min apart)
  const dt = prev ? (r.at - prev.at) / 1000 : 0;
  if (r.spd == null && prev && r.acc != null && r.acc <= 100 && prev.acc != null && prev.acc <= 100 && dt >= 5 && dt <= 300) {
    // (only movement beyond both readings' own uncertainty counts — standing still, they wander by tens of metres)
    r = { ...r, spd: Math.round((Math.max(0, metres(prev, r) - prev.acc - r.acc) / dt) * 10) / 10 };
  }
  last = r;
  return r;
}

// timeout: the phone's own wait for a fix, not counting the iPhone's "Allow location?" box. cap: the longest anything
// waits, box included — a phone that never answers, or a box left unanswered, can't hold Scout up. A reading that comes
// after the cap is still kept for next time.
function read(timeout: number, cap: number): Promise<Here> {
  return new Promise<Here>((resolve) => {
    let done = false;
    const finish = (h: Here) => { if (!done) { done = true; resolve(h); } };
    setTimeout(() => finish({ none: "unavailable" }), cap);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const acc = Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null;
        // (speed: null, or negative, when the phone doesn't know it)
        const spd = typeof p.coords.speed === "number" && Number.isFinite(p.coords.speed) && p.coords.speed >= 0 ? Math.round(p.coords.speed * 10) / 10 : null;
        finish(asHere(keep({ lat: p.coords.latitude, lng: p.coords.longitude, acc, at: p.timestamp || Date.now(), spd })));
      },
      (e) => finish({ none: e.code === 1 ? "denied" : "unavailable" }),
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
    const justNow = state === "granted" ? recent(60_000) : null;
    if (justNow) { void read(10_000, 10_000); return asHere(justNow); }
    // A question about where they are waits a little for a fix (and may ask the first time); no fix in time — a station,
    // a basement — what it knew in the last ten minutes, said with its age (verify13: "unknown", though it knew).
    // (…known as of the question, not after the wait — verify14: at 9 min 55 s the wait ran past ten minutes)
    const known = recent(10 * 60_000);
    // (at most 10 s once allowed — verify14: a phone that never answered held the question 20 s; longer while the
    // iPhone's box may be up, so someone reading it isn't cut off)
    const fresh = await read(7000, state === "granted" ? 10_000 : 20_000);
    return "lat" in fresh ? fresh : fresh.none === "denied" ? fresh : known ? asHere(known) : fresh;
  }
  if (state !== "granted") return { none: "not-asked" };
  // Any other question: what the phone already knew, at once — and a fresh reading for next time, in the background
  void read(10_000, 10_000);
  const known = recent(10 * 60_000);
  return known ? asHere(known) : { none: "not-asked" };
}

/** "Use my location", tapped under Scout's answer: the phone is asked now — the iPhone's box comes up when it hasn't
 *  been allowed since Wander opened (iOS forgets a Home Screen app's answer between launches; K4) — with time to read
 *  the box. What it knew in the last minute, at once. */
export async function hereNow(): Promise<Here> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return { none: "unavailable" };
  const justNow = recent(60_000);
  if (justNow) return asHere(justNow);
  return read(10_000, 30_000);
}

// (once location is allowed: read when the app opens and when it comes back to the front, so the first question after
// opening has it too — verify13: "How far is it to my hotel?" as the first question went without it)
function warm() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  void permission().then((s) => { if (s === "granted") void read(10_000, 10_000); });
}
if (typeof window !== "undefined") {
  warm();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") warm(); });
}
