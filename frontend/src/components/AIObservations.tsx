import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";

interface Props {
  /** Provide dayId OR cityId — one must be set */
  dayId?: string;
  cityId?: string;
}

interface ObservationsResponse {
  observations: string[];
}

export default function AIObservations({ dayId, cityId }: Props) {
  const [observations, setObservations] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef<string | null>(null);

  const contextKey = dayId ? `day:${dayId}` : cityId ? `city:${cityId}` : null;

  useEffect(() => {
    if (!contextKey) return;
    // Don't re-fetch for the same context
    if (fetchedRef.current === contextKey) return;

    fetchedRef.current = contextKey;
    setObservations([]);
    setDismissed(new Set());
    setError(null);
    setLoading(true);

    const endpoint = dayId
      ? `/observations/day/${dayId}`
      : `/observations/city/${cityId}`;

    api.post<ObservationsResponse>(endpoint, {})
      .then((data) => {
        setObservations(data.observations || []);
      })
      .catch((err) => {
        console.error("Failed to fetch observations:", err);
        setError("Could not load observations");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [contextKey, dayId, cityId]);

  function dismiss(index: number) {
    setDismissed((prev) => new Set(prev).add(index));
  }

  const visible = observations.filter((_, i) => !dismissed.has(i));

  if (!contextKey || (visible.length === 0 && !loading)) return null;

  return (
    <div className="mb-4">
      {loading && (
        <div className="px-3 py-2 rounded-lg bg-[#eef1f5] border border-[#d5dce6] text-xs text-[#6b7a8d]">
          Analyzing experiences...
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-lg bg-[#fef2f2] border border-[#fecaca] text-xs text-[#b91c1c]">
          {error}
        </div>
      )}

      {visible.length > 0 && (
        <div className="space-y-2">
          {observations.map((obs, i) => {
            if (dismissed.has(i)) return null;
            return (
              <div
                key={i}
                className="px-3 py-2.5 rounded-lg bg-[#eef1f5] border border-[#d5dce6]
                           flex items-start gap-2"
              >
                <p className="flex-1 text-sm text-[#4a5568] leading-relaxed">{obs}</p>
                <button
                  onClick={() => dismiss(i)}
                  className="text-[#9ca3af] hover:text-[#6b7280] text-sm leading-none
                             flex-shrink-0 mt-0.5"
                  aria-label="Dismiss observation"
                >
                  &times;
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
