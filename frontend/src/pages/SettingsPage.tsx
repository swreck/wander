import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { api } from "../lib/api";
import FaceIdSetup from "../components/FaceIdSetup";
import { signedInWithPasskeyHere } from "../lib/passkeys";
import { sourcesData, type OtherSource } from "../lib/sources";
import { voiceFor } from "../lib/guideDisplay";
import { showMeAround } from "../components/ShowMeAround";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { logout, user: authUser } = useAuth();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const faceIdHere = signedInWithPasskeyHere();

  function signOut() {
    logout();
    navigate("/login", { state: { signedOut: true } });
  }

  return (
    <div className="min-h-[100dvh] bg-[#faf8f5]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur-sm border-b border-[#e0d8cc] px-2 pb-1 top-bar flex items-center gap-1">
        <button onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/"))} aria-label="Back" className="min-h-[44px] min-w-[44px] px-2 text-sm text-[#514636]">‹ Back</button>
        <h1 className="text-lg font-medium text-[#3a3128]">Settings</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 pb-40 space-y-6">
        {/* Who this phone is */}
        {authUser && (
          <p className="text-sm text-[#3a3128]">
            Signed in as <span className="font-medium">{authUser.displayName}</span>
            <span className="text-[#6b5d4a]">{faceIdHere ? " · Face ID is on for this phone" : " · Face ID isn't set up on this phone yet"}</span>
          </p>
        )}

        {/* People on this trip — who's in, and sending someone their link */}
        <section>
          <button
            onClick={() => navigate("/people")}
            className="w-full min-h-[52px] flex items-center justify-between px-4 rounded-xl bg-white border border-[#e0d8cc] text-left"
          >
            <span>
              <span className="block text-sm font-medium text-[#3a3128]">People on this trip</span>
              <span className="block text-xs text-[#6b5d4a] mt-0.5">{authUser?.role === "planner" ? "Who's in, and letting someone in" : "Who's on this trip"}</span>
            </span>
            <span className="text-[#6b5d4a]" aria-hidden>›</span>
          </button>
        </section>

        <section>
          <button
            onClick={() => navigate("/guide")}
            className="w-full min-h-[52px] flex items-center justify-between px-4 rounded-xl bg-white border border-[#e0d8cc] text-left"
          >
            <span className="text-sm font-medium text-[#3a3128]">How Wander works</span>
            <span className="text-[#6b5d4a]" aria-hidden>›</span>
          </button>
          {/* The six buttons along the bottom, one at a time (Oct 2) */}
          <button
            onClick={showMeAround}
            className="mt-2 w-full min-h-[52px] flex items-center justify-between px-4 rounded-xl bg-white border border-[#e0d8cc] text-left"
          >
            <span>
              <span className="block text-sm font-medium text-[#3a3128]">Show me around</span>
              <span className="block text-xs text-[#6b5d4a] mt-0.5">A quick look at the six buttons along the bottom of the screen</span>
            </span>
            <span className="text-[#6b5d4a]" aria-hidden>›</span>
          </button>
        </section>

        <FaceIdSetup variant="settings" />
        <NotesSettingsSection />
        <SheetSyncSection />

        {/* Dedup review (planner-only) */}
        <DedupSection />

        {/* Sign out — with a warning when this phone has no Face ID to get back in */}
        <section>
          {confirmSignOut ? (
            <div className="rounded-xl border border-[#e0d8cc] bg-white p-4">
              <p className="text-sm text-[#3a3128]">This phone doesn't have Face ID set up for Wander.</p>
              <p className="text-sm text-[#6b5d4a] mt-1">After signing out, you'll need your link from Ken or Larisa to get back in.</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setConfirmSignOut(false)} className="min-h-[44px] flex-1 rounded-lg bg-[#514636] text-white text-sm">Stay signed in</button>
                <button onClick={signOut} className="min-h-[44px] flex-1 rounded-lg border border-[#d6ccbc] text-[#8a3a2a] text-sm">Sign out anyway</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { if (faceIdHere) signOut(); else setConfirmSignOut(true); }}
              className="w-full min-h-[44px] py-3 rounded-xl border border-[#e0d8cc] text-[#8a3a2a] text-sm font-medium hover:bg-[#f5f0ea] transition-colors"
            >
              Sign out of Wander on this phone
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Trip notes (Oct 1 2026): the two choices, each set once and always here to see and change ──
function NotesSettingsSection() {
  const [s, setS] = useState<{ tidy: boolean; storyUse: boolean | null } | null>(null);
  const [busy, setBusy] = useState<"tidy" | "storyUse" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { api.get<{ tidy: boolean; storyUse: boolean | null }>("/trip-notes/settings").then(setS).catch(() => setS(null)); }, []);
  // (opened from Notes' "Open Settings": brought into view)
  useEffect(() => { if (s && window.location.hash === "#notes") document.getElementById("notes")?.scrollIntoView({ block: "start" }); }, [s]);
  if (!s) return null;
  async function set(key: "tidy" | "storyUse", value: boolean) {
    setBusy(key);
    setProblem(null);
    try { setS(await api.patch<{ tidy: boolean; storyUse: boolean | null }>("/trip-notes/settings", { [key]: value })); }
    catch { setProblem(navigator.onLine === false ? "No signal — that choice waits until there's a bar or two." : "That didn't change — try again?"); }
    finally { setBusy(null); }
  }
  const row = (key: "tidy" | "storyUse", on: boolean, title: string, words: string) => (
    <div className="flex items-start gap-3 py-2">
      <span className="flex-1">
        <span className="block text-sm text-[#3a3128]">{title}</span>
        <span className="block text-xs text-[#6b5d4a] mt-0.5">{words}</span>
      </span>
      <button role="switch" aria-checked={on} aria-label={title} disabled={busy === key} onClick={() => set(key, !on)}
        // (a 68×48 place to tap around the 52×32 switch — tester t2)
        className={`shrink-0 relative w-[52px] h-[32px] rounded-full transition-colors mt-1 after:content-[''] after:absolute after:-inset-2 ${on ? "bg-[#514636]" : "bg-[#d6ccbc]"} disabled:opacity-60`}>
        <span className={`absolute top-[3px] w-[26px] h-[26px] rounded-full bg-white shadow transition-all ${on ? "left-[23px]" : "left-[3px]"}`} />
      </button>
    </div>
  );
  return (
    <section id="notes" className="border-t border-[#e0d8cc] pt-6 scroll-mt-20">
      <h2 className="text-sm font-medium text-[#3a3128] mb-1">Trip notes</h2>
      <p className="text-xs text-[#6b5d4a] mb-1">Every word you write or say in Notes is kept exactly. These two choices are yours alone.</p>
      {row("tidy", s.tidy, "Tidy my dictation",
        s.tidy ? "On — notes you speak get their punctuation, capitals and “um”s fixed. Your exact words are always kept too, one tap away. Typed notes are left as you wrote them."
          : "Off — notes show exactly the words you said or typed.")}
      {row("storyUse", s.storyUse === true, "Let others' trip stories use what I say about places",
        // ("Never your personal notes" left people unsure whether a note kept to themselves counted — privacy tester)
        s.storyUse === null ? "Not answered yet — you'll be asked after your first note."
          : s.storyUse ? "On — when someone on the trip asks Scout for a story of the trip, it may use what your notes say about places (the food, the sights, how a place felt), including notes you keep to yourself. Never anything personal about you or anyone else."
          : "Off — your notes never go into anyone else's story of the trip. Notes you share are still seen by the trip.")}
      {problem && <p className="text-sm text-[#8a3a1a] mt-1" role="alert">{problem}</p>}
    </section>
  );
}

// ── Larisa's Guide (read-only) ───────────────────────────────
// Wander is downstream of Larisa's sheet: it reads the Guide and never changes it.
// There are deliberately no sync, push, or interval controls here.

interface GuideStatus { current: { sourceName: string; importedAt: string } | null }

/** "Oct 1, 2:48 AM Japan time" — the same words on every phone (round 12: three screens gave three different dates) */
const japanWhen = (iso: string) => `${new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Tokyo", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} Japan time`;

function SheetSyncSection() {
  // To Larisa: "Your Guide"; to Ken: "Your rail sheet" (delight audit)
  const me = useAuth().user?.displayName ?? null;
  const v = voiceFor(me);
  // The copy of her Guide Wander actually reads (not the old sync setting, whose time was a different moment)
  const [guide, setGuide] = useState<GuideStatus["current"]>(null);
  const [others, setOthers] = useState<OtherSource[]>([]);

  useEffect(() => {
    const lastTrip = localStorage.getItem("wander:last-trip-id");
    const loadTrip = (id: string) => {
      api.get<GuideStatus>(`/guide/status/${id}`).then((s) => setGuide(s?.current || null)).catch(() => {});
      sourcesData(id).then((d) => setOthers(d.sources)).catch(() => {});
    };
    if (lastTrip) {
      loadTrip(lastTrip);
    } else {
      api.get<any>("/trips/active").then((trip) => {
        if (trip?.id) {
          localStorage.setItem("wander:last-trip-id", trip.id);
          loadTrip(trip.id);
        }
      }).catch(() => {});
    }
  }, []);

  if (!guide && !others.length) return null;

  return (
    <section className="border-t border-[#e0d8cc] pt-6">
      <h2 className="text-sm font-medium text-[#3a3128] mb-1">Where Wander's plan comes from</h2>
      <p className="text-[13px] text-[#6b5d4a] mb-3">
        Wander reads these and never changes them.
      </p>
      <div className="bg-white rounded-lg border border-[#e0d8cc] divide-y divide-[#f0ebe3]">
        {guide && (
          <div className="p-3 text-[13px]">
            <p className="text-[#3a3128] font-medium">{v.mine ? "Your Guide" : "Larisa's Guide"}</p>
            {/* When it was read, not its file name (delight audit: "Japan Oct 2026-2" meant nothing to anyone) */}
            <p className="text-[#6b5d4a] mt-0.5">Wander's copy, read {japanWhen(guide.importedAt)}.{v.mine ? " Changes you've made since then aren't in it yet." : " Larisa may have changed things since."}</p>
          </div>
        )}
        {others.map((s) => (
          <div key={s.id} className="p-3 text-[13px]">
            <p className="text-[#3a3128] font-medium">{me && s.owner.toLowerCase() === me.toLowerCase() ? `Your ${s.name.toLowerCase()}` : `${s.owner}'s ${s.name.toLowerCase()}`}</p>
            <p className="text-[#6b5d4a] mt-0.5">
              {s.authorship ? `${s.authorship[0].toUpperCase()}${s.authorship.slice(1)}. ` : ""}Read every few minutes{s.readAt ? ` — last ${japanWhen(s.readAt)}` : ""}.
              {s.lastError ? " Its latest read didn't work, so Wander is showing the copy before that." : ""}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

interface DedupSuggestion {
  id: string;
  entityType: string;
  keepName: string;
  removeName: string;
  description: string;
  autoExecuted: boolean;
  status: string;
}

function DedupSection() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<DedupSuggestion[]>([]);
  const [tripId, setTripId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "planner") return;
    const lastTrip = localStorage.getItem("wander:last-trip-id");
    const id = lastTrip || null;
    if (id) {
      setTripId(id);
      api.get<DedupSuggestion[]>(`/dedup/trip/${id}`).then(setSuggestions).catch(() => {});
    } else {
      api.get<any>("/trips/active").then(t => {
        if (t?.id) {
          setTripId(t.id);
          api.get<DedupSuggestion[]>(`/dedup/trip/${t.id}`).then(setSuggestions).catch(() => {});
        }
      });
    }
  }, [user?.role]);

  if (user?.role !== "planner" || suggestions.length === 0) return null;

  async function handleAction(id: string, action: "approve" | "reject") {
    try {
      const result = await api.post<{ note?: string }>(`/dedup/${id}/${action}`, {});
      setSuggestions(s => s.filter(x => x.id !== id));
      showToast(result.note || (action === "approve" ? "Got it" : "Restored"), "success");
    } catch {
      showToast("That didn't work — try again?", "error");
    }
  }

  return (
    <section className="border-t border-[#e0d8cc] pt-6">
      <h2 className="text-sm font-medium text-[#3a3128] mb-1">Things I tidied up</h2>
      <p className="text-xs text-[#6b5d4a] mb-3">
        Duplicates I noticed and merged. Reject any that were a mistake.
      </p>
      <div className="space-y-2">
        {suggestions.map(s => (
          <div key={s.id} className="bg-white rounded-lg border border-[#e0d8cc] p-3">
            <p className="text-xs text-[#3a3128] leading-relaxed">{s.description}</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleAction(s.id, "approve")}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#f0ece5] text-[#514636] font-medium hover:bg-[#e0d8cc]"
              >
                Looks right
              </button>
              <button
                onClick={() => handleAction(s.id, "reject")}
                className="text-xs px-3 py-1.5 rounded-lg text-[#6b5d4a] hover:text-[#6b5d4a]"
              >
                Undo
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
