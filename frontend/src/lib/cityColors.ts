// ── City pastel palette ─────────────────────────────────────────
// One color per city, by its place in the trip's city list — the calendar, the Home map's markers and the day
// screen's band all use it, so a city is the same color everywhere (Oct 1 2026).

export const CITY_PASTELS = [
  "#F2E0DE", // rose
  "#DEE6F2", // sky
  "#DEF2DE", // sage
  "#F2ECDE", // warm
  "#E6DEF2", // lavender
  "#DEF2EC", // mint
  "#F2DEE6", // blush
  "#ECF2DE", // spring
];

export function getCityPastel(cities: { id: string }[], cityId: string): string {
  const idx = cities.findIndex((c) => c.id === cityId);
  if (idx === -1) return CITY_PASTELS[0];
  return CITY_PASTELS[idx % CITY_PASTELS.length];
}

/** A city's pastel, deepened — the calendar's edge color (and the day screen's band accent) */
export function cityAccent(pastel: string): string {
  // each channel deepened alike (the old swap-table missed "E0", so the rose city's edge came out green — tester t5)
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(pastel);
  if (!m) return pastel;
  return "#" + m.slice(1).map((h) => Math.round(parseInt(h, 16) * 0.8).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** The country most of the trip's cities are in. The city you fly from (San Francisco) is outside it: the Home map
 *  leaves it off (it would shrink Japan to a speck) and it gets no arrival photo — you're leaving, not arriving. */
export function tripCountryOf(cities: { country?: string | null }[]): string | null {
  const n = new Map<string, number>();
  for (const c of cities) if (c.country) n.set(c.country, (n.get(c.country) || 0) + 1);
  return Array.from(n.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
