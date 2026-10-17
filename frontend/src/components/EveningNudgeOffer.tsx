/**
 * Home's ask for Scout's nightly question (Oct 17 2026). Ken, on Scout's evening question: "It's not even reaching me!";
 * to a 9 PM notification for everyone: "Yes, build the request for others"; then: "Ask for notification permission when
 * anyone opens next, e.g., tonight or tomorrow (for today). At that point ask if you can ask each night. Options: yes,
 * no, ask me again tomorrow."
 *
 * On the next opening, during the trip, on a phone that can and hasn't decided (an iPhone lets Wander ask only from a tap,
 * in the app opened from its Home Screen icon): Yes brings the iPhone's own box; No is final; "Ask me again tomorrow"
 * waits for the next trip date. Never on a visit something else has asked in (lib/visitAsks). The same yes lets Scout's
 * answers buzz the phone (lib/buzz) — said in the ask. The server sends the nudge (backend services/eveningNudge.ts).
 */
import { useEffect, useState } from "react";
import { canOfferNudge, declineNudge, nudgeTomorrow, turnOnBuzz } from "../lib/buzz";
import { takeVisitAsk, visitAsk } from "../lib/visitAsks";

export default function EveningNudgeOffer({ today, className = "" }: { today: string | null; className?: string }) {
  // (decided in the first drawing, so Home doesn't move under a finger; today is null outside the trip)
  const [state, setState] = useState<"offer" | "asking" | "on" | "off" | "failed" | "none">(() =>
    today && canOfferNudge(today) && (!visitAsk() || visitAsk() === "nudge") ? "offer" : "none");
  useEffect(() => { if (state === "offer") takeVisitAsk("nudge"); }, [state]);
  if (state === "none") return null;
  const btn = "min-h-[44px] px-4 rounded-xl text-sm disabled:opacity-60";
  return (
    <section className={`rounded-xl bg-[#3f3830] text-white p-4 ${className}`} aria-label="Scout's nightly question">
      {state === "on" ? (
        <p className="text-[15px] leading-snug">Thank you. At 9 each night, Scout will ask what's worth remembering from the day.</p>
      ) : state === "off" ? (
        <p className="text-[15px] leading-snug">Your iPhone said no, so Scout won't ask. To change it later: Settings › Notifications › Wander.</p>
      ) : state === "failed" ? (
        <p className="text-[15px] leading-snug">That didn't finish. Wander will try again the next time you open it.</p>
      ) : (
        <>
          <p className="text-xs uppercase tracking-wide text-white/70">Scout asks</p>
          <p className="text-lg leading-snug mt-1">Can I ask you each night what's worth remembering from the day?</p>
          <p className="text-sm text-white/80 mt-1">A notification at 9 PM opens your notes for that day. Your phone will also buzz when one of my answers is ready.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button disabled={state === "asking"} onClick={async () => { setState("asking"); setState(await turnOnBuzz()); }}
              className={`${btn} bg-white text-[#3a3128] font-medium`}>{state === "asking" ? "One moment…" : "Yes"}</button>
            <button disabled={state === "asking"} onClick={() => { declineNudge(); setState("none"); }} className={`${btn} text-white/85`}>No</button>
            <button disabled={state === "asking"} onClick={() => { nudgeTomorrow(today!); setState("none"); }} className={`${btn} text-white/85`}>Ask me again tomorrow</button>
          </div>
        </>
      )}
    </section>
  );
}
