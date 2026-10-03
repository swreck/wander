/**
 * Before a later traveler leaves home (Julie and Andy fly Oct 13, a week after Ken and Larisa start): a card once a day
 * with how many days until they leave and one fact about Japan, Tokyo or Kyoto (Ken, Oct 2 2026). Ken sees the same
 * card for them, headed "If Julie and Andy open Wander today…".
 *
 * The day they leave is the one Home counts to — the party's own first flight or check-in in her Guide, the date they
 * leave home (Oct 13), not the Japan date they land (Oct 14) — one function for both, so the two can never disagree.
 * (Ken: "if they go to the airport on the wrong day because of Wander, I will never hear the end of it.")
 */
import type { GuideItem } from "./guideData";
import { ymd, isLanding, partiesOf } from "./guideDisplay";

/** A party's own first day: its first flight or check-in in her Guide (Home's "You leave in N days" counts to it) */
export function ownFirstDay(items: GuideItem[], party: string | null, tripFirst: string): string {
  const mine = party ? items.filter((i) => i.date && i.forWhom === party && ["flight", "checkin"].includes(i.kind) && !isLanding(i)) : [];
  return mine.map((i) => ymd(i.date)).sort()[0] || tripFirst;
}

/** What starts that day for them: their flight (or, with none, their check-in) */
export function firstLeg(items: GuideItem[], party: string, day: string): GuideItem | null {
  const on = items.filter((i) => i.forWhom === party && ymd(i.date) === day && ["flight", "checkin"].includes(i.kind) && !isLanding(i));
  return on.find((i) => i.kind === "flight") || on[0] || null;
}

/** The parties who leave home after the trip has begun (Julie & Andy), each with their day and flight */
export function laterParties(items: GuideItem[], tripFirst: string): { party: string; day: string; leg: GuideItem | null }[] {
  return partiesOf(items)
    .map((party) => ({ party, day: ownFirstDay(items, party, tripFirst) }))
    .filter((p) => p.day > tripFirst)
    .map((p) => ({ ...p, leg: firstLeg(items, p.party, p.day) }));
}

/** The calendar date in a time zone ("2026-10-03") */
export const dateIn = (zone: string, now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** The phone's own date — Home's "today" */
export function phoneToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
}

/** "Julie & Andy" → "Julie and Andy" */
export const namesOf = (party: string) => party.replace(/\s*&\s*/g, " and ");

export interface LeavingFact { about: "Japan" | "Tokyo" | "Kyoto"; text: string }

/**
 * One fact a day, by the days left (0 = the day they leave — Tokyo, where they land). Each was checked against published
 * sources before it went in (Oct 2 2026; a fresh fact-checker corrected eight and dropped Kyoto's temple count, which no
 * official source supports) — Wander never states what it can't support. Sources:
 *  0 meijijingu.or.jp (100,000 donated trees; finished Nov 1920) · 1 nippon.com g00993 (Edo renamed 1868)
 *  2 japan.travel spot 1128 + NDL reference database (about 10,000 torii; donor and date on the back)
 *  3 kiyomizudera.or.jp (nearly 13 m; rebuilt 1633; not a single nail) · 4 Maiko / Nihongami (secondary sources)
 *  5 kongogumi.co.jp (founded 578) + 2006 takeover · 6 iseshima-kanko.jp (2033 rebuilding) + Britannica (1462–1585 gap)
 *  7 JR Central Integrated Report 2025 p.46 (1.4 min, FY2024, natural causes included)
 *  8 Atomic Heritage Foundation, Stimson 1947 ("a shrine of Japanese art and culture"); the honeymoon story is a myth
 *  9 nippon.com d01045 + JR Central (no passenger deaths in a derailment or collision) · 10 GSI press release 2023-02-28
 *  11 guinnessworldrecords.com busiest-station (2,704,703 a day in 2022)
 */
export const LEAVING_FACTS: LeavingFact[] = [
  { about: "Tokyo", text: "The forest around Tokyo's Meiji Shrine was planted by hand between 1915 and 1920. About 100,000 trees were donated from all over Japan. Foresters planned it to grow into a natural forest that renews itself." },
  { about: "Tokyo", text: "Tokyo was called Edo until 1868. That year it was renamed Tōkyō, meaning “eastern capital,” as the emperor prepared to move there from Kyoto. Kyoto's own name means “capital city.”" },
  { about: "Kyoto", text: "Fushimi Inari's mountain paths are lined with about 10,000 vermilion torii gates. Each one was given by a company or a person. The donor's name and the date are written on the back." },
  { about: "Kyoto", text: "Kiyomizu-dera's wooden stage stands nearly 13 meters above the hillside. It was rebuilt in 1633. Its pillars and beams are joined without a single nail." },
  { about: "Kyoto", text: "In Kyoto, geisha are called geiko, and their apprentices are called maiko. A maiko's elaborate hairstyle is made from her own hair. A geiko usually wears a wig." },
  { about: "Japan", text: "Kongō Gumi, a temple builder in Osaka, dates its founding to the year 578. One family ran it for more than 1,400 years, until 2006. It still builds and repairs temples and shrines, now as part of a larger construction group." },
  { about: "Japan", text: "The Ise Grand Shrine, Shinto's most sacred site, is rebuilt from new timber on the plot beside the old one every 20 years. The custom began in the year 690, with one long break during the civil wars of the 1400s and 1500s. The next rebuilding is due in 2033." },
  { about: "Japan", text: "In the year to March 2025, the bullet trains between Tokyo and Osaka ran an average of 1.4 minutes late. That average includes delays from storms and earthquakes." },
  { about: "Kyoto", text: "In May 1945, Kyoto was at the top of the list of targets for the first atomic bomb. The US Secretary of War, Henry Stimson, had visited Kyoto in the 1920s, and he had it struck off. He called the city a shrine of Japanese art and culture." },
  { about: "Japan", text: "The bullet train opened in October 1964, nine days before the Tokyo Olympics. In all that time, no passenger has lost their life in a derailment or collision on it." },
  { about: "Japan", text: "In 2023, Japan recounted its islands using detailed digital maps. It found 14,125, more than double the 6,852 it had used since 1987. No new land appeared. The counting just got finer." },
  { about: "Tokyo", text: "Guinness World Records lists Shinjuku as the world's busiest railway station. In 2022, about 2.7 million people passed through it on an average day." },
];

export const factFor = (daysLeft: number): LeavingFact | null =>
  LEAVING_FACTS.length ? LEAVING_FACTS[((daysLeft % LEAVING_FACTS.length) + LEAVING_FACTS.length) % LEAVING_FACTS.length] : null;
