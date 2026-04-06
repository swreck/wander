import { useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import type { Trip } from "../lib/types";

interface Props {
  trip: Trip;
  defaultCityId: string;
  onClose: () => void;
  onCaptured: () => void;
}

export default function CapturePanel({ trip, defaultCityId, onClose, onCaptured }: Props) {
  const { showToast } = useToast();
  const [cityId, setCityId] = useState(defaultCityId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [decisionTitle, setDecisionTitle] = useState("");
  const [showDecisionTitle, setShowDecisionTitle] = useState(false);

  async function handleSave(destination: "maybe" | "plan" | "decide") {
    if (!cityId || !name.trim()) return;
    if (destination === "decide" && !showDecisionTitle) {
      setDecisionTitle(name.trim() + "?");
      setShowDecisionTitle(true);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const result = await api.post<{ experiences: { id: string }[] }>("/capture", {
        tripId: trip.id,
        cityId,
        name: name.trim(),
        description: description.trim() || null,
        userNotes: userNotes.trim() || null,
      });
      const expId = result.experiences[0]?.id;

      if (destination === "plan" && expId) {
        // Find a day in this city to promote to (first available)
        const days = trip.days?.filter((d) => d.cityId === cityId) || [];
        if (days.length > 0) {
          await api.post(`/experiences/${expId}/promote`, { dayId: days[0].id });
        }
      }

      if (destination === "decide" && expId) {
        const dec = await api.post<{ id: string }>("/decisions", {
          tripId: trip.id,
          cityId,
          title: decisionTitle.trim() || name.trim() + "?",
        });
        await api.post(`/decisions/${dec.id}/options`, { experienceId: expId });
      }

      const label = destination === "plan" ? "On the plan" : destination === "decide" ? "Up for a vote" : "Saved as an idea";
      showToast(label);
      onCaptured();
    } catch (err: any) {
      setError(err.message || "That didn't save — try again?");
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
        <select
          value={cityId}
          onChange={(e) => setCityId(e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                     text-[#3a3128] text-sm appearance-none
                     focus:outline-none focus:ring-2 focus:ring-[#a89880]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23a89880' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundPosition: "right 0.5rem center", backgroundRepeat: "no-repeat", backgroundSize: "1.5em 1.5em", paddingRight: "2.5rem" }}
        >
          {trip.cities.map((city) => (
            <option key={city.id} value={city.id}>{city.name}</option>
          ))}
        </select>

        <div className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What's it called?"
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

        {/* Decision title (shown when "Decide together" tapped) */}
        {showDecisionTitle && (
          <div className="mt-3 p-2.5 bg-amber-50 rounded-lg border border-amber-200">
            <label className="text-xs text-amber-700 font-medium mb-1 block">Decision question</label>
            <input
              type="text"
              value={decisionTitle}
              onChange={(e) => setDecisionTitle(e.target.value)}
              placeholder="e.g. Where should we eat in Kyoto?"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-amber-200 bg-white
                         text-[#3a3128] placeholder-[#c8bba8] text-sm
                         focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {/* Three destination buttons */}
        <div className="mt-4 flex gap-2">
          {!showDecisionTitle ? (
            <>
              <button
                onClick={() => handleSave("plan")}
                disabled={submitting || !name.trim()}
                className="flex-1 py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium
                           hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
              >
                {submitting ? "..." : "Plan it"}
              </button>
              <button
                onClick={() => handleSave("maybe")}
                disabled={submitting || !name.trim()}
                className="flex-1 py-2.5 rounded-lg border border-[#e0d8cc] text-[#6b5d4a] text-sm font-medium
                           hover:bg-[#f0ece5] disabled:opacity-40 transition-colors"
              >
                {submitting ? "..." : "Maybe"}
              </button>
              <button
                onClick={() => handleSave("decide")}
                disabled={submitting || !name.trim()}
                className="flex-1 py-2.5 rounded-lg border border-amber-300 text-amber-700 text-sm font-medium
                           bg-amber-50 hover:bg-amber-100 disabled:opacity-40 transition-colors"
              >
                {submitting ? "..." : "Decide"}
              </button>
            </>
          ) : (
            <button
              onClick={() => handleSave("decide")}
              disabled={submitting || !name.trim() || !decisionTitle.trim()}
              className="flex-1 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-medium
                         hover:bg-amber-700 disabled:opacity-40 transition-colors"
            >
              {submitting ? "Saving..." : "Start Decision"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
