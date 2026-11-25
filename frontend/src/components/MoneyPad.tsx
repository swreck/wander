import { useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { MONEY_NAMES, type Currency, type Foreign, type Rates } from "../lib/rates";
import { MONEY_WORDS, padClear, padFigures, padKey, padTap, shortcutKey, type Pad, type PadKey, type PadRow } from "../lib/convertPad";

export type { Pad, PadRow } from "../lib/convertPad";

/**
 * The money pad (Nov 24 2026, batch 114; its look, batch 115, Nov 25): two rows, a money that isn't dollars and US
 * dollars, typed with Wander's own number pad, never the phone's keyboard. Convert (components/ConvertCard.tsx) and
 * Budget's entry sheet (pages/FamilyBudget.tsx) both draw this one, so the two can never drift apart. Ken (Nov 24):
 * "Conversion should easily go both directions… and expenses should use the same input panel to breed familiarity."
 * One white card holds both rows, each with its country's flag in a rail at the left. The row being typed in is white
 * with a blinking caret after its amount; the other row is a shade darker. The round swap button sits in the flags'
 * rail, on the line between the rows: flag, swap, flag. With the keys folded nothing is being typed: no caret, no ✕.
 * A row says what a tap on it does to a screen reader ("tap to type dollars", "tap to change"); on screen the swap
 * button and the caret say it.
 * The rules (a key, a tap on a row, the ✕) are in lib/convertPad.ts, where the phone's tests can reach them.
 * No fixed element and no keyboard maths here: the pad sits in its sheet's own flow.
 */

// Each money's flag, in the rows' rail (decoration: the row's label names the money)
const FLAG: Record<Currency, string> = { VND: "🇻🇳", KHR: "🇰🇭", JPY: "🇯🇵", USD: "🇺🇸" };

// (a long amount a size smaller, so twelve digits of dong still fit beside the ✕ on the smallest phone)
const amountSize = (shown: string) => (shown.length > 14 ? 21 : shown.length > 11 ? 26 : 32);

// The caret blinks about once a second; on a phone that asks for reduced motion it stays, still
const CARET_CSS = "@keyframes money-pad-caret{50%{opacity:0}}.money-pad-caret{animation:money-pad-caret 1s steps(1,end) infinite}@media (prefers-reduced-motion:reduce){.money-pad-caret{animation:none}}";

/** A key on the pad, or a tap on a row, puts the phone's keyboard away first, so the two are never both up */
const keyboardAway = () => {
  const a = document.activeElement;
  if (a instanceof HTMLElement && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) a.blur();
};

/** The sheet's grabber at its top: the sign of a sheet that came up from the bottom (decoration only) */
export function Grabber() {
  return <div aria-hidden className="shrink-0 mx-auto mt-1.5 mb-[3px] w-9 h-[5px] rounded-[3px] bg-[#d3c9b9]" />;
}

/**
 * The countries as one segmented control, text only (Convert's header, Budget's entry sheet). Each segment is a full
 * 44 pt fingertip; the 34 pt track and the white chosen segment are drawn inside it. `attr` keeps each sheet's own
 * test mark (data-convert-country, data-money-chip).
 */
export function Segments<T extends string>({ items, chosen, onChoose, attr, label }: {
  items: { value: T; name: string }[];
  chosen: T;
  onChoose: (value: T) => void;
  attr: "data-convert-country" | "data-money-chip";
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="relative flex-1 min-w-0 h-11 flex items-center px-0.5">
      <span aria-hidden className="absolute inset-x-0 top-[5px] h-[34px] rounded-[17px] bg-[#ede6db]" />
      {items.map((it) => {
        const on = it.value === chosen;
        return (
          <button key={it.value} type="button" {...{ [attr]: it.value }} aria-pressed={on} onClick={() => onChoose(it.value)}
            className="relative flex-1 min-w-0 h-11 flex items-center">
            <span className={`w-full h-[30px] px-1 rounded-[15px] flex items-center justify-center text-[14px] leading-none truncate transition-colors ${on
              ? "bg-white font-semibold text-[#3a3128] shadow-[0_1px_3px_rgba(58,49,40,.18),0_0_0_.5px_rgba(58,49,40,.06)]"
              : "font-medium text-[#6b5d4a]"}`}>{it.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function MoneyPad({ pad, setPad, local, rates, label, rate, between, open = true, onOpen, onDone }: {
  pad: Pad;
  setPad: Dispatch<SetStateAction<Pad>>;
  /** the first row's money */
  local: Foreign;
  rates: Rates;
  /** each row's small label; the money's name when not given */
  label?: (row: PadRow) => string;
  /** the rate's words, on the line right under the rows */
  rate?: string;
  /** what sits between the rate line and the keys (Convert's banknotes and split) */
  between?: ReactNode;
  /** the keys shown (Budget folds them away); always, when not given */
  open?: boolean;
  /** a row or the swap button was tapped (Budget opens the keys) */
  onOpen?: () => void;
  /** "Done" at the right of the rate's line, which folds the keys away (Budget) */
  onDone?: () => void;
}) {
  const block = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);
  // (the keys opened again: the rows are brought into the sheet's view, never left above it)
  useEffect(() => {
    if (open && !wasOpen.current) block.current?.scrollIntoView({ block: "nearest" });
    wasOpen.current = open;
  }, [open]);

  const money = (row: PadRow): Currency => (row === "local" ? local : "USD");
  const fig = padFigures(pad, local, rates);
  const other: PadRow = pad.typing === "local" ? "usd" : "local";
  // The corner key is the one this money needs most (000 for dong and riel, 00 for yen, the point for dollars)
  const keys: PadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", shortcutKey(money(pad.typing)), "0", "back"];
  const press = (key: PadKey) => { keyboardAway(); setPad((p) => padKey(p, key, local)); };
  const tap = (row: PadRow) => { keyboardAway(); setPad((p) => padTap(p, row)); onOpen?.(); };

  return (
    <>
      <style>{CARET_CSS}</style>
      {/* The two rows in one card. The answer is in the same dark ink as what is typed: it's the number the person came
          for. A tap on the other row types there; both amounts stay until the first key. */}
      <div ref={block} data-amount-block className="relative bg-white border border-[#e5ddd0] rounded-[18px] overflow-hidden">
        {(["local", "usd"] as PadRow[]).map((row) => {
          const on = pad.typing === row;
          // (folded keys: nothing is being typed, so no caret and no ✕)
          const typing = on && open;
          const shown = fig.shown(row);
          const name = label ? label(row) : MONEY_NAMES[money(row)];
          // (what a tap does, for a screen reader: the words that used to sit on the row's label line)
          const does = typing ? "" : on ? ", tap to change" : `, tap to type ${MONEY_WORDS[money(row)]}`;
          const size = amountSize(shown);
          return (
            <div key={row} className={`relative ${row === "usd" ? "border-t border-[#e5ddd0]" : ""}`}>
              <button type="button" data-convert-row={row} aria-pressed={on} aria-label={`${name}, ${shown}${does}`} onClick={() => tap(row)}
                className={`w-full h-[68px] [@media(max-height:700px)]:h-[56px] flex items-center text-left ${on ? "bg-white" : "bg-[#f7f3ec]"}`}>
                <span aria-hidden className="w-[52px] shrink-0 text-center text-[24px] leading-none">{FLAG[money(row)]}</span>
                <span className="flex-1 min-w-0">
                  <span data-convert-label={row} className={`block text-[13px] font-medium leading-4 whitespace-nowrap truncate ${on ? "text-[#514636]" : "text-[#6b5d4a]"}`}>{name}</span>
                  <span className="flex items-center h-[38px]">
                    <span data-convert-amount={row} className="font-semibold tabular-nums whitespace-nowrap tracking-[-0.5px] text-[#3a3128]" style={{ fontSize: `${size}px`, lineHeight: "38px" }}>{shown}</span>
                    {typing && <span data-convert-caret aria-hidden className="money-pad-caret shrink-0 ml-[3px] w-[2px] rounded-[1px] bg-[#3a3128]" style={{ height: `${Math.round(size * 0.875)}px` }} />}
                  </span>
                </span>
                {/* (the ✕'s room, kept on both rows so the two amounts line up) */}
                <span aria-hidden className="w-12 shrink-0" />
              </button>
              {typing && pad.text !== "" && (
                <button type="button" onClick={() => setPad(padClear)} aria-label="Clear" data-convert-clear
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full text-[#6b5d4a]">
                  <span className="w-[22px] h-[22px] rounded-full bg-[#e9e2d7] flex items-center justify-center active:bg-[#ddd3c4]">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </span>
                </button>
              )}
            </div>
          );
        })}
        {/* The swap button, in the flags' rail, centred on the line between the rows (it reads as "swap these two"): a
            tap does what a tap on the other row does */}
        <button type="button" data-convert-swap aria-label={`Type in ${MONEY_WORDS[money(other)]}`} onClick={() => tap(other)}
          className="absolute z-[1] left-1 top-[68.5px] [@media(max-height:700px)]:top-[56.5px] -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full">
          <span className="w-8 h-8 rounded-full bg-white border border-[#ddd3c4] shadow-[0_1px_2px_rgba(58,49,40,.12)] text-[#3a3128] flex items-center justify-center active:bg-[#f0ebe3]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 20V4M4 8l4-4 4 4" /><path d="M16 4v16M12 16l4 4 4-4" />
            </svg>
          </span>
        </button>
      </div>

      {/* The rate, right under the rows; on Budget, "Done" at its right while the keys are up (it keeps its room when
          they fold, so the line never reflows) */}
      {onDone ? (
        // (40 tall, so Done's 44 pt target reaches 2 pt above and below it: clear of the rows' card and of the keys)
        <div className="mt-0.5 min-h-[40px] pl-1 flex items-center gap-2">
          {rate !== undefined && <p data-convert-rate className="flex-1 min-w-0 text-[13px] leading-[18px] text-[#6b5d4a]">{rate}</p>}
          <button type="button" data-pad-done onClick={onDone} tabIndex={open ? 0 : -1} aria-hidden={!open}
            className="shrink-0 ml-auto -my-0.5 h-11 min-w-[44px] px-1 text-[15px] font-semibold text-[#514636]" style={{ visibility: open ? "visible" : "hidden" }}>Done</button>
        </div>
      ) : rate !== undefined ? (
        <p data-convert-rate className="mt-[7px] [@media(max-height:700px)]:mt-1 mx-1 text-[13px] leading-[18px] text-[#6b5d4a]">{rate}</p>
      ) : null}

      {between}

      {/* The keys, folded away with a short height change when the sheet asks (never while Convert is open) */}
      <div data-pad-fold={open ? "open" : "folded"} inert={!open}
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="min-h-0 overflow-hidden">
          <div data-convert-pad className={`${onDone ? "" : "pt-1.5"} grid grid-cols-3 gap-2 [@media(max-height:700px)]:gap-1.5`}>
            {keys.map((k) => (
              <button type="button" key={k} data-convert-key={k} aria-label={k === "back" ? "Delete" : undefined} onClick={() => press(k)}
                style={{ touchAction: "manipulation", ...(k === "." ? { lineHeight: 0, paddingBottom: 20 } : {}) }}
                className={`h-[50px] [@media(max-height:700px)]:h-[48px] rounded-[14px] bg-[#efe8de] text-[#241f1a] tabular-nums select-none flex items-center justify-center transition-transform duration-75 active:bg-[#e0d6c6] active:scale-[0.97] ${
                  k === "." ? "text-[44px] font-semibold" : k === "000" || k === "00" ? "text-[22px] font-medium tracking-[.5px]" : "text-[26px] font-normal"}`}>
                {k === "back" ? (
                  <svg width="26" height="20" viewBox="0 0 26 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M8 1.5h15a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8L1.5 10z" /><path d="M12.5 6.5l7 7M19.5 6.5l-7 7" />
                  </svg>
                ) : k}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
