import { useState, useEffect, useCallback } from "react";

interface Approval {
  id: string;
  type: string;
  description: string;
  requester: { displayName: string };
  createdAt: string;
  status: string;
}

interface ApprovalQueueProps {
  tripId: string;
  isOpen: boolean;
  onClose: () => void;
  onReviewed: () => void;
}

export default function ApprovalQueue({ tripId, isOpen, onClose, onReviewed }: ApprovalQueueProps) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectNoteId, setRejectNoteId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const getHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem("wander_token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }, []);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/approvals/${tripId}`, { headers: getHeaders() });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setApprovals(data.filter((a: Approval) => a.status === "pending"));
    } catch {
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [tripId, getHeaders]);

  useEffect(() => {
    if (isOpen) fetchApprovals();
  }, [isOpen, fetchApprovals]);

  const handleReview = useCallback(async (id: string, decision: "approved" | "rejected", note?: string) => {
    setReviewingId(id);
    try {
      const body: { decision: string; note?: string } = { decision };
      if (note?.trim()) body.note = note.trim();

      const res = await fetch(`/api/approvals/${id}/review`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Failed: ${res.status}`);

      setApprovals((prev) => prev.filter((a) => a.id !== id));
      setRejectNoteId(null);
      setRejectNote("");
      onReviewed();
    } catch {
      // Silently fail — the card stays visible so they can retry
    } finally {
      setReviewingId(null);
    }
  }, [getHeaders, onReviewed]);

  if (!isOpen) return null;

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-50"
        onClick={onClose}
      />

      {/* Slide-up panel */}
      <div
        className="fixed z-50 inset-x-0 bottom-0 flex flex-col bg-[#faf8f5] shadow-2xl border-t border-[#e5ddd0]
          max-h-[75vh] rounded-t-2xl
          sm:inset-auto sm:bottom-6 sm:right-6 sm:left-auto sm:w-[420px] sm:max-h-[500px] sm:rounded-2xl sm:border"
        style={{ animation: "slideUp 0.25s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5ddd0]">
          <span className="text-sm font-medium text-[#3a3128]">
            Needs your eye
            {approvals.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#514636] text-[#faf8f5] text-xs">
                {approvals.length}
              </span>
            )}
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8a7a62] hover:bg-[#f0ebe3]"
            aria-label="Close approval queue"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {loading && (
            <div className="text-center text-[#a89880] text-sm py-8">
              Checking in...
            </div>
          )}

          {!loading && approvals.length === 0 && (
            <div className="text-center text-[#a89880] text-sm py-8">
              <p>Nothing to review — your group is in sync</p>
            </div>
          )}

          {!loading && approvals.map((approval) => (
            <div
              key={approval.id}
              className="rounded-xl border border-[#e5ddd0] bg-[#f7f3ee] px-4 py-3"
            >
              {/* Who and when */}
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-sm font-medium text-[#3a3128]">
                  {approval.requester.displayName}
                </span>
                <span className="text-xs text-[#a89880]">
                  {formatTime(approval.createdAt)}
                </span>
              </div>

              {/* What they want to do */}
              <p className="text-sm text-[#514636] leading-relaxed mb-3">
                {approval.description}
              </p>

              {/* Reject note input (shown when rejecting) */}
              {rejectNoteId === approval.id && (
                <div className="mb-3">
                  <textarea
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Want to say why? (optional)"
                    rows={2}
                    className="w-full bg-white rounded-lg px-3 py-2 text-sm text-[#3a3128] placeholder:text-[#a89880] outline-none focus:ring-2 focus:ring-[#514636]/20 border border-[#e5ddd0] resize-none"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleReview(approval.id, "rejected", rejectNote)}
                      disabled={reviewingId === approval.id}
                      className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-[#f0ebe3] text-[#514636] hover:bg-[#e5ddd0] transition-colors disabled:opacity-50"
                    >
                      {reviewingId === approval.id ? "Sending..." : "Send"}
                    </button>
                    <button
                      onClick={() => { setRejectNoteId(null); setRejectNote(""); }}
                      className="px-3 py-1.5 text-sm rounded-lg text-[#a89880] hover:bg-[#f0ebe3] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons (hidden when reject note is showing) */}
              {rejectNoteId !== approval.id && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReview(approval.id, "approved")}
                    disabled={reviewingId === approval.id}
                    className="flex-1 px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50"
                    style={{ backgroundColor: "#514636", color: "#faf8f5" }}
                  >
                    {reviewingId === approval.id ? "On it..." : "Looks good"}
                  </button>
                  <button
                    onClick={() => setRejectNoteId(approval.id)}
                    disabled={reviewingId === approval.id}
                    className="flex-1 px-3 py-2 text-sm rounded-lg bg-[#f0ebe3] text-[#514636] hover:bg-[#e5ddd0] transition-colors disabled:opacity-50"
                  >
                    Not this time
                  </button>
                </div>
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
      `}</style>
    </>
  );
}
