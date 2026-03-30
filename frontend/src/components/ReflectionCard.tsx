/**
 * ReflectionCard — Evening prompt to capture the day's highlights.
 *
 * Appears after 6pm during trip dates. Dismissable for the day —
 * dismissed means dismissed, forever for that day.
 */

import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import type { Experience } from "../lib/types";

interface ReflectionCardProps {
  tripId: string;
  dayId: string;
  dayDate: string;
  cityName: string;
  experiences: Experience[];
}

export default function ReflectionCard({
  tripId,
  dayId,
  dayDate,
  cityName,
  experiences,
}: ReflectionCardProps) {
  const dismissKey = `wander:reflection-dismissed:${dayId}`;
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(dismissKey));
  const [visible, setVisible] = useState(false);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Only show after 6pm
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 18 && !dismissed) {
      setVisible(true);
    }
  }, [dismissed]);

  // Load existing reflection
  useEffect(() => {
    api.get<any>(`/reflections/day/${dayId}`)
      .then(r => {
        if (r) {
          setHighlights(r.highlights || []);
          setNote(r.note || "");
          setSaved(true);
        }
      })
      .catch(() => {});
  }, [dayId]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(dismissKey, "1");
    setDismissed(true);
    setVisible(false);
  }, [dismissKey]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.post("/reflections", {
        dayId,
        highlights,
        note: note.trim() || null,
      });
      setSaved(true);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [dayId, highlights, note]);

  const toggleHighlight = useCallback((expId: string) => {
    setHighlights(prev =>
      prev.includes(expId)
        ? prev.filter(id => id !== expId)
        : [...prev, expId]
    );
    setSaved(false);
  }, []);

  if (!visible || dismissed) return null;

  const selectedExps = experiences.filter(e => e.state === "selected");
  const dateLabel = new Date(dayDate).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={handleDismiss}>
      <div
        className="w-full sm:max-w-md sm:mx-4 bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div className="px-4 pt-5 pb-3">
          <h2 className="text-lg font-light text-[#3a3128]">How was today?</h2>
          <p className="text-sm text-[#8a7a62] mt-0.5">{dateLabel} in {cityName}</p>
        </div>

        {/* Highlight activities */}
        {selectedExps.length > 0 && (
          <div className="px-4 pb-3">
            <p className="text-xs text-[#a89880] mb-2">Tap any highlights</p>
            <div className="flex flex-wrap gap-1.5">
              {selectedExps.map(exp => {
                const isHl = highlights.includes(exp.id);
                return (
                  <button
                    key={exp.id}
                    onClick={() => toggleHighlight(exp.id)}
                    className={`px-2.5 py-1 rounded-full text-sm transition-colors ${
                      isHl
                        ? "bg-amber-100 border border-amber-300 text-[#3a3128]"
                        : "bg-[#f0ece5] border border-transparent text-[#6b5d4a] hover:border-[#e0d8cc]"
                    }`}
                  >
                    {isHl && "⭐ "}{exp.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Note */}
        <div className="px-4 pb-3">
          <textarea
            value={note}
            onChange={e => { setNote(e.target.value); setSaved(false); }}
            placeholder="Anything you want to remember about today..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] text-sm text-[#3a3128]
                       placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-[#a89880] resize-none"
          />
        </div>

        {/* Actions */}
        <div className="px-4 pb-2 flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || (highlights.length === 0 && !note.trim())}
            className="flex-1 py-2 rounded-lg bg-[#514636] text-white text-sm font-medium
                       hover:bg-[#3a3128] transition-colors disabled:opacity-40"
          >
            {saving ? "Saving..." : saved ? "Got it ✓" : "Save"}
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2 rounded-lg text-sm text-[#a89880] hover:text-[#6b5d4a] transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
