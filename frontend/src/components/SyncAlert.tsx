/**
 * SyncAlert — Persistent banner for sync concerns (planner-only)
 *
 * Shows when the last sync had conflicts or errors.
 * Sets app badge on PWA icon. Clears on dismiss.
 */

import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface SyncStatus {
  configured: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: string;
}

interface SyncLogEntry {
  id: string;
  direction: string;
  status: string;
  summary: string;
  conflicts: any[];
  created_at: string;
}

export default function SyncAlert() {
  const { user } = useAuth();
  const [alert, setAlert] = useState<SyncLogEntry | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only show to planners
    if (user?.role !== "planner") return;

    const tripId = localStorage.getItem("wander:last-trip-id");
    if (!tripId) return;

    // Check if last sync had issues
    api.get<SyncStatus>(`/sheets-sync/status/${tripId}`).then((status) => {
      if (!status?.configured) return;
      if (status.lastSyncStatus === "conflict" || status.lastSyncStatus === "error") {
        // Fetch the conflict details
        api.get<SyncLogEntry[]>(`/sheets-sync/conflicts/${tripId}`).then((logs) => {
          if (logs.length > 0) {
            const latest = logs[0];
            setAlert(latest);

            // Set PWA badge
            if ("setAppBadge" in navigator) {
              (navigator as any).setAppBadge(1).catch(() => {});
            }
          }
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [user?.role]);

  function handleDismiss() {
    setDismissed(true);
    setAlert(null);
    // Clear PWA badge
    if ("clearAppBadge" in navigator) {
      (navigator as any).clearAppBadge().catch(() => {});
    }
  }

  if (!alert || dismissed) return null;

  const conflictCount = alert.conflicts?.length || 0;
  const isError = alert.status === "error";

  return (
    <div className={`mx-4 mb-3 px-4 py-3 rounded-xl border ${
      isError
        ? "bg-red-50 border-red-200"
        : "bg-amber-50 border-amber-200"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${isError ? "text-red-800" : "text-amber-800"}`}>
            {isError
              ? "Sync ran into trouble"
              : `Sync found ${conflictCount} conflict${conflictCount !== 1 ? "s" : ""}`
            }
          </p>
          <p className="text-xs text-[#8a7a62] mt-0.5">
            {alert.summary}
          </p>
          {conflictCount > 0 && (
            <div className="mt-2 space-y-1">
              {alert.conflicts.slice(0, 3).map((c: any, i: number) => (
                <p key={i} className="text-xs text-[#6b5d4a]">
                  <span className="font-medium">{c.entity || c.field}:</span> {c.resolution || "spreadsheet value kept"}
                </p>
              ))}
              {conflictCount > 3 && (
                <p className="text-xs text-[#a89880]">and {conflictCount - 3} more</p>
              )}
            </div>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="text-[#a89880] hover:text-[#6b5d4a] text-sm shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
