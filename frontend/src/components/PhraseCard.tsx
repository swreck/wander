import { useState } from "react";

const PHRASES = [
  { english: "Hello", romaji: "Konnichiwa" },
  { english: "Thank you", romaji: "Arigatou gozaimasu" },
  { english: "Yes please", romaji: "Hai, onegaishimasu" },
  { english: "No thank you", romaji: "Iie, kekkou desu" },
  { english: "How much?", romaji: "Ikura desu ka?" },
  { english: "Excuse me", romaji: "Sumimasen" },
  { english: "Check please", romaji: "Okaikei onegaishimasu" },
];

export default function PhraseCard() {
  const [open, setOpen] = useState(false);

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
      <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setOpen(false)} />
      <div className="fixed z-50 inset-x-0 bottom-0 max-h-[50vh] bg-[#faf8f5] rounded-t-2xl shadow-2xl border-t border-[#e5ddd0]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5ddd0]">
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
        <div className="px-4 py-3 space-y-3 overflow-y-auto">
          {PHRASES.map((p, i) => (
            <div key={i} className="flex items-baseline justify-between">
              <span className="text-sm text-[#8a7a62]">{p.english}</span>
              <span className="text-base font-medium text-[#3a3128]">{p.romaji}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
