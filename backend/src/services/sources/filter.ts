/**
 * What Wander keeps out of any source it reads (Sep 30 2026). A card is shown the standard safe way — its last four
 * digits and never more (Ken: "showing 4 digits, and only 4 digits, is good"): "a physical Mastercard ending 1234"
 * stays as written, and a whole card number is cut to "[card ending 1111]". The long IDs of a phone's transit card
 * are left out entirely (the rail sheet itself says not to store them).
 */

// 13–19 digits, in groups or not (a card number); a reservation number is far shorter
const CARD_NUMBER = /\b(?:\d[ -]?){12,18}\d\b/g;
// A Mobile Suica / PASMO ID written out in full ("JE80 1234 5678 9012 3456")
const IC_ID = /\b(JE|PB)(?:[ -]?[0-9A-F]){14,}\b/g;

export function withoutFinancialDetails(text: string): string {
  // (the transit-card ID first: its digits would otherwise be taken for a card number)
  return text
    .replace(IC_ID, (_m, kind: string) => `${kind}… [card ID left out by Wander]`)
    .replace(CARD_NUMBER, (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 13 ? `[card ending ${digits.slice(-4)}]` : m;
    });
}
