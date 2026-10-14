/**
 * The offer when this phone sees someone not finding what they came for (Oct 14 2026, Ken: "perhaps even signals based
 * on them seemingly clicking around and not getting value and treating that as a trigger to offer"). The signs are
 * worked out here and never sent or kept (lib/tellKen). One small line just above the bottom bar, at most once a day,
 * gone after 20 seconds or with ✕; tapping it opens Scout ready to write "Tell Ken…". Never for Ken himself.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { amOrganizer, screenChanged, startWatchingTaps, offerAllowed, offerShown } from "../lib/tellKen";

// (Scout's panel or its slim bar is up: the offer waits — it covered the slim bar's box, and under the full panel it
// was hidden yet used up the day; verify60)
const scoutUp = () => !!document.querySelector('[role="dialog"][aria-label="Scout"], [role="region"][aria-label="Scout"]');

export default function TellKenOffer() {
  const location = useLocation();
  const [shown, setShown] = useState(false);
  useEffect(() => { screenChanged(location.pathname); }, [location.pathname]);
  useEffect(() => startWatchingTaps(), []);
  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | null = null;
    let wait: ReturnType<typeof setInterval> | null = null;
    const show = () => {
      if (!offerAllowed()) return;
      offerShown();
      setShown(true);
      if (hide) clearTimeout(hide);
      hide = setTimeout(() => setShown(false), 20_000);
    };
    const offer = () => {
      amOrganizer().then((org) => {
        // (only for someone known not to be the organizer, and not once they've sent Ken one)
        if (org !== false || !offerAllowed()) return;
        // (with Scout up or no signal, it waits — up to three minutes — then lets it go)
        if (!scoutUp() && navigator.onLine !== false) { show(); return; }
        if (wait) clearInterval(wait);
        const until = Date.now() + 3 * 60_000;
        wait = setInterval(() => {
          if (Date.now() > until) { clearInterval(wait!); wait = null; return; }
          if (!scoutUp() && navigator.onLine !== false) { clearInterval(wait!); wait = null; show(); }
        }, 3_000);
      });
    };
    window.addEventListener("wander:tell-ken-offer", offer);
    return () => { window.removeEventListener("wander:tell-ken-offer", offer); if (hide) clearTimeout(hide); if (wait) clearInterval(wait); };
  }, []);
  if (!shown || location.pathname === "/login" || location.pathname.startsWith("/join")) return null;
  return (
    // (one line, centred: placed from the left at 50%, it was only half the screen wide and wrapped to three lines)
    <div role="status" className="fixed inset-x-0 z-[55] flex justify-center px-3 pointer-events-none"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)" }}>
     <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-[#3a3128] text-white shadow-lg pl-4 pr-1 max-w-full">
      <button onClick={() => { setShown(false); window.dispatchEvent(new CustomEvent("wander-open-chat", { detail: { prefill: "Tell Ken " } })); }}
        className="min-h-[44px] text-sm text-left whitespace-nowrap">
        Not finding something? Tell Ken ›
      </button>
      <button onClick={() => setShown(false)} aria-label="Not now" className="min-h-[44px] min-w-[44px] text-base text-white/80">✕</button>
     </div>
    </div>
  );
}
