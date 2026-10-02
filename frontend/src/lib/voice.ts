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
    owner?.onText(Array.from(e.results).map((x: any) => x[0].transcript).join(""));
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
