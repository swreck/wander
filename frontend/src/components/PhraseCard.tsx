import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import useBackToClose from "../hooks/useBackToClose";
import { screenShift } from "../lib/screenShift";
import { startVoice, stopVoice, voiceSupported, type VoiceHandlers } from "../lib/voice";

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
 *  "bar" is the 日 at the bottom bar's right end, on every screen, with "Phrases" under it — the one way in since Oct 16
 *  (Ken: "Why are phrases now in the upper left and bottom right?"; Next's labelled "日 Phrases", where people learned what
 *  the 日 means, is gone, so the bar's says it). "header" is kept, unused. Both ask the one sheet ("wander-open-phrases").
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
  // (removedAt: off everyone's card — sent only to those who may put it back; mayRemoveForAll: this person added it, or
  // is the trip's organizer — the Maybes rule)
  type FollowUp = { english: string; script: string };
  type Added = { id: string; english: string; romaji: string; pronunciation?: string | null; script?: string | null; followUps?: FollowUp[] | null; addedBy: string; removedAt?: string | null; mayRemoveForAll?: boolean };
  // (the phone's copy first, so the card opens with them — user-julie2, Oct 16: her allergy line came 5 s after the card
  // opened, with nothing to say it was coming, and pushed the list under her finger; with no signal it never came)
  const addedKey = (t: string) => `wander:phrase-added:${t}`;
  const [added, setAddedNow] = useState<Added[]>(() => {
    try { const t = localStorage.getItem("wander:last-trip-id"); const c = t ? JSON.parse(localStorage.getItem(addedKey(t)) || "null") : null; return Array.isArray(c) ? c : []; } catch { return []; }
  });
  const setAdded = (v: Added[] | ((list: Added[]) => Added[])) => {
    setAddedNow((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      try { if (tripId) localStorage.setItem(addedKey(tripId), JSON.stringify(next)); } catch { /* private window */ }
      return next;
    });
  };
  // "Show large" (Ken, Oct 14: "plus tappable "Show large" (button resulting in larger kanji version that stays until
  // "close" button)"): the line's Japanese across the whole screen, to hold up to a server or a driver
  const [shownLarge, setShownLarge] = useState<{ title: string; english: string; script: string; followUps?: FollowUp[] | null } | null>(null);
  useBackToClose(!!shownLarge, () => showLarge(null));
  // …and the next question, shown large in its place (Ken, Oct 14, after a ramen menu where every main had garlic: "make
  // it a smart option for the user to ask what they want"): one of the line's own follow-ups, or their own, said or typed
  const [largeNow, setLargeNow] = useState<FollowUp | null>(null);
  const [askOwn, setAskOwn] = useState(false);
  const [ownText, setOwnText] = useState("");
  const [ownBusy, setOwnBusy] = useState(false);
  const [ownNote, setOwnNote] = useState<string | null>(null);
  // (the questions fold behind one button: open, they took 40% of the screen and pushed the card's end out of sight)
  const [asksOpen, setAsksOpen] = useState(false);
  // (which "Ask something else" request is the live one: a late answer after Close, Cancel or another card is dropped —
  // on weak signal it landed on the reopened allergy card; verify58)
  const ownReq = useRef(0);
  // Show large opened, changed or closed: everything about the last one goes at once, in the same drawing (verify58: a
  // one-frame flash of the old question), and the microphone stops
  const showLarge = (next: { title: string; english: string; script: string; followUps?: FollowUp[] | null } | null) => {
    ownReq.current++;
    setLargeNow(null); setAskOwn(false); setOwnText(""); setOwnNote(null); setOwnBusy(false); setAsksOpen(false);
    if (voiceRef.current) { stopVoice(voiceRef.current); voiceRef.current = null; setListening(false); }
    setShownLarge(next);
  };
  useEffect(() => {
    setLargeNow(null); setAskOwn(false); setOwnText(""); setOwnNote(null); setOwnBusy(false); setAsksOpen(false);
    // (the microphone never listens on for a screen that's gone)
    if (voiceRef.current) { stopVoice(voiceRef.current); voiceRef.current = null; setListening(false); }
  }, [shownLarge]);
  // (the screen stays lit while it's held up — a phone dimming mid-order is no use; where the phone allows it)
  useEffect(() => {
    if (!shownLarge) return;
    let lock: { release?: () => Promise<void> } | null = null;
    let closed = false;
    // (closed before the phone granted it: let go as soon as it arrives — else the screen stayed lit; verify56)
    (navigator as any).wakeLock?.request?.("screen").then((l: any) => { if (closed) l?.release?.().catch?.(() => {}); else lock = l; }).catch(() => { /* not allowed: fine */ });
    return () => { closed = true; lock?.release?.().catch?.(() => {}); };
  }, [shownLarge]);
  // Remove asks "Just your card, or everyone's?" for a phrase this person may take off everyone's (Ken, Oct 14: "ensure
  // just your card is default. I don't want Larisa or Julie to accidentally remove for andy!")
  const [askingRemove, setAskingRemove] = useState<string | null>(null);
  // Add (Ken, Oct 14): "'Add' allows add where person types or speaks English and scouts fill in the fine print Japanese
  // and pronunciation. If the translation is questionable or problematic or can be done in two ways with different
  // nuance, give an option with super brief context and tappable choice." Nothing is saved until a choice is tapped.
  type Choice = { kind: "say" | "recognize" | "show"; english: string; romaji: string; pronunciation: string | null; script?: string | null; followUps?: FollowUp[] | null; note: string | null; onCardAs?: string; offYourCard?: string };
  // (one save at a time: two quick taps on a choice put the line on everyone's card twice — verify53)
  const choosingRef = useRef(false);
  // (the choice being saved says "Adding…": on weak signal nothing showed the tap had landed — verify54)
  const [savingChoice, setSavingChoice] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [asked, setAsked] = useState("");
  const [finding, setFinding] = useState(false);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [addNote, setAddNote] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const voiceRef = useRef<VoiceHandlers | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // While the Add box is typed in, the card sits on the part of the screen iOS shows, above the keyboard and its floating
  // ˄ ˅ ✓ bar — Scout's own rule (ChatBubble: an iPhone can misreport the page's height, so placed from where the
  // visible part starts and how tall it is). Only while typing here; otherwise the card is drawn as before.
  const [typingAt, setTypingAt] = useState<{ top: number; h: number } | null>(null);
  useEffect(() => {
    if (!open || !adding) { setTypingAt(null); return; }
    const vv = window.visualViewport;
    if (!vv) return;
    // (an iPhone can report no keyboard while it's up — verify41 — so there, whenever typing; elsewhere only with a
    // keyboard really up, so a computer's or iPad's card doesn't move at a click in the box)
    const iPhone = /iPhone|iPod/.test(navigator.userAgent);
    const update = () => {
      const a = document.activeElement;
      const typing = !!a && !!sheetRef.current?.contains(a) && a.matches("textarea, input");
      const layoutH = document.documentElement.clientHeight || window.innerHeight;
      const keyboard = layoutH - vv.height - vv.offsetTop > 80;
      setTypingAt(typing && (iPhone || keyboard) ? { top: Math.round(vv.offsetTop), h: Math.round(vv.height) } : null);
    };
    update();
    vv.addEventListener("resize", update); vv.addEventListener("scroll", update);
    document.addEventListener("focusin", update); document.addEventListener("focusout", update);
    return () => {
      vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update); document.removeEventListener("focusout", update);
    };
  }, [open, adding]);
  // This person's own card: phrases taken off it and their order (Ken, Oct 13: "Need to be able to remove phrases. And to
  // rearrange the order. No need to designate original or not.") — theirs alone, kept on the server with their settings
  // (services/phrasePrefs) and on the phone so the card draws at once. Taken off is hidden, never deleted.
  const [mine, setMine] = useState<{ order: string[]; hidden: string[] }>({ order: [], hidden: [] });
  const [editing, setEditing] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !tripId) return;
    let live = true;
    try { const c = JSON.parse(localStorage.getItem(`wander:phrase-mine:${tripId}`) || "null"); if (c?.order && c?.hidden) setMine(c); } catch { /* none kept */ }
    api.get<Added[]>(`/phrases/trip/${tripId}`)
      .then((list) => { if (live && Array.isArray(list)) setAdded(list); })
      .catch(() => { /* no signal: the essentials only */ });
    api.get<{ order: string[]; hidden: string[] }>(`/phrases/trip/${tripId}/mine`)
      .then((m) => {
        if (!live || !Array.isArray(m?.order) || !Array.isArray(m?.hidden)) return;
        saved.current = m;
        // (never over a change still on its way to the server)
        if (saving.current || waiting.current) return;
        setMine(m);
        try { localStorage.setItem(`wander:phrase-mine:${tripId}`, JSON.stringify(m)); } catch { /* private window */ }
      })
      .catch(() => { /* no signal: this phone's copy */ });
    return () => { live = false; };
  }, [open, tripId]);
  // (once the trip is known, in the background — ready before anyone opens the card)
  useEffect(() => {
    if (!tripId) return;
    let live = true;
    try { const c = JSON.parse(localStorage.getItem(addedKey(tripId)) || "null"); if (Array.isArray(c)) setAddedNow(c); } catch { /* none kept */ }
    api.get<Added[]>(`/phrases/trip/${tripId}`).then((list) => { if (live && Array.isArray(list)) setAdded(list); }).catch(() => { /* the phone's copy */ });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);
  // (closed, the card is out of Edit)
  useEffect(() => {
    if (open) return;
    setEditing(false); setSaveNote(null); setAskingRemove(null); showLarge(null);
    // (and out of Add, the microphone handed back)
    setAdding(false); setAsked(""); setChoices(null); setAddNote(null); setFinding(false);
    if (voiceRef.current) { stopVoice(voiceRef.current); voiceRef.current = null; }
    setListening(false);
  }, [open]);
  // Leaving the screen hands the microphone back
  useEffect(() => () => { if (voiceRef.current) stopVoice(voiceRef.current); }, []);
  // Saved one at a time, the newest last: quick taps on ↑ each sent a save, and an older one arriving last put the old
  // order back on the server — and on the card the next time it opened (verify29: 5 taps, Sumimasen first on screen,
  // third after reopening)
  const saving = useRef(false);
  const waiting = useRef<{ order: string[]; hidden: string[] } | null>(null);
  const saved = useRef<{ order: string[]; hidden: string[] } | null>(null);
  const sendNext = () => {
    if (saving.current || !waiting.current || !tripId) return;
    const send = waiting.current;
    waiting.current = null;
    saving.current = true;
    api.patch(`/phrases/trip/${tripId}/mine`, send)
      .then(() => { saved.current = send; })
      .catch(() => {
        // (a newer change waiting goes next; with none, the card goes back to what the server has)
        if (waiting.current) return;
        const back = saved.current || { order: [], hidden: [] };
        setMine(back);
        try { localStorage.setItem(`wander:phrase-mine:${tripId}`, JSON.stringify(back)); } catch { /* private window */ }
        setSaveNote("That didn't save. Try again when you have signal?");
      })
      .finally(() => { saving.current = false; sendNext(); });
  };
  const arrange = (next: { order: string[]; hidden: string[] }) => {
    if (!tripId) return;
    setMine(next);
    setSaveNote(null);
    try { localStorage.setItem(`wander:phrase-mine:${tripId}`, JSON.stringify(next)); } catch { /* private window */ }
    waiting.current = next;
    sendNext();
  };

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
  if (!user) return kind === "bar" ? <span className="shrink-0 w-12" aria-hidden /> : null;
  const activePhrases = tripCountries.length ? COUNTRY_PHRASES[activeCountry] : undefined;
  // (the bar keeps the 日's room while the trip is still being read, and on a trip with no phrases, so its tabs never
  // slide sideways under a thumb)
  if (!activePhrases) return kind === "bar" ? <span className="shrink-0 w-12" aria-hidden /> : null;

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
    // A quieter extra at the end of the tabs, never shown as the current one; its word under it, a size smaller than the
    // tabs' (Ken, Oct 16: "if there's no room and it would overwhelm the bar, I sort of liked… very subtle in the corner").
    // 48 pt wide, a full fingertip (verify27: 36 pt sat right against Scout)
    return (
      <button
        onClick={ask}
        data-tour="Phrases"
        // (in line with the tabs' icons, its word on their label line: centred, it sat lower and was cut off when the bar
        // slides down on scroll — user-ken4)
        className="shrink-0 w-12 min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 rounded-lg text-[#7a6b55] active:bg-[#f0ebe3]"
        aria-label={`${activePhrases.language} phrases`}
      >
        <span className="text-lg font-bold leading-none h-5 flex items-center" style={{ fontFamily: "serif" }} aria-hidden>{activePhrases.icon}</span>
        <span data-phrases-word className="text-[11px] leading-tight whitespace-nowrap" aria-hidden>Phrases</span>
      </button>
    );
  }
  if (!open) return null;

  // The card's phrases as this person has arranged them: their order first, anything new after in its first order;
  // the ones they took off apart (services/phrasePrefs keys the same way)
  type Row = { key: string; local: string; pronunciation?: string | null; script?: string | null; followUps?: FollowUp[] | null; english: string; id?: string; forAll?: boolean; offForAll?: boolean };
  const allRows: Row[] = [
    ...activePhrases.phrases.map((p) => ({ key: `core:${activeCountry}:${p.english}`, local: p.local, pronunciation: p.pronunciation, english: p.english })),
    ...(activeCountry === "japan" ? added.map((p) => ({ key: `p:${p.id}`, local: p.romaji, pronunciation: p.pronunciation, script: p.script, followUps: p.followUps, english: p.english, id: p.id, forAll: !!p.mayRemoveForAll, offForAll: !!p.removedAt })) : []),
  ];
  const byKey = new Map(allRows.map((r) => [r.key, r]));
  const orderNow = [...mine.order.filter((k) => byKey.has(k)), ...allRows.map((r) => r.key).filter((k) => !mine.order.includes(k))];
  const shown = orderNow.filter((k) => !mine.hidden.includes(k) && !byKey.get(k)!.offForAll).map((k) => byKey.get(k)!);
  const removed = orderNow.filter((k) => mine.hidden.includes(k) || byKey.get(k)!.offForAll).map((k) => byKey.get(k)!);
  // Remove: a phrase this person added (or any added one, for the organizer) off everyone's card; anything else off
  // their own. Put back undoes either.
  const setOffForAll = (id: string, off: boolean) => {
    setAdded((list) => list.map((p) => (p.id === id ? { ...p, removedAt: off ? new Date().toISOString() : null } : p)));
    setSaveNote(null);
    api.post(`/phrases/${id}/${off ? "remove" : "put-back"}`, {}).catch(() => {
      setAdded((list) => list.map((p) => (p.id === id ? { ...p, removedAt: off ? null : new Date().toISOString() } : p)));
      setSaveNote("That didn't save. Try again when you have signal?");
    });
  };
  // Remove: off this person's own card — always the plain tap. Off everyone's only as a second, deliberate choice, and
  // only for a phrase they added (or any added one, for the organizer)
  const removeMine = (r: Row) => { setAskingRemove(null); arrange({ order: orderNow, hidden: [...mine.hidden, r.key] }); };
  const removeForAll = (r: Row) => { setAskingRemove(null); if (r.id) setOffForAll(r.id, true); };
  const remove = (r: Row) => (r.id && r.forAll ? setAskingRemove(r.key) : removeMine(r));
  const putBack = (r: Row) => (r.offForAll && r.id ? setOffForAll(r.id, false) : arrange({ order: orderNow, hidden: mine.hidden.filter((k) => k !== r.key) }));
  // (↑ / ↓ swap with the neighbour among the phrases shown)
  const move = (key: string, by: -1 | 1) => {
    const i = shown.findIndex((r) => r.key === key), j = i + by;
    if (i < 0 || j < 0 || j >= shown.length) return;
    const a = orderNow.indexOf(key), b = orderNow.indexOf(shown[j].key);
    const order = [...orderNow];
    [order[a], order[b]] = [order[b], order[a]];
    arrange({ order, hidden: mine.hidden });
  };

  // Add: what they said in English → the line, or a choice of two or three (backend services/phraseSuggest)
  const findJapanese = () => {
    const english = asked.trim();
    if (!english || !tripId || finding) return;
    if (voiceRef.current) { stopVoice(voiceRef.current); voiceRef.current = null; setListening(false); }
    (document.activeElement as HTMLElement | null)?.blur?.();
    setFinding(true); setChoices(null); setAddNote(null);
    api.post<{ options: Choice[]; why?: string }>(`/phrases/suggest`, { tripId, english })
      .then((r) => {
        if (r?.options?.length) setChoices(r.options);
        else setAddNote(r?.why || "I couldn't put that into Japanese. Try saying it another way?");
      })
      .catch(() => setAddNote(trouble()))
      .finally(() => setFinding(false));
  };
  const choose = (c: Choice, at: number) => {
    if (!tripId || choosingRef.current) return;
    // (one they took off their own card: back on it)
    if (c.offYourCard) {
      arrange({ order: orderNow, hidden: mine.hidden.filter((k) => k !== c.offYourCard) });
      setAdding(false); setAsked(""); setChoices(null);
      setAddNote(`"${c.onCardAs}" is back on your card.`);
      return;
    }
    if (c.onCardAs) return;
    setAddNote(null);
    choosingRef.current = true;
    setSavingChoice(at);
    api.post<Added>(`/phrases`, { tripId, english: c.english, romaji: c.romaji, pronunciation: c.pronunciation, script: c.script || null, followUps: c.followUps || null })
      .then((p) => {
        if (p?.id) setAdded((list) => (list.some((x) => x.id === p.id) ? list : [...list, { ...p, mayRemoveForAll: true }]));
        // (first on this person's card — the server put it there; the order is read back so this card shows it)
        api.get<{ order: string[]; hidden: string[] }>(`/phrases/trip/${tripId}/mine`).then((m) => {
          if (!Array.isArray(m?.order)) return;
          saved.current = m; setMine(m);
          try { localStorage.setItem(`wander:phrase-mine:${tripId}`, JSON.stringify(m)); } catch { /* private window */ }
        }).catch(() => {});
        setAdding(false); setAsked(""); setChoices(null);
        setAddNote(`Added "${c.english}", first on your card and last on everyone else's.`);
        scrollRef.current?.scrollTo({ top: 0 });
      })
      .catch(() => setAddNote(trouble()))
      .finally(() => { choosingRef.current = false; setSavingChoice(null); });
  };
  // (the phone's signal only when it really has none: a server or translator failure isn't the signal's fault — verify53)
  const trouble = () => (navigator.onLine === false ? "No signal just now. Try again when you have some?" : "That didn't work. Try again in a moment?");
  // Talk: the app's one microphone, as in Notes — what's said follows anything typed
  const hasVoice = voiceSupported();
  const toggleTalk = () => {
    if (listening && voiceRef.current) { stopVoice(voiceRef.current); voiceRef.current = null; setListening(false); return; }
    const typed = asked.replace(/\s+$/, "");
    const h: VoiceHandlers = {
      onText: (said) => { if (voiceRef.current === h) setAsked(typed ? `${typed} ${said.trimStart()}` : said); },
      onEnd: () => { if (voiceRef.current === h) { voiceRef.current = null; setListening(false); } },
      // (a refused microphone said nothing — verify53)
      onError: (err) => { if (err === "not-allowed" || err === "service-not-allowed") setAddNote("Wander isn't allowed to use the microphone. You can type it instead."); },
    };
    voiceRef.current = h;
    if (startVoice(h)) { setListening(true); setChoices(null); setAddNote(null); }
    else voiceRef.current = null;
  };

  // Show large's "Ask something else": their own question in Japanese, now, not saved (backend POST /phrases/one-off)
  const showOwn = () => {
    const english = ownText.trim();
    if (!english || !tripId || ownBusy || !shownLarge) return;
    if (voiceRef.current) { stopVoice(voiceRef.current); voiceRef.current = null; setListening(false); }
    (document.activeElement as HTMLElement | null)?.blur?.();
    setOwnBusy(true); setOwnNote(null);
    const n = ++ownReq.current;
    api.post<{ english?: string; script?: string; why?: string }>(`/phrases/one-off`, { tripId, english, card: { english: shownLarge.english, script: shownLarge.script } })
      .then((r) => {
        if (n !== ownReq.current) return; // (closed, cancelled or another card since: dropped)
        if (r?.script && r.english) { setLargeNow({ english: r.english, script: r.script }); setAskOwn(false); setOwnText(""); }
        else setOwnNote(r?.why || "I couldn't put that into Japanese. Try saying it another way?");
      })
      .catch(() => { if (n === ownReq.current) setOwnNote(trouble()); })
      .finally(() => { if (n === ownReq.current) setOwnBusy(false); });
  };
  const toggleOwnTalk = () => {
    if (listening && voiceRef.current) { stopVoice(voiceRef.current); voiceRef.current = null; setListening(false); return; }
    const typed = ownText.replace(/\s+$/, "");
    const h: VoiceHandlers = {
      onText: (said) => { if (voiceRef.current === h) setOwnText(typed ? `${typed} ${said.trimStart()}` : said); },
      onEnd: () => { if (voiceRef.current === h) { voiceRef.current = null; setListening(false); } },
      onError: (err) => { if (err === "not-allowed" || err === "service-not-allowed") setOwnNote("Wander isn't allowed to use the microphone. You can type it instead."); },
    };
    voiceRef.current = h;
    if (startVoice(h)) { setListening(true); setOwnNote(null); }
    else voiceRef.current = null;
  };

  // (with the screen moved, the foot sits that much lower on the page: at the screen's real foot)
  const footStyle = shift ? { bottom: `${(document.documentElement.clientHeight || window.innerHeight) - shift - screen.height}px` } : {};
  // (typing in Add on an iPhone: on the visible part of the screen, clear of the floating ˄ ˅ ✓ bar — ChatBubble's 52 pt)
  const iosBar = /iPhone|iPod/.test(navigator.userAgent) ? 52 : 0;
  const typingH = typingAt ? Math.max(200, Math.min(460, typingAt.h - iosBar - 16)) : 0;
  const placeStyle = typingAt ? { top: `${typingAt.top + typingAt.h - iosBar - typingH}px`, bottom: "auto", height: `${typingH}px`, maxHeight: `${typingH}px` } : footStyle;
  // Drawn on the page itself, above everything but Scout
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/20 z-[60]" style={footStyle} onClick={() => setOpen(false)} />
      <div
        ref={sheetRef}
        // (pressing any of the card's buttons keeps the cursor where it is: while Add was typed in, taking it out dropped
        // the card from above the keyboard to the screen's foot mid-tap, and the tap landed on nothing — even ⌄)
        onPointerDown={(e) => { if (typingAt && (e.target as HTMLElement).closest("button")) e.preventDefault(); }}
        className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-0 bg-[#faf8f5] rounded-t-2xl shadow-2xl border border-b-0 border-[#e5ddd0] flex flex-col"
        style={{
          maxHeight: "50vh",
          maxWidth: "360px",
          // (as wide as it may be, so the header never wraps "Quick / Phrases" beside Add and Edit/Reorder — verify53)
          width: "min(360px, calc(100vw - 24px))",
          minWidth: "300px",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          ...placeStyle,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5ddd0] shrink-0">
          <span className="text-sm font-medium text-[#3a3128]">Quick Phrases</span>
          <span className="flex-1" />
          {/* Add (Japanese only — the card's Add writes Japanese) and Edit/Reorder: ↑ ↓ and Remove (dragging is unreliable
              in an iPhone web app). Each is Done while it's open. */}
          {activeCountry === "japan" && !editing && (
            <button
              onClick={() => { setAdding((a) => !a); setChoices(null); setAddNote(null); setSaveNote(null); }}
              className="min-h-[44px] px-2 text-sm text-[#514636] underline underline-offset-2"
            >
              {/* ("Done" read as "save this": tapped after typing, it went back with nothing added — verify53) */}
              {adding ? "Back" : "Add"}
            </button>
          )}
          {!adding && (
            <button
              onClick={() => { setEditing((e) => !e); setAskingRemove(null); }}
              className="min-h-[44px] px-2 text-sm text-[#514636] underline underline-offset-2"
            >
              {editing ? "Done" : "Edit/Reorder"}
            </button>
          )}
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
          {adding ? (
            // Add: in English, typed or said; Wander writes the Japanese and how to say it; a choice when it splits
            <div className="py-1">
              <label htmlFor="phrase-add" className="block text-sm text-[#514636]">What do you want to say? Or what do you need to find on a sign or button?</label>
              <textarea id="phrase-add" value={asked} rows={2} maxLength={300}
                onChange={(e) => { setAsked(e.target.value); setChoices(null); setAddNote(null); }}
                placeholder="In English, like: Where is the train station?"
                className="mt-1.5 w-full bg-[#f0ebe3] rounded-xl px-3 py-2 text-[16px] leading-snug text-[#3a3128] placeholder:text-[#6b5d4a] outline-none focus:ring-2 focus:ring-[#514636]/20 resize-none" />
              <div className="flex items-center gap-2 mt-2">
                {/* (pressing keeps the cursor in the box: taking it out dropped the card from above the keyboard to the
                    screen's foot mid-tap, and the tap landed on nothing) */}
                {hasVoice && (
                  <button onClick={toggleTalk} onPointerDown={(e) => e.preventDefault()} type="button" aria-label={listening ? "Stop listening" : "Talk instead of typing"}
                    className={`min-h-[44px] min-w-[44px] px-3 rounded-xl text-sm ${listening ? "bg-red-500 text-white animate-pulse" : "bg-[#f0ebe3] text-[#514636]"}`}>
                    {listening ? "Stop" : "Talk"}
                  </button>
                )}
                <button onClick={findJapanese} onPointerDown={(e) => e.preventDefault()} disabled={!asked.trim() || finding}
                  className="min-h-[44px] px-3 rounded-xl bg-[#514636] text-white text-sm disabled:opacity-40">
                  {finding ? "Finding the Japanese…" : "Find the Japanese"}
                </button>
              </div>
              {addNote && <p role="status" className="text-sm text-[#8a5a1a] mt-2">{addNote}</p>}
              {/* (the choices can be two ways of saying it, or a second, related phrase — verify54) */}
              {choices && choices.length > 1 && <p className="text-sm text-[#514636] mt-3">More than one could fit. Tap the one you want.</p>}
              {choices?.map((c, i) => (
                <button key={i} onClick={() => choose(c, i)} disabled={(!!c.onCardAs && !c.offYourCard) || savingChoice !== null}
                  className="block w-full text-left mt-2 rounded-xl border border-[#e5ddd0] bg-white px-3 py-2 min-h-[44px] active:bg-[#f0ebe3] disabled:bg-transparent">
                  <span className="block text-base font-medium text-[#3a3128]">{c.english}</span>
                  <span className="block text-sm text-[#3a3128]">{c.romaji}{c.pronunciation && <span className="text-[#6b5d4a]"> ({c.pronunciation})</span>}</span>
                  {c.script && <span lang="ja" className="block text-base text-[#3a3128] mt-0.5 whitespace-pre-line">{c.script}</span>}
                  {c.note && <span className="block text-xs text-[#6b5d4a] mt-0.5">{c.note}</span>}
                  <span className="block text-sm text-[#514636] underline underline-offset-2 mt-1">
                    {savingChoice === i ? "Adding…" : c.offYourCard ? `You took "${c.onCardAs}" off your card. Put it back` : c.onCardAs ? `Already on the card, as "${c.onCardAs}"` : choices.length > 1 ? "Add this one" : "Add to the card"}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {/* One list, in this person's order — the everyday phrases and those added on the trip alike. Each line's title
              is English, what an English speaker scans for; then the Japanese and how to say it (Ken, Oct 14: "all phrases
              titles should be English to find what is needed. Like: Hello / Konnichiwa(Koh-nee-chee-wah)") */}
          {!adding && addNote && <p role="status" className="text-sm text-[#514636] py-1">{addNote}</p>}
          {!adding && shown.map((p, i) => (
            <div key={p.key} className="py-1.5">
              <div className="flex items-center gap-1">
                <div className="flex-1 min-w-0 py-1">
                  <div className="text-base font-medium text-[#3a3128]">{p.english}</div>
                  <div className="text-sm text-[#3a3128]">
                    {p.local}
                    {p.pronunciation && <span className="text-[#6b5d4a]"> ({p.pronunciation})</span>}
                  </div>
                  {/* (the Japanese to show someone, and the way to show it large — Ken, Oct 14) */}
                  {p.script && (
                    <div className="mt-0.5">
                      <div lang="ja" className="text-base text-[#3a3128] whitespace-pre-line" style={{ lineBreak: "strict" }}>{p.script}</div>
                      {!editing && (
                        <button onClick={() => showLarge({ title: p.english, english: p.local, script: p.script!, followUps: p.followUps })}
                          className="min-h-[44px] -mb-2 text-sm text-[#514636] underline underline-offset-2">Show large</button>
                      )}
                    </div>
                  )}
                </div>
                {editing && askingRemove !== p.key && (
                  <>
                    <button onClick={() => move(p.key, -1)} disabled={i === 0} aria-label={`Move ${p.english} up`}
                      className="shrink-0 min-h-[44px] min-w-[40px] flex items-center justify-center rounded-lg text-[#514636] disabled:opacity-25 active:bg-[#f0ebe3]">↑</button>
                    <button onClick={() => move(p.key, 1)} disabled={i === shown.length - 1} aria-label={`Move ${p.english} down`}
                      className="shrink-0 min-h-[44px] min-w-[40px] flex items-center justify-center rounded-lg text-[#514636] disabled:opacity-25 active:bg-[#f0ebe3]">↓</button>
                    <button onClick={() => remove(p)} aria-label={`Remove ${p.english}`}
                      className="shrink-0 min-h-[44px] px-2 text-sm text-[#8a5a1a] active:bg-[#f0ebe3] rounded-lg">Remove</button>
                  </>
                )}
              </div>
              {/* Remove's question, for a phrase this person may take off everyone's card: their own card is the plain,
                  first choice; everyone's is the second (Ken: "ensure just your card is default") */}
              {editing && askingRemove === p.key && (
                <div className="flex flex-wrap items-center gap-2 pb-1">
                  <button onClick={() => removeMine(p)} className="min-h-[44px] px-3 rounded-xl bg-[#514636] text-white text-sm">Just my card</button>
                  <button onClick={() => removeForAll(p)} className="min-h-[44px] px-2 text-sm text-[#8a5a1a] underline underline-offset-2">Everyone's card</button>
                  <button onClick={() => setAskingRemove(null)} className="min-h-[44px] px-2 text-sm text-[#514636]">Keep it</button>
                </div>
              )}
            </div>
          ))}
          {/* Taken off: only in Edit, each with Put back */}
          {editing && removed.length > 0 && (
            <div className="pt-2 mt-1 border-t border-[#e5ddd0]">
              <div className="text-xs text-[#6b5d4a] pt-1">Removed</div>
              {removed.map((p) => (
                <div key={p.key} className="py-1 flex items-center gap-2">
                  <div className="flex-1 min-w-0 text-sm text-[#6b5d4a]">{p.english} <span className="text-xs">({p.local}) · {p.offForAll ? "off everyone's card" : "off your card"}</span></div>
                  <button onClick={() => putBack(p)} aria-label={`Put back ${p.english}`}
                    className="shrink-0 min-h-[44px] px-2 text-sm text-[#514636] underline underline-offset-2">Put back</button>
                </div>
              ))}
            </div>
          )}
          {/* (said as it is for this person: the trip's organizer takes any added phrase off everyone's card — verify29) */}
          {editing && <p className="text-xs text-[#6b5d4a] pt-2 pb-1">
            {(() => {
              const first = (s: string) => s.trim().split(/\s+/)[0].toLowerCase();
              const organizer = added.some((p) => p.mayRemoveForAll && first(p.addedBy) !== first(user?.displayName || ""));
              return organizer
                ? "Your order is yours alone. Remove takes a phrase off your card; for one added on the trip, you can choose everyone's card instead."
                : "Your order is yours alone. Remove takes a phrase off your card; for one you added, you can choose everyone's card instead.";
            })()}
          </p>}
          {saveNote && <p className="text-xs text-[#8a5a1a] pt-1 pb-1" role="status">{saveNote}</p>}
        </div>
      </div>
      {/* Show large: the Japanese across the screen, until Close (Ken, Oct 14). Above everything, the card included */}
      {shownLarge && (
        <div role="dialog" aria-modal="true" aria-label={`${shownLarge.title}, in Japanese`}
          // (above everything, notices and the update prompt included: nothing may cover an allergy card held up to a
          // server — verify56)
          className="fixed inset-0 bg-white flex flex-col"
          style={{ zIndex: 10000, paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="flex items-start justify-between gap-3 px-5 pt-4">
            <div className="min-w-0">
              <div className="text-sm font-medium text-[#514636]">{largeNow ? "You're showing" : shownLarge.title}</div>
              {/* (what the Japanese says, so they know what they're showing — Ken, Oct 14) */}
              <div className="text-xs text-[#6b5d4a]">{(largeNow ?? shownLarge).english}</div>
            </div>
            <button onClick={() => showLarge(null)} className="shrink-0 min-h-[44px] px-4 rounded-xl bg-[#514636] text-white text-base">Close</button>
          </div>
          {/* Their own question, said or typed (at the top, clear of the keyboard) */}
          {askOwn && (
            <div className="px-5 pt-3">
              <textarea value={ownText} rows={2} maxLength={300} autoFocus aria-label="What to ask, in English"
                onChange={(e) => { setOwnText(e.target.value); setOwnNote(null); }}
                placeholder="In English, like: Can I have the soup without garlic?"
                className="w-full bg-[#f0ebe3] rounded-xl px-3 py-2 text-[16px] leading-snug text-[#3a3128] placeholder:text-[#6b5d4a] outline-none resize-none" />
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {hasVoice && (
                  <button onClick={toggleOwnTalk} onPointerDown={(e) => e.preventDefault()} type="button" aria-label={listening ? "Stop listening" : "Talk instead of typing"}
                    className={`min-h-[44px] min-w-[44px] px-3 rounded-xl text-sm ${listening ? "bg-red-500 text-white animate-pulse" : "bg-[#f0ebe3] text-[#514636]"}`}>
                    {listening ? "Stop" : "Talk"}
                  </button>
                )}
                <button onClick={showOwn} onPointerDown={(e) => e.preventDefault()} disabled={!ownText.trim() || ownBusy}
                  className="min-h-[44px] px-3 rounded-xl bg-[#514636] text-white text-sm disabled:opacity-40">
                  {ownBusy ? "Writing it in Japanese…" : "Show it in Japanese"}
                </button>
                <button onClick={() => {
                  // (Cancel stops the microphone and drops a request still out — verify58)
                  ownReq.current++; setOwnBusy(false);
                  if (voiceRef.current) { stopVoice(voiceRef.current); voiceRef.current = null; setListening(false); }
                  setAskOwn(false); setOwnText(""); setOwnNote(null);
                }} className="min-h-[44px] px-2 text-sm text-[#514636]">Cancel</button>
              </div>
              {ownNote && <p role="status" className="text-sm text-[#8a5a1a] mt-1">{ownNote}</p>}
            </div>
          )}
          {/* (centred with my-auto, not items-center: a card taller than the screen scrolls from its first line instead
              of losing it above the top; a long card is a size smaller so four sentences fit a phone without scrolling) */}
          <div className="flex-1 overflow-y-auto flex flex-col px-6 py-4">
            <p lang="ja" className="my-auto w-full text-[#1f1a14] font-medium whitespace-pre-line"
              // (by the screen's height too, so a phone on its side shows the whole card; strict breaks keep ー and small
              // kana off the start of a line — verify57)
              // (a very long card a size smaller again, so all of it is in view for the person reading it)
              style={{ fontSize: (largeNow ?? shownLarge).script.length > 100 ? "clamp(20px, min(6.2vw, 4.8vh), 48px)" : (largeNow ?? shownLarge).script.length > 40 ? "clamp(24px, min(7.4vw, 9vh), 56px)" : "clamp(30px, min(10vw, 12vh), 72px)", lineHeight: 1.35, lineBreak: "strict" }}>{(largeNow ?? shownLarge).script}</p>
          </div>
          {/* Ask them: the line's own next questions, and their own (Ken, Oct 14: "make it a smart option for the user to
              ask what they want" — every main had garlic; the useful question is what CAN be made) */}
          {!askOwn && (
            <div className="px-5 pt-2 pb-3 border-t border-[#e5ddd0]">
              <div className="flex flex-wrap items-center gap-x-4">
                {largeNow && (
                  <button onClick={() => { setLargeNow(null); setAsksOpen(false); }} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">‹ Back to the card</button>
                )}
                <button onClick={() => setAsksOpen((o) => !o)} aria-expanded={asksOpen}
                  className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">
                  {asksOpen ? "Hide the questions" : largeNow ? "Ask another ›" : "Ask them a question ›"}
                </button>
              </div>
              {asksOpen && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {(shownLarge.followUps || []).map((f) => (
                    <button key={f.english} onClick={() => { setLargeNow(f); setAsksOpen(false); }}
                      className={`min-h-[44px] px-3 py-1.5 rounded-xl text-sm text-left ${largeNow?.english === f.english ? "bg-[#514636] text-white" : "bg-[#f0ebe3] text-[#3a3128]"}`}>
                      {f.english}
                    </button>
                  ))}
                  <button onClick={() => { setAskOwn(true); setAsksOpen(false); }} className="min-h-[44px] px-3 py-1.5 rounded-xl text-sm text-[#514636] border border-[#d8cdbd]">Ask something else</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>,
    document.body,
  );
}
