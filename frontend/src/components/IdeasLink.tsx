/**
 * "Ideas" at the top of Home, for Ideas for Wander's members only (Ken and Andy; Oct 15 2026, Ken: "easy and evident
 * for Andy and me without conflicting with daily reference use"). A small dot when something's new there since they
 * last looked. Nothing shows for anyone else, or before Wander knows.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ideasUnseen } from "../lib/wanderIdeas";

/** The same, as a row in Settings — for a member who looks for it there */
export function IdeasSettingsRow() {
  const navigate = useNavigate();
  const [member, setMember] = useState(false);
  useEffect(() => {
    let tripId: string | null = null; try { tripId = localStorage.getItem("wander:last-trip-id"); } catch { /* none */ }
    if (!tripId) return;
    let live = true;
    ideasUnseen(tripId).then((r) => { if (live) setMember(!!r.member); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!member) return null;
  return (
    <section>
      <button type="button" onClick={() => navigate("/ideas-for-wander")}
        className="w-full min-h-[52px] flex items-center justify-between px-4 rounded-xl bg-white border border-[#e0d8cc] text-left">
        <span>
          <span className="block text-sm font-medium text-[#3a3128]">Ideas for Wander</span>
          <span className="block text-xs text-[#6b5d4a] mt-0.5">Screenshots and ideas to make Wander better. Just Ken and Andy.</span>
        </span>
        <span className="text-[#6b5d4a]" aria-hidden>›</span>
      </button>
    </section>
  );
}

export default function IdeasLink({ tripId, className = "" }: { tripId: string | null | undefined; className?: string }) {
  const navigate = useNavigate();
  const [state, setState] = useState<{ member: boolean; unseen: number } | null>(null);
  useEffect(() => {
    if (!tripId) return;
    let live = true;
    const ask = () => ideasUnseen(tripId).then((r) => { if (live) setState({ member: !!r.member, unseen: r.unseen || 0 }); }).catch(() => {});
    ask();
    // (again when Wander comes back to the screen — a reply may have come meanwhile)
    const onShow = () => { if (document.visibilityState === "visible") ask(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { live = false; document.removeEventListener("visibilitychange", onShow); };
  }, [tripId]);
  if (!state?.member) return null;
  // (a small warm chip with a bulb — easy to find for the two of them, quiet beside the trip; Oct 15, Ken: "make the
  // 'improve wander' function attractive so andy will be drawn to offering ideas")
  return (
    <button type="button" onClick={() => navigate("/ideas-for-wander")}
      aria-label={state.unseen ? `Ideas for Wander, ${state.unseen} new` : "Ideas for Wander"}
      className={`relative min-h-[44px] px-1 flex items-center ${className}`}>
      <span className="flex items-center gap-1 pl-2 pr-2.5 py-1 rounded-full bg-[#fbf0dc] border border-[#ecd7a6] text-[13px] text-[#8a5a1a]">
        {/* (a sparkle — the Maybes tab is a bulb) */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
        {/* ("Wander ideas", not "Ideas": in a travel app that read as things to do — andy-ideas) */}
        Wander ideas
      </span>
      {state.unseen > 0 && <span className="absolute top-2 right-0.5 w-2.5 h-2.5 rounded-full bg-[#d4772c] border-2 border-[#faf8f5]" aria-hidden />}
    </button>
  );
}
