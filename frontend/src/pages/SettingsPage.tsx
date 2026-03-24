import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isNextUpEnabled, setNextUpEnabled } from "../components/NextUpOverlay";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";

const DURATION_OPTIONS = [
  { value: 1000, label: "1 second" },
  { value: 3000, label: "3 seconds" },
  { value: 5000, label: "5 seconds" },
];

function getSplashDuration(): number {
  try {
    const val = localStorage.getItem("wander:splash-duration");
    if (val) return parseInt(val);
  } catch {}
  return 1000;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { showToast } = useToast();
  const [splashDuration, setSplashDuration] = useState(getSplashDuration);
  const [nextUp, setNextUp] = useState(isNextUpEnabled);

  function handleDuration(ms: number) {
    setSplashDuration(ms);
    localStorage.setItem("wander:splash-duration", String(ms));
    showToast(`City photo: ${ms / 1000}s`, "success");
  }

  function handleNextUp(enabled: boolean) {
    setNextUp(enabled);
    setNextUpEnabled(enabled);
    showToast(enabled ? "Next-up reminders on" : "Next-up reminders off", "success");
  }

  function resetGuides() {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("wander:guide:") || (k.startsWith("wander:") && k.endsWith("-oriented")));
    keys.forEach((k) => localStorage.removeItem(k));
    showToast(`Reset ${keys.length} guide(s)`, "success");
  }

  return (
    <div className="min-h-[100dvh] bg-[#faf8f5]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur-sm border-b border-[#e0d8cc] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-[#8a7a62] hover:text-[#3a3128]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-lg font-medium text-[#3a3128]">Settings</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* City Photo Duration */}
        <section>
          <h2 className="text-sm font-medium text-[#3a3128] mb-1">City photo duration</h2>
          <p className="text-xs text-[#8a7a62] mb-3">How long the city splash photo shows when you enter a new city on the map.</p>
          <div className="flex gap-2">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleDuration(opt.value)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  splashDuration === opt.value
                    ? "bg-[#514636] text-white"
                    : "bg-white border border-[#e0d8cc] text-[#6b5d4a] hover:bg-[#f0ece5]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Next-Up Reminder */}
        <section>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-[#3a3128]">Next-up reminder</h2>
              <p className="text-xs text-[#8a7a62] mt-0.5">Show what's next when you open Wander during your trip.</p>
            </div>
            <button
              onClick={() => handleNextUp(!nextUp)}
              className={`relative w-11 h-6 rounded-full transition-colors ${nextUp ? "bg-[#514636]" : "bg-[#d0c9be]"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${nextUp ? "translate-x-5" : ""}`} />
            </button>
          </div>
        </section>

        {/* Reset Guides */}
        <section>
          <h2 className="text-sm font-medium text-[#3a3128] mb-1">First-time guides</h2>
          <p className="text-xs text-[#8a7a62] mb-3">Re-show the orientation tips on each screen.</p>
          <button
            onClick={resetGuides}
            className="py-2 px-4 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a] hover:bg-[#f0ece5] transition-colors"
          >
            Reset all guides
          </button>
        </section>

        {/* Logout */}
        <section>
          <button
            onClick={() => { logout(); navigate("/login"); }}
            className="w-full py-3 rounded-xl bg-red-50 text-red-600 border border-red-200 text-sm font-medium hover:bg-red-100 transition-colors"
          >
            Log out
          </button>
        </section>
      </div>
    </div>
  );
}
