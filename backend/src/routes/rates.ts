/**
 * GET /api/rates — recent rates per US dollar for yen, dong and riel (services/rates), for the phone's currency pop-up
 *   → { rates: { JPY, VND, KHR: { rate, asOf, approx } }, source: "open.er-api.com" }
 * Never fails: with the source down it gives the last good rate, else a round figure marked approx. The source is asked
 * once for everyone (services/rates keeps the answer), and nothing is taken from the request.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { ratesPerDollar, RATE_SOURCE } from "../services/rates.js";

// (named from the address actually asked, so the two can't drift apart)
const SOURCE = new URL(RATE_SOURCE).hostname;

const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res) => {
  res.json({ rates: await ratesPerDollar(), source: SOURCE });
});

export default router;
