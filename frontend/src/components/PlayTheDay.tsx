/**
 * "Play the day" (Oct 15 2026). Ken: "'Play the day' feels right" and, on what it does: "build them, test them… make sure
 * the intent is clear, the bugs are gone, and the experience is lovely". The same moments as the day's plan, in her
 * order, one per screen, the way a story app shows them: the place's photo full screen when Wander has a sure one, a
 * plain card when it doesn't (a train, a walk, "refresh at the hotel"); the time, the name, a line of her note, a train's
 * booking, and Maps. Tap the right of the screen for the next moment, the left for the one before; it never moves on by
 * itself (people read this walking). Swipe down, ✕, or the phone's Back closes it, back where you were. Today it opens
 * on what's happening now.
 */
import { useEffect, useRef, useState } from "react";
import useBackToClose from "../hooks/useBackToClose";
import { placePhotoUrl, type PlaceHit } from "../lib/placePhotos";
import PlaceGallery from "./PlaceGallery";
import { lockScroll } from "../lib/scrollLock";

export interface Moment {
  id: string; time: string | null; title: string; note: string | null; map: string | null; hit: PlaceHit | null;
  trains: string[]; forWhom: string | null; isNow: boolean;
  /** her travel lines that lead here ("~2:15 · Taxi to Raku Museum") — folded in, not a screen of their own */
  getting?: string[];
}

export default function PlayTheDay({ moments, dayWords, start, onClose }: {
  moments: Moment[]; dayWords: string; start: number; onClose: () => void;
}) {
  useBackToClose(true, onClose);
  const opening = Math.min(Math.max(0, start), moments.length - 1);
  const [at, setAt] = useState(opening);
  const [gallery, setGallery] = useState(false);
  // a moment whose photo couldn't load (no signal) is shown as a plain card
  const [noPhoto, setNoPhoto] = useState<Record<string, boolean>>({});
  const [small, setSmall] = useState<Record<string, boolean>>({});
  const downY = useRef<number | null>(null);
  const end = at >= moments.length;
  const m0 = end ? null : moments[at];
  const m = m0 && noPhoto[m0.id] ? { ...m0, hit: null } : m0;
  const next = () => setAt((i) => Math.min(i + 1, moments.length));
  const back = () => setAt((i) => Math.max(i - 1, 0));
  // (while a place's photos are open on top, the keys are theirs — tourist64: → moved the day underneath)
  const galleryOpen = useRef(false);
  galleryOpen.current = gallery;
  useEffect(() => {
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (galleryOpen.current) return;
      if (e.key === "ArrowRight") next(); else if (e.key === "ArrowLeft") back(); else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => { unlock(); window.removeEventListener("keydown", onKey); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // (the next moment's photo, fetched ahead, so a tap shows it at once)
  useEffect(() => { const n = moments[at + 1]; if (n?.hit) { const i = new Image(); i.src = placePhotoUrl(n.hit, 0); } }, [at, moments]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Play the day: ${dayWords}`} className="fixed inset-0 z-[300] bg-[#1d1813] text-white select-none overflow-hidden"
      onTouchStart={(e) => { downY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => { if (downY.current !== null && e.changedTouches[0].clientY - downY.current > 110) onClose(); downY.current = null; }}>
      {/* (a small photo — the Imperial's is 599 px — is shown whole over a soft blur of itself, never stretched soft:
          tourist64) */}
      {m?.hit && small[m.id] && <img src={placePhotoUrl(m.hit, 0)} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-70" />}
      {m?.hit && <img key={m.id} src={placePhotoUrl(m.hit, 0)} alt="" aria-hidden
        onLoad={(e) => { const w = e.currentTarget.naturalWidth; if (w && w < 900 && !small[m.id]) setSmall((x) => ({ ...x, [m.id]: true })); }}
        onError={() => setNoPhoto((x) => ({ ...x, [m.id]: true }))}
        className={`absolute inset-0 w-full h-full ${small[m.id] ? "object-contain" : "object-cover"} motion-safe:animate-[fadeIn_.35s_ease-out]`} />}
      <div className="absolute inset-0" aria-hidden style={{ background: m?.hit ? "linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 45%, rgba(0,0,0,.82) 100%)" : "radial-gradient(120% 80% at 30% 20%, #3a3026 0%, #1d1813 70%)" }} />

      {/* the day's moments, and where you are in them */}
      <div className="absolute inset-x-0 top-0 z-20 px-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}>
        <div className="flex gap-1" aria-hidden>
          {moments.map((x, i) => <span key={x.id} className={`flex-1 h-[3px] rounded-full ${i <= at ? "bg-white" : "bg-white/35"}`} />)}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[13px] text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">{dayWords}</span>
          <button type="button" onClick={onClose} aria-label="Close and go back to the day" className="min-h-[44px] min-w-[44px] -mr-2 text-xl text-white [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">✕</button>
        </div>
      </div>

      {/* tap the left for the moment before, the rest for the next (the words and buttons below sit above these) */}
      <button type="button" aria-label="The moment before" onClick={back} disabled={at === 0} className="absolute left-0 top-0 bottom-0 w-[30%] z-10" />
      <button type="button" aria-label={end ? "Back to the day" : "The next moment"} onClick={end ? onClose : next} className="absolute right-0 top-0 bottom-0 w-[70%] z-10" />

      <div className="absolute inset-x-0 bottom-0 z-20 px-5 pointer-events-none" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)" }} aria-live="polite">
        {end ? (
          <div className="pointer-events-auto pb-[30vh]">
            <p className="text-[28px] font-light leading-tight">That’s the day.</p>
            <p className="text-[15px] text-white/80 mt-2">{dayWords}</p>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={onClose} className="min-h-[44px] px-5 rounded-full bg-white text-[#2a231c] text-[15px] font-medium">Back to the day</button>
              <button type="button" onClick={() => setAt(0)} className="min-h-[44px] px-5 rounded-full border border-white/60 text-[15px]">From the start</button>
            </div>
          </div>
        ) : m && (
          <div className={m.hit ? "" : "pb-[18vh]"}>
            {m.isNow && <span className="inline-block text-[11px] uppercase tracking-[.12em] bg-[#c8a060] text-[#2a231c] font-semibold rounded px-1.5 py-0.5 mb-2">Now</span>}
            {/* (how you get here, in her words and times, above the moment itself) */}
            {(m.getting || []).map((g) => <p key={g} className="text-[13px] text-white/80 mb-1 [text-shadow:0_1px_4px_rgba(0,0,0,.6)]">Getting there: {g}</p>)}
            {m.time && <p className="text-[17px] text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,.6)]">{m.time}</p>}
            <p className={`${m.hit ? "text-[28px]" : "text-[32px]"} font-light leading-tight [text-shadow:0_1px_6px_rgba(0,0,0,.6)] [overflow-wrap:anywhere]`}>{m.title}</p>
            {m.forWhom && <p className="text-[14px] text-white/80 mt-1">{m.forWhom}</p>}
            {m.trains.map((t) => <p key={t} className="text-[14px] mt-2 bg-white/12 border border-white/25 rounded-lg px-2.5 py-1.5 [overflow-wrap:anywhere]">{t}</p>)}
            {m.note && <p className="text-[15px] leading-snug text-white/90 mt-2 line-clamp-3 [text-shadow:0_1px_4px_rgba(0,0,0,.6)]">{m.note}</p>}
            <div className="flex flex-wrap items-center gap-x-5 mt-2 pointer-events-auto">
              {m.map && <a href={m.map} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] text-[15px] text-white underline underline-offset-4">Maps ↗</a>}
              {m.hit && m.hit.photos.length > 1 && (
                <button type="button" onClick={() => setGallery(true)} className="inline-flex items-center min-h-[44px] text-[15px] text-white underline underline-offset-4">{m.hit.photos.length} photos</button>
              )}
              {m.hit?.photos[0]?.credit && <span className="text-[11px] text-white/55">Photo: {m.hit.photos[0].credit} · Google</span>}
            </div>
            {/* (on whichever moment it opens on — tourist63: opened at 3 PM on "Now", there was no hint) */}
            {at === opening && <p className="text-[12px] text-white/60 mt-3">Tap the right side for the next moment, the left to go back · swipe down to close</p>}
          </div>
        )}
      </div>
      {gallery && m?.hit && <PlaceGallery hit={m.hit} title={m.title} time={m.time} map={m.map} onClose={() => setGallery(false)} />}
    </div>
  );
}
