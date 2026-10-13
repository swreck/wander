import { useState, useRef, useEffect, useCallback, type ReactNode, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import useBackToClose from "../hooks/useBackToClose";
import { sendToGuideOwner } from "../lib/tellGuideOwner";
import { withPhoneLinks } from "../lib/guideDisplay";
import ScoutSources, { hasSources, citesGuide, type AnswerSources } from "./ScoutSources";
import OnceTip, { useOnceTip } from "./OnceTip";
import { startVoice, stopVoice, voiceSupported, type VoiceHandlers } from "../lib/voice";
import { phoneReport } from "../lib/phoneReport";
import { screenShift } from "../lib/screenShift";
import { whereAmI, hereNow, type Here } from "../lib/whereAmI";
import { canOfferBuzz, declineBuzz, turnOnBuzz, keepBuzzCurrent } from "../lib/buzz";

/** Phone numbers in an answer can be tapped to call */
let phoneKey = 0;
function telLinks(text: string): ReactNode[] {
  return withPhoneLinks(text).map((p) => p.tel
    ? <a key={`tel-${phoneKey++}`} href={`tel:${p.tel}`} className="inline-block py-3 -my-3 underline underline-offset-2 whitespace-nowrap">{p.text}</a>
    : p.text);
}

/**
 * Web addresses in an answer can be tapped too, shown by a short name — Larisa's map link was plain text nobody could tap
 * (verify11, Oct 11). Every link reaching here is one Scout opened or was given (chat.ts asks it to open or drop any other).
 */
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s<>()"“”]+/g;
function linkName(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname.startsWith("/maps/d/")) return "Open the Google map"; // (Larisa read "her" map for her own; verify12)
    if (/(^|\.)maps\.apple(\.com)?$/.test(u.hostname)) return "Open in Apple Maps";
    return u.hostname.replace(/^www\./, "");
  } catch { return url; }
}
function phones(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(LINK)) {
    let url = m[2] ?? m[0];
    let tail = "";
    // (a sentence's own full stop or comma isn't part of the address)
    if (!m[2]) { const t = url.match(/[.,;:!?]+$/); if (t) { tail = t[0]; url = url.slice(0, -tail.length); } }
    out.push(...telLinks(text.slice(at, m.index)));
    out.push(<a key={`url-${phoneKey++}`} href={url} target="_blank" rel="noopener noreferrer" className="inline-block py-3 -my-3 underline underline-offset-2 font-medium">{m[1] ?? linkName(url)} ↗</a>);
    if (tail) out.push(tail);
    at = (m.index ?? 0) + m[0].length;
  }
  out.push(...telLinks(text.slice(at)));
  return out;
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
      // (an address inside bold can be tapped too; verify12)
      parts.push(m[1] !== undefined ? <strong key={key++}>{phones(m[1])}</strong> : <em key={key++}>{phones(m[2])}</em>);
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
  // (a link written as "[JR Central](https://…)" shows as its name, tapped to open — the address showed as code in the
  // answer; journeys check, Oct 10; see phones())
  // (an address set apart from its full stop — "…?mid=… . It opens" — keeps the stop beside its link)
  const lines = text.replace(/(https?:\/\/[^\s<>()"“”]+) ([.,;])(?=\s|$)/g, "$1$2").replace(/(^|\n)(\*\*[^*\n]+\*\*)(?=[^\s:.,;—-])/g, "$1$2\n").split("\n");
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
  /** What else went with it — files by name, pictures by a small copy (nothing is kept) */
  files?: { name: string; thumb?: string }[];
  /** Directions Scout offered, from wherever the phone is ("Walk to Tokyodo Main Showroom", "Taxi to …") */
  routes?: { label: string; apple: string; google: string; search?: string }[];
  /** Scout needed where they are and couldn't see it: a "Use my location" button under the answer (Oct 12) */
  askHere?: boolean;
  /** A question sent again with where the phone is, after "Use my location" — said under it, on this phone */
  withHere?: boolean;
  /** A line standing in for an answer Wander may still have (the phone lost the line): the question and when it went —
   *  kept on the phone, so the look for the saved answer goes on after the app is reopened */
  waitingFor?: { q: string; sentAt: number; files?: boolean; askId?: string; earlier?: string[] };
  /** The phone's own tag for a question it sent — Wander saves it with the question and its answer */
  askId?: string;
}

/**
 * A photo for Scout (Oct 2: a menu, a sign, a ticket — read and translated): shrunk on the phone so it goes quickly on
 * hotel wifi (longest side 1568 px, which is all Scout reads), plus a small copy for the conversation.
 */
type Photo = { data: string; thumb: string };
/** Anything going to Scout with a question (Oct 4, Ken: "just drag (Mac) or paste (iOS) anything") */
type Attached = { name: string; mimeType: string; data: string; thumb?: string; size: number };
// (one file up to 10 MB; all of them together up to 18 MB as sent — the server takes 25 MB)
const MAX_FILE = 10 * 1024 * 1024, MAX_TOTAL_SENT = 18 * 1024 * 1024;
/** A file as base64, as it is (a PDF, a document, text) */
function readAsBase64(file: File): Promise<string | null> {
  return new Promise((ok) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result || "").split(",")[1] || null);
    r.onerror = () => ok(null);
    r.readAsDataURL(file);
  });
}
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
// The phone lost the connection mid-answer, but Wander's server goes on and saves the answer (Ken on the Shinkansen,
// Oct 11: three questions asked twice — every first one was answered and saved; the phone had said "I couldn't get an
// answer"). Said while this phone looks for the saved answer.
const DROPPED = "The connection dropped while I was answering — I'm still on it, and the answer will show up here.";
// …and when the phone has no signal at all (a tunnel): the question may have gone before the signal did
const NO_SIGNAL_WAIT = "No signal right now. If your question got through before the signal went, I'll show the answer here once you're back.";
// How long a question can go on being looked for: past Scout's own 150-second limit, so a long answer or a stalled line
// still finds what Wander saved (verify8: a 100-second answer showed "couldn't")
const LOOK_FOR_MS = 200_000;
// (reopened later — iOS drops a pocketed app — one look still finds what Wander saved; verify9: after 15 minutes the
// line turned to "couldn't" without looking, under an answer Wander had)
const LOOK_AFTER_RELOAD_MS = 24 * 3600_000;
const sameWords = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
/** A fresh tag for a question this phone sends */
const newAskId = () => {
  try { if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID(); } catch { /* older phones */ }
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

/** Wander's saved answer to this question, asked at sentAt — or null. A question sent with files is saved as "… (with
 *  menu (1).png)" (verify8: a file name with brackets was never matched). */
async function findSavedAnswer(tripId: string | undefined, q: string, sentAt: number, before = Infinity, askId?: string, earlier: string[] = []): Promise<ChatMessage | null> {
  if (!tripId) return null;
  const token = localStorage.getItem("wander_token");
  // (asked with its tag: Wander gives the answer to exactly this question — words and times can't tell menu page 1's
  // "What does this say?" from page 2's, nor survive a phone clock that runs fast; verify10)
  // (…and to the same question's earlier tries it took over — Try again on a bad line lost the answer the first try
  // got, saved under the first try's tag; verify11)
  if (askId) {
    for (const id of [askId, ...earlier.filter((e) => e !== askId)]) {
      const r = await fetch(`/api/chat/answer?tripId=${encodeURIComponent(tripId)}&askId=${encodeURIComponent(id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) continue;
      const j = await r.json() as { answer: ChatMessage | null };
      if (j.answer) return j.answer;
    }
    return null;
  }
  // (a line from before questions had tags: by its words, nearest its time)
  const r = await fetch(`/api/chat/history?tripId=${encodeURIComponent(tripId)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) return null;
  const j = await r.json() as { messages: ChatMessage[] };
  const list = Array.isArray(j.messages) ? j.messages : [];
  const isQ = (t: string) => sameWords(t, q) || t.replace(/\s+/g, " ").trim().startsWith(`${q.replace(/\s+/g, " ").trim()} (with `);
  // (this question as saved: Wander keeps it as of when it arrived, so the one asked nearest this send — two wordless
  // photos are both "What does this say?" and the later one's answer isn't this one's; verify9. The phone's clock and
  // a photo's upload time keep it a little apart)
  let best: { a: ChatMessage; off: number } | null = null;
  for (let i = 0; i < list.length - 1; i++) {
    const qm = list[i], a = list[i + 1];
    if (qm.role !== "user" || a.role !== "assistant" || !isQ(qm.text) || !qm.at) continue;
    const off = Date.parse(qm.at) - sentAt;
    // (…and never one asked once the same words had been sent again from this phone: that's the later one's — two
    // wordless photos 7 seconds apart; the later one's answer was taken for the first's; batch 10 check)
    if (off < -30_000 || off > 120_000 || Date.parse(qm.at) >= before) continue;
    if (!best || Math.abs(off) < Math.abs(best.off)) best = { a, off };
  }
  return best ? best.a : null;
}

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(chatKey());
    const msgs: ChatMessage[] = raw ? JSON.parse(raw) : [];
    // A question with no answer (the app closed mid-reply): Wander goes on and saves the answer, so a recent one is looked
    // for (verify8, Oct 11: iOS often reloads a Home Screen app after another app is used — the answer never showed);
    // an old one says it was cut off
    const recent = (t: number) => Number.isFinite(t) && Date.now() - t < LOOK_AFTER_RELOAD_MS;
    const last = msgs[msgs.length - 1];
    if (last && last.role === "user") {
      const sentAt = Date.parse(last.at || "");
      msgs.push(recent(sentAt)
        ? { role: "assistant", text: DROPPED, error: true, at: new Date().toISOString(),
            waitingFor: { q: last.text, sentAt, ...(last.files?.length ? { files: true } : {}), ...(last.askId ? { askId: last.askId } : {}) } }
        : { role: "assistant", text: CUT_OFF, error: true });
    }
    for (const m of msgs) if (m.role === "assistant" && (m.text === CUT_OFF || /^(No signal right now|That took over 45 seconds|That took too long|I couldn't get an answer just now)/.test(m.text))) m.error = true;
    // (a line still waiting when the app closed goes on waiting, if it's recent; else it says so)
    for (const m of msgs) if (m.role === "assistant" && (m.text === DROPPED || m.text === NO_SIGNAL_WAIT) && !(m.waitingFor && recent(m.waitingFor.sentAt))) {
      m.text = "I couldn't get an answer just now. Want me to try again?"; m.error = true; delete m.waitingFor;
    }
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

/**
 * Your conversation as Wander saved it, with what only this phone has (Oct 4, Ken: "When I change devices or change
 * between a webpage and web app … I seem to lose the history"). The saved one is the record: its questions and answers,
 * in order, with this phone's richer copy where they match (a photo's small copy, the bar's words). Kept from this phone
 * only: a question that never got its answer and a reply of the phone's own ("Back where you were") — in their place,
 * after what came before them — and nothing from before a "Start fresh" made on any device.
 */
export function mergeConversation(local: ChatMessage[], saved: ChatMessage[], freshAt: string | null): ChatMessage[] {
  const key = (m: ChatMessage) => `${m.role}|${m.text.replace(/\s+/g, " ").trim().slice(0, 300)}`;
  // (in order: the same "next" asked twice matches twice, never one line twice)
  const match = new Map<number, number>();
  let from = 0;
  local.forEach((l, i) => {
    for (let j = from; j < saved.length; j++) if (key(saved[j]) === key(l)) { match.set(i, j); from = j + 1; return; }
  });
  const out: ChatMessage[][] = saved.map((s) => [s]);
  const before: ChatMessage[] = [];
  // (what's newer than everything saved goes last, after anything another device added — never to the top; walk check,
  // Oct 4: a fresh question and answer landed above the saved conversation)
  const tail: ChatMessage[] = [];
  // Anything on this phone newer than the last saved line isn't saved yet — an answer that arrived while this read was on
  // its way (the save follows the answer); it's never dropped (Playwright, Oct 4: a fresh answer vanished)
  const lastSaved = saved.reduce<string | null>((m, s) => (s.at && (!m || s.at > m) ? s.at : m), null);
  const newer = (l: ChatMessage) => !!l.at && (!lastSaved || l.at > lastSaved);
  for (const [i, j] of match) out[j][0] = { ...saved[j], ...local[i], sources: local[i].sources || saved[j].sources };
  let after = -1;
  local.forEach((l, i) => {
    if (match.has(i)) { after = match.get(i)!; return; }
    const next = local[i + 1];
    const onlyHere = l.error || l.quiet || newer(l) || (l.role === "user" && !!next && !match.has(i + 1) && (next.error || next.quiet || newer(next)));
    const sinceFresh = l.at ? !freshAt || l.at > freshAt : after >= 0 || !freshAt;
    if (!onlyHere || !sinceFresh) return;
    // (a question with no time of its own goes with the answer after it)
    if (newer(l) || (tail.length > 0 && !l.at) || (l.role === "user" && !!next && newer(next) && !match.has(i + 1))) tail.push(l);
    else if (after >= 0) out[after].push(l);
    else before.push(l);
  });
  return [...before, ...out.flat(), ...tail];
}

/**
 * Read an answer aloud (Ken, Oct 5: "put a button into Scout's answer to make it read the answer") — the phone's own
 * voice, nothing sent anywhere. Words only: no ** marks, no web addresses (said as "a link"); Japanese stretches (a
 * menu line, the words to show staff) in a Japanese voice — an English voice garbles them.
 */
const canRead = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
function stopReading() { try { if (canRead()) window.speechSynthesis.cancel(); } catch { /* nothing to stop */ } }
function readAloud(text: string, onEnd: () => void) {
  stopReading();
  const plain = text
    .replace(/\*\*/g, "").replace(/(^|\s)\*(\S[^*\n]*\S)\*(?=\s|$)/g, "$1$2")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "a link")
    .replace(/^\s*[–•-]\s*/gm, "")
    .replace(/[ \t]+/g, " ").trim();
  const JA = /[぀-ヿ㐀-鿿ｦ-ﾟ]+(?:[\s・、。ー]*[぀-ヿ㐀-鿿ｦ-ﾟ]+)*/g;
  const parts: { text: string; ja: boolean }[] = [];
  let at = 0;
  for (const m of plain.matchAll(JA)) {
    if (m.index! > at) parts.push({ text: plain.slice(at, m.index), ja: false });
    parts.push({ text: m[0], ja: true });
    at = m.index! + m[0].length;
  }
  if (at < plain.length) parts.push({ text: plain.slice(at), ja: false });
  const voices = window.speechSynthesis.getVoices();
  const jaVoice = voices.find((v) => /^ja/i.test(v.lang));
  const enVoice = voices.find((v) => /^en-US/i.test(v.lang) && v.localService) || voices.find((v) => /^en/i.test(v.lang));
  const spoken = parts.filter((p) => p.text.trim());
  if (!spoken.length) { onEnd(); return; }
  spoken.forEach((p, n) => {
    const u = new SpeechSynthesisUtterance(p.text);
    u.lang = p.ja ? "ja-JP" : "en-US";
    const voice = p.ja ? jaVoice : enVoice;
    if (voice) u.voice = voice;
    if (n === spoken.length - 1) { u.onend = onEnd; u.onerror = onEnd; }
    window.speechSynthesis.speak(u);
  });
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
  // A first word from Scout for this person, with one question to tap — shown only before anything's been said
  // (Oct 10: Julie's packing quip; services/scoutHello.ts decides who and until when)
  const [hello, setHello] = useState<{ words: string; ask: string; last?: boolean } | null>(null);
  const helloRef = useRef(hello);
  helloRef.current = hello;
  // (answered here: a sync already on its way doesn't bring it back)
  const helloAnswered = useRef(false);
  const [helloNote, setHelloNote] = useState<string | null>(null);
  // "Later" brings it back after a while (at most three offers); "No thanks" ends it; asking something else first is a
  // quiet "Later" — Ken, Oct 10: "people are in a hurry … there should be a show me later option"
  const answerHello = useCallback((answer: "later" | "no", quiet = false) => {
    helloAnswered.current = true;
    setHello(null);
    setHelloNote(quiet ? null : answer === "later"
      ? "I'll offer it again later. You can also ask me what to pack any time."
      : "No problem. If you change your mind, ask me what to pack.");
    api.post("/chat/hello", { answer }).catch(() => { /* kept on this phone for now; offered again next time */ });
  }, []);
  // One-time tips, at the moment they help (Oct 2): the camera, for people already talking with Scout; Sources, under
  // the first answer that has them. Using the thing puts its tip away too.
  const [cameraTip, cameraTipDone] = useOnceTip("scout-camera");
  const [sourcesTip, sourcesTipDone] = useOnceTip("scout-sources");
  const [input, setInput] = useState("");
  // What goes with the next question — pictures, PDFs, documents, text files, dragged in, pasted or chosen — and what
  // went with one in flight (kept for "Try again")
  const [files, setFiles] = useState<Attached[]>([]);
  // What went with the question in flight, for the words while Scout works ("Reading your picture")
  const [sentWith, setSentWith] = useState<"picture" | "pictures" | "file" | null>(null);
  const [filesReading, setFilesReading] = useState(0);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const retryFilesRef = useRef<Attached[]>([]);
  // (the same list, for code that runs between renders)
  const filesRef = useRef<Attached[]>([]);
  filesRef.current = files;
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  // A cut-off question from last time can be asked again with one tap
  // (a question still being looked for after the app reopened keeps its Try again)
  // (…but not a photo's: the photo isn't kept on the phone, so Try again would send the words alone; verify10)
  const [failed, setFailed] = useState(() => messages.length > 1 && (messages[messages.length - 1].text === CUT_OFF
    || (!!messages[messages.length - 1].waitingFor && !messages[messages.length - 1].waitingFor!.files)));
  const [lastFailedText, setLastFailedText] = useState(() => {
    const last = messages[messages.length - 1];
    if (messages.length > 1 && last.waitingFor) return last.waitingFor.files ? "" : last.waitingFor.q;
    return messages.length > 1 && last.text === CUT_OFF ? messages[messages.length - 2].text : "";
  });
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

  // Where the bottom bar sits when it's placed from the screen's top (BottomNav, upright iPhone Home Screen app): the slim
  // bar sits right on it — on its own "bottom" it floated mid-screen with it (Ken, Oct 13 10:53). Elsewhere, as before.
  const [navTop, setNavTop] = useState<number | null>(() => (typeof window !== "undefined" ? (window as any).__wanderNavTop ?? null : null));
  useEffect(() => {
    const on = (e: Event) => setNavTop((e as CustomEvent).detail?.top ?? null);
    window.addEventListener("wander:nav-top", on);
    return () => window.removeEventListener("wander:nav-top", on);
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
  // "Buzz me when it's ready" (lib/buzz.ts — Ken, Oct 12): offered once per phone, the first time an answer takes a while,
  // while they're still looking; it stays until they decide. After "Turn on", every slow answer buzzes by itself.
  const [buzz, setBuzz] = useState<"none" | "offer" | "asking" | "on" | "off" | "failed">("none");
  useEffect(() => {
    if (!sending || buzz !== "none") return;
    const t = setTimeout(() => { if (canOfferBuzz()) setBuzz("offer"); }, 5000);
    return () => clearTimeout(t);
  }, [sending, buzz]);
  useEffect(() => {
    if (buzz !== "on" && buzz !== "off" && buzz !== "failed") return;
    const t = setTimeout(() => setBuzz("none"), 8000);
    return () => clearTimeout(t);
  }, [buzz]);
  // (a phone that already allowed it keeps its address current each time Wander opens, signed in)
  useEffect(() => { if (user?.travelerId) keepBuzzCurrent(); }, [user?.travelerId]);
  // One question at a time, known the instant it's sent (the `sending` state a callback holds can be from before)
  const sendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Looking for answers the phone lost the line to (verify8, Oct 11: the look lived only inside one send, so a reload,
  // asking again, a stalled line or a long answer all ended in "couldn't" though Wander had the answer). Each waiting
  // line in the conversation has its own look, keyed by the line's time; it ends when the answer is found, when the
  // same question is asked again (that ask replaces it), or well past Scout's own time limit.
  const looksRef = useRef(new Map<string, { stop: boolean }>());
  const lastFailedRef = useRef(lastFailedText);
  lastFailedRef.current = lastFailedText;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const tripRef = useRef<string | undefined>(context?.tripId);
  tripRef.current = context?.tripId;
  const herGuideRef = useRef("Larisa's Guide");
  herGuideRef.current = /^larisa$/i.test(user?.displayName || "") ? "your Guide" : "Larisa's Guide";
  const onDataChangedRef = useRef(onDataChanged);
  onDataChangedRef.current = onDataChanged;
  // (the tag of the question whose files retryFilesRef holds — a photo can be sent again only while it's on the phone)
  const retryAskRef = useRef<string | null>(null);
  const startLook = useCallback((waitAt: string, q: string, sentAt: number, noSignal: boolean, status: number | null, askId?: string, files?: boolean, earlier: string[] = []) => {
    if (looksRef.current.has(waitAt)) return;
    const me = { stop: false };
    looksRef.current.set(waitAt, me);
    // (Try again on a photo sends the photo — only while this phone still has it: after a reload, or once another
    // question has gone, it would send the words alone; verify10)
    const canRetry = () => !files || (!!askId && retryAskRef.current === askId && retryFilesRef.current.length > 0);
    const couldnt = () => (canRetry() ? "I couldn't get an answer just now. Want me to try again?" : "I couldn't get an answer just now — send the photo again and I'll read it.");
    const tell = (result: string) => phoneReport("scout-drop", { result, secs: Math.round((Date.now() - sentAt) / 1000), noSignal, status: status ?? 0 });
    const noSignalNow = () => `No signal right now, so I can't answer. Today's plan from ${herGuideRef.current} is still under Next.`;
    // (the conversation read back from Wander — the app coming to the front — may have brought the answer already:
    // then the waiting line just goes, never the answer twice)
    const settle = (found: ChatMessage | null, instead: string) => setMessages((prev) => {
      const isWait = (m: ChatMessage) => m.at === waitAt && !!m.waitingFor;
      if (found && prev.some((m) => m.role === "assistant" && m.text === found.text)) return prev.filter((m) => !isWait(m));
      return prev.map((m) => (isWait(m) ? (found ? { ...found } : { role: "assistant" as const, text: instead, error: true }) : m));
    });
    const done = () => { looksRef.current.delete(waitAt); };
    // ("Want me to try again?" always comes with its button — after Never mind too, or another failure's button
    // would be taken over; verify9)
    const offerAgain = () => { if (canRetry() && (!lastFailedRef.current || sameWords(lastFailedRef.current, q))) { setFailed(true); setLastFailedText(q); } };
    void (async () => {
      if (noSignal) {
        // (up to ten minutes for the signal to come back)
        const gaveUp = Date.now() + 600_000;
        while (navigator.onLine === false && Date.now() < gaveUp) {
          await new Promise((r) => setTimeout(r, 2000));
          if (me.stop) { done(); tell("asked-again"); return; }
        }
        if (navigator.onLine === false) { settle(null, noSignalNow()); offerAgain(); done(); tell("still-no-signal"); return; }
        // (the signal's back: "No signal right now" would be untrue now — verify9)
        setMessages((prev) => prev.map((m) => (m.at === waitAt && m.waitingFor && m.text === NO_SIGNAL_WAIT ? { ...m, text: DROPPED } : m)));
      }
      const until = Math.max(sentAt + LOOK_FOR_MS, Date.now() + 45_000);
      // (the first look at once — reopened, the answer is often already saved; verify10 saw it beside "still on it")
      let first = true;
      while (Date.now() < until) {
        if (!first) await new Promise((r) => setTimeout(r, 4000));
        first = false;
        if (me.stop) { done(); tell("asked-again"); return; }
        // (the next time these same words were sent from this phone, if they were — its answer isn't this one's)
        const later = messagesRef.current.filter((m) => m.role === "user" && sameWords(m.text, q) && !!m.at && Date.parse(m.at) > sentAt + 1000)
          .map((m) => Date.parse(m.at!)).sort((a, b) => a - b)[0];
        const found = await findSavedAnswer(tripRef.current, q, sentAt, later ?? Infinity, askId, earlier).catch(() => null);
        if (me.stop) { done(); tell("asked-again"); return; }
        if (found) {
          settle(found, "");
          if (sameWords(lastFailedRef.current, q)) { setFailed(false); setLastFailedText(""); }
          // (it may have added something — a note, a plan: the screens read again; verify10)
          onDataChangedRef.current?.();
          done(); tell("answer-found");
          return;
        }
      }
      settle(null, navigator.onLine === false ? noSignalNow() : couldnt());
      offerAgain(); done(); tell("not-found");
    })();
  }, []);

  // Persist messages to localStorage
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  // The same conversation on every device — read back from Wander when Scout opens and when the app comes back to the
  // front (at most every 15 seconds; never while an answer is on its way). See mergeConversation.
  const syncedAt = useRef(0);
  const tripForChat = context?.tripId;
  // Try again only beside a question that's on screen (verify9: Start fresh on another device cleared the conversation
  // and left Try again / Never mind under the greeting, resending a question no one could see)
  useEffect(() => {
    if (failed && lastFailedText && !messages.some((m) => m.role === "user" && sameWords(m.text, lastFailedText))) {
      setFailed(false);
      setLastFailedText("");
    }
    // (…and a waiting line whose question is gone — Start fresh on another device — goes too, its look stopped;
    // verify10 saw "I'm still on it" under no question)
    const orphan = (m: ChatMessage, i: number) => !!m.waitingFor && !messages.slice(0, i).some((p) => p.role === "user" && sameWords(p.text, m.waitingFor!.q));
    if (messages.some(orphan)) {
      for (const [i, m] of messages.entries()) if (orphan(m, i) && m.at) { const l = looksRef.current.get(m.at); if (l) l.stop = true; }
      setMessages((prev) => prev.filter((m, i) => !orphan(m, i)));
    }
  }, [messages, failed, lastFailedText]);
  // A line still waiting when the app was reopened goes on looking (verify8 FAIL 1)
  useEffect(() => {
    if (!tripForChat) return;
    for (const m of messages) if (m.waitingFor && m.at) startLook(m.at, m.waitingFor.q, m.waitingFor.sentAt, navigator.onLine === false, null, m.waitingFor.askId, m.waitingFor.files, m.waitingFor.earlier);
    // (once the trip is known — the lines that were waiting when the app opened)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripForChat]);
  useEffect(() => {
    if (!tripForChat) return;
    let live = true;
    // (a read cut off by Scout opening or closing is read again at once, not 15 s later — Oct 10: Julie tapping Scout in
    // the first second lost her packing offer for the whole visit; the answer on its way was dropped and the next read
    // waited out the 15 s)
    let inFlight = false;
    const sync = async () => {
      if (sendingRef.current || Date.now() - syncedAt.current < 15_000 || navigator.onLine === false) return;
      syncedAt.current = Date.now();
      inFlight = true;
      try {
        const token = localStorage.getItem("wander_token");
        const r = await fetch(`/api/chat/history?tripId=${encodeURIComponent(tripForChat)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!r.ok) return;
        const j = await r.json() as { messages: ChatMessage[]; freshAt: string | null; hello?: { words: string; ask: string } };
        if (!live || sendingRef.current || !Array.isArray(j.messages)) return;
        if (!helloAnswered.current) setHello(j.hello && typeof j.hello.words === "string" && typeof j.hello.ask === "string" ? j.hello : null);
        // (nothing new: the conversation isn't redrawn — it would jump someone reading it back to the end)
        setMessages((prev) => {
          const next = mergeConversation(prev, j.messages, j.freshAt);
          const same = next.length === prev.length && next.every((m, i) => m.role === prev[i].role && m.text === prev[i].text);
          return same ? prev : next;
        });
      } catch { /* this phone's own copy stays */ } finally { inFlight = false; }
    };
    sync();
    const onShow = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { live = false; if (inFlight) syncedAt.current = 0; document.removeEventListener("visibilitychange", onShow); };
  }, [tripForChat, open]);

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
    // (never while someone is selecting words in the conversation — it moved the answer out from under their finger)
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.anchorNode && box.contains(sel.anchorNode)) return;
    const bubbles = box.querySelectorAll<HTMLElement>("[data-msg]");
    // Nothing said yet: the greeting and suggestions from the top
    if (!bubbles.length && !box.querySelector("[data-thinking]")) { box.scrollTop = 0; return; }
    // Scout's first word below a conversation is the latest thing — shown from its first words (scrolled to the very
    // end, it began mid-sentence on an iPhone's half-height panel: "useful. I have a short list…")
    const hello = box.querySelector<HTMLElement>("[data-scout-hello-block]");
    if (hello && !box.querySelector("[data-thinking]")) {
      box.scrollTop = hello.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8;
      return;
    }
    const lastBubble = bubbles[bubbles.length - 1];
    // An answer with "Use my location": down to the button, as long as the answer's first line stays in view (verify15:
    // on the half-height panel the button sat below the fold under "tap Use my location below")
    const here = lastBubble?.dataset.msg === "assistant" ? lastBubble.querySelector<HTMLElement>("[data-here-button]") : null;
    if (here) {
      const view = box.getBoundingClientRect();
      const top = lastBubble.getBoundingClientRect().top - view.top - 8;
      const below = here.getBoundingClientRect().bottom - view.bottom + 12;
      // (the least move that shows both; when both can't show, the first line wins)
      box.scrollTop += below <= top ? Math.min(Math.max(0, below), top) : top;
      return;
    }
    if (lastBubble?.dataset.msg === "assistant" && lastBubble.offsetHeight > box.clientHeight * 0.6) {
      box.scrollTop += lastBubble.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
    } else {
      box.scrollTop = box.scrollHeight;
    }
  }, []);

  // (Scout's first word arriving is a new latest thing too)
  useEffect(() => { scrollToLatest(); }, [messages, sending, scrollToLatest, hello]);
  // (…and the buzz offer appearing under "Going through the trip" — only then: it sat just below the fold while they
  // waited (verify19), and moving on every tap threw a reader under a long answer back to its top (verify20))
  useEffect(() => { if (buzz === "offer" && sendingRef.current) scrollToLatest(); }, [buzz, scrollToLatest]);

  // The sheet's size on a phone, and the space the keyboard leaves (the visible part of the screen)
  const [size, setSize] = useState<"half" | "full">("half");
  // h: the visible height; kb: the keyboard's height; while typing, top: where the visible part of the screen starts
  // (the panel is placed from that, never from the page's height — see the effect below); page: the page's height
  const [vp, setVp] = useState<{ h: number; kb: number; top: number | null; page: number; shift: number } | null>(null);
  // The strip the iPhone keeps for its clock and Dynamic Island (env(safe-area-inset-top); 0 elsewhere). Scout's panel
  // never reaches into it: full size with the keyboard up, its top (and the button to make it smaller) sat 8 pt from the
  // screen's top, under the clock, out of reach (Ken, Oct 13 11:51: "expanded scout and couldn't shrink again")
  const [safeTop] = useState(() => {
    if (typeof document === "undefined") return 0;
    try {
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;top:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top, 0px)";
      document.body.appendChild(probe);
      const v = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      probe.remove();
      return Math.round(v);
    } catch { return 0; }
  });
  // Which answer was just copied (Copy under each answer — Ken, Oct 4: a long answer he wanted elsewhere couldn't be
  // selected or copied)
  const [copied, setCopied] = useState<number | null>(null);
  // The answer being read aloud (its first bubble), if any — one at a time; it stops when Scout closes
  const [reading, setReading] = useState<number | null>(null);
  useEffect(() => {
    if (!open && reading !== null) { stopReading(); setReading(null); }
  }, [open, reading]);
  useEffect(() => () => stopReading(), []);
  const dragStart = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    let last: { h: number; kb: number; top: number | null; page: number; shift: number } | null = null;
    // The keyboard is up only while a box in Scout is being typed in. An iPhone can go on reporting a keyboard-sized
    // screen after the keyboard has gone (Ken, Oct 9: after typing a note, Scout's panel opened above the top of the
    // screen, lifted over a keyboard that wasn't there) — so without typing, it's the page's own full height.
    const typingHere = () => {
      const a = document.activeElement;
      return !!a && !!panelRef.current?.contains(a) && a.matches("textarea, input:not([type='file']), [contenteditable='true']");
    };
    const update = () => {
      const layoutH = document.documentElement.clientHeight || window.innerHeight;
      const typing = typingHere();
      // While typing, the panel is placed from where the visible part of the screen starts and how tall it is — the
      // page's own height can be misreported by an iPhone (Ken, Oct 10: typing to Scout, its panel went off the screen
      // and the tab bar floated mid-screen — placed from the page's height, the panel lands too high by the error)
      const next = typing
        ? { h: Math.round(vv.height), kb: Math.max(0, Math.round(layoutH - vv.height - vv.offsetTop)), top: Math.round(vv.offsetTop), page: Math.round(layoutH), shift: 0 }
        // (shift: how far iOS has left the screen moved down the page after the keyboard went — lib/screenShift; 0 normally)
        : { h: Math.round(Math.max(vv.height, layoutH)), kb: 0, top: null, page: Math.round(layoutH), shift: screenShift() };
      // (only a real change — a long press to select an answer moves the viewport a little, and every update scrolled
      // the conversation to its end and put the cursor back in the box, which took the selection away: Ken, Oct 4,
      // "a long press gives tactile feedback but doesn't actually select anything")
      if (last && last.h === next.h && last.kb === next.kb && last.top === next.top && last.page === next.page && last.shift === next.shift) return;
      const keyboardMoved = !last || last.kb !== next.kb;
      last = next;
      setVp(next);
      if (!keyboardMoved) return;
      // The panel just resized around the keyboard: an iPhone can keep the box focused but stop drawing its cursor
      // (Ken tapped a second time to see it) — setting the cursor again makes it draw. Never while words are selected
      // somewhere else on the screen.
      requestAnimationFrame(() => {
        const el = inputRef.current;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.anchorNode && !el?.contains(sel.anchorNode) && sel.anchorNode !== el?.parentNode) return;
        if (el && document.activeElement === el) {
          const at = el.selectionEnd ?? el.value.length;
          try { el.setSelectionRange(at, at); } catch { /* ignore */ }
        }
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    // (starting or stopping typing changes the answer even when the iPhone reports nothing new)
    const soon = () => requestAnimationFrame(update);
    document.addEventListener("focusin", soon);
    document.addEventListener("focusout", soon);
    return () => {
      vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", soon); document.removeEventListener("focusout", soon);
    };
  }, [open]);
  // The page under Scout stays where it was while you type in Scout (Ken's iPhone, Oct 13 10:34: tapping the box, iOS
  // scrolled the page underneath 380 pt to "reveal" a box that's pinned to the screen and needed no revealing — then put
  // its Paste menu under the Dynamic Island and, with the keyboard gone, left Scout's panel high with the day bright
  // below, all reckoned from the scrolled page). Put straight back, the panel is placed from an unscrolled page. Phones
  // only; only while the box is being typed in; at most six times per tap. The page's own top bars are untouched —
  // pinning the whole page would have lost their stickiness while Scout is open.
  const pageHeldAt = useRef<number | null>(null);
  const pageHolds = useRef(0);
  useEffect(() => {
    if (!open || window.matchMedia?.("(min-width: 640px)").matches) return;
    const onFocus = (e: FocusEvent) => { if (e.target === inputRef.current) { pageHeldAt.current = window.scrollY; pageHolds.current = 0; } };
    const onBlur = (e: FocusEvent) => { if (e.target === inputRef.current) pageHeldAt.current = null; };
    const onScroll = () => {
      const y = pageHeldAt.current;
      if (y === null || document.activeElement !== inputRef.current || pageHolds.current >= 6) return;
      if (Math.abs(window.scrollY - y) > 2) { pageHolds.current++; window.scrollTo(0, y); }
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      window.removeEventListener("scroll", onScroll);
      pageHeldAt.current = null;
    };
  }, [open]);
  // Where the iPhone thinks the box and the panel are — when the box is tapped, when the keyboard has settled, and when
  // the screen changes size (the keyboard going up or down) — numbers only, to the server's log (Ken, Oct 13: iOS's
  // Paste menu at the very top of the screen; at 10:24 Scout's panel stuck near the top with the day bright below).
  // Measured before anything in the keyboard area is changed; it changes nothing on screen. Six per opening at most.
  useEffect(() => {
    if (!open) return;
    let sent = 0, focused = false;
    const measure = (when: "focus" | "settled" | "resize") => {
      const el = inputRef.current, vv = window.visualViewport;
      if (!el || !vv || sent >= 6) return;
      sent++;
      const r = el.getBoundingClientRect(), p = panelRef.current?.getBoundingClientRect();
      phoneReport("scout-caret", { when, sy: Math.round(window.scrollY), vvTop: Math.round(vv.offsetTop), vvH: Math.round(vv.height),
        page: Math.round(document.documentElement.clientHeight), inner: Math.round(window.innerHeight), boxTop: Math.round(r.top),
        boxBottom: Math.round(r.bottom), panelTop: Math.round(p?.top ?? -1), panelBottom: Math.round(p?.bottom ?? -1),
        active: document.activeElement === el, selStart: el.selectionStart ?? -1, holds: pageHolds.current });
    };
    let t: ReturnType<typeof setTimeout> | null = null, rt: ReturnType<typeof setTimeout> | null = null;
    const onFocus = (e: FocusEvent) => {
      if (e.target !== inputRef.current || focused) return;
      focused = true;
      measure("focus");
      t = setTimeout(() => measure("settled"), 900);
    };
    // (once the screen has stopped changing size: the panel as it was left)
    const onResize = () => { if (rt) clearTimeout(rt); rt = setTimeout(() => measure("resize"), 600); };
    document.addEventListener("focusin", onFocus);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("focusin", onFocus);
      window.visualViewport?.removeEventListener("resize", onResize);
      if (t) clearTimeout(t);
      if (rt) clearTimeout(rt);
    };
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
    // The Scout tab, or an "Ask Scout" button: open ready to type, cursor in the box, in the same tap — an iPhone
    // raises the keyboard only for a focus inside the tap itself (Ken, Oct 3: asking took two or three taps — one to
    // open, one for the keyboard, sometimes another before the cursor showed)
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      flushSync(() => {
        setSize(detail?.prefill ? "full" : "half");
        setOpen(true);
        if (detail?.prefill) setInput(detail.prefill);
      });
      // …unless Scout has a first word for this person: it opens to read, so the keyboard doesn't cover the offer and
      // its Later / No thanks (Ken, Oct 10: "a first impression cannot cause confusion")
      if (helloRef.current && !detail?.prefill) return;
      // (opened from "Scout answered" on the lock screen: to read the answer — no keyboard over it)
      if (detail?.read) return;
      const el = inputRef.current;
      if (el) {
        el.focus();
        const end = el.value.length;
        try { el.setSelectionRange(end, end); } catch { /* not a text field yet */ }
      }
    };
    const close = () => minimizeRef.current();
    window.addEventListener("wander-open-chat", handler);
    window.addEventListener("wander-close-chat", close);
    return () => { window.removeEventListener("wander-open-chat", handler); window.removeEventListener("wander-close-chat", close); };
  }, []);

  // retryText: resend a question already on screen. asNew: a tapped example question — show it as theirs.
  // given: where the phone is, read for "Use my location" — the question goes again, words only, with it.
  const sendMessage = useCallback(async (retryText?: string, asNew = false, given?: Here) => {
    const sendFiles = given ? [] : retryText ? retryFilesRef.current : files;
    // sent with no words: a photo is read and translated; anything else, what it is and why it matters
    const onlyPictures = sendFiles.length > 0 && sendFiles.every((f) => f.mimeType.startsWith("image/"));
    const text = retryText || input.trim() || (sendFiles.length ? (onlyPictures ? "What does this say?" : sendFiles.length === 1 ? "What's in this?" : "What's in these?") : "");
    const sendPhoto = sendFiles.length > 0;
    if (!text || sending || sendingRef.current) return;
    // Scout's first word: its question asked, it's done; something else asked first, it's put off for later
    if (helloRef.current) {
      if (text === helloRef.current.ask) { helloAnswered.current = true; setHello(null); }
      else answerHello("later", true);
    }
    setHelloNote(null);
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

    // The same question asked again (typed, or Try again) takes over from a line still waiting for it: that look stops and
    // the waiting line goes — never "couldn't" beside a new ask (verify8 FAIL 4). Typed again, the earlier copy of the
    // question goes with it, so it doesn't sit there twice.
    // (a photo or file sent without words is "What does this say?" every time — a second photo is a new question, not the
    // first asked again; only Try again re-sends the same one; verify9)
    const takesOver = (w: NonNullable<ChatMessage["waitingFor"]>) => sameWords(w.q, text) && (!!retryText || (!w.files && sendFiles.length === 0));
    // The tags of this same question's earlier tries that never got an answer on screen (the last half hour): the new
    // try looks for their answers too — Try again on a bad line lost the answer the first try got (verify11). An earlier
    // try that WAS answered isn't one ("What's next?" at 2 PM isn't 5 PM's answer).
    const earlier = [...new Set(messages.flatMap((m, i) => {
      if (m.role !== "user" || !m.askId || !m.at || Date.now() - Date.parse(m.at) > 30 * 60_000 || !sameWords(m.text, text)) return [];
      if (!retryText && (m.files?.length || sendFiles.length)) return [];
      const next = messages[i + 1];
      if (next && next.role === "assistant" && !next.error && !next.waitingFor) return [];
      return [m.askId, ...(next?.waitingFor?.askId ? [next.waitingFor.askId] : []), ...(next?.waitingFor?.earlier ?? [])];
    }))];
    if (messages.some((m) => m.waitingFor && takesOver(m.waitingFor))) {
      for (const m of messages) if (m.waitingFor && takesOver(m.waitingFor) && m.at) { const l = looksRef.current.get(m.at); if (l) l.stop = true; }
      const typedAgain = !retryText || asNew;
      setMessages((prev) => prev.filter((m, i) => !(m.waitingFor && takesOver(m.waitingFor))
        && !(typedAgain && m.role === "user" && sameWords(m.text, text) && !!prev[i + 1]?.waitingFor && takesOver(prev[i + 1].waitingFor!))));
    }

    // (this question's own tag — Wander saves it with the question and the answer, so a lost answer is found by it alone)
    const askId = newAskId();
    if (!retryText || asNew) {
      if (!retryText) setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      setMessages((prev) => [...prev, { role: "user", text, at: new Date().toISOString(), askId, ...(given ? { withHere: true } : {}), ...(sendFiles.length ? { files: sendFiles.map((f) => ({ name: f.name, ...(f.thumb ? { thumb: f.thumb } : {}) })) } : {}) }]);
    }
    retryFilesRef.current = sendFiles;
    retryAskRef.current = askId;
    setSentWith(!sendFiles.length ? null : onlyPictures ? (sendFiles.length > 1 ? "pictures" : "picture") : "file");
    if (!retryText) { setFiles([]); setFileNote(null); }
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
    const sentAt = Date.now();
    const offlineAtSend = typeof navigator !== "undefined" && navigator.onLine === false;
    // A stalled line gives no error until the 150-second limit, while Wander may already have saved the answer: after 30
    // seconds, look for it every 8 and show it as soon as it's there (verify8 FAIL 2)
    // (found saved, the real reply gets 15 seconds more to arrive whole — it carries "Show me", the chips and the screens'
    // refresh, which the saved copy doesn't; a long reply still arriving was cut off by an at-once switch; verify9)
    const peek = { found: null as ChatMessage | null, cut: undefined as ReturnType<typeof setTimeout> | undefined };
    const peeking = setInterval(() => {
      if (Date.now() - sentAt < 30_000 || peek.found) return;
      void findSavedAnswer(context?.tripId, text, sentAt, Infinity, askId, earlier).then((f) => {
        if (!f || peek.found || abortRef.current !== controller) return;
        peek.found = f;
        // (30 s: a reply 20 s behind its saved copy was cut at 15 and lost "Show me"; verify10)
        peek.cut = setTimeout(() => { if (abortRef.current === controller) controller.abort(); }, 30_000);
      }).catch(() => { /* still waiting on the line itself */ });
    }, 8000);

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

      // Where the phone is, for "what's near me?" — only when the question needs it or Wander may already know
      const here = given ?? (offlineAtSend ? null : await whereAmI(text));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ message: text, context, history, clientTime, askId, ...(here ? { here } : {}), ...(sendFiles.length ? { attachments: sendFiles.map((f) => ({ mediaType: f.mimeType, data: f.data, name: f.name, ...(f.thumb ? { thumb: f.thumb } : {}) })) } : {}) }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      clearInterval(peeking);
      clearTimeout(peek.cut);

      if (!res.ok) throw Object.assign(new Error(`Request failed: ${res.status}`), { status: res.status });
      const data = await res.json();
      retryFilesRef.current = [];

      const shows = data.shows as ChatMessage["shows"];
      const goTo = shows?.find((s) => s.go);
      const headline = (goTo?.headline || shows?.find((s) => s.headline)?.headline || "").trim() || undefined;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.reply, actions: data.actions, places: data.places, shows, headline, at: new Date().toISOString(),
          ...(Array.isArray(data.routes) && data.routes.length ? { routes: data.routes } : {}),
          ...(data.askHere === true ? { askHere: true } : {}),
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
      clearInterval(peeking);
      clearTimeout(peek.cut);
      // (a stalled line, and the answer was already saved: shown as if it had come — the stalled request is let go — and
      // the screens read again, in case Scout added something)
      if (peek.found) {
        const found = peek.found;
        setMessages((prev) => (prev.some((m) => m.role === "assistant" && m.text === found.text) ? prev : [...prev, { ...found }]));
        onDataChanged?.();
        phoneReport("scout-drop", { result: "answer-found-while-stalled", secs: Math.round((Date.now() - sentAt) / 1000), noSignal: false, status: 0 });
        return;
      }
      const isTimeout = err?.name === "AbortError";
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      // (sent with no signal already, it never went: said plainly at once — verify9: "If your question got through…" stayed
      // up minutes after the signal was back, for a question that couldn't have)
      // (…unless an earlier try of it may have got through: then the promise to show that answer stands — Try again in the
      // tunnel cancelled it; verify11)
      if (offlineAtSend && earlier.length && context?.tripId) {
        const waitAt = new Date().toISOString();
        setMessages((prev) => [...prev, { role: "assistant", text: NO_SIGNAL_WAIT, error: true, at: waitAt, waitingFor: { q: text, sentAt, askId, earlier, ...(sendFiles.length ? { files: true } : {}) } }]);
        setFailed(true);
        setLastFailedText(text);
        startLook(waitAt, text, sentAt, true, null, askId, sendFiles.length > 0, earlier);
        return;
      }
      if (offlineAtSend) {
        setMessages((prev) => [...prev, { role: "assistant", text: `No signal right now, so I can't answer. Today's plan from ${herGuideRef.current} is still under Next.`, error: true }]);
        setFailed(true);
        setLastFailedText(text);
        return;
      }
      const errorMsg = isTimeout
        ? "That took too long — over two minutes. Want me to try again?"
        : "I couldn't get an answer just now. Want me to try again?";
      // The question may well have reached Wander, which answers and saves it even after the phone has lost the line:
      // say so, and look for the saved answer ("Try again" stays there meanwhile) — a broken line, the long wait, no
      // signal at all (a tunnel: wait for it, then look), or Railway's own gateway giving up (502–504). Wander itself
      // saying no — an error it sent back — means nothing was saved: said at once.
      const status = typeof err?.status === "number" ? err.status : null;
      if (context?.tripId && (offline || status === null || (status >= 502 && status <= 504))) {
        const waitAt = new Date().toISOString();
        setMessages((prev) => [...prev, { role: "assistant", text: offline ? NO_SIGNAL_WAIT : DROPPED, error: true, at: waitAt, waitingFor: { q: text, sentAt, askId, ...(earlier.length ? { earlier } : {}), ...(sendFiles.length ? { files: true } : {}) } }]);
        setFailed(true);
        setLastFailedText(text);
        startLook(waitAt, text, sentAt, offline, status, askId, sendFiles.length > 0, earlier);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", text: errorMsg, error: true }]);
      setFailed(true);
      setLastFailedText(text);
    } finally {
      clearInterval(peeking);
      clearTimeout(peek.cut);
      sendingRef.current = false;
      setSending(false);
      abortRef.current = null;
    }
  }, [input, sending, context, onDataChanged, messages, files, answerHello, startLook]);

  // "Use my location" under an answer that needed it (Oct 12): the phone is asked — the iPhone's box comes up when it
  // hasn't been allowed since Wander opened — and the same question goes again with where it is. No position: said
  // plainly, and the button stays for another try.
  const [locating, setLocating] = useState(false);
  // (the newest sendMessage: a question typed while the iPhone's box was up may still be answering when the box is
  // answered — the location question waits its turn and then goes, with the conversation as it is by then; verify15:
  // it was dropped without a word)
  const sendLatest = useRef(sendMessage);
  sendLatest.current = sendMessage;
  const shareLocation = useCallback(async (question: string) => {
    if (locating || sendingRef.current) return;
    setLocating(true);
    const got = await hereNow();
    if ("lat" in got) {
      for (const t0 = Date.now(); sendingRef.current && Date.now() - t0 < 180_000;) await new Promise((r) => setTimeout(r, 300));
      setLocating(false);
      void sendLatest.current(question, true, got);
      return;
    }
    setLocating(false);
    // (said once; a second "no" in the same opening says how to change it — the same line again read as broken;
    // verify15. iOS asks again when Wander is opened afresh — K4.)
    const NO = "Your iPhone didn't share where you are. Tell me what you're near, like a station, a shop or your hotel, and I'll go from there.";
    const STILL_NO = "Your iPhone isn't sharing your location with Wander right now. To change that, swipe Wander away, open it again, and tap Use my location. Or tell me what you're near.";
    const NO_FIX = "Your iPhone couldn't find where you are just now. That happens in stations and underground. Tell me what you're near, or tap Use my location again in a minute.";
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      const said = got.none === "denied" ? (last?.text === NO || last?.text === STILL_NO ? STILL_NO : NO) : NO_FIX;
      return last?.quiet && last.text === said ? prev : [...prev, { role: "assistant", text: said, at: new Date().toISOString(), quiet: true }];
    });
  }, [locating]);

  // Files added — dragged in, pasted or chosen — shown above the box until they're sent or taken off. A picture is
  // shrunk on the phone (and an iPhone HEIC photo becomes a JPEG on the way); anything else goes as it is, up to 10 MB.
  const addFiles = useCallback(async (list: File[]) => {
    if (!list.length) return;
    cameraTipDone();
    setFileNote(null);
    setFilesReading((n) => n + list.length);
    const added: Attached[] = [];
    const notes: string[] = [];
    for (const file of list) {
      const name = file.name || (file.type.startsWith("image/") ? "Pasted picture" : "Pasted file");
      try {
        if (file.type.startsWith("image/") && file.type !== "image/svg+xml") {
          const p = await shrinkPhoto(file);
          if (p) { added.push({ name, mimeType: "image/jpeg", data: p.data, thumb: p.thumb, size: p.data.length }); continue; }
        }
        if (file.size > MAX_FILE) { notes.push(`${name} is too large to send (over 10 MB). A smaller file works, or a screenshot of the part that matters.`); continue; }
        const data = await readAsBase64(file);
        if (!data) { notes.push(`${name} couldn't be read on this phone — try another copy of it?`); continue; }
        added.push({ name, mimeType: file.type || "application/octet-stream", data, size: data.length });
      } finally {
        setFilesReading((n) => Math.max(0, n - 1));
      }
    }
    // (against what's already waiting — read now, so the note below is never lost)
    const next = [...filesRef.current];
    for (const f of added) {
      if (next.reduce((t, x) => t + x.size, 0) + f.size > MAX_TOTAL_SENT) { notes.push(`${f.name} didn't fit with the others — send it with its own question.`); continue; }
      next.push(f);
    }
    filesRef.current = next;
    setFiles(next);
    if (notes.length) setFileNote(notes.join(" "));
    inputRef.current?.focus();
  }, [cameraTipDone]);
  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;
  // Pasted: files go to Scout; words stay words, pasted into the box as they are (learned from Maria). Words count only
  // when there are real ones: a picture copied from a web page brings its HTML along, and a file copied in the Finder
  // brings its own name — either way the box would get nothing useful, and the file is what they meant.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items || []);
    const pasted = items.filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter((f): f is File => !!f);
    if (!pasted.length) return;
    const words = (e.clipboardData?.getData("text/plain") || "").trim();
    const justNames = words.split(/\r?\n/).every((w) => !w.trim() || pasted.some((f) => f.name && f.name === w.trim()));
    if (words && !justNames) return;
    e.preventDefault();
    addFiles(pasted);
  };
  // Dragged onto Wander (a Mac, an iPad): anywhere on the screen — Scout opens with it, ready to read
  useEffect(() => {
    let depth = 0;
    // (the whole screen says where it goes while a file is over it — index.css, html.wander-dropping)
    const hint = (on: boolean) => document.documentElement.classList.toggle("wander-dropping", on);
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; depth++; hint(true); };
    const over = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) hint(false); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      hint(false);
      const list = Array.from(e.dataTransfer?.files || []);
      if (!list.length) return;
      setSize("half");
      setOpen(true);
      addFilesRef.current(list);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

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

  // "Scout answered" tapped (sw.ts): Scout opens on the answer — Wander opened by it (?scout=open, which leaves the address
  // at once), or already open (a message from the service worker)
  useEffect(() => {
    const openToRead = () => window.dispatchEvent(new CustomEvent("wander-open-chat", { detail: { read: true } }));
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("scout") === "open") {
        url.searchParams.delete("scout");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        setTimeout(openToRead, 300);
      }
    } catch { /* no address */ }
    const fromWorker = (e: MessageEvent) => { if (e.data?.type === "open-scout") openToRead(); };
    navigator.serviceWorker?.addEventListener("message", fromWorker);
    return () => navigator.serviceWorker?.removeEventListener("message", fromWorker);
  }, []);

  // A question in the link — wander.up.railway.app/?ask=… — from a Siri shortcut ("Hey Siri, Ask Scout", Ken, Oct 5): Scout
  // opens and asks it. The question leaves the address at once, so a reload or Back never asks it twice.
  useEffect(() => {
    let q = "";
    try { q = (new URLSearchParams(window.location.search).get("ask") || "").trim().slice(0, 1000); } catch { /* no address */ }
    if (!q) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("ask");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    // (after Scout's own listener above is in place)
    const t = setTimeout(() => window.dispatchEvent(new CustomEvent("wander:ask-scout", { detail: { question: q } })), 300);
    return () => clearTimeout(t);
  }, []);

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
          style={navTop != null && barHeight > 0 ? { top: navTop - barHeight, bottom: "auto" } : { bottom: "calc(env(safe-area-inset-bottom, 0px) + 57px)" }}
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
  // On an iPad (wide): above the bottom bar, so it never covers the bar's Scout button (it sat 24 pt from the screen's
  // foot, over the bar's right end, held sideways); and above the on-screen keyboard when that's up
  // While typing, the sheet's foot sits at the foot of the visible part of the screen (vp.top + vp.h), whatever the
  // page's height is reported as
  const typingTop = vp?.top ?? null;
  const phoneH = keyboardUp
    // With the keyboard up the half sheet keeps a strip of the page in view (the full one uses it all)
    // (its top always below the clock's strip, where the button to make it smaller can be reached)
    ? (size === "full" ? Math.round(visibleH - safeTop - 8) : Math.round(Math.min(visibleH - safeTop - 8, Math.max(260, visibleH * 0.72))))
    : size === "full" ? Math.round(visibleH * 0.9) : Math.round(visibleH * 0.58);
  const wideKbH = Math.round(Math.min(500, visibleH - 24));
  const sheetStyle: CSSProperties = wide ? (keyboardUp && typingTop !== null
    ? { top: `${typingTop + visibleH - wideKbH - 12}px`, bottom: "auto", height: `${wideKbH}px` }
    : {
      bottom: keyboardUp ? `${(vp?.kb ?? 0) + 12}px` : "calc(env(safe-area-inset-bottom, 0px) + 68px)",
      height: keyboardUp ? `${wideKbH}px` : "min(500px, calc(100dvh - 150px))",
    }) : typingTop !== null
    ? { top: typingTop + visibleH - phoneH, bottom: "auto", height: phoneH }
    // (the keyboard gone but the screen left moved down the page: the sheet's foot at the screen's real foot — Ken's
    // iPhone, Oct 13: it ended at 586 of 874, the day bright below)
    : vp?.shift ? { top: vp.shift + screen.height - phoneH, bottom: "auto", height: phoneH }
    : { bottom: 0, height: phoneH };
  // The dimmed page behind covers the visible part of the screen too while typing (it covered only the page's own
  // height, which left the tab bar bright and floating — Ken's screenshot, Oct 10), and down to the screen's foot when
  // iOS has left the screen moved
  const dimStyle: CSSProperties | undefined = typingTop !== null && vp
    ? { top: Math.min(0, typingTop), bottom: "auto", height: Math.max(vp.page, typingTop + visibleH) - Math.min(0, typingTop) }
    : vp?.shift ? { top: 0, bottom: "auto", height: Math.max(vp.page, vp.shift + screen.height) }
    : undefined;
  // Scout's first word for this person (services/scoutHello.ts): the words, its question to tap, and Later / No thanks —
  // or, once answered, one line saying what happens now
  const helloBlock = hello ? (
    <div data-scout-hello-block className="text-left">
      <p data-scout-hello className="rounded-2xl px-3.5 py-2 bg-[#f0ebe3] text-[#3a3128] text-base leading-relaxed">{hello.words}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
        <button
          onClick={() => sendMessage(hello.ask, true)}
          disabled={sending || !online}
          className="min-h-[44px] px-3 rounded-full border border-[#514636] bg-white text-sm text-[#3a3128] text-left disabled:opacity-50"
        >
          {hello.ask}
        </button>
        {/* (the third offer is the last: no "Later" on it) */}
        {!hello.last && (
          <button onClick={() => answerHello("later")} className="min-h-[44px] px-3 text-sm text-[#6b5d4a] underline underline-offset-2">Later</button>
        )}
        <button onClick={() => answerHello("no")} className="min-h-[44px] px-3 text-sm text-[#6b5d4a] underline underline-offset-2">No thanks</button>
      </div>
    </div>
  ) : helloNote ? (
    // (said as Scout says things — it read as a stray line, run into the introduction, on the empty screen)
    <p data-scout-hello-note className="text-left rounded-2xl px-3.5 py-2 bg-[#f0ebe3] text-[#3a3128] text-base leading-relaxed">{helloNote}</p>
  ) : null;
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

  // The answer that carries "Use my location": the latest one, while nothing's been asked since (the phone's own small
  // replies — "couldn't find where you are" — don't count, so it stays for another try)
  const hereAt = (() => {
    for (let j = messages.length - 1; j >= 0; j--) {
      const m = messages[j];
      if (m.role === "user") return -1;
      if (!m.quiet && !m.error) return m.askHere ? j : -1;
    }
    return -1;
  })();

  return (
    <>
      {sourcesOf &&<ScoutSources sources={sourcesOf} tripId={context.tripId} onClose={() => setSourcesOf(null)} />}
      {/* The page behind: lightly dimmed at half height (still readable), tap it to make Scout small */}
      <div
        className={`fixed inset-0 z-[60] sm:hidden ${size === "full" || keyboardUp ? "bg-black/20" : "bg-black/10"}`}
        style={dimStyle}
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
        <div ref={scrollRef} role="log" aria-live="polite" className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 min-h-0">
          {/* (always a pixel taller than the panel, so the conversation can always scroll and a swipe on it stays in it —
              a short conversation couldn't, and iOS moved the page behind Scout instead; Ken, Oct 11) */}
          <div className="space-y-3 min-h-[calc(100%+1px)]">
          {messages.length === 0 && (
            <div className={`text-center text-[#6b5d4a] text-sm ${helloBlock ? "py-3" : "py-8"}`}>
              <p>I'm Scout, your travel companion.</p>
              {/* A first word for this person comes before the introduction, with its question right under it — the
                  question sat below the fold behind the introduction on an iPhone (Julie's screen, Oct 10) */}
              {helloBlock && <div className="mt-3">{helloBlock}</div>}
              {/* What it actually knows (round 12 delight audit: "I know your whole trip" overclaimed) */}
              {/* Said to whoever holds the phone (round 13: Ken read "Ken's rail sheet", Larisa "Larisa's Guide") */}
              <p className={helloBlock ? "mt-4" : "mt-1"}>I've read {/^larisa$/i.test(user?.displayName || "") ? "your Guide" : "Larisa's Guide"} and {/^ken$/i.test(user?.displayName || "") ? "your rail sheet" : "Ken's rail sheet"}, and I can look things up online. Ask me anything about the trip. I can read a photo or a file too, like a menu, a ticket or a PDF. Paste it in, tap the paperclip, or on a Mac drag it here.</p>
              {/* Why the questions below are greyed (round 12: offline, only a small "no signal" in the header said so) */}
              {!online && <p className="mt-3 text-[#8a5a1a]">No signal right now, so I can't answer yet. Today's plan from {/^larisa$/i.test(user?.displayName || "") ? "your Guide" : "Larisa's Guide"} is still under Next.</p>}
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
                      {msg.files && msg.files.length > 0 && (
                        <span className="flex flex-wrap gap-1.5 mb-1.5">
                          {msg.files.map((f, k) => f.thumb
                            ? <img key={k} src={f.thumb} alt={`Sent with this question: ${f.name}`} className="h-20 w-20 object-cover rounded-lg" />
                            : <span key={k} className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-[13px]">📄 {f.name}</span>)}
                        </span>
                      )}
                      {(() => {
                        // "Use my location" — on the latest answer only, until something else is asked — right under
                        // the paragraph that says to tap it, so it's in view with it however long the rest runs
                        // (verify17: a 76-word answer put it below the panel's edge)
                        const q = msg.askHere && i === hereAt ? messages.slice(0, i).reverse().find((m) => m.role === "user")?.text : undefined;
                        if (!q) return <div className="whitespace-pre-wrap">{renderMarkdown(body)}</div>;
                        const paras = body.split(/\n\s*\n/);
                        const at = Math.max(0, paras.findIndex((p) => /use my location/i.test(p)));
                        const rest = paras.slice(at + 1).join("\n\n");
                        return (
                          <>
                            <div className="whitespace-pre-wrap">{renderMarkdown(paras.slice(0, at + 1).join("\n\n"))}</div>
                            <button data-here-button onClick={() => void shareLocation(q)} disabled={locating || sending || !online}
                              className="mt-2 min-h-[44px] px-3 rounded-lg bg-white border border-[#e0d8cc] text-sm text-[#514636] disabled:opacity-60">
                              {locating ? "Finding where you are…" : "📍 Use my location"}
                            </button>
                            {rest && <div className="mt-2 whitespace-pre-wrap">{renderMarkdown(rest)}</div>}
                          </>
                        );
                      })()}
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
                {/* directions from where they're standing: Apple Maps, and Google Maps beside it (Oct 2) */}
                {msg.routes && msg.routes.length > 0 && (
                  <div className="mt-2 flex flex-col items-start gap-1">
                    {msg.routes.map((w) => (
                      <div key={w.apple}>
                        <div className="flex flex-wrap items-center gap-x-3">
                          <a href={w.apple} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] px-3 rounded-lg bg-white border border-[#e0d8cc] text-sm text-[#514636]">{w.label} ↗</a>
                          <a href={w.google} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Google Maps ↗</a>
                        </div>
                        {/* (nothing of hers gives where it is: the map app only searches — said, never hidden. Not "her Guide has
                            no address": a place found online isn't hers, and Scout may have given the address itself; verify15) */}
                        {w.search && <p className="text-[13px] text-[#8a5a1a] mt-0.5">Maps will search for “{w.search}”. Check it's the right place before you go.</p>}
                      </div>
                    ))}
                  </div>
                )}
                {msg.withHere && <p className="mt-1 text-[13px] opacity-80">📍 with my location</p>}
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
                {/* Where the answer came from — a quiet link; nothing shows unless it's tapped — and Copy, the whole answer
                    as plain words, to paste anywhere */}
                {msg.role === "assistant" && !msg.error && !msg.quiet && (
                  <div className="-mb-1.5 flex flex-wrap gap-x-5">
                    {hasSources(msg.sources) && (
                      <button onClick={() => { sourcesTipDone(); setSourcesOf(msg.sources!); }}
                        className="min-h-[44px] text-[13px] text-[#6b5d4a] underline underline-offset-2">
                        Sources
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(msg.text.replace(/\*\*/g, "").replace(/(^|\s)\*(\S[^*\n]*\S)\*(?=\s|$)/g, "$1$2").trim());
                          setCopied(i);
                          setTimeout(() => setCopied((c) => (c === i ? null : c)), 2500);
                        } catch { /* no clipboard here: the words can still be selected */ }
                      }}
                      aria-label="Copy this answer"
                      className="min-h-[44px] min-w-[44px] text-[13px] text-[#6b5d4a] underline underline-offset-2">
                      {copied === i ? "✓ Copied the answer" : "Copy"}
                    </button>
                    {/* The whole answer read aloud — from this bubble to the next question (an answer can come in two) */}
                    {canRead() && messages[i - 1]?.role !== "assistant" && (
                      <button
                        onClick={() => {
                          if (reading === i) { stopReading(); setReading(null); return; }
                          const rest: string[] = [];
                          for (let j = i; j < messages.length && messages[j].role === "assistant"; j++) if (!messages[j].error && !messages[j].quiet) rest.push(messages[j].text);
                          setReading(i);
                          readAloud(rest.join("\n\n"), () => setReading((r) => (r === i ? null : r)));
                        }}
                        aria-label={reading === i ? "Stop reading this answer" : "Read this answer aloud"}
                        className="min-h-[44px] text-[13px] text-[#6b5d4a] underline underline-offset-2">
                        {reading === i ? "Stop reading" : "Read aloud"}
                      </button>
                    )}
                  </div>
                )}
                {/* (once, under the newest answer that quotes her Guide — it said "where in Larisa's Guide this answer came
                    from" under a note kept and the packing list, which aren't from it; Oct 10 audit) */}
                {sourcesTip && msg.role === "assistant" && citesGuide(msg.sources) && i === messages.map((m) => m.role === "assistant" && citesGuide(m.sources)).lastIndexOf(true) && (
                  <OnceTip onClose={sourcesTipDone} className="mt-2">
                    {/^larisa$/i.test(user?.displayName || "")
                      ? "Tap Sources to see which tab and cells of your Guide this answer came from, and to open those cells in your spreadsheet."
                      : "Tap Sources to see where in Larisa's Guide this answer came from: which tab, and her exact words."}
                  </OnceTip>
                )}
              </div>
            </div>
          ))}
          {/* Scout's first word, when there's already a conversation: after it, the latest thing said */}
          {messages.length > 0 && !sending && helloBlock}
          {sending && (
            <div className="flex justify-start" data-thinking role="status" aria-busy="true">
              <div className="bg-[#f0ebe3] rounded-2xl px-3.5 py-2 text-sm text-[#514636]">
                {/* What Scout is really doing: every question goes with all its sources at once — her Guide, Ken's rail sheet,
                    Backroads' itinerary, anything sent, the web when it looks — so not "Looking in Larisa's Guide" (Ken, Oct 4:
                    asking about a paper-ticket screenshot, it read as checking the wrong source). After a while it says it's
                    still at it — a long answer can take a minute or more (Ken, Oct 2). */}
                {waitedLong
                  ? "Still working — a long answer takes a minute or two"
                  : sentWith === "picture" ? "Reading your picture"
                  : sentWith === "pictures" ? "Reading your pictures"
                  : sentWith === "file" ? "Reading what you sent"
                  : "Going through the trip"}
                <span className="inline-flex gap-0.5 ml-0.5" aria-hidden>
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                </span>
              </div>
            </div>
          )}
          {/* "Buzz me when it's ready" — once per phone, while a slow answer is on its way (lib/buzz.ts) */}
          {buzz !== "none" && (
            <div data-buzz-offer className="rounded-xl border border-[#e0d8cc] bg-white px-3.5 py-2.5 text-sm text-[#514636]">
              {buzz === "offer" || buzz === "asking" ? (
                <>
                  {/* (true before the answer lands and after — it often stays until they choose; verify19) */}
                  <p>Want your phone to buzz when an answer is ready? Then you can put it away while you wait.</p>
                  {/* (a tap here doesn't take focus from the typing box: that read as the keyboard closing, and the
                      conversation jumped to the top of a long answer — "All set" landed out of sight; verify20) */}
                  <div className="mt-1.5 flex gap-2" onMouseDown={(e) => e.preventDefault()}>
                    <button disabled={buzz === "asking"} onClick={async () => { setBuzz("asking"); setBuzz(await turnOnBuzz()); }}
                      className="min-h-[44px] px-4 rounded-lg bg-[#514636] text-white disabled:opacity-60">
                      {buzz === "asking" ? "Turning on…" : "Turn on"}
                    </button>
                    <button disabled={buzz === "asking"} onClick={() => { declineBuzz(); setBuzz("none"); }}
                      className="min-h-[44px] px-3 rounded-lg text-[#6b5d4a]">
                      No thanks
                    </button>
                  </div>
                </>
              ) : (
                <p role="status">
                  {/* (failed: the phone said yes, Wander couldn't finish — keepBuzzCurrent tries again at each opening) */}
                  {buzz === "on" ? "All set. Your phone will buzz when an answer is ready, even when it's locked."
                    : buzz === "off" ? "OK, no buzz. To change that later: the iPhone's Settings, then Notifications, then Wander."
                    : "Wander couldn't finish turning that on. It will try again the next time you open Wander."}
                </p>
              )}
            </div>
          )}
          {/* Start fresh — at the end of the conversation, out of the crowded header; it asks first */}
          {messages.length > 0 && !sending && (
            confirmingClear ? (
              <div className="flex flex-wrap items-center gap-x-2 pt-1">
                <span className="text-sm text-[#6b5d4a]">Clear this conversation on all your devices?</span>
                <button
                  onClick={() => {
                    setMessages([]); clearMessages(); setConfirmingClear(false); setFailed(false);
                    // …on every device: a marker on Wander, so the others start fresh too (what was said stays saved)
                    const token = localStorage.getItem("wander_token");
                    if (context?.tripId) fetch("/api/chat/fresh", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ tripId: context.tripId }) }).catch(() => { /* this phone is fresh anyway */ });
                  }}
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
        </div>

        {/* Input */}
        <form onSubmit={handleFormSubmit} className="px-3 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] border-t border-[#e5ddd0]">
          {listening && voiceQuiet && (
            <p role="status" className="text-[13px] text-[#6b5d4a] mb-2">
              I'm not hearing any words yet. Tap the red mic to stop, then try again — or type.
            </p>
          )}
          {/* (once, for someone already talking with Scout — a first-timer reads it in Scout's hello above) */}
          {cameraTip && online && messages.length > 0 && !files.length && !filesReading && (
            // (touch-none: a swipe on this notice moved the page behind Scout; its ✕ still taps — verify13)
            <OnceTip onClose={cameraTipDone} className="mb-2 touch-none">
              Tap the paperclip to send Scout a photo or a file, like a menu, a ticket or a PDF. You can paste one into the box too, or on a Mac drag it in. Scout will read it.
            </OnceTip>
          )}
          {/* what goes with the next question (or why something couldn't be added) */}
          {(files.length > 0 || filesReading > 0 || fileNote) && (
            <div className="mb-2" role="status">
              {files.length > 0 && (
                <ul className="flex flex-wrap gap-2 mb-1" aria-label="Going with your question">
                  {files.map((f, k) => (
                    <li key={`${f.name}-${k}`} className="flex items-center gap-1.5 rounded-lg border border-[#e0d8cc] bg-white pl-1.5 max-w-full">
                      {f.thumb
                        ? <img src={f.thumb} alt="" className="h-9 w-9 object-cover rounded" />
                        : <span aria-hidden className="text-lg leading-none px-0.5">📄</span>}
                      <span className="text-[13px] text-[#3a3128] truncate max-w-[11rem]">{f.name}</span>
                      <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== k))}
                        className="min-h-[44px] min-w-[40px] text-sm text-[#514636]" aria-label={`Take ${f.name} off`}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[13px] text-[#6b5d4a]">
                {filesReading > 0 ? "Getting it ready…"
                  : fileNote ? fileNote
                  : files.every((f) => f.mimeType.startsWith("image/")) ? "Ask about it, or just send to have it read and translated."
                  : "Ask about it, or just send it. Scout will read it and say what matters for the trip."}
              </p>
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
              placeholder={!online ? "No signal right now" : sending ? "Your next question…" : files.length ? "Ask about it…" : "Ask about the trip…"}
              aria-label="Ask Scout about the trip"
              rows={1}
              className="flex-1 min-h-[44px] bg-[#f0ebe3] rounded-xl px-3.5 py-2.5 text-[16px] text-[#3a3128] placeholder:text-[#6b5d4a] outline-none focus:ring-2 focus:ring-[#514636]/20 disabled:opacity-50 resize-none"
            />
            {/* a photo or a file for Scout: the phone offers the camera, its photos and its files */}
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={!online || filesReading > 0}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#f0ebe3] text-[#6b5d4a] hover:bg-[#e0d8cc] transition-colors disabled:opacity-30"
              aria-label="Add a photo or a file"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input ref={photoInputRef} type="file" multiple className="hidden" aria-hidden tabIndex={-1}
              accept="image/*,application/pdf,.pdf,text/plain,.txt,.md,.csv,.json,.eml,.html,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />
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
              disabled={sending || (!input.trim() && !files.length) || !online || filesReading > 0}
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
