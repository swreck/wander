// Which countries the phrase card offers, in what order, and which one it opens on (S3 fix 8, Nov 17 2026). A trip built
// from a plan visits several countries in turn (Vietnam, Cambodia, Japan): the card's tabs go in the order the trip visits
// them, and the card and the bar's button open on the country the traveler is in today. A sheet trip keeps PhraseCard's old
// detection (the caller decides which).

export interface CityForPhrases { name: string; country?: string | null; arrivalDate?: string | null; departureDate?: string | null; sequenceOrder?: number }

const KEYWORDS: [string, string[]][] = [
  ["japan", ["japan", "tokyo", "kyoto", "osaka"]],
  ["vietnam", ["vietnam", "ho chi minh", "hanoi", "saigon", "da nang"]],
  ["cambodia", ["cambodia", "siem reap", "phnom penh"]],
  ["portugal", ["portugal", "lisbon", "porto"]],
];
/** The phrase card's key for one city ("Hanoi", "Vietnam" → "vietnam"); its country's words first, then its name's. Null when none */
export function phraseKeyOf(city: { name: string; country?: string | null }): string | null {
  for (const text of [(city.country || "").toLowerCase(), (city.name || "").toLowerCase()]) {
    if (!text) continue;
    for (const [key, words] of KEYWORDS) if (words.some((w) => text.includes(w))) return key;
  }
  return null;
}

const ymd = (s?: string | null) => (s ? s.slice(0, 10) : "");
const inOrder = (cities: CityForPhrases[]) =>
  [...cities].sort((a, b) => (ymd(a.arrivalDate) || "9999").localeCompare(ymd(b.arrivalDate) || "9999") || (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));

/** The countries in the order the trip visits them (cities by date), each once. A city with no phrases is passed over */
export function countriesInVisitOrder(cities: CityForPhrases[]): string[] {
  const out: string[] = [];
  for (const c of inOrder(cities)) { const k = phraseKeyOf(c); if (k && !out.includes(k)) out.push(k); }
  return out;
}

/**
 * The country the card opens on: today's city's while the trip is under way (the latest city whose first day has come),
 * and the first country before the trip and after it. `today` is the phone's date; `tripEnd` ends a trip whose last city
 * has no departure. One country: that one.
 */
export function openingCountry(cities: CityForPhrases[], today: string, tripEnd?: string | null): string {
  const countries = countriesInVisitOrder(cities);
  if (countries.length < 2) return countries[0] || "";
  const ordered = inOrder(cities).filter((c) => phraseKeyOf(c));
  const first = ymd(ordered[0]?.arrivalDate);
  const lastCity = ordered[ordered.length - 1];
  const end = ymd(lastCity?.departureDate) || ymd(tripEnd);
  if (!first || today < first || (end && today > end)) return countries[0];
  let here = ordered[0];
  for (const c of ordered) if (ymd(c.arrivalDate) && ymd(c.arrivalDate) <= today) here = c;
  return phraseKeyOf(here) || countries[0];
}
