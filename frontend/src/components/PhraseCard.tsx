import { useState, useEffect, useCallback, useRef } from "react";

interface Phrase {
  english: string;
  romaji: string;
}

const DEFAULT_PHRASES: Phrase[] = [
  { english: "Hello", romaji: "Konnichiwa" },
  { english: "Thank you", romaji: "Arigatou gozaimasu" },
  { english: "Yes please", romaji: "Hai, onegaishimasu" },
  { english: "No thank you", romaji: "Iie, kekkou desu" },
  { english: "How much?", romaji: "Ikura desu ka?" },
  { english: "Excuse me", romaji: "Sumimasen" },
  { english: "Check please", romaji: "Okaikei onegaishimasu" },
];

const STORAGE_KEY = "wander:phrases";

function loadPhrases(): Phrase[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return DEFAULT_PHRASES;
}

function savePhrases(phrases: Phrase[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(phrases)); } catch { /* ignore */ }
}

export default function PhraseCard() {
  const [open, setOpen] = useState(false);
  const [phrases, setPhrases] = useState<Phrase[]>(loadPhrases);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist on change
  useEffect(() => { savePhrases(phrases); }, [phrases]);

  const handleRemove = useCallback((idx: number) => {
    setPhrases((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleMoveUp = useCallback((idx: number) => {
    if (idx === 0) return;
    setPhrases((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((idx: number) => {
    setPhrases((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setPhrases(DEFAULT_PHRASES);
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed z-40 flex items-center justify-center rounded-full shadow-md transition-all hover:scale-105 active:scale-95
          left-4 w-9 h-9 bg-[#f0ece5] text-[#6b5d4a] border border-[#e0d8cc]"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 140px)" }}
        aria-label="Japanese phrases"
      >
        <span className="text-base font-bold leading-none" style={{ fontFamily: "serif" }}>日</span>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setOpen(false)} />

      {/* Panel */}
      <div
        className="fixed z-50 inset-x-0 bottom-0 bg-[#faf8f5] rounded-t-2xl shadow-2xl border-t border-[#e5ddd0] flex flex-col"
        style={{
          maxHeight: "50vh",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          touchAction: "none",
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
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-2 space-y-1"
          style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
        >
          {phrases.length === 0 ? (
            <div className="text-sm text-[#a89880] text-center py-4">
              No phrases. <button onClick={handleReset} className="underline">Restore defaults</button>
            </div>
          ) : (
            phrases.map((p, i) => (
              <div
                key={`${p.english}-${p.romaji}-${i}`}
                className="flex items-center gap-2 py-2 rounded-lg"
              >
                {/* Grip handle + reorder */}
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
                    disabled={i === phrases.length - 1}
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
                  <div className="text-base font-medium text-[#3a3128]">{p.romaji}</div>
                  <div className="text-xs text-[#8a7a62]">{p.english}</div>
                </div>

                {/* Remove button */}
                <button
                  onClick={() => handleRemove(i)}
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
      </div>
    </>
  );
}
