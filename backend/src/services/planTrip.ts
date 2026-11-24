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

/** Which of these trips are plan trips: one query for the whole list (S2d) */
export async function planTripIds(tripIds: string[]): Promise<Set<string>> {
  if (!tripIds.length) return new Set();
  const rows = await prisma.guideSnapshot.findMany({ where: { tripId: { in: tripIds }, status: "current" }, select: { tripId: true, sourceKind: true } });
  return new Set(rows.filter((r) => isPlanKind(r.sourceKind)).map((r) => r.tripId));
}

/** The plan's own source names ("Larisa's notes", "Backroads' itinerary"), in order of first use by date then time.
 *  A " + " joined source counts as its parts. */
export async function planSourcesOf(tripId: string): Promise<string[]> {
  const items = await prisma.guideItem.findMany({ where: { tripId }, select: { source: true, date: true, time: true, sortOrder: true }, orderBy: [{ date: "asc" }, { time: "asc" }, { sortOrder: "asc" }] });
  const seen = new Set<string>();
  for (const i of items) for (const part of (i.source || "").split(" + ")) { const p = part.trim(); if (p) seen.add(p); }
  return [...seen];
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
- Languages: "INTO JAPANESE" is for Japan. In Vietnam the same rule gives Vietnamese, in Cambodia Khmer. The phrase
  card holds Japanese only so far: outside Japan give the words in your answer, and never add_phrase them.
- Money: Wander keeps yen and US dollars only so far. Outside Japan a number with no currency is not yen: ask which
  currency. Pass add_expense a currency only when they said one. For dong, riel or any other currency, say Wander
  can't keep that currency yet, and keep nothing.
- Past, now and ahead come from RIGHT NOW. Before saying something has happened (checked in, landed, left),
  compare its date and clock with RIGHT NOW; what is still ahead is said as ahead ("you check in Sun, Dec 20").
  Say "today", "tonight" or "tomorrow" of a plan line only when its date is that day on the calendar in RIGHT
  NOW; otherwise give its weekday and date. A weekday is the one written beside the date in DAY BY DAY or WHERE
  EVERYONE SLEEPS: never work one out.`;

/** The two sentences of the prompt (rules 61 and 63) that name Japan's yen and Japan's clock, and what a plan trip says instead */
const SWAPS: [string, string][] = [
  ["the amount as said, yen unless they said dollars, and what it was for", "the amount as said, the currency only if they said one (on a day in Japan, yen unless they said dollars), and what it was for"],
  ["gets until: that moment, Japan time; it's gone", "gets until: that moment on that day's own clock; it's gone"],
  // (the weather, Nov 23 2026: get_weather answers for every country of the trip, a town on the way too, and a day too
  // far ahead comes with what past years were like. Japan's five sentences in the look-it-up rule and rule 46g, and
  // what a plan trip is told in their place)
  ["how to get from A to B, the weather outside Japan (in Japan it's get_weather, rule 46g), what a station exit is", "how to get from A to B, what a station exit is"],
  ["For a town in Japan that isn't where their plan has them that day, get_weather with town, and say in a short clause that their plan has them elsewhere.",
    "For a town in any of the trip's countries that isn't where the plan has them that day, get_weather with town, and say in a short clause that the plan has them elsewhere. It takes a town's own name: for a sight (a temple, a bay, a park), give the town people stay in to see it, only if you are sure which town that is, and say that the forecast is that town's. When it can't place a town, say so; never give a forecast of your own for it."],
  ["(the service they named first; else Japan's weather agency or tenki.jp)", "(the service they named first; else, for a town in Japan, Japan's weather agency or tenki.jp)"],
  ["Unasked, never a weather site's numbers in Japan. Outside Japan, web_search, said as found online.", "Unasked, never a weather site's numbers, in any country of the trip: the weather is get_weather's."],
  ["When get_weather has no forecast for a day (over, or more than 16 days ahead), say so; her pre-trip forecast in the Guide may be given then, said as hers, written before the trip.",
    "When get_weather has no forecast for a day (over, or more than 16 days ahead), say so. A day too far ahead may come with \"typical\": what that week was like there in past years. Say first that there's no forecast yet, then give it as past years, with its years and its counts as they are (\"in the same week of 2021–2025 it rained on 32 of those 35 days\"); never as a forecast, a chance or what to expect, and never a percentage worked out from the counts."],
];

/** Scout's packing rule (the whole line: Japan's is Japan's own list, Julie's offer, ryokans and bullet trains) and the
 *  one a plan trip has in its place (Nov 24 2026): the checked notes of services/planPacking.ts, country by country. */
export const PACKING_RULE_START = "46f. Packing:";
export const PLAN_PACKING_RULE = `46f. Packing: "what should I pack / bring", "anything I might not think to pack", for the whole trip or for one country → packing_tips, and answer only from what it returns. Its sections come in order, one for each country of this person's own days: name the country with their dates there as given, then its notes, each ONE plain sentence saying what to bring and why, with who says so in a few words (the note's "from"). Give a note's link only when they ask where it comes from. Keep each note's own strength: "may be refused" is never "will be", "some" is never "most", a habit residents report is never a rule, and a town its source doesn't name is never called safe. A note with tieTo is tied to a day only as its tieTo says and only when DAY BY DAY shows it for them, by date ("Sun, Dec 27"), never by Backroads' day number. Asked about one country, give only that country's notes. When it returns weather, that comes first, made exactly as its "how" says: at most three items, and past years are never a forecast. A weather follow-up after it is a weather question: get_weather (rule 46g). The whole answer stays under about 350 words, each note about 25 at most: someone reading on a phone while they pack. Add no items of your own and no general travel advice, and nothing Backroads' own notes already tell them (rain gear, wet-weather shoes, a fleece, long pants, light clothes, passport rules). When it returns noNote, say it in one short line after the notes, as given. Asked about a thing the notes don't cover: "Wander has no checked note on it"; web_search only if they then ask, and say what you find as found online. Their days are "your" days. End with its "end" line, once.`;

/** Scout's rule 55 sends visa, vaccine and health questions to get_travel_advisories: a list from April 2026 whose
 *  sources Wander has never opened (it gives a Cambodian visa's prices). A plan trip is not sent that tool, and has this
 *  in the rule's place (Nov 24 2026, after Scout answered "Do I need a visa for Cambodia?" from that list): the checked
 *  notes of services/planPacking.ts, or "Wander has no checked note on it". */
export const ADVISORY_TOOL = "get_travel_advisories";
export const ADVISORY_RULE_START = "55. Use get_travel_advisories";
export const PLAN_ADVISORY_RULE = `55. Visas, entry papers, vaccines, shots, malaria, medicines at the border, and "what do I need for this trip?": Wander holds only its checked notes, and they come from packing_tips (among them: the Vietnam e-visa on paper, Cambodia's e-Arrival card, medicines, repellent, and what CDC's lists say of malaria). Call packing_tips with notesOnly: true and answer from the note or notes that cover the question, in a few lines, each with who says so; not the whole list, and no closing line. On malaria: what CDC says, as the note has it; a town CDC's lists don't name is said as not named; dengue as the note has it; and whether to take pills is for their doctor or a travel clinic. Never your own view of the risk, and nothing about their route or their riding that the note doesn't say. What no note covers (whether a visa is needed, what it costs, how to apply, which shots to get): say "Wander has no checked note on it" and give no answer from your own memory, not even as a likely one: a rule or a price remembered may be out of date, and people act on it. Then offer to search; web_search only if they ask, said as found online with the page it came from, and the country's official site named as the place to confirm.`;

/**
 * Scout's prompt for a plan trip: today's prompt with the block right after its first paragraph, and the date rule,
 * the sentences that name Japan, the packing rule and the visa-and-health rule replaced. Nothing else changes. If a spot can't be found the
 * prompt has changed under this function, and it says so loudly rather than quietly sending Scout a prompt that says
 * something untrue.
 */
export function planSystemPrompt(base: string): string {
  const gone = () => new Error("Scout's prompt no longer has the spots the plan trip's prompt is made from");
  const firstEnd = base.indexOf("\n\n");
  const start = base.indexOf(GUIDE_DATE_RULE_START);
  if (firstEnd < 0 || start < 0) throw gone();
  const end = base.indexOf("\n", start);
  let withRule = `${base.slice(0, start)}${PLAN_DATE_RULE}${base.slice(end < 0 ? base.length : end)}`;
  for (const [was, now] of SWAPS) {
    if (!withRule.includes(was)) throw gone();
    withRule = withRule.replace(was, () => now);
  }
  // (the packing rule: the whole line, from its number at the start of a line to the line's end)
  const pack = withRule.indexOf(`\n${PACKING_RULE_START}`);
  if (pack < 0) throw gone();
  const packEnd = withRule.indexOf("\n", pack + 1);
  withRule = `${withRule.slice(0, pack + 1)}${PLAN_PACKING_RULE}${withRule.slice(packEnd < 0 ? withRule.length : packEnd)}`;
  // (the visa-and-health rule: the whole line, the same way)
  const adv = withRule.indexOf(`\n${ADVISORY_RULE_START}`);
  if (adv < 0) throw gone();
  const advEnd = withRule.indexOf("\n", adv + 1);
  withRule = `${withRule.slice(0, adv + 1)}${PLAN_ADVISORY_RULE}${withRule.slice(advEnd < 0 ? withRule.length : advEnd)}`;
  return `${withRule.slice(0, firstEnd)}\n\n${PLAN_BLOCK}${withRule.slice(firstEnd)}`;
}

/** The three tool descriptions that name Japan's clock, yen or Japan's dates, and what a plan trip is told instead (Nov 17 2026) */
const TOOL_WORDS: { tool: string; field: string; now: string }[] = [
  { tool: "tell_everyone", field: "until", now: "That day's own clock, YYYY-MM-DDTHH:MM, when its moment has passed (a bus leaving at 8:15 tomorrow → that time). Only for a message about a moment; otherwise leave out (it shows for 3 days)." },
  { tool: "add_expense", field: "currency", now: "Only the currency they said: JPY (yen) or USD (dollars). Leave out when they said none." },
  { tool: "get_weather", field: "dates", now: "The trip's dates, YYYY-MM-DD (today if none). Up to 16." },
  { tool: "get_weather", field: "town", now: "Only for a town that isn't where the plan has them, or one their day passes through. The town's own name, in one of the trip's countries: for a sight (a temple, a bay), the town people stay in to see it." },
  { tool: "get_weather", field: "hours", now: "Hours on that day's own clock (with town, the town's), 0–23, both included: { from: 13, to: 18 } for 1 to 6 PM. For a question about part of a day ('this afternoon', 'from 1 to 6', 'when we ride')." },
];

/** A tool's own words that name Japan, and what a plan trip is told instead (Nov 23 2026). `has`: words of Japan's that
 *  must still be there, so a change to the shared words is noticed here. */
const TOOL_OWN_WORDS: { tool: string; has: string; now: string }[] = [
  { tool: "get_weather", has: "With town: any other town in Japan on those days",
    now: "Wander's own forecast: the one the day pages and Home show, for the person asking, in every country of the trip. For each day: where they sleep that night (their hotel), and where the plan takes them that day when that's somewhere else (a day trip, or where a travel day starts); the temperatures, the chance of rain and how much, the hours rain is most likely (up to 3 days out), and how sure. Use for ANY weather question about the trip's days: today, tonight, tomorrow, this week, 'do I need an umbrella', 'will it be cold in the north'. With town: any other town in the trip's countries on those days, including one their day passes through (where a ride, walk or tour goes). With hours: the temperature and chance of rain hour by hour for that part of the day, and how far Europe's and the US forecasts run from it. A day more than 16 days ahead has no forecast yet: it comes with what that week was like there in past years." },
  // (Nov 24 2026: Japan's words are "what Americans wish they'd brought to Japan")
  { tool: "packing_tips", has: "wish they'd brought to Japan",
    now: "Wander's checked packing notes for this trip: for each country of the asker's own days, what to bring and why, each with who says so and a link to the page, and the weather where they sleep (the forecast when the days are near, past years when they are far off). Use when someone asks what to pack or bring, for the whole trip or for one country, and for a question about a visa, an entry paper, vaccines, malaria or medicines (then with notesOnly)." },
];

/** What packing_tips takes on a plan trip only: the notes alone, for a question about one thing (rule 55) */
const NOTES_ONLY = { type: "boolean", description: "true for a question about one thing (a visa, an entry paper, medicines, malaria, a dress rule): the checked notes alone, without the weather." };

/** The tools Scout is sent on a plan trip: a copy with those descriptions changed, and without the April advisory list
 *  (its sources were never opened: ADVISORY_TOOL). The shared array is never touched. */
export function planTools<T extends { name: string }>(offered: T[]): T[] {
  return offered.filter((t) => t.name !== ADVISORY_TOOL).map((t) => {
    const mine = TOOL_WORDS.filter((x) => x.tool === t.name);
    const own = TOOL_OWN_WORDS.find((x) => x.tool === t.name);
    if (!mine.length && !own) return t;
    const copy: any = JSON.parse(JSON.stringify(t));
    for (const { field, now } of mine) {
      if (!copy.input_schema?.properties?.[field]) throw new Error(`Scout's tool ${t.name} no longer has "${field}"`);
      copy.input_schema.properties[field].description = now;
    }
    if (own) {
      if (typeof copy.description !== "string" || !copy.description.includes(own.has)) throw new Error(`Scout's tool ${t.name} no longer says "${own.has}"`);
      copy.description = own.now;
    }
    if (t.name === "packing_tips") {
      if (!copy.input_schema?.properties) throw new Error("Scout's tool packing_tips no longer takes anything");
      copy.input_schema.properties.notesOnly = NOTES_ONLY;
    }
    return copy as T;
  });
}
