import { useEffect, useState } from "react";

/**
 * Whether Scout's slim bar is showing above the tabs. One floating layer at a time: while it shows,
 * other bottom notices wait (the bar itself says when there's no signal). ChatBubble announces it.
 */
export default function useScoutDocked(): boolean {
  const [docked, setDocked] = useState(() => typeof document !== "undefined" && document.documentElement.dataset.scoutDock === "1");
  useEffect(() => {
    const on = (e: Event) => setDocked(!!(e as CustomEvent).detail?.docked);
    window.addEventListener("wander:scout-dock", on);
    return () => window.removeEventListener("wander:scout-dock", on);
  }, []);
  return docked;
}
