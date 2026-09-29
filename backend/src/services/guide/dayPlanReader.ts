/**
 * Reads Larisa's day-plan tabs — whatever their layout — into dated time blocks, some with several
 * choices ("Dinner: A, B or C").
 *
 * Her tabs don't share one layout: "Tokyo Activities" is one free-text cell ("Day 1: Ginza…",
 * "8:30 AM – 11:00 AM: Tsukiji Outer Market" with Transit/Experience lines under it) and gives no date;
 * other tabs are tables by date. So a model reads the tab, and Wander then CHECKS the reading against
 * her text: every block, heading and choice must quote words that are actually in the tab, or it's
 * dropped. A plan with no stated date is matched to a trip day only with a stated reason (shown to
 * people as Wander's match, never as hers). Readings are cached by the tab's text, so an unchanged
 * tab is never read again and a changed one is read in seconds.
 */

import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";

const MODEL = "claude-opus-5";

export interface PlanChoice { name: string; note: string | null }
export interface PlanBlock {
  timeText: string | null;       // the time exactly as she wrote it ("~8:30–9:15", "Morning", "6:30 PM")
  who: string | null;            // when she names people for the block ("You + Julie", "Ken + Andy") — as written
  start: string | null;          // HH:MM, 24-hour
  end: string | null;
  approx: boolean;               // she wrote "~", "about", "around"
  label: string;                 // what the block is, in her words ("Tsukiji Outer Market", "Dinner")
  kind: "meal" | "activity" | "travel" | "rest" | "other";
  choices: PlanChoice[];         // two or more options for this block; empty when it's one thing
  notes: string | null;          // her Transit / Experience lines, trimmed, in her words
  quote: string;                 // the exact line(s) of her tab this block comes from
}
export interface DayPlan {
  heading: string;               // her heading for the day, as written ("Day 1: Ginza Retail…")
  date: string | null;           // YYYY-MM-DD when the tab states it
  matchedDate: string | null;    // when it doesn't: the trip day Wander matched it to
  matchReason: string | null;    // why ("both are the Ginza shopping day") — shown with the match
  blocks: PlanBlock[];
}
export interface DayPlanReading { plans: DayPlan[] }

const s = { type: "string" };
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["plans"],
  properties: {
    plans: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["heading", "date", "matchedDate", "matchReason", "blocks"],
        properties: {
          heading: s, date: s, matchedDate: s, matchReason: s,
          blocks: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              required: ["timeText", "who", "start", "end", "approx", "label", "kind", "choices", "notes", "quote"],
              properties: {
                timeText: s, who: s, start: s, end: s, approx: { type: "boolean" }, label: s,
                kind: { type: "string", enum: ["meal", "activity", "travel", "rest", "other"] },
                choices: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "note"], properties: { name: s, note: s } } },
                notes: s, quote: s,
              },
            },
          },
        },
      },
    },
  },
};

const SYSTEM = `You read one tab of a family's trip-planning spreadsheet, written by Larisa. Some tabs hold a plan for one or more days: time blocks ("8:30 AM – 11:00 AM: Tsukiji Outer Market"), sometimes with several choices for one block (a few restaurants for dinner, "A or B"). Your reading goes on each day's screen in the family's app and must be exactly faithful — people rely on it while traveling.

Return "plans": one per day the tab plans. If the tab plans no specific day (hotel comparisons, reference lists, emails), return no plans.
- "heading": the day's heading exactly as written (or "" if none).
- "date": YYYY-MM-DD only when the tab states the date. A date without a year belongs to this trip.
- When the tab gives no date ("Day 1"), use the trip's day-by-day overview (given below) to set "matchedDate" to the ONE day it clearly belongs to, and "matchReason" to a short plain reason a traveler would accept ("both are the Ginza shopping day in Tokyo"). If it isn't clear, leave both "" — never guess.
- "blocks": the day's time blocks in her order. When a tab gives the same day twice (a list of stops AND a timed plan), use the timed plan as the blocks and don't repeat the stops.
- "timeText": the block's time exactly as written in the tab ("~8:30–9:15", "11:00–11:30 entry", "Morning", "After dinner", "6:30 PM"); a spreadsheet time like "18:00:00" is written "6:00 PM". "" when none.
- "start"/"end": 24-hour HH:MM (a range "8:30 AM – 11:00 AM" → 08:30 / 11:00; one time "6:30 PM" → start only; a time with no AM/PM takes the one that fits the day's order — "~2:00–3:30" after lunch is 14:00–15:30; "" for words like "Morning"). "approx" true when she marked the time as rough (~, about, around, -ish).
- "who": when the block names who it's for ("You + Julie", "Ken + Andy", "for 5, including Kimiko"), those words exactly; otherwise "". (The tab's author, Larisa, writes "You" for herself.)
- "label": what the block is, in her words, short ("Tsukiji Outer Market", "LIGHT LUNCH – Ginza Mitsukoshi Depachika", "DINNER RESERVATION – Yakiniku Yazawa Tokyo (Ginza)").
- "choices": when she offers two or more options for the block, each with its name as written and her note ("" if none). Otherwise [].
- "notes": her supporting lines for the block (transit, what it is), trimmed but in her words; "" if none.
- "quote": the exact words of the block's main line from the tab, copied character for character.
- Use "" for anything not stated. Never add places, times or advice she didn't write.`;

/** Bump when the instructions above change, so cached readings are read again. */
const READER_VERSION = "1";

let client: Anthropic | null = null;
const anthropic = () => (client ||= new Anthropic());

export function dayPlanHash(text: string): string {
  return crypto.createHash("sha256").update(`dayplan-${READER_VERSION}\n${text}`).digest("hex");
}

/** A tab that might plan days: time blocks, or dates with activities, with enough text to be a plan */
export function looksLikeDayPlan(text: string): boolean {
  const times = (text.match(/\b\d{1,2}(:\d{2})?\s*(AM|PM|a|p)\b/gi) || []).length;
  // A pasted booking email or confirmation is read for bookings, never as a day plan (the Four Seasons
  // email was once mistaken for one, and its deadline and check-in went missing)
  const email = /\b(dear\s|we are pleased|we look forward to welcoming|sincerely|best regards|kind regards|confirmation\s*#|reservation id|booking reference)\b/i.test(text);
  return text.length > 200 && !email && (times >= 3 || /\bday\s*\d+\b/i.test(text));
}

// Words compared loosely: spacing, line breaks ("⏎"), dashes and quotes as she typed them may differ
const flat = (t: string) => t.toLowerCase().replace(/⏎/g, " ").replace(/[–—−]/g, "-").replace(/[“”"'’]/g, "").replace(/\s+/g, " ").trim();

/** Keep only what her tab actually says (see the header comment) */
export function verifyAgainstTab(reading: DayPlanReading, tabText: string, tripDays: Set<string>): { reading: DayPlanReading; dropped: number } {
  const hay = flat(tabText);
  const inTab = (t: string | null | undefined) => !!t && flat(t).length >= 3 && hay.includes(flat(t));
  let dropped = 0;
  const plans: DayPlan[] = [];
  for (const p of reading.plans) {
    const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
    const date = clean(p.date);
    let matchedDate = clean(p.matchedDate);
    const matchReason = clean(p.matchReason);
    const blocks = p.blocks.filter((b) => {
      const ok = inTab(b.quote) && (inTab(b.label) || flat(b.quote).includes(flat(b.label)));
      if (!ok) dropped++;
      return ok;
    }).map((b) => ({
      ...b,
      // "18:00:00" is how a spreadsheet time reads; anything else must be her own words
      timeText: clean(b.timeText) && (inTab(b.timeText) || /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(b.timeText!.trim())) ? b.timeText!.trim() : null,
      who: clean(b.who) && inTab(b.who) ? b.who!.trim() : null,
      start: /^\d{2}:\d{2}$/.test(b.start || "") ? b.start : null,
      end: /^\d{2}:\d{2}$/.test(b.end || "") ? b.end : null,
      notes: clean(b.notes),
      choices: b.choices.filter((c) => { const ok = inTab(c.name); if (!ok) dropped++; return ok; }).map((c) => ({ name: c.name.trim(), note: clean(c.note) })),
    }));
    // A date has to be a day of this trip; a match needs its reason
    const realDate = date && tripDays.has(date) ? date : null;
    if (!realDate && (!matchedDate || !matchReason || !tripDays.has(matchedDate))) matchedDate = null;
    if (!blocks.length) continue;
    // No stated date and no trip day it clearly belongs to: left out of the days (still readable under the tab)
    if (!realDate && !matchedDate) { dropped += blocks.length; continue; }
    plans.push({ heading: inTab(p.heading) ? p.heading.trim() : "", date: realDate, matchedDate: realDate ? null : matchedDate, matchReason: realDate ? null : matchReason, blocks });
  }
  return { reading: { plans }, dropped };
}

export async function readDayPlans(tabName: string, text: string, tripDates: string, overview: string): Promise<{ reading: DayPlanReading | null; failure?: string }> {
  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `The trip runs ${tripDates}. Its day-by-day overview (from the Itinerary tab):\n${overview}\n\nTab "${tabName}":\n\n${text.slice(0, 60000)}` }],
  } as any);
  if (response.stop_reason === "refusal") return { reading: null, failure: "Claude declined to read this tab." };
  const out = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!out) return { reading: null, failure: "No reading came back." };
  try {
    return { reading: JSON.parse(out) as DayPlanReading };
  } catch {
    return { reading: null, failure: "The reading came back in an unusable form." };
  }
}
