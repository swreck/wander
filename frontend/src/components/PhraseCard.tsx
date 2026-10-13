import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import useBackToClose from "../hooks/useBackToClose";
import { screenShift } from "../lib/screenShift";

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
function detectCountries(tripName: string, cities: { name: string; country?: string | null }[]): string[] {
  const found = new Set<string>();
  const text = [tripName, ...cities.map(c => c.country || ""), ...cities.map(c => c.name)].join(" ").toLowerCase();

  if (text.includes("japan") || text.includes("tokyo") || text.includes("kyoto") || text.includes("osaka")) found.add("japan");
  if (text.includes("vietnam") || text.includes("ho chi minh") || text.includes("hanoi") || text.includes("saigon") || text.includes("da nang")) found.add("vietnam");
  if (text.includes("cambodia") || text.includes("siem reap") || text.includes("phnom penh")) found.add("cambodia");
  if (text.includes("portugal") || text.includes("lisbon") || text.includes("porto")) found.add("portugal");

  return [...found];
}

// The languages this phone last found for each trip, so the buttons draw at once
const LANGS_KEY = "wander:phrase-langs";
function rememberedCountries(): string[] {
  try {
    const id = localStorage.getItem("wander:last-trip-id");
    const all = JSON.parse(localStorage.getItem(LANGS_KEY) || "{}");
    return id && Array.isArray(all[id]) ? all[id].filter((k: unknown) => typeof k === "string" && k in COUNTRY_PHRASES) : [];
  } catch { return []; }
}
function rememberCountries(tripId: string, countries: string[]) {
  try {
    const all = JSON.parse(localStorage.getItem(LANGS_KEY) || "{}");
    all[tripId] = countries;
    localStorage.setItem(LANGS_KEY, JSON.stringify(all));
  } catch { /* private window: found again next time */ }
}

// ── Component ──────────────────────────────────────────────────

/** One phrase card for the whole app, opened from anywhere (Ken, Oct 13: "a clear convenient but subtle way to have
 *  phrase button always available"). mode "sheet" (mounted once, beside the bottom bar) draws the card when asked;
 *  "bar" is the small 日 at the bottom bar's right end, on every screen; "header" is Next's labelled "日 Phrases", where
 *  people learn what the 日 means. Both buttons ask the one sheet ("wander-open-phrases"), so two cards never open.
 *  trip: the trip the screen already has, so a button is there in its first drawing (Oct 10: it arrived 1.5 s after the
 *  Next tab drew, widened the header row and moved the whole day down) */
export default function PhraseCard({ mode, inHeader = false, trip }: { mode?: "sheet" | "bar" | "header"; inHeader?: boolean; trip?: { name: string; cities: { name: string; country?: string | null }[] } | null } = {}) {
  const kind = mode || (inHeader ? "header" : "sheet");
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  // The phone's Back closes the phrases instead of leaving Wander
  useBackToClose(open, () => setOpen(false));
  // (first from the trip the screen has, else what this phone remembers for its trip — so the bar's 日 is there in the
  // bar's first drawing; arriving 1–2 s later it slid all six tabs left under a thumb reaching for Scout, verify27)
  const firstCountries = () => (trip ? detectCountries(trip.name || "", trip.cities || []) : rememberedCountries());
  const [tripCountries, setTripCountries] = useState<string[]>(firstCountries);
  const [activeCountry, setActiveCountry] = useState<string>(() => firstCountries()[0] || "");
  const scrollRef = useRef<HTMLDivElement>(null);
  // How far iOS has left the screen moved down the page after a keyboard, read as the card opens (lib/screenShift) —
  // so its foot is at the screen's foot, as the bar's and Scout's are
  const [shift, setShift] = useState(0);
  // The phrases added on this trip — by Scout ("add to phrases") or anyone — under the essentials. Scout told Ken "Both
  // are on the shared phrase card now" (Oct 13) and no screen showed them: they were saved and never drawn.
  const [tripId, setTripId] = useState<string | null>(null);
  const [added, setAdded] = useState<{ id: string; english: string; romaji: string; addedBy: string }[]>([]);
  useEffect(() => {
    if (!open || !tripId) return;
    let live = true;
    api.get<{ id: string; english: string; romaji: string; addedBy: string }[]>(`/phrases/trip/${tripId}`)
      .then((list) => { if (live && Array.isArray(list)) setAdded(list); })
      .catch(() => { /* no signal: the essentials only */ });
    return () => { live = false; };
  }, [open, tripId]);

  // The one sheet opens when either button asks
  useEffect(() => {
    if (kind !== "sheet") return;
    // (the button says which trip and languages it showed for: a button drawn before this card had read the trip opened
    // nothing — Home and a day page, phrases-every.mjs, Oct 13)
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail as { countries?: string[]; tripId?: string | null } | undefined;
      if (d?.countries?.length) {
        setTripCountries((have) => (have.length ? have : d.countries!));
        setActiveCountry((have) => (have && d.countries!.includes(have) ? have : d.countries![0]));
      }
      if (d?.tripId) setTripId((have) => have || d.tripId!);
      setShift(screenShift());
      setOpen(true);
    };
    window.addEventListener("wander-open-phrases", onOpen);
    return () => window.removeEventListener("wander-open-phrases", onOpen);
  }, [kind]);
  // (and closes when the screen changes underneath it)
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Detect trip countries — again on each screen change, and once a moment after opening, whenever the remembered trip
  // isn't the one already read (a phone's first opening: Home picks the trip after this first asked, and the bar's 日
  // stayed hidden until Wander was opened again)
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    const later = setTimeout(() => {
      const now = localStorage.getItem("wander:last-trip-id");
      if (now && now !== loadedFor.current) loadTripCountries(now);
    }, 2500);
    function loadTripCountries(tripId: string) {
      loadedFor.current = tripId;
      setTripId(tripId);
      api.get<any>(`/trips/${tripId}`).then((t) => {
        const countries = detectCountries(t?.name || "", t?.cities || []);
        if (t?.id || t?.name) rememberCountries(tripId, countries);
        setTripCountries(countries);
        if (countries.length > 0 && !countries.includes(activeCountry)) {
          setActiveCountry(countries[0]);
        }
      }).catch(() => {});
    }
    const lastTripId = localStorage.getItem("wander:last-trip-id");
    if (lastTripId) { if (lastTripId !== loadedFor.current) loadTripCountries(lastTripId); }
    else if (!loadedFor.current) {
      api.get<any>("/trips/active").then((t) => {
        if (t?.id) loadTripCountries(t.id);
      }).catch(() => {});
    }
    const handleSwitch = () => {
      const id = localStorage.getItem("wander:last-trip-id");
      if (id) loadTripCountries(id);
    };
    window.addEventListener("wander:data-changed", handleSwitch);
    return () => { clearTimeout(later); window.removeEventListener("wander:data-changed", handleSwitch); };
  }, [user, location.pathname]);

  if (location.pathname === "/login" || location.pathname.startsWith("/join")) return null;
  // (the bar draws before Wander knows who's signed in on a first opening — the room is kept then too)
  if (!user) return kind === "bar" ? <span className="shrink-0 w-11" aria-hidden /> : null;
  const activePhrases = tripCountries.length ? COUNTRY_PHRASES[activeCountry] : undefined;
  // (the bar keeps the 日's room while the trip is still being read, and on a trip with no phrases, so its tabs never
  // slide sideways under a thumb)
  if (!activePhrases) return kind === "bar" ? <span className="shrink-0 w-11" aria-hidden /> : null;

  const ask = () => window.dispatchEvent(new CustomEvent("wander-open-phrases", { detail: { countries: tripCountries, tripId } }));
  if (kind === "header") {
    return (
      <button
        onClick={ask}
        className="min-h-[44px] px-2 flex items-center gap-1 rounded-lg text-[#514636] active:bg-[#f0ebe3]"
        aria-label={`${activePhrases.language} phrases`}
      >
        <span className="text-base font-bold leading-none" style={{ fontFamily: "serif" }} aria-hidden>{activePhrases.icon}</span>
        <span className="text-sm">Phrases</span>
      </button>
    );
  }
  if (kind === "bar") {
    // Unlabelled, so it reads as an extra beside the tabs, never a seventh tab; never shown as the current one. 44 pt wide,
    // a full fingertip (verify27: 36 pt sat right against Scout)
    return (
      <button
        onClick={ask}
        data-tour="Phrases"
        className="shrink-0 w-11 min-h-[48px] flex items-center justify-center rounded-lg text-[#7a6b55] active:bg-[#f0ebe3]"
        aria-label={`${activePhrases.language} phrases`}
        title={`${activePhrases.language} phrases`}
      >
        <span className="text-lg font-bold leading-none" style={{ fontFamily: "serif" }} aria-hidden>{activePhrases.icon}</span>
      </button>
    );
  }
  if (!open) return null;

  // (with the screen moved, the foot sits that much lower on the page: at the screen's real foot)
  const footStyle = shift ? { bottom: `${(document.documentElement.clientHeight || window.innerHeight) - shift - screen.height}px` } : {};
  // Drawn on the page itself, above everything but Scout
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/20 z-[60]" style={footStyle} onClick={() => setOpen(false)} />
      <div
        className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-0 bg-[#faf8f5] rounded-t-2xl shadow-2xl border border-b-0 border-[#e5ddd0] flex flex-col"
        style={{
          maxHeight: "50vh",
          maxWidth: "360px",
          width: "auto",
          minWidth: "300px",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          ...footStyle,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5ddd0] shrink-0">
          <span className="text-sm font-medium text-[#3a3128]">Quick Phrases</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close phrases"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#6b5d4a] hover:bg-[#f0ebe3]"
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
                <span className="text-xs font-normal text-[#6b5d4a] ml-1.5">({p.pronunciation})</span>
              </div>
              <div className="text-xs text-[#6b5d4a]">{p.english}</div>
            </div>
          ))}
          {activeCountry === "japan" && added.length > 0 && (
            <div className="pt-2 mt-1 border-t border-[#e5ddd0]">
              <div className="text-xs uppercase tracking-wide text-[#6b5d4a] pt-1">Added on this trip</div>
              {added.map((p) => (
                <div key={p.id} className="py-2.5">
                  <div className="text-base font-medium text-[#3a3128]">{p.romaji}</div>
                  <div className="text-xs text-[#6b5d4a]">{p.english}{p.addedBy ? ` · added by ${p.addedBy}` : ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
