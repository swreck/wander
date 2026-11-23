import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";
import useBackToClose from "../hooks/useBackToClose";
import { screenShift } from "../lib/screenShift";
import { convert, loadRates, money, rateWords, savedRates, ROUND_RATES, MONEY_NAMES, MONEY_SIGNS, type Currency, type Foreign, type Rates } from "../lib/rates";
import {
  convertTripFrom, eachOfBoth, moneyCountries, NOTES, openingMoney, padAmount, padPress, padShown, rememberConvertTrip,
  rememberedConvertTrip, shortcutKey, showsConvert, SPLIT_MAX, type ConvertTrip, type PadKey,
} from "../lib/convertPad";

/**
 * Convert, the money calculator (Nov 22 2026; trip-data/december-plan/convert-spec.md). The bar's button and its sheet,
 * one component, so everything pinned to the screen's foot stays in one place (the iPhone rule). A small sign at the
 * bar's left end, today's money with "Convert" under it, as quiet as Phrases at the other end. The sheet: two rows, the
 * country's money and dollars, typed with its own number pad (never the phone's keyboard), the banknotes a traveler is
 * handed, a split, and the rate with its day. Shown before the trip and on every day of it; never once it's over, so the
 * finished trip's bar is exactly as it was.
 */

// The phone's own date, for today's money
const phoneDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const openTripId = () => { try { return localStorage.getItem("wander:last-trip-id"); } catch { return null; } };

// One line about the money a traveler is handed there (sources in the spec); none for Japan
const TIPS: Partial<Record<Foreign, string>> = {
  VND: "The 20,000 and 500,000 notes are both blue. Count the zeros.",
  KHR: "Dollars are widely taken in Cambodia. Change under a dollar comes back in riel.",
};

type Row = "local" | "usd";
// typing: the row the pad types in. from: the row the amount was typed in (the other row shows it converted).
// fresh: the next key starts a new amount, after a tap on the other row, a banknote, or opening the sheet again.
type Pad = { typing: Row; from: Row; text: string; fresh: boolean };
const START: Pad = { typing: "local", from: "local", text: "", fresh: false };

const wholeFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
// (a long amount a size smaller, so twelve digits of dong still fit beside the ✕ on the smallest phone)
const amountSize = (shown: string) => (shown.length <= 11 ? "26px" : shown.length <= 14 ? "22px" : "18px");

export default function ConvertCard() {
  const location = useLocation();
  // The open trip, first from what this phone remembers of it, so on a second opening the button is in the bar's very
  // first drawing and the tabs never slide sideways under a thumb
  const [firstId] = useState(openTripId);
  const idRef = useRef<string | null>(firstId);
  const [trip, setTrip] = useState<ConvertTrip | null>(() => rememberedConvertTrip(firstId));
  const loadedFor = useRef<string | null>(null);
  const request = useRef(0);
  const [rates, setRates] = useState<Rates>(() => savedRates() ?? ROUND_RATES);
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const [chosen, setChosen] = useState<Foreign | null>(null);
  const [pad, setPad] = useState<Pad>(START);
  const [people, setPeople] = useState(1);
  const alive = useRef(true);
  const ratesAsked = useRef(false);

  // The trip read from the server (the same read the phrase card makes), remembered for next time. A failed read keeps
  // what's remembered; an answer for a trip that's no longer the open one, or overtaken by a newer read, is dropped.
  const fetchTrip = (id: string) => {
    loadedFor.current = id;
    const n = ++request.current;
    api.get<unknown>(`/trips/${id}`).then((answer) => {
      if (!alive.current || n !== request.current || idRef.current !== id) return;
      const t = convertTripFrom(answer);
      if (!t) return;
      rememberConvertTrip(id, t);
      setTrip(t);
    }).catch(() => { /* no signal: what's remembered */ });
  };
  // Which trip is open: read again on every screen and when the trip menu changes it. The moment it changes, what shows
  // comes from the new trip's note, or nothing; never the old trip's button.
  const follow = (readAgain: boolean) => {
    const id = openTripId();
    if (id !== idRef.current) {
      idRef.current = id;
      request.current++;
      setTrip(rememberedConvertTrip(id));
      setOpen(false); setChosen(null); setPad(START);
    }
    if (id && (readAgain || id !== loadedFor.current)) fetchTrip(id);
  };
  useEffect(() => { follow(false); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  useEffect(() => {
    const onChange = () => follow(true);
    window.addEventListener("wander:data-changed", onChange);
    return () => window.removeEventListener("wander:data-changed", onChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const shows = !!trip && showsConvert(trip.cities, trip.dates, trip.zone);
  // Recent rates, never waited for: the phone's copy (or round figures) at once, the newer answer when it comes
  const refreshRates = () => { loadRates().then((r) => { if (alive.current) setRates(r); }).catch(() => { /* the copy shown stays */ }); };
  useEffect(() => {
    if (shows && !ratesAsked.current) { ratesAsked.current = true; refreshRates(); }
    // (the trip over, or another trip: the sheet goes with the button)
    if (!shows) setOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shows]);
  // The phone's Back closes the sheet instead of leaving Wander; so do Escape (an iPad's keyboard) and a screen change
  useBackToClose(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => { setOpen(false); }, [location.pathname]);

  if (!shows || !trip) return null;

  const offered = moneyCountries(trip.cities);
  const today = openingMoney(trip.cities, phoneDay(), trip.dates[trip.dates.length - 1]) ?? offered[0].currency;
  const currency: Foreign = chosen && offered.some((m) => m.currency === chosen) ? chosen : today;

  const openSheet = () => {
    setShift(screenShift());
    setPeople(1);
    // (opened again: the last amount, in its own money, until the first key; with nothing typed, today's money afresh)
    if (pad.text === "") { setChosen(today); setPad(START); }
    else { setChosen(currency); setPad((p) => ({ ...p, fresh: true })); }
    refreshRates();
    setOpen(true);
  };

  // A quiet extra at the bar's left end, as Phrases is at its right: today's money's sign, its word a size smaller than
  // the tabs'. 48 pt wide, a full fingertip. It stays in the bar while the sheet is open, so nothing on the bar moves.
  const barButton = (
    <button
      onClick={openSheet}
      data-convert-button
      className="shrink-0 w-12 min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 rounded-lg text-[#7a6b55] active:bg-[#f0ebe3]"
      aria-label="Convert money"
    >
      <span className="text-lg font-bold leading-none h-5 flex items-center" style={{ fontFamily: "serif" }} aria-hidden>{MONEY_SIGNS[today]}</span>
      <span data-convert-word className="text-[11px] leading-tight whitespace-nowrap" aria-hidden>Convert</span>
    </button>
  );
  if (!open) return barButton;

  // What each row shows: the typed row as typed, the other converted (a rate it can't stand behind shows as zero)
  const fromCur: Currency = pad.from === "local" ? currency : "USD";
  const typed = padAmount(pad.text);
  const converted = convert(typed, fromCur, pad.from === "local" ? "USD" : currency, rates) ?? 0;
  const amountOf = (row: Row) => (row === pad.from ? typed : converted);
  const shownOf = (row: Row) => (row === pad.from ? padShown(pad.text, fromCur) : money(converted, row === "local" ? currency : "USD"));
  const typingCur: Currency = pad.typing === "local" ? currency : "USD";
  // A split: each row's own amount shared, so the line agrees with both amounts above it; the country's money first
  const shares = eachOfBoth(amountOf("local"), amountOf("usd"), people, currency);
  const each = `Each: ${money(shares.local, currency)} · ${money(shares.usd, "USD")}`;
  const keys: PadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", shortcutKey(typingCur), "0", "back"];
  const tip = TIPS[currency];

  const press = (key: PadKey) => setPad((p) => {
    const cur: Currency = p.typing === "local" ? currency : "USD";
    // (the first key after a fresh start replaces the amount, never adds to it)
    return p.fresh ? { typing: p.typing, from: p.typing, text: padPress("", key, cur), fresh: false } : { ...p, text: padPress(p.text, key, cur) };
  });
  const tapRow = (row: Row) => setPad((p) => (p.typing === row ? p : { ...p, typing: row, fresh: true }));
  const tapNote = (note: number) => setPad({ typing: "local", from: "local", text: String(note), fresh: true });
  const clear = () => setPad((p) => ({ typing: p.typing, from: p.typing, text: "", fresh: false }));
  // Another country: dollars typed are kept and shown in the new money; an amount in the old money means nothing there
  const chooseMoney = (c: Foreign) => {
    if (c === currency) return;
    setChosen(c);
    setPad((p) => (p.from === "usd" ? p : START));
  };

  // (with the iPhone's screen left moved down the page, the foot sits that much lower: at the screen's real foot, as Phrases does)
  const footStyle = shift ? { bottom: `${(document.documentElement.clientHeight || window.innerHeight) - shift - screen.height}px` } : {};
  return <>{barButton}{createPortal(
    <>
      <div className="fixed inset-0 bg-black/20 z-[60]" style={footStyle} onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-label="Convert money"
        data-convert-sheet
        className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-0 bg-[#faf8f5] rounded-t-2xl shadow-2xl border border-b-0 border-[#e5ddd0] flex flex-col"
        style={{ width: "min(360px, calc(100vw - 24px))", maxHeight: "92vh", paddingBottom: "env(safe-area-inset-bottom, 0px)", ...footStyle }}
      >
        {/* The countries, in the order the trip visits them; one country is simply named */}
        <div className="flex items-center gap-1 pl-3 pr-1 pt-1 shrink-0">
          {offered.length > 1 ? (
            <div className="flex-1 min-w-0 flex items-center">
              {offered.map((m) => (
                <button key={m.currency} data-convert-country={m.currency} aria-pressed={m.currency === currency} onClick={() => chooseMoney(m.currency)}
                  className="min-h-[44px] pr-1 flex items-center">
                  <span className={`px-3 py-1 text-xs rounded-full transition-colors ${m.currency === currency ? "bg-[#514636] text-white" : "bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e5ddd0]"}`}>{m.country}</span>
                </button>
              ))}
            </div>
          ) : (
            <span className="flex-1 min-w-0 truncate text-sm font-medium text-[#3a3128]">{offered[0].country}</span>
          )}
          <button onClick={() => setOpen(false)} aria-label="Close" data-convert-close
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-[#6b5d4a] hover:bg-[#f0ebe3]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-3">
          {/* The two rows: the one being typed in is white with a dark edge. The other holds the answer, in the same dark
              ink: it's the number the person came for. A tap on the other row types there; both amounts stay until the
              first key. */}
          <div className="space-y-1.5 pt-0.5">
            {(["local", "usd"] as Row[]).map((row) => {
              const on = pad.typing === row;
              const shown = shownOf(row);
              return (
                <div key={row} className="relative">
                  <button data-convert-row={row} aria-pressed={on} onClick={() => tapRow(row)}
                    className={`w-full min-h-[52px] rounded-xl border pl-3 py-1.5 text-left transition-colors ${on ? "bg-white border-[#514636]" : "bg-transparent border-[#e5ddd0]"} ${on && pad.text ? "pr-12" : "pr-3"}`}>
                    <span className="block text-[11px] leading-tight text-[#6b5d4a]">{MONEY_NAMES[row === "local" ? currency : "USD"]}</span>
                    <span data-convert-amount={row} className="block font-semibold tabular-nums whitespace-nowrap leading-tight text-[#3a3128]" style={{ fontSize: amountSize(shown) }}>{shown}</span>
                  </button>
                  {on && pad.text !== "" && (
                    <button onClick={clear} aria-label="Clear" data-convert-clear
                      className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full text-[#6b5d4a] active:bg-[#f0ebe3]">
                      <span className="w-6 h-6 rounded-full bg-[#ece6dc] flex items-center justify-center">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" aria-hidden>
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* The notes a traveler is handed, each with its dollars; a tap puts that note in the country's row */}
          <div className="pt-2.5">
            <div className="text-[11px] leading-tight text-[#6b5d4a]">Banknotes</div>
            <div className="mt-1 flex gap-[2px] overflow-x-auto overflow-y-hidden overscroll-x-contain" style={{ scrollbarWidth: "none" }}>
              {NOTES[currency].map((note) => {
                const usd = money(convert(note, currency, "USD", rates) ?? 0, "USD");
                return (
                  <button key={note} data-convert-note={note} aria-label={`${money(note, currency)} note, ${usd}`} onClick={() => tapNote(note)}
                    className="flex-auto shrink-0 min-w-[44px] min-h-[44px] px-[2px] py-1 rounded-lg border border-[#e5ddd0] bg-white active:bg-[#f0ebe3] flex flex-col items-center justify-center">
                    {/* (11 pt and 44 wide, so Vietnam's six and Cambodia's seven fit across a phone: cut at the edge, the last looked clipped) */}
                    <span className="block text-[11px] leading-tight font-semibold text-[#3a3128]">{wholeFmt.format(note)}</span>
                    <span className="block text-[10px] leading-tight text-[#6b5d4a] tabular-nums">{usd}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* A split: the count back at 1 each time the sheet opens. The "each" line's room is kept, so the pad never jumps. */}
          <div className="pt-1.5 flex items-center gap-1">
            <span className="flex-1 text-sm text-[#514636]">Split between</span>
            <button onClick={() => setPeople((n) => Math.max(1, n - 1))} disabled={people <= 1} aria-label="One fewer" data-convert-split-less
              className="w-11 h-11 flex items-center justify-center rounded-full text-xl text-[#514636] active:bg-[#f0ebe3] disabled:opacity-30">−</button>
            <span data-convert-split-count className="w-7 text-center text-base font-semibold text-[#3a3128] tabular-nums">{people}</span>
            <button onClick={() => setPeople((n) => Math.min(SPLIT_MAX, n + 1))} disabled={people >= SPLIT_MAX} aria-label="One more" data-convert-split-more
              className="w-11 h-11 flex items-center justify-center rounded-full text-xl text-[#514636] active:bg-[#f0ebe3] disabled:opacity-30">+</button>
          </div>
          <div className="h-5">
            {people > 1 && amountOf(pad.typing) > 0 && <p data-convert-each className="text-sm leading-5 text-right text-[#3a3128] tabular-nums">{each}</p>}
          </div>

          {/* The pad: the corner key is the one this money needs most (000 for dong and riel, 00 for yen, the point for dollars) */}
          <div data-convert-pad className="pt-1.5 grid grid-cols-3 gap-1.5">
            {keys.map((k) => (
              <button key={k} data-convert-key={k} aria-label={k === "back" ? "Delete" : undefined} onClick={() => press(k)}
                style={{ touchAction: "manipulation" }}
                className="min-h-[50px] rounded-xl bg-white border border-[#e5ddd0] text-[22px] font-medium text-[#3a3128] tabular-nums select-none flex items-center justify-center active:bg-[#e9e2d6] active:border-[#d8cdbd]">
                {k === "back" ? (
                  <svg width="26" height="20" viewBox="0 0 26 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M8 1.5h15a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8L1.5 10z" /><path d="M12.5 6.5l7 7M19.5 6.5l-7 7" />
                  </svg>
                ) : k === "." ? (
                  // (the point drawn large: at the digits' size it was a speck at the key's foot)
                  <span className="text-[34px] leading-none -mt-3">.</span>
                ) : k}
              </button>
            ))}
          </div>

          {/* The rate and the country's line keep the same room whichever country is chosen (Japan has no line), so the
              pad's keys never move under a thumb when the country changes */}
          <div data-convert-foot className="min-h-[66px]">
            <p data-convert-rate className="pt-2.5 px-1 text-[11px] leading-snug text-[#6b5d4a]">{rateWords(currency, rates)}</p>
            {tip && <p data-convert-tip className="pt-1 px-1 text-[12px] leading-snug text-[#514636]" style={{ textWrap: "balance" }}>{tip}</p>}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )}</>;
}
