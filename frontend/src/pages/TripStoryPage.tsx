/**
 * TripStoryPage — A scrollable narrative of the trip.
 *
 * Shows city by city, day by day, with highlights, notes, and stats.
 * Available after the trip ends (or anytime as a preview).
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import type { Trip, Day, Experience, City } from "../lib/types";

interface Reflection {
  id: string;
  dayId: string;
  highlights: string[];
  note: string | null;
  traveler: { displayName: string };
  day: { id: string; date: string; cityId: string; city: { name: string } };
}

export default function TripStoryPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const t = await api.get<Trip>("/trips/active");
        if (!t) { navigate("/"); return; }
        setTrip(t);

        const [d, e, r] = await Promise.all([
          api.get<Day[]>(`/days/trip/${t.id}`),
          api.get<Experience[]>(`/experiences/trip/${t.id}`),
          api.get<Reflection[]>(`/reflections/trip/${t.id}`),
        ]);
        setDays(d);
        setExperiences(e);
        setReflections(r);
      } catch {
        navigate("/");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const storySections = useMemo(() => {
    if (!trip || days.length === 0) return [];

    const sortedDays = [...days].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Group days by city
    const sections: {
      city: City;
      days: {
        day: Day;
        exps: Experience[];
        reflection: Reflection | null;
      }[];
    }[] = [];

    let currentCityId: string | null = null;
    let currentSection: typeof sections[0] | null = null;

    for (const day of sortedDays) {
      const dayExps = experiences.filter(
        e => e.dayId === day.id && e.state === "selected"
      );
      const dayReflection = reflections.find(r => r.dayId === day.id) || null;

      if (day.cityId !== currentCityId) {
        const city = trip.cities?.find(c => c.id === day.cityId);
        if (city) {
          currentSection = { city, days: [] };
          sections.push(currentSection);
          currentCityId = day.cityId;
        }
      }

      if (currentSection) {
        currentSection.days.push({ day, exps: dayExps, reflection: dayReflection });
      }
    }

    return sections;
  }, [trip, days, experiences, reflections]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#8a7a62] bg-[#faf8f5]">
        Loading your story...
      </div>
    );
  }

  if (!trip) return null;

  const totalActivities = experiences.filter(e => e.state === "selected").length;
  const totalCities = (trip.cities || []).filter(c => !c.hidden).length;
  const highlightedExps = new Set(reflections.flatMap(r => r.highlights));

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-20">
      {/* Header */}
      <div className="bg-[#3a3128] text-white px-4 py-8 text-center">
        <button
          onClick={() => navigate("/")}
          className="absolute top-4 left-4 text-white/60 hover:text-white text-sm"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          &larr; Back
        </button>
        <h1 className="text-2xl font-light">{trip.name}</h1>
        {trip.startDate && trip.endDate && (
          <p className="text-sm text-white/60 mt-1">
            {new Date(trip.startDate).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}
            {" – "}
            {new Date(trip.endDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}
          </p>
        )}
        <div className="flex justify-center gap-6 mt-4 text-sm text-white/80">
          <span>{totalCities} cities</span>
          <span>{days.length} days</span>
          <span>{totalActivities} things done</span>
        </div>
      </div>

      {/* Story sections */}
      <div className="max-w-lg mx-auto px-4 py-6">
        {storySections.map((section, si) => (
          <div key={si} className="mb-8">
            {/* City header */}
            <div className="mb-4">
              <h2 className="text-xl font-light text-[#3a3128]">{section.city.name}</h2>
              {section.city.country && (
                <p className="text-sm text-[#a89880]">{section.city.country}</p>
              )}
              <p className="text-xs text-[#c8bba8] mt-0.5">
                {section.days.length} day{section.days.length !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Days */}
            {section.days.map(({ day, exps, reflection }) => {
              const dateLabel = new Date(day.date).toLocaleDateString("en-US", {
                weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
              });

              return (
                <div key={day.id} className="mb-4 pl-4 border-l-2 border-[#e0d8cc]">
                  <p className="text-xs text-[#a89880] mb-1">{dateLabel}</p>

                  {/* Activities */}
                  {exps.length > 0 ? (
                    <div className="space-y-1">
                      {exps.map(exp => {
                        const isHighlight = highlightedExps.has(exp.id);
                        return (
                          <div
                            key={exp.id}
                            className={`px-2.5 py-1.5 rounded text-sm ${
                              isHighlight
                                ? "bg-amber-50 border border-amber-200 text-[#3a3128]"
                                : "text-[#6b5d4a]"
                            }`}
                          >
                            {isHighlight && "⭐ "}{exp.name}
                            {exp.description && (
                              <span className="text-[#a89880] ml-1 text-xs">— {exp.description}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-[#c8bba8] italic">A free day</p>
                  )}

                  {/* Reflection note */}
                  {reflection?.note && (
                    <div className="mt-2 px-3 py-2 bg-[#f0ece5] rounded-lg text-sm text-[#6b5d4a] italic">
                      "{reflection.note}"
                      <span className="text-xs text-[#a89880] ml-1">— {reflection.traveler.displayName}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {storySections.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-[#a89880]">Your story is still being written</p>
            <p className="text-xs text-[#c8bba8] mt-1">Come back after your trip to see it all come together</p>
          </div>
        )}

        {/* Learning prompt — at the end of the story */}
        {storySections.length > 0 && <LearningPrompt tripId={trip.id} />}
      </div>
    </div>
  );
}

function LearningPrompt({ tripId }: { tripId: string }) {
  const { showToast } = useToast();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function saveLearning() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await api.post("/learnings", {
        tripId,
        content: text.trim(),
        source: "dedicated",
        visibility: "group",
      });
      setSaved(true);
      showToast("Thanks — that'll help next time");
    } catch {
      showToast("That didn't save — try again?", "error");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="mt-8 mb-4 text-center">
        <p className="text-sm text-[#8a7a62]">Noted — that'll come in handy next time</p>
      </div>
    );
  }

  return (
    <div className="mt-8 mb-4 p-4 bg-[#f0ece5] rounded-xl">
      <p className="text-sm font-medium text-[#3a3128] mb-2">Anything you'd do differently?</p>
      <p className="text-xs text-[#a89880] mb-3">Skip a place, change the order, pack something different — anything future-you should know.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Next time I'd..."
        rows={3}
        className="w-full px-3 py-2 rounded-lg border border-[#e0d8cc] bg-white text-sm text-[#3a3128]
                   placeholder-[#c8bba8] focus:outline-none focus:ring-2 focus:ring-[#a89880] resize-y"
      />
      <button
        onClick={saveLearning}
        disabled={saving || !text.trim()}
        className="mt-2 px-4 py-2 rounded-lg bg-[#514636] text-white text-sm font-medium
                   hover:bg-[#3a3128] disabled:opacity-40 transition-colors"
      >
        {saving ? "Saving..." : "Save this learning"}
      </button>
    </div>
  );
}
