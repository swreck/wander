/**
 * A first word from Scout for one person, with one question to tap (Oct 10 2026). Julie joked about getting Scout's help
 * to pack; Ken mentioned it to Scout, and asked for her welcome to be useful, never presumptuous: an offer she can take,
 * put off, or decline — "people are in a hurry … if it gets dismissed, there should be a show me later option" (Ken).
 * Like the "Show me around" offer: Later brings it back after a while, at most three times; No thanks ends it; asking
 * Scout something else first counts as Later. Gone once she's asked it, or once she's on her way. That first offer is
 * Julie's only — Andy can ask for the same list (packing_tips), but it's never put in front of him (Ken, Oct 10).
 *
 * A second offer, the weather where they'll sleep, to Julie AND Andy (Ken, Oct 12, asked "a one-time offer from Scout to
 * both": "Yes (we've been trading messages already about rain. Don't just do the obvious. That's worse than nothing. But
 * data is good.)"). Its words are made from their own forecast when Scout opens — the coldest stop against where they
 * start — never "rain is coming". One offer at a time: a person's offers come in order, each once it's done with.
 */
import prisma from "./db.js";
import { packingWeather } from "./packingWeather.js";

export type Hello = { words: string; ask: string; last: boolean };
// (who: her account — "Julie", as she knows herself (renamed from "Julie D." on Oct 10), or a first name and an initial;
// never the old April test account, "Julie (old April account)")
type Planned = { key: string; who: RegExp; until: string; words: string; ask: string; wordsNow?: (tripId: string, displayName: string, now: Date) => Promise<string | null> };
type Answered = { laters?: number; lastAt?: string; status?: "no" };

const PLANNED: Planned[] = [
  {
    key: "packing",
    who: /^Julie( [A-Z]\.?)?$/,
    // (until her trip begins: midnight in Japan as Oct 13 ends)
    until: "2026-10-13T15:00:00Z",
    words: "Ken mentioned your quip about packing, so I wanted to figure out if I could actually be useful. I have a short list of things Americans often wish they'd brought to Japan, matched to your days here.",
    ask: "What should I pack that I might not think of?",
  },
  {
    key: "packing-weather",
    who: /^(Julie|Andy)( [A-Z]\.?)?$/,
    // (while they pack: until 8 AM Tuesday in California, four hours before they fly)
    until: "2026-10-13T15:00:00Z",
    words: "The forecast for your hotels is in now, stop by stop. Want the few things it changes in what to pack?",
    ask: "What should I pack for the weather?",
    wordsNow: weatherWords,
  },
];
const MAX_OFFERS = 3;
// (her trip starts in days, not weeks: back after six hours — the tour waits twelve)
const AGAIN_AFTER = 6 * 3600_000;

/** The coldest stop against where they start, from the forecast at their own hotels — or null (the plain words then) */
const wordsKept = new Map<string, { at: number; words: string | null }>();
async function weatherWords(tripId: string, displayName: string, now: Date): Promise<string | null> {
  const key = `${tripId}|${displayName}`;
  const kept = wordsKept.get(key);
  if (kept && now.getTime() - kept.at < 3600_000) return kept.words;
  const today = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);   // (Japan's date)
  const stays = await packingWeather(tripId, displayName.split(" ")[0], today);
  let words: string | null = null;
  const first = stays[0];
  const coldest = [...stays].sort((a, b) => a.warmestHigh - b.warmestHigh)[0];
  // (only when the gap is worth saying — a stop at least 8°F cooler at its warmest than where they start)
  if (first && coldest && coldest !== first && first.warmestHigh - coldest.warmestHigh >= 8) {
    words = `The forecast for your hotels is in. At the ${coldest.stay} (${coldest.nights}), the highs look like ${coldest.highs}, against ${first.highs} at the ${first.stay} in ${first.town}. Want the few things worth packing for that?`;
  }
  wordsKept.set(key, { at: now.getTime(), words });
  return words;
}

async function answeredOf(travelerId: string): Promise<Record<string, Answered>> {
  const t = await prisma.traveler.findUnique({ where: { id: travelerId }, select: { preferences: true } });
  return ((t?.preferences as any) || {}).scoutHello || {};
}

/** This person's offer now, in order: the first still running that they haven't declined, run out of, or asked —
 *  with whether it's resting after a "Later" */
async function currentOffer(travelerId: string, displayName: string, now: Date, tripId?: string) {
  const answered = await answeredOf(travelerId);
  for (const p of PLANNED) {
    if (!p.who.test(displayName) || now.getTime() >= Date.parse(p.until)) continue;
    const a = answered[p.key] || {};
    if (a.status === "no" || (a.laters || 0) >= MAX_OFFERS) continue;
    const asked = await prisma.chatMessage.findFirst({ where: { ...(tripId ? { tripId } : {}), travelerId, role: "user", content: { startsWith: p.ask } }, select: { id: true } });
    if (asked) continue;
    return { p, a, answered, resting: !!a.lastAt && now.getTime() - Date.parse(a.lastAt) < AGAIN_AFTER };
  }
  return null;
}

/** Scout's first word for this person now — unless it's past its date, declined, put off a moment ago, or asked */
export async function helloFor(tripId: string, travelerId: string, displayName: string, now = new Date()): Promise<Hello | null> {
  const c = await currentOffer(travelerId, displayName, now, tripId);
  if (!c || c.resting) return null;
  // (made from the forecast when there's time — never holding up Scout's opening: the plain words after 4 s)
  const made = c.p.wordsNow
    ? await Promise.race([c.p.wordsNow(tripId, displayName, now).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 4000))])
    : null;
  return { words: made || c.p.words, ask: c.p.ask, last: (c.a.laters || 0) >= MAX_OFFERS - 1 };
}

/** "Later" (or asking something else first) or "No thanks" — kept with the person, so every phone knows */
export async function answerHello(travelerId: string, displayName: string, answer: "later" | "no", now = new Date()): Promise<boolean> {
  const c = await currentOffer(travelerId, displayName, now);
  if (!c) return false;
  const t = await prisma.traveler.findUnique({ where: { id: travelerId }, select: { preferences: true } });
  const prefs = ((t?.preferences as any) || {}) as Record<string, any>;
  const a = c.a;
  // (a second "Later" from another phone within the wait is the same one)
  const fresh = !a.lastAt || now.getTime() - Date.parse(a.lastAt) >= AGAIN_AFTER;
  const next: Answered = answer === "no"
    ? { ...a, status: "no", lastAt: now.toISOString() }
    : fresh ? { ...a, laters: (a.laters || 0) + 1, lastAt: now.toISOString() } : a;
  await prisma.traveler.update({ where: { id: travelerId }, data: { preferences: { ...prefs, scoutHello: { ...c.answered, [c.p.key]: next } } } });
  return true;
}
