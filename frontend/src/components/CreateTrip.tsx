import { useState, useRef, useCallback } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import ImportReview from "./ImportReview";

interface CityInput {
  name: string;
  country: string;
  arrivalDate: string;
  departureDate: string;
}

interface Props {
  onCreated: () => void;
}

type Mode = "main" | "manual" | "review";

export interface ExtractionResult {
  tripName: string;
  startDate: string;
  endDate: string;
  cities: {
    name: string;
    country: string;
    arrivalDate: string | null;
    departureDate: string | null;
  }[];
  accommodations: {
    cityName: string;
    name: string;
    address?: string;
    checkInDate?: string;
    checkOutDate?: string;
    notes?: string;
  }[];
  experiences: {
    cityName: string;
    dayDate: string | null;
    name: string;
    description?: string;
    timeWindow?: string;
  }[];
  routeSegments: {
    originCity: string;
    destinationCity: string;
    transportMode: string;
    departureDate?: string;
    notes?: string;
  }[];
  notes: string;
}

// Detect if a string looks like a URL
function looksLikeUrl(s: string): boolean {
  const trimmed = s.trim();
  return /^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed);
}

function describeInput(text: string, files: File[]): string | null {
  const parts: string[] = [];
  if (files.length > 0) {
    for (const f of files) {
      if (f.type === "application/pdf") parts.push(`PDF: ${f.name}`);
      else parts.push(`Image: ${f.name}`);
    }
  }
  if (text.trim()) {
    if (looksLikeUrl(text)) {
      parts.push(`URL: ${text.trim().slice(0, 60)}`);
    } else {
      const words = text.trim().split(/\s+/).length;
      parts.push(`${words} words of text`);
    }
  }
  return parts.length > 0 ? parts.join("  ·  ") : null;
}

export default function CreateTrip({ onCreated }: Props) {
  const { user, logout } = useAuth();
  const [mode, setMode] = useState<Mode>("main");

  // Unified import state
  const [inputText, setInputText] = useState("");
  const [inputFiles, setInputFiles] = useState<File[]>([]);
  const [startDateHint, setStartDateHint] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual mode state
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [cities, setCities] = useState<CityInput[]>([
    { name: "", country: "", arrivalDate: "", departureDate: "" },
  ]);

  const hasInput = inputText.trim().length > 0 || inputFiles.length > 0;
  const inputDescription = describeInput(inputText, inputFiles);

  // --- File handling ---
  function addFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList);
    setInputFiles((prev) => [...prev, ...arr]);
  }

  function removeFile(index: number) {
    setInputFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // --- Drag and drop ---
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  }, []);

  // --- Paste handler (for the whole zone) ---
  function handlePaste(e: React.ClipboardEvent) {
    // Check for files in clipboard (screenshots)
    if (e.clipboardData.files?.length) {
      addFiles(e.clipboardData.files);
      e.preventDefault();
      return;
    }
    // Text paste is handled naturally by the textarea
  }

  // --- Extract ---
  async function handleExtract() {
    if (!hasInput) return;

    setError("");
    setExtracting(true);
    try {
      const text = inputText.trim();
      const isUrl = looksLikeUrl(text) && inputFiles.length === 0;

      if (isUrl) {
        // Fetch URL content server-side, then extract
        const url = text.startsWith("http") ? text : `https://${text}`;
        const result = await api.post<ExtractionResult>("/import/extract-url", {
          url,
          startDate: startDateHint || undefined,
        });
        setExtraction(result);
        setMode("review");
      } else {
        // Standard text + file upload
        const formData = new FormData();
        if (text && !isUrl) {
          formData.append("text", text);
        }
        if (startDateHint) {
          formData.append("startDate", startDateHint);
        }
        for (const file of inputFiles) {
          formData.append("images", file);
        }
        const result = await api.upload<ExtractionResult>("/import/extract", formData);
        setExtraction(result);
        setMode("review");
      }
    } catch (err: any) {
      setError(err.message || "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  async function handleCommit(data: ExtractionResult) {
    setError("");
    setSubmitting(true);
    try {
      await api.post("/import/commit", data);
      onCreated();
    } catch (err: any) {
      setError(err.message || "Failed to create trip");
    } finally {
      setSubmitting(false);
    }
  }

  function clearInput() {
    setInputText("");
    setInputFiles([]);
    setError("");
  }

  // --- Manual mode functions ---
  function updateCity(index: number, field: keyof CityInput, value: string) {
    const updated = [...cities];
    updated[index] = { ...updated[index], [field]: value };
    setCities(updated);
  }

  function addCity() {
    setCities([...cities, { name: "", country: "", arrivalDate: "", departureDate: "" }]);
  }

  function removeCity(index: number) {
    if (cities.length <= 1) return;
    setCities(cities.filter((_, i) => i !== index));
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !startDate || !endDate) return;

    setError("");
    setSubmitting(true);
    try {
      const segments = [];
      for (let i = 0; i < cities.length - 1; i++) {
        if (cities[i].name && cities[i + 1].name) {
          segments.push({
            originCity: cities[i].name,
            destinationCity: cities[i + 1].name,
            transportMode: "other",
          });
        }
      }
      await api.post("/trips", {
        name: name.trim(),
        startDate,
        endDate,
        cities: cities.filter((c) => c.name.trim()),
        routeSegments: segments,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message || "Failed to create trip");
    } finally {
      setSubmitting(false);
    }
  }

  // --- Mode: Review ---
  if (mode === "review" && extraction) {
    return (
      <ImportReview
        data={extraction}
        onCommit={handleCommit}
        onBack={() => setMode("main")}
        submitting={submitting}
        error={error}
      />
    );
  }

  // --- Mode: Manual ---
  if (mode === "manual") {
    return (
      <div className="min-h-screen bg-[#faf8f5]">
        <div className="max-w-xl mx-auto px-4 py-8">
          <button
            onClick={() => setMode("main")}
            className="text-sm text-[#8a7a62] hover:text-[#3a3128] mb-4 transition-colors"
          >
            &larr; Back
          </button>

          <h1 className="text-2xl font-light text-[#3a3128] mb-6">New Trip</h1>

          <form onSubmit={handleManualSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">
                Trip Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Japan 2026"
                className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                           text-[#3a3128] placeholder-[#c8bba8]
                           focus:outline-none focus:ring-2 focus:ring-[#a89880]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white text-[#3a3128] focus:outline-none focus:ring-2 focus:ring-[#a89880]" />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white text-[#3a3128] focus:outline-none focus:ring-2 focus:ring-[#a89880]" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-3">Cities</label>
              <div className="space-y-3">
                {cities.map((city, i) => (
                  <div key={i} className="p-3 bg-white rounded-lg border border-[#f0ece5] space-y-2">
                    <div className="flex gap-2">
                      <input type="text" value={city.name} onChange={(e) => updateCity(i, "name", e.target.value)}
                        placeholder="City name"
                        className="flex-1 px-3 py-2 rounded border border-[#e0d8cc] bg-white text-[#3a3128] placeholder-[#c8bba8] text-sm focus:outline-none focus:ring-2 focus:ring-[#a89880]" />
                      <input type="text" value={city.country} onChange={(e) => updateCity(i, "country", e.target.value)}
                        placeholder="Country"
                        className="w-28 px-3 py-2 rounded border border-[#e0d8cc] bg-white text-[#3a3128] placeholder-[#c8bba8] text-sm focus:outline-none focus:ring-2 focus:ring-[#a89880]" />
                      {cities.length > 1 && (
                        <button type="button" onClick={() => removeCity(i)} className="px-2 text-[#c8bba8] hover:text-red-500 transition-colors">&times;</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" value={city.arrivalDate} onChange={(e) => updateCity(i, "arrivalDate", e.target.value)}
                        className="px-3 py-1.5 rounded border border-[#e0d8cc] bg-white text-[#3a3128] text-sm focus:outline-none focus:ring-2 focus:ring-[#a89880]" />
                      <input type="date" value={city.departureDate} onChange={(e) => updateCity(i, "departureDate", e.target.value)}
                        className="px-3 py-1.5 rounded border border-[#e0d8cc] bg-white text-[#3a3128] text-sm focus:outline-none focus:ring-2 focus:ring-[#a89880]" />
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addCity} className="mt-2 text-sm text-[#6b5d4a] hover:text-[#3a3128] transition-colors">+ Add city</button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={submitting || !name.trim() || !startDate || !endDate}
              className="w-full py-3 rounded-lg bg-[#514636] text-white text-sm font-medium hover:bg-[#3a3128] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {submitting ? "Creating..." : "Create Trip"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- Mode: Main (unified import) ---
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div
      className="min-h-screen bg-[#faf8f5]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Full-screen drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-[#514636]/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl shadow-xl px-8 py-6 text-center">
            <div className="text-lg text-[#3a3128] font-medium">Drop your file here</div>
            <div className="text-sm text-[#8a7a62] mt-1">PDF, image, or screenshot</div>
          </div>
        </div>
      )}

      <div className="max-w-xl mx-auto px-4 py-12">
        {/* Identity bar */}
        <div className="flex items-center justify-between mb-10">
          <div className="text-xs text-[#a89880] tracking-wide uppercase">Wander</div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#8a7a62]">{user?.displayName}</span>
            <button onClick={logout} className="text-xs text-[#c8bba8] hover:text-[#8a7a62] transition-colors">
              Sign out
            </button>
          </div>
        </div>

        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-light text-[#3a3128] mb-2">
            {greeting}{user ? `, ${user.displayName}` : ""}.
          </h1>
          <p className="text-[15px] text-[#6b5d4a] leading-relaxed">
            Drop a PDF, paste text, or share a URL — Wander will extract your cities, hotels, and activities automatically.
          </p>
        </div>

        {/* Unified input zone */}
        <div className="space-y-4">
          <div
            className={`relative rounded-xl border-2 border-dashed transition-colors ${
              dragOver ? "border-[#514636] bg-[#f0ece5]" : "border-[#e0d8cc] bg-white"
            }`}
            onPaste={handlePaste}
          >
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste itinerary text, a URL, or drop a file anywhere on this page..."
              rows={6}
              className="w-full px-4 py-4 bg-transparent text-sm text-[#3a3128] placeholder-[#c8bba8]
                         focus:outline-none resize-y rounded-xl"
            />

            {/* File attach button inside the zone */}
            <div className="flex items-center justify-between px-4 pb-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                multiple
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-[#a89880] hover:text-[#6b5d4a] transition-colors"
              >
                + Attach file
              </button>
              {hasInput && (
                <button
                  type="button"
                  onClick={clearInput}
                  className="text-xs text-[#c8bba8] hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Show what's been added */}
          {inputFiles.length > 0 && (
            <div className="space-y-1.5">
              {inputFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-[#f0ece5] text-sm">
                  <span className="text-[#3a3128] truncate">
                    {f.type === "application/pdf" ? "PDF" : "Image"}: {f.name}
                    <span className="text-[#c8bba8] ml-2">({(f.size / 1024 / 1024).toFixed(1)} MB)</span>
                  </span>
                  <button onClick={() => removeFile(i)} className="text-[#c8bba8] hover:text-red-500 ml-2 shrink-0">&times;</button>
                </div>
              ))}
            </div>
          )}

          {/* Start date hint — collapsed by default */}
          {!startDateHint ? (
            <button
              type="button"
              onClick={() => setStartDateHint(" ")}
              className="text-xs text-[#a89880] hover:text-[#6b5d4a] transition-colors"
            >
              Does the itinerary use "Day 1, Day 2" instead of dates? Set a start date
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#a89880] shrink-0">Trip starts:</label>
              <input
                type="date"
                value={startDateHint.trim()}
                onChange={(e) => setStartDateHint(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg border border-[#e0d8cc] bg-white text-[#3a3128] text-sm
                           focus:outline-none focus:ring-2 focus:ring-[#a89880]"
              />
              <button onClick={() => setStartDateHint("")} className="text-xs text-[#c8bba8] hover:text-red-500">&times;</button>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleExtract}
            disabled={extracting || !hasInput}
            className="w-full py-3 rounded-lg bg-[#514636] text-white text-sm font-medium
                       hover:bg-[#3a3128] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {extracting ? "Reading your itinerary..." : "Extract & Review"}
          </button>

          {/* Start from scratch link */}
          <div className="text-center pt-2">
            <button
              onClick={() => setMode("manual")}
              className="text-xs text-[#a89880] hover:text-[#6b5d4a] transition-colors"
            >
              Or start from scratch with dates and cities
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
