import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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
    label: "Ideas",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18h6" /><path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
      </svg>
    ),
  },
  {
    path: "/now",
    label: "Now",
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

  // Hide on login and join pages; everywhere else the same four tabs, always
  if (location.pathname === "/login" || location.pathname.startsWith("/join")) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#e0d8cc]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
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
