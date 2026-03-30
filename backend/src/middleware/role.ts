import { Response, NextFunction } from "express";
import prisma from "../services/db.js";
import { type AuthRequest } from "./auth.js";

/**
 * Get a traveler's role on a specific trip.
 * Returns "planner" | "traveler" | null (null = not a member).
 */
export async function getUserRole(
  travelerId: string,
  tripId: string,
): Promise<"planner" | "traveler" | null> {
  const member = await prisma.tripMember.findUnique({
    where: { tripId_travelerId: { tripId, travelerId } },
  });
  if (!member) return null;
  // Map legacy "owner" → "planner", "member" → "traveler"
  if (member.role === "owner" || member.role === "planner") return "planner";
  return "traveler";
}

/**
 * Middleware: require the caller to be a member of the trip.
 * Expects tripId in req.params.tripId or req.body.tripId or req.params.id (for /trips/:id routes).
 */
export function requireMember(tripIdParam = "id") {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const travelerId = req.user?.travelerId;
    if (!travelerId) {
      res.status(403).json({ error: "No traveler identity" });
      return;
    }

    const tripId =
      (req.params as any)[tripIdParam] || req.body?.tripId;
    if (!tripId) {
      res.status(400).json({ error: "Trip ID required" });
      return;
    }

    const role = await getUserRole(travelerId, tripId);
    if (!role) {
      res.status(403).json({ error: "Not a member of this trip" });
      return;
    }

    // Attach role and tripId for downstream use
    (req as any).tripRole = role;
    (req as any).tripId = tripId;
    next();
  };
}

/**
 * Middleware: require the caller to be a planner on the trip.
 */
export function requirePlanner(tripIdParam = "id") {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const travelerId = req.user?.travelerId;
    if (!travelerId) {
      res.status(403).json({ error: "No traveler identity" });
      return;
    }

    const tripId =
      (req.params as any)[tripIdParam] || req.body?.tripId;
    if (!tripId) {
      res.status(400).json({ error: "Trip ID required" });
      return;
    }

    const role = await getUserRole(travelerId, tripId);
    if (role !== "planner") {
      res.status(403).json({ error: "Planner access required" });
      return;
    }

    (req as any).tripRole = role;
    (req as any).tripId = tripId;
    next();
  };
}
