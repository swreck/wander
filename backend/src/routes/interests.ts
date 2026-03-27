import { Router } from "express";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Float an experience to the group
router.post("/", async (req: AuthRequest, res) => {
  const { experienceId, note } = req.body;
  const user = req.user!;

  const experience = await prisma.experience.findUnique({
    where: { id: experienceId },
    include: { city: true },
  });
  if (!experience) { res.status(404).json({ error: "Experience not found" }); return; }

  const interest = await prisma.experienceInterest.upsert({
    where: { experienceId_userCode: { experienceId, userCode: user.code } },
    create: {
      experienceId,
      tripId: experience.tripId,
      userCode: user.code,
      displayName: user.displayName,
      note: note || null,
    },
    update: {
      note: note || null,
      displayName: user.displayName,
    },
    include: { reactions: true },
  });

  await logChange({
    user,
    tripId: experience.tripId,
    actionType: "experience_floated",
    entityType: "experience",
    entityId: experience.id,
    entityName: experience.name,
    description: `${user.displayName} flagged "${experience.name}" for the group`,
  });

  res.status(201).json(interest);
});

// Get all interests for a trip
router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;

  const interests = await prisma.experienceInterest.findMany({
    where: { tripId },
    include: {
      reactions: true,
      experience: { select: { id: true, name: true, cityId: true, dayId: true, state: true, createdBy: true, city: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(interests);
});

// React to a floated experience
router.post("/:id/react", async (req: AuthRequest, res) => {
  const interestId = req.params.id as string;
  const { reaction, note } = req.body;
  const user = req.user!;

  const interest = await prisma.experienceInterest.findUnique({
    where: { id: interestId },
    include: { experience: true },
  });
  if (!interest) { res.status(404).json({ error: "Interest not found" }); return; }

  if (!["interested", "maybe", "pass"].includes(reaction)) {
    res.status(400).json({ error: "reaction must be interested, maybe, or pass" });
    return;
  }

  const reactionRecord = await prisma.interestReaction.upsert({
    where: { interestId_userCode: { interestId, userCode: user.code } },
    create: {
      interestId,
      userCode: user.code,
      displayName: user.displayName,
      reaction,
      note: note || null,
    },
    update: {
      reaction,
      note: note || null,
      displayName: user.displayName,
    },
  });

  await logChange({
    user,
    tripId: interest.tripId,
    actionType: "interest_reacted",
    entityType: "experience",
    entityId: interest.experienceId,
    entityName: interest.experience.name,
    description: `${user.displayName} is ${reaction} in "${interest.experience.name}"`,
  });

  res.json(reactionRecord);
});

// Retract a float (only the original floater can do this)
router.delete("/:id", async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const user = req.user!;

  const interest = await prisma.experienceInterest.findUnique({ where: { id } });
  if (!interest) { res.status(404).json({ error: "Interest not found" }); return; }
  if (interest.userCode !== user.code) { res.status(403).json({ error: "Only the person who floated this can retract it" }); return; }

  await prisma.experienceInterest.delete({ where: { id } });
  res.json({ deleted: true });
});

export default router;
