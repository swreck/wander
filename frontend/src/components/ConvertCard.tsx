import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";
import useBackToClose from "../hooks/useBackToClose";
import { screenShift } from "../lib/screenShift";
import { convert, loadRates, money, rateWords, savedRates, ROUND_RATES, MONEY_SIGNS, type Foreign, type Rates } from "../lib/rates";
import {
  convertTripFrom, eachOfBoth, moneyCountries, NOTES, NOTE_TINT, openingMoney, padFigures, padNewMoney, padStart, rememberConvertTrip,
  rememberedConvertTrip, showsConvert, SPLIT_MAX, type ConvertTrip, type Pad,
} from "../lib/convertPad";
import MoneyPad, { Grabber, Segments } from "./MoneyPad";
import { BAR_ICON, BAR_LABEL, BAR_SLOT, barTone, barWeight } from "./barSlot";

/**
 * Convert, the money calculator (Nov 22 2026; trip-data/december-plan/convert-spec.md). The bar's button and its sheet,
 * one component, so everything pinned to the screen's foot stays in one place (the iPhone rule). On the bar, one of its
 * equal slots, between Budget and Phrases: a banknote with today's money's sign in it, "Convert" under it (batch 115).
 * The sheet: two rows, the country's money and dollars, typed with its own number pad (never the phone's keyboard), the
 * rate with its day, the banknotes a traveler is handed, a split, and the keys last. Shown before the trip and on every
 * day of it; never once it's over, so the finished trip's bar has no Convert.
 */

// The phone's own date, for today's money
const phoneDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const openTripId = () => { try { return localStorage.getItem("wander:last-trip-id"); } catch { return null; } };

// One line about the money a traveler is handed there (sources in the spec); none for Japan
const TIPS: Partial<Record<Foreign, string>> = {
  VND: "The 20,000 and 500,000 notes are both blue. Count the zeros.",
  KHR: "Dollars are widely taken in Cambodia. Change under a dollar comes back in riel.",
};

// The pad's state and its rules (typing, from, fresh) are lib/convertPad.ts's, shared with Budget's entry sheet
const START: Pad = padStart("local");

const wholeFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

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

  // One of the bar's equal slots, between Budget and Phrases (batch 115): a banknote outline with today's money's sign in
  // it, "Convert" under it. It stays in the bar while the sheet is open, so nothing on the bar moves.
  const barButton = (
    <button
      onClick={openSheet}
      data-convert-button
      className={`${BAR_SLOT} ${barTone(false)}`}
      aria-label="Convert money"
    >
      {/* (the app's own face: iOS's serif face draws ₫ small and faint; Ken's iPhone, Nov 24) */}
      <span className={BAR_ICON} aria-hidden>
        <span className="w-[23px] h-4 rounded-[3px] border-[1.8px] border-current flex items-center justify-center text-[12.5px] font-bold leading-none">{MONEY_SIGNS[today]}</span>
      </span>
      <span data-convert-word className={`${BAR_LABEL} ${barWeight(false)}`} aria-hidden>Convert</span>
    </button>
  );
  if (!open) return barButton;

  // What each row holds: the typed row as typed, the other converted (MoneyPad draws them)
  const { amount: amountOf } = padFigures(pad, currency, rates);
  // A split: each row's own amount shared, so the line agrees with both amounts above it; the country's money first
  const shares = eachOfBoth(amountOf("local"), amountOf("usd"), people, currency);
  const each = `Each: ${money(shares.local, currency)} · ${money(shares.usd, "USD")}`;
  const tip = TIPS[currency];

  const tapNote = (note: number) => setPad({ typing: "local", from: "local", text: String(note), fresh: true });
  // Another country: dollars typed are kept and shown in the new money; an amount in the old money means nothing there
  const chooseMoney = (c: Foreign) => {
    if (c === currency) return;
    setChosen(c);
    setPad(padNewMoney);
  };

  // (with the iPhone's screen left moved down the page, the foot sits that much lower: at the screen's real foot, as Phrases does)
  const footStyle = shift ? { bottom: `${(document.documentElement.clientHeight || window.innerHeight) - shift - screen.height}px` } : {};
  // Vietnam's line starts with the two blue notes' own stripes, the 20,000's and the 500,000's
  const blues = currency === "VND" ? [NOTE_TINT.VND?.[20_000]?.edge, NOTE_TINT.VND?.[500_000]?.edge].filter((c): c is string => !!c) : [];
  // (three notes a row; Cambodia's seven, four a row)
  const columns = NOTES[currency].length > 6 ? 4 : 3;

  return <>{barButton}{createPortal(
    <>
      <div className="fixed inset-0 bg-[rgba(36,31,26,.38)] z-[60]" style={footStyle} onClick={() => setOpen(false)} />
      {/* The sheet: the screen's full width (a phone's; an iPad's is the bar's width), over the bar, from the bottom.
          The keys are its last part, so they sit at the same place whatever the country: Japan's shorter notes and
          missing line move the sheet's top, never the keys. */}
      <div
        role="dialog"
        aria-label="Convert money"
        data-convert-sheet
        // (a short screen, the 375×667 kind: the sheet may reach nearly to the top, and its parts sit a little closer, so
        // it fits whole and the keys never move when a row is tapped; every key still 48 tall, every button 44)
        className="fixed z-[60] inset-x-0 mx-auto bottom-0 w-full max-w-lg max-h-[92vh] [@media(max-height:700px)]:max-h-[calc(100dvh-8px)] bg-[#faf8f5] rounded-t-[24px] flex flex-col"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)", boxShadow: "0 -10px 30px rgba(36,31,26,.18)", ...footStyle }}
      >
        {/* The countries, in the order the trip visits them, as one segmented control; one country is simply named */}
        <div className="shrink-0 px-4">
          <Grabber />
          <div className="h-11 flex items-center gap-2.5">
            {offered.length > 1 ? (
              <Segments items={offered.map((m) => ({ value: m.currency, name: m.country }))} chosen={currency} onChoose={chooseMoney} attr="data-convert-country" label="Which money" />
            ) : (
              <span className="flex-1 min-w-0 truncate text-[15px] font-semibold text-[#3a3128]">{offered[0].country}</span>
            )}
            <button onClick={() => setOpen(false)} aria-label="Close" data-convert-close
              className="shrink-0 -mr-[7px] w-11 h-11 flex items-center justify-center rounded-full text-[#6b5d4a]">
              <span className="w-[30px] h-[30px] rounded-full bg-[#ede6db] flex items-center justify-center active:bg-[#e0d6c6]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </span>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-2.5 [@media(max-height:700px)]:pt-1">
          {/* The two rows, the rate and the pad (MoneyPad, shared with Budget's entry sheet), with the banknotes, the
              country's line and the split between */}
          <MoneyPad pad={pad} setPad={setPad} local={currency} rates={rates} rate={rateWords(currency, rates)} between={<>
          {/* The notes a traveler is handed, each in its note's own colour with its dollars; a tap puts that note in the
              country's row */}
          <p className="mt-3.5 mb-1.5 [@media(max-height:700px)]:mt-1.5 [@media(max-height:700px)]:mb-1 mx-1 text-[13px] font-semibold text-[#6b5d4a]">Banknotes</p>
          <div className="grid gap-2 [@media(max-height:700px)]:gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {NOTES[currency].map((note) => {
              const usd = money(convert(note, currency, "USD", rates) ?? 0, "USD");
              const tint = NOTE_TINT[currency]?.[note];
              // (a value in use in two issues: the second issue's ink is a stripe of its own at the right)
              const stripe = tint ? tint.edge : "#d9cfbf";
              return (
                <button key={note} data-convert-note={note} data-note-tint={tint ? tint.edge : undefined} data-note-tint2={tint?.edge2} aria-label={`${money(note, currency)} note, ${usd}`} onClick={() => tapNote(note)}
                  style={{ background: tint ? tint.fill : "#fff", boxShadow: "inset 0 0 0 1px rgba(36,31,26,.10)" }}
                  className="relative h-[46px] [@media(max-height:700px)]:h-11 min-w-0 rounded-xl overflow-hidden pl-[18px] pr-1 flex flex-col items-start justify-center text-left active:scale-[0.97] active:brightness-[0.92] transition-transform duration-75">
                  <span className="block text-[15px] leading-[18px] font-semibold text-[#241f1a] tabular-nums">{wholeFmt.format(note)}</span>
                  <span className="block text-[12px] leading-[15px] font-medium text-[#3a3128] tabular-nums">{usd}</span>
                  <span aria-hidden data-note-stripe className="absolute left-0 inset-y-0 w-[7px]" style={{ background: stripe }} />
                  {tint?.edge2 && <span aria-hidden data-note-stripe2 className="absolute right-0 inset-y-0 w-[7px]" style={{ background: tint.edge2 }} />}
                </button>
              );
            })}
          </div>
          {tip && (
            <p data-convert-tip className="mt-2 [@media(max-height:700px)]:mt-1.5 mx-1 flex gap-[7px] text-[13px] leading-[18px] text-[#514636]" style={{ textWrap: "balance" }}>
              {blues.length > 0 && <span aria-hidden className="shrink-0 mt-1 flex gap-0.5">{blues.map((c) => <span key={c} className="w-[9px] h-[9px] rounded-[2px]" style={{ background: c }} />)}</span>}
              <span>{tip}</span>
            </p>
          )}

          {/* A split: the count back at 1 each time the sheet opens. The "each" line's room is kept, so the pad never jumps. */}
          <div className="mt-2.5 [@media(max-height:700px)]:mt-1 h-11 flex items-center">
            <span className="flex-1 text-[15px] text-[#3a3128]">Split between</span>
            <div className="relative flex items-center">
              <span aria-hidden className="absolute inset-x-0 top-[5px] h-[34px] rounded-[17px] bg-[#efe8de]" />
              <button onClick={() => setPeople((n) => Math.max(1, n - 1))} disabled={people <= 1} aria-label="One fewer" data-convert-split-less
                className="relative w-11 h-11 flex items-center justify-center text-[20px] text-[#514636] active:opacity-60 disabled:text-[#c2b7a6]">−</button>
              <span data-convert-split-count className="relative w-[26px] text-center text-[17px] font-semibold text-[#3a3128] tabular-nums">{people}</span>
              <button onClick={() => setPeople((n) => Math.min(SPLIT_MAX, n + 1))} disabled={people >= SPLIT_MAX} aria-label="One more" data-convert-split-more
                className="relative w-11 h-11 flex items-center justify-center text-[20px] text-[#514636] active:opacity-60 disabled:text-[#c2b7a6]">+</button>
            </div>
          </div>
          <div className="h-4">
            {people > 1 && amountOf(pad.typing) > 0 && <p data-convert-each className="text-[13px] leading-4 text-right text-[#3a3128] tabular-nums">{each}</p>}
          </div>
          </>} />
        </div>
      </div>
    </>,
    document.body,
  )}</>;
}
