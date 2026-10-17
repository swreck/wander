/**
 * "Play the day" (Oct 15 2026). Ken: "'Play the day' feels right" and, on what it does: "build them, test them… make sure
 * the intent is clear, the bugs are gone, and the experience is lovely". The same moments as the day's plan, in her
 * order, one per screen, the way a story app shows them: the place's photo full screen when Wander has a sure one, a
 * card drawn for the kind of stop when it doesn't (a lunch, a temple, a train — never passed off as the place); the time,
 * the name, a line of her note (all of it on a tap), a train's booking, and Maps. It never moves on by itself (people
 * read this walking). Swipe down, ✕, or the phone's Back closes it, back where you were.
 *
 * 2.0 (Oct 15, Ken on his phone at lunch: "Play the day goes here and nothing happens. Should something happen or have a
 * button to activate?" — then "treat current as 1.0… make it fabulous"): a Next button that names what's next, always in
 * reach of a thumb; swipe left and right; a cover for the day; today, each moment says when it is ("in 45 min"); the end
 * offers tomorrow, straight into its own Play.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import useBackToClose from "../hooks/useBackToClose";
import { placePhotoUrl, type PlaceHit } from "../lib/placePhotos";
import PlaceGallery from "./PlaceGallery";

/** A place's checked photos, in the order shown (the first, and each after it marked ok — at most six) */
const shotsOf = (h: PlaceHit) => h.photos.map((p, n) => (n === 0 || p.ok ? n : -1)).filter((n) => n >= 0).slice(0, 6);
import { lockScroll } from "../lib/scrollLock";
import { PHOTOS_CHANGED, useShowable, type TripPhoto } from "../lib/tripPhotos";

export interface Moment {
  id: string; time: string | null; title: string; note: string | null; map: string | null; hit: PlaceHit | null;
  trains: string[]; forWhom: string | null; isNow: boolean;
  /** her travel lines that lead here ("~2:15 · Taxi to Raku Museum") — folded in, not a screen of their own */
  getting?: string[];
  /** all her words for the line, when there's more than the short note */
  full?: string | null;
  /** when it starts and ends by her plan, minutes after midnight on the trip's clock (today's "in 45 min") */
  start?: number | null; end?: number | null;
  /** the corrections the day's list says on this line, in its words (the booked arrival, her tabs differ) */
  cautions?: string[];
  /** what the list says under it: the stop her tab names, her booking, its dress code */
  info?: string[];
  /** her lines that follow it and fold in ("~1:15 · Finish TeamLab", "Evening · Return to Four Seasons") */
  after?: string[];
  /** when it is, for the Next button, when that's the booked time rather than hers ("1:30 PM", "2:50 PM") */
  at?: string | null;
  /** on board its booked train now (its "Getting there" is behind you) */
  onBoard?: boolean;
  /** the button for its full words when they aren't hers ("Backroads' words") */
  fullLabel?: string;
  /** its kind of moment when its title doesn't say ("bike", "temple", "outdoors"…), for the drawn card */
  kind?: string;
  /** what its photo shows when that's an example rather than the exact spot, said beside the credit */
  photoWords?: string;
}

export interface PlayCover {
  summary: string | null; photo: { src: string; credit: string | null; place: string | null } | null; notes?: string[];
  /** her illustrated map's panel for the day (Kyoto), shown above a moment drawn for its kind: where the day goes, in
   *  her own art (tourist66/67: drawn cards were 40–50% plain; a blur of it was mush) */
  panel?: { src: string; label: string } | null;
  /** when the sun sets that day, minutes after midnight (lib/sun) — on the cover, "sunset about 5:07 PM" */
  sunset?: number | null;
  /** the forecast's likeliest rain hours and showers, [from, to) hours — said on the moments they touch */
  rain?: { wet: [number, number][]; showers: [number, number][] } | null;
  /** "Her" or, to Larisa, "Your" — for "Her full note" */
  her?: string;
  /** your photos from the day and the ones shared with the trip — each after the moment it was taken in */
  photos?: TripPhoto[];
}

// ── A moment with no photo: drawn for its kind of stop, so it reads as finished — never as the place itself ──
type Kind = { name: string; from: string; to: string; icon: ReactElement };
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const KINDS: { test: RegExp; kind: Kind }[] = [
  { test: /\b(flight|airport|KIX|HND|NRT|depart for home)\b/i, kind: { name: "flight", from: "#2c4250", to: "#121a20",
    icon: <path fill="currentColor" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" /> } },
  { test: /\b(shinkansen|nozomi|hikari|haruka|limited express|train|station|JR\b|subway|metro)/i, kind: { name: "train", from: "#2c4250", to: "#121a20",
    icon: <g {...stroke}><rect x="6" y="3" width="12" height="13" rx="3" /><path d="M6 10h12M9 13h.01M15 13h.01M9 16l-2 4M15 16l2 4M8 19h8" /></g> } },
  // (tourist68: the e-bike tour was drawn as a temple gate, a taxi as a compass)
  { test: /\b(taxi|car|van|drive|uber|pick-?up)\b/i, kind: { name: "car", from: "#3a3f48", to: "#16181c",
    icon: <g {...stroke}><path d="M4 16v-3l2-5h12l2 5v3zM4 16v2M20 16v2M6 13h12" /><circle cx="8" cy="16" r="1.4" /><circle cx="16" cy="16" r="1.4" /></g> } },
  { test: /\b(e-?bikes?|e-?biking|bikes?|bicycles?|cycling|biking)\b/i, kind: { name: "bike", from: "#2f4a35", to: "#121c15",
    icon: <g {...stroke}><circle cx="6" cy="16" r="3.5" /><circle cx="18" cy="16" r="3.5" /><path d="M6 16l4-7h5l3 7M10 9l2 7M14 6h2" /></g> } },
  { test: /\b(lunch|dinner|breakfast|brunch|caf[eé]|coffee|tea|matcha|sweets?|wagashi|ramen|sushi|soba|udon|tempura|yakiniku|yakitori|izakaya|kaiseki|restaurant|depachika|food|eat|snack|dessert|ice cream|drinks?|bar|sake|bakery|omakase|cheesecake|cake|souffl[eé]|pastry|chocolate|crepe)\b/i, kind: { name: "meal", from: "#5a3a22", to: "#24170f",
    icon: <g {...stroke}><path d="M4 12h16a8 8 0 0 1-16 0zM9 20h6" /><path d="M14 3l5 7M17 3l3 6" /></g> } },
  { test: /(temple|shrine|jinja|taisha|\w+-ji\b|\w+dera\b|torii|pagoda|zen\b|buddha|kannon|pavilion)/i, kind: { name: "temple", from: "#6b2a1f", to: "#241210",
    icon: <g {...stroke}><path d="M3 6c4 1 14 1 18 0M5 9h14M7 6v15M17 6v15M12 9v3" /></g> } },
  { test: /\b(shop\w*|store|retail|market|mall|muji|boutique|department|souvenir|buy|onitsuka|uniqlo|arcade|stationery|kitchenware)\b/i, kind: { name: "shopping", from: "#4f2f48", to: "#1d121b",
    icon: <g {...stroke}><path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" /></g> } },
  // (pottery and studios as a vase, museums as a building — tourist68: a picture frame read as a missing photo; before
  // "outdoors", so "Ceramic Cultural Park" is pottery)
  { test: /\b(ceramic\w*|potter\w*|studio|craft\w*|workshop|kiln|clay|yakimono|class|demonstration|sccp)\b/i, kind: { name: "craft", from: "#5a3f2c", to: "#21170f",
    icon: <g {...stroke}><path d="M9 3h6M10 3v3c0 1-4 3-4 8 0 4 2.5 7 6 7s6-3 6-7c0-5-4-7-4-8V3M6.5 12h11M7 16.5h10" /></g> } },
  { test: /\b(museum|gallery|art|exhibit\w*|teamlab|ceremony|performance|show|theater|theatre|kabuki)\b/i, kind: { name: "museum", from: "#2c3354", to: "#13162a",
    icon: <g {...stroke}><path d="M3 9l9-5 9 5zM5 9v9M9 9v9M15 9v9M19 9v9M3 20h18" /></g> } },
  { test: /\b(garden|park|forest|bamboo|river|lake|hike|falls|waterfall|gorge|stroll|walk|nature|mountain|onsen)\b/i, kind: { name: "outdoors", from: "#2f4a35", to: "#121c15",
    icon: <g {...stroke}><path d="M12 21v-7M12 14l-5 2M12 14c-6 0-8-5-5-9 2 2 4 2 5-1 1 3 3 3 5 1 3 4 1 9-5 9z" /></g> } },
  { test: /\b(hotel|check[- ]?in|check[- ]?out|refresh|rest|nap|ryokan|luggage|pack|bags?|sleep|bed)\b/i, kind: { name: "hotel", from: "#3a3f48", to: "#16181c",
    icon: <g {...stroke}><path d="M3 18V7M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6" /><circle cx="7" cy="11" r="1.6" /></g> } },
];
const ANY: Kind = { name: "moment", from: "#4a3c2c", to: "#1d1813",
  icon: <g {...stroke}><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></g> };
const kindOf = (m: Moment): Kind => (m.trains.length ? KINDS.find((k) => k.kind.name === "train")!.kind : (m.kind ? KINDS.find((k) => k.kind.name === m.kind)?.kind : undefined) || KINDS.find((k) => k.test.test(m.title))?.kind || KINDS.find((k) => k.test.test(m.note || ""))?.kind || ANY);

/** "in 45 min", "in 1 h 20 min" — and past three hours, the part of the day (tourist65: "in 11 h 30 min" at 7 AM was
 *  noise) */
const inWords = (min: number, at: number) => (min < 60 ? `in ${Math.max(1, Math.round(min))} min` : min <= 180 ? `in ${Math.floor(min / 60)} hr${min % 60 ? ` ${Math.round(min % 60)} min` : ""}`
  : at < 12 * 60 ? "This morning" : at < 17 * 60 ? "This afternoon" : "This evening");

type Slide = { kind: "cover" } | { kind: "moment"; i: number } | { kind: "photo"; p: TripPhoto } | { kind: "end" };

export default function PlayTheDay({ moments, dayWords, start, onClose, cover, nowAt = null, tomorrow = null }: {
  moments: Moment[]; dayWords: string;
  /** the moment to open on (today's Now), or -1 for the day's cover */
  start: number; onClose: () => void;
  cover?: PlayCover;
  /** minutes after midnight on the trip's clock, today only */
  nowAt?: number | null;
  /** the next day of the trip, when there is one: its words, whether it has a Play, and how to go there */
  tomorrow?: { words: string; play: boolean; go: () => void } | null;
}) {
  useBackToClose(true, onClose);
  const coverPhotos = useShowable(cover?.photos || []);
  // The day as lived: her moments in her order, and your photos (yours, and the ones shared) each after the moment it
  // was taken in — by the photo's own clock; one taken before her first moment comes first, one without a clock at the end
  // (a photo the server says isn't there for you anymore — made private or deleted while Play is open — leaves at once)
  const [gonePhoto, setGonePhoto] = useState<Record<string, boolean>>({});
  const slides: Slide[] = (() => {
    const out: Slide[] = [{ kind: "cover" }];
    const shots = coverPhotos.filter((p) => !gonePhoto[p.id]).map((p) => ({ p, min: p.takenAt ? Number(p.takenAt.slice(11, 13)) * 60 + Number(p.takenAt.slice(14, 16)) : null }));
    const starts = moments.map((m) => m.start ?? null);
    const homeOf = (min: number | null) => {
      if (min === null) return moments.length;                  // no clock: at the end
      let k = -1;
      for (let i = 0; i < moments.length; i++) if (starts[i] !== null && starts[i]! <= min) k = i;
      return k;                                                 // -1: before her first moment
    };
    const placed = shots.map((x) => ({ ...x, home: homeOf(x.min) }));
    for (const x of placed.filter((y) => y.home === -1)) out.push({ kind: "photo", p: x.p });
    moments.forEach((_, i) => {
      out.push({ kind: "moment", i });
      for (const x of placed.filter((y) => y.home === i)) out.push({ kind: "photo", p: x.p });
    });
    for (const x of placed.filter((y) => y.home === moments.length)) out.push({ kind: "photo", p: x.p });
    out.push({ kind: "end" });
    return out;
  })();
  const momentSlide = (i: number) => slides.findIndex((x) => x.kind === "moment" && x.i === i);
  const opening = start >= 0 && start < moments.length ? momentSlide(start) : 0;
  const [at, setAt] = useState(opening);
  const [was, setWas] = useState<number | null>(null);
  const [gallery, setGallery] = useState(false);
  const [full, setFull] = useState(false);
  // a moment whose photo couldn't load (no signal) is drawn as its kind of stop
  const [noPhoto, setNoPhoto] = useState<Record<string, boolean>>({});
  const [small, setSmall] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState(0);
  // It moves on by itself (Ken, Oct 16: "Play day should auto advance after a few seconds… people don't wait. Maybe even
  // first change after only 2-3 seconds to teach users about auto before they tap then slow to 5 seconds for rest"):
  // the first time after 3 seconds, then 4; the bar at the top fills to show it. It waits while a finger rests on the
  // screen, while a moment's full words or its photos are open, and while Wander isn't on screen; never past the end.
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(typeof document !== "undefined" && document.visibilityState === "hidden");
  const movedOn = useRef(false);
  // (which of a moment's checked photos is showing — Oct 17, Ken on Robuchon: "I would expect four to six pictures of the
  // restaurant and food"; was a second photo only)
  const [shot, setShot] = useState(0);
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const swiped = useRef(0);
  const slide = slides[Math.min(at, slides.length - 1)];
  useEffect(() => { if (at > slides.length - 1) setAt(slides.length - 1); }, [at, slides.length]);
  // (the slide before is dropped once the new one has faded in — tourist65: kept, it showed around a small photo)
  useEffect(() => { if (was === null) return; const t = setTimeout(() => setWas(null), 450); return () => clearTimeout(t); }, [was, at]);
  const go = (to: number) => {
    const n = Math.max(0, Math.min(slides.length - 1, to));
    if (n === at) return;
    setWas(at); setAt(n); setFull(false);
  };
  const next = () => go(at + 1);
  const back = () => go(at - 1);
  const momentAt = (k: number) => { const s = slides[k]; if (!s || s.kind !== "moment") return null; const m = moments[s.i]; return noPhoto[m.id] ? { ...m, hit: null } : m; };
  const m = momentAt(at);
  // (while a place's photos are open on top, the keys are theirs — tourist64: → moved the day underneath)
  const galleryOpen = useRef(false);
  galleryOpen.current = gallery;
  const keys = useRef({ next, back });
  keys.current = { next, back };
  // (a keyboard — Larisa's iPad — stays inside Play while it's open, and is back on "Play the day" after: tourist65,
  // Tab walked out into the day page behind)
  const root = useRef<HTMLDivElement>(null);
  // The room above a moment's words, measured — her map gets exactly that, or the pattern when it's too little; words
  // taller than the screen scroll in their own space instead of climbing over the date (tourist68: her map ran into the
  // words on long Oct 25 moments; with her full note open, Robuchon's words printed over the date line)
  const topRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<{ top: number; space: number; over: boolean } | null>(null);
  useLayoutEffect(() => {
    const words = wordsRef.current, top = topRef.current;
    if (!words || !top) return;
    const measure = () => {
      const t = top.getBoundingClientRect().bottom + 12;
      const next = { top: t, space: Math.floor(words.getBoundingClientRect().top - t - 44), over: words.scrollHeight > words.clientHeight + 1 };
      setRoom((r) => (r && r.top === next.top && r.space === next.space && r.over === next.over ? r : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(words);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [at, full]);
  useEffect(() => {
    const unlock = lockScroll();
    const before = document.activeElement as HTMLElement | null;
    root.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (galleryOpen.current) return;
      const onControl = !!(e.target as Element | null)?.closest?.("button, a");
      if (e.key === "ArrowRight" || (e.key === " " && !onControl)) { e.preventDefault(); keys.current.next(); }
      else if (e.key === "ArrowLeft") keys.current.back(); else if (e.key === "Escape") onClose();
      else if (e.key === "Tab" && root.current) {
        const all = [...root.current.querySelectorAll<HTMLElement>("button:not([disabled]):not([tabindex='-1']), a[href]")];
        if (!all.length) return;
        const i = all.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); all[all.length - 1].focus(); }
        else if (!e.shiftKey && (i === -1 || i === all.length - 1)) { e.preventDefault(); all[0].focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { unlock(); window.removeEventListener("keydown", onKey); try { before?.focus({ preventScroll: true }); } catch { /* gone */ } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // (the photos either side, fetched ahead, so a tap or a swipe shows them at once — and this moment's other photos)
  useEffect(() => {
    for (const k of [at, at + 1, at - 1]) { const n = momentAt(k); if (n?.hit) for (const j of k === at ? shotsOf(n.hit).slice(1) : [0]) { const i = new Image(); i.src = placePhotoUrl(n.hit, j); } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);
  useEffect(() => { const v = () => setHidden(document.visibilityState === "hidden"); document.addEventListener("visibilitychange", v); return () => document.removeEventListener("visibilitychange", v); }, []);
  const waiting = held || hidden || full || gallery;
  // (4 s after the first — Ken, Oct 16: "with more photos, auto advance can be 1-2 seconds faster"; was 5. A moment with
  // more checked photos stays 2 s on each, the pace its two photos had — six photos, 12 s; a tap moves on at once)
  const shots = slide.kind === "moment" && m?.hit && !small[m.id] ? shotsOf(m.hit) : [0];
  const PER_PHOTO = 2000;
  const stepMs = shots.length > 1 ? shots.length * PER_PHOTO : movedOn.current ? 4000 : 3000;
  // (a fresh count each time it starts again, so the bar's fill and the timer begin together; after a pause it goes on
  // from the photo showing, and the bar fills over what's left)
  const [round, setRound] = useState(0);
  const [runMs, setRunMs] = useState(stepMs);
  useEffect(() => { setShot(0); }, [at]);
  // (a new moment starts at its first photo — the photo showing is only kept across a pause on the same moment)
  const runFor = useRef(at);
  useEffect(() => {
    if (waiting || slide.kind === "end") return;
    const from = runFor.current === at && shots.length > 1 ? Math.min(shot, shots.length - 1) : 0;
    runFor.current = at;
    const left = shots.length > 1 ? (shots.length - from) * PER_PHOTO : stepMs;
    setRound((r) => r + 1);
    setRunMs(left);
    const steps = shots.slice(from + 1).map((_, k) => setTimeout(() => setShot(from + k + 1), (k + 1) * PER_PHOTO));
    const t = setTimeout(() => { movedOn.current = true; keys.current.next(); }, left);
    return () => { clearTimeout(t); steps.forEach(clearTimeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, waiting]);

  // When a moment is, today: Now, in 45 min, under way (someone else's line), earlier
  const whenOf = (x: Moment): string | null => {
    if (x.isNow) return "Now";
    if (nowAt === null || x.start == null) return null;
    if (x.start > nowAt) return inWords(x.start - nowAt, x.start);
    if (x.end != null && nowAt < x.end) return "Under way";
    return "Earlier today";
  };
  // (when it starts, her words: "1:30 PM" of "1:30 PM – 5:00 PM", "11:00" of "11:00–11:30 entry" — the name needs the room)
  const startOf = (t: string) => t.replace(/\s*[–-].*$/, "");
  const timed = moments.filter((x) => x.time && x.start != null);
  // (only when the day's first and last moments have a time — a Backroads day timed only at its 8:30 meeting read
  // "Morning to 8:30 AM", as if it ended there)
  const span = timed.length > 1 && moments[0]?.time && moments[moments.length - 1]?.time ? `${startOf(timed[0].time!)} to ${startOf(timed[timed.length - 1].time!)}` : null;
  const nextMoment = momentAt(at + 1);
  const nextSlide = slides[at + 1];
  // ("7:42 PM", from the photo's own clock)
  const photoTime = (p: TripPhoto) => { const t = p.takenAt?.slice(11, 16); if (!t) return null; const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`; };
  const summary = (cover?.summary || "").trim();

  // The background of a slide: her stop's photo (a small one whole, over a blur of itself), the kind of stop drawn, the
  // city for the cover. The slide before stays under the new one while it fades in — never a flash of black between.
  const backdrop = (k: number, fresh: boolean) => {
    const s = slides[k];
    const fade = fresh ? " play-in" : "";
    if (!s) return null;
    if (s.kind === "cover" || s.kind === "end") {
      const p = cover?.photo;
      return p ? (
        <div key={`bg-${k}`} className={`absolute inset-0 bg-[#1d1813]${fade}`} aria-hidden>
          {/* (a small city photo — Kyoto's is soft stretched to a phone — whole, over a blur of itself) */}
          {small.cover && <img src={p.src} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-70" />}
          <img src={p.src} alt="" onLoad={(e) => { const w = e.currentTarget.naturalWidth; if (w && w < 900 && !small.cover) setSmall((s2) => ({ ...s2, cover: true })); }}
            className={`absolute inset-0 w-full h-full ${small.cover ? "object-contain" : "object-cover play-drift"}`} />
          <div className="absolute inset-0" style={{ background: s.kind === "end" ? "rgba(20,16,12,.7)" : "linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,.25) 50%, rgba(0,0,0,.85) 100%)" }} />
        </div>
      ) : <div key={`bg-${k}`} className={`absolute inset-0${fade}`} style={{ background: "radial-gradient(120% 80% at 30% 20%, #4a3c2c 0%, #1d1813 70%)" }} aria-hidden />;
    }
    if (s.kind === "photo") {
      // your photo, whole, over a soft blur of itself — never cropped (people's pictures are composed)
      return (
        <div key={`bg-${k}`} className={`absolute inset-0 bg-black${fade}`} aria-hidden>
          <img src={s.p.thumbUrl} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-50" />
          <img src={s.p.url} alt="" className="absolute inset-0 w-full h-full object-contain"
            onError={() => { setGonePhoto((g) => ({ ...g, [s.p.id]: true })); window.dispatchEvent(new Event(PHOTOS_CHANGED)); }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 70%, rgba(0,0,0,.75) 100%)" }} />
        </div>
      );
    }
    const x = momentAt(k)!;
    if (x.hit) {
      const src = placePhotoUrl(x.hit, 0);
      return (
        <div key={`bg-${k}`} className={`absolute inset-0 bg-[#1d1813]${fade}`} aria-hidden>
          {small[x.id] && <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-70" />}
          <img src={src} alt=""
            onLoad={(e) => { const w = e.currentTarget.naturalWidth; if (w && w < 900 && !small[x.id]) setSmall((s2) => ({ ...s2, [x.id]: true })); }}
            onError={() => setNoPhoto((s2) => ({ ...s2, [x.id]: true }))}
            className={`absolute inset-0 w-full h-full ${small[x.id] ? "object-contain" : "object-cover play-drift"}`}
            style={{ transformOrigin: k % 2 ? "30% 40%" : "70% 60%" }} />
          {/* (the place's other checked photos, each fading in over the last — Ken, Oct 16: "Increase to two photos in play
              day only"; Oct 17, on Robuchon: "four to six pictures of the restaurant and food") */}
          {k === at && !small[x.id] && shotsOf(x.hit).slice(1).map((j, n) => (
            <img key={j} src={placePhotoUrl(x.hit!, j)} alt="" className={`absolute inset-0 w-full h-full object-cover play-drift transition-opacity duration-1000 ${shot >= n + 1 ? "opacity-100" : "opacity-0"}`}
              style={{ transformOrigin: (k + n) % 2 ? "30% 40%" : "70% 60%" }} />
          ))}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.5) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 42%, rgba(0,0,0,.85) 100%)" }} />
        </div>
      );
    }
    const kind = kindOf(x);
    return (
      <div key={`bg-${k}`} className={`absolute inset-0 overflow-hidden${fade}`} aria-hidden style={{ background: `radial-gradient(130% 70% at 50% 22%, ${kind.from} 0%, ${kind.to} 72%)` }}>
        {cover?.panel && !full && room && room.space >= 140 ? (
          // Her map of the day, clear, in the room above the words: where this stop sits on her route
          <figure className="absolute inset-x-0 flex flex-col items-center justify-center" style={{ top: room.top, height: room.space + 28 }}>
            <img src={cover.panel.src} alt="" className="max-w-[92%] object-contain rounded-lg shadow-[0_8px_30px_rgba(0,0,0,.45)]" style={{ maxHeight: room.space }} />
            <figcaption className="text-[11px] text-white/60 mt-2">{cover.panel.label}</figcaption>
          </figure>
        ) : (
          // Otherwise a quiet pattern of the stop's own drawing, fading toward the words — designed, never the place
          <svg className="absolute inset-0 w-full h-full text-white" style={{ opacity: 0.07, WebkitMaskImage: "linear-gradient(180deg, #000 0%, #000 35%, transparent 70%)", maskImage: "linear-gradient(180deg, #000 0%, #000 35%, transparent 70%)" }}>
            <defs>
              <pattern id={`kind-${k}`} width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
                <svg x="16" y="16" width="32" height="32" viewBox="0 0 24 24">{kind.icon}</svg>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#kind-${k})`} />
          </svg>
        )}
      </div>
    );
  };

  return (
    <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Play the day: ${dayWords}`} className="fixed inset-0 z-[300] bg-[#1d1813] text-white select-none overflow-hidden outline-none"
      onTouchStart={(e) => {
        if ((e.target as Element).closest("[data-scroll]")) { touch.current = null; return; }
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
      }}
      onTouchMove={(e) => {
        if (!touch.current) return;
        const dx = e.touches[0].clientX - touch.current.x, dy = e.touches[0].clientY - touch.current.y;
        if (Math.abs(dx) > Math.abs(dy)) setDrag(Math.max(-90, Math.min(90, dx * 0.45)));
      }}
      onPointerDown={() => setHeld(true)} onPointerUp={() => setHeld(false)} onPointerCancel={() => setHeld(false)} onPointerLeave={() => setHeld(false)}
      onTouchEnd={(e) => {
        const t0 = touch.current; touch.current = null; setDrag(0);
        if (!t0) return;
        const dx = e.changedTouches[0].clientX - t0.x, dy = e.changedTouches[0].clientY - t0.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) { swiped.current = Date.now(); if (dx < 0) next(); else back(); }
        else if (dy > 110 && dy > Math.abs(dx) * 1.5) { swiped.current = Date.now(); onClose(); }
      }}>
      {was !== null && was !== at && backdrop(was, false)}
      {backdrop(at, true)}

      {/* the day's moments, and where you are in them */}
      <div ref={topRef} className="absolute inset-x-0 top-0 z-30 px-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}>
        <div className="flex gap-1" aria-hidden>
          {moments.map((x, i) => {
            const k = momentSlide(i);
            return (
              <span key={x.id} className={`relative flex-1 h-[3px] rounded-full overflow-hidden ${k < at ? "bg-white/85" : "bg-white/30"}`}>
                {k === at && <span key={`fill-${at}-${round}`} className="absolute inset-y-0 left-0 bg-white play-fill"
                  style={{ animationDuration: `${runMs}ms`, animationPlayState: waiting ? "paused" : "running" }} />}
              </span>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[13px] text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,.5)] truncate">{dayWords}</span>
          <button type="button" onClick={onClose} aria-label="Close and go back to the day" className="shrink-0 min-h-[44px] min-w-[44px] -mr-2 text-xl text-white [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">✕</button>
        </div>
      </div>

      {/* a tap on the left of the picture for the moment before, anywhere else on it for the next — the Next button below
          says so in words */}
      <button type="button" tabIndex={-1} aria-hidden onClick={() => { if (Date.now() - swiped.current > 400) back(); }} disabled={at === 0} className="absolute left-0 top-0 bottom-0 w-[30%] z-10" />
      <button type="button" tabIndex={-1} aria-hidden onClick={() => { if (Date.now() - swiped.current > 400 && slide.kind !== "end") next(); }} className="absolute right-0 top-0 bottom-0 w-[70%] z-10" />

      <div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}>
        <div key={at} ref={wordsRef} {...(room?.over ? { "data-scroll": "" } : {})} aria-live="polite"
          className={`play-rise px-5 mx-auto max-w-[640px] overflow-y-auto overscroll-contain ${room?.over ? "pointer-events-auto" : ""}`}
          style={{ maxHeight: `calc(100dvh - ${room ? Math.round(room.top) : 90}px - 100px - env(safe-area-inset-bottom, 0px))`, transform: drag ? `translateX(${drag}px)` : undefined, transition: drag ? "none" : "transform .25s ease-out" }}>
          {slide.kind === "cover" && (
            <div className="pb-3">
              <p className="text-[13px] uppercase tracking-[.14em] text-white/75">Play the day</p>
              <p className="text-[34px] font-light leading-[1.1] mt-1 [text-shadow:0_1px_8px_rgba(0,0,0,.6)]">{dayWords}</p>
              {summary && (
                <div data-scroll className={`pointer-events-auto mt-2 ${full ? "max-h-[38vh] overflow-y-auto overscroll-contain" : ""}`}>
                  <p className={`text-[16px] leading-snug text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,.6)] ${full ? "" : "line-clamp-4"}`}>{summary}</p>
                </div>
              )}
              {/* (a long summary says there's more — tourist65: clamped with no way to read it) */}
              {summary.length > 190 && (
                <button type="button" onClick={() => setFull((f) => !f)} className="pointer-events-auto inline-flex items-center min-h-[44px] min-w-[44px] pr-2 text-[15px] text-white underline underline-offset-4">{full ? "Less" : "More"}</button>
              )}
              {(cover?.notes || []).map((n) => <p key={n} className="text-[13px] mt-2 bg-[#fff8ec]/90 text-[#6a4512] rounded-lg px-2.5 py-1.5">{n}</p>)}
              <p className="text-[14px] text-white/75 mt-2">{moments.length} moments{span ? ` · ${span}` : ""}{cover?.sunset != null ? ` · sunset about ${Math.floor(cover.sunset / 60) % 12 || 12}:${String(cover.sunset % 60).padStart(2, "0")} PM` : ""}</p>
              {/* (the city's photo credit comes worded: "Photo: Léonard Havet") */}
              {cover?.photo && (cover.photo.place || cover.photo.credit) && <p className="text-[11px] text-white/55 mt-1">{[cover.photo.place, cover.photo.credit].filter(Boolean).join(" · ")}</p>}
            </div>
          )}
          {slide.kind === "photo" && (
            <div className="pb-3">
              <p className="text-[15px] text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,.6)]">{slide.p.mine ? "Your photo" : `${slide.p.authorName}'s photo`}{photoTime(slide.p) ? ` · ${photoTime(slide.p)}` : ""}{slide.p.mine && !slide.p.shared ? " · just you" : ""}</p>
              {slide.p.caption && <p className="text-[17px] text-white mt-0.5 [text-shadow:0_1px_4px_rgba(0,0,0,.6)]">{slide.p.caption}</p>}
            </div>
          )}
          {slide.kind === "end" && (
            <div className="pb-[22vh]">
              <p className="text-[30px] font-light leading-tight">That’s the day.</p>
              <p className="text-[15px] text-white/80 mt-2">{moments.length} moments{span ? `, ${span}` : ""}</p>
            </div>
          )}
          {m && (() => {
            const when = whenOf(m);
            return (
              <div className="pb-3">
                {/* (no sure photo: a drawing of the kind of stop, just above its words — a lunch, a temple, a train — never
                    passed off as the place) */}
                {!m.hit && !full && (
                  <div className="w-[84px] h-[84px] mb-4 rounded-full border border-white/25 bg-white/10 flex items-center justify-center text-white/85" aria-hidden>
                    <svg width="42" height="42" viewBox="0 0 24 24">{kindOf(m).icon}</svg>
                  </div>
                )}
                {when && (
                  <span className={`inline-block text-[11px] uppercase tracking-[.12em] font-semibold rounded px-1.5 py-0.5 mb-2 ${when === "Now" ? "bg-[#c8a060] text-[#2a231c]" : "bg-white/15 text-white/90 border border-white/25"}`}>{when}</span>
                )}
                {/* (how you get here, in her words and times, above the moment itself) */}
                {(m.onBoard ? [] : m.getting || []).map((g) => <p key={g} className="text-[13px] text-white/80 mb-1 [text-shadow:0_1px_4px_rgba(0,0,0,.6)]">Getting there: {g}</p>)}
                {m.time && <p className="text-[17px] text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,.6)]">{m.time}</p>}
                <p className={`${m.hit ? "text-[28px]" : "text-[31px]"} font-light leading-tight [text-shadow:0_1px_6px_rgba(0,0,0,.6)] [overflow-wrap:anywhere]`}>{m.title}</p>
                {m.forWhom && <p className="text-[14px] text-white/80 mt-1">{m.forWhom}</p>}
                {/* (the list's corrections, in its words, before anything else about the line — the booked arrival, her
                    tabs differ: Play is never less careful than the list) */}
                {(m.cautions || []).map((c) => <p key={c} className="text-[14px] mt-2 bg-[#fff8ec] text-[#6a4512] rounded-lg px-2.5 py-1.5 [overflow-wrap:anywhere]">{c}</p>)}
                {m.trains.map((t) => <p key={t} className="text-[14px] mt-2 bg-white/12 border border-white/25 rounded-lg px-2.5 py-1.5 [overflow-wrap:anywhere]">{t}</p>)}
                {(m.info || []).map((t) => <p key={t} className="text-[14px] text-white/90 mt-1.5 [text-shadow:0_1px_4px_rgba(0,0,0,.6)] [overflow-wrap:anywhere]">{t}</p>)}
                {m.note && !full && (
                  <p className="text-[15px] leading-snug text-white/90 mt-2 line-clamp-3 [text-shadow:0_1px_4px_rgba(0,0,0,.6)]">{m.note}</p>
                )}
                {(m.after || []).map((t) => <p key={t} className="text-[13px] text-white/80 mt-1.5 [text-shadow:0_1px_4px_rgba(0,0,0,.6)]">Then: {t}</p>)}
                {/* (all her words for the line, here in Play — Ken's lunch note stopped at "gourmet fresh salads from…") */}
                {full && m.full && (
                  <div data-scroll className="pointer-events-auto mt-2 max-h-[40vh] overflow-y-auto rounded-lg bg-black/35 px-3 py-2">
                    {/* (whose words, still said once open — the button that named them turns into "Less"; user-ken1) */}
                    {m.fullLabel && <p className="text-[11px] uppercase tracking-[.12em] text-white/60 mb-1">{m.fullLabel}</p>}
                    <p className="text-[15px] leading-snug text-white/95 whitespace-pre-line">{m.full}</p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-5 mt-1 pointer-events-auto">
                  {m.full && <button type="button" onClick={() => setFull((f) => !f)} className="inline-flex items-center min-h-[44px] min-w-[44px] pr-2 text-[15px] text-white underline underline-offset-4">{full ? "Less" : m.fullLabel || `${cover?.her || "Her"} full note`}</button>}
                  {m.map && <a href={m.map} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] text-[15px] text-white underline underline-offset-4">Maps ↗</a>}
                  {m.hit && m.hit.photos.length > 1 && (
                    <button type="button" onClick={() => setGallery(true)} className="inline-flex items-center min-h-[44px] text-[15px] text-white underline underline-offset-4">{m.hit.photos.length} photos</button>
                  )}
                </div>
                {/* (what the photo is, when it's an example — "Mount Daimonji, as an example" — said with its credit) */}
                {m.hit && m.photoWords && <p className="text-[12px] text-white/75">{m.photoWords}</p>}
                {(() => { const c = m.hit?.photos[shots[Math.min(shot, shots.length - 1)] ?? 0]?.credit; return c ? <p className="text-[11px] text-white/55">Photo: {c} · Google</p> : null; })()}
              </div>
            );
          })()}
        </div>

        {/* What's next, in words, in reach of a thumb — on every screen (Ken, Oct 15: "Should something happen or have a
            button to activate?") */}
        <div className="pointer-events-auto px-4 pt-2 mx-auto max-w-[640px] flex items-center gap-3">
          {slide.kind === "end" ? (
            <div className="w-full flex flex-col gap-2.5">
              {tomorrow && (
                <button type="button" onClick={tomorrow.go} className="w-full min-h-[54px] px-5 rounded-full bg-white text-[#2a231c] text-[16px] font-medium flex items-center justify-between gap-3">
                  <span className="truncate">{/* ("tomorrow" only when this is today — from Saturday on a Friday it read wrong; user-andy3) */}
                  <span className="font-semibold">{nowAt !== null ? (tomorrow.play ? "Play tomorrow" : "See tomorrow") : (tomorrow.play ? "Play the next day" : "See the next day")}</span><span className="text-[#6b5d4a]"> · {tomorrow.words}</span></span><span aria-hidden className="text-xl leading-none">›</span>
                </button>
              )}
              <div className="flex gap-2.5">
                {/* (back to the day's last moment, as on every other screen — tourist67) */}
                <button type="button" onClick={back} aria-label="The moment before"
                  className="shrink-0 w-[50px] h-[50px] rounded-full bg-white/15 border border-white/35 text-2xl leading-none flex items-center justify-center">‹</button>
                <button type="button" onClick={onClose} className={`flex-1 min-h-[50px] px-4 rounded-full text-[15px] font-medium ${tomorrow ? "bg-white/15 border border-white/35 text-white" : "bg-white text-[#2a231c]"}`}>Back to the day</button>
                <button type="button" onClick={() => go(1)} className="flex-1 min-h-[50px] px-4 rounded-full bg-white/15 border border-white/35 text-white text-[15px]">From the start</button>
              </div>
            </div>
          ) : (
            <>
              {at > 0 && (
                <button type="button" onClick={back} aria-label={at === 1 ? "Back to the day's start" : "The moment before"}
                  className="shrink-0 w-[54px] h-[54px] rounded-full bg-white/15 border border-white/35 backdrop-blur-sm text-2xl leading-none flex items-center justify-center">‹</button>
              )}
              <button type="button" onClick={next}
                className="flex-1 min-w-0 min-h-[54px] pl-5 pr-4 rounded-full bg-white text-[#2a231c] text-[16px] flex items-center justify-between gap-3 shadow-[0_4px_18px_rgba(0,0,0,.35)] active:scale-[.98] transition-transform">
                {/* (two lines, so the name has the width — "Ginza Premiu…" on one) */}
                <span className="min-w-0 text-left flex flex-col leading-tight py-1.5">
                  {nextSlide?.kind === "photo" ? (
                    <>
                      <span className="text-[12px] text-[#6b5d4a]"><span className="font-semibold text-[#2a231c]">{slide.kind === "cover" ? "Start" : "Next"}</span>{photoTime(nextSlide.p) ? ` · ${photoTime(nextSlide.p)}` : ""}</span>
                      <span className="text-[16px] font-medium truncate">{nextSlide.p.mine ? "Your photo" : `${nextSlide.p.authorName}'s photo`}</span>
                    </>
                  ) : nextMoment ? (
                    <>
                      <span className="text-[12px] text-[#6b5d4a]"><span className="font-semibold text-[#2a231c]">{slide.kind === "cover" ? "Start" : "Next"}</span>{nextMoment.at ? ` · ${nextMoment.at}` : nextMoment.time ? ` · ${startOf(nextMoment.time)}` : ""}</span>
                      <span className="text-[16px] font-medium truncate">{nextMoment.title}</span>
                    </>
                  ) : <span className="text-[16px] font-semibold">End of the day</span>}
                </span>
                <span aria-hidden className="text-xl leading-none">›</span>
              </button>
            </>
          )}
        </div>
      </div>
      {gallery && m?.hit && <PlaceGallery hit={m.hit} start={shots[Math.min(shot, shots.length - 1)] ?? 0} title={m.title} time={m.time} map={m.map} onClose={() => setGallery(false)} />}
    </div>
  );
}
