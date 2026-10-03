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
import { queuedBodies, phonePerson } from "../lib/offlineStore";
import { useAuth } from "../contexts/AuthContext";
import type { Experience, Trip } from "../lib/types";
import { guideData, type TripGuideData, type GuideItem } from "../lib/guideData";
import { mapsLink, voiceFor, linkLabel, partyOf } from "../lib/guideDisplay";
import { maybesChanged, type SeenRow } from "../lib/maybesNews";

interface Note { id: string; experienceId: string; content: string; visibility?: string; traveler: { displayName: string }; createdAt: string; _pending?: boolean }
interface DayChoice { id: string; date: string; text: string; experienceId: string | null; addedBy: string }

const ymd = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function phoneToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// (per person as well as per trip: a phone can be handed to someone else — private notes and picks are in it)
const copyKey = (tripId: string) => `wander:ideas-copy:${tripId}:${phonePerson()}`;

/** Where an idea sits in Larisa's Activities tab (the importer keeps her row); Wander additions after hers */
// An idea's telling words, to find it in her day plans: "Opa - Onitsuka Tiger" → onitsuka, tiger; "Gion - Hanamikoji
// Street" → gion, hanamikoji; "Tokyodo" → tokyodo. The first two before any "(" that aren't generic ("store",
// "museum"…) or a city's name (cut at " - ", "Gion" alone matched her Gion matcha stop).
const GENERIC = new Set(["store", "stores", "shop", "shops", "dept", "department", "museum", "flagship", "market", "street", "tour", "tours", "trip", "with", "and", "the", "concept", "potential", "suggestions", "shopping", "food", "day", "tokyo", "kyoto", "osaka"]);
const wordsOf = (name: string) =>
  (name.split("(")[0].toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length >= 4 && !GENERIC.has(w)).slice(0, 2)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
/** The word in a text — a long one even with one letter off ("ITOYA stationary store" in Activities, "ITOYA
 *  stationery store" in her Oct 15 plan) */
function hasWord(text: string, w: string): boolean {
  if (new RegExp(`\\b${w}\\b`, "i").test(text)) return true;
  if (w.length < 8) return false;
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).some((t) => t.length === w.length && [...t].filter((c, i) => c !== w[i]).length === 1);
}
const sheetRow = (e: Experience) => (e.sheetRowRef ? Number((e as { priorityOrder?: number }).priorityOrder ?? 5000) : 10000);

/** One person, however they're named: "Larisa (maybe)", "Julie (via Andy)", "Andy B" → "Larisa", "Julie", "Andy" */
const personOf = (n: string) => n.replace(/\s*\((maybe|via [^)]*)\)\s*$/i, "").trim().split(/\s+/)[0] || n;
/** The phone's own date of a moment */
const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/** "just now", "12 min ago", "3 hours ago", "yesterday", "Tue, Oct 13" */
function agoWords(iso: string, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60 && localDay(iso) === localDay(new Date(now).toISOString())) { const h = Math.round(mins / 60); return h === 1 ? "an hour ago" : `${h} hours ago`; }
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (localDay(iso) === localDay(y.toISOString())) return "yesterday";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

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
  const [person, setPerson] = useState<string>(() => (params.get("by") ? personOf(params.get("by")!) : "everyone"));
  const [notesTick, setNotesTick] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [seenRows, setSeenRows] = useState<SeenRow[]>([]);
  const [lastLook, setLastLook] = useState<Record<string, string | null>>({});
  const [showEarlier, setShowEarlier] = useState(false);

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
    // (this person's copy: on a phone handed from Ken to Andy, Ken's private note showed on Andy's screen — k2)
    const key = `wander:ideas-notes:${cityId}:${phonePerson()}`;
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
    // The notes this phone last saw show at once, then the fresh copy replaces them (round 12: on a reload the notes
    // arrived a moment after the ideas, and for that moment every note looked deleted)
    let fresh = false;
    try { const raw = localStorage.getItem(key); if (raw) { const seen = JSON.parse(raw); withWaiting(seen).then((m) => { if (!cancelled && !fresh) setNotes(m); }); } } catch { /* unreadable */ }
    api.get<Record<string, Note[]>>(`/experience-notes/city/${cityId}`)
      .then(async (n) => {
        fresh = true;
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

  // Who has looked at this city's list since each maybe went up ("Seen by"), and your own last look before this one
  // (what's "New" to you stays marked while you're here). Looking now is recorded, and the tab's dot looks again.
  useEffect(() => {
    if (!tripId || !cityId) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.get<SeenRow[]>(`/maybes/seen/${tripId}`);
        if (cancelled) return;
        setSeenRows(rows);
        setLastLook((prev) => (cityId in prev ? prev : { ...prev, [cityId]: rows.find((r) => r.me)?.seen?.[cityId] || null }));
        await api.post(`/maybes/seen`, { tripId, cityId });
        maybesChanged();
      } catch { /* no signal: nothing marked seen or new */ }
    })();
    return () => { cancelled = true; };
  }, [tripId, cityId, attempt]);

  const cityIdeas = useMemo(() => (ideas || []).filter((i) => i.cityId === cityId), [ideas, cityId]);
  // "Larisa (maybe)", "Julie (via Andy)" and "Andy B" are Larisa, Julie and Andy for the filter (her columns hold first
  // names; Wander's "I'm in" carries the full name); the card keeps the "(maybe)"
  const people = useMemo(() => {
    const set = new Set<string>();
    for (const i of cityIdeas) for (const p of i.interests || []) set.add(personOf(p.displayName));
    return Array.from(set).sort();
  }, [cityIdeas]);
  const filtered = person === "everyone" ? cityIdeas : cityIdeas.filter((i) => (i.interests || []).some((p) => personOf(p.displayName) === personOf(person)));
  // Her ideas in her order, as in her Activities tab; the group's maybes newest first, above them
  const shown = filtered.filter((i) => !!i.sheetRowRef).sort((a, b) => sheetRow(a) - sheetRow(b));
  const maybes = filtered.filter((i) => !i.sheetRowRef).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // A small maybe ("tea or ice cream?" — no link, not on a day) from a day before today folds into "Earlier"
  const earlierThan = (e: Experience) => !e.sourceUrl && !e.dayId && localDay(e.createdAt) < today;
  const maybesNow = maybes.filter((e) => !earlierThan(e));
  const maybesEarlier = maybes.filter(earlierThan);
  const cityDays = useMemo(() => (guide?.days || []).filter((d) => d.cityId === cityId).map((d) => ymd(d.date)).sort(), [guide, cityId]);
  // The days her own plan already has each idea (Bamboo Forest said "Nobody has marked this yet" though it opens her
  // Oct 26; Julie's two marks are both on her days — round 15)
  const planDays = useMemo(() => {
    const out = new Map<string, string[]>();
    const days = new Set(cityDays);
    // (her day tabs' lines, her Itinerary's line for each day, her bookings and tours — not "stop", her Itinerary's
    // note on a whole stay, filed under one day:
    // "day trip to Mashiko… ASK KENJI" sat on Oct 17 and Mashiko read as planned for that day)
    const lines = (guide?.items || []).filter((it) => it.date && days.has(ymd(it.date)) && ["block", "meal", "plan", "tour"].includes(it.kind));
    // (her ideas only: a maybe's words — "tea after the museum?" — would match her lines by chance)
    for (const exp of cityIdeas.filter((e) => !!e.sheetRowRef)) {
      const words = wordsOf(exp.name);
      if (!words.length) continue;
      // (her line's title, or what she wrote it's for — "Experience: … the multi-story ITOYA stationery store, Nippon
      // Made & Yellow…" names Julie's pick inside Oct 15's "Ginza Premium Retail Walk"; never Wander's own lines, whose
      // "…the Onitsuka Tiger flagship shopping day…" sits on every Oct 17 line)
      const said = (it: GuideItem) => [it.title, ...(it.detail || "").split("\n").filter((l) => /^Experience:/.test(l))].join("\n");
      const found = Array.from(new Set(lines.filter((it) => words.every((w) => hasWord(said(it), w))).map((it) => ymd(it.date!)))).sort();
      if (found.length) out.set(exp.id, found);
    }
    return out;
  }, [guide, cityIdeas, cityDays]);
  const eat = shown.filter((i) => (i.themes || []).includes("food"));
  const doing = shown.filter((i) => !(i.themes || []).includes("food"));

  const me = user?.displayName || "You";
  const myName = personOf(me).toLowerCase();
  // Seen by: the others who've looked at this city's list since the maybe went up (not its writer, not you)
  const seenByFor = (e: Experience) => seenRows
    .filter((r) => !r.me && personOf(r.name).toLowerCase() !== personOf(e.createdBy).toLowerCase())
    .filter((r) => cityId && r.seen[cityId] && new Date(r.seen[cityId]).getTime() >= new Date(e.createdAt).getTime())
    .map((r) => personOf(r.name));
  // New to you: someone else's, since your last look (never looked: from the last day)
  const isNewFor = (e: Experience) => {
    if (personOf(e.createdBy).toLowerCase() === myName || !cityId) return false;
    const last = lastLook[cityId];
    const at = new Date(e.createdAt).getTime();
    return last ? at > new Date(last).getTime() : Date.now() - at < 86400_000;
  };
  // Whom you can speak for: the others in your party in her Guide who aren't on Wander ("Julie (via Andy)")
  const viaNames = useMemo(() => {
    const party = guide ? partyOf(guide.items, me) : null;
    if (!party) return [] as string[];
    const onWander = new Set(seenRows.map((r) => personOf(r.name).toLowerCase()));
    return party.split(/\s*(?:&|,|\band\b)\s*/i).map((n) => n.trim()).filter(Boolean)
      .filter((n) => personOf(n).toLowerCase() !== myName && !onWander.has(personOf(n).toLowerCase()))
      .map((n) => personOf(n));
  }, [guide, me, myName, seenRows]);
  const setInterestsOf = (id: string, interests: Experience["interests"]) =>
    setIdeas((prev) => (prev || []).map((x) => (x.id === id ? { ...x, interests } : x)));

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
      <header className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur border-b border-[#e0d8cc] top-bar">
        <div className="px-4 pb-1">
          <h1 className="text-lg font-medium text-[#3a3128]">Maybes{city ? ` · ${city.name}` : ""}</h1>
          <p className="text-xs text-[#6b5d4a]">The group's maybes and {voiceFor(user?.displayName).mine ? "your" : "Larisa's"} ideas</p>
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

        {/* "Maybe we should…" — one sentence, for everyone, on this city's list */}
        {city && tripId && (
          <MaybeBox tripId={tripId} cityId={city.id} cityName={city.name} me={me}
            onAdded={(exp) => setIdeas((prev) => (prev && !prev.some((x) => x.id === exp.id) ? [exp, ...prev] : prev))} />
        )}

        {/* Show only what one person is in on — apart from the box, above the lists (right under Send it read as
            choosing who a maybe goes to; fresh review, Oct 2) */}
        {people.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3 mt-5 pt-3 border-t border-[#e0d8cc]" role="group" aria-label="Show what one person is in on">
            <span className="text-xs text-[#6b5d4a]">Show:</span>
            {["everyone", ...people].map((p) => (
              <button key={p} onClick={() => setPerson(p)} aria-pressed={person === p}
                className={`min-h-[44px] px-3 rounded-full text-sm border ${person === p ? "bg-[#efe6d6] border-[#c8b89c] text-[#3a3128]" : "bg-white border-[#e0d8cc] text-[#514636]"}`}>
                {p === "everyone" ? "Everyone" : p.toLowerCase() === myName ? "What you're in on" : `${p}'s`}
              </button>
            ))}
          </div>
        )}

        {(() => {
          const card = (exp: Experience) => (
            <IdeaCard key={exp.id} exp={exp} cityName={city?.name || ""} notes={notes[exp.id] || []} me={me}
              travelerId={user?.travelerId || null} viaNames={viaNames} seenBy={exp.sheetRowRef ? [] : seenByFor(exp)} isNew={!exp.sheetRowRef && isNewFor(exp)}
              tripId={tripId!} days={cityDays} today={today} choices={choices.filter((c) => c.experienceId === exp.id)}
              planned={planDays.get(exp.id) || []}
              onInterests={(list) => setInterestsOf(exp.id, list)}
              onGone={() => setIdeas((prev) => (prev || []).filter((x) => x.id !== exp.id))}
              onNote={(n) => setNotes((prev) => ({ ...prev, [exp.id]: [...(prev[exp.id] || []), n] }))}
              onRemoveNote={(id) => setNotes((prev) => ({ ...prev, [exp.id]: (prev[exp.id] || []).filter((x) => x.id !== id) }))}
              onChoice={(c) => setChoices((prev) => [...prev, c])}
              onOpenDay={(d) => navigate(`/day/${d}`)} />
          );
          return (
            <>
              {(maybesNow.length > 0 || maybesEarlier.length > 0) && (
                <section className="mb-5">
                  <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">The group's maybes</h2>
                  <ul className="space-y-2">{maybesNow.map(card)}</ul>
                  {maybesEarlier.length > 0 && (
                    <>
                      <button onClick={() => setShowEarlier((v) => !v)} aria-expanded={showEarlier}
                        className="mt-1 min-h-[44px] text-sm text-[#514636]">
                        {showEarlier ? "Hide earlier ones" : `Earlier · ${maybesEarlier.length} ›`}
                      </button>
                      {showEarlier && <ul className="space-y-2">{maybesEarlier.map(card)}</ul>}
                    </>
                  )}
                </section>
              )}

              {shown.length === 0 && (
                <p className="text-sm text-[#6b5d4a] bg-white rounded-xl border border-[#e0d8cc] p-4 mb-5">
                  {person === "everyone" ? `${voiceFor(user?.displayName).mine ? "Your" : "Larisa's"} Guide has no ideas listed for ${city?.name || "this city"}.` : `${person} hasn't said they're in on anything in ${city?.name} yet.`}
                </p>
              )}

              {[["Things to do", doing], ["Places to eat", eat]].map(([title, list]) => (list as Experience[]).length === 0 ? null : (
                <section key={title as string} className="mb-5">
                  <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">{title as string} · from {voiceFor(user?.displayName).guide}</h2>
                  <ul className="space-y-2">{(list as Experience[]).map(card)}</ul>
                </section>
              ))}
            </>
          );
        })()}
      </main>
    </div>
  );
}

function IdeaCard({ exp, cityName, notes, me, travelerId, viaNames, seenBy, isNew, tripId, days, today, choices, planned, onInterests, onGone, onNote, onRemoveNote, onChoice, onOpenDay }: {
  exp: Experience; cityName: string; notes: Note[]; me: string; travelerId: string | null; viaNames: string[]; seenBy: string[]; isNew: boolean;
  tripId: string; days: string[]; today: string; planned: string[]; onInterests: (list: Experience["interests"]) => void; onGone: () => void;
  choices: DayChoice[]; onNote: (n: Note) => void; onRemoveNote: (id: string) => void; onChoice: (c: DayChoice) => void; onOpenDay: (date: string) => void;
}) {
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [justMe, setJustMe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmTakeBack, setConfirmTakeBack] = useState<string | null>(null);
  const isMaybe = !exp.sheetRowRef;
  const interests = exp.interests || [];
  const myName = personOf(me).toLowerCase();
  const myMaybe = isMaybe && personOf(exp.createdBy).toLowerCase() === myName;
  const [confirmGone, setConfirmGone] = useState(false);
  // Take back your own maybe (plans change); a day it was put on keeps its plan
  async function takeBackMaybe() {
    setConfirmGone(false);
    try {
      await api.delete(`/maybes/${exp.id}`);
      onGone();
      maybesChanged();
    } catch (err) {
      if ((err as { status?: number }).status === 404) { onGone(); return; }
      setMessage(navigator.onLine === false ? "No signal — try taking it back when you're online." : "That didn't come off — try again?");
    }
  }
  const myCode = travelerId ? `wander:${travelerId}` : null;
  const forCode = (name: string) => `${myCode}:for:${name.toLowerCase()}`;
  const imIn = !!myCode && interests.some((i) => i.userCode === myCode);
  // Your own X in her Guide: you're in there already, and only she can change it
  const inByHerGuide = interests.some((i) => !i.userCode?.startsWith("wander:") && personOf(i.displayName).toLowerCase() === myName);
  // One line for everyone in: her X marks and Wander's "I'm in" together (Ken, Oct 2: one list), one name a person —
  // "Julie (via Andy)" only when Julie has no mark of her own; you as "you"
  const interested = (() => {
    const out = new Map<string, string>();
    for (const i of [...interests].sort((a, b) => Number(/\(via /.test(a.displayName)) - Number(/\(via /.test(b.displayName)))) {
      const who = personOf(i.displayName);
      const key = who.toLowerCase();
      if (out.has(key)) continue;
      const via = i.displayName.match(/\(via ([^)]+)\)/)?.[1];
      const maybe = /\(maybe\)$/i.test(i.displayName) ? " (maybe)" : "";
      out.set(key, key === myName ? `you${maybe}` : via ? `${who} (via ${personOf(via).toLowerCase() === myName ? "you" : via})` : `${who}${maybe}`);
    }
    return Array.from(out.values());
  })();

  async function setIn(on: boolean, forName?: string) {
    if (!myCode) return;
    const code = forName ? forCode(forName) : myCode;
    const before = interests;
    const display = forName ? `${forName} (via ${personOf(me)})` : me;
    onInterests(on ? [...interests.filter((i) => i.userCode !== code), { displayName: display, userCode: code }] : interests.filter((i) => i.userCode !== code));
    try {
      const res = await api.post<{ on: boolean; interests?: Experience["interests"]; _queued?: boolean }>(`/maybes/${exp.id}/in`, { on, ...(forName ? { forName } : {}) });
      if (res._queued) setMessage("Saved on this phone — it goes through when you have signal.");
      else if (res.interests) { onInterests(res.interests); setMessage(null); }
    } catch {
      onInterests(before);
      setMessage("That didn't go through — try again?");
    }
  }

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
      {/* A maybe: who said it and when */}
      {isMaybe && (
        <p className="text-xs text-[#6b5d4a] mb-0.5">
          {personOf(exp.createdBy).toLowerCase() === myName ? "You" : personOf(exp.createdBy)} · {agoWords(exp.createdAt)}
          {isNew && <span className="ml-1.5 px-1.5 py-px rounded bg-[#f5e6c8] text-[#7a4f12]">New</span>}
        </p>
      )}
      <div className="flex items-start gap-2">
        <p className="flex-1 text-[15px] font-medium text-[#3a3128] leading-snug">{exp.name}</p>
      </div>
      {exp.description && <p className="text-sm text-[#6b5d4a] mt-1 whitespace-pre-line">{exp.description}</p>}
      <p className="text-xs text-[#514636] mt-1.5">
        {/* "you", not your own name (delight audit: "Marked by Larisa" on Larisa's phone, sixteen times) */}
        {[
          interested.length > 0
            ? `Interested: ${interested.join(", ")}`
            // (on her plan already: "nobody has marked this" read as nobody wanted it)
            : planned.length ? null : "Nobody's in yet",
          removedFromGuide ? `no longer in ${voiceFor(me).guide} — kept here for the notes on it` : null,
        ].filter(Boolean).join(" · ")}
      </p>
      {seenBy.length > 0 && <p className="text-xs text-[#8a7d6a] mt-0.5">Seen by {seenBy.join(", ")}</p>}
      {planned.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {planned.map((d) => (
            <button key={d} onClick={() => onOpenDay(d)} className="min-h-[44px] px-3 rounded-full bg-[#eef3e8] text-[#3f5a2a] text-sm">
              In {voiceFor(me).mine ? "your" : "Larisa's"} plan for {shortDay(d)} ›
            </button>
          ))}
        </div>
      )}
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
          <p className="text-xs text-[#6b5d4a]">{justMe ? "Only you will see this note." : "Everyone on the trip sees this."} {voiceFor(me).mine ? "Your Guide" : "Larisa's Guide"} stays as it is.</p>
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
          {/* I'm in — one tap, again to take it back (your X in her Guide already says it; only she can change that) */}
          {myCode && !inByHerGuide && (
            <button onClick={() => setIn(!imIn)} aria-pressed={imIn}
              className={`min-h-[44px] px-3.5 rounded-full text-sm border ${imIn ? "bg-[#514636] text-white border-[#514636]" : "bg-white text-[#514636] border-[#c8b89c]"}`}>
              {imIn ? "✓ You're in" : "I'm in"}
            </button>
          )}
          {/* …and the one beside you who isn't on Wander ("Julie (via Andy)") */}
          {myCode && (imIn || inByHerGuide) && viaNames.map((name) => {
            const on = interests.some((i) => i.userCode === forCode(name));
            const herOwn = interests.some((i) => !i.userCode?.startsWith("wander:") && personOf(i.displayName).toLowerCase() === name.toLowerCase());
            return herOwn ? null : (
              <button key={name} onClick={() => setIn(!on, name)} aria-pressed={on}
                className={`min-h-[44px] px-3 rounded-full text-sm border ${on ? "bg-[#efe6d6] border-[#c8b89c] text-[#3a3128]" : "bg-white border-[#e0d8cc] text-[#514636]"}`}>
                {on ? `✓ ${name}'s in too` : `${name}'s in too`}
              </button>
            );
          })}
          <button onClick={() => setWriting(true)} className="min-h-[44px] min-w-[44px] text-sm text-[#514636]">Say something</button>
          {orderedDays.length > 0 && <button onClick={() => setPicking(true)} className="min-h-[44px] text-sm text-[#514636]">Add to a day</button>}
          {/* (Maps searches the name — right for her places, not for a sentence like "tea or ice cream?") */}
          {!isMaybe && <a href={mapsLink(`${exp.name}, ${cityName}`)} className="min-h-[44px] inline-flex items-center text-sm text-[#514636]">Maps ↗</a>}
          {exp.sourceUrl && <a href={exp.sourceUrl} target="_blank" rel="noreferrer" className="min-h-[44px] min-w-[44px] inline-flex items-center text-sm text-[#514636]">{linkLabel(exp.sourceUrl)} ↗</a>}
          <button onClick={() => window.dispatchEvent(new CustomEvent("wander-open-chat", { detail: { prefill: isMaybe ? `About this maybe in ${cityName} — "${exp.name}": ` : `Tell me about ${exp.name} in ${cityName}` } }))}
            className="min-h-[44px] text-sm text-[#514636]">Ask Scout</button>
          {myMaybe && !confirmGone && (
            <button onClick={() => setConfirmGone(true)} className="min-h-[44px] text-sm text-[#6b5d4a] underline underline-offset-2">Take back</button>
          )}
        </div>
      )}
      {myMaybe && confirmGone && (
        <div className="flex flex-wrap items-center gap-x-3 mt-1">
          <span className="text-sm text-[#3a3128]">Take this maybe back?</span>
          <button onClick={takeBackMaybe} className="min-h-[44px] text-sm text-[#8a3a1a]">Take it back</button>
          <button onClick={() => setConfirmGone(false)} className="min-h-[44px] text-sm text-[#514636]">Keep it</button>
        </div>
      )}
      {message && <p className="text-sm text-[#6b5d4a] mt-1" role="status">{message}</p>}
    </li>
  );
}

/**
 * "Maybe we should…" (Ken, Oct 2 2026) — as light as saying it: a sentence (a link pasted in it is kept as its link),
 * Send, and it's on this city's list for everyone. Then, if you like, "Tell the group": the iPhone's share sheet with the
 * words, so it reaches the group text too (and Julie, who isn't on Wander). With no signal it waits on the phone.
 */
function MaybeBox({ tripId, cityId, cityName, me, onAdded }: { tripId: string; cityId: string; cityName: string; me: string; onAdded: (e: Experience) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ words: string; link: string | null; queued: boolean } | null>(null);
  const [line, setLine] = useState<string | null>(null);

  async function send() {
    const words = text.trim();
    if (!words || busy) return;
    setBusy(true); setLine(null);
    try {
      const res = await api.post<Experience & { _queued?: boolean }>("/maybes", { tripId, cityId, words });
      if (res._queued) {
        setSent({ words, link: null, queued: true });
      } else {
        onAdded({ ...res, interests: res.interests || [{ displayName: me }] });
        setSent({ words: res.name, link: res.sourceUrl, queued: false });
        maybesChanged();
      }
      setText("");
    } catch {
      setLine("That didn't go through — your words are still in the box. Try again?");
    } finally {
      setBusy(false);
    }
  }

  async function tell() {
    if (!sent) return;
    const body = `${personOf(me)}: ${sent.words}${sent.link ? `\n${sent.link}` : ""}\n(on Wander's maybes for ${cityName})`;
    try {
      if (typeof navigator.share === "function") { await navigator.share({ text: body }); return; }
      await navigator.clipboard.writeText(body);
      setLine("Copied — paste it into your group text.");
    } catch (e) {
      // (closing the share sheet isn't a failure)
      if ((e as { name?: string })?.name !== "AbortError") setLine("Couldn't open sharing here — copy the words from the list instead.");
    }
  }

  return (
    <section className="mb-4 bg-white rounded-xl border border-[#e0d8cc] p-3">
      <label htmlFor="maybe-box" className="sr-only">Maybe we should…</label>
      <textarea id="maybe-box" value={text} rows={2} placeholder="Maybe we should…"
        onChange={(e) => { setText(e.target.value); if (sent) setSent(null); }}
        className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] text-[16px] text-[#3a3128] placeholder-[#a89880] focus:outline-none focus:ring-1 focus:ring-[#a89880] resize-none" />
      <div className="flex items-center gap-3 mt-1.5">
        <button onClick={send} disabled={!text.trim() || busy} className="min-h-[44px] px-5 rounded-lg bg-[#514636] text-white text-sm disabled:opacity-40">
          {busy ? "Sending…" : "Send"}
        </button>
        <p className="text-xs text-[#6b5d4a] leading-snug">A few words is enough — paste a link if there is one. Everyone on the trip sees it.</p>
      </div>
      {sent && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3" role="status">
          <p className="text-sm text-[#3a3128]">{sent.queued ? "Saved on this phone — it goes on the list when you have signal." : `On ${cityName}'s maybes.`}</p>
          <button onClick={tell} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Tell the group</button>
        </div>
      )}
      {line && <p className="text-sm text-[#6b5d4a] mt-1" role="status">{line}</p>}
    </section>
  );
}
