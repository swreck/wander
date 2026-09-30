/**
 * What Wander keeps out of any source it reads (Sep 30 2026). Wander captures no financial information, so card
 * digits never reach its database, its screens or Scout — "a physical Mastercard ending 1234" is kept as
 * "a physical Mastercard ending ••••", which still says which card to bring. The same for a whole card
 * number and for the long IDs of a phone's transit card (her rail sheet says not to store them; if one appears,
 * Wander doesn't).
 */

const LAST_DIGITS = /\b(ending(?: in)?|ends in|last (?:4|four)(?: digits)?(?: of)?|x{2,}|\*{2,})(\s*[:#]?\s*)(\d{4})\b/gi;
// 13–19 digits, in groups or not (a card number); a reservation number is far shorter
const CARD_NUMBER = /\b(?:\d[ -]?){12,18}\d\b/g;
// A Mobile Suica / PASMO ID written out in full ("JE80 1234 5678 9012 3456")
const IC_ID = /\b(JE|PB)(?:[ -]?[0-9A-F]){14,}\b/g;

export function withoutFinancialDetails(text: string): string {
  // (the transit-card ID first: its digits would otherwise be taken for a card number and leave "JE80" behind)
  return text
    .replace(IC_ID, (_m, kind: string) => `${kind}… [card ID left out by Wander]`)
    .replace(CARD_NUMBER, (m) => (m.replace(/\D/g, "").length >= 13 ? "[card number left out by Wander]" : m))
    .replace(LAST_DIGITS, (_m, lead: string, gap: string) => `${lead}${gap || " "}••••`);
}
