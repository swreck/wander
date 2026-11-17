/**
 * A weekday Scout writes beside a date is checked against the calendar (Nov 17 2026: asked where they sleep on the 22nd,
 * Scout said "Monday, Dec 22" when its own context said "2026-12-22 (Tue)"). Pure: no database, no clock.
 * The year of a mention is the one that puts the date inside the trip's dates widened by 60 days each side; when no year
 * does, or two do, the mention is skipped. A weekday joined to the one before it ("Wed–Thu, Dec 23–24", "Wed and Thu,
 * Dec 23") is a range or a list and is skipped. A weekday and a month start with a capital, as Scout writes them: "the
 * morning sun, Jan 2" and "where you sat Dec 20" are not weekdays.
 */
export type TripRange = { start: string; end: string };
export type WrongWeekday = { said: string; date: string; is: string };

const FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY = "Monday|Mon|Tuesday|Tues|Tue|Wednesday|Weds|Wed|Thursday|Thurs|Thur|Thu|Friday|Fri|Saturday|Sat|Sunday|Sun";
const MONTH = "January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept|Sep|October|Oct|November|Nov|December|Dec";
const MENTION = new RegExp(`\\b(${WEEKDAY})(\\.?,\\s*|\\s+)((${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b)`, "g");
const JOINED = new RegExp(`\\b(?:${WEEKDAY})\\.?\\s*(?:-|–|—|/|to|and|&)\\s*$`);
const DAY_MS = 86_400_000;

const dayOf = (ymd: string): number | null => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) && !isNaN(Date.parse(`${ymd}T00:00:00Z`)) ? Date.parse(`${ymd}T00:00:00Z`) : null);
const monthNumber = (word: string): number => ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(word.slice(0, 3).toLowerCase());
const weekdayNumber = (word: string): number => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(word.slice(0, 3).toLowerCase());

type Found = { from: number; to: number; weekdayLen: number; said: string; date: string; is: string; right: boolean };

function scan(text: string, range: TripRange): Found[] {
  const a = dayOf(range?.start), b = dayOf(range?.end);
  if (a == null || b == null || !text) return [];
  const lo = a - 60 * DAY_MS, hi = b + 60 * DAY_MS;
  const y0 = new Date(a).getUTCFullYear() - 1, y1 = new Date(b).getUTCFullYear() + 1;
  const out: Found[] = [];
  for (const m of text.matchAll(MENTION)) {
    const at = m.index!;
    if (JOINED.test(text.slice(Math.max(0, at - 24), at))) continue;
    const month = monthNumber(m[4]), day = Number(m[5]);
    const years: number[] = [];
    for (let y = y0; y <= y1; y++) {
      const t = Date.UTC(y, month, day);
      if (new Date(t).getUTCMonth() !== month) continue;   // (Feb 30 is not a date)
      if (t >= lo && t <= hi) years.push(y);
    }
    if (years.length !== 1) continue;
    const t = Date.UTC(years[0], month, day);
    const real = new Date(t).getUTCDay();
    out.push({ from: at, to: at + m[0].length, weekdayLen: m[1].length + m[2].length, said: m[0], date: new Date(t).toISOString().slice(0, 10), is: FULL[real], right: weekdayNumber(m[1]) === real });
  }
  return out;
}

/** The weekday-and-date mentions in the text whose weekday is not the one that date falls on */
export function wrongWeekdays(text: string, range: TripRange): WrongWeekday[] {
  return scan(text, range).filter((f) => !f.right).map((f) => ({ said: f.said, date: f.date, is: f.is }));
}

/** The same text with each wrong weekday word, and its comma and space, taken out ("The night of Dec 22") */
export function withoutWrongWeekdays(text: string, range: TripRange): string {
  let out = "";
  let at = 0;
  for (const f of scan(text, range)) {
    if (f.right) continue;
    out += text.slice(at, f.from) + text.slice(f.from + f.weekdayLen, f.to);
    at = f.to;
  }
  return out + text.slice(at);
}
