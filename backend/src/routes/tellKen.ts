// "Tell Ken" for Ken (services/tellKen.ts): his list, a message's picture, and "read". The trip's organizer only.
import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { tripMemberParam } from "../middleware/role.js";
import { tellKenList, organizerOf } from "../services/tellKen.js";

const router = Router();
router.use(requireAuth);
router.param("tripId", tripMemberParam);

// GET /trip/:tripId — newest first; 403 for anyone but the organizer (the phone then shows nothing)
router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  const list = me ? await tellKenList(req.params.tripId as string, me) : null;
  if (!list) { res.status(403).json({ error: "Only the trip's organizer reads these." }); return; }
  res.json(list);
});

// The organizer's own message, or none
async function mine(req: AuthRequest, id: string) {
  const row = await prisma.tellKen.findUnique({ where: { id } }).catch(() => null);
  if (!row || !req.user?.travelerId || (await organizerOf(row.tripId)) !== req.user.travelerId) return null;
  return row;
}

router.get("/:id/picture", async (req: AuthRequest, res) => {
  const row = await mine(req, req.params.id as string);
  if (!row?.image || !row.imageType) { res.status(404).end(); return; }
  res.type(row.imageType).set("Cache-Control", "private, max-age=3600").send(Buffer.from(row.image));
});

router.post("/:id/read", async (req: AuthRequest, res) => {
  const row = await mine(req, req.params.id as string);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (!row.readAt) await prisma.tellKen.update({ where: { id: row.id }, data: { readAt: new Date() } });
  res.json({ read: true });
});

export default router;
