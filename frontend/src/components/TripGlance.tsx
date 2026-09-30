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
import { sourcesData, railAudience, legIsFor, isBookedTrain, colOf, twelveHour, sourceWords, type OtherSource, type Checklist } from "../lib/sources";
import { checklistTitle } from "./RailSheet";
import {
  ymd, clock, sortDay, timeLabel, itemTitle, isFor, partyOf, isLanding, nightOf, myNight,
  deadlineOver, deadlineOnDate, deadlineWhen, deadlineTimeWords, leaveForAirport, minutesToClock,
  freshness, isPlanningNote, isFragmentTitle, deadlineJustPassed, leavingOn, checkoutBeforeFirst, leadItem, ownerlessInSplit, tabsDiffer, saidAgain, currentPlanLine, planLineEnd, currentUnownedLine,
  withCheckoutWho, mapsLink, stayMapsQuery, lateLeaveWords, landingStatus, checkinAfterLanding, zoneWords, landingTitle, bookedByName, nowMinutesOn, phoneIsElsewhere, tripClockMinutes, homeOnJapanDate,
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

function ItemLine({ i, me, stays, date, day, onOpen, picks, all, tz }: {
  i: GuideItem; me?: string | null; stays: TripGuideData["stays"]; date: string; day?: GuideItem[];
  onOpen?: () => void; picks?: DayChoice[];
  /** The whole Guide and the trip's zone: a landing then says where its flight stands, by the schedule */
  all?: GuideItem[]; tz?: string;
}) {
  const maybe = i.title.startsWith("Maybe:");
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
        {i.kind !== "flight" && tabsDiffer(i).map((d) => <span key={d} className="block text-xs text-[#8a5a1a] mt-0.5">Her tabs differ — {d.replace(/^her /, "")}</span>)}
        {checkoutBeforeFirst(i, day) && <span className="block text-xs text-[#6b5d4a] mt-0.5">The hotel's check-out time is {clock(i.time)}</span>}
        {other && <span className="block text-xs text-[#6b5d4a] mt-0.5">For {other}</span>}
        {/* Two places booked for one time: say so here too, never pick one */}
        {(() => { const two = (i.detail || "").match(/The .+ tab lists \d+ places for this date and time[^\n]*/)?.[0]; return two ? <span className="block text-xs text-[#8a5a1a] mt-0.5">{two}</span> : null; })()}
        {i.confirmation && !other && <span className="block text-xs text-[#6b5d4a] mt-0.5 [overflow-wrap:anywhere]">Confirmation {i.confirmation}</span>}
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

  useEffect(() => {
    let cancelled = false;
    guideData(tripId).then((d) => { if (!cancelled) setData(d); }).catch(() => { /* Home still shows the calendar */ });
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
    const deadlinesAhead = (from: string, span: number) => data.items
      .filter((i) => i.kind === "deadline" && (!deadlineOver(i, tz) || deadlineJustPassed(i, tz)) &&
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

  if (!data || !view || !view.first || !view.last) return null;
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
  const othersWhere = (date: string) => {
    const leaving = data.stays.find((s) => ymd(s.checkOutDate) === date);
    const from = leaving ? data.trip.cities?.find((c) => c.id === leaving.cityId)?.name : null;
    const to = cityOn(date);
    return from && to && from !== to ? `the others travel from ${from} to ${to} today` : `the others are in ${to || "Japan"}`;
  };
  // Whose Guide it is — she is never told to ask herself (round 9: "ask Larisa if you're not sure", to Larisa)
  const owner = guideOwnerOf(data.trip.tagline);
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
    // "for before you go" only while you're still home — on the day it's past
    const before = today < myFirst ? c.steps.filter((x) => /^before travel/i.test(colOf(x.cols, /^step$/))).length : 0;
    return (
      <button key={`${s.id}-${c.tab}`} onClick={() => navigate(`/checklist/${encodeURIComponent(s.id)}/${encodeURIComponent(c.tab)}`)}
        className="w-full text-left text-sm text-[#514636] min-h-[44px] py-1.5">
        <span className="text-[#8a5a1a]">{lead}</span>{checklistTitle(c.tab)}: the steps{before ? ` — ${before === 1 ? "one is" : `${before} are`} for before you go` : ""} ›
        <span className="block text-xs text-[#6b5d4a] mt-0.5">From {sourceWords(s)}</span>
      </button>
    );
  };
  const f = freshness(data.status?.current?.importedAt);
  const freshLine = f && (
    <p className={`text-xs mt-3 ${f.old ? "text-[#8a5a1a]" : "text-[#6b5d4a]"}`}>
      {f.text}.{f.old ? " Larisa may have changed things since." : ""}
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
                {(who || time || bookedBy(i)) && <span className="block text-xs text-[#6b5d4a] mt-0.5">{[who || (bookedBy(i) ? `Booked under ${bookedBy(i)}` : null), time].filter(Boolean).join(" · ")}</span>}
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
            Right now in Japan ({japanNowWords}): {othersWhere(japanToday)} ›
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
  const next = appointments.find((i) => toMin(i.time) >= nowFor(i) && i !== current);
  const currentRough = !!current && (/^~/.test(current.timeText || "") || (current.detail || "").includes("Times are Larisa's estimate."));
  // Leaving a hotel this morning comes before whatever is next ("by noon" isn't after an 8:30 meeting)
  // A check-out whose time has gone by (noon, when it's 3pm) is done — it no longer leads the card
  const checkedOut = plan.all.some((b) => b.time && /check\s*-?\s*out/i.test(b.title) && toMin(b.time) < tripNow);
  const checkouts = checkedOut ? [] : todays.filter((i) => i.kind === "checkout" && isFor(i, me) && (!i.time || toMin(i.time) >= nowFor(i)));
  const dayWithPlan = [...todays, ...plan.all];
  // A line nobody's name is on during a split, before "Next": said, never assigned
  const unownedSoon = plan.all.find((b) => b !== currentUnowned && plan.noOwner.has(b.id) && b.time && toMin(b.time) >= tripNow && (!next?.time || toMin(b.time) < toMin(next.time)));
  // Her remaining plan lines for you, after "Next" (Home skipped her 5:00 return to the hotel)
  const planRows = plan.timed.filter((b) => isFor(b, me) && b !== next && b !== current && toMin(b.time) > tripNow);
  // After the flight home has left: say so, and when it lands (the day's other lines are behind them)
  const departed = !!flight && flightNow >= flightAt;
  const landsWords = departed ? ((flight!.detail || "").match(/Lands at [^\n|]+/)?.[0] || "").trim() : "";
  // On a day with her detailed plan, her Itinerary tab's own untimed line for the day is shown as hers, up top
  // (a "see above …" row points at her sheet's layout, not at anything here — it's never the day's headline;
  // round 9: Oct 25 led with "see above - 1/2 day")
  const itineraryLines = plan.all.length ? todays.filter((i) => !i.time && /itinerary/i.test(i.source) && ["plan", "tour", "note"].includes(i.kind) && !/^see above\b/i.test(i.title)) : [];
  // A landing stays all day (round 8: at 6 PM Home had dropped it, leaving "After landing · Check in" hanging)
  const rest = todays.filter((i) => !itineraryLines.includes(i) && i !== next && i.kind !== "checkout" && !(showLeave && i === flight) && (!i.time || toMin(i.time) >= nowFor(i) || i.kind === "checkin" || isLanding(i)));
  // A pick among her choices shows on her plan's line, not again as its own row
  const inHerPlan = (g?: GuideItem) => !!g && g.kind !== "block" && plan.all.some((b) => saidAgain(b, g));
  const todayChoices = choices.filter((c) => c.date === today && !plan.all.some((b) => c.text.startsWith(`${b.title}: `)));
  // Plans added in Wander sit in the day's time order with the Guide's lines
  type Row = { key: string; time: string | null; guide?: GuideItem; choice?: DayChoice };
  // A check-in that opens before the same people land sorts just after their landing (round 8: "After
  // landing · Check in" sat above "3:00 PM Land at Narita")
  const rowTime = (i: GuideItem) => {
    if (!checkinAfterLanding(i, todays)) return i.time;
    const landing = todays.find((l) => isLanding(l) && l.time && (!l.forWhom || !i.forWhom || l.forWhom === i.forWhom || /^everyone$/i.test(l.forWhom)));
    return landing?.time ? `${landing.time}~` : i.time;
  };
  // The day's own untimed lines ("Day trip to Mashiko") lead, as on the day screen; then times; then untimed
  // meals and deadlines (round 8: Ken's all-day Mashiko trip sat under Julie & Andy's 3 PM landing)
  const rank = (r: Row) => (r.time ? 1 : r.guide && ["meal", "deadline"].includes(r.guide.kind) ? 2 : 0);
  const rows: Row[] = [
    ...rest.map((i) => ({ key: i.id, time: rowTime(i), guide: i })),
    ...planRows.map((b) => ({ key: b.id, time: b.time, guide: b })),
    ...todayChoices.map((c) => ({ key: c.id, time: c.time, choice: c })),
  ].sort((a, b) => rank(a) - rank(b) || (a.time && b.time ? a.time.localeCompare(b.time) : 0)
    || (inHerPlan((b as Row).guide) ? 1 : 0) - (inHerPlan((a as Row).guide) ? 1 : 0));
  // A line of her plan still waiting for a pick is always shown, never folded into "and N more" (round 7:
  // at 9:00 nothing on Home said lunch needed deciding)
  const undecided = (r: Row) => !!r.guide && r.guide.kind === "block" && /(^|\n)Choice: /.test(r.guide.detail || "")
    && !choices.some((c) => c.text.startsWith(`${r.guide!.title}: `));
  const shownRows = rows.filter((r, n) => n < 5 || undecided(r));
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
  const tomorrowLeave = tomorrowFlight && !planOn(tomorrow).all.some((b) => /haruka|airport|\bKIX\b|transfer/i.test(b.title)) ? leaveForAirport(tomorrowFlight, cityOn(tomorrow) || cityOn(today)) : null;
  const todayDeadlines = data.items.filter((i) => deadlineOnDate(i, today));
  const guidedToday = data.days.find((d) => ymd(d.date) === today)?.dayType === "guided";
  const guidedDays = data.days.filter((d) => d.dayType === "guided").map((d) => ymd(d.date)).sort();

  return (
    <section className={card}>
      <div>
        <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a]">Today · {dayLabel(today)}</h2>
        {guidedToday && (
          <p className="text-sm text-[#3a3128] mt-1">With Backroads today — day {guidedDays.indexOf(today) + 1} of {guidedDays.length}. Their guides lead the day.</p>
        )}
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
          <p key={i.id} className="text-[13px] text-[#514636] mt-1">{i.kind === "note" ? "Her note for today" : "Her Itinerary line for today"}: “{i.title}”</p>
        ))}
        {/* Ken's rail sheet: today's pickup, then your trains still to come today, with seats */}
        {pickups.filter((p) => p.c.date === today).map((p) => pickupLink(p, "Today · "))}
        {pickups.filter((p) => p.c.date === addDays(today, 1)).map((p) => pickupLink(p, "Tomorrow · "))}
        {trainsOn(today).filter(({ r }) => tripClockMinutes({ time: colOf(r.cols, /^depart/) } as GuideItem, tz) >= tripNow).map(({ s, r }) => (
          <button key={`${s.id}-${r.row}`} onClick={() => navigate(`/day/${today}#trains`)} className="w-full text-left mt-1 min-h-[44px] text-sm text-[#3a3128]">
            <span className="text-[#6b5d4a]">Train · </span>{twelveHour(colOf(r.cols, /^depart/))} {colOf(r.cols, /^train$/)} · {colOf(r.cols, /^route$/)}
            <span className="block text-xs text-[#6b5d4a] mt-0.5 [overflow-wrap:anywhere]">{[colOf(r.cols, /^car/), `from ${sourceWords(s)}`].filter(Boolean).join(" · ")}</span>
            {/* (round r1: Home led with the sheet's 1:30 PM while her Guide's day tab has 12:30–1:00) */}
            {s.differs.filter((d) => d.date === today && d.row === r.row).map((d) => (
              <span key={d.guideSource} className="block text-xs text-[#8a5a1a] mt-0.5">The sources differ — Larisa's Guide has {d.guideSays} for this train ›</span>
            ))}
          </button>
        ))}
        {checkouts.length > 0 && next && <ul className="mt-1">{checkouts.map((i) => <ItemLine key={i.id} i={i} me={me} stays={data.stays} date={today} day={dayWithPlan} onOpen={() => openDay(today, i.id)} />)}</ul>}
        {current && (
          <button onClick={() => openDay(today, current.id)} className="w-full text-left mt-2 min-h-[44px] text-sm text-[#3a3128]">
            <span className="text-[#6b5d4a]">Now, in Larisa's plan · </span>{current.title.replace(/^./, (c) => c.toUpperCase())}
            <span className="text-[#6b5d4a]">{current.endTime ? `, until ${currentRough ? "about " : ""}${clock(current.endTime)}` : `, until about ${minutesToClock(planLineEnd(current, plan.all))}`}</span>
            {tabsDiffer(current).map((d) => <span key={d} className="block text-xs text-[#8a5a1a] mt-0.5">Her tabs differ — {d.replace(/^her /, "")}</span>)}
          </button>
        )}
        {currentUnowned && (
          <button onClick={() => openDay(today, currentUnowned.id)} className="w-full text-left mt-2 min-h-[44px] text-sm text-[#3a3128]">
            <span className="text-[#6b5d4a]">Now, in Larisa's plan · </span>{currentUnowned.title.replace(/^./, (c) => c.toUpperCase())}
            <span className="text-[#6b5d4a]">, until {currentUnowned.endTime ? clock(currentUnowned.endTime) : `about ${minutesToClock(planLineEnd(currentUnowned, plan.all))}`}</span>
            <span className="block text-xs text-[#8a5a1a] mt-0.5">Her Guide doesn't say which group this is for.</span>
          </button>
        )}
        {unownedSoon && (
          <button onClick={() => openDay(today, unownedSoon.id)} className="w-full text-left mt-1 min-h-[44px] text-sm text-[#8a5a1a]">
            At {clock(unownedSoon.time)}, her plan has {unownedSoon.title} — her Guide doesn't say which group.
          </button>
        )}
        {next && !(showLeave && next === flight) ? (
          <div className="mt-2 rounded-lg bg-[#f6f1e8] px-3 py-2">
            <p className="text-xs text-[#6b5d4a]">Next</p>
            <ul><ItemLine i={next} me={me} stays={data.stays} date={today} day={dayWithPlan} picks={choices} all={data.items} tz={tz} onOpen={() => openDay(today, next.id)} /></ul>
          </div>
        ) : todays.length === 0 && todayChoices.length === 0 && plan.all.length === 0 && !guidedToday ? (
          <p className="text-sm text-[#6b5d4a] mt-2">Larisa's Guide has nothing set for today.</p>
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
              ? <ItemLine key={r.key} i={r.guide} me={me} stays={data.stays} date={today} day={dayWithPlan} picks={choices} all={data.items} tz={tz} onOpen={() => openDay(today, r.guide!.id)} />
              : (
                <li key={r.key} className="flex gap-3 py-1.5">
                  <span className="w-[4.75rem] shrink-0 text-right text-sm text-[#3a3128] tabular-nums">{r.choice!.time ? clock(r.choice!.time) : ""}</span>
                  <span className="flex-1 min-w-0 text-sm text-[#3a3128] leading-snug">
                    {r.choice!.text}
                    <span className="block text-xs text-[#6b5d4a] mt-0.5">Added in Wander by {r.choice!.addedBy}</span>
                  </span>
                </li>
              ))}
          </ul>
        )}
        {rows.length > shownRows.length && (
          <button onClick={() => navigate(`/day/${today}#plan`)} className="min-h-[44px] ml-[5.5rem] text-sm text-[#514636] underline underline-offset-2">and {rows.length - shownRows.length} more ›</button>
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
                      {[whose(i, me) || (bookedBy(i) ? `Booked under ${bookedBy(i)}` : null), over ? `Ended ${time || "today"}` : i.windowStart ? deadlineWhen(i, today) : time].filter(Boolean).join(" · ")}
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
        <button onClick={() => (plan.all.length > 0 ? navigate(`/day/${today}#plan`) : openDay(today))} className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">{plan.all.length > 0 ? "See Larisa's full plan for today ›" : "See all of today ›"}</button>
      </div>

      {tomorrow <= last && (
        <button onClick={() => openDay(tomorrow)} className="w-full text-left pt-3 border-t border-[#efe9df] min-h-[44px]">
          <span className="text-xs uppercase tracking-wide text-[#6b5d4a]">Tomorrow · </span>
          <span className="text-sm text-[#3a3128]">
            {tomorrowFlight
              // The night before a flight: the flight itself, and when to leave (Wander's estimate)
              ? `${clock(tomorrowFlight.time)}${zoneTag(tomorrowFlight)} · ${tomorrowFlight.title}${tomorrowLeave ? ` — leave about ${minutesToClock(tomorrowLeave.minutes)} (Wander's estimate)` : ""}`
              : tomorrowLead
              // Tomorrow's first appointment (8:30 meet Backroads), not the check-out listed ahead of it
              // (two places booked for one time: say so, never name one — round 9: "8:00 PM · Cafe Ensou")
              ? `${tomorrowLead.time ? timeLabel(tomorrowLead, on(tomorrow)) + (/\d/.test(timeLabel(tomorrowLead, on(tomorrow))) ? zoneTag(tomorrowLead) : "") + " · " : ""}${/tab lists \d+ places for this date and time/.test(tomorrowLead.detail || "") ? "her Guide lists two places" : itemTitle(tomorrowLead, data.stays, tomorrow)}`
              : (() => {
                  // No line in the Guide for tomorrow: say where you'll be, plainly
                  const d = data.days.find((x) => ymd(x.date) === tomorrow);
                  const where = d?.city?.name;
                  return [where, d?.dayType === "guided" ? "with Backroads" : null].filter(Boolean).join(", ") || "Nothing set in the Guide yet";
                })()}
          </span>
          {tomorrowItems.length > 1 && <span className="text-xs text-[#6b5d4a]"> and {tomorrowItems.length - 1} more</span>}
        </button>
      )}

      <DeadlineList list={deadlinesAhead(tomorrow, 3).filter((i) => !deadlineOnDate(i, today) && !deadlineOver(i, tz))} title="Deadlines in the next few days" />
      <DeadlineList list={deadlinesAhead(tomorrow, 3).filter((i) => !deadlineOnDate(i, today) && deadlineOver(i, tz))} title="Just passed" />
      {freshLine}
    </section>
  );
}

export { minutesToClock };
