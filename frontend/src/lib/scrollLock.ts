/**
 * The page behind a full-screen view stays still — counted, so views on top of each other (a stop's photos opened from
 * "Play the day") give it back only when the last one closes (tourist63, Oct 15: closing both at once left the day
 * page unable to scroll).
 */
let held = 0;
let before = "";
export function lockScroll(): () => void {
  if (held++ === 0) { before = document.body.style.overflow; document.body.style.overflow = "hidden"; }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--held === 0) document.body.style.overflow = before;
  };
}
