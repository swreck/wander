import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import prisma from "../services/db.js";

const router = Router();
router.use(requireAuth);

// Cache disruption data for 5 minutes
let cachedDisruptions: any[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

interface Disruption {
  line: string;
  status: string;
  detail: string;
  region: string;
  severity: "normal" | "delay" | "suspended";
}

// Fetch JR train status from the English status page
async function fetchJRStatus(): Promise<Disruption[]> {
  const now = Date.now();
  if (now - cacheTimestamp < CACHE_TTL && cachedDisruptions.length > 0) {
    return cachedDisruptions;
  }

  const disruptions: Disruption[] = [];

  try {
    // JR East English service status
    const jrEastRes = await fetch("https://traininfo.jreast.co.jp/train_info/e/", {
      headers: { "User-Agent": "Wander Travel App", "Accept-Language": "en" },
      signal: AbortSignal.timeout(5000),
    });

    if (jrEastRes.ok) {
      const html = await jrEastRes.text();
      // Parse disruption notices — look for lines with delays/suspensions
      const linePattern = /class="[^"]*line[^"]*"[^>]*>([^<]+)<[\s\S]*?class="[^"]*status[^"]*"[^>]*>([^<]+)</gi;
      let match;
      while ((match = linePattern.exec(html)) !== null) {
        const line = match[1].trim();
        const status = match[2].trim();
        if (status.toLowerCase() !== "normal" && status.toLowerCase() !== "on schedule") {
          disruptions.push({
            line,
            status,
            detail: status,
            region: "JR East",
            severity: status.toLowerCase().includes("suspend") ? "suspended" : "delay",
          });
        }
      }
    }
  } catch {
    // JR East status page unavailable — not critical
  }

  try {
    // JR Central (Tokaido Shinkansen) — check via Google
    const jrCentralRes = await fetch("https://english.jr-central.co.jp/info/", {
      headers: { "User-Agent": "Wander Travel App", "Accept-Language": "en" },
      signal: AbortSignal.timeout(5000),
    });

    if (jrCentralRes.ok) {
      const html = await jrCentralRes.text();
      // Look for delay/suspension keywords
      const hasDelay = /delay|suspend|cancel|late|disrupt/i.test(html);
      if (hasDelay) {
        // Extract the message text roughly
        const msgMatch = html.match(/(?:delay|suspend|cancel|late|disrupt)[^.]*\./i);
        disruptions.push({
          line: "Tokaido Shinkansen",
          status: "Disruption reported",
          detail: msgMatch ? msgMatch[0].trim() : "Check JR Central for details",
          region: "JR Central",
          severity: "delay",
        });
      }
    }
  } catch {
    // Not critical
  }

  cachedDisruptions = disruptions;
  cacheTimestamp = now;
  return disruptions;
}

// Get current transit disruptions relevant to the trip
router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const trip = await prisma.trip.findUnique({
    where: { id: req.params.tripId as string },
    include: { routeSegments: { orderBy: { sequenceOrder: "asc" } } },
  });
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  const disruptions = await fetchJRStatus();

  // Match disruptions to the trip's route segments
  const relevant = trip.routeSegments
    .filter((seg) => seg.transportMode === "train")
    .map((seg) => {
      const matching = disruptions.filter((d) => {
        const lineLower = d.line.toLowerCase();
        const origin = seg.originCity.toLowerCase();
        const dest = seg.destinationCity.toLowerCase();
        // Check if the disrupted line name contains keywords from our route
        return lineLower.includes("shinkansen") ||
          lineLower.includes(origin) ||
          lineLower.includes(dest);
      });
      return {
        segment: `${seg.originCity} → ${seg.destinationCity}`,
        departureDate: seg.departureDate,
        serviceNumber: seg.serviceNumber,
        disruptions: matching,
      };
    })
    .filter((s) => s.disruptions.length > 0);

  res.json({
    allDisruptions: disruptions,
    relevantToTrip: relevant,
    checkedAt: new Date().toISOString(),
  });
});

// Simple status check — no trip context needed
router.get("/status", async (_req: AuthRequest, res) => {
  const disruptions = await fetchJRStatus();
  res.json({ disruptions, checkedAt: new Date().toISOString() });
});

export default router;
