import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import TripOverview from "./pages/TripOverview";
import PlanPage from "./pages/PlanPage";
import NowPage from "./pages/NowPage";
import HistoryPage from "./pages/HistoryPage";
import CaptureSharePage from "./pages/CaptureSharePage";
import OfflineIndicator from "./components/OfflineIndicator";
import ChatBubble from "./components/ChatBubble";
import DailyGreeting from "./components/DailyGreeting";
import { ToastProvider } from "./contexts/ToastContext";
import React, { useState, useEffect, useCallback } from "react";
import { api } from "./lib/api";

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
    />
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-[#8a7a62]">Loading...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><TripOverview /></ProtectedRoute>} />
      <Route path="/plan" element={<ProtectedRoute><PlanPage /></ProtectedRoute>} />
      <Route path="/now" element={<ProtectedRoute><NowPage /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
      <Route path="/capture-share" element={<ProtectedRoute><CaptureSharePage /></ProtectedRoute>} />
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
            <ChatOverlay />
            <OfflineIndicator />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
