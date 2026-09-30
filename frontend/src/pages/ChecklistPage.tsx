/**
 * A step-by-step checklist from another source (Sep 30 2026: the "Tix pick up — Shin-Osaka" tab of Ken's rail sheet),
 * every step in its order and in its words — the physical card, the 4-digit ID for each booking, six JR West pickups,
 * the separate SmartEX train. A tick beside each step is kept on this phone only (it never changes the sheet), so the
 * person at the machine can see what's left. Opens from the phone's saved copy when there's no signal.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Trip } from "../lib/types";
import { sourcesData, colOf, sourceWords, withTwelveHour, type OtherSource, type Checklist } from "../lib/sources";
import { checklistTitle } from "../components/RailSheet";
import GuideText from "../components/GuideText";

const tickKey = (sourceId: string, tab: string) => `wander:checklist-ticks:${sourceId}:${tab}`;

export default function ChecklistPage() {
  const navigate = useNavigate();
  const { sourceId = "", tab = "" } = useParams();
  const [state, setState] = useState<"loading" | "ready" | "missing" | "unreachable">("loading");
  const [found, setFound] = useState<{ s: OtherSource; c: Checklist; saved: string | null } | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [ticks, setTicks] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(tickKey(sourceId, tab)) || "{}"); } catch { return {}; }
  });

  useEffect(() => {
    let cancelled = false;
    const id = localStorage.getItem("wander:last-trip-id");
    (id ? Promise.resolve(id) : api.get<Trip>("/trips/active").then((t) => t?.id))
      .then((tripId) => {
        if (!tripId) throw new Error("no trip");
        return sourcesData(tripId);
      })
      .then((d) => {
        if (cancelled) return;
        const s = d.sources.find((x) => x.id === sourceId);
        const c = s?.checklists.find((x) => x.tab === tab);
        if (!s || !c) { setState("missing"); return; }
        setFound({ s, c, saved: d.fromSavedCopy ? d.savedAt || null : null });
        setState("ready");
      })
      .catch(() => { if (!cancelled) setState("unreachable"); });
    return () => { cancelled = true; };
  }, [sourceId, tab]);

  const toggle = (row: number) => {
    setTicks((t) => {
      const next = { ...t, [row]: !t[row] };
      try { localStorage.setItem(tickKey(sourceId, tab), JSON.stringify(next)); } catch { /* storage full */ }
      return next;
    });
  };

  const header = (
    <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))} className="min-h-[44px] pr-3 text-sm text-[#514636]">&larr; Back</button>
  );

  if (state !== "ready" || !found) {
    return (
      <div className="min-h-screen bg-[#faf8f5] pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {header}
          <p className="text-sm text-[#6b5d4a] mt-6">
            {state === "loading" ? "Opening the steps…"
              : state === "missing" ? "Wander doesn't have these steps any more — the sheet may have changed. Ask Scout, or open the sheet itself."
              : "Wander can't reach the trip right now, and this phone hasn't saved these steps yet. Try again when you have signal."}
          </p>
        </div>
      </div>
    );
  }

  const { s, c, saved } = found;
  // Its "Source" rows are the pages its steps come from — listed at the end, not as steps
  const allSteps = c.steps.filter((x) => !/^source$/i.test(colOf(x.cols, /^step$/)));
  // On its day (or after), the steps for before leaving home fold away so the station steps come first
  // (round r1: in the queue at 5:05 PM, Larisa's "2 — decision" step was two screens down, under them)
  const phoneDay = new Date().toLocaleDateString("en-CA");
  const before = allSteps.filter((x) => /^before travel/i.test(colOf(x.cols, /^step$/)));
  const foldBefore = !!c.date && phoneDay >= c.date && before.length > 0 && !showBefore;
  const steps = foldBefore ? allSteps.filter((x) => !before.includes(x)) : allSteps;
  const refs = c.steps.filter((x) => /^source$/i.test(colOf(x.cols, /^step$/)));
  const done = allSteps.filter((x) => ticks[x.row]).length;
  const read = s.readAt ? new Date(s.readAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-24">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {header}
        <h1 className="text-2xl font-light text-[#3a3128] mt-2">{checklistTitle(c.tab)}</h1>
        <p className="text-sm text-[#6b5d4a] mt-1">
          From {sourceWords(s)} — its “{c.tab}” tab, in its order and its words. Not Larisa's Guide.
          {read ? ` Wander last read it ${read}.` : ""}
          {s.lastError ? " Its latest read didn't work, so this may be out of date." : ""}
        </p>
        {saved && <p className="text-sm text-[#6b5d4a] bg-white/70 border border-[#e0d8cc] rounded-lg px-3 py-2 mt-3" role="status">No signal — showing what this phone saved.</p>}
        <p className="text-sm text-[#514636] mt-3">{done ? `${done} of ${allSteps.length} ticked on this phone.` : "Tick each step as you go. Ticks stay on this phone only."}</p>

        {/* Straight to any step — the decision about the 6:17 train can't wait behind the others */}
        {/* A scroll, not an address change: the app returned to the top on a #step address, and each jump added a
            Back stop (rail round) */}
        <nav aria-label="Steps" className="flex flex-wrap gap-2 mt-3">
          {steps.map((x, i) => {
            const label = colOf(x.cols, /^step$/);
            const twin = steps.filter((y) => colOf(y.cols, /^step$/) === label);
            return (
              <button key={x.row} onClick={() => document.getElementById(`step-${x.row}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-full border text-sm ${ticks[x.row] ? "border-[#cfe0c2] bg-[#f3f7ef] text-[#3f5a2a]" : "border-[#e0d8cc] bg-white text-[#514636]"}`}>
                {ticks[x.row] ? "✓ " : ""}{label}{twin.length > 1 ? ` (${twin.indexOf(x) + 1})` : ""}
                <span className="sr-only">{` — step ${i + 1} of ${steps.length}`}</span>
              </button>
            );
          })}
        </nav>
        {foldBefore && (
          <button onClick={() => setShowBefore(true)} className="block min-h-[44px] mt-2 text-sm text-[#514636] underline underline-offset-2">
            The {before.length === 1 ? "step" : `${before.length} steps`} for before you left home ›
          </button>
        )}

        <ol className="mt-3 space-y-3">
          {steps.map((x) => {
            const step = colOf(x.cols, /^step$/);
            const when = colOf(x.cols, /^when/);
            const what = colOf(x.cols, /^what to do$/);
            const ready = colOf(x.cols, /^have ready$/);
            const confirm = colOf(x.cols, /^confirm/);
            const on = !!ticks[x.row];
            return (
              <li key={x.row} id={`step-${x.row}`} className={`scroll-mt-4 rounded-xl border p-3 ${on ? "bg-[#f3f7ef] border-[#cfe0c2]" : "bg-white border-[#e0d8cc]"}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => toggle(x.row)} role="checkbox" aria-checked={on} aria-label={`${step}: ${on ? "ticked" : "not ticked"}`}
                    className={`shrink-0 w-11 h-11 rounded-full border-2 flex items-center justify-center text-lg ${on ? "border-[#3f5a2a] bg-[#3f5a2a] text-white" : "border-[#c8bba8] text-transparent"}`}>✓</button>
                  <div className="flex-1 min-w-0">
                    {/* (its "When / where" often repeats the step's name: "Before travel · Before travel; …") */}
                    <p className="text-[15px] font-medium text-[#3a3128]">{step}{when ? <span className="font-normal text-[#6b5d4a]"> · {withTwelveHour(when.replace(new RegExp(`^${step.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[;:,]?\\s*`, "i"), "") || when)}</span> : null}</p>
                    {/* Its numbered sub-steps ("1. … 2. …") each on their own line — same words, easier at a machine */}
                    {what && <GuideText text={withTwelveHour(what).replace(/\s+(?=\d{1,2}\.\s)/g, "\n")} className="text-sm text-[#3a3128] mt-1" />}
                    {ready && <GuideText text={`Have ready: ${withTwelveHour(ready)}`} className="text-sm text-[#514636] mt-1.5" />}
                    {confirm && <GuideText text={`Before you move on: ${withTwelveHour(confirm)}`} className="text-sm text-[#8a5a1a] mt-1.5" />}
                    <p className="text-xs text-[#6b5d4a] mt-1">{c.tab} tab, row {x.row}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {refs.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-1">Where these steps come from</h2>
            <ul className="space-y-1">
              {refs.map((x) => (
                <li key={x.row}><GuideText text={`${colOf(x.cols, /^when/)}: ${colOf(x.cols, /^what to do$/)}`} className="text-sm text-[#514636]" /></li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
