import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../services/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const anthropic = new Anthropic();

interface ExperienceWithRatings {
  id: string;
  name: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  themes: string[];
  timeWindow: string | null;
  ratings: {
    platform: string;
    ratingValue: number;
    reviewCount: number;
  }[];
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildPrompt(experiences: ExperienceWithRatings[], contextLabel: string): string {
  const located = experiences.filter((e) => e.latitude != null && e.longitude != null);
  const withRatings = experiences.filter((e) => e.ratings.length > 0);

  // Pre-compute spatial data for the prompt
  let spatialSummary = "";
  if (located.length >= 2) {
    // Calculate pairwise distances
    const distances: { a: string; b: string; km: number }[] = [];
    for (let i = 0; i < located.length; i++) {
      for (let j = i + 1; j < located.length; j++) {
        const km = haversineKm(
          located[i].latitude!, located[i].longitude!,
          located[j].latitude!, located[j].longitude!,
        );
        distances.push({ a: located[i].name, b: located[j].name, km });
      }
    }

    // Total span (max distance)
    const maxDist = Math.max(...distances.map((d) => d.km));

    // Find clusters (pairs within 500m walking ~ 6 min)
    const closePairs = distances.filter((d) => d.km < 0.5);

    spatialSummary = `
SPATIAL DATA (pre-computed, all distances are straight-line):
- ${located.length} of ${experiences.length} experiences have coordinates
- Maximum span across all located experiences: ${maxDist.toFixed(2)} km
- Close pairs (under 500m / ~6 min walk): ${closePairs.length > 0 ? closePairs.map((p) => `${p.a} <-> ${p.b}: ${(p.km * 1000).toFixed(0)}m`).join("; ") : "none"}
- All pairwise distances: ${distances.map((d) => `${d.a} <-> ${d.b}: ${d.km.toFixed(2)}km`).join("; ")}
`;
  } else if (located.length === 1) {
    spatialSummary = `\nSPATIAL DATA: Only 1 of ${experiences.length} experiences ("${located[0].name}") has coordinates. No spatial analysis possible.\n`;
  } else {
    spatialSummary = `\nSPATIAL DATA: No experiences have coordinates yet. Skip spatial observations.\n`;
  }

  // Ratings summary
  let ratingsSummary = "";
  if (withRatings.length > 0) {
    ratingsSummary = `\nRATINGS DATA:\n${withRatings.map((e) => {
      const platforms = e.ratings.map((r) =>
        `${r.platform}: ${r.ratingValue}/5 (${r.reviewCount} reviews)`
      ).join(", ");
      return `- ${e.name}: ${platforms}`;
    }).join("\n")}\n`;
  }

  return `You are analyzing a set of ${experiences.length} travel experiences for ${contextLabel}.

EXPERIENCES:
${experiences.map((e, i) => {
  const loc = e.latitude != null ? `(${e.latitude.toFixed(5)}, ${e.longitude!.toFixed(5)})` : "(no location)";
  const themes = e.themes.length > 0 ? ` [${e.themes.join(", ")}]` : "";
  const tw = e.timeWindow ? ` | time: ${e.timeWindow}` : "";
  return `${i + 1}. ${e.name}${themes} — ${loc}${tw}${e.description ? ` — ${e.description.slice(0, 120)}` : ""}`;
}).join("\n")}
${spatialSummary}${ratingsSummary}
Generate 2-5 short observations about this set. Each observation should be ONE sentence.

RULES — follow these exactly:
1. NEVER use action-encouraging language ("you should", "consider", "don't miss", "make sure", "try to", "worth visiting", etc.)
2. Only state facts and spatial/temporal relationships
3. NEVER repeat raw ratings numbers — those are already displayed as badges in the UI
4. Focus on PATTERNS in the ratings (e.g., "All three cafes in this cluster have consistently high review volume" or "The two temples show divergent review sentiment across platforms")
5. For spatial observations, state walking times (assume 80m/minute walking speed) and clustering facts
6. For density observations, state the total span in km
7. If an experience is far from the others, note its round-trip detour time from the cluster center
8. If there are no coordinates, skip spatial observations entirely
9. If there are no ratings, skip ratings observations entirely
10. Do NOT generate filler observations. If fewer than 2 meaningful observations exist, return fewer.

Return ONLY a JSON array of strings. Example: ["Observation one.", "Observation two."]
No other text, no markdown formatting, no explanation.`;
}

// Generate observations for a specific day
router.post("/day/:dayId", async (req, res) => {
  const dayId = req.params.dayId as string;

  const day = await prisma.day.findUnique({
    where: { id: dayId },
    include: {
      city: true,
      experiences: {
        where: { state: "selected" },
        include: { ratings: true },
      },
    },
  });

  if (!day) {
    res.status(404).json({ error: "Day not found" });
    return;
  }

  if (day.experiences.length === 0) {
    res.json({ observations: [] });
    return;
  }

  const contextLabel = `${day.city.name} on ${new Date(day.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`;

  try {
    const prompt = buildPrompt(day.experiences, contextLabel);

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const observations: string[] = JSON.parse(text.trim());

    res.json({ observations });
  } catch (err: any) {
    console.error("AI observations error (day):", err.message);
    res.status(500).json({ error: "Failed to generate observations" });
  }
});

// Generate observations for a city's experiences
router.post("/city/:cityId", async (req, res) => {
  const cityId = req.params.cityId as string;

  const city = await prisma.city.findUnique({
    where: { id: cityId },
  });

  if (!city) {
    res.status(404).json({ error: "City not found" });
    return;
  }

  const experiences = await prisma.experience.findMany({
    where: { cityId, state: "selected" },
    include: { ratings: true },
    orderBy: { priorityOrder: "asc" },
  });

  if (experiences.length === 0) {
    res.json({ observations: [] });
    return;
  }

  try {
    const prompt = buildPrompt(experiences, `${city.name} (all selected experiences)`);

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const observations: string[] = JSON.parse(text.trim());

    res.json({ observations });
  } catch (err: any) {
    console.error("AI observations error (city):", err.message);
    res.status(500).json({ error: "Failed to generate observations" });
  }
});

export default router;
