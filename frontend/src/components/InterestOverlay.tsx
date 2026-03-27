import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import type { ExperienceInterest } from "../lib/types";

const SESSION_KEY = "wander-interest-shown";
const SEEN_KEY = "wander-interest-notifs-seen";

export default function InterestOverlay() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [notification, setNotification] = useState<{
    type: "creator" | "unreacted";
    interest: ExperienceInterest;
  } | null>(null);
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

        // Load previously seen creator notifications from localStorage
        const seenRaw = localStorage.getItem(SEEN_KEY);
        const seen = new Set<string>(seenRaw ? JSON.parse(seenRaw) : []);

        // Priority 1: Someone showed interest in an activity YOU created
        // These persist across sessions until dismissed
        const creatorNotifs = interests.filter((i) => {
          if (i.userCode === user!.code) return false; // you floated your own thing
          const exp = i.experience as any;
          if (!exp || exp.createdBy !== user!.code) return false; // not your activity
          return !seen.has(i.id); // not yet seen
        });

        if (creatorNotifs.length > 0) {
          setNotification({ type: "creator", interest: creatorNotifs[0] });
          setVisible(true);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setAnimateIn(true));
          });
          return;
        }

        // Priority 2: Unreacted interests from others (existing behavior)
        const unreacted = interests.filter((i) => {
          if (i.userCode === user!.code) return false;
          const hasReacted = i.reactions.some((r) => r.userCode === user!.code);
          return !hasReacted;
        });

        if (unreacted.length > 0) {
          setNotification({ type: "unreacted", interest: unreacted[0] });
          setVisible(true);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setAnimateIn(true));
          });
        }
      } catch {
        // Silently fail — nice-to-have
      }
    }

    const timeout = setTimeout(load, 1200);
    return () => clearTimeout(timeout);
  }, [user, location.pathname]);

  useEffect(() => {
    if (!visible || !notification) return;
    // Creator notifications don't auto-dismiss — they need explicit action
    if (notification.type === "creator") return;
    dismissTimer.current = setTimeout(() => dismiss(), 12000);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [visible, notification]);

  function dismiss() {
    if (notification?.type === "creator") {
      // Mark this notification as seen so it doesn't come back
      const seenRaw = localStorage.getItem(SEEN_KEY);
      const seen: string[] = seenRaw ? JSON.parse(seenRaw) : [];
      if (!seen.includes(notification.interest.id)) {
        seen.push(notification.interest.id);
        localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
      }
    }
    setAnimateIn(false);
    setTimeout(() => setVisible(false), 300);
  }

  function handleGoThere() {
    if (notification?.interest?.experience?.cityId) {
      navigate(`/plan?city=${notification.interest.experience.cityId}`);
    }
    dismiss();
  }

  if (!visible || !notification) return null;

  const { type, interest } = notification;
  const exp = interest.experience;
  const cityName = exp?.city?.name || "";
  const timeAgo = formatTimeAgo(interest.createdAt);

  // Creator notification: "[Name] is interested in [your activity]"
  if (type === "creator") {
    return (
      <div
        className={`fixed z-50 left-0 right-0 flex justify-center transition-all duration-300 ease-out
          ${animateIn ? "opacity-100" : "opacity-0 translate-y-4"}`}
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 200px)" }}
      >
        <div className="w-[calc(100%-2rem)] max-w-sm bg-white rounded-2xl shadow-2xl border border-[#e0d8cc] px-4 py-4">
          <div className="text-sm text-[#3a3128] mb-3">
            <strong>{interest.displayName}</strong> is interested in your activity{" "}
            <strong>{exp?.name || "something"}</strong>
            {cityName && <span className="text-[#8a7a62]"> in {cityName}</span>}
            {interest.note && (
              <span className="text-[#a89880]"> — "{interest.note}"</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={dismiss}
              className="flex-1 py-2 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a]
                         hover:bg-[#f0ece5] transition-colors"
            >
              OK
            </button>
            <button
              onClick={handleGoThere}
              className="flex-1 py-2 rounded-lg bg-[#514636] text-white text-sm font-medium
                         hover:bg-[#3a3128] transition-colors"
            >
              Take me there
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Unreacted interest notification (existing behavior)
  return (
    <div
      className={`fixed z-50 left-0 right-0 flex justify-center transition-all duration-300 ease-out
        ${animateIn ? "opacity-100" : "opacity-0 translate-y-4"}`}
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 200px)" }}
    >
      <button
        onClick={handleGoThere}
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
