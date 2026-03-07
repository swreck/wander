import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * Global keyboard shortcuts for Wander.
 *
 * Navigation:
 *   1 or g h  → Trip Overview (home)
 *   2 or g p  → Plan page
 *   3 or g n  → Now page
 *   4 or g l  → History (log)
 *
 * Actions (Plan page):
 *   c         → Toggle capture panel
 *   i         → Toggle import panel
 *   m         → Toggle map/list on mobile
 *   Escape    → Close any open panel/modal
 *   ? or /    → Show shortcut help
 */

type ShortcutActions = {
  toggleCapture?: () => void;
  toggleImport?: () => void;
  toggleMobileView?: () => void;
  closePanel?: () => void;
};

let pendingG = false;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

export default function useKeyboardShortcuts(actions?: ShortcutActions) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't fire shortcuts when typing in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      // Don't fire on Cmd/Ctrl combos (browser shortcuts)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // Handle "g" prefix for two-key sequences
      if (pendingG) {
        pendingG = false;
        if (pendingTimer) clearTimeout(pendingTimer);
        switch (key) {
          case "h": navigate("/"); e.preventDefault(); return;
          case "p": navigate("/plan"); e.preventDefault(); return;
          case "n": navigate("/now"); e.preventDefault(); return;
          case "l": navigate("/history"); e.preventDefault(); return;
        }
        return; // unrecognized second key, ignore
      }

      if (key === "g") {
        pendingG = true;
        pendingTimer = setTimeout(() => { pendingG = false; }, 500);
        return;
      }

      // Single-key shortcuts
      switch (key) {
        case "1": navigate("/"); e.preventDefault(); break;
        case "2": navigate("/plan"); e.preventDefault(); break;
        case "3": navigate("/now"); e.preventDefault(); break;
        case "4": navigate("/history"); e.preventDefault(); break;
        case "c":
          if (actions?.toggleCapture) { actions.toggleCapture(); e.preventDefault(); }
          break;
        case "i":
          if (actions?.toggleImport) { actions.toggleImport(); e.preventDefault(); }
          break;
        case "m":
          if (actions?.toggleMobileView) { actions.toggleMobileView(); e.preventDefault(); }
          break;
        case "escape":
          if (actions?.closePanel) { actions.closePanel(); e.preventDefault(); }
          break;
        case "?":
        case "/":
          // Show help toast or modal — dispatch custom event
          window.dispatchEvent(new CustomEvent("wander:show-shortcuts"));
          e.preventDefault();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, location.pathname, actions]);
}
