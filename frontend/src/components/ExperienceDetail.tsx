import { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { Experience, Trip, Day } from "../lib/types";
import RatingsBadge from "./RatingsBadge";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { getNudgeForExperience } from "../lib/travelerProfiles";
import CulturalNotes from "./CulturalNotes";

interface Props {
  experienceId: string;
  trip: Trip;
  days: Day[];
  onClose: () => void;
  onPromote: (expId: string, dayId: string, routeSegmentId?: string, timeWindow?: string) => void;
  onDemote: (expId: string) => void;
  onDelete: (expId: string) => void;
  onRefresh: () => void;
}

export default function ExperienceDetail({
  experienceId, trip, days, onClose, onPromote, onDemote, onDelete, onRefresh,
}: Props) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [exp, setExp] = useState<Experience | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPromote, setShowPromote] = useState(false);

  useEffect(() => {
    api.get<Experience>(`/experiences/${experienceId}`).then((e) => {
      setExp(e);
      setEditName(e.name);
      setEditDesc(e.description || "");
      setEditNotes(e.userNotes || "");
    });
  }, [experienceId]);

  async function handleSave() {
    if (!exp) return;
    try {
      await api.patch(`/experiences/${exp.id}`, {
        name: editName,
        description: editDesc || null,
        userNotes: editNotes || null,
      });
      setEditing(false);
      showToast("Changes saved");
      onRefresh();
      const updated = await api.get<Experience>(`/experiences/${experienceId}`);
      setExp(updated);
    } catch {
      showToast("Couldn't save changes", "error");
    }
  }

  async function handleGeocode() {
    if (!exp) return;
    try {
      const result = await api.post<any>(`/geocoding/experience/${exp.id}`, {});
      const updated = await api.get<Experience>(`/experiences/${experienceId}`);
      setExp(updated);
      onRefresh();
      if (updated.locationStatus === "confirmed") {
        showToast("Location confirmed");
      } else if (result?.confidence === "low") {
        showToast("Location found — needs review", "info");
      } else {
        showToast("No location match found", "info");
      }
    } catch {
      showToast("Location search failed", "error");
    }
  }

  async function handleRefreshRatings() {
    if (!exp) return;
    try {
      await api.post(`/geocoding/experience/${exp.id}`, {});
      const updated = await api.get<Experience>(`/experiences/${experienceId}`);
      setExp(updated);
      showToast("Ratings updated");
    } catch {
      showToast("Couldn't refresh ratings", "error");
    }
  }

  if (!exp) {
    return (
      <div className="fixed inset-0 md:inset-y-0 md:left-auto md:right-0 md:w-96 bg-white border-l border-[#f0ece5] shadow-xl z-40
                      flex items-center justify-center text-[#8a7a62]">
        Loading...
      </div>
    );
  }

  return (
    <div className="fixed inset-0 md:inset-y-0 md:left-auto md:right-0 md:w-96 bg-white md:border-l border-[#f0ece5] shadow-xl z-40
                    overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-[#f0ece5] px-4 py-3 flex items-center justify-between z-10"
           style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
        <button
          onClick={onClose}
          className="text-sm text-[#8a7a62] hover:text-[#3a3128]"
        >
          &larr; Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(!editing)}
            className="text-sm text-[#8a7a62] hover:text-[#3a3128]"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Hero image or map snippet */}
        {exp.cloudinaryImageId ? (
          <img
            src={`https://res.cloudinary.com/dkqmgwila/image/upload/w_400,h_250,c_fill/${exp.cloudinaryImageId}`}
            alt={exp.name}
            className="w-full h-48 object-cover rounded-lg"
          />
        ) : exp.latitude != null && exp.longitude != null ? (
          <img
            src={buildDetailMapUrl(exp.latitude, exp.longitude)}
            alt={`Map of ${exp.name}`}
            className="w-full h-36 object-cover rounded-lg bg-[#f0ece5]"
          />
        ) : (
          <div className="w-full h-24 bg-[#f0ece5] rounded-lg flex items-center justify-center">
            <span className="text-lg text-[#c8bba8]">{exp.name.charAt(0)}</span>
          </div>
        )}

        {/* Action bar — external app handoffs */}
        {!editing && (
          <div className="flex gap-3">
            {exp.latitude != null && exp.longitude != null && (
              <a
                href={`https://maps.apple.com/?ll=${exp.latitude},${exp.longitude}&q=${encodeURIComponent(exp.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f0ece5] text-sm text-[#514636] hover:bg-[#e0d8cc] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                Map
              </a>
            )}
            {exp.sourceUrl && (
              <a
                href={exp.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f0ece5] text-sm text-[#514636] hover:bg-[#e0d8cc] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                </svg>
                Website
              </a>
            )}
            <a
              href={exp.placeIdGoogle
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(exp.name)}&query_place_id=${exp.placeIdGoogle}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(exp.name + (exp.city?.name ? ` ${exp.city.name}` : ""))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f0ece5] text-sm text-[#514636] hover:bg-[#e0d8cc] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Google
            </a>
            {typeof navigator !== "undefined" && navigator.share && (
              <button
                onClick={() => {
                  const text = [
                    exp.name,
                    exp.city?.name,
                    exp.latitude != null && exp.longitude != null ? `https://maps.apple.com/?ll=${exp.latitude},${exp.longitude}` : null,
                  ].filter(Boolean).join("\n");
                  navigator.share({ text }).catch(() => {});
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f0ece5] text-sm text-[#514636] hover:bg-[#e0d8cc] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Share
              </button>
            )}
          </div>
        )}

        {/* Name & city */}
        {editing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full px-3 py-2 rounded border border-[#e0d8cc] text-lg text-[#3a3128]
                       focus:outline-none focus:ring-2 focus:ring-[#a89880]"
          />
        ) : (
          <h2 className="text-lg font-medium text-[#3a3128]">{exp.name}</h2>
        )}

        <div className="flex items-center gap-2 text-sm text-[#8a7a62] flex-wrap">
          <span>{exp.city?.name}</span>
          {exp.themes.map((t) => (
            <span key={t} className="px-2 py-0.5 bg-[#f0ece5] rounded-full capitalize">{t}</span>
          ))}
        </div>

        {/* Location status */}
        <div className="flex items-center gap-2">
          {exp.locationStatus === "confirmed" ? (
            <span className="text-xs text-green-600">Location confirmed</span>
          ) : exp.locationStatus === "pending" ? (
            <span className="text-sm text-amber-600">Location pending review</span>
          ) : (
            <button
              onClick={handleGeocode}
              className="text-sm text-[#a89880] hover:text-[#514636] transition-colors"
            >
              Find location
            </button>
          )}
        </div>

        {/* Personalized nudge — shown if this experience matches the user's interests */}
        {(() => {
          if (!user || !exp) return null;
          const nudge = getNudgeForExperience(user.displayName, exp.name, exp.themes || []);
          if (!nudge) return null;
          return (
            <div className="px-3 py-2.5 bg-[#f0ece5] rounded-lg text-sm text-[#6b5d4a] italic border-l-3 border-[#a89880]">
              {nudge}
            </div>
          );
        })()}

        {/* Personal notes — prominent, above description */}
        {editing ? (
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            rows={2}
            placeholder="Notes..."
            className="w-full px-3 py-2 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                       placeholder-[#c8bba8] focus:outline-none focus:ring-2 focus:ring-[#a89880] resize-y"
          />
        ) : (
          exp.userNotes && (
            <div className="px-3 py-2.5 bg-[#f5f0e8] rounded-lg text-sm text-[#514636] italic">
              {exp.userNotes}
            </div>
          )
        )}

        {/* Description */}
        {editing ? (
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                       focus:outline-none focus:ring-2 focus:ring-[#a89880] resize-y"
          />
        ) : (
          exp.description && (
            <p className="text-sm text-[#6b5d4a] leading-relaxed">{exp.description}</p>
          )
        )}

        {/* Ratings */}
        <RatingsBadge ratings={exp.ratings} placeIdGoogle={exp.placeIdGoogle} />
        <button
          onClick={handleRefreshRatings}
          className="text-sm text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
        >
          Update location & ratings
        </button>

        {/* Cultural context — etiquette, timing, practical tips */}
        <CulturalNotes
          experienceId={exp.id}
          cachedNotes={exp.culturalNotes}
        />

        {/* Source + attribution */}
        <div className="flex items-center justify-between text-sm text-[#a89880]">
          {exp.sourceUrl ? (
            <a
              href={exp.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#514636] underline truncate max-w-[60%]"
            >
              From: {extractDomain(exp.sourceUrl)}
            </a>
          ) : <span />}
          <span className="text-[#c8bba8]">
            {exp.createdBy && `${exp.createdBy} · `}
            {new Date(exp.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>

        {editing && (
          <button
            onClick={handleSave}
            className="w-full py-2 rounded-lg bg-[#514636] text-white text-sm font-medium
                       hover:bg-[#3a3128] transition-colors"
          >
            Save Changes
          </button>
        )}

        {/* Action buttons */}
        <div className="space-y-2 pt-2 border-t border-[#f0ece5]">
          {exp.state === "possible" ? (
            <>
              <button
                onClick={() => setShowPromote(!showPromote)}
                className="w-full py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium
                           hover:bg-[#3a3128] transition-colors"
              >
                Add to Itinerary
              </button>
              {showPromote && (
                <div className="p-2 bg-[#faf8f5] rounded-lg border border-[#e0d8cc]">
                  <div className="text-sm text-[#a89880] mb-1.5 uppercase tracking-wider">Tap a day to add</div>
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {days.map((d) => {
                      const isMatchCity = exp ? d.cityId === exp.cityId : false;
                      const shortDate = new Date(d.date).toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
                      const cityAbbr = d.city.name.slice(0, 3).toUpperCase();
                      return (
                        <button
                          key={d.id}
                          onClick={() => { onPromote(exp!.id, d.id); onClose(); }}
                          className={`flex flex-col items-center px-2.5 py-2 rounded text-xs shrink-0 transition-colors ${
                            isMatchCity
                              ? "bg-[#514636] text-white hover:bg-[#3a3128]"
                              : "bg-white text-[#8a7a62] border border-[#e0d8cc] hover:bg-[#f0ece5]"
                          }`}
                        >
                          <span className="font-medium">{shortDate}</span>
                          <span className={isMatchCity ? "opacity-70" : "text-[#c8bba8]"}>{cityAbbr}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <button
              onClick={() => { onDemote(exp.id); onClose(); }}
              className="w-full py-2.5 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a]
                         hover:bg-[#f0ece5] transition-colors"
            >
              Move to Candidates
            </button>
          )}

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl">
              <p className="text-sm text-[#3a3128] mb-4">
                Are you sure you want to delete <strong>{exp.name}</strong>? This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { onDelete(exp.id); }}
                  className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-medium
                             hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a]
                             hover:bg-[#f0ece5] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function buildDetailMapUrl(lat: number, lng: number): string {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return "";
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=400x200&scale=2&maptype=roadmap&style=feature:all|saturation:-50&markers=color:0x514636|${lat},${lng}&key=${apiKey}`;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
