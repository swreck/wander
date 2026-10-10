/**
 * The welcome card on Home, with "Show me around" (Oct 2) — offered up to three times, then it stops (Oct 4, Ken: "I'd
 * like it offered at least 3x with Yes, Next time, No Thanks"). Usual practice for an optional tour: offer it at a calm
 * moment (Home, never the Next tab), let "Next time" bring it back on a later visit (12 hours on, not the same visit),
 * stop after the third offer or a "No thanks", and say where it lives (Settings, How Wander works). Kept per person on
 * Wander (their preferences), so a new phone or the Home Screen app doesn't ask again; this phone's copy for no signal.
 * The first offer says what Wander is (delight audit: Julie's first minute never said); Larisa hears it as hers.
 */
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { voiceFor } from "../lib/guideDisplay";
import { api } from "../lib/api";
import { showMeAround } from "./ShowMeAround";
import { takeVisitAsk, isLeavingCardSettled, onLeavingCardSettled, isFaceIdCardSettled, onFaceIdCardSettled } from "../lib/visitAsks";

type Tour = { offers: number; lastAt?: string; status?: "taken" | "declined" };
const MAX_OFFERS = 3;
const AGAIN_AFTER = 12 * 60 * 60 * 1000;
const localKey = (id: string) => `wander:tour:${id}`;

function readLocal(id: string): Tour {
  try {
    const t = JSON.parse(localStorage.getItem(localKey(id)) || "null") as Tour | null;
    if (t) return t;
    // (the old one-time card, already seen on this phone: that was the first offer)
    if (localStorage.getItem("wander:welcome-seen") === "1") return { offers: 1, lastAt: new Date(0).toISOString() };
  } catch { /* private window */ }
  return { offers: 0 };
}
/** The two copies together: the further along wins (a "No thanks" on any device holds everywhere) */
function merged(a: Tour, b: Tour): Tour {
  return {
    offers: Math.max(a.offers || 0, b.offers || 0),
    lastAt: [a.lastAt, b.lastAt].filter(Boolean).sort().pop(),
    status: a.status || b.status,
  };
}
/** Saved on this phone and on Wander — read first and merged, so their other preferences stay as they are */
async function save(id: string, t: Tour) {
  try { localStorage.setItem(localKey(id), JSON.stringify(t)); } catch { /* private window */ }
  try {
    const cur = (await api.get<{ preferences?: Record<string, unknown> | null }>(`/auth/travelers/${id}`))?.preferences || {};
    // (only the tour is sent — Wander keeps the rest as it is; a copy read a moment ago could undo a newer choice)
    await api.patch(`/auth/travelers/${id}`, { preferences: { tour: merged(t, ((cur as any).tour || { offers: 0 }) as Tour) } });
  } catch { /* no signal: this phone's copy holds until next time */ }
}

export default function WelcomeOnce({ owner }: { owner: string | null }) {
  const { user } = useAuth();
  const me = user?.displayName ?? null;
  const id = user?.travelerId ?? null;
  const [tour, setTour] = useState<Tour | null>(() => (id ? readLocal(id) : null));
  const [showing, setShowing] = useState(false);
  const counted = useRef(false);

  // What Wander has for this person (another device's answer counts here too) — nothing is offered until it's known, or
  // until a few seconds without signal (tour check, Oct 4: a new phone asked again before her "No thanks" arrived)
  const [checked, setChecked] = useState(false);
  // …and only offered when Wander answered, or this phone has kept an answer (never on a guess with no signal)
  const [heard, setHeard] = useState(false);
  const [hadLocal] = useState(() => { try { return !!id && (!!localStorage.getItem(localKey(id)) || localStorage.getItem("wander:welcome-seen") === "1"); } catch { return false; } });
  useEffect(() => {
    if (!id) return;
    let live = true;
    const giveUp = setTimeout(() => { if (live) setChecked(true); }, 4000);
    api.get<{ preferences?: Record<string, unknown> | null }>(`/auth/travelers/${id}`)
      .then((t) => {
        const saved = ((t?.preferences as any)?.tour || null) as Tour | null;
        if (live && saved) setTour((cur) => merged(cur || { offers: 0 }, saved));
        // (an answer this phone kept but Wander never got — the app closed as it was sent — goes now; tour check, Oct 4)
        const local = readLocal(id);
        const both = merged(local, saved || { offers: 0 });
        if ((both.status && both.status !== saved?.status) || both.offers > (saved?.offers || 0)) save(id, both);
        // (kept on this phone too, so a visit with no signal knows — Sweep C: offline, Ken was offered the first-time
        // welcome he'd seen three times)
        else try { localStorage.setItem(localKey(id), JSON.stringify(both)); } catch { /* private window */ }
        if (live) setHeard(true);
      })
      .catch(() => { /* this phone's copy */ })
      .finally(() => { if (live) { clearTimeout(giveUp); setChecked(true); } });
    return () => { live = false; clearTimeout(giveUp); };
  }, [id]);

  // One ask per visit (lib/visitAsks; Oct 10 audit): wait for the "You leave in N days" card to decide — at most a few
  // seconds — and stay away on a visit it showed (not counted as an offer)
  const [leavingDone, setLeavingDone] = useState(isLeavingCardSettled);
  useEffect(() => {
    if (leavingDone) return;
    const off = onLeavingCardSettled(() => setLeavingDone(true));
    const giveUp = setTimeout(() => setLeavingDone(true), 8000);
    return () => { off(); clearTimeout(giveUp); };
  }, [leavingDone]);
  // …and for the "Set up Face ID" card, which comes before it (Oct 10 re-audit: both showed together in iPhone Safari)
  const [faceIdDone, setFaceIdDone] = useState(isFaceIdCardSettled);
  useEffect(() => {
    if (faceIdDone) return;
    const off = onFaceIdCardSettled(() => setFaceIdDone(true));
    const giveUp = setTimeout(() => setFaceIdDone(true), 8000);
    return () => { off(); clearTimeout(giveUp); };
  }, [faceIdDone]);

  // Due now: not taken, not declined, fewer than three offers, and the last one long enough ago. Counted once, as shown.
  const due = !!tour && !tour.status && tour.offers < MAX_OFFERS && (!tour.lastAt || Date.now() - Date.parse(tour.lastAt) >= AGAIN_AFTER);
  // (an offer not yet answered stays on Home for the rest of this visit — leaving Home and coming back mustn't lose it)
  const SESSION = "wander:tour-offer-open";
  useEffect(() => {
    if (!tour || tour.status || showing) return;
    let open = false;
    try { open = sessionStorage.getItem(SESSION) === "1"; } catch { /* private window */ }
    if (open) { counted.current = true; setShowing(true); }
  }, [tour, showing]);
  useEffect(() => {
    if (!id || !tour || !due || !checked || !(heard || hadLocal) || !leavingDone || !faceIdDone || counted.current) return;
    // (the leaving card had this visit: not offered, not counted)
    if (!takeVisitAsk("tour")) return;
    counted.current = true;
    try { sessionStorage.setItem(SESSION, "1"); } catch { /* private window */ }
    const next = { ...tour, offers: tour.offers + 1, lastAt: new Date().toISOString() };
    setTour(next);
    setShowing(true);
    save(id, next);
  }, [id, tour, due, checked, heard, hadLocal, leavingDone, faceIdDone]);

  if (!me || !id || !tour || !showing) return null;
  const v = voiceFor(me, owner);
  const first = tour.offers <= 1;
  const last = tour.offers >= MAX_OFFERS;
  const answer = (status?: Tour["status"]) => {
    setShowing(false);
    try { sessionStorage.removeItem("wander:tour-offer-open"); } catch { /* private window */ }
    if (status) { const t = { ...tour, status }; setTour(t); save(id, t); }
    try { localStorage.setItem("wander:welcome-seen", "1"); } catch { /* private window */ }
  };
  return (
    // Just above the tab bar, over Home rather than in it: it's decided a moment after Home draws (what Wander has saved
    // for this person), and arriving at the top it pushed the whole page down a third of a screen (re-audit 2: Andy's first
    // visit, layout shift 0.41). Same words and buttons; nothing under the reader moves.
    <section role="dialog" aria-label="A quick look at Wander"
      className="fixed inset-x-0 z-40 mx-auto max-w-md px-4 animate-[slideUp_0.3s_ease-out]"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 68px)" }}>
      <div className="rounded-xl bg-white border border-[#e0d8cc] shadow-lg p-4">
      {first ? (
        <>
          <p className="text-base text-[#3a3128]">Hi {me}.</p>
          <p className="text-sm text-[#514636] mt-1">
            {v.mine
              ? "This is your Guide, day by day, on everyone's phone. Wander reads it and never changes it."
              // (nothing to set up — not "nothing to do": Ken has six tickets to collect; delight audit). The Face ID card
              // has its own visit now (Oct 10 re-audit), so "Face ID, just below" is never said beside it.
              : `This is ${owner || "Larisa"}'s plan for the trip, day by day, on your phone. There's nothing to set up — it's here when you want it.`}
          </p>
          <p className="text-sm text-[#514636] mt-1">Want a quick look at the buttons along the bottom? Six short steps.</p>
        </>
      ) : (
        <p className="text-sm text-[#514636]">Want a quick look at the buttons along the bottom, {me}? Six short steps.</p>
      )}
      {last && <p className="text-xs text-[#6b5d4a] mt-1">This is the last time it's offered here. It's always in Settings, under "Show me around".</p>}
      {/* (one row on a phone — over Home, the card covers as little as it can) */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button onClick={() => { answer("taken"); showMeAround(); }} className="min-h-[44px] px-3 rounded-lg bg-[#514636] text-white text-sm">Show me around</button>
        {!last && <button onClick={() => answer()} className="min-h-[44px] px-3 rounded-lg border border-[#e0d8cc] text-sm text-[#514636]">Next time</button>}
        <button onClick={() => answer("declined")} className="min-h-[44px] px-2 text-sm text-[#6b5d4a]">No thanks</button>
      </div>
      </div>
    </section>
  );
}
