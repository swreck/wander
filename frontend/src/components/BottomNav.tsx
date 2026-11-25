import { useState, useEffect, useRef, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loadMaybeNews } from "../lib/maybesNews";

/** The Maybes tab's "something new" dot — off while Maybes is a row on Home, not a tab (Oct 16) */
const MAYBES_DOT = false as boolean;
import { phoneReport } from "../lib/phoneReport";
import { screenShift } from "../lib/screenShift";
import PhraseCard from "./PhraseCard";
import ConvertCard from "./ConvertCard";
import { loadLedger, savedLedger, payNextOf, MONEY_CHANGED, type Ledger } from "../lib/expenses";
import PayNextBadge, { familyColor } from "./PayNextBadge";
import { BAR_ICON, BAR_LABEL, BAR_SLOT, barTone, barWeight } from "./barSlot";
import { api } from "../lib/api";
import { savedGuideData } from "../lib/guideData";
import { travelerToday } from "../lib/guideDisplay";
import { finishedLastDay } from "../lib/tripPhase";
import { zoneOfLastDay } from "../lib/dayZone";

/** The traveler's own today: Japan's date once they've landed, from the Guide this phone keeps (else Japan's date) */
function todayPath(): string {
  const japan = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  try {
    const tripId = localStorage.getItem("wander:last-trip-id");
    const g = tripId ? savedGuideData(tripId) : null;
    // After the trip's last day, Today opens that last day — it opened today's date, "This date isn't part of the
    // trip", a dead end (Ken, Nov 15: "I would like the old Japan to open, looking like it looked on the last day")
    const last = g ? finishedLastDay([...(g.days || []).map((x) => x.date), g.trip.endDate], zoneOfLastDay(g.days, g.trip.endDate, g.trip.timeZone || "Asia/Tokyo")) : null;
    if (last) return `/day/${last}`;
    // (the phone keeps the name as plain words. It was read as JSON here, which threw, so Today was always Japan's date:
    // from 10 PM in Hanoi that is tomorrow; Nov 22 2026)
    const me = localStorage.getItem("wander_user") || null;
    if (g) {
      const d = new Date();
      const phone = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const mine = travelerToday(g.items, me, g.trip.timeZone || "Asia/Tokyo", phone);
      // Before the trip's first day, Today opens that first day — it opened today's date, "This date isn't part of the
      // trip" on an empty page (Nov 22 2026: December, three weeks out)
      const first = [...(g.days || []).map((x) => x.date), g.trip.startDate].filter((x): x is string => !!x).map((x) => String(x).slice(0, 10)).sort()[0];
      return `/day/${first && mine < first ? first : mine}`;
    }
  } catch { /* nothing kept: Japan's date */ }
  return `/day/${japan}`;
}

interface Props {
  pendingChanges?: number;
  actionsNeedAttention?: boolean;
}

// The bar's icons, one family: 22 pt line glyphs, and a filled one for the tab that's selected (Apple's own rule for tab
// bars: a selected tab's symbol is filled). The filled glyph's inner lines are drawn in the selection pill's colour.
const PILL = "#ece4d6";
const line = (paths: ReactNode, mark?: Record<string, string>) => (
  <svg {...mark} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
);
const COIN_YEN = <path d="M8.5 7.5 12 12l3.5-4.5M12 12v5M9 13h6M9 15.5h6" />;
const COIN_DOLLAR = <path d="M12 6.5v11M14.8 9.3c-.4-.9-1.5-1.5-2.8-1.5-1.6 0-2.8.8-2.8 2 0 2.9 5.6 1.5 5.6 4.4 0 1.2-1.2 2-2.8 2-1.4 0-2.5-.6-2.9-1.6" />;
const coinFilled = (inner: ReactNode, mark?: Record<string, string>) => line(<><circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" /><g stroke={PILL}>{inner}</g></>, mark);

const tabs = [
  {
    path: "/",
    label: "Home",
    icon: line(<><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>),
    iconOn: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path fill="currentColor" d="M12 1.6c.3 0 .6.1.9.3l8.2 6.4c.4.3.6.7.6 1.2V20a2 2 0 0 1-2 2h-4.2a.5.5 0 0 1-.5-.5V15a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v6.5a.5.5 0 0 1-.5.5H4.3a2 2 0 0 1-2-2V9.5c0-.5.2-.9.6-1.2l8.2-6.4c.3-.2.6-.3.9-.3z" />
      </svg>
    ),
  },
  // Today's full day where Maybes was — Ken (Oct 16): "Replace 'maybes' with 'full itinerary for today'". "Today" fits the
  // bar; it opens the traveler's own today (Japan's date once landed). Maybes moved to a row on Home.
  {
    path: "__today__",
    label: "Today",
    icon: line(<><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /><path d="M7.5 13.5h4M7.5 17h7" /></>),
    iconOn: line(<><rect x="2.5" y="4" width="19" height="17.5" rx="2.5" fill="currentColor" stroke="none" /><path d="M8 2.5v4M16 2.5v4" /><path d="M2.5 9.5h19M7.5 13.5h4M7.5 17h7" stroke={PILL} /></>),
  },
  {
    path: "/now",
    // "Next" (Oct 2, Ken): the question this tab answers — what's next, when, and how to get there
    label: "Next",
    icon: line(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>),
    iconOn: line(<><circle cx="12" cy="12" r="10.5" fill="currentColor" stroke="none" /><polyline points="12 6 12 12 16 14" stroke={PILL} strokeWidth="2" /></>),
  },
  // Trip notes (Oct 1 2026): always one tap away, whatever the screen
  {
    path: "/notes",
    label: "Notes",
    icon: line(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>),
    iconOn: line(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" fill="currentColor" /></>),
  },
  // Scout between Notes and Budget (Ken's order, Nov 25 2026): on a small capsule of the bar's darkest ink, the one
  // filled-colour item in the bar, so the way to ask is found at a glance. Ink, never a bright colour: Budget's badge
  // beside it wears a family's colour, and two coloured discs side by side would read as two badges.
  {
    path: "__scout__",
    label: "Scout",
    icon: (
      <span className="w-9 h-[26px] rounded-[13px] bg-[#3a3128] text-white flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path fill="currentColor" d="M5.5 3h13A2.5 2.5 0 0 1 21 5.5v9a2.5 2.5 0 0 1-2.5 2.5H8.2l-4.4 3.8A.5.5 0 0 1 3 20.4V5.5A2.5 2.5 0 0 1 5.5 3z" />
        </svg>
      </span>
    ),
    iconOn: null,
  },
  // Budget where Actions was — Ken (Oct 15): "There seems to be no need for the [Actions] button in the main navigation
  // menu, so you can replace that with budget" (the to-dos open from Home's "To-dos and deadlines" line)
  {
    path: "/money",
    label: "Budget",
    icon: line(<><circle cx="12" cy="12" r="9" />{COIN_YEN}</>),
    iconOn: coinFilled(COIN_YEN),
  },
];

/** Budget's coin on a trip whose payers are families, which counts in dollars: the same coin with "$" for "¥" */
const DOLLAR_ICON = line(<><circle cx="12" cy="12" r="9" />{COIN_DOLLAR}</>, { "data-dollar-coin": "" });
const DOLLAR_ICON_ON = coinFilled(COIN_DOLLAR, { "data-dollar-coin": "" });
// What Budget's tab shows, from one copy of the ledger: who pays next, and whether the trip counts in dollars (a trip whose
// payers are families). Held together, so the ledger's answer redraws the tab even when no one pays next yet (Nov 24)
type Bar = { next: { party: string; index: number } | null; dollars: boolean };
const barOf = (l: Ledger | null): Bar => ({ next: payNextOf(l), dollars: !!l?.family });
const sameBar = (a: Bar, b: Bar) => a.dollars === b.dollars && a.next?.party === b.next?.party && a.next?.index === b.next?.index;

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
  // (a couple, or on a trip whose payers are families, a family with its place among them, for its colour)
  const [bar, setBar] = useState<Bar>(() => { const t = tripIdNow(); return barOf(t ? savedLedger(t) : null); });
  const showBar = (b: Bar) => setBar((was) => (sameBar(was, b) ? was : b));
  // (the trip the badge is showing for)
  const payNextFor = useRef<string | null>(tripIdNow());
  useEffect(() => {
    let live = true;
    // (the trip from the phone's note of it, else asked — on a phone just signed in there's no note yet, and production
    // showed the plain coin while Julie & Andy paid next; Oct 16)
    const get = async () => {
      let t = tripIdNow();
      if (!t && localStorage.getItem("wander_token")) { try { t = (await api.get<{ id?: string } | null>("/trips/active"))?.id || null; } catch { t = null; } }
      if (!t || !live) return;
      const asked = t;
      // Another trip than the badge shows for: the phone's copy of the new one at once, never the old trip's couple
      // while the answer is on its way
      if (payNextFor.current !== asked) { payNextFor.current = asked; showBar(barOf(savedLedger(asked))); }
      // (an answer about a trip that's no longer the open one changes nothing: on a weak signal Japan's came back after
      // December's, and December's bar said "KL" until Budget was opened; Nov 22 2026)
      loadLedger(asked).then((l) => { if (live && l && payNextFor.current === asked && (tripIdNow() || asked) === asked) showBar(barOf(l)); });
    };
    get();
    const onShow = () => { if (document.visibilityState === "visible") get(); };
    window.addEventListener(MONEY_CHANGED, get);
    document.addEventListener("visibilitychange", onShow);
    return () => { live = false; window.removeEventListener(MONEY_CHANGED, get); document.removeEventListener("visibilitychange", onShow); };
  // (and on each new screen: cheap, and it catches a sign-in that happened since)
  }, [location.pathname]);
  // Budget counts in dollars on a trip whose payers are families: its coin says "$" (Japan's ledger has no families, so its
  // "¥" never changes)
  const payNext = bar.next, dollarTrip = bar.dollars;
  // Something new on Maybes from someone else since you last looked — a dot, never an alert
  const [maybesNew, setMaybesNew] = useState(false);

  useEffect(() => {
    // (the dot is off since Maybes left the bar, Oct 16 — so its check asks nothing: every open screen asked every three
    // minutes, which kept the database awake; Home's Maybes line asks for itself. Kept, for when the dot comes back —
    // cost audit, Oct 16)
    if (!MAYBES_DOT) return;
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
      {/* Ken's order (Nov 25 2026): Home, Today, Next, Notes, Scout, Budget, Convert, Phrases. Every item an equal slot
          (barSlot.ts), so a trip without Convert or Phrases has fewer, wider ones */}
      <div className="flex items-center h-14 max-w-lg mx-auto px-1">
        {tabs.map((tab) => {
          const isActive = tab.path === "__scout__"
            ? scoutOpen
            : scoutOpen
            ? false
            : tab.path === "__actions__"
            ? actionsOpen
            : tab.path === "/"
            ? location.pathname === "/" && !actionsOpen
            : tab.path === "__today__"
            ? location.pathname === todayPath()
            // (the tab's own screen or one under it — "/ideas-for-wander" isn't Maybes' "/ideas"; verify62)
            : location.pathname === tab.path || location.pathname.startsWith(`${tab.path}/`);

          return (
            <button
              key={tab.path}
              data-tour={tab.label}
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                if (tab.path === "__today__") {
                  navigate(todayPath());
                } else if (tab.path === "__scout__") {
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
              // Equal slots share the width — at Safari's larger zoom, 64-point tabs pushed "Scout" off a small phone
              className={`${BAR_SLOT} ${barTone(isActive)} ${tab.path === "__actions__" && actionsNeedAttention ? "text-amber-600" : ""}`}
            >
              <span className={BAR_ICON}>
                {tab.path === "/money" && payNext ? (
                  <span aria-label={`${payNext.party} pay next`} className="inline-flex"><PayNextBadge party={payNext.party} color={payNext.index >= 0 ? familyColor(payNext.index) : undefined} /></span>
                ) : tab.path === "/money" && dollarTrip ? (isActive ? DOLLAR_ICON_ON : DOLLAR_ICON) : isActive && tab.iconOn ? tab.iconOn : tab.icon}
              </span>
              {/* (Scout's word is always the darker, heavier one, with its ink capsule) */}
              <span className={`${BAR_LABEL} ${tab.path === "__scout__" ? "font-semibold text-[#3a3128]" : barWeight(isActive)}`}>{tab.label}</span>
              {/* Badge dot for pending sync changes on Home */}
              {tab.path === "/" && pendingChanges && pendingChanges > 0 ? (
                <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-500" />
              ) : null}
              {/* Something new on Maybes (not while you're looking at it) */}
              {MAYBES_DOT && maybesNew && !isActive ? (
                <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-500" aria-label="Something new" />
              ) : null}
              {/* Glow dot for Actions needing attention */}
              {tab.path === "__actions__" && actionsNeedAttention ? (
                <span className="absolute top-1 right-2 w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              ) : null}
            </button>
          );
        })}
        {/* Convert, while the trip is under way or still to come (nothing once it's over) */}
        <ConvertCard />
        {/* The phrases at the bar's end on every screen (Ken, Oct 13: "a clear convenient but subtle way to have phrase
            button always available"); its room kept while the trip is read */}
        <PhraseCard mode="bar" />
      </div>
    </nav>
  );
}
