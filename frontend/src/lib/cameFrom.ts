/**
 * Where a screen was opened from, so its back button can say where it goes ("Home", "Now", "Notes") — a plain "Back"
 * beside the day buttons ("‹ Sat", "Mon ›") read as another way to change the day (map review, Oct 1 2026).
 * App notes every screen as it opens. Stepping from day to day replaces the day (Back still returns to where the days
 * were opened from), so a day after a day keeps the first one's origin.
 */
let current: string | null = null;
let previous: string | null = null;
const isDay = (p: string | null) => !!p && /^\/day\//.test(p);

export function notePath(path: string) {
  if (path === current) return;
  if (!(isDay(path) && isDay(current))) previous = current;
  current = path;
}

const NAMES: Record<string, string> = { "/": "Home", "/now": "What's next", "/notes": "Notes", "/ideas": "Maybes", "/people": "People", "/settings": "Settings" };

/** The back button's word for the screen at `here`: where Back will go, or "Back" when that isn't known */
export function backWord(here: string, canGoBack: boolean): string {
  if (!canGoBack) return "Home"; // (opened straight from a link: Back goes Home)
  // (App notes the new screen after it first draws; until then, `current` is still the screen it came from)
  const from = current !== here ? (isDay(here) && isDay(current) ? previous : current) : previous;
  return (from && NAMES[from]) || "Back";
}
