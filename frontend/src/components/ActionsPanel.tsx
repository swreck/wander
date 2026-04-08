/**
 * ActionsPanel — Dedicated view of planning actions from Larisa's Japan Guide
 *
 * Shows the full actions list synced with the Guide's Actions tab.
 * Each action shows: name, owner, due date, notes, status.
 * Bidirectional — add here, it pushes to the Guide.
 */

import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";

interface PlanningAction {
  id: string;
  action: string;
  owner: string;
  dueDate: string | null;
  notes: string | null;
  status: string;
  sheetRowRef: string | null;
}

interface Props {
  tripId: string;
  onClose: () => void;
}

export default function ActionsPanel({ tripId, onClose }: Props) {
  const { showToast } = useToast();
  const [actions, setActions] = useState<PlanningAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<PlanningAction[]>(`/sheets-sync/actions/${tripId}`)
      .then(setActions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tripId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <p className="text-sm text-[#8a7a62]">Loading actions...</p>
      </div>
    );
  }

  const open = actions.filter(a => a.status === "open");
  const done = actions.filter(a => a.status === "done");

  return (
    <div className="fixed inset-0 z-50 bg-[#faf8f5] overflow-y-auto"
         style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur-sm border-b border-[#e0d8cc] px-4 py-3 flex items-center gap-3"
           style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
        <button onClick={onClose} className="text-[#8a7a62] hover:text-[#3a3128]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-lg font-medium text-[#3a3128]">What's happening</h1>
        <span className="text-xs text-[#a89880]">from Larisa's Japan Guide</span>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {actions.length === 0 && (
          <p className="text-sm text-[#a89880] text-center py-8">No actions yet</p>
        )}

        {/* Open actions */}
        {open.map((a) => (
          <div key={a.id} className="bg-white rounded-xl border border-[#e8e0d4] p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#3a3128]">{a.action}</div>
                <div className="text-xs text-[#8a7a62] mt-1 flex items-center gap-2 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded bg-[#f0ece5] text-[#6b5d4a]">
                    {a.owner === "Both" ? "Group" : a.owner}
                  </span>
                  {a.dueDate && (
                    <span>by {a.dueDate}</span>
                  )}
                  {a.sheetRowRef && (
                    <span className="text-[#b8a990]" title="Synced with Larisa's Japan Guide">↔</span>
                  )}
                </div>
                {a.notes && (
                  <p className="text-xs text-[#8a7a62] mt-2 italic">{a.notes}</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Done actions */}
        {done.length > 0 && (
          <>
            <div className="text-xs text-[#a89880] uppercase tracking-wider mt-4">Done</div>
            {done.map((a) => (
              <div key={a.id} className="bg-white/50 rounded-xl border border-[#f0ece5] p-3 opacity-60">
                <div className="text-sm text-[#8a7a62] line-through">{a.action}</div>
                {a.notes && <p className="text-[11px] text-[#a89880] mt-1">{a.notes}</p>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
