/**
 * Directions from wherever the phone is, to a place a map link already names (Oct 2: "what's next, and how do I get
 * there?"). Apple Maps with no start = the phone's own location, and with no way given it offers walking, train or car
 * as the person last chose. A Google Maps place link keeps its exact coordinates (her Tokyodo place); a search link
 * keeps its words. Anything else (a Michelin page) — nothing.
 */
export function directionsHref(href: string | null | undefined, way?: "walk" | "train" | "taxi"): string | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    let dest: string | null = null;
    if (/(^|\.)maps\.apple\.com$/.test(u.hostname)) {
      dest = u.searchParams.get("daddr") || u.searchParams.get("q") || u.searchParams.get("address") || u.searchParams.get("ll");
    } else if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && /\/maps/.test(u.pathname)) {
      const at = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      const place = u.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
      dest = at ? `${at[1]},${at[2]}` : place ? decodeURIComponent(place.replace(/\+/g, " ")) : u.searchParams.get("q") || u.searchParams.get("query") || u.searchParams.get("destination");
    }
    // (walking, train and subway, or a driving route a taxi driver can read — in Google Maps, from where the phone is;
    // Ken, Oct 15: Apple Maps took them to the wrong place for dinner from the right address)
    const how = way ? `&travelmode=${{ walk: "walking", train: "transit", taxi: "driving" }[way]}` : "";
    return dest ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}${how}` : null;
  } catch { /* not a link */ }
  return null;
}
