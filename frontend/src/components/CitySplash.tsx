import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";

interface Props {
  cityName: string;
  onComplete: () => void;
}

// Track which cities have shown splash this session
const shownCities = new Set<string>();

// Cache photo URLs so revisits (after refresh) are instant
const photoCache: Record<string, string> = {};

function getSplashDuration(): number {
  try {
    const val = localStorage.getItem("wander:splash-duration");
    if (val) return parseInt(val);
  } catch {}
  return 1000; // default 1 second
}

export default function CitySplash({ cityName, onComplete }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(photoCache[cityName] || null);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [fading, setFading] = useState(false);
  const [skip, setSkip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Skip if already shown for this city this session
  useEffect(() => {
    if (shownCities.has(cityName)) {
      setSkip(true);
      onComplete();
      return;
    }
    shownCities.add(cityName);

    // If not cached, fetch photo URL
    if (!photoCache[cityName]) {
      api.get<{ url: string | null }>(`/geocoding/city-photo?query=${encodeURIComponent(cityName + " landmark")}`)
        .then((data) => {
          if (data.url) {
            photoCache[cityName] = data.url;
            setPhotoUrl(data.url);
          } else {
            // No photo available — hold dark overlay briefly then complete
            setTimeout(onComplete, 400);
          }
        })
        .catch(() => setTimeout(onComplete, 400));
    }
  }, [cityName, onComplete]);

  // Start fade timer once photo loads
  useEffect(() => {
    if (!photoLoaded) return;
    const duration = getSplashDuration();
    timerRef.current = setTimeout(() => setFading(true), duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [photoLoaded]);

  // Complete after fade-out
  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(onComplete, 600);
    return () => clearTimeout(t);
  }, [fading, onComplete]);

  if (skip) return null;

  return (
    <div
      className="absolute inset-0 z-50 transition-opacity"
      style={{ opacity: fading ? 0 : 1, transitionDuration: "600ms" }}
      onClick={() => setFading(true)}
    >
      {/* Dark base — visible immediately, covers the map flash */}
      <div className="absolute inset-0 bg-[#2a2420]" />

      {/* Photo — fades in once loaded */}
      {photoUrl && (
        <img
          src={photoUrl}
          alt={cityName}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
          style={{ opacity: photoLoaded ? 1 : 0 }}
          onLoad={() => setPhotoLoaded(true)}
          onError={() => onComplete()}
        />
      )}

      {/* Gradient for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />

      {/* City name — visible immediately on the dark base */}
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
