/**
 * ExperienceNotes — inline notes on experience cards
 *
 * Shows group and private notes. Own notes are editable.
 * Others' notes are italic. Newest on top. Toggle for group vs private.
 */

import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import type { ExperienceNoteEntry } from "../lib/types";

interface Props {
  experienceId: string;
  notes: ExperienceNoteEntry[];
  onNotesChanged: () => void;
}

export default function ExperienceNotes({ experienceId, notes, onNotesChanged }: Props) {
  const { user } = useAuth();
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState("");
  const [visibility, setVisibility] = useState<"group" | "private">("group");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const myTravelerId = user?.travelerId;

  async function handleSave() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await api.post("/experience-notes", {
        experienceId,
        content: draft.trim(),
        visibility,
      });
      setDraft("");
      setDrafting(false);
      onNotesChanged();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleUpdate(noteId: string) {
    if (!editContent.trim()) return;
    setSaving(true);
    try {
      await api.patch(`/experience-notes/${noteId}`, { content: editContent.trim() });
      setEditingId(null);
      onNotesChanged();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(noteId: string) {
    try {
      await api.delete(`/experience-notes/${noteId}`);
      onNotesChanged();
    } catch { /* ignore */ }
  }

  // Sort: newest first
  const sorted = [...notes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="mt-2 pt-2 border-t border-[#f0ece5]">
      {/* Existing notes */}
      {sorted.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {sorted.map((note) => {
            const isMine = note.travelerId === myTravelerId;
            const isEditing = editingId === note.id;

            return (
              <div key={note.id} className="text-xs">
                {isEditing ? (
                  <div className="flex gap-1">
                    <input
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="flex-1 px-2 py-1 rounded border border-[#e0d8cc] text-xs focus:outline-none focus:ring-1 focus:ring-[#a89880]"
                      onKeyDown={(e) => { if (e.key === "Enter") handleUpdate(note.id); if (e.key === "Escape") setEditingId(null); }}
                      autoFocus
                    />
                    <button onClick={() => handleUpdate(note.id)} disabled={saving} className="text-[#514636] font-medium">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-[#a89880]">✕</button>
                  </div>
                ) : (
                  <div className="flex items-start gap-1">
                    <span className={isMine ? "text-[#3a3128]" : "text-[#8a7a62] italic"}>
                      <span className="font-medium">{note.traveler.displayName}:</span> {note.content}
                    </span>
                    {isMine && (
                      <button
                        onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
                        className="text-[#c8bba8] hover:text-[#8a7a62] shrink-0 ml-1"
                        title="Edit"
                      >✎</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add note */}
      {drafting ? (
        <div className="space-y-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note..."
            className="w-full px-2 py-1.5 rounded border border-[#e0d8cc] text-xs text-[#3a3128] resize-none focus:outline-none focus:ring-1 focus:ring-[#a89880]"
            rows={2}
            autoFocus
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVisibility(visibility === "group" ? "private" : "group")}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  visibility === "group"
                    ? "border-[#514636] text-[#514636] bg-[#faf8f5]"
                    : "border-[#c8bba8] text-[#8a7a62]"
                }`}
              >
                {visibility === "group" ? "For group" : "Just for me"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setDrafting(false); setDraft(""); }} className="text-xs text-[#a89880]">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !draft.trim()}
                className="text-xs font-medium text-[#514636] disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setDrafting(true)}
          className="text-xs text-[#a89880] hover:text-[#6b5d4a] transition-colors"
        >
          {sorted.length > 0 ? "Add a note" : "Add a note about this"}
        </button>
      )}
    </div>
  );
}
