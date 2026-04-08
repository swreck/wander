/**
 * AutoSync — Background sync timer for Larisa's Japan Guide
 *
 * Runs pull+push at the configured interval. Silent unless there's
 * something to report (new items, conflicts). Dispatches data-changed
 * event so pages refresh.
 */

import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";

interface SyncConfig {
  configured: boolean;
  syncIntervalMs?: number;
  lastSyncAt?: string;
}

export default function AutoSync() {
  const { showToast } = useToast();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const tripId = localStorage.getItem("wander:last-trip-id");
    if (!tripId) return;

    // Check sync config
    api.get<SyncConfig>(`/sheets-sync/status/${tripId}`).then((config) => {
      if (!config?.configured || !config.syncIntervalMs || config.syncIntervalMs === 0) return;

      // Clear any existing timer
      if (timerRef.current) clearInterval(timerRef.current);

      // Run at the configured interval
      timerRef.current = setInterval(async () => {
        try {
          const pullResult = await api.post<any>("/sheets-sync/pull", { tripId });
          const pushResult = await api.post<any>("/sheets-sync/push", { tripId });
          const added = (pullResult.added || 0) + (pushResult.pushed || 0);
          const conflicts = pullResult.conflicts?.length || 0;

          if (added > 0 || conflicts > 0) {
            showToast(
              `Synced: ${added} new${conflicts ? `, ${conflicts} conflicts` : ""}`,
              conflicts ? "info" : "success",
            );
            window.dispatchEvent(new CustomEvent("wander:data-changed"));
          }
        } catch {
          // Silent fail — don't bother user with background sync errors
        }
      }, config.syncIntervalMs);
    }).catch(() => {});

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [showToast]);

  return null;
}
