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
 * For router.param("tripId", tripMemberParam): any route naming a trip is for that trip's own people (Sep 30 2026:
 * seventeen route files served a trip's history, days, decisions and more to anyone signed in, though trips are
 * private since Sep 28). A sign-in by code without a traveler isn't limited, as in trips.ts.
 */
export async function tripMemberParam(req: AuthRequest, res: Response, next: NextFunction, tripId: string) {
  const travelerId = req.user?.travelerId;
  if (travelerId && !(await getUserRole(travelerId, tripId))) {
    res.status(403).json({ error: "That trip isn't one of yours." });
    return;
  }
  next();
}

/**
 * For router.param("id", itemMemberParam(lookup)): a route naming one item (an experience, a day, a reservation…) is
 * for the people on that item's trip (Oct 1 2026: these routes checked sign-in only, so anyone signed in to Wander
 * could change another trip's items by id). `lookup` finds the item's trip; an item that doesn't exist passes on so
 * the route answers its own "not found". A sign-in by code without a traveler isn't limited, as in tripMemberParam.
 */
export function itemMemberParam(lookup: (id: string) => Promise<string | null | undefined>,
  refuse: { status: number; error: string } = { status: 403, error: "That isn't on one of your trips." }) {
  return async (req: AuthRequest, res: Response, next: NextFunction, id: string) => {
    const travelerId = req.user?.travelerId;
    if (!travelerId) { next(); return; }
    let tripId: string | null | undefined;
    try { tripId = await lookup(id); } catch { tripId = null; }
    if (tripId && !(await getUserRole(travelerId, tripId))) {
      res.status(refuse.status).json({ error: refuse.error });
      return;
    }
    next();
  };
}

/** The trip of a body's tripId (or of the city/day/experience it names), for create routes: null when it's yours */
export async function notYourTrip(travelerId: string | undefined, tripId: string | null | undefined): Promise<boolean> {
  if (!travelerId || !tripId) return false;
  return !(await getUserRole(travelerId, tripId));
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
