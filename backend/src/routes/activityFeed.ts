/**
 * Activity Feed — A lightweight stream of what's been happening.
 *
 * Combines ChangeLog entries with reaction and note events.
 * Only shows positive actions — things people did. Never absence.
 */

import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

interface FeedItem {
  id: string;
  type: "change" | "reaction" | "note";
  userDisplayName: string;
  description: string;
  createdAt: string;
}

router.get("/trip/:tripId", async (req, res) => {
  const tripId = req.params.tripId as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

  // Get recent changes
  const changes = await prisma.changeLog.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      userDisplayName: true,
      description: true,
      createdAt: true,
    },
  });

  // Get recent reactions (last 50)
  const reactions = await prisma.experienceReaction.findMany({
    where: { experience: { tripId } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      traveler: { select: { displayName: true } },
      experience: { select: { name: true } },
    },
  });

  // Get recent notes (last 50)
  const notes = await prisma.experienceNote.findMany({
    where: { experience: { tripId } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      traveler: { select: { displayName: true } },
      experience: { select: { name: true } },
    },
  });

  // Merge into feed
  const feed: FeedItem[] = [];

  for (const c of changes) {
    feed.push({
      id: c.id,
      type: "change",
      userDisplayName: c.userDisplayName,
      description: c.description,
      createdAt: c.createdAt.toISOString(),
    });
  }

  for (const r of reactions) {
    feed.push({
      id: r.id,
      type: "reaction",
      userDisplayName: r.traveler.displayName,
      description: `reacted ${r.emoji} to ${r.experience.name}`,
      createdAt: r.createdAt.toISOString(),
    });
  }

  for (const n of notes) {
    feed.push({
      id: n.id,
      type: "note",
      userDisplayName: n.traveler.displayName,
      description: `noted on ${n.experience.name}: "${n.content.length > 60 ? n.content.slice(0, 57) + "..." : n.content}"`,
      createdAt: n.createdAt.toISOString(),
    });
  }

  // Sort by date, newest first
  feed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ feed: feed.slice(0, limit) });
});

export default router;
