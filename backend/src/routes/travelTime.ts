import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const BUFFER_MINUTES: Record<string, number> = {
  walk: 10,
  subway: 10,
  train: 15,
  bus: 10,
  taxi: 5,
  shuttle: 10,
  other: 10,
};

// Average speeds in km/h for fallback estimation
const FALLBACK_SPEEDS: Record<string, number> = {
  walk: 4.5,
  subway: 30,
  train: 25,
  bus: 20,
  taxi: 30,
  shuttle: 25,
  other: 20,
};

/**
 * Haversine distance between two lat/lng points, in kilometers.
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
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

/**
 * Estimate travel duration in minutes from straight-line distance.
 * Applies a 1.4x detour factor to approximate real routes.
 */
function fallbackEstimate(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  mode: string
): number {
  const straightKm = haversineKm(lat1, lng1, lat2, lng2);
  const routeKm = straightKm * 1.4; // detour factor
  const speed = FALLBACK_SPEEDS[mode] || FALLBACK_SPEEDS.walk;
  return Math.ceil((routeKm / speed) * 60);
}

/**
 * POST /api/travel-time
 *
 * Body: { originLat, originLng, destLat, destLng, mode, anchorTime? }
 *   - mode: "walk" | "subway" | "train" | "bus" | "taxi" | "shuttle" | "other"
 *   - anchorTime: ISO string of when you need to arrive (optional)
 *
 * Returns: { durationMinutes, bufferMinutes, totalMinutes, departureTime?, source }
 */
router.post("/", async (req, res) => {
  const { originLat, originLng, destLat, destLng, mode, anchorTime } = req.body;

  if (
    originLat == null ||
    originLng == null ||
    destLat == null ||
    destLng == null
  ) {
    res.status(400).json({ error: "originLat, originLng, destLat, destLng are required" });
    return;
  }

  const travelMode = mode || "walk";
  const buffer = BUFFER_MINUTES[travelMode] ?? 10;

  let durationMinutes: number;
  let source: "google" | "fallback";

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (apiKey) {
    try {
      // Map our mode names to Google Distance Matrix modes
      const modeMap: Record<string, string> = {
        walk: "walking",
        subway: "transit",
        train: "transit",
        bus: "transit",
        taxi: "driving",
        shuttle: "driving",
        other: "driving",
      };
      const googleMode = modeMap[travelMode] || "walking";

      const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
      url.searchParams.set("origins", `${originLat},${originLng}`);
      url.searchParams.set("destinations", `${destLat},${destLng}`);
      url.searchParams.set("mode", googleMode);
      url.searchParams.set("key", apiKey);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (
        data.status === "OK" &&
        data.rows?.[0]?.elements?.[0]?.status === "OK"
      ) {
        const durationSeconds = data.rows[0].elements[0].duration.value;
        durationMinutes = Math.ceil(durationSeconds / 60);
        source = "google";
      } else {
        // API returned but no valid route — fall back
        durationMinutes = fallbackEstimate(originLat, originLng, destLat, destLng, travelMode);
        source = "fallback";
      }
    } catch {
      // Network or parse error — fall back
      durationMinutes = fallbackEstimate(originLat, originLng, destLat, destLng, travelMode);
      source = "fallback";
    }
  } else {
    // No API key configured — use fallback
    durationMinutes = fallbackEstimate(originLat, originLng, destLat, destLng, travelMode);
    source = "fallback";
  }

  const totalMinutes = durationMinutes + buffer;

  let departureTime: string | undefined;
  if (anchorTime) {
    const anchor = new Date(anchorTime);
    if (!isNaN(anchor.getTime())) {
      departureTime = new Date(anchor.getTime() - totalMinutes * 60000).toISOString();
    }
  }

  res.json({
    durationMinutes,
    bufferMinutes: buffer,
    totalMinutes,
    departureTime,
    source,
    mode: travelMode,
  });
});

export default router;
