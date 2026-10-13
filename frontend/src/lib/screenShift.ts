// How far down the page the iPhone's screen has been left, in an upright iPhone Home Screen app with no box being typed
// in. After the keyboard has been up, iOS can leave the screen moved down over the page and never move it back, while
// everything pinned to the screen stays drawn from the page's top — so the bottom bar, Scout's slim bar and Scout's
// panel all sit that much too high (Ken's iPhone, Oct 13: Scout's panel ended at 586 of 874 with the screen moved 288;
// the bar at 595 on Home). Normally 0, and then nothing is placed differently.
export function screenShift(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv || (navigator as any).standalone !== true) return 0;
  // (an iPad, a phone on its side, or zoomed in with two fingers: left alone)
  if (screen.width >= 700 || window.innerWidth !== screen.width || Math.abs(vv.scale - 1) > 0.01) return 0;
  const a = document.activeElement as HTMLElement | null;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return 0;
  const shift = Math.round(vv.offsetTop);
  return shift > 1 && shift < screen.height ? shift : 0;
}
