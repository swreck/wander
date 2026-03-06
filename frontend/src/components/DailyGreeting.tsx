import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import type { Trip, Day } from "../lib/types";
import {
  canShowDailyGreeting,
  recordDailyGreeting,
  getDailyGreeting,
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

  function dismiss() {
    setVisible(false);
  }

  if (!visible || !message) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div
        className="mx-6 max-w-sm w-full bg-white rounded-2xl shadow-xl p-6 animate-greetingFadeIn"
        onClick={dismiss}
      >
        <p className="text-[15px] text-[#3a3128] leading-relaxed">
          {message}
        </p>
        <div className="mt-4 text-center">
          <span className="text-xs text-[#c8bba8]">tap anywhere to continue</span>
        </div>
      </div>
    </div>
  );
}
