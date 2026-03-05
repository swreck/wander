import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Trip, Day, Experience } from "../lib/types";

export default function NowPage() {
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [today, setToday] = useState<Day | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const t = await api.get<Trip>("/trips/active");
      if (!t) { navigate("/"); return; }
      setTrip(t);

      const days = await api.get<Day[]>(`/days/trip/${t.id}`);
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const todayDay = days.find((d) => d.date.split("T")[0] === todayStr);
      setToday(todayDay || null);
      setLoading(false);
    }
    load();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#8a7a62] bg-[#faf8f5]">
        Loading...
      </div>
    );
  }

  if (!trip || !today) {
    return (
      <div className="min-h-screen bg-[#faf8f5] px-4 py-8">
        <button
          onClick={() => navigate("/plan")}
          className="text-sm text-[#8a7a62] hover:text-[#3a3128] mb-4"
        >
          &larr; Back to planning
        </button>
        <div className="text-center py-16">
          <h1 className="text-xl font-light text-[#3a3128] mb-2">No schedule for today</h1>
          <p className="text-sm text-[#8a7a62]">Today doesn't fall within your trip dates.</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const selectedExps = (today.experiences || [])
    .filter((e) => e.state === "selected")
    .sort((a, b) => a.priorityOrder - b.priorityOrder);
  const reservations = (today.reservations || [])
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
  const accommodations = today.accommodations || [];

  // Build timeline of anchors
  const anchors: { time: Date | null; name: string; type: string; detail?: string }[] = [];

  // Add hotel as first anchor
  if (accommodations.length > 0) {
    anchors.push({
      time: null,
      name: accommodations[0].name,
      type: "hotel",
      detail: accommodations[0].address || undefined,
    });
  }

  // Add experiences
  for (const exp of selectedExps) {
    anchors.push({
      time: exp.timeWindow ? parseTimeWindow(exp.timeWindow, today.date) : null,
      name: exp.name,
      type: "experience",
      detail: exp.timeWindow || undefined,
    });
  }

  // Add reservations
  for (const res of reservations) {
    anchors.push({
      time: new Date(res.datetime),
      name: res.name,
      type: "reservation",
      detail: `${new Date(res.datetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${res.notes ? ` — ${res.notes}` : ""}`,
    });
  }

  // Sort by time (nulls first)
  anchors.sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return -1;
    if (!b.time) return 1;
    return a.time.getTime() - b.time.getTime();
  });

  // Find next upcoming anchor
  const nextAnchor = anchors.find((a) => a.time && a.time > now);

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate("/plan")}
            className="text-sm text-[#8a7a62] hover:text-[#3a3128]"
          >
            &larr; Planning
          </button>
          <span className="text-xs text-[#c8bba8]">
            {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>
        </div>

        {/* Question 1: Where am I? */}
        <section className="mb-8">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">
            Today
          </h2>
          <h1 className="text-2xl font-light text-[#3a3128]">
            {new Date(today.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h1>
          <p className="text-sm text-[#8a7a62] mt-1">{today.city.name}</p>
          {accommodations.length > 0 && (
            <p className="text-sm text-[#6b5d4a] mt-0.5">{accommodations[0].name}</p>
          )}
        </section>

        {/* Question 2 & 3: What's next? When should I leave? */}
        {nextAnchor && (
          <section className="mb-8 p-4 bg-white rounded-xl border border-[#e0d8cc]">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">
              Next
            </h2>
            <div className="text-lg font-medium text-[#3a3128]">{nextAnchor.name}</div>
            {nextAnchor.detail && (
              <div className="text-sm text-[#8a7a62] mt-1">{nextAnchor.detail}</div>
            )}

            {/* Timer handoff */}
            {nextAnchor.time && (
              <div className="mt-4">
                {(() => {
                  const minsUntil = Math.round((nextAnchor.time.getTime() - now.getTime()) / 60000);
                  const timerMins = Math.max(1, minsUntil - 15); // subtract buffer
                  return (
                    <>
                      <div className="text-sm text-[#6b5d4a] mb-2">
                        {minsUntil > 0
                          ? `In ${minsUntil} minutes`
                          : "Starting now"}
                      </div>
                      {minsUntil > 5 && (
                        <a
                          href={`shortcuts://run-shortcut?name=Timer&input=${timerMins}`}
                          className="inline-block px-4 py-2 bg-[#514636] text-white rounded-lg text-sm
                                     font-medium hover:bg-[#3a3128] transition-colors"
                        >
                          Set a {timerMins} minute timer
                        </a>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </section>
        )}

        {/* Question 4: What matters right now? */}
        {reservations.filter((r) => {
          const resTime = new Date(r.datetime);
          const minsUntil = (resTime.getTime() - now.getTime()) / 60000;
          return minsUntil > 0 && minsUntil < 60;
        }).map((r) => (
          <div key={r.id} className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <div className="text-sm font-medium text-amber-800">
              {r.name} at {new Date(r.datetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </div>
            <div className="text-xs text-amber-700 mt-0.5">
              Reservation in {Math.round((new Date(r.datetime).getTime() - now.getTime()) / 60000)} minutes
            </div>
          </div>
        ))}

        {/* Full schedule */}
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-3">
            Today's Schedule
          </h2>
          <div className="space-y-4">
            {anchors.map((anchor, i) => {
              const isPast = anchor.time && anchor.time < now;
              const isNext = anchor === nextAnchor;
              return (
                <div
                  key={i}
                  className={`px-4 py-3 rounded-lg transition-colors ${
                    isNext
                      ? "bg-white border-2 border-[#514636]"
                      : isPast
                        ? "bg-[#f0ece5]/50 text-[#c8bba8]"
                        : "bg-white border border-[#f0ece5]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${isNext ? "text-[#3a3128]" : isPast ? "text-[#c8bba8]" : "text-[#3a3128]"}`}>
                      {anchor.name}
                    </span>
                    <span className={`text-xs capitalize ${isPast ? "text-[#c8bba8]" : "text-[#a89880]"}`}>
                      {anchor.type}
                    </span>
                  </div>
                  {anchor.detail && (
                    <div className={`text-xs mt-0.5 ${isPast ? "text-[#c8bba8]" : "text-[#8a7a62]"}`}>
                      {anchor.detail}
                    </div>
                  )}
                </div>
              );
            })}

            {anchors.length === 0 && (
              <div className="text-center py-8 text-sm text-[#c8bba8]">
                Nothing planned for today yet.
              </div>
            )}
          </div>
        </section>

        {/* Share plan */}
        <button
          onClick={() => sharePlan(today, selectedExps, reservations, accommodations)}
          className="mt-8 w-full py-3 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a]
                     hover:bg-[#f0ece5] transition-colors"
        >
          Share Today's Plan
        </button>
      </div>
    </div>
  );
}

function parseTimeWindow(tw: string, dayDate: string): Date | null {
  const day = new Date(dayDate);
  const lower = tw.toLowerCase();
  if (lower === "morning") { day.setHours(9, 0); return day; }
  if (lower === "afternoon") { day.setHours(14, 0); return day; }
  if (lower === "evening") { day.setHours(18, 0); return day; }

  // Try parsing "2:00 PM" style
  const match = tw.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (match) {
    let hours = parseInt(match[1]);
    const mins = match[2] ? parseInt(match[2]) : 0;
    const ampm = match[3]?.toLowerCase();
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
    day.setHours(hours, mins);
    return day;
  }

  return null;
}

function sharePlan(day: Day, exps: Experience[], reservations: any[], accommodations: any[]) {
  const date = new Date(day.date).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  let text = `📍 ${date}\n${day.city.name}\n`;

  if (accommodations.length > 0) {
    text += `\n🏨 ${accommodations[0].name}\n`;
  }

  if (exps.length > 0) {
    text += "\n";
    for (const exp of exps) {
      text += `• ${exp.name}`;
      if (exp.timeWindow) text += ` (${exp.timeWindow})`;
      text += "\n";
    }
  }

  if (reservations.length > 0) {
    text += "\n";
    for (const res of reservations) {
      const time = new Date(res.datetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      text += `🍽 ${res.name} at ${time}\n`;
    }
  }

  if (day.notes) {
    text += `\n📝 ${day.notes}\n`;
  }

  if (navigator.share) {
    navigator.share({ text });
  } else {
    navigator.clipboard.writeText(text);
  }
}
