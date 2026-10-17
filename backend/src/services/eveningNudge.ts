/**
 * Scout's evening question on the lock screen (Oct 17 2026). Ken, on Home's "Anything worth remembering from today?":
 * "It's not even reaching me!" — it showed only to someone who opened Wander after 6 PM, and in a week only his one note
 * of Oct 10 answered it; Larisa, Julie and Andy had written none. He chose "one gentle push notification around 9 PM…
 * opening Notes for that day" for everyone: "Yes, build the request for others".
 *
 * At 9 PM in the trip's time zone (10 PM when their plan has a line from 7:30 PM on), once a night, to each person's
 * phones that allowed Wander's notifications: "Anything worth remembering from today?", opening Notes for that day. Not
 * on the trip's last day or a day they fly, not to someone who has already written about the evening (a note about today
 * kept after 6 PM, or one from the evening question). The database is only asked in the evening's window.
 */
import prisma from "./db.js";
import { sendToPhones } from "./push.js";

const sent = new Map<string, number>();   // `${travelerId}:${date}` → when (a restart in the window may send once more; the
                                          // notice's tag shows it once on the phone)
let trips: { id: string; zone: string; first: string; last: string }[] = [];
let tripsAt = 0;

/** Minutes past midnight, and the date, in a time zone */
function clockIn(zone: string, at = new Date()): { date: string; min: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

const named = (forWhom: string | null, name: string) => !forWhom || /^everyone$/i.test(forWhom) || forWhom.toLowerCase().split(/[^a-z]+/).includes(name.toLowerCase());

/** Who is due tonight, and send to them. Exported for the checks. */
export async function nudgeNow(at = new Date()): Promise<{ to: string; date: string }[]> {
  if (Date.now() - tripsAt > 6 * 3600_000 || !trips.length) {
    const rows = await prisma.trip.findMany({ where: { guideSnapshots: { some: { status: "current" } } }, select: { id: true, timeZone: true, startDate: true, endDate: true } });
    trips = rows.filter((t) => t.startDate && t.endDate).map((t) => ({ id: t.id, zone: t.timeZone || "Asia/Tokyo", first: t.startDate!.toISOString().slice(0, 10), last: t.endDate!.toISOString().slice(0, 10) }));
    tripsAt = Date.now();
  }
  const out: { to: string; date: string }[] = [];
  for (const t of trips) {
    const { date, min } = clockIn(t.zone, at);
    // (the window: 9 PM to 11 PM — nothing is asked of the database outside it)
    if (date < t.first || date >= t.last || min < 21 * 60 || min >= 23 * 60) continue;
    const members = await prisma.tripMember.findMany({ where: { tripId: t.id }, include: { traveler: { select: { id: true, displayName: true, pushSubscriptions: { select: { id: true } } } } } });
    const lines = await prisma.guideItem.findMany({ where: { tripId: t.id, date: new Date(`${date}T00:00:00Z`) }, select: { kind: true, time: true, forWhom: true, title: true } });
    for (const m of members) {
      const who = m.traveler;
      const key = `${who.id}:${date}`;
      if (!who.pushSubscriptions.length || sent.has(key)) continue;
      const first = who.displayName.split(/\s+/)[0];
      const mine = lines.filter((l) => named(l.forWhom, first));
      // (not a day they fly — a take-off or a landing that's theirs)
      if (mine.some((l) => l.kind === "flight")) continue;
      // (10 PM when their evening runs late: a line of theirs from 7:30 PM on)
      const late = mine.some((l) => ["block", "meal", "tour"].includes(l.kind) && l.time && Number(l.time.slice(0, 2)) * 60 + Number(l.time.slice(3, 5)) >= 19 * 60 + 30);
      if (min < (late ? 22 : 21) * 60) continue;
      // (not when they've already written about the evening)
      const evening = await prisma.tripNote.findFirst({ where: { tripId: t.id, travelerId: who.id, dayDate: date, OR: [{ source: "evening" }, { createdAt: { gte: new Date(`${date}T18:00:00${offsetOf(t.zone, at)}`) } }] }, select: { id: true } });
      sent.set(key, Date.now());
      if (evening) continue;
      const n = await sendToPhones(who.id, { title: "Scout asks", body: "Anything worth remembering from today? A line or a page, kept word for word.", tag: `evening-${date}`, url: `/notes?from=evening&day=${date}` });
      if (n) out.push({ to: who.displayName, date });
      console.log(`[evening-nudge] ${who.displayName} ${date}: ${n ? `sent to ${n} phone(s)` : "no phone took it"}`);
    }
  }
  for (const [k, v] of sent) if (Date.now() - v > 2 * 86400_000) sent.delete(k);
  return out;
}

/** "+09:00" for Asia/Tokyo at that moment */
function offsetOf(zone: string, at: Date): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(at).find((x) => x.type === "timeZoneName")?.value || "GMT+09:00";
  const m = name.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return m ? `${m[1]}:${m[2] || "00"}` : "+09:00";
}

export function startEveningNudge(): void {
  // (WARMERS=off: a local test server — it never sends to real phones)
  if (process.env.VITEST_WORKER_ID || process.env.WARMERS === "off") return;
  const tick = () => { nudgeNow().catch((e) => console.warn("[evening-nudge]", e?.message || e)); };
  setInterval(tick, 5 * 60_000);
  setTimeout(tick, 60_000);
}
