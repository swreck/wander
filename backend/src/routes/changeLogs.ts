import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/trip/:tripId", async (req, res) => {
  const { limit = "50", offset = "0", search } = req.query;

  const where: any = { tripId: req.params.tripId as string };

  if (search && typeof search === "string") {
    where.OR = [
      { description: { contains: search, mode: "insensitive" } },
      { entityName: { contains: search, mode: "insensitive" } },
      { userDisplayName: { contains: search, mode: "insensitive" } },
      { actionType: { contains: search, mode: "insensitive" } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.changeLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    }),
    prisma.changeLog.count({ where }),
  ]);

  res.json({ logs, total });
});

export default router;
