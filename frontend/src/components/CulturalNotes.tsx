import { useState } from "react";
import { api } from "../lib/api";
import type { CulturalNote } from "../lib/types";

interface Props {
  experienceId: string;
  cachedNotes?: CulturalNote[] | null;
  onNotesLoaded?: (notes: CulturalNote[]) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  etiquette: "bow",
  practical: "info",
  timing: "clock",
};

const CATEGORY_COLORS: Record<string, string> = {
  etiquette: "text-amber-700 bg-amber-50 border-amber-200",
  practical: "text-blue-700 bg-blue-50 border-blue-200",
  timing: "text-emerald-700 bg-emerald-50 border-emerald-200",
};

export default function CulturalNotes({ experienceId, cachedNotes, onNotesLoaded }: Props) {
  const [notes, setNotes] = useState<CulturalNote[] | null>(cachedNotes || null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function loadNotes() {
    if (notes) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    setExpanded(true);
    try {
      const res = await api.post<{ notes: CulturalNote[] }>(`/cultural-notes/experience/${experienceId}`, {});
      setNotes(res.notes);
      onNotesLoaded?.(res.notes);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={loadNotes}
        className="flex items-center gap-1.5 text-sm text-[#8a7a62] hover:text-[#514636] transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        {loading ? "Looking up..." : expanded ? "Hide context" : "Cultural context"}
      </button>

      {expanded && notes && notes.length > 0 && (
        <div className="mt-2 space-y-2">
          {notes.map((note, i) => (
            <div
              key={i}
              className={`px-3 py-2 rounded-lg text-sm border ${CATEGORY_COLORS[note.category] || "text-[#6b5d4a] bg-[#f5f0e8] border-[#e0d8cc]"}`}
            >
              <span className="font-medium capitalize text-xs opacity-70 block mb-0.5">{note.category}</span>
              {note.tip}
            </div>
          ))}
        </div>
      )}

      {expanded && notes && notes.length === 0 && !loading && (
        <p className="mt-2 text-sm text-[#c8bba8] italic">No cultural context available for this place.</p>
      )}
    </div>
  );
}
