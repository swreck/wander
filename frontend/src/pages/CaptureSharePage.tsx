import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Trip } from "../lib/types";

export default function CaptureSharePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Shared data from the share target
  const sharedName = searchParams.get("name") || "";
  const sharedText = searchParams.get("text") || "";
  const sharedUrl = searchParams.get("url") || "";

  const [name, setName] = useState(sharedName || extractTitle(sharedText, sharedUrl));
  const [notes, setNotes] = useState(sharedText || sharedUrl);
  const [selectedCityId, setSelectedCityId] = useState("");

  useEffect(() => {
    async function load() {
      const t = await api.get<Trip>("/trips/active");
      if (!t) { navigate("/"); return; }
      setTrip(t);
      if (t.cities.length > 0) setSelectedCityId(t.cities[0].id);
      setLoading(false);
    }
    load();
  }, [navigate]);

  async function handleSave() {
    if (!name.trim() || !trip || !selectedCityId) return;
    setSaving(true);
    try {
      await api.post("/experiences", {
        tripId: trip.id,
        cityId: selectedCityId,
        name: name.trim(),
        sourceUrl: sharedUrl || null,
        userNotes: notes.trim() || null,
      });
      navigate("/plan");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#8a7a62] bg-[#faf8f5]">
        Loading...
      </div>
    );
  }

  if (!trip) return null;

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <div className="max-w-md mx-auto px-4 py-8">
        <h1 className="text-xl font-light text-[#3a3128] mb-1">Save to Wander</h1>
        <p className="text-xs text-[#8a7a62] mb-6">Add this to your trip</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                         text-[#3a3128] text-sm focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">
              City
            </label>
            <select
              value={selectedCityId}
              onChange={(e) => setSelectedCityId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                         text-[#3a3128] text-sm focus:outline-none focus:ring-2 focus:ring-[#a89880]"
            >
              {trip.cities.map((city) => (
                <option key={city.id} value={city.id}>{city.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#a89880] mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white
                         text-[#3a3128] text-sm focus:outline-none focus:ring-2 focus:ring-[#a89880] resize-y"
            />
          </div>

          {sharedUrl && (
            <div className="text-xs text-[#a89880] truncate">
              Source: {sharedUrl}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 py-3 rounded-lg bg-[#514636] text-white text-sm font-medium
                       hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-3 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a]
                       hover:bg-[#f0ece5] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function extractTitle(text: string, url: string): string {
  // Try to extract a meaningful name from shared text or URL
  if (text) {
    const firstLine = text.split("\n")[0].trim();
    if (firstLine.length > 0 && firstLine.length < 100) return firstLine;
  }
  if (url) {
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/\/$/, "").split("/").pop();
      if (path) return decodeURIComponent(path).replace(/[-_]/g, " ");
    } catch { /* ignore */ }
  }
  return "";
}
