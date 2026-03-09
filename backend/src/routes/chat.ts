import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { syncTripDates } from "../services/syncTripDates.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { extractRecommendations } from "../services/itineraryExtractor.js";
import { geocodeExperience, geocodeCity } from "../services/geocoding.js";
import { findDuplicate } from "../services/dedup.js";

const router = Router();
router.use(requireAuth);

const anthropic = new Anthropic();

// Tool definitions for Claude — mirrors what a user can do in the UI
const tools: Anthropic.Tool[] = [
  {
    name: "get_trip_summary",
    description: "Get a summary of the current trip including cities, days, and experience counts",
    input_schema: { type: "object" as const, properties: { tripId: { type: "string" } }, required: ["tripId"] },
  },
  {
    name: "get_day_details",
    description: "Get full details for a specific day including experiences, reservations, and notes",
    input_schema: { type: "object" as const, properties: { dayId: { type: "string" } }, required: ["dayId"] },
  },
  {
    name: "get_city_experiences",
    description: "List all experiences for a city, with their state (selected/possible)",
    input_schema: { type: "object" as const, properties: { tripId: { type: "string" }, cityId: { type: "string" } }, required: ["tripId", "cityId"] },
  },
  {
    name: "add_experience",
    description: "Add a new experience (activity/place) to a city as a candidate",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        cityId: { type: "string" },
        name: { type: "string", description: "Name of the place or activity" },
        description: { type: "string", description: "Optional description" },
        themes: { type: "array", items: { type: "string", enum: ["ceramics", "architecture", "food", "temples", "nature", "other"] } },
      },
      required: ["tripId", "cityId", "name"],
    },
  },
  {
    name: "promote_experience",
    description: "Promote an experience from candidates to the day plan (selected). Requires a dayId to assign it to.",
    input_schema: {
      type: "object" as const,
      properties: {
        experienceId: { type: "string" },
        dayId: { type: "string", description: "The day to assign this experience to" },
        timeWindow: { type: "string", description: "Optional time like 'morning', 'afternoon', '10:00-12:00'" },
      },
      required: ["experienceId", "dayId"],
    },
  },
  {
    name: "demote_experience",
    description: "Move an experience from the day plan back to candidates",
    input_schema: { type: "object" as const, properties: { experienceId: { type: "string" } }, required: ["experienceId"] },
  },
  {
    name: "delete_experience",
    description: "Permanently delete an experience",
    input_schema: { type: "object" as const, properties: { experienceId: { type: "string" } }, required: ["experienceId"] },
  },
  {
    name: "update_day_notes",
    description: "Set notes or exploration zone on a day",
    input_schema: {
      type: "object" as const,
      properties: {
        dayId: { type: "string" },
        notes: { type: "string", description: "Day notes (set to empty string to clear)" },
        explorationZone: { type: "string", description: "Name of the neighborhood/zone to explore" },
      },
      required: ["dayId"],
    },
  },
  {
    name: "add_reservation",
    description: "Add a reservation (restaurant, activity, transport) to a day",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        dayId: { type: "string" },
        name: { type: "string" },
        type: { type: "string", enum: ["restaurant", "activity", "transport", "other"] },
        datetime: { type: "string", description: "ISO datetime string" },
        notes: { type: "string" },
        confirmationNumber: { type: "string" },
      },
      required: ["tripId", "dayId", "name", "type", "datetime"],
    },
  },
  {
    name: "add_city",
    description: "Add a new city to the trip with optional date range",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        name: { type: "string" },
        country: { type: "string" },
        arrivalDate: { type: "string", description: "YYYY-MM-DD format" },
        departureDate: { type: "string", description: "YYYY-MM-DD format" },
      },
      required: ["tripId", "name"],
    },
  },
  {
    name: "update_city_dates",
    description: "Change the arrival/departure dates for a city",
    input_schema: {
      type: "object" as const,
      properties: {
        cityId: { type: "string" },
        arrivalDate: { type: "string", description: "YYYY-MM-DD format" },
        departureDate: { type: "string", description: "YYYY-MM-DD format" },
      },
      required: ["cityId"],
    },
  },
  {
    name: "reassign_day",
    description: "Move a day from one city to another",
    input_schema: {
      type: "object" as const,
      properties: {
        dayId: { type: "string" },
        newCityId: { type: "string" },
      },
      required: ["dayId", "newCityId"],
    },
  },
  {
    name: "reorder_experiences",
    description: "Set the order of experiences (pass all experience IDs in desired order)",
    input_schema: {
      type: "object" as const,
      properties: {
        orderedIds: { type: "array", items: { type: "string" } },
      },
      required: ["orderedIds"],
    },
  },
  {
    name: "search_experiences",
    description: "Search for experiences by name across the trip",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        query: { type: "string" },
      },
      required: ["tripId", "query"],
    },
  },
  {
    name: "get_all_days",
    description: "Get all days for the trip with their cities",
    input_schema: { type: "object" as const, properties: { tripId: { type: "string" } }, required: ["tripId"] },
  },
  {
    name: "update_experience",
    description: "Edit an experience's name, description, or personal notes",
    input_schema: {
      type: "object" as const,
      properties: {
        experienceId: { type: "string" },
        name: { type: "string", description: "New name" },
        description: { type: "string", description: "New description" },
        userNotes: { type: "string", description: "Personal notes about why this was saved" },
      },
      required: ["experienceId"],
    },
  },
  {
    name: "update_trip",
    description: "Edit the trip name or date range",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        name: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD format" },
        endDate: { type: "string", description: "YYYY-MM-DD format" },
      },
      required: ["tripId"],
    },
  },
  {
    name: "delete_city",
    description: "Remove a city from the trip. Experiences are preserved by moving them to another city.",
    input_schema: { type: "object" as const, properties: { cityId: { type: "string" } }, required: ["cityId"] },
  },
  {
    name: "delete_reservation",
    description: "Delete a reservation",
    input_schema: { type: "object" as const, properties: { reservationId: { type: "string" } }, required: ["reservationId"] },
  },
  {
    name: "get_change_log",
    description: "Get recent changes/history for the trip, optionally filtered by search term",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        search: { type: "string", description: "Optional search term to filter changes" },
        limit: { type: "number", description: "Number of entries to return (default 20)" },
      },
      required: ["tripId"],
    },
  },
  {
    name: "update_day_date",
    description: "Change the date of a specific day. Use YYYY-MM-DD format.",
    input_schema: {
      type: "object" as const,
      properties: {
        dayId: { type: "string" },
        date: { type: "string", description: "New date in YYYY-MM-DD format" },
      },
      required: ["dayId", "date"],
    },
  },
  {
    name: "shift_trip_dates",
    description: "Shift ALL dates in the trip (days, city dates, reservations, route segments) by a number of days. Positive = forward, negative = backward. Use this when the user wants to move the whole trip or a block of days earlier or later.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        offsetDays: { type: "number", description: "Number of days to shift. Negative = earlier, positive = later. E.g., -7 moves everything one week earlier." },
      },
      required: ["tripId", "offsetDays"],
    },
  },
  {
    name: "import_recommendations",
    description: "Import a list of travel recommendations (from a friend's email, blog post, or any unstructured text with place suggestions). The AI extracts individual places, categorizes them by location, and adds them to the trip. Use this when the user pastes a block of text that contains travel suggestions, recommendations, or place lists — NOT a structured itinerary with dates.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        text: { type: "string", description: "The raw text containing recommendations" },
        senderLabel: { type: "string", description: "Who sent these recommendations (e.g. 'Larisa', 'Blog post'). Infer from context if possible." },
        country: { type: "string", description: "Country context for the recommendations (e.g. 'Japan'). Infer from trip cities if not stated." },
      },
      required: ["tripId", "text"],
    },
  },
  {
    name: "hide_city",
    description: "Hide a city from the trip view. The city and its experiences are preserved but invisible. Use this when the user wants to dismiss, clear, or archive a recommendation city. Also supports hiding ALL candidate/recommendation cities at once by passing hideAll: true.",
    input_schema: {
      type: "object" as const,
      properties: {
        cityId: { type: "string", description: "The city ID to hide (optional if hideAll is true)" },
        tripId: { type: "string", description: "Required when using hideAll" },
        hideAll: { type: "boolean", description: "If true, hide ALL dateless candidate cities in the trip" },
      },
    },
  },
  {
    name: "restore_city",
    description: "Restore a previously hidden city, making it visible again. Use this when the user asks to bring back a dismissed city or its experiences. Can search by name.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        cityName: { type: "string", description: "Name of the city to restore (fuzzy match)" },
      },
      required: ["tripId", "cityName"],
    },
  },
  {
    name: "list_hidden_cities",
    description: "List all hidden/dismissed cities in the trip. Use this when the user asks what was dismissed, archived, or wants to see what recommendation cities are available to restore.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
      },
      required: ["tripId"],
    },
  },
  {
    name: "move_experience",
    description: "Move an experience from one city to another. Use when the user says something like 'move X to Osaka' or 'that belongs in Kyoto not Tokyo'.",
    input_schema: {
      type: "object" as const,
      properties: {
        experienceId: { type: "string" },
        newCityId: { type: "string", description: "The city to move the experience to" },
      },
      required: ["experienceId", "newCityId"],
    },
  },
  {
    name: "bulk_delete_experiences",
    description: "Delete multiple experiences at once. Use when the user wants to clear all suggestions for a city, delete all items from a source, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        experienceIds: { type: "array", items: { type: "string" }, description: "Array of experience IDs to delete" },
      },
      required: ["experienceIds"],
    },
  },
  {
    name: "update_city",
    description: "Edit a city's name, tagline, or country. Use when the user wants to rename a city or update its description.",
    input_schema: {
      type: "object" as const,
      properties: {
        cityId: { type: "string" },
        name: { type: "string", description: "New city name" },
        tagline: { type: "string", description: "Short tagline or description" },
        country: { type: "string", description: "Country name" },
      },
      required: ["cityId"],
    },
  },
  {
    name: "add_route_segment",
    description: "Add a route segment (intercity travel) to a trip. Use when the user mentions booking a train, flight, ferry, or drive between cities.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        originCity: { type: "string", description: "Name of the departure city" },
        destinationCity: { type: "string", description: "Name of the arrival city" },
        transportMode: { type: "string", enum: ["flight", "train", "ferry", "drive", "other"], description: "Mode of transport" },
        departureDate: { type: "string", description: "YYYY-MM-DD departure date" },
        serviceNumber: { type: "string", description: "Flight number or train service (e.g. NH204, Nozomi 42)" },
        confirmationNumber: { type: "string", description: "Booking reference / confirmation number" },
        departureTime: { type: "string", description: "Departure time HH:MM (24h)" },
        arrivalTime: { type: "string", description: "Arrival time HH:MM (24h)" },
        departureStation: { type: "string", description: "Departure station or airport name" },
        arrivalStation: { type: "string", description: "Arrival station or airport name" },
        seatInfo: { type: "string", description: "Seat assignment" },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["tripId", "originCity", "destinationCity", "transportMode"],
    },
  },
  {
    name: "update_route_segment",
    description: "Update an existing route segment's details. Use when the user wants to change travel logistics like times, confirmation numbers, stations, or transport mode.",
    input_schema: {
      type: "object" as const,
      properties: {
        segmentId: { type: "string", description: "The route segment ID to update" },
        transportMode: { type: "string", enum: ["flight", "train", "ferry", "drive", "other"] },
        departureDate: { type: "string", description: "YYYY-MM-DD departure date" },
        serviceNumber: { type: "string", description: "Flight number or train service" },
        confirmationNumber: { type: "string", description: "Booking reference" },
        departureTime: { type: "string", description: "Departure time HH:MM (24h)" },
        arrivalTime: { type: "string", description: "Arrival time HH:MM (24h)" },
        departureStation: { type: "string", description: "Departure station or airport" },
        arrivalStation: { type: "string", description: "Arrival station or airport" },
        seatInfo: { type: "string", description: "Seat assignment" },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["segmentId"],
    },
  },
  {
    name: "delete_route_segment",
    description: "Delete a route segment (intercity travel leg). Use when the user wants to remove a duplicate or incorrect travel segment between cities.",
    input_schema: {
      type: "object" as const,
      properties: {
        segmentId: { type: "string", description: "The route segment ID to delete" },
      },
      required: ["segmentId"],
    },
  },
  {
    name: "update_reservation",
    description: "Update an existing reservation's details (time, name, notes, confirmation number). Use when the user wants to change a restaurant booking time, update a confirmation number, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        reservationId: { type: "string" },
        name: { type: "string", description: "New name" },
        type: { type: "string", enum: ["restaurant", "activity", "transport", "other"] },
        datetime: { type: "string", description: "New ISO datetime string" },
        notes: { type: "string" },
        confirmationNumber: { type: "string" },
      },
      required: ["reservationId"],
    },
  },
  {
    name: "add_accommodation",
    description: "Add a hotel, ryokan, Airbnb, or other lodging to a city. Use when the user mentions where they're staying.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        cityId: { type: "string" },
        name: { type: "string", description: "Name of the hotel/accommodation" },
        address: { type: "string" },
        checkInTime: { type: "string", description: "Check-in time (e.g. '15:00')" },
        checkOutTime: { type: "string", description: "Check-out time (e.g. '11:00')" },
        confirmationNumber: { type: "string" },
        notes: { type: "string" },
      },
      required: ["tripId", "cityId", "name"],
    },
  },
  {
    name: "update_accommodation",
    description: "Update an existing accommodation's details. Use when the user wants to change hotel info, check-in times, add a confirmation number, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        accommodationId: { type: "string" },
        name: { type: "string" },
        address: { type: "string" },
        checkInTime: { type: "string" },
        checkOutTime: { type: "string" },
        confirmationNumber: { type: "string" },
        notes: { type: "string" },
      },
      required: ["accommodationId"],
    },
  },
  {
    name: "delete_accommodation",
    description: "Delete an accommodation. Use when the user wants to remove a hotel or lodging entry.",
    input_schema: {
      type: "object" as const,
      properties: {
        accommodationId: { type: "string" },
      },
      required: ["accommodationId"],
    },
  },
  {
    name: "create_day",
    description: "Create a new day for a specific date and city. Use when the user wants to add an extra day to a city.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        cityId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD format" },
        notes: { type: "string" },
      },
      required: ["tripId", "cityId", "date"],
    },
  },
  {
    name: "delete_day",
    description: "Delete a day from the trip. Experiences on that day are demoted back to candidates. Use when the user wants to remove a day.",
    input_schema: {
      type: "object" as const,
      properties: {
        dayId: { type: "string" },
      },
      required: ["dayId"],
    },
  },
  {
    name: "reorder_cities",
    description: "Set the order of cities in the trip (pass all city IDs in desired order). Use when the user wants to rearrange their itinerary order.",
    input_schema: {
      type: "object" as const,
      properties: {
        orderedIds: { type: "array", items: { type: "string" }, description: "Array of city IDs in desired order" },
      },
      required: ["orderedIds"],
    },
  },
];

// Execute a tool call and return the result
async function executeTool(
  toolName: string,
  input: any,
  user: { code: string; displayName: string },
): Promise<{ result: any; actionDescription?: string }> {
  switch (toolName) {
    case "get_trip_summary": {
      const trip = await prisma.trip.findUnique({
        where: { id: input.tripId },
        include: {
          cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" }, include: { _count: { select: { experiences: true, days: true } } } },
          routeSegments: { orderBy: { sequenceOrder: "asc" } },
          _count: { select: { days: true, experiences: true } },
        },
      });
      return { result: trip };
    }

    case "get_day_details": {
      const day = await prisma.day.findUnique({
        where: { id: input.dayId },
        include: {
          city: true,
          experiences: { orderBy: { priorityOrder: "asc" }, include: { ratings: true } },
          reservations: { orderBy: { datetime: "asc" } },
          accommodations: true,
        },
      });
      return { result: day };
    }

    case "get_city_experiences": {
      const exps = await prisma.experience.findMany({
        where: { tripId: input.tripId, cityId: input.cityId },
        orderBy: { priorityOrder: "asc" },
        include: { ratings: true, day: true },
      });
      return { result: exps };
    }

    case "add_experience": {
      const exp = await prisma.experience.create({
        data: {
          tripId: input.tripId,
          cityId: input.cityId,
          name: input.name,
          description: input.description || null,
          themes: input.themes || [],
          createdBy: user.code,
          state: "possible",
          locationStatus: "unlocated",
        },
        include: { city: true },
      });
      await logChange({
        user,
        tripId: input.tripId,
        actionType: "experience_created",
        entityType: "experience",
        entityId: exp.id,
        entityName: exp.name,
        description: `${user.displayName} added "${exp.name}" to ${exp.city.name} (via chat)`,
        newState: exp,
      });
      return { result: exp, actionDescription: `Added "${exp.name}" to ${exp.city.name}` };
    }

    case "promote_experience": {
      const existing = await prisma.experience.findUnique({ where: { id: input.experienceId }, include: { city: true } });
      if (!existing) return { result: { error: "Experience not found" } };
      const exp = await prisma.experience.update({
        where: { id: input.experienceId },
        data: { state: "selected", dayId: input.dayId, timeWindow: input.timeWindow || null },
        include: { day: true, city: true },
      });
      await logChange({
        user,
        tripId: existing.tripId,
        actionType: "experience_promoted",
        entityType: "experience",
        entityId: exp.id,
        entityName: exp.name,
        description: `${user.displayName} promoted "${exp.name}" (via chat)`,
        previousState: existing,
        newState: exp,
      });
      return { result: exp, actionDescription: `Promoted "${exp.name}" to ${exp.day?.date.toISOString().split("T")[0]}` };
    }

    case "demote_experience": {
      const existing = await prisma.experience.findUnique({ where: { id: input.experienceId }, include: { city: true } });
      if (!existing) return { result: { error: "Experience not found" } };
      const exp = await prisma.experience.update({
        where: { id: input.experienceId },
        data: { state: "possible", dayId: null, routeSegmentId: null, timeWindow: null, transportModeToHere: null },
        include: { city: true },
      });
      await logChange({
        user,
        tripId: existing.tripId,
        actionType: "experience_demoted",
        entityType: "experience",
        entityId: exp.id,
        entityName: exp.name,
        description: `${user.displayName} demoted "${exp.name}" (via chat)`,
        previousState: existing,
        newState: exp,
      });
      return { result: exp, actionDescription: `Moved "${exp.name}" back to candidates` };
    }

    case "delete_experience": {
      const existing = await prisma.experience.findUnique({ where: { id: input.experienceId }, include: { city: true } });
      if (!existing) return { result: { error: "Experience not found" } };
      await prisma.experience.delete({ where: { id: input.experienceId } });
      await logChange({
        user,
        tripId: existing.tripId,
        actionType: "experience_deleted",
        entityType: "experience",
        entityId: existing.id,
        entityName: existing.name,
        description: `${user.displayName} deleted "${existing.name}" (via chat)`,
        previousState: existing,
      });
      return { result: { deleted: true }, actionDescription: `Deleted "${existing.name}"` };
    }

    case "update_day_notes": {
      const data: any = {};
      if (input.notes !== undefined) data.notes = input.notes || null;
      if (input.explorationZone !== undefined) data.explorationZone = input.explorationZone || null;
      const day = await prisma.day.update({
        where: { id: input.dayId },
        data,
        include: { city: true },
      });
      return { result: day, actionDescription: `Updated notes for ${day.date.toISOString().split("T")[0]}` };
    }

    case "add_reservation": {
      const res = await prisma.reservation.create({
        data: {
          tripId: input.tripId,
          dayId: input.dayId,
          name: input.name,
          type: input.type,
          datetime: new Date(input.datetime),
          notes: input.notes || null,
          confirmationNumber: input.confirmationNumber || null,
        },
        include: { day: true },
      });
      await logChange({
        user,
        tripId: input.tripId,
        actionType: "reservation_created",
        entityType: "reservation",
        entityId: res.id,
        entityName: res.name,
        description: `${user.displayName} added reservation "${res.name}" (via chat)`,
        newState: res,
      });
      return { result: res, actionDescription: `Added reservation "${res.name}"` };
    }

    case "add_city": {
      let order = 0;
      const maxCity = await prisma.city.findFirst({ where: { tripId: input.tripId }, orderBy: { sequenceOrder: "desc" } });
      if (maxCity) order = maxCity.sequenceOrder + 1;

      const city = await prisma.city.create({
        data: {
          tripId: input.tripId,
          name: input.name,
          country: input.country || null,
          sequenceOrder: order,
          arrivalDate: input.arrivalDate ? new Date(input.arrivalDate) : null,
          departureDate: input.departureDate ? new Date(input.departureDate) : null,
        },
      });

      // Auto-create/reassign days if dates provided
      if (input.arrivalDate && input.departureDate) {
        const arrival = new Date(input.arrivalDate);
        const departure = new Date(input.departureDate);
        for (let d = new Date(arrival); d <= departure; d.setDate(d.getDate() + 1)) {
          const dateStart = new Date(d);
          dateStart.setUTCHours(0, 0, 0, 0);
          const dateEnd = new Date(d);
          dateEnd.setUTCHours(23, 59, 59, 999);
          const existing = await prisma.day.findFirst({
            where: { tripId: input.tripId, date: { gte: dateStart, lte: dateEnd } },
          });
          if (existing) {
            const updateData: any = { cityId: city.id };
            if (existing.notes === "Unassigned — add city and activities") updateData.notes = null;
            await prisma.day.update({ where: { id: existing.id }, data: updateData });
            await prisma.experience.updateMany({ where: { dayId: existing.id }, data: { cityId: city.id } });
          } else {
            await prisma.day.create({ data: { tripId: input.tripId, cityId: city.id, date: new Date(d) } });
          }
        }
      }

      await syncTripDates(input.tripId);

      await logChange({
        user,
        tripId: input.tripId,
        actionType: "city_added",
        entityType: "city",
        entityId: city.id,
        entityName: city.name,
        description: `${user.displayName} added city "${city.name}" (via chat)`,
        newState: city,
      });
      return { result: city, actionDescription: `Added city "${city.name}"` };
    }

    case "update_city_dates": {
      const existing = await prisma.city.findUnique({ where: { id: input.cityId } });
      if (!existing) return { result: { error: "City not found" } };
      const data: any = {};
      if (input.arrivalDate !== undefined) data.arrivalDate = input.arrivalDate ? new Date(input.arrivalDate) : null;
      if (input.departureDate !== undefined) data.departureDate = input.departureDate ? new Date(input.departureDate) : null;
      const city = await prisma.city.update({ where: { id: input.cityId }, data });
      await syncTripDates(existing.tripId);
      return { result: city, actionDescription: `Updated dates for "${city.name}"` };
    }

    case "reassign_day": {
      const day = await prisma.day.update({
        where: { id: input.dayId },
        data: { cityId: input.newCityId },
        include: { city: true },
      });
      await prisma.experience.updateMany({ where: { dayId: day.id }, data: { cityId: input.newCityId } });
      await syncTripDates(day.tripId);
      return { result: day, actionDescription: `Reassigned ${day.date.toISOString().split("T")[0]} to ${day.city.name}` };
    }

    case "reorder_experiences": {
      for (let i = 0; i < input.orderedIds.length; i++) {
        await prisma.experience.update({ where: { id: input.orderedIds[i] }, data: { priorityOrder: i } });
      }
      return { result: { reordered: true }, actionDescription: "Reordered experiences" };
    }

    case "search_experiences": {
      const exps = await prisma.experience.findMany({
        where: {
          tripId: input.tripId,
          name: { contains: input.query, mode: "insensitive" },
        },
        include: { city: true, day: true },
      });
      return { result: exps };
    }

    case "get_all_days": {
      const days = await prisma.day.findMany({
        where: { tripId: input.tripId },
        orderBy: { date: "asc" },
        include: { city: true, experiences: { select: { id: true, name: true, state: true } } },
      });
      return { result: days };
    }

    case "update_experience": {
      const existing = await prisma.experience.findUnique({ where: { id: input.experienceId }, include: { city: true } });
      if (!existing) return { result: { error: "Experience not found" } };
      const data: any = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) data.description = input.description || null;
      if (input.userNotes !== undefined) data.userNotes = input.userNotes || null;
      const exp = await prisma.experience.update({
        where: { id: input.experienceId },
        data,
        include: { city: true },
      });
      await logChange({
        user,
        tripId: existing.tripId,
        actionType: "experience_updated",
        entityType: "experience",
        entityId: exp.id,
        entityName: exp.name,
        description: `${user.displayName} edited "${exp.name}" (via chat)`,
        previousState: existing,
        newState: exp,
      });
      return { result: exp, actionDescription: `Updated "${exp.name}"` };
    }

    case "update_trip": {
      const existing = await prisma.trip.findUnique({ where: { id: input.tripId } });
      if (!existing) return { result: { error: "Trip not found" } };
      const data: any = {};
      if (input.name !== undefined) data.name = input.name;
      // Ignore manual startDate/endDate — always derived from days
      const trip = await prisma.trip.update({ where: { id: input.tripId }, data });
      await syncTripDates(input.tripId);
      await logChange({
        user,
        tripId: trip.id,
        actionType: "trip_updated",
        entityType: "trip",
        entityId: trip.id,
        entityName: trip.name,
        description: `${user.displayName} updated trip "${trip.name}" (via chat)`,
        previousState: existing,
        newState: trip,
      });
      return { result: trip, actionDescription: `Updated trip "${trip.name}"` };
    }

    case "delete_city": {
      const existing = await prisma.city.findUnique({ where: { id: input.cityId } });
      if (!existing) return { result: { error: "City not found" } };
      // Move experiences to another city before deleting
      const otherCity = await prisma.city.findFirst({
        where: { tripId: existing.tripId, id: { not: existing.id }, hidden: false },
        orderBy: { sequenceOrder: "asc" },
      });
      if (otherCity) {
        await prisma.experience.updateMany({
          where: { cityId: existing.id, state: "selected" },
          data: { state: "possible", dayId: null, timeWindow: null, routeSegmentId: null },
        });
        await prisma.experience.updateMany({
          where: { cityId: existing.id },
          data: { cityId: otherCity.id },
        });
      }
      await prisma.day.deleteMany({ where: { cityId: existing.id } });
      await prisma.city.delete({ where: { id: existing.id } });
      await syncTripDates(existing.tripId);
      await logChange({
        user,
        tripId: existing.tripId,
        actionType: "city_deleted",
        entityType: "city",
        entityId: existing.id,
        entityName: existing.name,
        description: `${user.displayName} deleted city "${existing.name}" (via chat)`,
        previousState: existing,
      });
      return { result: { deleted: true }, actionDescription: `Deleted city "${existing.name}"` };
    }

    case "delete_reservation": {
      const existing = await prisma.reservation.findUnique({ where: { id: input.reservationId } });
      if (!existing) return { result: { error: "Reservation not found" } };
      await prisma.reservation.delete({ where: { id: input.reservationId } });
      await logChange({
        user,
        tripId: existing.tripId,
        actionType: "reservation_deleted",
        entityType: "reservation",
        entityId: existing.id,
        entityName: existing.name,
        description: `${user.displayName} deleted reservation "${existing.name}" (via chat)`,
        previousState: existing,
      });
      return { result: { deleted: true }, actionDescription: `Deleted reservation "${existing.name}"` };
    }

    case "get_change_log": {
      const where: any = { tripId: input.tripId };
      if (input.search) {
        where.OR = [
          { description: { contains: input.search, mode: "insensitive" } },
          { entityName: { contains: input.search, mode: "insensitive" } },
          { userDisplayName: { contains: input.search, mode: "insensitive" } },
        ];
      }
      const logs = await prisma.changeLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit || 20,
        select: { id: true, description: true, userDisplayName: true, createdAt: true, actionType: true },
      });
      return { result: logs };
    }

    case "update_day_date": {
      const existing = await prisma.day.findUnique({ where: { id: input.dayId } });
      if (!existing) return { result: { error: "Day not found" } };
      const oldDate = existing.date.toISOString().slice(0, 10);
      const day = await prisma.day.update({
        where: { id: input.dayId },
        data: { date: new Date(input.date) },
        include: { city: true },
      });
      await syncTripDates(day.tripId);
      await logChange({
        user,
        tripId: day.tripId,
        actionType: "day_date_changed",
        entityType: "day",
        entityId: day.id,
        entityName: `Day ${input.date}`,
        description: `${user.displayName} moved day from ${oldDate} to ${input.date} (via chat)`,
        previousState: existing,
        newState: day,
      });
      return { result: day, actionDescription: `Moved day from ${oldDate} to ${input.date}` };
    }

    case "shift_trip_dates": {
      if (!input.offsetDays || input.offsetDays === 0) {
        return { result: { error: "offsetDays must be non-zero" } };
      }
      const ms = input.offsetDays * 86400000;

      // Shift all days
      const days = await prisma.day.findMany({ where: { tripId: input.tripId } });
      for (const d of days) {
        await prisma.day.update({
          where: { id: d.id },
          data: { date: new Date(d.date.getTime() + ms) },
        });
      }

      // Shift city arrival/departure dates
      const cities = await prisma.city.findMany({ where: { tripId: input.tripId } });
      for (const c of cities) {
        const data: any = {};
        if (c.arrivalDate) data.arrivalDate = new Date(c.arrivalDate.getTime() + ms);
        if (c.departureDate) data.departureDate = new Date(c.departureDate.getTime() + ms);
        if (Object.keys(data).length > 0) {
          await prisma.city.update({ where: { id: c.id }, data });
        }
      }

      // Shift route segment departure dates
      const segments = await prisma.routeSegment.findMany({ where: { tripId: input.tripId } });
      for (const seg of segments) {
        if (seg.departureDate) {
          await prisma.routeSegment.update({
            where: { id: seg.id },
            data: { departureDate: new Date(seg.departureDate.getTime() + ms) },
          });
        }
      }

      // Shift reservation datetimes
      const reservations = await prisma.reservation.findMany({ where: { tripId: input.tripId } });
      for (const r of reservations) {
        await prisma.reservation.update({
          where: { id: r.id },
          data: { datetime: new Date(r.datetime.getTime() + ms) },
        });
      }

      await syncTripDates(input.tripId);

      const direction = input.offsetDays > 0 ? "forward" : "back";
      const absOffset = Math.abs(input.offsetDays);
      await logChange({
        user,
        tripId: input.tripId,
        actionType: "trip_dates_shifted",
        entityType: "trip",
        entityId: input.tripId,
        entityName: "Trip dates",
        description: `${user.displayName} shifted all dates ${absOffset} day${absOffset !== 1 ? "s" : ""} ${direction} (via chat)`,
      });
      return {
        result: { shifted: days.length, offsetDays: input.offsetDays },
        actionDescription: `Shifted all ${days.length} days ${absOffset} day${absOffset !== 1 ? "s" : ""} ${direction}`,
      };
    }

    case "import_recommendations": {
      const trip = await prisma.trip.findUnique({
        where: { id: input.tripId },
        include: { cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } } },
      });
      if (!trip) return { result: { error: "Trip not found" } };

      // Extract recommendations using AI
      const country = input.country || trip.cities[0]?.country || undefined;
      const extracted = await extractRecommendations(input.text, country);
      const recs = extracted.recommendations;
      if (!recs.length) return { result: { message: "No recommendations found in the text." } };

      // Commit using same logic as import.ts
      const existingCities = trip.cities.map((c) => ({ id: c.id, lower: c.name.toLowerCase() }));
      function findExistingCity(name: string): string | null {
        const lower = name.toLowerCase();
        const exact = existingCities.find((c) => c.lower === lower);
        if (exact) return exact.id;
        if (lower.length >= 4) {
          const contained = existingCities.find(
            (c) => c.lower.includes(lower) || lower.includes(c.lower)
          );
          if (contained) return contained.id;
        }
        return null;
      }

      const newCityMap = new Map<string, string>();
      let maxOrder = Math.max(0, ...trip.cities.map((c) => c.sequenceOrder));
      let ideasCityId: string | null = null;
      const sourceLabel = input.senderLabel ? `${input.senderLabel}'s recommendations` : "Recommendations (via chat)";
      let cat1 = 0, cat2 = 0, cat3 = 0;
      const addedNames: string[] = [];
      const skippedNames: string[] = [];

      const validThemes = new Set(["ceramics", "architecture", "food", "temples", "nature", "other"]);
      const themeMap: Record<string, string> = {
        pottery: "ceramics", onsen: "nature", hiking: "nature", gardens: "nature",
        museums: "architecture", art: "architecture", history: "architecture",
        sake: "food", shopping: "other", culture: "other", trains: "other",
      };

      for (const rec of recs) {
        let cityId: string | null = null;

        if (rec.city) {
          const cityKey = rec.city.toLowerCase();
          cityId = findExistingCity(rec.city);
          if (!cityId) cityId = newCityMap.get(cityKey) || null;

          if (cityId) {
            const isExisting = existingCities.some((c) => c.id === cityId);
            if (isExisting) cat1++;
            else cat2++;
          } else {
            maxOrder++;
            const city = await prisma.city.create({
              data: {
                tripId: input.tripId,
                name: rec.city,
                country: rec.country || null,
                sequenceOrder: maxOrder,
                tagline: rec.region ? `${rec.region} region` : null,
              },
            });
            newCityMap.set(cityKey, city.id);
            cityId = city.id;
            cat2++;
            await geocodeCity(city.id).catch(() => {});
          }
        } else {
          if (!ideasCityId) {
            const existing = findExistingCity("Ideas") || newCityMap.get("ideas");
            if (existing) {
              ideasCityId = existing;
            } else {
              maxOrder++;
              const ideasCity = await prisma.city.create({
                data: {
                  tripId: input.tripId,
                  name: "Ideas",
                  country: trip.cities[0]?.country || rec.country || null,
                  sequenceOrder: maxOrder,
                  tagline: "General trip ideas — no specific location",
                },
              });
              newCityMap.set("ideas", ideasCity.id);
              ideasCityId = ideasCity.id;
            }
          }
          cityId = ideasCityId;
          cat3++;
        }

        const descParts: string[] = [];
        if (rec.description) descParts.push(rec.description);
        if (rec.urls.length > 0) descParts.push(rec.urls.join("\n"));

        const mappedThemes = rec.themes
          .map((t: string) => validThemes.has(t) ? t : (themeMap[t] || "other"))
          .filter((t: string, i: number, arr: string[]) => arr.indexOf(t) === i);

        // Dedup: skip if a fuzzy-matching experience already exists
        const dupName = await findDuplicate(input.tripId, rec.name, cityId!);
        if (dupName) {
          skippedNames.push(rec.name);
          continue;
        }

        await prisma.experience.create({
          data: {
            tripId: input.tripId,
            cityId,
            name: rec.name,
            description: descParts.join("\n\n") || null,
            state: "possible",
            themes: mappedThemes as any,
            createdBy: user.code,
            sourceText: sourceLabel,
            userNotes: rec.accommodationTip ? "Accommodation recommendation" : null,
          },
        });
        addedNames.push(rec.name);
      }

      // Geocode new experiences
      const newExps = await prisma.experience.findMany({
        where: { tripId: input.tripId, sourceText: sourceLabel },
        select: { id: true },
      });
      await Promise.all(newExps.map((e) => geocodeExperience(e.id).catch(() => {})));

      await logChange({
        user,
        tripId: input.tripId,
        actionType: "recommendations_imported",
        entityType: "trip",
        entityId: input.tripId,
        entityName: trip.name,
        description: `${user.displayName} imported ${recs.length} recommendations (${sourceLabel}, via chat)${extracted.senderNotes ? `. Notes: ${extracted.senderNotes}` : ""}`,
      });

      const added = addedNames.length;
      const skipped = skippedNames.length;
      const summary = `Imported ${added} recommendations: ${cat1} to existing cities, ${cat2} to new candidate cities${cat3 > 0 ? `, ${cat3} to Ideas bucket` : ""}${skipped > 0 ? `. Skipped ${skipped} duplicates.` : ""}`;
      return {
        result: { imported: added, skipped, category1: cat1, category2: cat2, category3: cat3, addedNames, skippedNames, senderNotes: extracted.senderNotes },
        actionDescription: summary,
      };
    }

    case "hide_city": {
      if (input.hideAll && input.tripId) {
        // Hide all dateless candidate cities
        const candidates = await prisma.city.findMany({
          where: { tripId: input.tripId, hidden: false, arrivalDate: null },
          select: { id: true, name: true },
        });
        if (candidates.length === 0) return { result: { message: "No candidate cities to hide" } };
        await prisma.city.updateMany({
          where: { id: { in: candidates.map((c) => c.id) } },
          data: { hidden: true },
        });
        const names = candidates.map((c) => c.name);
        await logChange({
          user,
          tripId: input.tripId,
          actionType: "cities_hidden",
          entityType: "trip",
          entityId: input.tripId,
          entityName: `${candidates.length} cities`,
          description: `${user.displayName} dismissed ${candidates.length} recommendation cities: ${names.join(", ")}`,
        });
        return { result: { hidden: names }, actionDescription: `Dismissed ${candidates.length} recommendation cities` };
      }
      if (!input.cityId) return { result: { error: "cityId or hideAll+tripId required" } };
      const city = await prisma.city.findUnique({ where: { id: input.cityId } });
      if (!city) return { result: { error: "City not found" } };
      await prisma.city.update({ where: { id: input.cityId }, data: { hidden: true } });
      await logChange({
        user,
        tripId: city.tripId,
        actionType: "city_hidden",
        entityType: "city",
        entityId: city.id,
        entityName: city.name,
        description: `${user.displayName} dismissed "${city.name}" from the trip view`,
      });
      return { result: { hidden: city.name }, actionDescription: `Dismissed "${city.name}"` };
    }

    case "restore_city": {
      const hidden = await prisma.city.findMany({
        where: { tripId: input.tripId, hidden: true },
        include: { _count: { select: { experiences: true } } },
      });
      const searchLower = input.cityName.toLowerCase();
      const match = hidden.find((c) => c.name.toLowerCase() === searchLower)
        || hidden.find((c) => c.name.toLowerCase().includes(searchLower) || searchLower.includes(c.name.toLowerCase()));
      if (!match) {
        const available = hidden.map((c) => c.name);
        return { result: { error: `No hidden city matching "${input.cityName}". Hidden cities: ${available.join(", ") || "none"}` } };
      }
      await prisma.city.update({ where: { id: match.id }, data: { hidden: false } });
      await logChange({
        user,
        tripId: input.tripId,
        actionType: "city_restored",
        entityType: "city",
        entityId: match.id,
        entityName: match.name,
        description: `${user.displayName} restored "${match.name}" (${match._count.experiences} experiences)`,
      });
      return { result: { restored: match.name, experiences: match._count.experiences }, actionDescription: `Restored "${match.name}" with ${match._count.experiences} experiences` };
    }

    case "list_hidden_cities": {
      const hidden = await prisma.city.findMany({
        where: { tripId: input.tripId, hidden: true },
        include: { _count: { select: { experiences: true } } },
        orderBy: { name: "asc" },
      });
      return {
        result: hidden.map((c) => ({ name: c.name, experiences: c._count.experiences, tagline: c.tagline })),
      };
    }

    case "move_experience": {
      const exp = await prisma.experience.findUnique({ where: { id: input.experienceId }, include: { city: true } });
      if (!exp) return { result: { error: "Experience not found" } };
      const newCity = await prisma.city.findUnique({ where: { id: input.newCityId } });
      if (!newCity) return { result: { error: "City not found" } };

      await prisma.experience.update({
        where: { id: input.experienceId },
        data: { cityId: input.newCityId },
      });

      await logChange({
        user,
        tripId: exp.tripId,
        actionType: "experience_edited",
        entityType: "experience",
        entityId: exp.id,
        entityName: exp.name,
        description: `${user.displayName} moved "${exp.name}" from ${exp.city?.name} to ${newCity.name}`,
      });

      return {
        result: { moved: exp.name, from: exp.city?.name, to: newCity.name },
        actionDescription: `Moved "${exp.name}" to ${newCity.name}`,
      };
    }

    case "bulk_delete_experiences": {
      const ids: string[] = input.experienceIds;
      const exps = await prisma.experience.findMany({ where: { id: { in: ids } } });
      if (exps.length === 0) return { result: { error: "No experiences found" } };

      await prisma.experience.deleteMany({ where: { id: { in: ids } } });

      const tripId = exps[0].tripId;
      await logChange({
        user,
        tripId,
        actionType: "experience_deleted",
        entityType: "experience",
        entityId: ids[0],
        entityName: `${exps.length} experiences`,
        description: `${user.displayName} deleted ${exps.length} experiences: ${exps.map((e) => e.name).join(", ")}`,
      });

      return {
        result: { deleted: exps.length, names: exps.map((e) => e.name) },
        actionDescription: `Deleted ${exps.length} experiences`,
      };
    }

    case "update_city": {
      const city = await prisma.city.findUnique({ where: { id: input.cityId } });
      if (!city) return { result: { error: "City not found" } };

      const updated = await prisma.city.update({
        where: { id: input.cityId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.tagline !== undefined && { tagline: input.tagline || null }),
          ...(input.country !== undefined && { country: input.country }),
        },
      });

      await logChange({
        user,
        tripId: city.tripId,
        actionType: "city_edited",
        entityType: "city",
        entityId: city.id,
        entityName: updated.name,
        description: `${user.displayName} updated city "${city.name}"${input.name && input.name !== city.name ? ` → "${input.name}"` : ""}`,
        previousState: city,
        newState: updated,
      });

      return {
        result: { updated: updated.name, tagline: updated.tagline, country: updated.country },
        actionDescription: `Updated city "${updated.name}"`,
      };
    }

    case "add_route_segment": {
      const existingSegs = await prisma.routeSegment.findMany({ where: { tripId: input.tripId } });
      const segOrder = existingSegs.length > 0
        ? Math.max(...existingSegs.map((s) => s.sequenceOrder)) + 1
        : 0;

      const segment = await prisma.routeSegment.create({
        data: {
          tripId: input.tripId,
          originCity: input.originCity,
          destinationCity: input.destinationCity,
          sequenceOrder: segOrder,
          transportMode: (input.transportMode as any) || "other",
          departureDate: input.departureDate ? new Date(input.departureDate) : null,
          serviceNumber: input.serviceNumber || null,
          confirmationNumber: input.confirmationNumber || null,
          departureTime: input.departureTime || null,
          arrivalTime: input.arrivalTime || null,
          departureStation: input.departureStation || null,
          arrivalStation: input.arrivalStation || null,
          seatInfo: input.seatInfo || null,
          notes: input.notes || null,
        },
      });

      await logChange({
        user,
        tripId: input.tripId,
        actionType: "route_segment_created",
        entityType: "routeSegment",
        entityId: segment.id,
        entityName: `${input.originCity} → ${input.destinationCity}`,
        description: `${user.displayName} added ${input.transportMode} from ${input.originCity} to ${input.destinationCity}`,
        newState: segment,
      });

      return {
        result: segment,
        actionDescription: `Added ${input.transportMode} route: ${input.originCity} → ${input.destinationCity}`,
      };
    }

    case "update_route_segment": {
      const segment = await prisma.routeSegment.findUnique({ where: { id: input.segmentId } });
      if (!segment) return { result: { error: "Route segment not found" } };

      const updated = await prisma.routeSegment.update({
        where: { id: input.segmentId },
        data: {
          ...(input.transportMode !== undefined && { transportMode: input.transportMode as any }),
          ...(input.departureDate !== undefined && { departureDate: input.departureDate ? new Date(input.departureDate) : null }),
          ...(input.serviceNumber !== undefined && { serviceNumber: input.serviceNumber || null }),
          ...(input.confirmationNumber !== undefined && { confirmationNumber: input.confirmationNumber || null }),
          ...(input.departureTime !== undefined && { departureTime: input.departureTime || null }),
          ...(input.arrivalTime !== undefined && { arrivalTime: input.arrivalTime || null }),
          ...(input.departureStation !== undefined && { departureStation: input.departureStation || null }),
          ...(input.arrivalStation !== undefined && { arrivalStation: input.arrivalStation || null }),
          ...(input.seatInfo !== undefined && { seatInfo: input.seatInfo || null }),
          ...(input.notes !== undefined && { notes: input.notes || null }),
        },
      });

      await logChange({
        user,
        tripId: segment.tripId,
        actionType: "route_segment_updated",
        entityType: "routeSegment",
        entityId: segment.id,
        entityName: `${segment.originCity} → ${segment.destinationCity}`,
        description: `${user.displayName} updated ${segment.originCity} → ${segment.destinationCity} travel details`,
        previousState: segment,
        newState: updated,
      });

      return {
        result: updated,
        actionDescription: `Updated travel details for ${segment.originCity} → ${segment.destinationCity}`,
      };
    }

    case "delete_route_segment": {
      const segment = await prisma.routeSegment.findUnique({ where: { id: input.segmentId } });
      if (!segment) return { result: { error: "Route segment not found" } };

      // Demote selected experiences on this segment back to "possible"
      await prisma.experience.updateMany({
        where: { routeSegmentId: segment.id, state: "selected" },
        data: { state: "possible", routeSegmentId: null, timeWindow: null },
      });

      await prisma.routeSegment.delete({ where: { id: segment.id } });

      await logChange({
        user,
        tripId: segment.tripId,
        actionType: "route_segment_deleted",
        entityType: "routeSegment",
        entityId: segment.id,
        entityName: `${segment.originCity} → ${segment.destinationCity}`,
        description: `${user.displayName} removed route ${segment.originCity} → ${segment.destinationCity}`,
        previousState: segment,
      });

      return {
        result: { deleted: true },
        actionDescription: `Deleted route segment ${segment.originCity} → ${segment.destinationCity}`,
      };
    }

    case "update_reservation": {
      const existing = await prisma.reservation.findUnique({ where: { id: input.reservationId } });
      if (!existing) return { result: { error: "Reservation not found" } };

      const data: any = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.type !== undefined) data.type = input.type;
      if (input.datetime !== undefined) data.datetime = new Date(input.datetime);
      if (input.notes !== undefined) data.notes = input.notes || null;
      if (input.confirmationNumber !== undefined) data.confirmationNumber = input.confirmationNumber || null;

      const updated = await prisma.reservation.update({
        where: { id: input.reservationId },
        data,
        include: { day: true },
      });

      await logChange({
        user,
        tripId: updated.tripId,
        actionType: "reservation_edited",
        entityType: "reservation",
        entityId: updated.id,
        entityName: updated.name,
        description: `${user.displayName} updated reservation "${updated.name}"`,
        previousState: existing,
        newState: updated,
      });

      return {
        result: updated,
        actionDescription: `Updated reservation "${updated.name}"`,
      };
    }

    case "add_accommodation": {
      const acc = await prisma.accommodation.create({
        data: {
          tripId: input.tripId,
          cityId: input.cityId,
          name: input.name,
          address: input.address || null,
          checkInTime: input.checkInTime || null,
          checkOutTime: input.checkOutTime || null,
          confirmationNumber: input.confirmationNumber || null,
          notes: input.notes || null,
        },
        include: { city: true },
      });

      await logChange({
        user,
        tripId: input.tripId,
        actionType: "accommodation_added",
        entityType: "accommodation",
        entityId: acc.id,
        entityName: acc.name,
        description: `${user.displayName} added accommodation "${acc.name}" in ${acc.city.name}`,
        newState: acc,
      });

      return {
        result: acc,
        actionDescription: `Added accommodation "${acc.name}" in ${acc.city.name}`,
      };
    }

    case "update_accommodation": {
      const existing = await prisma.accommodation.findUnique({ where: { id: input.accommodationId } });
      if (!existing) return { result: { error: "Accommodation not found" } };

      const data: any = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.address !== undefined) data.address = input.address || null;
      if (input.checkInTime !== undefined) data.checkInTime = input.checkInTime || null;
      if (input.checkOutTime !== undefined) data.checkOutTime = input.checkOutTime || null;
      if (input.confirmationNumber !== undefined) data.confirmationNumber = input.confirmationNumber || null;
      if (input.notes !== undefined) data.notes = input.notes || null;

      const acc = await prisma.accommodation.update({
        where: { id: input.accommodationId },
        data,
        include: { city: true },
      });

      await logChange({
        user,
        tripId: acc.tripId,
        actionType: "accommodation_edited",
        entityType: "accommodation",
        entityId: acc.id,
        entityName: acc.name,
        description: `${user.displayName} updated accommodation "${acc.name}"`,
        previousState: existing,
        newState: acc,
      });

      return {
        result: acc,
        actionDescription: `Updated accommodation "${acc.name}"`,
      };
    }

    case "delete_accommodation": {
      const existing = await prisma.accommodation.findUnique({ where: { id: input.accommodationId }, include: { city: true } });
      if (!existing) return { result: { error: "Accommodation not found" } };

      await prisma.accommodation.delete({ where: { id: input.accommodationId } });

      await logChange({
        user,
        tripId: existing.tripId,
        actionType: "accommodation_deleted",
        entityType: "accommodation",
        entityId: existing.id,
        entityName: existing.name,
        description: `${user.displayName} deleted accommodation "${existing.name}"`,
        previousState: existing,
      });

      return {
        result: { deleted: true },
        actionDescription: `Deleted accommodation "${existing.name}"`,
      };
    }

    case "create_day": {
      const day = await prisma.day.create({
        data: {
          tripId: input.tripId,
          cityId: input.cityId,
          date: new Date(input.date),
          notes: input.notes || null,
        },
        include: { city: true },
      });

      await syncTripDates(input.tripId);

      await logChange({
        user,
        tripId: input.tripId,
        actionType: "day_created",
        entityType: "day",
        entityId: day.id,
        entityName: `Day ${day.date.toISOString().slice(0, 10)}`,
        description: `${user.displayName} added day ${day.date.toISOString().slice(0, 10)}`,
        newState: day,
      });

      return {
        result: day,
        actionDescription: `Created day ${day.date.toISOString().slice(0, 10)} in ${day.city.name}`,
      };
    }

    case "delete_day": {
      const existing = await prisma.day.findUnique({ where: { id: input.dayId }, include: { city: true } });
      if (!existing) return { result: { error: "Day not found" } };

      // Demote selected experiences on this day back to "possible"
      await prisma.experience.updateMany({
        where: { dayId: input.dayId, state: "selected" },
        data: { state: "possible", dayId: null, timeWindow: null },
      });

      await prisma.day.delete({ where: { id: input.dayId } });
      await syncTripDates(existing.tripId);

      await logChange({
        user,
        tripId: existing.tripId,
        actionType: "day_deleted",
        entityType: "day",
        entityId: existing.id,
        entityName: `Day ${existing.date.toISOString().slice(0, 10)}`,
        description: `${user.displayName} removed day ${existing.date.toISOString().slice(0, 10)}`,
        previousState: existing,
      });

      return {
        result: { deleted: true },
        actionDescription: `Deleted day ${existing.date.toISOString().slice(0, 10)} from ${existing.city.name}`,
      };
    }

    case "reorder_cities": {
      if (!Array.isArray(input.orderedIds)) return { result: { error: "orderedIds array required" } };

      for (let i = 0; i < input.orderedIds.length; i++) {
        await prisma.city.update({
          where: { id: input.orderedIds[i] },
          data: { sequenceOrder: i },
        });
      }

      return {
        result: { reordered: true, count: input.orderedIds.length },
        actionDescription: `Reordered ${input.orderedIds.length} cities`,
      };
    }

    default:
      return { result: { error: `Unknown tool: ${toolName}` } };
  }
}

router.post("/", async (req: AuthRequest, res) => {
  try {
    const { message, context, history } = req.body;

    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const user = req.user!;

    // Ensure we have a tripId — fall back to the active trip
    let tripId = context?.tripId;
    if (!tripId) {
      const activeTrip = await prisma.trip.findFirst({ where: { status: "active" }, select: { id: true } });
      if (activeTrip) tripId = activeTrip.id;
    }

    // Fast-path: detect recommendation-like text and import directly
    // (bypasses Haiku chat loop to avoid timeout)
    // Check both current message and recent history for pasted recs
    let recText = message;
    const lines = message.split("\n").filter((l: string) => l.trim().length > 0);
    let looksLikeRecs = lines.length >= 3 && message.length > 200 && tripId;
    if (!looksLikeRecs && tripId && Array.isArray(history)) {
      // Check if user recently pasted recs and is now saying "do it" / "yes"
      const lastUserMsg = [...history].reverse().find((h: any) => h.role === "user");
      if (lastUserMsg) {
        const hLines = lastUserMsg.text.split("\n").filter((l: string) => l.trim().length > 0);
        if (hLines.length >= 5 && lastUserMsg.text.length > 300) {
          const shortFollowUp = message.length < 100;
          if (shortFollowUp) {
            looksLikeRecs = true;
            recText = lastUserMsg.text;
          }
        }
      }
    }
    if (looksLikeRecs) {
      console.log("Chat fast-path: detected recommendation text, importing directly");
      try {
        const { result, actionDescription } = await executeTool(
          "import_recommendations",
          { tripId, text: recText, senderLabel: "Chat paste" },
          user,
        );
        const r = result as any;
        let reply: string;
        if (r.error) {
          reply = `Import failed: ${r.error}`;
        } else if (r.message) {
          reply = r.message;
        } else {
          reply = `Imported ${r.imported} recommendations: ${r.category1} to existing cities, ${r.category2} to new candidate cities${r.category3 > 0 ? `, ${r.category3} to Ideas bucket` : ""}.`;
          if (r.skipped > 0) reply += ` Skipped ${r.skipped} duplicates.`;
          if (r.senderNotes) reply += `\n\nSender notes: ${r.senderNotes}`;
          if (r.addedNames?.length > 0) reply += `\n\nPlaces added: ${r.addedNames.join(", ")}`;
          if (r.skippedNames?.length > 0) reply += `\n\nAlready existed: ${r.skippedNames.join(", ")}`;
        }
        res.json({
          reply,
          actions: actionDescription ? [actionDescription] : [],
          hasActions: !!actionDescription,
        });
        return;
      } catch (err: any) {
        console.error("Chat fast-path import error:", err.message);
        // Fall through to normal chat flow
      }
    }

    // Build system prompt with page context
    const systemPrompt = `You are a helpful travel planning assistant embedded in the Wander app. You can answer questions about the user's trip and perform actions like adding experiences, promoting/demoting them, adding reservations, and managing cities and days.

CURRENT CONTEXT:
- Page: ${context?.page || "unknown"}
- Trip ID: ${tripId || "none"}
${context?.cityId ? `- Viewing city ID: ${context.cityId}` : ""}
${context?.cityName ? `- Viewing city: ${context.cityName}` : ""}
${context?.dayId ? `- Viewing day ID: ${context.dayId}` : ""}
${context?.dayDate ? `- Viewing day: ${context.dayDate}` : ""}

RULES:
1. Be concise and helpful. One or two sentences for simple answers.
2. When performing actions, confirm what you did briefly.
3. If the user asks to add something, do it — don't just explain how.
9. When the user asks to shift, move, or reschedule the trip (e.g., "move everything one week earlier"), use shift_trip_dates with the correct offsetDays. Calculate the offset from their description — e.g., "Oct 18 to Oct 11" = -7 days.
10. When moving a single day's date, use update_day_date.
4. Use the tools to read data before answering questions about trip state.
5. When the user says "add X to Tuesday" or similar, look up the correct day ID first.
6. For date references like "Tuesday" or "day 3", use get_all_days to find the right day.
7. Never fabricate data — always query first.
8. When the user says "move X to Y day", demote first then promote to the new day.
11. NEVER ask the user for a trip ID, city ID, day ID, or any internal identifier. These are always provided in the CURRENT CONTEXT above. If the trip ID shows "none", tell the user no active trip was found.
12. When the user pastes a block of text containing travel recommendations, suggestions, or a list of places to visit (from a friend, email, blog, etc.), use import_recommendations IMMEDIATELY. Do not ask for confirmation first — just do it. Do NOT try to add_experience one by one — the import tool handles extraction, city matching, and categorization automatically. Signs of a recommendation list: multiple place names, regions, personal tips, "you should try", restaurant names, hotel suggestions, etc.
13. After importing recommendations, tell the user how many were imported and where they went (existing cities vs. new candidate cities vs. Ideas bucket). If the sender included general notes, share those too.
14. NEVER ask "shall I proceed?" or "are you ready?" before performing an action. When the user gives you data or instructions, act on them immediately.
15. Cities can be "hidden" (dismissed). When listing trip cities, only show visible ones. When the user asks to bring back, restore, or recall a dismissed city, use restore_city. When asked what was dismissed or archived, use list_hidden_cities.
16. When the user asks to clear, dismiss, or archive recommendation cities, use hide_city with hideAll: true. Individual cities can be hidden with hide_city by cityId.`;

    // Build conversation with history for context
    let messages: Anthropic.MessageParam[] = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const h of history.slice(-10)) {
        if (h.role === "user" || h.role === "assistant") {
          messages.push({ role: h.role, content: h.text });
        }
      }
    }
    // Append tripId hint to the user message so the model can't miss it
    const augmentedMessage = tripId
      ? `${message}\n\n[System: The active trip ID is ${tripId}. Use it for any tool calls. Do not ask the user for it.]`
      : message;
    messages.push({ role: "user", content: augmentedMessage });
    const actions: string[] = [];
    let finalReply = "";

    for (let turn = 0; turn < 8; turn++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages,
      });

      // Collect text parts
      const textParts = response.content.filter((b) => b.type === "text").map((b) => (b as any).text);
      if (textParts.length > 0) {
        finalReply = textParts.join("");
      }

      // If no tool use, we're done
      if (response.stop_reason !== "tool_use") break;

      // Process tool calls
      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        const toolBlock = block as Anthropic.ToolUseBlock;
        console.log(`Chat tool call: ${toolBlock.name}`, JSON.stringify(toolBlock.input).slice(0, 200));
        try {
          const { result, actionDescription } = await executeTool(toolBlock.name, toolBlock.input, user);
          if (actionDescription) actions.push(actionDescription);
          console.log(`Chat tool result: ${toolBlock.name} OK`);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result),
          });
        } catch (toolErr: any) {
          console.error(`Chat tool error: ${toolBlock.name}`, toolErr.message);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: JSON.stringify({ error: toolErr.message }),
            is_error: true,
          });
        }
      }

      // Add assistant response and tool results for next turn
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    }

    res.json({
      reply: finalReply,
      actions,
      hasActions: actions.length > 0,
    });
  } catch (err: any) {
    console.error("Chat error:", err.message, err.stack?.split("\n").slice(0, 3).join("\n"));
    res.status(500).json({ error: "Chat failed" });
  }
});

export default router;
