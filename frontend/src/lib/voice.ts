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
// Listening goes on until the person taps stop (Ken, Oct 15: "When dictating a note or message to scout, wander seems to
// time out and iPhone sleeps while dictating"). An iPhone ends a recording on its own after a pause; Wander starts it
// again for the same person, the words heard so far carried in front of the new ones.
let wanted = false;          // the person hasn't stopped it
let carried = "";            // words from the recordings before this one, since they tapped the mic
let lastSaid = "";           // everything heard in this recording so far
let startedAt = 0;
let quickEnds = 0;           // recordings that ended within a second of starting, in a row — then it isn't a pause

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

// The screen stays on while Wander listens (Oct 15: Larisa was dictating a long "Tell Ken…" to Scout, the phone's
// screen went off mid-sentence, and the iPhone stopped listening — "all wasted time", Ken). Asked for on the tap that
// starts listening, asked again if Wander comes back to the screen still listening, let go when listening ends. A phone
// without it (or Low Power Mode) just behaves as before.
// And while someone is writing in any box — the keyboard's own microphone is the iPhone's, not Wander's, and Wander isn't
// told it's listening (Ken, Oct 15). On while a text box has the cursor and words are coming; let go when it loses the
// cursor, or after 3 minutes with no new words.
let wake: any = null;
let writing = false;
let writingTimer: ReturnType<typeof setTimeout> | null = null;
const needAwake = () => running || wanted || writing;
function holdAwake() {
  if (wake || typeof navigator === "undefined" || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  (navigator as any).wakeLock.request("screen")
    .then((w: any) => { if (!needAwake()) { w.release?.().catch?.(() => {}); return; } wake = w; w.addEventListener?.("release", () => { if (wake === w) wake = null; }); })
    .catch(() => { /* not allowed now: the screen may sleep as before */ });
}
function letSleep() {
  if (needAwake()) return;
  const w = wake; wake = null;
  try { w?.release?.().catch?.(() => {}); } catch { /* already released */ }
}
const isBox = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && /^(text|search|)$/.test(t.type)) || (t instanceof HTMLElement && t.isContentEditable);
function stillWriting() {
  writing = true;
  holdAwake();
  if (writingTimer) clearTimeout(writingTimer);
  writingTimer = setTimeout(() => { writing = false; letSleep(); }, 3 * 60_000);
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (needAwake() && document.visibilityState === "visible") holdAwake(); });
  document.addEventListener("focusin", (e) => { if (isBox(e.target)) stillWriting(); });
  document.addEventListener("input", (e) => { if (isBox(e.target)) stillWriting(); }, true);
  document.addEventListener("focusout", (e) => {
    if (!isBox(e.target)) return;
    // (to another box: still writing)
    setTimeout(() => { if (!isBox(document.activeElement)) { writing = false; if (writingTimer) clearTimeout(writingTimer); letSleep(); } }, 0);
  });
}

function clearQuiet() {
  if (quietTimer) { clearTimeout(quietTimer); quietTimer = null; }
}

function begin(h: VoiceHandlers, again = false): boolean {
  owner = h;
  if (!again) { carried = ""; quickEnds = 0; }
  lastSaid = "";
  try {
    rec.start();
    running = true;
    wanted = true;
    startedAt = Date.now();
    holdAwake();
    clearQuiet();
    // ("no words yet" only before the first word — never in a pause mid-sentence, after listening went on by itself)
    if (!carried) quietTimer = setTimeout(() => { if (owner === h) h.onQuiet?.(); }, 6000);
    return true;
  } catch {
    owner = null;
    running = false;
    wanted = false;
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
    quickEnds = 0;
    lastSaid = joinSaid(Array.from(e.results).map((x: any) => String(x[0].transcript ?? "")));
    owner?.onText(joinSaid([carried, lastSaid].filter(Boolean)));
  };
  r.onerror = (e: any) => {
    const err = e?.error || "error";
    // (a pause with nothing said, or the iPhone ending it: listening goes on — said only when it can't)
    if (wanted && (err === "no-speech" || err === "aborted")) return;
    if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture") wanted = false;
    owner?.onError?.(err);
  };
  r.onend = () => {
    running = false;
    clearQuiet();
    const was = owner;
    // The iPhone ended it after a pause, and the person hasn't tapped stop: go on listening for them, with what they've
    // said so far kept in front. Not when nobody's waiting, the screen is away, or it keeps ending at once.
    if (was && wanted && !next && document.visibilityState === "visible") {
      quickEnds = Date.now() - startedAt < 1000 ? quickEnds + 1 : 0;
      if (quickEnds < 3) {
        carried = joinSaid([carried, lastSaid].filter(Boolean));
        if (begin(was, true)) return;
      }
    }
    wanted = false;
    owner = null;
    was?.onEnd();
    // someone asked while it was still finishing: they get it now
    if (next) { const n = next; next = null; begin(n); }
    if (!running) letSleep();
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
    wanted = false;
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
  // (they tapped stop: no listening again after this recording ends)
  wanted = false;
  try { rec.stop(); } catch { /* already stopped */ }
}
