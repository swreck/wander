import { Router } from "express";
import { parseAccessCodes, signToken, requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();

router.post("/login", (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Access code required" });
    return;
  }

  const codes = parseAccessCodes();
  const displayName = codes.get(code.trim());
  if (!displayName) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  const token = signToken({ code: code.trim(), displayName });
  res.json({ token, displayName });
});

router.get("/me", requireAuth, (req: AuthRequest, res) => {
  res.json({ code: req.user!.code, displayName: req.user!.displayName });
});

export default router;
