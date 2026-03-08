import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";

interface Props {
  cityName: string;
  onComplete: () => void;
}

// Track which cities have shown splash this session
const shownCities = new Set<string>();

function getSplashDuration(): number {
  try {
    const val = localStorage.getItem("wander:splash-duration");
    if (val) return parseInt(val);
  } catch {}
  return 1000; // default 1 second
}

export default function CitySplash({ cityName, onComplete }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Skip if already shown for this city this session
  useEffect(() => {
    if (shownCities.has(cityName)) {
      onComplete();
      return;
    }
    shownCities.add(cityName);

    api.get<{ url: string | null }>(`/geocoding/city-photo?query=${encodeURIComponent(cityName + " landmark")}`)
      .then((data) => {
        if (data.url) {
          setPhotoUrl(data.url);
        } else {
          onComplete();
        }
      })
      .catch(() => onComplete());
  }, [cityName, onComplete]);

  useEffect(() => {
    if (!loaded) return;
    const duration = getSplashDuration();
    timerRef.current = setTimeout(() => setFading(true), duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [loaded]);

  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(onComplete, 600); // fade-out duration
    return () => clearTimeout(t);
  }, [fading, onComplete]);

  if (!photoUrl) return null;

  return (
    <div
      className="absolute inset-0 z-50 transition-opacity duration-600"
      style={{ opacity: fading ? 0 : 1 }}
      onClick={() => setFading(true)} // tap to dismiss
    >
      <img
        src={photoUrl}
        alt={cityName}
        className="w-full h-full object-cover"
        onLoad={() => setLoaded(true)}
        onError={() => onComplete()}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
      <div className="absolute bottom-8 left-0 right-0 text-center"
           style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <h2 className="text-3xl font-light text-white tracking-wide drop-shadow-lg">
          {cityName}
        </h2>
      </div>
    </div>
  );
}

export { getSplashDuration };
