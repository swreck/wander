/**
 * ScoutNudge — A dismissable contextual thought from Scout.
 *
 * Appears as a small, warm card. Once dismissed, it never comes back
 * (stored in localStorage). Never blocks interaction.
 */

import { useState, useCallback } from "react";

interface ScoutNudgeProps {
  /** Unique key for dismiss persistence — once dismissed, stays gone */
  nudgeKey: string;
  /** The thought to share */
  message: string;
  /** Optional action when tapped (navigates, opens chat, etc.) */
  onTap?: () => void;
  /** Label for the tap action — defaults to "Let's discuss" */
  tapLabel?: string;
}

export default function ScoutNudge({ nudgeKey, message, onTap, tapLabel }: ScoutNudgeProps) {
  const storageKey = `wander:nudge-dismissed:${nudgeKey}`;
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(storageKey));

  const handleDismiss = useCallback(() => {
    localStorage.setItem(storageKey, "1");
    setDismissed(true);
  }, [storageKey]);

  if (dismissed) return null;

  return (
    <div className="bg-white rounded-lg border border-[#e0d8cc] px-3 py-2.5 flex items-start gap-2.5">
      <span className="text-sm shrink-0 mt-0.5">💬</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#6b5d4a] leading-relaxed">{message}</p>
        <div className="flex items-center gap-3 mt-1.5">
          {onTap && (
            <button
              onClick={onTap}
              className="text-xs text-[#514636] font-medium hover:text-[#3a3128] transition-colors"
            >
              {tapLabel || "Let's discuss"}
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="text-xs text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
