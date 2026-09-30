/**
 * People on a trip — who's in, how they sign in, and personal links sent from inside Wander.
 *
 * GET  /api/people/:tripId        Everyone in the group, with a plain status. Trip members only.
 *                                 Never returns link codes.
 * POST /api/people/:tripId/link   { travelerId } → a new personal link for that person. Planners only.
 *                                 The phone shares it (Messages); Wander never shows it in a list.
 *
 * A personal link signs its person in on a new phone. Once that person sets up Face ID, the link
 * has done its job and stops working (see isLinkRetired in services/passkeys.ts); a planner can send
 * a new one at any time.
 */

import { Router } from "express";
import crypto from "crypto";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getUserRole } from "../middleware/role.js";
import { normalizeCredentials } from "../services/passkeys.js";

const router = Router();
router.use(requireAuth);

type Status = "face-id" | "link" | "not-yet";

router.get("/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  const myRole = req.user?.travelerId ? await getUserRole(req.user.travelerId, tripId) : null;
  if (!myRole) { res.status(403).json({ error: "Not a member of this trip" }); return; }

  // This trip's group only: its members, and anyone invited who hasn't opened their link yet.
  // (Another trip's group never shows here.)
  const [members, pending] = await Promise.all([
    prisma.tripMember.findMany({ where: { tripId }, include: { traveler: { select: { id: true, displayName: true, webauthnCredentials: true, createdAt: true } } }, orderBy: { joinedAt: "asc" } }),
    prisma.tripInvite.findMany({ where: { tripId, claimedByTravelerId: null }, orderBy: { createdAt: "asc" } }),
  ]);
  const people: { travelerId: string; name: string; role: string | null; status: Status; faceIdPhones: number; isMe: boolean }[] = members.map((m) => {
    const faceIdPhones = normalizeCredentials(m.traveler.webauthnCredentials).length;
    const status: Status = faceIdPhones > 0 ? "face-id" : "link";
    return { travelerId: m.traveler.id, name: m.traveler.displayName, role: m.role, status, faceIdPhones, isMe: m.traveler.id === req.user?.travelerId };
  });
  const memberNames = new Set(people.map((p) => p.name.toLowerCase()));
  const invited = Array.from(new Map(pending.filter((i) => !memberNames.has(i.expectedName.toLowerCase())).map((i) => [i.expectedName.toLowerCase(), i])).values());
  for (const i of invited) {
    const existing = await prisma.traveler.findFirst({ where: { displayName: { equals: i.expectedName, mode: "insensitive" } }, select: { id: true } });
    people.push({ travelerId: existing?.id || `invite:${i.id}`, name: i.expectedName, role: null as any, status: "not-yet", faceIdPhones: 0, isMe: false });
  }
  res.json({ people, canSendLinks: myRole === "planner" });
});

router.post("/:tripId/link", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  const myRole = req.user?.travelerId ? await getUserRole(req.user.travelerId, tripId) : null;
  if (myRole !== "planner") {
    res.status(403).json({ error: "Only Ken or Larisa can send links." });
    return;
  }
  const traveler = await prisma.traveler.findUnique({ where: { id: String(req.body?.travelerId || "") } });
  if (!traveler) { res.status(404).json({ error: "We couldn't find that person." }); return; }
  const member = await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId, travelerId: traveler.id } } });
  const inviteToken = crypto.randomBytes(18).toString("base64url");
  await prisma.tripInvite.create({
    data: {
      tripId, expectedName: traveler.displayName, inviteToken,
      // Already on the trip: the link simply signs them in. Not yet: opening it adds them to the trip.
      ...(member ? { claimedByTravelerId: traveler.id, claimedAt: new Date() } : {}),
    },
  });
  console.log(`[people] ${req.user?.displayName} made a new link for ${traveler.displayName}`);
  res.json({ token: inviteToken, name: traveler.displayName });
});

/**
 * POST /api/people/:tripId/add { name } — "Add someone": let a person into Wander AND onto this trip.
 * Planners of that trip only. Being in Wander and being on a trip are separate: someone already
 * in Wander (from another trip) keeps their account and just gets this trip too; someone new is
 * created when they open their link. Returns their personal link, to show as a QR code or send.
 */
router.post("/:tripId/add", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  const myRole = req.user?.travelerId ? await getUserRole(req.user.travelerId, tripId) : null;
  if (myRole !== "planner") {
    res.status(403).json({ error: "Only the trip's planners can add people." });
    return;
  }
  const name = String(req.body?.name || "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 40 || !/\p{L}/u.test(name)) {
    res.status(400).json({ error: "What's their name? (First name is fine.)" });
    return;
  }
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { name: true } });
  if (!trip) { res.status(404).json({ error: "We couldn't find that trip." }); return; }

  const existing = await prisma.traveler.findFirst({ where: { displayName: { equals: name, mode: "insensitive" } } });
  const member = existing
    ? await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId, travelerId: existing.id } } })
    : null;
  const displayName = existing?.displayName || name;
  // A name already in Wander could be that person on a new phone — or someone else with the same
  // name. The link signs its holder in AS that person (their documents too), so it's never made on a
  // guess: the planner says which first (samePerson: true), or picks a fuller name ("Julie B.").
  if (existing && req.body?.samePerson !== true) {
    res.status(409).json({
      error: `${displayName} is already ${member ? `on ${trip.name}` : "in Wander"}.`,
      sameName: true, name: displayName, onTrip: !!member, tripName: trip.name,
    });
    return;
  }
  const inviteToken = crypto.randomBytes(18).toString("base64url");
  await prisma.tripInvite.create({
    data: {
      tripId, expectedName: displayName, inviteToken,
      // Already on this trip: the link simply signs them in. Otherwise opening it adds them (and,
      // if they're new to Wander, creates them) — see POST /api/auth/join.
      ...(member && existing ? { claimedByTravelerId: existing.id, claimedAt: new Date() } : {}),
    },
  });
  console.log(`[people] ${req.user?.displayName} added ${displayName} to ${trip.name} (${existing ? member ? "already on it" : "already in Wander" : "new to Wander"})`);
  res.status(201).json({
    token: inviteToken, name: displayName, tripName: trip.name,
    alreadyInWander: !!existing, alreadyOnTrip: !!member,
  });
});

export default router;
