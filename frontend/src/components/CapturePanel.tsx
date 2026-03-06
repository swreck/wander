import { useState, useRef } from "react";
import { api } from "../lib/api";
import type { Trip } from "../lib/types";

interface Props {
  trip: Trip;
  defaultCityId: string;
  onClose: () => void;
  onCaptured: () => void;
}

type CaptureMode = "manual" | "text" | "url" | "image";

export default function CapturePanel({ trip, defaultCityId, onClose, onCaptured }: Props) {
  const [mode, setMode] = useState<CaptureMode>("manual");
  const [cityId, setCityId] = useState(defaultCityId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [listChoice, setListChoice] = useState<"all" | "one" | null>(null);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (!cityId) return;
    setError("");
    setSubmitting(true);

    try {
      if (mode === "manual") {
        if (!name.trim()) return;
        await api.post("/capture", {
          tripId: trip.id,
          cityId,
          name: name.trim(),
          description: description.trim() || null,
          userNotes: userNotes.trim() || null,
        });
        onCaptured();
      } else if (mode === "text") {
        if (!text.trim()) return;
        // First preview to check if list
        const formData = new FormData();
        formData.append("tripId", trip.id);
        formData.append("cityId", cityId);
        formData.append("text", text.trim());
        formData.append("mode", "preview");
        if (userNotes.trim()) formData.append("userNotes", userNotes.trim());

        const preview = await api.upload<any>("/capture", formData);

        if (preview.isList && !listChoice) {
          setPreviewResult(preview);
          setSubmitting(false);
          return;
        }

        // Submit with chosen mode
        const submitData = new FormData();
        submitData.append("tripId", trip.id);
        submitData.append("cityId", cityId);
        submitData.append("text", text.trim());
        submitData.append("mode", listChoice || "all");
        if (userNotes.trim()) submitData.append("userNotes", userNotes.trim());

        await api.upload("/capture", submitData);
        onCaptured();
      } else if (mode === "url") {
        if (!url.trim()) return;
        const formData = new FormData();
        formData.append("tripId", trip.id);
        formData.append("cityId", cityId);
        formData.append("url", url.trim());
        formData.append("mode", listChoice || "all");
        if (userNotes.trim()) formData.append("userNotes", userNotes.trim());

        await api.upload("/capture", formData);
        onCaptured();
      } else if (mode === "image") {
        if (!file) return;
        const formData = new FormData();
        formData.append("tripId", trip.id);
        formData.append("cityId", cityId);
        formData.append("image", file);
        formData.append("mode", listChoice || "all");
        if (userNotes.trim()) formData.append("userNotes", userNotes.trim());

        await api.upload("/capture", formData);
        onCaptured();
      }
    } catch (err: any) {
      setError(err.message || "Capture failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleListChoice(choice: "all" | "one") {
    setListChoice(choice);
    // Re-submit with the choice
    setTimeout(() => handleSubmit(), 0);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-[#e0d8cc]
                    rounded-t-2xl shadow-2xl max-h-[70vh] overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-[#3a3128]">Capture Experience</h3>
          <button onClick={onClose} className="text-[#c8bba8] hover:text-[#6b5d4a] text-lg">
            &times;
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-4">
          {([
            ["manual", "Manual"],
            ["text", "Paste Text"],
            ["url", "URL"],
            ["image", "Screenshot"],
          ] as [CaptureMode, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => { setMode(m); setListChoice(null); setPreviewResult(null); }}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                mode === m
                  ? "bg-[#514636] text-white"
                  : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* City selector */}
        <div className="flex gap-1 mb-3 overflow-x-auto">
          {trip.cities.map((city) => (
            <button
              key={city.id}
              onClick={() => setCityId(city.id)}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap shrink-0 transition-colors ${
                cityId === city.id
                  ? "bg-[#514636] text-white"
                  : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc]"
              }`}
            >
              {city.name}
            </button>
          ))}
        </div>

        {/* Mode-specific inputs */}
        <div className="space-y-3">
          {mode === "manual" && (
            <>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Experience name"
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                           text-[#3a3128] placeholder-[#c8bba8] text-sm
                           focus:outline-none focus:ring-2 focus:ring-[#a89880]"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                           text-[#3a3128] placeholder-[#c8bba8] text-sm resize-none
                           focus:outline-none focus:ring-2 focus:ring-[#a89880]"
              />
            </>
          )}

          {mode === "text" && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste text from an article, email, or chatbot..."
              rows={5}
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                         text-[#3a3128] placeholder-[#c8bba8] text-sm resize-y
                         focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            />
          )}

          {mode === "url" && (
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a URL..."
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                         text-[#3a3128] placeholder-[#c8bba8] text-sm
                         focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            />
          )}

          {mode === "image" && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-[#e0d8cc]
                           text-sm text-[#8a7a62] hover:border-[#a89880] transition-colors"
              >
                {file ? file.name : "Select screenshot or photo"}
              </button>
            </>
          )}

          {/* User notes — always available */}
          <input
            type="text"
            value={userNotes}
            onChange={(e) => setUserNotes(e.target.value)}
            placeholder="Why I saved this (optional)"
            className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                       text-[#3a3128] placeholder-[#c8bba8] text-sm
                       focus:outline-none focus:ring-2 focus:ring-[#a89880]"
          />
        </div>

        {/* List detection choice */}
        {previewResult?.isList && !listChoice && (
          <div className="mt-3 p-3 bg-[#faf8f5] rounded-lg border border-[#e0d8cc]">
            <p className="text-xs text-[#6b5d4a] mb-2">
              Found {previewResult.experiences.length} experiences. How would you like to save them?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleListChoice("all")}
                className="flex-1 py-2 rounded bg-[#514636] text-white text-xs font-medium
                           hover:bg-[#3a3128] transition-colors"
              >
                Create one per item
              </button>
              <button
                onClick={() => handleListChoice("one")}
                className="flex-1 py-2 rounded border border-[#e0d8cc] text-xs text-[#6b5d4a]
                           hover:bg-[#f0ece5] transition-colors"
              >
                Keep as one entry
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || (mode === "manual" && !name.trim()) ||
                   (mode === "text" && !text.trim()) ||
                   (mode === "url" && !url.trim()) ||
                   (mode === "image" && !file)}
          className="mt-4 w-full py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium
                     hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
