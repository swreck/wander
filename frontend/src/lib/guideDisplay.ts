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
export function sortDay(list: GuideItem[], tripZone: string = "Asia/Tokyo"): GuideItem[] {
  const checkouts = list.filter((i) => i.kind === "checkout");
  const rest = list.filter((i) => i.kind !== "checkout");
  const at = (i: GuideItem) => {
    const own = tripClockMinutes(i, tripZone);
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

/**
 * A line's time as minutes into its date on the trip's clock, for putting a day in order. A time on another clock
 * is converted (round 11: Julie's "12:00 PM California time" take-off — 4:00 AM Wednesday in Japan — was listed
 * above Tuesday's 2:00 PM check-in and 8:00 PM dinner on Japan's Oct 13).
 */
export function tripClockMinutes(i: GuideItem, tripZone: string = "Asia/Tokyo"): number {
  const own = mins(i.time) ?? 0;
  if (!i.timeZone || i.timeZone === tripZone || !i.date) return own;
  const date = ymd(i.date);
  return Math.round((zonedMoment(date, own, i.timeZone).getTime() - zonedMoment(date, 0, tripZone).getTime()) / 60000);
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
 * The line you leave by, before the hotel's own check-out time: a train, a flight, a transfer, or meeting Backroads
 * (Oct 18: "check-out due by 12:00 PM" on the morning everyone meets Backroads at 8:30 and leaves Tokyo — day review,
 * Oct 4). Only a leaving line: a morning walk before noon isn't when you must be out.
 */
export function leaveBeforeCheckout(i: GuideItem, day?: GuideItem[]): GuideItem | null {
  if (i.kind !== "checkout" || !i.time || !day) return null;
  const own = mins(i.time) ?? 0;
  return day.filter((d) => d !== i && isAppointment(d) && (mins(d.time) ?? 0) < own
    && (["train", "flight", "travel"].includes(d.kind) || /\bmeet\b[^.]*\bbackroads\b|\bbackroads\b[^.]*\bmeet/i.test(d.title)))
    .sort((a, b) => (mins(a.time) ?? 0) - (mins(b.time) ?? 0))[0] || null;
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
/**
 * Lines of her day plan that nobody can be said to own: unlabeled lines while the group is split.
 * Oct 28: "For Larisa & Julie" 10:15–10:35, "For Ken & Andy" MIHO 10:15–12:35 — Maruni Toryo at 10:35 has
 * no name on it, so it is never "next" for anyone (it could be either group's). Nothing is guessed.
 */
export function ownerlessInSplit(items: GuideItem[]): Set<string> {
  const mins = (t: string | null | undefined) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : NaN);
  const out = new Set<string>();
  const byDate = new Map<string, GuideItem[]>();
  for (const b of items) if (b.kind === "block" && b.date) byDate.set(b.date.slice(0, 10), [...(byDate.get(b.date.slice(0, 10)) || []), b]);
  for (const blocks of byDate.values()) {
    const labeled = blocks.filter((b) => b.time && b.forWhom && !/^everyone$/i.test(b.forWhom));
    if (!labeled.length) continue;
    const from = Math.min(...labeled.map((b) => mins(b.time)));
    const to = Math.max(...labeled.map((b) => Math.max(mins(b.time), mins(b.endTime) || 0)));
    for (const b of blocks) {
      if (b.forWhom || !b.time) continue;
      const t = mins(b.time);
      if (t >= from && t < to) out.add(b.id);
    }
  }
  return out;
}

export function timeLabel(i: GuideItem, day?: GuideItem[]) {
  if (!i.time) return "";
  if (i.kind === "checkout") return checkoutBeforeFirst(i, day) ? "Morning" : `by ${clock(i.time)}`;
  if (i.kind === "checkin") return checkinAfterLanding(i, day) ? "After landing" : `from ${clock(i.time)}`;
  // A line of her day plan: her own words for the time when they're short ("~12:30–1:00", "9:15–10:30") —
  // Home cut her ranges to a start time, and the Haruka's range is the very thing her tabs disagree on
  if (i.kind === "block") {
    const t = (i.timeText || "").trim();
    if (t && t.length <= 12 && !/^\d{2}:\d{2}(:00)?$/.test(t)) return t;
    if (/^~/.test(t) || (i.detail || "").includes("Times are Larisa's estimate.")) return `~${clock(i.time)}`;
  }
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

// A person's first name, as her Guide writes people ("Julie & Andy") — accounts can carry an initial ("Julie D.", "Andy B")
export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0].toLowerCase();
/** Is this the same person — "Andy" and "Andy B" are (Oct 10: the real accounts have initials; her Guide doesn't) */
export const samePerson = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && (a.trim().toLowerCase() === b.trim().toLowerCase() || firstNameOf(a) === firstNameOf(b));

const hasName = (party: string | null | undefined, name: string | null | undefined) => {
  if (!party || !name) return false;
  const p = party.toLowerCase();
  const said = (n: string) => new RegExp(`(^|[^a-z])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(p);
  const full = name.trim().toLowerCase();
  // (the whole name, or else the first name: "Julie D." is the Julie of "Julie & Andy" — Oct 10, her and Andy's own
  // lines read as someone else's: "For Julie & Andy", no "You leave in 3 days" card, their to-dos not theirs)
  const first = firstNameOf(full);
  return said(full) || (first !== full && first.length >= 2 && said(first));
};

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
  // After its time, by the schedule (round 11)
  const past = !!l.date && !!l.time && Date.now() >= zonedMoment(ymd(l.date), mins(l.time) ?? 0, l.timeZone || "Asia/Tokyo").getTime();
  return `${past ? "was due at" : "lands at"} ${where}${l.time ? ` ${clock(l.time)}` : ""} ${day}`;
}

/**
 * Where everyone sleeps on a date, by the Guide: each stay labelled with the people actually there
 * that night (a booking for "Everyone" starts only when each couple's own booking does), and
 * anyone on an overnight flight ("Julie & Andy: on the flight — lands at Narita 3:00 PM Wed").
 */
/** phoneClock: the date is the phone's own (Home's "Tonight"), not a Japan date (a day screen). */
export function nightOf(date: string, stays: Stay[], items: GuideItem[], tripZone: string = "Asia/Tokyo", phoneClock = false): Night {
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
    // Taking off from another zone: when, in the trip's time (round 9: "Flying overnight" on Japan's Oct 13
    // blurred that they leave home at 4:00 AM Japan time); otherwise "Flying overnight"
    // A phone still where the flight leaves from already shows the take-off on its own clock: tonight is the
    // plane, and the landing in both clocks (round 11: Julie's Home on the morning she flew said "Next · 12:00 PM
    // California time" and then "Tonight · Take off Wed 4:00 AM Japan time" — two take-off times, one flight)
    // (Home only: on a day screen the date is Japan's, and its night is still one at home — round 11)
    const atOrigin = phoneClock && !!f.timeZone && f.timeZone !== tripZone && phoneZone() === f.timeZone;
    if (atOrigin && land.time) {
      const lands = zonedMoment(ymd(land.date), mins(land.time) ?? 0, land.timeZone || tripZone);
      const yours = lands.toLocaleString("en-US", { timeZone: f.timeZone!, weekday: "short", hour: "numeric", minute: "2-digit" }).replace(",", "");
      away.push({ who, text: `On the plane — ${landingWords(land)} ${ZONE_WORDS[tripZone] || "local time"} (${yours} your time)` });
      continue;
    }
    // On a day screen, a phone on the flight's own clock already has the take-off on the flight's line: tonight is the
    // plane and the landing (re-audit 2: Julie's Oct 13 said "12:00 PM California time" and "Take off Wed 4:00 AM Japan time")
    if (!phoneClock && !!f.timeZone && f.timeZone !== tripZone && phoneZone() === f.timeZone) {
      away.push({ who, text: `On the plane overnight — ${landingWords(land)}${land.time ? ` ${ZONE_WORDS[tripZone] || "local time"}` : ""}` });
      continue;
    }
    // (after that time, by the schedule — round 11: still "Take off …" below a card saying "Take-off was due …")
    const takeOff = f.time && f.timeZone && f.timeZone !== tripZone
      ? `${Date.now() >= zonedMoment(ymd(f.date), mins(f.time) ?? 0, f.timeZone).getTime() ? "Take-off was due" : "Take off"} ${zonedMoment(ymd(f.date), mins(f.time) ?? 0, f.timeZone).toLocaleString("en-US", { timeZone: tripZone, weekday: "short", hour: "numeric", minute: "2-digit" })} ${ZONE_WORDS[tripZone] || "local time"}`
      : "Flying overnight";
    away.push({ who, text: `${takeOff} — ${landingWords(land)}` });
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

/**
 * "Today" for this person: the phone's own date at home, but Japan's date from their scheduled landing in Japan until
 * their flight home takes off — they're in Japan whatever the phone's clock says (Oct 10 audit: at 3:30 PM in Japan on
 * Oct 14, half an hour after Julie's landing, a phone still on California time said "Your flight should be in the air …
 * You should be on your way" — its date was still Oct 13). By the schedule only; unknown landing → the phone's date.
 */
export function travelerToday(items: GuideItem[], me: string | null | undefined, tripZone: string, phoneDay: string, now = new Date()): string {
  const party = partyOf(items, me);
  if (!party) return phoneDay;
  const mine = items.filter((i) => i.kind === "flight" && i.date && i.time && (i.forWhom === party || isFor(i, me)));
  const arrivals = [
    ...mine.filter((i) => isLanding(i)).map((i) => zonedMoment(ymd(i.date), hm(i.time!), i.timeZone || tripZone)),
    // (a flight's own "Lands at Narita (NRT) Wed, Oct 14, 3:00 PM Japan time" — landings in Japan only, not the one home)
    ...mine.filter((i) => !isLanding(i) && /Lands at [^\n|]*Japan time/i.test(i.detail || ""))
      .map((i) => scheduledLanding(i.detail, ymd(i.date).slice(0, 4))).filter((d): d is Date => !!d),
  ].filter((d) => !isNaN(d.getTime())).sort((a, b) => a.getTime() - b.getTime());
  const departures = mine.filter((i) => !isLanding(i)).map((i) => zonedMoment(ymd(i.date), hm(i.time!), i.timeZone || tripZone)).sort((a, b) => a.getTime() - b.getTime());
  const landed = arrivals[0];
  // (the flight home: their last departure, after landing)
  const home = departures.filter((d) => !landed || d.getTime() > landed.getTime()).pop();
  if (!landed || now.getTime() < landed.getTime() || (home && now.getTime() >= home.getTime())) return phoneDay;
  return new Intl.DateTimeFormat("en-CA", { timeZone: tripZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** When a flight lands by its schedule, from its "Lands at San Francisco (SFO) Thu, Oct 29, 12:30 PM California time"
 *  line; null when it doesn't say. One rule for Home and Now — they disagreed after landing (testers t4, k1) */
export function scheduledLanding(detail: string | null | undefined, year: string): Date | null {
  const m = (detail || "").match(/Lands at [^\n|]*?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w* (\d{1,2}), (\d{1,2}):(\d{2}) ?([AP]M) (California|Japan) time/i);
  if (!m) return null;
  const month = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(m[1].slice(0, 3)) / 3 + 1;
  const h = (Number(m[3]) % 12) + (/p/i.test(m[5]) ? 12 : 0);
  return zonedMoment(`${year}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`, h * 60 + Number(m[4]), /california/i.test(m[6]) ? "America/Los_Angeles" : "Asia/Tokyo");
}

/**
 * Right now, as minutes into `date` on `zone`'s clock — the same scale as her Guide's times for that date.
 * Below 0 before the date starts there, past 1440 once it's over. On a phone in that zone on that date it is
 * simply the phone's clock (round 11: Julie's phone at 1:00 AM in California read Japan's 3:00 PM landing as
 * "Next · in 14 hr" — it had been due two hours earlier).
 */
export function nowMinutesOn(date: string, zone: string, at: Date = new Date()): number {
  return Math.floor((at.getTime() - zonedMoment(date, 0, zone).getTime()) / 60000);
}

/**
 * Where a landing's flight stands right now, by its schedule only — Wander can't see the real flight (round 8:
 * at 9 AM Ken had to work out from "Takes off … Tue, Oct 13, 12:00 PM California time" that Julie & Andy were
 * in the air, and at 6 PM Home had dropped the landing altogether). Null when there's nothing to add.
 */
export function landingStatus(landing: GuideItem, items: GuideItem[], tripZone: string, at: Date = new Date()): string | null {
  if (!isLanding(landing) || !landing.date || !landing.time) return null;
  const airport = landing.title.replace(/^Land at /i, "").split(" · ")[0];
  const flight = items.find((f) => f.kind === "flight" && !isLanding(f) && f.date && f.time && f.forWhom === landing.forWhom
    && (f.detail || "").includes(`Lands at ${airport}`));
  const lands = zonedMoment(ymd(landing.date), mins(landing.time) ?? 0, landing.timeZone || tripZone);
  const departs = flight ? zonedMoment(ymd(flight.date), mins(flight.time) ?? 0, flight.timeZone || tripZone) : null;
  const zoneWord = ZONE_WORDS[tripZone] || "local time";
  const here = (d: Date) => d.toLocaleString("en-US", { timeZone: tripZone, weekday: "short", hour: "numeric", minute: "2-digit" });
  // One line says the take-off (round 8: the card said "Takes off …" twice, in two zones, and read as two flights)
  const origin = flight ? (flight.title.split(" · ").slice(1).join(" · ").split(" → ")[0] || "").trim() : "";
  const from = origin ? ` from ${origin}` : "";
  // The landing time on a phone still on home time names its clock, and adds the phone's (round 11: at 1:00 AM in
  // California, "Was due to land at 3:00 PM" could be read as 3:00 PM California time, still ahead)
  const landsAt = phoneIsElsewhere(tripZone)
    ? `${clock(landing.time)} ${zoneWord} (${lands.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).replace(",", "")} your time)`
    : clock(landing.time);
  if (departs && at < departs) {
    // Taking off in another zone: its own time, and the trip's ("Tue, Oct 13" reads as yesterday on a Wednesday phone)
    if (!flight!.timeZone || flight!.timeZone === tripZone) return null;
    const theirs = departs.toLocaleString("en-US", { timeZone: flight!.timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return `Takes off${from} ${theirs} ${ZONE_WORDS[flight!.timeZone] || ""} — that's ${here(departs)} ${zoneWord}`.replace(/\s+—/, " —");
  }
  if (at < lands) {
    // In the air, what matters is the landing — the take-off is on its flight's own line (Oct 10 re-audit: Julie's Next
    // read "Take-off was due at 12:00 PM California time" and below it "take-off … was Wed 4:00 AM Japan time", one
    // take-off said two ways; round 8: "due to take off … 4:00 AM" at 9 AM read as if take-off were still ahead)
    return departs
      ? `Should be in the air now, by the schedule — due to land at ${landsAt}`
      : `Due to land at ${landsAt}`;
  }
  if (at.getTime() < lands.getTime() + 12 * 3600_000) return `Was due to land at ${landsAt} — that's the schedule; a delay wouldn't show here`;
  return null;
}

/** A landing, said as who lands ("Julie & Andy land at Narita (NRT) · United", "You land at …") — the stored
 * "Land at …" read as an instruction to whoever was looking (round 8). Other lines are returned as they are. */
export function landingTitle(i: GuideItem, me: string | null | undefined, title: string = i.title, tripZone: string = "Asia/Tokyo"): string {
  if (!isLanding(i)) return title;
  const rest = title.replace(/^Land at /i, "");
  // Past its time, by the schedule (round 11: "You land at Narita" two hours after the landing was due)
  const past = !!i.date && !!i.time && Date.now() >= zonedMoment(ymd(i.date), mins(i.time) ?? 0, i.timeZone || tripZone).getTime();
  if (!i.forWhom || /^everyone$/i.test(i.forWhom)) return `${past ? "Landing was due" : "Landing"} at ${rest}`;
  return `${me && hasName(i.forWhom, me) ? "You" : i.forWhom} ${past ? "were due to land" : "land"} at ${rest}`;
}

/** A take-off on another clock, said in the trip's: "That's Wed 4:00 AM Japan time" (round 8: on Japan's Oct 13
 * page, "12:00 PM California time" sat among the day's Japan times as if it were noon there). */
export function departureInTripZone(i: GuideItem, tripZone: string): string | null {
  if (i.kind !== "flight" || isLanding(i) || !i.date || !i.time || !i.timeZone || i.timeZone === tripZone) return null;
  // (not on a phone already on the flight's own clock — there it's the same take-off said twice; re-audit 2: Julie's
  // Oct 13 read "12:00 PM California time" and "Take-off was due Wed, Oct 14, 4:00 AM Japan time")
  try { if (Intl.DateTimeFormat().resolvedOptions().timeZone === i.timeZone) return null; } catch { /* say it */ }
  const departs = zonedMoment(ymd(i.date), mins(i.time) ?? 0, i.timeZone);
  // Its own words, with the date (round 9: "That's Wed 4:00 AM" under "Lands at … 3:00 PM" read as the landing);
  // after that time, by the schedule (round 11: still "Takes off" hours after)
  return `${Date.now() >= departs.getTime() ? "Take-off was due" : "Takes off"} ${departs.toLocaleString("en-US", { timeZone: tripZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ${ZONE_WORDS[tripZone] || "local time"}`;
}

/**
 * This person's flight out from home, when they are still at home on this Japan date — every Guide date is a
 * Japan date, and before their flight takes off (in Japan's time) nothing on it is theirs but that flight
 * (round 8: Julie's "first day", Japan's Oct 13, showed an 8 PM Tokyo dinner as if it might be hers).
 */
export function homeOnJapanDate(items: GuideItem[], me: string | null | undefined, date: string, tripZone: string): GuideItem | null {
  const party = partyOf(items, me);
  if (!party) return null;
  const flight = items
    .filter((f) => f.kind === "flight" && !isLanding(f) && f.date && f.time && f.forWhom === party && f.timeZone && f.timeZone !== tripZone)
    .sort((a, b) => ymd(a.date).localeCompare(ymd(b.date)))[0];
  if (!flight) return null;
  const departs = zonedMoment(ymd(flight.date), mins(flight.time) ?? 0, flight.timeZone!);
  const departJapanDay = new Intl.DateTimeFormat("en-CA", { timeZone: tripZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(departs);
  return date < departJapanDay ? flight : null;
}

/** Her line names you in its own words ("Julie & Andy depart SFO, Ken & Larisa arrive in Tokyo") — never "the others'"
 *  to you (Sweep A: Julie's Oct 13 read "The others · Julie & Andy depart SFO…") */
export function namesMe(text: string, me: string | null | undefined): boolean {
  const first = (me || "").trim().split(/\s+/)[0];
  return !!first && /^[A-Za-z]+$/.test(first) && new RegExp(`\\b${first}\\b`, "i").test(text);
}

/** The phone's own time zone ("America/Los_Angeles"), or null if the browser won't say. */
function phoneZone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
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
/** "California time", "Japan time" — whose clock a time is on */
export const zoneWords = (zone: string) => ZONE_WORDS[zone] || zone;

/** A deadline whose own words say charges START that day ("cancellation charges start", "60% charge from this date") */
export const CHARGES_FROM = /\bcharges? (?:start|begin)s?\b|\bcharges? from this date\b|% (?:charge )?from this date\b/i;

/** True once a deadline has gone by — its stated time in the trip's zone, or the end of its day. */
export function deadlineOver(i: GuideItem, tripZone: string, now = new Date()) {
  if (i.kind !== "deadline" || !i.date) return false;
  // (a date when charges start is past as that day begins — the free window ended the day before)
  if (CHARGES_FROM.test(i.title) && deadlineMinutes(i) === null) return now.getTime() >= zonedMoment(ymd(i.date), 0, tripZone).getTime();
  const at = deadlineMinutes(i) ?? 24 * 60 - 1;
  // "Ends 3:00 PM" holds through 3:00 itself — over from 3:01 (it read "Passed" at 3:00:00)
  return now.getTime() >= zonedMoment(ymd(i.date), at, tripZone).getTime() + 60_000;
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
  // (a date when charges START is no "last day" — Oct 4 copy: "La Table … (Oct 17): free cancellation ends — 60% charge
  // from this date" on Sat, Oct 10 read "Today is the last day", as if cancelling free were still possible that day)
  if (today === last) return CHARGES_FROM.test(i.title) ? "From today" : deadlineMinutes(i) !== null ? "Today" : "Today is the last day";
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

/**
 * The number to dial for a run of digits, when it has a phone number's shape — else null. Japanese numbers as
 * written in Japan ("075-585-2420" → +81 75 585 2420), with the country code ("81-75-561-1459", "+81 75 354
 * 0250"), any "+" number, and a US 3-3-4 number. Round 11 found four false or broken ones in her tabs: a hotel
 * confirmation ("4375060342"), a postal code and street number ("104-0061 4-10-3"), a Kyoto number without its
 * "+" (it dialed 81… as a local call), and a restaurant's number run into its street address.
 */
function telFor(written: string): string | null {
  const digits = written.replace(/\D/g, "");
  if (/^\d{3}-\d{4}\b/.test(written) || /^\d{4}-\d{2}-\d{2}$/.test(written)) return null; // postal code, date
  if (written.startsWith("+")) return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.startsWith("0")) return digits.length === 10 || digits.length === 11 ? `+81${digits.slice(1)}` : null;
  if (digits.startsWith("81") && /[\s-]/.test(written)) return digits.length === 11 || digits.length === 12 ? `+${digits}` : null;
  if (/^(1[\s-])?\d{3}[\s-]\d{3}[\s-]\d{4}$/.test(written)) return `+${digits.length === 10 ? "1" : ""}${digits}`;
  return null;
}

/** Split a detail into text and phone numbers, so numbers can be tapped to call. */
export function withPhoneLinks(text: string): { text: string; tel?: string }[] {
  const out: { text: string; tel?: string }[] = [];
  const re = /(\+?\d[\d\s-]{7,}\d)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    // A run can carry on past the number into what follows ("075-585-2420 321-2 Kiyomizu"): the longest
    // leading part, whole groups only, that has a phone number's shape
    const ends = [...m[1].matchAll(/\s+/g)].map((g) => g.index!).concat(m[1].length).reverse();
    let written = "";
    let tel: string | null = null;
    for (const end of ends) {
      written = m[1].slice(0, end);
      if ((tel = telFor(written))) break;
    }
    // A fax, or a number labelled as a booking's ("[# 4375060342]", "Confirmation: …"), is never to be dialed
    const before = text.slice(Math.max(0, m.index - 24), m.index);
    if (!tel || /fax\W*$|(#|confirmation|conf\.)\s*(no\.?|number|#)?\s*:?\s*$|(booking|reservation)\s*(no\.?|number|#)\s*:?\s*$/i.test(before)) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: written, tel });
    last = m.index + written.length;
    re.lastIndex = last;
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
/** Whose name a deadline's booking is under, as people say names ("Booked under Sato, Hana" → "Hana Sato") */
export function bookedByName(i: GuideItem): string | null {
  const m = (i.detail || "").match(/^Booked under ([^\n]+)/m)?.[1]?.trim();
  if (!m) return null;
  const parts = m.split(/\s*,\s*/);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : m;
}

/**
 * Whose to-do a booking's deadline is, said to the person looking: "Larisa's to do (booked under Hana Sato)" to Julie,
 * "Booked under your name" to Larisa (round 12: Julie read "Reconfirm the Robuchon dinner … Today is the last day" as
 * hers). Null when the Guide names no one.
 */
export function bookedWords(i: GuideItem, me: string | null | undefined): string | null {
  const name = bookedByName(i);
  if (!name) return null;
  const first = name.split(/\s+/)[0];
  if (samePerson(first, me)) return "Booked under your name";
  return `${first}'s to do (booked under ${name})`;
}

/** A question her Guide asks of the person looking ("1 day to Mashiko-Julie interested?", "X, if Julie isn't interested") */
export function askedOf(i: GuideItem, me: string | null | undefined, today?: string, items?: GuideItem[], tripZone = "Asia/Tokyo"): boolean {
  if (!me) return false;
  // Only while it's still ahead — on or after its day the question is moot (delight audit: "1 day to Shigaraki - Julie
  // interested?" 30 minutes before the van left)
  if (today && i.date && ymd(i.date) <= today) return false;
  // …and only on a day they can be there: never on a Japan date they're still at home (Ken, Oct 10: "is Julie even in
  // Japan when the event happens?" — Mashiko on Oct 13 "X, if Julie isn't interested", while she flies that day)
  if (items && i.date && homeOnJapanDate(items, me, ymd(i.date), tripZone)) return false;
  // Not on a line for someone else, and never from Wander's own notes quoting her (round 12: Ken & Larisa's Mashiko card
  // said "A question for you" to Julie because its "Still open in the Guide: … if Julie isn't interested" quoted her)
  if (i.forWhom && !/^everyone$/i.test(i.forWhom) && !isFor(i, me)) return false;
  return !!askedLine(i, me);
}

/** A deadline that starts something rather than ending it ("cancellation charges start — 60%"): once its day has come
 *  it's in effect, not "Ended" (Oct 10 audit: "Robuchon (Oct 17): cancellation charges start … Ended" read as the dinner
 *  being over) */
export const startsSomething = (i: { title: string }) => /\bcharges?\b[^.]{0,30}\b(start|begin|appl)/i.test(i.title);

/** A to-do under someone else's name who isn't in your party (Larisa's "Reconfirm Robuchon", seen by Julie) — theirs, not
 *  yours to see among your own lines (Oct 10 audit: it led Julie's Home deadlines and sat on her Oct 13 and 14) */
export function othersPartysJob(i: GuideItem, items: GuideItem[], me: string | null | undefined): boolean {
  if (i.kind !== "deadline" || !me) return false;
  const actor = bookedByName(i)?.split(/\s+/)[0];
  if (!actor || samePerson(actor, me)) return false;
  return !(partyOf(items, me) || "").toLowerCase().split(/\s*(?:&|,|\band\b)\s*/).some((n) => samePerson(n, actor));
}
/** A deadline that's yours: it names you, or no one and isn't another party's to-do */
export function deadlineIsMine(i: GuideItem, items: GuideItem[], me: string | null | undefined): boolean {
  if (i.forWhom && !/^everyone$/i.test(i.forWhom)) return isFor(i, me);
  return !othersPartysJob(i, items, me);
}

/** Her own words that ask this person something ("X, if Julie isn't interested") — shown with "A question for you", which
 *  said nothing of what was asked (Oct 10 audit: Julie's Mashiko card showed only the rail sheet's "Ken + Larisa only") */
export function askedLine(i: GuideItem, me: string | null | undefined): string | null {
  if (!me) return null;
  // (her lists say first names: "Julie", not "Julie D.")
  const who = firstNameOf(me).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const own = (i.detail || "").split("\n").filter((l) => !/^(Still open in the Guide|Tabs differ:|For [^:]+: her |Wander matched|Worked out from:)/.test(l)).join("\n");
  const asks = new RegExp(`\\b${who}\\b[^.\\n]{0,20}\\binterested\\?|\\bif ${who} (isn't|is not|wants?)\\b`, "i");
  const line = `${i.title}\n${own}`.split("\n").find((l) => asks.test(l));
  return line ? line.trim().replace(/^[-•·]\s*/, "").slice(0, 160) : null;
}

/** You've reached tonight's place today: tonight's check-in time (yours) has come, or it's evening (Ken, Oct 10: "given
 *  the time of day … you would know that I was already in Hakata at the hotel"). `nowMin`: minutes into today, trip time. */
export function arrivedForTonight(dayLines: GuideItem[], me: string | null | undefined, nowMin: number, lastTrainArrives: number | null = null): boolean {
  // (never while you're still flying in, or within 90 minutes of landing — Julie's check-in is 2:00 PM, her landing 3:00 PM;
  // nor while a booked train of yours today hasn't arrived)
  const landing = dayLines.find((i) => isLanding(i) && !!i.time && isFor(i, me));
  if (landing && nowMin < (mins(landing.time) ?? 0) + 90) return false;
  if (lastTrainArrives !== null && nowMin < lastTrainArrives) return false;
  if (nowMin >= 18 * 60) return true;
  return dayLines.some((i) => i.kind === "checkin" && !!i.time && isFor(i, me) && nowMin >= (mins(i.time) ?? Infinity));
}
/** A line with no time that only gets you to tonight's city ("Karatsu to Hakata 1.5 hrs", "Karatsu → Hakata · Local
 *  train") — behind you once you've arrived */
export function getsYouTo(title: string, city: string): boolean {
  if (!city) return false;
  // (her sheet's own arrows too: "Hakata - > Nagoya")
  const m = title.match(/(?:→|-\s*>|\bto\b)\s*([^·(,\n]+)/i);
  const dest = (m?.[1] || "").trim();
  return !!dest && (sameThing(dest, city) || new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(dest));
}

/** A line in her own voice ("AI estimates our arrival … and your arrival") shown to someone else is quoted and said to be
 *  hers — read bare, "our arrival" was Andy's (journeys check, Oct 10). To her, or a line already saying whose, as it is. */
export function inHerVoice(line: string, me: string | null | undefined, owner: string | null | undefined): string {
  return speaksAsHer(line, me, owner) ? `${owner || "Larisa"}'s note: “${line.trim()}”` : line;
}
/** Her line speaks in her own voice ("our", "your", "we") and the person looking isn't her */
export function speaksAsHer(line: string, me: string | null | undefined, owner: string | null | undefined): boolean {
  if (me && samePerson(owner || "Larisa", me)) return false;
  if (!/\b(our|we|we're|we'll|us|your|you|you're|you'll)\b/i.test(line)) return false;
  return !/^(Larisa|her|Ken|Andy|Julie|Still open|Tabs differ|For |“)/i.test(line.trim());
}

/** That question in parts, for saying it plainly (Oct 10 re-audit): what she asks about (the line's own name, without
 *  "Maybe:" or the asking words), the cell that asks — null when the name itself asks ("1 day to Shigaraki - Julie
 *  interested?") — and the row's other cells as she wrote them ("Ceramics town day trip", "Interested: Larisa") */
export function askedParts(i: GuideItem, me: string | null | undefined): { subject: string; cell: string | null; rest: string[] } | null {
  const line = askedLine(i, me);
  if (!line || !me) return null;
  const who = firstNameOf(me).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const asks = new RegExp(`\\b${who}\\b[^.\\n]{0,20}\\binterested\\?|\\bif ${who} (isn't|is not|wants?)\\b`, "i");
  const inName = asks.test(i.title);
  const subject = (inName ? i.title.replace(new RegExp(`\\s*[-–—:,]?\\s*${who}\\b[^.\\n]{0,20}\\binterested\\?\\s*$`, "i"), "") : i.title)
    .replace(/^maybe:\s*/i, "").trim() || i.title;
  if (inName) return { subject, cell: null, rest: [] };
  const cells = line.split(/\s+·\s+/);
  const cell = cells.find((c) => asks.test(c)) || line;
  return { subject, cell, rest: cells.filter((c) => c !== cell) };
}

/** A title that says nothing on its own: "2 nights", "1/2 day", "see above - 1/2 day" (round 10: a bare
 * "1/2 day" on Home meant nothing). Home never shows one; a day screen keeps it when her note hangs on it. */
export function isFragmentTitle(i: GuideItem) {
  return ["plan", "note"].includes(i.kind) && /^\s*(see above\s*[-–]?\s*)?[\d/½]+\s*(day|days|nite|nites|night|nights)\s*$/i.test(i.title);
}
export function isFragment(i: GuideItem) {
  return isFragmentTitle(i) && !(i.detail || "").trim();
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
/**
 * Her tab's name as people can read it. The saved copy of her sheet cuts every tab name at 31 letters (the file
 * format's limit, not hers): "Tokyo Day 2 Kappabashi & Akihab". A cut name ends at its last whole word, with "…", so
 * it reads as shortened rather than broken (delight audit: Larisa read her own clipped names as Wander's mistake).
 */
export function tabLabel(name: string): string {
  const n = name.trim();
  if (n.length < 31) return n;
  const whole = n.replace(/\s*\S*$/, "").replace(/[\s&,\-–(+]+$/, "");
  return whole.length >= 10 ? `${whole}…` : n;
}

export function friendlySource(source: string, me?: string | null) {
  const parts = source.split(" + ").map((p) => {
    const shot = p.match(/^Screenshot in (.+)$/i);
    if (shot) return `a screenshot in the ${tabLabel(shot[1])} tab`;
    // Text read from a tab (often a pasted email, but not always): name the tab, claim nothing more
    const pasted = p.match(/^(.+?) \(pasted text\)$/i);
    if (pasted) return `the ${tabLabel(pasted[1])} tab`;
    const tab = p.replace(/\s*\(row \d+\)/gi, "").split(" · ")[0].trim();
    return `the ${tabLabel(tab)} tab`;
  });
  return `From ${voiceFor(me).guide} — ${Array.from(new Set(parts)).join(" and ")}`;
}

/**
 * Something to search in Maps when the Guide names a place but gives no address:
 * a meeting point or a tour start, in Larisa's words minus the time.
 */
export function mapsQueryFor(i: GuideItem): string | null {
  if (i.place) return i.place;
  // A booked meal: its name with the street part of her address column ("Address: Hassun · 京都府… · (5 min walk…)")
  if (i.kind === "meal") {
    const addr = (i.detail || "").match(/^Address: ([^\n]+)/m)?.[1];
    if (!addr) return null;
    // A phone number is never the street (round 9: "<restaurant> · 075-000-0000 · 1-2 Some-cho…"
    // searched Maps for the phone number)
    // Nor is the name said again (round 11: "TAPAS MOLECULAR BAR [タパス モラキュラーバー · Mandarin Oriental" searched
    // the name twice, with half a bracket, and left out the hotel it's in)
    const name = i.title.split("\n")[0];
    const segs = addr.split(" · ").map((s) => s.replace(/\s*[[(（【][^\])）】]*$/, "").trim())
      .filter((s) => s && !/^\(/.test(s) && !/^(?:tel\.?\s*)?[+\d][\d\s\-().]{6,}$/i.test(s) && !s.toLowerCase().startsWith(name.toLowerCase()));
    const street = segs.find((s) => /\d/.test(s)) || segs[0];
    return street ? `${name}, ${street}` : null;
  }
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

/** What a link opens, in words ("Link ↗" said nothing): "Michelin page", "Booking page", "Map", "Website" */
export function linkLabel(url: string): string {
  if (/michelin/i.test(url)) return "Michelin page";
  if (/tablecheck|pocket-concierge|omakase|opentable|resy|booking|reserv/i.test(url)) return "Booking page";
  if (/maps\.(apple|google)|google\.[a-z.]+\/maps|goo\.gl\/maps|maps\.app/i.test(url)) return "Map";
  if (/tabelog/i.test(url)) return "Tabelog page";
  if (/(^|\/\/|\.)google\.[a-z.]+\/search/i.test(url)) return "Google search";
  // (a maybe's pasted link — Maybes, Oct 2 2026)
  if (/instagram\.com/i.test(url)) return "Instagram post";
  if (/tiktok\.com/i.test(url)) return "TikTok";
  if (/youtube\.com|youtu\.be/i.test(url)) return "Video";
  return "Website";
}

// Words that don't pick out one place ("lunch", "taxi") — two lines sharing only these aren't the same thing
const PLAN_WORDS = new Set(["hotel", "the", "ryokan", "residence", "tokyo", "kyoto", "resort", "inn", "and", "lunch", "dinner",
  "breakfast", "brunch", "light", "reservation", "visit", "stop", "return", "leave", "taxi", "board", "reserved", "arrive",
  "depart", "check", "collect", "luggage", "complimentary", "transfer", "station", "market", "street", "walk", "with", "from",
  "into", "back", "toward", "towards", "optional", "easy", "focused", "additional", "traditional", "private", "shower",
  "change", "rest", "split", "groups", "tour", "day", "trip", "then", "after", "before", "early", "late", "time", "flight",
  "train", "gallery", "cafe", "museum", "shop", "michelin", "star", "stars", "japanese", "style"]);
/** "Café ENSOU lunch" → ["ensou"] (the same rule the Guide reader uses to see two tabs name one thing) */
export function distinctWords(s: string): string[] {
  return Array.from(new Set(s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !PLAN_WORDS.has(w) && !/^\d+$/.test(w))));
}
/** Two lines about the same thing: they share a word that names it ("Hassun" and "Hassun — Michelin 1★…") */
// (and a name written as two words in one tab and one in another: "Team Lab Kyoto" / "TeamLab Biovortex Kyoto" — round 13:
// Oct 27's Home listed both at 11:00 AM)
const joinedPairs = (s: string) => {
  const t = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return t.slice(1).map((x, i) => t[i] + x).filter((w) => w.length > 5 && !PLAN_WORDS.has(w));
};
export const sameThing = (a: string, b: string) => {
  const wa = distinctWords(a), wb = distinctWords(b);
  return wa.some((x) => wb.includes(x)) || joinedPairs(a).some((x) => wb.includes(x)) || joinedPairs(b).some((x) => wa.includes(x));
};

/**
 * A line of her plan said again at the same time as another Guide line: it names the same thing
 * ("Hassun — Michelin…" beside Hassun) or is only a general word ("Flight" beside UA34 at 6:35 PM).
 */
export const saidAgain = (block: GuideItem, other: GuideItem) =>
  !!block.time && block.time === other.time && (sameThing(other.title, block.title)
    // only a one- or two-word general line ("Flight") — "Complimentary Residence transfer to Kyoto Station"
    // also has no distinctive word, and was taken for the noon check-out said again
    || (distinctWords(block.title).length === 0 && block.title.trim().split(/\s+/).length <= 2));

const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** When a line of her plan ends: its own end, else when her next timed line starts, else half an hour on */
export function planLineEnd(b: GuideItem, blocks: GuideItem[]): number {
  return planLineEndSaid(b, blocks) ?? hm(b.time!) + 30;
}
/**
 * The end her plan itself gives a line — its own, or her next timed line's start — or null. Only this is ever said
 * on screen: the half hour above is Wander's guess for what's "now", and "until about 6:30 PM" after her "~6:00 PM
 * Hana Soufflé … stroll" read as her plan (round 15).
 */
export function planLineEndSaid(b: GuideItem, blocks: GuideItem[]): number | null {
  if (b.endTime) return hm(b.endTime);
  const start = hm(b.time!);
  return blocks.filter((x) => x.time && hm(x.time) > start).map((x) => hm(x.time!)).sort((a, c) => a - c)[0] ?? null;
}
/**
 * The line her plan has you on right now: your name on it, or nobody's outside a split — never a line
 * whose group isn't named. One rule for Home, Now and the day screen ("~11:30 Collect luggage" has no end
 * time; it runs until her next line).
 */
export function currentPlanLine(blocks: GuideItem[], nowMin: number, me: string | null | undefined): GuideItem | undefined {
  const noOwner = ownerlessInSplit(blocks);
  return blocks.filter((b) => b.time && hm(b.time) <= nowMin && nowMin < planLineEnd(b, blocks) && isFor(b, me) && !noOwner.has(b.id))
    .sort((a, c) => hm(a.time!) - hm(c.time!)).pop();
}

/**
 * A line another of her tabs puts at another time, while a line at this very time agrees across her tabs — it's never
 * "Next" or "Now"; it stays in the day with its difference said (Sweep A, Oct 28 at 8 PM: Next read "NOW — 8:00 PM ·
 * Cafe Ensou", the Shigaraki lunch café her Dining Resos tab also lists at 8 PM, under "Now · Enyuan Kobayashi")
 */
export function outvoted(i: GuideItem, items: GuideItem[]): boolean {
  // (the other tab's time, when it's another time — "has “Café ENSOU lunch” at 1:00–2:30 PM")
  const at = (i.detail || "").match(/(?:^|\n)Tabs differ: .+ has .+ at (\d{1,2}):(\d{2})(?:\s*[–-]\s*\d{1,2}:\d{2})?\s*([AP]M)/);
  if (!i.time || !at) return false;
  if ((Number(at[1]) % 12 + (at[3] === "PM" ? 12 : 0)) * 60 + Number(at[2]) === hm(i.time)) return false;
  return items.some((o) => o !== i && o.time === i.time && ["meal", "block", "reservation", "tour"].includes(o.kind)
    && !/(^|\n)Tabs differ: /.test(o.detail || "") && !sameThing(o.title, i.title));
}

/**
 * Your booked meal, under way: from its booked time for two hours, until a later timed line of yours starts. It leads
 * "Now" over her plan line at the same hour — the booking is what you hold (Sweep B, Oct 17: at 5:45 Larisa's Next was
 * "LeTable de Joel Robuchon - 1F · Confirmation DDTGKE"; at 6:05 her plan's "Gastronomy “Joël Robuchon” (Ebisu)" took
 * over with no confirmation, and at 6:30 the dinner was gone from Home).
 */
export function mealUnderWay(items: GuideItem[], nowMin: number, me: string | null | undefined): GuideItem | undefined {
  const mine = items.filter((i) => !!i.time && isFor(i, me));
  const meal = mine.filter((i) => i.kind === "meal" && hm(i.time!) <= nowMin && nowMin < hm(i.time!) + 120 && !outvoted(i, items))
    .sort((a, b) => hm(b.time!) - hm(a.time!))[0];
  if (!meal) return undefined;
  const laterStarted = mine.some((i) => i !== meal && !["meal", "deadline"].includes(i.kind) && hm(i.time!) > hm(meal.time!) && hm(i.time!) <= nowMin);
  return laterStarted ? undefined : meal;
}

/**
 * The line under way right now that names no one while the group is split (Maruni Toryo 10:35–11:35 on
 * Oct 28) — said as "now", with its group left unsaid. Round 7: at 10:40 Home and Now said nothing at all.
 */
export function currentUnownedLine(blocks: GuideItem[], nowMin: number): GuideItem | undefined {
  const noOwner = ownerlessInSplit(blocks);
  return blocks.filter((b) => b.time && noOwner.has(b.id) && hm(b.time) <= nowMin && nowMin < planLineEnd(b, blocks))
    .sort((a, c) => hm(a.time!) - hm(c.time!)).pop();
}

/** Her pasted map links can be a Google search of a Maps address — the Maps address is what she meant */
export function unwrapSearchLink(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)google\.[a-z.]+$/i.test(u.hostname) && u.pathname === "/search") {
      const q = u.searchParams.get("q") || "";
      // Encoded twice in her cell (Gemini's links: "maps.apple.com/%253Fq%253DOchanomizu…"), one decode
      // leaves "/%3Fq%3D…", which Maps can't read (round 9: "Find in Maps" was a dead link)
      if (/^https?:\/\//i.test(q)) return /%3[fd]/i.test(q) ? safeDecode(q) : q;
    }
  } catch { /* not a URL */ }
  return url;
}
const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

/**
 * How Wander speaks of the Guide and its owner to the person looking: to Larisa herself it's "your Guide", "Your tabs
 * differ"; to everyone else "Larisa's Guide", "Her tabs differ" (delight audit: on Larisa's own phone Wander said
 * "Larisa's notes ›", "worth checking with Larisa" — "Wander doesn't know who I am").
 */
export function voiceFor(me: string | null | undefined, owner: string | null | undefined = "Larisa") {
  const name = owner || "Larisa";
  const mine = !!me && me.trim().toLowerCase() === name.toLowerCase();
  return {
    mine,
    /** "Larisa's Guide" / "your Guide" */
    guide: mine ? "your Guide" : `${name}'s Guide`,
    /** "her" / "your" (her plan, her tabs) */
    her: mine ? "your" : "her",
    Her: mine ? "Your" : "Her",
    /** "Larisa's" / "your" (Larisa's plan, Larisa's note) */
    owners: mine ? "your" : `${name}'s`,
    Owners: mine ? "Your" : `${name}'s`,
    /** "worth checking with Larisa" / "worth a second look" */
    checkWith: mine ? "worth a second look" : `worth checking with ${name}`,
    /** Words Wander wrote about her Guide ("the stop her tab lists", "her Itinerary tab agrees", "Larisa's Guide"),
     *  said to her as "your …" — her own cell text is never touched, only these phrasings */
    say: (text: string) => !mine ? text : capitalPut(text
      .replace(/worth checking with [A-Z][a-z]+/g, "worth a second look")
      .replace(new RegExp(`\\b${name}'s\\b`, "g"), `${PUT}your`)
      .replace(new RegExp(`\\b${name} (${Object.keys(BASE_VERB).join("|")})\\b`, "g"), (_m, verb) => `${PUT}you ${BASE_VERB[verb]}`)
      .replace(new RegExp(`\\b(for|with|to|by|from|of) ${name}\\b`, "g"), "$1 you")
      .replace(/\b([Hh])er (Guide|tab's|tabs?|Itinerary|Activities tab|Dining Resos|Rail|Backroads|day tab|plan|estimate|other tabs|lines?|notes?|travel line|hotel notes|forecast|pictures?|maps?|words|“)/g, (_m, h, what) => `${h === "H" ? "Your" : "your"} ${what}`)
      .replace(/\b([Ss])he (added|wrote|put|made|lists|marks|notes|names|gives|says|calls|has|is|was)\b/g, (_m, s, verb) => `${s === "S" ? "You" : "you"} ${BASE_VERB[verb] || verb}`)),
  };
}

/** A verb after "Larisa" / "she", as it reads after "you" ("Larisa notes is likely kaiseki" → "you note …") */
const BASE_VERB: Record<string, string> = {
  notes: "note", marks: "mark", lists: "list", names: "name", gives: "give", says: "say", calls: "call", adds: "add",
  writes: "write", wants: "want", plans: "plan", has: "have", is: "are", was: "were",
};

/** A "you"/"your" Wander put in place of a name gets a capital where it opens a sentence ("Larisa's line marks…" →
 *  "Your line marks…"); every other word, hers included, is left exactly as it was */
const PUT = "\u0001";
const capitalPut = (t: string) => t
  .replace(new RegExp(`(^|[.!?]\\s+|—\\s+|:\\s+|“)${PUT}y`, "g"), "$1Y")
  .split(PUT).join("");

/**
 * Wander's own sentences that name the travellers ("Ken, Larisa, Andy and Julie check out…", "with Julie and Andy still
 * at home"), said to one of them: their name in the list becomes "you" (Sweep B, Oct 10: Larisa read "Ken and Larisa
 * have a Nagoya day" atop her own day — "it sounds like it's talking about me to someone else"). Only lists of the trip's
 * people are reworded ("the MIHO Museum and Larisa" is not a list of people); a verb after a list is already plural, so
 * it reads right after "you".
 */
export function namesToYou(text: string, me: string | null | undefined, people: string[]): string {
  const who = (me || "").trim().split(/\s+/)[0];
  const names = [...new Set([who, ...people.map((p) => p.trim().split(/\s+/)[0])])].filter((n) => /^[A-Z][a-z]+$/.test(n || ""));
  if (!who || !names.includes(who)) return text;
  const NAME = `(?:${names.join("|")})`;
  const list = new RegExp(`\\b${NAME}(?:, ${NAME})*,? (?:and|&) ${NAME}\\b`, "g");
  return capitalPut(text.replace(list, (whole) => {
    const inList = whole.split(/,? (?:and|&) |, /);
    if (!inList.includes(who)) return whole;
    const others = inList.filter((n) => n !== who);
    return `${PUT}you${others.length === 1 ? ` and ${others[0]}` : `, ${others.slice(0, -1).join(", ")} and ${others[others.length - 1]}`}`;
  }));
}

/** A "tabs differ" note in words: "Her tabs differ — …", or "Her tab says two things — …" when both are in one tab
 *  (round 13: Oct 25's stop list and booking picture are both in her Kyoto Sun tab) */
export function differWordsFor(d: string, v: ReturnType<typeof voiceFor>, addressAt?: string): string {
  const within = /^within this tab — /.test(d);
  let rest = d.replace(/^within this tab — /, "").replace(/^her /, "").replace(/\bher\b/g, v.her);
  // Where no address shows beside it, "this address is her Dining Resos tab's" points at nothing (Oct 15 review, Julie's
  // Home): say where the booking's address is
  if (addressAt) rest = rest.replace(/this address is (\w+) (.+?) tab's\.?$/, (_m, who, tab) => `${who} ${tab} tab gives another address — ${addressAt}.`);
  return within ? `${v.Her} tab says two things — ${rest}` : `${v.Her} tabs differ — ${rest}`;
}

/** A free-cancellation window (not a reconfirmation): it asks nothing of anyone unless plans change (round 13: Julie read
 *  "Free cancellation ends · Imperial Hotel · Yours" and wondered what she had to do) */
export const isFreeCancel = (i: { title: string }) => /free cancel|cancel(lation)? free|last day to cancel/i.test(i.title) && !/reconfirm/i.test(i.title);
export const FREE_CANCEL_WORDS = "Nothing to do unless plans change.";

/** A confirmation that leads with whose it is reads as one name ("Ken & Larisa AbcXyz12" → "Larisa Abc…"):
 *  "Ken & Larisa: AbcXyz12" (round 13; invented code) */
export const confirmationWords = (c: string) => c.replace(/(^|[;·,]\s*)([A-Z][a-z]+ (?:&|and) [A-Z][a-z]+)\s+(?=[A-Za-z0-9-]{5,})/g, "$1$2: ");

/** The group a picture in her tab lists a line under, when her table names no one ("You & Julie (morning)") — the
 *  reader quotes it in the line's detail (round 13) */
export const PICTURE_GROUP = /^A picture in her tab lists this under “([^”]+)”.*$/m;
export const pictureGroupOf = (i: { detail?: string | null }) => (i.detail || "").match(PICTURE_GROUP)?.[1] || null;
/** Her picture's "You" isn't the reader (round 15: on Andy's phone "lists it under “You & Julie”" read as Andy). Who it
 *  is stays unnamed, as Scout is told (round 13) — said only that it isn't you. */
/** Sweep A (Oct 10): "that “you” is her map's, not you" asked Julie to untangle three "you"s, and never said her own name
 *  was there — now: when your name is in its heading, it says so; otherwise the heading is marked as her picture's words. */
export const pictureYou = (g: string, v: ReturnType<typeof voiceFor>, me?: string | null) =>
  (namesMe(g, me) ? " — your name is in it" : !v.mine && /\byou\b/i.test(g) ? ` (${v.her} picture's words)` : "");

/** "Her Guide doesn't name the group for this line" — or, when a picture in her tab does, the picture's own words
 *  (round 13: Wander said her Guide didn't name it; her Kyoto map lists "You & Julie") */
export function noGroupWords(i: { detail?: string | null }, v: ReturnType<typeof voiceFor>, me?: string | null): string {
  const g = pictureGroupOf(i);
  return g ? `${v.Her} plan names no group here; a picture in ${v.her} tab puts it under “${g}”${pictureYou(g, v, me)}`
    : `${v.Her} Guide doesn't name the group for this line`;
}

/** Her Itinerary note on a hotel's row — about that stay, not the day's line (round 12: Oct 27 was quoted as the Four
 *  Seasons room type). Listed with the day, never quoted as "In her Itinerary for today". */
export const besideHotel = (i: GuideItem) => /^Beside .+ in her Itinerary$/m.test(i.detail || "");

/** Every address in her link cell, each ready to open — a cell can hold two on separate lines (round 12: Oct 27's
 *  "Michelin page" joined a Michelin address and a Google search into one dead link) */
export function linksIn(link: string | null | undefined): string[] {
  const urls = (link || "").split(/\s+/).filter((u) => /^https?:\/\/\S+$/i.test(u)).map(unwrapSearchLink);
  return [...new Set(urls)];
}

/**
 * Web addresses in her words, as short links named for their site ("michelin.com ↗") — a raw address ran to
 * 395 characters, a dozen lines at large text, and couldn't be tapped (round 10). Her Google-wrapped map links
 * are unwrapped to the place itself.
 */
export function withWebLinks(text: string): { text: string; url?: string }[] {
  const parts: { text: string; url?: string }[] = [];
  let at = 0;
  // "www.robuchon.jp" in a pasted email signature is an address too (round 11: shown as plain text three times)
  for (const m of text.matchAll(/https?:\/\/[^\s<>"']+|(?<![\w@./-])www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"']*/gi)) {
    const raw = m[0].replace(/[.,;:)\]]+$/, "");
    const start = m.index ?? 0;
    if (start > at) parts.push({ text: text.slice(at, start) });
    const url = unwrapSearchLink(/^www\./i.test(raw) ? `https://${raw}` : raw);
    let site = "link";
    try { site = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep "link" */ }
    // A Google map or search says what opens (round 11: "google.com ↗" for her Ippudo map and her day's route)
    if (/^google\.[a-z.]+$/.test(site)) {
      site = /\/maps\/dir\//.test(url) ? "Google Maps route" : /\/maps\b|[?&]q=.*maps/.test(url) ? "Google Maps" : /\/search\b/.test(url) ? "Google search" : site;
    }
    parts.push({ text: `${site} ↗`, url });
    at = start + raw.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

/** Her words that differ between tabs, on the line itself ("Tabs differ: her Itinerary tab says …") */
export const tabsDiffer = (i: GuideItem) => (i.detail || "").split("\n").filter((l) => l.startsWith("Tabs differ: ")).map((l) => l.slice(13));

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
/** The same words on every phone: the date in the trip's zone, said as Japan's when the phone is elsewhere
 *  (Julie's phone in California said "Sep 29" while Ken's in Tokyo said "Sep 30" — one read, two dates) */
export function freshness(importedAt: string | undefined | null, now = new Date(), tripZone = "Asia/Tokyo") {
  if (!importedAt) return null;
  const read = new Date(importedAt);
  const days = Math.floor((now.getTime() - read.getTime()) / 86400000);
  const when = read.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tripZone });
  // (", Japan time" — Sweep A: "(Japan's date)" read as a puzzle)
  const zone = phoneIsElsewhere(tripZone) ? `, ${ZONE_WORDS[tripZone] || "the trip's time"}` : "";
  return { text: `Larisa's Guide, as Wander last read it on ${when}${zone}`, old: days > 7, days };
}

/** Her open questions in a note: a phrase she wrote in capitals ("WHERE IS BIZEN TOUR STARTING", "ASK KENJI TO …") or a
 *  part ending in "?" — each in her own words */
export function openQuestionsIn(text: string): string[] {
  const out = new Set<string>();
  // (words on one line only, a time like "3:45-4p" kept whole — round 12: "…STARTING L" took the next line's "L",
  // and "FINISH 3:45-4p AT TRAIN" stopped at "3:45-4")
  for (const m of text.matchAll(/\b[A-Z][A-Z0-9']+(?:[ \t]+[A-Z0-9][A-Z0-9'&:-]*(?:[ap](?![a-z]))?)+(?![A-Za-z])/g)) {
    if (m[0].split(/[ \t]+/).length >= 3 && /\b(WHERE|WHEN|WHO|WHAT|ASK|CONFIRM|CHECK|TBD|HOW)\b/.test(m[0])) out.add(m[0].trim());
  }
  for (const part of text.split(/\n| — | - |; /)) if (/\?\s*$/.test(part.trim()) && part.trim().length > 3) out.add(part.trim());
  return [...out];
}


/**
 * Her open questions for a stay on a date, only where that day's lines that are yours mention what it's about
 * ("WHERE IS BIZEN TOUR STARTING" on Oct 7 — not Ken & Larisa's Kenji question on Julie's landing day)
 */
export function openQuestionsOn(items: GuideItem[], date: string, me: string | null | undefined): string[] {
  const stops = items.filter((i) => i.kind === "stop" && (i.windowStart || ymd(i.date)) <= date && date <= ymd(i.date));
  const mine = distinctWords(items.filter((x) => ymd(x.date) === date && x.kind !== "stop" && isFor(x, me)).map((x) => `${x.title} ${x.detail || ""}`).join(" "));
  return [...new Set(stops.flatMap((s) => openQuestionsIn(`${s.title}\n${s.detail || ""}`)).filter((q) => distinctWords(q).some((w) => mine.includes(w))))];
}
