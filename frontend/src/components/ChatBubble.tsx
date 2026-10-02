import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import useBackToClose from "../hooks/useBackToClose";
import { sendToGuideOwner } from "../lib/tellGuideOwner";
import { withPhoneLinks } from "../lib/guideDisplay";
import ScoutSources, { hasSources, type AnswerSources } from "./ScoutSources";
import { startVoice, stopVoice, voiceSupported, type VoiceHandlers } from "../lib/voice";

/** Phone numbers in an answer can be tapped to call */
let phoneKey = 0;
function phones(text: string): ReactNode[] {
  return withPhoneLinks(text).map((p) => p.tel
    ? <a key={`tel-${phoneKey++}`} href={`tel:${p.tel}`} className="inline-block py-3 -my-3 underline underline-offset-2 whitespace-nowrap">{p.text}</a>
    : p.text);
}

/** Inline **bold** and *italic* (a lone asterisk showed on screen as-is), with phone numbers to tap */
function inline(content: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let remaining = content;
  let key = 0;
  while (remaining.length > 0) {
    const m = remaining.match(/\*\*(.+?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*/);
    if (m && m.index !== undefined) {
      if (m.index > 0) parts.push(...phones(remaining.slice(0, m.index)));
      parts.push(m[1] !== undefined ? <strong key={key++}>{m[1]}</strong> : <em key={key++}>{m[2]}</em>);
      remaining = remaining.slice(m.index + m[0].length);
      continue;
    }
    parts.push(...phones(remaining));
    break;
  }
  return parts;
}

const tableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const tableRule = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const cellsOf = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** Lightweight markdown: **bold**, *italic*, `- ` list items, and tables */
function renderMarkdown(text: string): ReactNode {
  // A bold heading at a line's start that runs straight into its text ("**In your carry-on**Larisa's…" — the break is
  // lost where cited pieces join) gets its own line (Ken's demo, Oct 1)
  const lines = text.replace(/(^|\n)(\*\*[^*\n]+\*\*)(?=[^\s:.,;—-])/g, "$1$2\n").split("\n");
  const out: ReactNode[] = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    // A table: a header row, its rule, and rows — drawn as one, small enough for a phone (Ken, Oct 2: Scout's four
    // biking days came out as rows of "|" and "---")
    if (tableRow(line) && li + 1 < lines.length && tableRule(lines[li + 1])) {
      const head = cellsOf(line);
      const rows: string[][] = [];
      let j = li + 2;
      for (; j < lines.length && tableRow(lines[j]); j++) rows.push(cellsOf(lines[j]));
      out.push(
        <span key={`t${li}`} className="block my-1.5 overflow-x-auto whitespace-normal">
          <table className="w-full border-collapse text-[13px] leading-snug">
            <thead><tr>{head.map((h, k) => <th key={k} className="text-left font-semibold align-bottom px-1.5 py-1 border-b border-[#d8cfc0]">{inline(h)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => (
              <tr key={ri} className="border-b border-[#ebe4d8] last:border-0">
                {head.map((_, k) => <td key={k} className="align-top px-1.5 py-1">{inline(r[k] ?? "")}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </span>,
      );
      li = j - 1;
      continue;
    }
    // List items
    const isList = /^[-•]\s/.test(line.trim());
    if (isList) {
      out.push(<span key={li} className="flex gap-1.5 mt-0.5"><span className="shrink-0">–</span><span>{inline(line.trim().replace(/^[-•]\s/, ""))}</span></span>);
      continue;
    }
    out.push(<span key={li}>{inline(line)}{li < lines.length - 1 ? "\n" : ""}</span>);
  }
  return out;
}

interface PlaceCard {
  name: string;
  address?: string;
  rating?: number | null;
  ratingCount?: number | null;
  priceLevel?: number | null;
  photoUrl?: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** When it was said — only today's conversation goes to Scout */
  at?: string;
  /** Screens Scout opened or offered: "Open Wed, Oct 14 · Tokyo" */
  shows?: { path: string; label: string; go: boolean; headline?: string }[];
  /** A few words for Scout's slim bar — the answer in brief ("Oct 29 · still open: Shiraume or Four Seasons") */
  headline?: string;
  /** No answer came (no signal, cut off, too slow) — never shown on the bar once things work again */
  error?: boolean;
  /** A small reply of the phone's own ("Back where you were.") — never the bar's words */
  quiet?: boolean;
  actions?: string[];
  places?: PlaceCard[];
  /** Where each part of the answer came from, recorded as Scout answered — shown only on request */
  sources?: AnswerSources;
  /** A small copy of the photo sent with this question (the photo itself isn't kept) */
  photoThumb?: string;
}

/**
 * A photo for Scout (Oct 2: a menu, a sign, a ticket — read and translated): shrunk on the phone so it goes quickly on
 * hotel wifi (longest side 1568 px, which is all Scout reads), plus a small copy for the conversation.
 */
type Photo = { data: string; thumb: string };
async function shrinkPhoto(file: File): Promise<Photo | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const draw = (max: number, quality: number) => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext("2d");
      if (!g) return "";
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", quality);
    };
    const full = draw(1568, 0.85), thumb = draw(160, 0.7);
    return full && thumb ? { data: full.split(",")[1], thumb } : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "back", "ok take me back", "got it, go back please" — done on the phone at once, no trip to Scout */
const JUST_BACK = /^\s*(?:(?:ok(?:ay)?|got it|thanks|thank you|great|perfect|cool|nice)[,.!]*\s+)?(?:(?:now|please)\s+)?(?:(?:take|bring)\s+me\s+|go\s+|head\s+)?back(?:\s+(?:please|to where i was|to where we were))?\s*[.!]*\s*$/i;

/** The bar's words: Scout's headline, or the first line of its answer (never a stale error) */
function barWords(m: ChatMessage | undefined): string {
  if (!m) return "";
  if (m.headline) return m.headline;
  const body = m.text.replace(/^\s*\**Message for [\s\S]*$/m, "").replace(/\*\*?/g, "");
  return body.split("\n").map((l) => l.trim()).find(Boolean) || "";
}

interface ChatContext {
  page: string;
  tripId?: string;
  cityId?: string;
  cityName?: string;
  dayId?: string;
  dayDate?: string;
}

interface ChatBubbleProps {
  context: ChatContext;
  onDataChanged?: () => void;
  hideBubble?: boolean;
}

// Each person's conversation on this phone is their own (two people can share an iPad)
const chatKey = () => {
  try {
    const me = JSON.parse(localStorage.getItem("wander_me") || "null");
    return me?.travelerId ? `wander-chat:${me.travelerId}` : "wander-chat";
  } catch { return "wander-chat"; }
};

const CUT_OFF = "That answer got cut off before it reached this phone. Want me to try again?";

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(chatKey());
    const msgs: ChatMessage[] = raw ? JSON.parse(raw) : [];
    // A question with no answer (the app closed mid-reply) says so, instead of just sitting there
    if (msgs.length && msgs[msgs.length - 1].role === "user") msgs.push({ role: "assistant", text: CUT_OFF, error: true });
    for (const m of msgs) if (m.role === "assistant" && (m.text === CUT_OFF || /^(No signal right now|That took over 45 seconds|That took too long|I couldn't get an answer just now)/.test(m.text))) m.error = true;
    return msgs;
  } catch { return []; }
}

function saveMessages(msgs: ChatMessage[]) {
  try {
    // Keep last 50 messages to avoid unbounded growth
    const trimmed = msgs.slice(-50);
    localStorage.setItem(chatKey(), JSON.stringify(trimmed));
  } catch { /* quota exceeded — ignore */ }
}

function clearMessages() {
  localStorage.removeItem(chatKey());
  localStorage.removeItem("wander-chat");
  // Also clean up any legacy per-trip keys
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith("wander-chat-")) localStorage.removeItem(key);
  }
}

// Two and a half minutes: a long answer (a table of eight days, every source on a place) takes Scout over a minute to
// write, and at 45 seconds the phone gave up on answers the server then finished (Ken, Oct 2 — measured: 2,048 words'
// worth of answer, the old limit, written after the phone had stopped waiting)
const CHAT_TIMEOUT_MS = 150000;
const LONG_WAIT_MS = 20000; // when the waiting line says it's still working

export default function ChatBubble({ context, onDataChanged, hideBubble }: ChatBubbleProps) {
  const user = useAuth().user;
  const [open, setOpen] = useState(false);
  // The answer whose "Sources" are open, if any
  const [sourcesOf, setSourcesOf] = useState<AnswerSources | null>(null);
  // (Back closes the Sources panel: ScoutSources holds that step itself. A second useBackToClose here, idle until
  // Sources opened, still kept every test page from closing for a minute — Sep 30.)
  // The phone's Back steps Scout down to its bar (or closes it when there's no conversation yet)
  useBackToClose(open, () => minimizeRef.current());
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [input, setInput] = useState("");
  // the photo going with the next question, and one in flight (kept for "Try again")
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoState, setPhotoState] = useState<"idle" | "reading" | "failed">("idle");
  const retryPhotoRef = useRef<Photo | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  // A cut-off question from last time can be asked again with one tap
  const [failed, setFailed] = useState(() => messages.length > 1 && messages[messages.length - 1].text === CUT_OFF);
  const [lastFailedText, setLastFailedText] = useState(() => (messages.length > 1 && messages[messages.length - 1].text === CUT_OFF ? messages[messages.length - 2].text : ""));
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const navigate = useNavigate();
  const location = useLocation();
  // Scout steps aside (a slim bar) instead of leaving when it shows you something
  const [docked, setDocked] = useState(false);
  // Where the phone's history stood before Scout first moved the screen (React Router's history index).
  // "↩ Back" steps back one screen at a time — the same as the phone's Back — until you're there again.
  const [returnTo, setReturnTo] = useState<{ idx: number } | null>(null);
  const historyIdx = () => (typeof window !== "undefined" && typeof window.history.state?.idx === "number" ? window.history.state.idx as number : 0);
  // Scout's words on the bar are about the screen it showed; once you've moved on, they'd mislead
  const justMoved = useRef<string | boolean>(false);
  const [shownKey, setShownKey] = useState<string | null>(null);
  // What the bar said about each screen Scout showed — stepping back to one shows its words again
  const shownWords = useRef<Record<string, string>>({});
  // The bar's height, so the page (and the Actions list) make exactly that much room at the bottom
  const [barHeight, setBarHeight] = useState(0);
  const barObserver = useRef<ResizeObserver | null>(null);
  const barRef = useCallback((el: HTMLDivElement | null) => {
    barObserver.current?.disconnect();
    barObserver.current = null;
    if (!el) { setBarHeight(0); return; }
    const measure = () => setBarHeight(Math.ceil(el.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver !== "undefined") {
      barObserver.current = new ResizeObserver(measure);
      barObserver.current.observe(el);
    }
  }, []);

  // The page makes room for the bar, so it never sits on what you're looking at. Other bottom notices
  // wait while the bar shows (one floating layer at a time).
  const barShowing = docked && !open;
  useEffect(() => {
    document.documentElement.style.setProperty("--scout-dock", barShowing ? `${barHeight + 6}px` : "0px");
    document.documentElement.dataset.scoutDock = barShowing ? "1" : "0";
    window.dispatchEvent(new CustomEvent("wander:scout-dock", { detail: { docked: barShowing } }));
  }, [barShowing, barHeight]);
  useEffect(() => () => {
    document.documentElement.style.setProperty("--scout-dock", "0px");
    document.documentElement.dataset.scoutDock = "0";
    window.dispatchEvent(new CustomEvent("wander:scout-dock", { detail: { docked: false } }));
  }, []);

  /**
   * The open panel holds one step in the phone's history (so Back closes it — useBackToClose). Before
   * Scout moves the screen, that step comes off first, and the move waits for it; otherwise a
   * leftover step sat between screens and "↩ Back" landed on it (same screen — nothing seemed to happen).
   */
  function afterPanelStep(then: () => void) {
    const state = window.history.state;
    if (!state?.wanderPanel) { then(); return; }
    const plain = { ...state };
    delete plain.wanderPanel;
    window.history.replaceState(plain, "");   // the panel's own cleanup then leaves history alone
    const done = () => { window.removeEventListener("popstate", done); then(); };
    window.addEventListener("popstate", done);
    window.history.back();
  }

  /** Open a screen Scout pointed to; Scout stays as a bar with "↩ Back" to where you were */
  const openScreen = useCallback((path: string, headline?: string) => {
    if (path === "back") { goBackToWhereIWasRef.current(); return; }
    setOpen(false);
    setDocked(true);
    setConfirmingClear(false);
    setBackHome(false);
    afterPanelStep(() => {
      const idx = historyIdx();
      setReturnTo((prev) => prev ?? { idx });
      if (path === "/?actions=1" && window.location.pathname === "/") {
        // Actions opens over Home, the same way its tab does — already on Home, it simply opens
        setShownKey(locationKeyRef.current);
        if (headline) shownWords.current[locationKeyRef.current] = headline;
        window.dispatchEvent(new Event("wander-open-actions"));
        return;
      }
      justMoved.current = headline || true;
      if (path === "/?actions=1") navigate("/", { state: { openActions: true } });
      else navigate(path);
    });
  }, [navigate]);
  const openScreenRef = useRef(openScreen);
  openScreenRef.current = openScreen;
  // Back where you started: Scout stays small for a moment ("anything else?"), and steps away once you
  // move on yourself — it used to vanish, leaving no quick way to ask the next thing
  const [backHome, setBackHome] = useState(false);
  useEffect(() => { if (!docked || open) setBackHome(false); }, [docked, open]);

  /** One step back — exactly what the phone's Back does, so the two never disagree */
  function goBackToWhereIWas() {
    setOpen(false);
    setConfirmingClear(false);
    window.dispatchEvent(new Event("wander-close-actions"));
    afterPanelStep(() => {
      if (!returnTo) { setDocked(false); if (historyIdx() > 0) navigate(-1); return; }
      if (historyIdx() <= returnTo.idx) { setReturnTo(null); setBackHome(true); setDocked(true); return; }
      navigate(-1);
    });
  }
  const goBackToWhereIWasRef = useRef(goBackToWhereIWas);
  goBackToWhereIWasRef.current = goBackToWhereIWas;

  // Each time the screen changes: a screen Scout just opened carries its words on the bar. Back where
  // you were before Scout moved you (by ↩ Back, the phone's Back, or a screen's own Back), the bar's
  // job is done, so it steps away — the conversation is still under the Scout tab. A bar with no screen
  // moves behind it (Scout made small after an answer) goes once you move on yourself.
  const locationKeyRef = useRef(location.key);
  useEffect(() => {
    if (locationKeyRef.current === location.key) return;
    locationKeyRef.current = location.key;
    if (justMoved.current) {
      if (typeof justMoved.current === "string") shownWords.current[location.key] = justMoved.current;
      justMoved.current = false;
      setShownKey(location.key);
      return;
    }
    if (open || !docked) return;
    if (returnTo) {
      if (historyIdx() <= returnTo.idx) { setReturnTo(null); setBackHome(true); }
      return;
    }
    setDocked(false);
  }, [location.key, open, docked, returnTo]);

  /** Step the full panel down to the bar — the conversation stays one tap away */
  function minimize() {
    setOpen(false);
    setConfirmingClear(false);
    if (messages.length > 0) setDocked(true);
  }
  const minimizeRef = useRef(minimize);
  minimizeRef.current = minimize;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // who holds the app's microphone for Scout, while it listens
  const recognitionRef = useRef<VoiceHandlers | null>(null);
  // Whether the voice button's words still go into the box (not once the question has been sent)
  const voiceLiveRef = useRef(false);
  const [voiceQuiet, setVoiceQuiet] = useState(false);
  // a question still being answered after LONG_WAIT_MS
  const [waitedLong, setWaitedLong] = useState(false);
  useEffect(() => {
    if (!sending) { setWaitedLong(false); return; }
    const t = setTimeout(() => setWaitedLong(true), LONG_WAIT_MS);
    return () => clearTimeout(t);
  }, [sending]);
  // One question at a time, known the instant it's sent (the `sending` state a callback holds can be from before)
  const sendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Persist messages to localStorage
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  // The bottom bar's Scout tab lights up while the panel is open
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("wander:chat-panel", { detail: { open } }));
  }, [open]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // New answer: show it from its first line (a long answer used to open at its end).
  // Anything else (your own question, the typing dots): the bottom.
  const scrollToLatest = useCallback(() => {
    const box = scrollRef.current;
    if (!box) return;
    const bubbles = box.querySelectorAll<HTMLElement>("[data-msg]");
    // Nothing said yet: the greeting and suggestions from the top
    if (!bubbles.length && !box.querySelector("[data-thinking]")) { box.scrollTop = 0; return; }
    const lastBubble = bubbles[bubbles.length - 1];
    if (lastBubble?.dataset.msg === "assistant" && lastBubble.offsetHeight > box.clientHeight * 0.6) {
      box.scrollTop += lastBubble.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
    } else {
      box.scrollTop = box.scrollHeight;
    }
  }, []);

  useEffect(() => { scrollToLatest(); }, [messages, sending, scrollToLatest]);

  // The sheet's size on a phone, and the space the keyboard leaves (the visible part of the screen)
  const [size, setSize] = useState<"half" | "full">("half");
  const [vp, setVp] = useState<{ h: number; kb: number } | null>(null);
  const dragStart = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const layoutH = document.documentElement.clientHeight || window.innerHeight;
      setVp({ h: Math.round(vv.height), kb: Math.max(0, Math.round(layoutH - vv.height - vv.offsetTop)) });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, [open]);
  // The newest words stay in view when the keyboard comes up or the sheet changes size
  useEffect(() => {
    if (!open) return;
    scrollToLatest();
    // Again once the keyboard has finished rising — the sheet's size settles a moment later
    const t = setTimeout(scrollToLatest, 250);
    return () => clearTimeout(t);
  }, [vp, size, open, scrollToLatest]);

  // Opened to read: on a phone the keyboard stays down (it would cover the answer) until you tap the
  // box; screen readers land on Scout itself. On a computer the typing box is ready.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      scrollToLatest();
      const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
      if (document.activeElement === inputRef.current) return;
      if (touch) panelRef.current?.focus({ preventScroll: true });
      else inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(t);
  }, [open, scrollToLatest]);

  // Listen for custom event to open chat (used by Plan page action bar)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSize(detail?.prefill ? "full" : "half");
      setOpen(true);
      if (detail?.prefill && inputRef.current) {
        setInput(detail.prefill);
        setTimeout(() => inputRef.current?.focus(), 150);
      }
    };
    const close = () => minimizeRef.current();
    window.addEventListener("wander-open-chat", handler);
    window.addEventListener("wander-close-chat", close);
    return () => { window.removeEventListener("wander-open-chat", handler); window.removeEventListener("wander-close-chat", close); };
  }, []);

  // retryText: resend a question already on screen. asNew: a tapped example question — show it as theirs.
  const sendMessage = useCallback(async (retryText?: string, asNew = false) => {
    const sendPhoto = retryText ? retryPhotoRef.current : photo;
    // a photo sent with no words: what it says (Scout translates)
    const text = retryText || input.trim() || (sendPhoto ? "What does this say?" : "");
    if (!text || sending || sendingRef.current) return;
    // Sent while the voice button still listens: stop it, and late words don't refill the box (Ken, Oct 1: one
    // dictated question reached Scout twice, a second apart — Send, then the mic's own send as it stopped)
    if (recognitionRef.current) {
      voiceLiveRef.current = false;
      stopVoice(recognitionRef.current);
      setListening(false);
    }

    // "Take me back" needs no thinking: step back at once (only when there's somewhere in Wander to go)
    if (!retryText && !sendPhoto && JUST_BACK.test(text) && (returnTo || historyIdx() > 0)) {
      setInput("");
      // (marked quiet: it's not something to show on the bar later)
      setMessages((prev) => [...prev, { role: "user", text, at: new Date().toISOString() }, { role: "assistant", text: "Back where you were.", at: new Date().toISOString(), quiet: true }]);
      goBackToWhereIWasRef.current();
      return;
    }
    // "home" is as quick as "back"
    if (!retryText && !sendPhoto && /^\s*(?:go\s+|open\s+)?home\s*[.!]*\s*$/i.test(text) && window.location.pathname !== "/") {
      setInput("");
      setMessages((prev) => [...prev, { role: "user", text, at: new Date().toISOString() }, { role: "assistant", text: "Here's Home.", at: new Date().toISOString(), quiet: true }]);
      openScreenRef.current("/", "Home — today's plan up top");
      return;
    }

    if (!retryText || asNew) {
      if (!retryText) setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      setMessages((prev) => [...prev, { role: "user", text, at: new Date().toISOString(), ...(sendPhoto ? { photoThumb: sendPhoto.thumb } : {}) }]);
    }
    retryPhotoRef.current = sendPhoto;
    if (!retryText) { setPhoto(null); setPhotoState("idle"); }
    sendingRef.current = true;
    setSending(true);
    setFailed(false);
    setLastFailedText("");
    setConfirmingClear(false);
    setBackHome(false);

    // Abort controller for timeout
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

    try {
      // Only today's conversation (on this phone's calendar): yesterday's "today" isn't today
      const todayStr = new Date().toDateString();
      // A question that never got its answer stays out, or Scout answers it again alongside the new one
      const history = messages
        .filter((m, i) => m.at && new Date(m.at).toDateString() === todayStr && !m.error && m.text !== CUT_OFF
          && !(m.role === "user" && (messages[i + 1]?.error || messages[i + 1]?.text === CUT_OFF)))
        .slice(-10).map((m) => ({ role: m.role, text: m.text }));
      const token = localStorage.getItem("wander_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // The phone's own date, time and time zone, so "today" and "tonight" mean what the person means
      const d = new Date();
      const clientTime = {
        iso: d.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
        localDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        localTime: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ message: text, context, history, clientTime, ...(sendPhoto ? { image: { mediaType: "image/jpeg", data: sendPhoto.data } } : {}) }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      retryPhotoRef.current = null;

      const shows = data.shows as ChatMessage["shows"];
      const goTo = shows?.find((s) => s.go);
      const headline = (goTo?.headline || shows?.find((s) => s.headline)?.headline || "").trim() || undefined;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.reply, actions: data.actions, places: data.places, shows, headline, at: new Date().toISOString(),
          ...(hasSources(data.sources) ? { sources: data.sources } : {}) },
      ]);
      // "Show me…": Scout moves the screen there (its answer stays in the conversation)
      // Never pull the screen out from under someone already typing the next question — the button stays
      if (goTo) setTimeout(() => {
        const box = inputRef.current;
        if (box && box.value.trim()) return;
        openScreen(goTo.path, goTo.headline);
      }, 700);
      if (data.hasActions && onDataChanged) {
        onDataChanged();
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err?.name === "AbortError";
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const errorMsg = offline
        ? `No signal right now, so I can't answer. Today's plan from ${/^larisa$/i.test(user?.displayName || "") ? "your Guide" : "Larisa's Guide"} is still on the Now tab.`
        : isTimeout
        ? "That took too long — over two minutes. Want me to try again?"
        : "I couldn't get an answer just now. Want me to try again?";
      setMessages((prev) => [...prev, { role: "assistant", text: errorMsg, error: true }]);
      setFailed(true);
      setLastFailedText(text);
    } finally {
      sendingRef.current = false;
      setSending(false);
      abortRef.current = null;
    }
  }, [input, sending, context, onDataChanged, messages, photo]);

  // A photo chosen or pasted: shrunk on the phone, shown above the box until it's sent or taken off
  const takePhoto = useCallback(async (file: File | null | undefined) => {
    if (!file || !/^image\//.test(file.type || "image/")) return;
    setPhotoState("reading");
    const p = await shrinkPhoto(file);
    if (p) { setPhoto(p); setPhotoState("idle"); inputRef.current?.focus(); } else setPhotoState("failed");
  }, []);
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData?.items || []).find((it) => it.kind === "file" && it.type.startsWith("image/"))?.getAsFile();
    if (file) { e.preventDefault(); takePhoto(file); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Catches insertLineBreak on iOS when keyDown doesn't fire
  const handleBeforeInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const nativeEvent = e.nativeEvent as InputEvent;
    if (nativeEvent.inputType === "insertLineBreak") {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  // Auto-resize textarea to fit content (up to 40% of chat panel)
  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const panel = el.closest("[data-chat-panel]") as HTMLElement | null;
    const maxH = panel ? panel.clientHeight * 0.4 : 200;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, maxH) + "px";
    // Past its tallest, it scrolls inside — and the newest words stay in view while typing or dictating
    el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
    if (el.selectionStart === el.value.length) el.scrollTop = el.scrollHeight;
  }, []);
  // Whatever fills the box — typing, the iPhone's own dictation, Wander's voice button, a question handed over — it
  // resizes and shows the latest words (Ken, Oct 1: dictating his first question, the box didn't scroll)
  useEffect(() => { autoResize(); }, [input, autoResize]);

  // The app's one microphone (lib/voice.ts), started on the tap itself
  const toggleVoice = useCallback(() => {
    if (listening) {
      stopVoice(recognitionRef.current ?? undefined);
      setListening(false);
      return;
    }
    // Words already typed stay; what's said follows them
    const typed = (inputRef.current?.value ?? "").trim();
    voiceLiveRef.current = true;
    setVoiceQuiet(false);
    const handlers: VoiceHandlers = {
      // (already sent: late words don't refill the box)
      onText: (said) => {
        if (!voiceLiveRef.current) return;
        setVoiceQuiet(false);
        setInput(typed ? `${typed} ${said.trimStart()}` : said);
      },
      // Tap to start, tap to stop, as the iPhone keyboard's mic: everything heard stays in the box for a glance and
      // Send (Ken, Oct 1 — a misheard question shouldn't go straight to Scout)
      onEnd: () => {
        setListening(false);
        setVoiceQuiet(false);
        if (recognitionRef.current === handlers) recognitionRef.current = null;
        voiceLiveRef.current = false;
      },
      onError: (error) => {
        if (error === "not-allowed") alert("Wander can't use the microphone. In the iPhone's Settings, allow it for Wander, then try again.");
      },
      // listening, but no words coming (Ken, Oct 2: the mic was on and the box stayed empty, with nothing said)
      onQuiet: () => { if (voiceLiveRef.current) setVoiceQuiet(true); },
    };
    recognitionRef.current = handlers;
    if (startVoice(handlers)) setListening(true);
    else { recognitionRef.current = null; voiceLiveRef.current = false; }
  }, [listening]);
  // A screen that goes hands the microphone back
  useEffect(() => () => { if (recognitionRef.current) stopVoice(recognitionRef.current); }, []);

  const hasSpeechRecognition = voiceSupported();

  // Chat paste: no special handling — paste into chat just pastes as text.
  // Universal capture handles paste outside text fields.

  // What the bar says: Scout's latest answer in brief — never a stale error, never words about a screen
  // you've since left
  const lastGood = [...messages].reverse().find((m) => m.role === "assistant" && !m.error && !m.quiet);
  // An answer that didn't move the screen is marked as Scout's words, so it never reads as a caption
  // for the screen ("Sat Oct 17 · Robuchon…" over Friday)
  const lastMoved = !!lastGood?.shows?.some((s) => s.go);
  const barText = sending
    ? "Scout is thinking…"
    : !online
    ? "No signal — you're seeing what this phone saved. I'll answer when it's back."
    : backHome
    ? "Back where you were — anything else?"
    : returnTo && shownKey && shownKey !== location.key
    ? shownWords.current[location.key] || "I'm here when you need me."
    : lastGood && !lastMoved
    ? `Scout: ${barWords(lastGood)}`
    : barWords(lastGood) || "Ask me anything about the trip.";

  /** Open the conversation. "type" opens it tall with the keyboard up, in the same tap (iPhone only
   *  raises the keyboard for a focus that happens inside the tap itself). */
  function openPanel(how: "read" | "type") {
    if (how === "type") {
      // A quick follow-up: the half sheet, so the page asked about stays in view
      flushSync(() => { setSize("half"); setOpen(true); });
      inputRef.current?.focus();
    } else {
      setSize("half");
      setOpen(true);
    }
  }

  // A screen can hand Scout a question ("How do I get from Narita to the Imperial Hotel?") — it opens and asks it; with
  // no signal it opens with the question ready to send (delight audit: "Scout can look up the ways to go" wasn't tappable)
  useEffect(() => {
    const ask = (e: Event) => {
      const q = String((e as CustomEvent).detail?.question || "").trim();
      if (!q) return;
      setSize("half");
      setOpen(true);
      if (navigator.onLine) sendMessage(q, true);
      else setInput(q);
    };
    window.addEventListener("wander:ask-scout", ask);
    return () => window.removeEventListener("wander:ask-scout", ask);
  }, [sendMessage]);

  if (!open) {
    // Scout stepped aside: a bar above the tabs keeps the conversation going ("I got it — now take me
    // back"). Its words on top; ↩ Back, a place to ask, the microphone and ✕ below.
    if (docked) {
      return (
        <div
          ref={barRef}
          role="region" aria-label="Scout"
          // Swipe it up to open the conversation, down to put Scout away (as a music mini-player does)
          onTouchStart={(e) => { dragStart.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            if (dragStart.current === null) return;
            const dy = e.changedTouches[0].clientY - dragStart.current;
            dragStart.current = null;
            if (dy < -40) openPanel("read");
            else if (dy > 40) { setDocked(false); setReturnTo(null); }
          }}
          className="fixed inset-x-0 z-[55] bg-[#3a3128] text-white rounded-t-2xl shadow-[0_-4px_16px_rgba(0,0,0,0.18)] px-3 pt-1.5 pb-1"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 57px)" }}
        >
          <button onClick={() => openPanel("read")} className="w-full min-h-[44px] text-left flex items-start gap-2 py-1.5" aria-label="Open the conversation with Scout" aria-describedby="scout-bar-words">
            <span className={`mt-[7px] w-2 h-2 rounded-full shrink-0 ${online ? "bg-green-400" : "bg-[#c8bba8]"}`} aria-hidden />
            <span id="scout-bar-words" aria-live="polite" className="flex-1 min-w-0 text-[0.95rem] leading-snug line-clamp-2">{barText}</span>
            {/* A small handle: tap (or pull) to open the conversation */}
            <svg className="shrink-0 mt-1 text-white/70" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            {returnTo && (
              <button onClick={goBackToWhereIWas} className="shrink-0 min-h-[44px] px-3 rounded-xl bg-white/15 text-sm" aria-label="Back to where I was">
                ↩ Back
              </button>
            )}
            <button onClick={() => openPanel("type")} className="flex-1 min-w-0 min-h-[44px] px-3 rounded-xl bg-white/10 text-left text-sm text-white/80 truncate" aria-label="Ask Scout something">
              Ask Scout…
            </button>
            {hasSpeechRecognition && (
              // (open, cursor in the box, listening — all inside the tap: started a quarter second later, an iPhone could
              // turn the microphone on and never send a word back; Ken, Oct 2)
              <button onClick={() => { openPanel("type"); toggleVoice(); }} className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl" aria-label="Talk to Scout">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                </svg>
              </button>
            )}
            <button onClick={() => { setDocked(false); setReturnTo(null); }} className="shrink-0 ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-white/85" aria-label="Close Scout">
              ✕
            </button>
          </div>
        </div>
      );
    }
    if (hideBubble) {
      // Stay mounted for wander-open-chat event listener, but render nothing
      return <></>;
    }
    return (
      <button
        onClick={() => openPanel("read")}
        className="fixed z-50 flex items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95
          right-4 w-11 h-11
          sm:right-6 sm:w-12 sm:h-12"
        style={{ backgroundColor: "#514636", color: "#faf8f5", bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}
        aria-label="Ask Scout"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  // On a phone the panel is a sheet: half height by default (the page stays in view above it), full
  // height to type or read long answers, and with the keyboard up it fits the space above the keyboard.
  const wide = typeof window !== "undefined" && window.matchMedia?.("(min-width: 640px)").matches;
  const visibleH = vp?.h ?? (typeof window !== "undefined" ? window.innerHeight : 800);
  const keyboardUp = (vp?.kb ?? 0) > 80;
  const sheetStyle = wide ? undefined : {
    bottom: vp?.kb ?? 0,
    // With the keyboard up the half sheet keeps a strip of the page in view (the full one uses it all)
    height: keyboardUp
      ? (size === "full" ? Math.round(visibleH - 8) : Math.round(Math.min(visibleH - 8, Math.max(260, visibleH * 0.72))))
      : size === "full" ? Math.round(visibleH * 0.9) : Math.round(visibleH * 0.58),
  };
  const onSheetTouchStart = (e: React.TouchEvent) => { dragStart.current = e.touches[0].clientY; };
  const onSheetTouchEnd = (e: React.TouchEvent) => {
    if (dragStart.current === null) return;
    const dy = e.changedTouches[0].clientY - dragStart.current;
    dragStart.current = null;
    if (dy > 50) { if (size === "full" && !keyboardUp) setSize("half"); else minimize(); }
    else if (dy < -50) setSize("full");
  };
  // Tab stays inside Scout while it's open (the page behind is dimmed and out of reach)
  const keepFocusInside = (e: React.KeyboardEvent) => {
    // Escape (an iPad keyboard) makes Scout small, like the chevron
    if (e.key === "Escape") { e.preventDefault(); minimize(); return; }
    if (e.key !== "Tab") return;
    const panel = e.currentTarget as HTMLElement;
    const all = Array.from(panel.querySelectorAll<HTMLElement>("button, textarea, a[href]")).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
    if (!all.length) return;
    const first = all[0], last = all[all.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <>
      {sourcesOf && <ScoutSources sources={sourcesOf} tripId={context.tripId} onClose={() => setSourcesOf(null)} />}
      {/* The page behind: lightly dimmed at half height (still readable), tap it to make Scout small */}
      <div
        className={`fixed inset-0 z-[60] sm:hidden ${size === "full" || keyboardUp ? "bg-black/20" : "bg-black/10"}`}
        onClick={minimize}
      />

      {/* Chat panel — bottom sheet on mobile, side panel on desktop. Above the tab bar (z-50),
          so the typing box and Send are never covered. */}
      <div
        ref={panelRef}
        data-chat-panel
        role="dialog" aria-modal="true" aria-label="Scout" tabIndex={-1}
        onKeyDown={keepFocusInside}
        className="fixed z-[60] flex flex-col bg-[#faf8f5] shadow-2xl border border-[#e5ddd0] outline-none
          inset-x-0 bottom-0 rounded-t-2xl transition-[height] duration-200
          sm:inset-auto sm:bottom-6 sm:right-6 sm:w-96 sm:h-[500px] sm:rounded-2xl"
        style={sheetStyle}
      >
        {/* Header — drag it down to make Scout smaller, up to make it taller; the handle toggles */}
        <div className="border-b border-[#e5ddd0] touch-none" onTouchStart={onSheetTouchStart} onTouchEnd={onSheetTouchEnd}>
          <div
            className="flex justify-center pt-2 pb-1 sm:hidden cursor-pointer"
            onClick={() => setSize(size === "full" ? "half" : "full")}
            aria-hidden
          >
            <span className="w-9 h-[5px] rounded-full bg-[#d9cfc0]" />
          </div>
          <div className="flex items-center justify-between px-4 pb-2 sm:pt-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${online ? "bg-green-500" : "bg-[#c8bba8]"}`} aria-hidden />
              <span className="text-sm font-medium text-[#3a3128]">Scout</span>
              {!online && <span className="text-sm text-[#6b5d4a]">· no signal</span>}
            </div>
            <div className="flex items-center gap-1">
              {/* (only once there's a conversation to keep — with none, "small" would simply close) */}
              {messages.length > 0 && (
                <button
                  onClick={minimize}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#6b5d4a] hover:bg-[#f0ebe3]"
                  aria-label="Make Scout small"
                  title="Make Scout small"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => { setOpen(false); setDocked(false); setReturnTo(null); setConfirmingClear(false); }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#6b5d4a] hover:bg-[#f0ebe3] text-base"
                aria-label="Close Scout"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} role="log" aria-live="polite" className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3 min-h-0">
          {messages.length === 0 && (
            <div className="text-center text-[#6b5d4a] text-sm py-8">
              <p>I'm Scout, your travel companion.</p>
              {/* What it actually knows (round 12 delight audit: "I know your whole trip" overclaimed) */}
              {/* Said to whoever holds the phone (round 13: Ken read "Ken's rail sheet", Larisa "Larisa's Guide") */}
              <p className="mt-1">I've read {/^larisa$/i.test(user?.displayName || "") ? "your Guide" : "Larisa's Guide"} and {/^ken$/i.test(user?.displayName || "") ? "your rail sheet" : "Ken's rail sheet"}, and I can look things up online. Ask me anything about the trip.</p>
              {/* Why the questions below are greyed (round 12: offline, only a small "no signal" in the header said so) */}
              {!online && <p className="mt-3 text-[#8a5a1a]">No signal right now, so I can't answer yet. Today's plan from {/^larisa$/i.test(user?.displayName || "") ? "your Guide" : "Larisa's Guide"} is still on the Now tab.</p>}
              {/* Tap one to ask it */}
              <div className="mt-4 flex flex-col items-start gap-1.5">
                {["What's the plan today?", "Where are we sleeping tonight?", "Is there anything I need to do soon?", "What time do we need to leave?"].map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q, true)}
                    // (no signal: Scout can't answer — round 12: these looked ready with the phone offline)
                    disabled={sending || !online}
                    className="min-h-[44px] px-3 rounded-full border border-[#e0d8cc] bg-white text-sm text-[#514636] text-left disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} data-msg={msg.role} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                // Scout's answers use the panel's width, so a short answer fits without scrolling (round 12 delight audit)
                className={`${msg.role === "user" ? "max-w-[85%]" : "w-full"} rounded-2xl px-3.5 py-2 text-base leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#514636] text-[#faf8f5]"
                    : "bg-[#f0ebe3] text-[#3a3128]"
                }`}
              >
                {(() => {
                  // "Message for Larisa: …" — a ready-to-send message; shown as a card with a Send button
                  const draft = msg.role === "assistant" ? msg.text.match(/^\s*\**Message for ([\p{L}' -]{1,30}):\**\s*"?([\s\S]+?)"?\s*$/mu) : null;
                  const body = draft ? msg.text.slice(0, draft.index).trimEnd() : msg.text;
                  return (
                    <>
                      {msg.photoThumb && <img src={msg.photoThumb} alt="The photo sent with this question" className="mb-1.5 h-20 w-20 object-cover rounded-lg" />}
                      <div className="whitespace-pre-wrap">{renderMarkdown(body)}</div>
                      {draft && (
                        <div className="mt-2 rounded-xl bg-white border border-[#e0d8cc] p-3">
                          <p className="text-xs text-[#6b5d4a]">Message for {draft[1]}</p>
                          <p className="text-[15px] text-[#3a3128] mt-1 whitespace-pre-wrap">{draft[2]}</p>
                          <button
                            onClick={async () => { const s = await sendToGuideOwner(draft[1], draft[2]); if (s) setMessages((prev) => [...prev, { role: "assistant", text: s }]); }}
                            className="mt-2 min-h-[44px] px-4 rounded-lg bg-[#514636] text-white text-sm"
                          >
                            Send to {draft[1]}
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
                {msg.places && msg.places.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {msg.places.map((place, pi) => (
                      <div key={pi} className="rounded-lg overflow-hidden bg-white/80 border border-[#e0d8cc]/60">
                        {place.photoUrl && (
                          <img
                            src={place.photoUrl}
                            alt={place.name}
                            className="w-full h-32 object-cover"
                            loading="lazy"
                          />
                        )}
                        <div className="px-3 py-2">
                          <div className="font-medium text-sm text-[#3a3128]">{place.name}</div>
                          {place.address && (
                            <div className="text-xs text-[#6b5d4a] mt-0.5 line-clamp-1">{place.address}</div>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {place.rating && (
                              <span className="text-xs text-[#6b5d4a]">
                                ★ {place.rating}{place.ratingCount ? ` (${place.ratingCount})` : ""}
                              </span>
                            )}
                            {place.priceLevel != null && (
                              <span className="text-xs text-[#6b5d4a]">
                                {"$".repeat(place.priceLevel)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {msg.shows && msg.shows.some((s) => s.path !== "back") && (
                  <div className="mt-2 flex flex-col items-start gap-1.5">
                    {/* "Back" already happened when it was said — as a button later it would jump somewhere unexpected */}
                    {msg.shows.filter((s) => s.path !== "back").map((s) => (
                      <button key={s.path} onClick={() => openScreen(s.path, s.headline)}
                        className="min-h-[44px] px-3 rounded-lg bg-white border border-[#e0d8cc] text-sm text-[#514636] text-left">
                        {s.label} ›
                      </button>
                    ))}
                  </div>
                )}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-[#d9cfc0]/50 space-y-0.5">
                    {msg.actions.map((a, j) => (
                      <p key={j} className="text-sm opacity-75 flex items-center gap-1">
                        <span>&#10003;</span> {a}
                      </p>
                    ))}
                  </div>
                )}
                {/* Where the answer came from — a quiet link; nothing shows unless it's tapped */}
                {msg.role === "assistant" && hasSources(msg.sources) && (
                  <button onClick={() => setSourcesOf(msg.sources!)}
                    className="-mb-1.5 min-h-[44px] text-[13px] text-[#6b5d4a] underline underline-offset-2">
                    Sources
                  </button>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start" data-thinking role="status" aria-busy="true">
              <div className="bg-[#f0ebe3] rounded-2xl px-3.5 py-2 text-sm text-[#514636]">
                {/* (to Larisa it's her own Guide — round 12 delight audit; and after a while it says it's still at it — a
                    long answer can take a minute or more, and the old 45 seconds gave up on answers that came; Ken, Oct 2) */}
                {waitedLong
                  ? "Still working — a long answer takes a minute or two"
                  : /^larisa$/i.test(user?.displayName || "") ? "Looking in your Guide" : "Looking in Larisa's Guide"}
                <span className="inline-flex gap-0.5 ml-0.5" aria-hidden>
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                </span>
              </div>
            </div>
          )}
          {/* Start fresh — at the end of the conversation, out of the crowded header; it asks first */}
          {messages.length > 0 && !sending && (
            confirmingClear ? (
              <div className="flex flex-wrap items-center gap-x-2 pt-1">
                <span className="text-sm text-[#6b5d4a]">Clear this conversation?</span>
                <button
                  onClick={() => { setMessages([]); clearMessages(); setConfirmingClear(false); setFailed(false); }}
                  className="min-h-[44px] px-3 rounded-lg text-sm text-[#8a3a1a] hover:bg-[#f0ebe3]"
                >
                  Yes, start fresh
                </button>
                <button onClick={() => setConfirmingClear(false)} className="min-h-[44px] px-3 rounded-lg text-sm text-[#514636] hover:bg-[#f0ebe3]">
                  Keep
                </button>
              </div>
            ) : (
              <div className="flex justify-center pt-1">
                <button onClick={() => setConfirmingClear(true)} className="min-h-[44px] px-3 text-sm text-[#6b5d4a] underline underline-offset-2">
                  Start fresh
                </button>
              </div>
            )
          )}
          {failed && lastFailedText && (
            <div className="flex gap-2 justify-start">
              <button
                onClick={() => { setFailed(false); sendMessage(lastFailedText); }}
                className="min-h-[44px] px-4 text-sm rounded-lg bg-[#514636] text-white hover:bg-[#3a3128] transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => { setFailed(false); setLastFailedText(""); }}
                className="min-h-[44px] px-4 text-sm rounded-lg bg-[#f0ece5] text-[#6b5d4a] hover:bg-[#e0d8cc] transition-colors"
              >
                Never mind
              </button>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleFormSubmit} className="px-3 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] border-t border-[#e5ddd0]">
          {listening && voiceQuiet && (
            <p role="status" className="text-[13px] text-[#6b5d4a] mb-2">
              I'm not hearing any words yet. Tap the red mic to stop, then try again — or type.
            </p>
          )}
          {/* the photo going with the next question (or why it couldn't be added) */}
          {(photo || photoState !== "idle") && (
            <div className="flex items-center gap-2 mb-2">
              {photo && <img src={photo.thumb} alt="Your photo, ready to send" className="h-12 w-12 object-cover rounded-lg border border-[#e0d8cc]" />}
              <p className="flex-1 text-[13px] text-[#6b5d4a]" role="status">
                {photoState === "reading" ? "Getting the photo ready…" : photoState === "failed" ? "That photo couldn't be read — try another?" : "Photo added — ask about it, or just send to have it read and translated."}
              </p>
              {photo && <button type="button" onClick={() => { setPhoto(null); setPhotoState("idle"); }} className="min-h-[44px] min-w-[44px] text-sm text-[#514636]" aria-label="Take the photo off">✕</button>}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              onPaste={handlePaste}
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(); }}
              onKeyDown={handleKeyDown}
              onBeforeInput={handleBeforeInput}
              enterKeyHint="send"
              // Stays open while Scout answers: the next question can be typed now (Send waits for the answer)
              // Short enough for one line on a 375pt phone (round 12: "…back online" was cut off); the line above
              // the box says Scout answers once the signal is back
              placeholder={!online ? "No signal right now" : sending ? "Your next question…" : photo ? "Ask about the photo…" : "Ask about the trip…"}
              aria-label="Ask Scout about the trip"
              rows={1}
              className="flex-1 min-h-[44px] bg-[#f0ebe3] rounded-xl px-3.5 py-2.5 text-[16px] text-[#3a3128] placeholder:text-[#6b5d4a] outline-none focus:ring-2 focus:ring-[#514636]/20 disabled:opacity-50 resize-none"
            />
            {/* a photo for Scout: take one or choose one (the phone offers both) */}
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={!online || photoState === "reading"}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#f0ebe3] text-[#6b5d4a] hover:bg-[#e0d8cc] transition-colors disabled:opacity-30"
              aria-label="Add a photo"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" aria-hidden tabIndex={-1}
              onChange={(e) => { takePhoto(e.target.files?.[0]); e.target.value = ""; }} />
            {hasSpeechRecognition && (
              <button
                // the cursor goes to the box as it starts listening (Ken, Oct 2)
                onClick={() => { if (!listening) inputRef.current?.focus(); toggleVoice(); }}
                type="button"
                disabled={!online}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors disabled:opacity-30 ${
                  listening
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-[#f0ebe3] text-[#6b5d4a] hover:bg-[#e0d8cc]"
                }`}
                aria-label={listening ? "Stop listening" : "Voice input"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
            )}
            <button
              type="submit"
              disabled={sending || (!input.trim() && !photo) || !online || photoState === "reading"}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors disabled:opacity-30"
              style={{ backgroundColor: "#514636", color: "#faf8f5" }}
              aria-label="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
