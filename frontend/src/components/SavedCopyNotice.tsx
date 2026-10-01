/**
 * A quiet, lasting line while the phone has no signal: what's on screen is the copy this phone
 * saved, and from when — so nobody mistakes last night's plan for the latest. It stays until the
 * signal is back (then goes at once). A merely slow answer isn't called "no signal": the phone's
 * saved copy shows and quietly refreshes (the offline helper in sw.ts marks saved answers; api.ts
 * announces them with the time they were saved).
 */

import { useEffect, useState } from "react";
import useScoutDocked from "../hooks/useScoutDocked";

function when(savedAt: string | null) {
  if (!savedAt) return "";
  const d = new Date(savedAt);
  if (isNaN(d.getTime())) return "";
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? ` at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : ` ${d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

export default function SavedCopyNotice() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // Scout's bar says "No signal" itself while it shows — one floating layer at a time
  const scoutDocked = useScoutDocked();

  useEffect(() => {
    const onSaved = (e: Event) => setSavedAt((prev) => prev ?? ((e as CustomEvent).detail?.savedAt || null));
    const goOffline = () => setOffline(true);
    const goOnline = () => { setOffline(false); setSavedAt(null); };
    window.addEventListener("wander:saved-copy", onSaved);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("wander:saved-copy", onSaved);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // Room under the page for the notice, so the last line can scroll clear of it (round 13: on a small phone it covered
  // Home's "Tonight" line)
  const showing = offline && !scoutDocked;
  useEffect(() => {
    if (!showing) return;
    const before = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "48px";
    return () => { document.body.style.paddingBottom = before; };
  }, [showing]);

  if (!showing) return null;
  return (
    <div
      role="status"
      // Wraps inside the screen with a margin (round 12: kept to one line, large text ran it off both edges —
      // "gnal — showing what this phone saved Thu, Oct 1, 7:5")
      className="fixed left-1/2 -translate-x-1/2 z-[54] pointer-events-none rounded-2xl bg-[#514636] text-white shadow px-3 py-1.5 text-xs text-center w-max max-w-[calc(100vw-2rem)]"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 60px + var(--scout-dock, 0px))" }}
    >
      No signal — showing what this phone saved{when(savedAt)}
    </div>
  );
}
