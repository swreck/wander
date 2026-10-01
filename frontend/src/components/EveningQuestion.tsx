/**
 * Scout's evening question (Oct 1 2026, Ken): once a day, after 6 PM on a trip day, "Anything worth remembering from
 * today?" — the same machinery as Notes (it opens Notes for that day). Not when a note about today is already written,
 * and "Not tonight" puts it away until tomorrow.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { guideData } from "../lib/guideData";
import { savedCopy, tripToday } from "../lib/tripNotes";

export default function EveningQuestion({ tripId, className = "" }: { tripId: string | null | undefined; className?: string }) {
  const navigate = useNavigate();
  const [ask, setAsk] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    const check = () => guideData(tripId).then((g) => {
      if (!alive) return;
      const tz = g.trip.timeZone || "Asia/Tokyo";
      const today = tripToday(tz);
      const tripDays = g.days.map((d: any) => String(d.date).slice(0, 10));
      const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));
      let dismissed = false;
      try { dismissed = localStorage.getItem(`wander:evening-question:${today}`) === "done"; } catch { /* storage off */ }
      const wroteToday = (savedCopy(tripId)?.notes || []).some((n) => n.mine && n.dayDate === today);
      // (not on the last day — that evening is the flight home; it asked above "Should be in the air"; tester k1)
      const lastDay = [...tripDays].sort().pop();
      setAsk(tripDays.includes(today) && today !== lastDay && hour >= 18 && !dismissed && !wroteToday ? today : null);
    }).catch(() => { /* no question without the trip */ });
    check();
    const every = setInterval(check, 5 * 60_000);
    return () => { alive = false; clearInterval(every); };
  }, [tripId]);

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
