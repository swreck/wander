/**
 * Scout suggestions — contextual, dismissable thoughts.
 *
 * Returns 0-2 suggestions based on the current view context.
 * Rule-based (no AI call) for speed — these should feel instant.
 */

import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

interface Suggestion {
  key: string;
  message: string;
  actionLabel?: string;
  actionTarget?: string; // route path
}

router.post("/suggestions", async (req: AuthRequest, res) => {
  const { tripId, context, cityId, dayId } = req.body as {
    tripId: string;
    context: "city" | "day" | "dashboard" | "now";
    cityId?: string;
    dayId?: string;
  };

  if (!tripId || !context) {
    res.status(400).json({ error: "tripId and context required" });
    return;
  }

  const suggestions: Suggestion[] = [];

  try {
    if (context === "city" && cityId) {
      // City board suggestions
      const experiences = await prisma.experience.findMany({
        where: { tripId, cityId },
        select: { id: true, themes: true, state: true, dayId: true },
      });

      // Theme-heavy detection
      const themeCount: Record<string, number> = {};
      for (const e of experiences) {
        for (const t of e.themes) {
          themeCount[t] = (themeCount[t] || 0) + 1;
        }
      }
      const heavyTheme = Object.entries(themeCount).find(([, count]) => count >= 6);
      if (heavyTheme) {
        const city = await prisma.city.findUnique({ where: { id: cityId }, select: { name: true } });
        suggestions.push({
          key: `theme-heavy-${cityId}-${heavyTheme[0]}`,
          message: `You have ${heavyTheme[1]} ${heavyTheme[0]} spots saved for ${city?.name || "this city"}. Want help picking the best ones?`,
          actionLabel: "Let's discuss",
        });
      }

      // Many unscheduled
      const unscheduled = experiences.filter(e => !e.dayId);
      if (unscheduled.length >= 8 && experiences.length > 0) {
        suggestions.push({
          key: `unscheduled-${cityId}`,
          message: `${unscheduled.length} ideas saved but not yet on any day. That's fine for now — or want to start slotting some in?`,
        });
      }
    }

    if (context === "day" && dayId) {
      // Day timeline suggestions
      const day = await prisma.day.findUnique({
        where: { id: dayId },
        include: {
          experiences: { where: { state: "selected" }, select: { id: true, themes: true, latitude: true, longitude: true } },
          city: { select: { id: true, name: true } },
        },
      });

      if (day) {
        // Nearby unscheduled experiences
        const selectedWithCoords = day.experiences.filter(e => e.latitude && e.longitude);
        if (selectedWithCoords.length > 0 && day.city) {
          const unscheduled = await prisma.experience.findMany({
            where: { tripId, cityId: day.city.id, dayId: null, state: "possible" },
            select: { id: true, name: true, themes: true, latitude: true, longitude: true },
          });

          // Find unscheduled items near the day's planned locations
          const nearbyCount = unscheduled.filter(u => {
            if (!u.latitude || !u.longitude) return false;
            return selectedWithCoords.some(s => {
              const dlat = (s.latitude! - u.latitude!) * 111;
              const dlng = (s.longitude! - u.longitude!) * 111 * Math.cos(s.latitude! * Math.PI / 180);
              return Math.sqrt(dlat * dlat + dlng * dlng) < 1; // within ~1km
            });
          }).length;

          if (nearbyCount >= 2) {
            const foodNearby = unscheduled.filter(u => u.themes.includes("food")).length;
            if (foodNearby > 0) {
              suggestions.push({
                key: `nearby-food-${dayId}`,
                message: `There are ${foodNearby} saved restaurant${foodNearby > 1 ? "s" : ""} near your plans today. Want one for lunch?`,
              });
            }
          }
        }
      }
    }

    res.json({ suggestions: suggestions.slice(0, 2) });
  } catch (err: any) {
    console.error("[scout] suggestions error:", err.message);
    res.json({ suggestions: [] });
  }
});

export default router;
