/**
 * A trip built from a plan (December plan, S2b, Nov 17 2026). Wander holds this trip's plan itself: its current snapshot
 * has sourceKind "wander_plan". Everything that asks "is this a plan trip?" asks here, and this is where Scout's prompt
 * for such a trip is made from the one it has always had. A Guide trip's prompt is returned untouched.
 */
import prisma from "./db.js";

export const PLAN_KIND = "wander_plan";

/** A snapshot of this kind is a plan Wander holds, not a spreadsheet it read */
export const isPlanKind = (sourceKind: string | null | undefined) => sourceKind === PLAN_KIND;

/** Is the trip's current snapshot a plan? A trip with no snapshot is not. */
export async function isPlanTrip(tripId: string | null | undefined): Promise<boolean> {
  if (!tripId) return false;
  const s = await prisma.guideSnapshot.findFirst({ where: { tripId, status: "current" }, orderBy: { importedAt: "desc" }, select: { sourceKind: true } }).catch(() => null);
  return isPlanKind(s?.sourceKind);
}

/** Scout's rule for dates in the Guide (the whole bullet) and the one that replaces it on a plan trip */
export const GUIDE_DATE_RULE_START = "- Every date in the Guide is a Japan date.";
export const PLAN_DATE_RULE = "- Every date is the date in that day's country, as DAY BY DAY names it. Before saying where someone is on a date, read that date's lines; never map a date onto another country's calendar.";

/** The block that comes right after Scout's first paragraph on a plan trip (word for word, Nov 17 2026) */
export const PLAN_BLOCK = `THIS TRIP IS BUILT FROM A PLAN, NOT A SPREADSHEET. Read this first. Where it differs from a rule below, this wins.
- The plan is the one Larisa and Ken are building for this trip. Wander holds it as plan lines, and each line says
  where it came from ("Larisa's notes", "Backroads' itinerary"). Call it "the plan": "the plan has…", "that isn't in
  the plan yet". On this trip there is no Guide, no sheet, no tab, no cell and no rail sheet: never say those words.
  Where a rule below says "the Guide" or "her sheet", read "the plan". A fact from Larisa's notes is Larisa's; a fact
  from Backroads' itinerary is Backroads'.
- The plan is unfinished, and many days have nothing in it yet. Of a day with no lines, say that nothing is in the
  plan for it yet, and name where they sleep that night if the plan has it. Never fill a day with ideas said as
  plans. A person whose travel the plan doesn't hold: say the plan doesn't have their travel yet.
- The trip crosses countries. Each day in DAY BY DAY names its country and its clock, and a line on another clock
  says so in brackets. A date is the date where the people are that day: the day they leave home is the date at
  home. Every time you give names its clock ("9:45 PM Vietnam time", "11:45 AM California time"). Never say "Japan
  time" for a time outside Japan, and never give two flights' times as if they were on one clock.
- Backroads days are marked "with Backroads". Their lines are Backroads' itinerary, and the leaders set the times on
  the day. When a line has no time, say the plan gives none; never estimate one as the plan.
- What is Japan's only: the storm watch, Tabelog, search_train_schedules and the JR pages. Use them for the days in
  Japan. On a day outside Japan, storms, typhoons and warnings: say Wander's storm watch covers Japan only and has
  not checked that country; if they want, web_search, said as found online.
- Languages: "INTO JAPANESE" is for Japan. In Vietnam the same rule gives Vietnamese, in Cambodia Khmer.
- Money: Wander keeps yen and US dollars only so far. Outside Japan a number with no currency is not yen: ask which
  currency. For dong, riel or any other currency, say Wander can't keep that currency yet, and keep nothing.`;

/**
 * Scout's prompt for a plan trip: today's prompt with the block right after its first paragraph and the one date rule
 * replaced. Nothing else changes. If either spot can't be found the prompt has changed under this function, and it
 * says so loudly rather than quietly sending Scout a prompt that says something untrue.
 */
export function planSystemPrompt(base: string): string {
  const firstEnd = base.indexOf("\n\n");
  const start = base.indexOf(GUIDE_DATE_RULE_START);
  if (firstEnd < 0 || start < 0) throw new Error("Scout's prompt no longer has the spots the plan trip's prompt is made from");
  const end = base.indexOf("\n", start);
  const withRule = `${base.slice(0, start)}${PLAN_DATE_RULE}${base.slice(end < 0 ? base.length : end)}`;
  return `${withRule.slice(0, firstEnd)}\n\n${PLAN_BLOCK}${withRule.slice(firstEnd)}`;
}
