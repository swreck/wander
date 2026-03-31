import { Router } from "express";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { enrichExperience } from "../services/capture.js";

const router = Router();
router.use(requireAuth);

// List open decisions for a trip
router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  try {
    const tripId = req.params.tripId as string;
    const decisions = await prisma.decision.findMany({
      where: { tripId, status: "open" },
      include: {
        city: { select: { id: true, name: true } },
        options: {
          select: {
            id: true, name: true, description: true, themes: true,
            latitude: true, longitude: true, placeIdGoogle: true,
            cloudinaryImageId: true, ratings: true,
          },
        },
        votes: {
          select: { id: true, optionId: true, userCode: true, displayName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(decisions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a decision
router.post("/", async (req: AuthRequest, res) => {
  try {
    const { tripId, cityId, dayId, title } = req.body;
    if (!tripId || !cityId || !title?.trim()) {
      res.status(400).json({ error: "tripId, cityId, and title are required" });
      return;
    }

    // Verify trip exists
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }

    // Verify city exists and belongs to this trip
    const city = await prisma.city.findUnique({ where: { id: cityId } });
    if (!city || city.tripId !== tripId) {
      res.status(404).json({ error: "City not found on this trip" });
      return;
    }

    const decision = await prisma.decision.create({
      data: {
        tripId,
        cityId,
        dayId: dayId || null,
        title: title.trim(),
        createdBy: req.user!.code,
      },
      include: {
        city: { select: { id: true, name: true } },
        options: true,
        votes: true,
      },
    });

    await logChange({
      user: req.user!,
      tripId,
      actionType: "decision_created",
      entityType: "decision",
      entityId: decision.id,
      entityName: decision.title,
      description: `${req.user!.displayName} started a decision: "${decision.title}"`,
    });

    res.status(201).json(decision);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add an option to a decision (creates a new experience or links existing)
router.post("/:id/options", async (req: AuthRequest, res) => {
  try {
    const decisionId = req.params.id as string;
    const { experienceId, name, description } = req.body;

    const decision = await prisma.decision.findUnique({
      where: { id: decisionId },
      select: { id: true, tripId: true, cityId: true, title: true, status: true },
    });
    if (!decision) { res.status(404).json({ error: "Decision not found" }); return; }
    if (decision.status !== "open") { res.status(400).json({ error: "Decision is already resolved" }); return; }

    let exp;
    if (experienceId) {
      // Validate the experience exists before linking
      const existingExp = await prisma.experience.findUnique({ where: { id: experienceId } });
      if (!existingExp) {
        res.status(404).json({ error: "Experience not found" });
        return;
      }
      // Link existing experience
      exp = await prisma.experience.update({
        where: { id: experienceId },
        data: { state: "voting", decisionId },
      });
    } else if (name?.trim()) {
      // Create new experience as option
      exp = await prisma.experience.create({
        data: {
          tripId: decision.tripId,
          cityId: decision.cityId,
          name: name.trim(),
          description: description?.trim() || null,
          createdBy: req.user!.code,
          state: "voting",
          decisionId,
          locationStatus: "unlocated",
        },
      });
      enrichExperience(exp.id).catch(() => {});
    } else {
      res.status(400).json({ error: "experienceId or name is required" });
      return;
    }

    await logChange({
      user: req.user!,
      tripId: decision.tripId,
      actionType: "decision_option_added",
      entityType: "decision",
      entityId: decision.id,
      entityName: decision.title,
      description: `${req.user!.displayName} added "${exp.name}" to decision "${decision.title}"`,
    });

    // Return full decision with options
    const updated = await prisma.decision.findUnique({
      where: { id: decisionId },
      include: {
        city: { select: { id: true, name: true } },
        options: {
          select: {
            id: true, name: true, description: true, themes: true,
            latitude: true, longitude: true, ratings: true,
          },
        },
        votes: {
          select: { id: true, optionId: true, userCode: true, displayName: true },
        },
      },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cast a vote (or "happy with any" if optionId is null)
router.post("/:id/vote", async (req: AuthRequest, res) => {
  try {
    const decisionId = req.params.id as string;
    const { optionId } = req.body; // null = "happy with any"

    const decision = await prisma.decision.findUnique({
      where: { id: decisionId },
      select: { status: true },
    });
    if (!decision) { res.status(404).json({ error: "Decision not found" }); return; }
    if (decision.status !== "open") { res.status(400).json({ error: "Decision is already resolved" }); return; }

    // Validate optionId refers to a real experience if provided
    if (optionId) {
      const optionExp = await prisma.experience.findUnique({ where: { id: optionId } });
      if (!optionExp) {
        res.status(404).json({ error: "Option not found" });
        return;
      }
    }

    const vote = await prisma.decisionVote.upsert({
      where: {
        decisionId_userCode: { decisionId, userCode: req.user!.code },
      },
      create: {
        decisionId,
        optionId: optionId || null,
        userCode: req.user!.code,
        displayName: req.user!.displayName,
      },
      update: {
        optionId: optionId || null,
      },
    });

    res.json(vote);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Resolve a decision — winners go to planned, others to maybe
router.post("/:id/resolve", async (req: AuthRequest, res) => {
  try {
    const decisionId = req.params.id as string;
    const { winnerIds } = req.body as { winnerIds: string[] }; // experience IDs that "won"

    const decision = await prisma.decision.findUnique({
      where: { id: decisionId },
      include: { options: { select: { id: true, name: true } } },
    });
    if (!decision) { res.status(404).json({ error: "Decision not found" }); return; }

    const winnerSet = new Set(winnerIds || []);

    // Update each option
    for (const opt of decision.options) {
      if (winnerSet.has(opt.id)) {
        await prisma.experience.update({
          where: { id: opt.id },
          data: { state: "selected", decisionId: null },
        });
      } else {
        await prisma.experience.update({
          where: { id: opt.id },
          data: { state: "possible", decisionId: null },
        });
      }
    }

    // Mark decision as resolved
    await prisma.decision.update({
      where: { id: decisionId },
      data: { status: "resolved", resolvedAt: new Date() },
    });

    const winnerNames = decision.options.filter(o => winnerSet.has(o.id)).map(o => o.name);
    await logChange({
      user: req.user!,
      tripId: decision.tripId,
      actionType: "decision_resolved",
      entityType: "decision",
      entityId: decision.id,
      entityName: decision.title,
      description: `${req.user!.displayName} resolved "${decision.title}" → ${winnerNames.join(", ") || "none selected"}`,
    });

    res.json({ resolved: true, winners: winnerNames });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a decision (returns options to possible state)
router.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const decisionId = req.params.id as string;

    const decision = await prisma.decision.findUnique({
      where: { id: decisionId },
      include: { options: { select: { id: true } } },
    });
    if (!decision) { res.status(404).json({ error: "Decision not found" }); return; }

    // Return all options to possible
    for (const opt of decision.options) {
      await prisma.experience.update({
        where: { id: opt.id },
        data: { state: "possible", decisionId: null },
      });
    }

    await prisma.decision.delete({ where: { id: decisionId } });

    res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
