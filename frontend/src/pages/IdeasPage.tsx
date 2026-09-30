/**
 * IdeasPage — the ideas in Larisa's Guide (her Activities tab), city by city, for choosing on the road.
 *
 * Opens on the city you're in today (the first city before the trip). Each idea shows her comment,
 * who marked it in the Guide, and the group's notes. Two light actions, both Wander's own and never
 * written to the Guide:
 *   - a note (for everyone, or just for you) — kept on the phone with no signal and sent later;
 *   - "Add to a day" — puts it on that day's screen, labelled as added in Wander by you.
 * With no signal it opens from what this phone saved, and says so.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { queuedBodies } from "../lib/offlineStore";
import { useAuth } from "../contexts/AuthContext";
import type { Experience, Trip } from "../lib/types";
import { guideData, type TripGuideData } from "../lib/guideData";
import { mapsLink } from "../lib/guideDisplay";

interface Note { id: string; experienceId: string; content: string; visibility?: string; traveler: { displayName: string }; createdAt: string; _pending?: boolean }
interface DayChoice { id: string; date: string; text: string; experienceId: string | null; addedBy: string }

const ymd = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function phoneToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const copyKey = (tripId: string) => `wander:ideas-copy:${tripId}`;

/** Where an idea sits in Larisa's Activities tab (the importer keeps her row); Wander additions after hers */
const sheetRow = (e: Experience) => (e.sheetRowRef ? Number((e as { priorityOrder?: number }).priorityOrder ?? 5000) : 10000);

export default function IdeasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tripId, setTripId] = useState<string | null>(null);
  const [guide, setGuide] = useState<TripGuideData | null>(null);
  const [ideas, setIdeas] = useState<Experience[] | null>(null);
  const [notes, setNotes] = useState<Record<string, Note[]>>({});
  const [choices, setChoices] = useState<DayChoice[]>([]);
  const [fromCopy, setFromCopy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // "Marked by": everyone, or one person — Scout can open it already set ("the Kyoto ideas I marked")
  const [person, setPerson] = useState<string>(() => params.get("by") || "everyone");
  const [notesTick, setNotesTick] = useState(0);
  const [attempt, setAttempt] = useState(0);

  // The trip, its days and cities (shared with Home and the day screens; saved on the phone)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let id = localStorage.getItem("wander:last-trip-id");
        if (!id) id = (await api.get<Trip | null>("/trips/active"))?.id || null;
        if (!id) { if (!cancelled) setFailed(true); return; }
        const g = await guideData(id);
        if (!cancelled) { setTripId(id); setGuide(g); }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [attempt]);

  // All the trip's ideas, and the same-day plans that came from them
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [list, dayChoices] = await Promise.all([
          api.get<Experience[]>(`/experiences/trip/${tripId}`),
          api.get<DayChoice[]>(`/day-choices/${tripId}`).catch(() => [] as DayChoice[]),
        ]);
        if (cancelled) return;
        setIdeas(list); setChoices(dayChoices); setFromCopy(null); setFailed(false);
        try { localStorage.setItem(copyKey(tripId), JSON.stringify({ ideas: list, choices: dayChoices, savedAt: new Date().toISOString() })); } catch { /* full */ }
      } catch {
        try {
          const raw = localStorage.getItem(copyKey(tripId));
          if (raw && !cancelled) {
            const saved = JSON.parse(raw);
            setIdeas(saved.ideas); setChoices(saved.choices || []); setFromCopy(saved.savedAt);
            return;
          }
        } catch { /* unreadable */ }
        if (!cancelled) setFailed(true);
      }
    };
    load();
    window.addEventListener("online", load);
    window.addEventListener("wander:data-changed", load);
    return () => { cancelled = true; window.removeEventListener("online", load); window.removeEventListener("wander:data-changed", load); };
  }, [tripId, attempt]);

  // Cities that have ideas, in the trip's order
  const cities = useMemo(() => {
    if (!guide || !ideas) return [];
    const withIdeas = new Set(ideas.map((i) => i.cityId));
    return [...guide.trip.cities].sort((a, b) => a.sequenceOrder - b.sequenceOrder).filter((c) => withIdeas.has(c.id) && !c.hidden);
  }, [guide, ideas]);

  // Which city: the one asked for, else where you are today, else the first
  const today = phoneToday();
  const todayCityId = guide?.days.find((d) => ymd(d.date) === today)?.cityId || null;
  const cityId = params.get("city") && cities.some((c) => c.id === params.get("city"))
    ? params.get("city")!
    : cities.find((c) => c.id === todayCityId)?.id || cities[0]?.id || null;
  const city = cities.find((c) => c.id === cityId) || null;

  // The city's notes (the group's, and your own private ones)
  useEffect(() => {
    if (!cityId) return;
    let cancelled = false;
    const key = `wander:ideas-notes:${cityId}`;
    // Notes saved with no signal are still waiting on this phone — even after Wander was closed and
    // opened again — so they show, marked "waiting for signal", instead of looking lost
    const me = user?.displayName || "You";
    const withWaiting = async (base: Record<string, Note[]>) => {
      const out: Record<string, Note[]> = { ...base };
      for (const q of await queuedBodies("/experience-notes")) {
        const expId = String(q.experienceId || "");
        const content = String(q.content || "");
        if (!expId || !content || (out[expId] || []).some((n) => n.content === content)) continue;
        out[expId] = [...(out[expId] || []), {
          id: `pending-${q._at}`, experienceId: expId, content, visibility: String(q.visibility || "group"),
          traveler: { displayName: me }, createdAt: new Date(q._at).toISOString(), _pending: true,
        }];
      }
      return out;
    };
    api.get<Record<string, Note[]>>(`/experience-notes/city/${cityId}`)
      .then(async (n) => {
        try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* full */ }
        const merged = await withWaiting(n);
        if (!cancelled) setNotes(merged);
      })
      .catch(async () => {
        let saved: Record<string, Note[]> = {};
        try { const raw = localStorage.getItem(key); if (raw) saved = JSON.parse(raw); } catch { /* unreadable */ }
        const merged = await withWaiting(saved);
        if (!cancelled) setNotes(merged);
      });
    return () => { cancelled = true; };
  }, [cityId, attempt, notesTick]);
  // Scout added or took back a note: the screen behind it shows that at once
  useEffect(() => {
    const again = () => setNotesTick((n) => n + 1);
    window.addEventListener("wander:data-changed", again);
    return () => window.removeEventListener("wander:data-changed", again);
  }, []);

  const cityIdeas = useMemo(() => (ideas || []).filter((i) => i.cityId === cityId), [ideas, cityId]);
  // "Larisa (maybe)" is still Larisa for the filter; the card keeps the "(maybe)"
  const baseName = (n: string) => n.replace(/\s*\(maybe\)$/i, "");
  const people = useMemo(() => {
    const set = new Set<string>();
    for (const i of cityIdeas) for (const p of i.interests || []) set.add(baseName(p.displayName));
    return Array.from(set).sort();
  }, [cityIdeas]);
  const shown = (person === "everyone" ? cityIdeas : cityIdeas.filter((i) => (i.interests || []).some((p) => baseName(p.displayName) === person)))
    // Larisa's order, as in her Activities tab
    .slice().sort((a, b) => sheetRow(a) - sheetRow(b));
  const cityDays = useMemo(() => (guide?.days || []).filter((d) => d.cityId === cityId).map((d) => ymd(d.date)).sort(), [guide, cityId]);
  const eat = shown.filter((i) => (i.themes || []).includes("food"));
  const doing = shown.filter((i) => !(i.themes || []).includes("food"));

  // Reset the person filter when the city changes and that person marked nothing there
  // (only once the ideas are here — before that the list is empty, and a filter Scout set would be lost)
  useEffect(() => { if (ideas && person !== "everyone" && !people.includes(person)) setPerson("everyone"); }, [ideas, people, person]);

  if (failed && !ideas) {
    return (
      <div className="min-h-[100dvh] bg-[#faf8f5] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-base text-[#3a3128] mb-1">Wander can't reach the ideas right now.</p>
        <p className="text-sm text-[#6b5d4a] mb-5">This phone hasn't saved them yet. They'll open once you're back online.</p>
        <button onClick={() => { setFailed(false); setAttempt((n) => n + 1); }} className="min-h-[44px] px-5 rounded-xl bg-[#514636] text-white text-sm mb-2">Try again</button>
        <button onClick={() => navigate("/")} className="min-h-[44px] px-5 text-sm text-[#514636]">Back to the trip</button>
      </div>
    );
  }

  if (!ideas || !guide) {
    return <div className="min-h-[100dvh] bg-[#faf8f5] flex items-center justify-center text-sm text-[#6b5d4a]">Finding Larisa's ideas…</div>;
  }

  return (
    <div className="min-h-[100dvh] bg-[#faf8f5] pb-32">
      <header className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur border-b border-[#e0d8cc] pt-[max(env(safe-area-inset-top),8px)]">
        <div className="px-4 pb-1">
          <h1 className="text-lg font-medium text-[#3a3128]">Ideas{city ? ` · ${city.name}` : ""}</h1>
          <p className="text-xs text-[#6b5d4a]">From the Activities tab of Larisa's Guide</p>
        </div>
        {/* Cities */}
        <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-1" role="tablist" aria-label="City">
          {cities.map((c) => (
            <button key={c.id} role="tab" aria-selected={c.id === cityId}
              onClick={() => setParams({ city: c.id }, { replace: true })}
              className={`shrink-0 min-h-[44px] px-3.5 rounded-full text-sm border ${c.id === cityId ? "bg-[#514636] text-white border-[#514636]" : "bg-white text-[#514636] border-[#e0d8cc]"}`}>
              {c.name}{c.id === todayCityId ? " · today" : ""}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 pt-3 max-w-xl mx-auto">
        {fromCopy && (
          <p className="mb-3 text-sm text-[#6b5d4a] bg-white/70 border border-[#e0d8cc] rounded-lg px-3 py-2" role="status">
            No signal — showing what this phone saved {new Date(fromCopy).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}.
          </p>
        )}

        {/* Who marked what */}
        {people.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs text-[#6b5d4a]">Marked by</span>
            {["everyone", ...people].map((p) => (
              <button key={p} onClick={() => setPerson(p)} aria-pressed={person === p}
                className={`min-h-[44px] px-3 rounded-full text-sm border ${person === p ? "bg-[#efe6d6] border-[#c8b89c] text-[#3a3128]" : "bg-white border-[#e0d8cc] text-[#514636]"}`}>
                {p === "everyone" ? "Anyone" : p === user?.displayName ? `${p} (you)` : p}
              </button>
            ))}
          </div>
        )}

        {shown.length === 0 && (
          <p className="text-sm text-[#6b5d4a] bg-white rounded-xl border border-[#e0d8cc] p-4">
            {person === "everyone" ? `The Guide has no ideas listed for ${city?.name || "this city"}.` : `${person} hasn't marked anything in ${city?.name}.`}
          </p>
        )}

        {[["Things to do", doing], ["Places to eat", eat]].map(([title, list]) => (list as Experience[]).length === 0 ? null : (
          <section key={title as string} className="mb-5">
            <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">{title as string}</h2>
            <ul className="space-y-2">
              {(list as Experience[]).map((exp) => (
                <IdeaCard key={exp.id} exp={exp} cityName={city?.name || ""} notes={notes[exp.id] || []} me={user?.displayName || "You"}
                  tripId={tripId!} days={cityDays} today={today} choices={choices.filter((c) => c.experienceId === exp.id)}
                  onNote={(n) => setNotes((prev) => ({ ...prev, [exp.id]: [...(prev[exp.id] || []), n] }))}
                  onRemoveNote={(id) => setNotes((prev) => ({ ...prev, [exp.id]: (prev[exp.id] || []).filter((x) => x.id !== id) }))}
                  onChoice={(c) => setChoices((prev) => [...prev, c])}
                  onOpenDay={(d) => navigate(`/day/${d}`)} />
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}

function IdeaCard({ exp, cityName, notes, me, tripId, days, today, choices, onNote, onRemoveNote, onChoice, onOpenDay }: {
  exp: Experience; cityName: string; notes: Note[]; me: string; tripId: string; days: string[]; today: string;
  choices: DayChoice[]; onNote: (n: Note) => void; onRemoveNote: (id: string) => void; onChoice: (c: DayChoice) => void; onOpenDay: (date: string) => void;
}) {
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [justMe, setJustMe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmTakeBack, setConfirmTakeBack] = useState<string | null>(null);
  const marked = Array.from(new Set((exp.interests || []).map((i) => i.displayName)));

  async function takeBack(n: Note) {
    setConfirmTakeBack(null);
    try {
      await api.delete(`/experience-notes/${n.id}`);
      onRemoveNote(n.id);
      setMessage(null);
    } catch (err) {
      // Already gone (Scout took it back, or another phone did): just take it off the screen
      if ((err as { status?: number }).status === 404) { onRemoveNote(n.id); setMessage(null); return; }
      setMessage(navigator.onLine === false ? "No signal — try taking it back when you're online." : "That note didn't come off — try again?");
    }
  }
  const removedFromGuide = (exp.sheetRowRef || "").startsWith("Removed from Guide|");
  const fromGuide = !!exp.sheetRowRef && !removedFromGuide;
  // Today first, then the days still ahead — never a day already over
  const ahead = days.filter((d) => d >= today);
  const orderedDays = ahead.includes(today) ? [today, ...ahead.filter((d) => d !== today)] : ahead;

  async function saveNote() {
    const content = text.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      const res = await api.post<Note & { _queued?: boolean }>("/experience-notes", { experienceId: exp.id, content, visibility: justMe ? "private" : "group" });
      if ((res as { _queued?: boolean })._queued) {
        onNote({ id: `pending-${Date.now()}`, experienceId: exp.id, content, visibility: justMe ? "private" : "group", traveler: { displayName: me }, createdAt: new Date().toISOString(), _pending: true });
        setMessage("Saved on this phone — I'll send it when you have signal.");
      } else {
        onNote({ ...res, traveler: res.traveler || { displayName: me } });
        setMessage(null);
      }
      setText(""); setWriting(false); setJustMe(false);
    } catch {
      setMessage("That note didn't save — it's still in the box. Try again?");
    } finally {
      setSaving(false);
    }
  }

  async function addToDay(date: string) {
    setPicking(false);
    try {
      const res = await api.post<DayChoice & { _queued?: boolean }>(`/day-choices/${tripId}`, { date, experienceId: exp.id, text: exp.name });
      if ((res as { _queued?: boolean })._queued) {
        onChoice({ id: `pending-${Date.now()}`, date, text: exp.name, experienceId: exp.id, addedBy: me });
        setMessage(`Saved on this phone — it goes on ${shortDay(date)} when you have signal.`);
      } else {
        onChoice(res);
        setMessage(null);
      }
    } catch {
      setMessage("That didn't go on the day — try again?");
    }
  }

  return (
    <li className="bg-white rounded-xl border border-[#e0d8cc] p-3">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-[15px] font-medium text-[#3a3128] leading-snug">{exp.name}</p>
      </div>
      {exp.description && <p className="text-sm text-[#6b5d4a] mt-1 whitespace-pre-line">{exp.description}</p>}
      <p className="text-xs text-[#514636] mt-1.5">
        {marked.length > 0 ? `Marked by ${marked.join(", ")}` : "Nobody has marked this yet"}
        {removedFromGuide
          ? " · no longer in Larisa's Guide — kept here for the notes on it"
          : !fromGuide && ` · added in Wander by ${exp.createdBy}`}
      </p>
      {choices.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {choices.map((c) => (
            <button key={c.id} onClick={() => onOpenDay(c.date)} className="min-h-[36px] px-2.5 rounded-full bg-[#eef3e8] text-[#3f5a2a] text-xs">
              On {shortDay(c.date)} · added by {c.addedBy} ›
            </button>
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {notes.map((n) => {
            // "Ken: go early" written by Ken reads once, not "Ken: Ken: go early"
            const name = n.traveler.displayName;
            const content = n.content.replace(new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i"), "");
            const mine = name === me && !n._pending;
            return (
              <li key={n.id} className="text-sm text-[#514636] bg-[#f6f1e8] rounded-lg px-2.5 py-1.5">
                <span className="font-medium">{name}:</span> {content}
                {n.visibility === "private" && <span className="text-xs text-[#6b5d4a]"> · just for you</span>}
                {n._pending && <span className="text-xs text-[#6b5d4a]"> · waiting for signal</span>}
                {mine && (confirmTakeBack === n.id ? (
                  <span className="flex flex-wrap items-center gap-x-3">
                    <span className="text-xs text-[#6b5d4a]">Take this note back?</span>
                    <button onClick={() => takeBack(n)} className="min-h-[44px] text-sm text-[#8a3a1a]">Take it back</button>
                    <button onClick={() => setConfirmTakeBack(null)} className="min-h-[44px] text-sm text-[#514636]">Keep</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmTakeBack(n.id)} aria-label={`Take back your note on ${exp.name}`} className="block min-h-[44px] text-xs text-[#6b5d4a] underline underline-offset-2">
                    Take back
                  </button>
                ))}
              </li>
            );
          })}
        </ul>
      )}

      {writing && (
        <div className="mt-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus rows={2}
            placeholder="A thought for the group…"
            className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] text-[16px] text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-[#a89880]" />
          <label className="flex items-center gap-2 min-h-[44px] text-sm text-[#514636]">
            <input type="checkbox" checked={justMe} onChange={(e) => setJustMe(e.target.checked)} className="w-5 h-5" />
            Just for me
          </label>
          <p className="text-xs text-[#6b5d4a]">{justMe ? "Only you will see this note." : "Everyone on the trip sees this."} Larisa's Guide stays as it is.</p>
          <div className="flex gap-2 mt-1">
            <button onClick={saveNote} disabled={!text.trim() || saving} className="min-h-[44px] px-4 rounded-lg bg-[#514636] text-white text-sm disabled:opacity-40">{saving ? "Saving…" : "Save note"}</button>
            <button onClick={() => { setWriting(false); setText(""); }} className="min-h-[44px] px-4 text-sm text-[#514636]">Cancel</button>
          </div>
        </div>
      )}

      {picking && (
        <div className="mt-2">
          <p className="text-sm text-[#3a3128] mb-1">Which day?</p>
          <div className="flex flex-wrap gap-2">
            {orderedDays.map((d) => (
              <button key={d} onClick={() => addToDay(d)} className="min-h-[44px] px-3 rounded-lg border border-[#e0d8cc] bg-white text-sm text-[#514636]">
                {d === today ? `Today · ${shortDay(d)}` : shortDay(d)}
              </button>
            ))}
            <button onClick={() => setPicking(false)} className="min-h-[44px] px-3 text-sm text-[#6b5d4a]">Cancel</button>
          </div>
          <p className="text-xs text-[#6b5d4a] mt-1">It shows on that day for everyone, as added in Wander by you.</p>
        </div>
      )}

      {!writing && !picking && (
        <div className="flex flex-wrap items-center gap-x-4 mt-1">
          <button onClick={() => setWriting(true)} className="min-h-[44px] text-sm text-[#514636]">+ Note</button>
          {orderedDays.length > 0 && <button onClick={() => setPicking(true)} className="min-h-[44px] text-sm text-[#514636]">Add to a day</button>}
          <a href={mapsLink(`${exp.name}, ${cityName}`)} className="min-h-[44px] inline-flex items-center text-sm text-[#514636]">Maps ↗</a>
          {exp.sourceUrl && <a href={exp.sourceUrl} target="_blank" rel="noreferrer" className="min-h-[44px] inline-flex items-center text-sm text-[#514636]">Link ↗</a>}
          <button onClick={() => window.dispatchEvent(new CustomEvent("wander-open-chat", { detail: { prefill: `Tell me about ${exp.name} in ${cityName}` } }))}
            className="min-h-[44px] text-sm text-[#514636]">Ask Scout</button>
        </div>
      )}
      {message && <p className="text-sm text-[#6b5d4a] mt-1" role="status">{message}</p>}
    </li>
  );
}
