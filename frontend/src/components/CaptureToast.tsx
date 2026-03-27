import { useEffect, useRef } from "react";
import { useCapture } from "../contexts/CaptureContext";

/**
 * Slim bottom bar that appears when content is captured.
 * Shows extraction status with a tap-to-review action.
 * Auto-dismisses after 5 seconds if no interaction.
 */
export default function CaptureToast() {
  const { toastVisible, toastMessage, extracting, items, openReview, dismissToast, active } = useCapture();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (toastVisible && !extracting && items.length > 0) {
      timerRef.current = setTimeout(() => {
        dismissToast();
      }, 5000);
      return () => clearTimeout(timerRef.current);
    }
  }, [toastVisible, extracting, items.length, dismissToast]);

  if (!toastVisible || !active) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[60] flex justify-center pointer-events-none"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)" }}
    >
      <div
        className="pointer-events-auto bg-[#3a3128] text-white rounded-full shadow-xl
                    px-4 py-2.5 flex items-center gap-3 max-w-sm mx-4
                    animate-[slideUp_0.3s_ease-out]"
        style={{ animationFillMode: "both" }}
      >
        {extracting ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
            <span className="text-sm">{toastMessage}</span>
          </>
        ) : (
          <>
            <span className="text-sm flex-1">{toastMessage}</span>
            <button
              onClick={() => {
                clearTimeout(timerRef.current);
                openReview();
              }}
              className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-medium
                         hover:bg-white/30 transition-colors shrink-0"
            >
              Review
            </button>
            <button
              onClick={() => {
                clearTimeout(timerRef.current);
                dismissToast();
              }}
              className="text-white/50 hover:text-white/80 text-sm shrink-0"
            >
              &times;
            </button>
          </>
        )}
      </div>
    </div>
  );
}
