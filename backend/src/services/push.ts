/**
 * "Scout answered" on the lock screen (Ken, Oct 12 2026: "A nice convenience of ChatGPT is that it vibrates the phone when
 * an answer is complete" — "please think about the user experience… hold the phone in my hand and glance at it
 * occasionally… or even to turn off the phone and then glance at the lock screen"). An iPhone web app can't vibrate on its
 * own; a notification can, and shows on the lock screen. Each phone allows it once; after that every answer that took a
 * while sends one. Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (Railway). Nothing is sent when they aren't set.
 */
import webpush from "web-push";
import prisma from "./db.js";

let ready: boolean | null = null;
export function pushKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PUBLIC_KEY : null;
}
function setUp(): boolean {
  if (ready !== null) return ready;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  // (the site, not a person's address, says who sends — never Ken's email to Apple or Google)
  ready = !!(pub && priv);
  if (ready) webpush.setVapidDetails("https://wander.up.railway.app", pub!, priv!);
  return ready;
}

/** A phone's push address as the browser gives it — only that shape is kept */
export function parseSubscription(x: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  const o = (x && typeof x === "object" ? x : {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof o.endpoint === "string" && /^https:\/\/[^\s]{8,1000}$/.test(o.endpoint) ? o.endpoint : null;
  const p256dh = typeof o.keys?.p256dh === "string" && /^[\w-]{20,200}$/.test(o.keys.p256dh) ? o.keys.p256dh : null;
  const auth = typeof o.keys?.auth === "string" && /^[\w-]{8,100}$/.test(o.keys.auth) ? o.keys.auth : null;
  return endpoint && p256dh && auth ? { endpoint, p256dh, auth } : null;
}

/** The answer's first words for the lock screen: no ** marks, no web addresses, one line */
export function answerPreview(text: string): string {
  const line = text.replace(/\*\*/g, "").replace(/https?:\/\/\S+/g, "a link").split("\n").map((l) => l.trim()).find(Boolean) || "Your answer is ready.";
  // (anyone holding the phone can read the lock screen: a line with a booking code or a long number — a confirmation, a
  // seat, a card — says only that the answer is ready; verify19)
  // (a year — "Oct 14, 2026" — isn't one. A line about a booking, a seat, a passport or a card is hidden whatever its
  // shape: United's codes are often six letters, "12A and 12B" are seats; verify20)
  if (/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{5,}\b|\b(?!(?:19|20)\d{2}\b)\d{4,}|\b\d{1,2}[A-K]\b/.test(line)
    || /\b(?:confirmation|booking|reservation|record locator|seats?|passport|card|codes?|PIN|ticket numbers?|room number)\b/i.test(line)) return "Your answer is ready. Tap to read it.";
  return line.length > 140 ? `${line.slice(0, 137).replace(/\s+\S*$/, "")}…` : line;
}

/** Tell each of their phones that allowed it: Scout answered. Never throws; a phone that's gone is forgotten. */
export async function sendAnswerReady(travelerId: string, answer: string): Promise<number> {
  if (!setUp()) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { travelerId } }).catch(() => []);
  const payload = JSON.stringify({ title: "Scout answered", body: answerPreview(answer), tag: "scout-answer", url: "/?scout=open" });
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600, timeout: 10_000, urgency: "high" });
      sent++;
    } catch (e: any) {
      // (404/410: the phone took it back or Wander was removed — forget it; anything else: try again next answer)
      if (e?.statusCode === 404 || e?.statusCode === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      else console.warn(`[push] not sent: ${e?.statusCode ?? e?.message ?? "unknown"}`);
    }
  }));
  return sent;
}
