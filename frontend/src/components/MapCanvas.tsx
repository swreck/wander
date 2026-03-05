import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { APIProvider, Map, AdvancedMarker, Pin, MapControl, ControlPosition, useMap } from "@vis.gl/react-google-maps";
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
}

interface Props {
  center: { lat: number; lng: number };
  experiences: Experience[];
  accommodations: Accommodation[];
  onExperienceClick: (id: string) => void;
  onNearbyClick?: (place: NearbyPlace) => void;
  showNearby?: boolean;
}

// ── Geometry helpers ───────────────────────────────────────────────

/** Haversine distance between two points in km */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
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

/** Maximum straight-line distance between any two points (the "span") */
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

/** Convex hull using Graham scan (returns points in order) */
function convexHull(points: { lat: number; lng: number }[]): { lat: number; lng: number }[] {
  if (points.length <= 2) return [...points];

  // Find bottom-most (then left-most) point
  const sorted = [...points].sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  const pivot = sorted[0];

  // Sort by polar angle relative to pivot
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

// ── Travel Geometry Overlay (inner component, needs useMap) ────────

function TravelGeometryOverlay({ selectedExps }: { selectedExps: Experience[] }) {
  const map = useMap();
  const polygonRef = useRef<google.maps.Polygon | null>(null);

  const geoPoints = useMemo(() =>
    selectedExps
      .filter((e) => e.latitude != null && e.longitude != null)
      .map((e) => ({ lat: e.latitude!, lng: e.longitude! })),
    [selectedExps]
  );

  const span = useMemo(() => maxSpanKm(geoPoints), [geoPoints]);

  // Walking time: span / 5 km/h, rounded to nearest 5 min
  const walkingMin = useMemo(() => {
    if (span === 0) return 0;
    const raw = (span / 5) * 60;
    return Math.round(raw / 5) * 5 || 5; // at least 5 min
  }, [span]);

  const hullPoints = useMemo(() => convexHull(geoPoints), [geoPoints]);

  // Draw/update polygon on the map
  useEffect(() => {
    if (!map) return;

    // Clean up previous polygon
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }

    // Need at least 3 points for a polygon
    if (hullPoints.length < 3) return;

    const polygon = new google.maps.Polygon({
      paths: hullPoints,
      strokeColor: "#a89880",
      strokeOpacity: 0.6,
      strokeWeight: 1.5,
      fillColor: "#c8bba8",
      fillOpacity: 0.15,
      map,
      clickable: false,
    });

    polygonRef.current = polygon;

    return () => {
      polygon.setMap(null);
    };
  }, [map, hullPoints]);

  // Don't show the overlay card if fewer than 2 located points
  if (geoPoints.length < 2 || span < 0.01) return null;

  return (
    <MapControl position={ControlPosition.TOP_CENTER}>
      <div
        className="mt-2 px-3 py-1.5 rounded-lg shadow-md border border-[#e0d8cc]"
        style={{ backgroundColor: "rgba(250, 248, 245, 0.92)" }}
      >
        <div className="flex items-center gap-3 text-xs text-[#514636]">
          <span>
            <span className="font-medium">Span:</span> {span.toFixed(1)} km
          </span>
          <span className="text-[#e0d8cc]">|</span>
          <span>
            <span className="font-medium">Walking:</span> ~{walkingMin} min across
          </span>
        </div>
      </div>
    </MapControl>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export default function MapCanvas({ center, experiences, accommodations, onExperienceClick, onNearbyClick, showNearby = false }: Props) {
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);

  const confirmedExps = experiences.filter(
    (e) => e.locationStatus === "confirmed" && e.latitude && e.longitude
  );

  const selectedExps = confirmedExps.filter((e) => e.state === "selected");
  const possibleExps = confirmedExps.filter((e) => e.state === "possible");
  const confirmedAccom = accommodations.filter((a) => a.latitude && a.longitude);

  // Existing experience placeIds for deduplication
  const existingPlaceIds = new Set(
    experiences.filter((e) => e.placeIdGoogle).map((e) => e.placeIdGoogle)
  );

  // Fetch Tier 3 nearby markers
  const fetchNearby = useCallback(async () => {
    if (!showNearby || !center.lat || !center.lng) return;
    try {
      const results = await api.get<NearbyPlace[]>(
        `/geocoding/nearby?lat=${center.lat}&lng=${center.lng}&radius=1500`
      );
      // Filter out places that are already in the trip
      setNearbyPlaces(results.filter((p) => !existingPlaceIds.has(p.placeId)));
    } catch {
      // Silently fail — nearby is enhancement only
    }
  }, [center.lat, center.lng, showNearby]);

  useEffect(() => {
    fetchNearby();
  }, [fetchNearby]);

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
        disableDefaultUI={false}
        zoomControl={true}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Travel geometry overlay for selected experiences */}
        <TravelGeometryOverlay selectedExps={selectedExps} />

        {/* Tier 1 — Selected experiences (bold) */}
        {selectedExps.map((exp) => (
          <AdvancedMarker
            key={exp.id}
            position={{ lat: exp.latitude!, lng: exp.longitude! }}
            onClick={() => onExperienceClick(exp.id)}
            title={exp.name}
          >
            <Pin
              background="#514636"
              borderColor="#3a3128"
              glyphColor="#fff"
              scale={1.2}
            />
          </AdvancedMarker>
        ))}

        {/* Tier 2 — Possible experiences (lighter) */}
        {possibleExps.map((exp) => (
          <AdvancedMarker
            key={exp.id}
            position={{ lat: exp.latitude!, lng: exp.longitude! }}
            onClick={() => onExperienceClick(exp.id)}
            title={exp.name}
          >
            <Pin
              background="#c8bba8"
              borderColor="#a89880"
              glyphColor="#fff"
              scale={0.9}
            />
          </AdvancedMarker>
        ))}

        {/* Tier 3 — Nearby high-rated places (ghost) */}
        {nearbyPlaces.map((place) => (
          <AdvancedMarker
            key={place.placeId}
            position={{ lat: place.latitude, lng: place.longitude }}
            onClick={() => onNearbyClick?.(place)}
            title={`${place.name} ★${place.rating}`}
          >
            <Pin
              background="#e8e2d8"
              borderColor="#d4cdc0"
              glyphColor="#a89880"
              scale={0.7}
            />
          </AdvancedMarker>
        ))}

        {/* Accommodations */}
        {confirmedAccom.map((acc) => (
          <AdvancedMarker
            key={acc.id}
            position={{ lat: acc.latitude!, lng: acc.longitude! }}
            title={acc.name}
          >
            <Pin
              background="#6b5d4a"
              borderColor="#3a3128"
              glyphColor="#fff"
              scale={1.1}
            />
          </AdvancedMarker>
        ))}
      </Map>
    </APIProvider>
  );
}
