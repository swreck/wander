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
