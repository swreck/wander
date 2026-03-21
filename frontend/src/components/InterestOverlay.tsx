import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import type { ExperienceInterest } from "../lib/types";

const SESSION_KEY = "wander-interest-shown";
const DISMISS_MS = 12000;

export default function InterestOverlay() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [interest, setInterest] = useState<ExperienceInterest | null>(null);
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || location.pathname === "/login") return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    sessionStorage.setItem(SESSION_KEY, "1");

    async function load() {
      try {
        const trip = await api.get<any>("/trips/active");
        if (!trip) return;

        const interests = await api.get<ExperienceInterest[]>(
          `/interests/trip/${trip.id}`
        );

        // Find recent interests from OTHER people that the current user hasn't reacted to
        const unreacted = interests.filter((i) => {
          if (i.userCode === user!.code) return false;
          const hasReacted = i.reactions.some((r) => r.userCode === user!.code);
          return !hasReacted;
        });

        if (unreacted.length === 0) return;

        // Show the most recent one
        const latest = unreacted[0]; // already sorted desc by createdAt
        setInterest(latest);
        setVisible(true);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setAnimateIn(true));
        });
      } catch {
        // Silently fail — nice-to-have
      }
    }

    const timeout = setTimeout(load, 1200);
    return () => clearTimeout(timeout);
  }, [user, location.pathname]);

  useEffect(() => {
    if (!visible) return;
    dismissTimer.current = setTimeout(() => dismiss(), DISMISS_MS);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [visible]);

  function dismiss() {
    setAnimateIn(false);
    setTimeout(() => setVisible(false), 300);
  }

  function handleTap() {
    if (interest?.experience?.cityId) {
      navigate(`/plan?city=${interest.experience.cityId}`);
    }
    dismiss();
  }

  if (!visible || !interest) return null;

  const exp = interest.experience;
  const dayLabel = exp?.dayId ? "a day" : "";
  const cityName = exp?.city?.name || "";
  const timeAgo = formatTimeAgo(interest.createdAt);

  return (
    <div
      className={`fixed z-[60] left-0 right-0 flex justify-center transition-all duration-300 ease-out
        ${animateIn ? "opacity-100" : "opacity-0 translate-y-4"}`}
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 200px)" }}
    >
      <button
        onClick={handleTap}
        className="w-[calc(100%-2rem)] max-w-sm bg-white rounded-2xl shadow-2xl border border-[#e0d8cc]
                   px-4 py-3.5 text-left active:scale-[0.98] transition-transform"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">
              Group interest · {timeAgo}
            </div>
            <div className="text-base font-medium text-[#3a3128]">
              {interest.displayName} is interested in {exp?.name || "something"}
            </div>
            <div className="text-sm text-[#8a7a62] mt-0.5">
              {cityName && `in ${cityName}`}
              {interest.note && (
                <span className="text-[#a89880]"> — "{interest.note}"</span>
              )}
            </div>
          </div>
          <div className="text-[#c8bba8] text-xs mt-0.5 shrink-0">take a look</div>
        </div>
      </button>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const d = Math.floor(hours / 24);
  return `${d}d ago`;
}
