import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import type { ChangeLogEntry, Trip } from "../lib/types";

const RESTORABLE_ACTIONS = ["delete", "remove", "deleted", "removed"];
const RESTORABLE_ENTITIES = ["experience", "reservation", "accommodation", "route_segment", "day"];

function canRestore(log: ChangeLogEntry): boolean {
  const action = log.actionType?.toLowerCase() || "";
  const entity = log.entityType?.toLowerCase() || "";
  return (
    RESTORABLE_ACTIONS.some(a => action.includes(a)) &&
    RESTORABLE_ENTITIES.some(e => entity.includes(e))
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

  useEffect(() => {
    api.get<Trip>("/trips/active").then((t) => {
      if (!t) { navigate("/"); return; }
      setTrip(t);
    });
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
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-[#8a7a62] hover:text-[#3a3128]"
          >
            &larr; Back
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#c8bba8]">{total} changes</span>
            <button onClick={() => navigate("/guide")} className="text-sm text-[#c8bba8] hover:text-[#8a7a62] transition-colors" aria-label="Guide">?</button>
          </div>
        </div>

        <h1 className="text-2xl font-light text-[#3a3128] mb-4">History</h1>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search changes... (name, person, action)"
          className="w-full px-4 py-2 rounded-lg border border-[#e0d8cc] bg-white
                     text-[#3a3128] placeholder-[#c8bba8] text-sm mb-4
                     focus:outline-none focus:ring-2 focus:ring-[#a89880]"
        />

        {/* Log entries */}
        {loading ? (
          <div className="text-center py-8 text-sm text-[#8a7a62]">Looking back...</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const restorable = isPlanner && canRestore(log);
              return (
                <div
                  key={log.id}
                  className="px-4 py-3 bg-white rounded-lg border border-[#f0ece5]"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <span className="text-sm font-medium text-[#3a3128]">
                        {log.userDisplayName}
                      </span>
                      <span className="text-sm text-[#8a7a62] ml-1">{log.description}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      {restorable && (
                        <button
                          onClick={() => handleRestore(log)}
                          disabled={restoring === log.id}
                          className="text-xs text-[#a89880] hover:text-[#514636] transition-colors disabled:opacity-50"
                        >
                          {restoring === log.id ? "..." : "Bring back"}
                        </button>
                      )}
                      <span className="text-sm text-[#c8bba8] whitespace-nowrap">
                        {formatRelativeTime(log.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {logs.length === 0 && (
              <div className="text-center py-8 text-sm text-[#c8bba8]">
                {search ? "Nothing matching that." : "No changes yet."}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
