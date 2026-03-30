/**
 * CaptureFAB — Floating action button for capturing anything.
 *
 * Tap: Opens camera capture
 * Long-press/expand: Paste text, Enter URL, Voice
 *
 * Knows where you are — if on a city board, pre-fills that city.
 */

import { useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useCapture } from "../contexts/CaptureContext";

export default function CaptureFAB() {
  const location = useLocation();
  const { startCapture } = useCapture();
  const [expanded, setExpanded] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handleTap = useCallback(() => {
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    // Quick tap: camera
    startCapture("camera", null, null);
  }, [startCapture]);

  const handlePointerDown = useCallback(() => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setExpanded(true);
    }, 500);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePaste = useCallback(() => {
    setExpanded(false);
    startCapture("paste", null, null);
  }, [startCapture]);

  const handleVoice = useCallback(() => {
    setExpanded(false);
    // Open chat with voice mode
    window.dispatchEvent(new CustomEvent("wander-open-chat", {
      detail: { voiceMode: true },
    }));
  }, []);

  // Hide on login, join, guide — must be AFTER all hooks
  const hiddenPaths = ["/login", "/join", "/guide", "/story"];
  if (hiddenPaths.some(p => location.pathname.startsWith(p))) return null;

  return (
    <>
      {/* Backdrop when expanded */}
      {expanded && (
        <div
          className="fixed inset-0 z-40 bg-black/10"
          onClick={() => setExpanded(false)}
        />
      )}

      {/* Expanded menu */}
      {expanded && (
        <div
          className="fixed z-50 flex flex-col gap-2 items-end"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
            right: 16,
          }}
        >
          <button
            onClick={handlePaste}
            className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-full shadow-lg
                       border border-[#e0d8cc] text-sm text-[#3a3128] hover:bg-[#faf8f5]
                       transition-colors active:scale-95"
          >
            <span>📋</span> Paste text or URL
          </button>
          <button
            onClick={() => { setExpanded(false); startCapture("camera", null, null); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-full shadow-lg
                       border border-[#e0d8cc] text-sm text-[#3a3128] hover:bg-[#faf8f5]
                       transition-colors active:scale-95"
          >
            <span>📷</span> Take a photo
          </button>
          <button
            onClick={handleVoice}
            className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-full shadow-lg
                       border border-[#e0d8cc] text-sm text-[#3a3128] hover:bg-[#faf8f5]
                       transition-colors active:scale-95"
          >
            <span>🎤</span> Tell Scout
          </button>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={handleTap}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="fixed z-50 w-14 h-14 rounded-full bg-[#514636] text-white shadow-xl
                   flex items-center justify-center text-2xl
                   hover:bg-[#3a3128] active:scale-90 transition-all"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          right: 16,
        }}
        aria-label="Capture something"
      >
        +
      </button>
    </>
  );
}
