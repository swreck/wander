/**
 * One microphone for the whole app. Scout and Notes each made their own speech recognizer; on an iPhone a second one
 * in the same session could listen (the microphone showed in the Dynamic Island) and never send back a word — Ken,
 * Oct 2: Talk worked in Notes, then Scout's mic heard nothing. Now there's one recognizer, started again for whoever
 * asks; a new asker takes over from the last (its words stop), and a screen hands it back when it goes.
 *
 * Start it from the tap itself, never after a delay: an iPhone only lets a page listen in direct answer to a touch.
 */
export type VoiceHandlers = {
  /** everything heard since this start, as it comes */
  onText: (said: string) => void;
  /** listening ended (stopped, finished, or taken over) */
  onEnd: () => void;
  /** couldn't listen: "not-allowed" when the microphone is refused */
  onError?: (error: string) => void;
  /** a few seconds listening with no words yet */
  onQuiet?: () => void;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const Recognizer = (): any => (typeof window === "undefined" ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null);

let rec: any = null;
let owner: VoiceHandlers | null = null;
let next: VoiceHandlers | null = null;
let running = false;
let quietTimer: ReturnType<typeof setTimeout> | null = null;

export const voiceSupported = (): boolean => !!Recognizer();

// Words a sentence seldom ends on: after a pause on one of these the talk goes on ("we went to … Kyoto"), so the next
// piece's capital is kept as a name's and no period goes in
const GOES_ON = new Set(("a an the to of in on at by for from with into onto about over under after before like and but " +
  "or nor so because than that which who whose whom my our your his her their its is was are were be been am very some " +
  "any no not as if when while where mr mrs ms dr st i we he she they then will would could should can through until " +
  "um uh").split(" "));

/**
 * One recording's pieces as one text. An iPhone hears a long recording in pieces, one per pause, each starting with a
 * capital and no space; joined as they came, Ken's note read "we met todayThe wife…" and "her husbandMarried into…"
 * (Oct 14). Between pieces: always a space; and a period when the piece before ends on an ordinary word and the next
 * starts with a capital — the iPhone's sign of a fresh start — unless the one before ends on a word a sentence seldom
 * ends on (GOES_ON). A pause mid-sentence can still get a period ("her husband. Married into…"): Wander can't hear the
 * difference. A computer's pieces already start with a space and are joined as they are. The words are never changed.
 */
export function joinSaid(pieces: string[]): string {
  let out = "";
  for (const p of pieces) {
    if (!p) continue;
    if (!out || /\s$/.test(out) || /^\s/.test(p)) { out += p; continue; }
    // (only the end is read: this runs on every word the phone sends, over the whole recording — verify51)
    const end = out.slice(-60);
    const last = (end.match(/([A-Za-z']+)\W*$/)?.[1] || "").toLowerCase();
    const fresh = /^[A-Z]/.test(p) && !/[.!?…,;:—-]["')\]]*$/.test(end) && !!last && !GOES_ON.has(last);
    out += (fresh ? ". " : " ") + p;
  }
  return out;
}

function clearQuiet() {
  if (quietTimer) { clearTimeout(quietTimer); quietTimer = null; }
}

function begin(h: VoiceHandlers): boolean {
  owner = h;
  try {
    rec.start();
    running = true;
    clearQuiet();
    quietTimer = setTimeout(() => { if (owner === h) h.onQuiet?.(); }, 6000);
    return true;
  } catch {
    owner = null;
    running = false;
    return false;
  }
}

function make() {
  const R = Recognizer();
  if (!R) return null;
  const r = new R();
  r.continuous = true;
  r.interimResults = true;
  r.lang = "en-US";
  r.onresult = (e: any) => {
    clearQuiet();
    owner?.onText(joinSaid(Array.from(e.results).map((x: any) => String(x[0].transcript ?? ""))));
  };
  r.onerror = (e: any) => { owner?.onError?.(e?.error || "error"); };
  r.onend = () => {
    running = false;
    clearQuiet();
    const was = owner;
    owner = null;
    was?.onEnd();
    // someone asked while it was still finishing: they get it now
    if (next) { const n = next; next = null; begin(n); }
  };
  return r;
}

/** Listen for `h`. Returns false when this phone can't. */
export function startVoice(h: VoiceHandlers): boolean {
  if (!rec) rec = make();
  if (!rec) return false;
  if (running) {
    // taken over: the last asker's words stop; this one starts once the recognizer has finished
    const was = owner;
    owner = null;
    was?.onEnd();
    next = h;
    try { rec.stop(); } catch { /* already stopping */ }
    return true;
  }
  return begin(h);
}

/** Stop listening for `h` (or for whoever is, without `h`). Words already heard stay where they went. */
export function stopVoice(h?: VoiceHandlers) {
  if (next && (!h || next === h)) next = null;
  if (!rec || !running || (h && owner !== h)) return;
  try { rec.stop(); } catch { /* already stopped */ }
}
