import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { logChange } from "../services/changeLog.js";
import { getUserRole } from "../middleware/role.js";
import { itemMemberParam } from "../middleware/role.js";
import { tripOf } from "../middleware/tripGuard.js";

const router = Router();
router.use(requireAuth);
// A route naming one item is for the people on that item's trip (Oct 1 2026)
router.param("cityId", itemMemberParam(tripOf.city));
router.param("id", itemMemberParam(tripOf.experienceNote));

// Trips are private to their people: notes are read and written only by someone on the trip
async function onTrip(req: AuthRequest, tripId: string) {
  return req.user?.travelerId ? !!(await getUserRole(req.user.travelerId, tripId)) : false;
}

// Add a note to an experience
router.post("/", async (req: AuthRequest, res) => {
  const { experienceId, content, visibility } = req.body;

  if (!experienceId || !content?.trim()) {
    res.status(400).json({ error: "experienceId and content required" });
    return;
  }

  if (!req.user?.travelerId) {
    res.status(403).json({ error: "Traveler identity required" });
    return;
  }

  const experience = await prisma.experience.findUnique({ where: { id: experienceId } });
  if (!experience) {
    res.status(404).json({ error: "Experience not found" });
    return;
  }
  if (!(await onTrip(req, experience.tripId))) {
    res.status(403).json({ error: "Not a member of this trip" });
    return;
  }

  // The same words on the same idea from the same person within minutes is one note sent twice (the page and the
  // phone's background helper can both resend a note kept with no signal — confirmation tester k2): the one kept
  const recent = await prisma.experienceNote.findFirst({
    where: { experienceId, travelerId: req.user.travelerId, content: content.trim(), createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
    include: { traveler: { select: { displayName: true } } },
  });
  if (recent) { res.json(recent); return; }

  const note = await prisma.experienceNote.create({
    data: {
      experienceId,
      travelerId: req.user.travelerId,
      content: content.trim(),
      visibility: visibility === "private" ? "private" : "group",
    },
    include: { traveler: { select: { displayName: true } } },
  });

  // Group notes show in History; "just for me" notes never do
  if (note.visibility === "group") {
    logChange({
      tripId: experience.tripId, user: req.user!, actionType: "note_added", entityType: "experience_note", entityId: note.id,
      entityName: experience.name, description: `noted on ${experience.name}: "${note.content.slice(0, 80)}"`,
      newState: { experienceId, content: note.content },
    }).catch(() => {});
  }

  res.status(201).json(note);
});

// Update a note (only the author can)
router.patch("/:id", async (req: AuthRequest, res) => {
  const note = await prisma.experienceNote.findUnique({
    where: { id: req.params.id as string },
  });

  if (!note) { res.status(404).json({ error: "Not found" }); return; }
  if (note.travelerId !== req.user?.travelerId) { res.status(403).json({ error: "Not yours" }); return; }

  const { content, visibility } = req.body;
  const updated = await prisma.experienceNote.update({
    where: { id: req.params.id as string },
    data: {
      ...(content !== undefined && { content: content.trim() }),
      ...(visibility !== undefined && { visibility }),
    },
    include: { traveler: { select: { displayName: true } } },
  });

  res.json(updated);
});

// Get notes for experiences in a city
// Private notes are only visible to their author
router.get("/city/:cityId", async (req: AuthRequest, res) => {
  const city = await prisma.city.findUnique({ where: { id: req.params.cityId as string }, select: { tripId: true } });
  if (!city) { res.json({}); return; }
  if (!(await onTrip(req, city.tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const notes = await prisma.experienceNote.findMany({
    where: {
      experience: { cityId: req.params.cityId as string },
      OR: [
        { visibility: "group" },
        { travelerId: req.user?.travelerId || "" },
      ],
    },
    orderBy: { createdAt: "desc" }, // newest first
    include: { traveler: { select: { displayName: true } } },
  });

  // Group by experienceId
  const grouped: Record<string, typeof notes> = {};
  for (const n of notes) {
    if (!grouped[n.experienceId]) grouped[n.experienceId] = [];
    grouped[n.experienceId].push(n);
  }

  res.json(grouped);
});

// Delete a note (only the author can)
router.delete("/:id", async (req: AuthRequest, res) => {
  const note = await prisma.experienceNote.findUnique({
    where: { id: req.params.id as string },
  });

  if (!note) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (note.travelerId !== req.user?.travelerId) {
    res.status(403).json({ error: "Not yours" });
    return;
  }

  await prisma.experienceNote.delete({ where: { id: req.params.id as string } });
  // A group note taken back shows in History, like its adding did
  if (note.visibility === "group") {
    const experience = await prisma.experience.findUnique({ where: { id: note.experienceId }, select: { tripId: true, name: true } });
    if (experience) {
      // Taken back means its words go too: the earlier "noted on …: “…”" line keeps only that a note was there
      await prisma.changeLog.updateMany({
        where: { entityId: note.id, actionType: "note_added" },
        data: { description: `noted on ${experience.name} (since taken back)`, newState: undefined },
      }).catch(() => {});
      logChange({
        tripId: experience.tripId, user: req.user!, actionType: "note_removed", entityType: "experience_note", entityId: note.id,
        entityName: experience.name, description: `took back a note on ${experience.name}`,
        previousState: { experienceId: note.experienceId, content: note.content },
      }).catch(() => {});
    }
  }
  res.json({ deleted: true });
});

export default router;
