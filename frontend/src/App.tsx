import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import TripOverview from "./pages/TripOverview";
import IdeasPage from "./pages/IdeasPage";

function PlanToIdeas() {
  const { search } = useLocation();
  const city = new URLSearchParams(search).get("city");
  return <Navigate to={city ? `/ideas?city=${encodeURIComponent(city)}` : "/ideas"} replace />;
}
import DayPage from "./pages/DayPage";
import PeoplePage from "./pages/PeoplePage";
import HistoryPage from "./pages/HistoryPage";
import ChecklistPage from "./pages/ChecklistPage";
import CaptureSharePage from "./pages/CaptureSharePage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import GuidePage from "./pages/GuidePage";
import NotesPage from "./pages/NotesPage";
import WholeTripPage from "./pages/WholeTripPage";
import JoinPage from "./pages/JoinPage";
import CityBoard from "./pages/CityBoard";
import TripStoryPage from "./pages/TripStoryPage";
import ChatBubble from "./components/ChatBubble";
import InterestOverlay from "./components/InterestOverlay";
import { ToastProvider } from "./contexts/ToastContext";
import { useToast } from "./contexts/ToastContext";
import { CaptureProvider } from "./contexts/CaptureContext";
import CaptureToast from "./components/CaptureToast";
import CaptureFAB from "./components/CaptureFAB";
import SyncIndicator from "./components/SyncIndicator";
import SavedCopyNotice from "./components/SavedCopyNotice";
import BottomNav from "./components/BottomNav";
import ShowMeAround from "./components/ShowMeAround";
import UpdatePrompt from "./components/UpdatePrompt";
import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import { api } from "./lib/api";
import { notePath } from "./lib/cameFrom";

function ShortcutHelp() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener("wander:show-shortcuts", handler);
    return () => window.removeEventListener("wander:show-shortcuts", handler);
  }, []);

  if (!show) return null;

  const shortcuts = [
    ["1 or g h", "Trip Overview"],
    ["2 or g p", "Plan page"],
    ["3 or g n", "Next"],
    ["4 or g l", "History"],
    ["c", "Toggle capture (Plan)"],
    ["i", "Toggle import (Plan)"],
    ["m", "Toggle map/list (Plan, mobile)"],
    ["Esc", "Close panel"],
    ["?", "This help"],
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30" onClick={() => setShow(false)}>
      <div className="bg-white rounded-xl shadow-xl max-w-xs w-full mx-4 p-5 border border-[#e0d8cc]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-medium text-[#3a3128] mb-3">Keyboard Shortcuts</h3>
        <div className="space-y-1.5">
          {shortcuts.map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="text-[#6b5d4a]">{desc}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[#f0ece5] text-[#3a3128] font-mono text-xs border border-[#e0d8cc]">{key}</kbd>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShow(false)}
          className="mt-4 w-full py-2 rounded-lg bg-[#f0ece5] text-xs text-[#6b5d4a] hover:bg-[#e0d8cc] transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Wander] Render crash:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#faf8f5] p-8">
          <div className="max-w-md text-center">
            <h1 className="text-lg font-medium text-[#3a3128] mb-2">Hmm, something broke</h1>
            <p className="text-sm text-[#6b5d4a] mb-4">{this.state.error.message}</p>
            <pre className="text-xs text-left bg-[#f0ebe3] rounded-lg p-3 mb-4 max-h-40 overflow-auto whitespace-pre-wrap text-[#6b5d4a]">{this.state.error.stack?.split("\n").slice(0, 6).join("\n")}</pre>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              className="px-4 py-2 bg-[#514636] text-white rounded-lg text-sm"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-[#6b5d4a]">Finding your trip...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function ChatOverlay() {
  const { user } = useAuth();
  const location = useLocation();
  const [tripId, setTripId] = useState<string | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    // Prefer the locally-selected trip (survives trip switches without pathname changes)
    const lastTripId = localStorage.getItem("wander:last-trip-id");
    if (lastTripId) {
      setTripId(lastTripId);
    } else {
      api.get<any>("/trips/active").then((t) => {
        if (t?.id) setTripId(t.id);
      }).catch(() => {});
    }
  }, [user, location.pathname]);

  // Listen for trip switches (TripOverview dispatches data-changed when switching)
  useEffect(() => {
    function handleTripSwitch() {
      const lastTripId = localStorage.getItem("wander:last-trip-id");
      if (lastTripId) setTripId(lastTripId);
    }
    window.addEventListener("wander:data-changed", handleTripSwitch);
    // Also listen for storage changes (e.g., from another tab)
    window.addEventListener("storage", handleTripSwitch);
    return () => {
      window.removeEventListener("wander:data-changed", handleTripSwitch);
      window.removeEventListener("storage", handleTripSwitch);
    };
  }, []);

  const handleDataChanged = useCallback(() => {
    setRefreshKey((k) => k + 1);
    // Dispatch a custom event so pages can listen and refresh
    window.dispatchEvent(new CustomEvent("wander:data-changed"));
  }, []);

  if (!user || location.pathname === "/login") return null;

  const pageName = {
    "/": "Trip Overview",
    "/ideas": "Ideas",
    "/now": "Next",
    "/history": "History",
  }[location.pathname] || "Unknown";

  // What the person is looking at, so "this day" or "here" means that day or city
  const dayOnScreen = location.pathname.match(/^\/day\/(\d{4}-\d{2}-\d{2})/)?.[1];
  const cityOnScreen = location.pathname === "/ideas" ? new URLSearchParams(location.search).get("city") || undefined : undefined;

  // Scout opens from its own tab in the bottom bar — a floating button covered whatever was under it
  const hideBubble = true;

  return (
    <ChatBubble
      context={{
        page: dayOnScreen ? `Day ${dayOnScreen}` : pageName,
        tripId,
        dayDate: dayOnScreen,
        cityId: cityOnScreen,
      }}
      onDataChanged={handleDataChanged}
      hideBubble={hideBubble}
    />
  );
}

/**
 * Where each screen was scrolled. Going back (phone Back, "‹ Back", Scout's "↩ Back") lands where you
 * left that screen; opening a screen (a tapped day, a tab, Scout showing you something) starts at its top.
 * Without this, a new screen opened at the old screen's scroll spot — a day Scout showed you could open
 * at its bottom, with the thing Scout named out of sight.
 */
function ScrollKeeper() {
  const location = useLocation();
  const navType = useNavigationType();
  const seenFirst = useRef(false);
  useLayoutEffect(() => {
    try { window.history.scrollRestoration = "manual"; } catch { /* old browsers */ }
  }, []);
  useLayoutEffect(() => {
    const store = "wander:scroll";
    const read = (): Record<string, number> => {
      try { return JSON.parse(sessionStorage.getItem(store) || "{}"); } catch { return {}; }
    };
    const key = location.key;
    let timers: ReturnType<typeof setTimeout>[] = [];
    // A fresh open starts at the top (every first load shares the key "default", so restoring there
    // took whatever spot the last fresh open had). Coming BACK to that first screen later still restores.
    const firstLoad = !seenFirst.current;
    seenFirst.current = true;
    if (navType === "POP" && !firstLoad) {
      const saved = read()[key] || 0;
      // Screens fill in over a moment, so the spot is restored a few times until the person moves
      timers = [0, 120, 350, 800].map((ms) => setTimeout(() => {
        if (Math.abs(window.scrollY - saved) > 4) window.scrollTo(0, saved);
      }, ms));
    } else if (!location.hash) {
      window.scrollTo(0, 0);
    }
    const stop = () => { timers.forEach(clearTimeout); timers = []; };
    let pending: ReturnType<typeof setTimeout> | null = null;
    const save = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        const all = read();
        all[key] = Math.round(window.scrollY);
        const keys = Object.keys(all);
        if (keys.length > 60) delete all[keys[0]];
        try { sessionStorage.setItem(store, JSON.stringify(all)); } catch { /* private mode */ }
      }, 150);
    };
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      stop();
      // Save this screen's spot now, before the next screen changes the page's height
      if (pending) clearTimeout(pending);
      const all = read();
      all[key] = Math.round(window.scrollY);
      try { sessionStorage.setItem(store, JSON.stringify(all)); } catch { /* private mode */ }
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("scroll", save);
    };
  }, [location.key, navType, location.hash]);
  return null;
}

function SessionExpiredHandler() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    const handler = () => {
      showToast("Please sign in again — Face ID or your link brings you back", "info");
      navigate("/login", { replace: true });
    };
    window.addEventListener("wander:session-expired", handler);
    return () => window.removeEventListener("wander:session-expired", handler);
  }, [navigate, showToast]);

  return null;
}

function SyncNotifier() {
  const { showToast } = useToast();

  useEffect(() => {
    const onQueued = (e: Event) => {
      // Notes and day plans say "waiting for signal" right where they were saved — no second message
      const path = String((e as CustomEvent).detail?.path || "");
      if (/^\/(experience-notes|day-choices|trip-notes)/.test(path)) return;
      showToast("Saved on this phone — I'll send it when you have signal", "info");
    };
    const onSynced = (e: Event) => {
      const { success, failed } = (e as CustomEvent).detail || {};
      if (success > 0) {
        showToast(
          `You're back — caught up on ${success === 1 ? "1 thing" : `${success} things`}${failed ? ` (${failed} didn't go through)` : ""}`,
          failed ? "info" : "success",
        );
      }
    };
    window.addEventListener("wander:offline-queued", onQueued);
    window.addEventListener("wander:offline-synced", onSynced);
    return () => {
      window.removeEventListener("wander:offline-queued", onQueued);
      window.removeEventListener("wander:offline-synced", onSynced);
    };
  }, [showToast]);

  return null;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  // Each screen as it opens, so a back button can say where it goes (lib/cameFrom)
  const { pathname } = useLocation();
  useEffect(() => { notePath(pathname); }, [pathname]);

  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/join/:token" element={<JoinPage />} />
      <Route path="/" element={<ProtectedRoute><TripOverview /></ProtectedRoute>} />
      <Route path="/ideas" element={<ProtectedRoute><IdeasPage /></ProtectedRoute>} />
      {/* The planning board is retired (the Guide is the plan); old links land on the same city's ideas */}
      <Route path="/plan" element={<PlanToIdeas />} />
      {/* The Now tab: today from Larisa's Guide (the old Now screen's file is kept, not routed) */}
      <Route path="/now" element={<ProtectedRoute><DayPage now /></ProtectedRoute>} />
      <Route path="/day/:date" element={<ProtectedRoute><DayPage /></ProtectedRoute>} />
      <Route path="/people" element={<ProtectedRoute><PeoplePage /></ProtectedRoute>} />
      <Route path="/notes" element={<ProtectedRoute><NotesPage /></ProtectedRoute>} />
      <Route path="/whole-trip" element={<ProtectedRoute><WholeTripPage /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
      {/* A step-by-step checklist from another source (the Shin-Osaka ticket pickup, Ken's rail sheet) */}
      <Route path="/checklist/:sourceId/:tab" element={<ProtectedRoute><ChecklistPage /></ProtectedRoute>} />
      <Route path="/capture-share" element={<ProtectedRoute><CaptureSharePage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/city/:cityId" element={<ProtectedRoute><CityBoard /></ProtectedRoute>} />
      <Route path="/story" element={<ProtectedRoute><TripStoryPage /></ProtectedRoute>} />
      <Route path="/guide" element={<ProtectedRoute><GuidePage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <CaptureProvider>
              {/* Before the routes, so it saves the old screen's spot before the new screen replaces it */}
              <ScrollKeeper />
              <AppRoutes />
              {/* Nothing covers the trip uninvited. The daily greeting, next-up overlay, new-member
                  interest picker and evening check-in are no longer mounted (code kept): they covered
                  today's plan at the wrong moments and used out-of-date "today" logic. Home's Today
                  and the Now tab carry what matters. The phrase card lives on the Now tab. */}
              <ChatOverlay />
              <CaptureToast />
              <CaptureFAB />
              <ShortcutHelp />
              <SessionExpiredHandler />
              <SyncNotifier />
              <SyncIndicator />
              <SavedCopyNotice />
              <UpdatePrompt />
              <BottomNav />
              {/* "Show me around" — only when asked for */}
              <ShowMeAround />
            </CaptureProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
