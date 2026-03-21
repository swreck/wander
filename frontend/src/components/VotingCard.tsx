import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import type { VotingSession } from "../lib/types";

interface Props {
  tripId: string;
}

export default function VotingCard({ tripId }: Props) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<VotingSession[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [optionIndex, setOptionIndex] = useState(0);
  const [voted, setVoted] = useState<Record<string, Record<number, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<VotingSession[]>(`/voting/trip/${tripId}`).then(setSessions).catch(() => {});
  }, [tripId]);

  if (sessions.length === 0) return null;

  const session = sessions[currentIndex];
  if (!session) return null;

  const options = session.options || [];
  const currentOption = options[optionIndex];
  const sessionVotes = voted[session.id] || {};
  const allVoted = Object.keys(sessionVotes).length === options.length;

  async function castVote(preference: "yes" | "maybe" | "no") {
    const newVoted = {
      ...voted,
      [session.id]: { ...sessionVotes, [optionIndex]: preference },
    };
    setVoted(newVoted);

    // Move to next option or submit
    if (optionIndex < options.length - 1) {
      setOptionIndex(optionIndex + 1);
    } else {
      // Submit all votes
      setSubmitting(true);
      const votes = Object.entries(newVoted[session.id]).map(([idx, pref]) => ({
        optionIndex: parseInt(idx),
        preference: pref,
      }));
      try {
        await api.post(`/voting/${session.id}/vote`, { votes });
      } catch { /* ignore */ }
      setSubmitting(false);

      // Move to next session if available
      if (currentIndex < sessions.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setOptionIndex(0);
      }
    }
  }

  if (allVoted) {
    return (
      <div className="p-4 bg-white rounded-xl border border-[#e0d8cc]">
        <div className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">Vote</div>
        <p className="text-sm text-[#3a3128] font-medium">{session.question}</p>
        <div className="mt-3 space-y-1.5">
          {options.map((opt, i) => {
            const pref = sessionVotes[i];
            return (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-[#6b5d4a]">{opt.name}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  pref === "yes" ? "bg-green-100 text-green-700" :
                  pref === "maybe" ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {pref}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-[#c8bba8]">
          {submitting ? "Submitting..." : "Votes recorded"}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-xl border border-[#e0d8cc]">
      <div className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">Vote</div>
      <p className="text-sm text-[#3a3128] font-medium mb-1">{session.question}</p>
      <p className="text-xs text-[#c8bba8] mb-3">{optionIndex + 1} of {options.length}</p>

      <div className="text-center py-4">
        <p className="text-lg font-medium text-[#3a3128]">{currentOption?.name}</p>
        {currentOption?.description && (
          <p className="text-sm text-[#8a7a62] mt-1">{currentOption.description}</p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => castVote("no")}
          className="flex-1 py-2.5 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50 transition-colors"
        >
          No
        </button>
        <button
          onClick={() => castVote("maybe")}
          className="flex-1 py-2.5 rounded-lg border border-amber-200 text-sm text-amber-600 hover:bg-amber-50 transition-colors"
        >
          Maybe
        </button>
        <button
          onClick={() => castVote("yes")}
          className="flex-1 py-2.5 rounded-lg bg-[#514636] text-white text-sm font-medium hover:bg-[#3a3128] transition-colors"
        >
          Yes
        </button>
      </div>
    </div>
  );
}
