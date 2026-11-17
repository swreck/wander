// The one route samples come out of (services/samples.ts): GET /api/samples/:tripId. Never cached anywhere.
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { tripMemberParam } from "../middleware/role.js";
import { samplesFor } from "../services/samples.js";

const router = Router();
router.use(requireAuth);
router.param("tripId", tripMemberParam);

router.get("/:tripId", async (req: AuthRequest, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await samplesFor(req.params.tripId as string, req.user?.travelerId));
});

export default router;
