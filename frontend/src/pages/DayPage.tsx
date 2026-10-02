/**
 * DayPage — one day of the trip, as Larisa's Guide describes it.
 *
 * Reached by tapping a day on Home (/day/2026-10-18), or a line on Home (/day/2026-10-14#item-…,
 * which scrolls to that line). Shows, in her words and in the order the day is lived:
 * what happens (flights, meetings, tours, meals, check-in/out), deadlines — on every day of their
 * window, marked once they've passed — maybes, where everyone sleeps tonight (per couple, and
 * "on the flight" when they're in the air), and same-day plans the group added in Wander.
 * Each Guide line says where it came from; the page says how current Wander's copy is.
 * The Guide is read-only here; only the Wander plans can be added or taken off.
 *
 * Offline: the whole trip's Guide items come in one request that the service worker and the phone
 * keep, so every day opens with no signal, and refreshes when the signal returns.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { queuedBodies, dropQueued } from "../lib/offlineStore";
import type { Trip } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";
import { guideData, type TripGuideData, type GuideItem } from "../lib/guideData";
import {
  sortDay, timeLabel, itemTitle, friendlySource, mapsQueryFor, mapsLink, freshness, clock,
  nightOf, isFor, isLanding, deadlineOnDate, deadlineOver, deadlineTimeWords, deadlineWhen,
  leaveForAirport, isPlanningNote, isFragment, partyOf, myNight, leavingOn, stayMapsQuery,
  checkoutBeforeFirst, checkinAfterLanding, leadItem, withCheckoutWho, minutesToClock, lateLeaveWords,
  ownerlessInSplit, tabsDiffer, linkLabel, currentPlanLine, planLineEnd, planLineEndSaid, saidAgain, currentUnownedLine, linksIn, besideHotel, voiceFor, tabLabel,
  landingStatus, phoneIsElsewhere, homeOnJapanDate, departureInTripZone, landingTitle,
  nowMinutesOn, zonedMoment, scheduledLanding, bookedByName, bookedWords, askedOf, distinctWords, openQuestionsIn,
  noGroupWords, pictureGroupOf, pictureYou, PICTURE_GROUP, tripClockMinutes, confirmationWords, isFreeCancel, FREE_CANCEL_WORDS, differWordsFor,
} from "../lib/guideDisplay";
import { sourcesData, railAudience, legIsFor, twelveHour, isBookedTrain, colOf, withTwelveHour, sourceWordsFor, pickupProgress, untickedTickets, railNoteFor, type OtherSource, type RailDiffer, type RailRow } from "../lib/sources";
import { TrainsForDay, ChecklistCard, NextTrain, DifferNote, checklistTitle, TicketWarnings } from "../components/RailSheet";
import { sheetNotes, airportWaysTo, type NotesByTab } from "../lib/sheetNotes";

/** A spreadsheet time ("18:00:00") as a person reads it; her own words ("~8:30–9:15", "Morning") as written */
function planTime(b: GuideItem): string {
  const t = (b.timeText || "").trim();
  // A spreadsheet clock cell ("07:45:00", "07:45") — not her own words like "9:15–10:30"
  const hms = t.match(/^(\d{1,2}):(\d{2})(:00)?$/);
  if (hms && (hms[3] || hms[1].length === 2)) return clock(`${hms[1].padStart(2, "0")}:${hms[2]}`);
  if (t) return t;
  return b.time ? clock(b.time) : "";
}

// Lines that are moves, not places ("Taxi north", "Leave Shiraume", "Shower/change/rest") get no Maps link
const NOT_A_PLACE = /^(taxi|leave|return|depart|arrive|collect|check|shower|split|breakfast|lunch$|evening|refresh|flight|board|drop|continue|finish|optional|traditional)/i;
/**
 * The place a line of her plan names, for Maps — only when her words name one. Her own stop links come
 * first (the Guide reader attaches them); this is the fallback. Round 6: "Ginza Premium Retail Walk, Tokyo"
 * and "Complimentary Residence transfer to Kyoto Station" were searched as if they were places.
 */
function placeOf(label: string): string | null {
  const t = label.trim();
  // Named outright: "… ideally Shoraian", "transfer to Kyoto Station", "Refresh at the Imperial Hotel"
  const explicit = t.match(/\bideally\s+(?:at\s+)?([^,;()]+)/i) || t.match(/\b(?:to|at)\s+(?:the\s+)?([A-Z][^,;()—–/]*)$/);
  if (explicit) return explicit[1].trim() || null;
  if (NOT_A_PLACE.test(t)) return null;
  // A heading-style line: "LIGHT LUNCH – Ginza Mitsukoshi Depachika", "DINNER RESERVATION – UNE IMMERSION (Shibuya)"
  const caps = t.match(/^[A-Z][A-Z &-]+\s+[–-]\s+(.+)$/);
  if (caps) return caps[1].replace(/\s*\([^)]*\)\s*$/, "").trim();
  // A short proper name ("Tenryu-ji", "Nishiki Market", "Hassun — Michelin…"); a longer line is a description
  const name = t.split(/\s+[—–]\s+/)[0].replace(/\s+(lunch|dinner|breakfast)$/i, "").trim();
  const words = name.split(/\s+/);
  return words.length <= 3 && words.every((w) => /^[A-Z]/.test(w)) && !name.includes("/") ? name : null;
}
/**
 * Where a line of her plan is on a map: her own link, else a search for the place her words name. "The hotel"
 * is that night's stay (hotel: its Maps search), and no link when Wander can't tell which (round 11: "Strict
 * Formalwear Prep at the Hotel" searched Maps for any hotel in Tokyo, not the Imperial)
 */
interface MapContext { hotel?: string | null; dayWords?: string; bookings?: GuideItem[] }
function planMapHref(b: GuideItem, ctx: MapContext = {}): string | null {
  const hotel = ctx.hotel ?? null;
  // A line with choices ("Lunch") isn't a place — each choice is (round 6: "Test lunch, Kyoto")
  if (choicesOf(b).length) return null;
  // Leaving a place isn't going there — no map of the hotel you're standing in
  if (/^\s*(leave|depart)\b/i.test(b.title)) return null;
  // Her tabs put the place in different areas: no second map here — the booking's own address is the one link, and
  // the "tabs differ" note says both (round 12: Yazawa had two Maps links to two different places)
  if (/^Tabs differ: .* puts it in /m.test(b.detail || "")) return null;
  if (linksIn(b.link)[0]) return linksIn(b.link)[0];
  // The stop her tab names for a line that only says what it's for ("Taxi to e-bike meeting point" → Cycle Kyoto)
  const where = (b.detail || "").match(/^Where: (.+?) — the stop her tab lists/m)?.[1];
  if (where) return mapsLink(`${where}, ${areaOf(b, ctx.dayWords)}Japan`);
  // The same place as one of her bookings that day: the booking's own address (round 12: her Oct 26 "Hassun" line
  // searched a name; the Hassun booking has her Gion address)
  const booked = (ctx.bookings || []).find((m) => m.time === b.time && saidAgain(b, m));
  if (booked) {
    const q = mapsQueryFor(booked);
    if (q) return mapsLink(q);
    if (linksIn(booked.link)[0]) return linksIn(booked.link)[0];
  }
  const p = placeOf(b.title);
  if (p && /^(?:the\s+|our\s+)?(?:hotel|ryokan|room|hotel room|lobby|residence)$/i.test(p)) return hotel ? mapsLink(hotel) : null;
  // Tonight's hotel by its name: the hotel's own search, never the day tab's area (round 12: "Refresh at the Imperial
  // Hotel" searched "Imperial Hotel, Ginza" — it isn't in Ginza)
  const bare = (s: string) => s.toLowerCase().replace(/^the\s+/, "").trim();
  if (p && hotel && bare(hotel).includes(bare(p))) return mapsLink(hotel);
  return p ? mapsLink(`${p}, ${areaOf(b, ctx.dayWords)}Japan`) : null;
}
/**
 * The city her day tab is about, for a Maps search ("Kyoto Tue, 1027…" → "Kyoto, "). Round 7: "TeamLab,
 * Japan" could land on the Tokyo teamLab. Only the city: the rest of a tab name is cut short by the
 * sheet ("Kappabashi & Akihab", "1027Kiyomizu-dera Te") and would mislead a search.
 */
function areaOf(b: GuideItem, dayWords = ""): string {
  const tab = b.source.split(" · ")[0];
  const city = tab.match(/^([A-Z][a-z]{2,})\s/)?.[1];
  if (!city || /^(Day|Dining|Flight)$/.test(city)) return "";
  // The place her tab names after its date goes in too — only when her Itinerary line for the day names it, so it's
  // the whole day's place ("Kyoto Wed, 1028 Shigaraki" + "Kyoto day 4 - Shigaraki": Maruni Toryo, Shigaraki), never
  // just the morning's (round 12: "Kyoto Mon, 1026 Arashiyama-…" sent Gion's Hassun to "Hassun, Arashiyama")
  const town = tab.match(/(?:\d{3,4}|Day \d+)\s*([A-Z][a-z]{3,})(?![a-z])/)?.[1];
  // (the town alone: Shigaraki isn't in Kyoto's prefecture — "Shigaraki, Kyoto" could mislead a search)
  return town && town !== city && dayWords.toLowerCase().includes(town.toLowerCase()) ? `${town}, ` : `${city}, `;
}
/**
 * Her route for the day with each stop's town added ("Umeno Vase Shop" → "Umeno Vase Shop, Tokyo, Japan"). Her link
 * names stops bare, and the Google Maps app looks a bare name up near the phone: from California three of her Oct 16
 * stops weren't found and one landed in Amsterdam ("Can't seem to find that place" — Ken's iPhone check, Oct 2). Her
 * stops, order and everything else in the link stay as she made it.
 */
function placedRoute(url: string, area: string): string {
  try {
    const u = new URL(url);
    const [before, path] = u.pathname.split("/maps/dir/");
    if (path === undefined) return url;
    const town = area.replace(/,\s*$/, "");
    const stops = path.split("/").map((s) => {
      if (!s || s.startsWith("@") || s.startsWith("data=")) return s;
      const name = decodeURIComponent(s.replace(/\+/g, " "));
      // (the town as a whole word — "Tokyodo Main Showroom" isn't a stop already in Tokyo)
      const named = town && new RegExp(`\\b${town.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(name);
      const placed = /japan|日本/i.test(name) ? name : named ? `${name}, Japan` : `${name}, ${area}Japan`;
      return encodeURIComponent(placed).replace(/%20/g, "+").replace(/%2C/g, ",");
    });
    u.pathname = `${before}/maps/dir/${stops.join("/")}`;
    return u.toString();
  } catch { return url; }
}
/**
 * A line about dressing for the evening, beside the dress code in that evening's booking ("Strict Formalwear Prep" —
 * "jackets required for men" — from her tab written for the upstairs restaurant; the booking, La Table 1F, says
 * "jackets or collared shirts and ties are not necessary"). Round 15: at 5 PM Andy's Now said only the stricter one.
 * `stricter`: her line asks more than the booking does.
 */
function bookingDress(b: GuideItem, bookings: GuideItem[] = []): { words: string; where: string; stricter: boolean } | null {
  const line = `${b.title}\n${b.detail || ""}`;
  if (!/\b(formal|formalwear|dress|attire|jackets?|change into)\b/i.test(line)) return null;
  const booking = bookings.find((m) => /^Dress: /m.test(m.detail || ""));
  if (!booking) return null;
  const words = (booking.detail!.match(/^Dress: (.+)$/m) || [])[1].trim();
  const stricter = /\b(strict|required|must)\b/i.test(line) && /\bor\b|not necessary|not required/i.test(words);
  return { words, where: booking.title.replace(/\s*\(.*\)\s*$/, ""), stricter };
}
/** Her choices on a line: [{ name: "Omen", note: "udon near Ginkaku-ji" }] */
function choicesOf(b: GuideItem): { name: string; note: string }[] {
  return (b.detail || "").split("\n").filter((l) => l.startsWith("Choice: ")).map((l) => {
    const [name, ...rest] = l.slice(8).split(" — ");
    return { name: name.trim(), note: rest.join(" — ").trim() };
  });
}
/** Maps for one of her choices: its name and the area of her plan ("Omen, Kyoto, Japan"). Her note on it
 *  stays out of the search — "Honke Owariya soba since 1465" isn't what a map knows it as (round 7). */
const choiceMapHref = (c: { name: string }, line: GuideItem) => mapsLink(`${c.name}, ${areaOf(line)}Japan`);

/**
 * Larisa's detailed plan for a day (from a day tab such as "Kyoto Mon, 1026…"): her order, her times as
 * written, who a line is for when the group splits — and, where it doesn't say, that it doesn't — her
 * choices (each can be picked as the group's plan: added in Wander, her sheet untouched), her notes, and
 * where her tabs disagree, on the line itself. On a plan day it leads the screen; her Itinerary tab's own
 * line for the day sits in its header, as hers, so the two never read as rival plans. Today, the line
 * she has you on now is marked and the ones behind you step back.
 */
function PlanSection({ blocks, overview, me, highlight, picked, onPick, onUndo, tellName, onTell, nowAt, hotel, bookings }: {
  blocks: GuideItem[]; overview: GuideItem[]; me: string | null; highlight: string | null;
  picked: Map<string, DayChoice>; onPick: (text: string, time: string | null, pickFor: string) => Promise<void>;
  onUndo: (c: DayChoice) => Promise<void>; tellName: string | null; onTell: (c: DayChoice) => void;
  nowAt: number | null; hotel: string | null; bookings: GuideItem[];
}) {
  const v = voiceFor(me, tellName);
  // Her Itinerary line(s) for the day, for a Maps search's town (areaOf)
  const dayWords = overview.map((o) => o.title).join(" ");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // The choice just tapped says "Saving…" until the pick is back from the server (a switch takes two steps)
  const [tapped, setTapped] = useState<string | null>(null);
  // Wander's reasoning for the day it put an undated plan on: one quiet line, the whole of it on a tap (delight audit:
  // five amber lines of "Wander matched…" sat above her stops all day, outranking her plan)
  const [whyOpen, setWhyOpen] = useState(false);
  const tab = blocks[0].source.split(" · ")[0];
  const heading = blocks[0].source.split(" · ").slice(1).join(" · ");
  // Wander's own match of an undated tab to this day — said once, as Wander's
  const matched = (blocks.map((b) => (b.detail || "").split("\n").find((l) => l.startsWith("Wander matched this plan"))).find(Boolean)) || null;
  const noOwner = ownerlessInSplit(blocks);
  // When each line ends, and the line you're on now — the same rule Home and Now use (lib/guideDisplay.ts)
  const endOf = (b: GuideItem) => planLineEnd(b, blocks);
  const current = nowAt === null ? null : currentPlanLine(blocks, nowAt, me) || currentUnownedLine(blocks, nowAt) || null;
  return (
    <section id="plan" className="mb-5 scroll-mt-24">
      <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a]">{v.Owners} plan for the day</h2>
      <p className="text-[13px] text-[#6b5d4a] mt-0.5">From the {tabLabel(tab)} tab{heading ? ` — ${heading}` : ""}</p>
      {/* Her whole route for the day, as she made it in Google Maps (charm item C4, Oct 1 2026) */}
      {(() => {
        const url = blocks.map((b) => (b.detail || "").match(/^Her whole route for the day: (\S+)$/m)?.[1]).find(Boolean);
        return url ? (
          <a href={placedRoute(url, areaOf(blocks[0], dayWords))} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 min-h-[44px] mt-1 px-3 rounded-xl bg-white border border-[#e0d8cc] text-sm text-[#514636]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M6 17V9a4 4 0 0 1 4-4h6M18 7v8a4 4 0 0 1-4 4H8" />
            </svg>
            See {v.her} route for the day in Google Maps ↗
          </a>
        ) : null;
      })()}
      {overview.map((o) => (
        <p key={o.id} className="text-[13px] text-[#514636] mt-1">In {v.her} Itinerary for today: “{o.title}”</p>
      ))}
      {matched && (whyOpen
        ? <p className="text-[13px] text-[#6b5d4a] mt-1">{v.say(matched)}</p>
        : <button onClick={() => setWhyOpen(true)} className="min-h-[44px] text-left text-[13px] text-[#6b5d4a]">
            {/A picture in her/.test(matched) ? "Wander placed this plan on this day; a picture in the tab dates it differently ›" : "Wander placed this plan on this day ›"}
          </button>)}
      <ol className="mt-2 bg-white rounded-xl border border-[#e0d8cc] divide-y divide-[#f0ebe3]">
        {blocks.map((b) => {
          const lines = (b.detail || "").split("\n").filter((l) => l && !l.startsWith("Wander matched this plan"));
          const choices = lines.filter((l) => l.startsWith("Choice: ")).map((l) => l.slice(8));
          const estimate = lines.includes("Times are Larisa's estimate.");
          const differ = tabsDiffer(b);
          const picGroup = pictureGroupOf(b);
          const notes = lines.filter((l) => !l.startsWith("Choice: ") && !l.startsWith("Tabs differ: ") && l !== "Times are Larisa's estimate." && !PICTURE_GROUP.test(l) && !l.startsWith("Her whole route for the day: "))
            .map((l) => (/^Where:/.test(l) ? v.say(l) : l));
          // Her "Transit: … Experience: …" on their own lines; a short note ("pending confirmation") in full
          const noteText = notes.join("\n").replace(/\s+(Experience|Transit|Note):/g, "\n$1:");
          const shortNote = noteText.length <= 90;
          // With choices, each choice gets its own Maps link; the line itself ("Lunch") isn't a place
          const map = choices.length ? null : planMapHref(b, { hotel, dayWords, bookings });
          const time = planTime(b);
          const pickedHere = choices.map((c) => `${b.title}: ${c.split(" — ")[0]}`).filter((t) => picked.has(t));
          const isNow = current?.id === b.id;
          const past = nowAt !== null && b.time && !isNow && endOf(b) <= nowAt;
          const ring = highlight === b.id || isNow ? "ring-2 ring-[#c8a060] rounded-xl" : "";
          return (
            <li key={b.id} id={`item-${b.id}`} className={`flex gap-3 p-3 transition-shadow ${ring} ${past ? "opacity-60" : ""}`}>
              <div className="w-20 shrink-0 text-right text-sm text-[#3a3128] [overflow-wrap:anywhere]" title={estimate ? "Larisa's estimate" : undefined}>
                {isNow && <span className="block text-[11px] uppercase tracking-wide text-[#8a5a1a]">Now</span>}
                {time}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-[15px] leading-snug text-[#3a3128] [overflow-wrap:anywhere]">{b.title.replace(/^./, (c) => c.toUpperCase())}</p>
                  {map && (
                    <a href={map} target="_blank" rel="noreferrer" aria-label={`${b.title} in Maps`}
                      className="-mt-2.5 -mb-2 shrink-0 inline-flex items-center min-h-[44px] px-1 text-sm text-[#514636] underline underline-offset-2">Maps ↗</a>
                  )}
                </div>
                {b.forWhom && <p className="text-sm text-[#514636] mt-0.5">{isFor(b, me) ? `Yours · ${b.forWhom}` : `For ${b.forWhom}`}</p>}
                {/* (round 13: a picture in her tab can name the group her table leaves out — quoted, never assigned) */}
                {noOwner.has(b.id) && !picGroup && <p className="text-xs text-[#6b5d4a] mt-0.5">No group named here — the group is split</p>}
                {picGroup && <p className="text-xs text-[#6b5d4a] mt-0.5">{noOwner.has(b.id) ? "No group named in this line — a" : "A"} picture in {v.her} tab lists it under “{picGroup}”{pictureYou(picGroup, v)}</p>}
                {differ.map((d) => <p key={d} className="text-[13px] text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1 mt-1">{differWordsFor(d, v)}</p>)}
                {(() => {
                  const dress = bookingDress(b, bookings);
                  return dress ? <p className={`text-[13px] rounded-md px-2 py-1 mt-1 ${dress.stricter ? "text-[#8a5a1a] bg-[#fff8ec]" : "text-[#514636] bg-[#f6f1e8]"}`}>
                    {dress.stricter ? `${v.Her} booking at ${dress.where} asks less: ` : `${v.Her} booking at ${dress.where}: `}“{dress.words}”
                  </p> : null;
                })()}
                {choices.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {choices.map((c) => {
                      const name = c.split(" — ")[0];
                      const text = `${b.title}: ${name}`;
                      const pick = picked.get(text);
                      return (
                        <li key={c} className="flex flex-wrap items-center gap-x-3">
                          <span className="text-sm text-[#3a3128]">{c}</span>
                          {pick
                            // The pick lives here, on her line — with a way back to "not decided", and
                            // (until it reaches everyone) honest that it's only on this phone so far
                            ? <>
                                <span className="text-sm text-[#3f5a2a]">
                                  {pick._pending ? "✓ Your pick · on this phone until there's signal" : `✓ The group's pick · ${pick.addedBy}, in Wander`}
                                </span>
                                {tapped === `undo:${text}`
                                  ? <span className="inline-flex items-center min-h-[44px] text-sm text-[#6b5d4a]" role="status">Taking it off…</span>
                                  : <button disabled={!!tapped} onClick={() => { setTapped(`undo:${text}`); onUndo(pick).finally(() => setTapped(null)); }}
                                      aria-label={`Undo the pick of ${name}`}
                                      className="min-h-[44px] text-sm text-[#6b5d4a] underline underline-offset-2 disabled:opacity-50">Undo</button>}
                                {tellName && !pick._pending && (
                                  <button onClick={() => onTell(pick)} className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Tell {tellName}</button>
                                )}
                              </>
                            : tapped === text
                            ? <span className="inline-flex items-center min-h-[44px] text-sm text-[#6b5d4a]" role="status">Saving…</span>
                            : <button disabled={!!tapped} onClick={() => { setTapped(text); onPick(text, b.time, b.title).finally(() => setTapped(null)); }}
                                className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2 disabled:opacity-50">
                                {pickedHere.length ? "Switch to this" : "We're going here"}
                              </button>}
                          <a href={choiceMapHref({ name }, b)} target="_blank" rel="noreferrer" aria-label={`${name} in Maps`}
                            className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Maps ↗</a>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {notes.length > 0 && (
                  shortNote || open[b.id]
                    ? <>
                        <GuideText text={noteText} className="text-sm text-[#6b5d4a] mt-1" />
                        {!shortNote && <button onClick={() => setOpen((o) => ({ ...o, [b.id]: false }))} className="-mb-2 min-h-[44px] text-sm text-[#514636]">Hide notes</button>}
                      </>
                    // (round 13: "Your notes ›" on Larisa's phone read as her private notes, not her Guide's)
                    : <button onClick={() => setOpen((o) => ({ ...o, [b.id]: true }))} className="-mb-2 min-h-[44px] text-sm text-[#514636]">Notes from {v.guide} ›</button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Larisa's note for a whole stay, from its heading: "Larisa's note for the Tokyo stay, Oct 13–17" */
function StopNote({ note, city, v }: { note: GuideItem; city: string | null; v: ReturnType<typeof voiceFor> }) {
  const from = note.windowStart || ymd(note.date);
  // Her sheet writes a stay check-in to check-out ("10/6–10/8"); the note is dated by its last night, so it shows on
  // each night's day (round 12: "the Okayama stay, Oct 6–7" read as wrong to Larisa)
  const to = note.date ? addDays(ymd(note.date), 1) : "";
  // Her travel notes on the stay's rows, in her words (round 13: "Nagoya -> Tokoname (~40 min) via Meitetsu" and "PT1:
  // Okayama -> Hakata…" were read but shown on no screen)
  const travel = (note.detail || "").split("\n").map((l) => l.match(/^Larisa's travel note: (.+)$/)?.[1]).filter(Boolean) as string[];
  return (
    <div className="text-sm text-[#514636] mb-3">
      <p><span className="text-[#6b5d4a]">{v.Owners} note for {city ? `the ${city} stay` : "this stay"}{from && to ? `, ${dateSpan(from, to)}` : ""}: </span>{note.title}</p>
      {travel.map((t) => <p key={t} className="mt-0.5"><span className="text-[#6b5d4a]">{v.Owners} travel note: </span>{t}</p>)}
    </div>
  );
}
import PhraseCard from "../components/PhraseCard";
import EveningQuestion from "../components/EveningQuestion";
import { getCityPastel, cityAccent, tripCountryOf } from "../lib/cityColors";
import CityArrival from "../components/CityArrival";
import { backWord } from "../lib/cameFrom";
import GuideText from "../components/GuideText";
import { guideOwnerOf, sendToGuideOwner, planMessage } from "../lib/tellGuideOwner";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const KIND_MARK: Record<string, string> = {
  flight: "✈︎", train: "🚄", travel: "🚐", meeting: "📍", tour: "🧭", meal: "🍽", checkin: "🛎", checkout: "🧳",
  // Her notes get a plain mark — a pencil read as "tap to edit" and did nothing (round 6)
  deadline: "⏰", plan: "•", note: "•",
};

interface DayChoice { id: string; date: string; time: string | null; text: string; addedBy: string; fromGuideIdea?: boolean; _pending?: boolean; _pickFor?: string }

const ymd = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The phone's own calendar date (not UTC) — what "today" means to the person holding it. */
function phoneToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

function longDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/** A day's title that fits one line even with large text: "Saturday, Oct 17" */
function titleDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Oct 13–17" / "Oct 30–Nov 2" */
function dateSpan(a: string, b: string) {
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
  if (a === b) return f(a, { month: "short", day: "numeric" });
  return a.slice(0, 7) === b.slice(0, 7) ? `${f(a, { month: "short", day: "numeric" })}–${f(b, { day: "numeric" })}` : `${f(a, { month: "short", day: "numeric" })}–${f(b, { month: "short", day: "numeric" })}`;
}

/** Short enough to sit beside the "Today" badge on a phone: "Wed, Oct 28" */
function shortDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

const ZONE_LABEL: Record<string, string> = { "America/Los_Angeles": "California time", "Asia/Tokyo": "Japan time" };

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function inWords(mins: number) {
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h} hr ${m} min` : `in ${h} hr`;
}

/**
 * now: the Now tab — today's day as the phone sees it (the first day before the trip, the last after),
 * with what's next at the top. Otherwise the day in the address (/day/2026-10-18).
 */
export default function DayPage({ now = false }: { now?: boolean }) {
  const { date: dateParam = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const me = user?.displayName || null;
  const [, setTick] = useState(0);
  const [data, setData] = useState<TripGuideData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unreachable">("loading");
  const [tripId, setTripId] = useState<string | null>(null);
  const [choices, setChoices] = useState<DayChoice[]>([]);
  const [choicesChecked, setChoicesChecked] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  // Other sources (Ken's rail sheet): trains, the pickup checklist, where it and her Guide differ
  const [otherSources, setOtherSources] = useState<OtherSource[]>([]);
  const [notesByTab, setNotesByTab] = useState<NotesByTab>({});
  const scrolledFor = useRef<string | null>(null);

  // Load (and reload when the signal comes back, so a saved copy doesn't linger)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let id = localStorage.getItem("wander:last-trip-id");
        if (!id) id = (await api.get<Trip | null>("/trips/active"))?.id || null;
        if (!id) { if (!cancelled) setState("unreachable"); return; }
        const d = await guideData(id);
        if (!cancelled) { setTripId(id); setData(d); setState("ready"); }
      } catch {
        if (!cancelled) setState((s) => (s === "ready" ? s : "unreachable"));
      }
    };
    load();
    window.addEventListener("online", load);
    return () => { cancelled = true; window.removeEventListener("online", load); };
  }, []);

  // Keep "today", "next" and passed deadlines current: every minute, and the moment the phone is
  // picked up again (left open overnight, it must not show yesterday as today)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    const onShow = () => { if (document.visibilityState === "visible") setTick((n) => n + 1); };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, []);

  const trip = data?.trip || null;
  const days = data?.days || [];
  const items = data?.items || [];
  const stays = data?.stays || [];
  const status = data?.status || null;
  const tripZone = trip?.timeZone || "Asia/Tokyo";
  const tripFirst = ymd(trip?.startDate);
  const last = ymd(trip?.endDate);
  const today = phoneToday();
  // The Now tab starts from YOUR first day: Julie, at home until Oct 13, isn't shown Ken & Larisa's Okayama
  const myParty = partyOf(items, me);
  const myStart = myParty
    ? items.filter((i) => i.date && i.forWhom === myParty && ["flight", "checkin"].includes(i.kind) && !isLanding(i)).map((i) => ymd(i.date)).sort()[0]
    : undefined;
  // …and from your first JAPAN date on the way: your flight's own date can be one you're still at home on in
  // Japan's calendar (round 8: Now told Julie "Here's your first day" on Japan's Oct 13, the others' day)
  let myJapanStart = myStart;
  for (let k = 0; myJapanStart && k < 3 && homeOnJapanDate(items, me, myJapanStart, tripZone); k++) myJapanStart = addDays(myJapanStart, 1);
  const first = now && myJapanStart && myJapanStart > tripFirst ? myJapanStart : tripFirst;
  // The day you leave home, for "You leave tomorrow" (a home date, not the Japan date you arrive on)
  // (always your own flight's day when her Guide has one — round 12: Ken & Larisa fly on the trip's first day, which
  // fell back to their first Japan day, so Now said "You leave tomorrow" on the morning they flew)
  const leaveDay = now && myStart ? myStart : first;
  // Both ends of the trip must be known before clamping — on a fresh load straight into Now, her items can
  // arrive before the trip's dates, and "after an empty last day" made the date blank (a crash)
  // A mangled day link (/day/now, a truncated paste) opens today rather than breaking the screen
  const validParam = /^\d{4}-\d{2}-\d{2}$/.test(dateParam || "") && !isNaN(Date.parse(`${dateParam}T00:00:00Z`)) ? dateParam : null;
  const date = !now ? (validParam || today) : !first || !last ? today : today < first ? first : today > last ? last : today;
  const beforeTrip = now && !!first && today < first;
  const afterTrip = now && !!last && today > last;
  const day = days.find((d) => ymd(d.date) === date);

  // Same-day plans added in Wander for this date
  useEffect(() => {
    if (!tripId || !date) return;
    let cancelled = false;
    // Plans saved with no signal wait on this phone — shown, marked as waiting, even after Wander was
    // closed and opened again (they used to vanish until the signal came back)
    const waiting = async (have: DayChoice[]) => {
      const queued = (await queuedBodies(`/day-choices/${tripId}`)).filter((q) => q.date === date && typeof q.text === "string");
      // Picks for the same line of her plan: only the last one queued counts (it replaces the others on arrival)
      const lastPick = new Map<string, unknown>();
      for (const q of queued) if (typeof q.pickFor === "string") lastPick.set(q.pickFor, q);
      return queued
        .filter((q) => typeof q.pickFor !== "string" || lastPick.get(q.pickFor as string) === q)
        .filter((q) => !have.some((c) => c.text === q.text))
        .map((q): DayChoice => ({ id: `pending-${q._at}`, date, time: (q.time as string | null) || null, text: q.text as string, addedBy: me || "You", _pending: true,
          _pickFor: typeof q.pickFor === "string" ? q.pickFor : undefined }));
    };
    // Once a queued pick has gone through, the "waiting for signal" words go too
    const settle = (w: DayChoice[]) => { if (!w.length) setNotice((n) => (n && n.startsWith("Saved on this phone") ? null : n)); };
    // On a slow signal the day starts from this phone's last copy of the group's plans (and says it's
    // checking), instead of looking as if nothing was planned
    const copyKey = `wander:day-plans:${tripId}:${date}`;
    const load = () => api.get<DayChoice[]>(`/day-choices/${tripId}?date=${date}`)
      .then(async (c) => {
        try { localStorage.setItem(copyKey, JSON.stringify(c)); } catch { /* full */ }
        const w = await waiting(c);
        if (!cancelled) {
          // A pick still waiting on this phone stands in for the one it will replace
          const pendingLines = w.filter((p) => p._pickFor).map((p) => `${p._pickFor}: `);
          setChoices([...c.filter((x) => !pendingLines.some((l) => x.text.startsWith(l))), ...w]);
          setChoicesChecked(true);
          settle(w);
        }
      })
      .catch(async () => { const w = await waiting([]); if (!cancelled) { setChoices((prev) => [...prev.filter((p) => !p._pending), ...w]); setChoicesChecked(true); } });
    let saved: DayChoice[] = [];
    try { saved = JSON.parse(localStorage.getItem(copyKey) || "[]"); } catch { /* unreadable */ }
    setChoices(saved);
    setChoicesChecked(false);
    load();
    window.addEventListener("wander:data-changed", load);
    return () => { cancelled = true; window.removeEventListener("wander:data-changed", load); };
  }, [tripId, date]);

  // The rail sheet (a saved copy when there's no signal); nothing shows if the trip has no other source
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    sourcesData(tripId).then((d) => { if (!cancelled) setOtherSources(d.sources); }).catch(() => { /* the Guide still shows */ });
    return () => { cancelled = true; };
  }, [tripId]);
  // Her other tabs' text — so "her Guide doesn't say" is only said when none of her tabs does
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    sheetNotes(tripId).then((n) => { if (!cancelled) setNotesByTab(n); });
    return () => { cancelled = true; };
  }, [tripId]);

  // The day in the order it's lived (lib/guideDisplay.ts). Deadlines appear on every day of their
  // window; Larisa's budget and bookkeeping notes sit apart from the plan.
  const { dayItems, planningNotes, stopNotes, planBlocks, forecast } = useMemo(() => {
    const onDay = withCheckoutWho(items.filter((i) => (i.kind === "deadline" ? deadlineOnDate(i, date) : ["stop", "block", "weather"].includes(i.kind) ? false : ymd(i.date) === date) && !isFragment(i)), date, stays, items);
    return {
      dayItems: sortDay(onDay.filter((i) => !isPlanningNote(i)), tripZone),
      planningNotes: onDay.filter(isPlanningNote),
      // Larisa's summary in the heading of the stop this day belongs to ("tour Karatsu, day trip to Arita")
      stopNotes: items.filter((i) => i.kind === "stop" && (i.windowStart || ymd(i.date)) <= date && date <= ymd(i.date)),
      // Her detailed plan for the day (a day tab), in HER order — "Morning" and "After dinner" have no clock
      planBlocks: items.filter((i) => i.kind === "block" && ymd(i.date) === date).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      // Her forecast for the stay this day is in
      forecast: items.find((i) => i.kind === "weather" && (i.windowStart || ymd(i.date)) <= date && date <= ymd(i.date)) || null,
    };
  }, [items, date, stays, tripZone]);
  // On a day with her detailed plan, her Itinerary tab's own untimed line for the day ("Kyoto day 2 - Viator
  // Tour?") goes in the plan's header as hers; everything else (bookings, deadlines, flights) follows the plan
  const { itineraryLines, otherItems } = useMemo(() => {
    if (!planBlocks.length) return { itineraryLines: [] as GuideItem[], otherItems: dayItems };
    // (never a "see above …" row — it points at her sheet's layout; round 9: Oct 25 led with "see above - 1/2 day")
    // (a line headed like her day — "day 8 - hike, brunch …" — even when read as a meal; round 13)
    const lines = dayItems.filter((i) => !i.time && /itinerary/i.test(i.source) && (["plan", "tour", "note"].includes(i.kind) || /^(\w+\s)?day\s*\d+\s*-/i.test(i.title)) && !besideHotel(i) && !/\binterested\?/i.test(i.title) && !/^see above\b/i.test(i.title));
    return { itineraryLines: lines, otherItems: dayItems.filter((i) => !lines.includes(i)) };
  }, [dayItems, planBlocks]);
  // What happens when, for "Next": the overview's lines and her detailed plan together
  // Next weighs her plan's times too — but never a line nobody's name is on while the group is split
  const timeline = useMemo(() => {
    const noOwner = ownerlessInSplit(planBlocks);
    return sortDay([...dayItems, ...planBlocks.filter((b) => b.time && !noOwner.has(b.id) && !dayItems.some((o) => saidAgain(b, o)))], tripZone);
  }, [dayItems, planBlocks, tripZone]);

  // What a pick of one of her choices is saved as ("Lunch: Omen") — such a plan belongs on her line, not
  // in "Added in Wander" too (round 7: lunch showed two or three times)
  const pickTexts = useMemo(() => new Set(planBlocks.flatMap((b) => choicesOf(b).map((o) => `${b.title}: ${o.name}`))), [planBlocks]);

  const night = useMemo(() => nightOf(date, stays, items), [date, stays, items]);
  const cityOf = (id?: string | null) => (id ? trip?.cities.find((c) => c.id === id)?.name ?? null : null);
  // The stay a stop note belongs to is named by the city of its first day
  const stopCity = (s: GuideItem) => days.find((d) => ymd(d.date) === (s.windowStart || ymd(s.date)))?.city?.name ?? null;
  const owner = guideOwnerOf(trip?.tagline);
  // How Wander speaks of the Guide to the person looking ("your Guide" to Larisa herself)
  const v = voiceFor(me, owner);
  const leaving = stays.filter((s) => ymd(s.checkOutDate) === date);
  const fromCity = leaving[0] ? trip?.cities.find((c) => c.id === leaving[0].cityId)?.name : null;
  const cityName = day?.city?.name || trip?.cities.find((c) => c.id === night.stays[0]?.stay.cityId)?.name || "";
  const route = fromCity && cityName && fromCity !== cityName ? `${fromCity} → ${cityName}` : cityName;
  const isToday = date === today;
  const hasPrev = !!first && date > first;
  const hasNext = !!last && date < last;

  // Opened from a line on Home: bring that line into view and mark it briefly
  useEffect(() => {
    if (state !== "ready") return;
    // "See Larisa's full plan" from Home: straight to her plan
    if (location.hash === "#plan") {
      if (scrolledFor.current === `${date}:plan`) return;
      scrolledFor.current = `${date}:plan`;
      requestAnimationFrame(() => document.getElementById("plan")?.scrollIntoView({ block: "start" }));
      return;
    }
    // A train line on Home: its trains (they arrive after the day itself — rail round: it landed at the top)
    if (location.hash === "#trains") {
      if (!otherSources.length || scrolledFor.current === `${date}:trains`) return;
      scrolledFor.current = `${date}:trains`;
      requestAnimationFrame(() => document.getElementById("trains")?.scrollIntoView({ block: "start" }));
      return;
    }
    const id = location.hash.startsWith("#item-") ? location.hash.slice(6) : null;
    if (!id || scrolledFor.current === `${date}:${id}`) return;
    scrolledFor.current = `${date}:${id}`;
    requestAnimationFrame(() => {
      document.getElementById(`item-${id}`)?.scrollIntoView({ block: "center" });
      setHighlight(id);
      setTimeout(() => setHighlight(null), 2500);
    });
  }, [state, location.hash, date, otherSources]);

  async function addChoice() {
    const text = draft.trim();
    if (!text || !tripId || saving) return;
    setSaving(true);
    const body = { date, text, time: draftTime || null };
    try {
      const created = await api.post<DayChoice & { _queued?: boolean }>(`/day-choices/${tripId}`, body);
      if ((created as { _queued?: boolean })._queued) {
        setChoices((c) => [...c, { id: `pending-${Date.now()}`, date, time: body.time, text, addedBy: me || "You", _pending: true }]);
        setNotice("Saved on this phone — I'll add it for everyone when you have signal.");
      } else {
        setChoices((c) => [...c, created]);
        setNotice(null);
      }
      setDraft(""); setDraftTime(""); setAdding(false);
    } catch {
      setNotice("That didn't save — try again?");
    } finally {
      setSaving(false);
    }
  }

  /** "We're going here": one of her choices, marked as the group's pick (a plan added in Wander) */
  // One step: the server replaces any other pick for this line of her plan ("pickFor"). Two steps (take off,
  // then add) left two picks for everyone after two changes of mind with no signal (round 6); queued picks
  // now replay in order and the last one wins.
  async function pickChoice(text: string, time: string | null, pickFor: string) {
    if (!tripId || saving) return;
    setSaving(true);
    const sameLine = (c: DayChoice) => c.text.startsWith(`${pickFor}: `) && c.text !== text;
    try {
      // A newer pick for the line replaces any still waiting on this phone — sent later, an older one
      // would undo this one
      await dropQueued(`/day-choices/${tripId}`, (b) => b.date === date && b.pickFor === pickFor);
      const created = await api.postRepeatable<DayChoice & { _queued?: boolean }>(`/day-choices/${tripId}`, { date, text, time, pickFor });
      if ((created as { _queued?: boolean })._queued) {
        setChoices((c) => [...c.filter((x) => !sameLine(x) && x.text !== text), { id: `pending-${Date.now()}`, date, time, text, addedBy: me || "You", _pending: true, _pickFor: pickFor }]);
        setNotice(navigator.onLine === false
          ? "Saved on this phone — I'll add it for everyone when you have signal."
          : "The signal's weak — saved on this phone, and I'll send it as soon as it gets through.");
      } else {
        setChoices((c) => [...c.filter((x) => !sameLine(x) && x.id !== created.id), created]);
        setNotice(null);
        // Home and Now (and any other open screen) show the pick too — even if the save landed after
        // this screen was left (round 7: Home kept the old pick)
        window.dispatchEvent(new CustomEvent("wander:data-changed"));
      }
    } catch {
      setNotice("That didn't save — try again?");
    } finally {
      setSaving(false);
    }
  }

  async function removeChoice(c: DayChoice) {
    if (!tripId) return;
    if (c._pending) {
      // Still on this phone: take it back before it's sent
      await dropQueued(`/day-choices/${tripId}`, (b) => b.date === date && b.text === c.text);
      setChoices((list) => list.filter((x) => x.id !== c.id));
      setConfirmRemove(null);
      setNotice((n) => (n && /saved on this phone/i.test(n) ? null : n));
      window.dispatchEvent(new CustomEvent("wander:data-changed"));
      return;
    }
    try {
      await api.delete(`/day-choices/${tripId}/${c.id}`);
      setChoices((list) => list.filter((x) => x.id !== c.id));
      setNotice(null);
      window.dispatchEvent(new CustomEvent("wander:data-changed"));
    } catch {
      setNotice(navigator.onLine === false ? "No signal — try taking it off again when you're back online." : "That didn't come off — try again?");
    }
    setConfirmRemove(null);
  }

  if (state === "loading") {
    return <div className="min-h-[100dvh] bg-[#faf8f5] flex items-center justify-center text-sm text-[#6b5d4a]">Opening {date ? longDate(date) : "the day"}…</div>;
  }

  if (state === "unreachable") {
    return (
      <div className="min-h-[100dvh] bg-[#faf8f5] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-base text-[#3a3128] mb-1">Wander can't reach the trip right now.</p>
        <p className="text-sm text-[#6b5d4a] mb-5">This phone hasn't saved this trip yet. It will open once you're back online.</p>
        <button onClick={() => window.location.reload()} className="min-h-[44px] px-5 rounded-xl bg-[#514636] text-white text-sm mb-2">Try again</button>
        <button onClick={() => navigate("/")} className="min-h-[44px] px-5 text-sm text-[#514636]">Back to the trip</button>
      </div>
    );
  }

  // Today (on Now and on today's day screen): a flight leaving Japan leads with when to leave for
  // the airport (Wander's estimate), then what's next — the Guide's or a plan added in Wander
  const myFlight = dayItems.find((i) => i.kind === "flight" && !isLanding(i) && i.time && isFor(i, me));
  // Her own plan for getting to the airport (the Haruka, a transfer) replaces Wander's estimate
  const herAirportPlan = planBlocks.some((b) => /haruka|airport|\bKIX\b|transfer/i.test(b.title));
  const leave = isToday && myFlight && !herAirportPlan ? leaveForAirport(myFlight, cityName) : null;
  const flightAt = myFlight?.time ? toMin(myFlight.time) : null;
  // Right now, on the clock each time is on: Japan's for her Guide's lines, a flight's own for a flight from home.
  // The phone's clock only matches when the phone is in Japan (round 11: at 1:00 AM in California, Julie's Now said
  // "Next · in 14 hr — 3:00 PM · Land at Narita", a landing due two hours earlier)
  const tripNow = nowMinutesOn(date, tripZone);
  const nowFor = (i: { timeZone?: string | null }) => (i.timeZone && i.timeZone !== tripZone ? nowMinutesOn(date, i.timeZone) : tripNow);
  const flightNow = myFlight ? nowFor(myFlight) : tripNow;
  // Where her plan puts you right now — a line with your name on it, or one for everybody outside a split
  const noOwner = ownerlessInSplit(planBlocks);
  const currentBlock = isToday ? currentPlanLine(planBlocks, tripNow, me) : undefined;
  const currentUnowned = isToday && !currentBlock ? currentUnownedLine(planBlocks, tripNow) : undefined;
  // The train you're on now (Ken's rail sheet, by its times): until it arrives, arriving is what's next — her lines timed
  // before then aren't "Next" (round 12: on the 1:30 PM HARUKA, Now said "Next · in 15 min · ~2:00–2:30 Arrive KIX", her
  // arrival for her own 12:30 departure)
  const railMin = (t: string) => (t ? toMin(t.padStart(5, "0")) : null);
  const riding = isToday ? otherSources.flatMap((s) => {
    const a = railAudience(items, s.owner);
    return s.rail.filter((r) => r.date === date && isBookedTrain(r) && legIsFor(r, s, me, a.ownerParty, a.groupSize))
      .map((r) => ({ dep: railMin(colOf(r.cols, /^depart/)), arr: railMin(colOf(r.cols, /^arrive/)) }));
  }).find((x) => x.dep !== null && x.arr !== null && x.arr > x.dep && x.dep < tripNow && tripNow < x.arr) : undefined;
  // Now, in the clock's order (delight audit: the 6:17 PM train card sat above "Next · in 10 min · landing", the landing
  // note and the pickup card stayed on top all evening, and the HARUKA that gets you to Shin-Osaka was nowhere):
  // your booked trains today (rail sheet) and the leg before the first one that has no booking (the airport train)
  const myLegs = isToday ? otherSources.flatMap((s) => {
    const a = railAudience(items, s.owner);
    return s.rail.filter((r) => r.date === date && legIsFor(r, s, me, a.ownerParty, a.groupSize)).map((r) => ({ s, r }));
  }) : [];
  const bookedDeps = myLegs.filter(({ r }) => isBookedTrain(r)).map(({ r }) => railMin(colOf(r.cols, /^depart/))).filter((m): m is number => m !== null).sort((a, b) => a - b);
  const firstBookedDep = bookedDeps[0] ?? null;
  const nextBookedDep = bookedDeps.find((m) => m >= tripNow) ?? null;
  const firstBookedRow = myLegs.find(({ r }) => isBookedTrain(r) && railMin(colOf(r.cols, /^depart/)) === firstBookedDep)?.r.row ?? null;
  const myLanding = (() => { const party = partyOf(items, me); return party ? dayItems.find((l) => isLanding(l) && l.forWhom === party && l.time) : undefined; })();
  const landedAt = myLanding?.time ? toMin(myLanding.time) : null;
  // The leg with no booking between landing and the first booked train (KIX → Shin-Osaka), shown as what's next then
  // …only until you're on your way: once a pickup step is ticked, or 90 minutes after landing (delight audit: "Next ·
  // After landing · Airport train" stayed on top through the pickup, until 6:05 PM)
  const pickupToday = myLegs.length ? otherSources.flatMap((s) => s.checklists.filter((c) => c.date === date).map((c) => ({ s, c }))) : [];
  const pickupStarted = pickupToday.some(({ s, c }) => pickupProgress(s.id, c).started);
  const legBeforeTrain = now && isToday && landedAt !== null && tripNow >= landedAt && tripNow < landedAt + 90 && !pickupStarted
    && firstBookedDep !== null && tripNow < firstBookedDep
    ? myLegs.find(({ r }) => !isBookedTrain(r) && firstBookedRow !== null && r.row < firstBookedRow) : undefined;
  // The last 20 minutes before your first train: the train leads Now, nothing else above it (delight audit: at 6:05,
  // twelve minutes out, it was the third card)
  const trainImminent = now && isToday && nextBookedDep !== null && nextBookedDep - tripNow <= 20 && nextBookedDep >= tripNow;
  // Before you've landed, the landing is what's next — the pickup card waits (delight audit: 2:00 PM, pickup above "Land
  // · in 50 min")
  const notLandedYet = landedAt !== null && tripNow < landedAt;
  // The pickup card is on Now right now (the sheet owner's couple, between landing and the first train)
  const pickupCardShown = !!now && isToday && pickupToday.some(({ s }) => { const p = railAudience(items, s.owner).ownerParty; return !!p && isFor({ forWhom: p }, me); })
    && !(firstBookedDep !== null && tripNow >= firstBookedDep) && !trainImminent && !notLandedYet && !legBeforeTrain;
  // A disagreement about a train is said until every time it names has passed (round 12: at 4 PM on Oct 29, at the
  // airport, "The sources differ — HARUKA 31 leaving 1:30 PM…" still led Now)
  const differLive = (d: RailDiffer) => {
    const times = [...`${d.railSays} ${d.guideSays}`.matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM)/gi)].map((m) => (Number(m[1]) % 12 + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2]));
    return !isToday || !times.length || tripNow <= Math.max(...times);
  };
  // …nor during the next booked train's ride (Oct 29 at 12:30: "Next · Arrive KIX" under "Next train · 1:30 PM" — that
  // arrival is the train's own)
  const nextRide = myLegs.map(({ r }) => ({ dep: railMin(colOf(r.cols, /^depart/)), arr: railMin(colOf(r.cols, /^arrive/)), booked: isBookedTrain(r) }))
    .filter((x) => x.booked && x.dep !== null && x.arr !== null && x.dep >= tripNow).sort((a, b) => a.dep! - b.dep!)[0];
  const upcomingGuide = isToday
    ? timeline.find((i) => i.time && !["deadline", "checkout", "checkin"].includes(i.kind) && isFor(i, me) && toMin(i.time) >= nowFor(i) && i !== currentBlock
      && !(riding && i.kind !== "flight" && toMin(i.time) < riding.arr!)
      && !(nextRide && i.kind !== "flight" && toMin(i.time) > nextRide.dep! && toMin(i.time) <= nextRide.arr!))
    : undefined;
  // Before noon, nothing under way: her untimed "Morning" line for you
  const morningNow = isToday && !currentBlock && !currentUnowned && tripNow < 12 * 60
    ? planBlocks.find((b) => !b.time && /^\s*(this\s+)?morning\b/i.test(b.timeText || "") && isFor(b, me) && !noOwner.has(b.id))
    : undefined;
  // A line nobody's name is on during a split, coming up before "Next" — said, never assigned (round 6:
  // "Next · in 2 hr 40 min: lunch" told Julie she was free while her Guide lists Maruni Toryo at 10:35)
  const unownedSoon = isToday
    ? planBlocks.find((b) => b !== currentUnowned && noOwner.has(b.id) && b.time && toMin(b.time) >= tripNow && (!upcomingGuide?.time || toMin(b.time) < toMin(upcomingGuide.time)))
    : undefined;
  const ownPlans = choices.filter((c) => !pickTexts.has(c.text));
  const upcomingChoice = isToday
    ? ownPlans.filter((c) => c.time && toMin(c.time) >= tripNow).sort((a, b) => a.time!.localeCompare(b.time!))[0]
    : undefined;
  const nextIsChoice = !!upcomingChoice && (!upcomingGuide || upcomingChoice.time! < upcomingGuide.time!);
  const upcoming = now ? upcomingGuide : undefined;
  // The train card leads Now only when it's the sooner thing (or you're on it); otherwise it follows her Next card
  // (delight audit: at 11:30 on Oct 29 "Next train · in 2 hr" sat above "Next · in 30 min · Residence transfer")
  const herNextMin = nextIsChoice && upcomingChoice?.time ? toMin(upcomingChoice.time) : upcoming?.time ? toMin(upcoming.time) : null;
  const trainFirst = !!riding || !!trainImminent || !!legBeforeTrain || herNextMin === null || (nextBookedDep !== null && nextBookedDep <= herNextMin);
  const myTonight = myNight(night, me);
  // "The hotel" in her plan: tonight's one stay for you, or unknown
  const tonightHotel = myTonight.stays.length === 1 ? stayMapsQuery(myTonight.stays[0].stay, cityOf(myTonight.stays[0].stay.cityId)) : null;
  const tomorrowFirst = now && isToday && !upcomingGuide && !upcomingChoice && date < last
    ? leadItem(sortDay(items.filter((i) => ymd(i.date) === addDays(date, 1) && !["deadline", "stop", "weather", "block"].includes(i.kind) && isFor(i, me) && !isPlanningNote(i) && !isFragment(i))))
    : null;

  return (
    <div className="min-h-[100dvh] bg-[#faf8f5] pb-32">
      {/* Header: where you are, how to get back, and the neighbouring days */}
      <header className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur border-b border-[#e0d8cc] px-2 top-bar pb-2">
        <div className="flex items-center gap-1">
          {now ? (
            // Quick Japanese phrases, up here — floating over the day they covered its cards
            <div className="min-w-[44px]"><PhraseCard inHeader /></div>
          ) : (
            <button
              // Step back to where they came from (Home, Ideas), so Back afterwards doesn't reopen this day
              onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/", { replace: true }))}
              // Named for where it goes ("‹ Home", "‹ Notes"…), as iPhone back buttons are — the day buttons beside it
              // name days, in their own bordered shape (map review rounds 4–6: a bare "Back" next to "‹ Sat" was
              // ambiguous; with no arrow at all it read as a title)
              aria-label={`Back to ${backWord(window.location.pathname, (window.history.state?.idx ?? 0) > 0)}`.replace("Back to Back", "Back")}
              className="min-h-[44px] min-w-[44px] px-2 text-[#514636] text-sm whitespace-nowrap">‹ {backWord(window.location.pathname, (window.history.state?.idx ?? 0) > 0)}</button>
          )}
          <div className="flex-1 text-center min-w-0">
            <h1 className="text-base font-medium text-[#3a3128] leading-snug" aria-label={`${longDate(date)}${isToday ? ", today" : ""}`}>
              {isToday ? shortDate(date) : titleDate(date)}
            </h1>
            {/* (Backroads is said once, in the day's own "With Backroads — day N of 8" note; "Today" sits here, not beside
                the date — the bar was cramped on a small phone; map review, Oct 1 2026) */}
            {/* the way there on a travel day ("Tokyo → Nikko"); on other days the city is in the band just below */}
            {(isToday || route !== cityName) && (
              <p className="text-xs text-[#6b5d4a] leading-snug">
                {isToday && <span className="font-semibold text-white bg-[#514636] rounded-full px-1.5 py-px mr-1">Today</span>}{route !== cityName ? route : ""}
              </p>
            )}
          </div>
          {/* Day to day replaces (Back returns to where you came from); from Now it's a step, so Back returns to Now */}
          {/* The neighbouring days by name ("‹ Thu", "Sat ›") — a bare "‹" beside "‹ Back" looked like the same
              button (map review, Oct 1 2026) */}
          <button onClick={() => hasPrev && navigate(`/day/${addDays(date, -1)}`, { replace: !now })} disabled={!hasPrev}
            aria-label="Previous day" className="min-h-[44px] min-w-[44px] pl-1 text-sm text-[#514636] disabled:opacity-25 whitespace-nowrap">
            <span className="inline-block rounded-full border border-[#c8bba8] bg-white px-3 py-1.5">‹ {weekdayOf(addDays(date, -1))}</span>
          </button>
          <button onClick={() => hasNext && navigate(`/day/${addDays(date, 1)}`, { replace: !now })} disabled={!hasNext}
            aria-label="Next day" className="min-h-[44px] min-w-[44px] pl-1.5 pr-2 text-sm text-[#514636] disabled:opacity-25 whitespace-nowrap">
            <span className="inline-block rounded-full border border-[#c8bba8] bg-white px-3 py-1.5">{weekdayOf(addDays(date, 1))} ›</span>
          </button>
        </div>
      </header>

      {/* The day in its city's color, the city's name large — the calendar's color, so a day feels like its place
          (charm item C3, Oct 1 2026) */}
      {cityName && (day || (first && date >= first && date <= last)) && (() => {
        const cityId = day?.cityId || night.stays[0]?.stay.cityId || "";
        const pastel = trip ? getCityPastel(trip.cities, cityId) : "#F2ECDE";
        return (
          <div className="pt-5 pb-4" style={{ backgroundColor: pastel, borderBottom: `3px solid ${cityAccent(pastel)}` }}>
            {/* The first time a day in this city opens on this phone: the city's photo, for a moment (C2) */}
            {(() => {
              const c = trip?.cities.find((x) => x.id === cityId);
              const away = !!c && (!c.country || c.country === tripCountryOf(trip!.cities));
              // Only when you've arrived — the day opened is today or past. Looking ahead from home used up the photo
              // (Julie, tester t1: Kyoto's photo on Oct 10 in California, then none on Oct 23 in Kyoto)
              // …and while you're in that city — not a week later looking back (tester t4: a photo missed with no
              // signal turned up when Karatsu's day was opened from Tokyo)
              const cityDates = days.filter((d) => d.cityId === cityId).map((d) => ymd(d.date)).sort();
              const inCityNow = cityDates.length > 0 && cityDates[0] <= today && today <= cityDates[cityDates.length - 1];
              return away && date <= today && inCityNow ? <CityArrival cityId={cityId} cityName={cityName} dateWords={longDate(date)} /> : null;
            })()}
            {/* Just the city: the date and the way here ("Tokyo → Nikko") are in the bar above, and Backroads in the
                day's note — said three times, they crowded the top of the screen (map review, Oct 1 2026) */}
            {/* (the same column as the day below it — on an iPad the name sat 16 px left of it; tester t5) */}
            <div className="max-w-xl mx-auto px-4">
              <p className="text-[32px] leading-tight font-light tracking-wide text-[#3a3128]">{cityName}</p>
            </div>
          </div>
        );
      })()}

      <main className="px-4 pt-4 max-w-xl mx-auto">
        {!day && (!first || date < first || date > last) ? (
          <p className="text-sm text-[#6b5d4a] mt-6 text-center">This date isn't part of the trip.</p>
        ) : (
          <>
            {data?.fromSavedCopy && (
              <p className="mb-3 text-sm text-[#6b5d4a] bg-white/70 border border-[#e0d8cc] rounded-lg px-3 py-2" role="status">
                No signal — showing what this phone saved{data.savedAt ? ` ${new Date(data.savedAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}.
              </p>
            )}
            {/* Now tab: before the trip, after it, or what's next today */}
            {/* The morning you fly: your flight first, on your clock (round 11: Julie's Now opened on Wednesday's
                Japan day with her noon SFO flight as its third card) */}
            {beforeTrip && leaveDay === today && (() => {
              const out = items.find((i) => i.kind === "flight" && !isLanding(i) && i.time && ymd(i.date) === today && isFor(i, me));
              if (!out) return null;
              const lands = (out.detail || "").match(/Lands at [^\n|]+/)?.[0]?.trim();
              // Past its take-off time on its own clock: by the schedule, in the air (round 11: at 6 PM the card
              // still read as a flight to catch, under "Should be in the air now" further down)
              const gone = nowMinutesOn(today, out.timeZone || tripZone) >= toMin(out.time!);
              return (
                <div className="mb-3 rounded-xl bg-[#514636] text-white p-4">
                  <p className="text-xs uppercase tracking-wide text-white/70">{gone ? "Today · your flight should be in the air" : "Today · your flight"}</p>
                  <p className="text-lg leading-snug mt-1">{gone ? "Take-off was due at " : ""}{clock(out.time)} {out.timeZone ? ZONE_LABEL[out.timeZone] || "" : ""} · {out.title}</p>
                  {lands && <p className="text-sm text-white/85 mt-1">{lands}</p>}
                  {out.confirmation && <p className="text-sm text-white/80">Confirmation {out.confirmation}</p>}
                  <p className="text-sm text-white/80 mt-1">{friendlySource(out.source, me)}</p>
                </div>
              );
            })()}
            {beforeTrip && (
              <p className="text-sm text-[#6b5d4a] mb-3">
                {/* After your take-off time, by the schedule (round 11: "You leave today" sat under "should be in the air") */}
                {first !== tripFirst && leaveDay === today && (() => {
                  const out = items.find((i) => i.kind === "flight" && !isLanding(i) && i.time && ymd(i.date) === today && isFor(i, me));
                  return !!out && nowMinutesOn(today, out.timeZone || tripZone) >= toMin(out.time!);
                })() ? "You should be on your way" : <>{first === tripFirst ? "The trip starts" : "You leave"} {(() => {
                  const n = Math.round((new Date(`${leaveDay}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
                  return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
                })()}</>}. Here's {first === tripFirst ? "the first day" : leaveDay !== first ? "your first day in Japan" : "your first day"}.
              </p>
            )}
            {afterTrip && <p className="text-sm text-[#6b5d4a] mb-3">Welcome home. Here's the last day of the trip.</p>}
            {/* Still at home on this Japan date: say so before anything else on it (round 8: Julie's "first day"
                showed the others' 8 PM Tokyo dinner as if it might be hers) */}
            {(() => {
              const out = homeOnJapanDate(items, me, date, tripZone);
              if (!out) return null;
              // After its take-off time, said by the schedule (round 11: at 6 PM it still said "takes off … 12:00 PM")
              const gone = nowMinutesOn(ymd(out.date), out.timeZone!) >= toMin(out.time!);
              // "the others' plan" only when the day has lines that aren't yours (round 12: Oct 5, nobody else's)
              const othersTail = dayItems.some((x) => x !== out && !isFor(x, me)) || planBlocks.length > 0 ? " The rest of this day is the others' plan." : "";
              return (
                <p className="text-sm text-[#3a3128] bg-white/70 border border-[#e0d8cc] rounded-lg px-3 py-2 mb-3">
                  {gone
                    ? <>On this Japan date you were still at home — your flight was due to take off {shortDate(ymd(out.date))}, {clock(out.time)} {ZONE_LABEL[out.timeZone!] || ""}.{othersTail}</>
                    : <>On this Japan date you're still at home — your flight takes off {shortDate(ymd(out.date))}, {clock(out.time)} {ZONE_LABEL[out.timeZone!] || ""}.{othersTail}</>}
                </p>
              );
            })()}
            {/* The day your flight lands: say when, first (round 9: Julie's landing day opened on Ken & Larisa's
                8:07 AM Mashiko train, and three testers asked "am I supposed to catch that?") */}
            {(() => {
              const party = partyOf(items, me);
              const land = party ? dayItems.find((l) => isLanding(l) && l.forWhom === party && l.time) : undefined;
              if (!land) return null;
              const airport = land.title.replace(/^Land at /i, "").split(" · ")[0];
              // Past its time, by the schedule only; and on a phone still on home time, that time on its clock too
              // (round 11: at 1:00 AM in California, "You land … 3:00 PM Japan time today" read as still ahead)
              const due = isToday && tripNow >= toMin(land.time!);
              // On Now, the landing is past news four hours later (delight audit: it led Now all evening) — not sooner:
              // immigration, bags and the bus or train from Narita take hours, and at 90 minutes the way to the hotel went
              // while Julie was still on her way (round 15)
              if (now && due && tripNow > toMin(land.time!) + 240) return null;
              // Only when the day has someone else's lines (round r1: Ken & Larisa's Oct 6 said "the others' plan" with
              // no one else in Japan)
              const others = dayItems.some((i) => i.forWhom && !/^everyone$/i.test(i.forWhom) && !isFor(i, me));
              const yours = phoneIsElsewhere(tripZone)
                ? ` (${zonedMoment(date, toMin(land.time!), tripZone).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).replace(",", "")} your time)`
                : "";
              return (
                <p className="text-sm text-[#3a3128] bg-white/70 border border-[#e0d8cc] rounded-lg px-3 py-2 mb-3">
                  {due
                    ? <>Your flight was due to land at {airport} at {clock(land.time)} {ZONE_LABEL[tripZone] || ""}{yours} — that's the schedule.{others ? " Anything earlier on this day is the others' plan." : ""}</>
                    : <>You land at {airport} at {clock(land.time)} {ZONE_LABEL[tripZone] || ""}{yours}{isToday ? " today" : ""}.{others ? " Anything earlier on this day is the others' plan." : ""}</>}
                  {/* How to get from the airport to the hotel, when her Guide says nothing about it — said plainly, with
                      where to ask (round 12: Julie landed at Narita with only a Maps link to the hotel's address) */}
                  {(() => {
                    const hotel = myTonight.stays[0]?.stay.name;
                    const saysHow = dayItems.some((x) => x !== land && isFor(x, me) && x.kind !== "flight"
                      && /\b(bus|limousine|narita express|n'?ex|haruka|skyliner|train|taxi|transfer|shuttle|car)\b/i.test(`${x.title} ${x.detail || ""}`))
                      // (only your own legs — Ken & Larisa's Mashiko trains hid Julie's line; round 12)
                      || otherSources.some((s) => { const a = railAudience(items, s.owner); return s.rail.some((r) => r.date === date && legIsFor(r, s, me, a.ownerParty, a.groupSize)); });
                    // Her own words about it from her other tabs, when she wrote any — quoted, with the tab; never "doesn't say"
                    // when a tab does (delight audit: her Hotel Options tab names the Limousine Bus and the Narita Express)
                    const ways = hotel ? airportWaysTo(notesByTab, hotel) : [];
                    return hotel && !saysHow
                      // …with a way to act on it: ask Scout in one tap, or open directions in Maps (delight audit: at Narita,
                      // jet-lagged, "Scout can look up the ways to go" wasn't a button and Maps only searched the hotel)
                      ? <span className="block mt-1">
                          {ways.length
                            ? <>Getting from {airport.replace(/\s*\([A-Z]{3}\)$/, "")} to {hotel} — {v.her} hotel notes say:
                                {ways.map((w) => <span key={w.text} className="block mt-0.5 text-[#514636]">“{w.text}” <span className="text-[#6b5d4a]">({v.her} “{w.tab}” tab)</span></span>)}</>
                            : <>{v.Her} Guide doesn't say how to get from {airport.replace(/\s*\([A-Z]{3}\)$/, "")} to {hotel}.</>}
                          <span className="flex flex-wrap gap-x-4 mt-1">
                            {navigator.onLine !== false
                              ? <button onClick={() => window.dispatchEvent(new CustomEvent("wander:ask-scout", { detail: { question: `How do I get from ${airport.replace(/\s*\([A-Z]{3}\)$/, "")} to ${hotel}?` } }))}
                                  className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Ask Scout the ways to go ›</button>
                              : <span className="inline-flex items-center min-h-[44px] text-sm text-[#6b5d4a]">Scout can answer once you have signal</span>}
                            <a href={`https://maps.apple.com/?saddr=${encodeURIComponent(airport.replace(/\s*\([A-Z]{3}\)$/, "") + " Airport, Japan")}&daddr=${encodeURIComponent(tonightHotel || hotel)}&dirflg=r`}
                              target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Directions in Maps ↗</a>
                          </span>
                        </span>
                      : null;
                  })()}
                </p>
              );
            })()}

            {/* Larisa's summary for the whole stay, from its heading — up top only on the stay's first
                day. On the other days (and on Now) it sits at the bottom, so "day trip to Mashiko" never
                reads as today's plan. */}
            {!now && stopNotes.filter((s) => (s.windowStart || ymd(s.date)) === date).map((s) => (
              <StopNote key={s.id} note={s} city={stopCity(s)} v={v} />
            ))}
            {/* Her open question in a stay's note, up top on each of its other days and on Now — only the question, in
                her words (round 12: Oct 7 led with "8:30 AM Okayama → Bizen" as settled; "WHERE IS BIZEN TOUR
                STARTING" was at the very bottom) */}
            {stopNotes.filter((s) => now || (s.windowStart || ymd(s.date)) !== date).flatMap((s) => openQuestionsIn(`${s.title}\n${s.detail || ""}`)
              // only on a day whose own lines mention what it's about ("Bizen" on Oct 7; "Kenji" on Oct 14, not all of Tokyo)
              // (and only lines that are yours — Ken & Larisa's Kenji question led Julie's landing day; round 12)
              .filter((q) => { const day = distinctWords(dayItems.filter((x) => isFor(x, me)).map((x) => `${x.title} ${x.detail || ""}`).join(" ")); return distinctWords(q).some((w) => day.includes(w)); })
              .map((q) => (
              <p key={`${s.id}-${q}`} className="text-sm text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1 mb-3">Still open in {v.her} Guide: “{q}”</p>
            )))}
            {/* Her forecast for this stay, in her numbers (the sheet gives no units) */}
            {forecast && (() => {
              // A small picture of her forecast, from her words only (charm item C5, Oct 1 2026): rain she expects
              // (any amount above zero, or rain in words) → a cloud with rain; otherwise sun and a cloud
              const t = forecast.title;
              const dry = /\brain\s*0(\.0+)?\s*(in|mm)?\s*(,|$)/i.test(t);
              const rainy = /\brain\b/i.test(t) && !dry;
              // (rain 0 in her words: a plain sun; nothing said about rain: sun and a cloud — tester t1)
              return (
                <p className="flex items-start gap-2 text-sm text-[#6b5d4a] mb-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-[-1px]" aria-hidden>
                    {rainy ? (
                      <>
                        <path d="M7 15a4 4 0 0 1 .4-8A5 5 0 0 1 17 8a3.5 3.5 0 0 1 0 7H7z" stroke="#7a8aa0" fill="#e8eef5" />
                        <path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2" stroke="#7a8aa0" />
                      </>
                    ) : dry ? (
                      <>
                        <circle cx="12" cy="12" r="4.5" stroke="#c9a14a" fill="#f6e7bf" />
                        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" stroke="#c9a14a" />
                      </>
                    ) : (
                      <>
                        <circle cx="9" cy="9" r="3.5" stroke="#c9a14a" fill="#f6e7bf" />
                        <path d="M9 2.5v1.5M9 14v1.5M2.5 9H4M14 9h1.5M4.4 4.4l1 1M12.6 12.6l1 1M4.4 13.6l1-1M12.6 5.4l1-1" stroke="#c9a14a" />
                        <path d="M11 19a3.5 3.5 0 0 1 .3-7 4.5 4.5 0 0 1 8.4 1.6A3 3 0 0 1 19.5 19H11z" stroke="#9aa3ad" fill="#f4f6f8" />
                      </>
                    )}
                  </svg>
                  {/* her words, without the column names doubling them ("lows low 60s" → "low 60s", "rain little rain" →
                      "little rain"; tester t1) */}
                  <span>{t.replace(/^Larisa's forecast:\s*/, `The weather ${v.guide} expects: `)
                    .replace(/\blows (low\b)/i, "$1").replace(/\bhighs (high\b)/i, "$1").replace(/\brain ((?:little|light|some|no|heavy) rain\b)/i, "$1")
                    // "rain 0" → "no rain"; a range never breaks across lines ("72-" / "76" — tester k1)
                    .replace(/\brain\s*0(\.0+)?\s*(in|mm)?\s*(?=,|$)/i, "no rain").replace(/(\d)-(\.?\d)/g, "$1‑$2")}</span>
                </p>
              );
            })()}

            {/* A ticket this phone didn't tick at the pickup, on the morning it travels — first, with where it can still be
                collected (delight audit) */}
            {now && isToday && (
              <TicketWarnings list={untickedTickets(otherSources, date, me, (s) => railAudience(items, s.owner).ownerParty,
                (r, s) => { const a = railAudience(items, s.owner); return legIsFor(r, s, me, a.ownerParty, a.groupSize); },
                (r) => tripClockMinutes({ time: colOf(r.cols, /^depart/).padStart(5, "0") } as GuideItem, tripZone) >= tripNow)} />
            )}
            {/* After landing, the leg with no booking that gets you to your first train (KIX → Shin-Osaka), as Now's next
                thing — before the pickup, which is at its end (delight audit: Home and Now jumped from the landing to the
                6:17 PM train) */}
            {legBeforeTrain && (() => {
              const c = legBeforeTrain.r.cols;
              // Its note's sentence about what to do ("Buy after immigration/bags"), not its first one ("HARUKA = …")
              const sentences = colOf(c, /^notes$/).split(/(?<=[.;])\s+/).filter(Boolean);
              const note = (sentences.find((x) => /\b(buy|after|take|walk|go)\b/i.test(x)) || sentences[0] || "").replace(/;$/, ".");
              // The one dark "Next" card while it's next; the pickup and the train are its "Then" lines (delight audit:
              // three cards each looked like what to do next, and the one labelled Next was the quietest)
              const pickup = pickupToday.find(({ s }) => s.id === legBeforeTrain.s.id);
              const train = myLegs.find(({ r }) => r.row === firstBookedRow)?.r;
              return (
                <div className="mb-3 rounded-xl bg-[#514636] text-white p-4">
                  <p className="text-xs uppercase tracking-wide text-white/70">Next · {colOf(c, /^target/) || "after landing"}</p>
                  {/* Its train by name when its notes give one ("HARUKA = JR West airport express") */}
                  <p className="text-lg leading-snug mt-1">{(() => { const n = colOf(c, /^notes$/).match(/^\s*([A-Z][A-Z0-9 -]{2,20}?)\s*=/)?.[1]; return n ? `${n} · ` : ""; })()}{colOf(c, /^route$/)}{colOf(c, /^mode$/) ? ` · ${colOf(c, /^mode$/)}` : ""}</p>
                  <p className="text-sm text-white/85 mt-1">No booking needed for this one{note ? ` — ${withTwelveHour(note)}` : "."}</p>
                  {pickup && (
                    <Link to={`/checklist/${encodeURIComponent(pickup.s.id)}/${encodeURIComponent(pickup.c.tab)}`} className="flex items-center min-h-[44px] mt-1 text-sm text-white underline underline-offset-2">
                      Then · {checklistTitle(pickup.c.tab)}: the steps ›
                    </Link>
                  )}
                  {train && <p className="text-sm text-white/85">Then · {twelveHour(colOf(train.cols, /^depart/))} {colOf(train.cols, /^train$/)} · {colOf(train.cols, /^route$/)}</p>}
                  <p className="text-xs text-white/70 mt-1">From {sourceWordsFor(legBeforeTrain.s, me)}</p>
                </div>
              );
            })()}
            {/* Ken's rail sheet: the pickup checklist on its day (Shin-Osaka, Oct 6), and on Now the next train */}
            {/* (the pickup is the sheet owner's couple's job — anyone else reaches its steps from the day's trains) */}
            {otherSources.flatMap((s) => {
              const { ownerParty } = railAudience(items, s.owner);
              if (!ownerParty || !isFor({ forWhom: ownerParty }, me)) return [];
              // On Now, the pickup goes once the train it comes before has left (delight audit: "Collect all six…" was
              // still the dark card at 7:30 PM, at the hotel)
              if (now && isToday && firstBookedDep !== null && tripNow >= firstBookedDep) return [];
              if (now && isToday && (trainImminent || notLandedYet || legBeforeTrain)) return [];
              return s.checklists.filter((c) => c.date === date).map((c) => <ChecklistCard key={`${s.id}-${c.tab}`} c={c} s={s} today={isToday} />);
            })}
            {now && isToday && trainFirst && !legBeforeTrain && (
              <NextTrain sources={otherSources} date={date} nowMinutes={tripNow} quiet={pickupCardShown && !riding && !trainImminent}
                isMine={(r, s) => { const a = railAudience(items, s.owner); return legIsFor(r, s, me, a.ownerParty, a.groupSize); }} />
            )}
            {/* Today, where the rail sheet and her Guide disagree is said up top, before either's "Next" (round r1: at
                12:10 on Oct 29 Now led with the Guide's 12:30 HARUKA and the difference was two screens down) */}
            {/* (on Now it's one line inside the train's card instead — delight audit) */}
            {isToday && !now && otherSources.flatMap((s) => s.differs.filter((d) => d.date === date && differLive(d)).map((d) => (
              <DifferNote key={`${s.id}-${d.row}-${d.guideSource}`} d={d} className="mb-3" />
            )))}
            {leave && flightAt !== null && flightNow < flightAt && (
              <div className={`mb-3 rounded-xl p-4 text-white ${flightNow > leave.minutes ? "bg-[#8a5a1a]" : "bg-[#514636]"}`}>
                <p className="text-xs uppercase tracking-wide text-white/70">
                  {flightNow > leave.minutes ? `Flight ${inWords(flightAt - flightNow)}` : `Leave ${inWords(leave.minutes - flightNow)}`}
                </p>
                <p className="text-lg leading-snug mt-1">
                  {flightNow > leave.minutes ? lateLeaveWords(leave, myFlight!, flightNow) : leave.text}
                </p>
                <p className="text-sm text-white/85 mt-1">{clock(myFlight!.time)} Japan time · {myFlight!.title}</p>
                {myFlight!.confirmation && <p className="text-sm text-white/80">Confirmation {myFlight!.confirmation}</p>}
                <p className="text-xs text-white/70 mt-2">{leave.why}</p>
              </div>
            )}

            {now && currentBlock && !(currentBlock.time && otherSources.some((s) => s.differs.some((d) => d.date === date && d.guideSays === (currentBlock.endTime ? `${twelveHour(currentBlock.time!)}–${twelveHour(currentBlock.endTime)}` : twelveHour(currentBlock.time!))))) && (
              <button onClick={() => document.getElementById(`item-${currentBlock.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                className="block w-full text-left mb-2 min-h-[44px] text-[15px] text-[#3a3128]">
                <span className="text-[#6b5d4a]">Now, in {v.owners} plan · </span>{currentBlock.title.replace(/^./, (c) => c.toUpperCase())}
                <span className="text-[#6b5d4a]">{currentBlock.endTime ? `, until ${/^~/.test(currentBlock.timeText || "") || (currentBlock.detail || "").includes("Times are Larisa's estimate.") ? "about " : ""}${clock(currentBlock.endTime)}` : planLineEndSaid(currentBlock, planBlocks) !== null ? `, until about ${minutesToClock(planLineEndSaid(currentBlock, planBlocks)!)}` : ""}</span>
                {tabsDiffer(currentBlock).map((d) => <span key={d} className="block text-sm text-[#8a5a1a] mt-0.5">{differWordsFor(d, v)}</span>)}
                {(() => {
                  const dress = bookingDress(currentBlock, dayItems.filter((m) => m.kind === "meal"));
                  return dress ? <span className={`block text-sm mt-0.5 ${dress.stricter ? "text-[#8a5a1a]" : "text-[#514636]"}`}>
                    {dress.stricter ? `${v.Her} booking at ${dress.where} asks less: ` : `${v.Her} booking at ${dress.where}: `}“{dress.words}”
                  </span> : null;
                })()}
              </button>
            )}
            {now && currentUnowned && (
              <p className="mb-2 text-[15px] text-[#3a3128]">
                <span className="text-[#6b5d4a]">Now, in {v.owners} plan · </span>{currentUnowned.title.replace(/^./, (c) => c.toUpperCase())}
                <span className="text-[#6b5d4a]">{currentUnowned.endTime ? `, until ${clock(currentUnowned.endTime)}` : planLineEndSaid(currentUnowned, planBlocks) !== null ? `, until about ${minutesToClock(planLineEndSaid(currentUnowned, planBlocks)!)}` : ""}</span>
                <span className="block text-sm text-[#8a5a1a]">{v.Her} Guide doesn't say which group this is for.</span>
              </p>
            )}
            {/* Her "Morning" line, this morning, before the next clock time (round 15: at 8:30 AM on Oct 25 Now's Next was
                "11:30 Concludes…"; "Morning — Backroads: Fushimi Inari + Tofuku-ji" was further down the plan) */}
            {now && morningNow && (
              <button onClick={() => document.getElementById(`item-${morningNow.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                className="block w-full text-left mb-2 min-h-[44px] text-[15px] text-[#3a3128]">
                <span className="text-[#6b5d4a]">This morning, in {v.owners} plan · </span>{morningNow.title.replace(/^./, (c) => c.toUpperCase())}
              </button>
            )}
            {/* During a split, a line nobody's name is on is never "yours" — but it isn't hidden either */}
            {/* …and when it comes first, it's what's next — shown as next, honestly, with who's elsewhere then (delight
                audit: on Oct 28 Next jumped to the 1:00 lunch; Maruni Toryo at 10:35 was only an amber aside) */}
            {now && unownedSoon && (() => {
              const elsewhere = planBlocks.find((b) => b.forWhom && !isFor(b, me) && b.time && toMin(b.time) <= toMin(unownedSoon.time!)
                && toMin(b.endTime || b.time) > toMin(unownedSoon.time!));
              return (
                <div className="mb-3 rounded-xl bg-[#514636] text-white p-4">
                  <p className="text-xs uppercase tracking-wide text-white/70">Next in {v.her} plan · {inWords(toMin(unownedSoon.time!) - tripNow)}</p>
                  <p className="text-lg leading-snug mt-1">{timeLabel(unownedSoon)} · {unownedSoon.title}</p>
                  <p className="text-sm text-white/85 mt-1">
                    {noGroupWords(unownedSoon, v)}{elsewhere ? `; ${elsewhere.forWhom} ${/&|and/.test(elsewhere.forWhom!) ? "are" : "is"} at ${elsewhere.title} then` : ""}.
                  </p>
                </div>
              );
            })()}
            {now && isToday && (nextIsChoice ? upcomingChoice : upcoming) && !(leave && !nextIsChoice && upcoming === myFlight) && (() => {
              if (nextIsChoice && upcomingChoice) {
                return (
                  <div className="mb-3 rounded-xl bg-[#514636] text-white p-4">
                    <p className="text-xs uppercase tracking-wide text-white/70">Next · {inWords(toMin(upcomingChoice.time!) - tripNow)}</p>
                    <p className="text-lg leading-snug mt-1">{clock(upcomingChoice.time)} · {upcomingChoice.text}</p>
                    <p className="text-sm text-white/80 mt-1">Added in Wander by {upcomingChoice.addedBy === me ? "you" : upcomingChoice.addedBy}</p>
                  </div>
                );
              }
              const u = upcoming!;
              // A line of her day plan: her own map link, or the place her words name; nothing for "Taxi north".
              // A booking: its name and her address. A line with choices: the group's pick, or that there's a choice.
              const opts = u.kind === "block" ? choicesOf(u) : [];
              const pick = opts.length ? choices.find((c) => opts.some((o) => c.text === `${u.title}: ${o.name}`)) : undefined;
              const pickOpt = pick ? opts.find((o) => pick.text === `${u.title}: ${o.name}`) : undefined;
              const mapHref = pickOpt ? choiceMapHref(pickOpt, u) : u.kind === "block" ? planMapHref(u, { hotel: tonightHotel, dayWords: itineraryLines.map((l) => l.title).join(" "), bookings: dayItems.filter((m) => m.kind === "meal") }) : (mapsQueryFor(u) ? mapsLink(mapsQueryFor(u)!) : null);
              // The same train Ken's rail sheet has at another time: the note up top already gives her time and every
              // source's, and the rail card has the countdown — no second "Next" (round 12: Oct 29 at 12:10 stacked
              // "Next train · in 1 hr 20 min" over "Next · in 20 min" and said the difference five times). Her line
              // stays in her plan below.
              const sameTrain = u.time ? otherSources.flatMap((s) => s.differs.filter((d) => d.date === date && d.guideSays === (u.endTime ? `${twelveHour(u.time!)}–${twelveHour(u.endTime)}` : twelveHour(u.time!)))) : [];
              if (sameTrain.length) return null;
              return (
                <div className={`mb-3 rounded-xl text-white ${unownedSoon ? "bg-[#7a6d5c] p-3" : "bg-[#514636] p-4"}`}>
                  <p className="text-xs uppercase tracking-wide text-white/70">{unownedSoon ? "Then" : "Next"} · {inWords(toMin(u.time!) - nowFor(u))}</p>
                  <p className="text-lg leading-snug mt-1">{u.kind === "block" ? timeLabel(u) : clock(u.time)} · {itemTitle(u, stays, date)}{pickOpt ? ` — ${pickOpt.name}` : ""}</p>
                  {/* Whose is what: her plan lists the places; the pick was made in Wander (round 7: "added in
                      Wander by Ken" then "From Larisa's plan" read as if the pick were hers) */}
                  {pick && pickOpt && (
                    <p className="text-sm text-white/85 mt-1">
                      {v.Her} plan lists {opts.length} places · {pick._pending ? `you picked ${pickOpt.name} (on this phone until there's signal)` : `${pick.addedBy} picked ${pickOpt.name} for the group, in Wander`}
                    </p>
                  )}
                  {opts.length > 0 && !pick && <p className="text-sm text-white/85 mt-1">{opts.length} places to choose from — see {v.her} plan below</p>}
                  {u.kind !== "flight" && tabsDiffer(u).map((d) => <p key={d} className="text-sm text-[#f3d9a8] mt-1">{differWordsFor(d, v)}</p>)}
                  {/* What you need for it — her own transit and dress notes, here and not behind a tap (round 13: Oct 17's
                      "Strict Formalwear Prep" card hid "jackets required for men… Ginza Line straight back" behind "Your notes ›") */}
                  {u.kind === "block" && (() => {
                    // (not her route's address — it's the day screen's route button; round 15: Now's Next card spelled out
                    // "Her whole route for the day: https://www.google.com/maps/dir/…" in six lines of text)
                    const own = (u.detail || "").split("\n").filter((l) => l && !/^(Choice: |Tabs differ: |Where: |Wander matched this plan|Times are |Her whole route for the day: )/.test(l) && !PICTURE_GROUP.test(l) && !/^For /.test(l))
                      .join("\n").replace(/\s+(Experience|Transit|Note):/g, "\n$1:").trim();
                    if (!own) return null;
                    // (cut at a sentence end where one comes late enough — "sneakers are not…" lost "permitted")
                    const cut = own.length > 360 ? own.slice(0, 360) : own;
                    const end = cut.length < own.length ? Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".)"), cut.lastIndexOf(")")) : -1;
                    const short = cut.length < own.length ? (end > 200 ? `${cut.slice(0, end + 1)} …` : `${cut.replace(/\s+\S*$/, "")}…`) : own;
                    return <p className="text-sm text-white/90 mt-1.5 whitespace-pre-line [overflow-wrap:anywhere]">{short}</p>;
                  })()}
                  {!pick && <p className="text-sm text-white/80 mt-1">{u.kind === "block" ? `From ${v.owners} plan for the day` : friendlySource(u.source, me)}</p>}
                  {u.confirmation && <p className="text-sm text-white/80 mt-1">Confirmation {u.confirmation}</p>}
                  {mapHref && (
                    <a href={mapHref} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] text-sm underline underline-offset-2">
                      Find in Maps ↗
                    </a>
                  )}
                </div>
              );
            })()}
            {/* Scout's evening question — after 6 PM on a trip day, once (Oct 1 2026) */}
            {now && isToday && <EveningQuestion tripId={tripId} className="mb-3" />}
            {/* The train, after her sooner Next */}
            {now && isToday && !trainFirst && (
              <NextTrain sources={otherSources} date={date} nowMinutes={tripNow} quiet
                isMine={(r, s) => { const a = railAudience(items, s.owner); return legIsFor(r, s, me, a.ownerParty, a.groupSize); }} />
            )}
            {now && isToday && !upcomingGuide && !upcomingChoice && !(leave && flightAt !== null && flightNow < flightAt) && (
              <div className="mb-3 rounded-xl bg-white border border-[#e0d8cc] p-3">
                {/* Nothing timed is left: where you're headed tonight (just landed? the hotel, with Maps) */}
                {myTonight.away[0] ? (
                  <p className="text-[15px] text-[#3a3128]"><span className="text-[#6b5d4a]">Tonight · </span>{myTonight.away[0].text}</p>
                ) : myTonight.stays.length === 1 ? (
                  <>
                    <p className="text-[15px] text-[#3a3128]">
                      <span className="text-[#6b5d4a]">Tonight · </span>{myTonight.stays[0].stay.name}
                      {ymd(myTonight.stays[0].stay.checkInDate) === date && myTonight.stays[0].stay.checkInTime ? ` — check in any time from ${/^\d{1,2}:\d{2}$/.test(myTonight.stays[0].stay.checkInTime) ? clock(myTonight.stays[0].stay.checkInTime) : myTonight.stays[0].stay.checkInTime}` : ""}
                    </p>
                    <a href={mapsLink(stayMapsQuery(myTonight.stays[0].stay, cityOf(myTonight.stays[0].stay.cityId)))}
                      className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Find in Maps ↗</a>
                  </>
                ) : myFlight && flightAt !== null && flightNow >= flightAt ? (() => {
                  // The flight has left: say so, and when it lands — and once it should have landed, say that (at
                  // 3 PM at home Now still said "Should be in the air" while Home said "Welcome home"; tester k1)
                  const landsAt = scheduledLanding(myFlight.detail, date.slice(0, 4));
                  const landed = !!landsAt && Date.now() > landsAt.getTime() + 30 * 60_000;
                  return (
                    <>
                      <p className="text-[15px] text-[#3a3128]"><span className="text-[#6b5d4a]">{landed ? "Should have landed · " : "Should be in the air · "}</span>{myFlight.title}</p>
                      {(myFlight.detail || "").match(/Lands at [^\n|]+/) && (
                        <p className="text-sm text-[#514636] mt-0.5">{(myFlight.detail || "").match(/Lands at [^\n|]+/)![0].trim()}</p>
                      )}
                      {date === last && <p className="text-sm text-[#514636] mt-1">{landed ? "Welcome home." : "Safe travels home."}</p>}
                    </>
                  );
                })() : (
                  <p className="text-sm text-[#6b5d4a]">Nothing more with a time today.</p>
                )}
                {tomorrowFirst && (
                  <button onClick={() => navigate(`/day/${addDays(date, 1)}`)} className="w-full text-left min-h-[44px] text-sm text-[#3a3128]">
                    <span className="text-[#6b5d4a]">Tomorrow · </span>
                    {/* its clock named when the phone isn't on it (round 11: "6:30 PM · Yakiniku" on a California phone) */}
                    {tomorrowFirst.time ? `${timeLabel(tomorrowFirst)}${tomorrowFirst.timeZone && tomorrowFirst.timeZone !== tripZone ? ` ${ZONE_LABEL[tomorrowFirst.timeZone] || ""}` : phoneIsElsewhere(tripZone) ? ` ${ZONE_LABEL[tripZone] || ""}` : ""} · ` : ""}{itemTitle(tomorrowFirst, stays, addDays(date, 1))}
                    {(() => {
                      // The night before flying: when to leave (Wander's estimate), same as Home says
                      if (tomorrowFirst.kind !== "flight" || isLanding(tomorrowFirst)) return null;
                      const l = leaveForAirport(tomorrowFirst, cityName);
                      return l ? ` — leave about ${minutesToClock(l.minutes)} (Wander's estimate)` : null;
                    })()} ›
                  </button>
                )}
              </div>
            )}

            {/* The day, in Larisa's words */}
            {day?.dayType === "guided" && (() => {
              // A Backroads day: the guides run it; the Guide lists only what's special
              const guided = days.filter((d) => d.dayType === "guided").map((d) => ymd(d.date)).sort();
              const n = guided.indexOf(date) + 1;
              return (
                // (a neutral card: green, it blurred into a green city band above it — map review, Oct 1 2026)
                <p className="text-sm text-[#3a3128] bg-white border border-[#e0d8cc] rounded-xl px-4 py-3 mb-3">
                  {/* "today" only on today (round 9: Oct 20, looked at on Oct 19, said "With Backroads today") */}
                  With Backroads{isToday ? " today" : ""}{n > 0 ? ` — day ${n} of ${guided.length}` : ""}. Their guides lead the day{dayItems.length ? `; here's what ${v.guide} adds.` : `, and ${v.guide} has nothing else for it.`}
                </p>
              );
            })()}
            {/* A day with her detailed plan: the plan leads (round 6 — "See Larisa's full plan" landed on a
                hotel's cancellation paragraph); her Itinerary line for the day sits in its header, as hers */}
            {planBlocks.length > 0 && (
              <PlanSection
                blocks={planBlocks} overview={itineraryLines} me={me} highlight={highlight} hotel={tonightHotel} bookings={dayItems.filter((m) => m.kind === "meal")}
                picked={new Map(choices.filter((c) => pickTexts.has(c.text)).map((c) => [c.text, c]))}
                onPick={(text, time, pickFor) => pickChoice(text, time, pickFor)}
                onUndo={removeChoice}
                tellName={owner && me !== owner ? owner : null}
                onTell={async (c) => {
                  // "we picked Omen for your "Lunch" line", not "Lunch: Omen"
                  const [line, ...rest] = c.text.split(": ");
                  setNotice(await sendToGuideOwner(owner!, planMessage(owner!, { ...c, text: `we picked ${rest.join(": ")} for your "${line}" line` }, me)));
                }}
                nowAt={isToday ? tripNow : null}
              />
            )}
            {planBlocks.length > 0 && otherItems.length > 0 && (
              <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">Also in {v.her} Guide for today</h2>
            )}
            {dayItems.length === 0 && choices.length === 0 && planBlocks.length === 0 ? (
              day?.dayType === "guided" ? null : (
                <p className="text-sm text-[#6b5d4a] bg-white rounded-xl border border-[#e0d8cc] p-4">
                  {cap(v.guide)} has nothing set for this day.
                </p>
              )
            ) : (
              <ol className="space-y-2">
                {(() => {
                  // One timeline (round 13: Oct 6 read "Osaka → Okayama… Rikuro Cheesecake… Shinkansen" above the 2:50 PM
                  // landing, and the booked 6:17 PM NOZOMI 77 sat at the bottom under Trains): your booked trains join the
                  // timed lines at their times — each opens its full card in Trains — and lines her Guide gives no time say so
                  const card = (i: GuideItem) => <ItemCard key={i.id} i={i} date={date} today={today} tripZone={tripZone} stays={stays} me={me} highlight={highlight === i.id} day={[...dayItems, ...planBlocks]} all={items} owner={owner} sources={otherSources} />;
                  // (not under "Also in her Guide for today" on a day with her detailed plan — a rail-sheet train isn't hers)
                  const trains = planBlocks.length ? [] : otherSources.flatMap((s) => {
                    const a = railAudience(items, s.owner);
                    return s.rail.filter((r) => r.date === date && isBookedTrain(r) && legIsFor(r, s, me, a.ownerParty, a.groupSize)).map((r) => ({ s, r }));
                  });
                  const dep = (r: RailRow) => tripClockMinutes({ time: colOf(r.cols, /^depart/).padStart(5, "0") } as GuideItem, tripZone);
                  const timedAt = otherItems.findIndex((i) => !!i.time);
                  const lead = timedAt > 0 ? otherItems.slice(0, timedAt).filter((i) => i.kind !== "checkout") : [];
                  const out: ReactNode[] = [];
                  let t = 0;
                  const sorted = [...trains].sort((a, b) => dep(a.r) - dep(b.r));
                  otherItems.forEach((i, n) => {
                    if (n === timedAt && lead.length) out.push(<li key="untimed-note" className="text-xs text-[#6b5d4a] -mt-1">The lines above have no time in {v.guide}; by the clock:</li>);
                    // (a check-out comes before the day's trains — round 13: Oct 8 read "10:26 AM NOZOMI 9" above "by 12:00
                    // PM Check out"; and the untimed evening lines after the timed ones wait until every train is said —
                    // Oct 14 put Ippudo Ramen above Ken & Larisa's 4:58 PM train back)
                    const eveningUntimed = !i.time && timedAt >= 0 && n > timedAt;
                    while (t < sorted.length && i.kind !== "checkout" && (eveningUntimed || (i.time && dep(sorted[t].r) < tripClockMinutes(i, tripZone)))) out.push(trainLine(sorted[t++]));
                    out.push(card(i));
                  });
                  while (t < sorted.length) out.push(trainLine(sorted[t++]));
                  return out;
                  function trainLine({ s, r }: { s: OtherSource; r: RailRow }) {
                    const arr = colOf(r.cols, /^arrive/);
                    return (
                      <li key={`train-${s.id}-${r.row}`} className="bg-white rounded-xl border border-[#e0d8cc]">
                        <a href="#trains" onClick={(e) => { e.preventDefault(); document.getElementById("trains")?.scrollIntoView({ block: "start" }); }}
                          className="flex gap-3 p-3 min-h-[44px]">
                          <span className="w-16 shrink-0 text-right text-sm font-medium text-[#3a3128] tabular-nums">{twelveHour(colOf(r.cols, /^depart/))}</span>
                          <span className="flex-1 min-w-0 text-[15px] leading-snug text-[#3a3128]">
                            {colOf(r.cols, /^train$/)} · {colOf(r.cols, /^route$/)}{arr ? ` · arrives ${twelveHour(arr)}` : ""}
                            <span className="block text-xs text-[#6b5d4a] mt-0.5">Booked · from {sourceWordsFor(s, me)} — seats and steps in Trains below ›</span>
                          </span>
                        </a>
                      </li>
                    );
                  }
                })()}
              </ol>
            )}

            {/* Same-day plans added in Wander — the group's own, beside the Guide */}
            <section className="mt-5">
              {!choicesChecked && <p className="text-sm text-[#6b5d4a] mb-2" role="status">Checking for plans added in Wander…</p>}
              {ownPlans.length > 0 && (
                <>
                  <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">Added in Wander</h2>
                  <ul className="space-y-2">
                    {/* In the order they'll happen: times first (2:30 before 3:00), then plans with no time */}
                    {[...ownPlans].sort((a, b) => (a.time ? 0 : 1) - (b.time ? 0 : 1) || (a.time || "").localeCompare(b.time || "")).map((c) => (
                      <li key={c.id} className="bg-white rounded-xl border border-[#e0d8cc] p-3">
                        <div className="flex gap-3">
                          <div className="w-16 shrink-0 text-right text-sm font-medium text-[#3a3128]">{c.time ? clock(c.time) : <span className="text-[#6b5d4a]" aria-hidden>✦</span>}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] leading-snug text-[#3a3128] [overflow-wrap:anywhere]">{c.text}</p>
                            <p className="text-xs text-[#6b5d4a] mt-1">
                              {c._pending
                                ? "Saved on this phone — waiting for signal"
                                : c.fromGuideIdea
                                  ? `Put on this day by ${c.addedBy} · one of ${owner || "Larisa"}'s ideas`
                                  : `Added by ${me && c.addedBy === me ? "you" : c.addedBy} · not in ${v.guide}`}
                            </p>
                            {confirmRemove === c.id ? (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm text-[#6b5d4a]">Take this off the day?</span>
                                <button onClick={() => removeChoice(c)} className="min-h-[44px] px-3 text-sm text-[#8a3a1a]">Take it off</button>
                                <button onClick={() => setConfirmRemove(null)} className="min-h-[44px] px-3 text-sm text-[#514636]">Keep</button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-x-4">
                                {owner && me !== owner && !c._pending && (
                                  <button
                                    onClick={async () => setNotice(await sendToGuideOwner(owner, planMessage(owner, c, me)))}
                                    className="min-h-[44px] text-sm text-[#514636]"
                                  >
                                    Tell {owner}
                                  </button>
                                )}
                                <button onClick={() => setConfirmRemove(c.id)} aria-label={`Take ${c.text} off this day`} className="min-h-[44px] text-sm text-[#6b5d4a]">Take off this day</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {adding ? (
                <div className="mt-3 bg-white rounded-xl border border-[#e0d8cc] p-3 scroll-mb-40"
                  ref={(el) => { if (el && !el.dataset.shown) { el.dataset.shown = "1"; requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" })); } }}>
                  <label className="block text-sm text-[#3a3128] mb-1" htmlFor="day-plan">What's the plan?</label>
                  <input
                    id="day-plan" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") addChoice(); }}
                    // (no names — a fixed "Ken and Andy" named Andy on days he's still at home; round 12)
                    placeholder="A walk by the river after dinner"
                    className="w-full min-h-[44px] px-3 rounded-lg border border-[#e0d8cc] text-[16px] text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-[#a89880]"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-sm text-[#6b5d4a]" htmlFor="day-plan-time">Time</label>
                    <input id="day-plan-time" type="time" value={draftTime} onChange={(e) => setDraftTime(e.target.value)}
                      className="min-h-[44px] px-2 rounded-lg border border-[#e0d8cc] text-[16px] text-[#3a3128]" />
                    <span className="text-xs text-[#6b5d4a]">optional</span>
                  </div>
                  <p className="text-xs text-[#6b5d4a] mt-2">Everyone on the trip sees it on this day. {cap(v.guide)} stays as it is.</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={addChoice} disabled={!draft.trim() || saving} className="min-h-[44px] px-4 rounded-lg bg-[#514636] text-white text-sm disabled:opacity-40">
                      {saving ? "Adding…" : "Add to this day"}
                    </button>
                    <button onClick={() => { setAdding(false); setDraft(""); setDraftTime(""); }} className="min-h-[44px] px-4 text-sm text-[#514636]">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAdding(true)} className="mt-3 min-h-[44px] text-sm text-[#514636] underline underline-offset-2">
                  + Add a plan for this day
                </button>
              )}
              {notice && <p className="text-sm text-[#6b5d4a] mt-2" role="status">{notice}</p>}
            </section>

            {/* The day's trains from Ken's rail sheet, apart from her Guide, with any disagreement said */}
            <TrainsForDay sources={otherSources} date={date} today={today} differsShownAbove={isToday}
              pickupBy={(s) => { const { ownerParty } = railAudience(items, s.owner); return ownerParty && !isFor({ forWhom: ownerParty }, me) ? ownerParty : null; }}
              isMine={(r, s) => { const a = railAudience(items, s.owner); return legIsFor(r, s, me, a.ownerParty, a.groupSize); }}
              theirsName={(s) => railAudience(items, s.owner).ownerParty} />

            {/* Where everyone sleeps tonight */}
            {date !== last && (
              <section className="mt-6">
                {/* "Tonight" only on today's screen (round 11: Julie's Now showed Wednesday's hotel as "Tonight" on Tuesday) */}
                <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">{isToday ? "Tonight" : `The night of ${shortDate(date)}`}</h2>
                {night.stays.length === 0 && night.away.length === 0 ? (
                  <p className="text-sm text-[#6b5d4a]">{cap(v.guide)} doesn't list a place to sleep {isToday ? "tonight" : "that night"}.</p>
                ) : (
                  <>
                    {night.stays.length > 1 && new Set(night.stays.map((s) => s.who || "all")).size < night.stays.length && (
                      <p className="text-sm text-[#8a5a1a] mb-2">The Guide lists more than one place for tonight — still being worked out.</p>
                    )}
                    <ul className="space-y-2">
                      {night.away.map((a) => (
                        <li key={`away-${a.who}`} className="bg-white rounded-xl border border-[#e0d8cc] p-3">
                          <p className="text-[15px] text-[#3a3128]">{a.text}</p>
                          <p className="text-xs text-[#514636] mt-1">{/^everyone$/i.test(a.who) ? "Everyone" : a.who}</p>
                        </li>
                      ))}
                      {night.stays.map(({ stay: s, who }) => (
                        <li key={s.id} className="bg-white rounded-xl border border-[#e0d8cc] p-3">
                          <p className="text-[15px] text-[#3a3128]">{s.name}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-[#514636]">
                            {who && <span>{/^everyone$/i.test(who) ? "Everyone" : who}</span>}
                            {ymd(s.checkInDate) === date && s.checkInTime && <span>Check in from {/^\d{1,2}:\d{2}$/.test(s.checkInTime) ? clock(s.checkInTime) : s.checkInTime}</span>}
                            {s.confirmationNumber && <span className="[overflow-wrap:anywhere]">Confirmation {confirmationWords(s.confirmationNumber)}</span>}
                          </div>
                          <a href={mapsLink(stayMapsQuery(s, cityOf(s.cityId)))} className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2 [overflow-wrap:anywhere]">
                            {s.address ? `${s.address} ↗` : "Find in Maps ↗"}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            {/* The rest of the stay's days (and Now): Larisa's note for the whole stay, as background */}
            {stopNotes.filter((s) => now || (s.windowStart || ymd(s.date)) !== date).map((s) => (
              <div key={s.id} className="mt-6"><StopNote note={s} city={stopCity(s)} v={v} /></div>
            ))}

            {/* Larisa's own bookkeeping for the day (budgets, placeholders) — kept, but apart from the plan */}
            {planningNotes.length > 0 && (
              <section className="mt-6">
                <button onClick={() => setShowNotes((v) => !v)} aria-expanded={showNotes} className="min-h-[44px] text-sm text-[#514636]">
                  {showNotes ? "Hide" : "Show"} {v.owners} planning notes ({planningNotes.length})
                </button>
                {showNotes && (
                  <ul className="space-y-1 mt-1">
                    {planningNotes.map((n) => (
                      <li key={n.id} className="text-sm text-[#6b5d4a]">
                        {n.title}{n.detail ? ` — ${n.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* How current this is */}
            {status?.current && (() => {
              const f = freshness(status.current.importedAt, new Date(), tripZone);
              return f && (
                <p className={`text-xs mt-8 text-center ${f.old ? "text-[#8a5a1a]" : "text-[#6b5d4a]"}`}>
                  {v.mine ? f.text.replace(/^Larisa's Guide/, "Your Guide") : f.text}.{f.old && !v.mine && " Larisa may have changed things since."}
                </p>
              );
            })()}
          </>
        )}
      </main>
    </div>
  );
}

/** One line of the Guide for this day. */
function ItemCard({ i, date, today, tripZone, stays, me, highlight, day, all, owner, sources }: {
  i: GuideItem; date: string; today: string; tripZone: string; stays: TripGuideData["stays"]; me: string | null; highlight: boolean; day: GuideItem[];
  /** The whole Guide: a landing says where its flight stands right now, by the schedule */
  all?: GuideItem[];
  /** Whose Guide it is ("Larisa") — never told to ask herself */
  owner?: string | null;
  /** Ken's rail sheet and any other source: what it already has for a place her Guide asks you about */
  sources?: OtherSource[];
}) {
  // To Larisa herself: "your Guide", "Your tabs differ", "Your travel note" (delight audit)
  const v = voiceFor(me, owner);
  // Checked out first on a morning with an earlier start: "Morning", and the hotel's own time below
  const earlyCheckout = checkoutBeforeFirst(i, day);
  const maybe = i.title.startsWith("Maybe:");
  const deadline = i.kind === "deadline";
  const over = deadline && deadlineOver(i, tripZone);
  // Whose clock a time is on: another zone's always; the trip's own when this phone is somewhere else (round 8:
  // Julie in California read "3:00 PM" for a Narita landing with no zone)
  const zone = i.timeZone && i.timeZone !== tripZone ? ZONE_LABEL[i.timeZone] || i.timeZone : phoneIsElsewhere(tripZone) ? ZONE_LABEL[tripZone] || null : null;
  // Her own links, each on its own; her own map link stands in for Wander's search (round 12: two Maps links, one card)
  const herLinks = linksIn(i.link);
  const q = herLinks.some((u) => linkLabel(u) === "Map") ? null : mapsQueryFor(i);
  const time = deadline ? deadlineTimeWords(i, tripZone) : null;
  // The detail already spells out the window; on the day itself, say it's open now
  const windowWords = deadline && i.windowStart && date === today && today < ymd(i.date) ? deadlineWhen(i, today) : null;
  // Check-out on a morning the Guide lists two places: each hotel's own time and code, never blended
  const bothLeaving = i.kind === "checkout" ? leavingOn(stays, date) : [];
  const split = bothLeaving.length > 1;
  const ownHotel = i.title.replace(/^Check out · /, "");
  const tone = over ? "bg-[#f4efe7] border-[#e0d8cc]" : deadline ? "bg-[#fff8ec] border-[#e8c98f]" : maybe ? "bg-white/60 border-dashed border-[#d6ccbc]" : "bg-white border-[#e0d8cc]";
  // Her quoted policy ("Worked out from: …") is the why, not the what — one tap away, not a wall of text
  const [showWhy, setShowWhy] = useState(false);
  // Someone else's line: whose it is up top, and their long notes folded (round 11: Ken & Larisa's 12-line Mashiko
  // train note filled Julie's Now, its "For Ken & Larisa" at the bottom, her own landing below the fold)
  const [showTheirs, setShowTheirs] = useState(false);
  const theirs = !!i.forWhom && !/^everyone$/i.test(i.forWhom) && !!me && !isFor(i, me);
  const differ = tabsDiffer(i);
  // A landing says where its flight stands by the clock; that line replaces the booking's "Takes off from …"
  const flightNow = all ? landingStatus(i, all, tripZone) : null;
  const allLines = (windowWords ? (i.detail || "").replace(/^Any day from [^\n]*\n?/, "") : (i.detail || "")).split("\n");
  const whyAt = allLines.findIndex((l) => l.startsWith("Worked out from:"));
  // Her travel note on a flight's row about the train to the airport, when the train's own line already quotes it whole
  // (round 12: Oct 29's flight card said "1:30-2:00p Haruka…" a third time beside the rail-sheet difference)
  const saidOnTrainLine = (l: string) => i.kind === "flight" && l.startsWith("Larisa's travel note: ")
    && (day || []).some((o) => o !== i && (o.detail || "").includes(l.slice("Larisa's travel note: ".length).trim()));
  const shown = allLines.filter((l, n) => l && !l.startsWith("Tabs differ: ") && !(flightNow && l.startsWith("Takes off from ")) && !saidOnTrainLine(l) && (whyAt < 0 || n < whyAt))
    // The name as Home says it ("Hana Sato", not the booking's "Sato, Hana")
    // (to the person it's booked under: "your name" — round 13: Larisa read her own full name there)
    .map((l) => (/^Booked under /.test(l) && bookedByName(i) ? (i.kind === "deadline" ? bookedWords(i, me)!
      : me && bookedByName(i)!.split(/\s+/)[0].toLowerCase() === me.trim().toLowerCase() ? "Booked under your name" : `Booked under ${bookedByName(i)}`) : l))
    // Her own notes, to her: "Your travel note: …"
    .map((l) => (v.mine ? l.replace(/^Larisa's (travel note|note|estimate)/, "Your $1") : l))
    // Lines Wander wrote about her Guide, in her voice to her ("the stop your tab lists"); her own words untouched
    .map((l) => (/^(Where:|Wander |Still open in the Guide|Times are)/.test(l) ? v.say(l) : l));
  const why = v.say(whyAt >= 0 ? allLines.slice(whyAt).join("\n") : "");
  // A to-do whose window closed: say plainly Wander can't know whether it was done
  const couldBeDone = over && /reconfirm|confirm|call|book|pay|send|submit|register/i.test(i.title);
  return (
    <li id={`item-${i.id}`} className={`rounded-xl border p-3 transition-shadow ${tone} ${highlight ? "ring-2 ring-[#c8a060] shadow-md" : ""}`}>
      <div className="flex gap-3">
        <div className="w-16 shrink-0 text-right">
          {i.time && !split ? (
            <>
              <div className="text-sm font-medium text-[#3a3128]">{timeLabel(i, day)}</div>
              {/* A travel line's second time is when you arrive (Okayama 8:30 → Bizen 9:30), not how long it lasts */}
              {i.endTime && i.kind !== "flight" && <div className="text-xs text-[#6b5d4a]">{["travel", "train"].includes(i.kind) ? "arrive" : "to"} {/end time is Larisa's estimate/i.test(i.detail || "") ? "about " : ""}{clock(i.endTime)}</div>}
              {zone && <div className="text-xs text-[#6b5d4a]">{zone}</div>}
            </>
          ) : (
            <div className="text-base text-[#6b5d4a]" aria-hidden>{KIND_MARK[i.kind] || "•"}</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[15px] leading-snug ${over ? "text-[#6b5d4a]" : maybe ? "text-[#6b5d4a] italic" : "text-[#3a3128]"}`}>
            {deadline && <span className="font-medium">{over ? "Passed · " : "Deadline · "}</span>}{landingTitle(i, me, itemTitle(i, stays, date))}
          </p>
          {theirs && <p className="text-xs text-[#514636] mt-0.5">For {i.forWhom}</p>}
          {/* Her Guide asking the person looking (round 12: "1 day to Mashiko-Julie interested?" shown to Julie, with
              nothing saying what to do about it) — Wander can't answer for her; the answer goes to Larisa */}
          {/* …with a way to answer: a message to her, already started (delight audit: tapping it did nothing) */}
          {askedOf(i, me, today) && (
            <div className="mt-0.5">
              <p className="text-sm text-[#8a5a1a]">A question for you in {owner ? `${owner}'s` : "her"} Guide.</p>
              {/* (under the question itself only — round 13: it repeated under "Maybe: Mashiko") */}
              {(() => { const n = sources?.length && /\?/.test(i.title) ? railNoteFor(i.title, sources, me) : null; return n ? <p className="text-sm text-[#514636] mt-0.5">{n}</p> : null; })()}
              <button onClick={() => sendToGuideOwner(owner || "Larisa", `Hi ${owner || "Larisa"} — about “${i.title}” in your Guide: `)}
                className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Tell {owner || "her"} your answer ›</button>
            </div>
          )}
          {deadline && (over || windowWords || time) && (
            <p className="text-sm text-[#8a5a1a] mt-1">
              {/* A free-cancellation window that closed asks nothing of anyone — said so (delight audit: Julie read "Ended"
                  beside "Until 11:59 PM Japan time" and wondered what she'd missed) */}
              {over && /free cancel|cancel(lation)? free|last day to cancel/i.test(i.title) && !/reconfirm/i.test(i.title)
                ? "Free cancellation has ended. Nothing to do — it stays booked."
                : over ? `Ended ${time || ""}`.trim() + "." : [windowWords, time].filter(Boolean).join(" · ")}
              {!over && isFreeCancel(i) && ` ${FREE_CANCEL_WORDS}`}
              {/* Never tell Larisa to ask Larisa (round 9) */}
              {couldBeDone && (owner && me && owner.toLowerCase() !== me.toLowerCase() ? ` Wander can't tell whether it was done — ask ${owner} if you're not sure.` : " Wander can't tell whether it was done.")}
            </p>
          )}
          {/* Not on a flight's card: its "tabs differ" comes from her travel note about the train to the airport, and
              made the flight's own time look disputed (round 12) — the train's line carries it */}
          {i.kind !== "flight" && differ.map((d) => <p key={d} className="text-sm text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1 mt-1">{differWordsFor(d, v)}</p>)}
          {split && (
            <ul className="text-sm text-[#3a3128] mt-1 space-y-0.5">
              {bothLeaving.map((s) => {
                const mine = ownHotel.toLowerCase().includes(s.name.toLowerCase().split(" ")[0]);
                return (
                  <li key={s.id}>
                    {s.name}: {mine && i.time ? `by ${clock(i.time)}` : "no check-out time in the Guide"}
                    {mine && i.confirmation ? ` · confirmation ${i.confirmation}` : ""}
                  </li>
                );
              })}
            </ul>
          )}
          {earlyCheckout && !split && <p className="text-sm text-[#6b5d4a] mt-1">The hotel's check-out time is {clock(i.time)}.</p>}
          {checkinAfterLanding(i, day) && <p className="text-sm text-[#6b5d4a] mt-1">Rooms are ready from {clock(i.time)}.</p>}
          {/* Only a booked meal (a place or a confirmation) is missing a time; "Dinner on our own" isn't */}
          {i.kind === "meal" && !i.time && (i.confirmation || i.place) && <p className="text-sm text-[#6b5d4a] mt-1">No time in the Guide.</p>}
          {/* The window was just said above ("Any day through Wed, Oct 14") — not twice */}
          {shown.length > 0 && (theirs && shown.length > 2 && !showTheirs
            ? <button onClick={() => setShowTheirs(true)} className="min-h-[44px] text-sm text-[#514636]">Their notes ({shown.length} lines) ›</button>
            : <>
                {/* Wander's own phrasings said to Larisa as "your …" (round 13: on her phone, "The end time is Larisa's
                    estimate", "her Itinerary line this day says…"); her cell text is never touched */}
                <GuideText text={shown.map((l) => (/^(The end time is |For .+: her Itinerary line |Beside .+ in her Itinerary|Time from the |A picture in her tab )/.test(l) ? v.say(l) : l)).join("\n")} className="text-sm text-[#6b5d4a] mt-1" />
                {theirs && shown.length > 2 && <button onClick={() => setShowTheirs(false)} className="min-h-[44px] text-sm text-[#514636]">Hide their notes ‹</button>}
              </>)}
          {flightNow && <p className="text-sm text-[#514636] mt-1">{flightNow}</p>}
          {(() => { const inJapan = departureInTripZone(i, tripZone); return inJapan ? <p className="text-sm text-[#514636] mt-1">{inJapan}</p> : null; })()}
          {why && (showWhy
            ? <GuideText text={why} className="text-sm text-[#6b5d4a] mt-1" />
            : <button onClick={() => setShowWhy(true)} className="min-h-[44px] text-sm text-[#514636]">Why this date? ›</button>)}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
            {i.forWhom && !theirs && <span className="text-[#514636]">{/^everyone$/i.test(i.forWhom) ? "Everyone" : isFor(i, me) ? `Yours · ${i.forWhom}` : `For ${i.forWhom}`}</span>}
            {i.confirmation && !split && <span className="text-[#514636] [overflow-wrap:anywhere]">Confirmation {confirmationWords(i.confirmation)}</span>}
          </div>
          {/* Side by side with room between them (delight audit: "Find in Maps ↗Michelin page ↗" ran together, 0 px apart) */}
          {(q || herLinks.length > 0) && (
            <div className="flex flex-wrap gap-x-5">
              {q && (
                <a href={mapsLink(q)} className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2 [overflow-wrap:anywhere]">
                  {i.place ? `${i.place} ↗` : "Find in Maps ↗"}
                </a>
              )}
              {herLinks.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] min-w-[44px] text-sm text-[#514636] underline underline-offset-2">{linkLabel(u)} ↗</a>
              ))}
            </div>
          )}
          <p className="text-xs text-[#6b5d4a] mt-1">{friendlySource(i.source, me)}</p>
        </div>
      </div>
    </li>
  );
}
