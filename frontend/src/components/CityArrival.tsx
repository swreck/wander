/**
 * The first time a day in a city opens on this phone: a full-screen photo of the city with its name, for a moment
 * (charm item C2, Oct 1 2026 — the April "city splash", brought back). Once per city per phone; never when there's no
 * signal or the photo isn't ready in about two seconds (it never makes anyone wait); a tap puts it away. The photo comes
 * through Wander's server (/api/city-photo), so no Google key reaches the phone; its photographer is credited.
 * Ken, Oct 8: "add 1 to 2 seconds more time for the photo… and add a subtle hidden button… to go back to the photo" —
 * it stays 1.5 s longer, and the city's name atop its day brings it back (CityTitle, below).
 */
import { useEffect, useRef, useState } from "react";

const seenKey = (cityId: string) => `wander:city-arrival:${cityId}`;
// How long the photo stays before it fades (it was 1.6 s; Ken: "1 to 2 seconds more")
const HOLD_MS = 3100;

type Shown = { src: string | null; place: string | null; credit: string | null };

const seen = (cityId: string) => { try { return !!localStorage.getItem(seenKey(cityId)); } catch { return true; } };

/** Photos on the phone and ready to show, by city — asked for ahead of the day (Home warms today's city; the day screen
 *  asks while its own lines load). The first-time photo shows only if it's ready when the day is first drawn: one that
 *  arrived after landed over a day being read (Oct 10 re-audit: 0.5–0.8 s after the day's first lines, for ~3.8 s). */
const readyPhotos = new Map<string, Shown>();
const warming = new Map<string, Promise<void>>();
type Info = { image: string | null; place?: string | null; credit?: string | null };
// (its details kept on the phone too — the picture itself the phone keeps a week — so opening the day again needn't ask)
const infoKey = (cityId: string) => `wander:city-photo-info:${cityId}`;
/** This city's first-time photo is still to be shown and isn't ready yet — the day may give it a moment */
export const photoWanted = (cityId: string | null | undefined) => !!cityId && !seen(cityId) && !readyPhotos.has(cityId);
export function warmCityPhoto(cityId: string | null | undefined): Promise<void> {
  if (!cityId || readyPhotos.has(cityId) || seen(cityId) || (typeof navigator !== "undefined" && navigator.onLine === false)) return Promise.resolve();
  if (!warming.has(cityId)) {
    const controller = new AbortController();
    const giveUp = setTimeout(() => controller.abort(), 15000);
    let kept: Info | null = null;
    try { kept = JSON.parse(localStorage.getItem(infoKey(cityId)) || "null"); } catch { /* unreadable */ }
    const info: Promise<Info | null> = kept?.image ? Promise.resolve(kept)
      : fetch(`/api/city-photo/${encodeURIComponent(cityId)}/info`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((i: Info | null) => { if (i?.image) { try { localStorage.setItem(infoKey(cityId), JSON.stringify(i)); } catch { /* full */ } } return i; });
    warming.set(cityId, info
      .then((info) => {
        if (!info?.image) return;
        const img = new Image();
        img.src = info.image;
        // (decoded, not just fetched — so it shows in the same moment as the day, not a beat after)
        return img.decode().then(() => { readyPhotos.set(cityId, { src: info.image!, place: info.place || null, credit: info.credit || null }); });
      })
      .catch(() => { /* no photo this time — the day just opens */ })
      .finally(() => { clearTimeout(giveUp); warming.delete(cityId); }));
  }
  return warming.get(cityId)!;
}

export default function CityArrival({ cityId, cityName, dateWords, auto = true, replay = 0 }: {
  cityId: string | null | undefined; cityName: string; dateWords: string;
  /** shown by itself the first time a day in this city opens (only once you've arrived) */
  auto?: boolean;
  /** each new number shows it again, asked for */
  replay?: number;
}) {
  // The first time, by itself — in the day's very first drawing, or not this visit
  const [shown, setShown] = useState<Shown | null>(() => (auto && cityId && readyPhotos.has(cityId) && !seen(cityId) ? readyPhotos.get(cityId)! : null));
  const [fading, setFading] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shownAt = useRef(Date.now());
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const linger = (ms: number) => {
    timers.current.push(setTimeout(() => setFading(true), ms));
    timers.current.push(setTimeout(() => setShown(null), ms + 700));
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (!auto || !cityId) return;
    if (shown && shown.src && readyPhotos.get(cityId) === shown) {
      try { localStorage.setItem(seenKey(cityId), "1"); } catch { /* storage off: may show again, harmless */ }
      linger(HOLD_MS);
      return;
    }
    // Not ready in time: not shown and not marked seen — it's asked for now, so the next visit shows it at once. The
    // city's name above the day brings it any time.
    warmCityPhoto(cityId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, auto]);

  // Asked for again: the city's name at once, its photo as soon as it comes (with no signal, the name, briefly)
  useEffect(() => {
    if (!replay || !cityId) return;
    let alive = true;
    clearTimers();
    shownAt.current = Date.now();
    setFading(false);
    setShown({ src: null, place: null, credit: null });
    const controller = new AbortController();
    const giveUp = setTimeout(() => controller.abort(), 8000);
    const noPhoto = () => { if (alive) linger(1200); };
    fetch(`/api/city-photo/${encodeURIComponent(cityId)}/info`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((info: { image: string | null; place?: string | null; credit?: string | null } | null) => {
        if (!alive) return;
        if (!info?.image) return noPhoto();
        const img = new Image();
        img.onload = () => {
          if (!alive) return;
          setShown({ src: info.image!, place: info.place || null, credit: info.credit || null });
          linger(HOLD_MS);
        };
        img.onerror = noPhoto;
        img.src = info.image;
      })
      .catch(noPhoto)
      .finally(() => clearTimeout(giveUp));
    return () => { alive = false; controller.abort(); clearTimeout(giveUp); };
  }, [replay, cityId]);

  if (!shown) return null;
  // (a tap in its first moment — the end of the tap that opened the day — doesn't put it away; tester t4 never saw Nagoya's)
  const putAway = () => {
    if (Date.now() - shownAt.current < 600) return;
    clearTimers();
    setFading(true); timers.current.push(setTimeout(() => setShown(null), 500));
  };
  return (
    <div role="dialog" aria-label={`Arriving in ${cityName}`} onClick={putAway}
      className={`fixed inset-0 z-[70] bg-[#2a2420] transition-opacity duration-500 motion-reduce:transition-none ${fading ? "opacity-0" : "opacity-100"}`}>
      {shown.src && <img src={shown.src} alt="" className="absolute inset-0 w-full h-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/25" />
      {/* (clear of the iPhone's home bar, with room to spare — map review, Oct 1 2026) */}
      <div className="absolute left-0 right-0 bottom-0 px-6 pb-[calc(env(safe-area-inset-bottom,0px)+56px)] text-white">
        <p className="text-[40px] leading-tight font-light tracking-wide drop-shadow-lg">{cityName}</p>
        <p className="text-sm text-white/85 mt-1 drop-shadow">{dateWords}</p>
        {(shown.place || shown.credit) && (
          <p className="text-[11px] text-white/70 mt-3 drop-shadow">{[shown.place, shown.credit].filter(Boolean).join(" · ")}</p>
        )}
      </div>
      <span className="sr-only">Tap to continue</span>
    </div>
  );
}

/**
 * The city's name atop its day. Where the city has a photo, a tap on the name brings it back — quietly offered: a faint
 * picture mark beside the name, nothing more (Ken, Oct 8: "a subtle hidden button").
 */
export function CityTitle({ cityId, cityName, dateWords, auto, photo }: {
  cityId: string; cityName: string; dateWords: string;
  /** the first-time photo may show by itself (you're there) */
  auto: boolean;
  /** this city has a photo to show (a city of the trip's country) */
  photo: boolean;
}) {
  const [replay, setReplay] = useState(0);
  const name = "text-[32px] leading-tight font-light tracking-wide text-[#3a3128]";
  if (!photo) return <p className={`${name} min-w-0`}>{cityName}</p>;
  return (
    <>
      <button onClick={() => setReplay((n) => n + 1)} aria-label={`${cityName} — see its photo again`}
        className="min-w-0 min-h-[44px] inline-flex items-center gap-2 text-left">
        <span className={name}>{cityName}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b5d4a" strokeOpacity="0.45" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 mt-1.5">
          <rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" />
        </svg>
      </button>
      <CityArrival cityId={cityId} cityName={cityName} dateWords={dateWords} auto={auto} replay={replay} />
    </>
  );
}
