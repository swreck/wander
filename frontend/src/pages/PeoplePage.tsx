/**
 * PeoplePage — who's on this trip, how each person gets in, and letting someone in.
 *
 * "Add someone" (planners): type a name, pick the trip (each trip can have its own group), and
 * Wander shows a QR code for their iPhone camera — or sends it as a message. Someone already in
 * Wander from another trip keeps their account and just gets this trip too.
 * "Send a new link": for someone on a new phone. Link codes never appear as text.
 * Once a person sets up Face ID, their link stops working.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Trip } from "../lib/types";
import InviteSheet from "../components/InviteSheet";

interface Person {
  travelerId: string;
  name: string;
  role: string | null;
  status: "face-id" | "link" | "not-yet";
  faceIdPhones: number;
  isMe: boolean;
}

type MyTrip = Trip & { myRole?: string | null };

interface Invite { name: string; tripName: string; url: string; isMe?: boolean; note?: string | null }

function statusLine(p: Person) {
  // How many phones only on your own row — someone else's count is theirs, and read oddly ("on 9 phones", round 12)
  if (p.status === "face-id") return p.isMe && p.faceIdPhones > 1 ? `You use Face ID on ${p.faceIdPhones} phones` : "Uses Face ID";
  if (p.status === "link") return "Has opened Wander · Face ID not set up yet";
  return "Invited · hasn't opened their link yet";
}

export default function PeoplePage() {
  const navigate = useNavigate();
  const [tripId, setTripId] = useState<string | null>(null);
  const [tripName, setTripName] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [canSend, setCanSend] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "unreachable">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [resetAsk, setResetAsk] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Add someone
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [myTrips, setMyTrips] = useState<MyTrip[]>([]);
  const [addTripId, setAddTripId] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // The name typed is already someone in Wander: their new phone, or a different person?
  const [sameName, setSameName] = useState<{ name: string; onTrip: boolean; tripName: string } | null>(null);
  const [addHint, setAddHint] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);

  async function load(id: string) {
    const data = await api.get<{ people: Person[]; canSendLinks: boolean }>(`/people/${id}`);
    setPeople(data.people);
    setCanSend(data.canSendLinks);
    setSavedAt(null);
    try { localStorage.setItem(`wander:people-copy:${id}`, JSON.stringify({ ...data, savedAt: new Date().toISOString() })); } catch { /* full */ }
  }

  // With no signal: the list this phone saved (letting someone in waits for signal)
  function fromSaved(id: string | null) {
    try {
      const raw = id ? localStorage.getItem(`wander:people-copy:${id}`) : null;
      if (!raw) return false;
      const saved = JSON.parse(raw);
      setPeople(saved.people); setCanSend(saved.canSendLinks); setSavedAt(saved.savedAt); setTripId(id);
      return true;
    } catch { return false; }
  }

  useEffect(() => {
    let id = localStorage.getItem("wander:last-trip-id");
    const run = async () => {
      try {
        let trip: Trip | null = id ? await api.get<Trip>(`/trips/${id}`).catch(() => null) : null;
        if (!trip) { trip = await api.get<Trip | null>("/trips/active"); id = trip?.id || null; }
        if (!trip || !id) { setState(fromSaved(id) ? "ready" : "unreachable"); return; }
        setTripId(id);
        setTripName(trip.name);
        await load(id);
        setState("ready");
      } catch {
        setState(fromSaved(id) ? "ready" : "unreachable");
      }
    };
    run();
    // Signal back: refresh
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [attempt]);

  // The trips this person plans (for "Add someone … to which trip?")
  useEffect(() => {
    if (!canSend) return;
    // The same trips the trip menu lists (read from Larisa's Guide, or this one) — never April's old test trips
    api.get<(MyTrip & { tagline?: string | null })[]>("/trips")
      .then((list) => setMyTrips(list.filter((t) => t.myRole === "planner" && (t.id === tripId || /^From Larisa's Guide/.test(t.tagline || "")))))
      .catch(() => { /* stays on this trip */ });
  }, [canSend, tripId]);

  const note = (id: string, text: string) => setNotes((n) => ({ ...n, [id]: text }));
  const linkFor = (token: string) => `${window.location.origin}/join/${token}`;

  /** The phone's own error words ("Failed to fetch") never reach the screen */
  function plainError(err: unknown, noSignal: string) {
    const msg = (err as Error)?.message || "";
    if (navigator.onLine === false || err instanceof TypeError || /fetch|network|load failed/i.test(msg)) return noSignal;
    return msg || "That didn't work — try again?";
  }

  // Step 1 makes the link; the sheet that follows opens the share sheet straight from a tap
  async function newLink(p: Person) {
    if (!tripId) return;
    setBusyId(p.travelerId);
    note(p.travelerId, "");
    try {
      const res = p.travelerId.startsWith("invite:")
        ? await api.post<{ token: string; name: string }>(`/people/${tripId}/add`, { name: p.name })
        : await api.post<{ token: string; name: string }>(`/people/${tripId}/link`, { travelerId: p.travelerId });
      setInvite({ name: p.name, tripName, url: linkFor(res.token), isMe: p.isMe });
    } catch (err) {
      note(p.travelerId, plainError(err, `No signal, so I can't make ${p.isMe ? "your" : `${p.name}'s`} link yet. Try again when you have a bar or two.`));
    } finally {
      setBusyId(null);
    }
  }

  async function addSomeone(samePerson = false) {
    const name = newName.trim();
    const target = addTripId || tripId;
    if (!name || !target || addBusy) return;
    setAddBusy(true);
    setAddError(null);
    setSameName(null);
    try {
      const res = await api.post<{ token: string; name: string; tripName: string; alreadyInWander: boolean; alreadyOnTrip: boolean }>(`/people/${target}/add`, { name, ...(samePerson ? { samePerson: true } : {}) });
      const noteText = res.alreadyOnTrip
        ? `${res.name} is already on ${res.tripName} — this link signs ${res.name} in on a new phone.`
        : res.alreadyInWander
          ? `${res.name} already uses Wander — this adds ${res.name} to ${res.tripName}.`
          : null;
      setInvite({ name: res.name, tripName: res.tripName, url: linkFor(res.token), note: noteText });
      setAddHint(null);
      setAdding(false);
      setNewName("");
      if (target === tripId) load(target).catch(() => { /* list refreshes later */ });
    } catch (err) {
      const body = (err as { body?: { sameName?: boolean; name?: string; onTrip?: boolean; tripName?: string } }).body;
      if (body?.sameName && body.name) setSameName({ name: body.name, onTrip: !!body.onTrip, tripName: body.tripName || tripName });
      else setAddError(plainError(err, "No signal, so I can't make the invite yet. Try again when you have a bar or two."));
    } finally {
      setAddBusy(false);
    }
  }

  async function resetPin(p: Person) {
    try {
      await api.post(`/vault/reset-pin/${p.travelerId}`, {});
      note(p.travelerId, `${p.name}'s private documents PIN is cleared. They can set a new one in their documents.`);
    } catch (err) {
      note(p.travelerId, plainError(err, "No signal — try again when you're back online."));
    }
    setResetAsk(null);
  }

  return (
    <div className="min-h-[100dvh] bg-[#faf8f5] pb-28">
      <header className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur border-b border-[#e0d8cc] px-2 pt-[max(env(safe-area-inset-top),8px)] pb-2 flex items-center">
        <button onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/"))} aria-label="Back" className="min-h-[44px] min-w-[44px] px-2 text-[#514636] text-sm">‹ Back</button>
        <h1 className="flex-1 text-center text-base font-medium text-[#3a3128] pr-11">People on this trip</h1>
      </header>

      <main className="px-4 pt-4 max-w-xl mx-auto">
        {state === "loading" && <p className="text-sm text-[#6b5d4a] text-center mt-10">Finding everyone…</p>}
        {state === "unreachable" && (
          <div className="text-center mt-10">
            <p className="text-sm text-[#6b5d4a]">Wander can't reach the trip right now, and this phone hasn't saved the list yet.</p>
            <button onClick={() => { setState("loading"); setAttempt((n) => n + 1); }} className="mt-3 min-h-[44px] px-5 rounded-xl bg-[#514636] text-white text-sm">Try again</button>
          </div>
        )}
        {state === "ready" && (
          <>
            {savedAt && (
              <p className="mb-3 text-sm text-[#6b5d4a] bg-white/70 border border-[#e0d8cc] rounded-lg px-3 py-2" role="status">
                No signal — showing what this phone saved {new Date(savedAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}. Letting someone in needs signal.
              </p>
            )}
            <p className="text-sm text-[#6b5d4a] mb-3">{tripName}</p>

            {/* Add someone — into Wander and onto a trip */}
            {canSend && (
              adding ? (
                <div className="mb-4 bg-white rounded-xl border border-[#e0d8cc] p-4">
                  <label htmlFor="add-name" className="block text-sm font-medium text-[#3a3128]">Their name</label>
                  <input
                    id="add-name" value={newName} onChange={(e) => { setNewName(e.target.value); setSameName(null); }} autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") addSomeone(); }}
                    placeholder="First name is fine" autoCapitalize="words" autoComplete="off"
                    className="mt-1 w-full min-h-[44px] px-3 rounded-lg border border-[#e0d8cc] text-[16px] text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-[#a89880]"
                  />
                  {addHint && <p className="text-sm text-[#514636] mt-1.5">{addHint}</p>}
                  {myTrips.length > 1 && (
                    <>
                      <label htmlFor="add-trip" className="block text-sm font-medium text-[#3a3128] mt-3">Which trip</label>
                      <select
                        id="add-trip" value={addTripId || tripId || ""} onChange={(e) => setAddTripId(e.target.value)}
                        className="mt-1 w-full min-h-[44px] px-3 rounded-lg border border-[#e0d8cc] bg-white text-[16px] text-[#3a3128]"
                      >
                        {myTrips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </>
                  )}
                  <p className="text-xs text-[#6b5d4a] mt-2">
                    They'll see this trip only. You'll get a code to show their iPhone, or a message to send.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => addSomeone()} disabled={!newName.trim() || addBusy} className="min-h-[44px] px-4 rounded-lg bg-[#514636] text-white text-sm disabled:opacity-40">
                      {addBusy ? "Making it…" : "Make their invite"}
                    </button>
                    <button onClick={() => { setAdding(false); setNewName(""); setAddError(null); }} className="min-h-[44px] px-4 text-sm text-[#514636]">Cancel</button>
                  </div>
                  {addError && <p className="text-sm text-[#8a3a2a] mt-2" role="alert">{addError}</p>}
                  {sameName && (
                    <div className="mt-3 rounded-lg bg-[#f6f1e8] p-3" role="alert">
                      {/* Already on this trip: a new phone. Only in Wander: adding them to this trip (Ken, adding Julie and
                          Andy, was asked about "Julie's new phone") */}
                      <p className="text-sm text-[#3a3128]">
                        {sameName.onTrip
                          ? `${sameName.name} is already on ${sameName.tripName}. Is this for ${sameName.name}'s new phone?`
                          : `${sameName.name} already uses Wander but isn't on ${sameName.tripName} yet. Add ${sameName.name} to this trip?`}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button onClick={() => addSomeone(true)} disabled={addBusy} className="min-h-[44px] px-3 rounded-lg bg-[#514636] text-white text-sm disabled:opacity-40">
                          {sameName.onTrip ? `Yes, ${sameName.name}'s new phone` : `Yes, add ${sameName.name}`}
                        </button>
                        <button
                          onClick={() => {
                            // A hint, not an error: back to the name box, cursor at the end, ready for "B."
                            setSameName(null);
                            setAddHint(`Add a last initial so the two don't get mixed up — "${sameName.name} B." works.`);
                            setNewName(`${sameName.name} `);
                            requestAnimationFrame(() => { const el = document.getElementById("add-name") as HTMLInputElement | null; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
                          }}
                          className="min-h-[44px] px-3 rounded-lg text-sm text-[#514636] border border-[#e0d8cc]"
                        >
                          Someone else named {sameName.name}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => { setAdding(true); setAddTripId(tripId); }} className="mb-4 w-full min-h-[48px] rounded-xl bg-[#514636] text-white text-base">
                  + Add someone
                </button>
              )
            )}

            <ul className="space-y-2">
              {people.map((p) => (
                <li key={p.travelerId} className="bg-white rounded-xl border border-[#e0d8cc] p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] text-[#3a3128]">
                        {p.name}{p.isMe && <span className="text-[#6b5d4a]"> (you)</span>}
                      </p>
                      <p className="text-xs text-[#6b5d4a] mt-0.5">
                        {p.role === "planner" ? "Plans the trip · " : ""}{statusLine(p)}
                      </p>
                    </div>
                    {canSend && (
                      <button
                        onClick={() => newLink(p)}
                        disabled={busyId === p.travelerId}
                        className={`min-h-[44px] px-3 rounded-lg text-sm shrink-0 disabled:opacity-50 ${p.status === "not-yet" ? "bg-[#514636] text-white" : "border border-[#d6ccbc] text-[#514636]"}`}
                      >
                        {busyId === p.travelerId ? "Making it…" : p.status === "not-yet" ? "Show their invite" : "New phone? New link"}
                      </button>
                    )}
                  </div>
                  {notes[p.travelerId] && <p className="text-sm text-[#6b5d4a] mt-2">{notes[p.travelerId]}</p>}
                  {canSend && !p.isMe && p.role && (
                    resetAsk === p.travelerId ? (
                      <div className="flex items-center gap-3 mt-2 text-sm">
                        <span className="text-[#6b5d4a]">Clear {p.name}'s private documents PIN?</span>
                        <button onClick={() => resetPin(p)} className="min-h-[44px] text-[#8a3a2a]">Clear it</button>
                        <button onClick={() => setResetAsk(null)} className="min-h-[44px] text-[#514636]">Keep it</button>
                      </div>
                    ) : (
                      <button onClick={() => setResetAsk(p.travelerId)} className="min-h-[44px] mt-1 text-xs text-[#6b5d4a]">
                        Forgot the PIN for their private documents?
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-[#6b5d4a] mt-5 leading-relaxed">
              An invite signs its person in on their phone. Once they set up Face ID, it stops working, so an old
              message can't be used by anyone else. {canSend ? "Make a new one any time someone gets a new phone." : "Ken or Larisa can send you a new link any time."}
            </p>
          </>
        )}
      </main>
      {invite && <InviteSheet {...invite} onClose={() => setInvite(null)} />}
    </div>
  );
}
