/**
 * The forecast's words, the same on the day page and in Scout's answers (Ken, Oct 13: "yes. One unified and correct
 * source"). Two copies of this file, kept identical: frontend/src/lib/forecastWords.ts (the day page, Home) and
 * backend/src/services/forecastWords.ts (Scout's get_weather) — backend/tests/forecast-words-parity.test.ts fails when
 * they differ. No imports, so both builds take it as it is.
 */

export type ModelRain = "wet" | "dry" | "split" | "unknown";
export interface ForecastWords {
  lo: number; hi: number; rain: number | null; code: number | null;
  inches?: number | null; models?: ModelRain; outlook?: "forecast" | "early outlook";
  wet?: [number, number][]; showers?: [number, number][];
  place?: string; atHotel?: boolean; town?: string;
  also?: Omit<ForecastWords, "also" | "place"> & { place: string; when: "day" | "morning" };
}

/** The day's expected rain in inches, said right after the chance: " (.42\")" — Ken, Oct 13: "rain percentage is
 *  important, but especially in Japan, the quantity of rain matters… in parentheses right after the percentage" */
export const rainInches = (x: number | null | undefined, chance?: number | null) =>
  // (an amount that rounds to nothing beside a real chance of 20% or more is said as under .01 inch: "45% chance of
  // rain (0 inches)" read as a contradiction — verify52, Oct 14)
  // (a no-break space: at 375 pt "(1.91")" wrapped away from its "47%" — verify32)
  x == null ? "" : ` (${x >= 1 ? x.toFixed(2) : x === 0 ? ((chance ?? 0) >= 20 ? "under .01" : "0") : "." + x.toFixed(2).split(".")[1]}")`;

/** When in the day the rain is most likely, said after the chance: ", most likely 9–11 AM and 4–8 PM" (Ken's weather
 *  plan item 3, agreed Oct 13: the hourly rain window on the days just ahead). On today, only the hours still to come,
 *  worked out here on the phone so a copy kept from this morning never offers rain that's already been; "" when none
 *  is left. `now` is for tests. `part`: on a travel day, the hours they're in that place — the morning where the day
 *  starts (to 1 PM), the afternoon where they sleep (from noon); its hours ran to 10 PM, after they'd left (verify35). */
export function rainWhen(x: { wet?: [number, number][]; showers?: [number, number][] } | undefined, date: string, now = new Date(), part?: "morning" | "afternoon"): string {
  if (!x?.wet?.length && !x?.showers?.length) return "";
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  if (date < today) return "";
  const hour = date === today ? Number(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hourCycle: "h23" })) : 0;
  const [from, to] = part === "morning" ? [7, 13] : part === "afternoon" ? [12, 22] : [7, 22];
  const start = Math.max(from, hour);
  const ahead = (xs: [number, number][] | undefined) => (xs || []).map(([s, e]) => [Math.max(s, start), Math.min(e, to)] as [number, number]).filter(([s, e]) => s < e);
  const spans = ahead(x.wet), showers = ahead(x.showers);
  if (!spans.length && !showers.length) return "";
  const hours = spans.reduce((n, [s, e]) => n + e - s, 0);
  // (the day's hours, 7 AM to 10 PM — or what's left of today; not for part of a travel day)
  const left = 22 - start;
  // ("likely": beside "but the forecasts disagree", a bare "for the rest of the day" read oddly — verify34)
  if (!part && hour > 7 && left >= 2 && hours >= left) return ", likely for the rest of the day";
  if (!part && hours >= 10) return ", likely through most of the day";
  // (a time never splits across lines: "4–8" then "PM" did at 402 pt — no-break space, and a word joiner after the dash)
  const at = (h: number) => (h === 12 ? "noon" : `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`);
  const span = ([s, e]: [number, number]) => {
    // (rain under way — or from the first hour that counts — says when it ends: at 9:40 PM, "until 10 PM", not "from
    // 9 PM"; verify35)
    // (all of a travel day's part: "all morning" where it starts; "from noon" where they sleep)
    if (s <= start && e >= to && part === "morning" && start === 7) return "all morning";
    if (s <= start && e >= to && part === "afternoon" && start === 12) return "from noon";
    // (rain running past a travel morning's 1 PM: 1 PM is where Wander stops looking, not when the rain stops — "10 AM–1
    // PM" read as a forecast end; verify36)
    if (part === "morning" && e >= to) return s <= start ? "for the rest of the morning" : `from ${at(s)}`;
    if (s <= start) return `until ${at(e)}`;
    if (e >= 22) return `from ${at(s)}`;
    // ("9–11 AM", "4–8 PM"; "11 AM–1 PM", "10 AM–noon" when it crosses midday)
    const same = s !== 12 && e !== 12 && (s < 12) === (e < 12);
    return same ? `${s % 12 || 12}–⁠${at(e)}` : `${at(s)}–⁠${at(e)}`;
  };
  const main = !spans.length ? "" : spans.length > 2 ? `on and off ${at(spans[0][0])} to ${at(spans[spans.length - 1][1])}` : `most likely ${spans.map(span).join(" and ")}`;
  // (and showers one model alone sees — Japan's, for Mashiko's morning on Oct 14; two spans at most, or it's a list)
  const maybe = showers.length && showers.length <= 2 && spans.length <= 2 ? `showers possible ${showers.map(span).join(" and ")}` : "";
  return main && maybe ? `, ${main}, with ${maybe}` : main || maybe ? `, ${main || maybe}` : "";
}

/** On a day the main forecast gives a real chance of rain, what the other forecasts say: none of them shows rain to
 *  speak of ("drier"), some do and some don't ("split"), or null when they agree or weren't compared. Said which way —
 *  "disagree" alone didn't answer "will it rain?", and on Oct 19 all three showed only a trace (verify25) */
export const rainDisputed = (f: { rain: number | null; models?: ModelRain }): "drier" | "split" | null =>
  (f.rain ?? 0) < 30 ? null : f.models === "dry" ? "drier" : f.models === "split" ? "split" : null;

/** Rain likely: a 40%+ chance, or a rainy sky in the weather code (drizzle, rain, showers, thunder) */
export const rainLikely = (f: { rain: number | null; code: number | null }) => (f.rain ?? 0) >= 40 || (f.code !== null && ((f.code >= 51 && f.code <= 67) || (f.code >= 80 && f.code <= 99)));
/** A clear sky: weather code 0–1 and little chance of rain */
export const clearSky = (f: { rain: number | null; code: number | null }) => f.code !== null && f.code <= 1 && (f.rain ?? 0) < 20;

/** "the Ritz-Carlton, Nikko", "the Imperial Hotel" — and "Shirakabeso", "Shiraume" as they are */
export const theHotel = (s: string) => (/^the /i.test(s) || !/hotel|ritz|four seasons|six senses|marriott|hyatt|hilton|westin|peninsula|mandarin|conrad|andaz|intercontinental|\baman\b/i.test(s) ? s : `the ${s}`);

/** The day page's forecast lines, in its order: where her plan takes them that day first, when that's somewhere else (a
 *  day trip, or where a travel day starts — Ken, Oct 13: "both weathers should be there"), then where they sleep. Each
 *  with the picture beside it. `place`: the town to name when the forecast doesn't say where it's measured. */
export function forecastLines(f: ForecastWords, date: string, place: string, now = new Date()): { text: string; icon: "rain" | "sun" | "part" }[] {
  const icon = (x: { rain: number | null; code: number | null; models?: ModelRain }) => (rainDisputed(x) ? "part" : rainLikely(x) ? "rain" : clearSky(x) ? "sun" : "part");
  const how = (x: { rain: number | null; models?: ModelRain }) => (rainDisputed(x) === "drier" ? ", though other forecasts show little rain" : rainDisputed(x) === "split" ? ", but the forecasts disagree" : "");
  const lines: { text: string; icon: "rain" | "sun" | "part" }[] = [];
  const a = f.also;
  if (a) {
    lines.push({ icon: icon(a), text: `${a.outlook === "early outlook" ? "Early outlook" : "Forecast"} for ${a.place}${a.when === "day" ? ", the day trip" : ", where the day starts"}: ${a.lo}‑${a.hi}°F${a.rain !== null ? `, ${a.rain}% chance of rain${rainInches(a.inches, a.rain)}${rainWhen(a, date, now, a.when === "morning" ? "morning" : undefined)}` : ""}${how(a)}` });
  }
  // (where: that night's hotel when Wander knows it, else the town; how sure: past a week it's an early outlook, and a
  // rain chance the other forecasts don't share is said so — Ken's weather plan, Oct 13)
  const where = f.place ? (f.atHotel ? `at ${theHotel(f.place)}` : `for ${f.place}`) : `for ${place}`;
  lines.push({ icon: icon(f), text: `${f.outlook === "early outlook" ? "Early outlook" : "Forecast"} ${where}${a?.when === "morning" ? ", where you sleep" : ""}: ${f.lo}‑${f.hi}°F${f.rain !== null ? `, ${f.rain}% chance of rain${rainInches(f.inches, f.rain)}${rainWhen(f, date, now, a?.when === "morning" ? "afternoon" : undefined)}` : ""}${how(f)}` });
  return lines;
}
