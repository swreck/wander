import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthPayload {
  code: string;
  displayName: string;
  travelerId?: string;
  role?: string; // "planner" | "traveler" — per-trip, set at login for the active trip
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
