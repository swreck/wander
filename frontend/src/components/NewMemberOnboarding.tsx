import { useState, useCallback } from "react";

const INTEREST_OPTIONS = [
  { id: "food", emoji: "\u{1F35C}", label: "Food & dining" },
  { id: "nature", emoji: "\u{1F33F}", label: "Nature & parks" },
  { id: "art", emoji: "\u{1F3A8}", label: "Art & museums" },
  { id: "history", emoji: "\u{1F3DB}\uFE0F", label: "History & culture" },
  { id: "nightlife", emoji: "\u{1F319}", label: "Nightlife" },
  { id: "shopping", emoji: "\u{1F6CD}\uFE0F", label: "Shopping" },
  { id: "ceramics", emoji: "\u{1F3FA}", label: "Ceramics & crafts" },
  { id: "temples", emoji: "\u26E9\uFE0F", label: "Temples & shrines" },
  { id: "architecture", emoji: "\u{1F3D7}\uFE0F", label: "Architecture" },
];

const STORAGE_KEY_SNOOZED = "wander:onboarding-snoozed-until";
const STORAGE_KEY_COMPLETED = "wander:onboarding-completed";

/**
 * Check whether the onboarding should show.
 * Returns true if: not completed AND (never snoozed OR snooze has expired).
 */
export function shouldShowOnboarding(): boolean {
  if (localStorage.getItem(STORAGE_KEY_COMPLETED) === "1") return false;

  const snoozedUntil = localStorage.getItem(STORAGE_KEY_SNOOZED);
  if (snoozedUntil) {
    const snoozedMs = parseInt(snoozedUntil, 10);
    if (Date.now() < snoozedMs) return false; // Still snoozed
  }

  return true;
}

/** Mark onboarding as completed (won't show again). */
export function markOnboardingComplete() {
  localStorage.setItem(STORAGE_KEY_COMPLETED, "1");
  localStorage.removeItem(STORAGE_KEY_SNOOZED);
}

/** Snooze onboarding for 24 hours. */
export function snoozeOnboarding() {
  const twentyFourHours = 24 * 60 * 60 * 1000;
  localStorage.setItem(STORAGE_KEY_SNOOZED, String(Date.now() + twentyFourHours));
}

interface NewMemberOnboardingProps {
  tripName: string;
  displayName: string;
  travelerId: string;
  onComplete: () => void;
}

export default function NewMemberOnboarding({
  tripName,
  displayName,
  travelerId,
  onComplete,
}: NewMemberOnboardingProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const token = localStorage.getItem("wander:token") || localStorage.getItem("wander_token");
      await fetch(`/api/auth/travelers/${travelerId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          preferences: { interests: [...selected] },
        }),
      });
    } catch {
      // Non-blocking — preferences are optional
    } finally {
      setSaving(false);
      markOnboardingComplete();
      onComplete();
    }
  }

  function handleSkip() {
    markOnboardingComplete();
    onComplete();
  }

  function handleRemindLater() {
    snoozeOnboarding();
    onComplete();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-[#faf8f5] rounded-2xl max-w-sm w-full p-6 shadow-xl">
        <h2 className="text-xl font-light text-[#3a3128] mb-1">
          Welcome to {tripName}!
        </h2>
        <p className="text-sm text-[#8a7a62] mb-6">
          Scout is your travel companion &mdash; here to help you explore, plan, and keep track of everything along the way.
        </p>

        <p className="text-sm text-[#6b5d4a] mb-3">
          What draws you to a place? (Helps Scout make better suggestions)
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {INTEREST_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => toggle(opt.id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                selected.has(opt.id)
                  ? "bg-[#514636] text-white border-[#514636]"
                  : "bg-white text-[#6b5d4a] border-[#e5ddd0] hover:border-[#a89880]"
              }`}
            >
              {opt.emoji} {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <button
            onClick={handleSave}
            disabled={saving || selected.size === 0}
            className="w-full py-2.5 bg-[#514636] text-white rounded-xl text-sm font-medium hover:bg-[#3a3128] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "That's me"}
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleRemindLater}
              className="flex-1 py-2 text-sm text-[#8a7a62] hover:text-[#3a3128] transition-colors"
            >
              Remind me later
            </button>
            <button
              onClick={handleSkip}
              className="flex-1 py-2 text-sm text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
            >
              Skip for now
            </button>
          </div>
        </div>

        <p className="text-xs text-[#c8bba8] text-center mt-4">
          You can always update this in Settings
        </p>
      </div>
    </div>
  );
}
