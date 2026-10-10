/**
 * One ask per visit (Oct 10 audit — Julie's next open stacked the full-screen "You leave in 4 days" card, then Home's
 * "Want a quick look…" offer, then Scout's packing offer; Ken: "a first impression cannot cause confusion"). The leaving
 * card goes first (it's for today only); the "Show me around" offer waits until the card has decided, and stays away
 * on a visit the card showed — not counted as one of its three offers. Scout's own first word only shows when someone
 * opens Scout, so it never interrupts. A "visit" is the next 20 minutes: an iPhone can keep the app's session for days,
 * and a session-long rule would hold the tour offer back every day the card shows.
 */
const KEY = "wander:visit-ask";
const VISIT = 20 * 60_000;
let taken: { name: string; at: number } | null = null;
let leavingSettled = false;
const waiting = new Set<() => void>();

/** Who has this visit's ask ("leaving" | "tour"), if anyone */
export function visitAsk(now = Date.now()): string | null {
  let t = taken;
  try { const s = localStorage.getItem(KEY); if (s) t = JSON.parse(s); } catch { /* private window: this page's memory */ }
  return t && now - t.at < VISIT ? t.name : null;
}
/** Take this visit's ask; false when something else already has it */
export function takeVisitAsk(name: string, now = Date.now()): boolean {
  const holder = visitAsk(now);
  if (holder && holder !== name) return false;
  taken = { name, at: now };
  try { localStorage.setItem(KEY, JSON.stringify(taken)); } catch { /* private window: this page's memory */ }
  return true;
}
/** The leaving card has decided for this visit (shown or not) */
export function leavingCardSettled() {
  leavingSettled = true;
  for (const f of [...waiting]) f();
  waiting.clear();
}
export const isLeavingCardSettled = () => leavingSettled;
export function onLeavingCardSettled(f: () => void): () => void {
  if (leavingSettled) { f(); return () => {}; }
  waiting.add(f);
  return () => { waiting.delete(f); };
}

/** The "Set up Face ID" card comes next, after the leaving card and before the tour offer: how they'll get in matters
 *  more than a tour (Oct 10 re-audit: in iPhone Safari the tour offer and the Face ID card showed together, and in the
 *  Home Screen app the Face ID card sat under the leaving card). It takes the visit's ask as "faceid" when it shows. */
let faceIdSettled = false;
const faceIdWaiting = new Set<() => void>();
export function faceIdCardSettled() {
  faceIdSettled = true;
  for (const f of [...faceIdWaiting]) f();
  faceIdWaiting.clear();
}
export const isFaceIdCardSettled = () => faceIdSettled;
export function onFaceIdCardSettled(f: () => void): () => void {
  if (faceIdSettled) { f(); return () => {}; }
  faceIdWaiting.add(f);
  return () => { faceIdWaiting.delete(f); };
}
