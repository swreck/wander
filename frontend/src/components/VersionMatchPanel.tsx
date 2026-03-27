import { useState } from "react";
import type { VersionMatch } from "../contexts/CaptureContext";

interface Props {
  matches: VersionMatch[];
  onApply: (updates: { existingId: string; existingName: string; fields: Record<string, string> }[]) => void;
  onDismiss: () => void;
  committing: boolean;
}

/**
 * Shows version matches — existing experiences that match imported items.
 * Shows concrete diffs (what's new) and lets user apply updates or skip.
 */
export default function VersionMatchPanel({ matches, onApply, onDismiss, committing }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(matches.map(m => m.existingId)),
  );

  function toggleMatch(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleApply() {
    const updates = matches
      .filter(m => selectedIds.has(m.existingId))
      .map(m => ({
        existingId: m.existingId,
        existingName: m.existingName,
        fields: Object.fromEntries(
          m.diffs.map(d => [d.field, d.incoming || ""]),
        ),
      }));
    onApply(updates);
  }

  const fieldLabels: Record<string, string> = {
    description: "description",
    notes: "notes",
    timing: "best time to visit",
    address: "address",
  };

  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-sm text-amber-800 font-medium mb-1">
          Some of these match activities you already have
        </p>
        <p className="text-xs text-amber-700">
          The new version has more details. Select which ones to update — your edits won't be overwritten.
        </p>
      </div>

      {matches.map(match => (
        <div
          key={match.existingId}
          className={`rounded-lg border p-3 cursor-pointer transition-colors ${
            selectedIds.has(match.existingId)
              ? "border-amber-300 bg-amber-50/50"
              : "border-[#e0d8cc] bg-white"
          }`}
          onClick={() => toggleMatch(match.existingId)}
        >
          <div className="flex items-start gap-2">
            <div className={`w-5 h-5 rounded border-2 mt-0.5 shrink-0 flex items-center justify-center transition-colors ${
              selectedIds.has(match.existingId)
                ? "border-amber-500 bg-amber-500"
                : "border-[#c8bba8]"
            }`}>
              {selectedIds.has(match.existingId) && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 6l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#3a3128]">{match.existingName}</div>
              {match.confidence === "medium" && (
                <span className="text-xs text-amber-600">Likely match</span>
              )}
              <div className="mt-1.5 space-y-1">
                {match.diffs.map((diff, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-green-600 font-medium">
                      +{fieldLabels[diff.field] || diff.field}
                    </span>
                    {diff.incoming && (
                      <span className="text-[#8a7a62] ml-1">
                        {diff.incoming.length > 80
                          ? diff.incoming.slice(0, 80) + "..."
                          : diff.incoming}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleApply}
          disabled={committing || selectedIds.size === 0}
          className="flex-1 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-medium
                     hover:bg-amber-700 disabled:opacity-40 transition-colors"
        >
          {committing
            ? "Updating..."
            : `Update ${selectedIds.size} activit${selectedIds.size !== 1 ? "ies" : "y"} with new info`}
        </button>
        <button
          onClick={onDismiss}
          className="px-4 py-2.5 rounded-lg border border-[#e0d8cc] text-[#6b5d4a] text-sm
                     hover:bg-[#f0ece5] transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
