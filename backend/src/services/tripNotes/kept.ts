/**
 * What Scout keeps in someone's Notes is their own words, never Scout's (Ken, Oct 10 2026; a note app once kept
 * "themes" instead of what he said). Scout names the words; they're kept only if they are found in what the person
 * actually said — and then exactly as the person wrote them (their spelling, capitals, punctuation), not as Scout
 * copied them. Matching ignores case, spacing and punctuation only.
 */

const WORDY = /[\p{L}\p{N}]/u;

/** Letters and numbers, lower case, one space between words — with where each character came from */
function plain(s: string): { text: string; from: number[] } {
  let text = "";
  const from: number[] = [];
  let gap = true;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (WORDY.test(c)) {
      const low = c.toLowerCase();
      text += low.length === 1 ? low : c;
      from.push(i);
      gap = false;
    } else if (!gap) {
      text += " ";
      from.push(i);
      gap = true;
    }
  }
  if (text.endsWith(" ")) { text = text.slice(0, -1); from.pop(); }
  return { text, from };
}

/**
 * The person's own words for `named`, taken from the first of `said` (their messages, newest first) that holds them;
 * null when none does.
 */
export function keptWords(named: string, said: string[]): string | null {
  const want = plain(named).text;
  if (!want) return null;
  for (const s of said) {
    if (!s) continue;
    const p = plain(s);
    // (whole words only: "art" is not kept from "Arita")
    let at = p.text.indexOf(want);
    const whole = (i: number) => (i === 0 || p.text[i - 1] === " ") && (i + want.length === p.text.length || p.text[i + want.length] === " ");
    while (at >= 0 && !whole(at)) at = p.text.indexOf(want, at + 1);
    if (at < 0) continue;
    let start = p.from[at];
    let end = p.from[at + want.length - 1] + 1;
    // the punctuation that closes or opens what they wrote stays with it (a full stop, a closing bracket, a quote)
    while (end < s.length && !/\s/.test(s[end]) && !WORDY.test(s[end])) end++;
    while (start > 0 && !/\s/.test(s[start - 1]) && !WORDY.test(s[start - 1])) start--;
    return s.slice(start, end).replace(/^\s+|\s+$/g, "");
  }
  return null;
}
