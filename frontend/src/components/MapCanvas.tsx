import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { APIProvider, Map, AdvancedMarker, MapControl, ControlPosition, useMap } from "@vis.gl/react-google-maps";
import { api } from "../lib/api";
import type { Experience, Accommodation } from "../lib/types";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

interface NearbyPlace {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
  rating: number;
  userRatingsTotal: number;
  types?: string[];
}

interface Props {
  center: { lat: number; lng: number };
  experiences: Experience[];
  accommodations: Accommodation[];
  onExperienceClick: (id: string) => void;
  onNearbyClick?: (place: NearbyPlace) => void;
  showNearby?: boolean;
  showUserLocation?: boolean;
  highlightedExpId?: string | null;
  recenterKey?: number;
  themeFilter?: string | null;
  onThemeFilterChange?: (theme: string | null) => void;
}

// ── Theme marker config ─────────────────────────────────────────

interface ThemeStyle {
  bg: string;
  border: string;
  emoji: string;
  shape: "circle" | "diamond" | "rounded-square" | "square" | "tall-pill";
}

export const THEME_STYLES: Record<string, ThemeStyle> = {
  food:         { bg: "#c17f59", border: "#a0664a", emoji: "🍜", shape: "circle" },
  temples:      { bg: "#b35a5a", border: "#8a3d3d", emoji: "⛩️", shape: "circle" },
  ceramics:     { bg: "#5a7ab3", border: "#3d5a8a", emoji: "🏺", shape: "circle" },
  architecture: { bg: "#8a8078", border: "#6a6058", emoji: "🏛️", shape: "circle" },
  nature:       { bg: "#5a8a5a", border: "#3d6a3d", emoji: "🌿", shape: "circle" },
  transport:    { bg: "#7a7a8a", border: "#5a5a6a", emoji: "🚃", shape: "circle" },
  shopping:     { bg: "#b3895a", border: "#8a6a3d", emoji: "🛍️", shape: "circle" },
  art:          { bg: "#8a5ab3", border: "#6a3d8a", emoji: "🎨", shape: "circle" },
  nightlife:    { bg: "#5a5a8a", border: "#3d3d6a", emoji: "🌙", shape: "circle" },
  other:        { bg: "#a89880", border: "#8a7a62", emoji: "📍", shape: "circle" },
};

export const THEME_LABELS: Record<string, string> = {
  food: "Food & Drink",
  temples: "Temples & Shrines",
  ceramics: "Ceramics & Crafts",
  architecture: "Architecture",
  nature: "Nature & Outdoors",
  transport: "Transportation",
  shopping: "Shopping",
  art: "Art & Culture",
  nightlife: "Nightlife",
  other: "Experience",
};

// ── City pastel palette ─────────────────────────────────────────

export const CITY_PASTELS = [
  "#F2E0DE", // rose
  "#DEE6F2", // sky
  "#DEF2DE", // sage
  "#F2ECDE", // warm
  "#E6DEF2", // lavender
  "#DEF2EC", // mint
  "#F2DEE6", // blush
  "#ECF2DE", // spring
];

export function getCityPastel(cities: { id: string }[], cityId: string): string {
  const idx = cities.findIndex((c) => c.id === cityId);
  if (idx === -1) return CITY_PASTELS[0];
  return CITY_PASTELS[idx % CITY_PASTELS.length];
}

function getThemeStyle(themes: string[]): ThemeStyle {
  for (const t of themes) {
    if (THEME_STYLES[t]) return THEME_STYLES[t];
  }
  return THEME_STYLES.other;
}

/** Map Google Places types to Wander themes for nearby markers */
function typesToThemes(types?: string[]): string[] {
  if (!types || types.length === 0) return ["other"];
  const mapped: string[] = [];
  for (const t of types) {
    if (["restaurant", "cafe", "bakery", "bar", "food", "meal_delivery", "meal_takeaway"].includes(t)) {
      if (!mapped.includes("food")) mapped.push("food");
    } else if (["hindu_temple", "buddhist_temple", "place_of_worship", "church", "mosque", "synagogue"].includes(t)) {
      if (!mapped.includes("temples")) mapped.push("temples");
    } else if (["museum", "art_gallery", "store"].includes(t)) {
      if (!mapped.includes("ceramics")) mapped.push("ceramics");
    } else if (["park", "natural_feature", "campground"].includes(t)) {
      if (!mapped.includes("nature")) mapped.push("nature");
    }
  }
  return mapped.length > 0 ? mapped : ["other"];
}

export function ThemedMarkerIcon({ themes, tier, label, highlighted }: { themes: string[]; tier: "selected" | "possible" | "nearby"; label?: string; highlighted?: boolean }) {
  const config = getThemeStyle(themes);
  const size = tier === "selected" ? 44 : tier === "possible" ? 36 : 28;
  const emojiSize = tier === "selected" ? 22 : tier === "possible" ? 18 : 14;
  const opacity = tier === "nearby" ? 0.75 : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity, cursor: "pointer" }}>
      {/* Marker pin */}
      <div style={{
        width: highlighted ? size + 8 : size,
        height: highlighted ? size + 8 : size,
        borderRadius: "50% 50% 50% 0",
        transform: "rotate(-45deg)",
        backgroundColor: config.bg,
        border: highlighted ? "4px solid #f59e0b" : tier === "selected" ? "3px solid #fff" : tier === "possible" ? "2.5px dashed " + config.border : "2px solid " + config.border,
        boxShadow: highlighted
          ? "0 0 0 4px rgba(245,158,11,0.4), 0 4px 16px rgba(0,0,0,0.5)"
          : tier === "selected"
            ? "0 3px 12px rgba(0,0,0,0.5), 0 0 0 2px " + config.border
            : "0 2px 6px rgba(0,0,0,0.35)",
        transition: "all 0.2s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <span style={{ transform: "rotate(45deg)", fontSize: emojiSize, lineHeight: 1 }}>
          {config.emoji}
        </span>
      </div>
      {/* Label */}
      {label && (
        <div style={{
          marginTop: 4,
          padding: "2px 8px",
          backgroundColor: tier === "selected" ? "rgba(58, 49, 40, 0.9)" : "rgba(58, 49, 40, 0.7)",
          color: "#fff",
          fontSize: tier === "selected" ? 12 : 10,
          fontWeight: 600,
          borderRadius: 6,
          whiteSpace: "nowrap",
          maxWidth: 160,
          overflow: "hidden",
          textOverflow: "ellipsis",
          textAlign: "center",
          lineHeight: "18px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}>
          {label}
        </div>
      )}
    </div>
  );
}

/** Small inline shape chip for use in detail panels */
export function ThemeChip({ theme }: { theme: string }) {
  const config = THEME_STYLES[theme] || THEME_STYLES.other;
  const label = THEME_LABELS[theme] || theme;
  return (
    <span className="inline-flex items-center gap-1">
      <span style={{ fontSize: 12 }}>{config.emoji}</span>
      <span className="text-xs text-[#8a7a62] capitalize">{label}</span>
    </span>
  );
}

function YouAreHereMarker() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Pulsing outer ring */}
      <div style={{ position: "relative", width: 48, height: 48 }}>
        <div style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          backgroundColor: "rgba(59, 130, 246, 0.2)",
          animation: "pulse-ring 2s ease-out infinite",
        }} />
        <div style={{
          position: "absolute",
          top: 8,
          left: 8,
          width: 32,
          height: 32,
          borderRadius: "50%",
          backgroundColor: "#3b82f6",
          border: "4px solid #fff",
          boxShadow: "0 3px 12px rgba(59, 130, 246, 0.6), 0 0 0 2px #3b82f6",
        }} />
      </div>
      <div style={{
        marginTop: 2,
        padding: "2px 8px",
        backgroundColor: "#3b82f6",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 4,
        whiteSpace: "nowrap",
        letterSpacing: "0.02em",
      }}>
        You are here
      </div>
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ReturnToLocationButton({ userLocation }: { userLocation: { lat: number; lng: number } }) {
  const map = useMap();
  return (
    <button
      onClick={() => {
        if (!map) return;
        map.panTo(userLocation);
        map.setZoom(15);
      }}
      style={{
        marginBottom: 80, // above filmstrip
        marginRight: 8,
        width: 44,
        height: 44,
        borderRadius: "50%",
        backgroundColor: "#fff",
        border: "2px solid #e0d8cc",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 20,
      }}
      title="Return to my location"
    >
      📍
    </button>
  );
}

function AccommodationMarker({ label }: { label?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{
        width: 36,
        height: 36,
        backgroundColor: "#6b5d4a",
        borderColor: "#fff",
        borderWidth: 3,
        borderStyle: "solid",
        borderRadius: "6px 6px 18px 18px",
        boxShadow: "0 3px 10px rgba(0,0,0,0.45), 0 0 0 2px #3a3128",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 16,
      }}>
        🏨
      </div>
      {label && (
        <div style={{
          marginTop: 2,
          padding: "1px 6px",
          backgroundColor: "rgba(58, 49, 40, 0.85)",
          color: "#fff",
          fontSize: 10,
          fontWeight: 600,
          borderRadius: 4,
          whiteSpace: "nowrap",
          maxWidth: 120,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {label}
        </div>
      )}
    </div>
  );
}

// ── Geometry helpers ─────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function maxSpanKm(points: { lat: number; lng: number }[]): number {
  let max = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = haversineKm(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
      if (d > max) max = d;
    }
  }
  return max;
}

function convexHull(points: { lat: number; lng: number }[]): { lat: number; lng: number }[] {
  if (points.length <= 2) return [...points];
  const sorted = [...points].sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  const pivot = sorted[0];
  const rest = sorted.slice(1).sort((a, b) => {
    const angleA = Math.atan2(a.lat - pivot.lat, a.lng - pivot.lng);
    const angleB = Math.atan2(b.lat - pivot.lat, b.lng - pivot.lng);
    if (angleA !== angleB) return angleA - angleB;
    return haversineKm(pivot.lat, pivot.lng, a.lat, a.lng) -
           haversineKm(pivot.lat, pivot.lng, b.lat, b.lng);
  });
  const hull: { lat: number; lng: number }[] = [pivot];
  for (const p of rest) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      const cross = (b.lng - a.lng) * (p.lat - a.lat) - (b.lat - a.lat) * (p.lng - a.lng);
      if (cross <= 0) hull.pop();
      else break;
    }
    hull.push(p);
  }
  return hull;
}

function TravelGeometryOverlay({ selectedExps }: { selectedExps: Experience[] }) {
  const map = useMap();
  const circleRef = useRef<google.maps.Circle | null>(null);

  const geoPoints = useMemo(() =>
    selectedExps
      .filter((e) => e.latitude != null && e.longitude != null)
      .map((e) => ({ lat: e.latitude!, lng: e.longitude! })),
    [selectedExps]
  );

  // Center = midpoint of all points
  const center = useMemo(() => {
    if (geoPoints.length === 0) return null;
    const lat = geoPoints.reduce((s, p) => s + p.lat, 0) / geoPoints.length;
    const lng = geoPoints.reduce((s, p) => s + p.lng, 0) / geoPoints.length;
    return { lat, lng };
  }, [geoPoints]);

  // Radius: at least 1km (2km diameter default), or enough to contain all points + 20% padding
  const radiusM = useMemo(() => {
    if (!center || geoPoints.length === 0) return 1000;
    if (geoPoints.length === 1) return 1000; // 2km diameter default
    let maxDist = 0;
    for (const p of geoPoints) {
      const d = haversineKm(center.lat, center.lng, p.lat, p.lng) * 1000;
      if (d > maxDist) maxDist = d;
    }
    return Math.max(1000, maxDist * 1.2); // at least 1km radius, else fit all + 20%
  }, [center, geoPoints]);

  // Walking time: diameter at 3 km/hr
  const diameterKm = (radiusM * 2) / 1000;
  const walkingMin = useMemo(() => {
    const raw = (diameterKm / 3) * 60; // 3 km/hr
    return Math.round(raw / 5) * 5 || 5; // round to nearest 5 min
  }, [diameterKm]);

  useEffect(() => {
    if (!map) return;
    if (circleRef.current) {
      circleRef.current.setMap(null);
      circleRef.current = null;
    }
    if (!center) return;
    const circle = new google.maps.Circle({
      center,
      radius: radiusM,
      strokeColor: "#8a7a62",
      strokeOpacity: 0.7,
      strokeWeight: 2.5,
      strokePosition: google.maps.StrokePosition.OUTSIDE,
      fillColor: "#c8bba8",
      fillOpacity: 0.18,
      map,
      clickable: false,
    });
    circleRef.current = circle;
    return () => { circle.setMap(null); };
  }, [map, center, radiusM]);

  if (geoPoints.length === 0 || !center) return null;

  const label = geoPoints.length === 1
    ? `~${walkingMin} min walking radius`
    : `${diameterKm.toFixed(1)} km spread · ~${walkingMin} min walk`;

  return (
    <MapControl position={ControlPosition.TOP_CENTER}>
      <div
        className="mt-14 px-3 py-1.5 rounded-lg shadow-md border border-[#e0d8cc]"
        style={{ backgroundColor: "rgba(255,255,255,0.92)" }}
      >
        <div className="text-xs text-[#3a3128] font-medium flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border-2 border-[#8a7a62] inline-block" style={{ backgroundColor: "rgba(200,187,168,0.3)" }} />
          {label}
        </div>
      </div>
    </MapControl>
  );
}

// ── Map Panner — reactively pan/zoom when center changes ────────

function MapPanner({ center, experiences, recenterKey }: { center: { lat: number; lng: number }; experiences: Experience[]; recenterKey?: number }) {
  const map = useMap();
  const prevKeyRef = useRef("");

  const key = `${center.lat.toFixed(5)},${center.lng.toFixed(5)},${recenterKey ?? 0}`;

  useEffect(() => {
    if (!map || key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    const located = experiences.filter(
      (e) => e.state === "selected" && e.latitude != null && e.longitude != null,
    );

    if (located.length >= 2) {
      const bounds = new google.maps.LatLngBounds();
      for (const e of located) {
        bounds.extend({ lat: e.latitude!, lng: e.longitude! });
      }
      // Padding: top for day card overlay, bottom for filmstrip, sides for breathing room
      map.fitBounds(bounds, { top: 80, bottom: 120, left: 40, right: 40 });
    } else if (located.length === 1) {
      map.panTo({ lat: located[0].latitude!, lng: located[0].longitude! });
      map.setZoom(15);
    } else {
      map.panTo(center);
      map.setZoom(13);
    }
  }, [map, key]);

  return null;
}

// ── Main Component ──────────────────────────────────────────────

function ThemeFilterBar({ activeTheme, onSelect, availableThemes }: { activeTheme: string | null; onSelect: (t: string | null) => void; availableThemes: Set<string> }) {
  if (availableThemes.size <= 1) return null;
  const themes = [...availableThemes].sort();
  return (
    <MapControl position={ControlPosition.LEFT_TOP}>
      <div className="ml-2 mt-2 flex flex-col gap-1">
        {activeTheme && (
          <button
            onClick={() => onSelect(null)}
            className="w-8 h-8 rounded-full bg-white shadow-md border border-[#e0d8cc]
                       flex items-center justify-center text-xs text-[#8a7a62] hover:bg-[#f0ece5]"
            title="Show all"
          >
            All
          </button>
        )}
        {themes.map((t) => {
          const style = THEME_STYLES[t] || THEME_STYLES.other;
          const isActive = activeTheme === t;
          return (
            <button
              key={t}
              onClick={() => onSelect(isActive ? null : t)}
              className="w-8 h-8 rounded-full shadow-md border-2 flex items-center justify-center text-sm transition-all"
              style={{
                backgroundColor: isActive ? style.bg : "white",
                borderColor: isActive ? style.border : "#e0d8cc",
                opacity: activeTheme && !isActive ? 0.4 : 1,
              }}
              title={THEME_LABELS[t] || t}
            >
              {style.emoji}
            </button>
          );
        })}
      </div>
    </MapControl>
  );
}

export default function MapCanvas({ center, experiences, accommodations, onExperienceClick, onNearbyClick, showNearby = false, showUserLocation = true, highlightedExpId, recenterKey, themeFilter, onThemeFilterChange }: Props) {
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Track user's GPS position
  useEffect(() => {
    if (!showUserLocation || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}, // silently fail if denied
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [showUserLocation]);

  const confirmedExps = experiences.filter(
    (e) => e.locationStatus === "confirmed" && e.latitude && e.longitude
  );

  // Collect all themes present on the map for the filter bar
  const availableThemes = useMemo(() => {
    const set = new Set<string>();
    for (const e of confirmedExps) {
      for (const t of e.themes) set.add(t);
    }
    return set;
  }, [confirmedExps]);

  const matchesFilter = (themes: string[]) => !themeFilter || themes.includes(themeFilter);

  const selectedExps = confirmedExps.filter((e) => e.state === "selected");
  const possibleExps = confirmedExps.filter((e) => e.state === "possible");
  const filteredSelected = selectedExps.filter((e) => matchesFilter(e.themes));
  const filteredPossible = possibleExps.filter((e) => matchesFilter(e.themes));
  const confirmedAccom = accommodations.filter((a) => a.latitude && a.longitude);

  const existingPlaceIds = new Set(
    experiences.filter((e) => e.placeIdGoogle).map((e) => e.placeIdGoogle)
  );

  const fetchNearby = useCallback(async () => {
    if (!showNearby || !center.lat || !center.lng) return;
    try {
      const results = await api.get<NearbyPlace[]>(
        `/geocoding/nearby?lat=${center.lat}&lng=${center.lng}&radius=1500`
      );
      setNearbyPlaces(results.filter((p) => !existingPlaceIds.has(p.placeId)));
    } catch {
      // Silently fail — nearby is enhancement only
    }
  }, [center.lat, center.lng, showNearby]);

  useEffect(() => { fetchNearby(); }, [fetchNearby]);

  if (!API_KEY) {
    return (
      <div className="w-full h-full bg-[#e8e2d8] flex items-center justify-center">
        <div className="text-center text-[#8a7a62]">
          <p className="text-sm">Map requires Google Maps API key</p>
          <p className="text-xs mt-1">Set VITE_GOOGLE_MAPS_API_KEY in environment</p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY}>
      <Map
        defaultCenter={center}
        defaultZoom={13}
        mapId="wander-map"
        gestureHandling="greedy"
        disableDefaultUI={true}
        zoomControl={true}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <MapPanner center={center} experiences={experiences} recenterKey={recenterKey} />
        <TravelGeometryOverlay selectedExps={selectedExps} />

        {/* Theme filter bar */}
        {onThemeFilterChange && (
          <ThemeFilterBar
            activeTheme={themeFilter || null}
            onSelect={onThemeFilterChange}
            availableThemes={availableThemes}
          />
        )}

        {/* Tier 1 — Selected experiences (bold, labeled) */}
        {filteredSelected.map((exp) => (
          <AdvancedMarker
            key={exp.id}
            position={{ lat: exp.latitude!, lng: exp.longitude! }}
            onClick={() => onExperienceClick(exp.id)}
            title={exp.name}
            zIndex={highlightedExpId === exp.id ? 900 : 100}
          >
            <ThemedMarkerIcon themes={exp.themes} tier="selected" label={exp.name} highlighted={highlightedExpId === exp.id} />
          </AdvancedMarker>
        ))}

        {/* Tier 2 — Possible experiences (dashed border, labeled) */}
        {filteredPossible.map((exp) => (
          <AdvancedMarker
            key={exp.id}
            position={{ lat: exp.latitude!, lng: exp.longitude! }}
            onClick={() => onExperienceClick(exp.id)}
            title={exp.name}
            zIndex={highlightedExpId === exp.id ? 900 : 50}
          >
            <ThemedMarkerIcon themes={exp.themes} tier="possible" label={exp.name} highlighted={highlightedExpId === exp.id} />
          </AdvancedMarker>
        ))}

        {/* Tier 3 — Nearby high-rated places (smaller, labeled with rating) */}
        {nearbyPlaces.filter((p) => matchesFilter(typesToThemes(p.types))).map((place) => (
          <AdvancedMarker
            key={place.placeId}
            position={{ lat: place.latitude, lng: place.longitude }}
            onClick={() => onNearbyClick?.(place)}
            title={`${place.name} ★${place.rating}`}
          >
            <ThemedMarkerIcon themes={typesToThemes(place.types)} tier="nearby" label={`${place.name} ★${place.rating}`} />
          </AdvancedMarker>
        ))}

        {/* Accommodations */}
        {confirmedAccom.map((acc) => (
          <AdvancedMarker
            key={acc.id}
            position={{ lat: acc.latitude!, lng: acc.longitude! }}
            title={acc.name}
          >
            <AccommodationMarker label={acc.name} />
          </AdvancedMarker>
        ))}

        {/* You are here — GPS position */}
        {userLocation && (
          <AdvancedMarker
            key="user-location"
            position={userLocation}
            title="You are here"
            zIndex={1000}
          >
            <YouAreHereMarker />
          </AdvancedMarker>
        )}

        {/* Return to my location button */}
        {userLocation && (
          <MapControl position={ControlPosition.RIGHT_BOTTOM}>
            <ReturnToLocationButton userLocation={userLocation} />
          </MapControl>
        )}
      </Map>
    </APIProvider>
  );
}
