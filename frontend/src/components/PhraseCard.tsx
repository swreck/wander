import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";

// ── Country phrase data ────────────────────────────────────────
interface LocalPhrase {
  english: string;
  local: string;
  pronunciation: string;
}

interface CountryPhrases {
  country: string;
  language: string;
  icon: string; // single character for the button
  phrases: LocalPhrase[];
}

const COUNTRY_PHRASES: Record<string, CountryPhrases> = {
  japan: {
    country: "Japan",
    language: "Japanese",
    icon: "日",
    phrases: [
      { english: "Hello", local: "Konnichiwa", pronunciation: "Koh-nee-chee-wah" },
      { english: "Thank you", local: "Arigatou gozaimasu", pronunciation: "Ah-ree-gah-toh go-zah-ee-mahs" },
      { english: "Yes please", local: "Hai, onegaishimasu", pronunciation: "Hai, oh-neh-guy-shee-mahs" },
      { english: "No thank you", local: "Iie, kekkou desu", pronunciation: "Ee-eh, kek-koh dess" },
      { english: "How much?", local: "Ikura desu ka?", pronunciation: "Ee-koo-rah dess kah?" },
      { english: "Excuse me", local: "Sumimasen", pronunciation: "Sue-mee-mah-sen" },
      { english: "Check please", local: "Okaikei onegaishimasu", pronunciation: "Oh-kai-keh oh-neh-guy-shee-mahs" },
    ],
  },
  vietnam: {
    country: "Vietnam",
    language: "Vietnamese",
    icon: "V",
    phrases: [
      { english: "Hello", local: "Xin chào", pronunciation: "Sin chow" },
      { english: "Thank you", local: "Cảm ơn", pronunciation: "Kahm uhn" },
      { english: "Yes", local: "Vâng / Dạ", pronunciation: "Vung / Yah" },
      { english: "No", local: "Không", pronunciation: "Kohm" },
      { english: "How much?", local: "Bao nhiêu?", pronunciation: "Bow nyew?" },
      { english: "Excuse me", local: "Xin lỗi", pronunciation: "Sin loy" },
      { english: "Delicious!", local: "Ngon quá!", pronunciation: "Ngon kwah!" },
    ],
  },
  cambodia: {
    country: "Cambodia",
    language: "Khmer",
    icon: "ក",
    phrases: [
      { english: "Hello", local: "Choum reap suor", pronunciation: "Joom reap soo-a" },
      { english: "Thank you", local: "Orkun", pronunciation: "Or-koon" },
      { english: "Yes", local: "Baat / Jaa", pronunciation: "Baht / Jah" },
      { english: "No", local: "Oteh", pronunciation: "Oh-teh" },
      { english: "How much?", local: "T'lay pon maan?", pronunciation: "T'lay pon mahn?" },
      { english: "Excuse me", local: "Som toh", pronunciation: "Som toe" },
      { english: "Delicious!", local: "Ch'ngain!", pronunciation: "Ch'ngine!" },
    ],
  },
  portugal: {
    country: "Portugal",
    language: "Portuguese",
    icon: "P",
    phrases: [
      { english: "Hello", local: "Olá", pronunciation: "Oh-lah" },
      { english: "Thank you", local: "Obrigado / Obrigada", pronunciation: "Oh-bree-gah-doo / dah" },
      { english: "Yes please", local: "Sim, por favor", pronunciation: "Seem, por fah-vor" },
      { english: "No thank you", local: "Não, obrigado", pronunciation: "Now, oh-bree-gah-doo" },
      { english: "How much?", local: "Quanto custa?", pronunciation: "Kwan-too koo-stah?" },
      { english: "Excuse me", local: "Com licença", pronunciation: "Kohm lee-sen-sah" },
      { english: "Check please", local: "A conta, por favor", pronunciation: "Ah kon-tah, por fah-vor" },
    ],
  },
};

// Map city/country names to phrase keys
function detectCountries(tripName: string, cities: { name: string; country?: string }[]): string[] {
  const found = new Set<string>();
  const text = [tripName, ...cities.map(c => c.country || ""), ...cities.map(c => c.name)].join(" ").toLowerCase();

  if (text.includes("japan") || text.includes("tokyo") || text.includes("kyoto") || text.includes("osaka")) found.add("japan");
  if (text.includes("vietnam") || text.includes("ho chi minh") || text.includes("hanoi") || text.includes("saigon") || text.includes("da nang")) found.add("vietnam");
  if (text.includes("cambodia") || text.includes("siem reap") || text.includes("phnom penh")) found.add("cambodia");
  if (text.includes("portugal") || text.includes("lisbon") || text.includes("porto")) found.add("portugal");

  return [...found];
}

// ── Component ──────────────────────────────────────────────────

export default function PhraseCard() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [tripCountries, setTripCountries] = useState<string[]>([]);
  const [activeCountry, setActiveCountry] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Detect trip countries
  useEffect(() => {
    if (!user) return;
    function loadTripCountries(tripId: string) {
      api.get<any>(`/trips/${tripId}`).then((t) => {
        const countries = detectCountries(t?.name || "", t?.cities || []);
        setTripCountries(countries);
        if (countries.length > 0 && !countries.includes(activeCountry)) {
          setActiveCountry(countries[0]);
        }
      }).catch(() => {});
    }
    const lastTripId = localStorage.getItem("wander:last-trip-id");
    if (lastTripId) loadTripCountries(lastTripId);
    else {
      api.get<any>("/trips/active").then((t) => {
        if (t?.id) loadTripCountries(t.id);
      }).catch(() => {});
    }
    const handleSwitch = () => {
      const id = localStorage.getItem("wander:last-trip-id");
      if (id) loadTripCountries(id);
    };
    window.addEventListener("wander:data-changed", handleSwitch);
    return () => window.removeEventListener("wander:data-changed", handleSwitch);
  }, [user]);

  if (!user || location.pathname === "/login") return null;
  if (tripCountries.length === 0) return null;

  const activePhrases = COUNTRY_PHRASES[activeCountry];
  if (!activePhrases) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed z-30 flex items-center justify-center rounded-full shadow-md transition-all hover:scale-105 active:scale-95
          left-4 w-9 h-9 bg-[#f0ece5] text-[#6b5d4a] border border-[#e0d8cc]"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 160px)" }}
        aria-label={`${activePhrases.language} phrases`}
      >
        <span className="text-base font-bold leading-none" style={{ fontFamily: "serif" }}>{activePhrases.icon}</span>
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setOpen(false)} />
      <div
        className="fixed z-40 left-1/2 -translate-x-1/2 bottom-0 bg-[#faf8f5] rounded-t-2xl shadow-2xl border border-b-0 border-[#e5ddd0] flex flex-col"
        style={{
          maxHeight: "50vh",
          maxWidth: "360px",
          width: "auto",
          minWidth: "300px",
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

        {/* Language tabs (only if multiple countries) */}
        {tripCountries.length > 1 && (
          <div className="flex gap-1 px-4 py-2 border-b border-[#e5ddd0] shrink-0">
            {tripCountries.map((key) => {
              const cp = COUNTRY_PHRASES[key];
              if (!cp) return null;
              return (
                <button
                  key={key}
                  onClick={() => setActiveCountry(key)}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    activeCountry === key
                      ? "bg-[#514636] text-white"
                      : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e5ddd0]"
                  }`}
                >
                  {cp.language}
                </button>
              );
            })}
          </div>
        )}

        {/* Phrase list */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-2 space-y-1 min-h-0"
          style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
        >
          {activePhrases.phrases.map((p, i) => (
            <div key={i} className="py-2.5">
              <div className="text-base font-medium text-[#3a3128]">
                {p.local}
                <span className="text-xs font-normal text-[#a89880] ml-1.5">({p.pronunciation})</span>
              </div>
              <div className="text-xs text-[#8a7a62]">{p.english}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
