import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isNextUpEnabled, setNextUpEnabled } from "../components/NextUpOverlay";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { api } from "../lib/api";

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

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
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
        {authUser?.role === "planner" && <SheetSyncSection />}

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

// ── Spreadsheet Sync Section (planner-only) ──────────────────

const SYNC_INTERVALS = [
  { value: 0, label: "Manual only" },
  { value: 900000, label: "15 minutes" },
  { value: 1800000, label: "30 minutes" },
  { value: 3600000, label: "1 hour" },
];

interface SyncStatus {
  configured: boolean;
  spreadsheetId?: string;
  syncIntervalMs?: number;
  lastSyncAt?: string;
  lastSyncStatus?: string;
}

function SheetSyncSection() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [tripId, setTripId] = useState<string | null>(null);

  useEffect(() => {
    const lastTrip = localStorage.getItem("wander:last-trip-id");
    if (lastTrip) {
      setTripId(lastTrip);
      api.get<SyncStatus>(`/sheets-sync/status/${lastTrip}`).then(setStatus).catch(() => {});
    }
  }, []);

  async function handlePull() {
    if (!tripId) return;
    setSyncing(true);
    try {
      const result = await api.post<any>("/sheets-sync/pull", { tripId });
      showToast(result.summary || "Sync complete", result.conflicts?.length ? "info" : "success");
      const fresh = await api.get<SyncStatus>(`/sheets-sync/status/${tripId}`);
      setStatus(fresh);
    } catch (err: any) {
      showToast(err.message || "Sync failed", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function handlePush() {
    if (!tripId) return;
    setSyncing(true);
    try {
      const result = await api.post<any>("/sheets-sync/push", { tripId });
      showToast(result.summary || "Push complete", "success");
      const fresh = await api.get<SyncStatus>(`/sheets-sync/status/${tripId}`);
      setStatus(fresh);
    } catch (err: any) {
      showToast(err.message || "Push failed", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function handleIntervalChange(ms: number) {
    if (!tripId) return;
    try {
      await api.patch("/sheets-sync/config", { tripId, syncIntervalMs: ms });
      setStatus(prev => prev ? { ...prev, syncIntervalMs: ms } : prev);
      const label = SYNC_INTERVALS.find(i => i.value === ms)?.label || `${ms}ms`;
      showToast(`Sync interval: ${label}`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update", "error");
    }
  }

  if (!status?.configured) return null;

  const lastSync = status.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Never";

  return (
    <section className="border-t border-[#e0d8cc] pt-6">
      <h2 className="text-sm font-medium text-[#3a3128] mb-1">Spreadsheet sync</h2>
      <p className="text-xs text-[#8a7a62] mb-3">
        Keep Wander in sync with the shared planning spreadsheet.
      </p>

      {/* Last sync info */}
      <div className="bg-white rounded-lg border border-[#e0d8cc] p-3 mb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#8a7a62]">Last sync</span>
          <span className="text-[#3a3128] font-medium">{lastSync}</span>
        </div>
        {status.lastSyncStatus && (
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-[#8a7a62]">Status</span>
            <span className={`font-medium ${status.lastSyncStatus === "success" ? "text-green-600" : status.lastSyncStatus === "conflict" ? "text-amber-600" : "text-red-600"}`}>
              {status.lastSyncStatus === "success" ? "All good" : status.lastSyncStatus === "conflict" ? "Synced with conflicts" : "Error"}
            </span>
          </div>
        )}
      </div>

      {/* Sync buttons */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={handlePull}
          disabled={syncing}
          className="flex-1 py-2 rounded-lg bg-[#514636] text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {syncing ? "Syncing..." : "Pull from spreadsheet"}
        </button>
        <button
          onClick={handlePush}
          disabled={syncing}
          className="flex-1 py-2 rounded-lg border border-[#514636] text-[#514636] text-sm font-medium disabled:opacity-50 hover:bg-[#f0ece5] transition-colors"
        >
          Push to spreadsheet
        </button>
      </div>

      {/* Sync interval */}
      <div>
        <p className="text-xs text-[#8a7a62] mb-2">Auto-sync interval</p>
        <div className="flex gap-2 flex-wrap">
          {SYNC_INTERVALS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleIntervalChange(opt.value)}
              className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                status.syncIntervalMs === opt.value
                  ? "bg-[#514636] text-white"
                  : "bg-white border border-[#e0d8cc] text-[#6b5d4a] hover:bg-[#f0ece5]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
