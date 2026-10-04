/**
 * What's new on Maybes for the person holding the phone (Oct 2 2026): someone else's maybe, or their line on an idea,
 * since this person last looked at that city's list — for the dot on the Maybes tab and the one line on Home. Never
 * a phone alert. Read again when Wander comes back to the front, when data changes, and when a list is looked at.
 */
import { api } from "./api";

export interface MaybeItem { kind: "maybe" | "note"; id: string; cityId: string; city?: string; words: string; by: string; at: string }
export interface MaybeNews { items: MaybeItem[]; latest: MaybeItem | null }
interface Recent {
  maybes: { id: string; cityId: string; city: string; words: string; by: string; at: string }[];
  notes: { id: string; experienceId: string; cityId: string; about: string; by: string; at: string }[];
}
export interface SeenRow { name: string; me: boolean; seen: Record<string, string>; organizer?: boolean }

export const firstOf = (name: string) => (name || "").trim().split(/\s+/)[0] || name;
const same = (a: string, b: string) => firstOf(a).toLowerCase() === firstOf(b).toLowerCase();

export async function loadMaybeNews(tripId: string, me: string): Promise<MaybeNews> {
  const [recent, seen] = await Promise.all([
    api.get<Recent>(`/maybes/recent/${tripId}`),
    api.get<SeenRow[]>(`/maybes/seen/${tripId}`),
  ]);
  const mine = seen.find((s) => s.me)?.seen || {};
  const fresh = (cityId: string, at: string) => !mine[cityId] || new Date(at).getTime() > new Date(mine[cityId]).getTime();
  const items: MaybeItem[] = [
    ...recent.maybes.filter((m) => !same(m.by, me) && fresh(m.cityId, m.at))
      .map((m) => ({ kind: "maybe" as const, id: m.id, cityId: m.cityId, city: m.city, words: m.words, by: m.by, at: m.at })),
    ...recent.notes.filter((n) => !same(n.by, me) && fresh(n.cityId, n.at))
      .map((n) => ({ kind: "note" as const, id: n.id, cityId: n.cityId, words: n.about, by: n.by, at: n.at })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return { items, latest: items[0] || null };
}

/** Tell the tab and Home to look again (after Send, after a list is looked at) */
export const maybesChanged = () => window.dispatchEvent(new Event("wander:maybes-changed"));
