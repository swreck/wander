/**
 * useScoutSuggestions — Fetches contextual Scout suggestions for the current view.
 *
 * Returns dismissable suggestions. Fetched once on mount, cached in state.
 */

import { useState, useEffect } from "react";
import { api } from "../lib/api";

interface ScoutSuggestion {
  key: string;
  message: string;
  actionLabel?: string;
  actionTarget?: string;
}

export default function useScoutSuggestions(opts: {
  tripId: string | undefined;
  context: "city" | "day" | "dashboard" | "now";
  cityId?: string;
  dayId?: string;
}) {
  const [suggestions, setSuggestions] = useState<ScoutSuggestion[]>([]);

  useEffect(() => {
    if (!opts.tripId) return;

    api.post<{ suggestions: ScoutSuggestion[] }>("/scout/suggestions", {
      tripId: opts.tripId,
      context: opts.context,
      cityId: opts.cityId,
      dayId: opts.dayId,
    })
      .then(res => setSuggestions(res?.suggestions || []))
      .catch(() => {});
  }, [opts.tripId, opts.context, opts.cityId, opts.dayId]);

  return suggestions;
}
