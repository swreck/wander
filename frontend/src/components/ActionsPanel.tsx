/**
 * ActionsPanel — Planning actions synced with Larisa's Japan Guide Actions tab
 *
 * Full CRUD: view, add, edit, mark done. Bidirectional sync.
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
  andyStatus?: string | null;
  larisaStatus?: string | null;
  statusNotes?: string | null;
  sheetRowRef: string | null;
}

interface Decision {
  id: string;
  title: string;
  cityId: string;
  status: string;
  options: { id: string; name: string }[];
  votes: { userCode: string; displayName: string; optionId: string | null; rank: number }[];
}

interface Props {
  tripId: string;
  onClose: () => void;
  decisions?: Decision[];
  userCode?: string;
  onNavigate?: (path: string) => void;
  syncSourceName?: string; // display name of the source spreadsheet (e.g. "Claude's Japan Oct 2026.4.8")
}

export default function ActionsPanel({ tripId, onClose, decisions, userCode, onNavigate, syncSourceName }: Props) {
  const { showToast } = useToast();
  const [actions, setActions] = useState<PlanningAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Add form
  const [newAction, setNewAction] = useState("");
  const [newOwner, setNewOwner] = useState("Both");
  const [newDue, setNewDue] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Edit form
  const [editNotes, setEditNotes] = useState("");

  // Done section toggle — must be above early return to avoid hooks ordering violation
  const [showDone, setShowDone] = useState(false);

  function loadActions() {
    api.get<PlanningAction[]>(`/sheets-sync/actions/${tripId}`)
      .then(setActions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadActions(); }, [tripId]);

  // Escape key closes the panel (standard overlay behavior)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function handleAdd() {
    if (!newAction.trim()) return;
    try {
      await api.post("/sheets-sync/actions", {
        tripId,
        action: newAction.trim(),
        owner: newOwner,
        dueDate: newDue || null,
        notes: newNotes || null,
      });
      setNewAction(""); setNewOwner("Both"); setNewDue(""); setNewNotes("");
      setAdding(false);
      showToast("Added — will sync to Larisa's Guide", "success");
      loadActions();
    } catch {
      showToast("Couldn't add that", "error");
    }
  }

  async function handleToggleDone(action: PlanningAction) {
    const newStatus = action.status === "done" ? "open" : "done";
    try {
      await api.patch(`/sheets-sync/actions/${action.id}`, { status: newStatus });
      loadActions();
    } catch {
      showToast("Couldn't update", "error");
    }
  }

  async function handleSaveNotes(actionId: string) {
    try {
      await api.patch(`/sheets-sync/actions/${actionId}`, { notes: editNotes });
      setEditingId(null);
      loadActions();
    } catch {
      showToast("Couldn't save", "error");
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-[#faf8f5] flex items-center justify-center">
        <p className="text-sm text-[#8a7a62]">Loading...</p>
      </div>
    );
  }

  const open = actions.filter(a => a.status === "open");
  const done = actions.filter(a => a.status === "done");

  // Decisions that need THIS user's input
  const needsMyInput = (decisions || []).filter(dec => {
    const myVotes = dec.votes.filter(v => v.userCode === userCode);
    return myVotes.length === 0; // user hasn't voted at all
  });

  // Map action names to Wander destinations
  // For hotel actions, the action name usually contains the city (e.g., "Hotel-Tokyo",
  // "Tokyo hotel", "Kyoto hotel"). Extract the city name and route to the matching
  // decision. Previously this matched ANY hotel decision and sent users to the wrong
  // city — Hotel-Tokyo → Kyoto bug caught in Chrome UX testing.
  const KNOWN_CITIES = ["tokyo", "kyoto", "osaka", "okayama", "nagoya", "nikko", "hakata", "karatsu", "shirakabeso"];
  function getActionDestination(action: PlanningAction): string | null {
    const name = action.action.toLowerCase();
    if (name.includes("hotel")) {
      // Try to find a city name in the action name first
      const cityInAction = KNOWN_CITIES.find(c => name.includes(c));
      if (cityInAction) {
        const matchingDec = (decisions || []).find(d =>
          d.title.toLowerCase().includes(cityInAction)
        );
        if (matchingDec) return `/plan?city=${matchingDec.cityId}`;
      }
      // Fallback: first hotel decision (better than nothing, but inexact)
      const hotelDec = (decisions || []).find(d => d.title.toLowerCase().includes("hotel"));
      if (hotelDec) return `/plan?city=${hotelDec.cityId}`;
    }
    if (name.includes("restaurant") || name.includes("food")) {
      return "/plan";
    }
    if (name.includes("activit")) {
      return "/plan";
    }
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#faf8f5] overflow-y-auto"
         style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur-sm border-b border-[#e0d8cc] px-4 py-3 flex items-center justify-between"
           style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-[#8a7a62] hover:text-[#3a3128] min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-medium text-[#3a3128]">What's happening</h1>
            <span className="text-[10px] text-[#a89880]">Synced with {syncSourceName || "Larisa's Japan Guide"}</span>
          </div>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="text-sm text-[#514636] font-medium hover:text-[#3a3128] min-h-[44px] flex items-center"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">

        {/* ── Section 1: Needs your input ── */}
        {needsMyInput.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-amber-700 uppercase tracking-wider font-medium mb-2">
              {needsMyInput.length === 1 ? "Your thoughts?" : `${needsMyInput.length} things could use your input`}
            </div>
            <div className="space-y-2">
              {needsMyInput.map(dec => {
                const voterCount = new Set(dec.votes.map(v => v.userCode)).size;
                const voterNames = [...new Set(dec.votes.map(v => v.displayName))];
                return (
                  <button
                    key={dec.id}
                    onClick={() => onNavigate?.(`/plan?city=${dec.cityId}`)}
                    className="w-full text-left p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-50 transition-colors"
                  >
                    <div className="text-sm font-medium text-[#3a3128]">{dec.title}</div>
                    <div className="text-xs text-[#8a7a62] mt-1">
                      {dec.options.length} option{dec.options.length !== 1 ? "s" : ""}
                      {voterCount > 0 && ` · ${voterNames.join(", ")} weighed in`}
                    </div>
                    <div className="text-xs text-amber-700 mt-1">Tap to weigh in →</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Section 2: Coming up (Guide Actions) ── */}
        {open.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-[#a89880] uppercase tracking-wider font-medium mb-2">Coming up</div>
            <div className="space-y-2">
              {open.map((a) => {
                const dest = getActionDestination(a);
                return (
                  <div key={a.id} className="bg-white rounded-xl border border-[#e8e0d4] p-3.5">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => handleToggleDone(a)}
                        className="mt-0.5 w-6 h-6 rounded-full border-2 border-[#c8bba8] hover:border-[#514636] transition-colors shrink-0"
                        title="Mark done"
                        aria-label={`Mark ${a.action} as done`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-[#3a3128]">{a.action}</div>
                          {dest && (
                            <button
                              onClick={() => onNavigate?.(dest)}
                              className="text-xs text-[#a89880] hover:text-[#514636] shrink-0 ml-2"
                            >
                              Go →
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-[#8a7a62] mt-1 flex items-center gap-2 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-[#f0ece5] text-[#6b5d4a] font-medium">
                            {a.owner === "Both" ? "Group" : a.owner === "LF" ? "Larisa" : a.owner === "KR" ? "Ken" : a.owner}
                          </span>
                          {a.dueDate && a.dueDate !== "TBD" && (() => {
                            // Check if overdue
                            const match = a.dueDate.match(/^(\d{1,2})\/(\d{1,2})$/);
                            const isOverdue = match ? new Date(2026, parseInt(match[1]) - 1, parseInt(match[2])) < new Date(new Date().toDateString()) : false;
                            return <span className={isOverdue ? "text-amber-600" : ""}>{isOverdue ? "was aiming for " : "around "}{a.dueDate}</span>;
                          })()}
                          {a.sheetRowRef && <span className="text-[10px] text-[#b8a990]">from Guide</span>}
                        </div>

                        {/* Per-person status pills from Larisa's Actions tab.
                            Only renders when at least one is set. Uses a compact green
                            check for DONE, amber dot for In Progress, grey for N/A, and
                            the raw text for anything else (Larisa's vocabulary evolves). */}
                        {(a.andyStatus || a.larisaStatus) && (
                          <div className="text-[11px] mt-1 flex items-center gap-2 flex-wrap">
                            {a.larisaStatus && (() => {
                              const s = a.larisaStatus.toLowerCase();
                              const isDone = s === "done";
                              const isProgress = s.includes("progress");
                              const isNA = s === "n/a" || s === "na";
                              return (
                                <span className={`inline-flex items-center gap-1 ${isDone ? "text-green-700" : isProgress ? "text-amber-600" : isNA ? "text-[#c8bba8]" : "text-[#8a7a62]"}`}>
                                  <span className="font-medium">Larisa</span>
                                  <span>{isDone ? "✓ done" : isProgress ? "· in progress" : isNA ? "n/a" : a.larisaStatus}</span>
                                </span>
                              );
                            })()}
                            {a.andyStatus && (() => {
                              const s = a.andyStatus.toLowerCase();
                              const isDone = s === "done";
                              const isProgress = s.includes("progress");
                              const isNA = s === "n/a" || s === "na";
                              return (
                                <span className={`inline-flex items-center gap-1 ${isDone ? "text-green-700" : isProgress ? "text-amber-600" : isNA ? "text-[#c8bba8]" : "text-[#8a7a62]"}`}>
                                  <span className="font-medium">Andy</span>
                                  <span>{isDone ? "✓ done" : isProgress ? "· in progress" : isNA ? "n/a" : a.andyStatus}</span>
                                </span>
                              );
                            })()}
                          </div>
                        )}

                        {/* Status notes from the Guide — Larisa's free-text summary of
                            where the item stands (e.g., "Flights booked and info copied"). */}
                        {a.statusNotes && (
                          <p className="text-[11px] text-[#8a7a62] mt-1 italic leading-relaxed">
                            {a.statusNotes}
                          </p>
                        )}

                        {/* Notes */}
                        {editingId === a.id ? (
                          <div className="mt-2.5">
                            <textarea
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              rows={2}
                              className="w-full text-sm px-3 py-2 rounded-lg border border-[#e0d8cc] focus:outline-none focus:ring-1 focus:ring-[#a89880] resize-none"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveNotes(a.id); } if (e.key === "Escape") setEditingId(null); }}
                            />
                            <div className="flex justify-end gap-2 mt-1.5">
                              <button onClick={() => setEditingId(null)} className="text-xs text-[#a89880]">Cancel</button>
                              <button onClick={() => handleSaveNotes(a.id)} className="text-xs text-white bg-[#514636] px-3 py-1 rounded-lg font-medium">Save</button>
                            </div>
                          </div>
                        ) : a.notes ? (
                          <p
                            className="text-sm text-[#6b5d4a] mt-2 leading-relaxed cursor-text bg-[#faf8f5] rounded-lg px-3 py-2"
                            onClick={() => { setEditingId(a.id); setEditNotes(a.notes || ""); }}
                          >
                            {a.notes}
                          </p>
                        ) : (
                          <button
                            className="text-xs text-[#c8bba8] hover:text-[#8a7a62] mt-2 transition-colors"
                            onClick={() => { setEditingId(a.id); setEditNotes(""); }}
                          >
                            Add a note
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add form */}
        {adding && (
          <div className="mb-6 bg-white rounded-xl border border-[#e8e0d4] p-4 space-y-3">
            <input
              value={newAction}
              onChange={(e) => setNewAction(e.target.value)}
              placeholder="What needs to happen?"
              className="w-full text-sm px-3 py-2 rounded-lg border border-[#e0d8cc] focus:outline-none focus:ring-1 focus:ring-[#a89880]"
              autoFocus
            />
            <div className="flex gap-2">
              <select
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg border border-[#e0d8cc] bg-white text-[#3a3128]"
              >
                <option value="Both">Group</option>
                <option value="Ken">Ken</option>
                <option value="Larisa">Larisa</option>
                <option value="Julie">Julie</option>
                <option value="Andy">Andy</option>
              </select>
              <input
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                placeholder="Due (e.g. 4/15)"
                className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-[#e0d8cc] focus:outline-none"
              />
            </div>
            <input
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full text-xs px-3 py-1.5 rounded-lg border border-[#e0d8cc] focus:outline-none"
            />
            <button
              onClick={handleAdd}
              disabled={!newAction.trim()}
              className="w-full py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium disabled:opacity-40"
            >
              Add
            </button>
          </div>
        )}

        {actions.length === 0 && !adding && needsMyInput.length === 0 && (
          <p className="text-sm text-[#a89880] text-center py-8">Nothing happening yet</p>
        )}

        {/* ── Section 3: Done — collapsed by default ── */}
        {done.length > 0 && (
          <div>
            <button
              onClick={() => setShowDone(!showDone)}
              className="text-xs text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
            >
              {showDone ? "Hide" : `${done.length} done`}
            </button>
            {showDone && (
              <div className="mt-2 space-y-1.5">
                {done.map((a) => (
                  <div key={a.id} className="bg-white/50 rounded-lg border border-[#f0ece5] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleDone(a)}
                        className="w-5 h-5 rounded-full bg-[#514636] border-2 border-[#514636] shrink-0 flex items-center justify-center"
                        title="Reopen"
                      >
                        <span className="text-white text-[10px]">✓</span>
                      </button>
                      <span className="text-sm text-[#a89880] line-through">{a.action}</span>
                    </div>
                    {a.notes && <p className="text-[11px] text-[#c8bba8] ml-7 mt-0.5">{a.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
