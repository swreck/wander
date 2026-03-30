/**
 * PlanningInsight — A tappable card showing a spatial or logistical observation.
 *
 * Used on the pre-trip Now screen. Each card represents something a human
 * planner might notice — density, distance, patterns — not obvious gaps.
 * Dismissable, never comes back.
 */

import { useState } from "react";

interface PlanningInsightProps {
  /** Unique key for dismiss persistence */
  insightKey: string;
  /** The observation */
  message: string;
  /** Optional action label */
  actionLabel?: string;
  /** Called when the action is tapped */
  onAction?: () => void;
}

export default function PlanningInsight({
  insightKey,
  message,
  actionLabel,
  onAction,
}: PlanningInsightProps) {
  const storageKey = `wander:insight-dismissed:${insightKey}`;
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(storageKey));

  if (dismissed) return null;

  return (
    <div className="p-3 bg-white rounded-lg border border-[#e0d8cc] hover:border-[#a89880] transition-colors">
      <p className="text-sm text-[#6b5d4a] leading-relaxed">{message}</p>
      <div className="flex items-center gap-3 mt-2">
        {onAction && actionLabel && (
          <button
            onClick={onAction}
            className="text-xs font-medium text-[#514636] hover:text-[#3a3128] transition-colors"
          >
            {actionLabel}
          </button>
        )}
        <button
          onClick={() => {
            localStorage.setItem(storageKey, "1");
            setDismissed(true);
          }}
          className="text-xs text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
