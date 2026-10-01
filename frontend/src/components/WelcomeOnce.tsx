/**
 * The first time someone opens Wander on a phone: what it is and that there's nothing they need to do — once, then it
 * goes (delight audit: Julie's first minute never said what Wander was, and the best sentence was behind "?").
 * Larisa hears it as hers: her Guide, on everyone's phone, never changed.
 */
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { voiceFor } from "../lib/guideDisplay";

const KEY = "wander:welcome-seen";

export default function WelcomeOnce({ owner }: { owner: string | null }) {
  const me = useAuth().user?.displayName ?? null;
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(KEY) === "1"; } catch { return true; } });
  if (seen || !me) return null;
  const v = voiceFor(me, owner);
  const close = () => { try { localStorage.setItem(KEY, "1"); } catch { /* private window */ } setSeen(true); };
  return (
    <section className="mb-4 rounded-xl bg-white border border-[#e0d8cc] p-4">
      <p className="text-base text-[#3a3128]">Hi {me}.</p>
      <p className="text-sm text-[#514636] mt-1">
        {v.mine
          ? "This is your Guide, day by day, on everyone's phone. Wander reads it and never changes it."
          // (nothing to set up — not "nothing to do": Ken has six tickets to collect; delight audit)
          : `This is ${owner || "Larisa"}'s plan for the trip, day by day, on your phone. There's nothing to set up — it's here when you want it.`}
      </p>
      <button onClick={close} className="mt-2 min-h-[44px] px-4 rounded-lg bg-[#514636] text-white text-sm">Got it</button>
    </section>
  );
}
