/**
 * More photos of one stop, full screen (Oct 15 2026; Ken: "It might be an option when you see a picture to see more
 * pictures"). Swipe across the place's photos; the stop's time, name and Maps stay pinned below; Done, the phone's Back,
 * or a swipe down closes it — only it, when it's opened from "Play the day" (tourist63). Each photo names its
 * photographer, as Google asks. Only the photo in view and its neighbours are fetched (a place's six large photos are
 * about 2 MB); one that can't load says so.
 */
import { useEffect, useRef, useState } from "react";
import useBackToClose from "../hooks/useBackToClose";
import { placePhotoUrl, type PlaceHit } from "../lib/placePhotos";
import { lockScroll } from "../lib/scrollLock";

export default function PlaceGallery({ hit, title, time, map, start = 0, onClose }: {
  hit: PlaceHit; title: string; time: string | null; map: string | null; start?: number; onClose: () => void;
}) {
  useBackToClose(true, onClose);
  const strip = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(start);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const downY = useRef<number | null>(null);
  useEffect(() => {
    const el = strip.current;
    if (el && start) el.scrollTo({ left: start * el.clientWidth });
    return lockScroll();
  }, [start]);
  // (its own keys: Escape closes just it; the arrows move across its photos)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = strip.current;
      if (e.key === "Escape") onClose();
      else if (el && (e.key === "ArrowRight" || e.key === "ArrowLeft")) el.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * el.clientWidth, behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const credit = hit.photos[at]?.credit;
  return (
    <div role="dialog" aria-modal="true" aria-label={`Photos of ${hit.name || title}`} className="fixed inset-0 z-[310] bg-black flex flex-col"
      // (its own swipe down only: Play the day underneath doesn't hear it)
      onTouchStart={(e) => { e.stopPropagation(); downY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => { e.stopPropagation(); if (downY.current !== null && e.changedTouches[0].clientY - downY.current > 110) onClose(); downY.current = null; }}
      onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-4 text-white" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)" }}>
        <span className="text-sm text-white/80">{at + 1} of {hit.photos.length}</span>
        <button type="button" onClick={onClose} className="min-h-[44px] min-w-[64px] text-[15px] font-medium text-white">Done</button>
      </div>
      <div ref={strip} className="flex-1 flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none]"
        onScroll={(e) => { const el = e.currentTarget; setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}>
        {hit.photos.map((_, n) => (
          <div key={n} className="shrink-0 w-full h-full snap-center flex items-center justify-center">
            {failed[n]
              ? <p className="text-sm text-white/70 px-8 text-center">This photo needs signal to show.</p>
              : Math.abs(n - at) <= 1 && <img src={placePhotoUrl(hit, n)} alt="" onError={() => setFailed((f) => ({ ...f, [n]: true }))} className="max-w-full max-h-full object-contain" />}
          </div>
        ))}
      </div>
      <div className="px-4 pt-3 text-white bg-gradient-to-t from-black via-black/90 to-transparent" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}>
        {credit && <p className="text-[11px] text-white/60">Photo: {credit} · Google</p>}
        {time && <p className="text-sm text-white/80 mt-1">{time}</p>}
        <p className="text-lg leading-snug">{title}</p>
        {hit.name && hit.name.toLowerCase() !== title.toLowerCase() && <p className="text-sm text-white/70">{hit.name}</p>}
        {map && <a href={map} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-[44px] mt-1 text-[15px] text-white underline underline-offset-2">Maps ↗</a>}
      </div>
    </div>
  );
}
