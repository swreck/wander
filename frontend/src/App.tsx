import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import TripOverview from "./pages/TripOverview";
import PlanPage from "./pages/PlanPage";
import NowPage from "./pages/NowPage";
import HistoryPage from "./pages/HistoryPage";
import CaptureSharePage from "./pages/CaptureSharePage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import GuidePage from "./pages/GuidePage";
import JoinPage from "./pages/JoinPage";
import CityBoard from "./pages/CityBoard";
import TripStoryPage from "./pages/TripStoryPage";
import OfflineIndicator from "./components/OfflineIndicator";
import PhraseCard from "./components/PhraseCard";
import ChatBubble from "./components/ChatBubble";
import DailyGreeting from "./components/DailyGreeting";
import NextUpOverlay from "./components/NextUpOverlay";
import InterestOverlay from "./components/InterestOverlay";
import { ToastProvider } from "./contexts/ToastContext";
import { useToast } from "./contexts/ToastContext";
import { CaptureProvider } from "./contexts/CaptureContext";
import CaptureToast from "./components/CaptureToast";
import CaptureFAB from "./components/CaptureFAB";
import ReflectionCard from "./components/ReflectionCard";
import SyncIndicator from "./components/SyncIndicator";
import BottomNav from "./components/BottomNav";
import AutoSync from "./components/AutoSync";
import UpdatePrompt from "./components/UpdatePrompt";
import NewMemberOnboarding from "./components/NewMemberOnboarding";
import { shouldShowOnboarding } from "./components/NewMemberOnboarding";
import React, { useState, useEffect, useCallback } from "react";
import { api } from "./lib/api";
import type { Day, Experience, Trip } from "./lib/types";

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
            <h1 className="text-lg font-medium text-[#3a3128] mb-2">Hmm, something broke</h1>
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
  if (loading) return <div className="min-h-screen flex items-center justify-center text-[#8a7a62]">Finding your trip...</div>;
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
    "/plan": "Plan",
    "/now": "Now",
    "/history": "History",
  }[location.pathname] || "Unknown";

  // Pick up day/city context from PlanPage if available
  const wanderCtx = (window as any).__wanderContext || {};

  // Scout floats on every page
  const hideBubble = false;

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

function OnboardingOverlay() {
  const { user } = useAuth();
  const location = useLocation();
  const [show, setShow] = useState(false);
  const [tripName, setTripName] = useState("");

  useEffect(() => {
    if (!user?.travelerId) return;
    if (location.pathname === "/login" || location.pathname.startsWith("/join")) return;
    if (location.pathname === "/guide") return; // Don't overlay on top of guide

    // Check if onboarding should show (not completed, not snoozed)
    if (!shouldShowOnboarding()) return;

    // Delay 5s so new users see the trip before being asked about interests
    const timer = setTimeout(() => {
      // Check if user already has interests set — if so, mark complete silently
      api.get<{ preferences: Record<string, unknown> | null }>(`/auth/travelers/${user.travelerId}`)
        .then((t) => {
          const prefs = t?.preferences as Record<string, unknown> | null;
          const interests = (prefs?.interests as string[]) || [];
          if (interests.length > 0) {
            localStorage.setItem("wander:onboarding-completed", "1");
            return;
          }
          return api.get<Trip>("/trips/active").then((trip) => {
            if (trip?.name) {
              setTripName(trip.name);
              setShow(true);
            }
          });
        })
        .catch(() => {});
    }, 5000);

    return () => clearTimeout(timer);
  }, [user?.travelerId, location.pathname]);

  if (!show || !user?.travelerId) return null;

  return (
    <NewMemberOnboarding
      tripName={tripName}
      displayName={user.displayName}
      travelerId={user.travelerId}
      onComplete={() => setShow(false)}
    />
  );
}

function ReflectionOverlay() {
  const { user } = useAuth();
  const [dayData, setDayData] = useState<{
    tripId: string; dayId: string; dayDate: string; cityName: string; experiences: Experience[];
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    const hour = new Date().getHours();
    if (hour < 18) return; // Only after 6pm

    api.get<any>("/trips/active").then(async (trip) => {
      if (!trip) return;
      // Check if today is within trip dates
      const todayStr = new Date().toISOString().split("T")[0];
      if (trip.startDate && todayStr < trip.startDate.split("T")[0]) return;
      if (trip.endDate && todayStr > trip.endDate.split("T")[0]) return;

      const days = await api.get<Day[]>(`/days/trip/${trip.id}`);
      const today = days.find((d: Day) => d.date.split("T")[0] === todayStr);
      if (!today) return;

      const exps = await api.get<Experience[]>(`/experiences/trip/${trip.id}?cityId=${today.cityId}`);
      setDayData({
        tripId: trip.id,
        dayId: today.id,
        dayDate: today.date,
        cityName: today.city?.name || "",
        experiences: exps,
      });
    }).catch(() => {});
  }, [user]);

  if (!dayData) return null;
  return (
    <ReflectionCard
      tripId={dayData.tripId}
      dayId={dayData.dayId}
      dayDate={dayData.dayDate}
      cityName={dayData.cityName}
      experiences={dayData.experiences}
    />
  );
}

function SessionExpiredHandler() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    const handler = () => {
      showToast("Your session expired — signing you back in", "info");
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
      const count = (e as CustomEvent).detail?.count ?? 0;
      showToast("Saved for now — you're offline", "info");
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

  if (loading) return null;

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
              <AppRoutes />
              <DailyGreeting />
              <NextUpOverlay />
              <InterestOverlay />
              <ChatOverlay />
              <CaptureToast />
              <CaptureFAB />
              <PhraseCard />
              <ShortcutHelp />
              <OfflineIndicator />
              <SessionExpiredHandler />
              <SyncNotifier />
              <SyncIndicator />
              <AutoSync />
              <UpdatePrompt />
              <BottomNav />
              <OnboardingOverlay />
              <ReflectionOverlay />
            </CaptureProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
