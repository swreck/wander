/**
 * UpdatePrompt — Detects new service worker and prompts reload.
 *
 * When a new build deploys, the SW registers and waits. This component
 * detects the waiting SW and shows a "New version available" prompt.
 */

import { useState, useEffect } from "react";

export default function UpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.ready.then((registration) => {
      // Check for updates periodically
      const checkInterval = setInterval(() => {
        registration.update().catch(() => {});
      }, 60000); // every minute

      // Listen for new service worker
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // New version available
            setShowPrompt(true);
          }
        });
      });

      return () => clearInterval(checkInterval);
    });

    // Also detect controller change (another tab triggered the update)
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }, []);

  function handleUpdate() {
    // Tell the waiting SW to skip waiting and take over
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    });
    // The controllerchange listener will reload the page
    setTimeout(() => window.location.reload(), 500);
  }

  if (!showPrompt) return null;

  return (
    // Below the iPhone's status bar and Dynamic Island, inside the screen's width, with a full-size button (Ken, Oct 1:
    // "unreadable … cut off by the dynamic island" — it sat at 16 px from the top, under the island)
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[200] bg-[#514636] text-white pl-4 pr-2 py-2 rounded-xl shadow-lg flex items-center gap-3 text-sm w-max max-w-[calc(100vw-2rem)]"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      role="status"
    >
      <span>A newer Wander is ready</span>
      <button
        onClick={handleUpdate}
        className="min-h-[44px] px-4 bg-white/20 rounded-lg hover:bg-white/30 transition-colors font-medium"
      >
        Update now
      </button>
    </div>
  );
}
