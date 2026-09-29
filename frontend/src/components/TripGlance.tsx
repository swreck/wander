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
import {
  ymd, clock, sortDay, timeLabel, itemTitle, isFor, partyOf, isLanding, nightOf, myNight,
  deadlineOver, deadlineOnDate, deadlineWhen, deadlineTimeWords, leaveForAirport, minutesToClock,
  freshness, isPlanningNote, isFragment, deadlineJustPassed, leavingOn, checkoutBeforeFirst, leadItem, ownerlessInSplit,
  withCheckoutWho, mapsLink, stayMapsQuery, lateLeaveWords,
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

function ItemLine({ i, me, stays, date, day }: { i: GuideItem; me?: string | null; stays: TripGuideData["stays"]; date: string; day?: GuideItem[] }) {
  const maybe = i.title.startsWith("Maybe:");
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
  return (
    <li className="flex gap-3 py-1.5">
      <span className="w-[4.75rem] shrink-0 text-right text-sm text-[#3a3128] tabular-nums">{timeLabel(i, day)}</span>
      <span className={`flex-1 min-w-0 text-sm leading-snug ${maybe ? "italic text-[#6b5d4a]" : "text-[#3a3128]"}`}>
        {i.kind === "deadline" && <span className="font-medium">Deadline · </span>}
        {itemTitle(i, stays, date)}
        {checkoutBeforeFirst(i, day) && <span className="block text-xs text-[#6b5d4a] mt-0.5">The hotel's check-out time is {clock(i.time)}</span>}
        {other && <span className="block text-xs text-[#6b5d4a] mt-0.5">For {other}</span>}
        {/* Two places booked for one time: say so here too, never pick one */}
        {(() => { const two = (i.detail || "").match(/The .+ tab lists \d+ places for this date and time[^\n]*/)?.[0]; return two ? <span className="block text-xs text-[#8a5a1a] mt-0.5">{two}</span> : null; })()}
        {i.confirmation && !other && <span className="block text-xs text-[#6b5d4a] mt-0.5 [overflow-wrap:anywhere]">Confirmation {i.confirmation}</span>}
      </span>
    </li>
  );
}

export default function TripGlance({ tripId }: { tripId: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const me = user?.displayName || null;
  const [data, setData] = useState<TripGuideData | null>(null);
  const [choices, setChoices] = useState<DayChoice[]>([]);
  const [today, setToday] = useState(phoneToday());
  const [now, setNow] = useState(nowMinutes());

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
    const on = (date: string) => sortDay(withCheckoutWho(data.items.filter((i) => ymd(i.date) === date && !["deadline", "stop", "weather", "block"].includes(i.kind) && !isPlanningNote(i) && !isFragment(i)), date, data.stays, data.items));
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
      const taken = new Set(on(date).map((i) => i.time).filter(Boolean));
      const noOwner = ownerlessInSplit(blocks);
      return { all: blocks, timed: blocks.filter((b) => b.time && !taken.has(b.time) && !noOwner.has(b.id)) };
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
                  <span className="text-[#8a5a1a]">{passed ? "Passed" : deadlineWhen(i, today)}</span> · {i.title}
                </span>
                {(who || time) && <span className="block text-xs text-[#6b5d4a] mt-0.5">{[who, time].filter(Boolean).join(" · ")}</span>}
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
          {firstItems.length > 0 && <ul className="mt-1">{firstItems.slice(0, 2).map((i) => <ItemLine key={i.id} i={i} me={me} stays={data.stays} date={myFirst} />)}</ul>}
          <span className="inline-flex items-center min-h-[44px] text-sm text-[#514636]">See the day ›</span>
        </button>
        {groupStarted && today < first && (
          <p className="text-xs text-[#6b5d4a]">The trip itself starts {dayLabel(first)}.</p>
        )}
        {groupStarted && japanToday >= first && japanToday <= last && (
          // The others live on Japan's clock: when it's Wednesday evening here, it's already Thursday there
          <button onClick={() => openDay(japanToday)} className="w-full text-left text-sm text-[#514636] min-h-[44px]">
            Right now in Japan ({japanNowWords}): the others are in {cityOn(japanToday) || "Japan"} ›
          </button>
        )}
        <DeadlineList list={deadlinesAhead(today, 14)} title="Deadlines coming up" />
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
  const showLeave = !!leave && now < flightAt;
  const appointments = [...mineToday.filter((i) => i.time && !["checkout", "checkin"].includes(i.kind)), ...plan.timed.filter((b) => isFor(b, me))]
    .sort((a, b) => a.time!.localeCompare(b.time!));
  // Where her plan puts you right now ("MIHO Museum, until ~12:35 PM") — only a line with your name on it,
  // or one for everybody outside a split; never a guess
  const noOwner = ownerlessInSplit(plan.all);
  const current = plan.all.filter((b) => b.time && b.endTime && isFor(b, me) && !noOwner.has(b.id) && toMin(b.time) <= now && now < toMin(b.endTime)).pop();
  const next = appointments.find((i) => toMin(i.time) >= now && i !== current);
  const currentRough = !!current && (/^~/.test(current.timeText || "") || (current.detail || "").includes("Times are Larisa's estimate."));
  // Leaving a hotel this morning comes before whatever is next ("by noon" isn't after an 8:30 meeting)
  // A check-out whose time has gone by (noon, when it's 3pm) is done — it no longer leads the card
  const checkouts = todays.filter((i) => i.kind === "checkout" && isFor(i, me) && (!i.time || toMin(i.time) >= now));
  // After the flight home has left: say so, and when it lands (the day's other lines are behind them)
  const departed = !!flight && now >= flightAt;
  const landsWords = departed ? ((flight!.detail || "").match(/Lands at [^\n|]+/)?.[0] || "").trim() : "";
  const rest = todays.filter((i) => i !== next && i.kind !== "checkout" && !(showLeave && i === flight) && (!i.time || toMin(i.time) >= now || i.kind === "checkin"));
  const todayChoices = choices.filter((c) => c.date === today);
  // Plans added in Wander sit in the day's time order with the Guide's lines
  type Row = { key: string; time: string | null; guide?: GuideItem; choice?: DayChoice };
  const rows: Row[] = [
    ...rest.map((i) => ({ key: i.id, time: i.time && i.kind !== "checkin" ? i.time : null, guide: i })),
    ...todayChoices.map((c) => ({ key: c.id, time: c.time, choice: c })),
  ].sort((a, b) => (a.time ? 0 : 1) - (b.time ? 0 : 1) || (a.time && b.time ? a.time.localeCompare(b.time) : 0));
  const night = today < last ? myNight(nightOf(today, data.stays, data.items), me) : null;
  const tomorrow = addDays(today, 1);
  const tomorrowItems = tomorrow <= last ? on(tomorrow).filter((i) => isFor(i, me)) : [];
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
          <div className={`mt-2 rounded-lg px-3 py-2 ${now > leave.minutes ? "bg-[#8a5a1a] text-white" : "bg-[#514636] text-white"}`}>
            <p className="text-base leading-snug">
              {now > leave.minutes ? `Flight ${flightIn(flightAt - now)} — ${lateLeaveWords(leave, flight!, now).replace(/^Past the time to leave for [^—]+— /, "").replace(/^./, (c) => c.toLowerCase())}` : leave.text}
            </p>
            <p className="text-xs text-white/85 mt-0.5">{clock(flight!.time)} Japan time · {flight!.title}</p>
            {now > leave.minutes && flight!.confirmation && <p className="text-xs text-white/85">Confirmation {flight!.confirmation}</p>}
            <p className="text-xs text-white/75 mt-1">{leave.why}</p>
          </div>
        )}
        {departed && (
          <div className="mt-2 rounded-lg bg-[#514636] text-white px-3 py-2">
            <p className="text-base leading-snug">In the air · {flight!.title}</p>
            {landsWords && <p className="text-sm text-white/85 mt-0.5">{landsWords}</p>}
            {today === last && <p className="text-sm text-white/85 mt-1">Safe travels home.</p>}
          </div>
        )}
        {checkouts.length > 0 && next && <ul className="mt-1">{checkouts.map((i) => <ItemLine key={i.id} i={i} me={me} stays={data.stays} date={today} day={todays} />)}</ul>}
        {current && (
          <button onClick={() => openDay(today, current.id)} className="w-full text-left mt-2 min-h-[44px] text-sm text-[#3a3128]">
            <span className="text-[#6b5d4a]">Now, in Larisa's plan · </span>{current.title.replace(/^./, (c) => c.toUpperCase())}
            <span className="text-[#6b5d4a]">, until {currentRough ? "about " : ""}{clock(current.endTime)}</span>
          </button>
        )}
        {next && !(showLeave && next === flight) ? (
          <div className="mt-2 rounded-lg bg-[#f6f1e8] px-3 py-2">
            <p className="text-xs text-[#6b5d4a]">Next</p>
            <ul><ItemLine i={next} me={me} stays={data.stays} date={today} /></ul>
          </div>
        ) : todays.length === 0 && todayChoices.length === 0 && plan.all.length === 0 && !guidedToday ? (
          <p className="text-sm text-[#6b5d4a] mt-2">Larisa's Guide has nothing set for today.</p>
        ) : null}
        {checkouts.length > 0 && !next && <ul className="mt-1">{checkouts.map((i) => <ItemLine key={i.id} i={i} me={me} stays={data.stays} date={today} day={todays} />)}</ul>}
        {rows.length > 0 && (
          <ul className="mt-1">
            {rows.slice(0, 5).map((r) => r.guide
              ? <ItemLine key={r.key} i={r.guide} me={me} stays={data.stays} date={today} day={todays} />
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
        {rows.length > 5 && <p className="text-xs text-[#6b5d4a] ml-[5.5rem]">and {rows.length - 5} more</p>}
        {todayDeadlines.length > 0 && (
          <ul className="mt-1">
            {todayDeadlines.map((i) => {
              const over = deadlineOver(i, tz);
              const time = deadlineTimeWords(i, tz);
              return (
                <li key={i.id} className="flex gap-3 py-1.5">
                  <span className="w-[4.75rem] shrink-0 text-right text-xs text-[#8a5a1a] pt-0.5">{over ? "Passed" : "Deadline"}</span>
                  <span className={`flex-1 min-w-0 text-sm leading-snug ${over ? "text-[#6b5d4a] line-through decoration-[#c8bba8]" : "text-[#3a3128]"}`}>
                    {i.title}
                    <span className="block text-xs text-[#6b5d4a] mt-0.5 no-underline">
                      {[whose(i, me), over ? `Ended ${time || "today"}` : i.windowStart ? deadlineWhen(i, today) : time].filter(Boolean).join(" · ")}
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
        <button onClick={() => openDay(today)} className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">{plan.all.length > 0 ? "See Larisa's full plan for today ›" : "See all of today ›"}</button>
      </div>

      {tomorrow <= last && (
        <button onClick={() => openDay(tomorrow)} className="w-full text-left pt-3 border-t border-[#efe9df] min-h-[44px]">
          <span className="text-xs uppercase tracking-wide text-[#6b5d4a]">Tomorrow · </span>
          <span className="text-sm text-[#3a3128]">
            {tomorrowFlight
              // The night before a flight: the flight itself, and when to leave (Wander's estimate)
              ? `${clock(tomorrowFlight.time)} · ${tomorrowFlight.title}${tomorrowLeave ? ` — leave about ${minutesToClock(tomorrowLeave.minutes)} (Wander's estimate)` : ""}`
              : tomorrowLead
              // Tomorrow's first appointment (8:30 meet Backroads), not the check-out listed ahead of it
              ? `${tomorrowLead.time ? timeLabel(tomorrowLead, tomorrowItems) + " · " : ""}${itemTitle(tomorrowLead, data.stays, tomorrow)}`
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

      <DeadlineList list={deadlinesAhead(tomorrow, 3).filter((i) => !deadlineOnDate(i, today))} title="Deadlines in the next few days" />
      {freshLine}
    </section>
  );
}

export { minutesToClock };
