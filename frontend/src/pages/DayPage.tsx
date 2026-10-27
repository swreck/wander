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

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  checkoutBeforeFirst, leaveBeforeCheckout, checkinAfterLanding, leadItem, withCheckoutWho, minutesToClock, lateLeaveWords,
  ownerlessInSplit, tabsDiffer, linkLabel, currentPlanLine, planLineEnd, planLineEndSaid, saidAgain, sameThing, currentUnownedLine, mealUnderWay, outvoted, namesMe, notLandedYet as beforeMyLanding, linksIn, besideHotel, voiceFor, tabLabel,
  landingStatus, phoneIsElsewhere, homeOnJapanDate, departureInTripZone, landingTitle,
  nowMinutesOn, zonedMoment, scheduledLanding, bookedByName, bookedWords, askedOf, distinctWords, openQuestionsIn,
  noGroupWords, pictureGroupOf, pictureYou, PICTURE_GROUP, tripClockMinutes, confirmationWords, isFreeCancel, FREE_CANCEL_WORDS, differWordsFor,
  samePerson, travelerToday, askedParts, othersPartysJob, startsSomething, inHerVoice, speaksAsHer, arrivedForTonight, getsYouTo,
  withoutDone,
} from "../lib/guideDisplay";
import { sourcesData, savedSources, railAudience, legIsFor, twelveHour, isBookedTrain, colOf, withTwelveHour, sourceWordsFor, pickupProgress, untickedTickets, railNoteFor, dateInText, readWords, isSettledStatus, type OtherSource, type RailDiffer, type RailRow } from "../lib/sources";
import { TrainsForDay, ChecklistCard, NextTrain, DifferNote, checklistTitle, TicketWarnings, RailLeg } from "../components/RailSheet";
import SheetSpots from "../components/SheetSpots";
import SendOut, { dayText, bookingText } from "../components/SendOut";
import { directionsHref } from "../lib/directions";
import { appleGuides, savedAppleGuides, type GuidesByDay } from "../lib/appleGuides";
import { guidePictures, savedGuidePictures, type GuidePicture } from "../lib/guidePictures";
import { dayPanels, savedDayPanels, type PanelsByDay, type DayPanel } from "../lib/dayPanels";
import { hoursWords } from "../lib/placeHours";
import { sunsetMinutes } from "../lib/sun";
import { savedDayForecast, dayForecastFor } from "../lib/forecast";
import DayPhotos from "../components/DayPhotos";
import { photosOf, savedPhotos, PHOTOS_CHANGED, type TripPhoto } from "../lib/tripPhotos";
import { daySummaries, savedDaySummaries } from "../lib/daySummaries";
import { sheetLinks, savedSheetLinks, type SheetLinks } from "../lib/sheetLinks";
import PictureViewer from "../components/PictureViewer";
import AboutPlaceButton, { useLineAbout } from "../components/PlaceAbout";
import { aboutLines, lineKey } from "../lib/placeAbout";
import { sheetNotes, savedSheetNotes, airportWaysTo, type NotesByTab } from "../lib/sheetNotes";
import { choicesOf, planMapHref, areaOf, TRAVEL, useLinePhotos, photoLineOf, photoQueryOf } from "../lib/linePlaces";

/** How long a first open waits for the rest of the day (rail sheet, summaries…) after her Guide, when the phone has no
 *  copy of them yet — they're asked for together, so on a normal signal they come with the Guide and this is never hit */
const EXTRAS_WAIT_MS = 4000;
/** …and the most a day waits for its city's first-time photo, so it comes with the day rather than over it */
const PHOTO_GRACE_MS = 400;

/** A spreadsheet time ("18:00:00") as a person reads it; her own words ("~8:30–9:15", "Morning") as written */
function planTime(b: GuideItem): string {
  const t = (b.timeText || "").trim();
  // A spreadsheet clock cell ("07:45:00", "07:45") — not her own words like "9:15–10:30"
  const hms = t.match(/^(\d{1,2}):(\d{2})(:00)?$/);
  if (hms && (hms[3] || hms[1].length === 2)) return clock(`${hms[1].padStart(2, "0")}:${hms[2]}`);
  if (t) return t;
  return b.time ? clock(b.time) : "";
}

/**
 * What a deadline whose time has passed means now — the same words on its short line and when opened (Oct 10 re-audit:
 * the short line on Next and the day said "Started · … charges start" over "Ended", contradicting itself about money).
 * A closed free-cancellation window asks nothing of anyone (delight audit: Julie read "Ended" and wondered what she'd
 * missed); charges that started are in effect, not over.
 */
function passedWords(i: GuideItem, time: string | null | undefined): string {
  if (/free cancel|cancel(lation)? free|last day to cancel/i.test(i.title) && !/reconfirm/i.test(i.title)) return "Free cancellation has ended. Nothing to do — it stays booked.";
  if (startsSomething(i)) return "These charges apply now. Nothing to do — it stays booked.";
  return `Ended ${time || ""}`.trim() + ".";
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
/** One of her pictures, opened full screen on a tap (the picture is fetched only then) */
function DayPicture({ tripId, picture, her, tab }: { tripId: string; picture: GuidePicture; her: string; tab: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "opening" | "failed">("idle");
  const isMap = /\bmap\b/i.test(picture.summary);
  return (
    <>
      <button
        onClick={async () => {
          setState("opening");
          try {
            // (never one with people's own travel numbers — guidePictures leaves those out; a link refused is a miss)
            const r = await api.get<{ url: string | null }>(`/guide/picture-link/${tripId}/${picture.sha256}`);
            if (r.url) { setUrl(r.url); setState("idle"); } else setState("failed");
          }
          catch { setState("failed"); }
        }}
        disabled={state === "opening"}
        className="flex w-fit items-center gap-1.5 min-h-[44px] mt-1 px-3 rounded-xl bg-white border border-[#e0d8cc] text-sm text-[#514636] disabled:opacity-60"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 17l-5-5-9 8" />
        </svg>
        {state === "opening" ? "Opening…" : state === "failed" ? "Couldn't open it — try again?" : isMap ? `See ${her} map from this tab` : `See ${her} picture from this tab`}
      </button>
      {url && <PictureViewer src={url} alt={`${picture.summary || `The picture in ${her} ${tab} tab`}`} onClose={() => setUrl(null)} />}
    </>
  );
}

/**
 * Her illustrated map's panel for this day, at the top of the day ("Wander in pictures" idea 3, Oct 15 2026): her own art
 * for the day, whole (a tall panel is shown entire over a soft blur of itself, at most 340 pt, so the day below still
 * starts on the first screen). Its box has its height from the first frame — nothing below moves when it loads. A tap
 * opens her whole map, every day of it, to pinch and zoom.
 */
const COUNT_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
// (Her: "Larisa's" — "Your" for Larisa herself)
function DayPanelCard({ tripId, panel, days, Her }: { tripId: string; panel: DayPanel; days: number; Her: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "opening" | "failed">("idle");
  const [noSignal, setNoSignal] = useState(false);
  const open = async () => {
    setState("opening");
    try {
      const r = await api.get<{ url: string | null }>(`/guide/picture-link/${tripId}/${panel.of}`);
      if (r.url) { setUrl(r.url); setState("idle"); } else setState("failed");
    } catch { setState("failed"); }
  };
  return (
    <section aria-label={`${Her} map of the day`} className="mb-4">
      <button type="button" onClick={open} disabled={state === "opening"} aria-label={`${Her} map of this day. Open the whole map`}
        className="relative block w-full rounded-xl overflow-hidden border border-[#e0d8cc] bg-[#efe8dc]"
        style={{ height: `min(340px, calc((min(100vw, 576px) - 32px) * ${(panel.h / panel.w).toFixed(4)}))` }}>
        {noSignal ? <span className="absolute inset-0 flex items-center justify-center text-xs text-[#6b5d4a]">{Her} map needs signal</span> : (
          <>
            <img src={panel.url} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-50" />
            <img src={panel.url} alt="" onError={() => setNoSignal(true)} className="relative w-full h-full object-contain" />
          </>
        )}
      </button>
      <p className="text-xs text-[#6b5d4a] mt-1.5">
        {state === "opening" ? "Opening the whole map…" : state === "failed" ? "The whole map couldn't open — tap to try again." : `${Her} map · tap to see ${days > 1 ? `all ${COUNT_WORDS[days] || days} days` : "the whole map"}`}
      </p>
      {url && <PictureViewer src={url} alt={`${Her} illustrated map`} onClose={() => setUrl(null)} />}
    </section>
  );
}

/** A line of her note for a moment in "Play the day": her "Experience:" when she wrote one, else her first line — short */
function momentNote(lines: string[]): string | null {
  // (her "○ Transit: … ○ Experience: …" is often one line — the Experience part, wherever it sits, and only to the end of
  // its own line: tourist63, dinner's ran on into the next line, Ken's Oct 14 address note)
  const exp = lines.map((l) => l.replace(/\s+/g, " ").match(/Experience:\s*(.+?)(?=\s*[○•]?\s*(?:Transit|Note|Where):|$)/i)?.[1]).find(Boolean);
  const plain = lines.map((l) => l.replace(/^[\s○•-]+/, "")).find((l) => l && !/^(Transit|Where|Note|Experience):/i.test(l));
  const t = (exp || plain || "").replace(/^[\s○•-]+|[\s○•-]+$/g, "").trim();
  if (!t) return null;
  return t.length <= 170 ? t : `${t.slice(0, 165).replace(/\s+\S*$/, "")}…`;
}

/** A stop's photo under its name: the place itself, a tap for more of it (the day as moments, Oct 15) */
function MomentPhoto({ hit, title, onOpen }: { hit: PlaceHit; title: string; onOpen: () => void }) {
  // (no signal for a photo not already on the phone: its space stays, quietly — never a broken-picture mark
  // (tourist63), and never a fold that moves the day (tourist64: 0.127 when the boxes folded away))
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="mt-2 rounded-lg bg-[#efe8dc] aspect-[16/9] flex items-center justify-center text-xs text-[#6b5d4a]">Photo needs signal</div>;
  const credit = hit.photos[0]?.credit;
  return (
    <button type="button" onClick={onOpen} aria-label={`Photos of ${hit.name || title}`} className="relative block w-full mt-2 rounded-lg overflow-hidden bg-[#efe8dc] aspect-[16/9]">
      <img src={placePhotoUrl(hit, 0, true)} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
      <span className="absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-black/45 to-transparent" aria-hidden />
      {/* (the photographer, on the photo, as Google asks — tourist63: the list's photos had no credit) */}
      {credit && <span className="absolute left-2 bottom-1.5 max-w-[70%] truncate text-[10px] text-white/85">Photo: {credit} · Google</span>}
      {hit.photos.length > 1 && <span className="absolute right-2 bottom-1.5 text-[11px] font-medium text-white bg-black/45 rounded-full px-2 py-0.5">1 / {hit.photos.length}</span>}
    </button>
  );
}

/** A place's words that name the same stay ("The Ritz-Carlton, Nikko" in "Ritz-Carlton, Nikko"; "Shirakabeso") */
function sameStay(place: string, stay: string): boolean {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !["hotel", "the", "ryokan", "resort", "japan", "kyoto", "tokyo", "nikko"].includes(w));
  const w = new Set(words(place));
  return words(stay).some((x) => w.has(x));
}

/** A line's own place photo on a day without her detailed plan — a booking, a meal, a hotel — found as Play finds it, and
 *  only when Wander's check says it's that place (Ken, Oct 17: "Why aren't there pictures on the day?") */
function ItemPhoto({ tripId, cityId, query, line, title, time }: { tripId: string; cityId: string | null; query: string; line: string; title: string; time: string | null }) {
  const ask = useMemo(() => [{ query, line }], [query, line]);
  const [hit, setHit] = useState<PlaceHit | null>(() => keptPlacePhotos(ask)[query] ?? null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    lookUpPlacePhotos(tripId, cityId, ask).then((h) => { if (live) setHit(h[query] ?? null); }).catch(() => { /* drawn without */ });
    return () => { live = false; };
  }, [tripId, cityId, ask, query]);
  if (!hit) return null;
  return (
    <>
      <MomentPhoto hit={hit} title={title} onOpen={() => setOpen(true)} />
      <AboutPlaceButton id={hit.id} title={title} />
      {open && <PlaceGallery hit={hit} title={title} time={time} map={null} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Next, on a day with Backroads when nothing with a time is left: their stops for the day, in their order, each with its
 *  checked photo, side by side (Ken, Oct 18 9:44 AM, Next on the Nikko day showed only "Tonight" and "Tomorrow": "Next
 *  page should have pictures"). Their itinerary has no times, so none are said; a stop whose photo isn't checked shows
 *  its name alone. A tap opens its photos. */
function NextStops({ tripId, cityId, head, stops }: { tripId: string; cityId: string | null; head: string; stops: { id: string; title: string; query: string; line: string }[] }) {
  const ask = useMemo(() => stops.map((s) => ({ query: s.query, line: s.line })), [stops]);
  const [hits, setHits] = useState<Record<string, PlaceHit | null>>(() => keptPlacePhotos(ask));
  const [open, setOpen] = useState<{ hit: PlaceHit; title: string } | null>(null);
  useEffect(() => {
    let live = true;
    lookUpPlacePhotos(tripId, cityId, ask).then((h) => { if (live) setHits(h); }).catch(() => { /* names alone */ });
    return () => { live = false; };
  }, [tripId, cityId, ask]);
  if (!stops.length) return null;
  return (
    <div className="mb-3" data-next-stops>
      <p className="text-[15px] text-[#3a3128]">{head}</p>
      <div className="mt-2 -mx-4 px-4 scroll-px-4 flex items-start gap-2.5 overflow-x-auto snap-x pb-1">
        {stops.map((s) => {
          const hit = hits[s.query] ?? null;
          return (
            <button key={s.id} type="button" disabled={!hit} onClick={() => hit && setOpen({ hit, title: s.title })}
              aria-label={hit ? `Photos of ${s.title}` : s.title}
              className="snap-start shrink-0 w-[150px] text-left">
              <span className="relative block w-full aspect-[4/3] rounded-lg overflow-hidden bg-[#efe8dc]">
                {hit && <img src={placePhotoUrl(hit, 0, true)} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
                {/* (the photographer, on the photo, as Google asks) */}
                {hit?.photos[0]?.credit && <span className="absolute inset-x-0 bottom-0 px-1.5 pb-0.5 pt-3 bg-gradient-to-t from-black/50 to-transparent truncate text-[9px] text-white/85">Photo: {hit.photos[0].credit} · Google</span>}
              </span>
              <span className="block mt-1 text-[13px] leading-snug text-[#3a3128] line-clamp-2">{s.title}</span>
            </button>
          );
        })}
      </div>
      {open && <PlaceGallery hit={open.hit} title={open.title} time={null} map={null} onClose={() => setOpen(null)} />}
    </div>
  );
}

// Rain and sunset on the moments they touch, in Play (it has no band): the forecast's likeliest rain hours on the first
// moment of each span still ahead ("Rain likely 3–7 PM", as the band says it), showers one forecast sees, and the
// sunset on the moment the sun goes down in — worked out on the phone, "about" (Oct 15: "before they realize")
function addSky(moments: Moment[], playCover: PlayCover | undefined, nowAt: number | null) {
  const hourWord = (h: number) => (h === 12 ? "noon" : `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`);
  const spanWord = ([s, e]: [number, number]) => (s !== 12 && e !== 12 && (s < 12) === (e < 12) ? `${s % 12 || 12}–${hourWord(e)}` : `${hourWord(s)}–${hourWord(e)}`);
  const lasts = (m: Moment) => (m.start == null ? null : [m.start, m.end ?? m.start + 60] as [number, number]);
  // (today, from now on: a span under way goes on the first moment still ahead, as "until 6 PM")
  const from = nowAt ?? 0;
  const firstIn = ([s, e]: [number, number]) => moments.find((m) => { const t = lasts(m); return !!t && t[1] > from && t[0] < e * 60 && t[1] > s * 60; });
  for (const [list, say] of [[playCover?.rain?.wet || [], "The forecast has rain likely"], [playCover?.rain?.showers || [], "One forecast sees showers"]] as const) {
    for (const sp of list.filter((x) => x[1] * 60 > from)) {
      const m = firstIn(sp);
      const under = nowAt !== null && sp[0] * 60 <= nowAt;
      if (m) m.info = [...(m.info || []), `${say} ${under ? `until ${hourWord(sp[1])}` : spanWord(sp)}`];
    }
  }
  const sun = playCover?.sunset ?? null;
  // (not once the sun is down, today — tourist71: "Sunset about 5:07 PM" on the Now moment at 6)
  if (sun !== null && (nowAt === null || nowAt < sun)) {
    const m = moments.find((x) => { const t = lasts(x); return !!t && t[0] <= sun && sun < t[1]; });
    if (m) m.info = [...(m.info || []), `Sunset about ${hourWord(Math.floor(sun / 60)).replace(/^(\d+)/, `$1:${String(sun % 60).padStart(2, "0")}`)}`];
  }
}

/** "Play the day" for a day her Guide gives no timed plan (Oct 15 2026 — Ken: "Create play every day. Use what you have
 *  from the backroads content."): the moments come built — Backroads' day with her lines in it, or her lines in order */
function DayPlay({ tripId, cityId, date, moments: built, places, heading, outline, playWords, cover, nowAt, playTomorrow, stops = null }: {
  tripId: string | null; cityId?: string | null; date: string; moments: Moment[];
  /** Backroads' own stops (moment ids), listed on the day's page with their photos in place of the one-line outline (Ken,
   *  Oct 17: "Why aren't there pictures on the day?" — they were only in Play) */
  stops?: { ids: string[]; head: string } | null;
  /** what to look up for a moment's photo, by moment id ({ query, line } as the plan's photos are found; `note` says what
   *  the photo is when it's an example, shown only with the photo) */
  places: Record<string, { query: string; line: string; note?: string }>;
  heading: string; playWords: string; cover: PlayCover; nowAt: number | null;
  /** on a Backroads day, what their itinerary holds, in a line — the ride and the stops weren't on the day's page at all,
   *  only inside Play ("If I'd only scrolled the day page I'd think Sunday was a bus day" — user-andy4) */
  outline?: string | null;
  playTomorrow: { words: string; date: string; play: boolean } | null;
}) {
  const [playing, setPlaying] = useState(false);
  const [galleryOf, setGalleryOf] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const asked = Object.values(places);
  const [hits, setHits] = useState<Record<string, PlaceHit | null>>(() => keptPlacePhotos(asked));
  const askKey = asked.map((x) => x.query).join("|");
  useEffect(() => {
    if (!tripId || !asked.length) return;
    let live = true;
    setHits(keptPlacePhotos(asked));
    lookUpPlacePhotos(tripId, cityId, asked).then((h) => { if (live) setHits(h); }).catch(() => { /* drawn cards */ });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, cityId, askKey]);
  // (straight into Play from the day before's "Play tomorrow": "#play-2026-10-19")
  useEffect(() => {
    const want = location.hash.match(/^#play-(\d{4}-\d{2}-\d{2})$/)?.[1];
    if (!want || want !== date || !built.length) return;
    navigate(location.pathname + location.search, { replace: true });
    setPlaying(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash, date, built.length]);
  if (!built.length) return null;
  const moments = built.map((m) => {
    const hit = places[m.id] ? hits[places[m.id].query] ?? null : null;
    return { ...m, hit, photoWords: hit ? places[m.id]?.note : undefined };
  });
  addSky(moments, cover, nowAt);
  const playFrom = moments.findIndex((m) => m.isNow);
  const firstHit = moments.find((m) => m.hit)?.hit || null;
  const fullCover: PlayCover = {
    ...cover,
    photo: firstHit ? { src: placePhotoUrl(firstHit, 0), place: firstHit.name || moments.find((m) => m.hit === firstHit)!.title, credit: firstHit.photos[0]?.credit ? `Photo: ${firstHit.photos[0].credit} · Google` : null }
      : cover.photo || null,
  };
  const goTomorrow = playTomorrow ? () => {
    let done = false;
    const go = () => { if (done) return; done = true; window.removeEventListener("popstate", go); navigate(`/day/${playTomorrow.date}${playTomorrow.play ? `#play-${playTomorrow.date}` : ""}`); };
    window.addEventListener("popstate", go);
    setPlaying(false);
    setTimeout(go, 400);
  } : null;
  return (
    <>
    <div className="flex items-center justify-between gap-3 mb-2">
      <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a]">{heading}</h2>
      <button type="button" onClick={() => setPlaying(true)}
        className="shrink-0 min-h-[44px] inline-flex items-center gap-1.5 pl-3 pr-4 rounded-full bg-[#3a3128] text-white text-sm font-medium">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 1.5v9l8-4.5z" fill="currentColor" /></svg>
        Play the day
      </button>
      {playing && <PlayTheDay moments={moments} dayWords={playWords} start={playFrom} onClose={() => setPlaying(false)}
        cover={fullCover} nowAt={nowAt} tomorrow={playTomorrow && goTomorrow ? { words: playTomorrow.words, play: playTomorrow.play, go: goTomorrow } : null} />}
    </div>
    {stops ? (
      <>
        <p className="text-[13px] text-[#514636] mb-2">{stops.head}</p>
        <ol className="space-y-2 mb-4">
          {stops.ids.map((id) => moments.find((m) => m.id === id)).filter((m): m is (typeof moments)[number] => !!m).map((m) => (
            <li key={m.id} className="rounded-xl border border-[#e0d8cc] bg-white p-3">
              <p className="text-[15px] leading-snug text-[#3a3128]">{m.title}</p>
              {m.info?.[0] && <p className="text-xs text-[#6b5d4a] mt-0.5">{m.info[0]}</p>}
              {m.hit && <MomentPhoto hit={m.hit} title={m.title} onOpen={() => setGalleryOf(m.id)} />}
            </li>
          ))}
        </ol>
      </>
    ) : outline && <p className="text-[13px] text-[#514636] mb-3">{outline}</p>}
    {(() => { const g = galleryOf ? moments.find((m) => m.id === galleryOf) : null; return g?.hit ? <PlaceGallery hit={g.hit} title={g.title} time={g.time} map={g.map} onClose={() => setGalleryOf(null)} /> : null; })()}
    </>
  );
}

function PlanSection({ blocks, overview, me, highlight, picked, onPick, onUndo, tellName, onTell, nowAt, riding, railArrivals, hotel, bookings, tripId, maps = [], pictures = [], under, differAbove, differBelow, added = [], cityId, trainWords, playWords, playCover, playTomorrow, playBookings, panelOf, pastDay = false }: {
  blocks: GuideItem[]; overview: GuideItem[]; me: string | null; highlight: string | null;
  /** a day already over: Maps alone, no way there from here */
  pastDay?: boolean;
  /** the day's city, for finding its stops' photos near it */
  cityId?: string | null;
  /** the trains under a line, in words ("NOZOMI 21 · Tokyo → Kyoto · 10:03 AM → 12:15 PM · Car 7, 3A–3D") */
  trainWords?: (b: GuideItem) => string[];
  /** "Play the day"'s heading ("Thu, Oct 15 · Tokyo") */
  playWords?: string;
  /** "Play the day"'s cover: the day in a few sentences, the city's photo */
  playCover?: PlayCover;
  /** the trip's next day, for "Play tomorrow" at the end */
  playTomorrow?: { words: string; date: string; play: boolean } | null;
  /** the bookings said under a line, in words, for "Play the day" ("6:35 PM · UA34 KIX → SFO") */
  playBookings?: (b: GuideItem) => string[];
  /** her picture whose panel heads this day (its "See her map" button isn't offered again here) */
  panelOf?: string;
  /** plans added in Wander with a time, drawn among her lines at their time ("HH:MM") — marked as added, never as hers */
  added?: { time: string; node: ReactNode }[];
  /** the train under this line already says where the sources' times differ — not again in amber on the line */
  differBelow?: (b: GuideItem) => boolean;
  /** the sources' disagreement about this line's time is already said at the top of the day — a pointer here, not again */
  differAbove?: (b: GuideItem) => boolean;
  /** her booking for a line (the flight, the dinner, the check-out), drawn under her line — said once, there */
  /** what sits under a line; wayShown: the line itself already has the way there (Walk/Train/Taxi or Maps) */
  under?: (b: GuideItem, wayShown: boolean) => ReactNode[];
  picked: Map<string, DayChoice>; onPick: (text: string, time: string | null, pickFor: string) => Promise<void>;
  onUndo: (c: DayChoice) => Promise<void>; tellName: string | null; onTell: (c: DayChoice) => void;
  nowAt: number | null; riding?: boolean; hotel: string | null; bookings: GuideItem[];
  /** her "Arrive …" lines timed for a train the rail sheet books at another time: the booked arrival ("2:50 PM"), by line */
  railArrivals?: Record<string, string>;
  /** for "Open this spot in her sheet" */
  tripId?: string | null;
  /** her Apple Maps guide(s) for this day */
  maps?: { name: string; link: string }[];
  /** her pictures, every tab (this day's tab's are shown) */
  pictures?: GuidePicture[];
}) {
  const v = voiceFor(me, tellName);
  // Her Itinerary line(s) for the day, for a Maps search's town (areaOf)
  const dayWords = overview.map((o) => o.title).join(" ");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // (lines with a piece of their own — no Google place: Wednesday's studios — get "About this place" too)
  const [aboutKeys, setAboutKeys] = useState<Set<string>>(() => new Set());
  useEffect(() => { let live = true; aboutLines().then((s) => { if (live) setAboutKeys(s); }); return () => { live = false; }; }, []);
  // The choice just tapped says "Saving…" until the pick is back from the server (a switch takes two steps)
  const [tapped, setTapped] = useState<string | null>(null);
  // Wander's reasoning for the day it put an undated plan on: one quiet line, the whole of it on a tap (delight audit:
  // five amber lines of "Wander matched…" sat above her stops all day, outranking her plan)
  const [whyOpen, setWhyOpen] = useState(false);
  // The day as moments (Oct 15): each stop's own photos, found from the words its Maps button searches
  const mapOf = useMemo(() => Object.fromEntries(blocks.map((b) => [b.id, choicesOf(b).length ? null : planMapHref(b, { hotel, dayWords, bookings })])) as Record<string, string | null>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks, hotel, dayWords, bookings.map((m) => m.id).join()]);
  // (her line, and the stop her tab names for it — "Traditional Kyoto sweet / matcha in Gion" lists Gion Tsujiri; checked
  // on the title alone it was turned down)
  // (no photo on a line about getting somewhere — "Taxi to Raku Museum", "Continue same taxi to TeamLab": the photo is
  // the place's, on its own line; tourist63 saw TeamLab's three times in a row)
  // (and her booking for it, when the line's place is her booking's — Robuchon: her Dining Resos tab books La Table)
  const queries = useMemo(() => blocks.map((b) => {
    // (the day's city for a place her line names with no Maps link: "Sat, Oct 17 · Tokyo" → Tokyo)
    return { id: b.id, query: TRAVEL.test(b.title) || choicesOf(b).length ? null : mapsQueryOf(mapOf[b.id]) || photoQueryOf(b, { hotel, dayWords, bookings, city: (playWords || "").split(" · ")[1] || null }), line: photoLineOf(b, { hotel, dayWords, bookings }) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }).filter((x): x is { id: string; query: string; line: string } => !!x.query), [blocks, mapOf]);
  const [photos, setPhotos] = useState<Record<string, PlaceHit | null>>(() => keptPlacePhotos(queries));
  useEffect(() => {
    if (!tripId || !queries.length) return;
    let live = true;
    setPhotos(keptPlacePhotos(queries));
    lookUpPlacePhotos(tripId, cityId, queries.map((q) => ({ query: q.query, line: q.line }))).then((p) => { if (live) setPhotos(p); });
    return () => { live = false; };
  }, [tripId, cityId, queries]);
  // (a place's photo once a day, on the first of its lines — "Finish TeamLab" after "TeamLab" gets none)
  const firstFor = new Map<string, string>();
  for (const q of queries) { const h = photos[q.query]; if (h && !firstFor.has(h.id)) firstFor.set(h.id, q.id); }
  const hitOf = (b: GuideItem) => { const q = queries.find((x) => x.id === b.id)?.query; const h = q ? photos[q] || null : null; return h && firstFor.get(h.id) === b.id ? h : null; };
  // When her time for a stop runs past its hours, as Google lists them — only for the place her line means (its photo's
  // place); said on the line and in Play, never otherwise (Oct 15: "before they realize they want it")
  const hoursNote = (b: GuideItem): string | null => {
    // (only on the line that is the stop — the one with its photo — never "Taxi to X" or "Finish X": tourist70)
    const h = hitOf(b);
    if (!h?.hours || !b.time) return null;
    // (not on a day already lived — "Google lists KIBIDO as closed on Wednesdays" sat under the visit they'd made;
    // fresh photo check, Oct 17)
    if (String(b.date).slice(0, 10) < new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" })) return null;
    const start = Number(b.time.slice(0, 2)) * 60 + Number(b.time.slice(3, 5));
    return hoursWords(h.hours, h.name || b.title, String(b.date).slice(0, 10), start, planLineEndSaid(b, blocks));
  };
  const [gallery, setGallery] = useState<GuideItem | null>(null);
  // (the photo a tap opened them on — the standout line's small photos each open at their own)
  const [galleryAt, setGalleryAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // "Play tomorrow" at the end of a day's Play: Play closes (its Back step comes off first), then tomorrow's day opens
  // straight into its own Play — "#play-2026-10-16", opened only once that day's own lines are here
  const blocksDay = String(blocks[0]?.date || "").slice(0, 10);
  useEffect(() => {
    const want = location.hash.match(/^#play-(\d{4}-\d{2}-\d{2})$/)?.[1];
    if (!want || want !== blocksDay) return;
    navigate(location.pathname + location.search, { replace: true });
    setPlaying(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash, blocksDay]);
  const goTomorrow = playTomorrow ? () => {
    let done = false;
    // (a next day with her plan opens straight into its Play; one without, on its own page — never a dead end, tourist65)
    const go = () => { if (done) return; done = true; window.removeEventListener("popstate", go); navigate(`/day/${playTomorrow.date}${playTomorrow.play ? `#play-${playTomorrow.date}` : ""}`); };
    window.addEventListener("popstate", go);
    setPlaying(false);
    setTimeout(go, 400);
  } : null;
  const tab = blocks[0].source.split(" · ")[0];
  const heading = blocks[0].source.split(" · ").slice(1).join(" · ");
  // Wander's own match of an undated tab to this day — said once, as Wander's
  // (not on a day that follows another list of hers — it's about her tab's plan, set aside; fresh check, Oct 17: "Why this
  // plan is on this day" said the plan came from her tab)
  const swapped = !!blocks[0]?.id.startsWith("swap-");
  const matchedRaw = swapped ? null : (blocks.map((b) => (b.detail || "").split("\n").find((l) => l.startsWith("Wander matched this plan"))).find(Boolean)) || null;
  // A picture in her Guide that dates this plan's day differently is her earlier plan: it isn't shown or talked about.
  // Ken, Oct 15, on her Tokyo Day 1 tab (its picture: "Day 1 – Tue, Oct 13", the plan she wrote under it on Oct 15):
  // "The map is old and should not be the target. Text under is correct"; and Oct 14: "if it is done or out of date,
  // you don't show it". (The same picture heads her Day 2 and Day 3 tabs.)
  const oldPicture = !!matchedRaw && / A picture in her .*? labels Day \d+ .*? — a different date; worth checking with Larisa\./.test(matchedRaw);
  const matched = matchedRaw && matchedRaw.replace(/ A picture in her .*? labels Day \d+ .*? — a different date; worth checking with Larisa\./, "");
  // Her tab plans this day twice: which one Wander follows, said once, up top (Oct 2 — her revised Day 2)
  const twoVersions = (blocks.map((b) => (b.detail || "").split("\n").find((l) => /^Her tab has \d+ versions of this day's plan/.test(l))).find(Boolean)) || null;
  // (in words, without her cell names — "Wander follows A46 (the one she added most recently); A44 has other times"
  // read as a spreadsheet to Larisa, Sweep B); the same words on the list and on Play's cover
  const twoVersionsWords = twoVersions ? v.say(twoVersions
    .replace(/: Wander follows \S+ \((.+?)\); .+? (has|have) other times — /, (_m, why, verb) => `. Wander follows ${why}; the other${verb === "have" ? "s have" : " has"} different times — `)
    .replace(/^Her tab/, `${v.Her} tab`).replace(/worth checking with \S+ which is current/, (m) => (v.mine ? "worth a look to see which one is current" : m))) : null;
  const noOwner = ownerlessInSplit(blocks);
  // When each line ends, and the line you're on now — the same rule Home and Now use (lib/guideDisplay.ts)
  const endOf = (b: GuideItem) => planLineEnd(b, blocks);
  // (none while you're on a booked train — the train is where you are; Sweep B, Oct 29 2 PM: "NOW ~2:00–2:30 Arrive KIX"
  // while the 1:30 HARUKA was still running to 2:50)
  const current = nowAt === null || riding ? null : currentPlanLine(blocks, nowAt, me) || currentUnownedLine(blocks, nowAt) || null;
  // The line that stands out today (NOW_MAROON): the one under way, else your next timed line — as Next reckons it
  const startOf = (b: GuideItem) => (b.time ? Number(b.time.slice(0, 2)) * 60 + Number(b.time.slice(3, 5)) : Infinity);
  // (and a meal under way, as Next reckons it — two hours from its booking's start: at 7:30 PM on Oct 16 Next said "Now ·
  // Une Immersion" while her last line, the 7 PM dinner with no end time, already counted as over; stability walk)
  const mealNow = nowAt === null || riding ? undefined : mealUnderWay(bookings, nowAt, me);
  const mealLine = mealNow ? blocks.find((b) => b.time === mealNow.time && saidAgain(b, mealNow)) || blocks.find((b) => b.time === mealNow.time) : undefined;
  const focusLine = nowAt === null || riding ? null : current || mealLine
    || blocks.filter((b) => b.time && startOf(b) >= nowAt && (!b.forWhom || isFor(b, me))).sort((a, b) => startOf(a) - startOf(b))[0] || null;
  const addedSorted = [...added].sort((a, b) => a.time.localeCompare(b.time));
  let nextAdded = 0;
  // "Play the day": her lines as moments, in her order — today from the one you're on now
  const all: Moment[] = blocks.map((b) => {
    const lines = (b.detail || "").split("\n").filter((l) => l && !/^(Choice: |Tabs differ: |Times are Larisa's estimate\.|Wander matched this plan|Her tab has \d+ versions|Her whole route for the day: )/.test(l) && !PICTURE_GROUP.test(l));
    const note = momentNote(lines);
    // (all her words for the line, as she wrote them — Wander's own "Where: … — the stop her tab lists" said apart)
    const words = lines.filter((l) => !/^Where: .+ — the stop her tab lists/.test(l)).join("\n").trim();
    const flat = (t: string) => t.replace(/[\s○•-]+/g, " ").trim();
    // Play is never less careful than the list (tourist65: Oct 29 said "Arrive KIX ~2:00–2:30, in 6 h" where the list
    // says the booked train arrives 2:50 PM): the same corrections, in the same words
    const booking = choicesOf(b).length ? undefined : (bookings || []).find((m) => m.time === b.time && saidAgain(b, m));
    const twoTimes = (!!differAbove && differAbove(b)) || (!!differBelow && differBelow(b));
    // (exactly as the list: no "tabs differ" where the sources' two times are said — on Oct 29 that was her done "Book
    // 1:30p Haruka… - DONE" (Ken, Oct 14: "if it is done or out of date, you don't show it"); the booking's own, when
    // the difference is in her booking)
    const atBooking = !!booking && tabsDiffer(booking).length > 0;
    // (her plan line's own note first: it names the booking — "her Dining Resos tab's booking at this time is 'LeTable de
    // Joel Robuchon - 1F'"; the booking's side only quoted the plan's other name, and Andy couldn't tell what differed)
    const differs = (twoTimes ? [] : tabsDiffer(b).length ? tabsDiffer(b) : atBooking ? tabsDiffer(booking!) : []).map((d) => differWordsFor(d, v));
    const dress = bookingDress(b, bookings);
    const cautions = [
      ...(railArrivals?.[b.id] ? [`Timed for the train in ${v.her} tab — the booked train arrives ${railArrivals[b.id]}`] : []),
      ...(twoTimes ? [`The sources give two times for this. The booked train is the one in the box.`] : []),
      ...differs,
      ...(hoursNote(b) ? [hoursNote(b)!] : []),
    ];
    // (who a line is for when her table names no one: the same words as the list — tourist66, Oct 28: Ken at MIHO saw
    // "Maruni Toryo · in 5 min" with no group)
    const picGroup = pictureGroupOf(b);
    const info = [
      ...(picGroup ? [`${noOwner.has(b.id) ? `${v.Her} plan names no group here; a` : "A"} picture in ${v.her} tab puts it under “${picGroup}”${pictureYou(picGroup, v, me)}`]
        : noOwner.has(b.id) ? ["No group named here — the group is split"] : []),
      ...(b.detail || "").split("\n").filter((l) => /^Where: .+ — the stop her tab lists/.test(l)).map((l) => v.say(l)),
      ...(playBookings ? playBookings(b) : []),
      // ("asks less" left Andy guessing — the booking's dress code is looser than her plan's line; user-andy3)
      ...(dress ? [`${dress.stricter ? `${v.Her} booking at ${dress.where} gives a looser dress code: ` : `${v.Her} booking at ${dress.where}: `}“${dress.words}”`] : []),
    ];
    const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    // (when it starts for the "in 45 min": the booked arrival when her time is for another train; none when the sources
    // give two times — a countdown to one of them would pick a side)
    const clockMin = (h: string, m: string, ap: string) => (Number(h) % 12 + (/p/i.test(ap) ? 12 : 0)) * 60 + Number(m);
    const booked = railArrivals?.[b.id]?.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    // A booked train under the line: its own times are when it is — on board, it's Now (tourist66: riding the 1:30 HARUKA
    // at 1:45, Play said "Earlier today" from her ~12:30 and opened on the cover)
    const trains = trainWords ? trainWords(b) : [];
    const ride = trains.map((t) => t.match(/(\d{1,2}):(\d{2})\s*([AP]M)\s*→\s*(\d{1,2}):(\d{2})\s*([AP]M)/i)).find(Boolean);
    const rideStart = ride ? clockMin(ride[1], ride[2], ride[3]) : null;
    const rideEnd = ride ? clockMin(ride[4], ride[5], ride[6]) : null;
    const start = rideStart ?? (twoTimes ? null : booked ? clockMin(booked[1], booked[2], booked[3]) : b.time ? hm(b.time) : null);
    const end = rideStart !== null ? rideEnd : start === null ? null : booked ? start + 15 : endOf(b);
    const onBoard = rideStart !== null && rideEnd !== null && nowAt !== null && rideStart <= nowAt && nowAt < rideEnd && isFor(b, me);
    // (on board, the train's booked times lead and hers follow, said as hers — tourist67: "~12:30–1:00" under Now at 1:45)
    const hers = planTime(b) || null;
    return { id: b.id, time: onBoard ? ride![0].replace(/\s*→\s*/, " → ") : hers, title: b.title.replace(/^./, (c) => c.toUpperCase()), note, map: mapOf[b.id] ?? null,
      hit: hitOf(b), trains, forWhom: b.forWhom ? (isFor(b, me) ? `Yours · ${b.forWhom}` : `For ${b.forWhom}`) : null, isNow: current?.id === b.id || onBoard,
      full: words && flat(words) !== flat(note || "") ? words : null, cautions, info: onBoard && hers ? [`${v.Owners} plan: ${hers}`, ...info] : info,
      // (what the Next button says for it: the booked time when hers is for another train — "2:50 PM", not "~2:00")
      at: rideStart !== null ? ride![0].split("→")[0].trim() : railArrivals?.[b.id] || null,
      onBoard,
      start, end };
  });
  // Her travel lines ("Taxi back to Shiraume", "Continue same taxi to TeamLab") fold into the moment they lead to, as
  // "Getting there: ~2:15 · Taxi to Raku Museum" — in her order, nothing dropped (tourist64: 13 of Kyoto Tuesday's 19
  // moments were plain cards like a taxi, and tapping through them was a chore). A train her line books stays its own
  // moment. The last line of a day, if it's travel, joins the moment before it.
  // (tourist65: "Leave Shiraume" and "Leave Four Seasons for dinner" were thin cards of their own — they fold like a taxi;
  // "Finish TeamLab" joins TeamLab as its end. A line with a correction on it never folds: it keeps its own screen.)
  const moments: Moment[] = [];
  let carry: string[] = [], carryNow = false;
  const said = (m: Moment) => `${m.time ? `${m.time} · ` : ""}${m.title}`;
  for (const m of all) {
    const plain = !m.hit && !m.trains.length && !(m.cautions || []).length && !(m.info || []).length;
    const travel = plain && (TRAVEL.test(m.title) || /^\W*(leave|depart)\b/i.test(m.title));
    const finish = plain && /^\W*finish\b/i.test(m.title) && moments.length > 0 && !carry.length;
    if (finish) { const prev = moments[moments.length - 1]; prev.after = [...(prev.after || []), said(m)]; prev.isNow ||= m.isNow; continue; }
    if (travel) { carry.push(said(m)); carryNow ||= m.isNow; continue; }
    moments.push({ ...m, getting: carry.length ? carry : undefined, isNow: m.isNow || carryNow });
    carry = []; carryNow = false;
  }
  if (carry.length) {
    const last = moments[moments.length - 1];
    if (last) { last.after = [...(last.after || []), ...carry]; last.isNow ||= carryNow; } else moments.push(...all.filter((m) => carry.some((c) => c.endsWith(m.title))));
  }
  addSky(moments, playCover, nowAt);
  // (today, on what's happening now; otherwise the day's cover)
  const playFrom = moments.findIndex((m) => m.isNow);
  // The cover: the day in her words when Wander has no summary of it (her Itinerary line); the day's own first photo
  // before the city's (tourist65: Fushimi Inari on a Kiyomizu day implied a stop the day doesn't have); her two versions
  const firstHit = moments.find((m) => m.hit)?.hit || null;
  const cover: PlayCover = {
    summary: playCover?.summary || (overview.length ? `In ${v.her} Itinerary: “${overview.map((o) => o.title).join(" · ")}”` : null),
    photo: firstHit ? { src: placePhotoUrl(firstHit, 0), place: firstHit.name || moments.find((m) => m.hit === firstHit)!.title, credit: firstHit.photos[0]?.credit ? `Photo: ${firstHit.photos[0].credit} · Google` : null }
      : playCover?.photo || null,
    notes: twoVersionsWords ? [twoVersionsWords] : [],
    panel: playCover?.panel || null,
    sunset: playCover?.sunset ?? null,
    photos: playCover?.photos || [],
    her: v.Her,
  };
  return (
    <section id="plan" className="mb-5 scroll-mt-24">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a]">{v.Owners} plan for the day</h2>
        {/* (the day as moments, full screen — Ken, Oct 15: "'Play the day' feels right") */}
        {moments.length >= 2 && (
          <button type="button" onClick={() => setPlaying(true)}
            className="shrink-0 min-h-[44px] inline-flex items-center gap-1.5 pl-3 pr-4 rounded-full bg-[#3a3128] text-white text-sm font-medium">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 1.5v9l8-4.5z" fill="currentColor" /></svg>
            Play the day
          </button>
        )}
      </div>
      {playing && <PlayTheDay moments={moments} dayWords={playWords || ""} start={playFrom} onClose={() => setPlaying(false)}
        cover={cover} nowAt={nowAt} tomorrow={playTomorrow && goTomorrow ? { words: playTomorrow.words, play: playTomorrow.play, go: goTomorrow } : null} />}
      {gallery && hitOf(gallery) && <PlaceGallery hit={hitOf(gallery)!} start={galleryAt} title={gallery.title.replace(/^./, (c) => c.toUpperCase())} time={planTime(gallery) || null} map={mapOf[gallery.id] ?? null} onClose={() => setGallery(null)} />}
      {/* (the tab's plan table, opened in her sheet — round 16) */}
      {/* (a day that follows another list of hers — Ken, Oct 17, her Google Maps list "Tokyo Day 3": that list, by name; it
          isn't in her sheet, so no link there — backend services/guide/daySwaps.ts) */}
      {blocks[0].id.startsWith("swap-")
        ? <p className="text-sm text-[#6b5d4a] mt-0.5">From {heading.replace(/^her /, `${v.her} `)}</p>
        : <SheetSpots tripId={tripId} wholeTable label={`From the ${tabLabel(tab)} tab${heading ? ` — ${heading}` : ""}`} className="mt-0.5"
            spots={[{ tab: blocks[0].spots?.[0]?.tab || tab, a1s: blocks.flatMap((b) => b.spots?.find((x) => x.tab === (blocks[0].spots?.[0]?.tab || tab))?.a1s || []) }]} />}
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
      {/* Her pictures in this day's tab — her illustrated map of these days, full screen, pinch to zoom (Oct 2: they sat
          at the top of her day tabs, out of sight in Wander) */}
      {/* (not the one whose panel heads the day — its tap opens the same map: each fact once) */}
      {/* (neither on a day that follows another list of hers: her tab's map and her Apple guide are the plan set aside —
          fresh check, Oct 17: "See her map from this tab" opened Spiral and Louis Vuitton at their old times) */}
      {tripId && !oldPicture && !swapped && pictures.filter((p, i, all) => p.tab === tab && p.sha256 !== panelOf && all.findIndex((q) => q.tab === tab && q.sha256 === p.sha256) === i).map((p) => (
        <DayPicture key={p.sha256} tripId={tripId} picture={p} her={v.her} tab={tabLabel(tab)} />
      ))}
      {/* Her Apple Maps guide for the day — a map she made in Apple Maps, opened as it is now (Oct 2) */}
      {!swapped && maps.map((m) => (
        <a key={m.link} href={m.link} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1.5 min-h-[44px] mt-1 px-3 rounded-xl bg-white border border-[#e0d8cc] text-sm text-[#514636]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
          </svg>
          See {v.her} Apple Maps guide for the day{maps.length > 1 ? ` (“${m.name}”)` : ""} ↗
        </a>
      ))}
      {overview.map((o) => (
        <p key={o.id} className="text-[13px] text-[#514636] mt-1">In {v.her} Itinerary for this day: “{o.title}”</p>
      ))}
      {/* (in words, without her cell names — "Wander follows A46 (the one she added most recently); A44 has other times"
          read as a spreadsheet to Larisa, Sweep B) */}
      {twoVersionsWords && <p className="text-[13px] text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1 mt-1">{twoVersionsWords}</p>}
      {matched && (whyOpen
        ? <p className="text-[13px] text-[#6b5d4a] mt-1">{v.say(matched)}</p>
        : <button onClick={() => setWhyOpen(true)} className="min-h-[44px] text-left text-[13px] text-[#6b5d4a]">
            {/* (a question it answers, not a warning — Sweep A: folded, "…dates it differently" read as "this day may be wrong") */}
            Why this plan is on this day ›
          </button>)}
      <ol className="mt-2 bg-white rounded-xl border border-[#e0d8cc] divide-y divide-[#f0ebe3]">
        {blocks.flatMap((b) => {
          // (a plan added in Wander before this line's time goes here, in the day's order — Oct 8, Ken: "does it become an
          // equal item to activities extracted from the sheet?")
          const lead: ReactNode[] = [];
          if (b.time) while (nextAdded < addedSorted.length && addedSorted[nextAdded].time < b.time) lead.push(addedSorted[nextAdded++].node);
          const lines = (b.detail || "").split("\n").filter((l) => l && !l.startsWith("Wander matched this plan") && !/^Her tab has \d+ versions of this day's plan/.test(l));
          const choices = lines.filter((l) => l.startsWith("Choice: ")).map((l) => l.slice(8));
          const estimate = lines.includes("Times are Larisa's estimate.");
          // Her booking for this same line, when it says the same "tabs differ" itself: the warning is said once, on the
          // booking beside its address (Oct 15 review: Yazawa's amber note twice, a screen apart), and the line points
          // there
          const booking = choices.length ? undefined : (bookings || []).find((m) => m.time === b.time && saidAgain(b, m));
          const atBooking = !!booking && tabsDiffer(booking).length > 0;
          // (the booking itself, under this line — then its "tabs differ" is right here, with no pointer down the page)
          // (the picked choice's place, once the group has picked one; else the line's own)
          const pickedName = (() => { const t = choices.map((c) => `${b.title}: ${c.split(" — ")[0]}`).find((x) => picked.has(x)); return t ? t.slice(b.title.length + 2) : null; })();
          // …or, with no map link of hers, the place Wander found and checked for its photos, by the words it was found with
          // (Shigaraki Traditional Industry Hall had photos and About but no way there; fresh re-check, Oct 27)
          const foundBy = hitOf(b) ? queries.find((x) => x.id === b.id)?.query : undefined;
          const wayHref = pickedName ? choiceMapHref({ name: pickedName }, b) : (mapOf[b.id] ?? (foundBy ? mapsLink(foundBy) : null));
          const below = under ? under(b, !!wayHref) : [];
          const saidAbove = !!differAbove && differAbove(b);
          const saidBelow = !saidAbove && !!differBelow && differBelow(b);
          const differ = atBooking || saidAbove || saidBelow ? [] : tabsDiffer(b);
          const picGroup = pictureGroupOf(b);
          const notes = lines.filter((l) => !l.startsWith("Choice: ") && !l.startsWith("Tabs differ: ") && l !== "Times are Larisa's estimate." && !PICTURE_GROUP.test(l) && !l.startsWith("Her whole route for the day: "))
            .map((l) => (/^Where:/.test(l) ? v.say(l) : l));
          // Her "Transit: … Experience: …" on their own lines; a short note ("pending confirmation") in full
          const noteText = notes.join("\n").replace(/\s+(Experience|Transit|Note):/g, "\n$1:");
          const shortNote = noteText.length <= 90;
          // (with choices, each choice gets its own Maps link; the line itself ("Lunch") isn't a place — mapOf is null)
          const hit = hitOf(b);
          const time = planTime(b);
          const pickedHere = choices.map((c) => `${b.title}: ${c.split(" — ")[0]}`).filter((t) => picked.has(t));
          const isNow = current?.id === b.id;
          const past = nowAt !== null && b.time && !isNow && endOf(b) <= nowAt;
          const focus = focusLine?.id === b.id ? nowWords(isNow ? 0 : startOf(b) - nowAt!) : null;
          const ring = highlight === b.id ? "ring-2 ring-[#c8a060] rounded-xl" : focus ? "rounded-r-xl border-l-4 bg-[#fbf3f1]" : "";
          return [...lead, (
            <li key={b.id} id={`item-${b.id}`} data-now={focus || undefined} data-now-title={focus ? b.title.replace(/^./, (c) => c.toUpperCase()) : undefined}
              className={`flex gap-3 p-3 transition-shadow ${ring} ${past && !focus ? "opacity-60" : ""}`} style={focus ? { borderLeftColor: NOW_MAROON } : undefined}>
              <div className="w-20 shrink-0 text-right text-sm text-[#3a3128] [overflow-wrap:anywhere]" title={estimate ? "Larisa's estimate" : undefined}>
                {!focus && isNow && <span className="block text-[11px] uppercase tracking-wide text-[#8a5a1a]">Now</span>}
                {time}
              </div>
              <div className="flex-1 min-w-0">
                {/* (above the title, where it has room — in the time column "Next · in 50 min" broke over two lines) */}
                {focus && <p className="text-[12px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: NOW_MAROON }}>{focus}</p>}
                <div className="flex items-start gap-2">
                  <p className={`flex-1 leading-snug [overflow-wrap:anywhere] ${focus ? "text-[17px] font-medium" : "text-[15px] text-[#3a3128]"}`} style={focus ? { color: NOW_MAROON } : undefined}>{b.title.replace(/^./, (c) => c.toUpperCase())}
                    {/* (her arrival for a train the rail sheet books at another time: the booked arrival, as on Home —
                        Sweep A, Oct 29: "arrives 2:50 PM" above, "~2:00–2:30 Arrive KIX" below, only one flagged) */}
                    {railArrivals?.[b.id] && <span className="block text-sm text-[#8a5a1a] mt-0.5">Timed for the train in {v.her} tab — the booked train arrives {railArrivals[b.id]}</span>}
                  </p>
                </div>
                {/* the place itself, under its name — the time stays on the left, the facts below (the day as moments) */}
                {hit && (focus ? <PlacePhotos hit={hit} title={b.title} onOpen={(n) => { setGalleryAt(n); setGallery(b); }} /> : <MomentPhoto hit={hit} title={b.title} onOpen={() => { setGalleryAt(0); setGallery(b); }} />)}
                {b.forWhom && <p className="text-sm text-[#514636] mt-0.5">{isFor(b, me) ? `Yours · ${b.forWhom}` : `For ${b.forWhom}`}</p>}
                {/* (round 13: a picture in her tab can name the group her table leaves out — quoted, never assigned) */}
                {noOwner.has(b.id) && !picGroup && <p className="text-xs text-[#6b5d4a] mt-0.5">No group named here — the group is split</p>}
                {picGroup && <p className="text-xs text-[#6b5d4a] mt-0.5">{noOwner.has(b.id) ? `${v.Her} plan names no group here; a` : "A"} picture in {v.her} tab puts it under “{picGroup}”{pictureYou(picGroup, v, me)}</p>}
                {differ.map((d) => <p key={d} className="text-[13px] text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1 mt-1">{differWordsFor(d, v)}</p>)}
                {(() => { const h = hoursNote(b); return h ? <p className="text-[13px] text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1 mt-1">{h}</p> : null; })()}
                {/* (day review, Oct 4: Oct 29's HARUKA disagreement was said four times — at the top, here, in Trains, in
                    the summary) */}
                {saidAbove && (
                  <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="-mb-2 min-h-[44px] text-left text-[13px] text-[#8a5a1a]">
                    The sources give two times for this — see the top of the day ↑
                  </button>
                )}
                {/* (each of her tabs' spots stays here, one tap each, to settle it in her own layout — round 16) */}
                {(saidAbove || saidBelow) && tabsDiffer(b).length > 0 && (b.spots?.length || 0) > 1 && <SheetSpots tripId={tripId} spots={b.spots} />}
                {/* her tabs disagree: each tab's spot, one tap each, to settle it in her own layout (round 16) */}
                {differ.length > 0 && (b.spots?.length || 0) > 1 && <SheetSpots tripId={tripId} spots={b.spots} />}
                {atBooking && !below.length && (
                  <button onClick={() => document.getElementById(`item-${booking!.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                    className="-mb-2 min-h-[44px] text-left text-[13px] text-[#8a5a1a]">
                    {v.Her} tabs differ on where this is — {v.her} booking, with its address, is below ↓
                  </button>
                )}
                {(() => {
                  const dress = bookingDress(b, bookings);
                  return dress ? <p className={`text-[13px] rounded-md px-2 py-1 mt-1 ${dress.stricter ? "text-[#8a5a1a] bg-[#fff8ec]" : "text-[#514636] bg-[#f6f1e8]"}`}>
                    {dress.stricter ? `${v.Her} booking at ${dress.where} gives a looser dress code: ` : `${v.Her} booking at ${dress.where}: `}“{dress.words}”
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
                {/* (Ken, Oct 27: "another quick-access button… a summary description of the place" — after the line's own
                    words, who it's for and her warnings: under the photos it split them from the line; design review) */}
                {hit ? <AboutPlaceButton id={hit.id} title={b.title} />
                  : aboutKeys.has(lineKey(b.title)) ? <AboutPlaceButton id={lineKey(b.title)} title={b.title} /> : null}
                {/* Walk, Train or Taxi there, as on Next (Ken, Oct 27: "the variation is just confusing") — or the picked
                    choice's place, once the group has picked one */}
                <GetThere href={wayHref} name={pickedName || b.title} mapOnly={pastDay} />
                {below}
              </div>
            </li>
          )];
        })}
        {addedSorted.slice(nextAdded).map((a) => a.node)}
      </ol>
    </section>
  );
}

/**
 * "Today, don't miss": the day's dark action card (a ticket pickup) and the checks, each said once with a way down to its
 * line. Four show; any more open in place — nothing is dropped.
 */
function DontMiss({ heading, cards, checks }: { heading: string; cards: ReactNode[]; checks: { key: string; body: ReactNode; to?: string }[] }) {
  const [all, setAll] = useState(false);
  if (!cards.length && !checks.length) return null;
  const shown = all ? checks : checks.slice(0, 4);
  const go = (id: string) => {
    const el = document.getElementById(id);
    // (a short line opens where it lands — day design, Oct 8: "↓" otherwise led to a line that still needed a tap)
    const closed = el?.querySelector<HTMLButtonElement>(':scope > button[aria-expanded="false"]');
    closed?.click();
    // (once open, a tall line lands at its top, not centered with its first words above the screen)
    requestAnimationFrame(() => el?.scrollIntoView({ behavior: "smooth", block: el.offsetHeight > window.innerHeight * 0.6 ? "start" : "center" }));
  };
  return (
    <section aria-label={heading} className="mb-4">
      <h2 className="text-xs uppercase tracking-wide text-[#8a5a1a] mb-1.5">{heading}</h2>
      {cards}
      {shown.length > 0 && (
        <ul className="space-y-1.5">
          {shown.map((c) => (
            <li key={c.key}>
              {c.to
                ? <button onClick={() => go(c.to!)} className="w-full text-left min-h-[44px] text-sm text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1.5">
                    {c.body} <span aria-hidden>↓</span>
                  </button>
                : <div className="text-sm text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1.5 [&>p]:bg-transparent [&>p]:p-0">{c.body}</div>}
            </li>
          ))}
        </ul>
      )}
      {checks.length > shown.length && (
        <button onClick={() => setAll(true)} className="min-h-[44px] text-sm text-[#514636]">{checks.length - shown.length} more to check ›</button>
      )}
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
  // Folded to one row: it's about the whole stay, not this day (day review, Oct 4 — Ken on Oct 6: "not sure why it is
  // there"; it led the landing day with tomorrow's Bizen). Its open question rises to the top on the day that names it.
  const [open, setOpen] = useState(false);
  const label = `${v.Owners} note for ${city ? `the ${city} stay` : "this stay"}${from && to ? `, ${dateSpan(from, to)}` : ""}`;
  return (
    <div className="text-sm text-[#514636] mb-3">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full text-left min-h-[44px] text-[#514636]">
        {label} {open ? "‹" : "›"}
      </button>
      {open && (
        <div className="pb-1">
          {/* (what she marked done isn't shown — Ken, Oct 14: "if it is done or out of date, you don't show it") */}
          <p>{withoutDone(note.title)}</p>
          {travel.map((t) => <p key={t} className="mt-0.5"><span className="text-[#6b5d4a]">{v.Owners} travel note: </span>{t}</p>)}
        </div>
      )}
    </div>
  );
}
import EveningQuestion from "../components/EveningQuestion";
import { getCityPastel, cityAccent, tripCountryOf } from "../lib/cityColors";
import { CityTitle, warmCityPhoto, photoWanted, useCityBandPhoto } from "../components/CityArrival";
import { keptPlacePhotos, lookUpPlacePhotos, mapsQueryOf, placePhotoUrl, type PlaceHit } from "../lib/placePhotos";
import PlaceGallery from "../components/PlaceGallery";
import PlayTheDay, { type Moment, type PlayCover } from "../components/PlayTheDay";
import DayForecast from "../components/DayForecast";
import { backWord } from "../lib/cameFrom";
import GuideText from "../components/GuideText";
import { guideOwnerOf, sendToGuideOwner, planMessage } from "../lib/tellGuideOwner";
import { loadMarks, savedMarks, deadlineKey, markDay, type Mark } from "../lib/actionMarks";
import { DayPapers } from "../components/Papers";
import { holdKeyboard } from "../lib/keyboardHold";
import GetThere from "../components/GetThere";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Today, the line that's now — or, until it starts, next — stands out where the whole day is in view (Ken, Oct 16: "imagine
 * the full orientation being visible but the 'now' gets more prominence, e.g., 1-2 point larger text, color change to deep
 * maroon, picture evident… So that exact page changes as hours pass on what pops out. What pops is likely identical or
 * closely related to what the 'next' button does"). The same line Next reckons; a deep maroon edge and wash, its title two
 * points larger in maroon, and above its time "Now" or "Next · in 25 min".
 */
const NOW_MAROON = "#7a1f2b";
const nowWords = (startsIn: number) => (startsIn <= 0 ? "Now" : `Next · in ${startsIn < 60 ? `${Math.max(1, Math.round(startsIn))} min` : `${Math.floor(startsIn / 60)} hr${startsIn % 60 ? ` ${Math.round(startsIn % 60)} min` : ""}`}`);

/**
 * A place's checked photos, more than one (Ken, Oct 16: "Add more visuals to next" and, on today's line that stands out,
 * "one or two more visuals… that then go back to only one picture when the next itinerary item becomes the prominent
 * now"): the best one full width, and the second one Wander's check passed (a different view of the same place) beside it
 * or under it. Only checked photos — never an unchecked one.
 */
// (Oct 17, Ken on Robuchon: "I would expect four to six pictures of the restaurant and food" — every photo Wander keeps is
// checked, up to six: three or more show as the best one wide and the rest small beneath it, each opening there)
function PlacePhotos({ hit, title, onOpen, dark = false }: { hit: PlaceHit; title: string; onOpen?: (n: number) => void; dark?: boolean }) {
  const [gone, setGone] = useState<Record<number, boolean>>({});
  const shown = hit.photos.map((p, n) => (n === 0 || p.ok ? n : -1)).filter((n) => n >= 0 && !gone[n]).slice(0, 6);
  if (!shown.length) return null;
  const credit = hit.photos.filter((_, n) => shown.includes(n)).map((p) => p.credit).filter(Boolean).join(", ");
  const bg = dark ? "bg-white/10" : "bg-[#efe8dc]";
  const img = (n: number) => <img src={placePhotoUrl(hit, n, true)} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={() => setGone((g) => ({ ...g, [n]: true }))} />;
  const label = (n: number) => `Photo ${n + 1} of ${shown.length}, ${hit.name || title}`;
  return (
    <div className="mt-2">
      {shown.length < 3 ? (
        <button type="button" onClick={() => onOpen?.(0)} disabled={!onOpen} aria-label={`Photos of ${hit.name || title}`} className="block w-full">
          <span className={`grid gap-1.5 ${shown.length > 1 ? "grid-cols-[3fr_2fr]" : "grid-cols-1"}`}>
            {shown.map((n) => (
              // (two side by side share one height — at 4:3 each, the narrower second one stood shorter)
              <span key={n} className={`relative block overflow-hidden rounded-lg ${bg} ${shown.length > 1 ? "h-40" : "aspect-[16/9]"}`}>{img(n)}</span>
            ))}
          </span>
        </button>
      ) : (
        <>
          <button type="button" onClick={() => onOpen?.(shown[0])} disabled={!onOpen} aria-label={label(0)} className={`relative block w-full aspect-[16/9] overflow-hidden rounded-lg ${bg}`}>{img(shown[0])}</button>
          <span className={`grid gap-1.5 mt-1.5`} style={{ gridTemplateColumns: `repeat(${shown.length - 1}, minmax(0, 1fr))` }}>
            {shown.slice(1).map((n, k) => (
              <button key={n} type="button" onClick={() => onOpen?.(n)} disabled={!onOpen} aria-label={label(k + 1)} className={`relative block aspect-square overflow-hidden rounded-md ${bg}`}>{img(n)}</button>
            ))}
          </span>
        </>
      )}
      {credit && <p className={`text-[10px] mt-1 truncate ${dark ? "text-white/60" : "text-[#8a7d68]"}`}>Photo: {credit} · Google</p>}
    </div>
  );
}

/** One line of her plan's checked photos, looked up by itself (Next's cards) — a tap opens them full screen at the one
 *  tapped, as on the day's list (Ken, Oct 27, on Next's Kiyomizu-dera card: "Shouldn't I be able to tap on these pictures
 *  and expand them and look at the little pictures?" — the tap was never connected here) */
function LinePhotos({ tripId, cityId, block, ctx, dark = false }: { tripId: string | null; cityId?: string | null; block: GuideItem; ctx: { hotel?: string | null; dayWords?: string; bookings?: GuideItem[] }; dark?: boolean }) {
  const photoOf = useLinePhotos(tripId, cityId, [block], ctx);
  const [at, setAt] = useState<number | null>(null);
  const h = photoOf(block);
  if (!h) return null;
  return (
    <>
      <PlacePhotos hit={h} title={block.title} dark={dark} onOpen={(n) => setAt(n)} />
      {at !== null && <PlaceGallery hit={h} start={at} title={block.title.replace(/^./, (c) => c.toUpperCase())} time={planTime(block) || null} map={null} onClose={() => setAt(null)} />}
    </>
  );
}

/** A line's "About this place", then Walk, Train or Taxi there, after the line's own words (a fresh design review, Oct 27:
 *  under the photos the amber button split a line from its "Yours · Ken & Andy" and its warnings, the words 3 pt under
 *  it). The same order as every line of Today. No checked place: the way there alone. */
function LineAbout({ tripId, cityId, block, ctx, dark = false, beside }: { tripId: string | null; cityId?: string | null; block: GuideItem; ctx: { hotel?: string | null; dayWords?: string; bookings?: GuideItem[] }; dark?: boolean; beside?: ReactNode }) {
  const photoOf = useLinePhotos(tripId, cityId, [block], ctx);
  const own = useLineAbout(block.title);
  const h = photoOf(block);
  const id = h?.id ?? own;
  if (!id && !beside) return null;
  return (
    <div className="mt-3">
      {id && <AboutPlaceButton id={id} title={block.title} dark={dark} inRow />}
      {beside}
    </div>
  );
}

/**
 * Under the day's summary, today: what's now (or next) and a tap down to it — the line itself is a screen or two below
 * the summary, and on opening "now" couldn't be seen (stability walk, Oct 16). It reads the line marked on the page
 * (data-now), so it can never name a different one; the page keeps the summary first (the day screen's order).
 */
function NowJump() {
  const [line, setLine] = useState<{ label: string; title: string } | null>(null);
  useEffect(() => {
    const look = () => {
      const el = document.querySelector<HTMLElement>("[data-now]");
      const next = el ? { label: el.dataset.now || "", title: el.dataset.nowTitle || "" } : null;
      setLine((was) => (was?.label === next?.label && was?.title === next?.title ? was : next));
    };
    look();
    // (the day fills in after it opens, and "Next · in 50 min" counts down: looked at again as the page changes)
    const mo = new MutationObserver(look);
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-now", "data-now-title"] });
    return () => mo.disconnect();
  }, []);
  if (!line) return null;
  return (
    // (clear of the sticky header — scrolled to the very top, "NOW" and the time sat behind it; stability walk 2)
    <button type="button" data-now-jump onClick={() => { const el = document.querySelector("[data-now]"); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" }); }}
      className="w-full text-left mb-4 -mt-1 min-h-[44px] flex items-center gap-2 text-[15px]" style={{ color: NOW_MAROON }}>
      <span className="text-[12px] uppercase tracking-wide font-semibold shrink-0">{line.label}</span>
      {/* (two lines, not one: "DINNER RESERVATION: UN…" cut the restaurant's name off; fresh tester, Oct 16) */}
      <span className="flex-1 min-w-0 line-clamp-2 font-medium">{line.title}</span>
      <span aria-hidden className="shrink-0">↓</span>
    </button>
  );
}

/** words in a Backroads moment's title that don't name anything ("then", "your") — for choosing the sentences it quotes */
const SAID_STOP = new Set("with from into your yours their then this that there over back time some they them".split(" "));
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
  const [checking, setChecking] = useState(false);
  // "Earlier today" (what got you to tonight's place) opened
  const [showEarlier, setShowEarlier] = useState(false);
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
  const [mapsByDay, setMapsByDay] = useState<GuidesByDay>({});
  const [pictures, setPictures] = useState<GuidePicture[]>([]);
  // her illustrated map's panel for each day it covers (Kyoto, Oct 25–29) — lib/dayPanels
  const [panels, setPanels] = useState<PanelsByDay>({});
  const [summariesByDay, setDaySummaries] = useState<Record<string, string>>({});
  const scrolledFor = useRef<string | null>(null);

  // The rail sheet wasn't known when the day had to be drawn (a first open on a very slow signal): said, not silently missing
  const [sourcesPending, setSourcesPending] = useState<"no" | "coming" | "no-signal">("no");

  // Load (and reload when the signal comes back, so a saved copy doesn't linger).
  // Everything the day draws comes together: her Guide, the rail sheet, Wander's summaries, her other tabs, her maps and
  // pictures, and the day's plans added in Wander are asked for at once, and the day is drawn in one step when all are
  // known — this phone's saved copies when it has them, else what comes back, waiting at most EXTRAS_WAIT_MS. (Oct 10
  // re-audit: the day drew, then the summary and the 10:36 NOZOMI arrived and pushed it down 200–400 pt — even with the
  // day seen before, since the saved copies were put in a moment after the first drawing; for that moment, no train.)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let id = localStorage.getItem("wander:last-trip-id");
        if (!id) id = (await api.get<Trip | null>("/trips/active"))?.id || null;
        if (!id) { if (!cancelled) setState("unreachable"); return; }
        const tid = id;
        const got: { sources?: OtherSource[]; summaries?: Record<string, string>; notes?: NotesByTab; maps?: GuidesByDay; pictures?: GuidePicture[]; links?: SheetLinks; panels?: PanelsByDay } = {};
        // (the Next tab's day is worked out from her Guide; the phone's date is its best guess until then)
        const firstDate = now ? phoneToday() : /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
        // (her sheet's address too: a "from her … tab" line is a link in the first drawing — re-audit 2)
        const saved = { sources: savedSources(tid), summaries: savedDaySummaries(tid), notes: savedSheetNotes(tid), maps: savedAppleGuides(tid), pictures: savedGuidePictures(tid), links: savedSheetLinks(tid) ?? undefined, panels: savedDayPanels(tid) };
        const plansSaved = !firstDate || localStorage.getItem(`wander:day-plans:${tid}:${firstDate}`) !== null;
        const haveAll = (["sources", "summaries", "notes", "maps", "pictures", "links", "panels"] as const).every((k) => saved[k] !== undefined) && plansSaved;
        // (with this phone's copies, her Guide comes first and the rest refresh after — on a slow signal they'd only slow it)
        const asked = haveAll ? null : Promise.allSettled([
          sourcesData(tid).then((d) => { got.sources = d.sources; }),
          daySummaries(tid).then((s) => { got.summaries = s; }),
          sheetNotes(tid).then((n) => { got.notes = n; }),
          appleGuides(tid).then((g) => { got.maps = g; }),
          guidePictures(tid).then((p) => { got.pictures = p; }),
          sheetLinks(tid).then((l) => { got.links = l; }),
          dayPanels(tid).then((x) => { got.panels = x; }),
          // (kept where the plans' own loader below reads its saved copy first)
          firstDate ? api.get<DayChoice[]>(`/day-choices/${tid}?date=${firstDate}`).then((c) => { try { localStorage.setItem(`wander:day-plans:${tid}:${firstDate}`, JSON.stringify(c)); } catch { /* full */ } }) : null,
        ]);
        const d = await guideData(tid);
        // The city's first-time photo, asked for now — it shows only if it's ready when the day is drawn (Oct 10 re-audit:
        // landing a moment later, it covered a day being read). When it's due — you're in that city, it hasn't been shown
        // on this phone — the day gives it at most PHOTO_GRACE_MS, once per city.
        const dayDate = firstDate || phoneToday();
        const dayCity = d.trip.cities.find((c) => c.id === d.days.find((x) => ymd(x.date) === dayDate)?.cityId);
        // (only a city of the trip's country has one — Julie's San Francisco days don't)
        const photoCity = dayCity && (!dayCity.country || dayCity.country === tripCountryOf(d.trip.cities)) ? dayCity.id : undefined;
        const photo = warmCityPhoto(photoCity);
        const cityDates = d.days.filter((x) => x.cityId === photoCity).map((x) => ymd(x.date)).sort();
        const photoDue = photoWanted(photoCity) && dayDate <= phoneToday() && cityDates[0] <= phoneToday() && phoneToday() <= cityDates[cityDates.length - 1];
        const known = () => (["sources", "summaries", "notes", "maps", "pictures", "links", "panels"] as const).every((k) => got[k] !== undefined || saved[k] !== undefined)
          && (!firstDate || localStorage.getItem(`wander:day-plans:${tid}:${firstDate}`) !== null);
        if (asked && !known()) await Promise.race([asked, new Promise((r) => setTimeout(r, EXTRAS_WAIT_MS))]);
        if (photoDue && photoWanted(photoCity)) await Promise.race([photo, new Promise((r) => setTimeout(r, PHOTO_GRACE_MS))]);
        if (cancelled) return;
        // (one step: React draws all of these together)
        setTripId(tid); setData(d);
        setOtherSources(got.sources ?? saved.sources ?? []);
        setSourcesPending(got.sources === undefined && saved.sources === undefined ? "coming" : "no");
        setDaySummaries(got.summaries ?? saved.summaries ?? {});
        setNotesByTab(got.notes ?? saved.notes ?? {});
        setMapsByDay(got.maps ?? saved.maps ?? {});
        setPictures(got.pictures ?? saved.pictures ?? []);
        setPanels(got.panels ?? saved.panels ?? {});
        setState("ready");
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
  // (your own today: Japan's date once your plane has landed there, whatever the phone's clock — Oct 10 audit)
  const today = travelerToday(items, me, tripZone, phoneToday());
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
  // (before the screen paints: this phone's copy is in the day's first drawing, so nothing drops in a moment later)
  useLayoutEffect(() => {
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
    // "Checking for plans…" only when the answer is slow — on a normal signal it came and went in a moment and the
    // lines under it moved up (Oct 10: the Next tab's "Tonight" shifted 1.5 s after the day drew)
    setChecking(false);
    const slow = setTimeout(() => { if (!cancelled) setChecking(true); }, 1200);
    load();
    window.addEventListener("wander:data-changed", load);
    return () => { cancelled = true; clearTimeout(slow); window.removeEventListener("wander:data-changed", load); };
  }, [tripId, date]);

  // After the day is drawn: Wander's answers replace this phone's copies only when they say something different (no jump
  // when nothing changed). The rail sheet (nothing shows if the trip has no other source); her other tabs' text, so "her
  // Guide doesn't say" is only said when none of her tabs does; her Apple Maps guides and pictures (Oct 2); summaries.
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    const same = <T,>(next: T) => (cur: T) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next);
    sourcesData(tripId)
      .then((d) => { if (!cancelled) setOtherSources(same(d.sources)); })
      .then(() => { if (!cancelled) setSourcesPending("no"); })
      // (the Guide still shows; with no copy on this phone, the day says its trains will come with signal)
      .catch(() => { if (!cancelled) setSourcesPending((p) => (p === "no" ? p : "no-signal")); });
    sheetNotes(tripId).then((n) => { if (!cancelled) setNotesByTab(same(n)); });
    appleGuides(tripId).then((g) => { if (!cancelled) setMapsByDay(same(g)); });
    guidePictures(tripId).then((p) => { if (!cancelled) setPictures(same(p)); });
    dayPanels(tripId).then((x) => { if (!cancelled) setPanels(same(x)); });
    daySummaries(tripId).then((s) => { if (!cancelled) setDaySummaries(same(s)); });
    return () => { cancelled = true; };
  }, [tripId]);
  // Deadlines marked done in Wander by the person they're for (Oct 9) — "Don't miss" stops asking, the card says done
  const [doneMarks, setDoneMarks] = useState<Map<string, Mark>>(() => (tripId ? savedMarks(tripId) : new Map()));
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    const get = () => loadMarks(tripId).then((m) => { if (!cancelled) setDoneMarks(m); });
    get();
    window.addEventListener("wander:marks-changed", get);
    return () => { cancelled = true; window.removeEventListener("wander:marks-changed", get); };
  }, [tripId]);
  // The storm, warning and train watch (Ken's decision 2, Oct 13: "yes" — services/stormWatch): silent unless Japan's
  // weather agency has a warning, a chance of warning-level weather or a typhoon near this person's places; its lines
  // lead "Don't miss" on those days. Asked again every 10 minutes while the page is open.
  const [watch, setWatch] = useState<Record<string, { kind: string; text: string; link?: { label: string; url: string } }[]>>({});
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    let askedAt = 0;
    const get = () => { askedAt = Date.now(); api.get<{ days: typeof watch }>(`/weather/trip/${tripId}/watch`)
      .then((w) => { if (!cancelled && w?.days && typeof w.days === "object") setWatch(w.days); }).catch(() => {}); };
    get();
    // (not while the page is hidden — a tab left open on a Mac asked every 10 minutes all night and kept the database
    // awake; back in view after 10 minutes or more, it asks at once — cost audit, Oct 16)
    const t = setInterval(() => { if (document.visibilityState !== "hidden") get(); }, 10 * 60_000);
    const onShow = () => { if (document.visibilityState === "visible" && Date.now() - askedAt >= 10 * 60_000) get(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { cancelled = true; clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, [tripId]);
  // The hours rain is likeliest, from the same forecast the band says (days up to 3 ahead), for "Play the day" — which
  // has no band: said there on the moment it first touches (Oct 15: "before they realize they want it")
  // Your photos and the ones shared, for "Play the day" — each after the moment it was taken in
  const [dayPhotos, setDayPhotos] = useState<TripPhoto[]>([]);
  useEffect(() => {
    if (!tripId) return;
    let live = true;
    setDayPhotos(savedPhotos(tripId, date) || []);
    const get = () => photosOf(tripId, date).then((r) => { if (live && r) setDayPhotos(r.photos); });
    get();
    window.addEventListener(PHOTOS_CHANGED, get);
    return () => { live = false; window.removeEventListener(PHOTOS_CHANGED, get); };
  }, [tripId, date]);
  // Backroads' moments for the day, when it's one of theirs (for "Play the day" on a day her Guide gives a line or two)
  type DocMoment = { title: string; words?: string; place?: string; photoNote?: string; length?: string; bring?: string; kind?: string; her?: "meeting" | "checkout" | "lunch" | "dinner" };
  const [docDay, setDocDay] = useState<{ from: string; name: string; day: number; page: number; moments: DocMoment[] } | null>(null);
  // (Play waits for the answer: on a slow load it offered her lines alone for a moment before Backroads' day came —
  // tourist78)
  // (the day the answer is for — "Play tomorrow" from Oct 17 drew Oct 18 once with Oct 17's answer, opened a Play of
  // her lines alone, and lost it when Oct 18's own answer came; user-andy2)
  const [docAskedFor, setDocAskedFor] = useState<string | null>(null);
  const docAsked = docAskedFor === date;
  useEffect(() => {
    if (!tripId) return;
    let live = true;
    setDocDay(null);
    api.get<{ day: typeof docDay }>(`/guide/day-moments/${tripId}/${date}`).then((r) => { if (live) setDocDay(r.day || null); })
      .catch(() => { /* her lines alone */ }).finally(() => { if (live) setDocAskedFor(date); });
    return () => { live = false; };
  }, [tripId, date]);
  const [dayRain, setDayRain] = useState<{ wet?: [number, number][]; showers?: [number, number][] } | null>(null);
  useEffect(() => {
    if (!tripId) return;
    let live = true;
    setDayRain(savedDayForecast(tripId, date));
    dayForecastFor(tripId, date).then((f) => { if (live && f) setDayRain(f); }).catch(() => {});
    return () => { live = false; };
  }, [tripId, date]);

  // The day in the order it's lived (lib/guideDisplay.ts). Deadlines appear on every day of their
  // window; Larisa's budget and bookkeeping notes sit apart from the plan.
  const { dayItems, planningNotes, stopNotes, planBlocks, forecast } = useMemo(() => {
    // (another party's to-do — Larisa's Robuchon reminder on Julie's days — isn't among your lines; Oct 10 audit)
    const onDay = withCheckoutWho(items.filter((i) => (i.kind === "deadline" ? deadlineOnDate(i, date) && !othersPartysJob(i, items, me) : ["stop", "block", "weather"].includes(i.kind) ? false : ymd(i.date) === date) && !isFragment(i)), date, stays, items);
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
  }, [items, date, stays, tripZone, me]);
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
  // The city's photo behind the city band, a city in the trip's country only ("Wander in pictures", idea 1; Oct 15)
  const bandCity = trip?.cities.find((c) => c.id === (day?.cityId || night.stays[0]?.stay.cityId));
  const bandPhoto = useCityBandPhoto(bandCity?.id, !!bandCity && !!trip && (!bandCity.country || bandCity.country === tripCountryOf(trip.cities)));
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
      // (the day's own first train when every one of yours is drawn in the day — day review, Oct 4)
      requestAnimationFrame(() => (document.querySelector("[data-train]") || document.getElementById("trains"))?.scrollIntoView({ block: "center" }));
      return;
    }
    const id = location.hash.startsWith("#item-") ? location.hash.slice(6) : null;
    if (!id || scrolledFor.current === `${date}:${id}`) return;
    scrolledFor.current = `${date}:${id}`;
    // (opened first, then brought into view — scrolled first, the card opened under the reader and the day below it
    // moved; verify 6)
    setHighlight(id);
    setTimeout(() => setHighlight(null), 2500);
    // (its heading below the bar at the top — a card taller than half the screen centred had its name and time under
    // the header; user-julie1, Oct 16)
    // (and again while the day above it is still filling in — the forecast, a photo — which pushed its time and Maps
    // under the header after it had landed right; user-julie2. Never once they've started scrolling themselves.)
    let touched = false;
    const mark = () => { touched = true; };
    window.addEventListener("touchstart", mark, { once: true, passive: true });
    window.addEventListener("wheel", mark, { once: true, passive: true });
    const place = () => {
      const el = document.getElementById(`item-${id}`);
      if (!el || touched) return;
      el.style.scrollMarginTop = "104px";
      const top = el.getBoundingClientRect().top;
      if (top < 96 || top > window.innerHeight * 0.75) el.scrollIntoView({ block: el.offsetHeight > window.innerHeight * 0.5 ? "start" : "center" });
    };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(`item-${id}`);
      if (!el) return;
      el.style.scrollMarginTop = "104px";
      el.scrollIntoView({ block: el.offsetHeight > window.innerHeight * 0.5 ? "start" : "center" });
    }));
    setTimeout(place, 700);
    setTimeout(place, 1600);
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
  // The train you're on now (Ken's rail sheet, by its times): until it arrives, arriving is what's next — her lines timed
  // before then aren't "Next" (round 12: on the 1:30 PM HARUKA, Now said "Next · in 15 min · ~2:00–2:30 Arrive KIX", her
  // arrival for her own 12:30 departure)
  const railMin = (t: string) => (t ? toMin(t.padStart(5, "0")) : null);
  const riding = isToday ? otherSources.flatMap((s) => {
    const a = railAudience(items, s.owner);
    return s.rail.filter((r) => r.date === date && isBookedTrain(r) && legIsFor(r, s, me, a.ownerParty, a.groupSize))
      .map((r) => ({ dep: railMin(colOf(r.cols, /^depart/)), arr: railMin(colOf(r.cols, /^arrive/)) }));
  }).find((x) => x.dep !== null && x.arr !== null && x.arr > x.dep && x.dep < tripNow && tripNow < x.arr) : undefined;
  // Her "Arrive KIX" line, on a day the rail sheet books that train at another time than her tab: the booked arrival, said
  // on her line (as Home does)
  const railArrivals: Record<string, string> = {};
  for (const s of otherSources) {
    const a = railAudience(items, s.owner);
    for (const r of s.rail.filter((x) => x.date === date && isBookedTrain(x) && legIsFor(x, s, me, a.ownerParty, a.groupSize) && s.differs.some((d) => d.date === date && d.row === x.row))) {
      const to = (colOf(r.cols, /^route$/).split(/→|->/)[1] || "").trim().split(/[\s(]/)[0];
      const arr = colOf(r.cols, /^arrive/);
      if (!to || !arr) continue;
      for (const b of planBlocks) if (b.time && /\barriv/i.test(b.title) && new RegExp(`\\b${to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(b.title)) railArrivals[b.id] = twelveHour(arr);
    }
  }
  // …and while you're on it, her plan's "now" line waits: the train is where you are (Sweep B, Oct 29 at 2 PM: "On the
  // train now… arriving 2:50 PM" under "Now, in Larisa's plan · Arrive KIX, until about 2:30 PM")
  // (a day that follows another list of hers — Oct 17, her "Tokyo Day 3" map list: her tab's map of the day is the plan set
  // aside, so it doesn't lead the day or Play)
  const daySwapped = planBlocks.some((b) => b.id.startsWith("swap-"));
  const currentBlock = isToday && !riding ? currentPlanLine(planBlocks, tripNow, me) : undefined;
  // Your booked meal under way leads her line at that hour (Sweep B: the Robuchon dinner's name flipped at 6:00 PM)
  // (never on a Japan date you're still at home — verify 4: "Now · Tapas Molecular Bar" for Julie the morning she flies)
  const mealNow = isToday && !riding && !homeOnJapanDate(items, me, date, tripZone) ? mealUnderWay([...dayItems, ...planBlocks], tripNow, me) : undefined;
  const mealLeads = !!mealNow && !!currentBlock && (!currentBlock.time || toMin(currentBlock.time) <= toMin(mealNow.time!));
  const currentUnowned = isToday && !riding && !currentBlock && !mealNow ? currentUnownedLine(planBlocks, tripNow) : undefined;
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
      // (not the meal under way, nor its hour again; never a line her other tab puts at another hour — Sweep A, Oct 28
      // at 8 PM: "NEXT · NOW — 8:00 PM · Cafe Ensou", the Shigaraki lunch café)
      && !(mealNow && i.time === mealNow.time) && !outvoted(i, [...dayItems, ...planBlocks])
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
  // A plan someone gave Scout before her Guide had it, now a line of her plan at the same time and naming the same place:
  // said once — her line, and under it whatever more they said (Oct 27: Larisa told Scout her new Tuesday the night
  // before her sheet's copy came; every stop showed twice, each of hers marked "not in your Guide", which it now was)
  const foldedInto = new Map<string, DayChoice[]>();
  const folded = new Set<string>();
  for (const c of choices) {
    if (!c.time || c._pending || pickTexts.has(c.text)) continue;
    const name = c.text.split(/\s[—–]\s|,|\(/)[0];
    const b = planBlocks.find((x) => x.time === c.time && sameThing(name, x.title));
    if (b) { foldedInto.set(b.id, [...(foldedInto.get(b.id) || []), c]); folded.add(c.id); }
  }
  const foldedNotes = (b: GuideItem) => (foldedInto.get(b.id) || []).flatMap((c) => {
    // (only what the plan says beyond her line: the words after its dash — "Bill settled, luggage transferred…")
    const more = c.text.includes(" — ") ? c.text.slice(c.text.indexOf(" — ") + 3).trim() : "";
    return more ? [<p key={`folded-${c.id}`} data-folded-plan className="text-sm text-[#514636] mt-1 [overflow-wrap:anywhere]">
      <span className="text-[#6b5d4a]">{me && c.addedBy === me ? "You added" : `${c.addedBy} added`}: </span>{more}</p>] : [];
  });
  const ownPlans = choices.filter((c) => !pickTexts.has(c.text) && !folded.has(c.id));
  // A plan added in Wander with a time sits in the day at its time, among her lines (Oct 8, Ken: "does it become an equal
  // item to activities extracted from the sheet?" — on Home and Next it did; here it waited in its own section); one with
  // no time stays under "Added in Wander". Always marked as added, never as hers.
  const timedOwn = ownPlans.filter((c) => !!c.time).sort((a, b) => a.time!.localeCompare(b.time!));
  const untimedOwn = ownPlans.filter((c) => !c.time);
  const addedPlan = (c: DayChoice, look: "card" | "row") => {
    const body = (
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
              <button onClick={async () => setNotice(await sendToGuideOwner(owner, planMessage(owner, c, me)))} className="min-h-[44px] text-sm text-[#514636]">
                Tell {owner}
              </button>
            )}
            <button onClick={() => setConfirmRemove(c.id)} aria-label={`Take ${c.text} off this day`} className="min-h-[44px] text-sm text-[#6b5d4a]">Take off this day</button>
          </div>
        )}
      </div>
    );
    const time = c.time ? clock(c.time) : <span className="text-[#6b5d4a]" aria-hidden>✦</span>;
    return look === "row"
      // (a row of her plan's list, tinted so it reads as the group's own)
      ? <li key={`added-${c.id}`} id={`added-${c.id}`} data-added className="flex gap-3 p-3 bg-[#fbf9f4]"><div className="w-20 shrink-0 text-right text-sm text-[#3a3128]">{time}</div>{body}</li>
      : <li key={`added-${c.id}`} id={`added-${c.id}`} data-added className="bg-white rounded-xl border border-[#e0d8cc] p-3"><div className="flex gap-3"><div className="w-16 shrink-0 text-right text-sm font-medium text-[#3a3128]">{time}</div>{body}</div></li>;
  };
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
  // (Next's own lines' photos — the same checked ones the day's list finds, each looked up by its own LinePhotos: a hook
  // here would sit below the loading screen's early return — React #310, caught before shipping)
  const lineCtx = { hotel: tonightHotel, dayWords: itineraryLines.map((l) => l.title).join(" "), bookings: dayItems.filter((m) => m.kind === "meal") };
  // The day's weather in the city band: the live forecast for where you are (components/DayForecast — Ken, Oct 10: "It
  // should be your best internet forecast available at run time"); her pre-trip line only when there's none
  const forecastCity = trip?.cities.find((c) => c.name === cityName) || null;
  const weather = (forecastCity?.latitude != null || forecast) ? (
    <DayForecast tripId={tripId} lat={forecastCity?.latitude} lon={forecastCity?.longitude} date={date} zone={tripZone} place={cityName}
      herLine={forecast?.title || null} her={v.Her} />
  ) : null;
  // Each booking said once, under her line for it (day review, Oct 4: Oct 29's flight three times, Oct 15's Yazawa and
  // Oct 25's Shiraume three times — her line, then the booking again under "Also in her Guide"): a booking at the same
  // time naming the same thing (saidAgain), and a check-out beside her line that says "check out" at that hotel
  const underLine = new Map<string, GuideItem[]>();
  if (planBlocks.length) for (const o of otherItems) {
    const b = planBlocks.find((x) => !choicesOf(x).length && saidAgain(x, o))
      || (o.kind === "checkout" ? planBlocks.find((x) => /check[\s-]?out/i.test(x.title) && sameThing(o.title.replace(/^Check out · /, ""), x.title)) : undefined);
    if (b) underLine.set(b.id, [...(underLine.get(b.id) || []), o]);
  }
  const shownUnder = new Set([...underLine.values()].flat());
  const alsoItems = otherItems.filter((o) => !shownUnder.has(o));
  // Her Itinerary's heading for the day, in her shorthand ("day 1 - JA Arrive (evening), KL day trip to Mashiko"), on a
  // day without her plan: said once, quietly, atop the day — as a day with her plan says it — not one more card among the
  // lines it sums up (day review, Oct 8: Oct 14's second card, its "still open" line said twice). Its own notes stay,
  // unless another line of the day already says them.
  // (her "day 1 - …" heading, or the kind of day in plain words — Oct 8's "travel day"; never a short line that names a
  // place or a thing, like Oct 6's "Rikuro Cheesecake")
  const headline = planBlocks.length ? undefined : alsoItems.find((i) => !i.time && !i.forWhom && /^Itinerary · Description/.test(i.source)
    && (/^(?:[A-Za-z]+\s+)?day\s*\d+\s*[-–]/i.test(i.title.trim()) || (/^(travel|rest|free|open|flex|arrival|departure|down|lazy)\s+day$/i.test(i.title.trim()) && !(i.detail || "").trim()))
    && alsoItems.some((o) => o !== i && o.kind !== "checkout"));
  const headlineMore = headline ? (headline.detail || "").split("\n").map((l) => l.trim())
    .filter((l) => l && !alsoItems.some((o) => o !== headline && (o.detail || "").includes(l))) : [];
  // (a to-do marked done isn't shown — Ken, Oct 14: "if it is done or out of date, you don't show it"; the fresh photo
  // check, Oct 17: "Passed · Reconfirm the La Table… Done — you, Oct 14" sat on Oct 10 through 14)
  const listItems = (headline ? alsoItems.filter((o) => o !== headline) : alsoItems).filter((o) => !(o.kind === "deadline" && doneMarks.has(deadlineKey(o))));
  // Your trains, each said once in the day itself (day review, Oct 4: every booked train was said twice — in the day and in
  // full under "Trains"): under her line when it names the train ("Board reserved HARUKA" ↔ HARUKA 31), else at its time;
  // on your landing day the airport leg with no booking follows the landing. Only what's drawn here leaves "Trains".
  const railMine = otherSources.flatMap((s) => {
    const a = railAudience(items, s.owner);
    return s.rail.filter((r) => r.date === date && legIsFor(r, s, me, a.ownerParty, a.groupSize)).map((r) => ({ s, r }));
  });
  const railKey = (x: { s: OtherSource; r: RailRow }) => `${x.s.id}-${x.r.row}`;
  // whose job a ticket pickup is ("Ken & Larisa"), said to everyone else
  const pickupByFor = (s: OtherSource) => { const { ownerParty } = railAudience(items, s.owner); return ownerParty && !isFor({ forWhom: ownerParty }, me) ? ownerParty : null; };
  const bookedMine = railMine.filter((x) => isBookedTrain(x.r));
  const trainsUnder = new Map<string, { s: OtherSource; r: RailRow }[]>();
  if (planBlocks.length) for (const x of bookedMine) {
    const name = colOf(x.r.cols, /^train$/);
    const b = name ? planBlocks.find((p) => sameThing(name, p.title)) : undefined;
    if (b) trainsUnder.set(b.id, [...(trainsUnder.get(b.id) || []), x]);
  }
  const nestedTrains = new Set([...trainsUnder.values()].flat().map(railKey));
  const listDrawn = !(dayItems.length === 0 && choices.length === 0 && planBlocks.length === 0);
  // "Play the day" on a day her Guide gives no timed plan (Oct 15 2026 — Ken: "Create play every day. Use what you have
  // from the backroads content."): a Backroads day is their itinerary's moments in its order, in their words, with her
  // own lines where they are those moments (the 8:30 meeting, her dinner, the check-out); any other day is her lines in
  // the list's order. A time only where she gives one — Backroads gives lengths, never start times.
  const dayPlay = (() => {
    const places: Record<string, { query: string; line: string; note?: string }> = {};
    if (planBlocks.length) return { moments: [] as Moment[], places, stops: [] as string[], notes: [] as string[] };
    const hm = (t: string | null | undefined) => (t && /^\d{2}:\d{2}/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
    const firstSentence = (t: string) => (t.replace(/^…/, "").match(/^.*?[.!?](?=\s|$)/)?.[0] || t).trim();
    const herDetail = (i: GuideItem) => (i.detail || "").split("\n").map((l) => l.trim()).filter((l) => l && !/^(Her Dining Resos tab lists|Her note: see|Wander )/.test(l));
    const base = { map: null, hit: null, trains: [] as string[], forWhom: null, isNow: false };
    const KIND: Record<string, string> = { meet: "car", shuttle: "car", meal: "meal", sake: "meal", bike: "bike", shrine: "temple", temple: "temple", hotel: "hotel", raft: "outdoors", onsen: "outdoors", hike: "outdoors", walk: "outdoors", town: "outdoors", train: "train" };
    if (docDay && docAsked) {
      const meals = dayItems.filter((i) => i.kind === "meal" && !/^(day \d|see above)/i.test(i.title));
      const herLine = (k: string) => k === "meeting" ? dayItems.find((i) => i.kind === "meeting")
        : k === "checkout" ? dayItems.find((i) => i.kind === "checkout")
        : k === "lunch" ? dayItems.find((i) => i.kind === "meal" && /\blunch\b/i.test(i.title))
        : meals.find((i) => !!i.time) || meals.find((i) => !/\blunch\b/i.test(i.title));
      const moments = docDay.moments.flatMap((d, k): Moment[] => {
        const her = d.her ? herLine(d.her) : undefined;
        if (d.her && !her && !d.words) return [];
        const id = `doc-${date}-${k}`;
        const named = !!her && (d.her === "dinner" || d.her === "checkout");
        // (their words as the itinerary has them, "…" where a sentence goes on in the next moment — cut, "set out on foot…"
        // started in lower case and "…along the way" ended with no stop; tourist78)
        const words = (d.words || "").trim();
        // (the sentence its title names, when it isn't the first — "Lake Yumoto and Yudaki Falls" showed Backroads'
        // opening "Today is dedicated to … Lake Chuzenji"; user-larisa2, Oct 16)
        const sentences = words.replace(/^…/, "").match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)?.map((x) => x.trim()) || [];
        const keys = d.title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 4);
        const named1 = sentences.findIndex((x) => keys.some((k) => x.toLowerCase().includes(k)));
        // (and both sentences when the title names something in each — "An art tour, the onsen or a massage" quoted only
        // the onsen one; a sentence that adds nothing the title names isn't added — "Lake Yumoto…" stays off "…Lake
        // Chuzenji"; user-larisa3. Checked against all 39 moments: scratchpad said-compare.mjs, 4 change)
        const keys2 = d.title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !SAID_STOP.has(w));
        const has = (i: number) => new Set(keys2.filter((k) => sentences[i].toLowerCase().includes(k)));
        const adds = (a: number, b: number) => [...has(a)].some((k) => !has(b).has(k));
        const hits = sentences.map((x, i) => (keys2.some((k) => x.toLowerCase().includes(k)) ? i : -1)).filter((i) => i >= 0);
        const [lo, hi] = [hits[0], hits[hits.length - 1]];
        const said = !words ? null
          : hits.length && hi - lo === 1 && adds(lo, hi) && adds(hi, lo) ? sentences.slice(lo, hi + 1).join(" ")
          : named1 > 0 ? sentences[named1] : (/^…/.test(words) ? `…${firstSentence(words)}` : firstSentence(words));
        // (under her own line — "Ritz Carlton - Japanese Dinner" — Backroads' "we meet for a welcome reception…" read as
        // hers: there, their words say whose they are; user-larisa1, Oct 16)
        const note = said ? (named ? `${docDay.from}: “${said}”` : said) : her ? herDetail(her)[0] || null : null;
        const full = [words, d.bring || ""].filter(Boolean).join("\n\n");
        // (the lookup's "same place?" check is asked about the place itself — chosen from Backroads' own words — or what
        // the photo is meant to show: given the whole sentence it refused towns and lakes as "not a single venue", Lake
        // Chuzenji among them; Oct 16)
        if (d.place) places[id] = { query: d.place, line: d.photoNote ? `${d.place} — ${d.photoNote}` : d.place, note: d.photoNote };
        else if (named && d.her === "dinner") places[id] = { query: her!.title, line: her!.title };
        // (her line's map, as the day's page has it — the 8:30 meeting had no way to the Courtyard by Marriott in Play;
        // user-larisa3. Not the check-out: that's the hotel you're in)
        return [{ ...base, id, map: her && d.her !== "checkout" ? planMapHref(her, {}) ?? (mapsQueryFor(her) ? mapsLink(mapsQueryFor(her)!) : null) : null, title: named ? itemTitle(her!, stays, date) : d.title, note,
          // (no countdown from a check-out's time: that's the hotel's latest — on Oct 18 they leave before the 8:30
          // meeting, and Play said "This afternoon"; tourist78)
          time: her?.time ? timeLabel(her, dayItems) : null, start: d.her === "checkout" ? null : hm(her?.time),
          // (always there when it has their words: one long sentence was cut at three lines with nothing to open, and
          // a moment without the button didn't say whose words they were — user-andy1)
          full: words ? full : null, fullLabel: words ? `${docDay.from}' words` : undefined,
          info: [
            ...(d.length ? [d.length] : []),
            // ("Her Guide" didn't say whose to Andy — "Larisa's Guide", and "Your Guide" to her; user-ken2)
            ...(her && !named ? [`${v.Owners} Guide: “${her.title}”`] : []),
            // (her dinner line says it's hers, as the meeting's does — its title was her words with nothing to say so, under
            // Backroads' quote; user-larisa4)
            ...(named && d.her === "dinner" ? [`${v.Owners} Guide: “${her!.title}”`, ...herDetail(her!).slice(0, 1)] : []),
            // (the hotel's own time, as the day's screen says it — Play's "Morning · Check out" said nothing of the noon in
            // her screenshot; user-larisa2)
            // (and when to be out by, first, as the day's card says it — "The hotel's own check-out time is 12:00 PM" alone
            // read to Andy as his deadline on the morning they meet Backroads at 8:30; user-andy3)
            ...(named && d.her === "checkout" && her?.time ? (() => { const by = leaveBeforeCheckout(her, dayItems);
              return [...(by ? [`“${itemTitle(by, stays, date)}” is at ${timeLabel(by, dayItems)}, so check out before then`] : []), `The hotel's own check-out time is ${clock(her.time)}`]; })() : []),
          ],
          kind: KIND[d.kind || ""] }];
      });
      // (the day's own lines' photos too — her check-out, her dinner — for their cards on the day's page; Ken, Oct 17:
      // "Why aren't there pictures on the day?")
      for (const i of dayItems) if (["meal", "stop", "tour", "checkin", "checkout"].includes(i.kind)) places[`line-${i.id}`] = { query: i.title.replace(/^(Check (in|out)) · /, "").trim(), line: i.title };
      // (Backroads' own stops — not her lines — listed with their photos on the day's page, as Play shows them)
      const stops = docDay.moments.map((d, k) => (d.place && !d.her ? `doc-${date}-${k}` : null)).filter((x): x is string => !!x);
      // (said of the moments, not the summary above it — under Wander's summary of her plan, "From Backroads' general
      // itinerary" read as if the summary were Backroads'; user-larisa1)
      return { moments, places, stops, notes: [`The moments that follow are ${docDay.from}' general itinerary for their Day ${docDay.day}, with ${v.owners} Guide's own lines where they're the same moment. Details can differ for your departure.`] };
    }
    const shown = listItems.filter((i) => !["deadline", "weather"].includes(i.kind));
    // (the day you land, as the list has it: her lines with no time follow your landing — Oct 6 played "Osaka → Okayama"
    // before the 2:50 PM landing)
    const landing = myLanding && alsoItems.includes(myLanding) ? myLanding : null;
    const firstTimed = shown.findIndex((i) => !!i.time);
    const lead = landing && firstTimed > 0 ? shown.slice(0, firstTimed).filter((i) => i.kind !== "checkout") : [];
    const lines = lead.length ? shown.filter((i) => !lead.includes(i)).flatMap((i) => (i === landing ? [i, ...lead] : [i])) : shown;
    const moments = lines.map((i): Moment => {
      const id = `line-${i.id}`;
      const detail = herDetail(i);
      if (["meal", "stop", "tour", "checkin", "checkout"].includes(i.kind)) {
        const q = i.title.replace(/^(Check (in|out)) · /, "").trim();
        places[id] = { query: q, line: i.title };
      }
      return { ...base, id, title: itemTitle(i, stays, date), time: i.time ? timeLabel(i, dayItems) : null, start: hm(i.time),
        note: detail[0] && detail[0].length <= 140 ? detail[0] : null, full: detail.join("\n") || null, info: [] };
    });
    return { moments, places, stops: [] as string[], notes: [] as string[] };
  })();
  const timelineTrains = listDrawn ? bookedMine.filter((x) => !nestedTrains.has(railKey(x))) : [];
  const landingInList = !!myLanding && alsoItems.includes(myLanding);
  const landingLegs = landingInList && listDrawn ? railMine.filter((x) => !isBookedTrain(x.r)
    && x.r.row < Math.min(...bookedMine.filter((b) => b.s.id === x.s.id).map((b) => b.r.row))) : [];
  // Every other leg with no booking (a car, a taxi) in the day, by the rail sheet's own order: right after the booked train
  // before it — or just ahead of the next train when it goes to where that train leaves from (the car back to Utsunomiya
  // before the 4:58 PM, not after the 8:07 AM) — (day review, Oct 8: Oct 14's two Mashiko taxi legs sat under "More
  // trains", a screen below the trains they join). Only in the day's own timeline — on a day with her plan they stay in Trains.
  const legsAfter = new Map<string, { s: OtherSource; r: RailRow }[]>();
  const legsAhead = new Map<string, { s: OtherSource; r: RailRow }[]>();
  const ends = (r: RailRow) => colOf(r.cols, /^route$/).split(/→|->/).map((p) => p.trim()).filter(Boolean);
  if (!planBlocks.length) for (const x of [...railMine].sort((a, b) => a.r.row - b.r.row)) {
    if (isBookedTrain(x.r) || landingLegs.includes(x)) continue;
    const same = timelineTrains.filter((b) => b.s.id === x.s.id && b.r.tab === x.r.tab);
    const before = same.filter((b) => b.r.row < x.r.row).sort((a, b) => b.r.row - a.r.row)[0];
    const next = same.filter((b) => b.r.row > x.r.row).sort((a, b) => a.r.row - b.r.row)[0];
    const [from, to] = [ends(x.r)[0] || "", ends(x.r).slice(-1)[0] || ""];
    const toNext = !!next && !!to && sameThing(to, ends(next.r)[0] || "")
      && !(before && from && sameThing(from, ends(before.r).slice(-1)[0] || ""));
    if (before && !toNext) legsAfter.set(railKey(before), [...(legsAfter.get(railKey(before)) || []), x]);
    else if (next) legsAhead.set(railKey(next), [...(legsAhead.get(railKey(next)) || []), x]);
  }
  // …and on a day with no booked train beside it, by her line about the place it goes to or leaves from: the train to
  // Tokoname just before her Tokoname day, the one back just after; the train from Shirakabeso after its check-out
  const byTrain = new Set([...[...legsAfter.values(), ...legsAhead.values()].flat().map(railKey)]);
  const legsBeforeLine = new Map<string, { s: OtherSource; r: RailRow }[]>();
  const legsAfterLine = new Map<string, { s: OtherSource; r: RailRow }[]>();
  if (!planBlocks.length && listDrawn) for (const x of [...railMine].sort((a, b) => a.r.row - b.r.row)) {
    if (isBookedTrain(x.r) || landingLegs.includes(x) || byTrain.has(railKey(x))) continue;
    const [from, to] = [ends(x.r)[0] || "", ends(x.r).slice(-1)[0] || ""];
    if (!from || !to || from === to) continue;
    const lines = listItems.filter((i) => i.kind !== "deadline" && isFor(i, me));
    const names = (place: string, i: GuideItem) => distinctWords(place).length > 0 && sameThing(place, i.title);
    // (a line naming both ends is that journey, or its way back — the leg follows it: Oct 7's "8:30 AM Okayama → Bizen",
    // then the sheet's Okayama → Imbe and Imbe → Okayama, not both above it)
    const both = lines.find((i) => names(from, i) && names(to, i));
    const there = both ? undefined : lines.find((i) => names(to, i));
    const leaving = both || there ? undefined : lines.find((i) => names(from, i));
    if (there) legsBeforeLine.set(there.id, [...(legsBeforeLine.get(there.id) || []), x]);
    else if (both || leaving) legsAfterLine.set((both || leaving)!.id, [...(legsAfterLine.get((both || leaving)!.id) || []), x]);
  }
  const placedTrains = new Set([...nestedTrains, ...timelineTrains.map(railKey), ...landingLegs.map(railKey), ...byTrain,
    ...[...legsBeforeLine.values(), ...legsAfterLine.values()].flat().map(railKey)]);
  // The line that's now opens by itself (day design step 3, with the UX review): today, the train you're on, else the
  // sooner of your next booked train and her next timed line for you — the Next tab's own reckoning (riding,
  // upcomingGuide); on a day ahead, its first timed line. A past day stays short. Only in the day's own timeline — her
  // plan marks its own "now". Earlier timed lines today are quieter, never hidden; a line with no time never is.
  const depOf = (x: { r: RailRow }) => railMin(colOf(x.r.cols, /^depart/));
  const arrOf = (x: { r: RailRow }) => railMin(colOf(x.r.cols, /^arrive/));
  const nowLine = (() => {
    if (planBlocks.length || !listDrawn || date < today) return null;
    const trains = [...timelineTrains].filter((x) => depOf(x) !== null).sort((a, b) => depOf(a)! - depOf(b)!);
    const lineAt = (i: GuideItem) => tripClockMinutes(i, tripZone);
    if (isToday) {
      const onIt = riding ? trains.find((x) => depOf(x) === riding.dep) : undefined;
      if (onIt) return { key: `train-${railKey(onIt)}`, at: depOf(onIt)! };
      const nextTrain = trains.find((x) => depOf(x)! >= tripNow);
      const next = upcomingGuide && listItems.includes(upcomingGuide) ? upcomingGuide : undefined;
      if (nextTrain && (!next || depOf(nextTrain)! <= lineAt(next))) return { key: `train-${railKey(nextTrain)}`, at: depOf(nextTrain)! };
      return next ? { key: `item-${next.id}`, at: lineAt(next) } : null;
    }
    // (on a Japan date you're still at home, only a line naming you — re-audit 2: Julie's Oct 13 opened Ken & Larisa's
    // 8 PM dinner by itself, with nothing saying whose it was)
    const stillHome = !!homeOnJapanDate(items, me, date, tripZone);
    const first = listItems.filter((i) => i.time && isFor(i, me) && (!stillHome || (!!i.forWhom && !/^everyone$/i.test(i.forWhom)))
      && !["deadline", "checkout", "checkin"].includes(i.kind)).sort((a, b) => lineAt(a) - lineAt(b))[0];
    if (trains[0] && (!first || depOf(trains[0])! <= lineAt(first))) return { key: `train-${railKey(trains[0])}`, at: depOf(trains[0])! };
    return first ? { key: `item-${first.id}`, at: lineAt(first) } : null;
  })();
  const pastLine = (i: GuideItem) => isToday && !!i.time && nowLine?.key !== `item-${i.id}`
    && (i.endTime ? toMin(i.endTime) : tripClockMinutes(i, tripZone)) < tripNow && tripClockMinutes(i, tripZone) < (nowLine?.at ?? Infinity);
  const pastTrain = (x: { s: OtherSource; r: RailRow }) => isToday && nowLine?.key !== `train-${railKey(x)}` && (arrOf(x) ?? Infinity) < tripNow;
  // Where her Guide has a train at another time: with the train on other days (today it's said at the top)
  const differsFor = (x: { s: OtherSource; r: RailRow }) => (isToday ? [] : x.s.differs.filter((d) => d.date === date && d.row === x.r.row));

  // "Today, don't miss" (day review, Oct 4): what you can't get wrong this day, each said once, right under the summary —
  // her open question for this day, today's disagreement between the sources, a train still to check, your own
  // deadline ending today, a line where her tabs name two places. Each points down to its line (↓). Before, these sat
  // scattered: Oct 6's SmartEX "PENDING" on the third screen, Oct 25's two e-bike meeting points on the second.
  const myDayWords = distinctWords(dayItems.filter((x) => isFor(x, me)).map((x) => `${x.title} ${x.detail || ""}`).join(" "));
  const travellers = new Set([...items.flatMap((x) => (x.forWhom || "").split(/\s*(?:&|,|\band\b)\s*/i)), owner || ""].map((s) => s.trim().toLowerCase()).filter(Boolean));
  const someoneElsesJob = (i: GuideItem) => { const a = bookedByName(i)?.split(/\s+/)[0]?.toLowerCase(); return !!a && !!me && travellers.has(a) && a !== me.trim().toLowerCase(); };
  const checks: { key: string; body: ReactNode; to?: string }[] = [
    // (the storm watch first: a warning or a typhoon outranks everything else on the day)
    // (only well-formed lines — an empty entry or a text that isn't words crashed the page; verify45)
    ...(Array.isArray(watch[date]) ? watch[date] : []).filter((l) => !!l && typeof l === "object" && typeof l.text === "string" && !!l.text
      && (!l.link || (typeof l.link === "object" && typeof l.link.url === "string" && /^https:\/\//.test(l.link.url) && typeof l.link.label === "string"))).map((l, i) => ({ key: `watch-${i}`, body: <>{l.text}{l.link && <> <a href={l.link.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{l.link.label}&nbsp;↗</a></>}</> })),
    ...(isToday ? otherSources.flatMap((s) => s.differs.filter((d) => d.date === date && differLive(d)).map((d) => ({ key: `differ-${s.id}-${d.row}-${d.guideSource}`, body: <DifferNote d={d} /> }))) : []),
    ...stopNotes.flatMap((s) => openQuestionsIn(`${s.title}\n${s.detail || ""}`)
      // only on a day whose own lines mention what it's about ("Bizen" on Oct 7; "Kenji" on Oct 14, not all of Tokyo) — and
      // only lines that are yours (Ken & Larisa's Kenji question led Julie's landing day; round 12)
      .filter((q) => distinctWords(q).some((w) => myDayWords.includes(w)))
      .map((q) => ({ key: `q-${s.id}-${q}`, body: <>Still open in {v.her} Guide: “{q}”</> }))),
    ...bookedMine.flatMap((x) => {
      const ready = colOf(x.r.cols, /^boarding readiness/, /readiness/);
      const day = ready ? dateInText(ready, Number(date.slice(0, 4))) : null;
      // (a status settled by hand — "DONE — SmartEX: verify…" — isn't a check any more, whatever words it kept)
      if (!ready || (day && day < today) || isSettledStatus(ready) || !/pending|verify|unverified|not yet|confirm/i.test(ready)) return [];
      // (your train is drawn in the day or in "More trains" — the same id either way)
      return [{ key: `ready-${railKey(x)}`, to: `train-${railKey(x)}`,
        body: <>Check before the {twelveHour(colOf(x.r.cols, /^depart/))} {colOf(x.r.cols, /^train$/)}: {withTwelveHour(ready.split(/(?<=[.;])\s+/)[0]).replace(/;$/, ".")}</> }];
    }),
    // (not one that asks nothing — "Free cancellation ends" is "nothing to do unless plans change"; Oct 10 audit)
    ...dayItems.filter((i) => i.kind === "deadline" && ymd(i.date) === date && !deadlineOver(i, tripZone) && !doneMarks.has(deadlineKey(i)) && isFor(i, me) && !someoneElsesJob(i) && !isFreeCancel(i))
      .map((i) => ({ key: `deadline-${i.id}`, to: `item-${i.id}`, body: <>Deadline: {itemTitle(i, stays, date)}</> })),
    // …and one ending today that's the job of someone you travel with — said as theirs (day review, Oct 8: on Oct 14 Ken's
    // page had Larisa's last day to reconfirm Robuchon only as a card below dinner; Julie and Andy don't get it)
    ...dayItems.filter((i) => i.kind === "deadline" && ymd(i.date) === date && !deadlineOver(i, tripZone) && !doneMarks.has(deadlineKey(i)) && isFor(i, me) && someoneElsesJob(i)
      && (partyOf(items, me) || "").toLowerCase().split(/\s*(?:&|,|\band\b)\s*/).includes(bookedByName(i)!.split(/\s+/)[0].toLowerCase()))
      .map((i) => ({ key: `deadline-${i.id}`, to: `item-${i.id}`, body: <>{bookedByName(i)!.split(/\s+/)[0]}'s to-do, last day today: {itemTitle(i, stays, date)}</> })),
    // (her line, or the booking under it when that's where the difference is said — never both)
    ...[...planBlocks.filter((b) => !(underLine.get(b.id) || []).some((o) => tabsDiffer(o).length > 0)), ...otherItems].filter((b) => b.kind !== "flight" && isFor(b, me) && tabsDiffer(b).length > 0
      && !(b.time && isToday && otherSources.some((s) => s.differs.some((d) => d.date === date && d.guideSays === (b.endTime ? `${twelveHour(b.time!)}–${twelveHour(b.endTime)}` : twelveHour(b.time!))))))
      .map((b) => ({ key: `two-${b.id}`, to: `item-${b.id}`, body: <>{b.title.replace(/^./, (c) => c.toUpperCase())}: {v.her} tabs say two different things</> })),
  ];
  // A Backroads day, in the band: "With Backroads · day 3 of 8" (their guides lead it; the summary says the rest)
  const guidedDays = days.filter((d) => d.dayType === "guided").map((d) => ymd(d.date)).sort();
  const backroadsDay = day?.dayType === "guided" ? guidedDays.indexOf(date) + 1 : 0;
  // Tomorrow's first thing: the earliest with a time among her Itinerary's lines, her detailed plan for the day and your
  // booked trains (journeys check, Oct 10: Andy's Next said "Tomorrow · 6:30 PM · Yakiniku Yazawa" when Oct 15 starts
  // at 8:30 at Tsukiji in her day tab; Ken's said "Tomorrow · Check out" with the 10:36 NOZOMI unmentioned). Her
  // Itinerary's untimed line only when nothing has a time.
  const tomorrowDate = addDays(date, 1);
  const tomorrowLead = (() => {
    if (!(now && isToday && !upcomingGuide && !upcomingChoice && date < last)) return null;
    const guide = leadItem(sortDay(items.filter((i) => ymd(i.date) === tomorrowDate && !["deadline", "stop", "weather", "block"].includes(i.kind) && isFor(i, me) && !isPlanningNote(i) && !isFragment(i))));
    const at = (i: GuideItem) => tripClockMinutes(i, tripZone);
    const plan = items.filter((b) => b.kind === "block" && ymd(b.date) === tomorrowDate && !!b.time && (isFor(b, me) || !b.forWhom)).sort((a, b) => at(a) - at(b))[0];
    const train = otherSources.flatMap((s) => {
      const a = railAudience(items, s.owner);
      return s.rail.filter((r) => r.date === tomorrowDate && isBookedTrain(r) && legIsFor(r, s, me, a.ownerParty, a.groupSize));
    }).map((r) => ({ r, dep: railMin(colOf(r.cols, /^depart/)) })).filter((x) => x.dep !== null).sort((a, b) => a.dep! - b.dep!)[0];
    const timed: { min: number; item?: GuideItem; train?: RailRow }[] = [
      ...(guide?.time ? [{ min: at(guide), item: guide }] : []),
      ...(plan ? [{ min: at(plan), item: plan }] : []),
      ...(train ? [{ min: train.dep!, train: train.r }] : []),
    ].sort((a, b) => a.min - b.min);
    return timed[0] || (guide ? { min: -1, item: guide } : null);
  })();
  const tomorrowFirst = tomorrowLead?.item || null;
  const tomorrowTrain = tomorrowLead?.train || null;

  return (
    <div className="min-h-[100dvh] bg-[#faf8f5] pb-32">
      {/* Header: where you are, how to get back, and the neighbouring days */}
      <header className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur border-b border-[#e0d8cc] px-2 top-bar pb-2">
        <div className="flex items-center gap-1">
          {now ? (
            // (the phrases are the bar's 日, on every screen — Ken, Oct 16: "Why are phrases now in the upper left and bottom
            // right?"; one way in. The room is kept so the day stays centred)
            <div className="min-w-[44px]" aria-hidden />
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
          <div className="relative overflow-hidden pt-5 pb-4" style={{ backgroundColor: pastel, borderBottom: `3px solid ${cityAccent(pastel)}` }}>
            {/* The city's photo behind the band, once it's ready — the band keeps its height, so nothing below moves
                (Ken, Oct 15: pictures lead, the day's facts stay where they are; "the look was beautiful") */}
            {bandPhoto?.src && (
              <>
                <img src={bandPhoto.src} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover motion-safe:animate-[fadeIn_.6s_ease-out]" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(24,16,8,.30) 0%, rgba(24,16,8,.48) 55%, rgba(24,16,8,.66) 100%)" }} aria-hidden />
                {(bandPhoto.place || bandPhoto.credit) && (
                  <p className="absolute right-3 bottom-0.5 text-[10px] text-white/75 max-w-[60%] truncate">{[bandPhoto.place, bandPhoto.credit].filter(Boolean).join(" · ")}</p>
                )}
              </>
            )}
            {/* Just the city: the date and the way here ("Tokyo → Nikko") are in the bar above, and Backroads in the
                day's note — said three times, they crowded the top of the screen (map review, Oct 1 2026) */}
            {/* (the same column as the day below it — on an iPad the name sat 16 px left of it; tester t5) */}
            {/* With the day's quiet facts under the name — her weather, the Backroads day — and "Send this day" beside it: the
                summary can then be the first thing below (day review, Oct 4: it started 435 pt down on Oct 6) */}
            {/* (over the photo, every word in the band is white with a soft shadow) */}
            <div className={`relative max-w-xl mx-auto px-4 ${bandPhoto ? "[&_*]:!text-white [text-shadow:0_1px_3px_rgba(0,0,0,.5)]" : ""}`}>
              <div className="flex items-end justify-between gap-2">
                {/* The first time a day in this city opens on this phone: the city's photo, for a moment (C2); a tap on the
                    name brings it back (Ken, Oct 8) */}
                {(() => {
                  const c = trip?.cities.find((x) => x.id === cityId);
                  const away = !!c && (!c.country || c.country === tripCountryOf(trip!.cities));
                  // By itself only when you've arrived — the day opened is today or past. Looking ahead from home used up
                  // the photo (Julie, tester t1: Kyoto's photo on Oct 10 in California, then none on Oct 23 in Kyoto)
                  // …and while you're in that city — not a week later looking back (tester t4: a photo missed with no
                  // signal turned up when Karatsu's day was opened from Tokyo)
                  const cityDates = days.filter((d) => d.cityId === cityId).map((d) => ymd(d.date)).sort();
                  const inCityNow = cityDates.length > 0 && cityDates[0] <= today && today <= cityDates[cityDates.length - 1];
                  // …and on the day you travel there, once you're there: after the booked train in arrives, or (no booked
                  // train) once you've reached tonight's place (Sweep B/C: Nagoya's photo played at 8:30 AM in Hakata)
                  const arriveBy = otherSources.flatMap((s) => { const a = railAudience(items, s.owner); return s.rail.filter((r) => r.date === today && isBookedTrain(r) && legIsFor(r, s, me, a.ownerParty, a.groupSize) && getsYouTo(colOf(r.cols, /^route$/), cityName)); })
                    .map((r) => railMin(colOf(r.cols, /^arrive/))).filter((m): m is number => m !== null).sort((a, b) => b - a)[0] ?? null;
                  // (…and on your landing day, not before you land — verify 4: Julie's "Arriving in Tokyo" played at 2 PM
                  // for her 3 PM landing)
                  const landsAt = dayItems.filter((i) => isLanding(i) && !!i.time && isFor(i, me) && (!i.timeZone || i.timeZone === tripZone)).map((i) => toMin(i.time!))[0] ?? null;
                  // (…and never before you've landed in Japan, whichever day is opened — verify 6: in the air with the
                  // phone on Japan time, tapping Tokyo on the map opened Oct 13 and used up the photo before landing)
                  const notThereYet = isToday && cityDates[0] <= today && ((landsAt !== null && tripNow < landsAt)
                    || (cityDates[0] === today && (arriveBy !== null ? tripNow < arriveBy : leaving.length > 0 && !arrivedForTonight(dayItems, me, tripNow, null))));
                  return <CityTitle cityId={cityId} cityName={cityName} dateWords={longDate(date)} photo={away && !!cityId} onPhoto={!!bandPhoto} auto={away && date <= today && inCityNow && !notThereYet && !beforeMyLanding(items, me, tripZone) && !location.hash.startsWith("#item-")} />;
                })()}
                {(planBlocks.length > 0 || dayItems.length > 0) && (
                  <div className="shrink-0 -mb-2">
                    <SendOut label="Send this day ›" title={`${longDate(date)} — ${cityName}`}
                      text={() => dayText({ date, city: cityName, overview: itineraryLines, plan: planBlocks, others: otherItems.filter((o) => !planBlocks.some((b) => saidAgain(b, o))), sleep: night.stays.map((n) => n.stay.name), owner: owner || "Larisa", tripZone,
                        trains: otherSources.flatMap((s) => { const a = railAudience(items, s.owner); return s.rail.filter((r) => r.date === date && isBookedTrain(r) && legIsFor(r, s, me, a.ownerParty, a.groupSize)); })
                          .map((r) => ({ time: colOf(r.cols, /^depart/), text: [colOf(r.cols, /^train$/), colOf(r.cols, /^route$/), colOf(r.cols, /^arrive/) ? `arrives ${twelveHour(colOf(r.cols, /^arrive/))}` : ""].filter(Boolean).join(" · ") }))
                          .filter((t) => /^\d{1,2}:\d{2}$/.test(t.time)) })} />
                  </div>
                )}
              </div>
              {backroadsDay > 0 && <p className="text-sm text-[#514636] mt-1">With Backroads · day {backroadsDay} of {guidedDays.length}</p>}
              {weather}
            </div>
          </div>
        );
      })()}

      <main className="px-4 pt-4 max-w-xl mx-auto">
        {!day && (!first || date < first || date > last) ? (
          <p className="text-sm text-[#6b5d4a] mt-6 text-center">This date isn't part of the trip.</p>
        ) : (
          <>
            {/* ("Send this day" — the day, in her words, to someone outside the four — is in the city band above) */}
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
            {afterTrip && (
              <p className="text-sm text-[#6b5d4a] mb-3">Welcome home. Here's the last day of the trip.{" "}
                <button type="button" onClick={() => navigate("/story")} className="min-h-[44px] text-[#514636] underline underline-offset-2">The story of the trip ›</button>
              </p>
            )}
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
              // (three hours: at 6:30 PM it still filled Julie's first screen and her 7 PM dinner was below it; verify 6)
              // (on the day's page too: at 9 PM Julie's page still led with the 3:00 PM landing and the way from Narita,
              // and said the landing three times — verify52. The landing stays in the day, by the clock)
              if (due && tripNow > toMin(land.time!) + 180) return null;
              // Only when the day has someone else's lines (round r1: Ken & Larisa's Oct 6 said "the others' plan" with
              // no one else in Japan)
              const others = dayItems.some((i) => i.forWhom && !/^everyone$/i.test(i.forWhom) && !isFor(i, me));
              // How to get from the airport to the hotel, when her Guide says nothing about it — said plainly, with where
              // to ask (round 12: Julie landed at Narita with only a Maps link to the hotel's address)
              const hotel = myTonight.stays[0]?.stay.name;
              const saysHow = dayItems.some((x) => x !== land && isFor(x, me) && x.kind !== "flight"
                && /\b(bus|limousine|narita express|n'?ex|haruka|skyliner|train|taxi|transfer|shuttle|car)\b/i.test(`${x.title} ${x.detail || ""}`))
                // (only your own legs — Ken & Larisa's Mashiko trains hid Julie's line; round 12)
                || otherSources.some((s) => { const a = railAudience(items, s.owner); return s.rail.some((r) => r.date === date && legIsFor(r, s, me, a.ownerParty, a.groupSize)); });
              const helpHome = !!hotel && !saysHow;
              // On the day's screen, only when it tells you something the landing line in the day doesn't: that the earlier
              // lines are the others', or how to get to the hotel (day review, Oct 4 — Ken: "not sure why it is there"; on
              // Oct 6, with no one else in Japan, it repeated the summary and the 2:50 PM line). Now keeps it as what's next.
              if (!now && !others && !helpHome) return null;
              const yours = phoneIsElsewhere(tripZone)
                ? ` (${zonedMoment(date, toMin(land.time!), tripZone).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).replace(",", "")} your time)`
                : "";
              return (
                <p className="text-sm text-[#3a3128] bg-white/70 border border-[#e0d8cc] rounded-lg px-3 py-2 mb-3">
                  {due
                    ? <>Your flight was due to land at {airport} at {clock(land.time)} {ZONE_LABEL[tripZone] || ""}{yours} — that's the schedule.{others ? " Anything earlier on this day is the others' plan." : ""}</>
                    : <>You land at {airport} at {clock(land.time)} {ZONE_LABEL[tripZone] || ""}{yours}{isToday ? " today" : ""}.{others ? " Anything earlier on this day is the others' plan." : ""}</>}
                  {(() => {
                    // Her own words about it from her other tabs, when she wrote any — quoted, with the tab; never "doesn't say"
                    // when a tab does (delight audit: her Hotel Options tab names the Limousine Bus and the Narita Express)
                    const ways = hotel ? airportWaysTo(notesByTab, hotel) : [];
                    return helpHome
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
                            <a href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(airport.replace(/\s*\([A-Z]{3}\)$/, "") + " Airport, Japan")}&destination=${encodeURIComponent(tonightHotel || hotel)}&travelmode=transit`}
                              target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Directions in Maps ↗</a>
                          </span>
                        </span>
                      : null;
                  })()}
                </p>
              );
            })()}

            {/* The day in a few sentences — what kind of day, its shape, what anchors the evening (Oct 2, Ken). Wander's
                words from her lines, said as Wander's; shown only while her day is what it was written from. First under
                the band (day review, Oct 4: "first the day in a few sentences, then what you can't get wrong, then the day
                by the clock"). Not on the Next tab: there the next stop leads. */}
            {/* The rail sheet wasn't on this phone when the day was drawn (a first open on a very slow signal) — said, so
                nobody reads the day as having no train (Oct 10 re-audit) */}
            {sourcesPending !== "no" && (
              <p role="status" className="text-sm text-[#514636] bg-white/70 border border-[#e0d8cc] rounded-lg px-3 py-2 mb-3">
                {sourcesPending === "coming"
                  ? "Still getting the train times from the rail sheet — they'll show in this day in a moment."
                  : "The rail sheet's train times aren't on this phone yet — they'll show here once you have signal."}
              </p>
            )}
            {/* Her own map of the day leads, on a day her illustrated map covers (Kyoto) — not on Next, where the next stop
                leads */}
            {!now && tripId && panels[date] && !daySwapped && (
              <DayPanelCard tripId={tripId} panel={panels[date]} Her={v.Owners} days={Object.values(panels).filter((p) => p.of === panels[date].of).length} />
            )}
            {!now && summariesByDay[date] && (
              <section aria-label="This day in brief" className="mb-4">
                {/* (to Larisa, Wander's words about her Guide in her voice: "your tabs name two…", "which you note is
                    likely kaiseki". The travellers' names stay as written — turning "Ken and Larisa" into "you and Larisa"
                    left the next sentence's "They check out…" pointing at Julie and Andy; verify 4, Oct 10) */}
                <p className="text-[15px] leading-relaxed text-[#3a3128]">{v.say(summariesByDay[date])}</p>
                <p className="text-xs text-[#6b5d4a] mt-1">Wander's summary of {v.owners} plan</p>
              </section>
            )}
            {!now && isToday && <NowJump />}
            {/* A note about today, from the top of the day (fresh notes audit, Oct 17: "+ Add a note for this day" sat four
                screens down; it stays there too — Ken, Oct 13) */}
            {!now && isToday && (
              <button type="button" onClick={() => { holdKeyboard(); navigate(`/notes?day=${date}`); }}
                className="-mt-2 mb-2 min-h-[44px] text-sm text-[#514636] underline underline-offset-2">
                ✎ A note about today
              </button>
            )}
            {/* What you can't get wrong this day, each once, pointing down to its line (the Next tab keeps its own order) */}
            {!now && (
              <DontMiss heading={isToday ? "Today, don't miss" : "Don't miss"} checks={checks}
                // the ticket pickup on its day — the sheet owner's couple's job (anyone else reaches its steps from the trains)
                cards={otherSources.flatMap((s) => {
                  const { ownerParty } = railAudience(items, s.owner);
                  if (!ownerParty || !isFor({ forWhom: ownerParty }, me)) return [];
                  return s.checklists.filter((c) => c.date === date).map((c) => <ChecklistCard key={`${s.id}-${c.tab}`} c={c} s={s} today={isToday} />);
                })} />
            )}
            {/* (Larisa's note for the whole stay sits at the bottom of each of its days, folded — on its first day at the
                top it read as that day's plan: Oct 6 led with tomorrow's Bizen; day review, Oct 4) */}
            {/* Her travel note in a stay's note, on the day whose own lines name where it goes ("Okayama -> Bizen" on the Bizen
                day, "PT1: Okayama -> Hakata" on the day to Karatsu) — the stay's own city doesn't count, so Oct 6 isn't
                told about tomorrow's Bizen (day review, Oct 4); the whole note stays folded at the bottom */}
            {/* (not when a train or leg in the day already goes between the places it names — Oct 8's "PT1: Okayama -> Hakata"
                and "PT2: Hakata -> Karatsu" above the NOZOMI 9 and the local that say it; day review, Oct 8) */}
            {/* (only a BOOKED train says it — an unbooked leg from the rail sheet says only "Local train", and her "Nagoya ->
                Tokoname (~40 min) via Meitetsu" was hidden behind it: Meitetsu, a separate station at Nagoya, appeared
                nowhere on Ken's Tokoname morning; verify8, Oct 11) */}
            {(() => {
              const routes = railMine.filter((x) => placedTrains.has(railKey(x)) && isBookedTrain(x.r)).map((x) => ends(x.r)).filter((p) => p.length > 1 && p.some((e) => distinctWords(e).length > 0));
              const toldByTrain = (t: string) => routes.some((p) => p.every((e) => distinctWords(e).length === 0 || sameThing(e, t)));
              // (…nor when one of the day's own lines already names that trip, both places the same way — Oct 8's
              // "Hakata → Karatsu: about 1¼–1½ hr by subway/JR Chikuhi Line" is her Itinerary's own line; verify9)
              const ownLines = [...dayItems, ...planBlocks].filter((x) => x.kind !== "stop").map((x) => x.title.toLowerCase());
              const toldByLine = (t: string) => [...t.matchAll(/\b([A-Z][A-Za-z]{3,})\s*-+\s*>\s*([A-Z][A-Za-z]{3,})/g)]
                // (and says how long or how — a bare "Okayama → Bizen" leaves her "~40 min local train" worth saying)
                .some(([, a, b]) => ownLines.some((l) => {
                  const i = l.indexOf(a.toLowerCase()), j = l.indexOf(b.toLowerCase(), i + 1);
                  return i >= 0 && j > i && /\b(\d|hrs?|min|by|train|subway|line|bus|taxi|shinkansen)\b/.test(l.slice(j + b.length, j + b.length + 80));
                }));
              const mine = distinctWords([...dayItems, ...planBlocks].filter((x) => isFor(x, me)).map((x) => `${x.title} ${x.detail || ""}`).join(" "));
              const notes = stopNotes.flatMap((s) => {
                const home = distinctWords(stopCity(s) || "");
                return (s.detail || "").split("\n").map((l) => l.match(/^Larisa's travel note: (.+)$/)?.[1]).filter((t): t is string => !!t)
                  // (by the places it names — her capitalised words — never "local" in "local train" meeting "Haruka-local")
                  .filter((t) => (t.match(/\b[A-Z][A-Za-z]{3,}\b/g) || []).map((w) => w.toLowerCase()).some((w) => !home.includes(w) && mine.includes(w)))
                  .filter((t) => !toldByTrain(t) && !toldByLine(t))
                  .map((t) => ({ key: `${s.id}-${t}`, t }));
              });
              return notes.map(({ key, t }) => (
                <p key={key} className="text-sm text-[#514636] mb-3"><span className="text-[#6b5d4a]">{v.Owners} travel note: </span>{t}</p>
              ));
            })()}
            {/* Her open question in a stay's note, up top on a day whose own lines name what it's about — only the
                question, in her words (round 12: Oct 7 led with "8:30 AM Okayama → Bizen" as settled; "WHERE IS BIZEN TOUR
                STARTING" was at the very bottom) */}
            {/* (on the day screen it's in "Don't miss" above) */}
            {now && stopNotes.flatMap((s) => openQuestionsIn(`${s.title}\n${s.detail || ""}`)
              // only on a day whose own lines mention what it's about ("Bizen" on Oct 7; "Kenji" on Oct 14, not all of Tokyo)
              // (and only lines that are yours — Ken & Larisa's Kenji question led Julie's landing day; round 12)
              .filter((q) => { const day = distinctWords(dayItems.filter((x) => isFor(x, me)).map((x) => `${x.title} ${x.detail || ""}`).join(" ")); return distinctWords(q).some((w) => day.includes(w)); })
              .map((q) => (
              <p key={`${s.id}-${q}`} className="text-sm text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1 mb-3">Still open in {v.her} Guide: “{q}”</p>
            )))}
            {/* (her forecast for the stay is one quiet line in the city band above) */}

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
            {/* (on the day screen it leads "Don't miss" above) */}
            {now && otherSources.flatMap((s) => {
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
            {/* (today, where the rail sheet and her Guide disagree is said first in "Don't miss" — round r1: at 12:10 on Oct
                29 Now led with the Guide's 12:30 HARUKA and the difference was two screens down; on Now it's one line inside
                the train's card instead — delight audit) */}
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

            {/* Your booked meal, under way — named as booked, with its confirmation (it leads her line at that hour) */}
            {/* (the meal under way, as prominent as Next's other Now: its photos and Maps — at 7:30 PM the dinner had neither and
                the only Maps on Next went to the hotel; stability walk 2. It opens Today at that line: the list isn't on Next) */}
            {now && mealNow && (<div className="mb-3">
              <button onClick={() => navigate(`/day/${date}#item-${(planBlocks.find((x) => x.time === mealNow.time && saidAgain(x, mealNow)) || mealNow).id}`)}
                className="block w-full text-left min-h-[44px] text-[15px] text-[#3a3128]">
                <span className="text-[#6b5d4a]">Now · </span>{mealNow.title}
                <span className="text-[#6b5d4a]">, booked for {clock(mealNow.time!)}</span>
                {mealNow.confirmation && <span className="block text-sm text-[#514636] mt-0.5 [overflow-wrap:anywhere]">Confirmation {confirmationWords(mealNow.confirmation)}</span>}
                {tabsDiffer(mealNow).map((d) => <span key={d} className="block text-sm text-[#8a5a1a] mt-0.5">{differWordsFor(d, v, "below")}</span>)}
              </button>
              {(() => {
                const line = planBlocks.find((x) => x.time === mealNow.time && saidAgain(x, mealNow));
                const maps = mapsQueryFor(mealNow) ? <GetThere href={mapsLink(mapsQueryFor(mealNow)!)} name={mealNow.title} /> : null;
                return line ? <><LinePhotos tripId={tripId} cityId={bandCity?.id} block={line} ctx={lineCtx} /><LineAbout tripId={tripId} cityId={bandCity?.id} block={line} ctx={lineCtx} beside={maps} /></> : maps;
              })()}
            </div>)}
            {now && currentBlock && !mealLeads && !(currentBlock.time && otherSources.some((s) => s.differs.some((d) => d.date === date && d.guideSays === (currentBlock.endTime ? `${twelveHour(currentBlock.time!)}–${twelveHour(currentBlock.endTime)}` : twelveHour(currentBlock.time!))))) && (<div className="mb-3">
              {/* (to that line on Today — the day's list is Today's now, not under Next) */}
              <button onClick={() => navigate(`/day/${date}#item-${currentBlock.id}`)}
                className="block w-full text-left min-h-[44px] text-[15px] text-[#3a3128]">
                <span className="text-[#6b5d4a]">Now, in {v.owners} plan · </span>{currentBlock.title.replace(/^./, (c) => c.toUpperCase())}
                <span className="text-[#6b5d4a]">{currentBlock.endTime ? `, until ${/^~/.test(currentBlock.timeText || "") || (currentBlock.detail || "").includes("Times are Larisa's estimate.") ? "about " : ""}${clock(currentBlock.endTime)}` : planLineEndSaid(currentBlock, planBlocks) !== null ? `, until about ${minutesToClock(planLineEndSaid(currentBlock, planBlocks)!)}` : ""}</span>
                {tabsDiffer(currentBlock).map((d) => <span key={d} className="block text-sm text-[#8a5a1a] mt-0.5">{differWordsFor(d, v, "below")}</span>)}
                {(() => {
                  const dress = bookingDress(currentBlock, dayItems.filter((m) => m.kind === "meal"));
                  return dress ? <span className={`block text-sm mt-0.5 ${dress.stricter ? "text-[#8a5a1a]" : "text-[#514636]"}`}>
                    {dress.stricter ? `${v.Her} booking at ${dress.where} gives a looser dress code: ` : `${v.Her} booking at ${dress.where}: `}“{dress.words}”
                  </span> : null;
                })()}
              </button>
              <LinePhotos tripId={tripId} cityId={bandCity?.id} block={currentBlock} ctx={lineCtx} />
              {/* (Maps from Now too — Ken, Oct 16: "Be able to hop to maps at any time based on either of them") — in one
                  row with About this place */}
              {(() => {
                const href = planMapHref(currentBlock, { hotel: tonightHotel, dayWords: itineraryLines.map((l) => l.title).join(" "), bookings: dayItems.filter((m) => m.kind === "meal") });
                return <LineAbout tripId={tripId} cityId={bandCity?.id} block={currentBlock} ctx={lineCtx}
                  beside={href ? <GetThere href={href} name={currentBlock.title} /> : null} />;
              })()}
            </div>)}
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
                    {noGroupWords(unownedSoon, v, me)}{elsewhere ? `; ${elsewhere.forWhom} ${/&|and/.test(elsewhere.forWhom!) ? "are" : "is"} at ${elsewhere.title} then` : ""}.
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
                  {u.kind === "block" && !pickOpt && <LinePhotos tripId={tripId} cityId={bandCity?.id} block={u} ctx={lineCtx} dark />}
                  {/* (a booking, a meal, a tour: its own checked photo, as the day's list has it — Ken, Oct 18: "Next page
                      should have pictures") */}
                  {u.kind !== "block" && tripId && dayPlay.places[`line-${u.id}`] && (
                    <ItemPhoto tripId={tripId} cityId={bandCity?.id ?? null} query={dayPlay.places[`line-${u.id}`].query} line={dayPlay.places[`line-${u.id}`].line} title={itemTitle(u, stays, date)} time={clock(u.time)} />
                  )}
                  {/* Whose is what: her plan lists the places; the pick was made in Wander (round 7: "added in
                      Wander by Ken" then "From Larisa's plan" read as if the pick were hers) */}
                  {pick && pickOpt && (
                    <p className="text-sm text-white/85 mt-1">
                      {v.Her} plan lists {opts.length} places · {pick._pending ? `you picked ${pickOpt.name} (on this phone until there's signal)` : `${pick.addedBy} picked ${pickOpt.name} for the group, in Wander`}
                    </p>
                  )}
                  {opts.length > 0 && !pick && <p className="text-sm text-white/85 mt-1">{opts.length} places to choose from — see {v.her} plan below</p>}
                  {u.kind !== "flight" && tabsDiffer(u).map((d) => <p key={d} className="text-sm text-[#f3d9a8] mt-1">{differWordsFor(d, v, "below")}</p>)}
                  {/* Google's hours for the place, when her time runs past them — on the card he acts from, as on the line
                      and in Play (user-andy1, Oct 16: Next said leave for 9:00 Kappabashi, which opens at 10) */}
                  {u.kind === "block" && u.time && (() => {
                    const q = mapsQueryOf(mapHref);
                    const h = q ? keptPlacePhotos([{ query: q, line: u.title }])[q] : null;
                    const said = h?.hours ? hoursWords(h.hours, h.name || u.title, date, toMin(u.time!), planLineEndSaid(u, planBlocks)) : null;
                    return said ? <p className="text-sm text-[#f3d9a8] mt-1">{said}</p> : null;
                  })()}
                  {/* What you need for it — her own transit and dress notes, here and not behind a tap (round 13: Oct 17's
                      "Strict Formalwear Prep" card hid "jackets required for men… Ginza Line straight back" behind "Your notes ›") */}
                  {u.kind === "block" && (() => {
                    // (not her route's address — it's the day screen's route button; round 15: Now's Next card spelled out
                    // "Her whole route for the day: https://www.google.com/maps/dir/…" in six lines of text)
                    const own = (u.detail || "").split("\n").filter((l) => l && !/^(Choice: |Tabs differ: |Where: |Wander matched this plan|Times are |Her whole route for the day: |Her tab has \d+ versions of this day's plan)/.test(l) && !PICTURE_GROUP.test(l) && !/^For /.test(l))
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
                  {/* (About this place after the card's words — under the photos it jammed the description 6 pt below it;
                      design review, Oct 27) */}
                  {/* What's next, when, and how to get there, from where you're standing (Oct 2: Ken, "what's next, when,
                      and how do I get there" — nobody types an address into a map app): the same three as every line */}
                  {(() => {
                    // (a flight's airport: Maps alone — the leave-by card says how to get there)
                    const go = mapHref ? <GetThere href={mapHref} name={pickOpt?.name || u.title} dark mapOnly={u.kind === "flight"} /> : null;
                    return u.kind === "block" && !pickOpt ? <LineAbout tripId={tripId} cityId={bandCity?.id} block={u} ctx={lineCtx} dark beside={go} /> : go;
                  })()}
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
            {/* (a Backroads day with nothing timed left: their stops, with photos — Ken, Oct 18: "Next page should have
                pictures") */}
            {now && isToday && tripId && docDay && !upcomingGuide && !upcomingChoice && dayPlay.stops.length > 0 && (
              <NextStops tripId={tripId} cityId={bandCity?.id ?? null} head={`Today with ${docDay.from}, in their order`}
                stops={dayPlay.stops.flatMap((id) => { const m = dayPlay.moments.find((x) => x.id === id); const p = dayPlay.places[id]; return m && p ? [{ id, title: m.title, query: p.query, line: p.line }] : []; })} />
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
                      {/* (not in the evening — Sweep B: at 8 PM on Oct 27 it still said "check in any time from 3:00 PM") */}
                      {ymd(myTonight.stays[0].stay.checkInDate) === date && myTonight.stays[0].stay.checkInTime && !(isToday && tripNow >= 18 * 60) ? ` — check in any time from ${/^\d{1,2}:\d{2}$/.test(myTonight.stays[0].stay.checkInTime) ? clock(myTonight.stays[0].stay.checkInTime) : myTonight.stays[0].stay.checkInTime}` : ""}
                    </p>
                    {/* (the hotel's own checked photo — Ken, Oct 18: "Next page should have pictures") */}
                    {tripId && <ItemPhoto tripId={tripId} cityId={myTonight.stays[0].stay.cityId ?? null} query={stayMapsQuery(myTonight.stays[0].stay, cityOf(myTonight.stays[0].stay.cityId))} line={`Tonight's hotel: ${myTonight.stays[0].stay.name}`} title={myTonight.stays[0].stay.name} time={null} />}
                    <GetThere href={mapsLink(stayMapsQuery(myTonight.stays[0].stay, cityOf(myTonight.stays[0].stay.cityId)))} name={myTonight.stays[0].stay.name} />
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
                {tomorrowTrain && (
                  <button onClick={() => navigate(`/day/${tomorrowDate}#trains`)} className="w-full text-left min-h-[44px] text-sm text-[#3a3128]">
                    <span className="text-[#6b5d4a]">Tomorrow · </span>
                    {twelveHour(colOf(tomorrowTrain.cols, /^depart/))}{phoneIsElsewhere(tripZone) ? ` ${ZONE_LABEL[tripZone] || ""}` : ""} · {colOf(tomorrowTrain.cols, /^train$/)} · {colOf(tomorrowTrain.cols, /^route$/)} ›
                  </button>
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

            {/* Next is just next (Ken, Oct 16: "Next should just be next. It shouldn't then scroll to the equivalent of what is on
                the today tab"): the day, its photos and notes are Today's; Next ends with the way there */}
            {now && isToday && (
              <button type="button" onClick={() => navigate(`/day/${date}`)} className="w-full text-left mt-2 min-h-[44px] px-1 text-[15px] text-[#514636] underline underline-offset-2">
                All of today ›
              </button>
            )}
            {!now && (<>
            {/* The day, in Larisa's words */}
            {/* (a Backroads day says so in the city band — "With Backroads · day 3 of 8"; the summary says the rest) */}
            {/* A day with her detailed plan: the plan leads (round 6 — "See Larisa's full plan" landed on a
                hotel's cancellation paragraph); her Itinerary line for the day sits in its header, as hers */}
            {planBlocks.length > 0 && (
              <PlanSection
                tripId={tripId}
                cityId={bandCity?.id}
                playWords={`${longDate(date)}${cityName ? ` · ${cityName}` : ""}`}
                playCover={{ summary: summariesByDay[date] ? v.say(summariesByDay[date]) : null, photo: bandPhoto?.src ? { src: bandPhoto.src, credit: bandPhoto.credit, place: bandPhoto.place } : null,
                  panel: panels[date] && !daySwapped ? { src: panels[date].url, label: `${v.Owners} map of the day` } : null,
                  photos: dayPhotos,
                  sunset: forecastCity?.latitude != null && forecastCity?.longitude != null ? sunsetMinutes(forecastCity.latitude, forecastCity.longitude, date) : null,
                  rain: dayRain && (dayRain.wet?.length || dayRain.showers?.length) ? { wet: dayRain.wet || [], showers: dayRain.showers || [] } : null }}
                playTomorrow={(() => {
                  // (straight into its Play when the next day has her plan; else its page)
                  if (!hasNext) return null;
                  const city = trip?.cities.find((c) => c.id === days.find((d) => ymd(d.date) === tomorrowDate)?.cityId)?.name;
                  // (every day plays now — Oct 15)
                  return { date: tomorrowDate, words: `${shortDate(tomorrowDate)}${city ? ` · ${city}` : ""}`, play: items.some((i) => ymd(i.date) === tomorrowDate) };
                })()}
                panelOf={panels[date]?.of}
                // (each fact once — not her booking again when it's the same place at the same time as the line; user-andy2)
                playBookings={(b) => (underLine.get(b.id) || []).filter((o) => !(o.time && o.time === b.time && saidAgain(b, o))).map((o) => `${o.time ? `${timeLabel(o, dayItems)} · ` : ""}${itemTitle(o, stays, date)}`)}
                trainWords={(b) => (trainsUnder.get(b.id) || []).map((x) => {
                  const dep = colOf(x.r.cols, /^depart/), arr = colOf(x.r.cols, /^arrive/);
                  return [colOf(x.r.cols, /^train$/), colOf(x.r.cols, /^route$/), dep && arr ? `${twelveHour(dep)} → ${twelveHour(arr)}` : dep ? twelveHour(dep) : "", colOf(x.r.cols, /^car/)].filter(Boolean).join(" · ");
                })}
                maps={mapsByDay[date] || []}
                pastDay={date < today}
                pictures={pictures}
                added={timedOwn.map((c) => ({ time: c.time!, node: addedPlan(c, "row") }))}
                differAbove={(b) => isToday && !now && !!b.time && otherSources.some((s) => s.differs.some((d) => d.date === date && differLive(d)
                  && d.guideSays === (b.endTime ? `${twelveHour(b.time!)}–${twelveHour(b.endTime)}` : twelveHour(b.time!))))}
                under={(b, wayShown) => [
                  ...foldedNotes(b),
                  // (her booking for the same thing at the same time: the line above already has the way there — Ristorante
                  // Dono showed Walk/Train/Taxi, then its booking's "Map ↗" under them; fresh check, Oct 27)
                  ...(underLine.get(b.id) || []).map((o) => (
                    <ItemCard key={o.id} nested compact wayAbove={wayShown && !!o.time && o.time === b.time && saidAgain(b, o)} i={o} date={date} today={today} tripZone={tripZone} stays={stays} me={me} highlight={highlight === o.id} day={[...dayItems, ...planBlocks]} all={items} owner={owner} sources={otherSources} tripId={tripId} />
                  )),
                  // the train her line names, from the rail sheet — its booking, seats and steps, under her line
                  ...(trainsUnder.get(b.id) || []).map((x) => (
                    <RailLeg key={`train-${railKey(x)}`} r={x.r} s={x.s} today={today} look="nested" pickupBy={pickupByFor(x.s)} differs={differsFor(x)} />
                  )),
                ]}
                differBelow={(b) => (trainsUnder.get(b.id) || []).some((x) => differsFor(x).length > 0)}
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
                riding={!!riding}
                railArrivals={railArrivals}
              />
            )}
            {/* (a rail-sheet train her plan doesn't name joins this list too — then it isn't all "in her Guide") */}
            {planBlocks.length > 0 && (alsoItems.length > 0 || timelineTrains.length > 0) && (
              <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">{timelineTrains.length ? "Also today" : `Also in ${v.her} Guide for today`}</h2>
            )}
            {/* (every day plays — a Backroads day from their itinerary, any other from her lines; Ken, Oct 15) */}
            {!planBlocks.length && docAsked && dayPlay.moments.length > 0 && (
              <DayPlay tripId={tripId} cityId={bandCity?.id} date={date} moments={dayPlay.moments} places={dayPlay.places}
                stops={docDay && dayPlay.stops.length ? { ids: dayPlay.stops, head: `${docDay.from}' general itinerary for their Day ${docDay.day} — Play the day shows each, in their words.` } : null}
                heading={docDay ? "The day with Backroads" : `The day in ${v.her} Guide`}
                outline={docDay ? (() => {
                  // (their own moments, by their titles and lengths; her check-out, meeting and dinner are in the list below)
                  const theirs = docDay.moments.filter((d) => !d.her).map((d) => `${d.title}${d.length ? ` (${d.length})` : ""}`);
                  return theirs.length ? `${docDay.from}' general itinerary for their Day ${docDay.day}: ${theirs.join(" · ")}. Play the day shows each, in their words.` : null;
                })() : null}
                playWords={`${longDate(date)}${cityName ? ` · ${cityName}` : ""}`}
                cover={{ summary: summariesByDay[date] ? v.say(summariesByDay[date]) : null, photo: bandPhoto?.src ? { src: bandPhoto.src, credit: bandPhoto.credit, place: bandPhoto.place } : null,
                  notes: dayPlay.notes, panel: panels[date] && !daySwapped ? { src: panels[date].url, label: `${v.Owners} map of the day` } : null, photos: dayPhotos, her: v.Her,
                  sunset: forecastCity?.latitude != null && forecastCity?.longitude != null ? sunsetMinutes(forecastCity.latitude, forecastCity.longitude, date) : null,
                  rain: dayRain && (dayRain.wet?.length || dayRain.showers?.length) ? { wet: dayRain.wet || [], showers: dayRain.showers || [] } : null }}
                nowAt={isToday ? tripNow : null}
                playTomorrow={hasNext ? { date: tomorrowDate, words: `${shortDate(tomorrowDate)}${(() => { const c = trip?.cities.find((x) => x.id === days.find((d) => ymd(d.date) === tomorrowDate)?.cityId)?.name; return c ? ` · ${c}` : ""; })()}`, play: items.some((i) => ymd(i.date) === tomorrowDate) } : null} />
            )}
            {dayItems.length === 0 && choices.length === 0 && planBlocks.length === 0 ? (
              day?.dayType === "guided" ? (
                <p className="text-sm text-[#6b5d4a] bg-white rounded-xl border border-[#e0d8cc] p-4">
                  Backroads' guides lead the day, and {v.guide} has nothing else for it.
                </p>
              ) : (
                <p className="text-sm text-[#6b5d4a] bg-white rounded-xl border border-[#e0d8cc] p-4">
                  {cap(v.guide)} has nothing set for this day.
                </p>
              )
            ) : (
              <ol className="space-y-2">
                {headline && (
                  <li id={`item-${headline.id}`} className="text-[13px] text-[#514636] scroll-mt-24">
                    {/* (the day shown, not always today — journeys check: "for today" on Julie's Oct 14 seen on Oct 10) */}
                    {/* (her own voice — "our arrival … your arrival" — names her: read bare, "our" was Andy's; journeys check) */}
                    {speaksAsHer(headline.title, me, owner) ? `${owner || "Larisa"}'s words in her Itinerary for` : `In ${v.her} Itinerary for`} {isToday ? "today" : "this day"}: “{headline.title}”
                    {headlineMore.map((l) => <span key={l} className="block text-[#6b5d4a] mt-0.5">{inHerVoice(v.say(l), me, owner)}</span>)}
                  </li>
                )}
                {(() => {
                  // One timeline (round 13: Oct 6 read "Osaka → Okayama… Rikuro Cheesecake… Shinkansen" above the 2:50 PM
                  // landing, and the booked 6:17 PM NOZOMI 77 sat at the bottom under Trains): your booked trains join the
                  // timed lines at their times — each opens its full card in Trains — and lines her Guide gives no time say so
                  const card = (i: GuideItem) => <ItemCard key={i.id} i={i} date={date} today={today} tripZone={tripZone} stays={stays} me={me} highlight={highlight === i.id} day={[...dayItems, ...planBlocks]} all={items} owner={owner} sources={otherSources} tripId={tripId} quotedAbove={headline?.title} compact
                    photo={dayPlay.places[`line-${i.id}`] || null} cityId={bandCity?.id ?? null}
                    autoOpen={nowLine?.key === `item-${i.id}`} past={pastLine(i)}
                    focus={isToday && nowLine?.key === `item-${i.id}` ? nowWords(nowLine.at - tripNow) : null}
                    doneMark={i.kind === "deadline" ? doneMarks.get(deadlineKey(i)) : undefined} />;
                  // (on a day with her plan, a train her plan names sits under that line; any other joins here at its time)
                  const trains = timelineTrains;
                  const dep = (r: RailRow) => tripClockMinutes({ time: colOf(r.cols, /^depart/).padStart(5, "0") } as GuideItem, tripZone);
                  const firstTimed = listItems.findIndex((i) => !!i.time);
                  const lead = firstTimed > 0 ? listItems.slice(0, firstTimed).filter((i) => i.kind !== "checkout") : [];
                  // The day you land: nothing happens in Japan before you're there — her lines with no time follow your
                  // landing, in her sheet's order, and so does the airport leg with no booking (KIX → Shin-Osaka). Day
                  // review, Oct 4 (Ken: "itinerary in order"): Oct 6 read "Osaka → Okayama, Rikuro, Shinkansen" above the
                  // 2:50 PM landing, and the airport train only under Trains, two screens down.
                  const landing = landingInList ? myLanding! : null;
                  const afterLanding = landing ? lead : [];
                  const inOrder = afterLanding.length
                    ? listItems.filter((i) => !afterLanding.includes(i)).flatMap((i) => (i === landing ? [i, ...afterLanding] : [i]))
                    : listItems;
                  const legs = landingLegs;
                  // Her lines with no time that name where a train or car of yours goes today, right after it — her Mashiko
                  // day after the car to Mashiko, her "Nagoya to Tokyo" after the NOZOMI (day review, Oct 8: Oct 14 opened
                  // with two untimed cards, then "The lines above have no time…", the trains two screens down)
                  const after = new Map<string, GuideItem[]>();
                  const sortedRail = [...trains].sort((a, b) => dep(a.r) - dep(b.r));
                  const chain = sortedRail.flatMap((x) => [...(legsAhead.get(railKey(x)) || []), x, ...(legsAfter.get(railKey(x)) || [])]);
                  const goesTo = (x: { r: RailRow }) => { const parts = ends(x.r); return parts.length > 1 ? parts : []; };
                  // (any of her lines with no time — Oct 8's "Okayama → Hakata…" waited below the noon check-out until every
                  // train was said; never a check-out or a to-do)
                  const placeable = listItems.filter((i) => !i.time && !["checkout", "deadline"].includes(i.kind));
                  if (!afterLanding.length) for (const i of placeable) {
                    // (its destination first — the car to Mashiko, not the train to Utsunomiya; then a line naming the whole
                    // route, "Nagoya to Tokyo" ↔ "Nagoya → Tokyo")
                    const x = chain.find((c) => goesTo(c).length && sameThing(goesTo(c).slice(-1)[0], i.title))
                      || chain.find((c) => goesTo(c).length && goesTo(c).every((p) => sameThing(p, i.title) || distinctWords(p).length === 0) && sameThing(goesTo(c).join(" "), i.title));
                    if (x) after.set(railKey(x), [...(after.get(railKey(x)) || []), i]);
                  }
                  const placedLines = new Set([...after.values()].flat());
                  const order = inOrder.filter((i) => !placedLines.has(i));
                  const restLead = lead.filter((i) => !placedLines.has(i));
                  const timedAt = order.findIndex((i) => !!i.time);
                  const out: ReactNode[] = [];
                  let t = 0;
                  const sorted = sortedRail;
                  // Plans added in Wander with a time, at their time among the day's lines and trains (on a day with her
                  // plan they're in her plan's list instead)
                  const own = planBlocks.length ? [] : timedOwn;
                  let o = 0;
                  const flushOwn = (beforeMin: number) => { while (o < own.length && toMin(own[o].time!) < beforeMin) out.push(addedPlan(own[o++], "card")); };
                  // Her line, with the leg that takes you there before it and the one that takes you away after it
                  const pushCard = (i: GuideItem) => {
                    (legsBeforeLine.get(i.id) || []).forEach((l) => out.push(legLine(l)));
                    out.push(card(i));
                    (legsAfterLine.get(i.id) || []).forEach((l) => out.push(legLine(l)));
                  };
                  // A train, with the car or taxi that leads to it and any that follows, and her lines about where they go
                  const pushLeg = (l: { s: OtherSource; r: RailRow }) => { out.push(legLine(l)); (after.get(railKey(l)) || []).forEach((i) => pushCard(i)); };
                  const pushTrain = () => {
                    const x = sorted[t++];
                    flushOwn(dep(x.r));
                    (legsAhead.get(railKey(x)) || []).forEach(pushLeg);
                    out.push(trainLine(x));
                    (after.get(railKey(x)) || []).forEach((i) => pushCard(i));
                    (legsAfter.get(railKey(x)) || []).forEach(pushLeg);
                  };
                  order.forEach((i, n) => {
                    if (n === timedAt && !afterLanding.length && restLead.length) out.push(<li key="untimed-note" className="text-xs text-[#6b5d4a] -mt-1">The lines above have no time in {v.guide}; by the clock:</li>);
                    // (a check-out comes before the day's trains — round 13: Oct 8 read "10:26 AM NOZOMI 9" above "by 12:00
                    // PM Check out"; and the untimed evening lines after the timed ones wait until every train is said —
                    // Oct 14 put Ippudo Ramen above Ken & Larisa's 4:58 PM train back)
                    // (a deadline with no time waits for every train too — Oct 10 audit: Oct 11, with none of her lines
                    // timed, read check-out, the 11:59 PM free-cancellation, a to-do, then the 10:36 AM NOZOMI)
                    const eveningUntimed = !i.time && !afterLanding.includes(i) && (i.kind === "deadline" || (timedAt >= 0 && n > timedAt));
                    while (t < sorted.length && i.kind !== "checkout" && (eveningUntimed || (i.time && dep(sorted[t].r) < tripClockMinutes(i, tripZone)))) pushTrain();
                    if (i.time) flushOwn(tripClockMinutes(i, tripZone));
                    else if (eveningUntimed) flushOwn(Infinity);
                    pushCard(i);
                    if (i === landing) legs.forEach((l) => out.push(legLine(l)));
                  });
                  while (t < sorted.length) pushTrain();
                  flushOwn(Infinity);
                  // Behind you once you've reached tonight's place (Ken, Oct 10: "when I tapped on next, you would know that I
                  // was already in Hakata at the hotel, and so … it would not tell me we were taking a local train to Hakata"):
                  // the check-out and the lines with no time that only got you here fold into one quiet "Earlier today" row
                  const lastArr = railMine.filter(({ r }) => isBookedTrain(r)).map(({ r }) => railMin(colOf(r.cols, /^arrive/))).filter((m): m is number => m !== null).sort((a, b) => b - a)[0] ?? null;
                  // (…or once the booked train that brings you here has arrived; and the check-out, once your first booked
                  // train has left — Sweep B: at 2:30 PM on Oct 11, in Nagoya since 1:55, the Hakata check-out was still ahead)
                  const booked = railMine.filter(({ r }) => isBookedTrain(r));
                  const hereBy = booked.filter(({ r }) => getsYouTo(colOf(r.cols, /^route$/), cityName)).map(({ r }) => railMin(colOf(r.cols, /^arrive/))).filter((m): m is number => m !== null).sort((a, b) => b - a)[0] ?? null;
                  const firstDep = booked.map(({ r }) => railMin(colOf(r.cols, /^depart/))).filter((m): m is number => m !== null).sort((a, b) => a - b)[0] ?? null;
                  const arrived = isToday && (arrivedForTonight(dayItems, me, tripNow, lastArr) || (hereBy !== null && hereBy === lastArr && tripNow >= hereBy && !dayItems.some((i) => isLanding(i) && isFor(i, me))));
                  const leftOnTrain = isToday && firstDep !== null && tripNow > firstDep;
                  if (!arrived && !leftOnTrain) return out;
                  const doneIds = new Set(listItems.filter((i) => !i.time && (i.kind === "checkout" || (arrived && getsYouTo(i.title, cityName)))).map((i) => i.id));
                  // (a leg with no booking that got you here, to tonight's hotel, or out of here and back on a day trip —
                  // verify 4: on Larisa's Tokoname day at 8 PM only the return folded; the morning's "Nagoya → Tokoname"
                  // and Oct 21's "Nikko → Shirakabeso" transfer still read as ahead)
                  const hereWords = [cityName, ...night.stays.map((n) => n.stay.name)].filter(Boolean);
                  const fromHere = (route: string) => { const from = route.split(/→|-\s*>/)[0] || ""; return !!cityName && route !== from && new RegExp(`\\b${cityName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(from); };
                  const doneLegs = arrived ? railMine.filter(({ r }) => { const route = colOf(r.cols, /^route$/); return !isBookedTrain(r) && !/evening|night|dinner|late/i.test(colOf(r.cols, /^depart/))
                    && (hereWords.some((w) => getsYouTo(route, w)) || (fromHere(route) && railMine.some((x) => getsYouTo(colOf(x.r.cols, /^route$/), cityName)))); }) : [];
                  // (…and a booked train that has arrived — at 8 PM in Nagoya the morning's NOZOMI 22 still stood as a full card
                  // after the fold; verify9 + verify10)
                  const doneTrains = arrived ? booked.filter(({ r }) => { const a = railMin(colOf(r.cols, /^arrive/)); return a !== null && tripNow >= a; }) : [];
                  const doneKeys = new Set([...doneIds, ...doneLegs.map((x) => `leg-${railKey(x)}`), ...doneTrains.map((x) => `train-${railKey(x)}`)]);
                  const isDone = (n: ReactNode) => !!n && typeof n === "object" && "key" in n && doneKeys.has(String((n as { key: unknown }).key));
                  const earlier = out.filter(isDone);
                  if (!earlier.length) return out;
                  const allLeadDone = restLead.every((i) => doneIds.has(i.id));
                  const rest = out.filter((n) => !isDone(n) && !(allLeadDone && !!n && typeof n === "object" && "key" in n && (n as { key: unknown }).key === "untimed-note"));
                  const names = [...listItems.filter((i) => doneIds.has(i.id)).map((i) => itemTitle(i, stays, date)), ...doneLegs.map(({ r }) => [colOf(r.cols, /^route$/), colOf(r.cols, /^mode$/)].filter(Boolean).join(" · ")),
                    ...doneTrains.map(({ r }) => [colOf(r.cols, /^train$/), colOf(r.cols, /^route$/)].filter(Boolean).join(" · "))];
                  return [
                    <li key="earlier-today">
                      <button onClick={() => setShowEarlier((s) => !s)} aria-expanded={showEarlier}
                        className="w-full text-left min-h-[44px] px-3 rounded-xl border border-[#efe8dc] bg-white/60 text-sm text-[#6b5d4a]">
                        Earlier today: {names.join("; ")} {showEarlier ? "‹" : "›"}
                      </button>
                      {showEarlier && <ol className="space-y-2 mt-2 opacity-70">{earlier}</ol>}
                    </li>,
                    ...rest,
                  ];
                  // A leg the rail sheet has with no booking, at its place after landing; a booked train at its time — each
                  // opens in place ("Seats, notes and steps ›")
                  function legLine(x: { s: OtherSource; r: RailRow }) {
                    return <RailLeg key={`leg-${railKey(x)}`} r={x.r} s={x.s} today={today} look="card" pickupBy={pickupByFor(x.s)} />;
                  }
                  function trainLine(x: { s: OtherSource; r: RailRow }) {
                    return <RailLeg key={`train-${railKey(x)}`} r={x.r} s={x.s} today={today} look="card" pickupBy={pickupByFor(x.s)} differs={differsFor(x)}
                      autoOpen={nowLine?.key === `train-${railKey(x)}`} past={pastTrain(x)} />;
                  }
                })()}
              </ol>
            )}

            {/* Same-day plans added in Wander — the group's own, beside the Guide */}
            <section className="mt-5">
              {!choicesChecked && checking && <p className="text-sm text-[#6b5d4a] mb-2" role="status">Checking for plans added in Wander…</p>}
              {untimedOwn.length > 0 && (
                <>
                  <h2 className="text-xs uppercase tracking-wide text-[#6b5d4a] mb-2">Added in Wander</h2>
                  <ul className="space-y-2">
                    {/* In the order they'll happen: times first (2:30 before 3:00), then plans with no time */}
                    {/* (only plans with no time here — one with a time sits in the day at its time, above) */}
                    {untimedOwn.map((c) => addedPlan(c, "card"))}
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
              {/* A note about this day, from the day itself (Ken, Oct 13: "there also should be a button on each day page that
                  says, add a note for this day") — Notes opens on this day and its town */}
              <button onClick={() => { holdKeyboard(); navigate(`/notes?day=${date}`); }} className="block min-h-[44px] text-sm text-[#514636] underline underline-offset-2">
                + Add a note for this day
              </button>
              {notice && <p className="text-sm text-[#6b5d4a] mt-2" role="status">{notice}</p>}
            </section>

            {/* The day's trains from Ken's rail sheet, apart from her Guide, with any disagreement said */}
            {/* (only what isn't already in the day: the others' trains, folded; a leg with no booking; the pickup's steps) */}
            <TrainsForDay sources={otherSources} date={date} today={today} differsShownAbove={isToday} shownInPlace={placedTrains}
              pickupBy={pickupByFor}
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
                          {/* (where they sleep, as it looks — on a travel day the one place photo the day has; Ken, Oct 17:
                              "Why aren't there pictures on the day?") */}
                          {/* (only on a day without her detailed plan — on one with it, the hotel's own line may show it already) */}
                          {/* (…nor when Backroads' own stops that day are the hotel — the Ritz showed twice, one under the
                              other; fresh photo check, Oct 17) */}
                          {tripId && !planBlocks.length && !(docDay?.moments || []).some((m) => !!m.place && sameStay(m.place, s.name)) && <ItemPhoto tripId={tripId} cityId={s.cityId ?? null} query={stayMapsQuery(s, cityOf(s.cityId))} line={`Tonight's hotel: ${s.name}`} title={s.name} time={null} />}
                          {date < today
                            ? <a href={mapsLink(stayMapsQuery(s, cityOf(s.cityId)))} className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2 [overflow-wrap:anywhere]">
                                {s.address ? `${s.address} ↗` : "Maps ↗"}
                              </a>
                            // (the address in words, for a taxi driver; then Walk, Train or Taxi there — Ken, Oct 27)
                            : <>
                                {s.address && <p className="text-sm text-[#514636] mt-1 [overflow-wrap:anywhere]">{s.address}</p>}
                                <GetThere href={mapsLink(stayMapsQuery(s, cityOf(s.cityId)))} name={s.name} />
                              </>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            {/* Your photos from the day, and the ones the others shared (Oct 15: "Value, delight. Not gimmicks") */}
            {tripId && date && tripFirst && last && <DayPhotos tripId={tripId} date={date} canAdd={date <= today} trip={{ first: tripFirst, last }} />}

            {/* Every day of the stay (and Now): Larisa's note for the whole stay, as background — one row, opened in place */}
            {stopNotes.map((s) => (
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

            {/* Papers kept for this day — receipts, tickets, bills (Ken, Oct 12): reference, at the end */}
            {tripId && date && <DayPapers tripId={tripId} date={date} />}

            </>)}
            {/* How current this is */}
            {status?.current && (() => {
              const f = freshness(status.current.importedAt, new Date(), tripZone);
              return f && (
                // (gray even when her copy is old: amber is kept for what to check or decide today — day review, Oct 4)
                <p className="text-xs mt-8 text-center text-[#6b5d4a]">
                  {v.mine ? f.text.replace(/^Larisa's Guide/, "Your Guide") : f.text}.{f.old && !v.mine && " Larisa may have changed things since."}
                </p>
              );
            })()}
            {/* The trains' source, and how current it is, said once here — each train in the day says only "from Ken's rail
                sheet" (it was the Trains section's first line, gone when every train is drawn in the day) */}
            {otherSources.filter((s) => s.rail.some((r) => r.date === date)).map((s) => (
              <p key={s.id} className="text-xs mt-1 text-center text-[#6b5d4a]">
                The trains are from {sourceWordsFor(s, me)}{s.readAt ? `, as Wander last read it ${readWords(s.readAt)}` : ""}.{s.lastError ? " Its latest read didn't work, so this may be out of date." : ""}
              </p>
            ))}
          </>
        )}
      </main>
    </div>
  );
}

/** One line of the Guide for this day. */
/**
 * Her Guide asking the person looking something — said as a plain question from her own cells, with her asking words
 * quoted and the day she put them on (Oct 10 re-audit: "Her words: “X, if Julie isn't interested · Ceramics town day trip ·
 * Interested: Larisa”" never said plainly what was asked), what the rail sheet already says about it (Julie's Mashiko and
 * its "Ken + Larisa only"), and a way to answer: a message to her, already started — or, where the phone can't share,
 * copied, and said so (it copied silently).
 */
function AskedQuestion({ i, me, owner, sources, className = "" }: { i: GuideItem; me: string | null; owner?: string | null; sources?: OtherSource[]; className?: string }) {
  const [told, setTold] = useState<string | null>(null);
  const p = askedParts(i, me);
  if (!p) return null;
  const who = owner || "Larisa";
  const her = voiceFor(me, owner).her;
  const when = i.date ? new Date(`${ymd(i.date)}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : null;
  const rail = sources?.length ? railNoteFor(i.title, sources, me) : null;
  return (
    <div className={className}>
      <p className="text-sm text-[#8a5a1a]">
        {who} is asking whether you're interested in {p.subject}
        {p.cell ? <> — {her} Guide has it{when ? ` on ${when}` : ""}: “{p.cell}”</> : when ? ` (${when})` : ""}.
      </p>
      {p.rest.length > 0 && <p className="text-xs text-[#6b5d4a] mt-0.5">Also in that row: {p.rest.join(" · ")}</p>}
      {rail && <p className="text-sm text-[#514636] mt-0.5">{rail}</p>}
      <button onClick={async () => setTold(await sendToGuideOwner(who, `Hi ${who} — about “${i.title}” in your Guide: `))}
        className="min-h-[44px] text-sm text-[#514636] underline underline-offset-2">Tell {owner || "her"} your answer ›</button>
      {told && <p role="status" className="text-sm text-[#3a3128]">{told}</p>}
    </div>
  );
}

function ItemCard({ i, date, today, tripZone, stays, me, highlight, day, all, owner, sources, tripId, nested = false, wayAbove = false, quotedAbove, compact = false, autoOpen = false, past = false, doneMark, focus = null, photo = null, cityId = null }: {
  /** what to look up for this line's place photo, as Play does ({ query, line }); its city to find it near */
  photo?: { query: string; line: string } | null; cityId?: string | null;
  /** today, the line that's now or next (NOW_MAROON): "Now" or "Next · in 25 min" */
  focus?: string | null;
  /** a deadline marked done in Wander by the person it's for (Oct 9): said as done, not amber */
  doneMark?: Mark;
  i: GuideItem; date: string; today: string; tripZone: string; stays: TripGuideData["stays"]; me: string | null; highlight: boolean; day: GuideItem[];
  /** the line that's now (or a future day's first): open by itself (day design step 3) */
  autoOpen?: boolean;
  /** today, a timed line before the one that's now: quieter (still readable) */
  past?: boolean;
  /** a short line until tapped: its time, what it is, and only what must stay in sight (day design, Oct 8) */
  compact?: boolean;
  /** her Itinerary's heading for the day, already said atop the day — "her Itinerary line this day says “…”" isn't said again */
  quotedAbove?: string;
  /** drawn under her line for it in her plan: no card of its own, no second time column (the line has the time) */
  nested?: boolean;
  /** her line just above, for the same thing at the same time, already has the way there: no second map link */
  wayAbove?: boolean;
  /** The whole Guide: a landing says where its flight stands right now, by the schedule */
  all?: GuideItem[];
  /** Whose Guide it is ("Larisa") — never told to ask herself */
  owner?: string | null;
  /** Ken's rail sheet and any other source: what it already has for a place her Guide asks you about */
  sources?: OtherSource[];
  /** for "Open this spot in her sheet" */
  tripId?: string | null;
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
  const allHerLinks = linksIn(i.link);
  const herMap = allHerLinks.find((u) => linkLabel(u) === "Map") || null;
  const q = herMap ? null : mapsQueryFor(i);
  // The way there: Walk, Train or Taxi to her own map link, else Wander's search — today and days ahead (Ken, Oct 27: "the
  // variation is just confusing"; "Check in · Four Seasons" had only her "Map ↗"). None when her line above has it.
  const goHref = wayAbove ? null : herMap || (q ? mapsLink(q) : null);
  // (a flight's airport: Maps alone — the leave-by card says how to get there)
  const goTrio = !!goHref && date >= today && i.kind !== "flight" && !!directionsHref(goHref);
  const herLinks = allHerLinks.filter((u) => !(u === herMap && (goTrio || wayAbove)));
  const time = deadline ? deadlineTimeWords(i, tripZone) : null;
  // The detail already spells out the window; on the day itself, say it's open now
  const windowWords = deadline && i.windowStart && date === today && today < ymd(i.date) ? deadlineWhen(i, today) : null;
  // Check-out on a morning the Guide lists two places: each hotel's own time and code, never blended
  const bothLeaving = i.kind === "checkout" ? leavingOn(stays, date) : [];
  const split = bothLeaving.length > 1;
  const ownHotel = i.title.replace(/^Check out · /, "");
  // Someone else's to-do (booked under one of the others): said plainly, not in the amber that means "check this" (day
  // review, Oct 4: Larisa's Robuchon reconfirmation was the loudest card on Julie's landing day). Only a name that's one of
  // the travellers counts — a booking under a name Wander doesn't know stays amber for everyone.
  const actor = deadline ? bookedByName(i)?.split(/\s+/)[0] || null : null;
  const people = new Set([...(all || []).flatMap((x) => (x.forWhom || "").split(/\s*(?:&|,|\band\b)\s*/i)), owner || ""].map((s) => s.trim().toLowerCase()).filter(Boolean));
  const othersJob = !!actor && !!me && people.has(actor.toLowerCase()) && actor.toLowerCase() !== me.trim().toLowerCase();
  // (marked done in Wander: said as done — "Done — Larisa, Oct 12" — calm, not amber)
  const doneWords = doneMark ? `Done — ${me && doneMark.byName.toLowerCase() === me.toLowerCase() ? "you" : doneMark.byName}, ${markDay(doneMark)} (marked in Wander)` : null;
  const tone = over || doneMark ? "bg-[#f4efe7] border-[#e0d8cc]" : deadline && !othersJob ? "bg-[#fff8ec] border-[#e8c98f]" : maybe ? "bg-white/60 border-dashed border-[#d6ccbc]" : "bg-white border-[#e0d8cc]";
  // Her quoted policy ("Worked out from: …") is the why, not the what — one tap away, not a wall of text
  const [showWhy, setShowWhy] = useState(false);
  // Someone else's line: whose it is up top, and their long notes folded (round 11: Ken & Larisa's 12-line Mashiko
  // train note filled Julie's Now, its "For Ken & Larisa" at the bottom, her own landing below the fold)
  const [showTheirs, setShowTheirs] = useState(false);
  // Her long travel note on a line — the route and her thinking before it was booked — one tap away (day review, Oct 8:
  // Oct 14's Mashiko card was a screen and a half of planning prose before the day's first train)
  const [showNote, setShowNote] = useState(false);
  // A short line opened in place (day design, Oct 8); the line that's now opens by itself, and stays open once opened
  const [open, setOpen] = useState(autoOpen);
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);
  // …and the line you tapped on Home stays open after its brief mark fades (verify 6: it closed by itself 2.5 s later and
  // the day jumped 158 pt under the reader)
  useEffect(() => { if (highlight) setOpen(true); }, [highlight]);
  // (on a Japan date you're still at home, a line naming no one isn't yours either — journeys check, Oct 10: Ken & Larisa's
  // 8 PM Tapas dinner stood at full strength on Julie's Oct 13, like her own flight)
  const named = !!i.forWhom && !/^everyone$/i.test(i.forWhom);
  const othersOnHomeDate = !named && !!all && !!me && !["flight", "deadline"].includes(i.kind) && !isLanding(i) && !namesMe(i.title, me) && !!homeOnJapanDate(all, me, date, tripZone);
  const theirs = (named && !!me && !isFor(i, me)) || othersOnHomeDate;
  const theirsWho = named ? i.forWhom : "The others";
  // (her line in her own voice — "AI estimates our arrival … and your arrival" — said as hers to anyone else; journeys
  // check, Oct 10: read bare, "our arrival" was Andy's)
  // (only her own words are quoted as hers — "You land at Narita" is Wander's sentence; Sweep A: it read "Larisa's words:
  // “You land at Narita (NRT) · United”")
  const lineTitle = (() => { const own = itemTitle(i, stays, date); const t = landingTitle(i, me, own); return t === own && speaksAsHer(t, me, owner) ? `${owner || "Larisa"}'s words: “${t}”` : t; })();
  const differ = tabsDiffer(i);
  // A landing says where its flight stands by the clock; that line replaces the booking's "Takes off from …"
  const flightNow = all ? landingStatus(i, all, tripZone) : null;
  const allLines = (windowWords ? (i.detail || "").replace(/^Any day from [^\n]*\n?/, "") : (i.detail || "")).split("\n");
  const whyAt = allLines.findIndex((l) => l.startsWith("Worked out from:"));
  // Her travel note on a flight's row about the train to the airport, when the train's own line already quotes it whole
  // (round 12: Oct 29's flight card said "1:30-2:00p Haruka…" a third time beside the rail-sheet difference)
  const saidOnTrainLine = (l: string) => i.kind === "flight" && l.startsWith("Larisa's travel note: ")
    && (day || []).some((o) => o !== i && (o.detail || "").includes(l.slice("Larisa's travel note: ".length).trim()));
  const quotedLine = (l: string) => { const m = l.match(/^For .+: her Itinerary line this day says “(.+)”\.?$/); return !!m && !!quotedAbove && quotedAbove.includes(m[1]); };
  const shown = allLines.filter((l, n) => l && !l.startsWith("Tabs differ: ") && !(flightNow && l.startsWith("Takes off from ")) && !saidOnTrainLine(l) && !quotedLine(l) && (whyAt < 0 || n < whyAt))
    // The name as Home says it ("Hana Sato", not the booking's "Sato, Hana")
    // (to the person it's booked under: "your name" — round 13: Larisa read her own full name there)
    // (when the card's heading already says "Larisa's to-do", just whose name it's under — not "Larisa's to do" twice)
    .map((l) => (/^Booked under /.test(l) && bookedByName(i) ? (i.kind === "deadline" && !othersJob ? bookedWords(i, me)!
      : samePerson(bookedByName(i)!.split(/\s+/)[0], me) ? "Booked under your name" : `Booked under ${bookedByName(i)}`) : l))
    // Her own notes, to her: "Your travel note: …"
    .map((l) => (v.mine ? l.replace(/^Larisa's (travel note|note|estimate)/, "Your $1").replace(/^Her note: /, "Your note: ") : l))
    // Lines Wander wrote about her Guide, in her voice to her ("the stop your tab lists"); her own words untouched
    .map((l) => (/^(Where:|Wander |Still open in the Guide|Times are|Her [^.:]+ tab lists this under )/.test(l) ? v.say(l) : l));
  const why = v.say(whyAt >= 0 ? allLines.slice(whyAt).join("\n") : "");
  // (her note runs on over the lines after it until a line Wander or a booking adds — "For …:", "Still open…", "Booked…")
  const noteAt = shown.findIndex((l) => /^(Larisa's|Your) travel note: /.test(l));
  let noteEnd = noteAt + 1;
  if (noteAt >= 0) while (noteEnd < shown.length && !/^(For .+:|Still open|Where:|Booked|Wander |Times are|A picture|Beside |The end time|Time from the |Confirmation|No reservation)/.test(shown[noteEnd])) noteEnd++;
  const noteLines = noteAt >= 0 ? shown.slice(noteAt, noteEnd) : [];
  const foldNote = noteLines.join(" ").length > 160;
  const visible = foldNote ? [...shown.slice(0, noteAt), ...shown.slice(noteEnd)] : shown;
  // A to-do whose window closed: say plainly Wander can't know whether it was done
  const couldBeDone = over && /reconfirm|confirm|call|book|pay|send|submit|register/i.test(i.title);
  const Box = nested ? "div" : "li";
  // Someone else's line on a split day: one quiet row at its time, opened in place (day review, Oct 4: on Julie's landing
  // day two full Ken & Larisa Mashiko cards — about 420 pt — came before her own 3:00 PM landing)
  if (theirs && !showTheirs && !nested && !highlight) {
    // A time on another clock, said on the day's own (day review, Oct 8: Julie & Andy's SFO take-off read "12:00 PM" below
    // Ken's 8:00 PM dinner on Japan's Oct 13 — that's Wed 4:00 AM in Japan)
    const elsewhere = i.time && i.date && i.timeZone && i.timeZone !== tripZone
      ? zonedMoment(i.date.slice(0, 10), toMin(i.time), i.timeZone).toLocaleString("en-US", { timeZone: tripZone, weekday: "short", hour: "numeric", minute: "2-digit" })
      : null;
    return (
      <Box id={`item-${i.id}`} className="rounded-xl border border-[#efe8dc] bg-white/60">
        {/* (one tap opens it all — not to a short line that needs a second; short lines, Oct 8) */}
        <button onClick={() => { setShowTheirs(true); setOpen(true); }} aria-expanded={false} className="w-full flex items-center gap-3 px-3 py-1 min-h-[44px] text-left">
          <span className="w-16 shrink-0 text-right text-sm text-[#6b5d4a]">{elsewhere ?? (i.time ? timeLabel(i, day) : "")}</span>
          <span className="flex-1 min-w-0 text-sm text-[#6b5d4a] leading-snug">{theirsWho} · {itemTitle(i, stays, date)} ›</span>
        </button>
      </Box>
    );
  }
  // A short line (day design, Oct 8 — with the UX review): its time and what it is, and in sight only what you can't
  // be without — a time limit, a disagreement, a question for you, a to-do's phone, the map. The rest opens in place.
  if (compact && !open && !highlight) {
    const stillOpen = shown.filter((l) => /^Still open/.test(l));
    const phone = deadline ? shown.find((l) => /^Phone:/.test(l)) : undefined;
    const booked = i.kind === "meal" ? shown.find((l) => /^(No reservation|Booked|Reserved)\b/i.test(l)) : undefined;
    const mapAt = goHref;
    // (a fact from a picture or a tab other than her Itinerary and Dining Resos says where, even short)
    const elsewhereFrom = !/^Itinerary|^Dining Resos/.test(i.source) ? friendlySource(i.source, me) : null;
    const timing = deadline && (over || windowWords || time)
      // (a passed "reconfirm" says Wander can't tell whether it was done, as the opened card does — re-audit 2: under
      // "Started · … charges" a bare "Ended." read as the booking being cancelled)
      ? (over ? passedWords(i, time) + (couldBeDone ? (owner && me && owner.toLowerCase() !== me.toLowerCase() ? ` Wander can't tell whether it was done — ask ${owner} if you're not sure.` : " Wander can't tell whether it was done.") : "")
        : [windowWords, time].filter(Boolean).join(" · ")) : null;
    const leaveBy = earlyCheckout && !split ? leaveBeforeCheckout(i, day) : null;
    const inJapan = departureInTripZone(i, tripZone);
    return (
      // (under her line in her plan — Oct 15's Yazawa booking: no time column of its own, the line above has the time)
      <Box id={`item-${i.id}`} className={`scroll-mt-24 ${nested ? `mt-2 rounded-lg border ${tone === "bg-white border-[#e0d8cc]" ? "bg-[#faf8f5] border-[#efe8dc]" : tone}` : `rounded-xl border ${tone}`}`}>
        <button onClick={() => setOpen(true)} aria-expanded={false} className={`w-full flex gap-3 text-left min-h-[44px] ${nested ? "px-2.5 pt-2 pb-1.5" : "px-3 pt-3 pb-2"}`}>
          <span className={nested ? "hidden" : "w-16 shrink-0 text-right"}>
            {i.time && !split ? (
              <>
                <span className={`block text-sm font-medium ${past ? "text-[#6b5d4a]" : "text-[#3a3128]"}`}>{timeLabel(i, day)}</span>
                {i.endTime && i.kind !== "flight" && <span className="block text-xs text-[#6b5d4a] whitespace-nowrap">{["travel", "train"].includes(i.kind) ? "→ " : "to "}{clock(i.endTime)}</span>}
                {zone && <span className="block text-xs text-[#6b5d4a]">{zone}</span>}
              </>
            ) : <span className="block text-base text-[#6b5d4a]" aria-hidden>{KIND_MARK[i.kind] || "•"}</span>}
          </span>
          <span className="flex-1 min-w-0">
            <span className={`block ${nested ? "text-sm" : "text-[15px]"} leading-snug ${over || past ? "text-[#6b5d4a]" : maybe ? "text-[#6b5d4a] italic" : "text-[#3a3128]"}`}>
              {deadline && <span className="font-medium">{over ? (startsSomething(i) ? "Started · " : "Passed · ") : othersJob ? `${actor}'s to-do · ` : "Deadline · "}</span>}
              {lineTitle}{booked ? ` · ${booked}` : ""}
              <span className="text-[#6b5d4a]">{"\u00a0"}›</span>
            </span>
            {doneWords ? <span className="block text-sm mt-0.5 text-[#3f5a2a]">{doneWords}</span>
              : timing && <span className={`block text-sm mt-0.5 ${othersJob ? "text-[#6b5d4a]" : "text-[#8a5a1a]"}`}>{timing}</span>}
            {/* (her 12:00 last, so her screenshot's source line below sits under her own fact — user-larisa3) */}
            {leaveBy && <span className="block text-sm text-[#3a3128] mt-0.5">“{itemTitle(leaveBy, stays, date)}” is at {timeLabel(leaveBy, day)}, so check out before then.{i.time ? ` The hotel's own check-out time is ${clock(i.time)}.` : ""}</span>}
            {checkinAfterLanding(i, day) && <span className="block text-sm text-[#6b5d4a] mt-0.5">Rooms are ready from {clock(i.time)}.</span>}
            {inJapan && <span className="block text-sm text-[#514636] mt-0.5">{inJapan}</span>}
            {/* (where a flight stands right now is a "when" — in sight: "Should be in the air now… due to land at 2:50 PM") */}
            {flightNow && <span className="block text-sm text-[#514636] mt-0.5">{flightNow}</span>}
            {/* (a flight's confirmation is what the counter asks for — in sight, like a train's car and seats) */}
            {i.kind === "flight" && i.confirmation && <span className="block text-sm text-[#514636] mt-0.5 [overflow-wrap:anywhere]">Confirmation {confirmationWords(i.confirmation)}</span>}
            {elsewhereFrom && <span className="block text-xs text-[#6b5d4a] mt-0.5">{elsewhereFrom}</span>}
          </span>
        </button>
        {/* Outside the row's button, each its own tap: disagreements, a question for you, the phone, the map */}
        {(differ.length > 0 && i.kind !== "flight") || stillOpen.length > 0 || askedOf(i, me, today, all, tripZone) || phone || mapAt || split ? (
          <div className={nested ? "px-2.5 pb-1.5 -mt-1" : "pl-[88px] pr-3 pb-2 -mt-1"}>
            {i.kind !== "flight" && differ.map((d) => <p key={d} className="text-sm text-[#8a5a1a] bg-[#fff8ec] rounded-md px-2 py-1 mt-1">{differWordsFor(d, v)}</p>)}
            {stillOpen.map((l) => <p key={l} className="text-sm text-[#6b5d4a] mt-1">{l}</p>)}
            {split && (
              <ul className="text-sm text-[#3a3128] mt-1 space-y-0.5">
                {bothLeaving.map((s) => {
                  const mine = ownHotel.toLowerCase().includes(s.name.toLowerCase().split(" ")[0]);
                  return <li key={s.id}>{s.name}: {mine && i.time ? `by ${clock(i.time)}` : "no check-out time in the Guide"}</li>;
                })}
              </ul>
            )}
            {askedOf(i, me, today, all, tripZone) && <AskedQuestion i={i} me={me} owner={owner} sources={sources} className="mt-1" />}
            {phone && <GuideText text={phone} className="text-sm text-[#6b5d4a] mt-1" />}
            {mapAt && (goTrio
              ? <GetThere href={mapAt} name={i.title} className="mt-1 mb-1" />
              : <a href={mapAt} target={q ? undefined : "_blank"} rel="noreferrer" className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-sm text-[#514636] underline underline-offset-2">Maps ↗</a>)}
          </div>
        ) : null}
      </Box>
    );
  }
  return (
    <Box id={`item-${i.id}`} className={nested
      ? `scroll-mt-24 mt-2 rounded-lg border p-2.5 transition-shadow ${tone === "bg-white border-[#e0d8cc]" ? "bg-[#faf8f5] border-[#efe8dc]" : tone} ${highlight ? "ring-2 ring-[#c8a060]" : ""}`
      : `scroll-mt-24 rounded-xl border p-3 transition-shadow ${focus && !highlight ? "border-l-4 bg-[#fbf3f1] border-[#ead9d4]" : tone} ${highlight ? "ring-2 ring-[#c8a060] shadow-md" : ""}`}
      style={focus && !highlight && !nested ? { borderLeftColor: NOW_MAROON } : undefined}
      data-now={focus && !nested ? focus : undefined} data-now-title={focus && !nested ? itemTitle(i, stays, date) : undefined}>
      <div className="flex gap-3">
        <div className={nested ? "hidden" : "w-16 shrink-0 text-right"}>
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
          {focus && !nested && <p className="text-[12px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: NOW_MAROON }}>{focus}</p>}
          <p className={`${nested ? "text-sm" : focus ? "text-[17px] font-medium" : "text-[15px]"} leading-snug ${focus ? "" : over ? "text-[#6b5d4a]" : maybe ? "text-[#6b5d4a] italic" : "text-[#3a3128]"}`} style={focus && !nested ? { color: NOW_MAROON } : undefined}>
            {deadline && <span className="font-medium">{over ? (startsSomething(i) ? "Started · " : "Passed · ") : othersJob ? `${actor}'s to-do · ` : "Deadline · "}</span>}{lineTitle}
          </p>
          {/* (the place's checked photo, the one Play shows for this line — a day without her detailed plan showed none:
              Ken, Oct 17, "Why aren't there pictures on the day?") */}
          {photo && !nested && tripId && <ItemPhoto tripId={tripId} cityId={cityId} query={photo.query} line={photo.line} title={lineTitle} time={i.time ? timeLabel(i, day) : null} />}
          {theirs && <p className="text-xs text-[#514636] mt-0.5">{named ? `For ${i.forWhom}` : "The others' plan"}</p>}
          {/* Her Guide asking the person looking (round 12: "1 day to Mashiko-Julie interested?" shown to Julie, with
              nothing saying what to do about it) — Wander can't answer for her; the answer goes to Larisa */}
          {/* …with a way to answer: a message to her, already started (delight audit: tapping it did nothing) */}
          {/* (under the question itself only — round 13: it repeated under "Maybe: Mashiko") */}
          {askedOf(i, me, today, all, tripZone) && <AskedQuestion i={i} me={me} owner={owner} sources={sources} className="mt-0.5" />}
          {doneWords && <p className="text-sm mt-1 text-[#3f5a2a]">{doneWords}</p>}
          {deadline && !doneWords && (over || windowWords || time) && (
            <p className={`text-sm mt-1 ${othersJob ? "text-[#6b5d4a]" : "text-[#8a5a1a]"}`}>
              {over ? passedWords(i, time) : [windowWords, time].filter(Boolean).join(" · ")}
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
          {earlyCheckout && !split && (() => {
            // Out before the line you leave by (day review, Oct 4: Oct 18 said only "check-out time is 12:00 PM" on the
            // morning everyone meets Backroads at 8:30 and leaves Tokyo); the hotel's own time stays, smaller
            const by = leaveBeforeCheckout(i, day);
            return by
              ? <>
                  {/* (Wander's reasoning, said as reasoning — under her screenshot's source, "Check out before 8:30 AM" and then
                      "Check out in time for…" read as hers; her screenshot says 12:00; user-larisa1, user-larisa3) */}
                  <p className="text-sm text-[#3a3128] mt-1">“{itemTitle(by, stays, date)}” is at {timeLabel(by, day)}, so check out before then.</p>
                  <p className="text-xs text-[#6b5d4a] mt-0.5">The hotel's own check-out time is {clock(i.time)}.</p>
                </>
              : <p className="text-sm text-[#6b5d4a] mt-1">The hotel's check-out time is {clock(i.time)}.</p>;
          })()}
          {checkinAfterLanding(i, day) && <p className="text-sm text-[#6b5d4a] mt-1">Rooms are ready from {clock(i.time)}.</p>}
          {/* Only a booked meal (a place or a confirmation) is missing a time; "Dinner on our own" isn't */}
          {i.kind === "meal" && !i.time && (i.confirmation || i.place) && <p className="text-sm text-[#6b5d4a] mt-1">No time in the Guide.</p>}
          {/* The window was just said above ("Any day through Wed, Oct 14") — not twice */}
          {shown.length > 0 && (theirs && shown.length > 2 && !showTheirs
            ? <button onClick={() => setShowTheirs(true)} className="min-h-[44px] text-sm text-[#514636]">Their notes ({shown.length} lines) ›</button>
            : <>
                {/* Wander's own phrasings said to Larisa as "your …" (round 13: on her phone, "The end time is Larisa's
                    estimate", "her Itinerary line this day says…"); her cell text is never touched */}
                {foldNote && (showNote
                  ? <>
                      <GuideText text={noteLines.join("\n")} className="text-sm text-[#6b5d4a] mt-1" />
                      <button onClick={() => setShowNote(false)} className="min-h-[44px] text-sm text-[#514636]">Hide the travel note ‹</button>
                    </>
                  : <button onClick={() => setShowNote(true)} aria-expanded={false} className="min-h-[44px] text-sm text-[#514636]">{v.mine ? "Your" : `${owner || "Larisa"}'s`} travel note ›</button>)}
                {/* ("Time from the Tokyo Day 2 Kappabashi & Akihab tab." — the sheet cuts a tab's name at 31 letters: said as
                    the day's plan tab, its cut name marked as cut; user-julie1) */}
                {visible.length > 0 && <GuideText text={visible.map((l) => {
                  const tabTime = l.match(/^Time from the (.+) tab\.$/);
                  if (tabTime) return `The time is from ${v.her} ${tabLabel(tabTime[1])} tab.`;
                  return /^(The end time is |For .+: her Itinerary line |Beside .+ in her Itinerary|A picture in her tab )/.test(l) ? v.say(l) : l;
                }).join("\n")} className="text-sm text-[#6b5d4a] mt-1" />}
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
          {/* (the way there, from where you are, for today and days ahead — user-julie2, Oct 16: tonight's dinner, reached
              from Home, offered only a search; Walk, Train or Taxi as on every line — Ken, Oct 27) */}
          {goTrio && <>
            {i.place && <p className="text-sm text-[#514636] mt-1 [overflow-wrap:anywhere]">{i.place}</p>}
            <GetThere href={goHref} name={i.title} />
          </>}
          {/* (Send › for every booking — Café ENSOU, with no link of its own, had none; fresh re-check, Oct 27) */}
          {(q || allHerLinks.length > 0 || ["meal", "checkin", "tour", "reservation"].includes(i.kind)) && (
            <div className="flex flex-wrap gap-x-5">
              {q && !wayAbove && !goTrio && (
                <a href={mapsLink(q)} className="inline-flex items-center min-h-[44px] text-sm text-[#514636] underline underline-offset-2 [overflow-wrap:anywhere]">
                  {i.place ? `${i.place} ↗` : "Maps ↗"}
                </a>
              )}
              {herLinks.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] min-w-[44px] text-sm text-[#514636] underline underline-offset-2">{linkLabel(u)} ↗</a>
              ))}
              {/* a booking, to a concierge or a friend: what, when, where, its confirmation (round 16) */}
              {["meal", "checkin", "tour", "reservation"].includes(i.kind) && <SendOut label="Send ›" title={i.title} text={() => bookingText(i, date)} />}
            </div>
          )}
          {/* (its source line opens that spot in her sheet; where her tabs disagree, each tab's spot — round 16) */}
          <SheetSpots tripId={tripId} spots={i.spots} label={friendlySource(i.source, me)} className="mt-1" />
          {compact && open && (
            <button onClick={() => setOpen(false)} aria-expanded={true} className="min-h-[44px] text-sm text-[#514636]">Show less ‹</button>
          )}
        </div>
      </div>
    </Box>
  );
}
