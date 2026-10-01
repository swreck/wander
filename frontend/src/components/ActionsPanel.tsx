/**
 * ActionsPanel — "Actions": the Guide's deadlines coming up, then the to-dos from Larisa's
 * Actions tab (read-only — she ticks them in her sheet), then any to-dos added in Wander
 * (those can be ticked and noted here). Wander never writes to the Guide.
 */

import { useState, useEffect, Fragment } from "react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { guideData, type TripGuideData } from "../lib/guideData";
import { deadlineOver, deadlineTimeWords, deadlineWhen, bookedByName, bookedWords } from "../lib/guideDisplay";
import { useAuth } from "../contexts/AuthContext";

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
  createdBy?: string | null;
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

/** "2026-04-15" or "4/15" → a date (the trip's year for "4/15"); null for "TBD" or anything else. */
function parseDue(due: string | null): Date | null {
  if (!due || due === "null") return null;
  const iso = due.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const md = due.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (md) return new Date(2026, +md[1] - 1, +md[2]);
  return null;
}

function isPastDue(due: string | null, todayStart: Date): boolean {
  const d = parseDue(due);
  return !!d && d < todayStart;
}

/** "Apr 15" — how a person writes a date. Falls back to the Guide's own text. */
function dueWords(due: string): string {
  const d = parseDue(due);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : due;
}

export default function ActionsPanel({ tripId, onClose, decisions, userCode, onNavigate, syncSourceName }: Props) {
  const { showToast } = useToast();
  // Who is looking — a deadline says whose to-do it is ("Larisa's to do …")
  const me = useAuth().user?.displayName || null;
  const [actions, setActions] = useState<PlanningAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // Add form
  const [newAction, setNewAction] = useState("");
  const [newOwner, setNewOwner] = useState("Both");
  const [newDue, setNewDue] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Edit form
  const [editNotes, setEditNotes] = useState("");

  // Done section toggle — must be above early return to avoid hooks ordering violation
  const [showDone, setShowDone] = useState(false);
  // With no signal: the list this phone saved, or an honest "can't load" (never a false "nothing")
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [guide, setGuide] = useState<TripGuideData | null>(null);

  function loadActions() {
    const key = `wander:actions-copy:${tripId}`;
    api.get<PlanningAction[]>(`/sheets-sync/actions/${tripId}`)
      .then((list) => {
        setActions(list); setSavedAt(null); setUnreachable(false);
        try { localStorage.setItem(key, JSON.stringify({ list, savedAt: new Date().toISOString() })); } catch { /* full */ }
      })
      .catch(() => {
        try {
          const raw = localStorage.getItem(key);
          if (raw) { const saved = JSON.parse(raw); setActions(saved.list); setSavedAt(saved.savedAt); return; }
        } catch { /* unreadable */ }
        setUnreachable(true);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadActions(); }, [tripId]);
  useEffect(() => { guideData(tripId).then(setGuide).catch(() => { /* deadlines just don't show */ }); }, [tripId]);

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
      showToast("Got it — saved here in Wander", "success");
      loadActions();
    } catch {
      showToast("Couldn't add that", "error");
    }
  }

  // A to-do added in Wander can be taken out again (round 12: a tester's couldn't — there was no way to)
  async function handleRemove(id: string) {
    try {
      await api.delete(`/sheets-sync/actions/${id}`);
      setConfirmRemoveId(null);
      loadActions();
    } catch {
      showToast("That didn't come out — try again?", "error");
    }
  }

  // Only whoever added it in Wander can take it out, open or done (round 12: Ken was offered "Take out" on
  // Larisa's; a ticked one of your own had to be un-ticked first). Older ones, from before Wander noted who, anyone.
  const canTakeOut = (a: PlanningAction) => !a.sheetRowRef && (!a.createdBy || a.createdBy === me);
  const whoAdded = (a: PlanningAction) => a.sheetRowRef ? "in Larisa's Guide" : !a.createdBy ? "added in Wander" : a.createdBy === me ? "added by you" : `added by ${a.createdBy}`;
  const takeOut = (a: PlanningAction) => !canTakeOut(a) ? null : confirmRemoveId === a.id ? (
    <span className="inline-flex items-center gap-1">
      <span className="text-[#3a3128]">Take this out?</span>
      <button onClick={() => handleRemove(a.id)} className="min-h-[44px] px-2 text-sm text-red-600 font-medium">Take out</button>
      <button onClick={() => setConfirmRemoveId(null)} className="min-h-[44px] px-2 text-sm text-[#6b5d4a]">Keep</button>
    </span>
  ) : (
    <button onClick={() => setConfirmRemoveId(a.id)} className="min-h-[44px] px-2 text-sm text-[#6b5d4a] underline underline-offset-2">Take out</button>
  );

  async function handleToggleDone(action: PlanningAction) {
    const newStatus = action.status === "done" ? "open" : "done";
    try {
      await api.patch(`/sheets-sync/actions/${action.id}`, { status: newStatus });
      loadActions();
    } catch {
      showToast(navigator.onLine ? "That tick didn't stick — try again?" : "No signal — that tick didn't save. Try again when you're back online.", "error");
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
        <p className="text-sm text-[#6b5d4a]">Loading...</p>
      </div>
    );
  }

  // Due dates arrive as "2026-04-15" (from the Guide) or "4/15" (typed here). Past-due ones aren't
  // "coming up" — they're earlier to-dos in the Guide, shown quietly below.
  const todayStart = new Date(new Date().toDateString());
  const upcoming = actions.filter(a => a.status === "open" && !isPastDue(a.dueDate, todayStart));
  const earlier = actions.filter(a => a.status === "open" && isPastDue(a.dueDate, todayStart));
  const open = [...upcoming, ...earlier];
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
        if (matchingDec) return `/ideas?city=${matchingDec.cityId}`;
      }
      return null;
    }
    if (name.includes("restaurant") || name.includes("food") || name.includes("activit")) {
      return "/ideas";
    }
    return null;
  }

  // Deadlines from the Guide in the next two weeks — the same list as Home, where people look for "things to do"
  const tz = guide?.trip.timeZone || "Asia/Tokyo";
  const todayYmd = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  const in14 = (() => { const d = new Date(`${todayYmd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 14); return d.toISOString().slice(0, 10); })();
  const deadlines = (guide?.items || [])
    .filter((i) => i.kind === "deadline" && !deadlineOver(i, tz) && (i.windowStart || (i.date || "").slice(0, 10)) <= in14)
    .sort((a, b) => (a.windowStart || (a.date || "").slice(0, 10)).localeCompare(b.windowStart || (b.date || "").slice(0, 10)));

  return (
    <div className="fixed inset-0 z-50 bg-[#faf8f5] overflow-y-auto"
         style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px + var(--scout-dock, 0px))" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur-sm border-b border-[#e0d8cc] px-4 py-3 flex items-center justify-between"
           style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-[#6b5d4a] hover:text-[#3a3128] min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-medium text-[#3a3128]">Actions</h1>
            <span className="text-xs text-[#6b5d4a]">Deadlines and to-dos from {syncSourceName ? "Larisa's Guide" : "Larisa's Guide"}</span>
          </div>
        </div>
        <button
          // Cancel clears what was typed, as on every other form (a tester's draft came back after Cancel)
          onClick={() => { if (adding) { setNewAction(""); setNewOwner("Both"); setNewDue(""); setNewNotes(""); } setAdding(!adding); }}
          className="text-sm text-[#514636] font-medium hover:text-[#3a3128] min-h-[44px] min-w-[44px] justify-end flex items-center"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">

        {savedAt && (
          <p className="mb-4 text-sm text-[#6b5d4a] bg-white/70 border border-[#e0d8cc] rounded-lg px-3 py-2" role="status">
            No signal — showing what this phone saved {new Date(savedAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}.
          </p>
        )}

        {/* ── Deadlines from the Guide ── */}
        {deadlines.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-[#8a5a1a] uppercase tracking-wider font-medium mb-2">Deadlines in the next two weeks</div>
            <ul className="space-y-2">
              {deadlines.map((i) => {
                const time = deadlineTimeWords(i, tz);
                return (
                  <li key={i.id}>
                    <button onClick={() => onNavigate?.(`/day/${(i.date || "").slice(0, 10)}#item-${i.id}`)}
                      className="w-full text-left bg-[#fff8ec] rounded-xl border border-[#e8c98f] p-3.5">
                      <div className="text-sm text-[#3a3128]"><span className="text-[#8a5a1a]">{deadlineWhen(i, todayYmd)}</span> · {i.title}</div>
                      {/* Whose it is: the people it names, else whose name the booking is under (round 10) */}
                      {(i.forWhom || time || bookedByName(i)) && (
                        <div className="text-xs text-[#6b5d4a] mt-1">{[i.forWhom && !/^everyone$/i.test(i.forWhom) ? `For ${i.forWhom}` : bookedWords(i, me), time].filter(Boolean).join(" · ")}</div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

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
                    onClick={() => onNavigate?.(`/ideas?city=${dec.cityId}`)}
                    className="w-full text-left p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-50 transition-colors"
                  >
                    <div className="text-sm font-medium text-[#3a3128]">{dec.title}</div>
                    <div className="text-xs text-[#6b5d4a] mt-1">
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

        {/* ── Section 2: Coming up (Guide Actions), then earlier to-dos the Guide still lists ── */}
        {open.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-[#6b5d4a] uppercase tracking-wider font-medium mb-2">
              {/* (not "Coming up": a to-do with no date — her April "Activities", TBD — isn't coming up; round 12) */}
              {upcoming.length > 0 ? "Still to do" : "Earlier to-dos in the Guide"}
            </div>
            <div className="space-y-2">
              {open.map((a, idx) => {
                const firstEarlier = upcoming.length > 0 && idx === upcoming.length;
                const dest = getActionDestination(a);
                return (
                  <Fragment key={a.id}>
                  {firstEarlier && (
                    <div className="text-xs text-[#6b5d4a] uppercase tracking-wider font-medium pt-4 pb-1">Earlier to-dos in the Guide</div>
                  )}
                  <div className="bg-white rounded-xl border border-[#e8e0d4] p-3.5">
                    <div className="flex items-start gap-3">
                      {/* The Guide's own to-dos are Larisa's to tick, in her sheet; only Wander's own can be ticked here */}
                      {!a.sheetRowRef && (
                        <button
                          onClick={() => handleToggleDone(a)}
                          className="-m-3 p-3 shrink-0"
                          aria-label={`Mark ${a.action} as done`}
                        >
                          <span className="block w-6 h-6 rounded-full border-2 border-[#c8bba8] hover:border-[#514636] transition-colors" />
                        </button>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-[#3a3128]">{a.action}</div>
                          {dest && (
                            <button
                              onClick={() => onNavigate?.(dest)}
                              className="text-sm text-[#514636] shrink-0 ml-2 min-h-[44px] px-2"
                            >
                              Ideas ›
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-[#6b5d4a] mt-1 flex items-center gap-2 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-[#f0ece5] text-[#6b5d4a] font-medium">
                            {/* Her Actions tab's "Both" is Andy and Larisa — its two status columns (her "LF" rows mark
                                Andy's "N/A"); round 12: Larisa read "For everyone" on her and Andy's planning to-dos.
                                "Both" on a to-do added in Wander is the form's "Group". */}
                            {a.owner === "Both" ? (a.sheetRowRef ? "For Andy & Larisa" : "For everyone") : `For ${a.owner === "LF" ? "Larisa" : a.owner === "KR" ? "Ken" : a.owner === "AB" ? "Andy" : a.owner}`}
                          </span>
                          {a.dueDate && a.dueDate !== "TBD" && a.dueDate !== "null" && (
                            <span>{isPastDue(a.dueDate, todayStart) ? "was aiming for " : "by "}{dueWords(a.dueDate)}</span>
                          )}
                          <span className="text-xs text-[#6b5d4a]">{whoAdded(a)}</span>
                          {takeOut(a)}
                        </div>

                        {/* Per-person status pills from Larisa's Actions tab.
                            Only renders when at least one is set. Uses a compact green
                            check for DONE, amber dot for In Progress, grey for N/A, and
                            the raw text for anything else (Larisa's vocabulary evolves). */}
                        {(a.andyStatus || a.larisaStatus) && (
                          <div className="text-[13px] mt-1 flex items-center gap-2 flex-wrap">
                            {a.larisaStatus && (() => {
                              const s = a.larisaStatus.toLowerCase();
                              const isDone = s === "done";
                              const isProgress = s.includes("progress");
                              const isNA = s === "n/a" || s === "na";
                              return (
                                <span className={`inline-flex items-center gap-1 ${isDone ? "text-green-700" : isProgress ? "text-amber-600" : isNA ? "text-[#6b5d4a]" : "text-[#6b5d4a]"}`}>
                                  <span className="font-medium">Larisa</span>
                                  <span>{isDone ? "✓ done" : isProgress ? "working on it" : isNA ? "not needed" : a.larisaStatus}</span>
                                </span>
                              );
                            })()}
                            {a.andyStatus && (() => {
                              const s = a.andyStatus.toLowerCase();
                              const isDone = s === "done";
                              const isProgress = s.includes("progress");
                              const isNA = s === "n/a" || s === "na";
                              return (
                                <span className={`inline-flex items-center gap-1 ${isDone ? "text-green-700" : isProgress ? "text-amber-600" : isNA ? "text-[#6b5d4a]" : "text-[#6b5d4a]"}`}>
                                  <span className="font-medium">Andy</span>
                                  <span>{isDone ? "✓ done" : isProgress ? "working on it" : isNA ? "not needed" : a.andyStatus}</span>
                                </span>
                              );
                            })()}
                          </div>
                        )}

                        {/* Status notes from the Guide — Larisa's free-text summary of
                            where the item stands (e.g., "Flights booked and info copied"). */}
                        {a.statusNotes && (
                          <p className="text-xs text-[#6b5d4a] mt-1 italic leading-relaxed">
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
                              className="w-full text-base px-3 py-2 rounded-lg border border-[#e0d8cc] focus:outline-none focus:ring-1 focus:ring-[#a89880] resize-none"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveNotes(a.id); } if (e.key === "Escape") setEditingId(null); }}
                            />
                            <div className="flex justify-end gap-2 mt-1.5">
                              <button onClick={() => setEditingId(null)} className="min-h-[44px] px-3 text-sm text-[#6b5d4a]">Cancel</button>
                              <button onClick={() => handleSaveNotes(a.id)} className="min-h-[44px] px-4 text-sm text-white bg-[#514636] rounded-lg font-medium">Save</button>
                            </div>
                          </div>
                        ) : a.notes ? (
                          <p
                            className={`text-sm text-[#6b5d4a] mt-2 leading-relaxed bg-[#faf8f5] rounded-lg px-3 py-2 ${a.sheetRowRef ? "" : "cursor-text"}`}
                            onClick={() => { if (!a.sheetRowRef) { setEditingId(a.id); setEditNotes(a.notes || ""); } }}
                          >
                            {a.notes}
                          </p>
                        ) : a.sheetRowRef ? null : (
                          <button
                            className="text-sm text-[#514636] mt-1 min-h-[44px] transition-colors"
                            onClick={() => { setEditingId(a.id); setEditNotes(""); }}
                          >
                            Add a note
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  </Fragment>
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
              // 44pt tall, and 16px text so iPhone Safari doesn't zoom the page on tap (round 10)
              className="w-full text-base min-h-[44px] px-3 py-2 rounded-lg border border-[#e0d8cc] focus:outline-none focus:ring-1 focus:ring-[#a89880]"
              autoFocus
            />
            <div className="flex gap-2">
              <select
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                className="text-base min-h-[44px] px-2 py-1.5 rounded-lg border border-[#e0d8cc] bg-white text-[#3a3128]"
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
                placeholder="By when? Oct 20"
                className="flex-1 min-w-0 text-base min-h-[44px] px-2 py-1.5 rounded-lg border border-[#e0d8cc] focus:outline-none"
              />
            </div>
            <input
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full text-base min-h-[44px] px-3 py-1.5 rounded-lg border border-[#e0d8cc] focus:outline-none"
            />
            <button
              onClick={handleAdd}
              disabled={!newAction.trim()}
              className="w-full min-h-[44px] py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium disabled:opacity-40"
            >
              Add
            </button>
          </div>
        )}

        {unreachable && (
          <p className="text-sm text-[#6b5d4a] text-center py-8">No signal, and this phone hasn't saved the to-dos yet. They'll show once you're back online.</p>
        )}
        {!unreachable && actions.length === 0 && !adding && needsMyInput.length === 0 && deadlines.length === 0 && (
          <p className="text-sm text-[#6b5d4a] text-center py-8">Nothing to do right now.</p>
        )}

        {/* ── Section 3: Done — collapsed by default ── */}
        {done.length > 0 && (
          <div>
            <button
              onClick={() => setShowDone(!showDone)}
              className="text-sm text-[#6b5d4a] hover:text-[#514636] transition-colors min-h-[44px] min-w-[44px] pr-2"
            >
              {showDone ? "Hide the done ones" : `${done.length} done ›`}
            </button>
            {showDone && (
              <div className="mt-2 space-y-1.5">
                {done.map((a) => (
                  <div key={a.id} className="bg-white/50 rounded-lg border border-[#f0ece5] px-3 py-2">
                    <div className="flex items-center gap-2">
                      {/* Done in her Guide (its Larisa/Andy column says DONE): that's hers to change, not a tick to undo
                          here (round 12: anyone could make her "Flights" look not done). Ticked in Wander: can reopen. */}
                      {a.sheetRowRef && [a.larisaStatus, a.andyStatus].some((s) => (s || "").toLowerCase() === "done") ? (
                        <span className="w-5 h-5 rounded-full bg-[#514636] border-2 border-[#514636] flex items-center justify-center shrink-0" aria-hidden>
                          <span className="text-white text-[10px]">✓</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleToggleDone(a)}
                          className="-m-3 p-3 shrink-0"
                          title="Not done after all" aria-label={`Mark ${a.action} as not done`}
                        >
                          <span className="w-5 h-5 rounded-full bg-[#514636] border-2 border-[#514636] flex items-center justify-center">
                            <span className="text-white text-[10px]">✓</span>
                          </span>
                        </button>
                      )}
                      <span className="text-sm text-[#6b5d4a] line-through">{a.action}</span>
                      {a.sheetRowRef && [a.larisaStatus, a.andyStatus].some((s) => (s || "").toLowerCase() === "done") && (
                        <span className="text-xs text-[#6b5d4a]">done in Larisa's Guide</span>
                      )}
                      {!a.sheetRowRef && <span className="text-xs text-[#6b5d4a]">{whoAdded(a)}</span>}
                      {canTakeOut(a) && <span className="ml-auto text-xs">{takeOut(a)}</span>}
                    </div>
                    {a.notes && <p className="text-[13px] text-[#6b5d4a] ml-7 mt-0.5">{a.notes}</p>}
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
