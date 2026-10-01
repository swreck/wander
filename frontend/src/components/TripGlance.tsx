/**
 * TripGlance — the top of Home: what Larisa's Guide says matters now, for the person holding the phone.
 *
 * Before your part of the trip: when you leave (Julie flies Oct 13 even though Ken and Larisa start
 * Oct 5), your first day, and deadlines in the next two weeks — each saying whose booking and at what
 * time, in Japan time and your own.
 * During it: today (a flight day leads with when to leave for the airport; then what's next, the rest,
 * same-day plans added in Wander, and where you sleep tonight — or that you're in the air), a line for
 * tomorrow, and deadlines in the next few days. Tapping anything opens that day, at that line.
 * After the trip: welcome home.
 *
 * Everything comes from the Guide, in Larisa's words; nothing is invented or nudged. Wander's own
 * estimates (leave-by) say that they are estimates.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { guideData, type TripGuideData, type GuideItem } from "../lib/guideData";
import { guideOwnerOf } from "../lib/tellGuideOwner";
import { sourcesData, railAudience, legIsFor, isBookedTrain, colOf, twelveHour, sourceWordsFor, pickupProgress, untickedTickets, herTab, withTwelveHour, railNoteFor, type OtherSource, type Checklist, type RailRow } from "../lib/sources";
import { checklistTitle, DifferLine, TicketWarnings } from "./RailSheet";
import { sheetNotes, airportWaysTo, type NotesByTab } from "../lib/sheetNotes";
import {
  ymd, clock, sortDay, timeLabel, itemTitle, isFor, partyOf, isLanding, nightOf, myNight,
  deadlineOver, deadlineOnDate, deadlineWhen, deadlineTimeWords, leaveForAirport, minutesToClock,
  freshness, isPlanningNote, isFragmentTitle, deadlineJustPassed, leavingOn, checkoutBeforeFirst, leadItem, ownerlessInSplit, tabsDiffer, saidAgain, currentPlanLine, planLineEnd, currentUnownedLine,
  withCheckoutWho, mapsLink, stayMapsQuery, lateLeaveWords, landingStatus, checkinAfterLanding, zoneWords, landingTitle, bookedByName, bookedWords, askedOf, nowMinutesOn, phoneIsElsewhere, tripClockMinutes, homeOnJapanDate, partiesOf, zonedMoment, openQuestionsOn, besideHotel, voiceFor, noGroupWords, confirmationWords, isFreeCancel, FREE_CANCEL_WORDS, sameThing, differWordsFor,
} from "../lib/guideDisplay";

interface DayChoice { id: string; date: string; time: string | null; text: string; addedBy: string; fromGuideIdea?: boolean }

function phoneToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
}

function dayLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : -1);

/** "in 2 hr 5 min" */
function flightIn(mins: number) {
  if (mins <= 0) return "now";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `in ${h} hr${m ? ` ${m} min` : ""}` : `in ${m} min`;
}

/** "Ken & Larisa" → "Ken & Larisa's" booking; "Everyone" → nothing to add */
function whose(i: GuideItem, me: string | null | undefined) {
  if (!i.forWhom || /^everyone$/i.test(i.forWhom)) return null;
  return isFor(i, me) ? `Yours (${i.forWhom})` : `For ${i.forWhom}`;
}

function ItemLine({ i, me, stays, date, day, onOpen, picks, all, tz, railSaysIt, railArrives, sources }: {
  /** Ken's rail sheet and any other source: what it has for a place her Guide asks you about (round 13) */
  sources?: OtherSource[];
  i: GuideItem; me?: string | null; stays: TripGuideData["stays"]; date: string; day?: GuideItem[];
  onOpen?: () => void; picks?: DayChoice[];
  /** The train row on the same card already says how her tabs and the rail sheet differ — not said twice */
  railSaysIt?: boolean;
  /** Her arrival line for a train the rail sheet books at another time: when the booked one arrives (round 13) */
  railArrives?: string | null;
  /** The whole Guide and the trip's zone: a landing then says where its flight stands, by the schedule */
  all?: GuideItem[]; tz?: string;
}) {
  const maybe = i.title.startsWith("Maybe:");
  const v = voiceFor(me);
  const flightNow = all && tz ? landingStatus(i, all, tz) : null;
  const other = i.forWhom && !isFor(i, me) ? i.forWhom : null;
  // A morning the Guide lists two places: each hotel's own time and code, never blended into one line
  const bothLeaving = i.kind === "checkout" ? leavingOn(stays, date) : [];
  if (bothLeaving.length > 1) {
    const ownHotel = i.title.replace(/^Check out · /, "").toLowerCase();
    return (
      <li className="flex gap-3 py-1.5">
        <span className="w-[4.75rem] shrink-0 text-right text-sm text-[#3a3128]">Check out</span>
        <span className="flex-1 min-w-0 text-sm leading-snug text-[#3a3128]">
          {bothLeaving.map((s) => {
            const mine = ownHotel.includes(s.name.toLowerCase().split(" ")[0]);
            return (
              <span key={s.id} className="block">
                {s.name}: {mine && i.time ? `by ${clock(i.time)}` : "no check-out time in the Guide"}
                {mine && i.confirmation && <span className="text-xs text-[#6b5d4a] [overflow-wrap:anywhere]"> · confirmation {i.confirmation}</span>}
              </span>
            );
          })}
          <span className="block text-xs text-[#6b5d4a] mt-0.5">The Guide lists both places — still being worked out.</span>
        </span>
      </li>
    );
  }
  // A line of her plan with choices: the group's pick (added in Wander), or that there's a choice to make
  const opts = i.kind === "block" ? (i.detail || "").split("\n").filter((l) => l.startsWith("Choice: ")).map((l) => l.slice(8).split(" — ")[0].trim()) : [];
  const pick = opts.length ? picks?.find((c) => opts.some((o) => c.text === `${i.title}: ${o}`)) : undefined;
  const body = (
    <>
      <span className="w-[4.75rem] shrink-0 text-right text-sm text-[#3a3128] tabular-nums">
        {timeLabel(i, day)}
        {/* A time on another clock says whose (round 8: Julie's Home showed "12:00 PM" for a San Francisco take-off) */}
        {/* …and on a phone still on home time, so does a Japan time (round 11: "Tomorrow · 3:00 PM · Land at
            Narita" read as Wednesday afternoon in California; it's 11:00 PM Tuesday there) */}
        {tz && i.time && (i.timeZone && i.timeZone !== tz
          ? <span className="block text-xs text-[#6b5d4a]">{zoneWords(i.timeZone)}</span>
          : phoneIsElsewhere(tz) && <span className="block text-xs text-[#6b5d4a]">{zoneWords(tz)}</span>)}
      </span>
      <span className={`flex-1 min-w-0 text-sm leading-snug ${maybe ? "italic text-[#6b5d4a]" : "text-[#3a3128]"}`}>
        {i.kind === "deadline" && <span className="font-medium">Deadline · </span>}
        {landingTitle(i, me, itemTitle(i, stays, date))}{pick ? ` — ${pick.text.slice(i.title.length + 2)}` : ""}
        {pick && <span className="block text-xs text-[#3f5a2a] mt-0.5">The group's pick · {pick.addedBy} picked it in Wander</span>}
        {flightNow && <span className="block text-xs text-[#514636] mt-0.5">{flightNow}</span>}
        {i.kind === "flight" && !isLanding(i) && (() => { const lands = (i.detail || "").match(/Lands at [^\n|]+/)?.[0]; return lands ? <span className="block text-xs text-[#514636] mt-0.5">{lands.trim()}</span> : null; })()}
        {opts.length > 0 && !pick && <span className="block text-xs text-[#8a5a1a] mt-0.5">{opts.length} places to choose from ›</span>}
        {i.kind !== "flight" && !railSaysIt && tabsDiffer(i).map((d) => <span key={d} className="block text-xs text-[#8a5a1a] mt-0.5">{differWordsFor(d, v)}</span>)}
        {railSaysIt && <span className="block text-xs text-[#6b5d4a] mt-0.5">The same train as the rail sheet's — the times differ, see below</span>}
        {/* (round 13: Oct 29's Home said "~2:00–2:30 Arrive KIX" under the 1:30 PM HARUKA, which arrives 2:50 PM) */}
        {railArrives && <span className="block text-xs text-[#8a5a1a] mt-0.5">Timed for the train in {v.her} tab — the booked train arrives {railArrives}</span>}
        {checkoutBeforeFirst(i, day) && <span className="block text-xs text-[#6b5d4a] mt-0.5">The hotel's check-out time is {clock(i.time)}</span>}
        {other && <span className="block text-xs text-[#6b5d4a] mt-0.5">For {other}</span>}
        {askedOf(i, me, phoneToday()) && <span className="block text-xs text-[#8a5a1a] mt-0.5">A question for you in Larisa's Guide — tap to tell her your answer.</span>}
        {askedOf(i, me, phoneToday()) && sources?.length && /\?/.test(i.title) ? (() => { const n = railNoteFor(i.title, sources, me); return n ? <span className="block text-xs text-[#514636] mt-0.5">{n}</span> : null; })() : null}
        {/* A meal her Guide says isn't booked says so here too (round 12: "Ippudo Ramen" alone read as a booking) */}
        {i.kind === "meal" && /no reservation/i.test(i.detail || "") && <span className="block text-xs text-[#6b5d4a] mt-0.5">No reservation</span>}
        {/* Two places booked for one time: say so here too, never pick one */}
        {(() => { const two = (i.detail || "").match(/The .+ tab lists \d+ places for this date and time[^\n]*/)?.[0]; return two ? <span className="block text-xs text-[#8a5a1a] mt-0.5">{two}</span> : null; })()}
        {i.confirmation && !other && <span className="block text-xs text-[#6b5d4a] mt-0.5 [overflow-wrap:anywhere]">Confirmation {confirmationWords(i.confirmation)}</span>}
      </span>
    </>
  );
  // Every line opens its day, at that line (tapping "Hassun" on Home did nothing)
  return onOpen
    ? <li><button onClick={onOpen} className="w-full text-left flex gap-3 py-1.5 min-h-[44px]">{body}</button></li>
    : <li className="flex gap-3 py-1.5">{body}</li>;
}

export default function TripGlance({ tripId }: { tripId: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const me = user?.displayName || null;
  const [data, setData] = useState<TripGuideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [choices, setChoices] = useState<DayChoice[]>([]);
  const [today, setToday] = useState(phoneToday());
  const [, setNow] = useState(nowMinutes());
  // Other sources (Ken's rail sheet): the ticket pickup and today's trains
  const [otherSources, setOtherSources] = useState<OtherSource[]>([]);
  useEffect(() => {
    let cancelled = false;
    sourcesData(tripId).then((d) => { if (!cancelled) setOtherSources(d.sources); }).catch(() => { /* Home still shows her Guide */ });
    return () => { cancelled = true; };
  }, [tripId]);
  // Her other tabs' text — so "her Guide doesn't say" is only said when none of her tabs does
  const [notesByTab, setNotesByTab] = useState<NotesByTab>({});
  useEffect(() => {
    let cancelled = false;
    sheetNotes(tripId).then((n) => { if (!cancelled) setNotesByTab(n); });
    return () => { cancelled = true; };
  }, [tripId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    guideData(tripId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { /* Home still shows the calendar */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tripId]);

  // Same-day plans people added in Wander, for today and tomorrow
  useEffect(() => {
    let cancelled = false;
    const load = () => api.get<DayChoice[]>(`/day-choices/${tripId}`)
      .then((c) => { if (!cancelled) setChoices(c); })
      .catch(() => { /* not essential */ });
    load();
    window.addEventListener("wander:data-changed", load);
    return () => { cancelled = true; window.removeEventListener("wander:data-changed", load); };
  }, [tripId]);

  // Keep "today" and "next" honest if Home stays open across midnight or for hours — and the moment
  // the phone is picked up again (locked overnight, it must not show yesterday as today)
  useEffect(() => {
    const refresh = () => { setToday(phoneToday()); setNow(nowMinutes()); };
    const t = setInterval(refresh, 60_000);
    const onShow = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onShow); window.removeEventListener("focus", refresh); };
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const first = ymd(data.trip.startDate);
    const last = ymd(data.trip.endDate);
    const tz = data.trip.timeZone || "Asia/Tokyo";
    const party = partyOf(data.items, me);
    // Your own first day: your first flight or check-in, when the Guide says whose they are
    const mine = party ? data.items.filter((i) => i.date && i.forWhom === party && ["flight", "checkin"].includes(i.kind) && !isLanding(i)) : [];
    const myFirst = mine.map((i) => ymd(i.date)).sort()[0] || first;
    const on = (date: string) => sortDay(withCheckoutWho(data.items.filter((i) => ymd(i.date) === date && !["deadline", "stop", "weather", "block"].includes(i.kind) && !isPlanningNote(i) && !isFragmentTitle(i)), date, data.stays, data.items), tz);
    // Coming up — plus any that passed in the last day ("Passed"), so nobody wonders where one went
    // A passed one only when there's something it means for you (delight audit: Julie read "JUST PASSED · Free
    // cancellation ends · Yours" as "you missed something", and was handed Larisa's passed reconfirmation): a free-
    // cancellation window that closed asks nothing of anyone; a passed to-do is said only to whoever it belonged to
    const passedForMe = (i: GuideItem) => {
      if (/free cancel|cancel(lation)? free|last day to cancel/i.test(i.title) && !/reconfirm/i.test(i.title)) return false;
      const owner = i.forWhom && !/^everyone$/i.test(i.forWhom) ? (isFor(i, me) ? me : "someone else") : bookedByName(i)?.split(/\s+/)[0] || null;
      return !owner || !me || owner.toLowerCase() === me.toLowerCase();
    };
    const deadlinesAhead = (from: string, span: number) => data.items
      .filter((i) => i.kind === "deadline" && (!deadlineOver(i, tz) || (deadlineJustPassed(i, tz) && passedForMe(i))) &&
        (ymd(i.date) >= from || deadlineOnDate(i, from) || deadlineJustPassed(i, tz)) && (i.windowStart || ymd(i.date)) <= addDays(from, span))
      // A window sorts by when it opens ("Oct 10 – 14" before an Oct 11 cutoff)
      .sort((a, b) => (a.windowStart || ymd(a.date)).localeCompare(b.windowStart || ymd(b.date)));
    // Larisa's detailed plan for a day (a day tab), in her order — Next weighs its times; a block at the
    // same time as an Itinerary line is that line said again, so the Itinerary's wording is kept
    const planOn = (date: string) => {
      const blocks = data.items.filter((i) => i.kind === "block" && ymd(i.date) === date).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      // (a same-time match alone hid the 12:00 transfer to Kyoto Station behind the noon check-out)
      const overview = on(date);
      const noOwner = ownerlessInSplit(blocks);
      const said = (b: GuideItem) => overview.some((o) => saidAgain(b, o));
      return { all: blocks, noOwner, timed: blocks.filter((b) => b.time && !said(b) && !noOwner.has(b.id)) };
    };
    return { first, last, tz, myFirst, on, planOn, deadlinesAhead };
  }, [data, me]);

  // While it loads, hold its place: the calendar used to sit at the top for half a second, then drop ~500px when this
  // arrived, under a thumb about to tap a day (round 12). A calm card in its place keeps everything below still.
  if (!data || !view || !view.first || !view.last) {
    // (nothing at all once it has finished — no Guide, or no signal and no saved copy: the calendar says the rest)
    if (!loading) return null;
    return (
      // A full screen tall, so the calendar only ever moves while off-screen (60vh still let it shift 290px in view)
      <section className="mb-4 rounded-xl bg-white border border-[#e0d8cc] p-4 min-h-[100dvh]" aria-busy="true">
        <p className="text-sm text-[#6b5d4a]">Opening today…</p>
      </section>
    );
  }
  const { first, last, tz, myFirst, on, planOn, deadlinesAhead } = view;

  const card = "mb-4 rounded-xl bg-white border border-[#e0d8cc] p-4";
  // Japan's own date and time (for the others, when you're not there yet)
  const japanToday = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const japanNowWords = new Date().toLocaleString("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" });
  const openDay = (date: string, itemId?: string) => navigate(`/day/${date}${itemId ? `#item-${itemId}` : ""}`);
  const cityOn = (date: string) => data.days.find((x) => ymd(x.date) === date)?.city?.name || null;
  // Where the others are on a Japan date: on a moving day, the move itself (round 8: at 10 AM on the Nagoya →
  // Tokyo day, Julie's Home said "the others are in Tokyo" while they were still in Nagoya or on the train) —
  // the same "from → to" the day screen's header uses
  // Before the others have landed, where they really are — by their flights' schedule, never the calendar's city
  // (round 12 blocker: at 9 AM in California Julie read "the others are in Okayama" while they were still home,
  // and the day it opened said "Should be in the air now")
  const othersArriving = (): string | null => {
    const now = Date.now();
    for (const p of partiesOf(data.items).filter((p) => !isFor({ forWhom: p }, me))) {
      const byDate = (a: GuideItem, b: GuideItem) => ymd(a.date).localeCompare(ymd(b.date));
      const land = data.items.filter((i) => isLanding(i) && i.forWhom === p && i.time && i.date).sort(byDate)[0];
      if (!land) continue;
      const landsAt = zonedMoment(ymd(land.date), toMin(land.time), land.timeZone || tz);
      const airport = land.title.replace(/^Land at /i, "").split(" · ")[0];
      if (now >= landsAt.getTime()) {
        // Landed, and still on the way to the day's city — until their last train that day arrives, or a few
        // hours with no trains (round 12: at 6:30 PM Andy read "the others are in Okayama" while Ken & Larisa
        // were at Shin-Osaka collecting tickets, before the 6:17 PM NOZOMI 77)
        const landDate = ymd(land.date);
        if (japanToday !== landDate) continue;
        const who = p.split(/\s*(?:&|and|,)\s*/i)[0];
        const arrivals = rail.flatMap((x) => x.s.rail
          .filter((r) => r.date === landDate && isBookedTrain(r) && legIsFor(r, x.s, who, x.ownerParty, x.groupSize))
          .map((r) => colOf(r.cols, /^arrive/)).filter(Boolean));
        const lastArrive = arrivals.sort().pop();
        const until = lastArrive ? zonedMoment(landDate, toMin(lastArrive.padStart(5, "0")), tz).getTime() : landsAt.getTime() + 3 * 3600_000;
        if (now >= until) continue;
        const city = cityOn(landDate);
        const landed = landsAt.toLocaleString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
        const due = lastArrive ? ` — due there about ${twelveHour(lastArrive)}` : "";
        return `${p} landed at ${airport} at ${landed}, by the schedule, and are on their way${city ? ` to ${city}` : ""}${due}`;
      }
      const dep = data.items.filter((f) => f.kind === "flight" && !isLanding(f) && f.forWhom === p && f.time && f.date).sort(byDate)[0];
      const depAt = dep ? zonedMoment(ymd(dep.date), toMin(dep.time), dep.timeZone || tz).getTime() : null;
      const when = landsAt.toLocaleString("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).replace(",", "");
      return depAt !== null && now < depAt
        ? `${p} haven't left home yet — they're due to land at ${airport} ${when} Japan time`
        : `${p} should be in the air — due to land at ${airport} ${when} Japan time, by the schedule`;
    }
    return null;
  };
  const othersWhere = (date: string) => {
    const leaving = data.stays.find((s) => ymd(s.checkOutDate) === date);
    const from = leaving ? data.trip.cities?.find((c) => c.id === leaving.cityId)?.name : null;
    const to = cityOn(date);
    return from && to && from !== to ? `the others travel from ${from} to ${to} today` : `the others are in ${to || "Japan"}`;
  };
  // Whose Guide it is — she is never told to ask herself (round 9: "ask Larisa if you're not sure", to Larisa)
  const owner = guideOwnerOf(data.trip.tagline);
  // How Wander speaks of the Guide to the person looking ("your Guide" to Larisa herself)
  const v = voiceFor(me, owner);
  const cantTell = owner && me && owner.toLowerCase() !== me.toLowerCase()
    ? `Wander can't tell whether it was done — ask ${owner} if you're not sure.` : "Wander can't tell whether it was done.";
  const bookedBy = bookedByName;
  // Ken's rail sheet: its pickup steps for the sheet owner's couple (their job), and each person's own trains
  const rail = otherSources.map((s) => ({ s, ...railAudience(data.items, s.owner) }));
  const pickups = rail.filter((x) => x.ownerParty && isFor({ forWhom: x.ownerParty }, me))
    .flatMap((x) => x.s.checklists.filter((c) => c.date && c.date >= today).map((c) => ({ s: x.s, c: c as Checklist & { date: string } })));
  const trainsOn = (date: string) => rail.flatMap((x) => x.s.rail
    .filter((r) => r.date === date && isBookedTrain(r) && legIsFor(r, x.s, me, x.ownerParty, x.groupSize))
    .map((r) => ({ s: x.s, r })));
  const pickupLink = ({ s, c }: (typeof pickups)[number], lead: string) => {
    // "for before you go" while you're still home — the morning you fly too, the last chance to pack the card and the
    // 4-digit IDs (round 13: on Oct 5 at 8:30 AM it had gone, though neither step was ticked); from the next day it's past
    const before = today <= myFirst ? c.steps.filter((x) => /^before travel/i.test(colOf(x.cols, /^step$/))).length : 0;
    return (
      <button key={`${s.id}-${c.tab}`} onClick={() => navigate(`/checklist/${encodeURIComponent(s.id)}/${encodeURIComponent(c.tab)}`)}
        className="w-full text-left text-sm text-[#514636] min-h-[44px] py-1.5">
        <span className="text-[#8a5a1a]">{lead}</span>{checklistTitle(c.tab)}: the steps{before ? ` — ${before === 1 ? "one is" : `${before} are`} for before you go` : ""}{(() => { const p = pickupProgress(s.id, c); return !p.done ? "" : p.tickets.of ? ` — ${p.tickets.done} of ${p.tickets.of} tickets ticked` : ` — ${p.done} of ${p.of} ticked`; })()} ›
        <span className="block text-xs text-[#6b5d4a] mt-0.5">From {sourceWordsFor(s, me)}</span>
      </button>
    );
  };
  const f = freshness(data.status?.current?.importedAt, new Date(), tz);
  const freshLine = f && (
    <p className={`text-xs mt-3 ${f.old ? "text-[#8a5a1a]" : "text-[#6b5d4a]"}`}>
      {v.mine ? f.text.replace(/^Larisa's Guide/, "Your Guide") : f.text}.{f.old && !v.mine ? " Larisa may have changed things since." : ""}
    </p>
  );

  const DeadlineList = ({ list, title }: { list: GuideItem[]; title: string }) => list.length === 0 ? null : (
    <div className="mt-2 pt-3 border-t border-[#efe9df]">
      <h3 className="text-xs uppercase tracking-wide text-[#8a5a1a] mb-1">{title}</h3>
      <ul>
        {list.map((i) => {
          const time = deadlineTimeWords(i, tz);
          const who = whose(i, me);
          const passed = deadlineOver(i, tz);
          return (
            <li key={i.id}>
              <button onClick={() => openDay(ymd(i.date), i.id)} className="w-full text-left py-1.5 min-h-[44px]">
                <span className={`block text-sm ${passed ? "text-[#6b5d4a]" : "text-[#3a3128]"}`}>
                  {/* Under "Just passed" the heading says it once (round 9: "JUST PASSED / Passed · …") */}
                  {passed && title === "Just passed" ? null : <><span className="text-[#8a5a1a]">{passed ? "Passed" : deadlineWhen(i, today)}</span> · </>}{i.title}
                </span>
                {/* Whose booking it is, when no one's name is on the line (round 9: Julie asked "do I have to call a
                    restaurant in Tokyo?" about Larisa's Robuchon booking) */}
                {(who || time || bookedBy(i)) && <span className="block text-xs text-[#6b5d4a] mt-0.5">{[who || bookedWords(i, me), time].filter(Boolean).join(" · ")}</span>}
                {!passed && isFreeCancel(i) && <span className="block text-xs text-[#6b5d4a] mt-0.5">{FREE_CANCEL_WORDS}</span>}
                {passed && /reconfirm|confirm|call|book|pay|send|submit|register/i.test(i.title) && (
                  <span className="block text-xs text-[#6b5d4a] mt-0.5">{cantTell}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  // ── After the trip ──
  if (today > last) {
    return (
      <section className={card}>
        <p className="text-base text-[#3a3128]">Welcome home.</p>
        <button onClick={() => openDay(last)} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Look back at the last day ›</button>
      </section>
    );
  }

  // ── Before your part of the trip ──
  if (today < myFirst) {
    const n = daysBetween(today, myFirst);
    const groupStarted = myFirst !== first;
    // Your own lines that day (your flight), not the others' plans for the same date
    const onFirst = on(myFirst);
    const ownFirst = onFirst.filter((i) => i.forWhom && !/^everyone$/i.test(i.forWhom) && isFor(i, me));
    const firstItems = groupStarted ? ownFirst : onFirst.filter((i) => isFor(i, me));
    return (
      <section className={card}>
        <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a]">
          {groupStarted
            ? (n === 1 ? "You leave tomorrow" : `You leave in ${n} days`)
            : (n === 1 ? "The trip starts tomorrow" : `The trip starts in ${n} days`)}
        </h2>
        <button onClick={() => openDay(myFirst)} className="w-full text-left mt-1">
          <p className="text-base text-[#3a3128]">{dayLabel(myFirst)}</p>
          {firstItems.length > 0 && <ul className="mt-1">{firstItems.slice(0, 2).map((i) => <ItemLine key={i.id} i={i} me={me} stays={data.stays} date={myFirst} all={data.items} tz={tz} />)}</ul>}
          <span className="inline-flex items-center min-h-[44px] text-sm text-[#514636]">See the day ›</span>
        </button>
        {groupStarted && today < first && (
          <p className="text-xs text-[#6b5d4a]">The trip itself starts {dayLabel(first)}.</p>
        )}
        {groupStarted && japanToday >= first && japanToday <= last && (
          // The others live on Japan's clock: when it's Wednesday evening here, it's already Thursday there
          <button onClick={() => openDay(japanToday)} className="w-full text-left text-sm text-[#514636] min-h-[44px]">
            Right now in Japan ({japanNowWords}): {othersArriving() || othersWhere(japanToday)} ›
          </button>
        )}
        {/* The ticket pickup (Ken's rail sheet): two of its steps are for before you leave home */}
        {pickups.length > 0 && <div className="mt-2 pt-2 border-t border-[#efe9df]">{pickups.map((p) => pickupLink(p, `${dayLabel(p.c.date)} · `))}</div>}
        {/* A passed one goes under its own heading, as during the trip (round 8: "Ended" sat under "coming up") */}
        <DeadlineList list={deadlinesAhead(today, 14).filter((i) => !deadlineOver(i, tz))} title="Deadlines coming up" />
        <DeadlineList list={deadlinesAhead(today, 14).filter((i) => deadlineOver(i, tz))} title="Just passed" />
        {freshLine}
      </section>
    );
  }

  // ── During the trip ──
  const todays = on(today);
  const mineToday = todays.filter((i) => isFor(i, me));
  const flight = mineToday.find((i) => i.kind === "flight" && !isLanding(i) && i.time);
  const plan = planOn(today);
  // Her own plan for getting to the airport replaces Wander's estimate
  const herAirportPlan = plan.all.some((b) => /haruka|airport|\bKIX\b|transfer/i.test(b.title));
  const leave = flight && !herAirportPlan ? leaveForAirport(flight, cityOn(today)) : null;
  const flightAt = flight ? toMin(flight.time) : -1;
  // Right now, on the clock each time is on: Japan's for her Guide's lines, a flight's own for a flight from home.
  // The phone's clock only matches when the phone is in Japan (round 11: at 1:00 AM in California, Julie was told
  // Narita's 3:00 PM landing was 14 hours away; it had been due two hours earlier)
  const tripNow = nowMinutesOn(today, tz);
  const nowFor = (i: { timeZone?: string | null }) => (i.timeZone && i.timeZone !== tz ? nowMinutesOn(today, i.timeZone) : tripNow);
  const flightNow = flight ? nowFor(flight) : tripNow;
  const showLeave = !!leave && flightNow < flightAt;
  const appointments = [...mineToday.filter((i) => i.time && !["checkout", "checkin"].includes(i.kind)), ...plan.timed.filter((b) => isFor(b, me))]
    .sort((a, b) => tripClockMinutes(a, tz) - tripClockMinutes(b, tz));
  // Where her plan puts you right now ("MIHO Museum, until ~12:35 PM") — only a line with your name on it,
  // or one for everybody outside a split; never a guess
  const current = currentPlanLine(plan.all, tripNow, me);
  // Under way with no group named (Maruni Toryo, 10:35–11:35): said as now, its group left unsaid
  const currentUnowned = !current ? currentUnownedLine(plan.all, tripNow) : undefined;
  // On a train now (Ken's rail sheet): until it arrives, arriving is what's next — her lines timed before then aren't
  // "Next" or listed (round 12: on the 1:30 PM HARUKA, "Next · ~2:00–2:30 Arrive KIX" — her arrival for her 12:30 train)
  const ridingArr = (() => {
    for (const { r } of trainsOn(today)) {
      const d = toMin(colOf(r.cols, /^depart/).padStart(5, "0"));
      const a0 = colOf(r.cols, /^arrive/);
      const a = a0 ? toMin(a0.padStart(5, "0")) : null;
      if (a !== null && a > d && d < tripNow && tripNow < a) return a;
    }
    return null;
  })();
  // Her line for a train the rail sheet has at another time: the train's row says the whole difference once
  // (delight audit: Oct 29's Home said it twice, in two wordings, about eight amber lines)
  const railSaysIt = (g: GuideItem) => !!g.time && trainsOn(today).length > 0 && rail.some((x) => x.s.differs.some((d) => d.date === today
    && d.guideSays === (g.endTime ? `${twelveHour(g.time!)}–${twelveHour(g.endTime)}` : twelveHour(g.time!))));
  // Her "Arrive KIX" line, on a day the rail sheet books that train at another time than her tab: the booked arrival
  const railArrives = (g: GuideItem): string | null => {
    if (!g.time || !/\barriv/i.test(g.title)) return null;
    for (const { s, r } of trainsOn(today)) {
      if (!s.differs.some((d) => d.date === today && d.row === r.row)) continue;
      const to = (colOf(r.cols, /^route$/).split(/→|->/)[1] || "").trim().split(/[\s(]/)[0];
      const arr = colOf(r.cols, /^arrive/);
      if (to && arr && new RegExp(`\\b${to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(g.title)) return twelveHour(arr);
    }
    return null;
  };
  // Just landed, before your first booked train: the rail sheet's leg with no booking that comes before it
  const myRail = rail.flatMap((x) => x.s.rail.filter((r) => r.date === today && legIsFor(r, x.s, me, x.ownerParty, x.groupSize)).map((r) => ({ s: x.s, r })));
  const depOf = (r: RailRow) => toMin(colOf(r.cols, /^depart/).padStart(5, "0"));
  const firstBooked = myRail.filter(({ r }) => isBookedTrain(r)).sort((a, b) => depOf(a.r) - depOf(b.r))[0];
  const myParty = partyOf(data.items, me);
  const landedToday = data.items.find((l) => isLanding(l) && l.forWhom === myParty && l.time && ymd(l.date) === today);
  // (until you're on your way: a pickup step ticked, or 90 minutes after landing — as on Now)
  const pickupStarted = firstBooked ? firstBooked.s.checklists.some((c) => c.date === today && pickupProgress(firstBooked.s.id, c).started) : false;
  const legBefore = firstBooked && landedToday && tripNow >= toMin(landedToday.time!) && tripNow < toMin(landedToday.time!) + 90 && !pickupStarted
    && tripNow < depOf(firstBooked.r)
    ? myRail.find(({ s, r }) => s.id === firstBooked.s.id && !isBookedTrain(r) && r.row < firstBooked.r.row) : undefined;
  const duringRide = (i: GuideItem) => ridingArr !== null && i.kind !== "flight" && !!i.time && toMin(i.time) < ridingArr;
  // Her line for a train the rail sheet has at another time: the train row shows it once, with the difference — her
  // line isn't Next or listed again (delight audit: Oct 29's Home showed the HARUKA twice, explained twice)
  const sameTrainAsRail = (g: GuideItem) => !!g.time && rail.some((x) => x.s.differs.some((d) => d.date === today
    && d.guideSays === (g.endTime ? `${twelveHour(g.time!)}–${twelveHour(g.endTime)}` : twelveHour(g.time!))));
  const next = appointments.find((i) => toMin(i.time) >= nowFor(i) && i !== current && !duringRide(i) && !sameTrainAsRail(i));
  const currentRough = !!current && (/^~/.test(current.timeText || "") || (current.detail || "").includes("Times are Larisa's estimate."));
  // Leaving a hotel this morning comes before whatever is next ("by noon" isn't after an 8:30 meeting)
  // A check-out whose time has gone by (noon, when it's 3pm) is done — it no longer leads the card
  const checkedOut = plan.all.some((b) => b.time && /check\s*-?\s*out/i.test(b.title) && toMin(b.time) < tripNow);
  const checkouts = checkedOut ? [] : todays.filter((i) => i.kind === "checkout" && isFor(i, me) && (!i.time || toMin(i.time) >= nowFor(i)));
  const dayWithPlan = [...todays, ...plan.all];
  // A line nobody's name is on during a split, before "Next": said, never assigned
  const unownedSoon = plan.all.find((b) => b !== currentUnowned && plan.noOwner.has(b.id) && b.time && toMin(b.time) >= tripNow && (!next?.time || toMin(b.time) < toMin(next.time)));
  // Her remaining plan lines for you, after "Next" (Home skipped her 5:00 return to the hotel)
  const planRows = plan.timed.filter((b) => isFor(b, me) && b !== next && b !== current && toMin(b.time) > tripNow && !duringRide(b)
    && !(trainsOn(today).length > 0 && sameTrainAsRail(b)));
  // After the flight home has left: say so, and when it lands (the day's other lines are behind them)
  const departed = !!flight && flightNow >= flightAt;
  const landsWords = departed ? ((flight!.detail || "").match(/Lands at [^\n|]+/)?.[0] || "").trim() : "";
  // On a day with her detailed plan, her Itinerary tab's own untimed line for the day is shown as hers, up top
  // (a "see above …" row points at her sheet's layout, not at anything here — it's never the day's headline;
  // round 9: Oct 25 led with "see above - 1/2 day")
  // (every day, not only one with her detailed plan — round 13: on Oct 23, a Backroads day, Home read "Next 7:00 PM
  // Saryo Tesshin" above "day 6 - hike, train to kyoto", the day's real business floating below a dinner 10 hours off)
  // (her "day 8 - hike, brunch (…)" is read as a meal for its "brunch" — a line headed like her day ("day 7 -", "Kyoto
  // day 3 -") is the day's line whatever its kind; round 13: Oct 24 and 25 weren't quoted)
  const itineraryLines = todays.filter((i) => !i.time && /itinerary/i.test(i.source) && (["plan", "tour", "note"].includes(i.kind) || /^(\w+\s)?day\s*\d+\s*-/i.test(i.title)) && !besideHotel(i) && !/\binterested\?/i.test(i.title) && !/^see above\b/i.test(i.title));
  // A landing stays all day (round 8: at 6 PM Home had dropped it, leaving "After landing · Check in" hanging)
  // (a note beside a hotel in her Itinerary — a room type — stays on the day screen, not Home's short list)
  // (a "… interested?" question is moot on its own day — off Home's list; the day screen keeps it; delight audit)
  const rest = todays.filter((i) => !itineraryLines.includes(i) && !besideHotel(i) && !/\binterested\?/i.test(i.title) && i !== next && i.kind !== "checkout" && !(showLeave && i === flight) && (!i.time || toMin(i.time) >= nowFor(i) || i.kind === "checkin" || isLanding(i)));
  // A pick among her choices shows on her plan's line, not again as its own row
  const inHerPlan = (g?: GuideItem) => !!g && g.kind !== "block" && plan.all.some((b) => saidAgain(b, g));
  const todayChoices = choices.filter((c) => c.date === today && !plan.all.some((b) => c.text.startsWith(`${b.title}: `)));
  // A plan added in Wander that comes before her Guide's next line is "Next", as on Now (round 12: after adding a
  // 10:30 plan, Now said "Next 10:30" while Home still said "Next 11:45 …")
  const nextPlan = todayChoices.filter((c) => c.time && toMin(c.time) >= tripNow).sort((a, b) => a.time!.localeCompare(b.time!))[0];
  // Your next train from Ken's rail sheet is "Next" when it comes first (round 12: Oct 13's Home said "Next 8:00 PM
  // Tapas" above the 10:36 AM NOZOMI 6; Now had it right)
  const departMin = (r: RailRow) => toMin(colOf(r.cols, /^depart/).padStart(5, "0"));
  const nextTrain = trainsOn(today).filter(({ r }) => departMin(r) >= tripNow).sort((a, b) => departMin(a.r) - departMin(b.r))[0];
  const sameLeg = (a?: { s: OtherSource; r: RailRow }, b?: { s: OtherSource; r: RailRow }) => !!a && !!b && a.s.id === b.s.id && a.r.row === b.r.row;
  // The train you're on, by the rail sheet's times: between leaving and arriving (round 12: at 6:19 PM the NOZOMI 77
  // Ken had boarded at 6:17 vanished from Home, seats and arrival with it)
  const arriveMin = (r: RailRow) => { const a = colOf(r.cols, /^arrive/); return a ? toMin(a.padStart(5, "0")) : null; };
  const onTrain = trainsOn(today).find(({ r }) => { const a = arriveMin(r); return departMin(r) < tripNow && a !== null && a > departMin(r) && tripNow < a; });
  const trainIsNext = !!nextTrain && (!next?.time || departMin(nextTrain.r) < toMin(next.time)) && !(nextPlan?.time && toMin(nextPlan.time) < departMin(nextTrain.r));
  const planIsNext = !trainIsNext && !!nextPlan && (!next?.time || toMin(nextPlan.time) < toMin(next.time));
  // Plans added in Wander sit in the day's time order with the Guide's lines
  type Row = { key: string; time: string | null; guide?: GuideItem; choice?: DayChoice; train?: { s: OtherSource; r: RailRow }; bits?: GuideItem[] };
  // A check-in that opens before the same people land sorts just after their landing (round 8: "After
  // landing · Check in" sat above "3:00 PM Land at Narita")
  const rowTime = (i: GuideItem) => {
    if (!checkinAfterLanding(i, todays)) return i.time;
    const landing = todays.find((l) => isLanding(l) && l.time && (!l.forWhom || !i.forWhom || l.forWhom === i.forWhom || /^everyone$/i.test(l.forWhom)));
    return landing?.time ? `${landing.time}~` : i.time;
  };
  // The day's own untimed lines ("Day trip to Mashiko") lead, as on the day screen; then times; then untimed
  // meals and deadlines (round 8: Ken's all-day Mashiko trip sat under Julie & Andy's 3 PM landing)
  // (someone else's untimed line — Ken & Larisa's Mashiko day trip — goes after your own, not above Julie's landing; round 12)
  const theirs = (g?: GuideItem) => !!g?.forWhom && !/^everyone$/i.test(g.forWhom) && !isFor(g, me);
  const rank = (r: Row) => (r.time ? 1 : r.guide && (["meal", "deadline"].includes(r.guide.kind) || theirs(r.guide)) ? 2 : 0);
  // Her Itinerary's short untimed lines for the day ("Osaka → Okayama", "Rikuro Cheesecake", "Shinkansen") share one
  // line, in her words — one row each pushed the landing off a small phone (round 12)
  const itinBits = rest.filter((i) => !i.time && /^itinerary/i.test(i.source) && ["plan", "note", "train", "travel"].includes(i.kind)
    && !i.forWhom && !(i.detail || "").trim() && i.title.length <= 40);
  const rows: Row[] = [
    ...(itinBits.length > 1 ? [{ key: "itin-bits", time: null, bits: itinBits }] : []),
    ...rest.filter((i) => !(itinBits.length > 1 && itinBits.includes(i))).map((i) => ({ key: i.id, time: rowTime(i), guide: i })),
    ...planRows.map((b) => ({ key: b.id, time: b.time, guide: b })),
    ...todayChoices.filter((c) => !(planIsNext && c === nextPlan)).map((c) => ({ key: c.id, time: c.time, choice: c })),
    // Your trains still to come today, from Ken's rail sheet, in time order with the rest (round 12: the 6:17 PM train
    // sat above the 2:50 PM landing)
    ...trainsOn(today).filter(({ r }) => tripClockMinutes({ time: colOf(r.cols, /^depart/) } as GuideItem, tz) >= tripNow)
      // (by its row, not its object — each call builds new ones; round 12: Home listed the Next train again below it)
      .filter((t) => !(trainIsNext && sameLeg(t, nextTrain)))
      .map(({ s, r }) => ({ key: `train-${s.id}-${r.row}`, time: colOf(r.cols, /^depart/).padStart(5, "0"), train: { s, r } })),
    // (her Guide's next line, when a plan added in Wander or a train took the Next spot, stays in the list)
    ...((planIsNext || trainIsNext) && next ? [{ key: next.id, time: next.kind === "block" ? next.time : rowTime(next), guide: next }] : []),
  ].sort((a, b) => rank(a) - rank(b) || (a.time && b.time ? a.time.localeCompare(b.time) : 0)
    || (inHerPlan((b as Row).guide) ? 1 : 0) - (inHerPlan((a as Row).guide) ? 1 : 0));
  // A line of her plan still waiting for a pick is always shown, never folded into "and N more" (round 7:
  // at 9:00 nothing on Home said lunch needed deciding)
  const undecided = (r: Row) => !!r.guide && r.guide.kind === "block" && /(^|\n)Choice: /.test(r.guide.detail || "")
    && !choices.some((c) => c.text.startsWith(`${r.guide!.title}: `));
  // A flight always shows (round 12: at 9:00 on the airport day the flight home was under "and 1 more ›")
  // A booking always shows too (round 13: Oct 16's only reservation, dinner at Une Immersion, was under "and 2 more ›")
  // (her Dining Resos tab is her bookings — Une Immersion is there with no confirmation number)
  const booked = (r: Row) => !!r.guide && (r.guide.kind === "reservation" || !!r.guide.confirmation || /\breservation\b/i.test(r.guide.title)
    || (r.guide.kind === "meal" && /\bresos?\b|reservation/i.test(r.guide.source || "") && !/no reservation/i.test(r.guide.detail || "")));
  const shownRows = rows.filter((r, n) => n < 5 || undecided(r) || r.guide?.kind === "flight" || !!r.train || booked(r));
  // "and N more ›" opens the day at the first line Home left out, not at the top of her plan
  const firstHidden = rows.find((r) => !shownRows.includes(r));
  const night = today < last ? myNight(nightOf(today, data.stays, data.items, tz, true), me) : null;
  const tomorrow = addDays(today, 1);
  // Whose clock a time is on, when it isn't the phone's (a take-off from home; Japan's, on a phone still at home)
  const zoneTag = (i: GuideItem) => (!i.time ? "" : i.timeZone && i.timeZone !== tz ? ` ${zoneWords(i.timeZone)}` : phoneIsElsewhere(tz) ? ` ${zoneWords(tz)}` : "");
  // A landing Tonight already gives ("On the plane — lands at Narita …") isn't said again as Tomorrow's (round 11:
  // Julie's Home had her landing both tonight and tomorrow)
  const landingSaidTonight = !!night?.away.some((a) => /^On the plane/.test(a.text));
  const tomorrowItems = tomorrow <= last ? on(tomorrow).filter((i) => isFor(i, me) && !(landingSaidTonight && isLanding(i))) : [];
  const tomorrowFlight = tomorrowItems.find((i) => i.kind === "flight" && !isLanding(i) && i.time);
  const tomorrowLead = leadItem(tomorrowItems);
  // Her detailed plan's first line for you, when it comes before the Itinerary's (round 13: at 9 AM on Oct 27 Andy read
  // "Tomorrow · 8:00 PM · her Guide lists two places" — Oct 28 starts with the 8:00 AM private van)
  const tomorrowPlanFirst = planOn(tomorrow).timed.filter((b) => isFor(b, me) || !b.forWhom).sort((a, b) => a.time!.localeCompare(b.time!))[0];
  const planLeadsTomorrow = !!tomorrowPlanFirst && (!tomorrowLead?.time || tomorrowPlanFirst.time! < tomorrowLead.time);
  const tomorrowLeave = tomorrowFlight && !planOn(tomorrow).all.some((b) => /haruka|airport|\bKIX\b|transfer/i.test(b.title)) ? leaveForAirport(tomorrowFlight, cityOn(tomorrow) || cityOn(today)) : null;
  const todayDeadlines = data.items.filter((i) => deadlineOnDate(i, today));
  const guidedToday = data.days.find((d) => ymd(d.date) === today)?.dayType === "guided";
  const guidedDays = data.days.filter((d) => d.dayType === "guided").map((d) => ymd(d.date)).sort();

  return (
    <section className={card}>
      <div>
        <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a]">Today · {dayLabel(today)}</h2>
        {/* A ticket this phone didn't tick at the pickup, on the morning it travels (delight audit) */}
        <TicketWarnings className="mt-2" list={untickedTickets(otherSources, today, me, (s) => railAudience(data.items, s.owner).ownerParty,
          (r, s) => { const a = railAudience(data.items, s.owner); return legIsFor(r, s, me, a.ownerParty, a.groupSize); })} />
        {/* Her open question about today, before "Next" (round 12: Oct 7's Home led with "8:30 AM Okayama → Bizen" and
            said nothing of "WHERE IS BIZEN TOUR STARTING") */}
        {openQuestionsOn(data.items, today, me).map((q) => (
          <p key={q} className="text-[13px] text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1 mt-1.5">Still open in {v.her} Guide: “{q}”</p>
        ))}
        {guidedToday && (
          <p className="text-sm text-[#3a3128] mt-1">With Backroads today — day {guidedDays.indexOf(today) + 1} of {guidedDays.length}. Their guides lead the day.</p>
        )}
        {/* Just landed, and her Guide doesn't say how to reach tonight's hotel: say so with two ways to act, on Home too
            (delight audit: Julie opens Home at Narita, and only Now had it) */}
        {(() => {
          if (!landedToday || tripNow < toMin(landedToday.time!) || tripNow > toMin(landedToday.time!) + 180) return null;
          const hotel = night?.stays[0]?.stay;
          if (!hotel || myRail.length) return null;
          const saysHow = todays.some((x) => x !== landedToday && isFor(x, me) && x.kind !== "flight"
            && /\b(bus|limousine|narita express|n'?ex|haruka|skyliner|train|taxi|transfer|shuttle|car)\b/i.test(`${x.title} ${x.detail || ""}`));
          if (saysHow) return null;
          const airport = landedToday.title.replace(/^Land at /i, "").split(" · ")[0].replace(/\s*\([A-Z]{3}\)$/, "");
          const online = typeof navigator === "undefined" || navigator.onLine !== false;
          // Her own hotel notes, quoted with their tab — never "doesn't say" when a tab does (delight audit)
          const ways = airportWaysTo(notesByTab, hotel.name);
          return (
            <div className="mt-2 rounded-lg bg-[#f6f1e8] px-3 py-2">
              {ways.length
                ? <>
                    <p className="text-sm text-[#3a3128]">Getting from {airport} to {hotel.name} — {v.her} hotel notes say:</p>
                    {ways.map((w) => <p key={w.text} className="text-sm text-[#514636] mt-0.5">“{w.text}” <span className="text-xs text-[#6b5d4a]">({v.her} “{w.tab}” tab)</span></p>)}
                  </>
                : <p className="text-sm text-[#3a3128]">Getting from {airport} to {hotel.name}: {v.her} Guide doesn't say.</p>}
              <div className="flex flex-wrap gap-x-5">
                {online
                  ? <button onClick={() => window.dispatchEvent(new CustomEvent("wander:ask-scout", { detail: { question: `How do I get from ${airport} to ${hotel.name}?` } }))}
                      className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Ask Scout the ways to go ›</button>
                  : <span className="inline-flex items-center min-h-[44px] text-sm text-[#6b5d4a]">Scout can answer once you have signal</span>}
                <a href={`https://maps.apple.com/?saddr=${encodeURIComponent(`${airport} Airport, Japan`)}&daddr=${encodeURIComponent(stayMapsQuery(hotel, cityOn(today)))}&dirflg=r`}
                  target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Directions in Maps ↗</a>
              </div>
            </div>
          );
        })()}
        {showLeave && leave && (
          <div className={`mt-2 rounded-lg px-3 py-2 ${flightNow > leave.minutes ? "bg-[#8a5a1a] text-white" : "bg-[#514636] text-white"}`}>
            <p className="text-base leading-snug">
              {flightNow > leave.minutes ? `Flight ${flightIn(flightAt - flightNow)} — ${lateLeaveWords(leave, flight!, flightNow).replace(/^Past the time to leave for [^—]+— /, "").replace(/^./, (c) => c.toLowerCase())}` : leave.text}
            </p>
            <p className="text-xs text-white/85 mt-0.5">{clock(flight!.time)} Japan time · {flight!.title}</p>
            {flightNow > leave.minutes && flight!.confirmation && <p className="text-xs text-white/85">Confirmation {flight!.confirmation}</p>}
            <p className="text-xs text-white/75 mt-1">{leave.why}</p>
          </div>
        )}
        {departed && (
          <div className="mt-2 rounded-lg bg-[#514636] text-white px-3 py-2">
            {/* By the schedule — Wander can't see the real flight (round 9: "In the air" at the gate of a late flight) */}
            <p className="text-base leading-snug">Should be in the air · {flight!.title}</p>
            {landsWords && <p className="text-sm text-white/85 mt-0.5">{landsWords}</p>}
            {today === last && <p className="text-sm text-white/85 mt-1">Safe travels home.</p>}
          </div>
        )}
        {itineraryLines.map((i) => (
          // (a cell of her Itinerary row, quoted — "Her note" made a room type read as advice; round 12)
          // (and whose it is, when it's someone else's — round 13: Andy's Oct 14 read "Day trip from Tokyo to Mashiko"
          // with nothing saying it was Ken & Larisa's)
          <p key={i.id} className="text-[13px] text-[#514636] mt-1">In {v.her} Itinerary for today: “{i.title}”
            {i.forWhom && !/^everyone$/i.test(i.forWhom) && !isFor(i, me) && <span className="text-[#6b5d4a]"> — {whose(i, me)}</span>}</p>
        ))}
        {/* Ken's rail sheet: today's pickup, then your trains still to come today, with seats */}
        {/* The pickup until the train it comes before has left; after that, only what this phone didn't tick, by name
            (delight audit: at 6:30 PM, on the train, Home still led with "Today · Ticket pickup"; nothing named the two
            tickets left unticked) */}
        {pickups.filter((p) => p.c.date === today).map((p) => {
          if (!firstBooked || tripNow < depOf(firstBooked.r)) return pickupLink(p, "Today · ");
          const missing = pickupProgress(p.s.id, p.c).tickets.missing;
          return missing.length ? (
            <button key={`${p.s.id}-${p.c.tab}`} onClick={() => navigate(`/checklist/${encodeURIComponent(p.s.id)}/${encodeURIComponent(p.c.tab)}`)}
              className="w-full text-left text-sm text-[#514636] min-h-[44px] py-1.5">
              Not ticked on this phone at the pickup: {missing.join(", ")} ›
            </button>
          ) : null;
        })}
        {pickups.filter((p) => p.c.date === addDays(today, 1)).map((p) => pickupLink(p, "Tomorrow · "))}
        {checkouts.length > 0 && next && <ul className="mt-1">{checkouts.map((i) => <ItemLine key={i.id} i={i} me={me} stays={data.stays} date={today} day={dayWithPlan} onOpen={() => openDay(today, i.id)} />)}</ul>}
        {onTrain && (
          <button onClick={() => navigate(`/day/${today}#trains`)} className="w-full text-left mt-2 min-h-[44px] text-sm text-[#3a3128]">
            <span className="text-[#6b5d4a]">On the train now, by the schedule · </span>{colOf(onTrain.r.cols, /^train$/)} · {colOf(onTrain.r.cols, /^route$/)}
            <span className="text-[#6b5d4a]">, arriving {twelveHour(colOf(onTrain.r.cols, /^arrive/))}</span>
            {colOf(onTrain.r.cols, /^car/) && <span className="block text-xs text-[#6b5d4a] mt-0.5 [overflow-wrap:anywhere]">{colOf(onTrain.r.cols, /^car/)}</span>}
          </button>
        )}
        {/* (not when her current line is the train the rail sheet has at another time — the train row says it; delight
            audit: at 12:30 on Oct 29 Home led with "Now · Board reserved HARUKA" against the booked 1:30 PM) */}
        {current && !railSaysIt(current) && (
          <button onClick={() => openDay(today, current.id)} className="w-full text-left mt-2 min-h-[44px] text-sm text-[#3a3128]">
            <span className="text-[#6b5d4a]">Now, in {v.owners} plan · </span>{current.title.replace(/^./, (c) => c.toUpperCase())}
            <span className="text-[#6b5d4a]">{current.endTime ? `, until ${currentRough ? "about " : ""}${clock(current.endTime)}` : `, until about ${minutesToClock(planLineEnd(current, plan.all))}`}</span>
            {tabsDiffer(current).map((d) => <span key={d} className="block text-xs text-[#8a5a1a] mt-0.5">{differWordsFor(d, v)}</span>)}
          </button>
        )}
        {currentUnowned && (
          <button onClick={() => openDay(today, currentUnowned.id)} className="w-full text-left mt-2 min-h-[44px] text-sm text-[#3a3128]">
            <span className="text-[#6b5d4a]">Now, in {v.owners} plan · </span>{currentUnowned.title.replace(/^./, (c) => c.toUpperCase())}
            <span className="text-[#6b5d4a]">, until {currentUnowned.endTime ? clock(currentUnowned.endTime) : `about ${minutesToClock(planLineEnd(currentUnowned, plan.all))}`}</span>
            <span className="block text-xs text-[#8a5a1a] mt-0.5">{v.Her} Guide doesn't say which group this is for.</span>
          </button>
        )}
        {/* The next line of her plan, said as next — with no group claimed (delight audit: an amber aside under a Next
            that skipped it) */}
        {unownedSoon && (
          <div className="mt-2 rounded-lg bg-[#f6f1e8] px-3 py-2">
            <p className="text-xs text-[#6b5d4a]">Next in {v.her} plan</p>
            <button onClick={() => openDay(today, unownedSoon.id)} className="w-full text-left flex gap-3 py-1.5 min-h-[44px]">
              <span className="w-[4.75rem] shrink-0 text-right text-sm text-[#3a3128] tabular-nums">{clock(unownedSoon.time)}</span>
              <span className="flex-1 min-w-0 text-sm text-[#3a3128] leading-snug">
                {unownedSoon.title}
                <span className="block text-xs text-[#6b5d4a] mt-0.5">
                  {noGroupWords(unownedSoon, v)}{(() => {
                    // who's elsewhere then, as on Now ("Ken & Andy are at MIHO Museum then")
                    const u = toMin(unownedSoon.time!);
                    const away = plan.all.find((b) => b.forWhom && !isFor(b, me) && b.time && toMin(b.time) <= u && toMin(b.endTime || b.time) > u);
                    return away ? `; ${away.forWhom} ${/&| and /.test(away.forWhom!) ? "are" : "is"} at ${away.title} then` : "";
                  })()}
                </span>
              </span>
            </button>
          </div>
        )}
        {/* Just landed: the leg with no booking that gets you to your first train, as what's next (delight audit: Home
            jumped from the landing to the 6:17 PM train; the HARUKA to Shin-Osaka was nowhere) */}
        {legBefore && (
          <div className="mt-2 rounded-lg bg-[#f6f1e8] px-3 py-2">
            <p className="text-xs text-[#6b5d4a]">Next · {colOf(legBefore.r.cols, /^target/) || "after landing"}</p>
            <button onClick={() => navigate(`/day/${today}#trains`)} className="w-full text-left py-1.5 min-h-[44px] text-sm text-[#3a3128] leading-snug">
              {(() => { const n = colOf(legBefore.r.cols, /^notes$/).match(/^\s*([A-Z][A-Z0-9 -]{2,20}?)\s*=/)?.[1]; return n ? `${n} · ` : ""; })()}{colOf(legBefore.r.cols, /^route$/)}{colOf(legBefore.r.cols, /^mode$/) ? ` · ${colOf(legBefore.r.cols, /^mode$/)}` : ""}
              <span className="block text-xs text-[#6b5d4a] mt-0.5">No booking needed · from {sourceWordsFor(legBefore.s, me)}</span>
            </button>
          </div>
        )}
        {trainIsNext ? (
          <div className="mt-2 rounded-lg bg-[#f6f1e8] px-3 py-2">
            <p className="text-xs text-[#6b5d4a]">{legBefore || unownedSoon ? "Then" : "Next"}</p>
            <button onClick={() => navigate(`/day/${today}#trains`)} className="w-full text-left flex gap-3 py-1.5 min-h-[44px]">
              <span className="w-[4.75rem] shrink-0 text-right text-sm text-[#3a3128] tabular-nums">{twelveHour(colOf(nextTrain!.r.cols, /^depart/))}</span>
              <span className="flex-1 min-w-0 text-sm text-[#3a3128] leading-snug">
                {colOf(nextTrain!.r.cols, /^train$/)} · {colOf(nextTrain!.r.cols, /^route$/)}{colOf(nextTrain!.r.cols, /^arrive/) ? ` · arrives ${twelveHour(colOf(nextTrain!.r.cols, /^arrive/))}` : ""}
                <span className="block text-xs text-[#6b5d4a] mt-0.5 [overflow-wrap:anywhere]">{[colOf(nextTrain!.r.cols, /^car/), `from ${sourceWordsFor(nextTrain!.s, me)}`].filter(Boolean).join(" · ")}</span>
                {/* Her Guide's other time for this train: always said, once, here (never settled silently) */}
                {nextTrain!.s.differs.filter((d) => d.date === today && d.row === nextTrain!.r.row).map((d) => <DifferLine key={`${d.row}-${d.guideSource}`} d={d} />)}
              </span>
            </button>
          </div>
        ) : planIsNext ? (
          <div className="mt-2 rounded-lg bg-[#f6f1e8] px-3 py-2">
            <p className="text-xs text-[#6b5d4a]">{legBefore || unownedSoon ? "Then" : "Next"}</p>
            <button onClick={() => openDay(today)} className="w-full text-left flex gap-3 py-1.5 min-h-[44px]">
              <span className="w-[4.75rem] shrink-0 text-right text-sm text-[#3a3128] tabular-nums">{clock(nextPlan!.time)}</span>
              <span className="flex-1 min-w-0 text-sm text-[#3a3128] leading-snug">
                {nextPlan!.text}
                <span className="block text-xs text-[#6b5d4a] mt-0.5">Added in Wander by {nextPlan!.addedBy === me ? "you" : nextPlan!.addedBy}</span>
              </span>
            </button>
          </div>
        ) : next && !(showLeave && next === flight) ? (
          <div className="mt-2 rounded-lg bg-[#f6f1e8] px-3 py-2">
            <p className="text-xs text-[#6b5d4a]">{legBefore || unownedSoon ? "Then" : "Next"}</p>
            <ul><ItemLine i={next} me={me} stays={data.stays} date={today} day={dayWithPlan} picks={choices} all={data.items} tz={tz} railSaysIt={railSaysIt(next)} railArrives={railArrives(next)} sources={otherSources} onOpen={() => openDay(today, next.id)} /></ul>
          </div>
        ) : todays.length === 0 && todayChoices.length === 0 && plan.all.length === 0 && !guidedToday ? (
          <p className="text-sm text-[#6b5d4a] mt-2">{v.mine ? "Your Guide" : "Larisa's Guide"} has nothing set for today.</p>
        ) : null}
        {checkouts.length > 0 && !next && <ul className="mt-1">{checkouts.map((i) => <ItemLine key={i.id} i={i} me={me} stays={data.stays} date={today} day={dayWithPlan} onOpen={() => openDay(today, i.id)} />)}</ul>}
        {/* Still at home on this Japan date: the rest of her day is the others' (round 11: Julie's Home listed
            "Nagoya to Tokyo" and "Maybe: Mashiko" under her flight with no names; the day screen says this) */}
        {rows.length > 0 && (() => {
          const out = homeOnJapanDate(data.items, me, today, tz);
          if (!out) return null;
          const gone = nowMinutesOn(ymd(out.date), out.timeZone!) >= toMin(out.time);
          return <p className="text-xs text-[#6b5d4a] mt-2 ml-[5.5rem]">The rest is the others' plan. {gone ? "You were still at home for this Japan date." : "On this Japan date you're still at home."}</p>;
        })()}
        {rows.length > 0 && (
          <ul className="mt-1">
            {shownRows.map((r) => r.guide
              ? <ItemLine key={r.key} i={r.guide} me={me} stays={data.stays} date={today} day={dayWithPlan} picks={choices} all={data.items} tz={tz} railSaysIt={railSaysIt(r.guide)} railArrives={railArrives(r.guide)} sources={otherSources} onOpen={() => openDay(today, r.guide!.id)} />
              : r.bits ? (
                <li key={r.key}>
                  <button onClick={() => openDay(today)} className="w-full text-left py-1.5 min-h-[44px] text-[13px] text-[#514636] leading-snug">
                    In {v.her} Itinerary for today: {r.bits.map((b) => `“${itemTitle(b, data.stays, today)}”`).join(" · ")}
                  </button>
                </li>
              ) : r.train ? (
                <li key={r.key}>
                  <button onClick={() => navigate(`/day/${today}#trains`)} className="w-full text-left flex gap-3 py-1.5 min-h-[44px]">
                    <span className="w-[4.75rem] shrink-0 text-right text-sm text-[#3a3128] tabular-nums">{twelveHour(colOf(r.train.r.cols, /^depart/))}</span>
                    <span className="flex-1 min-w-0 text-sm text-[#3a3128] leading-snug">
                      {colOf(r.train.r.cols, /^train$/)} · {colOf(r.train.r.cols, /^route$/)}{colOf(r.train.r.cols, /^arrive/) ? ` · arrives ${twelveHour(colOf(r.train.r.cols, /^arrive/))}` : ""}
                      <span className="block text-xs text-[#6b5d4a] mt-0.5 [overflow-wrap:anywhere]">{[colOf(r.train.r.cols, /^car/), `from ${sourceWordsFor(r.train.s, me)}`].filter(Boolean).join(" · ")}</span>
                      {/* (round r1: Home led with the sheet's 1:30 PM while her Guide's day tab has 12:30–1:00) */}
                      {r.train.s.differs.filter((d) => d.date === today && d.row === r.train!.r.row).map((d) => (
                        <span key={d.guideSource} className="block text-xs text-[#8a5a1a] mt-0.5">{v.say(`The sources differ — ${herTab(d.guideSource)} has ${withTwelveHour(d.guideSays)} for this train${(d.agree || []).length ? `; ${herTab(d.agree![0].source)} agrees with the rail sheet` : ""} ›`)}</span>
                      ))}
                    </span>
                  </button>
                </li>
              ) : (
                <li key={r.key} className="flex gap-3 py-1.5">
                  <span className="w-[4.75rem] shrink-0 text-right text-sm text-[#3a3128] tabular-nums">{r.choice!.time ? clock(r.choice!.time) : ""}</span>
                  <span className="flex-1 min-w-0 text-sm text-[#3a3128] leading-snug">
                    {r.choice!.text}
                    <span className="block text-xs text-[#6b5d4a] mt-0.5">Added in Wander by {r.choice!.addedBy === me ? "you" : r.choice!.addedBy}</span>
                  </span>
                </li>
              ))}
          </ul>
        )}
        {rows.length > shownRows.length && (
          <button onClick={() => navigate(`/day/${today}${firstHidden?.guide ? `#item-${firstHidden.guide.id}` : "#plan"}`)} className="min-h-[44px] ml-[5.5rem] text-sm text-[#514636] underline underline-offset-2">and {rows.length - shownRows.length} more ›</button>
        )}
        {todayDeadlines.length > 0 && (
          <ul className="mt-1">
            {todayDeadlines.map((i) => {
              const over = deadlineOver(i, tz);
              const time = deadlineTimeWords(i, tz);
              return (
                <li key={i.id} className="flex gap-3 py-1.5">
                  <span className="w-[4.75rem] shrink-0 text-right text-xs text-[#8a5a1a] pt-0.5">{over ? "Ended" : "Deadline"}</span>
                  <span className={`flex-1 min-w-0 text-sm leading-snug ${over ? "text-[#6b5d4a]" : "text-[#3a3128]"}`}>
                    {i.title}
                    <span className="block text-xs text-[#6b5d4a] mt-0.5 no-underline">
                      {/* Whose booking, when no one's name is on it (round 10: Andy, just landed, was told "Today is the
                          last day" to reconfirm Larisa's dinner) */}
                      {[whose(i, me) || bookedWords(i, me), over ? `Ended ${time || "today"}` : i.windowStart ? [deadlineWhen(i, today), time].filter(Boolean).join(", ") : time].filter(Boolean).join(" · ")}
                      {over && /reconfirm|confirm|call|book|pay|send|submit|register/i.test(i.title) && `. ${cantTell}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {night && (night.stays.length > 0 || night.away.length > 0) && (
          night.away.length === 0 && night.stays.length === 1 ? (
            // One place tonight: tap it for Maps (found by name — a district address pinned the wrong spot)
            <a href={mapsLink(stayMapsQuery(night.stays[0].stay, cityOn(today)))} className="flex items-center min-h-[44px] text-sm text-[#3a3128] mt-1">
              <span><span className="text-[#6b5d4a]">Tonight · </span>{night.stays[0].stay.name} <span className="text-[#514636] underline underline-offset-2 whitespace-nowrap">Maps ↗</span></span>
            </a>
          ) : (
            <p className="text-sm text-[#3a3128] mt-2">
              <span className="text-[#6b5d4a]">Tonight · </span>
              {night.away.length > 0
                ? night.away[0].text
                : <>
                    {night.stays.map((s) => s.stay.name).join(" or ")}
                    {night.stays.length > 1 && <span className="text-[#8a5a1a]"> (the Guide lists both)</span>}
                  </>}
            </p>
          )
        )}
        <button onClick={() => (plan.all.length > 0 ? navigate(`/day/${today}#plan`) : openDay(today))} className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">{plan.all.length > 0 ? `See ${v.owners} full plan for today ›` : "See all of today ›"}</button>
      </div>

      {tomorrow <= last && (
        <button onClick={() => openDay(tomorrow)} className="w-full text-left pt-3 border-t border-[#efe9df] min-h-[44px]">
          <span className="text-xs uppercase tracking-wide text-[#6b5d4a]">Tomorrow · </span>
          <span className="text-sm text-[#3a3128]">
            {tomorrowFlight
              // The night before a flight: the flight itself, and when to leave (Wander's estimate)
              ? `${clock(tomorrowFlight.time)}${zoneTag(tomorrowFlight)} · ${tomorrowFlight.title}${tomorrowLeave ? ` — leave about ${minutesToClock(tomorrowLeave.minutes)} (Wander's estimate)` : ""}`
              : planLeadsTomorrow
              ? `${timeLabel(tomorrowPlanFirst!, on(tomorrow))} · ${tomorrowPlanFirst!.title}`
              : tomorrowLead
              // Tomorrow's first appointment (8:30 meet Backroads), not the check-out listed ahead of it
              // (two places booked for one time: say so, never name one — round 9: "8:00 PM · Cafe Ensou")
              ? `${tomorrowLead.time ? timeLabel(tomorrowLead, on(tomorrow)) + (/\d/.test(timeLabel(tomorrowLead, on(tomorrow))) ? zoneTag(tomorrowLead) : "") + " · " : ""}${/tab lists \d+ places for this date and time/.test(tomorrowLead.detail || "") ? `${v.her} Guide lists two places` : itemTitle(tomorrowLead, data.stays, tomorrow)}`
              : (() => {
                  // No line in the Guide for tomorrow: say where you'll be, plainly
                  const d = data.days.find((x) => ymd(x.date) === tomorrow);
                  const where = d?.city?.name;
                  return [where, d?.dayType === "guided" ? "with Backroads" : null].filter(Boolean).join(", ") || "Nothing set in the Guide yet";
                })()}
          </span>
          {/* (one thing her two tabs both name, at one time, counts once — round 13: "Une Immersion and 1 more" was the
              same dinner from her other tab) */}
          {(() => {
            const n = tomorrowItems.filter((x, k) => !tomorrowItems.slice(0, k).some((y) => !!y.time && y.time === x.time && sameThing(x.title, y.title))).length;
            // (a flight or her first plan line leads instead of an Itinerary line: none of the others is said yet)
            const more = !tomorrowFlight && planLeadsTomorrow ? n : n - 1;
            return more > 0 ? <span className="text-xs text-[#6b5d4a]"> and {more} more</span> : null;
          })()}
        </button>
      )}

      <DeadlineList list={deadlinesAhead(tomorrow, 3).filter((i) => !deadlineOnDate(i, today) && !deadlineOver(i, tz))} title="Deadlines in the next few days" />
      <DeadlineList list={deadlinesAhead(tomorrow, 3).filter((i) => !deadlineOnDate(i, today) && deadlineOver(i, tz))} title="Just passed" />
      {freshLine}
    </section>
  );
}

export { minutesToClock };
