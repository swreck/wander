/**
 * Activity Feed — A lightweight stream of what's been happening.
 *
 * Combines ChangeLog entries with reaction and note events.
 * Only shows positive actions — things people did. Never absence.
 */

import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getUserRole } from "../middleware/role.js";

const router = Router();
router.use(requireAuth);

interface FeedItem {
  id: string;
  type: "change" | "reaction" | "note";
  userDisplayName: string;
  description: string;
  createdAt: string;
}

router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  // A trip's activity is for its own people (it checked sign-in only)
  if (req.user?.travelerId && !(await getUserRole(req.user.travelerId, tripId))) {
    res.status(403).json({ error: "That trip isn't one of yours." });
    return;
  }
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
      entityId: true,
      actionType: true,
    },
  });
  // Something added and then taken back isn't news: neither half shows here (History keeps both) — round 12: a plan
  // added and taken off posted "Ken took 'w4 test …' off Tue, Oct 6" to everyone's Home
  // (by what happened LAST to it: a maybe taken off the list and put back is on the list — Remove, Oct 3)
  const latest = new Map<string, string>();
  for (const c of changes) if (c.entityId && !latest.has(c.entityId)) latest.set(c.entityId, c.actionType || "");
  const takenBack = new Set([...latest].filter(([, a]) => /(_removed|_deleted|taken_back)$/.test(a)).map(([id]) => id));
  // "I'm in" said and then taken back isn't news either, and "no longer in" is never news (Oct 15 review: Home's
  // Recent activity was two "… is no longer in on 'Akihabara'"); nor is putting a maybe back
  const outLater = new Set<string>();

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

  // Notes on ideas come in through the change history above — group notes only. Reading the notes themselves here
  // showed "just for me" notes to everyone, and every group note twice (round 12 blocker: Larisa's private note
  // "Buy the gold washi for Mom" appeared on Ken's Home).

  // Merge into feed
  const feed: FeedItem[] = [];

  for (const c of changes) {
    if (c.entityId && takenBack.has(c.entityId)) continue;
    const who = `${c.userDisplayName}|${c.entityId}`;
    if (c.actionType === "maybe_out") { outLater.add(who); continue; }
    if (c.actionType === "maybe_in" && outLater.has(who)) continue;
    // (taking something off the list, and putting it back: Maybes' "Taken off the list" says who and what)
    if (c.actionType === "maybe_put_back" || c.actionType === "maybe_removed") continue;
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

  // Sort by date, newest first
  feed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ feed: feed.slice(0, limit) });
});

export default router;
