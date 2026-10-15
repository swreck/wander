import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loadMaybeNews } from "../lib/maybesNews";
import { phoneReport } from "../lib/phoneReport";
import { screenShift } from "../lib/screenShift";
import PhraseCard from "./PhraseCard";
import { loadLedger, savedLedger, initialsOf, MONEY_CHANGED } from "../lib/expenses";

interface Props {
  pendingChanges?: number;
  actionsNeedAttention?: boolean;
}

const tabs = [
  {
    path: "/",
    label: "Home",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    path: "/ideas",
    // "Maybes" (Oct 2 2026, Ken: "a shared list of maybes") — her ideas and the group's own "maybe we should…"
    label: "Maybes",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18h6" /><path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
      </svg>
    ),
  },
  {
    path: "/now",
    // "Next" (Oct 2, Ken): the question this tab answers — what's next, when, and how to get there
    label: "Next",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  // Trip notes (Oct 1 2026): always one tap away, whatever the screen
  {
    path: "/notes",
    label: "Notes",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
      </svg>
    ),
  },
  // Budget where Actions was — Ken (Oct 15): "There seems to be no need for the [Actions] button in the main navigation
  // menu, so you can replace that with budget" (the to-dos open from Home's "To-dos and deadlines" line)
  {
    path: "/money",
    label: "Budget",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M8.5 7.5 12 12l3.5-4.5M12 12v5M9 13h6M9 15.5h6" />
      </svg>
    ),
  },
  {
    path: "__scout__",
    label: "Scout",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

export default function BottomNav({ pendingChanges }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [actionsNeedAttention, setActionsNeedAttention] = useState(false);
  // Home tells us when its Actions panel is open, so the right tab is highlighted
  const [actionsOpen, setActionsOpen] = useState(false);
  const [scoutOpen, setScoutOpen] = useState(false);
  // Who pays next, for Budget's icon: "AJ" in orange or "KL" in purple — "so it can be done in a glance or tapped to see
  // the total" (Ken, Oct 15). From the phone's copy first; again when money changes or Wander comes back to the front.
  const tripIdNow = () => { try { return localStorage.getItem("wander:last-trip-id"); } catch { return null; } };
  const [payNext, setPayNext] = useState<string | null>(() => { const t = tripIdNow(); return t ? savedLedger(t)?.next || null : null; });
  useEffect(() => {
    let live = true;
    const get = () => { const t = tripIdNow(); if (t) loadLedger(t).then((l) => { if (live && l) setPayNext(l.next || null); }); };
    get();
    const onShow = () => { if (document.visibilityState === "visible") get(); };
    window.addEventListener(MONEY_CHANGED, get);
    document.addEventListener("visibilitychange", onShow);
    return () => { live = false; window.removeEventListener(MONEY_CHANGED, get); document.removeEventListener("visibilitychange", onShow); };
  }, []);
  // Something new on Maybes from someone else since you last looked — a dot, never an alert
  const [maybesNew, setMaybesNew] = useState(false);

  useEffect(() => {
    let alive = true;
    const look = () => {
      const tripId = localStorage.getItem("wander:last-trip-id");
      const me = localStorage.getItem("wander_user");
      // (only when signed in: a refused request signs the phone out, and this quiet check must never be the cause)
      if (!tripId || !me || !localStorage.getItem("wander_token") || document.visibilityState === "hidden") return;
      loadMaybeNews(tripId, me).then((n) => { if (alive) setMaybesNew(n.items.length > 0); }).catch(() => { /* no signal: leave it */ });
    };
    look();
    const told = (e: Event) => setMaybesNew(((e as CustomEvent).detail?.count || 0) > 0);
    window.addEventListener("wander:maybes-news", told);
    const onShow = () => { if (document.visibilityState === "visible") look(); };
    const every = setInterval(look, 3 * 60_000);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", look);
    window.addEventListener("wander:maybes-changed", look);
    window.addEventListener("wander:data-changed", look);
    return () => {
      alive = false; clearInterval(every);
      window.removeEventListener("wander:maybes-news", told);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", look);
      window.removeEventListener("wander:maybes-changed", look);
      window.removeEventListener("wander:data-changed", look);
    };
  // (and on every screen change: on a first sign-in the trip isn't known yet when the bar first looks — Ken's dot
  // didn't show until Wander was opened again)
  }, [location.pathname]);

  useEffect(() => {
    const onPanel = (e: Event) => setActionsOpen(!!(e as CustomEvent).detail?.open);
    const onChat = (e: Event) => setScoutOpen(!!(e as CustomEvent).detail?.open);
    window.addEventListener("wander:actions-panel", onPanel);
    window.addEventListener("wander:chat-panel", onChat);
    return () => { window.removeEventListener("wander:actions-panel", onPanel); window.removeEventListener("wander:chat-panel", onChat); };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      setActionsNeedAttention((e as CustomEvent).detail?.needsAttention || false);
    };
    window.addEventListener("wander:actions-attention", handler);
    // Check initial value from window (set before this component mounts)
    if ((window as any).__actionsNeedAttention) setActionsNeedAttention(true);
    return () => window.removeEventListener("wander:actions-attention", handler);
  }, []);

  // The bar floated mid-screen (Ken's iPhone, iOS 27, Oct 11 8:43 AM Japan, 33 min after typing a note): a Home Screen
  // app's iOS keeps the page's screen keyboard-short after the keyboard has been up, until the app is force-quit, and
  // "bottom: 0" sits on that false bottom (his screenshot: 244 pt short of 874). Two steps, only in that state — an
  // iPhone Home Screen app, upright, no box being typed in, the page's height well short of the phone's: first ask iOS
  // to measure the page again (the page's scroll put back); if it's still short, the bar places itself from the top by
  // the phone's own height. Everywhere else it's exactly as before. Nothing here reads or changes what Scout's panel
  // uses (Oct 9: a page-wide bar change broke Scout).
  const navRef = useRef<HTMLElement>(null);
  const [placedAt, setPlacedAt] = useState<number | null>(null);
  useEffect(() => {
    if ((navigator as any).standalone !== true) return;
    let healedAt = 0;
    // (what it did, told to Wander's server — the only way to know the fix acted on a real phone: phoneReport)
    let healedShort = 0, placedFor = 0;
    // (the screen by its first part only — "/day", never a date or a name)
    const tell = (result: string, short: number) => phoneReport("tabbar", { result, short, page: window.innerHeight, phone: screen.height, at: `/${location.pathname.split("/")[1] || ""}` });
    let wait: ReturnType<typeof setTimeout> | undefined;
    const typing = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
    };
    const heal = () => {
      const root = document.getElementById("root");
      if (!root) return;
      const y = window.scrollY;
      root.style.display = "none";
      void root.offsetHeight;
      root.style.display = "";
      void root.offsetHeight;
      window.scrollTo(0, y);
    };
    // Placed from the top by the phone's own screen height, always, on an upright iPhone Home Screen app (Ken, Oct 13
    // 10:53: the bar and Scout's slim bar mid-screen after typing, while iOS reported the page its full height — the
    // screen's top stayed right, its bottom came up short, and "bottom: 0" sat on that false bottom). Normally the very
    // same place; Scout's slim bar is told where, to sit right above it.
    const place = (top: number | null) => {
      setPlacedAt(top);
      (window as any).__wanderNavTop = top;
      window.dispatchEvent(new CustomEvent("wander:nav-top", { detail: { top } }));
    };
    // (plus how far iOS has left the screen moved down the page — Ken's Home, Oct 13 11:29: the bar at 595 of 874, placed
    // right for an unmoved screen; lib/screenShift. 0 normally. Told once a minute at most, to see it act on his phone.)
    let toldShift = 0;
    const byScreen = () => {
      const shift = screenShift();
      if (shift && Date.now() - toldShift > 60000) { toldShift = Date.now(); tell("placed-for-moved-screen", shift); }
      return screen.height - (navRef.current?.offsetHeight || 90) + shift;
    };
    const check = () => {
      // (an iPad, or a phone on its side: as before)
      if (screen.width >= 700 || window.innerWidth !== screen.width) { place(null); return; }
      // (the keyboard really is up: leave the bar where it is until typing ends)
      if (typing()) return;
      const short = screen.height - window.innerHeight;
      if (short < 40) {
        if (healedShort) { tell("measured-again-fixed-it", healedShort); healedShort = 0; }
        place(byScreen()); healedAt = 0; placedFor = 0; return;
      }
      if (healedAt !== window.innerHeight) {
        healedAt = window.innerHeight;
        healedShort = short;
        heal();
        clearTimeout(wait);
        wait = setTimeout(check, 250);
        return;
      }
      if (placedFor !== window.innerHeight) { placedFor = window.innerHeight; healedShort = 0; tell("bar-placed-at-real-bottom", short); }
      place(byScreen());
    };
    const soon = () => { clearTimeout(wait); wait = setTimeout(check, 350); };
    const onShow = () => { if (document.visibilityState === "visible") soon(); };
    check();
    window.addEventListener("resize", soon);
    window.addEventListener("focusout", soon);
    window.addEventListener("pageshow", soon);
    window.addEventListener("orientationchange", soon);
    // (and when they scroll, which anyone does on seeing it: Ken's day page, Oct 12 8:50 PM Japan — the bar mid-screen and
    // no report at all, so iOS had shrunk the page without any of the events above; once scrolling stops, checked again)
    window.addEventListener("scroll", soon, { passive: true });
    document.addEventListener("visibilitychange", onShow);
    // (the screen moved down the page, or back: placed again on the next frame, not after a pause)
    let frame = 0;
    const onView = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(check); };
    window.visualViewport?.addEventListener("scroll", onView);
    window.visualViewport?.addEventListener("resize", onView);
    return () => {
      cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener("scroll", onView);
      window.visualViewport?.removeEventListener("resize", onView);
      clearTimeout(wait);
      window.removeEventListener("scroll", soon);
      window.removeEventListener("resize", soon);
      window.removeEventListener("focusout", soon);
      window.removeEventListener("pageshow", soon);
      window.removeEventListener("orientationchange", soon);
      document.removeEventListener("visibilitychange", onShow);
    };
  // (and on every screen change — Ken's was on Next, after a note typed on Notes)
  }, [location.pathname]);

  // Hide on login and join pages; everywhere else the same four tabs, always
  if (location.pathname === "/login" || location.pathname.startsWith("/join")) return null;

  return (
    <nav
      ref={navRef}
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#e0d8cc]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", ...(placedAt != null ? { top: placedAt, bottom: "auto" } : {}) }}
    >
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = tab.path === "__scout__"
            ? scoutOpen
            : scoutOpen
            ? false
            : tab.path === "__actions__"
            ? actionsOpen
            : tab.path === "/"
            ? location.pathname === "/" && !actionsOpen
            // (the tab's own screen or one under it — "/ideas-for-wander" isn't Maybes' "/ideas"; verify62)
            : location.pathname === tab.path || location.pathname.startsWith(`${tab.path}/`);

          return (
            <button
              key={tab.path}
              data-tour={tab.label}
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                if (tab.path === "__scout__") {
                  window.dispatchEvent(new CustomEvent("wander-open-chat", { detail: {} }));
                } else if (tab.path === "__actions__") {
                  // Actions opens over Home — from any screen, go Home and open it there
                  if (location.pathname === "/") window.dispatchEvent(new Event("wander-open-actions"));
                  else navigate("/", { state: { openActions: true } });
                } else if (tab.path === "/" && location.pathname === "/") {
                  // Already Home: the tab still does something — it closes Actions (or Scout) over it
                  window.dispatchEvent(new Event("wander-close-actions"));
                  window.dispatchEvent(new Event("wander-close-chat"));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                } else {
                  navigate(tab.path);
                }
              }}
              // The five tabs share the width — at Safari's larger zoom, 64-point tabs pushed "Scout" off a small phone
              className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 min-h-[48px] px-1 py-1 rounded-lg transition-colors relative ${tab.path === "__actions__" && actionsNeedAttention ? "text-amber-600" : ""}
                ${isActive ? "text-[#514636]" : "text-[#7a6b55] hover:text-[#6b5d4a]"}`}
            >
              {tab.path === "/money" && payNext ? (() => {
                const who = initialsOf(payNext);
                const color = who === "KL" ? "#6b46c1" : who === "AJ" ? "#e07020" : "#7a6b55";
                return (
                  <span aria-label={`${payNext} pay next`} className="inline-flex items-center justify-center h-[20px] min-w-[26px] px-1 rounded-full text-[10.5px] font-semibold tracking-[.04em] text-white"
                    style={{ background: color }}>{who}</span>
                );
              })() : tab.icon}
              <span className="text-xs leading-tight font-medium">{tab.label}</span>
              {/* Badge dot for pending sync changes on Home */}
              {tab.path === "/" && pendingChanges && pendingChanges > 0 ? (
                <span className="absolute top-0 right-1 w-2 h-2 rounded-full bg-amber-500" />
              ) : null}
              {/* Something new on Maybes (not while you're looking at it) */}
              {tab.path === "/ideas" && maybesNew && !isActive ? (
                <span className="absolute top-0 right-1 w-2 h-2 rounded-full bg-amber-500" aria-label="Something new" />
              ) : null}
              {/* Glow dot for Actions needing attention */}
              {tab.path === "__actions__" && actionsNeedAttention ? (
                <span className="absolute top-0 right-1 w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              ) : null}
            </button>
          );
        })}
        {/* The phrases, a small 日 at the bar's end on every screen (Ken, Oct 13: "a clear convenient but subtle way to
            have phrase button always available"); nothing on a trip without phrases */}
        <PhraseCard mode="bar" />
      </div>
    </nav>
  );
}
