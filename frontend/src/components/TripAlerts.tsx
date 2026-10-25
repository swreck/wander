/**
 * "Let everyone know" (Oct 18 2026). Ken: "Alert on next login function from anyone using anything to scout like 'let
 * everyone know' with 'got it' and 'remind me' as options. This is for logistics not general messaging."
 *
 * Someone tells Scout (tell_everyone); each other member sees it here the next time they open Wander — on whatever screen
 * opens — just above the bottom bar, one at a time, oldest first, until they tap Got it. Remind me brings it back the
 * next day (the server keeps who tapped what: backend services/tripAlerts.ts). It waits while Scout's panel is up, and is
 * never on the sign-in screens. Looked for whenever Wander is on the screen again, however briefly it was away (Ken, Oct
 * 18: "just being the next time wander is active, whether they've been away or reopening it, because it's a
 * notification. It's quick and timeliness is usually useful"); no timer while it's open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { takeVisitAsk } from "../lib/visitAsks";
import { MONEY_CHANGED } from "../lib/expenses";
import { reportNudgeState } from "../lib/buzz";
import { PaperViewer } from "./Papers";

// (a paper shared with everyone — Ken, Oct 25: "alert each person on next login that the doc is available with a small
// picture that can expand")
type SharedPaper = { id: string; title: string; summary: string; dayDate: string | null; authorName: string; pdf: boolean; url: string; smallUrl: string | null };
type Alert = { id: string; tripId: string; from: string; text: string; at: string; toYou?: boolean; paper?: SharedPaper };
const scoutUp = () => !!document.querySelector('[role="dialog"][aria-label="Scout"], [role="region"][aria-label="Scout"]');
const when = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString("en-US", { ...(sameDay ? {} : { weekday: "short" }), hour: "numeric", minute: "2-digit" });
};

export default function TripAlerts() {
  const { user } = useAuth();
  const location = useLocation();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<SharedPaper | null>(null);

  const look = useCallback(() => {
    if (!user || navigator.onLine === false) return;
    api.get<{ alerts: Alert[] }>("/alerts/pending").then((r) => {
      const list = Array.isArray(r?.alerts) ? r.alerts : [];
      setAlerts(list);
      // (a message from the group comes before Wander's own offers on this visit)
      if (list.length) takeVisitAsk("alert");
    }).catch(() => { /* next opening */ });
  }, [user]);

  // whenever Wander is on the screen again (no timer while it's open: among friends, the next look is soon enough) — and
  // right after a payment is kept, here or through Scout: a one-time note from Scout can follow it (Ken, Oct 23: "When
  // andy adds his next item to the budget, after it is done, send this message in a panel")
  // (and, once a day, whether this phone can get the 9 PM question — lib/buzz)
  useEffect(() => { if (user) reportNudgeState(); }, [user]);
  useEffect(() => {
    look();
    const seen = () => { if (document.visibilityState === "visible") look(); };
    const money = () => setTimeout(look, 600);
    document.addEventListener("visibilitychange", seen);
    window.addEventListener(MONEY_CHANGED, money);
    return () => { document.removeEventListener("visibilitychange", seen); window.removeEventListener(MONEY_CHANGED, money); };
  }, [look]);

  // (Scout's panel up: the card waits, so it never covers Scout's box)
  useEffect(() => {
    if (!alerts.length) return;
    const t = setInterval(() => setHidden(scoutUp()), 700);
    setHidden(scoutUp());
    return () => clearInterval(t);
  }, [alerts.length]);

  // How long a note from Scout to them is on their screen — only while it's drawn and Wander is in front — and that it's
  // there, for Ken (Oct 23: "Tell me in an alert when you give andy the message and give me the seconds it is open if
  // possible to know if he reads it")
  const a = alerts[0];
  const [front, setFront] = useState(() => document.visibilityState === "visible");
  useEffect(() => { const f = () => setFront(document.visibilityState === "visible"); document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f); }, []);
  const openMs = useRef<Record<string, number>>({});
  const since = useRef<{ id: string; at: number } | null>(null);
  const shownSaid = useRef(new Set<string>());
  const onScreen = !!a?.toYou && !hidden && front && !!user;
  useEffect(() => {
    if (!onScreen || !a) return;
    since.current = { id: a.id, at: Date.now() };
    if (!shownSaid.current.has(a.id)) { shownSaid.current.add(a.id); api.post(`/alerts/${a.id}/shown`, {}).catch(() => { /* Ken hears when it's answered */ }); }
    const id = a.id;
    return () => { if (since.current?.id === id) { openMs.current[id] = (openMs.current[id] || 0) + Date.now() - since.current.at; since.current = null; } };
  }, [onScreen, a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (a: Alert, state: "got" | "later", button?: "tell") => {
    setBusy(true);
    const live = since.current?.id === a.id ? Date.now() - since.current.at : 0;
    const openSeconds = a.toYou ? Math.round(((openMs.current[a.id] || 0) + live) / 1000) : undefined;
    api.post(`/alerts/${a.id}/seen`, { state, ...(openSeconds !== undefined ? { openSeconds } : {}), ...(button ? { button } : {}) }).catch(() => { /* not saved: it shows again at the next opening */ })
      .finally(() => { setBusy(false); setAlerts((prev) => prev.filter((x) => x.id !== a.id)); });
  };

  if (!a || hidden || !user || location.pathname === "/login" || location.pathname.startsWith("/join")) return null;
  const btn = "min-h-[44px] px-4 rounded-xl text-[15px] disabled:opacity-60";
  return (
    <div className="fixed inset-x-0 z-[56] flex justify-center px-3 pointer-events-none" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)" }}>
      <section role="alertdialog" aria-label={`From ${a.from}`} data-trip-alert
        className="pointer-events-auto w-full max-w-md rounded-2xl bg-[#3a3128] text-white shadow-xl p-4">
        <p className="text-xs uppercase tracking-wide text-white/70">
          {a.toYou ? `From ${a.from}` : `From ${a.from}, for everyone`} · {when(a.at)}{alerts.length > 1 ? ` · 1 of ${alerts.length}` : ""}
        </p>
        {a.paper ? (
          <button onClick={() => setViewing(a.paper!)} className="mt-2 w-full flex gap-3 text-left" aria-label={`See ${a.paper.title} full size`}>
            <span className="relative shrink-0 w-16 h-20 rounded-lg overflow-hidden bg-white/15 flex items-center justify-center">
              {a.paper.pdf
                ? <span className="text-[12px] font-medium">PDF</span>
                : <img src={a.paper.smallUrl || a.paper.url} alt="" className="w-full h-full object-cover" />}
              <span aria-hidden className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-black/55 text-[11px] leading-5 text-center">⤢</span>
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] text-white/85">Shared a paper</span>
              <span className="block text-[16px] font-medium leading-snug [overflow-wrap:anywhere]">{a.paper.title}</span>
              <span className="block text-[13px] text-white/70 mt-0.5 underline underline-offset-2">Tap to see it full size</span>
            </span>
          </button>
        ) : (
          <p className="text-[16px] leading-snug mt-1.5 whitespace-pre-line [overflow-wrap:anywhere] max-h-[40vh] overflow-y-auto">{a.text}</p>
        )}
        <div className="flex gap-2 mt-3">
          <button disabled={busy} onClick={() => answer(a, "got")} className={`${btn} bg-white text-[#3a3128] font-medium`}>Got it</button>
          {/* (a note from Scout to them: its other answer is to tell Scout — the note's own offer) */}
          {a.toYou
            ? <button disabled={busy} onClick={() => { answer(a, "got", "tell"); window.dispatchEvent(new CustomEvent("wander-open-chat")); }} className={`${btn} text-white/85`}>Tell Scout</button>
            : <button disabled={busy} onClick={() => answer(a, "later")} className={`${btn} text-white/85`}>Remind me</button>}
        </div>
      </section>
      {/* (it stays in Notes and on its day's page for them afterwards, like any paper they can see) */}
      {viewing && <PaperViewer partner={null} onClose={() => setViewing(null)}
        paper={{ ...viewing, town: null, mine: false, createdAt: a.at, share: "group" }} />}
    </div>
  );
}
