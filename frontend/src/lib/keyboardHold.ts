/**
 * An iPhone raises the keyboard only for a box focused during the tap itself; a tap that opens Notes focuses its box a
 * moment later, on the next screen, and the keyboard stayed down (fresh notes audit, Oct 17: "the box focuses by
 * itself about 0.9 s later… on an iPhone the keyboard probably won't come up"). A hidden box focused in the tap holds
 * the keyboard up until the real one takes it. Whatever is typed into it before then is carried into the real box
 * (takeHeldWords) — on slow signal the first words went into the hidden box and were lost (fresh re-check, Oct 17:
 * "Fast typer" typed 5.9 s before the box appeared). Only a real iPhone can confirm the keyboard part.
 */
let held: HTMLInputElement | null = null;

export function holdKeyboard(ms = 20_000): void {
  try {
    held?.remove();
    const el = document.createElement("input");
    el.type = "text";
    el.setAttribute("aria-hidden", "true");
    el.tabIndex = -1;
    // (16 px: smaller and the iPhone zooms the page in)
    el.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;pointer-events:none;";
    document.body.appendChild(el);
    el.focus({ preventScroll: true });
    held = el;
    setTimeout(() => { if (held === el) { el.remove(); held = null; } }, ms);
  } catch { /* the box is focused on the next screen as before */ }
}

/** The words typed while the keyboard was held, once — the hidden box goes */
export function takeHeldWords(): string {
  const el = held;
  held = null;
  if (!el) return "";
  const words = el.value;
  el.remove();
  return words;
}
