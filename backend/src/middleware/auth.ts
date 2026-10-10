import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../services/db.js";

export interface AuthPayload {
  code: string;
  displayName: string;
  travelerId?: string;
  role?: string; // "planner" | "traveler" — per-trip, set at login for the active trip
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production");
  }
  return "dev-secret";
})();

export function parseAccessCodes(): Map<string, string> {
  const raw = process.env.ACCESS_CODES || "";
  const map = new Map<string, string>();
  for (const pair of raw.split(",")) {
    const [code, name] = pair.split(":");
    if (code && name) {
      map.set(code.trim(), name.trim());
    }
  }
  return map;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "365d" });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}

// A person's name as Wander has it now — a phone's sign-in keeps the name it was given, and a name can change (Oct 10:
// "Andy B" and "Julie D." became the Andy and Julie they know themselves as). Kept a short while, so it isn't looked up
// on every request.
const NAME_FOR_A_WHILE = 30_000;
const namesNow = new Map<string, { name: string; at: number }>();

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }
  try {
    req.user = verifyToken(header.slice(7));
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  const id = req.user.travelerId;
  const kept = id ? namesNow.get(id) : undefined;
  if (!id || (kept && Date.now() - kept.at < NAME_FOR_A_WHILE)) {
    if (kept) req.user.displayName = kept.name;
    next();
    return;
  }
  // (if the lookup fails, the sign-in's own name stands — never a refusal)
  prisma.traveler.findUnique({ where: { id }, select: { displayName: true } })
    .then((t) => {
      if (t) { namesNow.set(id, { name: t.displayName, at: Date.now() }); req.user!.displayName = t.displayName; }
    })
    .catch(() => { /* the token's name */ })
    .finally(() => next());
}
