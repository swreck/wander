/**
 * The days a person is on a trip (December 2026: Ken and Larisa are away from Dec 14, two of the others only Dec 25 to
 * Jan 1). TripMember.abroadFrom / abroadTo hold them as calendar days; null on either end is the trip's own end, so a
 * trip with neither set (Japan) is theirs the whole way. A push or nudge about the trip is never sent to a person on a
 * day outside theirs: it would reach a phone at home.
 */
import prisma from "./db.js";

export type TheirDays = { abroadFrom: Date | null; abroadTo: Date | null };

/** Is this calendar day (YYYY-MM-DD) one of this person's days on the trip? Both ends are included. */
export function onTheirDays(m: TheirDays, ymd: string): boolean {
  const from = m.abroadFrom ? m.abroadFrom.toISOString().slice(0, 10) : null;
  const to = m.abroadTo ? m.abroadTo.toISOString().slice(0, 10) : null;
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  return true;
}

/** The calendar day it is at a moment, on a time zone's clock */
export function dayIn(zone: string, at: Date): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at); }
  catch { return at.toISOString().slice(0, 10); }
}

/** May a notice about this trip reach this person now? Yes unless they are on the trip and it is a day outside theirs,
 *  by the trip's own clock. A person who isn't on the trip, or a trip that isn't there, holds nothing back. */
export async function pushAllowed(travelerId: string, tripId: string, at = new Date()): Promise<boolean> {
  const m = await prisma.tripMember.findUnique({
    where: { tripId_travelerId: { tripId, travelerId } },
    select: { abroadFrom: true, abroadTo: true, trip: { select: { timeZone: true } } },
  }).catch(() => null);
  if (!m) return true;
  return onTheirDays(m, dayIn(m.trip.timeZone || "Asia/Tokyo", at));
}
