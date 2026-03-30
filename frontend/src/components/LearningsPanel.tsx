import { useState, useEffect, useRef, useCallback } from "react";

interface Learning {
  id: string;
  content: string;
  scope: "general" | "trip_specific";
  source: string;
  contributor: string;
  tripId: string;
  createdAt: string;
}

interface LearningsPanelProps {
  tripId: string;
  travelerId: string;
  isOpen: boolean;
  onClose: () => void;
}

type ScopeFilter = "all" | "general" | "trip_specific";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("wander_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export default function LearningsPanel({ tripId, travelerId, isOpen, onClose }: LearningsPanelProps) {
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [loading, setLoading] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchLearnings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/learnings?tripId=${tripId}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setLearnings(data);
      }
    } catch {
      // silently fail — panel just shows empty
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    if (isOpen) {
      fetchLearnings();
    }
  }, [isOpen, fetchLearnings]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [editingId]);

  const handleAdd = async () => {
    const content = newContent.trim();
    if (!content || saving) return;

    setSaving(true);
    try {
      const res = await fetch("/api/learnings", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          travelerId,
          tripId,
          content,
          scope: "general",
          source: "dedicated",
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setLearnings((prev) => [created, ...prev]);
        setNewContent("");
      }
    } catch {
      // fail silently
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (id: string) => {
    const content = editContent.trim();
    if (!content) return;

    try {
      const res = await fetch(`/api/learnings/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setLearnings((prev) =>
          prev.map((l) => (l.id === id ? { ...l, content } : l))
        );
      }
    } catch {
      // fail silently
    } finally {
      setEditingId(null);
      setEditContent("");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/learnings/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setLearnings((prev) => prev.filter((l) => l.id !== id));
      }
    } catch {
      // fail silently
    } finally {
      setDeletingId(null);
    }
  };

  const startEditing = (learning: Learning) => {
    setEditingId(learning.id);
    setEditContent(learning.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent("");
  };

  const filtered = learnings.filter((l) => {
    if (scopeFilter === "all") return true;
    return l.scope === scopeFilter;
  });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-50"
        onClick={onClose}
      />

      {/* Panel — slide up from bottom */}
      <div
        ref={panelRef}
        className="fixed z-50 flex flex-col bg-[#faf8f5] shadow-2xl border border-[#e5ddd0]
          inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl
          sm:inset-auto sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2 sm:w-[480px] sm:max-h-[600px] sm:rounded-2xl"
        style={{ animation: "slideUp 0.25s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5ddd0]">
          <span className="text-sm font-medium text-[#3a3128]">Trip learnings</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8a7a62] hover:bg-[#f0ebe3]"
            aria-label="Close learnings panel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* Scope filter */}
        <div className="flex gap-1 px-4 py-2 border-b border-[#e5ddd0]">
          {([
            ["all", "Everything"],
            ["general", "All trips"],
            ["trip_specific", "This trip"],
          ] as [ScopeFilter, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setScopeFilter(value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                scopeFilter === value
                  ? "bg-[#514636] text-[#faf8f5]"
                  : "bg-[#f0ebe3] text-[#8a7a62] hover:bg-[#e5ddd0]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Add new learning */}
        <div className="px-4 py-3 border-b border-[#e5ddd0]">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="Something you learned on this trip..."
              rows={2}
              className="flex-1 bg-[#f0ebe3] rounded-xl px-3.5 py-2.5 text-sm text-[#3a3128] placeholder:text-[#a89880] outline-none focus:ring-2 focus:ring-[#514636]/20 resize-none"
            />
            <button
              onClick={handleAdd}
              disabled={saving || !newContent.trim()}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-30"
              style={{ backgroundColor: "#514636", color: "#faf8f5" }}
            >
              {saving ? "..." : "Save"}
            </button>
          </div>
        </div>

        {/* Learnings list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {loading && (
            <div className="text-center text-[#a89880] text-sm py-8">
              Finding your learnings...
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center text-[#a89880] text-sm py-8">
              No learnings yet — these build up as you travel together
            </div>
          )}

          {filtered.map((learning) => (
            <div
              key={learning.id}
              className="rounded-xl bg-[#f0ebe3] px-3.5 py-3 group"
            >
              {editingId === learning.id ? (
                <div>
                  <textarea
                    ref={editRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleEdit(learning.id);
                      }
                      if (e.key === "Escape") cancelEditing();
                    }}
                    onBlur={() => handleEdit(learning.id)}
                    rows={3}
                    className="w-full bg-white rounded-lg px-3 py-2 text-sm text-[#3a3128] outline-none focus:ring-2 focus:ring-[#514636]/20 resize-none"
                  />
                </div>
              ) : (
                <>
                  <p
                    className="text-sm text-[#3a3128] leading-relaxed cursor-text"
                    onClick={() => startEditing(learning)}
                  >
                    {learning.content}
                  </p>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2 text-xs text-[#a89880]">
                      <span>{learning.contributor}</span>
                      <span>&middot;</span>
                      <span>{formatDate(learning.createdAt)}</span>
                      {learning.source && learning.source !== "dedicated" && (
                        <>
                          <span>&middot;</span>
                          <span>{learning.source}</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          learning.scope === "general"
                            ? "bg-[#e5ddd0] text-[#6b5d4a]"
                            : "bg-[#d4c9b8] text-[#514636]"
                        }`}
                      >
                        {learning.scope === "general" ? "All trips" : "This trip"}
                      </span>

                      {deletingId === learning.id ? (
                        <div className="flex items-center gap-1 ml-1">
                          <button
                            onClick={() => handleDelete(learning.id)}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                          >
                            Remove
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#e5ddd0] text-[#8a7a62] hover:bg-[#d4c9b8] transition-colors"
                          >
                            Keep
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingId(learning.id)}
                          className="ml-1 p-1 rounded text-[#c8bba8] hover:text-red-500 hover:bg-red-50 transition-all"
                          aria-label="Remove learning"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Slide-up animation */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @media (min-width: 640px) {
          @keyframes slideUp {
            from { opacity: 0; transform: translate(-50%, 20px); }
            to { opacity: 1; transform: translate(-50%, 0); }
          }
        }
      `}</style>
    </>
  );
}
