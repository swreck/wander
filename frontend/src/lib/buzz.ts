/**
 * "Scout answered" on the lock screen, with the phone's buzz (Ken, Oct 12 2026: ChatGPT "vibrates the phone when an answer
 * is complete" — "hold the phone in my hand and glance at it occasionally… or even to turn off the phone and then glance
 * at the lock screen"). An iPhone web app can't vibrate; a notification does, even on silent. Apple lets a phone allow it
 * only from a tap, once — so Wander asks once, the first time an answer takes a while, and after that it just happens.
 * The server sends it (services/push.ts) for any answer that took 8 seconds or more.
 */
import { api } from "./api";

const NO_KEY = "wander:buzz-declined";
const supported = () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;

/** Worth offering on this phone: it can, and hasn't decided (an iPhone only from the Home Screen icon) */
export function canOfferBuzz(): boolean {
  if (!supported() || Notification.permission !== "default") return false;
  try { if (localStorage.getItem(NO_KEY)) return false; } catch { /* unreadable: offer */ }
  return true;
}
/** The evening nudge's own offer on Home (Oct 17): its "No thanks" is its own — a "Not now" to Scout's buzz isn't a no
 *  to this */
const NUDGE_NO_KEY = "wander:nudge-declined";
const NUDGE_LATER_KEY = "wander:nudge-later";

/** Once a day, to the server's log: whether this phone can get the 9 PM question, and if not, why — opened from the Home
 *  Screen icon or not, what the iPhone says, a "No" or "Ask me again tomorrow" kept here (Ken, Oct 23: Andy "forgot about
 *  wander completely… I question if he's getting the daily prompt"). Yes/no words only. */
export function reportNudgeState() {
  try {
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    if (localStorage.getItem("wander:nudge-reported") === day) return;
    localStorage.setItem("wander:nudge-reported", day);
    const homeScreen = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    void import("./phoneReport").then(({ phoneReport }) => phoneReport("nudge", {
      can: supported(), homeScreen: !!homeScreen,
      permission: "Notification" in window ? Notification.permission : "none",
      saidNo: !!localStorage.getItem(NUDGE_NO_KEY), askLater: !!localStorage.getItem(NUDGE_LATER_KEY),
    }));
  } catch { /* nothing to tell */ }
}
/** today: the trip's date now ("2026-10-17") — "Ask me again tomorrow" holds it back until the date has moved on */
export function canOfferNudge(today: string): boolean {
  if (!supported() || Notification.permission !== "default") return false;
  try {
    if (localStorage.getItem(NUDGE_NO_KEY)) return false;
    const later = localStorage.getItem(NUDGE_LATER_KEY);
    if (later && later >= today) return false;
  } catch { /* unreadable: offer */ }
  return true;
}
export function declineNudge() {
  try { localStorage.setItem(NUDGE_NO_KEY, new Date().toISOString()); } catch { /* private: the offer may come again */ }
}
export function nudgeTomorrow(today: string) {
  try { localStorage.setItem(NUDGE_LATER_KEY, today); } catch { /* private: the offer may come again */ }
}
export function declineBuzz() {
  try { localStorage.setItem(NO_KEY, new Date().toISOString()); } catch { /* private: the offer may come again */ }
}

const b64ToBytes = (s: string) => {
  const raw = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** This phone's push address, made if needed and given to Wander (under whoever is signed in) */
async function subscribe(): Promise<boolean> {
  const { key } = await api.get<{ key: string | null }>("/push/key");
  if (!key) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await api.post("/push/subscribe", { subscription: sub.toJSON() });
  return true;
}

/** "Turn on" tapped: the iPhone's box, then this phone's address. "on" | "off" (said no) | "failed" */
export async function turnOnBuzz(): Promise<"on" | "off" | "failed"> {
  if (!supported()) return "failed";
  try {
    const answer = await Notification.requestPermission();
    if (answer !== "granted") { declineBuzz(); return "off"; }
    return (await subscribe()) ? "on" : "failed";
  } catch { return "failed"; }
}

/** Each time Wander opens, signed in: a phone that already allowed it keeps its address current (a new sign-in, a
 *  renewed address). Quiet, never asks. */
export function keepBuzzCurrent() {
  if (!supported() || Notification.permission !== "granted") return;
  void subscribe().catch(() => { /* next time */ });
}
