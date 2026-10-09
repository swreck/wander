/**
 * Ken's rail sheet on the screens (Sep 30 2026): a day's trains, the ticket-pickup card on its day, and the next
 * train on Now. Its words stay its own — a "PENDING — …" readiness line is shown as the sheet wrote it, never turned
 * into "booked" or "done" — and every card says where it came from. Where it and Larisa's Guide disagree, both show.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { voiceFor } from "../lib/guideDisplay";
import { colOf, twelveHour, sourceWordsFor, pickupProgress, untickedTickets, isBookedTrain, isSettledStatus, withTwelveHour, readWords, dateInText, differWords, herTab, type OtherSource, type RailRow, type Checklist, type RailDiffer } from "../lib/sources";
import GuideText from "./GuideText";

/**
 * A leg's status as the sheet wrote it. When it names a day already past ("collect at Shin-Osaka Oct 6", seen on
 * Oct 14) it's still its words, but Wander says it can't tell what happened since (rail round: Andy read an old PENDING
 * as "the tickets were never collected"). The same wording everywhere a status shows — the day's list and Now's card.
 */
function StatusWords({ readiness, s, today, className, pickupBy, resv }: { readiness: string; s: OtherSource; today: string; className: string; pickupBy?: string | null; resv?: string }) {
  const [showOld, setShowOld] = useState(false);
  const day = dateInText(readiness, Number(today.slice(0, 4)));
  const stale = !!day && day < today;
  // After its day: one calm line saying whose pickup it was; the sheet's old words one tap away (delight audit: on the
  // airport day a nine-line "PENDING — …" paragraph had Andy texting Ken in a panic)
  const pickup = s.checklists.find((c) => c.date && c.date === day);
  const place = pickup ? checklistTitle(pickup.tab).replace(/^Ticket pickup — /, "") : null;
  if (!stale) return <p className={`${className} [overflow-wrap:anywhere]`}>{withTwelveHour(readiness)}</p>;
  // On the phone that did the pickup: whether this ticket's step was ticked (delight audit: an unticked ticket read the
  // same as a collected one — and his sheet says some can't be collected anywhere else later)
  const ticked = pickup && !pickupBy && resv ? pickupProgress(s.id, pickup).tickedFor(resv) : null;
  return (
    <div className={className}>
      <p className={`[overflow-wrap:anywhere] ${ticked === false ? "text-[#8a5a1a]" : ""}`}>
        {ticked === true
          ? `Paper ticket: collected at ${place} on ${shortWhen(day!)} — ticked on this phone.`
          : ticked === false
            ? `Paper ticket: not ticked on this phone at the ${place} pickup on ${shortWhen(day!)} — check you have it before boarding.`
            : pickup
              ? `Paper tickets: ${pickupBy ? `${pickupBy} were` : "you were"} to collect these at ${place} on ${shortWhen(day!)}.`
              : `The rail sheet's note was for ${shortWhen(day!)}.`}
      </p>
      {showOld
        ? <p className="text-[#6b5d4a] mt-0.5 [overflow-wrap:anywhere]">The rail sheet {s.readAt ? `said, when Wander last read it ${readWords(s.readAt)}` : "says"}: “{withTwelveHour(readiness)}” Wander can't see whether that's been done since.</p>
        : <button onClick={() => setShowOld(true)} className="min-h-[44px] text-sm text-[#514636]">What the rail sheet said ›</button>}
    </div>
  );
}
const shortWhen = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** "Tix pick up — Shin-Osaka" → "Ticket pickup — Shin-Osaka" (its tab name stays in the source line) */
export const checklistTitle = (tab: string) => tab.replace(/^tix\s*pick\s*-?\s*up/i, "Ticket pickup");

/**
 * A train in the day itself, at its time (look "card") or under her line for it (look "nested"): one compact line —
 * its time, name and route, anything to check now — and "Seats, notes and steps ›" opens the rest in place (day review,
 * Oct 4: every booked train was said twice, once in the day and again in full under "Trains" two screens down).
 */
export function RailLeg(props: { r: RailRow; s: OtherSource; today: string; pickupBy?: string | null; look: "card" | "nested"; differs?: RailDiffer[] }) {
  return <Leg {...props} />;
}

function Leg({ r, s, today, pickupBy, look = "list", differs = [] }: { r: RailRow; s: OtherSource; today: string; pickupBy?: string | null; look?: "list" | "card" | "nested"; differs?: RailDiffer[] }) {
  const me = useAuth().user?.displayName ?? null;
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
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
  // (notes that say only that — "Ken + Larisa only" — are said once, up top; day review, Oct 8: Oct 14's taxi legs said it twice)
  const moreNotes = onlyFor && notes.trim().replace(/[.\s]+$/, "") === onlyFor ? "" : notes;
  const booked = isBookedTrain(r);
  // Its status names a day that has passed ("collect at Shin-Osaka Oct 6", seen on Oct 14): still its words, but
  // Wander says it can't tell what happened since (round r1: Andy read it as "the tickets were never collected")
  const statusDay = readiness ? dateInText(readiness, Number(today.slice(0, 4))) : null;
  const stale = !!statusDay && statusDay < today;
  // Its pickup's steps, until the pickup's own day (after it, the link repeated on every later day)
  const pickups = /collect|pick ?up/i.test(`${readiness} ${ticket}`) ? s.checklists.filter((c) => !c.date || today <= c.date) : [];
  if (look !== "list") {
    const nested = look === "nested";
    const head = booked ? `${train} · ${route}` : `${route}${mode ? ` · ${mode}` : ""}`;
    const name = !booked ? notes.match(/^\s*([A-Z][A-Z0-9 -]{2,20}?)\s*=/)?.[1] : undefined;
    const Box = nested ? "div" : "li";
    return (
      <Box id={`train-${s.id}-${r.row}`} data-train className={nested ? "mt-2 rounded-lg border border-[#efe8dc] bg-[#faf8f5] p-2.5" : "bg-white rounded-xl border border-[#e0d8cc] p-3"}>
        <div className="flex gap-3">
          {!nested && (
            <div className="w-16 shrink-0 text-right">
              {booked ? (
                <>
                  <div className="text-sm font-medium text-[#3a3128] tabular-nums">{twelveHour(depart)}</div>
                  {arrive && <div className="text-xs text-[#6b5d4a]">arrive {twelveHour(arrive)}</div>}
                </>
              ) : <div className="text-sm text-[#6b5d4a] leading-snug">{target && target !== "—" ? target : ""}</div>}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className={`${nested ? "text-sm" : "text-[15px]"} leading-snug text-[#3a3128]`}>
              {nested && booked ? `${twelveHour(depart)} · ` : ""}{name ? `${name} · ` : ""}{head}{nested && booked && arrive ? ` · arrives ${twelveHour(arrive)}` : ""}
            </p>
            <p className="text-xs text-[#6b5d4a] mt-0.5">{booked ? "Booked" : "No booking needed"} · from {sourceWordsFor(s, me)}</p>
            {/* Car and seats stay in sight — what you look for on the platform, never behind a tap */}
            {booked && [cls, seat, resv].some((x) => x && x !== "—") && (
              <p className="text-sm text-[#514636] mt-0.5 [overflow-wrap:anywhere]">{[cls, seat, resv && resv !== "—" ? `Reservation #${resv}` : ""].filter((x) => x && x !== "—").join(" · ")}</p>
            )}
            {onlyFor && <p className="text-xs text-[#514636] mt-0.5">“{onlyFor}”, the sheet says</p>}
            {/* Where her Guide has this train at another time — said here, with the train (not on today's screen, where it's
                said at the top) */}
            {differs.map((d) => <DifferLine key={`${d.row}-${d.guideSource}`} d={d} />)}
            {status === "?" && <p className="text-sm text-[#8a5a1a] mt-0.5">The rail sheet marks this leg “?”{notes ? `: ${withTwelveHour(notes)}` : "."}</p>}
            {/* Anything to check before boarding stays in sight ("PENDING — SmartEX: verify…"); an old one waits inside */}
            {/* (settled by hand — "DONE — …" — said calmly, in the color of a thing done) */}
            {readiness && !stale && <StatusWords readiness={readiness} s={s} today={today} pickupBy={pickupBy} resv={resv} className={`text-sm mt-1 ${isSettledStatus(readiness) ? "text-[#3f5a2a]" : "text-[#8a5a1a]"}`} />}
            {more ? (
              <>
                {/^\d+$/.test(pax) && <p className="text-sm text-[#514636] mt-1">{pax} {pax === "1" ? "person" : "people"}</p>}
                {!booked && resv && resv !== "—" && <p className="text-sm text-[#514636]">Reservation #{resv}</p>}
                {readiness && stale && <StatusWords readiness={readiness} s={s} today={today} pickupBy={pickupBy} resv={resv} className="text-sm mt-1 text-[#6b5d4a]" />}
                {ticket && !stale && <p className="text-sm text-[#6b5d4a] mt-1 [overflow-wrap:anywhere]">{withTwelveHour(ticket)}</p>}
                {moreNotes && status !== "?" && <GuideText text={withTwelveHour(moreNotes)} className="text-sm text-[#6b5d4a] mt-1 [overflow-wrap:anywhere]" />}
                {pickups.map((c) => (
                  <Link key={c.tab} to={`/checklist/${encodeURIComponent(s.id)}/${encodeURIComponent(c.tab)}`}
                    className="flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">
                    {checklistTitle(c.tab)}{pickupBy ? ` (${pickupBy}'s job)` : ""}: the steps ›
                  </Link>
                ))}
                <p className="text-xs text-[#6b5d4a] mt-1">From {sourceWordsFor(s, me)} — its {r.tab} tab</p>
                <button onClick={() => setMore(false)} className="min-h-[44px] text-sm text-[#514636]">Hide the details ‹</button>
              </>
            ) : (
              <button onClick={() => setMore(true)} aria-expanded={false} className="-mb-2 min-h-[44px] text-sm text-[#514636]">
                {booked ? "Reservation, notes and steps ›" : moreNotes || pickups.length ? "The sheet's notes ›" : "More from the sheet ›"}
              </button>
            )}
          </div>
        </div>
      </Box>
    );
  }
  return (
    // (the same id as in the day itself — a train is drawn in one place or the other, never both)
    <li id={`train-${s.id}-${r.row}`} className="py-2.5 scroll-mt-24">
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
          {readiness && <StatusWords readiness={readiness} s={s} today={today} pickupBy={pickupBy} resv={resv} className={`text-sm mt-1 ${stale ? "text-[#6b5d4a]" : isSettledStatus(readiness) ? "text-[#3f5a2a]" : "text-[#8a5a1a]"}`} />}
          {/* (its pickup instructions are past once the pickup day is — on Oct 29 they read to Andy as an order; delight audit) */}
          {ticket && !stale && <p className="text-sm text-[#6b5d4a] mt-1 [overflow-wrap:anywhere]">{withTwelveHour(ticket)}</p>}
          {moreNotes && status !== "?" && (open
            ? <><GuideText text={withTwelveHour(moreNotes)} className="text-sm text-[#6b5d4a] mt-1 [overflow-wrap:anywhere]" />
                <button onClick={() => setOpen(false)} className="min-h-[44px] text-sm text-[#514636]">Hide the sheet's notes ‹</button></>
            : moreNotes.length <= 90
              ? <p className="text-sm text-[#6b5d4a] mt-1">{withTwelveHour(moreNotes)}</p>
              : <button onClick={() => setOpen(true)} className="min-h-[44px] text-sm text-[#514636]">The sheet's notes ›</button>)}
          <p className="text-xs text-[#6b5d4a] mt-1">From {sourceWordsFor(s, me)} — its {r.tab} tab</p>
        </div>
      </div>
    </li>
  );
}

/** A day's legs from the rail sheet, with any disagreement with Larisa's Guide said on top */
/** Where the rail sheet and Larisa's Guide disagree — both said, never settled */
export function DifferNote({ d, className = "" }: { d: RailDiffer; className?: string }) {
  const v = voiceFor(useAuth().user?.displayName);
  return (
    <p className={`text-sm text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1 ${className}`}>
      The sources differ — {v.say(differWords(d))}. Worth checking which is right.
    </p>
  );
}

/** A ticket this phone didn't tick at the pickup, on the morning it travels — at the top, with where it can still be
 *  collected in the sheet's words (delight audit) */
export function TicketWarnings({ list, className = "mb-3" }: { list: ReturnType<typeof untickedTickets>; className?: string }) {
  return (
    <>
      {/* Calm, and with the pickup's place and day (round 15: on departure morning it read to Larisa as "something's
          wrong", and quoted an Oct 6 instruction on Oct 29) */}
      {list.map(({ s, r, where, others, pickup }) => {
        const place = checklistTitle(pickup.tab).replace(/^Ticket pickup — /, "");
        return (
          <div key={`${s.id}-${r.row}`} className={`${className} rounded-xl bg-[#fff8ec] border border-[#e8c98f] p-3`}>
            <p className="text-sm font-medium text-[#3a3128]">
              Worth a check: the paper ticket for the {twelveHour(colOf(r.cols, /^depart/))} {colOf(r.cols, /^train$/)} wasn't ticked on this phone at the {place} pickup{pickup.date ? ` on ${shortWhen(pickup.date)}` : ""}.
            </p>
            {others && <p className="text-sm text-[#514636] mt-0.5">If it's ticked on {others.split(" & ").map((n) => `${n}'s`).join(" or ")} phone, you're set.</p>}
            {where.length > 0 && <p className="text-sm text-[#514636] mt-1">If you don't have it, the rail sheet says: “{withTwelveHour(where.join(" "))}”</p>}
          </div>
        );
      })}
    </>
  );
}

/** The same, in one line, under the train it's about — for Now (delight audit: Andy read the five-line box at the top,
 *  saw "1:30" and relaxed while the car left in 30 minutes; the one difference was said four ways) */
export function DifferLine({ d, dark = false }: { d: RailDiffer; dark?: boolean }) {
  const v = voiceFor(useAuth().user?.displayName);
  const railTime = d.railSays.match(/\d{1,2}:\d{2}\s*[AP]M/i)?.[0] || d.railSays;
  const agree = (d.agree || []).map((a) => herTab(a.source));
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <p className={`text-sm mt-1 ${dark ? "text-[#f3d9a8]" : "text-[#8a5a1a]"}`}>
      {v.say(`${cap(herTab(d.guideSource))} says ${d.guideSays}; this booking${agree.length ? ` and ${agree.join(" and ")}` : ""} say${agree.length ? "" : "s"} ${railTime}.`)}
    </p>
  );
}

export function TrainsForDay({ sources, date, today, pickupBy, differsShownAbove = false, isMine, theirsName, shownInPlace }: {
  sources: OtherSource[]; date: string; today: string;
  /** trains already drawn in the day itself, at their time or under her line ("<source id>-<row>") — not again here */
  shownInPlace?: Set<string>;
  /** today's screen already says it at the top — not again here (round 12: four times on Oct 29's Now) */
  differsShownAbove?: boolean;
  /** whose job the pickup is ("Ken & Larisa"), said to everyone else */
  pickupBy: (s: OtherSource) => string | null;
  /** whose a leg is: your own legs show in full; someone else's fold to one line (delight audit: on Julie's landing day
   *  Ken & Larisa's four Mashiko legs filled her screen) */
  isMine?: (r: RailRow, s: OtherSource) => boolean;
  /** whose the folded legs are ("Ken & Larisa") */
  theirsName?: (s: OtherSource) => string | null;
}) {
  const me = useAuth().user?.displayName ?? null;
  const [showTheirs, setShowTheirs] = useState(false);
  const placed = (s: OtherSource, row: number) => !!shownInPlace?.has(`${s.id}-${row}`);
  const found = sources.map((s) => {
    const legs = s.rail.filter((r) => r.date === date);
    const mine = (isMine ? legs.filter((r) => isMine(r, s)) : legs).filter((r) => !placed(s, r.row));
    const theirs = isMine ? legs.filter((r) => !isMine(r, s) && !placed(s, r.row)) : [];
    const differs = differsShownAbove ? [] : s.differs.filter((d) => d.date === date && !placed(s, d.row));
    // (the pickup's steps are also inside each placed train that needs them)
    const pickups = legs.filter((r) => !placed(s, r.row)).some((r) => /collect|pick ?up/i.test(`${colOf(r.cols, /readiness/)} ${colOf(r.cols, /^ticket/)}`)) ? s.checklists.filter((c) => !c.date || today <= c.date) : [];
    return { s, legs, mine, theirs, differs, pickups };
  }).filter((x) => x.mine.length || x.theirs.length || x.differs.length || x.pickups.length);
  if (!found.length) return null;
  return (
    <section id="trains" className="mt-6 scroll-mt-24">
      <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a]">{shownInPlace?.size ? "More trains" : "Trains"}</h2>
      {found.map(({ s, mine, theirs, differs, pickups }) => {
        return (
        <div key={s.id}>
          <p className="text-[13px] text-[#6b5d4a] mt-0.5">
            From {sourceWordsFor(s, me)} — not {voiceFor(me).guide}.{s.readAt ? ` Wander last read it ${readWords(s.readAt)}.` : ""}{s.lastError ? " Its latest read didn't work, so this may be out of date." : ""}
          </p>
          {differs.map((d) => <DifferNote key={`${d.row}-${d.guideSource}`} d={d} className="mt-2" />)}
          {mine.length > 0 && (
            <ol className="mt-2 bg-white rounded-xl border border-[#e0d8cc] px-3 divide-y divide-[#f0ebe3]">
              {mine.map((r) => <Leg key={`${r.tab}-${r.row}`} r={r} s={s} today={today} pickupBy={pickupBy(s)} />)}
            </ol>
          )}
          {theirs.length > 0 && (showTheirs
            ? <>
                <ol className="mt-2 bg-white/70 rounded-xl border border-[#e0d8cc] px-3 divide-y divide-[#f0ebe3]">
                  {theirs.map((r) => <Leg key={`${r.tab}-${r.row}`} r={r} s={s} today={today} pickupBy={pickupBy(s)} />)}
                </ol>
                <button onClick={() => setShowTheirs(false)} className="min-h-[44px] text-sm text-[#514636]">Hide {theirsName?.(s) ? `${theirsName(s)}'s` : "the others'"} trains ‹</button>
              </>
            : <button onClick={() => setShowTheirs(true)} className="block min-h-[44px] mt-1 text-sm text-[#514636]">
                {theirsName?.(s) ? `${theirsName(s)}'s` : "The others'"} trains today ({theirs.length}) ›
              </button>)}
          {/* Paper tickets to collect: the steps are one tap away from any of their trains */}
          {/* (until the pickup's own day — after it, the link repeated on every later day) */}
          {pickups.map((c) => (
            <Link key={c.tab} to={`/checklist/${encodeURIComponent(s.id)}/${encodeURIComponent(c.tab)}`}
              className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">
              {checklistTitle(c.tab)}{pickupBy(s) ? ` (${pickupBy(s)}'s job)` : ""}: the steps ›
            </Link>
          ))}
        </div>
        );
      })}
    </section>
  );
}

/** On a checklist's day (and before it), a card that opens its steps */
export function ChecklistCard({ c, s, today }: { c: Checklist; s: OtherSource; today: boolean }) {
  const me = useAuth().user?.displayName ?? null;
  const pickups = c.steps.filter((x) => /^JR West \d/i.test(colOf(x.cols, /^step$/))).length;
  // How far along, from this phone's ticks (delight audit: ticks never showed outside the steps page)
  const progress = pickupProgress(s.id, c);
  return (
    <Link to={`/checklist/${encodeURIComponent(s.id)}/${encodeURIComponent(c.tab)}`}
      className="block mb-3 rounded-xl bg-[#514636] text-white p-4 min-h-[44px]">
      <p className="text-xs uppercase tracking-wide text-white/70">{today ? "Today · " : ""}{checklistTitle(c.tab)}</p>
      <p className="text-lg leading-snug mt-1">
        {pickups ? `Collect all ${pickups === 6 ? "six" : pickups} JR West paper tickets, then board with your IC cards — step by step ›` : "Step by step ›"}
      </p>
      {progress.done > 0 && (
        <p className="text-sm text-[#d6e8c8] mt-1">
          {progress.tickets.of
            ? `${progress.tickets.done} of ${progress.tickets.of} tickets ticked on this phone${progress.tickets.next ? ` — next: ${progress.tickets.next}` : ""}`
            : `${progress.done} of ${progress.of} steps ticked on this phone`}
        </p>
      )}
      <p className="text-sm text-white/80 mt-1">From {sourceWordsFor(s, me)}</p>
    </Link>
  );
}

/** Now: the next booked train today, with its seats — on the trip's clock */
export function NextTrain({ sources, date, nowMinutes, isMine, quiet = false }: {
  sources: OtherSource[]; date: string; nowMinutes: number; isMine: (r: RailRow, s: OtherSource) => boolean;
  /** Something else is next: this card is a step quieter, so two cards never both read as "Next" (delight audit) */
  quiet?: boolean;
}) {
  const me = useAuth().user?.displayName ?? null;
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
      // (to the train itself, wherever the day draws it — the Trains section can be empty now; day review, Oct 4)
      <a href={`#train-${s.id}-${next.r.row}`}
        onClick={(e) => { const el = document.getElementById(`train-${s.id}-${next.r.row}`); if (el) { e.preventDefault(); el.scrollIntoView({ behavior: "smooth", block: "center" }); } }}
        className={`block mb-3 rounded-xl text-white ${quiet ? "bg-[#7a6d5c] p-3" : "bg-[#514636] p-4"}`}>
        <p className="text-xs uppercase tracking-wide text-white/70">
          {riding ? `On this train now, by the schedule · arriving ${twelveHour(colOf(c, /^arrive/))}` : `Next train · ${inWords}`}
        </p>
        <p className="text-lg leading-snug mt-1">{twelveHour(colOf(c, /^depart/))} · {colOf(c, /^train$/)} · {colOf(c, /^route$/)}</p>
        <p className="text-sm text-white/85 mt-1 [overflow-wrap:anywhere]">{[colOf(c, /^class$/), colOf(c, /^car/)].filter(Boolean).join(" · ")}</p>
        {colOf(c, /^reservation/) && <p className="text-sm text-white/80">Reservation #{colOf(c, /^reservation/)}</p>}
        {/* Its own warning for this train ("PENDING — SmartEX: verify … IC cards …"), on the card itself (round r1) */}
        {/* Its warning only while it's current — an old "collect … Oct 6" on Oct 14's card led Now, after Ken had already
            ridden on those tickets (round 12); the day's train list still has it, said as possibly out of date */}
        {/* (and not once you're aboard — delight audit: "PENDING — SmartEX: verify…" under "On this train now") */}
        {!riding && colOf(c, /readiness/) && !((d) => !!d && d < date)(dateInText(colOf(c, /readiness/), Number(date.slice(0, 4)))) && (
          <StatusWords readiness={colOf(c, /readiness/)} s={s} today={date} className={`text-sm mt-1 ${isSettledStatus(colOf(c, /readiness/)) ? "text-white/85" : "text-[#f3d9a8]"}`} />
        )}
        {/* Where her Guide has this train at another time: said once, here, in one line */}
        {!riding && s.differs.filter((d) => d.date === date && d.row === next.r.row).map((d) => <DifferLine key={`${d.row}-${d.guideSource}`} d={d} dark />)}
        <p className="text-sm text-white/80 mt-1">From {sourceWordsFor(s, me)}</p>
      </a>
    );
  }
  return null;
}
