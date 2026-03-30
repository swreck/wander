import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { logChange } from "../services/changeLog.js";

const router = Router();
router.use(requireAuth);

// ── POST /:changeLogId ────────────────────────────────────────
// Restore a deleted entity from its ChangeLog previousState
router.post("/:changeLogId", async (req: AuthRequest, res) => {
  const changeLog = await prisma.changeLog.findUnique({
    where: { id: req.params.changeLogId as string },
  });

  if (!changeLog) {
    res.status(404).json({ error: "Change log entry not found" });
    return;
  }

  if (!changeLog.previousState) {
    res.status(400).json({ error: "No previous state to restore from" });
    return;
  }

  const prev = changeLog.previousState as any;
  let restored: any;

  try {
    switch (changeLog.entityType) {
      case "experience": {
        restored = await prisma.experience.create({
          data: {
            id: prev.id,
            tripId: prev.tripId || prev.trip_id,
            cityId: prev.cityId || prev.city_id,
            name: prev.name,
            description: prev.description || null,
            sourceUrl: prev.sourceUrl || prev.source_url || null,
            sourceText: prev.sourceText || prev.source_text || null,
            locationStatus: prev.locationStatus || prev.location_status || "unlocated",
            latitude: prev.latitude || null,
            longitude: prev.longitude || null,
            placeIdGoogle: prev.placeIdGoogle || prev.place_id_google || null,
            state: prev.state || "possible",
            dayId: prev.dayId || prev.day_id || null,
            routeSegmentId: prev.routeSegmentId || prev.route_segment_id || null,
            timeWindow: prev.timeWindow || prev.time_window || null,
            priorityOrder: prev.priorityOrder ?? prev.priority_order ?? 0,
            themes: prev.themes || [],
            userNotes: prev.userNotes || prev.user_notes || null,
            createdBy: prev.createdBy || prev.created_by || req.user!.displayName,
          },
        });
        break;
      }
      case "reservation": {
        restored = await prisma.reservation.create({
          data: {
            id: prev.id,
            tripId: prev.tripId || prev.trip_id,
            dayId: prev.dayId || prev.day_id,
            name: prev.name,
            type: prev.type || "other",
            datetime: new Date(prev.datetime),
            durationMinutes: prev.durationMinutes || prev.duration_minutes || null,
            latitude: prev.latitude || null,
            longitude: prev.longitude || null,
            confirmationNumber: prev.confirmationNumber || prev.confirmation_number || null,
            notes: prev.notes || null,
          },
        });
        break;
      }
      case "accommodation": {
        restored = await prisma.accommodation.create({
          data: {
            id: prev.id,
            tripId: prev.tripId || prev.trip_id,
            cityId: prev.cityId || prev.city_id,
            dayId: prev.dayId || prev.day_id || null,
            name: prev.name,
            address: prev.address || null,
            latitude: prev.latitude || null,
            longitude: prev.longitude || null,
            checkInTime: prev.checkInTime || prev.check_in_time || null,
            checkOutTime: prev.checkOutTime || prev.check_out_time || null,
            confirmationNumber: prev.confirmationNumber || prev.confirmation_number || null,
            notes: prev.notes || null,
          },
        });
        break;
      }
      case "route_segment": {
        restored = await prisma.routeSegment.create({
          data: {
            id: prev.id,
            tripId: prev.tripId || prev.trip_id,
            originCity: prev.originCity || prev.origin_city,
            destinationCity: prev.destinationCity || prev.destination_city,
            sequenceOrder: prev.sequenceOrder ?? prev.sequence_order ?? 0,
            transportMode: prev.transportMode || prev.transport_mode || "other",
            departureDate: prev.departureDate || prev.departure_date ? new Date(prev.departureDate || prev.departure_date) : null,
            notes: prev.notes || null,
          },
        });
        break;
      }
      case "day": {
        restored = await prisma.day.create({
          data: {
            id: prev.id,
            tripId: prev.tripId || prev.trip_id,
            cityId: prev.cityId || prev.city_id,
            date: new Date(prev.date),
            dayNumber: prev.dayNumber || prev.day_number || null,
            explorationZone: prev.explorationZone || prev.exploration_zone || null,
            notes: prev.notes || null,
          },
        });
        break;
      }
      default:
        res.status(400).json({ error: `Cannot restore entity type: ${changeLog.entityType}` });
        return;
    }

    // Log the restoration
    await logChange({
      user: req.user!,
      tripId: changeLog.tripId,
      actionType: "restored",
      entityType: changeLog.entityType,
      entityId: restored.id,
      entityName: restored.name || changeLog.entityName,
      description: `${req.user!.displayName} restored ${changeLog.entityType} "${changeLog.entityName}"`,
      newState: restored,
    });

    res.json({ restored, entityType: changeLog.entityType });
  } catch (e: any) {
    // ID conflict = entity already exists (double-restore)
    if (e.code === "P2002" || e.message?.includes("Unique constraint")) {
      res.status(409).json({ error: "This item has already been restored" });
      return;
    }
    throw e;
  }
});

export default router;
