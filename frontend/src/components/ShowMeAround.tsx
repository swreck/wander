/**
 * "Show me around": six steps, one for each button along the bottom — the screen dims, the button stays lit, and a
 * sentence or two says what it's for (Oct 2, Ken: "a little overlay you scroll through that points out 4-6 things on
 * the screen and then disappears"). Only when asked: the welcome card's "Show me around", Settings, and How Wander
 * works start it (window event "wander:show-around"). Nothing covers the trip uninvited.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export const SHOW_AROUND = "wander:show-around";
export const showMeAround = () => window.dispatchEvent(new Event(SHOW_AROUND));

const stepsFor = (mine: boolean) => {
  const her = mine ? "your" : "Larisa's";
  return [
    // (plain words, no word that could mean two things — "a place for notes" in a travel app reads as a location; Ken)
    { tab: "Home", text: "Today at a glance: what's coming up, where you sleep tonight, and any deadlines. Below that is a calendar of the whole trip. Tap any day to see its plan." },
    // (Maybes, Oct 2 2026: the group's shared list of "maybe we should…", with her ideas)
    { tab: "Maybes", text: `When you think "maybe we should…", write it here and everyone on the trip sees it. Tap "I'm in" on anything you'd like to do. ${mine ? "Your" : "Larisa's"} ideas from ${her === "your" ? "your" : "her"} Activities tab are here too, city by city.` },
    { tab: "Next", text: "Your next stop today, and how long until it. The Walk, Train and Taxi buttons open Apple Maps with directions from wherever you're standing." },
    { tab: "Notes", text: "Write down anything you want to remember from the trip. Type or speak, and every word is kept." },
    { tab: "Actions", text: "Things to do soon, with their deadlines, like the last day to cancel a hotel for free." },
    { tab: "Scout", text: `Ask Scout anything about the trip, typed or spoken. Scout answers from ${her} Guide and shows which tab the answer came from. Scout reads photos and files too, like a menu, a sign or a PDF. Paste one in, or tap the paperclip.` },
  ];
};

type Box = { left: number; top: number; width: number; height: number };
const same = (a: Box | null, b: Box | null) => !!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

export default function ShowMeAround() {
  const me = useAuth().user?.displayName ?? "";
  const mine = /^larisa$/i.test(me);
  const steps = useMemo(() => stepsFor(mine), [mine]);
  const [step, setStep] = useState<number | null>(null);
  const [lit, setLit] = useState<Box | null>(null);
  const [cardLeft, setCardLeft] = useState(16);
  const [, setTick] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const start = () => {
      window.dispatchEvent(new Event("wander-close-chat"));
      setStep(0);
    };
    window.addEventListener(SHOW_AROUND, start);
    return () => window.removeEventListener(SHOW_AROUND, start);
  }, []);

  // Where the lit button and the card are (kept only when they moved, so measuring never redraws in a loop)
  useLayoutEffect(() => {
    if (step === null) return;
    const el = document.querySelector(`nav [data-tour="${steps[step].tab}"]`);
    const r = el?.getBoundingClientRect();
    const box = r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
    setLit((old) => (same(old, box) ? old : box));
    const c = cardRef.current?.getBoundingClientRect();
    if (c) setCardLeft((old) => (old === c.left ? old : c.left));
  });
  // …and again when the phone turns or the text size changes
  useEffect(() => {
    if (step === null) return;
    const again = () => setTick((t) => t + 1);
    window.addEventListener("resize", again);
    return () => window.removeEventListener("resize", again);
  }, [step]);

  const close = useCallback(() => {
    try { localStorage.setItem("wander:show-around-seen", "1"); } catch { /* private window */ }
    setStep(null);
  }, []);
  useEffect(() => {
    if (step === null) return;
    nextRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setStep((s) => (s !== null && s < steps.length - 1 ? s + 1 : s));
      if (e.key === "ArrowLeft") setStep((s) => (s ? s - 1 : s));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, close, steps.length]);

  if (step === null) return null;
  const s = steps[step];
  const last = step === steps.length - 1;
  const pad = 4;
  // The card sits just above the bottom bar, its point under the lit button
  const cardBottom = lit ? window.innerHeight - lit.top + 14 : 96;
  const point = lit ? Math.max(12, lit.left + lit.width / 2 - cardLeft - 8) : -100;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="A quick look around Wander">
      {/* The dim, with the button it's about left lit */}
      {lit ? (
        <div aria-hidden className="fixed rounded-xl pointer-events-none transition-all duration-300"
          style={{ left: lit.left - pad, top: lit.top - pad, width: lit.width + pad * 2, height: lit.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(36, 29, 22, 0.62)", outline: "2px solid rgba(255,255,255,0.9)" }} />
      ) : (
        <div aria-hidden className="fixed inset-0" style={{ background: "rgba(36, 29, 22, 0.62)" }} />
      )}
      <div ref={cardRef} className="fixed left-4 right-4 mx-auto max-w-md" style={{ bottom: cardBottom }}>
        <div className="relative rounded-xl bg-white p-4 shadow-lg">
          <p className="text-xs text-[#6b5d4a]">{step + 1} of {steps.length}</p>
          <p className="text-base font-medium text-[#3a3128] mt-0.5">{s.tab}</p>
          <p className="text-[15px] leading-snug text-[#514636] mt-1" aria-live="polite">{s.text}</p>
          <div className="flex items-center mt-3">
            {!last && (
              <button onClick={close} className="min-h-[44px] pr-3 text-sm text-[#6b5d4a] underline underline-offset-2">Skip</button>
            )}
            <div className="flex-1" />
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="min-h-[44px] px-4 rounded-lg text-sm text-[#514636] border border-[#e0d8cc] mr-2">Back</button>
            )}
            <button ref={nextRef} onClick={() => (last ? close() : setStep(step + 1))}
              className="min-h-[44px] px-5 rounded-lg bg-[#514636] text-white text-sm">
              {last ? "Done" : "Next"}
            </button>
          </div>
          {/* the point, under the lit button */}
          {lit && <span aria-hidden className="absolute -bottom-2 w-4 h-4 bg-white rotate-45" style={{ left: point }} />}
        </div>
      </div>
    </div>
  );
}
