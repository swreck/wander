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

/**
 * A person's own travel numbers (Ken, Oct 4 2026: "unless the info passes through the vault in a safe way, Wander should
 * not surprise people by surfacing their personal info"). Her Flight info tab holds a picture of United's confirmation
 * for Julie and Andy, and Wander reads every word of a picture — their Known Traveler, eTicket and MileagePlus numbers
 * came out on screens, in Find and to Scout. The number goes; its label stays ("KTN [left out by Wander]"), so it's
 * clear something is there. A label with no number after it ("Passport required at check-in") is left alone.
 */
const PERSONAL_ID = /\b(KTN|Known Traveler(?:\s+(?:Number|No\.?|#))?|Redress(?:\s+(?:Number|No\.?|#))?|e-?Ticket(?:\s+(?:number|no\.?|#))?|Ticket number|MileagePlus(?:\s+(?:number|no\.?|#))?|SkyMiles(?:\s+(?:number|no\.?|#))?|AAdvantage(?:\s+(?:number|no\.?|#))?|Frequent flyer(?:\s+(?:number|no\.?|#))?|Passport(?:\s+(?:number|no\.?|#))?|Date of birth|DOB|Birth ?date)([ \t]*[:#]?[ \t]*)([^\n]{1,40})/gi;
// In a record that carries one of those — someone's own booking — their phone, email and what they paid go too. (A
// hotel's phone in her hotel pictures stays: it's the hotel's, and people need it.)
const PHONE = /\b(Phone|Tel|Mobile|Cell)([ \t]*:?[ \t]*)(\+?[\d ().-]{7,})/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PAID = /\b(Total due|Total paid|Amount paid|Total charged)([ \t]*:?[ \t]*)([^\n]{1,25})/gi;
const LEFT_OUT = "[left out by Wander]";

/** True when the text carries a person's own travel numbers — a picture like this isn't shown in Wander */
export function holdsPersonalNumbers(text: string | null | undefined): boolean {
  for (const m of (text || "").matchAll(PERSONAL_ID)) if (/\d/.test(m[3])) return true;
  return false;
}

export function withoutPersonalNumbers(text: string): string {
  if (!holdsPersonalNumbers(text)) return text;
  return text
    .replace(PERSONAL_ID, (m, label: string, sep: string, value: string) => (/\d/.test(value) ? `${label}${sep || " "}${LEFT_OUT}` : m))
    .replace(PHONE, (_m, label: string, sep: string) => `${label}${sep || " "}${LEFT_OUT}`)
    .replace(EMAIL, "[email left out by Wander]")
    .replace(PAID, (m, label: string, sep: string, value: string) => (/\d/.test(value) ? `${label}${sep || " "}${LEFT_OUT}` : m));
}

export function withoutFinancialDetails(text: string): string {
  // (a person's own numbers first: a 13-digit eTicket number would otherwise read as "[card ending …]"; then the
  // transit-card ID: its digits would otherwise be taken for a card number)
  return withoutPersonalNumbers(text)
    .replace(IC_ID, (_m, kind: string) => `${kind}… [card ID left out by Wander]`)
    .replace(CARD_NUMBER, (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 13 ? `[card ending ${digits.slice(-4)}]` : m;
    });
}
