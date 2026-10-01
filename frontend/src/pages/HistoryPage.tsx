import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import type { ChangeLogEntry, Trip } from "../lib/types";
import { changeRest } from "../lib/changeWords";

const RESTORABLE_ACTIONS = ["delete", "remove", "deleted", "removed"];
const RESTORABLE_ENTITIES = ["experience", "reservation", "accommodation", "route_segment", "day"];

function canRestore(log: ChangeLogEntry): boolean {
  const action = log.actionType?.toLowerCase() || "";
  const entity = log.entityType?.toLowerCase() || "";
  return (
    RESTORABLE_ACTIONS.some(a => action.includes(a)) &&
    // The kind exactly — "experience_note" isn't an "experience": a taken-back note is its author's choice, and
    // "Bring back" on one failed with "Cannot restore entity type" (round 12)
    RESTORABLE_ENTITIES.includes(entity)
  );
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [logs, setLogs] = useState<ChangeLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  const isPlanner = user?.role === "planner";

  const [unreachable, setUnreachable] = useState(false);

  // The same trip Home shows (not whichever the server last marked active for this person)
  useEffect(() => {
    const id = localStorage.getItem("wander:last-trip-id");
    (id ? api.get<Trip>(`/trips/${id}`).catch(() => api.get<Trip>("/trips/active")) : api.get<Trip>("/trips/active"))
      .then((t) => {
        if (!t) { navigate("/"); return; }
        setTrip(t);
      })
      .catch(() => { setUnreachable(true); setLoading(false); });
  }, [navigate]);

  const fetchLogs = useCallback(() => {
    if (!trip) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (search.trim()) params.set("search", search.trim());

    api.get<{ logs: ChangeLogEntry[]; total: number }>(
      `/change-logs/trip/${trip.id}?${params}`
    ).then(({ logs, total }) => {
      setLogs(logs);
      setTotal(total);
      setUnreachable(false);
      setLoading(false);
    }).catch(() => {
      // Never "No changes yet" when the truth is "couldn't look"
      setUnreachable(true);
      setLoading(false);
    });
  }, [trip, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  async function handleRestore(log: ChangeLogEntry) {
    setRestoring(log.id);
    try {
      const token = localStorage.getItem("wander_token");
      const resp = await fetch(`/api/restore/${log.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (resp.ok) {
        showToast(`Brought back ${log.entityName || "that"}`, "success");
        fetchLogs();
      } else {
        const data = await resp.json().catch(() => ({}));
        showToast(data.error || "Couldn't restore that one", "error");
      }
    } catch {
      showToast("Something went wrong — try again?", "error");
    } finally {
      setRestoring(null);
    }
  }

  function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    }
    return date.toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          {/* One back control on every screen (delight audit: seven variants) */}
          <button
            onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/"))}
            aria-label="Back"
            className="min-h-[44px] min-w-[44px] pr-3 text-sm text-[#514636]"
          >
            ‹ Back
          </button>
        </div>

        <h1 className="text-2xl font-light text-[#3a3128]">What's changed in Wander</h1>
        <p className="text-sm text-[#6b5d4a] mb-4">
          Notes, plans and additions people made here{total > 0 ? ` (${total})` : ""}. {/^larisa$/i.test(user?.displayName || "") ? "Changes to your Guide happen in your sheet." : "Changes to Larisa's Guide happen in her sheet."}
        </p>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Look for a name or place"
          className="w-full px-4 py-2 rounded-lg border border-[#e0d8cc] bg-white
                     text-[#3a3128] placeholder-[#c8bba8] text-base min-h-[44px] mb-4
                     focus:outline-none focus:ring-2 focus:ring-[#a89880]"
        />

        {/* Log entries */}
        {loading ? (
          <div className="text-center py-8 text-sm text-[#6b5d4a]">Looking back...</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const restorable = isPlanner && canRestore(log);
              return (
                <div
                  key={log.id}
                  className="px-4 py-3 bg-white rounded-lg border border-[#f0ece5]"
                >
                  {/* Wraps: at large text the time and "Bring back" go under the words, not beside them (round 12: one
                      word per line, the time cut to "Oct 1, 7:", and the page slid sideways) */}
                  <div className="flex flex-wrap items-start justify-between gap-x-2 min-w-0">
                    <div className="flex-1 min-w-[12rem] [overflow-wrap:anywhere]">
                      <span className="text-sm font-medium text-[#3a3128]">
                        {user?.displayName && log.userDisplayName === user.displayName ? "You" : log.userDisplayName}
                      </span>
                      <span className="text-sm text-[#6b5d4a] ml-1">{changeRest(log.userDisplayName, log.description)}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">

                      {restorable && (
                        <button
                          onClick={() => handleRestore(log)}
                          disabled={restoring === log.id}
                          className="text-xs text-[#6b5d4a] hover:text-[#514636] transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] px-2"
                        >
                          {restoring === log.id ? "..." : "Bring back"}
                        </button>
                      )}
                      <span className="text-sm text-[#6b5d4a] whitespace-nowrap">
                        {formatRelativeTime(log.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {logs.length === 0 && (
              <div className="text-center py-8 text-sm text-[#6b5d4a]">
                {unreachable
                  ? "Wander can't reach the trip right now, so it can't show what's changed. Try again when you have signal."
                  : search ? "Nothing matching that." : "Nobody has changed anything in Wander yet."}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
