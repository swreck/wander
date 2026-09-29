/**
 * DayPage — one day of the trip, as Larisa's Guide describes it.
 *
 * Reached by tapping a day on Home (/day/2026-10-18), or a line on Home (/day/2026-10-14#item-…,
 * which scrolls to that line). Shows, in her words and in the order the day is lived:
 * what happens (flights, meetings, tours, meals, check-in/out), deadlines — on every day of their
 * window, marked once they've passed — maybes, where everyone sleeps tonight (per couple, and
 * "on the flight" when they're in the air), and same-day plans the group added in Wander.
 * Each Guide line says where it came from; the page says how current Wander's copy is.
 * The Guide is read-only here; only the Wander plans can be added or taken off.
 *
 * Offline: the whole trip's Guide items come in one request that the service worker and the phone
 * keep, so every day opens with no signal, and refreshes when the signal returns.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { queuedBodies } from "../lib/offlineStore";
import type { Trip } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";
import { guideData, type TripGuideData, type GuideItem } from "../lib/guideData";
import {
  sortDay, timeLabel, itemTitle, friendlySource, mapsQueryFor, mapsLink, freshness, clock,
  nightOf, isFor, isLanding, deadlineOnDate, deadlineOver, deadlineTimeWords, deadlineWhen,
  leaveForAirport, isPlanningNote, isFragment, partyOf, myNight, leavingOn, stayMapsQuery,
  checkoutBeforeFirst, checkinAfterLanding, leadItem, withCheckoutWho, minutesToClock, lateLeaveWords,
} from "../lib/guideDisplay";

/** Larisa's note for a whole stay, from its heading: "Larisa's note for the Tokyo stay, Oct 13–17" */
function StopNote({ note, city }: { note: GuideItem; city: string | null }) {
  const from = note.windowStart || ymd(note.date);
  const to = ymd(note.date);
  return (
    <p className="text-sm text-[#514636] mb-3">
      <span className="text-[#6b5d4a]">Larisa's note for {city ? `the ${city} stay` : "this stay"}{from && to ? `, ${dateSpan(from, to)}` : ""}: </span>{note.title}
    </p>
  );
}
import PhraseCard from "../components/PhraseCard";
import GuideText from "../components/GuideText";
import { guideOwnerOf, sendToGuideOwner, planMessage } from "../lib/tellGuideOwner";

const KIND_MARK: Record<string, string> = {
  flight: "✈︎", train: "🚄", travel: "🚐", meeting: "📍", tour: "🧭", meal: "🍽", checkin: "🛎", checkout: "🧳",
  deadline: "⏰", plan: "•", note: "✎",
};

interface DayChoice { id: string; date: string; time: string | null; text: string; addedBy: string; fromGuideIdea?: boolean; _pending?: boolean }

const ymd = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The phone's own calendar date (not UTC) — what "today" means to the person holding it. */
function phoneToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function longDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/** A day's title that fits one line even with large text: "Saturday, Oct 17" */
function titleDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Oct 13–17" / "Oct 30–Nov 2" */
function dateSpan(a: string, b: string) {
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
  if (a === b) return f(a, { month: "short", day: "numeric" });
  return a.slice(0, 7) === b.slice(0, 7) ? `${f(a, { month: "short", day: "numeric" })}–${f(b, { day: "numeric" })}` : `${f(a, { month: "short", day: "numeric" })}–${f(b, { month: "short", day: "numeric" })}`;
}

/** Short enough to sit beside the "Today" badge on a phone: "Wed, Oct 28" */
function shortDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

const ZONE_LABEL: Record<string, string> = { "America/Los_Angeles": "California time", "Asia/Tokyo": "Japan time" };

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }

function inWords(mins: number) {
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h} hr ${m} min` : `in ${h} hr`;
}

/**
 * now: the Now tab — today's day as the phone sees it (the first day before the trip, the last after),
 * with what's next at the top. Otherwise the day in the address (/day/2026-10-18).
 */
export default function DayPage({ now = false }: { now?: boolean }) {
  const { date: dateParam = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const me = user?.displayName || null;
  const [, setTick] = useState(0);
  const [data, setData] = useState<TripGuideData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unreachable">("loading");
  const [tripId, setTripId] = useState<string | null>(null);
  const [choices, setChoices] = useState<DayChoice[]>([]);
  const [choicesChecked, setChoicesChecked] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const scrolledFor = useRef<string | null>(null);

  // Load (and reload when the signal comes back, so a saved copy doesn't linger)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let id = localStorage.getItem("wander:last-trip-id");
        if (!id) id = (await api.get<Trip | null>("/trips/active"))?.id || null;
        if (!id) { if (!cancelled) setState("unreachable"); return; }
        const d = await guideData(id);
        if (!cancelled) { setTripId(id); setData(d); setState("ready"); }
      } catch {
        if (!cancelled) setState((s) => (s === "ready" ? s : "unreachable"));
      }
    };
    load();
    window.addEventListener("online", load);
    return () => { cancelled = true; window.removeEventListener("online", load); };
  }, []);

  // Keep "today", "next" and passed deadlines current: every minute, and the moment the phone is
  // picked up again (left open overnight, it must not show yesterday as today)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    const onShow = () => { if (document.visibilityState === "visible") setTick((n) => n + 1); };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, []);

  const trip = data?.trip || null;
  const days = data?.days || [];
  const items = data?.items || [];
  const stays = data?.stays || [];
  const status = data?.status || null;
  const tripZone = trip?.timeZone || "Asia/Tokyo";
  const tripFirst = ymd(trip?.startDate);
  const last = ymd(trip?.endDate);
  const today = phoneToday();
  // The Now tab starts from YOUR first day: Julie, at home until Oct 13, isn't shown Ken & Larisa's Okayama
  const myParty = partyOf(items, me);
  const myStart = myParty
    ? items.filter((i) => i.date && i.forWhom === myParty && ["flight", "checkin"].includes(i.kind) && !isLanding(i)).map((i) => ymd(i.date)).sort()[0]
    : undefined;
  const first = now && myStart && myStart > tripFirst ? myStart : tripFirst;
  const date = !now ? dateParam : !first ? today : today < first ? first : today > last ? last : today;
  const beforeTrip = now && !!first && today < first;
  const afterTrip = now && !!last && today > last;
  const day = days.find((d) => ymd(d.date) === date);

  // Same-day plans added in Wander for this date
  useEffect(() => {
    if (!tripId || !date) return;
    let cancelled = false;
    // Plans saved with no signal wait on this phone — shown, marked as waiting, even after Wander was
    // closed and opened again (they used to vanish until the signal came back)
    const waiting = async (have: DayChoice[]) => (await queuedBodies(`/day-choices/${tripId}`))
      .filter((q) => q.date === date && typeof q.text === "string" && !have.some((c) => c.text === q.text))
      .map((q): DayChoice => ({ id: `pending-${q._at}`, date, time: (q.time as string | null) || null, text: q.text as string, addedBy: me || "You", _pending: true }));
    // On a slow signal the day starts from this phone's last copy of the group's plans (and says it's
    // checking), instead of looking as if nothing was planned
    const copyKey = `wander:day-plans:${tripId}:${date}`;
    const load = () => api.get<DayChoice[]>(`/day-choices/${tripId}?date=${date}`)
      .then(async (c) => {
        try { localStorage.setItem(copyKey, JSON.stringify(c)); } catch { /* full */ }
        const w = await waiting(c);
        if (!cancelled) { setChoices([...c, ...w]); setChoicesChecked(true); }
      })
      .catch(async () => { const w = await waiting([]); if (!cancelled) { setChoices((prev) => [...prev.filter((p) => !p._pending), ...w]); setChoicesChecked(true); } });
    let saved: DayChoice[] = [];
    try { saved = JSON.parse(localStorage.getItem(copyKey) || "[]"); } catch { /* unreadable */ }
    setChoices(saved);
    setChoicesChecked(false);
    load();
    window.addEventListener("wander:data-changed", load);
    return () => { cancelled = true; window.removeEventListener("wander:data-changed", load); };
  }, [tripId, date]);

  // The day in the order it's lived (lib/guideDisplay.ts). Deadlines appear on every day of their
  // window; Larisa's budget and bookkeeping notes sit apart from the plan.
  const { dayItems, planningNotes, stopNotes } = useMemo(() => {
    const onDay = withCheckoutWho(items.filter((i) => (i.kind === "deadline" ? deadlineOnDate(i, date) : i.kind === "stop" ? false : ymd(i.date) === date) && !isFragment(i)), date, stays, items);
    return {
      dayItems: sortDay(onDay.filter((i) => !isPlanningNote(i))),
      planningNotes: onDay.filter(isPlanningNote),
      // Larisa's summary in the heading of the stop this day belongs to ("tour Karatsu, day trip to Arita")
      stopNotes: items.filter((i) => i.kind === "stop" && (i.windowStart || ymd(i.date)) <= date && date <= ymd(i.date)),
    };
  }, [items, date, stays]);

  const night = useMemo(() => nightOf(date, stays, items), [date, stays, items]);
  const cityOf = (id?: string | null) => (id ? trip?.cities.find((c) => c.id === id)?.name ?? null : null);
  // The stay a stop note belongs to is named by the city of its first day
  const stopCity = (s: GuideItem) => days.find((d) => ymd(d.date) === (s.windowStart || ymd(s.date)))?.city?.name ?? null;
  const owner = guideOwnerOf(trip?.tagline);
  const leaving = stays.filter((s) => ymd(s.checkOutDate) === date);
  const fromCity = leaving[0] ? trip?.cities.find((c) => c.id === leaving[0].cityId)?.name : null;
  const cityName = day?.city?.name || trip?.cities.find((c) => c.id === night.stays[0]?.stay.cityId)?.name || "";
  const route = fromCity && cityName && fromCity !== cityName ? `${fromCity} → ${cityName}` : cityName;
  const isToday = date === today;
  const hasPrev = !!first && date > first;
  const hasNext = !!last && date < last;

  // Opened from a line on Home: bring that line into view and mark it briefly
  useEffect(() => {
    if (state !== "ready") return;
    const id = location.hash.startsWith("#item-") ? location.hash.slice(6) : null;
    if (!id || scrolledFor.current === `${date}:${id}`) return;
    scrolledFor.current = `${date}:${id}`;
    requestAnimationFrame(() => {
      document.getElementById(`item-${id}`)?.scrollIntoView({ block: "center" });
      setHighlight(id);
      setTimeout(() => setHighlight(null), 2500);
    });
  }, [state, location.hash, date]);

  async function addChoice() {
    const text = draft.trim();
    if (!text || !tripId || saving) return;
    setSaving(true);
    const body = { date, text, time: draftTime || null };
    try {
      const created = await api.post<DayChoice & { _queued?: boolean }>(`/day-choices/${tripId}`, body);
      if ((created as { _queued?: boolean })._queued) {
        setChoices((c) => [...c, { id: `pending-${Date.now()}`, date, time: body.time, text, addedBy: me || "You", _pending: true }]);
        setNotice("Saved on this phone — I'll add it for everyone when you have signal.");
      } else {
        setChoices((c) => [...c, created]);
        setNotice(null);
      }
      setDraft(""); setDraftTime(""); setAdding(false);
    } catch {
      setNotice("That didn't save — try again?");
    } finally {
      setSaving(false);
    }
  }

  async function removeChoice(c: DayChoice) {
    if (!tripId) return;
    if (c._pending) { setChoices((list) => list.filter((x) => x.id !== c.id)); setConfirmRemove(null); return; }
    try {
      await api.delete(`/day-choices/${tripId}/${c.id}`);
      setChoices((list) => list.filter((x) => x.id !== c.id));
      setNotice(null);
    } catch {
      setNotice(navigator.onLine === false ? "No signal — try taking it off again when you're back online." : "That didn't come off — try again?");
    }
    setConfirmRemove(null);
  }

  if (state === "loading") {
    return <div className="min-h-[100dvh] bg-[#faf8f5] flex items-center justify-center text-sm text-[#6b5d4a]">Opening {date ? longDate(date) : "the day"}…</div>;
  }

  if (state === "unreachable") {
    return (
      <div className="min-h-[100dvh] bg-[#faf8f5] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-base text-[#3a3128] mb-1">Wander can't reach the trip right now.</p>
        <p className="text-sm text-[#6b5d4a] mb-5">This phone hasn't saved this trip yet. It will open once you're back online.</p>
        <button onClick={() => window.location.reload()} className="min-h-[44px] px-5 rounded-xl bg-[#514636] text-white text-sm mb-2">Try again</button>
        <button onClick={() => navigate("/")} className="min-h-[44px] px-5 text-sm text-[#514636]">Back to the trip</button>
      </div>
    );
  }

  // Today (on Now and on today's day screen): a flight leaving Japan leads with when to leave for
  // the airport (Wander's estimate), then what's next — the Guide's or a plan added in Wander
  const myFlight = dayItems.find((i) => i.kind === "flight" && !isLanding(i) && i.time && isFor(i, me));
  const leave = isToday && myFlight ? leaveForAirport(myFlight, cityName) : null;
  const flightAt = myFlight?.time ? toMin(myFlight.time) : null;
  const upcomingGuide = isToday
    ? dayItems.find((i) => i.time && !["deadline", "checkout", "checkin"].includes(i.kind) && isFor(i, me) && toMin(i.time) >= nowMin())
    : undefined;
  const upcomingChoice = isToday
    ? choices.filter((c) => c.time && toMin(c.time) >= nowMin()).sort((a, b) => a.time!.localeCompare(b.time!))[0]
    : undefined;
  const nextIsChoice = !!upcomingChoice && (!upcomingGuide || upcomingChoice.time! < upcomingGuide.time!);
  const upcoming = now ? upcomingGuide : undefined;
  const myTonight = myNight(night, me);
  const tomorrowFirst = now && isToday && !upcomingGuide && !upcomingChoice && date < last
    ? leadItem(sortDay(items.filter((i) => ymd(i.date) === addDays(date, 1) && i.kind !== "deadline" && i.kind !== "stop" && isFor(i, me) && !isPlanningNote(i) && !isFragment(i))))
    : null;

  return (
    <div className="min-h-[100dvh] bg-[#faf8f5] pb-32">
      {/* Header: where you are, how to get back, and the neighbouring days */}
      <header className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur border-b border-[#e0d8cc] px-2 pt-[max(env(safe-area-inset-top),8px)] pb-2">
        <div className="flex items-center gap-1">
          {now ? (
            // Quick Japanese phrases, up here — floating over the day they covered its cards
            <div className="min-w-[44px]"><PhraseCard inHeader /></div>
          ) : (
            <button
              // Step back to where they came from (Home, Ideas), so Back afterwards doesn't reopen this day
              onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/", { replace: true }))}
              aria-label="Back" className="min-h-[44px] min-w-[44px] px-2 text-[#514636] text-sm">‹ Back</button>
          )}
          <div className="flex-1 text-center min-w-0">
            <h1 className="text-base font-medium text-[#3a3128] leading-snug" aria-label={`${longDate(date)}${isToday ? ", today" : ""}`}>
              {isToday ? shortDate(date) : titleDate(date)}{isToday && <span className="ml-2 text-xs font-normal text-white bg-[#514636] rounded-full px-2 py-0.5 align-middle">Today</span>}
            </h1>
            <p className="text-xs text-[#6b5d4a] leading-snug">{[route, day?.dayType === "guided" ? "With Backroads" : null].filter(Boolean).join(" · ")}</p>
          </div>
          {/* Day to day replaces (Back returns to where you came from); from Now it's a step, so Back returns to Now */}
          <button onClick={() => hasPrev && navigate(`/day/${addDays(date, -1)}`, { replace: !now })} disabled={!hasPrev}
            aria-label="Previous day" className="min-h-[44px] min-w-[44px] text-lg text-[#514636] disabled:opacity-25">‹</button>
          <button onClick={() => hasNext && navigate(`/day/${addDays(date, 1)}`, { replace: !now })} disabled={!hasNext}
            aria-label="Next day" className="min-h-[44px] min-w-[44px] text-lg text-[#514636] disabled:opacity-25">›</button>
        </div>
      </header>

      <main className="px-4 pt-4 max-w-xl mx-auto">
        {!day && (!first || date < first || date > last) ? (
          <p className="text-sm text-[#6b5d4a] mt-6 text-center">This date isn't part of the trip.</p>
        ) : (
          <>
            {data?.fromSavedCopy && (
              <p className="mb-3 text-sm text-[#6b5d4a] bg-white/70 border border-[#e0d8cc] rounded-lg px-3 py-2" role="status">
                No signal — showing what this phone saved{data.savedAt ? ` ${new Date(data.savedAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}.
              </p>
            )}
            {/* Now tab: before the trip, after it, or what's next today */}
            {beforeTrip && (
              <p className="text-sm text-[#6b5d4a] mb-3">
                {first === tripFirst ? "The trip starts" : "You leave"} {(() => {
                  const n = Math.round((new Date(`${first}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
                  return n === 1 ? "tomorrow" : `in ${n} days`;
                })()}. Here's {first === tripFirst ? "the first day" : "your first day"}.
              </p>
            )}
            {afterTrip && <p className="text-sm text-[#6b5d4a] mb-3">Welcome home. Here's the last day of the trip.</p>}

            {/* Larisa's summary for the whole stay, from its heading — up top only on the stay's first
                day. On the other days (and on Now) it sits at the bottom, so "day trip to Mashiko" never
                reads as today's plan. */}
            {!now && stopNotes.filter((s) => (s.windowStart || ymd(s.date)) === date).map((s) => (
              <StopNote key={s.id} note={s} city={stopCity(s)} />
            ))}

            {leave && flightAt !== null && nowMin() < flightAt && (
              <div className={`mb-3 rounded-xl p-4 text-white ${nowMin() > leave.minutes ? "bg-[#8a5a1a]" : "bg-[#514636]"}`}>
                <p className="text-xs uppercase tracking-wide text-white/70">
                  {nowMin() > leave.minutes ? `Flight ${inWords(flightAt - nowMin())}` : `Leave ${inWords(leave.minutes - nowMin())}`}
                </p>
                <p className="text-lg leading-snug mt-1">
                  {nowMin() > leave.minutes ? lateLeaveWords(leave, myFlight!, nowMin()) : leave.text}
                </p>
                <p className="text-sm text-white/85 mt-1">{clock(myFlight!.time)} Japan time · {myFlight!.title}</p>
                {myFlight!.confirmation && <p className="text-sm text-white/80">Confirmation {myFlight!.confirmation}</p>}
                <p className="text-xs text-white/70 mt-2">{leave.why}</p>
              </div>
            )}

            {now && isToday && (nextIsChoice ? upcomingChoice : upcoming) && !(leave && !nextIsChoice && upcoming === myFlight) && (() => {
              if (nextIsChoice && upcomingChoice) {
                return (
                  <div className="mb-3 rounded-xl bg-[#514636] text-white p-4">
                    <p className="text-xs uppercase tracking-wide text-white/70">Next · {inWords(toMin(upcomingChoice.time!) - nowMin())}</p>
                    <p className="text-lg leading-snug mt-1">{clock(upcomingChoice.time)} · {upcomingChoice.text}</p>
                    <p className="text-sm text-white/80 mt-1">Added in Wander by {upcomingChoice.addedBy}</p>
                  </div>
                );
              }
              const u = upcoming!;
              const q = mapsQueryFor(u);
              return (
                <div className="mb-3 rounded-xl bg-[#514636] text-white p-4">
                  <p className="text-xs uppercase tracking-wide text-white/70">Next · {inWords(toMin(u.time!) - nowMin())}</p>
                  <p className="text-lg leading-snug mt-1">{clock(u.time)} · {itemTitle(u, stays, date)}</p>
                  {u.confirmation && <p className="text-sm text-white/80 mt-1">Confirmation {u.confirmation}</p>}
                  {q && (
                    <a href={mapsLink(q)} className="inline-flex items-center min-h-[44px] text-sm underline underline-offset-2">
                      Find in Maps ↗
                    </a>
                  )}
                </div>
              );
            })()}
            {now && isToday && !upcomingGuide && !upcomingChoice && !(leave && flightAt !== null && nowMin() < flightAt) && (
              <div className="mb-3 rounded-xl bg-white border border-[#e0d8cc] p-3">
                {/* Nothing timed is left: where you're headed tonight (just landed? the hotel, with Maps) */}
                {myTonight.away[0] ? (
                  <p className="text-[15px] text-[#3a3128]"><span className="text-[#6b5d4a]">Tonight · </span>{myTonight.away[0].text}</p>
                ) : myTonight.stays.length === 1 ? (
                  <>
                    <p className="text-[15px] text-[#3a3128]">
                      <span className="text-[#6b5d4a]">Tonight · </span>{myTonight.stays[0].stay.name}
                      {ymd(myTonight.stays[0].stay.checkInDate) === date && myTonight.stays[0].stay.checkInTime ? ` — check in any time from ${/^\d{1,2}:\d{2}$/.test(myTonight.stays[0].stay.checkInTime) ? clock(myTonight.stays[0].stay.checkInTime) : myTonight.stays[0].stay.checkInTime}` : ""}
                    </p>
                    <a href={mapsLink(stayMapsQuery(myTonight.stays[0].stay, cityOf(myTonight.stays[0].stay.cityId)))}
                      className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Find in Maps ↗</a>
                  </>
                ) : myFlight && flightAt !== null && nowMin() >= flightAt ? (
                  // The flight has left: say so, and when it lands
                  <>
                    <p className="text-[15px] text-[#3a3128]"><span className="text-[#6b5d4a]">In the air · </span>{myFlight.title}</p>
                    {(myFlight.detail || "").match(/Lands at [^\n|]+/) && (
                      <p className="text-sm text-[#514636] mt-0.5">{(myFlight.detail || "").match(/Lands at [^\n|]+/)![0].trim()}</p>
                    )}
                    {date === last && <p className="text-sm text-[#514636] mt-1">Safe travels home.</p>}
                  </>
                ) : (
                  <p className="text-sm text-[#6b5d4a]">Nothing more with a time today.</p>
                )}
                {tomorrowFirst && (
                  <button onClick={() => navigate(`/day/${addDays(date, 1)}`)} className="w-full text-left min-h-[44px] text-sm text-[#3a3128]">
                    <span className="text-[#6b5d4a]">Tomorrow · </span>
                    {tomorrowFirst.time ? `${timeLabel(tomorrowFirst)} · ` : ""}{itemTitle(tomorrowFirst, stays, addDays(date, 1))}
                    {(() => {
                      // The night before flying: when to leave (Wander's estimate), same as Home says
                      if (tomorrowFirst.kind !== "flight" || isLanding(tomorrowFirst)) return null;
                      const l = leaveForAirport(tomorrowFirst, cityName);
                      return l ? ` — leave about ${minutesToClock(l.minutes)} (Wander's estimate)` : null;
                    })()} ›
                  </button>
                )}
              </div>
            )}

            {/* The day, in Larisa's words */}
            {day?.dayType === "guided" && (() => {
              // A Backroads day: the guides run it; the Guide lists only what's special
              const guided = days.filter((d) => d.dayType === "guided").map((d) => ymd(d.date)).sort();
              const n = guided.indexOf(date) + 1;
              return (
                <p className="text-sm text-[#3a3128] bg-[#eef3e8] rounded-xl px-4 py-3 mb-3">
                  With Backroads today{n > 0 ? ` — day ${n} of ${guided.length}` : ""}. Their guides lead the day{dayItems.length ? "; here's what Larisa's Guide adds." : ", and Larisa's Guide has nothing else for it."}
                </p>
              );
            })()}
            {dayItems.length === 0 && choices.length === 0 ? (
              day?.dayType === "guided" ? null : (
                <p className="text-sm text-[#6b5d4a] bg-white rounded-xl border border-[#e0d8cc] p-4">
                  Larisa's Guide has nothing set for this day.
                </p>
              )
            ) : (
              <ol className="space-y-2">
                {dayItems.map((i) => <ItemCard key={i.id} i={i} date={date} today={today} tripZone={tripZone} stays={stays} me={me} highlight={highlight === i.id} day={dayItems} />)}
              </ol>
            )}

            {/* Same-day plans added in Wander — the group's own, beside the Guide */}
            <section className="mt-5">
              {!choicesChecked && <p className="text-sm text-[#6b5d4a] mb-2" role="status">Checking for plans added in Wander…</p>}
              {choices.length > 0 && (
                <>
                  <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">Added in Wander</h2>
                  <ul className="space-y-2">
                    {/* In the order they'll happen: times first (2:30 before 3:00), then plans with no time */}
                    {[...choices].sort((a, b) => (a.time ? 0 : 1) - (b.time ? 0 : 1) || (a.time || "").localeCompare(b.time || "")).map((c) => (
                      <li key={c.id} className="bg-white rounded-xl border border-[#e0d8cc] p-3">
                        <div className="flex gap-3">
                          <div className="w-16 shrink-0 text-right text-sm font-medium text-[#3a3128]">{c.time ? clock(c.time) : <span className="text-[#6b5d4a]" aria-hidden>✦</span>}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] leading-snug text-[#3a3128] [overflow-wrap:anywhere]">{c.text}</p>
                            <p className="text-xs text-[#6b5d4a] mt-1">
                              {c._pending
                                ? "Saved on this phone — waiting for signal"
                                : c.fromGuideIdea
                                  ? `Put on this day by ${c.addedBy} · one of ${owner || "Larisa"}'s ideas`
                                  : `Added by ${c.addedBy} · not in ${owner || "Larisa"}'s Guide`}
                            </p>
                            {confirmRemove === c.id ? (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm text-[#6b5d4a]">Take this off the day?</span>
                                <button onClick={() => removeChoice(c)} className="min-h-[44px] px-3 text-sm text-[#8a3a1a]">Take it off</button>
                                <button onClick={() => setConfirmRemove(null)} className="min-h-[44px] px-3 text-sm text-[#514636]">Keep</button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-x-4">
                                {owner && me !== owner && !c._pending && (
                                  <button
                                    onClick={async () => setNotice(await sendToGuideOwner(owner, planMessage(owner, c, me)))}
                                    className="min-h-[44px] text-sm text-[#514636]"
                                  >
                                    Tell {owner}
                                  </button>
                                )}
                                <button onClick={() => setConfirmRemove(c.id)} aria-label={`Take ${c.text} off this day`} className="min-h-[44px] text-sm text-[#6b5d4a]">Take off this day</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {adding ? (
                <div className="mt-3 bg-white rounded-xl border border-[#e0d8cc] p-3 scroll-mb-40"
                  ref={(el) => { if (el && !el.dataset.shown) { el.dataset.shown = "1"; requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" })); } }}>
                  <label className="block text-sm text-[#3a3128] mb-1" htmlFor="day-plan">What's the plan?</label>
                  <input
                    id="day-plan" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") addChoice(); }}
                    placeholder="Ken and Andy: Musée Tomo this afternoon"
                    className="w-full min-h-[44px] px-3 rounded-lg border border-[#e0d8cc] text-[16px] text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-[#a89880]"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-sm text-[#6b5d4a]" htmlFor="day-plan-time">Time</label>
                    <input id="day-plan-time" type="time" value={draftTime} onChange={(e) => setDraftTime(e.target.value)}
                      className="min-h-[44px] px-2 rounded-lg border border-[#e0d8cc] text-[16px] text-[#3a3128]" />
                    <span className="text-xs text-[#6b5d4a]">optional</span>
                  </div>
                  <p className="text-xs text-[#6b5d4a] mt-2">Everyone on the trip sees it on this day. Larisa's Guide stays as it is.</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={addChoice} disabled={!draft.trim() || saving} className="min-h-[44px] px-4 rounded-lg bg-[#514636] text-white text-sm disabled:opacity-40">
                      {saving ? "Adding…" : "Add to this day"}
                    </button>
                    <button onClick={() => { setAdding(false); setDraft(""); setDraftTime(""); }} className="min-h-[44px] px-4 text-sm text-[#514636]">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAdding(true)} className="mt-3 min-h-[44px] text-sm text-[#514636] underline underline-offset-2">
                  + Add a plan for this day
                </button>
              )}
              {notice && <p className="text-sm text-[#6b5d4a] mt-2" role="status">{notice}</p>}
            </section>

            {/* Where everyone sleeps tonight */}
            {date !== last && (
              <section className="mt-6">
                <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">Tonight</h2>
                {night.stays.length === 0 && night.away.length === 0 ? (
                  <p className="text-sm text-[#6b5d4a]">Larisa's Guide doesn't list a place to sleep tonight.</p>
                ) : (
                  <>
                    {night.stays.length > 1 && new Set(night.stays.map((s) => s.who || "all")).size < night.stays.length && (
                      <p className="text-sm text-[#8a5a1a] mb-2">The Guide lists more than one place for tonight — still being worked out.</p>
                    )}
                    <ul className="space-y-2">
                      {night.away.map((a) => (
                        <li key={`away-${a.who}`} className="bg-white rounded-xl border border-[#e0d8cc] p-3">
                          <p className="text-[15px] text-[#3a3128]">{a.text}</p>
                          <p className="text-xs text-[#514636] mt-1">{/^everyone$/i.test(a.who) ? "Everyone" : a.who}</p>
                        </li>
                      ))}
                      {night.stays.map(({ stay: s, who }) => (
                        <li key={s.id} className="bg-white rounded-xl border border-[#e0d8cc] p-3">
                          <p className="text-[15px] text-[#3a3128]">{s.name}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-[#514636]">
                            {who && <span>{/^everyone$/i.test(who) ? "Everyone" : who}</span>}
                            {ymd(s.checkInDate) === date && s.checkInTime && <span>Check in from {/^\d{1,2}:\d{2}$/.test(s.checkInTime) ? clock(s.checkInTime) : s.checkInTime}</span>}
                            {s.confirmationNumber && <span className="[overflow-wrap:anywhere]">Confirmation {s.confirmationNumber}</span>}
                          </div>
                          <a href={mapsLink(stayMapsQuery(s, cityOf(s.cityId)))} className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2 [overflow-wrap:anywhere]">
                            {s.address ? `${s.address} ↗` : "Find in Maps ↗"}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            {/* The rest of the stay's days (and Now): Larisa's note for the whole stay, as background */}
            {stopNotes.filter((s) => now || (s.windowStart || ymd(s.date)) !== date).map((s) => (
              <div key={s.id} className="mt-6"><StopNote note={s} city={stopCity(s)} /></div>
            ))}

            {/* Larisa's own bookkeeping for the day (budgets, placeholders) — kept, but apart from the plan */}
            {planningNotes.length > 0 && (
              <section className="mt-6">
                <button onClick={() => setShowNotes((v) => !v)} aria-expanded={showNotes} className="min-h-[44px] text-sm text-[#514636]">
                  {showNotes ? "Hide" : "Show"} Larisa's planning notes ({planningNotes.length})
                </button>
                {showNotes && (
                  <ul className="space-y-1 mt-1">
                    {planningNotes.map((n) => (
                      <li key={n.id} className="text-sm text-[#6b5d4a]">
                        {n.title}{n.detail ? ` — ${n.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* How current this is */}
            {status?.current && (() => {
              const f = freshness(status.current.importedAt);
              return f && (
                <p className={`text-xs mt-8 text-center ${f.old ? "text-[#8a5a1a]" : "text-[#6b5d4a]"}`}>
                  {f.text}.{f.old && " Larisa may have changed things since."}
                </p>
              );
            })()}
          </>
        )}
      </main>
    </div>
  );
}

/** One line of the Guide for this day. */
function ItemCard({ i, date, today, tripZone, stays, me, highlight, day }: {
  i: GuideItem; date: string; today: string; tripZone: string; stays: TripGuideData["stays"]; me: string | null; highlight: boolean; day: GuideItem[];
}) {
  // Checked out first on a morning with an earlier start: "Morning", and the hotel's own time below
  const earlyCheckout = checkoutBeforeFirst(i, day);
  const maybe = i.title.startsWith("Maybe:");
  const deadline = i.kind === "deadline";
  const over = deadline && deadlineOver(i, tripZone);
  const zone = i.timeZone && i.timeZone !== tripZone ? ZONE_LABEL[i.timeZone] || i.timeZone : null;
  const q = mapsQueryFor(i);
  const time = deadline ? deadlineTimeWords(i, tripZone) : null;
  // The detail already spells out the window; on the day itself, say it's open now
  const windowWords = deadline && i.windowStart && date === today && today < ymd(i.date) ? deadlineWhen(i, today) : null;
  // Check-out on a morning the Guide lists two places: each hotel's own time and code, never blended
  const bothLeaving = i.kind === "checkout" ? leavingOn(stays, date) : [];
  const split = bothLeaving.length > 1;
  const ownHotel = i.title.replace(/^Check out · /, "");
  const tone = over ? "bg-[#f4efe7] border-[#e0d8cc]" : deadline ? "bg-[#fff8ec] border-[#e8c98f]" : maybe ? "bg-white/60 border-dashed border-[#d6ccbc]" : "bg-white border-[#e0d8cc]";
  return (
    <li id={`item-${i.id}`} className={`rounded-xl border p-3 transition-shadow ${tone} ${highlight ? "ring-2 ring-[#c8a060] shadow-md" : ""}`}>
      <div className="flex gap-3">
        <div className="w-16 shrink-0 text-right">
          {i.time && !split ? (
            <>
              <div className="text-sm font-medium text-[#3a3128]">{timeLabel(i, day)}</div>
              {/* A travel line's second time is when you arrive (Okayama 8:30 → Bizen 9:30), not how long it lasts */}
              {i.endTime && i.kind !== "flight" && <div className="text-xs text-[#6b5d4a]">{["travel", "train"].includes(i.kind) ? "arrive" : "to"} {/end time is Larisa's estimate/i.test(i.detail || "") ? "about " : ""}{clock(i.endTime)}</div>}
              {zone && <div className="text-xs text-[#6b5d4a]">{zone}</div>}
            </>
          ) : (
            <div className="text-base text-[#6b5d4a]" aria-hidden>{KIND_MARK[i.kind] || "•"}</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[15px] leading-snug ${over ? "text-[#6b5d4a]" : maybe ? "text-[#6b5d4a] italic" : "text-[#3a3128]"}`}>
            {deadline && <span className="font-medium">{over ? "Passed · " : "Deadline · "}</span>}{itemTitle(i, stays, date)}
          </p>
          {deadline && (windowWords || time) && (
            <p className="text-sm text-[#8a5a1a] mt-1">{over ? `Ended ${time || ""}`.trim() : [windowWords, time].filter(Boolean).join(" · ")}</p>
          )}
          {split && (
            <ul className="text-sm text-[#3a3128] mt-1 space-y-0.5">
              {bothLeaving.map((s) => {
                const mine = ownHotel.toLowerCase().includes(s.name.toLowerCase().split(" ")[0]);
                return (
                  <li key={s.id}>
                    {s.name}: {mine && i.time ? `by ${clock(i.time)}` : "no check-out time in the Guide"}
                    {mine && i.confirmation ? ` · confirmation ${i.confirmation}` : ""}
                  </li>
                );
              })}
            </ul>
          )}
          {earlyCheckout && !split && <p className="text-sm text-[#6b5d4a] mt-1">The hotel's check-out time is {clock(i.time)}.</p>}
          {checkinAfterLanding(i, day) && <p className="text-sm text-[#6b5d4a] mt-1">Rooms are ready from {clock(i.time)}.</p>}
          {/* Only a booked meal (a place or a confirmation) is missing a time; "Dinner on our own" isn't */}
          {i.kind === "meal" && !i.time && (i.confirmation || i.place) && <p className="text-sm text-[#6b5d4a] mt-1">No time in the Guide.</p>}
          {/* The window was just said above ("Any day through Wed, Oct 14") — not twice */}
          {(() => {
            const detail = windowWords ? (i.detail || "").replace(/^Any day from [^\n]*\n?/, "") : i.detail;
            return detail ? <GuideText text={detail} className="text-sm text-[#6b5d4a] mt-1" /> : null;
          })()}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
            {i.forWhom && <span className="text-[#514636]">{/^everyone$/i.test(i.forWhom) ? "Everyone" : isFor(i, me) ? `Yours · ${i.forWhom}` : `For ${i.forWhom}`}</span>}
            {i.confirmation && !split && <span className="text-[#514636] [overflow-wrap:anywhere]">Confirmation {i.confirmation}</span>}
          </div>
          {q && (
            <a href={mapsLink(q)} className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2 [overflow-wrap:anywhere]">
              {i.place ? `${i.place} ↗` : "Find in Maps ↗"}
            </a>
          )}
          {i.link && !q && (
            <a href={i.link} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Link ↗</a>
          )}
          <p className="text-xs text-[#6b5d4a] mt-1">{friendlySource(i.source)}</p>
        </div>
      </div>
    </li>
  );
}
