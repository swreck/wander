/**
 * CaptureFAB — Floating action button for capturing anything.
 *
 * Tap: Opens camera capture (via hidden file input)
 * Long-press/expand: Paste text, Enter URL, Voice
 *
 * Knows where you are — if on a city board, pre-fills that city.
 */

import { useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useCapture } from "../contexts/CaptureContext";
import { api } from "../lib/api";

export default function CaptureFAB() {
  const location = useLocation();
  const capture = useCapture();
  const [expanded, setExpanded] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = useCallback((file: File) => {
    const tripId = localStorage.getItem("wander:last-trip-id");
    if (!tripId) return;

    const ctx = (window as any).__wanderContext || {};
    const cityId = ctx.cityId || "";

    capture.startCapture("camera", null, file);

    const formData = new FormData();
    formData.append("tripId", tripId);
    if (cityId) formData.append("cityId", cityId);
    formData.append("image", file);
    if (capture.sessionId) formData.append("sessionId", capture.sessionId);

    api.upload<any>("/import/universal-extract", formData).then(result => {
      capture.setExtractionResults({
        items: result.items || [],
        versionMatches: result.versionMatches || [],
        newItemIndices: result.newItemIndices || [],
        sessionId: result.sessionId || null,
        sessionItemCount: result.sessionItemCount || 0,
        defaultCityId: result.defaultCityId || cityId,
        defaultCityName: result.defaultCityName || null,
      });
    }).catch(() => {
      capture.reset();
    });
  }, [capture]);

  const handleTap = useCallback(() => {
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    // Quick tap: open camera/file picker
    fileInputRef.current?.click();
  }, []);

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
    capture.startCapture("paste", null, null);
  }, [capture]);

  const handleVoice = useCallback(() => {
    setExpanded(false);
    // Open chat with voice mode
    window.dispatchEvent(new CustomEvent("wander-open-chat", {
      detail: { voiceMode: true },
    }));
  }, []);

  // The capture review panel only exists on /plan, and /plan has its own camera button
  // in the bottom action bar. Hide the FAB everywhere — it causes infinite-spinner bugs
  // on pages without extraction infrastructure (TripOverview, Now, History).
  // TODO: Re-enable when a global capture review panel is added outside of PlanPage.
  return null;

  // BottomNav is 56px + safe area on pages where it's visible
  const fabBottom = "calc(env(safe-area-inset-bottom, 0px) + 72px)";
  const menuBottom = "calc(env(safe-area-inset-bottom, 0px) + 136px)";

  return (
    <>
      {/* Hidden camera input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
          e.target.value = "";
        }}
        className="hidden"
      />

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
            bottom: menuBottom,
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
            onClick={() => { setExpanded(false); fileInputRef.current?.click(); }}
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
          bottom: fabBottom,
          right: 16,
        }}
        aria-label="Capture something"
      >
        +
      </button>
    </>
  );
}
