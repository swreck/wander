import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import type { Trip, Day, RouteSegment } from "../lib/types";

const SETTING_KEY = "wander-next-up-enabled";
const SESSION_KEY = "wander-next-up-shown";
const DISMISS_MS = 10000;
const LOOKAHEAD_MS = 4 * 60 * 60 * 1000; // 4 hours

interface NextUpItem {
  name: string;
  type: "reservation" | "experience" | "transport";
  timeLabel: string;
  detail?: string;
  minutesUntil: number;
}

export function isNextUpEnabled(): boolean {
  const val = localStorage.getItem(SETTING_KEY);
  return val === null || val === "true";
}

export function setNextUpEnabled(enabled: boolean) {
  localStorage.setItem(SETTING_KEY, String(enabled));
}

function parseTimeWindow(tw: string, dayDate: string): Date | null {
  const dateStr = dayDate.split("T")[0];
  const day = new Date(dateStr + "T12:00:00");
  const lower = tw.toLowerCase();
  if (lower === "morning") { day.setHours(9, 0, 0, 0); return day; }
  if (lower === "afternoon") { day.setHours(14, 0, 0, 0); return day; }
  if (lower === "evening") { day.setHours(18, 0, 0, 0); return day; }

  const match = tw.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (match) {
    let hours = parseInt(match[1]);
    const mins = match[2] ? parseInt(match[2]) : 0;
    const ampm = match[3]?.toLowerCase();
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
    day.setHours(hours, mins, 0, 0);
    return day;
  }
  return null;
}

function parseSegmentTime(seg: RouteSegment): Date | null {
  if (!seg.departureDate || !seg.departureTime) return null;
  const date = new Date(seg.departureDate);
  const match = seg.departureTime.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  date.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
  return date;
}

export default function NextUpOverlay() {
  const { user } = useAuth();
  const location = useLocation();
  const [item, setItem] = useState<NextUpItem | null>(null);
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || location.pathname === "/login") return;
    if (!isNextUpEnabled()) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    // Mark as shown for this session
    sessionStorage.setItem(SESSION_KEY, "1");

    async function load() {
      try {
        const trip = await api.get<Trip>("/trips/active");
        if (!trip) return;

        const days = await api.get<Day[]>(`/days/trip/${trip.id}`);
        const now = new Date();
        const todayStr = now.toISOString().split("T")[0];
        const today = days.find((d) => d.date.split("T")[0] === todayStr);

        const candidates: NextUpItem[] = [];

        // Check today's reservations and experiences
        if (today) {
          for (const res of today.reservations || []) {
            const resTime = new Date(res.datetime);
            const diff = resTime.getTime() - now.getTime();
            if (diff > 0 && diff <= LOOKAHEAD_MS) {
              candidates.push({
                name: res.name,
                type: "reservation",
                timeLabel: resTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
                detail: res.confirmationNumber ? `Conf: ${res.confirmationNumber}` : undefined,
                minutesUntil: Math.round(diff / 60000),
              });
            }
          }

          const selected = (today.experiences || []).filter((e) => e.state === "selected");
          for (const exp of selected) {
            if (!exp.timeWindow) continue;
            const expTime = parseTimeWindow(exp.timeWindow, today.date);
            if (!expTime) continue;
            const diff = expTime.getTime() - now.getTime();
            if (diff > 0 && diff <= LOOKAHEAD_MS) {
              candidates.push({
                name: exp.name,
                type: "experience",
                timeLabel: expTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
                detail: exp.userNotes || undefined,
                minutesUntil: Math.round(diff / 60000),
              });
            }
          }
        }

        // Check route segments departing today
        for (const seg of trip.routeSegments || []) {
          const segTime = parseSegmentTime(seg);
          if (!segTime) continue;
          if (segTime.toISOString().split("T")[0] !== todayStr) continue;
          const diff = segTime.getTime() - now.getTime();
          if (diff > 0 && diff <= LOOKAHEAD_MS) {
            const modeEmoji: Record<string, string> = {
              flight: "plane",
              train: "train",
              ferry: "ferry",
              drive: "car",
            };
            candidates.push({
              name: `${seg.originCity} to ${seg.destinationCity}`,
              type: "transport",
              timeLabel: segTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
              detail: [
                seg.serviceNumber,
                seg.departureStation,
                seg.confirmationNumber ? `Conf: ${seg.confirmationNumber}` : null,
              ].filter(Boolean).join(" · ") || undefined,
              minutesUntil: Math.round(diff / 60000),
            });
          }
        }

        if (candidates.length === 0) return;

        // Pick the soonest
        candidates.sort((a, b) => a.minutesUntil - b.minutesUntil);
        setItem(candidates[0]);
        setVisible(true);
        // Trigger slide-in animation after mount
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setAnimateIn(true));
        });
      } catch {
        // Silently fail — this is a nice-to-have, not critical
      }
    }

    // Small delay so the page renders first
    const timeout = setTimeout(load, 800);
    return () => clearTimeout(timeout);
  }, [user, location.pathname]);

  // Auto-dismiss timer
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

  function turnOff() {
    setNextUpEnabled(false);
    dismiss();
  }

  if (!visible || !item) return null;

  const typeLabel = item.type === "reservation" ? "Reservation"
    : item.type === "transport" ? "Departure"
    : "Planned";

  const timeDescription = item.minutesUntil < 60
    ? `in ${item.minutesUntil} min`
    : `in ${Math.round(item.minutesUntil / 60)}h ${item.minutesUntil % 60}m`;

  return (
    <div
      className={`fixed z-50 left-0 right-0 flex justify-center transition-all duration-300 ease-out
        ${animateIn ? "opacity-100" : "opacity-0 translate-y-4"}`}
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 200px)" }}
    >
      <button
        onClick={dismiss}
        className="w-[calc(100%-2rem)] max-w-sm bg-white rounded-2xl shadow-2xl border border-[#e0d8cc]
                   px-4 py-3.5 text-left active:scale-[0.98] transition-transform"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">
              {typeLabel} · {timeDescription}
            </div>
            <div className="text-base font-medium text-[#3a3128] truncate">
              {item.name}
            </div>
            <div className="text-sm text-[#8a7a62] mt-0.5">
              {item.timeLabel}
              {item.detail && <span className="text-[#a89880]"> · {item.detail}</span>}
            </div>
          </div>
          <div className="text-[#c8bba8] text-xs mt-0.5 shrink-0">tap to close</div>
        </div>
      </button>
    </div>
  );
}
