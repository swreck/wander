import prisma from "./db.js";
import { parseAccessCodes } from "../middleware/auth.js";
import crypto from "crypto";

/**
 * Seed Traveler table from ACCESS_CODES env var on first boot.
 * Also creates TripMember records for existing trips and generates invite tokens.
 * Idempotent — safe to call on every startup.
 */
export async function seedTravelers() {
  const codes = parseAccessCodes();
  if (codes.size === 0) return;

  // Check if any travelers exist already
  const existing = await prisma.traveler.count();
  if (existing > 0) return; // Already seeded

  console.log(`[seed] Creating ${codes.size} travelers from ACCESS_CODES...`);

  const travelers: { id: string; displayName: string; code: string }[] = [];
  for (const [code, name] of codes) {
    const traveler = await prisma.traveler.create({
      data: { displayName: name },
    });
    travelers.push({ id: traveler.id, displayName: name, code });
  }

  // Create TripMember records for all existing trips
  const trips = await prisma.trip.findMany();
  for (const trip of trips) {
    // Generate invite token if missing
    if (!trip.inviteToken) {
      await prisma.trip.update({
        where: { id: trip.id },
        data: { inviteToken: crypto.randomBytes(6).toString("hex") },
      });
    }

    // Add all existing travelers as members of existing trips
    for (const t of travelers) {
      await prisma.tripMember.upsert({
        where: { tripId_travelerId: { tripId: trip.id, travelerId: t.id } },
        update: {},
        create: { tripId: trip.id, travelerId: t.id, role: "member" },
      });
    }
  }

  console.log(`[seed] Seeded ${travelers.length} travelers and ${trips.length} trip memberships.`);
}
