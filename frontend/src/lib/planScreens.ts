// Small pure choices the screens make on a trip built from a plan (S3 fix, Nov 17 2026). Each takes what it needs, so a
// test can call it without a browser, and a sheet trip keeps its old answer.

/** A day with no lines: "The plan has nothing set for this day." Where the day has a real summary and the trip is a plan,
 *  the summary already says what the day is, so the plan has "no times set" (S3 fix 7). A sample summary isn't one. */
export function emptyDayLine(guideWord: string, opts: { plan: boolean; hasRealSummary: boolean }): string {
  return `${guideWord} ${opts.plan && opts.hasRealSummary ? "has no times set for this day." : "has nothing set for this day."}`;
}

/** Before the trip, Next's line: "The trip starts in 27 days" when the day shown is the trip's first, else "You leave tomorrow" (the day you leave). */
export function startWords(first: string, tripFirst: string, leaveDay: string, today: string): string {
  const n = Math.round((new Date(`${leaveDay}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
  return `${first === tripFirst ? "The trip starts" : "You leave"} ${n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}`;
}

export interface CityForMaybes { id: string; name: string; hidden?: boolean | null }
export interface DayForMaybes { date: string; cityId?: string | null }

/**
 * Which cities get a tab on Maybes on a plan trip (S3 fix 12): every city that isn't hidden and has a day today or later,
 * in trip order, with or without maybes. A city today is in it. After the trip's last day: none (the caller keeps today's
 * behaviour then). `cities` are in trip order; `days` carry their city.
 */
export function planMaybeCities<C extends CityForMaybes>(cities: C[], days: DayForMaybes[], today: string): C[] {
  const ahead = new Set(days.filter((d) => d.date.slice(0, 10) >= today && d.cityId).map((d) => d.cityId as string));
  return cities.filter((c) => !c.hidden && ahead.has(c.id));
}
