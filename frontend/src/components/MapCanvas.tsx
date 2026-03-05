import { useState, useEffect, useCallback } from "react";
import { APIProvider, Map, AdvancedMarker, Pin } from "@vis.gl/react-google-maps";
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
