/**
 * A first word from Scout for one person, with one question to tap (Oct 10 2026). Julie joked about getting Scout's help
 * to pack; Ken mentioned it to Scout, and asked for her welcome to be useful, never presumptuous: an offer she can take,
 * put off, or decline — "people are in a hurry … if it gets dismissed, there should be a show me later option" (Ken).
 * Like the "Show me around" offer: Later brings it back after a while, at most three times; No thanks ends it; asking
 * Scout something else first counts as Later. Gone once she's asked it, or once she's on her way. Julie only — Andy can
 * ask for the same list (packing_tips), but it's never put in front of him.
 */
import prisma from "./db.js";

export type Hello = { words: string; ask: string; last: boolean };
// (who: her account — "Julie", as she knows herself (renamed from "Julie D." on Oct 10), or a first name and an initial;
// never the old April test account, "Julie (old April account)")
type Planned = { key: string; who: RegExp; until: string; words: string; ask: string };
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
];
const MAX_OFFERS = 3;
// (her trip starts in days, not weeks: back after six hours — the tour waits twelve)
const AGAIN_AFTER = 6 * 3600_000;

const planFor = (displayName: string, now: Date) => PLANNED.find((h) => h.who.test(displayName) && now.getTime() < Date.parse(h.until));
async function answeredOf(travelerId: string, key: string): Promise<Answered> {
  const t = await prisma.traveler.findUnique({ where: { id: travelerId }, select: { preferences: true } });
  return (((t?.preferences as any) || {}).scoutHello || {})[key] || {};
}

/** Scout's first word for this person now — unless it's past its date, declined, put off a moment ago, or asked */
export async function helloFor(tripId: string, travelerId: string, displayName: string, now = new Date()): Promise<Hello | null> {
  const p = planFor(displayName, now);
  if (!p) return null;
  const a = await answeredOf(travelerId, p.key);
  const laters = a.laters || 0;
  if (a.status === "no" || laters >= MAX_OFFERS) return null;
  if (a.lastAt && now.getTime() - Date.parse(a.lastAt) < AGAIN_AFTER) return null;
  const asked = await prisma.chatMessage.findFirst({ where: { tripId, travelerId, role: "user", content: { startsWith: p.ask } }, select: { id: true } });
  return asked ? null : { words: p.words, ask: p.ask, last: laters >= MAX_OFFERS - 1 };
}

/** "Later" (or asking something else first) or "No thanks" — kept with the person, so every phone knows */
export async function answerHello(travelerId: string, displayName: string, answer: "later" | "no", now = new Date()): Promise<boolean> {
  const p = planFor(displayName, now);
  if (!p) return false;
  const t = await prisma.traveler.findUnique({ where: { id: travelerId }, select: { preferences: true } });
  const prefs = ((t?.preferences as any) || {}) as Record<string, any>;
  const all = (prefs.scoutHello || {}) as Record<string, Answered>;
  const a = all[p.key] || {};
  // (a second "Later" from another phone within the wait is the same one)
  const fresh = !a.lastAt || now.getTime() - Date.parse(a.lastAt) >= AGAIN_AFTER;
  const next: Answered = answer === "no"
    ? { ...a, status: "no", lastAt: now.toISOString() }
    : fresh ? { ...a, laters: (a.laters || 0) + 1, lastAt: now.toISOString() } : a;
  await prisma.traveler.update({ where: { id: travelerId }, data: { preferences: { ...prefs, scoutHello: { ...all, [p.key]: next } } } });
  return true;
}
