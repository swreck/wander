import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import type { Trip, Day, TravelerProfile } from "../lib/types";
import {
  canShowDailyGreeting,
  recordDailyGreeting,
  getDailyGreeting,
  getPreTripNudge,
} from "../lib/travelerProfiles";

export default function DailyGreeting() {
  const { user } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!canShowDailyGreeting(user.displayName)) return;

    async function load() {
      try {
        const trip = await api.get<Trip>("/trips/active");
        if (!trip) return;

        // Check if we're before the trip — show document nudge or destination teaser
        const now = new Date();
        const tripStart = trip.startDate ? new Date(trip.startDate) : null;
        if (tripStart && now < tripStart) {
          // Pre-trip: check document completeness
          const profileRes = await api.get<TravelerProfile | { documents: never[] }>(`/traveler-documents/trip/${trip.id}`).catch(() => ({ documents: [] }));
          const docs = ("documents" in profileRes) ? profileRes.documents : [];
          const nudge = getPreTripNudge(user!.displayName, docs, trip);
          if (nudge) {
            setMessage(nudge);
            setVisible(true);
            recordDailyGreeting(user!.displayName);
            return;
          }
        }

        // During/after trip: existing greeting logic
        const days = await api.get<Day[]>(`/days/trip/${trip.id}`);
        const todayStr = new Date().toISOString().split("T")[0];
        const today = days.find((d) => d.date.split("T")[0] === todayStr);

        const todayExps = today
          ? (today.experiences || [])
              .filter((e) => e.state === "selected")
              .map((e) => ({ name: e.name, themes: e.themes || [] }))
          : [];

        const cityName = today?.city?.name;
        const greeting = getDailyGreeting(user!.displayName, todayExps, cityName);

        if (greeting) {
          setMessage(greeting);
          setVisible(true);
          recordDailyGreeting(user!.displayName);
        }
      } catch {
        // Silently fail — greeting is a delight, not critical
      }
    }

    load();
  }, [user]);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, [visible]);

  function dismiss() {
    setVisible(false);
  }

  if (!visible || !message) return null;

  return (
    <div
      className="fixed z-50 left-0 right-0 flex justify-center pointer-events-none"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
    >
      <div
        className="pointer-events-auto mx-4 max-w-sm w-full bg-white rounded-2xl shadow-xl p-5 border border-[#e0d8cc]
                   animate-greetingFadeIn cursor-pointer"
        onClick={dismiss}
      >
        <p className="text-[15px] text-[#3a3128] leading-relaxed">
          {message}
        </p>
        <div className="mt-2 text-right">
          <span className="text-xs text-[#c8bba8]">tap to dismiss</span>
        </div>
      </div>
    </div>
  );
}
