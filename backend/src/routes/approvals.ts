import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getUserRole } from "../middleware/role.js";

const router = Router();
router.use(requireAuth);

// ── GET /:tripId ──────────────────────────────────────────────
// List approval requests for a trip. Planners see all; Travelers see their own.
router.get("/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  const travelerId = req.user?.travelerId;

  if (!travelerId) {
    res.status(403).json({ error: "Traveler identity required" });
    return;
  }

  const role = await getUserRole(travelerId, tripId);
  if (!role) {
    res.status(403).json({ error: "Not a member of this trip" });
    return;
  }

  const where: any = { tripId };
  if (role !== "planner") {
    where.requesterId = travelerId;
  }

  const approvals = await prisma.approvalRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      requester: { select: { displayName: true } },
      reviewedBy: { select: { displayName: true } },
    },
  });

  res.json(approvals);
});

// ── GET /:tripId/pending ──────────────────────────────────────
// Count pending approvals for badge display
router.get("/:tripId/pending", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  const count = await prisma.approvalRequest.count({
    where: { tripId, status: "pending" },
  });
  res.json({ count });
});

// ── POST / ────────────────────────────────────────────────────
// Create an approval request (typically called by the system when a Traveler
// attempts a big operation)
router.post("/", async (req: AuthRequest, res) => {
  const { tripId, type, description, payload } = req.body;

  if (!req.user?.travelerId) {
    res.status(403).json({ error: "Traveler identity required" });
    return;
  }

  if (!tripId) {
    res.status(400).json({ error: "tripId is required" });
    return;
  }

  // Verify trip exists
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }

  const approval = await prisma.approvalRequest.create({
    data: {
      tripId,
      requesterId: req.user.travelerId,
      type,
      description,
      payload: payload || {},
    },
    include: {
      requester: { select: { displayName: true } },
    },
  });

  res.status(201).json(approval);
});

// ── PATCH /:id/review ─────────────────────────────────────────
// Approve or reject an approval request (Planner only)
router.patch("/:id/review", async (req: AuthRequest, res) => {
  const { status, reviewNote } = req.body; // "approved" | "rejected"

  if (!["approved", "rejected"].includes(status)) {
    res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
    return;
  }

  if (!req.user?.travelerId) {
    res.status(403).json({ error: "Traveler identity required" });
    return;
  }

  const approval = await prisma.approvalRequest.findUnique({
    where: { id: req.params.id as string },
  });

  if (!approval) {
    res.status(404).json({ error: "Approval request not found" });
    return;
  }

  // Check that reviewer is a planner
  const role = await getUserRole(req.user.travelerId, approval.tripId);
  if (role !== "planner") {
    res.status(403).json({ error: "Only planners can review approval requests" });
    return;
  }

  const updated = await prisma.approvalRequest.update({
    where: { id: req.params.id as string },
    data: {
      status,
      reviewedById: req.user.travelerId,
      reviewedAt: new Date(),
      reviewNote: reviewNote || null,
    },
    include: {
      requester: { select: { displayName: true } },
      reviewedBy: { select: { displayName: true } },
    },
  });

  // If approved, execute the payload
  if (status === "approved" && approval.payload) {
    try {
      const payload = approval.payload as any;
      switch (approval.type) {
        case "bulk_delete": {
          // payload: { experienceIds: string[] }
          if (payload.experienceIds?.length) {
            await prisma.experience.deleteMany({
              where: { id: { in: payload.experienceIds } },
            });
          }
          break;
        }
        case "shift_dates": {
          // payload: { tripId: string, offsetDays: number }
          if (payload.tripId && typeof payload.offsetDays === "number") {
            const days = await prisma.day.findMany({ where: { tripId: payload.tripId } });
            for (const day of days) {
              const newDate = new Date(day.date);
              newDate.setDate(newDate.getDate() + payload.offsetDays);
              await prisma.day.update({ where: { id: day.id }, data: { date: newDate } });
            }
            // Also shift cities
            const cities = await prisma.city.findMany({ where: { tripId: payload.tripId } });
            for (const city of cities) {
              if (city.arrivalDate && city.departureDate) {
                const newArrival = new Date(city.arrivalDate);
                const newDeparture = new Date(city.departureDate);
                newArrival.setDate(newArrival.getDate() + payload.offsetDays);
                newDeparture.setDate(newDeparture.getDate() + payload.offsetDays);
                await prisma.city.update({
                  where: { id: city.id },
                  data: { arrivalDate: newArrival, departureDate: newDeparture },
                });
              }
            }
            // Update trip dates
            const trip = await prisma.trip.findUnique({ where: { id: payload.tripId } });
            if (trip?.startDate && trip?.endDate) {
              const newStart = new Date(trip.startDate);
              const newEnd = new Date(trip.endDate);
              newStart.setDate(newStart.getDate() + payload.offsetDays);
              newEnd.setDate(newEnd.getDate() + payload.offsetDays);
              await prisma.trip.update({
                where: { id: payload.tripId },
                data: { startDate: newStart, endDate: newEnd },
              });
            }
          }
          break;
        }
        case "bulk_update": {
          // payload: { updates: Array<{ dayId: string, date: string, cityId?: string }> }
          if (payload.updates?.length) {
            for (const u of payload.updates) {
              await prisma.day.update({
                where: { id: u.dayId },
                data: {
                  date: new Date(u.date),
                  ...(u.cityId ? { cityId: u.cityId } : {}),
                },
              });
            }
          }
          break;
        }
        case "rearrange_day": {
          // payload: { dayId: string, experienceOrder: string[] }
          if (payload.dayId && payload.experienceOrder?.length) {
            for (let i = 0; i < payload.experienceOrder.length; i++) {
              await prisma.experience.update({
                where: { id: payload.experienceOrder[i] },
                data: { priorityOrder: i },
              });
            }
          }
          break;
        }
        // Unknown types: status changed but payload not auto-executed
      }
    } catch {
      // Payload execution failed — approval still recorded, planner can handle manually
    }
  }

  res.json(updated);
});

export default router;
