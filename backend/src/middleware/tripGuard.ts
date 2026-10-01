/**
 * Trips are private to their people (Oct 1 2026). Routes that name a trip in their address were limited on Sep 30
 * (tripMemberParam); this closes the rest:
 *   - tripOf.<kind>(id): which trip an item is on, for router.param("id", itemMemberParam(tripOf.<kind>)) — a route
 *     naming one experience, day, reservation… is for the people on that item's trip;
 *   - bodyTripGuard: a request naming a trip, city, day, experience or decision in its body or query (creating,
 *     moving, filtering) is refused when that trip isn't the caller's.
 * Anything that doesn't exist passes on, so each route still answers its own "not found" or "invalid".
 * A sign-in by code without a traveler isn't limited, as in tripMemberParam.
 */
import { Response, NextFunction } from "express";
import prisma from "../services/db.js";
import { verifyToken, type AuthRequest } from "./auth.js";
import { getUserRole } from "./role.js";

const s = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && v.length < 200 ? v : null);

export const tripOf = {
  trip: async (id: string) => (await prisma.trip.findUnique({ where: { id }, select: { id: true } }))?.id,
  city: async (id: string) => (await prisma.city.findUnique({ where: { id }, select: { tripId: true } }))?.tripId,
  day: async (id: string) => (await prisma.day.findUnique({ where: { id }, select: { tripId: true } }))?.tripId,
  experience: async (id: string) => (await prisma.experience.findUnique({ where: { id }, select: { tripId: true } }))?.tripId,
  reservation: async (id: string) => (await prisma.reservation.findUnique({ where: { id }, select: { tripId: true } }))?.tripId,
  accommodation: async (id: string) => (await prisma.accommodation.findUnique({ where: { id }, select: { tripId: true } }))?.tripId,
  routeSegment: async (id: string) => (await prisma.routeSegment.findUnique({ where: { id }, select: { tripId: true } }))?.tripId,
  decision: async (id: string) => (await prisma.decision.findUnique({ where: { id }, select: { tripId: true } }))?.tripId,
  interest: async (id: string) => (await prisma.experienceInterest.findUnique({ where: { id }, select: { tripId: true } }))?.tripId,
  phrase: async (id: string) => (await prisma.tripPhrase.findUnique({ where: { id }, select: { tripId: true } }))?.tripId,
  approval: async (id: string) => (await prisma.approvalRequest.findUnique({ where: { id }, select: { tripId: true } }))?.tripId,
  dedup: async (id: string) => (await prisma.dedupSuggestion.findUnique({ where: { id }, select: { tripId: true } }))?.tripId,
  planningAction: async (id: string) => (await prisma.planningAction.findUnique({ where: { id }, select: { tripId: true } }))?.tripId,
  changeLog: async (id: string) => (await prisma.changeLog.findUnique({ where: { id }, select: { tripId: true } }))?.tripId,
  experienceNote: async (id: string) =>
    (await prisma.experienceNote.findUnique({ where: { id }, select: { experience: { select: { tripId: true } } } }))?.experience?.tripId,
  reflection: async (id: string) =>
    (await prisma.reflection.findUnique({ where: { id }, select: { day: { select: { tripId: true } } } }))?.day?.tripId,
  personalItem: async (id: string) =>
    (await prisma.personalItem.findUnique({ where: { id }, select: { day: { select: { tripId: true } } } }))?.day?.tripId,
};

/** Body and query fields that name something on a trip, and how to find that trip */
const NAMED: [string, (id: string) => Promise<string | null | undefined>][] = [
  ["tripId", tripOf.trip],
  ["cityId", tripOf.city], ["newCityId", tripOf.city], ["toCityId", tripOf.city], ["targetCityId", tripOf.city],
  ["dayId", tripOf.day], ["toDayId", tripOf.day], ["targetDayId", tripOf.day], ["newDayId", tripOf.day],
  ["experienceId", tripOf.experience],
  ["decisionId", tripOf.decision],
];

export async function bodyTripGuard(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  let travelerId: string | undefined;
  if (header?.startsWith("Bearer ")) {
    try { travelerId = verifyToken(header.slice(7)).travelerId; } catch { /* the route's own sign-in check answers */ }
  }
  if (!travelerId) { next(); return; }
  const body = (req.body && typeof req.body === "object" && !Array.isArray(req.body)) ? req.body : {};
  const query = (req.query || {}) as Record<string, unknown>;
  const trips = new Set<string>();
  try {
    for (const [field, find] of NAMED) {
      for (const v of [s(body[field]), s(query[field])]) {
        if (!v) continue;
        const tripId = await find(v);
        if (tripId) trips.add(tripId);
      }
    }
    // (lists of experiences: reordering or deleting several at once)
    if (Array.isArray(body.experienceIds)) {
      const ids = body.experienceIds.map(s).filter(Boolean).slice(0, 500) as string[];
      if (ids.length) {
        for (const e of await prisma.experience.findMany({ where: { id: { in: ids } }, select: { tripId: true } })) trips.add(e.tripId);
      }
    }
    for (const tripId of trips) {
      if (!(await getUserRole(travelerId, tripId))) {
        res.status(403).json({ error: "That isn't on one of your trips." });
        return;
      }
    }
  } catch {
    // a lookup failing (a malformed id) leaves it to the route
  }
  next();
}
