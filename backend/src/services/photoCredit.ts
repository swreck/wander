/**
 * A photographer's name as people read it (Nov 17 2026). Google sends a photo's credit as web code — "D&#39;Angelo"
 * for D'Angelo — and a phone showed it that way. The credit Wander keeps stays as it arrived: a photo is matched
 * across Google's listings by it (placePhotoChecks keyOf), so a changed one would be looked at, and paid for, again.
 * It's put into plain letters only here, on its way to a phone. Once only: "&amp;#39;" is someone's typed "&#39;".
 */
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function plainCredit(credit: string | null): string | null {
  if (!credit) return credit;
  return credit.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] !== "#") return NAMED[code.toLowerCase()] ?? all;
    const n = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    // (a real character only: never 0, half of a pair, or past the last one)
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : all;
  });
}
