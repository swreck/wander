/**
 * GET /api/weather/trip/:tripId/day/:date — that day's forecast where this person sleeps that night (services/dayWeather)
 *   → { weather: DayWeather | null }   (null: a past day, more than 16 days ahead, or no forecast to be had right now)
 * GET /api/weather/trip/:tripId/watch — the storm watch (below)
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

/**
 * GET /api/weather/trip/:tripId/watch — the storm, warning and train watch for this person, today through 5 days ahead
 * (services/stormWatch — Ken, Oct 13: "yes")
 *   → { days: { [date]: { kind, text, link? }[] }, unknown: string[], checked }   (days is empty when nothing is up)
 */
router.get("/trip/:tripId/watch", async (req: AuthRequest, res) => {
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);   // (Japan's date)
  const { stormWatch } = await import("../services/stormWatch.js");
  const w = await stormWatch(String(req.params.tripId), req.user?.displayName || "", today).catch((e) => {
    console.warn("[storm-watch]", e?.message);
    return { days: {}, through: { warnings: null, chances: null, typhoons: null }, unknown: ["the storm watch"], checked: new Date().toISOString() };
  });
  res.json(w);
});

export default router;
