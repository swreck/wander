import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/trip/:tripId", async (req, res) => {
  const cities = await prisma.city.findMany({
    where: { tripId: req.params.tripId as string },
    orderBy: { sequenceOrder: "asc" },
    include: {
      _count: { select: { experiences: true, days: true } },
    },
  });
  res.json(cities);
});

router.get("/:id", async (req, res) => {
  const city = await prisma.city.findUnique({
    where: { id: req.params.id as string },
    include: {
      days: { orderBy: { date: "asc" } },
      experiences: { orderBy: { priorityOrder: "asc" } },
    },
  });
  if (!city) { res.status(404).json({ error: "City not found" }); return; }
  res.json(city);
});

export default router;
