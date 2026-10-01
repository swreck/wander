/**
 * The first time a day in a city opens on this phone: a full-screen photo of the city with its name, for a moment
 * (charm item C2, Oct 1 2026 — the April "city splash", brought back). Once per city per phone; never when there's no
 * signal or the photo isn't ready in about two seconds (it never makes anyone wait); a tap puts it away. The photo comes
 * through Wander's server (/api/city-photo), so no Google key reaches the phone; its photographer is credited.
 */
import { useEffect, useRef, useState } from "react";

const seenKey = (cityId: string) => `wander:city-arrival:${cityId}`;

export default function CityArrival({ cityId, cityName, dateWords }: { cityId: string | null | undefined; cityName: string; dateWords: string }) {
  const [shown, setShown] = useState<{ src: string; place: string | null; credit: string | null } | null>(null);
  const [fading, setFading] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shownAt = useRef(0);

  useEffect(() => {
    if (!cityId || !cityName || typeof navigator === "undefined" || navigator.onLine === false) return;
    try { if (localStorage.getItem(seenKey(cityId))) return; } catch { return; }
    let alive = true;
    const controller = new AbortController();
    const giveUp = setTimeout(() => controller.abort(), 2200);
    fetch(`/api/city-photo/${encodeURIComponent(cityId)}/info`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((info: { image: string | null; place?: string | null; credit?: string | null } | null) => {
        if (!alive || !info?.image) return;
        const img = new Image();
        const started = Date.now();
        img.onload = () => {
          if (!alive || Date.now() - started > 2500) return;
          try { localStorage.setItem(seenKey(cityId), "1"); } catch { /* storage off: may show again, harmless */ }
          shownAt.current = Date.now();
          setShown({ src: info.image!, place: info.place || null, credit: info.credit || null });
          timers.current.push(setTimeout(() => setFading(true), 1600));
          timers.current.push(setTimeout(() => setShown(null), 2300));
        };
        img.src = info.image;
      })
      .catch(() => { /* no splash — the day just opens */ })
      .finally(() => clearTimeout(giveUp));
    return () => { alive = false; controller.abort(); clearTimeout(giveUp); timers.current.forEach(clearTimeout); timers.current = []; };
  }, [cityId, cityName]);

  if (!shown) return null;
  // (a tap in its first moment — the end of the tap that opened the day — doesn't put it away; tester t4 never saw Nagoya's)
  const putAway = () => {
    if (Date.now() - shownAt.current < 600) return;
    setFading(true); timers.current.push(setTimeout(() => setShown(null), 500));
  };
  return (
    <div role="dialog" aria-label={`Arriving in ${cityName}`} onClick={putAway}
      className={`fixed inset-0 z-[70] bg-[#2a2420] transition-opacity duration-500 motion-reduce:transition-none ${fading ? "opacity-0" : "opacity-100"}`}>
      <img src={shown.src} alt="" className="absolute inset-0 w-full h-full object-cover" />
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
