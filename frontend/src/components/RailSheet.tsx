/**
 * Ken's rail sheet on the screens (Sep 30 2026): a day's trains, the ticket-pickup card on its day, and the next
 * train on Now. Its words stay its own — a "PENDING — …" readiness line is shown as the sheet wrote it, never turned
 * into "booked" or "done" — and every card says where it came from. Where it and Larisa's Guide disagree, both show.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { colOf, twelveHour, sourceWords, isBookedTrain, withTwelveHour, readWords, dateInText, differWords, type OtherSource, type RailRow, type Checklist, type RailDiffer } from "../lib/sources";
import GuideText from "./GuideText";

/**
 * A leg's status as the sheet wrote it. When it names a day already past ("collect at Shin-Osaka Oct 6", seen on
 * Oct 14) it's still its words, but Wander says it can't tell what happened since (rail round: Andy read an old PENDING
 * as "the tickets were never collected"). The same wording everywhere a status shows — the day's list and Now's card.
 */
function StatusWords({ readiness, s, today, className, pickupBy }: { readiness: string; s: OtherSource; today: string; className: string; pickupBy?: string | null }) {
  const day = dateInText(readiness, Number(today.slice(0, 4)));
  const stale = !!day && day < today;
  // After its day, whose job it was comes first, then the sheet's old words — so an old "PENDING" reads as a pickup
  // someone else was doing, not as "nobody knows if your ticket exists" (round 12: Andy, 20 minutes before the HARUKA)
  const pickup = s.checklists.find((c) => c.date && c.date === day);
  const who = pickup ? (pickupBy ? `${pickupBy}'s` : "your") : null;
  return (
    <p className={`${className} [overflow-wrap:anywhere]`}>
      {stale
        ? <>{who ? `Collecting these tickets was part of ${who} ${checklistTitle(pickup!.tab).replace(/^Ticket pickup — /, "")} ticket pickup on ${shortWhen(day!)}. ` : ""}The rail sheet {s.readAt ? `still said, when Wander read it ${readWords(s.readAt)}` : "says"}: “{withTwelveHour(readiness)}” — Wander can't see whether that's been done since.</>
        : withTwelveHour(readiness)}
    </p>
  );
}
const shortWhen = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** "Tix pick up — Shin-Osaka" → "Ticket pickup — Shin-Osaka" (its tab name stays in the source line) */
export const checklistTitle = (tab: string) => tab.replace(/^tix\s*pick\s*-?\s*up/i, "Ticket pickup");

function Leg({ r, s, today, pickupBy }: { r: RailRow; s: OtherSource; today: string; pickupBy?: string | null }) {
  const [open, setOpen] = useState(false);
  const train = colOf(r.cols, /^train$/);
  const depart = colOf(r.cols, /^depart/);
  const arrive = colOf(r.cols, /^arrive/);
  const route = colOf(r.cols, /^route$/);
  const mode = colOf(r.cols, /^mode$/);
  const cls = colOf(r.cols, /^class$/);
  const seat = colOf(r.cols, /^car/);
  const resv = colOf(r.cols, /^reservation/);
  const ticket = colOf(r.cols, /^ticket/);
  const readiness = colOf(r.cols, /^boarding readiness/, /readiness/);
  const target = colOf(r.cols, /^target/);
  const status = colOf(r.cols, /^status$/);
  const notes = colOf(r.cols, /^notes$/);
  const pax = colOf(r.cols, /^pax$/);
  // Whose it is, when its notes open by saying so ("Ken + Larisa only. Booked Sep 29…") — its words, shown up top
  const onlyFor = notes.match(/^\s*([A-Z][a-z]+(?:\s*(?:\+|&|and)\s*[A-Z][a-z]+)*\s+only)\b/)?.[1] || "";
  const booked = isBookedTrain(r);
  // Its status names a day that has passed ("collect at Shin-Osaka Oct 6", seen on Oct 14): still its words, but
  // Wander says it can't tell what happened since (round r1: Andy read it as "the tickets were never collected")
  const statusDay = readiness ? dateInText(readiness, Number(today.slice(0, 4))) : null;
  const stale = !!statusDay && statusDay < today;
  return (
    <li className="py-2.5">
      <div className="flex gap-3">
        <div className="w-16 shrink-0 text-right">
          {booked ? (
            <>
              <div className="text-sm font-medium text-[#3a3128]">{twelveHour(depart)}</div>
              {arrive && <div className="text-xs text-[#6b5d4a]">arrive {twelveHour(arrive)}</div>}
            </>
          ) : <div className="text-xs text-[#6b5d4a]">{target && target !== "—" ? target : ""}</div>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] leading-snug text-[#3a3128]">{booked ? `${train} · ${route}` : `${route}${mode ? ` · ${mode}` : ""}`}</p>
          {onlyFor && <p className="text-xs text-[#514636] mt-0.5">“{onlyFor}”, the sheet says</p>}
          {(booked || /^\d+$/.test(pax)) && <p className="text-sm text-[#514636] mt-0.5 [overflow-wrap:anywhere]">{[booked ? cls : "", booked ? seat : "", /^\d+$/.test(pax) ? `${pax} ${pax === "1" ? "person" : "people"}` : ""].filter((x) => x && x !== "—").join(" · ")}</p>}
          {resv && resv !== "—" && <p className="text-sm text-[#514636]">Reservation #{resv}</p>}
          {!booked && !resv && <p className="text-sm text-[#6b5d4a]">No booking for this leg in the rail sheet.</p>}
          {/* A "?" leg: the question is the point — its notes say what's open, shown right here (round 12: Oct 23's
              "who has the train tickets?" was behind a tap) */}
          {status === "?" && <p className="text-sm text-[#8a5a1a] mt-0.5">The rail sheet marks this leg “?”{notes ? `: ${withTwelveHour(notes)}` : "."}</p>}
          {readiness && <StatusWords readiness={readiness} s={s} today={today} pickupBy={pickupBy} className={`text-sm mt-1 ${stale ? "text-[#6b5d4a]" : "text-[#8a5a1a]"}`} />}
          {ticket && <p className="text-sm text-[#6b5d4a] mt-1 [overflow-wrap:anywhere]">{withTwelveHour(ticket)}</p>}
          {notes && status !== "?" && (open
            ? <><GuideText text={withTwelveHour(notes)} className="text-sm text-[#6b5d4a] mt-1 [overflow-wrap:anywhere]" />
                <button onClick={() => setOpen(false)} className="min-h-[44px] text-sm text-[#514636]">Hide the sheet's notes ‹</button></>
            : notes.length <= 90
              ? <p className="text-sm text-[#6b5d4a] mt-1">{withTwelveHour(notes)}</p>
              : <button onClick={() => setOpen(true)} className="min-h-[44px] text-sm text-[#514636]">The sheet's notes ›</button>)}
          <p className="text-xs text-[#6b5d4a] mt-1">From {sourceWords(s)} — {r.tab} tab, row {r.row}</p>
        </div>
      </div>
    </li>
  );
}

/** A day's legs from the rail sheet, with any disagreement with Larisa's Guide said on top */
/** Where the rail sheet and Larisa's Guide disagree — both said, never settled */
export function DifferNote({ d, className = "" }: { d: RailDiffer; className?: string }) {
  return (
    <p className={`text-sm text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1 ${className}`}>
      The sources differ — {differWords(d)}. Worth checking which is right.
    </p>
  );
}

export function TrainsForDay({ sources, date, today, pickupBy, differsShownAbove = false }: {
  sources: OtherSource[]; date: string; today: string;
  /** today's screen already says it at the top — not again here (round 12: four times on Oct 29's Now) */
  differsShownAbove?: boolean;
  /** whose job the pickup is ("Ken & Larisa"), said to everyone else */
  pickupBy: (s: OtherSource) => string | null;
}) {
  const found = sources.map((s) => ({ s, legs: s.rail.filter((r) => r.date === date), differs: s.differs.filter((d) => d.date === date) })).filter((x) => x.legs.length);
  if (!found.length) return null;
  return (
    <section id="trains" className="mt-6 scroll-mt-24">
      <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a]">Trains</h2>
      {found.map(({ s, legs, differs }) => (
        <div key={s.id}>
          <p className="text-[13px] text-[#6b5d4a] mt-0.5">
            From {sourceWords(s)} — not Larisa's Guide.{s.readAt ? ` Wander last read it ${readWords(s.readAt)}.` : ""}{s.lastError ? " Its latest read didn't work, so this may be out of date." : ""}
          </p>
          {!differsShownAbove && differs.map((d) => <DifferNote key={`${d.row}-${d.guideSource}`} d={d} className="mt-2" />)}
          <ol className="mt-2 bg-white rounded-xl border border-[#e0d8cc] px-3 divide-y divide-[#f0ebe3]">
            {legs.map((r) => <Leg key={`${r.tab}-${r.row}`} r={r} s={s} today={today} pickupBy={pickupBy(s)} />)}
          </ol>
          {/* Paper tickets to collect: the steps are one tap away from any of their trains */}
          {/* (until the pickup's own day — after it, the link repeated on every later day) */}
          {legs.some((r) => /collect|pick ?up/i.test(`${colOf(r.cols, /readiness/)} ${colOf(r.cols, /^ticket/)}`)) && s.checklists.filter((c) => !c.date || today <= c.date).map((c) => (
            <Link key={c.tab} to={`/checklist/${encodeURIComponent(s.id)}/${encodeURIComponent(c.tab)}`}
              className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">
              {checklistTitle(c.tab)}{pickupBy(s) ? ` (${pickupBy(s)}'s job)` : ""}: the steps ›
            </Link>
          ))}
        </div>
      ))}
    </section>
  );
}

/** On a checklist's day (and before it), a card that opens its steps */
export function ChecklistCard({ c, s, today }: { c: Checklist; s: OtherSource; today: boolean }) {
  const pickups = c.steps.filter((x) => /^JR West \d/i.test(colOf(x.cols, /^step$/))).length;
  return (
    <Link to={`/checklist/${encodeURIComponent(s.id)}/${encodeURIComponent(c.tab)}`}
      className="block mb-3 rounded-xl bg-[#514636] text-white p-4 min-h-[44px]">
      <p className="text-xs uppercase tracking-wide text-white/70">{today ? "Today · " : ""}{checklistTitle(c.tab)}</p>
      <p className="text-lg leading-snug mt-1">
        {pickups ? `Collect all ${pickups === 6 ? "six" : pickups} JR West paper tickets, then board with your IC cards — step by step ›` : "Step by step ›"}
      </p>
      <p className="text-sm text-white/80 mt-1">From {sourceWords(s)}</p>
    </Link>
  );
}

/** Now: the next booked train today, with its seats — on the trip's clock */
export function NextTrain({ sources, date, nowMinutes, isMine }: {
  sources: OtherSource[]; date: string; nowMinutes: number; isMine: (r: RailRow, s: OtherSource) => boolean;
}) {
  const minutesOf = (t: string) => t ? Number(t.slice(0, -3)) * 60 + Number(t.slice(-2)) : null;
  for (const s of sources) {
    const legs = s.rail
      .filter((r) => r.date === date && isBookedTrain(r) && isMine(r, s))
      .map((r) => ({ r, at: minutesOf(colOf(r.cols, /^depart/))!, arrive: minutesOf(colOf(r.cols, /^arrive/)) }));
    // The train you're on, between its times — its seats and arrival stay up top (round 12: at 6:19 PM the NOZOMI 77
    // left the top of Now two minutes after boarding)
    const riding = legs.find((x) => x.at < nowMinutes && x.arrive !== null && x.arrive > x.at && nowMinutes < x.arrive);
    const next = riding || legs.filter((x) => x.at >= nowMinutes).sort((a, b) => a.at - b.at)[0];
    if (!next) continue;
    const mins = next.at - nowMinutes;
    const inWords = mins < 60 ? `in ${mins} min` : `in ${Math.floor(mins / 60)} hr${mins % 60 ? ` ${mins % 60} min` : ""}`;
    const c = next.r.cols;
    return (
      <a href="#trains" className="block mb-3 rounded-xl bg-[#514636] text-white p-4">
        <p className="text-xs uppercase tracking-wide text-white/70">
          {riding ? `On this train now, by the schedule · arriving ${twelveHour(colOf(c, /^arrive/))}` : `Next train · ${inWords}`}
        </p>
        <p className="text-lg leading-snug mt-1">{twelveHour(colOf(c, /^depart/))} · {colOf(c, /^train$/)} · {colOf(c, /^route$/)}</p>
        <p className="text-sm text-white/85 mt-1 [overflow-wrap:anywhere]">{[colOf(c, /^class$/), colOf(c, /^car/)].filter(Boolean).join(" · ")}</p>
        {colOf(c, /^reservation/) && <p className="text-sm text-white/80">Reservation #{colOf(c, /^reservation/)}</p>}
        {/* Its own warning for this train ("PENDING — SmartEX: verify … IC cards …"), on the card itself (round r1) */}
        {/* Its warning only while it's current — an old "collect … Oct 6" on Oct 14's card led Now, after Ken had already
            ridden on those tickets (round 12); the day's train list still has it, said as possibly out of date */}
        {colOf(c, /readiness/) && !((d) => !!d && d < date)(dateInText(colOf(c, /readiness/), Number(date.slice(0, 4)))) && (
          <StatusWords readiness={colOf(c, /readiness/)} s={s} today={date} className="text-sm text-[#f3d9a8] mt-1" />
        )}
        <p className="text-sm text-white/80 mt-1">From {sourceWords(s)}</p>
      </a>
    );
  }
  return null;
}
