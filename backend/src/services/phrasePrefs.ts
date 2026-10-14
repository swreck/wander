/**
 * Each person's own phrase card: which phrases they took off it and the order they put them in (Ken, Oct 13: "Need to
 * be able to remove phrases. And to rearrange the order. No need to designate original or not."). The card's phrases
 * are shared — the everyday ones every trip has and those added on the trip — but taking one off or moving it changes
 * only the person's own card, so no one rearranges anyone else's. Taken off is hidden, never deleted: "Put back" undoes
 * it. Kept with the person's other settings (traveler.preferences.phrases[tripId]), so it follows them to any phone.
 *
 * Keys: "core:<country>:<English>" for an everyday phrase, "p:<id>" for one added on the trip.
 */
import prisma from "./db.js";

export type PhrasePrefs = { order: string[]; hidden: string[] };

// The everyday Japanese phrases every trip's card starts with — the same list, in the same order, as the card's own
// (frontend/src/components/PhraseCard.tsx COUNTRY_PHRASES.japan); change both together
export const JAPAN_EVERYDAY = [
  { english: "Hello", local: "Konnichiwa", pronunciation: "Koh-nee-chee-wah" },
  { english: "Thank you", local: "Arigatou gozaimasu", pronunciation: "Ah-ree-gah-toh go-zah-ee-mahs" },
  { english: "Yes please", local: "Hai, onegaishimasu", pronunciation: "Hai, oh-neh-guy-shee-mahs" },
  { english: "No thank you", local: "Iie, kekkou desu", pronunciation: "Ee-eh, kek-koh dess" },
  { english: "How much?", local: "Ikura desu ka?", pronunciation: "Ee-koo-rah dess kah?" },
  { english: "Excuse me", local: "Sumimasen", pronunciation: "Sue-mee-mah-sen" },
  { english: "Check please", local: "Okaikei onegaishimasu", pronunciation: "Oh-kai-keh oh-neh-guy-shee-mahs" },
];

/** Everything on a trip's Japanese card, in its first order: the everyday phrases, then those added on the trip (with
 *  removedAt for one taken off everyone's card) */
export async function cardPhrases(tripId: string): Promise<{ key: string; id?: string; english: string; local: string; pronunciation?: string | null; script?: string | null; addedBy?: string; removedAt?: Date | null }[]> {
  const added = await prisma.tripPhrase.findMany({ where: { tripId }, orderBy: { createdAt: "asc" } });
  return [
    ...JAPAN_EVERYDAY.map((p) => ({ key: `core:japan:${p.english}`, english: p.english, local: p.local, pronunciation: p.pronunciation })),
    ...added.map((p) => ({ key: `p:${p.id}`, id: p.id, english: p.english, local: p.romaji, pronunciation: p.pronunciation, script: p.script, addedBy: p.addedBy, removedAt: p.removedAt })),
  ];
}

/** A phrase just added goes first on the card of the person who added it; everyone else finds it at the bottom of
 *  theirs (Ken, Oct 13: "Anything added by one adds to bottom for others no matter where placed by the person adding
 *  it. It goes to top for the one who adds it.") */
export async function firstOnAddersCard(travelerId: string | undefined, tripId: string, phraseId: string): Promise<void> {
  if (!travelerId) return;
  const prefs = await phrasePrefsOf(travelerId, tripId);
  const key = `p:${phraseId}`;
  const all = (await cardPhrases(tripId)).filter((p) => !p.removedAt).map((p) => p.key);
  await savePhrasePrefs(travelerId, tripId, { order: [key, ...arranged(all, prefs).filter((k) => k !== key)] });
}

const firstName = (s: string) => String(s || "").trim().split(/\s+/)[0].toLowerCase();
/** Off everyone's card: only the person who added the phrase and the trip's organizer (the Maybes rule — Ken, Oct 3:
 *  "It is for the person who added it and me") */
export async function mayRemoveForAll(who: { travelerId?: string; displayName: string }, phrase: { tripId: string; addedBy: string }): Promise<boolean> {
  if (firstName(phrase.addedBy) === firstName(who.displayName)) return true;
  const org = await prisma.tripMember.findFirst({ where: { tripId: phrase.tripId }, orderBy: { joinedAt: "asc" }, select: { travelerId: true } });
  return !!who.travelerId && org?.travelerId === who.travelerId;
}

/** The same phrase, letter for letter, ignoring case, punctuation, spacing and long-vowel marks ("chōshi" = "choshi") */
export function samePhrase(a: string, b: string): boolean {
  const flat = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return !!flat(a) && flat(a) === flat(b);
}

/** The card as this person has it: their order first, anything new after in its first order */
export function arranged(all: string[], prefs: PhrasePrefs): string[] {
  const known = new Set(all);
  return [...prefs.order.filter((k) => known.has(k)), ...all.filter((k) => !prefs.order.includes(k))];
}
const KEY = /^(core:[a-z]+:[^\n]{1,80}|p:[\w-]{1,40})$/;
const clean = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((k): k is string => typeof k === "string" && KEY.test(k)))].slice(0, 300) : []);

export async function phrasePrefsOf(travelerId: string, tripId: string): Promise<PhrasePrefs> {
  const t = await prisma.traveler.findUnique({ where: { id: travelerId }, select: { preferences: true } });
  const p = (((t?.preferences as any) || {}).phrases || {})[tripId] || {};
  return { order: clean(p.order), hidden: clean(p.hidden) };
}

export async function savePhrasePrefs(travelerId: string, tripId: string, next: { order?: unknown; hidden?: unknown }): Promise<PhrasePrefs> {
  const t = await prisma.traveler.findUnique({ where: { id: travelerId }, select: { preferences: true } });
  const prefs = (t?.preferences as any) || {};
  const all = prefs.phrases || {};
  const was = all[tripId] || {};
  const saved: PhrasePrefs = { order: next.order === undefined ? clean(was.order) : clean(next.order), hidden: next.hidden === undefined ? clean(was.hidden) : clean(next.hidden) };
  await prisma.traveler.update({ where: { id: travelerId }, data: { preferences: { ...prefs, phrases: { ...all, [tripId]: saved } } } });
  return saved;
}
