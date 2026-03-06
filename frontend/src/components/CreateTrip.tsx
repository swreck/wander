import { useState, useRef } from "react";
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

type Mode = "choose" | "manual" | "import" | "review";

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

export default function CreateTrip({ onCreated }: Props) {
  const { user, logout } = useAuth();
  const [mode, setMode] = useState<Mode>("choose");

  // Manual mode state
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [cities, setCities] = useState<CityInput[]>([
    { name: "", country: "", arrivalDate: "", departureDate: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Import mode state
  const [importText, setImportText] = useState("");
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importStartDate, setImportStartDate] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function buildRouteSegments() {
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
    return segments;
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !startDate || !endDate) return;

    setError("");
    setSubmitting(true);
    try {
      await api.post("/trips", {
        name: name.trim(),
        startDate,
        endDate,
        cities: cities.filter((c) => c.name.trim()),
        routeSegments: buildRouteSegments(),
      });
      onCreated();
    } catch (err: any) {
      setError(err.message || "Failed to create trip");
    } finally {
      setSubmitting(false);
    }
  }

  // --- Import mode functions ---
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setImportFiles(Array.from(e.target.files));
    }
  }

  async function handleExtract() {
    if (!importText.trim() && importFiles.length === 0) return;

    setError("");
    setExtracting(true);
    try {
      const formData = new FormData();
      if (importText.trim()) {
        formData.append("text", importText.trim());
      }
      if (importStartDate) {
        formData.append("startDate", importStartDate);
      }
      for (const file of importFiles) {
        formData.append("images", file);
      }

      const result = await api.upload<ExtractionResult>("/import/extract", formData);
      setExtraction(result);
      setMode("review");
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

  // --- Mode: Choose ---
  if (mode === "choose") {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

    return (
      <div className="min-h-screen bg-[#faf8f5]">
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
          <div className="mb-10">
            <h1 className="text-3xl font-light text-[#3a3128] mb-2">
              {greeting}{user ? `, ${user.displayName}` : ""}.
            </h1>
            <p className="text-[15px] text-[#6b5d4a] leading-relaxed">
              Let's get your trip started. If you have an itinerary from a tour company, travel agent, or even an AI chatbot, paste it in and Wander will do the rest. Or start fresh — either way, you'll have a map, a schedule, and everything organized in a few minutes.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setMode("import")}
              className="w-full text-left px-5 py-5 bg-white rounded-xl border border-[#e0d8cc]
                         hover:border-[#a89880] hover:shadow-sm transition-all"
            >
              <div className="text-[#3a3128] font-medium text-base">Import an itinerary</div>
              <div className="text-sm text-[#8a7a62] mt-1.5 leading-relaxed">
                Paste text, upload screenshots, or share a document — Wander extracts cities, hotels, activities, and dates automatically
              </div>
            </button>

            <button
              onClick={() => setMode("manual")}
              className="w-full text-left px-5 py-5 bg-white rounded-xl border border-[#f0ece5]
                         hover:border-[#e0d8cc] hover:shadow-sm transition-all"
            >
              <div className="text-[#3a3128] font-medium text-base">Start from scratch</div>
              <div className="text-sm text-[#8a7a62] mt-1.5">
                Enter your dates and cities, then add experiences as you discover them
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Mode: Review ---
  if (mode === "review" && extraction) {
    return (
      <ImportReview
        data={extraction}
        onCommit={handleCommit}
        onBack={() => setMode("import")}
        submitting={submitting}
        error={error}
      />
    );
  }

  // --- Mode: Import ---
  if (mode === "import") {
    return (
      <div className="min-h-screen bg-[#faf8f5]">
        <div className="max-w-xl mx-auto px-4 py-8">
          <button
            onClick={() => setMode("choose")}
            className="text-sm text-[#8a7a62] hover:text-[#3a3128] mb-4 transition-colors"
          >
            &larr; Back
          </button>

          <h1 className="text-2xl font-light text-[#3a3128] mb-2">Import Itinerary</h1>
          <p className="text-sm text-[#8a7a62] mb-6">
            Paste your itinerary text below, upload screenshots, or both. The AI will extract
            cities, dates, hotels, and activities for you to review before creating the trip.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">
                Trip start date
              </label>
              <p className="text-xs text-[#8a7a62] mb-1.5">
                If the itinerary uses "Day 1, Day 2" instead of real dates, set the start date here
              </p>
              <input
                type="date"
                value={importStartDate}
                onChange={(e) => setImportStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                           text-[#3a3128] text-sm
                           focus:outline-none focus:ring-2 focus:ring-[#a89880]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">
                Paste itinerary text
              </label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Paste your itinerary, tour company document, or AI chatbot output here..."
                rows={10}
                className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                           text-[#3a3128] placeholder-[#c8bba8] text-sm
                           focus:outline-none focus:ring-2 focus:ring-[#a89880] resize-y"
              />
            </div>

            <div className="relative">
              <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">
                Or upload screenshots / images
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-[#e0d8cc]
                           text-sm text-[#8a7a62] hover:border-[#a89880] hover:text-[#6b5d4a]
                           transition-colors"
              >
                {importFiles.length > 0
                  ? `${importFiles.length} file${importFiles.length > 1 ? "s" : ""} selected`
                  : "Click to select images"}
              </button>
              {importFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {importFiles.map((f, i) => (
                    <div key={i} className="text-xs text-[#8a7a62] flex items-center gap-2">
                      <span>{f.name}</span>
                      <button
                        onClick={() => setImportFiles(importFiles.filter((_, j) => j !== i))}
                        className="text-[#c8bba8] hover:text-red-500"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <button
            onClick={handleExtract}
            disabled={extracting || (!importText.trim() && importFiles.length === 0)}
            className="mt-6 w-full py-3 rounded-lg bg-[#514636] text-white text-sm font-medium
                       hover:bg-[#3a3128] disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {extracting ? "Analyzing itinerary..." : "Extract & Review"}
          </button>
        </div>
      </div>
    );
  }

  // --- Mode: Manual ---
  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <div className="max-w-xl mx-auto px-4 py-8">
        <button
          onClick={() => setMode("choose")}
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
              <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                           text-[#3a3128] focus:outline-none focus:ring-2 focus:ring-[#a89880]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                           text-[#3a3128] focus:outline-none focus:ring-2 focus:ring-[#a89880]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-3">
              Cities
            </label>
            <div className="space-y-3">
              {cities.map((city, i) => (
                <div key={i} className="p-3 bg-white rounded-lg border border-[#f0ece5] space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={city.name}
                      onChange={(e) => updateCity(i, "name", e.target.value)}
                      placeholder="City name"
                      className="flex-1 px-3 py-2 rounded border border-[#e0d8cc] bg-white
                                 text-[#3a3128] placeholder-[#c8bba8] text-sm
                                 focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                    />
                    <input
                      type="text"
                      value={city.country}
                      onChange={(e) => updateCity(i, "country", e.target.value)}
                      placeholder="Country"
                      className="w-28 px-3 py-2 rounded border border-[#e0d8cc] bg-white
                                 text-[#3a3128] placeholder-[#c8bba8] text-sm
                                 focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                    />
                    {cities.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCity(i)}
                        className="px-2 text-[#c8bba8] hover:text-red-500 transition-colors"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={city.arrivalDate}
                      onChange={(e) => updateCity(i, "arrivalDate", e.target.value)}
                      className="px-3 py-1.5 rounded border border-[#e0d8cc] bg-white
                                 text-[#3a3128] text-sm
                                 focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                    />
                    <input
                      type="date"
                      value={city.departureDate}
                      onChange={(e) => updateCity(i, "departureDate", e.target.value)}
                      className="px-3 py-1.5 rounded border border-[#e0d8cc] bg-white
                                 text-[#3a3128] text-sm
                                 focus:outline-none focus:ring-2 focus:ring-[#a89880]"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addCity}
              className="mt-2 text-sm text-[#6b5d4a] hover:text-[#3a3128] transition-colors"
            >
              + Add city
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !name.trim() || !startDate || !endDate}
            className="w-full py-3 rounded-lg bg-[#514636] text-white text-sm font-medium
                       hover:bg-[#3a3128] disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {submitting ? "Creating..." : "Create Trip"}
          </button>
        </form>
      </div>
    </div>
  );
}
