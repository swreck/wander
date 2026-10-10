/**
 * Sending one piece of the trip to someone outside the four — the Shigaraki day to Kimiko, a booking to a hotel
 * concierge, the Mashiko timing to Kenji (round 16: the sheet could share a block; Wander could only invite someone
 * into the whole trip). The phone's share sheet (Messages, Mail, WhatsApp), or a copy where there's none. Her words,
 * as she wrote them; the person sending decides who gets it.
 */
import { useState } from "react";
import { sendCopy } from "../lib/tripNotes";
import { clock, tabsDiffer, type voiceFor } from "../lib/guideDisplay";
import type { GuideItem } from "../lib/guideData";

const longDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

/** A day as text: her plan in her order, with its times as she wrote them and whose each line is; the bookings that
 *  day; where they sleep. No confirmation numbers — a day goes to friends, not front desks. */
export function dayText({ date, city, overview, plan, others, sleep, owner, trains = [] }: {
  date: string; city: string; overview: GuideItem[]; plan: GuideItem[]; others: GuideItem[]; sleep: string[]; owner: string;
  /** the day's booked trains from the rail sheet ("HH:MM" and its words) — in time order with the rest (Sweep C: Oct 11's
   *  message was only "Sleeping at: Nagoya Marriott"; the 10:36 NOZOMI 22 was left out) */
  trains?: { time: string; text: string }[];
}): string {
  const line = (i: GuideItem) => {
    const t = i.timeText || (i.time ? clock(i.time) : "");
    const who = i.forWhom && !/^everyone$/i.test(i.forWhom) ? ` (${i.forWhom})` : "";
    // (a time her own tabs dispute never goes out as fact — round 16: "8:00 PM Cafe Ensou" vs her 1:00 lunch)
    const doubt = tabsDiffer(i).length ? " — her tabs differ on this; check before relying on it" : "";
    return `${t ? `${t}  ` : ""}${i.title}${who}${doubt}`;
  };
  const out = [`${longDay(date)} — ${city}`];
  if (overview.length) out.push("", ...overview.map((o) => o.title));
  const timed = [...plan, ...others.filter((o) => o.time && ["meal", "tour", "flight", "train", "checkin", "meeting"].includes(o.kind))];
  // (her lines in her order; each train at its time among them — a line with no time keeps its place after the one before)
  let carry = "";
  const keyed = [
    ...timed.map((i) => ({ key: (carry = i.time || carry), text: line(i) })),
    ...trains.map((t) => ({ key: t.time.padStart(5, "0"), text: `${clock(t.time.padStart(5, "0"))}  ${t.text}` })),
  ];
  const ordered = !trains.length ? keyed : keyed.map((k, n) => ({ ...k, n })).sort((a, b) => a.key.localeCompare(b.key) || a.n - b.n);
  if (ordered.length) out.push("", ...ordered.map((k) => k.text));
  if (sleep.length) out.push("", `Sleeping at: ${sleep.join(" / ")}`);
  out.push("", `— from ${owner}'s plan for the trip`);
  return out.join("\n");
}

/** A booking as text, for a concierge or a friend: what, when, where, and its confirmation */
export function bookingText(i: GuideItem, date: string): string {
  const address = (i.detail || "").match(/^Address: (.+)$/m)?.[1];
  return [
    i.title,
    `${longDay(date)}${i.time ? `, ${clock(i.time)}` : ""}`,
    address || i.place || "",
    i.forWhom && !/^everyone$/i.test(i.forWhom) ? `For ${i.forWhom}` : "",
    i.confirmation ? `Confirmation: ${i.confirmation}` : "",
  ].filter(Boolean).join("\n");
}

/** "Send this day ›" / "Send ›": the share sheet, or "Copied — paste it into a message." */
export default function SendOut({ label, title, text, className = "" }: { label: string; title: string; text: () => string; className?: string; v?: ReturnType<typeof voiceFor> }) {
  const [said, setSaid] = useState<string | null>(null);
  return (
    <span className={className}>
      <button onClick={async () => {
        const r = await sendCopy(text(), title);
        setSaid(r === "copied" ? "Copied — paste it into a message." : r === "failed" ? "This phone wouldn't share or copy it — try again?" : null);
      }} className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">{label}</button>
      {said && <span role="status" className="block text-xs text-[#6b5d4a]">{said}</span>}
    </span>
  );
}
