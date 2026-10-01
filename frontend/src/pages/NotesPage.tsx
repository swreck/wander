/**
 * NotesPage — trip notes (Oct 1 2026). Ken: a notes tool he once used kept only "themes" of what he said; here every word
 * written or said is kept exactly, read back with its word count, and stays private unless shared with the trip.
 *
 * Write (or tap the microphone and talk, tap again to stop) → Save → "Saved — 142 words" with the words as kept. No
 * signal: kept on this phone and sent later, and it says so. What's being typed is kept as a draft until it's saved.
 * Below: notes still waiting for signal, search, "Export all my notes", and the notes by day (yours, and others'
 * shared with the trip). Scout's evening question opens this page with ?from=evening.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Trip } from "../lib/types";
import { guideData } from "../lib/guideData";
import { replayQueue, dropQueued } from "../lib/offlineStore";
import { useAuth } from "../contexts/AuthContext";
import {
  saveNote, waitingNotes, savedCopy, keepCopy, readDraft, keepDraft, exportText, tripToday, dayWords, sendCopy,
  newClientId, wordCount, type TripNote, type NoteSettings, type SaveBody,
} from "../lib/tripNotes";

type DayOption = { date: string; city: string | null };
type Result = { kind: "saved"; note: TripNote; sentWords: number } | { kind: "queued"; words: number } | { kind: "error"; message: string };

export default function NotesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const me = useAuth().user?.displayName || "";
  const params = new URLSearchParams(location.search);
  const fromEvening = params.get("from") === "evening";

  const [tripId, setTripId] = useState<string | null>(null);
  const [tripName, setTripName] = useState("");
  const [zone, setZone] = useState("Asia/Tokyo");
  const [days, setDays] = useState<DayOption[]>([]);
  const [notes, setNotes] = useState<TripNote[]>([]);
  const [waiting, setWaiting] = useState<(SaveBody & { _at: number })[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unreachable">("loading");
  const [settings, setSettings] = useState<NoteSettings | null>(null);
  const [storyAnswer, setStoryAnswer] = useState<string | null>(null);

  // The note being written
  const [text, setText] = useState("");
  const [day, setDay] = useState<string | null>(params.get("day"));
  const [choosingDay, setChoosingDay] = useState(false);
  const [shareWithTrip, setShareWithTrip] = useState(false);
  const [usedVoice, setUsedVoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  // the words being sent and the phone's id for them, until Wander has them (see readDraft)
  const pendingRef = useRef<{ text: string; cid: string } | null>(null);
  const daysReady = useRef<Promise<void> | null>(null);
  const noDayChosen = useRef(false);
  // (the latest days and time zone, for a save that waited for them)
  const daysRef = useRef<DayOption[]>([]);
  const zoneRef = useRef("Asia/Tokyo");
  const [result, setResult] = useState<Result | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [listening, setListening] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceLiveRef = useRef(false);

  // The list
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [line, setLine] = useState<Record<string, string>>({});
  const [exportLine, setExportLine] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const list = await api.get<TripNote[]>(`/trip-notes/trip/${id}`);
    setNotes(list);
    keepCopy(id, list);
    setSavedAt(null);
    // A note that reached Wander while Wander was closed mid-save: it's kept — its words leave the box (tester t4)
    const d = readDraft(id);
    if (d.sending && list.some((n) => n.mine && n.clientId === d.sending)) { keepDraft(id, ""); setText(""); pendingRef.current = null; }
    // A note "waiting for signal" that Wander already has (it arrived; the reply didn't) leaves the waiting list — it
    // showed twice, once waiting and once kept (tester k1)
    const kept = new Set(list.filter((n) => n.mine).map((n) => n.clientId));
    await dropQueued(`/api/trip-notes/trip/${id}`, (b) => kept.has(String(b.clientId)));
    const w = await waitingNotes(id);
    setWaiting(w);
    // ("Kept on this phone… you'll see it below as waiting" stayed after it was sent — tester t4)
    if (!w.length) setResult((r) => (r?.kind === "queued" ? null : r));
  }, []);

  // The trip, its days, my notes and my two settings
  useEffect(() => {
    let id = localStorage.getItem("wander:last-trip-id");
    // The trip's days for "About …" — alongside the notes, and from the phone's copy of the Guide with no signal (a
    // note written offline, or in the first seconds, was saved with no day — confirmation tester k2)
    const loadDays = (tid: string) => {
      daysReady.current = guideData(tid).then((g) => {
        setZone(g?.trip.timeZone || "Asia/Tokyo");
        setDays((g?.days || []).map((d: any) => ({ date: String(d.date).slice(0, 10), city: d.city?.name || null })).sort((a, b) => a.date.localeCompare(b.date)));
      }).catch(() => { /* no days: "No particular day" */ });
      return daysReady.current;
    };
    const run = async () => {
      try {
        let trip: Trip | null = id ? await api.get<Trip>(`/trips/${id}`).catch(() => null) : null;
        if (!trip) { trip = await api.get<Trip | null>("/trips/active"); id = trip?.id || null; }
        if (!trip || !id) throw new Error("no trip");
        setTripId(id);
        setTripName(trip.name);
        // the notes and the days together (notes waited ~3 s on the days — tester t4)
        const days = loadDays(id);
        await load(id);
        setState("ready");
        api.get<NoteSettings>("/trip-notes/settings").then(setSettings).catch(() => { /* asked later */ });
        await days;
      } catch {
        const copy = id ? savedCopy(id) : null;
        if (id && copy) {
          setTripId(id); setNotes(copy.notes); setSavedAt(copy.savedAt); setState("ready");
          setWaiting(await waitingNotes(id));
          loadDays(id);
        } else setState("unreachable");
      }
    };
    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [load]);

  // A draft typed or said before Wander closed comes back
  // (with the day it was about — not whatever day it is when Wander opens again)
  useEffect(() => {
    if (tripId && !text) {
      const d = readDraft(tripId);
      if (d.text) { setText(d.text); if (d.day) setDay(d.day); if (d.spoken) setUsedVoice(true); if (d.sending) pendingRef.current = { text: d.text, cid: d.sending }; }
    }
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tripId) keepDraft(tripId, text, day, pendingRef.current?.text === text ? pendingRef.current.cid : undefined, usedVoice);
  }, [tripId, text, day, usedVoice]);

  daysRef.current = days;
  zoneRef.current = zone;
  // Today on the trip's clock is the day a new note is about, when it's a trip day
  const today = tripToday(zone);
  useEffect(() => {
    if (day || !days.length) return;
    if (days.some((d) => d.date === today)) setDay(today);
  }, [days, today, day]);

  // The box grows with the words and keeps the newest in view (as Scout's does)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxH = Math.max(160, window.innerHeight * 0.45);
    el.style.height = Math.min(el.scrollHeight, maxH) + "px";
    el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
    if (el.selectionStart === el.value.length) el.scrollTop = el.scrollHeight;
  }, [text]);

  // Wander's microphone: tap to start, tap to stop; the words go into the box after anything typed
  const toggleVoice = useCallback(() => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    const typed = (boxRef.current?.value ?? "").replace(/\s+$/, "");
    voiceLiveRef.current = true;
    rec.onresult = (e: any) => {
      if (!voiceLiveRef.current) return;
      const said = Array.from(e.results).map((r: any) => r[0].transcript).join("");
      setText(typed ? `${typed} ${said.trimStart()}` : said);
      setUsedVoice(true);
    };
    rec.onend = () => { setListening(false); voiceLiveRef.current = false; if (recognitionRef.current === rec) recognitionRef.current = null; };
    rec.onerror = () => { setListening(false); if (recognitionRef.current === rec) recognitionRef.current = null; };
    recognitionRef.current = rec;
    try { rec.start(); setListening(true); setResult(null); } catch { setListening(false); }
  }, [listening]);
  const hasVoice = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const cityOf = (d: string | null) => (d ? days.find((x) => x.date === d)?.city || null : null);

  async function save() {
    // (a ref, not just state: a fast double tap read "not saving" twice and kept the same note twice — tester t4)
    if (!tripId || !text.trim() || saving || savingRef.current) return;
    savingRef.current = true;
    // Saving while the microphone listens: it stops, and late words don't come back into the box
    if (recognitionRef.current) { voiceLiveRef.current = false; try { recognitionRef.current.stop(); } catch { /* stopped */ } setListening(false); }
    // A note about today unless another day (or no day) was chosen — the days a moment late, or from the phone's copy
    // with no signal, are waited for briefly rather than the note going without its day (k2)
    let aboutDay = day;
    if (!aboutDay && !noDayChosen.current) {
      if (!daysRef.current.length && daysReady.current) await Promise.race([daysReady.current, new Promise((r) => setTimeout(r, 3000))]);
      const t = tripToday(zoneRef.current);
      if (daysRef.current.some((d) => d.date === t)) { aboutDay = t; setDay(t); }
    }
    const aboutCity = aboutDay ? daysRef.current.find((d) => d.date === aboutDay)?.city || null : null;
    // The same words sent again keep their id, so Wander keeps them once; noted with the draft before they go
    const cid = pendingRef.current?.text === text ? pendingRef.current.cid : newClientId();
    pendingRef.current = { text, cid };
    keepDraft(tripId, text, aboutDay, cid, usedVoice);
    const body: SaveBody = {
      // (spoken first: "Tidy my dictation" tidies spoken notes, the evening question's included)
      clientId: cid, text, source: usedVoice ? "voice" : fromEvening ? "evening" : "typed",
      visibility: shareWithTrip ? "trip" : "private", dayDate: aboutDay, city: aboutCity, writtenAt: new Date().toISOString(),
    };
    setSaving(true);
    setResult(null);
    try {
      const r = await saveNote(tripId, body);
      if ("queued" in r) {
        setResult({ kind: "queued", words: wordCount(text) });
        setWaiting(await waitingNotes(tripId));
      } else {
        setResult({ kind: "saved", note: r.note, sentWords: wordCount(text) });
        setNotes((n) => [r.note, ...n.filter((x) => x.id !== r.note.id)]);
        keepCopy(tripId, [r.note, ...notes.filter((x) => x.id !== r.note.id)]);
      }
      pendingRef.current = null;
      setText("");
      keepDraft(tripId, "");
      setUsedVoice(false);
      setShowSaved(false);
      // Each new note starts as "Just me" — the switch stayed on "Share with the trip" after a shared note, and the
      // next note, meant to be private, went to everyone (privacy tester, Oct 1 2026)
      setShareWithTrip(false);
      // …and about today: a kept draft about yesterday, saved this morning, left the next notes filed under yesterday
      // (tester k1)
      const t = tripToday(zoneRef.current);
      setDay(daysRef.current.some((d) => d.date === t) ? t : null);
      noDayChosen.current = false;
      // Kept on the phone though there's signal (a slow reply): try again shortly, and the waiting list catches up
      if ("queued" in r && navigator.onLine !== false) setTimeout(() => { replayQueue().then(() => load(tripId)).catch(() => { /* next time */ }); }, 3000);
    } catch (err) {
      const offline = navigator.onLine === false;
      setResult({ kind: "error", message: offline ? "No signal, and this phone couldn't hold the note — your words are still in the box. Try again in a moment." : (err as Error)?.message && !/fetch|network/i.test((err as Error).message) ? `That didn't save — ${(err as Error).message} Your words are still in the box.` : "That didn't save — your words are still in the box. Try again?" });
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  async function answerStoryUse(yes: boolean) {
    try {
      setSettings(await api.patch<NoteSettings>("/trip-notes/settings", { storyUse: yes }));
      // (the card went away with no word that the answer was kept — tester t2)
      setStoryAnswer(yes ? "Got it — trip stories may use what your notes say about places. You can change this in Settings."
        : "Got it — your notes stay out of others' trip stories. You can change this in Settings.");
    } catch { /* asked again next time */ }
  }

  async function changeNote(n: TripNote, change: { text?: string; visibility?: "private" | "trip" }) {
    setBusy(n.id);
    try {
      const r = await api.patch<{ note: TripNote }>(`/trip-notes/${n.id}`, change);
      setNotes((all) => { const next = all.map((x) => (x.id === n.id ? r.note : x)); if (tripId) keepCopy(tripId, next); return next; });
      setEditing(null);
      setLine((l) => ({ ...l, [n.id]: change.visibility === "trip" ? "Shared with everyone on the trip" : change.visibility === "private" ? "Just you again" : "" }));
    } catch {
      setLine((l) => ({ ...l, [n.id]: navigator.onLine === false ? "No signal — that change waits until there's a bar or two." : "That didn't change — try again?" }));
    } finally {
      setBusy(null);
    }
  }

  async function removeNote(n: TripNote) {
    setBusy(n.id);
    try {
      await api.delete(`/trip-notes/${n.id}`);
      setNotes((all) => { const next = all.filter((x) => x.id !== n.id); if (tripId) keepCopy(tripId, next); return next; });
      setConfirmRemove(null);
    } catch {
      setLine((l) => ({ ...l, [n.id]: navigator.onLine === false ? "No signal — the note stays until there's a bar or two." : "That didn't go — try again?" }));
    } finally {
      setBusy(null);
    }
  }

  async function copyOut(n: TripNote) {
    const when = n.dayDate ? `${dayWords(n.dayDate)}${n.city ? `, ${n.city}` : ""}` : "";
    const r = await sendCopy(`${n.tidied || n.text}\n\n— ${n.authorName}${when ? `, ${when}` : ""}`, "A note from the trip");
    if (r === "copied") setLine((l) => ({ ...l, [n.id]: "The words are copied — paste them into a message." }));
    if (r === "failed") setLine((l) => ({ ...l, [n.id]: "This phone wouldn't share or copy them — try again?" }));
  }

  async function exportAll() {
    if (!tripId) return;
    setExportLine(null);
    try {
      const all = await exportText(tripId);
      const file = new File([all], `${tripName || "Trip"} notes — ${me}.txt`, { type: "text/plain" });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `${tripName} — trip notes` }); return; }
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url; a.download = file.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setExportLine("Saved as a text file — every word of your notes.");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setExportLine(navigator.onLine === false ? "Exporting needs signal — your notes are safe; try when there's a bar or two." : "That didn't export — try again?");
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? notes.filter((n) => [n.text, n.original, n.tidied || ""].some((t) => t.toLowerCase().includes(q))) : notes;
  }, [notes, query]);
  // By day, newest day first; notes with no day last
  const byDay = useMemo(() => {
    const groups = new Map<string, TripNote[]>();
    for (const n of shown) { const k = n.dayDate || ""; groups.set(k, [...(groups.get(k) || []), n]); }
    return Array.from(groups.entries()).sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : b[0].localeCompare(a[0])));
  }, [shown]);

  const myCount = notes.filter((n) => n.mine).length;
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="min-h-[100dvh] bg-[#faf8f5] pb-28">
      <header className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur border-b border-[#e0d8cc] px-4 top-bar pb-2">
        <h1 className="text-center text-base font-medium text-[#3a3128] min-h-[44px] flex items-center justify-center">Trip notes</h1>
      </header>

      <main className="px-4 pt-4 max-w-xl mx-auto">
        {state === "loading" && <p className="text-sm text-[#6b5d4a] text-center mt-10">Finding your notes…</p>}
        {state === "unreachable" && (
          <div className="text-center mt-10">
            <p className="text-sm text-[#6b5d4a]">Wander can't reach the trip right now, and this phone hasn't saved your notes yet.</p>
            <button onClick={() => window.location.reload()} className="mt-3 min-h-[44px] px-5 rounded-xl bg-[#514636] text-white text-sm">Try again</button>
          </div>
        )}
        {state === "ready" && (
          <>
            {savedAt && (
              <p className="mb-3 text-sm text-[#6b5d4a] bg-white/70 border border-[#e0d8cc] rounded-lg px-3 py-2" role="status">
                No signal — showing the notes this phone saved. New notes are kept here and sent when there's signal.
              </p>
            )}

            {/* ── Write ── */}
            <section className="bg-white rounded-xl border border-[#e0d8cc] p-3">
              {fromEvening
                ? <p className="text-[15px] text-[#3a3128]"><span className="text-[#6b5d4a]">Scout asks · </span>Anything worth remembering from today?</p>
                : <p className="text-[13px] text-[#6b5d4a]">Every word you write or say is kept exactly as you put it. Only you see a note unless you share it.</p>}

              <div className="flex items-center gap-2 mt-2 text-[13px] text-[#514636]">
                <span className="text-[#6b5d4a]">About</span>
                {choosingDay ? (
                  <select autoFocus value={day || ""} onChange={(e) => { setDay(e.target.value || null); noDayChosen.current = !e.target.value; setChoosingDay(false); }} onBlur={() => setChoosingDay(false)}
                    className="min-h-[44px] text-[16px] bg-[#f0ebe3] rounded-lg px-2">
                    <option value="">No particular day</option>
                    {days.map((d) => <option key={d.date} value={d.date}>{dayWords(d.date)}{d.city ? ` · ${d.city}` : ""}</option>)}
                  </select>
                ) : (
                  <button onClick={() => setChoosingDay(true)} className="min-h-[44px] underline underline-offset-2">
                    {day ? `${dayWords(day)}${cityOf(day) ? ` · ${cityOf(day)}` : ""}` : "No particular day"} — change
                  </button>
                )}
              </div>

              <textarea ref={boxRef} value={text} onChange={(e) => { setText(e.target.value); if (result?.kind !== "error") setResult(null); }}
                rows={4} placeholder={listening ? "Listening — tap Stop when you're done" : "What's worth remembering?"}
                aria-label="Your note"
                // (answering Scout's evening question: ready to write — tester t4)
                autoFocus={fromEvening}
                className="mt-1 w-full min-h-[120px] bg-[#f0ebe3] rounded-xl px-3.5 py-2.5 text-[16px] leading-relaxed text-[#3a3128] placeholder:text-[#6b5d4a] outline-none focus:ring-2 focus:ring-[#514636]/20 resize-none" />
              {text.trim() && <p className="text-xs text-[#6b5d4a] mt-1">{wordCount(text)} word{wordCount(text) === 1 ? "" : "s"} · kept on this phone until you save</p>}

              <div className="flex flex-wrap items-center gap-2 mt-2">
                {hasVoice && (
                  <button onClick={toggleVoice} type="button" aria-label={listening ? "Stop listening" : "Talk instead of typing"}
                    className={`min-h-[44px] min-w-[44px] px-3 rounded-xl flex items-center gap-1.5 text-sm ${listening ? "bg-red-500 text-white animate-pulse" : "bg-[#f0ebe3] text-[#514636]"}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                    </svg>
                    {listening ? "Stop" : "Talk"}
                  </button>
                )}
                <div role="radiogroup" aria-label="Who sees this note" className="flex rounded-xl bg-[#f0ebe3] p-0.5 text-sm">
                  <button role="radio" aria-checked={!shareWithTrip} onClick={() => setShareWithTrip(false)} className={`min-h-[44px] px-3 rounded-lg ${!shareWithTrip ? "bg-white text-[#3a3128] shadow-sm" : "text-[#6b5d4a]"}`}>Just me</button>
                  <button role="radio" aria-checked={shareWithTrip} onClick={() => setShareWithTrip(true)} className={`min-h-[44px] px-3 rounded-lg ${shareWithTrip ? "bg-white text-[#3a3128] shadow-sm" : "text-[#6b5d4a]"}`}>Share with the trip</button>
                </div>
                <button onClick={save} disabled={!text.trim() || saving} className="ml-auto min-h-[44px] px-5 rounded-xl bg-[#514636] text-white text-sm disabled:opacity-40">
                  {saving ? "Saving…" : "Save note"}
                </button>
              </div>

              {/* The read-back: what was kept, counted */}
              {result?.kind === "saved" && (
                <div className="mt-3 rounded-lg bg-[#f3f7ef] border border-[#cfe0c2] px-3 py-2" role="status">
                  <p className="text-sm text-[#3f5a2a]">
                    Saved — {result.note.wordCount} word{result.note.wordCount === 1 ? "" : "s"}, every one kept{result.note.visibility === "trip" ? ", shared with the trip" : ", just for you"}.
                    {result.note.wordCount !== result.sentWords && ` (This phone counted ${result.sentWords} — tap below and check the words.)`}
                  </p>
                  <button onClick={() => setShowSaved((s) => !s)} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">{showSaved ? "Hide the saved words" : "Show the saved words"}</button>
                  {showSaved && <p className="text-sm text-[#3a3128] whitespace-pre-wrap [overflow-wrap:anywhere] pb-1">{result.note.text}</p>}
                </div>
              )}
              {result?.kind === "queued" && (
                <p className="mt-3 rounded-lg bg-[#fff8ec] border border-[#e8c98f] px-3 py-2 text-sm text-[#8a5a1a]" role="status">
                  Kept on this phone — {result.words} word{result.words === 1 ? "" : "s"}. It goes to Wander when there's signal; you'll see it below as waiting until then.
                </p>
              )}
              {result?.kind === "error" && <p className="mt-3 text-sm text-[#8a3a1a]" role="alert">{result.message}</p>}
            </section>

            {/* Asked once, after a first note: may others' trip stories use what this person says about places? */}
            {settings && settings.storyUse === null && myCount > 0 && (
              <section className="mt-3 rounded-xl border border-[#e0d8cc] bg-white p-3">
                <p className="text-sm text-[#3a3128]">One question, asked once: later, when someone on the trip asks Scout to write a story of the trip, may it use what your notes say about places — the food, the sights, how a place felt — even from notes you keep to yourself? Never anything personal about you or anyone else.</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {/* (two equal choices — neither is the "right" answer; tester t1) */}
                  <button onClick={() => answerStoryUse(true)} className="min-h-[44px] px-4 rounded-xl bg-[#f0ebe3] text-[#514636] text-sm">Yes, what I say about places</button>
                  <button onClick={() => answerStoryUse(false)} className="min-h-[44px] px-4 rounded-xl bg-[#f0ebe3] text-[#514636] text-sm">No, keep my notes to me</button>
                </div>
                <p className="text-xs text-[#6b5d4a] mt-1.5">You can change this any time in Settings.</p>
              </section>
            )}
            {storyAnswer && <p className="mt-3 text-sm text-[#3f5a2a]" role="status">{storyAnswer}</p>}

            {/* ── Waiting for signal ── */}
            {waiting.length > 0 && (
              <section className="mt-5">
                <h2 className="text-xs uppercase tracking-wide text-[#8a5a1a] mb-2">On this phone, waiting for signal</h2>
                <ul className="space-y-2">
                  {waiting.map((w) => (
                    <li key={w.clientId} className="rounded-xl border border-dashed border-[#e8c98f] bg-[#fffdf8] p-3">
                      <p className="text-xs text-[#8a5a1a]">{w.dayDate ? `${dayWords(w.dayDate)} · ` : ""}{wordCount(w.text)} words · {w.visibility === "trip" ? "to be shared with the trip · " : ""}sends when there's signal</p>
                      <p className="text-sm text-[#3a3128] whitespace-pre-wrap [overflow-wrap:anywhere] mt-1">{w.text}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── The notes ── */}
            <section className="mt-6">
              <div className="flex items-center gap-2">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find words in the notes" aria-label="Find words in the notes"
                  className="flex-1 min-h-[44px] bg-white border border-[#e0d8cc] rounded-xl px-3 text-[16px] text-[#3a3128] placeholder:text-[#6b5d4a]" />
                {myCount > 0 && <button onClick={exportAll} className="min-h-[44px] px-3 text-sm text-[#514636] underline underline-offset-2 whitespace-nowrap">Export mine</button>}
              </div>
              {exportLine && <p className="text-sm text-[#6b5d4a] mt-1" role="status">{exportLine}</p>}

              {notes.length === 0 && waiting.length === 0 && (
                <p className="text-sm text-[#6b5d4a] mt-4">Nothing here yet. A note can be a line or a page — the potter's hands, a smell at the market, what someone said at dinner.</p>
              )}
              {notes.length > 0 && shown.length === 0 && <p className="text-sm text-[#6b5d4a] mt-4">No note has “{query.trim()}” in it.</p>}

              {byDay.map(([d, list]) => (
                <div key={d || "none"} className="mt-5">
                  <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-1">
                    {d ? (
                      // the day itself, one tap away (tester t4: no way from a note to its day)
                      <button onClick={() => navigate(`/day/${d}`)} className="min-h-[44px] uppercase tracking-wide text-left">
                        {dayWords(d)}{list[0]?.city ? ` · ${list[0].city}` : ""} ›
                      </button>
                    ) : "No particular day"}
                  </h2>
                  <ul className="space-y-2">
                    {list.map((n) => {
                      const words = n.tidied || n.text;
                      const isEditing = editing?.id === n.id;
                      return (
                        <li key={n.id} className="bg-white rounded-xl border border-[#e0d8cc] p-3">
                          <p className="text-xs text-[#6b5d4a]">
                            {timeOf(n.createdAt)}{!n.mine && ` · ${n.authorName}`} · {n.visibility === "trip" ? "Shared with the trip" : "Just you"}
                            {n.source === "voice" ? " · spoken" : n.source === "evening" ? " · Scout's evening question" : ""}
                            {n.editedAt ? " · changed" : ""}
                          </p>
                          {isEditing ? (
                            <>
                              <textarea value={editing.text} onChange={(e) => setEditing({ id: n.id, text: e.target.value })} rows={5} aria-label="Change the words"
                                className="mt-1 w-full bg-[#f0ebe3] rounded-xl px-3 py-2 text-[16px] text-[#3a3128] outline-none resize-y" />
                              <p className="text-xs text-[#6b5d4a]">The words as first saved are kept too.</p>
                              <div className="flex gap-2 mt-1">
                                <button onClick={() => changeNote(n, { text: editing.text })} disabled={!editing.text.trim() || busy === n.id} className="min-h-[44px] px-4 rounded-xl bg-[#514636] text-white text-sm disabled:opacity-40">Save the change</button>
                                <button onClick={() => setEditing(null)} className="min-h-[44px] px-4 text-sm text-[#514636]">Cancel</button>
                              </div>
                            </>
                          ) : (() => {
                            // A long note shows its first lines, then "Show all" (a 1,500-word note filled eight screens,
                            // with its buttons at the bottom); a search shows it whole, the words found marked (tester t2)
                            const q = query.trim();
                            const long = words.length > 700 && !q && !expanded[n.id];
                            const foundEarlier = !!q && n.mine && !words.toLowerCase().includes(q.toLowerCase())
                              && [n.text, n.original].some((w) => w.toLowerCase().includes(q.toLowerCase()));
                            return (
                              <>
                                <p className={`text-[15px] leading-relaxed text-[#3a3128] whitespace-pre-wrap [overflow-wrap:anywhere] mt-1 ${long ? "line-clamp-6" : ""}`}>
                                  <Marked text={words} q={q} />
                                </p>
                                {words.length > 700 && !q && (
                                  <button onClick={() => setExpanded((s) => ({ ...s, [n.id]: !s[n.id] }))} className="min-h-[44px] mr-5 text-sm text-[#514636] underline underline-offset-2">
                                    {expanded[n.id] ? "Show less" : `Show all ${n.wordCount.toLocaleString()} words`}
                                  </button>
                                )}
                                {foundEarlier && <p className="text-xs text-[#8a5a1a] mt-1">“{q}” is in the words as first saved — tap below to see them.</p>}
                                {/* "Tidy my dictation" said nothing when it couldn't tidy (tester t5) */}
                                {n.mine && n.tidyStatus === "pending" && <p className="text-xs text-[#6b5d4a] mt-1">Tidying — your words are saved as you said them.</p>}
                                {n.mine && (n.tidyStatus === "failed" || n.tidyStatus === "kept-original") && (
                                  <p className="text-xs text-[#6b5d4a] mt-1">Left exactly as you said it{n.tidyStatus === "failed" ? " — tidying wasn't possible just now" : " — tidying would have changed more than the punctuation"}.</p>
                                )}
                              </>
                            );
                          })()}
                          {/* Tidied or changed: what was actually said, one tap away */}
                          {!isEditing && (n.tidied || n.text !== n.original) && (
                            <>
                              <button onClick={() => setShowOriginal((s) => ({ ...s, [n.id]: !s[n.id] }))} className="min-h-[44px] text-xs text-[#514636] underline underline-offset-2">
                                {showOriginal[n.id] ? "Hide" : n.tidied ? "Tidied — show exactly what was said" : "Show the words as first saved"}
                              </button>
                              {showOriginal[n.id] && <p className="text-sm text-[#514636] whitespace-pre-wrap [overflow-wrap:anywhere] bg-[#faf8f5] rounded-lg px-2 py-1"><Marked text={n.tidied ? n.text : n.original} q={query.trim()} /></p>}
                            </>
                          )}
                          {line[n.id] && <p className="text-xs text-[#6b5d4a] mt-1" role="status">{line[n.id]}</p>}
                          {n.mine && !isEditing && (
                            confirmRemove === n.id ? (
                              // (the question, then both answers side by side — "Keep it" sat alone far below; tester t4)
                              <div className="mt-1">
                                <p className="text-sm text-[#3a3128]">Remove this note? Its words go for good.</p>
                                <div className="flex gap-2">
                                  <button onClick={() => removeNote(n)} disabled={busy === n.id} className="min-h-[44px] px-3 text-sm text-[#8a3a1a]">Remove it</button>
                                  <button onClick={() => setConfirmRemove(null)} className="min-h-[44px] px-3 text-sm text-[#514636]">Keep it</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-x-4 -mb-1">
                                <button onClick={() => setEditing({ id: n.id, text: n.text })} className="min-h-[44px] text-sm text-[#514636]">Change</button>
                                <button onClick={() => changeNote(n, { visibility: n.visibility === "trip" ? "private" : "trip" })} disabled={busy === n.id} className="min-h-[44px] text-sm text-[#514636]">
                                  {n.visibility === "trip" ? "Make it just me" : "Share with the trip"}
                                </button>
                                <button onClick={() => copyOut(n)} className="min-h-[44px] text-sm text-[#514636]">Send a copy</button>
                                <button onClick={() => setConfirmRemove(n.id)} className="min-h-[44px] text-sm text-[#6b5d4a]">Remove</button>
                              </div>
                            )
                          )}
                          {!n.mine && (
                            <div className="-mb-1"><button onClick={() => copyOut(n)} className="min-h-[44px] text-sm text-[#514636]">Send a copy</button></div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <p className="text-xs text-[#6b5d4a] mt-6">
                Settings has two choices for notes: tidying your dictation, and whether others' trip stories may use what you say about places.{" "}
                <button onClick={() => navigate("/settings#notes")} className="underline underline-offset-2 min-h-[44px]">Open Settings</button>
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

/** The words, with what was searched for marked */
function Marked({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="bg-[#f6e7bf] text-inherit rounded px-0.5">{p}</mark> : p))}</>;
}
