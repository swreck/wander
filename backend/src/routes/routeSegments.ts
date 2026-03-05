import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/trip/:tripId", async (req, res) => {
  const segments = await prisma.routeSegment.findMany({
    where: { tripId: req.params.tripId as string },
    orderBy: { sequenceOrder: "asc" },
    include: {
      experiences: { where: { state: "selected" }, orderBy: { priorityOrder: "asc" } },
    },
  });
  res.json(segments);
});

router.get("/:id", async (req, res) => {
  const segment = await prisma.routeSegment.findUnique({
    where: { id: req.params.id as string },
    include: { experiences: { orderBy: { priorityOrder: "asc" } } },
  });
  if (!segment) { res.status(404).json({ error: "Route segment not found" }); return; }
  res.json(segment);
});

export default router;
