/**
 * A town on the way, for a trip that crosses countries ("What's the weather in Da Nang on the 29th?"). Open-Meteo's
 * place search: free, no key, no record of who asked. Scout cannot lie about where, so a town is taken only when:
 *   - it is inside one of the trip's own countries;
 *   - its name is the name asked for (accents, case and spacing aside): "Huệ An" is not Hue;
 *   - the map knows it as a real town: people counted there, or the seat of its province or district.
 * Nov 23 2026, tried on the real search: "Ninh Binh" came back as four hamlets, none the city; "Sapa" as one dot with
 * no people counted. Both are refused, and Scout says it couldn't place them. A wrong town's forecast is worse than none.
 *
 * Japan's own trip never comes here (its towns are found as they always were).
 */
import { meteo } from "./meteo.js";

export interface FoundTown { name: string; lat: number; lng: number; zone: string; country: string; region: string | null }

/** The codes the search takes for a country, for the countries a trip of ours is likely to cross */
const CODES: Record<string, string> = {
  vietnam: "VN", "viet nam": "VN", cambodia: "KH", japan: "JP", thailand: "TH", laos: "LA", china: "CN", taiwan: "TW",
  "south korea": "KR", korea: "KR", singapore: "SG", malaysia: "MY", indonesia: "ID", philippines: "PH", india: "IN",
  france: "FR", italy: "IT", spain: "ES", portugal: "PT", germany: "DE", "united kingdom": "GB", "united states": "US",
  usa: "US", mexico: "MX", canada: "CA", australia: "AU", "new zealand": "NZ",
};
const codeOf = (country: string) => CODES[country.trim().toLowerCase()] ?? null;

/** A name made plain for comparing: no accents, case, spaces or hyphens; đ is d ("Hội An" → "hoian") */
export const plainName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Which of the search's answers is the town asked for, or null when none is sure enough (the rule is at the top) */
export function pickTown(rows: any[], asked: string, countries: string[]): FoundTown | null {
  const want = plainName(asked);
  const names = new Set(countries.map((c) => c.trim().toLowerCase()));
  const codes = new Set(countries.map(codeOf).filter(Boolean));
  if (!want || !names.size) return null;
  const same = (Array.isArray(rows) ? rows : []).filter((r) =>
    r && typeof r.name === "string" && plainName(r.name) === want
    && typeof r.latitude === "number" && typeof r.longitude === "number"
    && (names.has(String(r.country ?? "").trim().toLowerCase()) || codes.has(String(r.country_code ?? "").toUpperCase())));
  const counted = same.filter((r) => typeof r.population === "number" && r.population > 0).sort((a, b) => b.population - a.population);
  const seat = same.find((r) => /^PPL(A\d?|C)$/.test(String(r.feature_code ?? "")));
  const r = counted[0] ?? seat;
  if (!r) return null;
  const country = countries.find((c) => c.trim().toLowerCase() === String(r.country ?? "").trim().toLowerCase() || codeOf(c) === String(r.country_code ?? "").toUpperCase()) ?? String(r.country);
  return { name: r.name, lat: r.latitude, lng: r.longitude, zone: typeof r.timezone === "string" && r.timezone ? r.timezone : "UTC", country, region: typeof r.admin1 === "string" && r.admin1 ? r.admin1 : null };
}

/** One search: the answers, or null when the search itself failed */
async function search(name: string, code: string | null): Promise<any[] | null> {
  try {
    const r = await meteo(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json${code ? `&countryCode=${code}` : ""}`);
    if (!r.ok) return null;
    const rows = (await r.json())?.results;
    return Array.isArray(rows) ? rows : [];
  } catch { return null; }
}

/** A sight's word after a town's name: "Ha Long Bay" is searched again as "Ha Long", and named as the town */
const SIGHT = /\s+(bay|city|town|old town|ancient town|old quarter|island|beach|province)$/i;

const kept = new Map<string, FoundTown | null>();
export const forgetTowns = () => kept.clear();

/** The town of this name in one of these countries, or null. Kept while the server runs; a search that failed is not
 *  kept, so it is asked again. */
export async function findTown(nameGiven: string, countries: string[]): Promise<FoundTown | null> {
  const name = nameGiven.trim().replace(/\s+/g, " ");
  const known = countries.map((c) => c.trim()).filter(Boolean);
  if (!name || name.length > 60 || !plainName(name) || !known.length) return null;
  const key = `${plainName(name)}|${known.map((c) => c.toLowerCase()).sort().join(",")}`;
  if (kept.has(key)) return kept.get(key)!;
  // (one search per country of the trip: unfiltered, ten answers from everywhere crowd a small town out. A country
  // Wander has no code for is searched once by name alone, and its answers filtered by the country's name)
  const codes = [...new Set(known.map(codeOf))];
  let failed = false;
  const look = async (q: string): Promise<FoundTown | null> => {
    const answers = await Promise.all(codes.map((c) => search(q, c)));
    if (answers.some((a) => a === null)) failed = true;
    return pickTown(answers.flatMap((a) => a ?? []), q, known);
  };
  let town = await look(name);
  if (!town && SIGHT.test(name)) town = await look(name.replace(SIGHT, ""));
  if (town || !failed) kept.set(key, town);
  return town;
}
