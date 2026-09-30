import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import useTripSync from "../hooks/useTripSync";
import useScoutDocked from "../hooks/useScoutDocked";

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
  // While Scout's bar is showing, the news waits (it stays until tapped) — one floating layer at a time
  const scoutDocked = useScoutDocked();

  if (!user || location.pathname === "/login" || location.pathname.startsWith("/join") || pendingChanges === 0 || scoutDocked) return null;

  // Sits just above the bottom bar, clear of the title and the Scout button. The screens behind it have
  // already caught up (useTripSync); this says what changed, and stays until tapped.
  return (
    <button
      onClick={dismiss}
      className="fixed left-4 right-20 z-[55] min-h-[44px] px-4 py-2 rounded-2xl text-left
                 bg-[#514636] text-white text-[13px] leading-snug shadow-lg
                 animate-[slideDown_0.3s_ease-out] hover:bg-[#3a3128] transition-colors"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 68px + var(--scout-dock, 0px))" }}
    >
      {latestAction || (pendingChanges === 1 ? "Someone made a change" : `${pendingChanges} new changes from the group`)}
      <span className="font-medium underline underline-offset-2 ml-1.5">Got it</span>
    </button>
  );
}

export { useTripSync };
