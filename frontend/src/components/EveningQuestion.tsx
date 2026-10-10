/**
 * Scout's evening question (Oct 1 2026, Ken): once a day, after 6 PM on a trip day, "Anything worth remembering from
 * today?" — the same machinery as Notes (it opens Notes for that day). Not when a note about today is already written,
 * and "Not tonight" puts it away until tomorrow.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { guideData, savedGuideData, type GuideItem, type TripGuideData } from "../lib/guideData";
import { isFor, isLanding, homeOnJapanDate, mealUnderWay } from "../lib/guideDisplay";
import { visitAsk, takeVisitAsk } from "../lib/visitAsks";
import { savedCopy, tripToday } from "../lib/tripNotes";
import { useAuth } from "../contexts/AuthContext";

/** Whether to ask tonight, from the trip's lines (the day it's for, or null) */
function askFor(g: TripGuideData, tripId: string, me: string | null): string | null {
  const tz = g.trip.timeZone || "Asia/Tokyo";
  const today = tripToday(tz);
  const tripDays = g.days.map((d: any) => String(d.date).slice(0, 10));
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  let dismissed = false;
  try { dismissed = localStorage.getItem(`wander:evening-question:${today}`) === "done"; } catch { /* storage off */ }
  const wroteToday = (savedCopy(tripId)?.notes || []).some((n) => n.mine && n.dayDate === today);
  // (not on the last day — that evening is the flight home; it asked above "Should be in the air"; tester k1)
  const lastDay = [...tripDays].sort().pop();
  // …nor the evening you land (Julie's first night: it stood where the way to the hotel should be; round 15)
  const mine = (g.items || []).filter((i: GuideItem) => i.date && String(i.date).slice(0, 10) === today && isFor(i, me));
  const landedToday = mine.some(isLanding);
  // …nor on a Japan date you're still at home for — before your flight, Japan's evening is your morning (Sweep A: at
  // 6:30 AM in California, the morning Julie flies, it asked "Anything worth remembering from today? / Not tonight"
  // right under the "You leave today" card)
  const stillHome = !!homeOnJapanDate(g.items || [], me, today, tz);
  // …nor on a visit something else has already asked in (one ask per visit — lib/visitAsks)
  const otherAsk = !!visitAsk() && visitAsk() !== "evening";
  // …nor while tonight's plan still has something to come — it's for winding down (it asked ten minutes before the
  // yakiniku dinner; round 15)
  const nowMin = hour * 60 + Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, minute: "numeric" }).format(new Date()));
  const stillAhead = mine.some((i: GuideItem) => ["block", "meal", "tour"].includes(i.kind) && i.time
    && Number(i.time.slice(0, 2)) * 60 + Number(i.time.slice(3, 5)) > nowMin)
    // …or a booked dinner under way (at 7 PM, mid-yakiniku, it asked under "Now · Yakiniku Yazawa")
    || !!mealUnderWay((g.items || []).filter((i: GuideItem) => i.date && String(i.date).slice(0, 10) === today), nowMin, me);
  return tripDays.includes(today) && today !== lastDay && hour >= 18 && !dismissed && !wroteToday && !landedToday && !stillAhead && !stillHome && !otherAsk ? today : null;
}

export default function EveningQuestion({ tripId, className = "" }: { tripId: string | null | undefined; className?: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const me = user?.displayName || null;
  // Decided in the screen's first drawing from this phone's copy of the trip — and later in the visit only ever taken
  // away, never put in (journeys check, Oct 10: arriving a moment after Next and Home appeared, it pushed them down 214 pt).
  // A phone with no copy yet asks another evening.
  const [ask, setAsk] = useState<string | null>(() => {
    if (!tripId) return null;
    const g = savedGuideData(tripId);
    return g ? askFor(g, tripId, me) : null;
  });

  // (shown: it's this visit's ask — the tour offer waits for another visit)
  useEffect(() => { if (ask) takeVisitAsk("evening"); }, [ask]);

  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    const check = () => guideData(tripId).then((g) => {
      if (alive && !askFor(g, tripId, me)) setAsk(null);
    }).catch(() => { /* the phone's copy stands */ });
    check();
    const every = setInterval(check, 5 * 60_000);
    return () => { alive = false; clearInterval(every); };
  }, [tripId, me]);

  if (!ask) return null;
  const putAway = () => { try { localStorage.setItem(`wander:evening-question:${ask}`, "done"); } catch { /* storage off */ } setAsk(null); };
  return (
    <section className={`rounded-xl bg-[#3f3830] text-white p-4 ${className}`} aria-label="Scout's evening question">
      <p className="text-xs uppercase tracking-wide text-white/70">Scout asks</p>
      <p className="text-lg leading-snug mt-1">Anything worth remembering from today?</p>
      <p className="text-sm text-white/80 mt-1">A line or a page — every word is kept exactly, just for you unless you share it.</p>
      <div className="flex flex-wrap gap-2 mt-3">
        {/* (it stays until a note about today is written — opening Notes and leaving without one put it away for the
            night; tester t1) */}
        <button onClick={() => navigate(`/notes?from=evening&day=${ask}`)} className="min-h-[44px] px-4 rounded-xl bg-white text-[#3a3128] text-sm font-medium">Write a note</button>
        <button onClick={putAway} className="min-h-[44px] px-4 rounded-xl text-white/85 text-sm">Not tonight</button>
      </div>
    </section>
  );
}
