import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import useTripSync from "../hooks/useTripSync";

export default function SyncIndicator() {
  const { user } = useAuth();
  const location = useLocation();
  const [tripId, setTripId] = useState<string | undefined>();

  useEffect(() => {
    if (!user) return;
    api.get<any>("/trips/active").then((t) => {
      if (t?.id) setTripId(t.id);
    }).catch(() => {});
  }, [user]);

  const { pendingChanges, latestAction, dismiss } = useTripSync(tripId, user?.code);

  if (!user || location.pathname === "/login" || pendingChanges === 0) return null;

  return (
    <button
      onClick={dismiss}
      className="fixed top-2 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full
                 bg-[#514636] text-white text-xs font-medium shadow-lg
                 animate-[slideDown_0.3s_ease-out] hover:bg-[#3a3128] transition-colors"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      {latestAction
        ? `${latestAction} — tap to refresh`
        : `${pendingChanges} new ${pendingChanges === 1 ? "change" : "changes"} — tap to refresh`
      }
    </button>
  );
}

export { useTripSync };
