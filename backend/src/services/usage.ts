/**
 * What Wander asks of paid services, counted per day (UTC) where it's asked (Nov 16 2026: what one place's photos cost had
 * never been measured). Kept in service_usage, readable for Ken's reports.
 *
 * The place photos' share has a daily ceiling: past it, the photo says "Photo not available" until the next day, never an
 * error. The ceilings, at Google's and Anthropic's list prices:
 *  - google.details 600 a day (~$10): a place's photo list is asked at most every 5 minutes (Google's own cache time for
 *    it) and only when the server has no photo of it kept; Japan's 91 places, each opened twice a day, is ~180.
 *  - google.photo 1,500 a day (~$10.50): each photo is fetched once a day at each size (kept for Google's 24 hours);
 *    a trip's ~150 places × up to 8 photos at two sizes would be 2,400 if every photo of every place were opened.
 *  - google.search 150 a day: a new line of her plan looked up for the first time.
 *  - ai.photo_check 80 a day (~$8 at about $0.10 a check): one check per place whose photos are new, once per photo.
 *  - ai.place_check 150 a day: "is Google's place the one her line means", once per new line a week.
 * Other callers (Scout, the city photo, geocoding, "About this place") are counted, not limited.
 */
import prisma from "./db.js";

export const CEILINGS: Record<string, number> = {
  "google.details": 600,
  "google.photo": 1500,
  "google.search": 150,
  "ai.photo_check": 80,
  "ai.place_check": 150,
};

const today = () => new Date().toISOString().slice(0, 10);

/** One use of `kind`, if today's ceiling allows it: true when counted, false when the ceiling is reached (then the
 *  refusal is counted). Atomic, so two people at once can't both pass the last place under the ceiling. */
export async function allow(kind: string): Promise<boolean> {
  const ceiling = CEILINGS[kind] ?? Number.MAX_SAFE_INTEGER;
  const day = today();
  try {
    const rows = ceiling <= 0 ? [] : await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO service_usage (day, kind, count) VALUES (${day}, ${kind}, 1)
      ON CONFLICT (day, kind) DO UPDATE SET count = service_usage.count + 1 WHERE service_usage.count < ${ceiling}
      RETURNING count`;
    if (rows.length) return true;
    await prisma.$executeRaw`
      INSERT INTO service_usage (day, kind, refused) VALUES (${day}, ${kind}, 1)
      ON CONFLICT (day, kind) DO UPDATE SET refused = service_usage.refused + 1`;
    return false;
  } catch (e: any) {
    // (a counting hiccup never blocks a photo: counted as allowed, said in the log)
    console.warn("[usage]", kind, e?.message || e);
    return true;
  }
}

/** One use of `kind`, counted with no ceiling (and its tokens, for AI calls) */
export function note(kind: string, tokens?: { in?: number; out?: number }): void {
  const day = today(), tin = Math.round(tokens?.in || 0), tout = Math.round(tokens?.out || 0);
  prisma.$executeRaw`
    INSERT INTO service_usage (day, kind, count, tokens_in, tokens_out) VALUES (${day}, ${kind}, 1, ${tin}, ${tout})
    ON CONFLICT (day, kind) DO UPDATE SET count = service_usage.count + 1, tokens_in = service_usage.tokens_in + ${tin}, tokens_out = service_usage.tokens_out + ${tout}`
    .catch((e: any) => console.warn("[usage]", kind, e?.message || e));
}

/** A Google Places request counted as `kind` (no ceiling) — for the callers outside the place photos */
export function googleFetch(kind: string, url: string | URL, init?: RequestInit): Promise<Response> {
  note(kind);
  return fetch(url, init);
}

/** Tokens for a use already counted by allow() */
export function noteTokens(kind: string, tokens: { in?: number; out?: number }): void {
  const day = today(), tin = Math.round(tokens.in || 0), tout = Math.round(tokens.out || 0);
  prisma.$executeRaw`UPDATE service_usage SET tokens_in = tokens_in + ${tin}, tokens_out = tokens_out + ${tout} WHERE day = ${day} AND kind = ${kind}`
    .catch((e: any) => console.warn("[usage]", kind, e?.message || e));
}
