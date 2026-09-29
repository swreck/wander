/**
 * useBackToClose — while a panel (Scout, the trip menu, Actions, phrases) is open, the phone's
 * Back gesture closes the panel instead of leaving Wander.
 *
 * Opening the panel adds one step to the browser's history; Back removes it and closes the panel.
 * Closing the panel any other way (✕, tapping outside) removes the step too, so Back afterwards
 * behaves normally.
 */

import { useEffect, useRef } from "react";

export default function useBackToClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const marker = `wander-panel-${Math.random().toString(36).slice(2)}`;
    window.history.pushState({ ...(window.history.state || {}), wanderPanel: marker }, "");
    let closedByBack = false;
    const onPop = () => {
      // Only when OUR step came off. Two panels can be open at once (Actions, with Scout on top): Back
      // (or Scout stepping down) removes Scout's step, and Actions — whose step is showing again — stays.
      if (window.history.state?.wanderPanel === marker) return;
      closedByBack = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed some other way: take our history step back off, so Back doesn't need a second press
      if (!closedByBack && window.history.state?.wanderPanel === marker) window.history.back();
    };
  }, [open]);
}
