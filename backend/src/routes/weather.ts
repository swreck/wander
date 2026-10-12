/**
 * GET /api/weather/trip/:tripId/day/:date — that day's forecast where this person sleeps that night (services/dayWeather)
 *   → { weather: DayWeather | null }   (null: a past day, more than 16 days ahead, or no forecast to be had right now)
 */
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { tripMemberParam } from "../middleware/role.js";
import { dayWeather } from "../services/dayWeather.js";

const router = Router();
router.use(requireAuth);
router.param("tripId", tripMemberParam);

router.get("/trip/:tripId/day/:date", async (req: AuthRequest, res) => {
  const date = String(req.params.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: "A date like 2026-10-19" }); return; }
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);   // (Japan's date)
  const weather = await dayWeather(String(req.params.tripId), req.user?.displayName || "", date, today).catch(() => null);
  res.json({ weather });
});

export default router;
