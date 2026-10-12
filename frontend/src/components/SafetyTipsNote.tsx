/**
 * A quiet note on Home for Larisa, Andy and Julie: Safety tips, the free warning app from Japan's Tourism Agency (Ken,
 * Oct 13 2026: "Yes. I installed based on alert I think came from Japanese govt?? I'd think they worried get same.
 * Messages should be gentle. Something Like 'Ken got (identify real official notice source) alert to do this. He did it.
 * And you're with him. If you want to, here is how.'"). Gentle: inside Home, never over it; "Here's how" opens the
 * steps; "Got it" puts it away for good, on every phone (kept with the person). Drawn at once from this phone, right
 * under the day's own card (held back 1.5 s, its late arrival pushed the calendar: Home's jump went 0.083 → 0.117;
 * drawn at once it stays 0.083, the jump Andy's "You leave" card already made). Until the trip ends.
 */
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

const APP_STORE = "https://apps.apple.com/us/app/safety-tips/id858357174";
const UNTIL = Date.parse("2026-10-29T15:00:00Z");   // (the trip's last day ends in Japan)
const FOR = /^(larisa|andy|julie)\b/i;
const localKey = (me: string) => `wander:safety-tips-note:${me}`;

export default function SafetyTipsNote() {
  const { user } = useAuth();
  const me = user?.displayName || "";
  const travelerId = user?.travelerId || null;
  const forMe = FOR.test(me) && Date.now() < UNTIL;
  const [shown, setShown] = useState(() => {
    if (!forMe) return false;
    try { return !localStorage.getItem(localKey(me)); } catch { return true; }
  });
  const [how, setHow] = useState(false);

  // (put away on another phone: the person's own setting says so)
  useEffect(() => {
    if (!shown || !travelerId) return;
    let live = true;
    api.get<{ preferences?: Record<string, unknown> | null }>(`/auth/travelers/${travelerId}`)
      .then((t) => { if (live && t?.preferences?.safetyTipsNote === "done") { setShown(false); try { localStorage.setItem(localKey(me), "done"); } catch { /* private */ } } })
      .catch(() => { /* no signal: this phone decides */ });
    return () => { live = false; };
  }, [shown, travelerId, me]);

  if (!shown) return null;
  const done = () => {
    setShown(false);
    try { localStorage.setItem(localKey(me), "done"); } catch { /* private */ }
    if (travelerId) api.patch(`/auth/travelers/${travelerId}`, { preferences: { safetyTipsNote: "done" } }).catch(() => { /* this phone remembers */ });
  };
  return (
    <section data-safety-tips-note className="mb-3 rounded-xl border border-[#e0d8cc] bg-white/80 px-4 py-3 text-[15px] leading-relaxed text-[#3a3128]">
      <p>
        Ken got an alert pointing him to Safety tips, the free warning app from Japan's Tourism Agency. It sends
        earthquake, typhoon and heavy-rain warnings in English. He installed it, and you're with him. If you'd like it
        too, here's how.
      </p>
      {how && (
        <ol className="mt-2 ml-5 list-decimal space-y-1 text-sm text-[#514636]">
          <li>Get Safety tips from the App Store. It's free.</li>
          <li>Open it once, and allow notifications when it asks. That's how the warnings reach you.</li>
          <li>If it asks for your location, allowing it means the warnings are for where you are.</li>
        </ol>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        {how ? (
          <a href={APP_STORE} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center min-h-[44px] rounded-lg bg-[#514636] px-4 text-sm text-white">
            Get Safety tips
          </a>
        ) : (
          <button onClick={() => setHow(true)} className="min-h-[44px] rounded-lg bg-[#514636] px-4 text-sm text-white">
            Here's how
          </button>
        )}
        <button onClick={done} className="min-h-[44px] text-sm text-[#6b5d4a] underline underline-offset-2">
          Got it
        </button>
      </div>
    </section>
  );
}
