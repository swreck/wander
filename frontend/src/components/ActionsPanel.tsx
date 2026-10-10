/**
 * ActionsPanel — "Actions": the Guide's deadlines coming up, then the to-dos from Larisa's
 * Actions tab (read-only — she ticks them in her sheet), then any to-dos added in Wander
 * (those can be ticked and noted here). Wander never writes to the Guide.
 */

import { useState, useEffect, Fragment } from "react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { guideData, type TripGuideData } from "../lib/guideData";
import { deadlineOver, deadlineTimeWords, deadlineWhen, bookedByName, bookedWords, voiceFor, isFreeCancel, FREE_CANCEL_WORDS, isFor, samePerson } from "../lib/guideDisplay";
import { useAuth } from "../contexts/AuthContext";
import { sourcesData, railAudience, beforeTravelSteps, sourceWordsFor, type OtherSource } from "../lib/sources";
import { checklistTitle } from "./RailSheet";
import { loadMarks, savedMarks, setMark, todoKey, deadlineKey, markDay, type Mark } from "../lib/actionMarks";

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

export default function ActionsPanel({ tripId, onClose, decisions, userCode, onNavigate }: Props) {
  const { showToast } = useToast();
  // Who is looking — a deadline says whose to-do it is ("Larisa's to do …")
  const auth = useAuth();
  const me = auth.user?.displayName || null;
  // The trip's lead (Ken) may tick anyone's to-do, as he may take out anyone's Maybe
  const isPlanner = auth.user?.role === "planner";
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
  // Marked done in Wander (Ken, Oct 9), and which other person's list is open
  const [marks, setMarks] = useState<Map<string, Mark>>(() => savedMarks(tripId));
  const [openList, setOpenList] = useState<string | null>(null);
  // Others' deadlines, folded by whose they are — which are open (Oct 10 audit)
  const [openOthersDeadlines, setOpenOthersDeadlines] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let live = true;
    const get = () => loadMarks(tripId).then((m) => { if (live) setMarks(m); });
    get();
    window.addEventListener("wander:marks-changed", get);
    return () => { live = false; window.removeEventListener("wander:marks-changed", get); };
  }, [tripId]);
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
  // Ken's rail sheet: its steps for before you travel, for the people doing the pickup (round 13)
  const [otherSources, setOtherSources] = useState<OtherSource[]>([]);
  useEffect(() => { sourcesData(tripId).then((d) => setOtherSources(d.sources)).catch(() => { /* Actions still shows the Guide */ }); }, [tripId]);

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
      showToast("That didn't add — try again?", "error");
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
  const whoAdded = (a: PlanningAction) => a.sheetRowRef ? `in ${voiceFor(me).guide}` : !a.createdBy ? "added in Wander" : a.createdBy === me ? "added by you" : `added by ${a.createdBy}`;
  const takeOut = (a: PlanningAction) => !canTakeOut(a) ? null : confirmRemoveId === a.id ? (
    <span className="inline-flex items-center gap-1">
      <span className="text-[#3a3128]">Take this out?</span>
      <button onClick={() => handleRemove(a.id)} className="min-h-[44px] px-2 text-sm text-red-600 font-medium">Take out</button>
      <button onClick={() => setConfirmRemoveId(null)} className="min-h-[44px] px-2 text-sm text-[#6b5d4a]">Keep</button>
    </span>
  ) : (
    <button onClick={() => setConfirmRemoveId(a.id)} className="min-h-[44px] px-2 text-sm text-[#6b5d4a] underline underline-offset-2">Take out</button>
  );

  async function handleToggleDone(action: PlanningAction): Promise<boolean> {
    const newStatus = action.status === "done" ? "open" : "done";
    try {
      await api.patch(`/sheets-sync/actions/${action.id}`, { status: newStatus });
      loadActions();
      return true;
    } catch {
      showToast(navigator.onLine ? "That tick didn't stick — try again?" : "No signal — that tick didn't save. Try again when you're back online.", "error");
      return false;
    }
  }

  // Her to-do or deadline marked done in Wander — beside her list, never in her sheet
  async function mark(key: string, label: string, done: boolean): Promise<boolean> {
    try {
      await setMark(tripId, key, label, done);
      // (on screen the moment it's saved, with the message — re-audit 2: on a slow phone the message came 0.8 s before the
      // line changed, while the list was asked for again)
      setMarks((cur) => {
        const next = new Map(cur);
        if (done) next.set(key, { key, label, byName: me || "You", at: new Date().toISOString() });
        else next.delete(key);
        return next;
      });
      return true;
    } catch {
      showToast(navigator.onLine ? "That tick didn't stick — try again?" : "No signal — that tick didn't save. Try again when you're back online.", "error");
      return false;
    }
  }

  // Ticked: said, with a way back (Oct 10 audit: a tick made the line vanish into "10 done" with nothing said and no
  // undo in sight)
  const ticked = (label: string, undo: () => void) => {
    const short = label.length > 40 ? `${label.slice(0, 38).trim()}…` : label;
    showToast(`“${short}” is ticked off — it's in the done list.`, "success", { action: { label: "Undo", onClick: undo } });
  };

  async function handleSaveNotes(actionId: string) {
    try {
      await api.patch(`/sheets-sync/actions/${actionId}`, { notes: editNotes });
      setEditingId(null);
      loadActions();
    } catch {
      showToast("That didn't save — try again?", "error");
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-[#faf8f5] flex items-center justify-center">
        <p className="text-sm text-[#6b5d4a]">Finding what needs doing…</p>
      </div>
    );
  }

  // Due dates arrive as "2026-04-15" (from the Guide) or "4/15" (typed here). Past-due ones aren't
  // "coming up" — they're earlier to-dos in the Guide, shown quietly below.
  const todayStart = new Date(new Date().toDateString());
  // Whose it is. Her Actions tab's "Both" is Andy and Larisa — its two status columns (her "LF" rows mark Andy's "N/A");
  // round 12: Larisa read "For everyone" on her and Andy's planning to-dos. "Both" on a to-do added in Wander is the
  // form's "Group". Her initials, one or several — "AB / JD" is Andy & Julie; ones no one has ("LT") stay as written.
  const INITIALS: Record<string, string> = { LF: "Larisa", KR: "Ken", AB: "Andy", JD: "Julie" };
  const whoFor = (a: PlanningAction): string[] | null =>
    a.owner === "Both" ? (a.sheetRowRef ? ["Andy", "Larisa"] : null) : a.owner.split(/\s*[/&,]\s*/).map((o) => INITIALS[o] || o);
  // (her lists name first names — "Andy" is "Andy B": Oct 10, his own to-dos didn't count as his)
  const isMine = (a: PlanningAction) => { const w = whoFor(a); return !w || w.some((n) => samePerson(n, me)); };
  // Which of her lists a to-do came from, in people's names and from where you stand: "In her “AB / JD Actions” list" →
  // "In her list for Andy & Julie"; to Larisa, "your" (journeys check, Oct 10: initials a first-timer can't read, and
  // Larisa's own screen called her list "her" list). Initials no one has stay as written.
  const listWords = (notes: string) => notes.replace(/^In her “([^”]+)” list$/, (_, words: string) => {
    const who = words.replace(/\s*actions?\s*$/i, "").split(/\s*[/&,]\s*/).map((o) => INITIALS[o.trim()] || o.trim());
    const known = who.every((n) => Object.values(INITIALS).includes(n));
    const her = voiceFor(me).mine ? "your" : "her";
    return known ? `In ${her} list for ${who.join(" & ")}` : `In ${her} “${words}” list`;
  });
  // Done: in her sheet (its column says so), ticked in Wander, or marked done in Wander (her to-dos, Oct 9)
  const markOf = (a: PlanningAction) => (a.sheetRowRef ? marks.get(todoKey(a)) : undefined);
  const isDone = (a: PlanningAction) => a.status === "done" || !!markOf(a);
  // Ticked by the people it's for (and the trip's lead); a Wander-added one by anyone, as before
  const canTick = (a: PlanningAction) => !a.sheetRowRef || isMine(a) || isPlanner;
  // Yours first (and everyone's); each other person's list is one quiet row (Ken, Oct 9: "actions not for me")
  const upcoming = actions.filter(a => !isDone(a) && isMine(a) && !isPastDue(a.dueDate, todayStart));
  const earlier = actions.filter(a => !isDone(a) && isMine(a) && isPastDue(a.dueDate, todayStart));
  const open = [...upcoming, ...earlier];
  const othersLists = [...actions.filter((a) => !isDone(a) && !isMine(a)).reduce((m, a) => {
    const label = (whoFor(a) || []).join(" & ");
    return m.set(label, [...(m.get(label) || []), a]);
  }, new Map<string, PlanningAction[]>())];
  const done = actions.filter(isDone);

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
  // A deadline that asks something of someone (reconfirm, pay, book…) can be marked done by them or the trip's lead —
  // not "free cancellation ends" or "charges start", which ask nothing (Oct 9)
  const deadlineMark = (i: { title: string; date: string | null }) => marks.get(deadlineKey(i));
  const asksSomething = (i: { title: string }) => /\b(reconfirm|confirm|pay|book|send|call|submit|register|order|buy|apply|sign|email|reply|tell)\b/i.test(i.title);
  const canTickDeadline = (i: Parameters<typeof bookedByName>[0] & { forWhom?: string | null }) => {
    if (isPlanner) return true;
    const actor = bookedByName(i)?.split(/\s+/)[0];
    return actor ? samePerson(actor, me) : !!i.forWhom && !/^everyone$/i.test(i.forWhom) && isFor(i, me);
  };
  const doneDeadlines = (guide?.items || []).filter((i) => i.kind === "deadline" && !!deadlineMark(i));
  const deadlines = (guide?.items || [])
    .filter((i) => i.kind === "deadline" && !deadlineMark(i) && !deadlineOver(i, tz) && (i.windowStart || (i.date || "").slice(0, 10)) <= in14)
    .sort((a, b) => (a.windowStart || (a.date || "").slice(0, 10)).localeCompare(b.windowStart || (b.date || "").slice(0, 10)));
  // Yours first (Ken, Oct 8: "old actions, non actions, and actions not for me"; Oct 10 audit: Julie's Actions opened on
  // Larisa's Robuchon to-do and Ken & Larisa's free cancellation): a deadline is yours when it names you, or is booked
  // under your name, or names no one; yours that ask something come first. Others' fold into one row per person.
  const deadlineOwner = (i: (typeof deadlines)[number]) =>
    i.forWhom && !/^everyone$/i.test(i.forWhom) ? i.forWhom : bookedByName(i)?.split(/\s+/)[0] || null;
  const isMyDeadline = (i: (typeof deadlines)[number]) => {
    if (i.forWhom && !/^everyone$/i.test(i.forWhom)) return isFor(i, me);
    const actor = bookedByName(i)?.split(/\s+/)[0];
    return actor ? samePerson(actor, me) : true;
  };
  // (one that asks nothing — free cancellation ending, charges starting — never leads: it's a quiet line below what you
  // have to do; Oct 10 re-audit: everyone's Actions opened on "Free cancellation ends · Nothing to do unless plans change")
  const myDeadlines = deadlines.filter((i) => isMyDeadline(i) && asksSomething(i));
  const myQuietDeadlines = deadlines.filter((i) => isMyDeadline(i) && !asksSomething(i));
  const othersDeadlines = new Map<string, typeof deadlines>();
  for (const i of deadlines.filter((d) => !isMyDeadline(d))) {
    const who = deadlineOwner(i) || "Someone else";
    othersDeadlines.set(who, [...(othersDeadlines.get(who) || []), i]);
  }

  // One deadline, as a card — whose it is said from where you stand ("Yours (Julie & Andy)", as on Home)
  const renderDeadline = (i: (typeof deadlines)[number], mine: boolean) => {
    const time = deadlineTimeWords(i, tz);
    const named = i.forWhom && !/^everyone$/i.test(i.forWhom) ? (isFor(i, me) ? `Yours (${i.forWhom})` : `For ${i.forWhom}`) : bookedWords(i, me);
    return (
      <li key={i.id} className={mine ? "bg-[#fff8ec] rounded-xl border border-[#e8c98f]" : "bg-white rounded-xl border border-[#e0d8cc]"}>
        <button onClick={() => onNavigate?.(`/day/${(i.date || "").slice(0, 10)}#item-${i.id}`)}
          className="w-full text-left p-3.5 pb-2">
          <div className="text-sm text-[#3a3128]"><span className={mine ? "text-[#8a5a1a]" : "text-[#6b5d4a]"}>{deadlineWhen(i, todayYmd)}</span> · {i.title}</div>
          {/* Whose it is: the people it names, else whose name the booking is under (round 10) */}
          {(named || time) && <div className="text-xs text-[#6b5d4a] mt-1">{[named, time].filter(Boolean).join(" · ")}</div>}
          {isFreeCancel(i) && <div className="text-xs text-[#6b5d4a] mt-0.5">{FREE_CANCEL_WORDS}</div>}
        </button>
        {asksSomething(i) && canTickDeadline(i) && (
          <div className="px-3.5 pb-1.5">
            <button onClick={async () => { if (await mark(deadlineKey(i), i.title, true)) ticked(i.title, () => { mark(deadlineKey(i), i.title, false); }); }}
              // (says what it does — "Done ✓" read as already done; re-audit 2)
              className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Mark it done</button>
          </div>
        )}
      </li>
    );
  };

  // One to-do, as a card — yours, or in someone else's list opened in place
  const renderTodo = (a: PlanningAction, firstEarlier = false) => {
                const dest = getActionDestination(a);
                return (
                  <Fragment key={a.id}>
                  {firstEarlier && (
                    <div className="text-xs text-[#6b5d4a] uppercase tracking-wider font-medium pt-4 pb-1">Earlier to-dos in the Guide</div>
                  )}
                  <div className="bg-white rounded-xl border border-[#e8e0d4] p-3.5">
                    <div className="flex items-start gap-3">
                      {/* A Wander to-do is ticked as before; one of hers is marked done in Wander by the people it's for (and
                          the trip's lead) — never in her sheet (Ken, Oct 9: they could never finish here) */}
                      {canTick(a) && (
                        <button
                          onClick={async () => {
                            const ok = a.sheetRowRef ? await mark(todoKey(a), a.action, true) : await handleToggleDone(a);
                            if (ok) ticked(a.action, () => { if (a.sheetRowRef) mark(todoKey(a), a.action, false); else handleToggleDone({ ...a, status: "done" }); });
                          }}
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
                              Maybes ›
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-[#6b5d4a] mt-1 flex items-center gap-2 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-[#f0ece5] text-[#6b5d4a] font-medium">
                            {/* Her Actions tab's "Both" is Andy and Larisa — its two status columns (her "LF" rows mark
                                Andy's "N/A"); round 12: Larisa read "For everyone" on her and Andy's planning to-dos.
                                "Both" on a to-do added in Wander is the form's "Group". */}
                            {/* "you" for the person looking (delight audit: "For Andy & Larisa" above "You · working on it") */}
                            {(() => {
                              // (her initials, one or several — "AB / JD" is Andy & Julie; ones no one has stay as written)
                              const INITIALS: Record<string, string> = { LF: "Larisa", KR: "Ken", AB: "Andy", JD: "Julie" };
                              const who = a.owner === "Both" ? (a.sheetRowRef ? ["Andy", "Larisa"] : null) : a.owner.split(/\s*[/&,]\s*/).map((o) => INITIALS[o] || o);
                              if (!who) return "For everyone";
                              // (initials no one in the trip has: said as her sheet marks it — Oct 10 re-audit, "For LT")
                              if (who.every((n) => /^[A-Z]{2,3}$/.test(n))) return `Marked “${who.join(" / ")}” in ${voiceFor(me).her} sheet`;
                              const named = who.map((n) => (samePerson(n, me) ? "you" : n));
                              const ordered = named.includes("you") && named.length > 1 ? ["you", ...named.filter((n) => n !== "you")] : named;
                              return `For ${ordered.join(" & ")}`;
                            })()}
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
                                  {/* (round 13: "You working on it") */}
                                  <span className="font-medium">{/^larisa$/i.test(me || "") ? (isProgress ? "You're" : "You") : "Larisa"}</span>
                                  <span>{isDone ? "✓ done" : isProgress ? (/^larisa$/i.test(me || "") ? "working on it" : "is working on it") : isNA ? "not needed" : a.larisaStatus}</span>
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
                                  <span className="font-medium">{/^andy$/i.test(me || "") ? (isProgress ? "You're" : "You") : "Andy"}</span>
                                  <span>{isDone ? "✓ done" : isProgress ? (/^andy$/i.test(me || "") ? "working on it" : "is working on it") : isNA ? "not needed" : a.andyStatus}</span>
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
                            {listWords(a.notes)}
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
  };

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
            <span className="text-xs text-[#6b5d4a]">Deadlines and to-dos from {voiceFor(me).guide}</span>
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

        {/* ── Deadlines from the Guide: yours first, others' folded by whose they are ── */}
        {deadlines.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-[#8a5a1a] uppercase tracking-wider font-medium mb-2">Deadlines in the next two weeks</div>
            {myDeadlines.length > 0 ? (
              <ul className="space-y-2">{myDeadlines.map((i) => renderDeadline(i, true))}</ul>
            ) : (
              <p className="text-sm text-[#6b5d4a]">Nothing you need to do by a deadline.</p>
            )}
            {myQuietDeadlines.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-[#6b5d4a]">Nothing to do unless plans change:</p>
                <ul>
                  {myQuietDeadlines.map((i) => (
                    <li key={i.id}>
                      <button onClick={() => onNavigate?.(`/day/${(i.date || "").slice(0, 10)}#item-${i.id}`)}
                        className="w-full text-left min-h-[44px] py-1 text-sm text-[#514636]">
                        <span className="text-[#6b5d4a]">{deadlineWhen(i, todayYmd)}</span> · {i.title} ›
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {[...othersDeadlines.entries()].map(([who, list]) => (
              <div key={who} className="mt-2">
                <button onClick={() => setOpenOthersDeadlines((s) => { const n = new Set(s); if (n.has(who)) n.delete(who); else n.add(who); return n; })}
                  aria-expanded={openOthersDeadlines.has(who)}
                  className="w-full min-h-[44px] text-left text-sm text-[#514636] flex items-center justify-between">
                  <span>{who}'s deadline{list.length === 1 ? "" : "s"} · {list.length}</span>
                  <span aria-hidden>{openOthersDeadlines.has(who) ? "⌄" : "›"}</span>
                </button>
                {openOthersDeadlines.has(who) && <ul className="space-y-2 mt-1">{list.map((i) => renderDeadline(i, false))}</ul>}
              </div>
            ))}
          </div>
        )}

        {/* ── Ken's rail sheet: before you travel (round 13: Actions looked empty of the card and IDs to pack) ── */}
        {(() => {
          const lists = otherSources.flatMap((s) => {
            const a = guide ? railAudience(guide.items, s.owner) : null;
            if (!a?.ownerParty || !isFor({ forWhom: a.ownerParty }, me)) return [];
            return s.checklists.filter((c) => c.date && todayYmd < c.date)
              .map((c) => ({ s, c, steps: beforeTravelSteps(s.id, c) })).filter((x) => x.steps.length);
          });
          if (!lists.length) return null;
          return (
            <div className="mb-6">
              <div className="text-xs text-[#8a5a1a] uppercase tracking-wider font-medium mb-2">Before you travel</div>
              {lists.map(({ s, c, steps }) => (
                <button key={`${s.id}-${c.tab}`} onClick={() => onNavigate?.(`/checklist/${encodeURIComponent(s.id)}/${encodeURIComponent(c.tab)}`)}
                  className="w-full text-left bg-white rounded-xl border border-[#e0d8cc] p-3.5 mb-2">
                  <div className="text-sm text-[#3a3128]">{checklistTitle(c.tab)} — {steps.length === 1 ? "one step" : `${steps.length} steps`} for before you go ›</div>
                  <ul className="mt-1.5 space-y-1">
                    {steps.map((x) => (
                      <li key={x.row} className="text-[13px] text-[#514636]">
                        <span className={x.ticked ? "text-[#3d6b3a]" : "text-[#8a5a1a]"}>{x.ticked ? "✓ Ticked on this phone · " : ""}</span>
                        {x.where.replace(/^Before travel;?\s*/i, "") || "Before travel"}: {x.what}
                      </li>
                    ))}
                  </ul>
                  <div className="text-xs text-[#6b5d4a] mt-1.5">From {sourceWordsFor(s, me)}</div>
                </button>
              ))}
            </div>
          );
        })()}

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

        {/* ── Section 2: your to-dos (and everyone's) first, then earlier ones the Guide still lists; then each other
            person's list as one quiet row, opened in place (Ken, Oct 9: "actions not for me") ── */}
        {(open.length > 0 || othersLists.length > 0) && (
          <div className="mb-6">
            <div className="text-xs text-[#6b5d4a] uppercase tracking-wider font-medium mb-2">
              {/* (not "Coming up": a to-do with no date — her April "Activities", TBD — isn't coming up; round 12) */}
              {upcoming.length > 0 ? "Still to do" : open.length > 0 ? "Earlier to-dos in the Guide" : "Still to do"}
            </div>
            {open.length === 0 && <p className="text-sm text-[#6b5d4a] mb-3">Nothing for you right now.</p>}
            <div className="space-y-2">
              {open.map((a, idx) => renderTodo(a, upcoming.length > 0 && idx === upcoming.length))}
            </div>
            {othersLists.length > 0 && (
              <div className="mt-4 space-y-2">
                {othersLists.map(([who, list]) => (
                  <div key={who}>
                    <button onClick={() => setOpenList(openList === who ? null : who)} aria-expanded={openList === who}
                      className="w-full text-left min-h-[44px] px-3.5 rounded-xl border border-[#efe8dc] bg-white/60 text-sm text-[#6b5d4a]">
                      {/* (initials no one in the trip has — "LT" — said as her sheet has them, not as a person we know;
                          Oct 10 re-audit: "LT's to-dos" meant nothing to Julie and Andy, nor to Ken) */}
                      {/* (the plain words first, her mark after — Sweep A: "To-dos marked 'LT'" was a puzzle to open with) */}
                      {(whoFor(list[0]) || []).every((n) => /^[A-Z]{2,3}$/.test(n)) ? `Other to-dos in ${voiceFor(me).her} sheet (marked “${who}”)` : `${who}'s to-dos`} · {list.length} {openList === who ? "‹" : "›"}
                    </button>
                    {openList === who && <div className="space-y-2 mt-2">{list.map((a) => renderTodo(a))}</div>}
                  </div>
                ))}
              </div>
            )}
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
        {done.length + doneDeadlines.length > 0 && (
          <div>
            <button
              onClick={() => setShowDone(!showDone)}
              className="text-sm text-[#6b5d4a] hover:text-[#514636] transition-colors min-h-[44px] min-w-[44px] pr-2"
            >
              {showDone ? "Hide the done ones" : `${done.length + doneDeadlines.length} done ›`}
            </button>
            {showDone && (
              <div className="mt-2 space-y-1.5">
                {/* Deadlines marked done in Wander — who and when; "Not done after all" for whoever may tick it */}
                {doneDeadlines.map((i) => {
                  const m = deadlineMark(i)!;
                  return (
                    <div key={`d-${i.id}`} className="bg-white/50 rounded-lg border border-[#f0ece5] px-3 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-5 h-5 rounded-full bg-[#514636] border-2 border-[#514636] flex items-center justify-center shrink-0" aria-hidden>
                          <span className="text-white text-[10px]">✓</span>
                        </span>
                        <span className="text-sm text-[#6b5d4a] line-through">{i.title}</span>
                        <span className="text-xs text-[#6b5d4a]">done — {m.byName === me ? "you" : m.byName}, {markDay(m)}</span>
                        {canTickDeadline(i) && (
                          <button onClick={() => mark(deadlineKey(i), i.title, false)} className="ml-auto min-h-[44px] text-xs text-[#514636] underline underline-offset-2">Not done after all</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {done.filter((a) => markOf(a)).map((a) => {
                  const m = markOf(a)!;
                  return (
                    <div key={a.id} className="bg-white/50 rounded-lg border border-[#f0ece5] px-3 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-5 h-5 rounded-full bg-[#514636] border-2 border-[#514636] flex items-center justify-center shrink-0" aria-hidden>
                          <span className="text-white text-[10px]">✓</span>
                        </span>
                        <span className="text-sm text-[#6b5d4a] line-through">{a.action}</span>
                        <span className="text-xs text-[#6b5d4a]">done — {m.byName === me ? "you" : m.byName}, {markDay(m)} · {whoAdded(a)}</span>
                        {canTick(a) && (
                          <button onClick={() => mark(todoKey(a), a.action, false)} className="ml-auto min-h-[44px] text-xs text-[#514636] underline underline-offset-2">Not done after all</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {done.filter((a) => !markOf(a)).map((a) => (
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
                        <span className="text-xs text-[#6b5d4a]">done in {voiceFor(me).guide}</span>
                      )}
                      {!a.sheetRowRef && <span className="text-xs text-[#6b5d4a]">{whoAdded(a)}</span>}
                      {canTakeOut(a) && <span className="ml-auto text-xs">{takeOut(a)}</span>}
                    </div>
                    {a.notes && <p className="text-[13px] text-[#6b5d4a] ml-7 mt-0.5">{listWords(a.notes)}</p>}
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
