import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";

interface Phrase {
  id: string;
  english: string;
  romaji: string;
  addedBy: string;
}

const PRONUNCIATIONS: Record<string, string> = {
  "Konnichiwa": "Koh-nee-chee-wah",
  "Arigatou gozaimasu": "Ah-ree-gah-toh go-zah-ee-mahs",
  "Hai, onegaishimasu": "Hai, oh-neh-guy-shee-mahs",
  "Iie, kekkou desu": "Ee-eh, kek-koh dess",
  "Ikura desu ka?": "Ee-koo-rah dess kah?",
  "Sumimasen": "Sue-mee-mah-sen",
  "Okaikei onegaishimasu": "Oh-kai-keh oh-neh-guy-shee-mahs",
};

const DEFAULT_PHRASES: Omit<Phrase, "id" | "addedBy">[] = [
  { english: "Hello", romaji: "Konnichiwa" },
  { english: "Thank you", romaji: "Arigatou gozaimasu" },
  { english: "Yes please", romaji: "Hai, onegaishimasu" },
  { english: "No thank you", romaji: "Iie, kekkou desu" },
  { english: "How much?", romaji: "Ikura desu ka?" },
  { english: "Excuse me", romaji: "Sumimasen" },
  { english: "Check please", romaji: "Okaikei onegaishimasu" },
];

const ORDER_KEY = "wander:phrase-order";  // local ordering
const HIDDEN_KEY = "wander:phrase-hidden"; // local removals

function getLocalOrder(): string[] {
  try {
    const saved = localStorage.getItem(ORDER_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}
function setLocalOrder(order: string[]) {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch {}
}
function getHiddenIds(): Set<string> {
  try {
    const saved = localStorage.getItem(HIDDEN_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch { return new Set(); }
}
function setHiddenIds(ids: Set<string>) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids])); } catch {}
}

export default function PhraseCard() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [sharedPhrases, setSharedPhrases] = useState<Phrase[]>([]);
  const [localOrder, setLocalOrderState] = useState<string[]>(getLocalOrder);
  const [hiddenIds, setHiddenIdsState] = useState<Set<string>>(getHiddenIds);
  const [tripId, setTripId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get active trip (only when logged in)
  useEffect(() => {
    if (!user) return;
    api.get<any>("/trips/active").then((t) => {
      if (t?.id) setTripId(t.id);
    }).catch(() => {});
  }, [user]);

  // Fetch shared phrases when panel opens
  useEffect(() => {
    if (!open || !tripId) return;
    api.get<Phrase[]>(`/phrases/trip/${tripId}`).then((data) => {
      setSharedPhrases(data);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [open, tripId]);

  // Listen for chat-driven data changes (new phrase added via AI)
  useEffect(() => {
    const handler = () => {
      if (tripId) {
        api.get<Phrase[]>(`/phrases/trip/${tripId}`).then(setSharedPhrases).catch(() => {});
      }
    };
    window.addEventListener("wander:data-changed", handler);
    return () => window.removeEventListener("wander:data-changed", handler);
  }, [tripId]);

  // Build visible, ordered list
  const visiblePhrases = (() => {
    const visible = sharedPhrases.filter((p) => !hiddenIds.has(p.id));

    // Apply local order: known IDs in saved order first, then any new ones at the end
    if (localOrder.length === 0) return visible;

    const byId = new Map(visible.map((p) => [p.id, p]));
    const ordered: Phrase[] = [];
    for (const id of localOrder) {
      const p = byId.get(id);
      if (p) {
        ordered.push(p);
        byId.delete(id);
      }
    }
    // Append any new phrases (not yet in local order) at the bottom
    for (const p of byId.values()) {
      ordered.push(p);
    }
    return ordered;
  })();

  // Use defaults if no shared phrases exist yet
  const showDefaults = loaded && sharedPhrases.length === 0;

  const handleHide = useCallback((id: string) => {
    setHiddenIdsState((prev) => {
      const next = new Set(prev);
      next.add(id);
      setHiddenIds(next);
      return next;
    });
  }, []);

  const handleMoveUp = useCallback((idx: number) => {
    if (idx === 0) return;
    const ids = visiblePhrases.map((p) => p.id);
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    setLocalOrderState(ids);
    setLocalOrder(ids);
  }, [visiblePhrases]);

  const handleMoveDown = useCallback((idx: number) => {
    const ids = visiblePhrases.map((p) => p.id);
    if (idx >= ids.length - 1) return;
    [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    setLocalOrderState(ids);
    setLocalOrder(ids);
  }, [visiblePhrases]);

  if (!user || location.pathname === "/login") return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed z-30 flex items-center justify-center rounded-full shadow-md transition-all hover:scale-105 active:scale-95
          left-4 w-9 h-9 bg-[#f0ece5] text-[#6b5d4a] border border-[#e0d8cc]"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 140px)" }}
        aria-label="Japanese phrases"
      >
        <span className="text-base font-bold leading-none" style={{ fontFamily: "serif" }}>日</span>
      </button>
    );
  }

  // Render defaults (no backend phrases yet — e.g. before anyone seeds them)
  const defaultList = showDefaults ? DEFAULT_PHRASES : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setOpen(false)} />
      <div
        className="fixed z-40 left-1/2 -translate-x-1/2 bottom-0 bg-[#faf8f5] rounded-t-2xl shadow-2xl border border-b-0 border-[#e5ddd0] flex flex-col"
        style={{
          maxHeight: "50vh",
          maxWidth: "340px",
          width: "auto",
          minWidth: "280px",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5ddd0] shrink-0">
          <span className="text-sm font-medium text-[#3a3128]">Quick Phrases</span>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-[#8a7a62] hover:bg-[#f0ebe3]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* Scrollable phrase list */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-2 space-y-1 min-h-0"
          style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
        >
          {defaultList ? (
            // Show hardcoded defaults before anyone adds shared phrases
            defaultList.map((p, i) => (
              <div key={i} className="flex items-center gap-2 py-2">
                <div className="w-6 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-base font-medium text-[#3a3128]">
                    {p.romaji}
                    {PRONUNCIATIONS[p.romaji] && (
                      <span className="text-xs font-normal text-[#a89880] ml-1.5">({PRONUNCIATIONS[p.romaji]})</span>
                    )}
                  </div>
                  <div className="text-xs text-[#8a7a62]">{p.english}</div>
                </div>
              </div>
            ))
          ) : visiblePhrases.length === 0 ? (
            <div className="text-sm text-[#a89880] text-center py-4">
              All phrases hidden. Ask the AI to add new ones.
            </div>
          ) : (
            visiblePhrases.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2 py-2">
                {/* Reorder arrows */}
                <div className="flex flex-col items-center shrink-0 gap-0.5">
                  <button
                    onClick={() => handleMoveUp(i)}
                    disabled={i === 0}
                    className="text-[#c8bba8] disabled:opacity-30 active:text-[#6b5d4a] p-0.5"
                    aria-label="Move up"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 15l-6-6-6 6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMoveDown(i)}
                    disabled={i === visiblePhrases.length - 1}
                    className="text-[#c8bba8] disabled:opacity-30 active:text-[#6b5d4a] p-0.5"
                    aria-label="Move down"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </div>

                {/* Phrase content */}
                <div className="flex-1 min-w-0">
                  <div className="text-base font-medium text-[#3a3128]">
                    {p.romaji}
                    {PRONUNCIATIONS[p.romaji] && (
                      <span className="text-xs font-normal text-[#a89880] ml-1.5">({PRONUNCIATIONS[p.romaji]})</span>
                    )}
                  </div>
                  <div className="text-xs text-[#8a7a62]">{p.english}</div>
                </div>

                {/* Hide (local removal) */}
                <button
                  onClick={() => handleHide(p.id)}
                  className="shrink-0 p-1.5 text-[#c8bba8] hover:text-red-400 active:text-red-500 transition-colors"
                  aria-label={`Remove "${p.english}"`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Tip */}
        <div className="px-4 py-2 border-t border-[#f0ece5] shrink-0">
          <p className="text-xs text-[#a89880] text-center">
            Ask the AI to add phrases — they'll appear for everyone
          </p>
        </div>
      </div>
    </>
  );
}
