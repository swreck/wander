/**
 * Where the phone is, sent with a Scout question so "what's near me?" gets her closest places (Ken, Oct 11 2026).
 * Asked only for a question about what's near or around them, or when the phone has already said yes to Wander — so
 * nobody sees a location prompt for a question that doesn't need it. A short wait at most; never saved by Wander.
 */
export type Here =
  | { lat: number; lng: number; acc: number | null; age: number | null }
  | { none: "denied" | "unavailable" | "not-asked" };

const NEAR_WORDS = /\b(near|nearby|nearest|close|closest|around here|around me|where am i|here|walking distance|this area|neighbou?rhood|far)\b/i;

export async function whereAmI(question: string): Promise<Here> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return { none: "unavailable" };
  let state: PermissionState | "unknown" = "unknown";
  try { state = (await navigator.permissions?.query({ name: "geolocation" as PermissionName }))?.state ?? "unknown"; } catch { /* older Safari: ask by the words */ }
  if (state === "denied") return { none: "denied" };
  const wanted = NEAR_WORDS.test(question);
  if (!wanted && state !== "granted") return { none: "not-asked" };
  return new Promise<Here>((resolve) => {
    // (the iPhone's "allow location?" question isn't counted in the timeout: one left unanswered can't hold Scout up)
    setTimeout(() => resolve({ none: "unavailable" }), 20_000);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({
        lat: p.coords.latitude, lng: p.coords.longitude,
        acc: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null,
        age: Math.max(0, Math.round((Date.now() - p.timestamp) / 1000)),
      }),
      (e) => resolve({ none: e.code === 1 ? "denied" : "unavailable" }),
      // (a question about nearby waits a little for a fix; any other question takes only what's quick)
      { enableHighAccuracy: false, timeout: wanted ? 7000 : 2500, maximumAge: 60_000 },
    );
  });
}
