import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import TripOverview from "./pages/TripOverview";
import PlanPage from "./pages/PlanPage";
import NowPage from "./pages/NowPage";
import HistoryPage from "./pages/HistoryPage";
import CaptureSharePage from "./pages/CaptureSharePage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import JoinPage from "./pages/JoinPage";
import OfflineIndicator from "./components/OfflineIndicator";
import PhraseCard from "./components/PhraseCard";
import ChatBubble from "./components/ChatBubble";
import DailyGreeting from "./components/DailyGreeting";
import NextUpOverlay from "./components/NextUpOverlay";
import InterestOverlay from "./components/InterestOverlay";
import { ToastProvider } from "./contexts/ToastContext";
import { useToast } from "./contexts/ToastContext";
import React, { useState, useEffect, useCallback } from "react";
import { api } from "./lib/api";

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
    ["3 or g n", "Now page"],
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
              <span className="text-[#8a7a62]">{desc}</span>
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
            <h1 className="text-lg font-medium text-[#3a3128] mb-2">Something went wrong</h1>
            <p className="text-sm text-[#8a7a62] mb-4">{this.state.error.message}</p>
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
  if (loading) return <div className="min-h-screen flex items-center justify-center text-[#8a7a62]">Loading...</div>;
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
    api.get<any>("/trips/active").then((t) => {
      if (t?.id) setTripId(t.id);
    }).catch(() => {});
  }, [user, location.pathname]);

  const handleDataChanged = useCallback(() => {
    setRefreshKey((k) => k + 1);
    // Dispatch a custom event so pages can listen and refresh
    window.dispatchEvent(new CustomEvent("wander:data-changed"));
  }, []);

  if (!user || location.pathname === "/login") return null;

  const pageName = {
    "/": "Trip Overview",
    "/plan": "Plan",
    "/now": "Now",
    "/history": "History",
  }[location.pathname] || "Unknown";

  // Pick up day/city context from PlanPage if available
  const wanderCtx = (window as any).__wanderContext || {};

  // Hide the floating bubble on /plan (mobile) — Chat is in the bottom action bar there
  const hideBubble = location.pathname === "/plan";

  return (
    <ChatBubble
      context={{
        page: pageName,
        tripId,
        dayId: wanderCtx.dayId,
        dayDate: wanderCtx.dayDate,
        cityId: wanderCtx.cityId,
        cityName: wanderCtx.cityName,
      }}
      onDataChanged={handleDataChanged}
      hideBubble={hideBubble}
    />
  );
}

function SyncNotifier() {
  const { showToast } = useToast();

  useEffect(() => {
    const onQueued = (e: Event) => {
      const count = (e as CustomEvent).detail?.count ?? 0;
      showToast(`Saved offline (${count} queued)`, "info");
    };
    const onSynced = (e: Event) => {
      const { success, failed } = (e as CustomEvent).detail || {};
      if (success > 0) {
        showToast(
          `Synced ${success} change${success > 1 ? "s" : ""}${failed ? `, ${failed} failed` : ""}`,
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

  if (loading) return <div className="min-h-screen bg-[#3a3128]" />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/join/:token" element={<JoinPage />} />
      <Route path="/" element={<ProtectedRoute><TripOverview /></ProtectedRoute>} />
      <Route path="/plan" element={<ProtectedRoute><PlanPage /></ProtectedRoute>} />
      <Route path="/now" element={<ProtectedRoute><NowPage /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
      <Route path="/capture-share" element={<ProtectedRoute><CaptureSharePage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
            <DailyGreeting />
            <NextUpOverlay />
            <InterestOverlay />
            <ChatOverlay />
            <PhraseCard />
            <ShortcutHelp />
            <OfflineIndicator />
            <SyncNotifier />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
