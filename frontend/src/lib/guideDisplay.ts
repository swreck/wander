/**
 * How a day from Larisa's Guide reads on screen — shared by Home's Today card and the Day screen,
 * so the two never disagree.
 */

import type { GuideItem, Stay } from "./guideData";

export const ymd = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

/** "08:30" → "8:30 AM" */
export function clock(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

const mins = (t: string | null | undefined) => {
  const m = (t || "").match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** A landing ("Land at Narita (NRT) · United") — the moment a party arrives that day. */
export const isLanding = (i: GuideItem) => i.kind === "flight" && /^Land at/i.test(i.title);

/**
 * The day in the order a traveler lives it: check-outs first (you leave the hotel before the day's
 * plans, whatever the hotel's latest time), then everything with a time, then the rest.
 * A check-in time is only when the room opens ("from 2:00 PM"): it comes after the same people land.
 */
export function sortDay(list: GuideItem[]): GuideItem[] {
  const checkouts = list.filter((i) => i.kind === "checkout");
  const rest = list.filter((i) => i.kind !== "checkout");
  const at = (i: GuideItem) => {
    const own = mins(i.time) ?? 0;
    if (i.kind !== "checkin") return own;
    const landed = rest.filter((l) => isLanding(l) && l.time && (!l.forWhom || !i.forWhom || l.forWhom === i.forWhom || l.forWhom === "Everyone"));
    const arrival = Math.max(-1, ...landed.map((l) => mins(l.time) ?? -1));
    return arrival >= own ? arrival + 0.5 : own;
  };
  // Lines with no time are usually the day's own plan ("day 4 - Shibuya…", "Nagoya to Tokyo",
  // "Rikuro Cheesecake") and come before the timed evening; a dinner or a deadline with no time
  // belongs at the end. (Oct 13 used to list the 2:00 PM check-in above the train to Tokyo.)
  const evening = (i: GuideItem) => i.kind === "deadline" || /\bdinner\b/i.test(i.title)
    || (i.kind === "meal" && !/\b(lunch|brunch|breakfast)\b/i.test(i.title));
  const untimed = rest.filter((i) => !i.time);
  return [
    ...checkouts,
    ...untimed.filter((i) => !evening(i)),
    ...rest.filter((i) => i.time).sort((a, b) => at(a) - at(b)),
    ...untimed.filter(evening),
  ];
}

/** An appointment that makes a day start (not a hotel's own check-in/out time or a deadline) */
const isAppointment = (i: GuideItem) => !!i.time && !["checkout", "checkin", "deadline"].includes(i.kind);

/**
 * A check-out listed first on a morning with an earlier appointment (Oct 18: check out, then meet
 * Backroads at 8:30). "by 12:00 PM" above "8:30 AM" read as out of order — and as time to spare —
 * so its time column says "Morning" and the card gives the hotel's check-out time.
 */
export function checkoutBeforeFirst(i: GuideItem, day?: GuideItem[]): boolean {
  if (i.kind !== "checkout" || !i.time || !day) return false;
  const own = mins(i.time) ?? 0;
  return day.some((d) => d !== i && isAppointment(d) && (mins(d.time) ?? 0) < own);
}

/**
 * A check-in listed after its party's landing (Oct 14: land 3:00 PM, room from 2:00 PM). "from
 * 2:00 PM" under "3:00 PM" read as out of order, so its time column says "After landing".
 */
export function checkinAfterLanding(i: GuideItem, day?: GuideItem[]): boolean {
  if (i.kind !== "checkin" || !i.time || !day) return false;
  const own = mins(i.time) ?? 0;
  return day.some((l) => isLanding(l) && l.time && (mins(l.time) ?? -1) >= own
    && (!l.forWhom || !i.forWhom || l.forWhom === i.forWhom || /^everyone$/i.test(l.forWhom)));
}

/** The line to lead with for a day (Home's "Tomorrow", Now's "tomorrow first"): its first
 *  appointment, rather than a check-out listed ahead of it */
export function leadItem(sorted: GuideItem[]): GuideItem | undefined {
  return sorted.find((i) => i.kind !== "checkout" && i.kind !== "deadline" && i.time) || sorted[0];
}

/**
 * The time column: a check-out time is the hotel's deadline ("by 12:00 PM"); a check-in time is
 * when the room opens ("from 2:00 PM"). Neither is an appointment.
 */
export function timeLabel(i: GuideItem, day?: GuideItem[]) {
  if (!i.time) return "";
  if (i.kind === "checkout") return checkoutBeforeFirst(i, day) ? "Morning" : `by ${clock(i.time)}`;
  if (i.kind === "checkin") return checkinAfterLanding(i, day) ? "After landing" : `from ${clock(i.time)}`;
  return clock(i.time);
}

// ── Who is where ────────────────────────────────────────────────

/** The travelling parties the Guide names on flights and bookings ("Ken & Larisa", "Julie & Andy"). */
export function partiesOf(items: GuideItem[]): string[] {
  const set = new Set<string>();
  for (const i of items) {
    if (!["flight", "checkin", "checkout", "deadline"].includes(i.kind) || !i.forWhom) continue;
    if (/^everyone$/i.test(i.forWhom)) continue;
    set.add(i.forWhom);
  }
  return Array.from(set);
}

const hasName = (party: string | null | undefined, name: string | null | undefined) =>
  !!party && !!name && new RegExp(`(^|[^a-z])${name.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(party.toLowerCase());

/** The party this person travels with ("Julie" → "Julie & Andy"), when the Guide says. */
export function partyOf(items: GuideItem[], name: string | null | undefined): string | null {
  return partiesOf(items).find((p) => hasName(p, name)) || null;
}

/** Is this line about this person (or everyone, or nobody in particular)? */
export function isFor(i: { forWhom?: string | null }, name: string | null | undefined): boolean {
  if (!i.forWhom || /^everyone$/i.test(i.forWhom) || !name) return true;
  return hasName(i.forWhom, name);
}

/** The first and last day a party is on the trip: its first flight or check-in, and its flight home. */
function partySpan(items: GuideItem[], party: string) {
  const departures = items.filter((i) => i.kind === "flight" && !isLanding(i) && i.date && (i.forWhom === party || /^everyone$/i.test(i.forWhom || "") || hasName(i.forWhom, party.split(/\s*&\s*/)[0])));
  const own = items.filter((i) => i.date && i.forWhom === party && ["flight", "checkin"].includes(i.kind));
  const dates = [...own, ...departures.filter((d) => d.forWhom === party)].map((i) => ymd(i.date)).sort();
  const allDepartures = departures.map((i) => ymd(i.date)).sort();
  return { start: dates[0] || null, end: allDepartures.length >= 2 ? allDepartures[allDepartures.length - 1] : null };
}

export interface NightStay { stay: Stay; who: string | null }
export interface NightAway { who: string; text: string }
export interface Night { stays: NightStay[]; away: NightAway[] }

const AIRPORTS: Record<string, string> = { NRT: "Narita", KIX: "Kansai", HND: "Haneda", SFO: "San Francisco", ITM: "Itami", LAX: "Los Angeles" };
function landingWords(l: GuideItem): string {
  const code = (l.title.match(/\b([A-Z]{3})\b/) || [])[1];
  const where = code ? AIRPORTS[code] || code : "the airport";
  const day = new Date(`${ymd(l.date)}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `lands at ${where}${l.time ? ` ${clock(l.time)}` : ""} ${day}`;
}

/**
 * Where everyone sleeps on a date, by the Guide: each stay labelled with the people actually there
 * that night (a booking for "Everyone" starts only when each couple's own booking does), and
 * anyone on an overnight flight ("Julie & Andy: on the flight — lands at Narita 3:00 PM Wed").
 */
export function nightOf(date: string, stays: Stay[], items: GuideItem[]): Night {
  const parties = partiesOf(items);
  const spans = new Map(parties.map((p) => [p, partySpan(items, p)]));
  const onTrip = (p: string) => {
    const s = spans.get(p)!;
    return (!s.start || s.start <= date) && (!s.end || date < s.end);
  };
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const tomorrow = next.toISOString().slice(0, 10);

  // Parties in the air tonight: a departure today and their landing tomorrow
  const away: NightAway[] = [];
  const flying = new Set<string>();
  for (const f of items) {
    if (f.kind !== "flight" || isLanding(f) || ymd(f.date) !== date) continue;
    const land = items.find((l) => isLanding(l) && ymd(l.date) === tomorrow && (l.forWhom || "") === (f.forWhom || ""));
    if (!land) continue;
    const who = f.forWhom && !/^everyone$/i.test(f.forWhom) ? f.forWhom : "Everyone";
    flying.add(who);
    away.push({ who, text: `On the flight — ${landingWords(land)}` });
  }

  const base = stays.filter((s) => s.checkInDate && s.checkOutDate && ymd(s.checkInDate) <= date && date < ymd(s.checkOutDate));
  const nightStays: NightStay[] = [];
  for (const s of base) {
    if (s.forWhom && !/^everyone$/i.test(s.forWhom)) { nightStays.push({ stay: s, who: s.forWhom }); continue; }
    if (parties.length === 0) { nightStays.push({ stay: s, who: s.forWhom || null }); continue; }
    // Who is here tonight: on the trip, not in the air, and — where they have their own booking at this
    // hotel — past their own check-in date
    const here = parties.filter((p) => {
      if (!onTrip(p) || flying.has(p)) return false;
      const ownIn = items.find((i) => i.kind === "checkin" && i.forWhom === p && ymd(i.date) >= ymd(s.checkInDate) && ymd(i.date) < ymd(s.checkOutDate) && sharesWord(i.title, s.name));
      return !ownIn || ymd(ownIn.date) <= date;
    });
    if (here.length === 0) continue;
    nightStays.push({ stay: s, who: here.length === parties.length ? (s.forWhom || null) : here.join(" and ") });
  }
  return { stays: nightStays, away };
}

function sharesWord(a: string, b: string) {
  const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !["hotel", "check"].includes(w));
  const bw = new Set(words(b));
  return words(a).some((w) => bw.has(w));
}

/** Tonight for one person: their own stay(s) and whether they're in the air. */
export function myNight(night: Night, name: string | null | undefined): Night {
  return {
    stays: night.stays.filter((s) => isFor({ forWhom: s.who }, name)),
    away: night.away.filter((a) => isFor({ forWhom: a.who }, name)),
  };
}

// ── Deadlines, in the trip's own time ──────────────────────────────

/** Minutes between UTC and a time zone at a moment (Tokyo: +540). */
function zoneOffsetMinutes(zone: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The moment a local date and time in a zone happens ("2026-10-12", 23:59, Tokyo → a Date). */
export function zonedMoment(date: string, minutes: number, zone: string): Date {
  const guess = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 0, minutes));
  return new Date(guess.getTime() - zoneOffsetMinutes(zone, guess) * 60000);
}

/** The phone's own zone differs from the trip's (at home before the trip, or on the way). */
export function phoneIsElsewhere(tripZone: string) {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone !== tripZone && zoneOffsetMinutes(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date()) !== zoneOffsetMinutes(tripZone, new Date()); }
  catch { return false; }
}

/** "11:59 PM Japan time (7:59 AM Mon your time)" — the phone's time added when it's somewhere else. */
export function deadlineTimeWords(i: GuideItem, tripZone: string): string | null {
  const at = deadlineMinutes(i);
  if (!i.date) return null;
  const zoneWord = ZONE_WORDS[tripZone] || "local time";
  if (at === null) {
    // No time in the Guide: the day ends in Japan hours before it ends at home — say when, in your time
    if (!phoneIsElsewhere(tripZone)) return null;
    const end = zonedMoment(ymd(i.date), 23 * 60 + 59, tripZone);
    return `by the end of the day ${zoneWord === "local time" ? "there" : `in ${zoneWord.replace(/ time$/, "")}`} (${end.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })} your time)`;
  }
  // Already said in the title or the Guide's words ("…ends 3:00 PM Kyoto time", "Until 11:59 PM Japan time")
  const said = `${i.title} ${i.detail || ""}`.includes(minutesToClock(at));
  const own = said ? null : `${minutesToClock(at)} ${zoneWord}`;
  if (!phoneIsElsewhere(tripZone)) return own;
  const moment = zonedMoment(ymd(i.date), at, tripZone);
  const mine = moment.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  return own ? `${own} (${mine} your time)` : `${mine} your time`;
}

/** Deadline gone by within the last day — still shown ("Just passed") so nobody wonders where it went */
export function deadlineJustPassed(i: GuideItem, tripZone: string, now = new Date()) {
  if (i.kind !== "deadline" || !i.date || !deadlineOver(i, tripZone, now)) return false;
  const at = deadlineMinutes(i) ?? 24 * 60 - 1;
  return now.getTime() - zonedMoment(ymd(i.date), at, tripZone).getTime() < 24 * 3600 * 1000;
}

const ZONE_WORDS: Record<string, string> = { "America/Los_Angeles": "California time", "Asia/Tokyo": "Japan time" };

/** True once a deadline has gone by — its stated time in the trip's zone, or the end of its day. */
export function deadlineOver(i: GuideItem, tripZone: string, now = new Date()) {
  if (i.kind !== "deadline" || !i.date) return false;
  const at = deadlineMinutes(i) ?? 24 * 60 - 1;
  return now.getTime() > zonedMoment(ymd(i.date), at, tripZone).getTime();
}

/** A deadline worth showing on this date: its day, or any day of its window ("any day Oct 10–14"). */
export function deadlineOnDate(i: GuideItem, date: string) {
  if (i.kind !== "deadline") return false;
  const last = ymd(i.date);
  const first = i.windowStart || last;
  return first <= date && date <= last;
}

/** "Any day now through Wed, Oct 14" / "By Wed, Oct 14" — how a window deadline reads on a given day. */
export function deadlineWhen(i: GuideItem, today: string) {
  const last = ymd(i.date);
  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  if (today === last) return deadlineMinutes(i) !== null ? "Today" : "Today is the last day";
  if (i.windowStart && i.windowStart <= today && today < last) return `Any day through ${day(last)}`;
  if (i.windowStart && today < i.windowStart) return `${day(i.windowStart)} – ${day(last)}`;
  return day(last);
}

// ── Getting to the airport (Wander's own estimate) ──────────────

/** Door-to-door by train or car, with time to get to the station. Only routes we know well. */
const TO_AIRPORT: Record<string, Record<string, number>> = {
  kyoto: { KIX: 105, ITM: 75 },
  osaka: { KIX: 60, ITM: 45 },
  tokyo: { NRT: 90, HND: 50 },
  nara: { KIX: 90 },
  kobe: { KIX: 75, ITM: 45 },
};
const AT_AIRPORT_INTERNATIONAL = 150; // arrive 2½ hours before an international departure

export interface LeaveBy { minutes: number; /** minutes from the city to the airport */ travel: number; airport: string; text: string; why: string }

/**
 * "Leave for Kansai airport by about 2:20 PM" for a flight leaving Japan, from the city you're in.
 * Always labelled as Wander's estimate — the Guide doesn't say how you're getting there. Null when
 * we don't know the route well enough to say.
 */
export function leaveForAirport(flight: GuideItem, fromCity: string | null | undefined): LeaveBy | null {
  if (flight.kind !== "flight" || isLanding(flight) || !flight.time || !fromCity) return null;
  const code = (flight.title.match(/\b([A-Z]{3})\b/) || [])[1];
  if (!code) return null;
  const city = Object.keys(TO_AIRPORT).find((c) => fromCity.toLowerCase().includes(c));
  const travel = city ? TO_AIRPORT[city][code] : undefined;
  const dep = mins(flight.time);
  if (travel === undefined || dep === null) return null;
  const raw = dep - AT_AIRPORT_INTERNATIONAL - travel;
  const leave = Math.floor(raw / 5) * 5;
  const airport = AIRPORTS[code] || code;
  const hrs = (m: number) => (m % 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m / 60} hours`).replace(/^0 hr /, "");
  return {
    minutes: leave,
    travel,
    airport,
    text: `Leave for ${airport} airport by about ${minutesToClock(leave)}`,
    why: `Wander's estimate: about ${hrs(travel)} from ${fromCity} to ${airport}, and ${hrs(AT_AIRPORT_INTERNATIONAL)} at the airport before an international flight. The Guide doesn't say how you're getting there.`,
  };
}

/**
 * Past the time to leave. While the estimate still gets you there before check-in usually closes
 * (an hour before an international flight): go now. After that, saying "go now" again would hide the
 * real problem — so it says plainly that check-in may be missed and to call the airline.
 */
export function lateLeaveWords(leave: LeaveBy, flight: GuideItem, now: number): string {
  const dep = mins(flight.time) ?? 0;
  const airline = (flight.title.match(/^([A-Z][A-Za-z]+(?: [A-Z][a-z]+)?)\s+[A-Z0-9]{2}\d/) || [])[1];
  if (now + leave.travel > dep - 60) {
    return `At this point you may miss check-in at ${leave.airport} (it usually closes an hour before an international flight) — call ${airline || "the airline"} now`;
  }
  return `Past the time to leave for ${leave.airport} — if you're not on the way, go now`;
}

// ── Words in details ────────────────────────────────────────────

/** Split a detail into text and phone numbers, so numbers can be tapped to call. */
export function withPhoneLinks(text: string): { text: string; tel?: string }[] {
  const out: { text: string; tel?: string }[] = [];
  const re = /(\+?\d[\d\s-]{7,}\d)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const digits = m[1].replace(/[^\d+]/g, "");
    if (digits.replace("+", "").length < 9 || /^\d{4}-\d{2}-\d{2}$/.test(m[1])) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    // A Japanese number written for callers in Japan ("03-1234-5678") dials from anywhere as +81 3 1234 5678
    const tel = digits.startsWith("+") ? digits : digits.startsWith("0") && digits.length >= 10 ? `+81${digits.slice(1)}` : digits;
    out.push({ text: m[1], tel });
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Larisa's own planning bookkeeping (budgets, placeholders) — shown apart from the day's plan. */
export function isPlanningNote(i: GuideItem) {
  return i.kind === "note" && /\b(budget|placeholder|amount|cost|price|paid|deposit|lose 1 day|nites)\b/i.test(`${i.title} ${i.detail || ""}`);
}

/** Hotels whose last night was the night before this date. */
export function leavingOn(stays: Stay[], date: string) {
  return stays.filter((s) => ymd(s.checkOutDate) === date);
}

/**
 * A check-out the Guide doesn't label gets the party who slept there the night before — so Julie's
 * first morning doesn't open with Ken & Larisa's "Check out · Nagoya Marriott" as if it were hers.
 */
export function withCheckoutWho(list: GuideItem[], date: string, stays: Stay[], items: GuideItem[]): GuideItem[] {
  if (!list.some((i) => i.kind === "checkout" && !i.forWhom)) return list;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const lastNight = nightOf(d.toISOString().slice(0, 10), stays, items);
  return list.map((i) => {
    if (i.kind !== "checkout" || i.forWhom) return i;
    const hotel = i.title.replace(/^Check out · /, "").toLowerCase();
    const who = Array.from(new Set(lastNight.stays
      .filter((s) => hotel.includes(s.stay.name.toLowerCase().split(" ")[0]))
      .map((s) => s.who || "Everyone")));
    return who.length === 1 && !/^everyone$/i.test(who[0]) ? { ...i, forWhom: who[0] } : i;
  });
}

/**
 * Larisa's words, readable as a line on a phone — never reworded:
 * a typed arrow ("Hakata - > Nagoya") reads as one; the time already in the time column isn't
 * repeated ("8:30 AM · Meet Backroads 8:30a Courtyard…" → "Meet Backroads, Courtyard…");
 * "see above - " (a pointer to her sheet's row above) is dropped; a bracket she left open is closed.
 */
export function tidyTitle(i: GuideItem): string {
  let t = i.title.replace(/\s*-\s*>\s*/g, " → ");
  // Only a meeting line repeats its own time ("Meet Backroads 8:30a Courtyard…"). Anywhere else a time
  // inside the words carries meaning ("Concludes: 11:30a hotel/12p Kyoto station") and stays.
  if (i.time && i.kind === "meeting") {
    const [h, m] = i.time.split(":").map(Number);
    const h12 = ((h + 11) % 12) + 1;
    const ap = h >= 12 ? "p" : "a";
    const mm = m ? `:${String(m).padStart(2, "0")}` : "(?::00)?";
    t = t.replace(new RegExp(`\\s*~?\\b${h12}${mm}\\s*${ap}\\.?m?\\.?(?![a-z])`, "i"), ", ").replace(/\s*,\s*,?\s*/g, ", ").replace(/,\s*$/, "").trim();
  }
  const pointer = /^see above\s*[-–:]\s*/i;
  if (pointer.test(t)) {
    t = t.replace(pointer, "");
    t = t ? t[0].toUpperCase() + t.slice(1) : t;
  }
  if ((t.match(/\(/g) || []).length > (t.match(/\)/g) || []).length) t = `${t})`;
  return t || i.title;
}

/** A cell that means nothing on its own away from the sheet ("1 day") */
export function isFragment(i: GuideItem) {
  return ["plan", "note"].includes(i.kind) && /^\s*\d+\s*(day|days|nite|nites|night|nights)\s*$/i.test(i.title);
}

/**
 * A check-out line. When the Guide lists more than one place for the night before, don't pick one:
 * "Check out · Shiraume or Four Seasons Hotel Kyoto (the Guide lists both)".
 */
export function itemTitle(i: GuideItem, stays: Stay[], date: string) {
  // A check-in on a night the Guide lists more than one place stays an open question
  if (i.kind === "checkin") {
    const tonight = stays.filter((s) => s.checkInDate && s.checkOutDate && ymd(s.checkInDate) <= date && date < ymd(s.checkOutDate));
    const others = tonight.filter((s) => !i.title.toLowerCase().includes(s.name.toLowerCase().split(" ")[0]));
    if (tonight.length > 1 && others.length) return `${i.title} (the Guide also lists ${others.map((s) => s.name).join(" and ")} for tonight)`;
  }
  if (i.kind !== "checkout") return tidyTitle(i);
  const leaving = leavingOn(stays, date);
  if (leaving.length > 1) return `Check out · ${leaving.map((s) => s.name).join(" or ")} (the Guide lists both)`;
  return i.title;
}

/**
 * Where a line came from, in words a traveler uses:
 * "Itinerary · Description (row 45) + Itinerary · Notes (row 47)" → "Larisa's Guide, Itinerary tab".
 */
export function friendlySource(source: string) {
  const parts = source.split(" + ").map((p) => {
    const shot = p.match(/^Screenshot in (.+)$/i);
    if (shot) return `a screenshot in the ${shot[1]} tab`;
    // Text read from a tab (often a pasted email, but not always): name the tab, claim nothing more
    const pasted = p.match(/^(.+?) \(pasted text\)$/i);
    if (pasted) return `the ${pasted[1]} tab`;
    const tab = p.replace(/\s*\(row \d+\)/gi, "").split(" · ")[0].trim();
    return `the ${tab} tab`;
  });
  return `From Larisa's Guide — ${Array.from(new Set(parts)).join(" and ")}`;
}

/**
 * Something to search in Maps when the Guide names a place but gives no address:
 * a meeting point or a tour start, in Larisa's words minus the time.
 */
export function mapsQueryFor(i: GuideItem): string | null {
  if (i.place) return i.place;
  if (i.kind !== "meeting" && i.kind !== "tour") return null;
  // The place in her words: "Meet Backroads 8:30a Courtyard by Marriott Tokyo Station" → "Courtyard by Marriott Tokyo Station"
  let text = i.title.replace(/~?\b\d{1,2}(:\d{2})?\s*-?\s*\d{0,2}(:\d{2})?\s*[ap]m?\b/gi, " ").replace(/\bmeet(ing)?\b/gi, " ").replace(/\s{2,}/g, " ").trim();
  const at = text.match(/\b(?:at|@)\s+(.+)$/i);
  if (at) text = at[1];
  // A tour line only names a place with "at …"; otherwise it's the tour's name, not somewhere to go
  else if (i.kind === "tour") return null;
  text = text.replace(/^backroads\s+/i, "").trim();
  return text.length > 3 ? text : null;
}

export const mapsLink = (q: string) => `https://maps.apple.com/?q=${encodeURIComponent(q)}`;

/** A hotel is found by its name and city ("Imperial Hotel, Tokyo, Japan"). A bare district address
 *  ("Chiyoda City") put the pin on the Imperial Palace grounds, over a kilometre away. */
export function stayMapsQuery(stay: { name: string; address?: string | null }, city?: string | null): string {
  const name = stay.name.trim();
  const hasCity = city && name.toLowerCase().includes(city.toLowerCase());
  return [name, hasCity ? null : city, "Japan"].filter(Boolean).join(", ");
}

/**
 * The time of day a deadline falls, when its words say ("by 15:00", "11:59 PM", "3pm"), in minutes
 * after midnight local time. Null when no time is stated (then it lasts the whole day).
 */
export function deadlineMinutes(i: GuideItem): number | null {
  const text = `${i.title} ${i.detail || ""}`;
  const m = text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i) || text.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (!m) return null;
  const hasMinutes = m.length === 4;
  let h = Number(m[1]);
  const min = hasMinutes ? Number(m[2]) : 0;
  const ap = (hasMinutes ? m[3] : m[2])?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** True when this deadline falls today and its stated time has already gone by. */
export function deadlinePassed(i: GuideItem, date: string, today: string, now = new Date()) {
  if (i.kind !== "deadline" || date !== today) return false;
  const at = deadlineMinutes(i);
  return at !== null && now.getHours() * 60 + now.getMinutes() > at;
}

export function minutesToClock(mins: number) {
  const h = Math.floor(mins / 60);
  return clock(`${String(h).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`);
}

/** "Larisa's Guide, as Wander read it Sep 29" — flagged when it's more than a week old. */
export function freshness(importedAt: string | undefined | null, now = new Date()) {
  if (!importedAt) return null;
  const read = new Date(importedAt);
  const days = Math.floor((now.getTime() - read.getTime()) / 86400000);
  const when = read.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { text: `Larisa's Guide, as Wander last read it on ${when}`, old: days > 7, days };
}
