import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isNextUpEnabled, setNextUpEnabled } from "../components/NextUpOverlay";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { api } from "../lib/api";
import FaceIdSetup from "../components/FaceIdSetup";

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
  const { logout, user: authUser } = useAuth();
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

      <div className="max-w-lg mx-auto px-4 py-6 pb-40 space-y-6">
        {/* City Photo Duration */}
        <section>
          <h2 className="text-sm font-medium text-[#3a3128] mb-1">City intro photo</h2>
          <p className="text-xs text-[#8a7a62] mb-3">When you switch to a new city, its photo appears briefly. Quick (1s) or longer view (5s).</p>
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

        {/* Guide */}
        <section>
          <button
            onClick={() => navigate("/guide")}
            className="py-2 px-4 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a] hover:bg-[#f0ece5] transition-colors"
          >
            View guide
          </button>
        </section>

        {/* Spreadsheet Sync (planner-only) */}
        {/* Sync section checks its own visibility via API */}
        <FaceIdSetup variant="settings" />
        <SheetSyncSection />

        {/* Dedup review (planner-only) */}
        <DedupSection />

        {/* Logout */}
        <section>
          <button
            onClick={() => { logout(); navigate("/login"); }}
            className="w-full py-3 rounded-xl bg-red-50 text-red-600 border border-red-200 text-sm font-medium hover:bg-red-100 transition-colors"
          >
            Sign out
          </button>
        </section>
      </div>
    </div>
  );
}

// ── Larisa's Guide (read-only) ───────────────────────────────
// Wander is downstream of Larisa's sheet: it reads the Guide and never changes it.
// There are deliberately no sync, push, or interval controls here.

interface SyncStatus {
  configured: boolean;
  lastSyncAt?: string;
}

function SheetSyncSection() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncSourceName, setSyncSourceName] = useState<string | null>(null);

  useEffect(() => {
    const lastTrip = localStorage.getItem("wander:last-trip-id");
    const loadTrip = (id: string) => {
      api.get<SyncStatus>(`/sheets-sync/status/${id}`).then(setStatus).catch(() => {});
      // Fetch trip tagline to get dynamic sync source name
      api.get<any>(`/trips/${id}`).then(t => {
        const match = t?.tagline?.match(/^Synced with (.+?)(?:\s*·.*)?$/);
        if (match) setSyncSourceName(match[1]);
      }).catch(() => {});
    };
    if (lastTrip) {
      loadTrip(lastTrip);
    } else {
      api.get<any>("/trips/active").then((trip) => {
        if (trip?.id) {
          localStorage.setItem("wander:last-trip-id", trip.id);
          loadTrip(trip.id);
        }
      }).catch(() => {});
    }
  }, []);

  if (!status?.configured) return null;

  const lastRead = status.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <section className="border-t border-[#e0d8cc] pt-6">
      <h2 className="text-sm font-medium text-[#3a3128] mb-1">{syncSourceName || "Larisa's Japan Guide"}</h2>
      <p className="text-xs text-[#8a7a62] mb-3">
        Wander reads from Larisa's Guide and never changes it.
      </p>
      {lastRead && (
        <div className="bg-white rounded-lg border border-[#e0d8cc] p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#8a7a62]">Last read</span>
            <span className="text-[#3a3128] font-medium">{lastRead}</span>
          </div>
        </div>
      )}
    </section>
  );
}

interface DedupSuggestion {
  id: string;
  entityType: string;
  keepName: string;
  removeName: string;
  description: string;
  autoExecuted: boolean;
  status: string;
}

function DedupSection() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<DedupSuggestion[]>([]);
  const [tripId, setTripId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "planner") return;
    const lastTrip = localStorage.getItem("wander:last-trip-id");
    const id = lastTrip || null;
    if (id) {
      setTripId(id);
      api.get<DedupSuggestion[]>(`/dedup/trip/${id}`).then(setSuggestions).catch(() => {});
    } else {
      api.get<any>("/trips/active").then(t => {
        if (t?.id) {
          setTripId(t.id);
          api.get<DedupSuggestion[]>(`/dedup/trip/${t.id}`).then(setSuggestions).catch(() => {});
        }
      });
    }
  }, [user?.role]);

  if (user?.role !== "planner" || suggestions.length === 0) return null;

  async function handleAction(id: string, action: "approve" | "reject") {
    try {
      const result = await api.post<{ note?: string }>(`/dedup/${id}/${action}`, {});
      setSuggestions(s => s.filter(x => x.id !== id));
      showToast(result.note || (action === "approve" ? "Got it" : "Restored"), "success");
    } catch {
      showToast("That didn't work — try again?", "error");
    }
  }

  return (
    <section className="border-t border-[#e0d8cc] pt-6">
      <h2 className="text-sm font-medium text-[#3a3128] mb-1">Things I tidied up</h2>
      <p className="text-xs text-[#8a7a62] mb-3">
        Duplicates I noticed and merged. Reject any that were a mistake.
      </p>
      <div className="space-y-2">
        {suggestions.map(s => (
          <div key={s.id} className="bg-white rounded-lg border border-[#e0d8cc] p-3">
            <p className="text-xs text-[#3a3128] leading-relaxed">{s.description}</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleAction(s.id, "approve")}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#f0ece5] text-[#514636] font-medium hover:bg-[#e0d8cc]"
              >
                Looks right
              </button>
              <button
                onClick={() => handleAction(s.id, "reject")}
                className="text-xs px-3 py-1.5 rounded-lg text-[#a89880] hover:text-[#6b5d4a]"
              >
                Undo
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
