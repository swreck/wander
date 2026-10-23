/**
 * Who pays next, as two letters: "KL" in purple for Ken & Larisa, "AJ" in orange for Andy & Julie (Ken, Oct 15: "a nice
 * icon that is either AJ if Andy and Julie pay next or KL if Ken Larisa pay next… Make the KL version purple. And AJ
 * version orange."). The same badge on the bar's Budget tab, on Home's budget line and on the budget page, so seeing it
 * beside "Who pays next" says what the bar's means at a glance (user-andy1, Oct 16: "KL" alone didn't say "pays next").
 */
import { initialsOf } from "../lib/expenses";

/** Each couple's color, the same everywhere money shows (Ken, Oct 23: "Make the payer color equal the color in the home
 *  page") */
export const partyColor = (party: string) => { const who = initialsOf(party); return who === "KL" ? "#6b46c1" : who === "AJ" ? "#e07020" : "#7a6b55"; };
/** Shared, half each — the default — and "not shared", which is probably a mistake (Ken, Oct 23: "shared a blue color or
 *  whatever is appropriate to indicate default"); red-brown, never orange, so it isn't read as Andy & Julie's */
export const SHARED_BLUE = "#2f6db0";
export const CHECK_RED = "#a3361b";

export default function PayNextBadge({ party, className = "" }: { party: string; className?: string }) {
  const who = initialsOf(party);
  const color = partyColor(party);
  return (
    <span aria-hidden className={`inline-flex items-center justify-center h-[20px] min-w-[26px] px-1 rounded-full text-[10.5px] font-semibold tracking-[.04em] text-white align-middle ${className}`}
      style={{ background: color }}>{who}</span>
  );
}
