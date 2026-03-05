import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import TripOverview from "./pages/TripOverview";
import PlanPage from "./pages/PlanPage";
import NowPage from "./pages/NowPage";
import HistoryPage from "./pages/HistoryPage";
import OfflineIndicator from "./components/OfflineIndicator";
import ChatBubble from "./components/ChatBubble";
import { useState, useEffect, useCallback } from "react";
import { api } from "./lib/api";

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

  return (
    <ChatBubble
      context={{ page: pageName, tripId }}
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
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <ChatOverlay />
        <OfflineIndicator />
      </AuthProvider>
    </BrowserRouter>
  );
}
