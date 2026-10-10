/**
 * LeavingSoonCard — before a later traveler leaves home, the first time Home opens each day: "You leave in N days",
 * their flight as her Guide has it, and one fact about Japan, Tokyo or Kyoto (Ken, Oct 2 2026: Julie and Andy fly
 * Oct 13, a week after Ken and Larisa). Someone with the previewLeavingCard setting (Ken) sees the same card for them,
 * headed "If Julie and Andy open Wander today…", counted on their own date at home.
 *
 * The day is the one Home counts to (lib/leavingSoon.ts). Once a day per person on this phone; never once their plane
 * has left; a tap anywhere outside, Escape, or the button puts it away.
 */
import { useEffect, useRef, useState } from "react";
import { takeVisitAsk, leavingCardSettled } from "../lib/visitAsks";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { guideData, type GuideItem } from "../lib/guideData";
import { ymd, clock, partyOf, zonedMoment, zoneWords } from "../lib/guideDisplay";
import { ownFirstDay, firstLeg, laterParties, dateIn, phoneToday, daysBetween, namesOf, factFor, type LeavingFact } from "../lib/leavingSoon";

const seenKey = (me: string, date: string) => `wander:leaving-card:${me}:${date}`;
// (when the phone won't keep it — private browsing — at least not twice in one visit)
const seenThisVisit = new Set<string>();

interface Shown { preview: string | null; daysLeft: number; day: string; leg: GuideItem | null; fact: LeavingFact; key: string }

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

/** Their plane has left, by her Guide's time — the card would only be in the way */
function tookOff(leg: GuideItem | null, day: string, now: Date) {
  if (!leg?.time || !leg.timeZone) return false;
  const [h, m] = leg.time.split(":").map(Number);
  return now.getTime() >= zonedMoment(day, h * 60 + m, leg.timeZone).getTime();
}

export default function LeavingSoonCard({ tripId, hold = false }: { tripId: string; hold?: boolean }) {
  const { user } = useAuth();
  const me = user?.displayName || null;
  const travelerId = user?.travelerId || null;
  const [shown, setShown] = useState<Shown | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // (one ask per visit — lib/visitAsks: the tour offer waits for this card's decision)
    if (!me || hold) { leavingCardSettled(); return; }
    let alive = true;
    (async () => {
      let data: Awaited<ReturnType<typeof guideData>> | null = null;
      try { data = await guideData(tripId); } catch { return; }
      if (!alive || !data?.trip?.startDate) return;
      const now = new Date();
      const first = ymd(data.trip.startDate);
      const make = (today: string, day: string, leg: GuideItem | null, preview: string | null): Shown | null => {
        const daysLeft = daysBetween(today, day);
        const fact = factFor(daysLeft);
        return daysLeft >= 0 && fact ? { preview, daysLeft, day, leg, fact, key: seenKey(me, today) } : null;
      };
      let next: Shown | null = null;
      const party = partyOf(data.items, me);
      const mine = ownFirstDay(data.items, party, first);
      if (party && mine > first) {
        // Yours: you leave home after the trip has begun — counted on this phone's date, as Home counts
        const leg = firstLeg(data.items, party, mine);
        if (!tookOff(leg, mine, now)) next = make(phoneToday(now), mine, leg, null);
      } else if (travelerId) {
        // Theirs, for someone who asked to see it (Ken) — on their date at home, wherever this phone is
        let prefs: Record<string, unknown> | null = null;
        try { prefs = (await api.get<{ preferences?: Record<string, unknown> | null }>(`/auth/travelers/${travelerId}`))?.preferences || null; } catch { /* no signal: no preview */ }
        const later = prefs?.previewLeavingCard ? laterParties(data.items, first)[0] : undefined;
        if (later && !tookOff(later.leg, later.day, now)) {
          const theirToday = later.leg?.timeZone ? dateIn(later.leg.timeZone, now) : phoneToday(now);
          next = make(theirToday, later.day, later.leg, namesOf(later.party));
        }
      }
      if (!next || !alive) return;
      try { if (localStorage.getItem(next.key)) return; } catch { /* unreadable: the visit's own memory below */ }
      if (seenThisVisit.has(next.key)) return;
      // (another ask already has this visit — the card waits for the next one, not marked as seen)
      if (!takeVisitAsk("leaving")) return;
      seenThisVisit.add(next.key);
      try { localStorage.setItem(next.key, new Date().toISOString()); } catch { /* full or private */ }
      setShown(next);
    })().finally(() => leavingCardSettled());
    return () => { alive = false; };
  }, [tripId, me, travelerId, hold]);

  useEffect(() => {
    if (!shown) return;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShown(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown]);

  if (!shown) return null;
  const { preview, daysLeft, day, leg, fact } = shown;
  const when = daysLeft === 0 ? "You leave today" : daysLeft === 1 ? "You leave tomorrow" : `You leave in ${daysLeft} days`;
  const time = leg?.time ? `${clock(leg.time)}${leg.timeZone ? ` ${zoneWords(leg.timeZone)}` : ""}` : "";
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center px-4" role="dialog" aria-modal="true"
      aria-label={preview ? `What ${preview} will see today` : when}>
      <div aria-hidden className="absolute inset-0" style={{ background: "rgba(36, 29, 22, 0.7)" }} onClick={() => setShown(null)} />
      <div className="relative w-full max-w-sm">
        {/* (focus on the card itself, not its button: a phone showed the button ringed in orange) */}
        <section ref={cardRef} tabIndex={-1} className="rounded-2xl overflow-hidden bg-white shadow-xl outline-none">
          {/* (inside the card: floating above it, the words sat over "Japan 2026" on the page behind) */}
          {preview && (
            <p className="px-5 py-2.5 bg-[#514636] text-white text-sm leading-snug">If {preview} open Wander today, this is what they'll see:</p>
          )}
          <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-[#F2ECDE] via-[#F2E0DE] to-[#DEE6F2]">
            <p className="text-[26px] leading-tight font-light tracking-wide text-[#3a3128]">{when}</p>
            <p className="text-sm text-[#514636] mt-1.5">{dayLabel(day)}{time ? ` · ${time}` : ""}</p>
            {leg && <p className="text-sm text-[#514636]">{leg.title}</p>}
            {daysLeft === 0 && <p className="text-sm text-[#514636] mt-1">Safe travels.</p>}
          </div>
          <div className="px-5 pt-4 pb-5">
            <p className="text-xs uppercase tracking-wide text-[#6b5d4a]">{fact.about === "Japan" ? "About Japan" : `About ${fact.about}`}</p>
            <p className="text-[15px] leading-relaxed text-[#3a3128] mt-1.5">{fact.text}</p>
            <button onClick={() => setShown(null)}
              className="mt-4 w-full min-h-[44px] rounded-lg bg-[#514636] text-white text-sm">
              {preview ? "Got it" : "Thanks"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
