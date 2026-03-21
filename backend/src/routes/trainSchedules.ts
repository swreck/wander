import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface TransitStep {
  departureTime: string;
  arrivalTime: string;
  duration: string;
  line: string;
  vehicle: string;
  departureStop: string;
  arrivalStop: string;
  numStops: number;
  headsign: string;
}

interface TransitRoute {
  departureTime: string;
  arrivalTime: string;
  duration: string;
  transfers: number;
  fare: string | null;
  steps: TransitStep[];
}

// Get transit options between two stations/cities
router.get("/", async (req: AuthRequest, res) => {
  const { origin, destination, date, time } = req.query;

  if (!origin || !destination) {
    res.status(400).json({ error: "origin and destination are required" });
    return;
  }
  if (!API_KEY) {
    res.status(503).json({ error: "Google Maps API not configured" });
    return;
  }

  // Build departure time
  let departureTime: number | undefined;
  if (date && time) {
    const dt = new Date(`${date}T${time}:00+09:00`); // JST
    departureTime = Math.floor(dt.getTime() / 1000);
  } else if (date) {
    const dt = new Date(`${date}T08:00:00+09:00`);
    departureTime = Math.floor(dt.getTime() / 1000);
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", origin as string);
    url.searchParams.set("destination", destination as string);
    url.searchParams.set("mode", "transit");
    url.searchParams.set("transit_mode", "rail");
    url.searchParams.set("alternatives", "true");
    url.searchParams.set("language", "en");
    url.searchParams.set("region", "jp");
    if (departureTime) {
      url.searchParams.set("departure_time", String(departureTime));
    }
    url.searchParams.set("key", API_KEY);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== "OK" || !data.routes?.length) {
      res.json({ routes: [], message: "No transit routes found" });
      return;
    }

    const routes: TransitRoute[] = data.routes.slice(0, 4).map((route: any) => {
      const leg = route.legs[0];
      const transitSteps = leg.steps
        .filter((s: any) => s.travel_mode === "TRANSIT")
        .map((s: any) => ({
          departureTime: s.transit_details?.departure_time?.text || "",
          arrivalTime: s.transit_details?.arrival_time?.text || "",
          duration: s.duration?.text || "",
          line: s.transit_details?.line?.short_name || s.transit_details?.line?.name || "",
          vehicle: s.transit_details?.line?.vehicle?.name || "Train",
          departureStop: s.transit_details?.departure_stop?.name || "",
          arrivalStop: s.transit_details?.arrival_stop?.name || "",
          numStops: s.transit_details?.num_stops || 0,
          headsign: s.transit_details?.headsign || "",
        }));

      return {
        departureTime: leg.departure_time?.text || "",
        arrivalTime: leg.arrival_time?.text || "",
        duration: leg.duration?.text || "",
        transfers: Math.max(0, transitSteps.length - 1),
        fare: route.fare?.text || leg.fare?.text || null,
        steps: transitSteps,
      };
    });

    res.json({ routes });
  } catch (err) {
    console.error("Train schedule error:", err);
    res.status(500).json({ error: "Failed to fetch train schedules" });
  }
});

export default router;
