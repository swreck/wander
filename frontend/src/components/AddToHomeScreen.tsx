/**
 * AddToHomeScreen — the one step no website can do for itself on an iPhone: putting its icon on
 * the Home Screen. Shown only in iPhone Safari (never inside the Home Screen app itself), as three
 * short steps with the Share symbol drawn the way Safari shows it.
 *
 * It comes after Face ID is set up in Safari: the Home Screen app keeps its own storage, apart from Safari, so
 * the icon opens signed out — and Face ID, made here, signs in there (proven on Larisa's iPhone, Oct 2). The old
 * way — pointing the icon's start at the invite — didn't take on her iPhone: the icon opened signed out with no
 * Face ID yet, a dead end.
 */

import { useState } from "react";

export function isIPhoneSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1);
  return iOS && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function isHomeScreenApp() {
  if (typeof window === "undefined") return false;
  return (navigator as any).standalone === true || window.matchMedia?.("(display-mode: standalone)").matches;
}

const ShareSymbol = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block align-[-3px]" aria-label="Share">
    <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
  </svg>
);

const DISMISS = "wander:home-screen-card-dismissed";

export default function AddToHomeScreen({ variant = "card" }: { variant?: "card" }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return variant === "card" && localStorage.getItem(DISMISS) === "1"; } catch { return false; }
  });
  const show = isIPhoneSafari() && !isHomeScreenApp() && !dismissed;

  if (!show) return null;
  return (
    <div className="rounded-xl border border-[#e0d8cc] bg-white p-4 text-left mb-4">
      <p className="text-base font-medium text-[#3a3128]">Put Wander on your Home Screen</p>
      <ol className="mt-2 space-y-1.5 text-sm text-[#3a3128] list-decimal pl-5">
        <li>Tap Share <span className="text-[#514636]"><ShareSymbol /></span> at the bottom of Safari.</li>
        <li>Tap <span className="font-medium">Add to Home Screen</span> (scroll down if you don't see it), then <span className="font-medium">Add</span>.</li>
        <li>Open Wander from your Home Screen and tap <span className="font-medium">Sign in with Face ID</span>.</li>
      </ol>
      <div className="flex justify-end mt-1">
        <button onClick={() => { setDismissed(true); try { localStorage.setItem(DISMISS, "1"); } catch { /* private mode */ } }} className="min-h-[44px] px-2 text-sm text-[#514636]">Not now</button>
      </div>
    </div>
  );
}
