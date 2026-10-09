import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loadMaybeNews } from "../lib/maybesNews";

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
  {
    path: "__actions__",
    label: "Actions",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
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

  // While typing, the bar steps away; when the keyboard goes, it comes back and the page is nudged so iOS puts it at the
  // bottom again (Ken, Oct 9: after typing a note the bar floated mid-screen over his notes, the page showing below it)
  const [typing, setTyping] = useState(false);
  // …and wherever iOS leaves the page's own bottom, the bar sits at the bottom of what's on the screen (Ken, Oct 9, again
  // after the first fix: the bar still floated mid-screen over his notes, the page going on below it). iOS can keep the
  // page's fixed layer short after the keyboard; the visible part says where the screen really ends.
  const [drop, setDrop] = useState(0);
  const navRef = useRef<HTMLElement | null>(null);
  const dropRef = useRef(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // where the bar really is (less what it's been moved), against where the screen really ends
        const el = navRef.current;
        const rect = el?.getBoundingClientRect();
        // (hidden while typing: nothing to measure — it's placed again when it comes back)
        if (!el || !rect || rect.height === 0 || vv.scale > 1.01) { dropRef.current = 0; setDrop(0); return; }
        const bottom = rect.bottom - dropRef.current;
        const screenEnd = Math.max(vv.offsetTop + vv.height, window.innerHeight);
        // (only ever down to the screen's bottom — with the keyboard up the bar is away anyway)
        const gap = Math.round(screenEnd - bottom);
        const next = gap > 1 ? gap : 0;
        dropRef.current = next;
        setDrop(next);
      });
    };
    place();
    window.addEventListener("wander:place-nav", place);
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("orientationchange", place);
    document.addEventListener("visibilitychange", place);
    document.addEventListener("focusout", place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("wander:place-nav", place);
      vv.removeEventListener("resize", place);
      vv.removeEventListener("scroll", place);
      window.removeEventListener("scroll", place);
      window.removeEventListener("orientationchange", place);
      document.removeEventListener("visibilitychange", place);
      document.removeEventListener("focusout", place);
    };
  }, []);
  useEffect(() => {
    const editable = (el: Element | EventTarget | null) => el instanceof HTMLElement
      && el.matches("textarea, select, [contenteditable='true'], input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='range'])");
    const nudge = () => requestAnimationFrame(() => window.scrollTo(window.scrollX, window.scrollY));
    const onIn = (e: FocusEvent) => { if (editable(e.target)) setTyping(true); };
    const onOut = () => setTimeout(() => { if (!editable(document.activeElement)) { setTyping(false); nudge(); } }, 60);
    // (the keyboard closing without the box losing focus — "Done" on some keyboards)
    const vv = window.visualViewport;
    const onResize = () => { if (vv && vv.height > window.innerHeight * 0.85) nudge(); };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    vv?.addEventListener("resize", onResize);
    return () => { document.removeEventListener("focusin", onIn); document.removeEventListener("focusout", onOut); vv?.removeEventListener("resize", onResize); };
  }, []);
  // (back from typing: placed at once, and again once iOS has settled the screen)
  useEffect(() => {
    if (typing) return;
    window.dispatchEvent(new Event("wander:place-nav"));
    const later = setTimeout(() => window.dispatchEvent(new Event("wander:place-nav")), 400);
    return () => clearTimeout(later);
  }, [typing]);

  // Hide on login and join pages; everywhere else the same four tabs, always
  if (location.pathname === "/login" || location.pathname.startsWith("/join")) return null;

  return (
    <nav
      ref={navRef}
      className={`fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#e0d8cc] ${typing ? "hidden" : ""}`}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", transform: drop ? `translateY(${drop}px)` : undefined }}
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
            : location.pathname.startsWith(tab.path);

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
              {tab.icon}
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
      </div>
    </nav>
  );
}
