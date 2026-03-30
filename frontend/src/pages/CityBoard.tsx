/**
 * CityBoard — An idea board for a single city.
 *
 * Shows experiences grouped by theme with emoji reactions, notes, and a
 * sense of the city itself (photo header, accommodation info). This is
 * where browsing and dreaming happen — separate from the day timeline
 * which shows what's actually scheduled.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type {
  City, Trip, Experience, Accommodation,
  ExperienceReactionGroup, ExperienceNoteEntry,
} from "../lib/types";
import RatingsBadge from "../components/RatingsBadge";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { getContributorColor, getContributorInitial } from "../lib/travelerProfiles";
import useScoutSuggestions from "../hooks/useScoutSuggestions";
import ScoutNudge from "../components/ScoutNudge";

// ─── Theme display ───────────────────────────────────────────────

const THEME_META: Record<string, { emoji: string; label: string }> = {
  food: { emoji: "\uD83C\uDF5C", label: "Food & Drink" },
  temples: { emoji: "\u26E9\uFE0F", label: "Temples & Shrines" },
  ceramics: { emoji: "\uD83C\uDFFA", label: "Ceramics & Craft" },
  architecture: { emoji: "\uD83C\uDFDB\uFE0F", label: "Architecture" },
  nature: { emoji: "\uD83C\uDF3F", label: "Nature & Outdoors" },
  shopping: { emoji: "\uD83D\uDECD\uFE0F", label: "Shopping" },
  art: { emoji: "\uD83C\uDFA8", label: "Art & Culture" },
  nightlife: { emoji: "\uD83C\uDF19", label: "Nightlife" },
  other: { emoji: "\uD83D\uDCCD", label: "Other" },
};

const QUICK_EMOJIS = ["\u2764\uFE0F", "\uD83D\uDC4D", "\uD83D\uDD25"];

// ─── Sub-components ──────────────────────────────────────────────

function IdeaCard({
  exp,
  reactions,
  notes,
  onReact,
  onAddNote,
  onTap,
  onAskScout,
}: {
  exp: Experience;
  reactions: ExperienceReactionGroup[];
  notes: ExperienceNoteEntry[];
  onReact: (experienceId: string, emoji: string) => void;
  onAddNote: (experienceId: string, content: string) => void;
  onTap: (id: string) => void;
  onAskScout: (name: string) => void;
}) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState("");
  const cc = exp.createdBy ? getContributorColor(exp.createdBy) : null;
  const isScheduled = exp.state === "selected" && exp.dayId;

  return (
    <div
      className="bg-[#faf8f5] rounded-lg border border-[#e0d8cc] overflow-hidden
                 hover:border-[#a89880] transition-colors cursor-pointer"
      onClick={() => onTap(exp.id)}
    >
      <div className="px-3 py-2.5">
        {/* Name + scheduled indicator */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#3a3128] flex-1">{exp.name}</span>
          {isScheduled && (
            <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full shrink-0">
              Scheduled
            </span>
          )}
        </div>

        {/* Description */}
        {exp.description && (
          <p className="text-xs text-[#8a7a62] mt-1 line-clamp-2">{exp.description}</p>
        )}

        {/* Ratings + contributor */}
        <div className="flex items-center gap-2 mt-1.5">
          <RatingsBadge ratings={exp.ratings} placeIdGoogle={exp.placeIdGoogle} />
          {cc && (
            <span className="ml-auto flex items-center gap-1">
              <span
                className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0"
                style={{ backgroundColor: cc.bg, color: cc.text, border: `1px solid ${cc.border}` }}
              >
                {getContributorInitial(exp.createdBy)}
              </span>
            </span>
          )}
        </div>

        {/* Reactions */}
        <div className="flex items-center gap-1 mt-2" onClick={e => e.stopPropagation()}>
          {QUICK_EMOJIS.map(emoji => {
            const group = reactions.find(r => r.emoji === emoji);
            return (
              <button
                key={emoji}
                onClick={() => onReact(exp.id, emoji)}
                className={`px-2 py-1 rounded-full text-sm transition-colors
                  ${group
                    ? "bg-amber-100 border border-amber-200"
                    : "bg-[#f0ece5] border border-transparent hover:border-[#e0d8cc]"
                  }`}
              >
                {emoji}{group ? <span className="text-xs ml-0.5 text-[#8a7a62]">{group.count}</span> : null}
              </button>
            );
          })}
          {/* Show any custom reactions */}
          {reactions
            .filter(r => !QUICK_EMOJIS.includes(r.emoji))
            .map(r => (
              <button
                key={r.emoji}
                onClick={() => onReact(exp.id, r.emoji)}
                className="px-2 py-1 rounded-full text-sm bg-amber-100 border border-amber-200"
              >
                {r.emoji}<span className="text-xs ml-0.5 text-[#8a7a62]">{r.count}</span>
              </button>
            ))}
        </div>

        {/* Notes */}
        {notes.length > 0 && (
          <div className="mt-2 space-y-1" onClick={e => e.stopPropagation()}>
            {notes.map(note => (
              <div key={note.id} className="text-xs text-[#6b5d4a] bg-[#f0ece5] rounded px-2 py-1">
                <span className="font-medium">{note.traveler.displayName}:</span> {note.content}
              </div>
            ))}
          </div>
        )}

        {/* Add note */}
        <div className="mt-1.5" onClick={e => e.stopPropagation()}>
          {showNoteInput ? (
            <div className="flex gap-1">
              <input
                type="text"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Quick thought..."
                className="flex-1 px-2 py-1 rounded border border-[#e0d8cc] text-xs text-[#3a3128]
                           placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-[#a89880]"
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter" && noteText.trim()) {
                    onAddNote(exp.id, noteText.trim());
                    setNoteText("");
                    setShowNoteInput(false);
                  }
                }}
              />
              <button
                onClick={() => setShowNoteInput(false)}
                className="text-xs text-[#c8bba8] hover:text-[#8a7a62]"
              >
                &times;
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowNoteInput(true)}
                className="text-[11px] text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
              >
                + Add a note
              </button>
              <button
                onClick={() => onAskScout(exp.name)}
                className="text-[11px] text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
              >
                Ask Scout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────

export default function CityBoard() {
  const { cityId } = useParams<{ cityId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [city, setCity] = useState<City | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [reactions, setReactions] = useState<Record<string, ExperienceReactionGroup[]>>({});
  const [notes, setNotes] = useState<Record<string, ExperienceNoteEntry[]>>({});
  const [cityPhotoUrl, setCityPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const scoutSuggestions = useScoutSuggestions({
    tripId: trip?.id,
    context: "city",
    cityId: cityId,
  });

  // Load data
  const loadData = useCallback(async () => {
    if (!cityId) return;
    try {
      const [cityData, tripData] = await Promise.all([
        api.get<City>(`/cities/${cityId}`),
        api.get<Trip>("/trips/active"),
      ]);

      setCity(cityData);
      setTrip(tripData);

      const [exps, accs, reacts, noteData] = await Promise.all([
        api.get<Experience[]>(`/experiences/trip/${tripData.id}?cityId=${cityId}`),
        api.get<Accommodation[]>(`/accommodations/trip/${tripData.id}`),
        api.get<Record<string, ExperienceReactionGroup[]>>(`/reactions/city/${cityId}`),
        api.get<Record<string, ExperienceNoteEntry[]>>(`/experience-notes/city/${cityId}`),
      ]);

      setExperiences(exps);
      setAccommodations(accs.filter((a: Accommodation) => a.cityId === cityId));
      setReactions(reacts);
      setNotes(noteData);
    } catch {
      showToast("Couldn't load city data", "error");
    } finally {
      setLoading(false);
    }
  }, [cityId, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load city photo
  useEffect(() => {
    if (!city) return;
    const photoQuery = city.country ? `${city.name}, ${city.country}` : city.name;
    api.get<{ url?: string }>(`/geocoding/city-photo?query=${encodeURIComponent(photoQuery)}`)
      .then(res => { if (res?.url) setCityPhotoUrl(res.url); })
      .catch(() => {});
  }, [city]);

  // Group experiences by theme
  const themeGroups = useMemo(() => {
    const groups: Record<string, Experience[]> = {};
    for (const exp of experiences) {
      const themes = exp.themes?.length ? exp.themes : ["other"];
      for (const theme of themes) {
        if (!groups[theme]) groups[theme] = [];
        groups[theme].push(exp);
      }
    }
    // Sort groups: most ideas first, "other" last
    return Object.entries(groups).sort(([a, aExps], [b, bExps]) => {
      if (a === "other") return 1;
      if (b === "other") return -1;
      return bExps.length - aExps.length;
    });
  }, [experiences]);

  // Actions
  async function handleReact(experienceId: string, emoji: string) {
    try {
      await api.post("/reactions", { experienceId, emoji });
      loadData();
    } catch {
      showToast("Couldn't save that reaction", "error");
    }
  }

  async function handleAddNote(experienceId: string, content: string) {
    try {
      await api.post("/experience-notes", { experienceId, content });
      loadData();
    } catch {
      showToast("Couldn't save that note", "error");
    }
  }

  function handleTapExperience(id: string) {
    navigate(`/plan?exp=${id}`);
  }

  function handleAskScout(name: string) {
    window.dispatchEvent(new CustomEvent("wander-open-chat", {
      detail: { prefill: `Tell me about ${name}` },
    }));
  }

  // Date range display
  const dateRange = useMemo(() => {
    if (!city) return "";
    if (city.arrivalDate && city.departureDate) {
      const arr = new Date(city.arrivalDate);
      const dep = new Date(city.departureDate);
      const days = Math.round((dep.getTime() - arr.getTime()) / 86400000) + 1;
      return `${arr.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} \u2013 ${dep.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} \u00B7 ${days} days`;
    }
    // Count days for this city
    const cityDays = trip?.days?.filter(d => d.cityId === cityId) || [];
    if (cityDays.length > 0) return `${cityDays.length} days`;
    return "";
  }, [city, trip, cityId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#faf8f5]">
        <p className="text-sm text-[#a89880]">Getting the board ready...</p>
      </div>
    );
  }

  if (!city) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#faf8f5]">
        <p className="text-sm text-[#a89880]">Couldn't find that city — try heading back</p>
      </div>
    );
  }

  const totalReactions = Object.values(reactions).reduce(
    (sum, groups) => sum + groups.reduce((s, g) => s + g.count, 0), 0
  );

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-20">
      {/* City photo header */}
      <div className="relative h-48 bg-[#3a3128] overflow-hidden">
        {cityPhotoUrl && (
          <img
            src={cityPhotoUrl}
            alt={city.name}
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h1 className="text-2xl font-light text-white">{city.name}</h1>
          {dateRange && (
            <p className="text-sm text-white/80 mt-0.5">{dateRange}</p>
          )}
          {accommodations.length > 0 && (
            <p className="text-xs text-white/60 mt-0.5">
              Staying at {accommodations[0].name}
              {accommodations[0].address && ` \u00B7 ${accommodations[0].address}`}
            </p>
          )}
        </div>
        {/* Back button */}
        <button
          onClick={() => navigate("/")}
          className="absolute top-4 left-4 text-white/80 hover:text-white text-sm"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          &larr; Back
        </button>
      </div>

      {/* Stats bar */}
      <div className="px-4 py-2 bg-white border-b border-[#f0ece5] flex items-center gap-4 text-xs text-[#a89880]">
        <span>{experiences.length} ideas</span>
        {totalReactions > 0 && <span>{totalReactions} reactions</span>}
        {experiences.filter(e => e.state === "selected").length > 0 && (
          <span>{experiences.filter(e => e.state === "selected").length} scheduled</span>
        )}
      </div>

      {/* Scout suggestions */}
      {scoutSuggestions.length > 0 && (
        <div className="px-4 pt-3 space-y-2">
          {scoutSuggestions.map(s => (
            <ScoutNudge
              key={s.key}
              nudgeKey={s.key}
              message={s.message}
              tapLabel={s.actionLabel}
              onTap={s.actionLabel ? () => {
                window.dispatchEvent(new CustomEvent("wander-open-chat", {
                  detail: { prefill: s.message },
                }));
              } : undefined}
            />
          ))}
        </div>
      )}

      {/* Theme groups */}
      <div className="px-4 py-4 space-y-6">
        {themeGroups.map(([theme, exps]) => {
          const meta = THEME_META[theme] || THEME_META.other;
          return (
            <div key={theme}>
              <h2 className="text-sm font-medium text-[#3a3128] flex items-center gap-1.5 mb-2">
                <span>{meta.emoji}</span>
                <span>{meta.label}</span>
                <span className="text-xs text-[#c8bba8] font-normal ml-1">{exps.length}</span>
              </h2>
              <div className="space-y-2">
                {exps.map(exp => (
                  <IdeaCard
                    key={exp.id}
                    exp={exp}
                    reactions={reactions[exp.id] || []}
                    notes={notes[exp.id] || []}
                    onReact={handleReact}
                    onAddNote={handleAddNote}
                    onTap={handleTapExperience}
                    onAskScout={handleAskScout}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {experiences.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-[#a89880]">No ideas saved for {city.name} yet</p>
            <p className="text-xs text-[#c8bba8] mt-1">Add some from a recommendation, or ask Scout</p>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="sticky bottom-0 bg-white border-t border-[#f0ece5] px-4 py-3 flex gap-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        <button
          onClick={() => navigate(`/plan?city=${cityId}`)}
          className="flex-1 py-2 rounded-lg bg-[#514636] text-white text-sm font-medium
                     hover:bg-[#3a3128] transition-colors"
        >
          Add an idea
        </button>
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("wander-open-chat", {
              detail: { prefill: `What should we do in ${city.name}?` },
            }));
          }}
          className="flex-1 py-2 rounded-lg bg-[#f0ece5] text-[#514636] text-sm font-medium
                     hover:bg-[#e0d8cc] transition-colors"
        >
          Ask Scout
        </button>
      </div>
    </div>
  );
}
