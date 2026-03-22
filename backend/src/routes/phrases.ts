import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// GET /trip/:tripId — list all phrases for a trip (ordered by creation)
router.get("/trip/:tripId", async (req, res) => {
  const phrases = await prisma.tripPhrase.findMany({
    where: { tripId: req.params.tripId as string },
    orderBy: { createdAt: "asc" },
  });
  res.json(phrases);
});

// POST / — add a phrase (appears at bottom for everyone)
router.post("/", async (req: AuthRequest, res) => {
  const { tripId, english, romaji } = req.body;
  if (!tripId || !english || !romaji) {
    res.status(400).json({ error: "tripId, english, and romaji are required" });
    return;
  }

  const phrase = await prisma.tripPhrase.create({
    data: {
      tripId,
      english,
      romaji,
      addedBy: req.user!.displayName,
    },
  });

  res.status(201).json(phrase);
});

// DELETE /:id — remove a phrase from the shared pool
router.delete("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.tripPhrase.findUnique({
    where: { id: req.params.id as string },
  });
  if (!existing) {
    res.status(404).json({ error: "Phrase not found" });
    return;
  }

  await prisma.tripPhrase.delete({ where: { id: req.params.id as string } });
  res.json({ deleted: true });
});

export default router;
