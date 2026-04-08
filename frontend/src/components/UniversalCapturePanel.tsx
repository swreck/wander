import { useState, useRef } from "react";
import { useCapture, type CaptureItem, type VersionMatch } from "../contexts/CaptureContext";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import type { Trip } from "../lib/types";
import BatchReviewList from "./BatchReviewList";
import VersionMatchPanel from "./VersionMatchPanel";

interface Props {
  trip: Trip;
  defaultCityId: string;
  onCommitted: () => void;
}

/**
 * Universal review panel for captured content.
 * Handles single items (inline edit) and batches (tappable list).
 * Supports version matching (enriching existing experiences).
 */
export default function UniversalCapturePanel({ trip, defaultCityId, onCommitted }: Props) {
  const capture = useCapture();
  const { showToast } = useToast();
  const [committing, setCommitting] = useState(false);
  const [showVersionMatches, setShowVersionMatches] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Input mode — for Import button entry (no content yet)
  const [inputMode, setInputMode] = useState(!capture.active);
  const [inputText, setInputText] = useState("");
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);

  if (!capture.reviewOpen && !inputMode) return null;

  const { items, versionMatches, newItemIndices } = capture;
  const hasVersionMatches = versionMatches.length > 0;

  async function handleInputExtract() {
    if (!inputText.trim() && !inputFile) return;
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append("tripId", trip.id);
      formData.append("cityId", defaultCityId);
      if (inputText.trim()) formData.append("text", inputText.trim());
      if (inputFile) formData.append("image", inputFile);

      const result = await api.upload<any>("/import/universal-extract", formData);

      capture.startCapture("import", inputText || null, inputFile);
      capture.setExtractionResults({
        items: result.items || [],
        versionMatches: result.versionMatches || [],
        newItemIndices: result.newItemIndices || [],
        sessionId: result.sessionId || null,
        sessionItemCount: result.sessionItemCount || 0,
        defaultCityId: result.defaultCityId || defaultCityId,
        defaultCityName: result.defaultCityName || null,
      });
      capture.openReview();
      setInputMode(false);
    } catch {
      showToast("Couldn't make sense of that — try pasting the text directly?", "error");
    } finally {
      setExtracting(false);
    }
  }

  async function handleCommitAll() {
    setCommitting(true);
    try {
      // Prepare new items
      const newItems = newItemIndices.map(i => ({
        ...items[i],
        cityId: items[i].cityId || defaultCityId,
        destination: items[i].destination || "maybe",
      }));

      const result = await api.post<{ created: number; updated: number; skipped: number }>(
        "/import/universal-commit",
        {
          tripId: trip.id,
          items: newItems,
          sessionId: capture.sessionId,
        },
      );

      const parts = [];
      if (result.created > 0) parts.push(`${result.created} added`);
      if (result.skipped > 0) parts.push(`${result.skipped} duplicates skipped`);
      // During active trip dates, use a warmer toast
      const today = new Date().toISOString().split("T")[0];
      const duringTrip = trip.startDate && trip.endDate &&
        today >= trip.startDate.split("T")[0] && today <= trip.endDate.split("T")[0];
      const defaultMsg = duringTrip ? "Nice find — saved for today" : "All set — take a look";
      showToast(parts.join(", ") || defaultMsg);
      capture.reset();
      onCommitted();
    } catch {
      showToast("That didn't go through — try again?", "error");
    } finally {
      setCommitting(false);
    }
  }

  async function handleVersionUpdates(updates: { existingId: string; existingName: string; fields: Record<string, string> }[]) {
    setCommitting(true);
    try {
      await api.post("/import/universal-commit", {
        tripId: trip.id,
        items: [],
        versionUpdates: updates,
        sessionId: capture.sessionId,
      });
      showToast(`Added new details to ${updates.length} activities`);
      // Remove matched items from the view
      setShowVersionMatches(false);
      onCommitted();
    } catch {
      showToast("That didn't go through — try again?", "error");
    } finally {
      setCommitting(false);
    }
  }

  function handleClose() {
    capture.reset();
    setInputMode(false);
    setInputText("");
    setInputFile(null);
  }

  // Single item inline edit
  function handleSingleItemEdit(field: keyof CaptureItem, value: string) {
    if (items.length === 1) {
      const updated = [{ ...items[0], [field]: value }];
      capture.updateItems(updated);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={handleClose} />
      <div className="relative bg-white rounded-t-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col"
           style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div className="px-4 py-3 border-b border-[#f0ece5] shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[#3a3128]">
              {inputMode ? "Import" : (
                capture.sessionItemCount > items.length
                  ? `${capture.sessionItemCount} activities so far — add more or confirm`
                  : items.length === 1
                    ? "Review activity"
                    : `${items.length} activities found`
              )}
            </h3>
            <button onClick={handleClose} className="text-[#c8bba8] hover:text-[#6b5d4a] text-lg">&times;</button>
          </div>
          {hasVersionMatches && !showVersionMatches && (
            <button
              onClick={() => setShowVersionMatches(true)}
              className="mt-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
            >
              {versionMatches.length} of these look familiar — tap to compare
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="max-w-2xl mx-auto">
            {/* Input mode — Import button entry */}
            {inputMode && (
              <>
                <p className="text-xs text-[#a89880] mb-3">
                  Paste text, a URL, or upload a photo. Wander figures out the rest.
                </p>
                <textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="Paste anything — a URL, friend's tips, itinerary, article..."
                  rows={5}
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                             text-[#3a3128] placeholder-[#c8bba8] text-sm resize-y
                             focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  capture="environment"
                  onChange={e => setInputFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="px-3 py-1.5 rounded border border-dashed border-[#e0d8cc] text-xs text-[#8a7a62]
                               hover:border-[#a89880] transition-colors"
                  >
                    {inputFile ? inputFile.name : "📷 Photo or file"}
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={handleInputExtract}
                    disabled={extracting || (!inputText.trim() && !inputFile)}
                    className="px-4 py-1.5 rounded-lg bg-[#514636] text-white text-xs font-medium
                               hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
                  >
                    {extracting ? "Reading your itinerary..." : "Go"}
                  </button>
                </div>
              </>
            )}

            {/* Version match panel */}
            {showVersionMatches && (
              <VersionMatchPanel
                matches={versionMatches}
                onApply={handleVersionUpdates}
                onDismiss={() => setShowVersionMatches(false)}
                committing={committing}
              />
            )}

            {/* Single item — inline edit */}
            {!inputMode && !showVersionMatches && items.length === 1 && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={items[0].name}
                  onChange={e => handleSingleItemEdit("name", e.target.value)}
                  placeholder="What's it called?"
                  className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                             text-[#3a3128] text-sm focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                />
                <textarea
                  value={items[0].description || ""}
                  onChange={e => handleSingleItemEdit("description", e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                             text-[#3a3128] placeholder-[#c8bba8] text-sm resize-none
                             focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                />
                <input
                  type="text"
                  value={items[0].userNotes || ""}
                  onChange={e => handleSingleItemEdit("userNotes", e.target.value)}
                  placeholder="Why I saved this (optional)"
                  className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                             text-[#3a3128] placeholder-[#c8bba8] text-sm
                             focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                />
                {/* City selector */}
                <select
                  value={items[0].cityId || defaultCityId}
                  onChange={e => handleSingleItemEdit("cityId", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                             text-[#3a3128] text-sm appearance-none
                             focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23a89880' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundPosition: "right 0.5rem center", backgroundRepeat: "no-repeat", backgroundSize: "1.5em 1.5em", paddingRight: "2.5rem" }}
                >
                  {trip.cities.map(city => (
                    <option key={city.id} value={city.id}>{city.name}</option>
                  ))}
                </select>
                <p className="text-xs text-[#a89880]">Location will be looked up automatically</p>
              </div>
            )}

            {/* Multiple items — batch review */}
            {!inputMode && !showVersionMatches && items.length > 1 && (
              <BatchReviewList
                items={items}
                trip={trip}
                defaultCityId={defaultCityId}
                onUpdateItem={(index, updated) => {
                  const newItems = [...items];
                  newItems[index] = updated;
                  capture.updateItems(newItems);
                }}
                onRemoveItem={(index) => {
                  const newItems = items.filter((_, i) => i !== index);
                  capture.updateItems(newItems);
                }}
              />
            )}
          </div>
        </div>

        {/* Action buttons */}
        {!inputMode && !showVersionMatches && items.length > 0 && (
          <div className="px-4 py-3 border-t border-[#f0ece5] shrink-0">
            <div className="max-w-2xl mx-auto flex gap-2">
              {items.length === 1 ? (
                // Single item: Plan it / Maybe / Decide
                <>
                  <button
                    onClick={() => {
                      capture.updateItems([{ ...items[0], destination: "plan" }]);
                      setTimeout(handleCommitAll, 0);
                    }}
                    disabled={committing || !items[0].name?.trim()}
                    className="flex-1 py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium
                               hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
                  >
                    {committing ? "..." : "Add to itinerary"}
                  </button>
                  <button
                    onClick={() => {
                      capture.updateItems([{ ...items[0], destination: "maybe" }]);
                      setTimeout(handleCommitAll, 0);
                    }}
                    disabled={committing || !items[0].name?.trim()}
                    className="flex-1 py-2.5 rounded-lg border border-[#e0d8cc] text-[#6b5d4a] text-sm font-medium
                               hover:bg-[#f0ece5] disabled:opacity-40 transition-colors"
                  >
                    {committing ? "..." : "Just an idea"}
                  </button>
                </>
              ) : (
                // Multiple items: Import All
                <button
                  onClick={handleCommitAll}
                  disabled={committing || items.length === 0}
                  className="flex-1 py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium
                             hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
                >
                  {committing ? "Importing..." : `Import ${items.length} activities`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
