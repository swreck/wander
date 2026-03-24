import { useState } from "react";
import { api } from "../lib/api";
import type { Trip } from "../lib/types";

interface Props {
  trip: Trip;
  defaultCityId: string;
  onClose: () => void;
  onCaptured: () => void;
}

export default function CapturePanel({ trip, defaultCityId, onClose, onCaptured }: Props) {
  const [cityId, setCityId] = useState(defaultCityId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!cityId || !name.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      await api.post("/capture", {
        tripId: trip.id,
        cityId,
        name: name.trim(),
        description: description.trim() || null,
        userNotes: userNotes.trim() || null,
      });
      onCaptured();
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-[#e0d8cc]
                    rounded-t-2xl shadow-2xl max-h-[70vh] overflow-y-auto safe-bottom">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-[#3a3128]">Add Experience</h3>
          <button onClick={onClose} className="text-[#c8bba8] hover:text-[#6b5d4a] text-lg">
            &times;
          </button>
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

        <div className="space-y-3">
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
          <input
            type="text"
            value={userNotes}
            onChange={(e) => setUserNotes(e.target.value)}
            placeholder="Why I saved this (optional)"
            className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                       text-[#3a3128] placeholder-[#c8bba8] text-sm
                       focus:outline-none focus:ring-2 focus:ring-[#a89880]"
          />
          <p className="text-xs text-[#a89880]">Location will be looked up automatically</p>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          className="mt-4 w-full py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium
                     hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
