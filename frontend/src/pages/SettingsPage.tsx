import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { api } from "../lib/api";
import FaceIdSetup from "../components/FaceIdSetup";
import { signedInWithPasskeyHere } from "../lib/passkeys";
import { sourcesData, type OtherSource } from "../lib/sources";

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
      <div className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur-sm border-b border-[#e0d8cc] px-2 py-1 flex items-center gap-1"
        style={{ paddingTop: "max(env(safe-area-inset-top), 4px)" }}>
        <button onClick={() => navigate(-1)} aria-label="Back" className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#514636]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
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
        </section>

        <FaceIdSetup variant="settings" />
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

// ── Larisa's Guide (read-only) ───────────────────────────────
// Wander is downstream of Larisa's sheet: it reads the Guide and never changes it.
// There are deliberately no sync, push, or interval controls here.

interface GuideStatus { current: { sourceName: string; importedAt: string } | null }

/** "Oct 1, 2:48 AM Japan time" — the same words on every phone (round 12: three screens gave three different dates) */
const japanWhen = (iso: string) => `${new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Tokyo", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} Japan time`;

function SheetSyncSection() {
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
            <p className="text-[#3a3128] font-medium">Larisa's Guide</p>
            <p className="text-[#6b5d4a] mt-0.5">The copy “{guide.sourceName.replace(/\.xlsx$/i, "")}”, read {japanWhen(guide.importedAt)}. Larisa may have changed things since.</p>
          </div>
        )}
        {others.map((s) => (
          <div key={s.id} className="p-3 text-[13px]">
            <p className="text-[#3a3128] font-medium">{s.owner}'s {s.name.toLowerCase()}</p>
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
