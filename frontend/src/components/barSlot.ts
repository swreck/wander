/**
 * One slot on the bottom bar (batch 115, Nov 25 2026): the bar's own tabs (BottomNav.tsx), Convert (ConvertCard.tsx)
 * and Phrases (PhraseCard.tsx) all draw their button with these, so every item is the same width, the same height and
 * the same type, however many the trip has. Selected: a soft pill behind it, the icon filled, the label a weight
 * heavier and darker (selected and not used to differ only by two browns no one could tell apart at a glance).
 */
// (50 pt tall in the bar's 56 pt row, so the selected pill stands clear of the hairline above it; 54 was for a taller,
// floating bar not built yet)
export const BAR_SLOT = "relative flex-1 basis-0 min-w-0 h-[50px] rounded-[19px] flex flex-col items-center justify-center gap-[3px] transition-colors";
/** An empty slot that keeps an item's room while it isn't known yet (Phrases, while the trip is read) */
export const BAR_KEEP = "flex-1 basis-0 min-w-0 h-[50px]";
/** The icon's box, the same height in every slot so the labels share one line */
export const BAR_ICON = "h-[26px] flex items-center justify-center";
/** The label: 11 pt, 10 pt on a phone under 390 pt wide so "Phrases" and "Convert" fit an eighth of it */
export const BAR_LABEL = "block text-[11px] leading-[13px] tracking-[-0.2px] whitespace-nowrap max-[389px]:text-[10px] max-[389px]:tracking-[-0.3px]";
/** The slot's colours: the pill and dark ink when selected, the bar's muted brown when not */
export const barTone = (on: boolean) => (on ? "bg-[#ece4d6] text-[#3a3128]" : "text-[#6b5d4a] active:bg-[#f3eee6]");
/** The label's weight */
export const barWeight = (on: boolean) => (on ? "font-semibold" : "font-medium");
