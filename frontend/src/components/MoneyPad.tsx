import { useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { MONEY_NAMES, type Currency, type Foreign, type Rates } from "../lib/rates";
import { MONEY_WORDS, padClear, padFigures, padKey, padTap, shortcutKey, type Pad, type PadKey, type PadRow } from "../lib/convertPad";

export type { Pad, PadRow } from "../lib/convertPad";

/**
 * The money pad (Nov 24 2026, batch 114): two rows, a money that isn't dollars and US dollars, typed with Wander's own
 * number pad, never the phone's keyboard. Convert (components/ConvertCard.tsx) and Budget's entry sheet
 * (pages/FamilyBudget.tsx) both draw this one, so the two can never drift apart. Ken (Nov 24): "Conversion should easily
 * go both directions… and expenses should use the same input panel to breed familiarity."
 * Both directions are plain at a glance: the row being typed in has a blinking caret after its amount; the other says
 * "tap to type dollars" (or dong, riel, yen) on its label's line; a round swap button sits in a rail at the right,
 * centred on the gap between them. With the keys folded nothing is being typed: no caret, no ✕, and the pressed row
 * says "tap to change".
 * The rules (a key, a tap on a row, the ✕) are in lib/convertPad.ts, where the phone's tests can reach them.
 * No fixed element and no keyboard maths here: the pad sits in its sheet's own flow.
 */

// (a long amount a size smaller, so twelve digits of dong still fit beside the ✕ on the smallest phone)
const amountSize = (shown: string) => (shown.length <= 11 ? "26px" : shown.length <= 14 ? "22px" : "18px");

// The caret blinks about once a second; on a phone that asks for reduced motion it stays, still
const CARET_CSS = "@keyframes money-pad-caret{50%{opacity:0}}.money-pad-caret{animation:money-pad-caret 1s steps(1,end) infinite}@media (prefers-reduced-motion:reduce){.money-pad-caret{animation:none}}";

/** A key on the pad, or a tap on a row, puts the phone's keyboard away first, so the two are never both up */
const keyboardAway = () => {
  const a = document.activeElement;
  if (a instanceof HTMLElement && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) a.blur();
};

export default function MoneyPad({ pad, setPad, local, rates, label, between, open = true, onOpen, onDone }: {
  pad: Pad;
  setPad: Dispatch<SetStateAction<Pad>>;
  /** the first row's money */
  local: Foreign;
  rates: Rates;
  /** each row's small label; the money's name when not given */
  label?: (row: PadRow) => string;
  /** what sits between the rows and the keys (Convert's banknotes and split) */
  between?: ReactNode;
  /** the keys shown (Budget folds them away); always, when not given */
  open?: boolean;
  /** a row or the swap button was tapped (Budget opens the keys) */
  onOpen?: () => void;
  /** "Done" under the keys, which folds them away (Budget) */
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
      {/* The two rows: the one being typed in is white with a dark edge and the caret. The other holds the answer, in the
          same dark ink: it's the number the person came for. A tap on the other row types there; both amounts stay until
          the first key. */}
      <div ref={block} data-amount-block className="pt-0.5">
        {/* (the rows leave a 44 pt rail at the right, 4 pt clear of them, for the swap button: a thumb aiming at it never
            lands on a row or its ✕) */}
        <div className="mr-12 space-y-1.5">
        {(["local", "usd"] as PadRow[]).map((row) => {
          const on = pad.typing === row;
          // (folded keys: nothing is being typed, so no caret and no ✕; the pressed row says a tap changes it)
          const typing = on && open;
          const shown = fig.shown(row);
          return (
            <div key={row} className="relative">
              <button type="button" data-convert-row={row} aria-pressed={on} onClick={() => tap(row)}
                className={`w-full min-h-[52px] rounded-xl border pl-3 py-1.5 text-left transition-colors ${on ? "bg-white border-[#514636]" : "bg-transparent border-[#e5ddd0]"} ${typing && pad.text ? "pr-12" : "pr-3"}`}>
                <span className="flex items-baseline gap-2 text-[11px] leading-tight text-[#6b5d4a]">
                  <span data-convert-label={row} className="whitespace-nowrap">{label ? label(row) : MONEY_NAMES[money(row)]}</span>
                  {!typing && <span data-convert-hint={row} className="ml-auto whitespace-nowrap">{on ? "tap to change" : `tap to type ${MONEY_WORDS[money(row)]}`}</span>}
                </span>
                <span className="flex items-center">
                  <span data-convert-amount={row} className="font-semibold tabular-nums whitespace-nowrap leading-tight text-[#3a3128]" style={{ fontSize: amountSize(shown) }}>{shown}</span>
                  {typing && <span data-convert-caret aria-hidden className="money-pad-caret shrink-0 ml-[3px] w-[2px] rounded-full bg-[#3a3128]" style={{ height: `calc(${amountSize(shown)} * 0.9)` }} />}
                </span>
              </button>
              {typing && pad.text !== "" && (
                <button type="button" onClick={() => setPad(padClear)} aria-label="Clear" data-convert-clear
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full text-[#6b5d4a] active:bg-[#f0ebe3]">
                  <span className="w-6 h-6 rounded-full bg-[#ece6dc] flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </span>
                </button>
              )}
              {/* The swap button, in the rail, centred on the gap between the rows (it reads as "swap these two"): a tap
                  does what a tap on the other row does */}
              {row === "usd" && (
                <button type="button" data-convert-swap aria-label={`Type in ${MONEY_WORDS[money(other)]}`} onClick={() => tap(other)}
                  className="absolute left-[calc(100%+4px)] -top-[3px] -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full">
                  <span className="w-8 h-8 rounded-full bg-white border border-[#e5ddd0] text-[#514636] flex items-center justify-center active:bg-[#f0ebe3]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M8 20V4M4 8l4-4 4 4" /><path d="M16 4v16M12 16l4 4 4-4" />
                    </svg>
                  </span>
                </button>
              )}
            </div>
          );
        })}
        </div>
      </div>

      {between}

      {/* The keys, folded away with a short height change when the sheet asks (never while Convert is open) */}
      <div data-pad-fold={open ? "open" : "folded"} inert={!open}
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="min-h-0 overflow-hidden">
          <div data-convert-pad className="pt-1.5 grid grid-cols-3 gap-1.5">
            {keys.map((k) => (
              <button type="button" key={k} data-convert-key={k} aria-label={k === "back" ? "Delete" : undefined} onClick={() => press(k)}
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
          {onDone && (
            <div className="flex justify-end">
              <button type="button" data-pad-done onClick={onDone} className="min-h-[44px] min-w-[44px] px-3 text-[15px] text-[#514636] underline underline-offset-2">Done</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
