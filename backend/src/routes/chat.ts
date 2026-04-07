import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { syncTripDates } from "../services/syncTripDates.js";
import { requireAuth, parseAccessCodes, type AuthRequest } from "../middleware/auth.js";
import { extractRecommendations } from "../services/itineraryExtractor.js";
import { geocodeExperience, geocodeCity } from "../services/geocoding.js";
import { findDuplicate } from "../services/dedup.js";
import { enrichExperience } from "../services/capture.js";
import { getCountryAdvisories, getPreTripSummary } from "../services/travelAdvisory.js";

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
    description: "Search for experiences by name, description, or notes across the trip",
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
        transportMode: { type: "string", enum: ["flight", "train", "ferry", "drive", "subway", "bus", "taxi", "shuttle", "walk", "other"], description: "Mode of transport" },
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
        transportMode: { type: "string", enum: ["flight", "train", "ferry", "drive", "subway", "bus", "taxi", "shuttle", "walk", "other"] },
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
  // ── Traveler document tools ──────────────────────────────
  {
    name: "save_travel_document",
    description: "Save a travel document for the current traveler (or another traveler by name). Extracts and stores passport, visa, frequent flyer, insurance, ticket, or custom document details. Creates the traveler profile automatically if needed. Use forTraveler to save for someone else (e.g. Larisa, Kyler).",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        type: { type: "string", enum: ["passport", "visa", "frequent_flyer", "insurance", "ticket", "custom"], description: "Document type" },
        data: {
          type: "object",
          description: "Document fields. Passport: number, country, expiry, nameAsOnPassport. Visa: country, visaType, number, expiry, status. FreqFlyer: airline, program, number. Insurance: provider, policyNumber, emergencyPhone. Ticket: carrier, referenceNumber, route, date. Custom: label, value.",
        },
        isPrivate: { type: "boolean", description: "If true, only visible to this traveler. Default false (shared with group)." },
        label: { type: "string", description: "Optional label for custom documents or to distinguish multiples (e.g. 'Delta SkyMiles')" },
        forTraveler: { type: "string", description: "Display name of the traveler to save for (e.g. 'Larisa', 'Kyler'). Omit to save for yourself." },
      },
      required: ["tripId", "type", "data"],
    },
  },
  {
    name: "save_travel_documents_bulk",
    description: "Save multiple travel documents in one call, optionally for different travelers. Use when the user shares a batch of frequent flyer numbers, passport details, or other documents — especially across multiple people. Each entry specifies the traveler name and document details.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        documents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              forTraveler: { type: "string", description: "Display name of the traveler (e.g. 'Larisa', 'Ken'). If omitted, saves for the current user." },
              type: { type: "string", enum: ["passport", "visa", "frequent_flyer", "insurance", "ticket", "custom"] },
              data: { type: "object", description: "Document fields (same schema as save_travel_document)" },
              isPrivate: { type: "boolean" },
              label: { type: "string", description: "Label to distinguish multiples (e.g. 'Delta SkyMiles')" },
            },
            required: ["type", "data"],
          },
          description: "Array of documents to save",
        },
      },
      required: ["tripId", "documents"],
    },
  },
  {
    name: "update_travel_document",
    description: "Update an existing travel document by ID. Use when the user wants to change or add fields to an existing document.",
    input_schema: {
      type: "object" as const,
      properties: {
        documentId: { type: "string" },
        data: { type: "object", description: "Updated document fields (merged with existing)" },
        isPrivate: { type: "boolean", description: "Update privacy setting" },
        label: { type: "string", description: "Update label" },
      },
      required: ["documentId"],
    },
  },
  {
    name: "get_my_documents",
    description: "Get all travel documents for the current user on this trip (passport, visa, frequent flyer, insurance, tickets, etc.)",
    input_schema: { type: "object" as const, properties: { tripId: { type: "string" } }, required: ["tripId"] },
  },
  {
    name: "get_shared_documents",
    description: "Get all shared (non-private) travel documents from all travelers on this trip. Use when the user asks about another traveler's info.",
    input_schema: { type: "object" as const, properties: { tripId: { type: "string" } }, required: ["tripId"] },
  },
  {
    name: "check_travel_readiness",
    description: "Check travel readiness for the current traveler or all travelers. Analyzes what documents are stored vs. what's likely needed for the trip destinations. Returns a personalized status with specific gaps. Use when user asks 'am I ready?', 'what do I still need?', 'travel readiness', etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        travelerName: { type: "string", description: "Optional: check a specific traveler. If omitted, checks the current user." },
      },
      required: ["tripId"],
    },
  },
  // ── Group interest tools ──────────────────────────────
  {
    name: "float_to_group",
    description: "Flag an experience for group attention. Use when user says 'everyone should see this', 'float this to the group', 'I think we should do this', 'what does everyone think about X?'. One tap, optional note.",
    input_schema: {
      type: "object" as const,
      properties: {
        experienceId: { type: "string" },
        note: { type: "string", description: "Optional note about why they're interested (e.g. 'the ceramics here look incredible')" },
      },
      required: ["experienceId"],
    },
  },
  {
    name: "react_to_interest",
    description: "React to an experience someone floated to the group. Use when user says 'I'm interested in that', 'maybe on Ichiran', 'pass on that one', 'count me in'.",
    input_schema: {
      type: "object" as const,
      properties: {
        interestId: { type: "string", description: "The interest ID (from get_group_interests)" },
        reaction: { type: "string", enum: ["interested", "maybe", "pass"] },
        note: { type: "string", description: "Optional note" },
      },
      required: ["interestId", "reaction"],
    },
  },
  {
    name: "get_group_interests",
    description: "See what experiences have been floated to the group. Use when user asks 'what has everyone flagged?', 'any group suggestions?', 'what does the group think?'.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
      },
      required: ["tripId"],
    },
  },
  // ── Tabelog rating tool ──────────────────────────────
  {
    name: "set_tabelog_rating",
    description: "Record a Tabelog rating for a restaurant experience. Tabelog is Japan's most trusted restaurant rating platform. Use when user shares a Tabelog score, or proactively suggest checking Tabelog for Japanese restaurants. Tabelog scores: 3.0-3.5 = good, 3.5-4.0 = excellent, 4.0+ = exceptional.",
    input_schema: {
      type: "object" as const,
      properties: {
        experienceId: { type: "string" },
        ratingValue: { type: "number", description: "Tabelog rating (typically 1.0-5.0, but most fall between 3.0-4.0)" },
        reviewCount: { type: "number", description: "Number of reviews on Tabelog" },
      },
      required: ["experienceId", "ratingValue"],
    },
  },
  // ── Transit tools ──────────────────────────────
  {
    name: "check_transit_status",
    description: "Check current JR train disruptions/delays relevant to the trip. Use when user asks about train delays, disruptions, or before a travel day.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
      },
      required: ["tripId"],
    },
  },
  {
    name: "search_train_schedules",
    description: "Search for train schedules between two cities/stations in Japan. Returns departure times, platforms, transfers, and duration. Use when user asks about train options, 'when does the next train leave?', or wants to plan a train journey.",
    input_schema: {
      type: "object" as const,
      properties: {
        origin: { type: "string", description: "Origin station or city (e.g. 'Tokyo Station', 'Kyoto')" },
        destination: { type: "string", description: "Destination station or city" },
        date: { type: "string", description: "Travel date YYYY-MM-DD" },
        time: { type: "string", description: "Preferred departure time HH:MM (24h)" },
      },
      required: ["origin", "destination"],
    },
  },
  // ── Trip creation tool ──────────────────────────────
  {
    name: "create_trip",
    description: "Create a new trip. Use when the user says 'plan a trip to...', 'start a new trip', etc. Optionally include cities with dates.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Trip name, e.g. 'Japan 2026'" },
        startDate: { type: "string", description: "YYYY-MM-DD trip start" },
        endDate: { type: "string", description: "YYYY-MM-DD trip end" },
        cities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              country: { type: "string" },
              arrivalDate: { type: "string", description: "YYYY-MM-DD" },
              departureDate: { type: "string", description: "YYYY-MM-DD" },
            },
            required: ["name"],
          },
          description: "Optional list of cities to add to the trip",
        },
      },
      required: ["name"],
    },
  },
  // ── Delete traveler document tool ──────────────────────────────
  {
    name: "delete_travel_document",
    description: "Delete a traveler document by ID. Use when user says 'remove my passport info', 'delete that document', etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        documentId: { type: "string" },
      },
      required: ["documentId"],
    },
  },
  // ── Cultural context tool ──────────────────────────────
  {
    name: "get_cultural_context",
    description: "Get AI-generated cultural tips (etiquette, practical info, timing) for a specific experience. Use when user asks 'what should I know about this place?', 'etiquette at temples?', 'best time to visit?', etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        experienceId: { type: "string" },
      },
      required: ["experienceId"],
    },
  },
  // ── Share day plan tool ──────────────────────────────
  {
    name: "share_day_plan",
    description: "Generate a shareable text summary of a day's plan (schedule, reservations, hotel). Use when user says 'share today's plan', 'send me the itinerary for Tuesday', 'text me the plan'.",
    input_schema: {
      type: "object" as const,
      properties: {
        dayId: { type: "string" },
      },
      required: ["dayId"],
    },
  },
  // ── Travel time tool ──────────────────────────────
  {
    name: "get_travel_time",
    description: "Get estimated travel time between two locations. Use when user asks 'how long to walk to...', 'how far is it to...', etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        originName: { type: "string", description: "Name of origin (for display)" },
        destName: { type: "string", description: "Name of destination (for display)" },
        originLat: { type: "number" },
        originLng: { type: "number" },
        destLat: { type: "number" },
        destLng: { type: "number" },
        mode: { type: "string", enum: ["walk", "subway", "train", "bus", "taxi"], description: "Travel mode (default: walk)" },
      },
      required: ["originLat", "originLng", "destLat", "destLng"],
    },
  },
  // ── Get ratings tool ──────────────────────────────
  {
    name: "get_ratings",
    description: "Get all ratings (Google, Yelp, Tabelog, Foursquare) for an experience. Use when user asks 'what are the ratings?', 'is this place good?', 'how is it reviewed?'.",
    input_schema: {
      type: "object" as const,
      properties: {
        experienceId: { type: "string" },
      },
      required: ["experienceId"],
    },
  },
  // ── Place lookup tool ──────────────────────────────
  {
    name: "lookup_place",
    description: "Look up a real-world place and get its photo, rating, address, and details from Google. Use when user asks about a specific place, wants to see what it looks like, or is deciding whether to visit. Returns a rich card with photo. Also use when the user asks 'show me X', 'what does X look like', 'tell me about X restaurant/temple/etc'.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Place name and optional location (e.g. 'Fushimi Inari Kyoto', 'Café Kitsune Tokyo')" },
        location: { type: "string", description: "Optional lat,lng to bias results (e.g. '35.0116,135.7681' for Kyoto)" },
      },
      required: ["query"],
    },
  },
  // ── Web search tool ──────────────────────────────
  {
    name: "web_search",
    description: "Search the web for current, real-time information. Use when the user asks about something NOT in the trip data: restaurant recommendations, opening hours, travel tips, crowd levels, weather, current events, 'is X worth visiting', 'best Y near Z', etc. Do NOT use for questions answerable from trip data (use other tools instead).",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query (e.g. 'best ramen near Shinjuku', 'Fushimi Inari crowded October')" },
      },
      required: ["query"],
    },
  },
  // ── Phrase tools ──────────────────────────────
  {
    name: "add_phrase",
    description: "Add a Japanese phrase to the shared trip phrase card. Use when user says 'add a phrase', 'how do you say X in Japanese', 'I need to know how to say...'. Always provide both the English meaning and the romaji (Latin-alphabet) pronunciation. NEVER include Japanese characters — romaji only.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        english: { type: "string", description: "English meaning (e.g. 'Where is the station?')" },
        romaji: { type: "string", description: "Romaji pronunciation (e.g. 'Eki wa doko desu ka?'). NO Japanese characters." },
      },
      required: ["tripId", "english", "romaji"],
    },
  },
  // ── Bulk day operations ──────────────────────────────
  {
    name: "bulk_update_days",
    description: "Update multiple day dates and/or create new days in one operation. Use this when restructuring an itinerary, shifting dates, or aligning days to city date ranges. Much more efficient than calling update_day_date many times.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string", description: "Trip ID" },
        updates: {
          type: "array",
          description: "Days to update (change their date)",
          items: {
            type: "object",
            properties: {
              dayId: { type: "string" },
              newDate: { type: "string", description: "YYYY-MM-DD" },
            },
            required: ["dayId", "newDate"],
          },
        },
        creates: {
          type: "array",
          description: "New days to create",
          items: {
            type: "object",
            properties: {
              cityId: { type: "string" },
              date: { type: "string", description: "YYYY-MM-DD" },
            },
            required: ["cityId", "date"],
          },
        },
        deletes: {
          type: "array",
          description: "Day IDs to delete (experiences will be demoted to possible)",
          items: { type: "string" },
        },
      },
      required: ["tripId"],
    },
  },
  // ── Decision tools ─────────────────────────────────
  {
    name: "create_decision",
    description: "Start a group decision. Use when someone says 'let's decide', 'help us pick', 'we need to choose between'. Creates an open decision that others can vote on.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        cityId: { type: "string", description: "City this decision relates to" },
        title: { type: "string", description: "The question, e.g. 'Where should we eat in Kyoto?'" },
        options: {
          type: "array",
          description: "Optional initial options (experience names). Will be created as new experiences in voting state.",
          items: { type: "string" },
        },
      },
      required: ["tripId", "cityId", "title"],
    },
  },
  {
    name: "add_decision_option",
    description: "Add an option to an existing open decision. Can link an existing experience or create a new one.",
    input_schema: {
      type: "object" as const,
      properties: {
        decisionId: { type: "string" },
        experienceId: { type: "string", description: "Link an existing experience as an option" },
        name: { type: "string", description: "Or create a new experience with this name" },
        description: { type: "string", description: "Description for new experience (optional)" },
      },
      required: ["decisionId"],
    },
  },
  {
    name: "cast_decision_vote",
    description: "Cast a vote on an open decision. Set optionId to null for 'happy with any'.",
    input_schema: {
      type: "object" as const,
      properties: {
        decisionId: { type: "string" },
        optionId: { type: "string", description: "Experience ID to vote for, or null for 'happy with any'" },
      },
      required: ["decisionId"],
    },
  },
  {
    name: "resolve_decision",
    description: "Resolve a decision. Winners move to planned (selected), others to maybe (possible).",
    input_schema: {
      type: "object" as const,
      properties: {
        decisionId: { type: "string" },
        winnerIds: {
          type: "array",
          description: "Experience IDs that won. Can be multiple.",
          items: { type: "string" },
        },
      },
      required: ["decisionId", "winnerIds"],
    },
  },
  {
    name: "get_open_decisions",
    description: "Get all open decisions for the trip. Shows options and current votes.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
      },
      required: ["tripId"],
    },
  },
  {
    name: "create_day_choice",
    description: "Create a day-level choice when some people might want to do one thing while others do another. Creates a Decision tied to a specific day with experience options.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        cityId: { type: "string" },
        dayId: { type: "string", description: "The day this choice applies to" },
        title: { type: "string", description: "Short label, e.g. 'Afternoon choice'" },
        options: {
          type: "array",
          description: "The activity options to choose between",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
            },
            required: ["name"],
          },
        },
      },
      required: ["tripId", "cityId", "dayId", "title", "options"],
    },
  },
  {
    name: "get_contributions_by_traveler",
    description: "Show all activities added by a specific traveler, grouped by city. Use when someone asks 'What has [name] added?' or 'Show me [name]'s contributions'.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        travelerName: { type: "string", description: "The display name or code of the traveler" },
      },
      required: ["tripId", "travelerName"],
    },
  },
  // ── Learnings tools ──────────────────────────────
  {
    name: "save_learning",
    description: "Save a learning or tip for future trips. Use when someone says 'remember for next time', 'note for the future', 'lesson learned', etc. Ask whether it's for all future trips or just this one.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string", description: "Current trip ID (null for general learnings)" },
        content: { type: "string", description: "The learning content" },
        scope: { type: "string", enum: ["general", "trip_specific"], description: "general = all future trips, trip_specific = just this trip" },
        experienceId: { type: "string", description: "Optional: link to a specific experience" },
      },
      required: ["content", "scope"],
    },
  },
  {
    name: "get_learnings",
    description: "Get saved learnings/tips. Returns both general and trip-specific learnings.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string", description: "Optional: filter to a specific trip's learnings (also includes general)" },
      },
      required: [],
    },
  },
  {
    name: "update_learning",
    description: "Update the content of a saved learning.",
    input_schema: {
      type: "object" as const,
      properties: {
        learningId: { type: "string" },
        content: { type: "string" },
      },
      required: ["learningId", "content"],
    },
  },
  {
    name: "delete_learning",
    description: "Delete a saved learning.",
    input_schema: {
      type: "object" as const,
      properties: {
        learningId: { type: "string" },
      },
      required: ["learningId"],
    },
  },
  // ── Approval tools ──────────────────────────────
  {
    name: "get_pending_approvals",
    description: "Get pending approval requests for a trip. Planners see all; travelers see their own.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
      },
      required: ["tripId"],
    },
  },
  {
    name: "review_approval",
    description: "Approve or reject a pending approval request. Planner only.",
    input_schema: {
      type: "object" as const,
      properties: {
        approvalId: { type: "string" },
        status: { type: "string", enum: ["approved", "rejected"] },
        note: { type: "string", description: "Optional note to the requester" },
      },
      required: ["approvalId", "status"],
    },
  },
  // ── Member management tools ──────────────────────
  {
    name: "add_trip_members",
    description: "Add new members to the trip. Generates personal invite links for each person. Planner only.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        names: { type: "array", items: { type: "string" }, description: "Names of people to invite" },
      },
      required: ["tripId", "names"],
    },
  },
  {
    name: "change_member_role",
    description: "Change a trip member's role between planner and traveler. Planner only.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        travelerName: { type: "string", description: "Display name of the traveler" },
        role: { type: "string", enum: ["planner", "traveler"] },
      },
      required: ["tripId", "travelerName", "role"],
    },
  },
  // ── Dateless trip tool ──────────────────────────────
  {
    name: "set_trip_anchor",
    description: "Set the anchor date for a dateless trip. 'Day 1 is December 25' → all days get real dates. Use when someone says 'Day 1 is [date]' or 'we start on [date]'.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        anchorDate: { type: "string", description: "The date for Day 1, ISO format (YYYY-MM-DD)" },
      },
      required: ["tripId", "anchorDate"],
    },
  },
  // ── Missing parity tools ──────────────────────────────
  {
    name: "activate_trip",
    description: "Switch to a different trip. Use when someone says 'switch to Vietnam trip', 'work on the other trip', or 'go to [trip name]'.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string", description: "ID of the trip to activate" },
      },
      required: ["tripId"],
    },
  },
  {
    name: "delete_decision",
    description: "Cancel/clear a group decision. Use when someone says 'cancel that vote', 'close this decision', or 'never mind about that choice'.",
    input_schema: {
      type: "object" as const,
      properties: {
        decisionId: { type: "string" },
      },
      required: ["decisionId"],
    },
  },
  {
    name: "retract_interest",
    description: "Take back a floated experience interest. Use when someone says 'take that back', 'un-flag that', or 'remove my interest'.",
    input_schema: {
      type: "object" as const,
      properties: {
        interestId: { type: "string" },
      },
      required: ["interestId"],
    },
  },
  {
    name: "restore_entity",
    description: "Bring back something that was deleted (experience, reservation, accommodation, day). Use when someone says 'undo that delete', 'bring that back', 'restore [name]'. Requires the changeLogId from get_change_log.",
    input_schema: {
      type: "object" as const,
      properties: {
        changeLogId: { type: "string", description: "The change log entry ID for the deletion to undo" },
      },
      required: ["changeLogId"],
    },
  },
  {
    name: "resend_invite",
    description: "Regenerate a personal invite link for a trip member who lost access. Old link stops working. Planner only.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        memberName: { type: "string", description: "Name of the person who needs a new link" },
      },
      required: ["tripId", "memberName"],
    },
  },
  // ── Travel advisory tool ──────────────────────────────
  {
    name: "get_travel_advisories",
    description: "Get visa requirements, CDC vaccine recommendations, health/safety tips, connectivity info, and currency details for trip destination countries. Use when someone asks about visas, vaccines, shots, health precautions, travel requirements, SIM cards, currency, or 'what do I need for this trip?'. Also use proactively when discussing a new destination country.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        countries: { type: "array", items: { type: "string" }, description: "Country names to look up. If omitted, derives from trip cities." },
      },
      required: ["tripId"],
    },
  },
];

// Execute a tool call and return the result
async function executeTool(
  toolName: string,
  input: any,
  user: { code: string; displayName: string },
): Promise<{ result: any; actionDescription?: string; placeCards?: any[] }> {
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
        for (let d = new Date(arrival); d <= departure; d.setUTCDate(d.getUTCDate() + 1)) {
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

      // Geocode the city so it appears on the map
      geocodeCity(city.id).catch(() => {});

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
          OR: [
            { name: { contains: input.query, mode: "insensitive" } },
            { description: { contains: input.query, mode: "insensitive" } },
            { userNotes: { contains: input.query, mode: "insensitive" } },
          ],
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

    // ── Traveler document tool implementations ─────────────
    case "save_travel_document": {
      let targetCode = user.code;
      let targetName = user.displayName;

      if (input.forTraveler) {
        const codes = parseAccessCodes();
        const match = [...codes.entries()].find(
          ([, name]) => name.toLowerCase() === input.forTraveler.toLowerCase()
        );
        if (!match) {
          return { result: { error: `Unknown traveler "${input.forTraveler}". Known travelers: ${[...codes.values()].join(", ")}` } };
        }
        [targetCode, targetName] = match;
      }

      const profile = await prisma.travelerProfile.upsert({
        where: { tripId_userCode: { tripId: input.tripId, userCode: targetCode } },
        update: { displayName: targetName },
        create: { tripId: input.tripId, userCode: targetCode, displayName: targetName },
      });

      const doc = await prisma.travelerDocument.create({
        data: {
          profileId: profile.id,
          type: input.type,
          label: input.label || null,
          data: input.data || {},
          isPrivate: input.isPrivate ?? false,
        },
      });

      await logChange({
        user,
        tripId: input.tripId,
        actionType: "document_added",
        entityType: "traveler_document",
        entityId: doc.id,
        entityName: `${input.type}${input.label ? ` (${input.label})` : ""}`,
        description: `${user.displayName} added a ${(input.type || "travel").replace("_", " ")} document for ${targetName}`,
        newState: doc,
      });

      return {
        result: { saved: true, documentId: doc.id, type: input.type, data: input.data, forTraveler: targetName },
        actionDescription: `Saved ${(input.type || "travel").replace("_", " ")} for ${targetName}`,
      };
    }

    case "save_travel_documents_bulk": {
      const codes = parseAccessCodes();
      const results: { traveler: string; type: string; label?: string; saved: boolean; error?: string }[] = [];

      for (const entry of input.documents) {
        let targetCode = user.code;
        let targetName = user.displayName;

        if (entry.forTraveler) {
          const match = [...codes.entries()].find(
            ([, name]) => name.toLowerCase() === entry.forTraveler.toLowerCase()
          );
          if (!match) {
            results.push({ traveler: entry.forTraveler, type: entry.type, saved: false, error: "Unknown traveler" });
            continue;
          }
          [targetCode, targetName] = match;
        }

        try {
          const profile = await prisma.travelerProfile.upsert({
            where: { tripId_userCode: { tripId: input.tripId, userCode: targetCode } },
            update: { displayName: targetName },
            create: { tripId: input.tripId, userCode: targetCode, displayName: targetName },
          });

          const doc = await prisma.travelerDocument.create({
            data: {
              profileId: profile.id,
              type: entry.type,
              label: entry.label || null,
              data: entry.data || {},
              isPrivate: entry.isPrivate ?? false,
            },
          });

          await logChange({
            user,
            tripId: input.tripId,
            actionType: "document_added",
            entityType: "traveler_document",
            entityId: doc.id,
            entityName: `${entry.type}${entry.label ? ` (${entry.label})` : ""}`,
            description: `${user.displayName} added a ${(entry.type || "travel").replace("_", " ")} document for ${targetName}`,
            newState: doc,
          });

          results.push({ traveler: targetName, type: entry.type, label: entry.label, saved: true });
        } catch {
          results.push({ traveler: targetName, type: entry.type, saved: false, error: "Save failed" });
        }
      }

      const saved = results.filter((r) => r.saved).length;
      const failed = results.filter((r) => !r.saved).length;
      return {
        result: { saved, failed, details: results },
        actionDescription: `Saved ${saved} travel document${saved !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed)` : ""}`,
      };
    }

    case "update_travel_document": {
      const existingDoc = await prisma.travelerDocument.findUnique({
        where: { id: input.documentId },
        include: { profile: true },
      });
      if (!existingDoc) return { result: { error: "Document not found" } };
      if (existingDoc.profile.userCode !== user.code) return { result: { error: "You can only edit your own documents" } };

      // Merge new data fields with existing data
      const mergedData = input.data ? { ...(existingDoc.data as any), ...input.data } : undefined;

      const updated = await prisma.travelerDocument.update({
        where: { id: input.documentId },
        data: {
          ...(mergedData ? { data: mergedData } : {}),
          ...(input.isPrivate !== undefined ? { isPrivate: input.isPrivate } : {}),
          ...(input.label !== undefined ? { label: input.label } : {}),
        },
      });

      await logChange({
        user,
        tripId: existingDoc.profile.tripId,
        actionType: "document_updated",
        entityType: "traveler_document",
        entityId: updated.id,
        entityName: `${updated.type}${updated.label ? ` (${updated.label})` : ""}`,
        description: `${user.displayName} updated a ${(updated.type || "travel").replace("_", " ")} document`,
        previousState: existingDoc,
        newState: updated,
      });

      return {
        result: { updated: true, documentId: updated.id, type: updated.type, data: updated.data },
        actionDescription: `Updated ${(updated.type || "travel").replace("_", " ")} for ${user.displayName}`,
      };
    }

    case "get_my_documents": {
      const myProfile = await prisma.travelerProfile.findUnique({
        where: { tripId_userCode: { tripId: input.tripId, userCode: user.code } },
        include: { documents: { orderBy: { createdAt: "asc" } } },
      });
      return { result: myProfile?.documents || [] };
    }

    case "get_shared_documents": {
      const allProfiles = await prisma.travelerProfile.findMany({
        where: { tripId: input.tripId },
        include: { documents: { orderBy: { createdAt: "asc" } } },
      });
      // Filter: show all own docs, only non-private from others
      const shared = allProfiles.map((p) => ({
        traveler: p.displayName,
        documents: p.documents.filter(
          (d) => p.userCode === user.code || !d.isPrivate,
        ).map((d) => ({ id: d.id, type: d.type, label: d.label, data: d.data, isPrivate: d.isPrivate })),
      }));
      return { result: shared };
    }

    case "check_travel_readiness": {
      const trip = await prisma.trip.findUnique({
        where: { id: input.tripId },
        include: {
          cities: { where: { hidden: false }, orderBy: { sequenceOrder: "asc" } },
          travelerProfiles: { include: { documents: true } },
        },
      });
      if (!trip) return { result: { error: "Trip not found" } };

      const countries = [...new Set(trip.cities.map((c) => c.country).filter(Boolean))];
      const profilesToCheck = input.travelerName
        ? trip.travelerProfiles.filter((p) => p.displayName.toLowerCase() === input.travelerName.toLowerCase())
        : trip.travelerProfiles.filter((p) => p.userCode === user.code);

      // If no profile exists yet for the user, report everything as missing
      if (profilesToCheck.length === 0) {
        return {
          result: {
            tripName: trip.name,
            startDate: trip.startDate,
            endDate: trip.endDate,
            destinationCountries: countries,
            travelers: [{
              displayName: input.travelerName || user.displayName,
              hasPassport: false,
              passportExpiry: null,
              hasInsurance: false,
              visaCountries: [],
              frequentFlyerCount: 0,
              documentCount: 0,
              gaps: ["No travel documents stored yet. Start by adding your passport details."],
            }],
          },
        };
      }

      const readiness = profilesToCheck.map((p) => {
        // Filter out private documents when viewing another traveler's readiness
        const docs = p.userCode === user.code ? p.documents : p.documents.filter((d) => !d.isPrivate);
        const passportDoc = docs.find((d) => d.type === "passport");
        const hasPassport = !!passportDoc;
        const passportExpiry = passportDoc ? (passportDoc.data as any)?.expiry : null;
        const hasInsurance = docs.some((d) => d.type === "insurance");
        const visaCountries = docs
          .filter((d) => d.type === "visa")
          .map((d) => (d.data as any)?.country)
          .filter(Boolean);
        const frequentFlyers = docs.filter((d) => d.type === "frequent_flyer");

        const gaps: string[] = [];
        if (!hasPassport) gaps.push("No passport on file.");
        if (passportExpiry) {
          const expDate = new Date(passportExpiry);
          const tripEnd = trip.endDate ? new Date(trip.endDate) : null;
          if (tripEnd) {
            const sixMonthsAfter = new Date(tripEnd);
            sixMonthsAfter.setMonth(sixMonthsAfter.getMonth() + 6);
            if (expDate < sixMonthsAfter) {
              gaps.push(`Passport expires ${passportExpiry} — some countries require 6 months validity past your trip end date (${tripEnd.toISOString().split("T")[0]}).`);
            }
          }
        }
        if (!hasInsurance) gaps.push("No travel insurance on file.");
        if (frequentFlyers.length === 0) gaps.push("No frequent flyer numbers stored.");

        return {
          displayName: p.displayName,
          hasPassport,
          passportExpiry,
          hasInsurance,
          visaCountries,
          frequentFlyerCount: frequentFlyers.length,
          documentCount: docs.length,
          gaps,
        };
      });

      return {
        result: {
          tripName: trip.name,
          startDate: trip.startDate,
          endDate: trip.endDate,
          destinationCountries: countries,
          travelers: readiness,
        },
      };
    }

    // ── Voting tool implementations ─────────────
    // ── Group interest tools ─────────────
    case "float_to_group": {
      const exp = await prisma.experience.findUnique({ where: { id: input.experienceId }, include: { city: true } });
      if (!exp) return { result: { error: "Experience not found" } };

      const interest = await prisma.experienceInterest.upsert({
        where: { experienceId_userCode: { experienceId: input.experienceId, userCode: user.code } },
        create: {
          experienceId: input.experienceId,
          tripId: exp.tripId,
          userCode: user.code,
          displayName: user.displayName,
          note: input.note || null,
        },
        update: { note: input.note || null, displayName: user.displayName },
      });
      await logChange({
        user,
        tripId: exp.tripId,
        actionType: "experience_floated",
        entityType: "experience",
        entityId: exp.id,
        entityName: exp.name,
        description: `${user.displayName} flagged "${exp.name}" for the group`,
      });
      return {
        result: { interestId: interest.id, experience: exp.name, city: exp.city.name },
        actionDescription: `Flagged "${exp.name}" for the group`,
      };
    }

    case "react_to_interest": {
      const interest = await prisma.experienceInterest.findUnique({
        where: { id: input.interestId },
        include: { experience: true },
      });
      if (!interest) return { result: { error: "Interest not found" } };

      await prisma.interestReaction.upsert({
        where: { interestId_userCode: { interestId: input.interestId, userCode: user.code } },
        create: {
          interestId: input.interestId,
          userCode: user.code,
          displayName: user.displayName,
          reaction: input.reaction,
          note: input.note || null,
        },
        update: { reaction: input.reaction, note: input.note || null, displayName: user.displayName },
      });
      await logChange({
        user,
        tripId: interest.tripId,
        actionType: "interest_reacted",
        entityType: "experience",
        entityId: interest.experienceId,
        entityName: interest.experience.name,
        description: `${user.displayName} is ${input.reaction} in "${interest.experience.name}"`,
      });
      return {
        result: { reacted: true, experience: interest.experience.name, reaction: input.reaction },
        actionDescription: `Reacted "${input.reaction}" to "${interest.experience.name}"`,
      };
    }

    case "get_group_interests": {
      const interests = await prisma.experienceInterest.findMany({
        where: { tripId: input.tripId },
        include: {
          reactions: true,
          experience: { select: { name: true, cityId: true, dayId: true, state: true, city: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      });
      return {
        result: interests.map((i) => ({
          id: i.id,
          experience: i.experience.name,
          city: i.experience.city.name,
          floatedBy: i.displayName,
          note: i.note,
          reactions: i.reactions.map((r) => ({ who: r.displayName, reaction: r.reaction, note: r.note })),
        })),
      };
    }

    // ── Tabelog rating ─────────────
    case "set_tabelog_rating": {
      const exp = await prisma.experience.findUnique({ where: { id: input.experienceId }, include: { city: true } });
      if (!exp) return { result: { error: "Experience not found" } };

      await prisma.experienceRating.upsert({
        where: {
          experienceId_platform: { experienceId: input.experienceId, platform: "tabelog" },
        },
        create: {
          experienceId: input.experienceId,
          platform: "tabelog",
          ratingValue: input.ratingValue,
          reviewCount: input.reviewCount || 0,
        },
        update: {
          ratingValue: input.ratingValue,
          reviewCount: input.reviewCount || 0,
          lastRefreshedAt: new Date(),
        },
      });

      return {
        result: { saved: true, experience: exp.name, tabelog: input.ratingValue },
        actionDescription: `Set Tabelog rating ${input.ratingValue} for "${exp.name}"`,
      };
    }

    // ── Transit tools ─────────────
    case "check_transit_status": {
      const trip = await prisma.trip.findUnique({
        where: { id: input.tripId },
        include: { routeSegments: { orderBy: { sequenceOrder: "asc" } } },
      });
      if (!trip) return { result: { error: "Trip not found" } };

      try {
        const statusRes = await fetch(`http://localhost:${process.env.PORT || 3001}/api/transit-status/trip/${input.tripId}`, {
          headers: { Authorization: `Bearer internal` },
        });
        // Direct Prisma call instead of internal fetch
      } catch { /* ignore */ }

      // Simplified: return segment info for the AI to contextualize
      const trainSegments = trip.routeSegments.filter((s) => s.transportMode === "train");
      return {
        result: {
          message: trainSegments.length > 0
            ? `You have ${trainSegments.length} train segments. Check https://traininfo.jreast.co.jp/train_info/e/ for live status.`
            : "No train segments in your itinerary.",
          segments: trainSegments.map((s) => ({
            route: `${s.originCity} → ${s.destinationCity}`,
            date: s.departureDate,
            service: s.serviceNumber,
            time: s.departureTime,
          })),
        },
      };
    }

    case "search_train_schedules": {
      const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
      if (!API_KEY) return { result: { error: "Google Maps API not configured" } };

      let departureTime: number | undefined;
      if (input.date && input.time) {
        const dt = new Date(`${input.date}T${input.time}:00+09:00`);
        departureTime = Math.floor(dt.getTime() / 1000);
      } else if (input.date) {
        const dt = new Date(`${input.date}T08:00:00+09:00`);
        departureTime = Math.floor(dt.getTime() / 1000);
      }

      const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
      url.searchParams.set("origin", input.origin);
      url.searchParams.set("destination", input.destination);
      url.searchParams.set("mode", "transit");
      url.searchParams.set("transit_mode", "rail");
      url.searchParams.set("alternatives", "true");
      url.searchParams.set("language", "en");
      url.searchParams.set("region", "jp");
      if (departureTime) url.searchParams.set("departure_time", String(departureTime));
      url.searchParams.set("key", API_KEY);

      try {
        const response = await fetch(url.toString());
        const data = await response.json();
        if (data.status !== "OK" || !data.routes?.length) {
          return { result: { message: "No transit routes found. Try different station names or times." } };
        }

        const routes = data.routes.slice(0, 3).map((route: any) => {
          const leg = route.legs[0];
          const steps = leg.steps
            .filter((s: any) => s.travel_mode === "TRANSIT")
            .map((s: any) => ({
              departure: s.transit_details?.departure_time?.text || "",
              arrival: s.transit_details?.arrival_time?.text || "",
              line: s.transit_details?.line?.short_name || s.transit_details?.line?.name || "",
              vehicle: s.transit_details?.line?.vehicle?.name || "Train",
              from: s.transit_details?.departure_stop?.name || "",
              to: s.transit_details?.arrival_stop?.name || "",
              headsign: s.transit_details?.headsign || "",
            }));
          return {
            depart: leg.departure_time?.text || "",
            arrive: leg.arrival_time?.text || "",
            duration: leg.duration?.text || "",
            transfers: Math.max(0, steps.length - 1),
            fare: route.fare?.text || null,
            steps,
          };
        });

        return { result: { routes, origin: input.origin, destination: input.destination } };
      } catch {
        return { result: { error: "Failed to fetch train schedules" } };
      }
    }

    // ── Create trip ─────────────
    case "create_trip": {
      const cities = input.cities || [];
      // Archive all other active trips so the new one becomes THE active trip
      await prisma.trip.updateMany({
        where: { status: "active" },
        data: { status: "archived" },
      });
      const trip = await prisma.trip.create({
        data: {
          name: input.name,
          startDate: input.startDate ? new Date(input.startDate) : new Date(),
          endDate: input.endDate ? new Date(input.endDate) : new Date(),
          status: "active",
          cities: {
            create: cities.map((c: any, i: number) => ({
              name: c.name,
              country: c.country || null,
              arrivalDate: c.arrivalDate ? new Date(c.arrivalDate) : null,
              departureDate: c.departureDate ? new Date(c.departureDate) : null,
              sequenceOrder: i,
            })),
          },
        },
        include: { cities: true },
      });

      // Auto-generate days for cities with dates
      for (const city of trip.cities) {
        if (city.arrivalDate && city.departureDate) {
          const start = new Date(city.arrivalDate);
          const end = new Date(city.departureDate);
          for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
            const dateStr = d.toISOString().split("T")[0];
            const existing = await prisma.day.findFirst({ where: { tripId: trip.id, date: new Date(dateStr) } });
            if (!existing) {
              await prisma.day.create({ data: { tripId: trip.id, cityId: city.id, date: new Date(dateStr) } });
            }
          }
        }
      }

      await syncTripDates(trip.id);

      // Geocode all cities so they appear on the map
      for (const city of trip.cities) {
        geocodeCity(city.id).catch(() => {});
      }

      await logChange({
        user,
        tripId: trip.id,
        actionType: "trip_created",
        entityType: "trip",
        entityId: trip.id,
        entityName: trip.name,
        description: `${user.displayName} created trip "${trip.name}" (via chat)`,
        newState: trip,
      });

      return {
        result: { id: trip.id, name: trip.name, cities: trip.cities.map((c) => c.name) },
        actionDescription: `Created trip "${trip.name}" with ${trip.cities.length} cities`,
      };
    }

    // ── Delete travel document ─────────────
    case "delete_travel_document": {
      const doc = await prisma.travelerDocument.findUnique({ where: { id: input.documentId }, include: { profile: true } });
      if (!doc) return { result: { error: "Document not found" } };
      if (doc.profile.userCode !== user.code) return { result: { error: "You can only delete your own documents" } };

      await prisma.travelerDocument.delete({ where: { id: input.documentId } });
      return {
        result: { deleted: true },
        actionDescription: `Deleted ${doc.type} document`,
      };
    }

    // ── Get cultural context ─────────────
    case "get_cultural_context": {
      const exp = await prisma.experience.findUnique({
        where: { id: input.experienceId },
        include: { city: true },
      });
      if (!exp) return { result: { error: "Experience not found" } };

      // Return cached notes if available
      if (exp.culturalNotes) {
        return { result: { experience: exp.name, city: exp.city.name, tips: exp.culturalNotes } };
      }

      // Generate via internal API call
      try {
        const notesResponse = await fetch(`http://localhost:${process.env.PORT || 3001}/api/cultural-notes/experience/${exp.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await notesResponse.json();
        return { result: { experience: exp.name, city: exp.city.name, tips: data.notes || data } };
      } catch {
        return { result: { error: "Failed to generate cultural tips" } };
      }
    }

    // ── Share day plan ─────────────
    case "share_day_plan": {
      const day = await prisma.day.findUnique({
        where: { id: input.dayId },
        include: {
          city: true,
          experiences: { where: { state: "selected" }, orderBy: { priorityOrder: "asc" } },
          reservations: { orderBy: { datetime: "asc" } },
          accommodations: true,
        },
      });
      if (!day) return { result: { error: "Day not found" } };

      const dateStr = day.date.toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      });
      let text = `${dateStr}\n${day.city.name}\n`;
      if (day.accommodations.length > 0) text += `\nHotel: ${day.accommodations[0].name}\n`;
      if (day.experiences.length > 0) {
        text += "\n";
        for (const e of day.experiences) {
          text += `- ${e.name}`;
          if (e.timeWindow) text += ` (${e.timeWindow})`;
          text += "\n";
        }
      }
      if (day.reservations.length > 0) {
        text += "\n";
        for (const r of day.reservations) {
          const time = r.datetime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          text += `Reservation: ${r.name} at ${time}\n`;
        }
      }
      if (day.notes) text += `\nNotes: ${day.notes}\n`;

      return { result: { plan: text, date: dateStr, city: day.city.name } };
    }

    // ── Get travel time ─────────────
    case "get_travel_time": {
      const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
      const mode = input.mode || "walk";
      const originName = input.originName || "origin";
      const destName = input.destName || "destination";

      if (API_KEY) {
        try {
          const gmMode = mode === "subway" || mode === "train" || mode === "bus" ? "transit" : mode === "taxi" ? "driving" : "walking";
          const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
          url.searchParams.set("origins", `${input.originLat},${input.originLng}`);
          url.searchParams.set("destinations", `${input.destLat},${input.destLng}`);
          url.searchParams.set("mode", gmMode);
          url.searchParams.set("key", API_KEY);
          const res = await fetch(url.toString());
          const data = await res.json();
          const element = data.rows?.[0]?.elements?.[0];
          if (element?.status === "OK") {
            const mins = Math.round(element.duration.value / 60);
            return {
              result: {
                from: originName,
                to: destName,
                mode,
                durationMinutes: mins,
                distance: element.distance?.text || null,
              },
            };
          }
        } catch { /* fall through to estimate */ }
      }

      // Fallback: haversine estimate
      const R = 6371;
      const dLat = ((input.destLat - input.originLat) * Math.PI) / 180;
      const dLng = ((input.destLng - input.originLng) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(input.originLat * Math.PI / 180) * Math.cos(input.destLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const speeds: Record<string, number> = { walk: 4.5, subway: 30, train: 25, bus: 20, taxi: 30 };
      const mins = Math.round((km / (speeds[mode] || 4.5)) * 60);

      return {
        result: {
          from: originName,
          to: destName,
          mode,
          durationMinutes: mins,
          distance: `~${km.toFixed(1)} km`,
          estimated: true,
        },
      };
    }

    // ── Get ratings ─────────────
    case "get_ratings": {
      const exp = await prisma.experience.findUnique({
        where: { id: input.experienceId },
        include: { ratings: true },
      });
      if (!exp) return { result: { error: "Experience not found" } };

      if (exp.ratings.length === 0) {
        return { result: { experience: exp.name, ratings: [], message: "No ratings recorded yet" } };
      }

      return {
        result: {
          experience: exp.name,
          ratings: exp.ratings.map((r) => ({
            platform: r.platform,
            rating: r.ratingValue,
            reviews: r.reviewCount,
          })),
        },
      };
    }

    // ── Place lookup ─────────────
    case "lookup_place": {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return { result: { error: "Google Maps API key not configured" } };

      const fields = "place_id,name,formatted_address,geometry,rating,user_ratings_total,photos,price_level";
      let findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(input.query)}&inputtype=textquery&fields=${fields}&key=${apiKey}`;
      if (input.location) {
        findUrl += `&locationbias=circle:20000@${input.location}`;
      }

      const findRes = await fetch(findUrl);
      const findData = await findRes.json() as any;
      const candidate = findData?.candidates?.[0];
      if (!candidate) return { result: { found: false, message: `No place found for "${input.query}"` } };

      const photoRef = candidate.photos?.[0]?.photo_reference;
      const photoUrl = photoRef
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${apiKey}`
        : null;

      const placeData = {
        found: true,
        name: candidate.name,
        address: candidate.formatted_address || "",
        rating: candidate.rating || null,
        ratingCount: candidate.user_ratings_total || null,
        priceLevel: candidate.price_level ?? null,
        latitude: candidate.geometry?.location?.lat,
        longitude: candidate.geometry?.location?.lng,
        photoUrl,
      };

      return {
        result: placeData,
        placeCards: [placeData],
      };
    }

    // ── Web search ─────────────
    case "web_search": {
      const braveKey = process.env.BRAVE_SEARCH_API_KEY;
      if (!braveKey) return { result: { error: "Web search not configured. Answering from existing knowledge." } };

      const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(input.query)}&count=5`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      try {
        const searchRes = await fetch(searchUrl, {
          headers: { "X-Subscription-Token": braveKey, Accept: "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const searchData = await searchRes.json() as any;

        const results = (searchData.web?.results || []).slice(0, 5).map((r: any) => ({
          title: r.title,
          snippet: r.description,
          url: r.url,
        }));

        return { result: { query: input.query, results } };
      } catch {
        clearTimeout(timeout);
        return { result: { error: "Search timed out. Answering from existing knowledge.", query: input.query } };
      }
    }

    case "add_phrase": {
      const phrase = await prisma.tripPhrase.create({
        data: {
          tripId: input.tripId,
          english: input.english,
          romaji: input.romaji,
          addedBy: user.displayName,
        },
      });
      return {
        result: { saved: true, english: phrase.english, romaji: phrase.romaji },
        actionDescription: `Added phrase: "${phrase.english}" → ${phrase.romaji}`,
      };
    }

    case "bulk_update_days": {
      const results = { updated: 0, created: 0, deleted: 0, errors: [] as string[] };

      // Delete days first (demote their experiences)
      if (input.deletes?.length) {
        await prisma.experience.updateMany({
          where: { dayId: { in: input.deletes }, state: "selected" },
          data: { state: "possible", dayId: null, timeWindow: null },
        });
        await prisma.day.deleteMany({ where: { id: { in: input.deletes } } });
        results.deleted = input.deletes.length;
      }

      // Update existing days
      if (input.updates?.length) {
        await prisma.$transaction(
          input.updates.map((u: any) =>
            prisma.day.update({
              where: { id: u.dayId },
              data: { date: new Date(u.newDate) },
            })
          )
        );
        results.updated = input.updates.length;
      }

      // Create new days
      if (input.creates?.length) {
        await prisma.day.createMany({
          data: input.creates.map((c: any) => ({
            tripId: input.tripId,
            cityId: c.cityId,
            date: new Date(c.date),
          })),
        });
        results.created = input.creates.length;
      }

      // Sync trip dates
      await syncTripDates(input.tripId);

      await logChange({
        user,
        tripId: input.tripId,
        actionType: "days_bulk_updated",
        entityType: "trip",
        entityId: input.tripId,
        entityName: "Day schedule",
        description: `${user.displayName} restructured days: ${results.updated} updated, ${results.created} created, ${results.deleted} deleted`,
      });

      return {
        result: results,
        actionDescription: `Restructured days: ${results.updated} updated, ${results.created} created, ${results.deleted} deleted`,
      };
    }

    case "create_decision": {
      const decision = await prisma.decision.create({
        data: {
          tripId: input.tripId,
          cityId: input.cityId,
          title: input.title,
          createdBy: user.code,
        },
      });

      // Add initial options if provided
      if (input.options?.length) {
        for (const optName of input.options) {
          const exp = await prisma.experience.create({
            data: {
              tripId: input.tripId,
              cityId: input.cityId,
              name: optName,
              createdBy: user.code,
              state: "voting",
              decisionId: decision.id,
              locationStatus: "unlocated",
            },
          });
          enrichExperience(exp.id).catch(() => {});
        }
      }

      await logChange({
        user,
        tripId: input.tripId,
        actionType: "decision_created",
        entityType: "decision",
        entityId: decision.id,
        entityName: decision.title,
        description: `${user.displayName} started a decision: "${decision.title}"${input.options?.length ? ` with ${input.options.length} options` : ""}`,
      });

      const full = await prisma.decision.findUnique({
        where: { id: decision.id },
        include: {
          city: { select: { id: true, name: true } },
          options: { select: { id: true, name: true } },
          votes: true,
        },
      });

      return {
        result: full,
        actionDescription: `Started decision "${decision.title}"${input.options?.length ? ` with options: ${input.options.join(", ")}` : ""}`,
      };
    }

    case "add_decision_option": {
      const dec = await prisma.decision.findUnique({
        where: { id: input.decisionId },
        select: { id: true, tripId: true, cityId: true, title: true, status: true },
      });
      if (!dec) return { result: { error: "Decision not found" } };
      if (dec.status !== "open") return { result: { error: "Decision is already resolved" } };

      let exp;
      if (input.experienceId) {
        exp = await prisma.experience.update({
          where: { id: input.experienceId },
          data: { state: "voting", decisionId: dec.id },
        });
      } else if (input.name?.trim()) {
        exp = await prisma.experience.create({
          data: {
            tripId: dec.tripId,
            cityId: dec.cityId,
            name: input.name.trim(),
            description: input.description?.trim() || null,
            createdBy: user.code,
            state: "voting",
            decisionId: dec.id,
            locationStatus: "unlocated",
          },
        });
        enrichExperience(exp.id).catch(() => {});
      } else {
        return { result: { error: "Provide experienceId or name" } };
      }

      return {
        result: { added: exp.name, decisionTitle: dec.title },
        actionDescription: `Added "${exp.name}" to decision "${dec.title}"`,
      };
    }

    case "cast_decision_vote": {
      const dec = await prisma.decision.findUnique({
        where: { id: input.decisionId },
        select: { id: true, status: true, title: true },
      });
      if (!dec) return { result: { error: "Decision not found" } };
      if (dec.status !== "open") return { result: { error: "Decision is already resolved" } };

      await prisma.decisionVote.upsert({
        where: {
          decisionId_userCode: { decisionId: input.decisionId, userCode: user.code },
        },
        create: {
          decisionId: input.decisionId,
          optionId: input.optionId || null,
          userCode: user.code,
          displayName: user.displayName,
        },
        update: {
          optionId: input.optionId || null,
        },
      });

      return {
        result: { voted: true, optionId: input.optionId || "happy with any" },
        actionDescription: `Voted on "${dec.title}"`,
      };
    }

    case "resolve_decision": {
      const dec = await prisma.decision.findUnique({
        where: { id: input.decisionId },
        include: { options: { select: { id: true, name: true } } },
      });
      if (!dec) return { result: { error: "Decision not found" } };

      const winnerSet = new Set(input.winnerIds || []);
      for (const opt of dec.options) {
        if (winnerSet.has(opt.id)) {
          await prisma.experience.update({
            where: { id: opt.id },
            data: { state: "selected", decisionId: null },
          });
        } else {
          await prisma.experience.update({
            where: { id: opt.id },
            data: { state: "possible", decisionId: null },
          });
        }
      }

      await prisma.decision.update({
        where: { id: input.decisionId },
        data: { status: "resolved", resolvedAt: new Date() },
      });

      const winnerNames = dec.options.filter(o => winnerSet.has(o.id)).map(o => o.name);
      await logChange({
        user,
        tripId: dec.tripId,
        actionType: "decision_resolved",
        entityType: "decision",
        entityId: dec.id,
        entityName: dec.title,
        description: `${user.displayName} resolved "${dec.title}" → ${winnerNames.join(", ") || "none selected"}`,
      });

      return {
        result: { resolved: true, winners: winnerNames },
        actionDescription: `Resolved "${dec.title}" → ${winnerNames.join(", ") || "none"}`,
      };
    }

    case "get_open_decisions": {
      const decisions = await prisma.decision.findMany({
        where: { tripId: input.tripId, status: "open" },
        include: {
          city: { select: { id: true, name: true } },
          options: { select: { id: true, name: true, description: true } },
          votes: { select: { id: true, optionId: true, userCode: true, displayName: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return {
        result: decisions.length > 0 ? decisions : { message: "No open decisions" },
      };
    }

    case "create_day_choice": {
      const decision = await prisma.decision.create({
        data: {
          tripId: input.tripId,
          cityId: input.cityId,
          dayId: input.dayId,
          title: input.title,
          createdBy: user.code,
        },
      });

      for (const opt of input.options) {
        const exp = await prisma.experience.create({
          data: {
            tripId: input.tripId,
            cityId: input.cityId,
            dayId: input.dayId,
            name: opt.name,
            description: opt.description || null,
            createdBy: user.code,
            state: "voting",
            decisionId: decision.id,
            locationStatus: "unlocated",
          },
        });
        enrichExperience(exp.id).catch(() => {});
      }

      await logChange({
        user,
        tripId: input.tripId,
        actionType: "day_choice_created",
        entityType: "decision",
        entityId: decision.id,
        entityName: decision.title,
        description: `${user.displayName} created a day choice: "${decision.title}" with ${input.options.length} options`,
      });

      return {
        result: { decisionId: decision.id, title: decision.title, optionCount: input.options.length },
        actionDescription: `Created day choice "${decision.title}" with ${input.options.length} options`,
      };
    }

    case "get_contributions_by_traveler": {
      const experiences = await prisma.experience.findMany({
        where: { tripId: input.tripId, createdBy: { contains: input.travelerName, mode: "insensitive" } },
        include: { city: true, day: true },
        orderBy: { createdAt: "desc" },
      });
      if (experiences.length === 0) {
        return { result: { message: `No activities found from ${input.travelerName}` } };
      }
      // Group by city
      const byCity: Record<string, any[]> = {};
      for (const exp of experiences) {
        const cityName = exp.city.name;
        if (!byCity[cityName]) byCity[cityName] = [];
        byCity[cityName].push({
          name: exp.name,
          state: exp.state,
          day: exp.day?.date || null,
          description: exp.description?.slice(0, 100) || null,
        });
      }
      const summary = Object.entries(byCity)
        .map(([city, items]) => `${city} (${items.length}): ${items.map(i => i.name).join(", ")}`)
        .join("\n");
      return {
        result: {
          traveler: input.travelerName,
          total: experiences.length,
          byCity,
          summary,
        },
      };
    }

    case "save_learning": {
      const learning = await prisma.learning.create({
        data: {
          travelerId: input.travelerId,
          tripId: input.tripId || null,
          experienceId: input.experienceId || null,
          content: input.content,
          scope: input.scope || "general",
          source: "chat",
        },
      });
      return {
        result: { id: learning.id, content: learning.content, scope: learning.scope },
        actionDescription: `Saved learning: "${input.content.slice(0, 60)}${input.content.length > 60 ? "..." : ""}"`,
      };
    }

    case "get_learnings": {
      const where: any = {};
      if (input.tripId) where.tripId = input.tripId;
      if (input.scope) where.scope = input.scope;
      const learnings = await prisma.learning.findMany({
        where,
        include: { traveler: { select: { displayName: true } } },
        orderBy: { createdAt: "desc" },
        take: input.limit || 50,
      });
      return {
        result: learnings.length > 0
          ? learnings.map(l => ({
              id: l.id,
              content: l.content,
              scope: l.scope,
              source: l.source,
              contributor: l.traveler.displayName,
              tripId: l.tripId,
              createdAt: l.createdAt,
            }))
          : { message: "No learnings saved yet" },
      };
    }

    case "update_learning": {
      const updated = await prisma.learning.update({
        where: { id: input.learningId },
        data: { content: input.content },
      });
      return {
        result: { id: updated.id, content: updated.content },
        actionDescription: `Updated learning`,
      };
    }

    case "delete_learning": {
      await prisma.learning.delete({ where: { id: input.learningId } });
      return {
        result: { message: "Learning removed" },
        actionDescription: `Deleted a learning`,
      };
    }

    case "get_pending_approvals": {
      const approvals = await prisma.approvalRequest.findMany({
        where: { tripId: input.tripId, status: "pending" },
        include: {
          requester: { select: { displayName: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return {
        result: approvals.length > 0
          ? approvals.map(a => ({
              id: a.id,
              type: a.type,
              description: a.description,
              requester: a.requester.displayName,
              createdAt: a.createdAt,
            }))
          : { message: "No pending changes to review" },
      };
    }

    case "review_approval": {
      const approval = await prisma.approvalRequest.update({
        where: { id: input.approvalId },
        data: {
          status: input.decision,
          reviewedById: input.reviewerId,
          reviewedAt: new Date(),
          reviewNote: input.note || null,
        },
      });
      // If approved, we could execute the payload here in the future
      return {
        result: { id: approval.id, status: approval.status },
        actionDescription: `${input.decision === "approved" ? "Approved" : "Declined"} change request`,
      };
    }

    case "add_trip_members": {
      const trip = await prisma.trip.findUnique({ where: { id: input.tripId } });
      if (!trip) return { result: { error: "Trip not found" } };
      const results = [];
      for (const name of input.names) {
        const trimmed = name.trim();
        if (!trimmed) continue;
        // Create or find traveler
        let traveler = await prisma.traveler.findFirst({
          where: { displayName: { equals: trimmed, mode: "insensitive" } },
        });
        if (!traveler) {
          traveler = await prisma.traveler.create({
            data: { displayName: trimmed },
          });
        }
        // Check if already a member
        const existing = await prisma.tripMember.findFirst({
          where: { tripId: input.tripId, travelerId: traveler.id },
        });
        if (existing) {
          results.push({ name: trimmed, status: "already a member" });
          continue;
        }
        // Create membership + invite
        await prisma.tripMember.create({
          data: { tripId: input.tripId, travelerId: traveler.id, role: "traveler" },
        });
        const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
        await prisma.tripInvite.create({
          data: { tripId: input.tripId, expectedName: trimmed, inviteToken: token },
        });
        results.push({ name: trimmed, status: "added", inviteToken: token });
      }
      return {
        result: results,
        actionDescription: `Added ${results.filter(r => r.status === "added").length} member(s) to the trip`,
      };
    }

    case "change_member_role": {
      const member = await prisma.tripMember.findFirst({
        where: { tripId: input.tripId, traveler: { displayName: { equals: input.travelerName, mode: "insensitive" } } },
      });
      if (!member) return { result: { error: `${input.travelerName} is not a member of this trip` } };
      await prisma.tripMember.update({
        where: { id: member.id },
        data: { role: input.role },
      });
      return {
        result: { name: input.travelerName, role: input.role },
        actionDescription: `Changed ${input.travelerName}'s role to ${input.role}`,
      };
    }

    case "set_trip_anchor": {
      const trip = await prisma.trip.findUnique({
        where: { id: input.tripId },
        include: { days: { orderBy: { date: "asc" } } },
      });
      if (!trip) return { result: { error: "Trip not found" } };
      const anchorDate = new Date(input.anchorDate);
      // Update each day's date based on its dayNumber
      for (const day of trip.days) {
        const dayNum = day.dayNumber || 1;
        const newDate = new Date(anchorDate);
        newDate.setUTCDate(newDate.getUTCDate() + (dayNum - 1));
        await prisma.day.update({
          where: { id: day.id },
          data: { date: newDate },
        });
      }
      // Update trip dates
      const lastDay = trip.days[trip.days.length - 1];
      const lastDayNum = lastDay?.dayNumber || trip.days.length;
      const endDate = new Date(anchorDate);
      endDate.setUTCDate(endDate.getUTCDate() + (lastDayNum - 1));
      await prisma.trip.update({
        where: { id: input.tripId },
        data: {
          startDate: anchorDate,
          endDate: endDate,
          anchorDate: anchorDate,
          datesKnown: true,
        },
      });
      // Update city dates too
      const cities = await prisma.city.findMany({ where: { tripId: input.tripId }, include: { days: true } });
      for (const city of cities) {
        if (city.days.length > 0) {
          const cityDayDates = city.days.map(d => {
            const dn = d.dayNumber || 1;
            const nd = new Date(anchorDate);
            nd.setUTCDate(nd.getUTCDate() + (dn - 1));
            return nd;
          });
          cityDayDates.sort((a, b) => a.getTime() - b.getTime());
          await prisma.city.update({
            where: { id: city.id },
            data: { arrivalDate: cityDayDates[0], departureDate: cityDayDates[cityDayDates.length - 1] },
          });
        }
      }
      return {
        result: {
          message: `Dates set — Day 1 is ${anchorDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
          tripStart: anchorDate.toISOString(),
          tripEnd: endDate.toISOString(),
        },
        actionDescription: `Set trip anchor: Day 1 = ${anchorDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      };
    }

    case "activate_trip": {
      // Deactivate all trips, activate the requested one
      await prisma.trip.updateMany({ data: { status: "archived" } });
      const activated = await prisma.trip.update({
        where: { id: input.tripId },
        data: { status: "active" },
        select: { id: true, name: true },
      });
      return {
        result: { tripId: activated.id, name: activated.name, message: `Switched to ${activated.name}` },
        actionDescription: `Switched to trip: ${activated.name}`,
      };
    }

    case "delete_decision": {
      const decision = await prisma.decision.findUnique({ where: { id: input.decisionId } });
      if (!decision) return { result: { error: "Decision not found" } };
      await prisma.decision.delete({ where: { id: input.decisionId } });
      return {
        result: { message: `Cleared the "${decision.title}" decision` },
        actionDescription: `Cleared decision: "${decision.title}"`,
      };
    }

    case "retract_interest": {
      const interest = await prisma.experienceInterest.findUnique({
        where: { id: input.interestId },
        include: { experience: { select: { name: true } } },
      });
      if (!interest) return { result: { error: "Interest not found" } };
      await prisma.experienceInterest.delete({ where: { id: input.interestId } });
      return {
        result: { message: `Took back the flag on ${interest.experience.name}` },
        actionDescription: `Retracted interest in ${interest.experience.name}`,
      };
    }

    case "restore_entity": {
      const changeLog = await prisma.changeLog.findUnique({ where: { id: input.changeLogId } });
      if (!changeLog) return { result: { error: "Change log entry not found" } };
      if (!changeLog.previousState) return { result: { error: "No previous state to restore from" } };
      const prev = changeLog.previousState as any;
      const entityType = changeLog.entityType?.toLowerCase();

      try {
        switch (entityType) {
          case "experience":
            await prisma.experience.create({
              data: {
                id: prev.id,
                tripId: prev.tripId || prev.trip_id,
                cityId: prev.cityId || prev.city_id,
                name: prev.name,
                description: prev.description || null,
                sourceText: prev.sourceText || prev.source_text || null,
                locationStatus: prev.locationStatus || prev.location_status || "unlocated",
                latitude: prev.latitude ?? null,
                longitude: prev.longitude ?? null,
                state: prev.state || "possible",
                dayId: prev.dayId || prev.day_id || null,
                priorityOrder: prev.priorityOrder ?? prev.priority_order ?? 0,
                themes: prev.themes || [],
                createdBy: prev.createdBy || prev.created_by || user.displayName,
              },
            });
            break;
          case "reservation":
            await prisma.reservation.create({
              data: {
                id: prev.id,
                tripId: prev.tripId || prev.trip_id,
                dayId: prev.dayId || prev.day_id,
                name: prev.name,
                type: prev.type || "other",
                datetime: new Date(prev.datetime),
                confirmationNumber: prev.confirmationNumber || prev.confirmation_number || null,
                notes: prev.notes || null,
              },
            });
            break;
          case "accommodation":
            await prisma.accommodation.create({
              data: {
                id: prev.id,
                tripId: prev.tripId || prev.trip_id,
                cityId: prev.cityId || prev.city_id,
                name: prev.name,
                address: prev.address || null,
                checkInTime: prev.checkInTime || prev.check_in_time || null,
                checkOutTime: prev.checkOutTime || prev.check_out_time || null,
                confirmationNumber: prev.confirmationNumber || prev.confirmation_number || null,
                notes: prev.notes || null,
              },
            });
            break;
          default:
            return { result: { error: `Can't restore ${entityType} entities via chat yet — try the History page` } };
        }
        return {
          result: { message: `Brought back ${prev.name || changeLog.entityName}` },
          actionDescription: `Restored ${changeLog.entityName}`,
        };
      } catch (e: any) {
        if (e.code === "P2002") return { result: { error: "Already restored" } };
        return { result: { error: `Couldn't restore: ${e.message}` } };
      }
    }

    case "resend_invite": {
      const invite = await prisma.tripInvite.findFirst({
        where: {
          tripId: input.tripId,
          expectedName: { equals: input.memberName, mode: "insensitive" },
        },
      });
      if (!invite) return { result: { error: `No invite found for ${input.memberName}` } };
      const newToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await prisma.tripInvite.update({
        where: { id: invite.id },
        data: { inviteToken: newToken, claimedByTravelerId: null, claimedAt: null },
      });
      const link = `${process.env.APP_URL || "https://wander.up.railway.app"}/join/${newToken}`;
      return {
        result: { name: input.memberName, link, message: `New invite link for ${input.memberName}. The old one won't work anymore.` },
        actionDescription: `Regenerated invite link for ${input.memberName}`,
      };
    }

    case "get_travel_advisories": {
      // Derive countries from trip cities if not provided
      let countries = input.countries as string[] | undefined;
      if (!countries || countries.length === 0) {
        const trip = await prisma.trip.findUnique({
          where: { id: input.tripId },
          include: { cities: { where: { hidden: false }, select: { country: true } } },
        });
        if (trip?.cities) {
          countries = [...new Set(trip.cities.map((c: any) => c.country).filter(Boolean))];
        }
      }
      if (!countries || countries.length === 0) {
        return { result: { error: "No destination countries found. Add cities with countries to your trip first." } };
      }

      const advisories = getCountryAdvisories(countries);
      const trip = await prisma.trip.findUnique({
        where: { id: input.tripId },
        select: { startDate: true },
      });
      const summary = getPreTripSummary(countries, trip?.startDate?.toISOString().split("T")[0]);

      return {
        result: {
          advisories,
          summary,
          note: "This is reference information — travelers should verify with official sources before departure.",
        },
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
      // Fall back to most recently updated active trip (not just first in DB)
      const activeTrip = await prisma.trip.findFirst({ where: { status: "active" }, orderBy: { updatedAt: "desc" }, select: { id: true } });
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
    // Skip fast-path if text looks like travel documents (frequent flyer, passport, etc.)
    const travelDocPatterns = [
      /frequent\s*flyer/i, /passport/i, /\bvisa\b/i, /insurance/i,
      /sky\s*miles/i, /mileage\s*plus/i, /aadvantage/i, /rapid\s*rewards/i,
      /loyalty\s*(number|program|#)/i, /member(ship)?\s*(number|#|id)/i,
      /\b(american|united|delta|southwest|alaska|jetblue|continental)\s*(air|airline)?/i,
    ];
    const looksLikeTravelDocs = travelDocPatterns.some(p => p.test(recText));
    if (looksLikeRecs && !looksLikeTravelDocs) {
      console.log("Chat fast-path: detected recommendation text, importing directly");
      try {
        const { result, actionDescription } = await executeTool(
          "import_recommendations",
          { tripId, text: recText, senderLabel: "Scout" },
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

    // Determine user's role on this trip
    let userRole = "planner";
    if (req.user?.travelerId && tripId) {
      try {
        const { getUserRole: getRole } = await import("../middleware/role.js");
        const role = await getRole(req.user.travelerId, tripId);
        if (role) userRole = role;
      } catch { /* fallback to planner */ }
    }

    // Fetch relevant learnings to inject into context (planners only)
    let learningsContext = "";
    if (tripId && userRole === "planner") {
      try {
        const learnings = await prisma.learning.findMany({
          where: {
            OR: [
              { tripId, scope: "trip_specific" },
              { scope: "general" },
            ],
          },
          include: { traveler: { select: { displayName: true } } },
          orderBy: { createdAt: "desc" },
          take: 15,
        });
        if (learnings.length > 0) {
          learningsContext = `\nTRIP LEARNINGS (wisdom from past travel — weave these in naturally when relevant, don't list them unprompted):\n${learnings.map(l => `- ${l.content} (from ${l.traveler.displayName}${l.scope === "general" ? ", applies to all trips" : ""})`).join("\n")}`;
        }
      } catch { /* non-blocking */ }
    }

    // Build system prompt with page context
    const systemPrompt = `You are Scout, the travel companion built into Wander. You're warm, knowledgeable, and practical — like a friend who's been everywhere and remembers everything. You help plan trips, answer questions, and take care of details so travelers can focus on the experience.

CURRENT CONTEXT:
- Page: ${context?.page || "unknown"}
- Trip ID: ${tripId || "none"}
- User: ${req.user?.displayName || "unknown"} (role: ${userRole})
${context?.cityId ? `- Viewing city ID: ${context.cityId}` : ""}
${context?.cityName ? `- Viewing city: ${context.cityName}` : ""}
${context?.dayId ? `- Viewing day ID: ${context.dayId}` : ""}
${context?.dayDate ? `- Viewing day: ${context.dayDate}` : ""}${learningsContext}

RULES:
1. Be concise and helpful. One or two sentences for simple answers.
2. When performing actions, confirm what you did briefly.
3. If the user asks to add something, do it — don't just explain how.
9. When the user asks to shift, move, or reschedule the trip (e.g., "move everything one week earlier"), use shift_trip_dates with the correct offsetDays. Calculate the offset from their description — e.g., "Oct 18 to Oct 11" = -7 days.
10. When moving a single day's date, use update_day_date. For multiple days, use bulk_update_days instead.
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
16. When the user asks to clear, dismiss, or archive recommendation cities, use hide_city with hideAll: true. Individual cities can be hidden with hide_city by cityId.
17. When the user shares passport details, frequent flyer numbers, insurance info, visa details, ticket references, or any travel document information, save them IMMEDIATELY. For multiple documents (e.g. a list of frequent flyer numbers), use save_travel_documents_bulk to save them all in one call. For a single document, use save_travel_document. If the user specifies documents for other travelers by name (e.g. "Larisa's Delta SkyMiles is 123456"), use the forTraveler field. Extract all relevant fields from the natural language. Do not ask for confirmation — just save everything at once.
18. When the user asks "what's my passport number?", "show my documents", or any question about their own travel info, use get_my_documents and answer from the results.
19. When the user asks about another traveler's info (e.g., "what's Ken's frequent flyer number?"), use get_shared_documents. Only non-private documents from other travelers will be returned.
20. When the user asks "am I ready?", "what do I still need?", "travel readiness", or similar, use check_travel_readiness. Give a personalized, specific answer — not a generic checklist. Mention exact expiry dates, specific country requirements, and concrete next steps.
21. Never store financial data (credit cards, bank accounts, PINs). Travel document numbers (passport, visa, frequent flyer, tickets) are standard travel information shared routinely with airlines and countries.
22. When the user wants to flag an experience for the group, use float_to_group. When they want to react to someone else's floated experience, use react_to_interest. Use get_group_interests to see what's been floated. This is a lightweight "what does everyone think?" gesture, not a formal vote.
23. When the user shares or asks about a Tabelog rating for a restaurant, use set_tabelog_rating. Tabelog is Japan's primary restaurant rating platform — more trusted than Google for Japanese restaurants. A Tabelog 3.5+ is excellent.
24. When the user asks about train schedules, times, or routes in Japan, use search_train_schedules. Present results clearly: departure time, line name, transfers, duration.
25. When the user asks about train delays or disruptions, use check_transit_status. Only mention disruptions that affect their specific route segments.
26. When the user wants to create a new trip, use create_trip. Infer a reasonable name from the conversation. If they mention cities, include them with dates if provided.
27. When the user asks "how do you say X in Japanese?", "add a phrase", or wants to learn/save a Japanese phrase, use add_phrase. Always provide romaji (Latin-alphabet pronunciation) — NEVER Japanese characters. The phrase appears on everyone's shared phrase card automatically.
28. When the user asks to delete a travel document, use delete_travel_document. Look up their documents first with get_my_documents to find the right ID.
29. When the user asks about cultural etiquette, tips, or best times to visit a place, use get_cultural_context. Present the tips naturally in conversation, not as a raw list.
30. When the user asks to share or summarize a day's plan, use share_day_plan. Return the text directly so they can copy it.
31. When the user asks how long it takes to get somewhere, use get_travel_time. Look up coordinates from the relevant experiences first. Default to walking unless the user specifies a mode.
32. When the user expresses interest in an experience ("this looks cool", "we should check this out"), proactively offer to float it to the group with float_to_group.
33. When the user asks about ratings or reviews for a place, use get_ratings. Interpret the scores in context — Tabelog 3.5+ is excellent, Google 4.0+ is very good.
34. When the user asks to restructure, shift, or rearrange days across the trip, use bulk_update_days. NEVER promise to "fire all updates simultaneously" unless you are about to call this single tool. If a restructure requires more than 3 tool calls, stop, explain what you need to do, and use bulk_update_days in ONE call. Do not make promises you cannot fulfill in the current response.
35. When the user asks about a specific place, wants to see what somewhere looks like, or is deciding whether to visit, use lookup_place. This returns a photo and details from Google. Use it proactively when discussing restaurants, temples, hotels, or attractions — don't just describe them in words when you can show a photo card. Include the city or neighborhood in the query for better results (e.g. "Fushimi Inari Kyoto" not just "Fushimi Inari").
36. When the user asks about something NOT in the trip data — restaurant recommendations, opening hours, crowd levels, "is X worth visiting", "best Y near Z", current conditions, travel tips — use web_search. Synthesize the results into a concise, helpful answer. Do NOT dump raw search results. Never use web_search for questions answerable from trip data (use other tools instead). You can combine web_search with lookup_place in the same response — search for information, then show a photo card for the top recommendation.
37. When a user asks to add a destination as a "day trip", "excursion", or "side trip" from an existing city, use add_experience to create it within that city — do NOT use add_city. Day trips are experiences you return from, not separate overnight bases. Only use add_city when the user wants a new base/overnight destination with its own date range.
38. When someone says "let's decide", "help us choose", "we need to pick between", or "start a vote", use create_decision with options. Use get_open_decisions to see current decisions. Use cast_decision_vote to vote (set optionId to null for "happy with any"). Use resolve_decision when someone says "go with X" or "let's do X". Use add_decision_option to add more choices to an existing decision. This is the primary group decision mechanism — prefer it over the older interest-floating system for formal choices.
39. Use get_contributions_by_traveler when the user asks what someone has added, contributed, or wants to see a specific traveler's activities.
40. When someone says "remember this for next time", "note for future trips", "next time we should...", or anything about learning from experience, use save_learning. Ask whether it's for all future trips (scope: "general") or just this one (scope: "trip_specific"). Pass the current user's travelerId.
41. Use get_learnings to review past learnings when planning or when the user asks "what did we learn?" or "any notes from last time?". Surface relevant learnings proactively when they might apply — e.g., if planning a large group dinner and there's a learning about group restaurant sizes.
42. Use update_learning and delete_learning when the user wants to edit or remove a saved learning.
43. When a planner asks "anything to review?", "pending changes?", or similar, use get_pending_approvals to show queued approval requests.
44. Use review_approval when a planner says "approve that", "looks good", "reject that change", or similar. Pass the approvalId, the decision ("approved" or "rejected"), and optionally a note.
45. Use add_trip_members when someone says "add Glo and Brian to the trip" or names people who should join. Creates travelers, memberships, and personal invite links.
46. Use change_member_role when a planner says "make Glo a planner" or "change Brian's role to traveler". Only planners can do this.
47. Use set_trip_anchor when someone says "Day 1 is December 25" or "the trip starts on [date]". This converts a dateless trip (Day 1, Day 2...) into real calendar dates. All days, cities, and trip dates update automatically.
49. Use activate_trip when someone says "switch to the Vietnam trip", "work on [trip name]", or "go to [trip name]". Look up available trips with get_trip_summary first if needed.
50. Use delete_decision when someone says "cancel that vote", "never mind about that choice", or "close this decision". Look up open decisions first with get_open_decisions.
51. Use retract_interest when someone says "take that back", "un-flag that", or "remove my interest in [name]". Look up group interests first.
52. Use restore_entity when someone says "undo that delete", "bring back [name]", or "I didn't mean to remove that". First use get_change_log to find the changeLogId for the deletion, then call restore_entity with it.
53. Use resend_invite when a planner says "send [name] a new link", "[name] lost their invite", or "regenerate [name]'s link". This invalidates the old link and creates a new one.
54. Use create_day_choice when someone says "some of us might want to do X while others do Y", "we could split up", or "there are two options for the afternoon". This creates a Decision tied to a specific day so everyone can vote on what they want to do.
55. Use get_travel_advisories when someone asks about visas, vaccines, shots, health precautions, travel requirements, SIM cards, connectivity, currency, or "what do I need for this trip?". Also use it PROACTIVELY when a new country is added to the trip or when checking travel readiness — travelers need to know about visa requirements and recommended vaccinations well before departure. Present the information conversationally, not as a raw dump. Lead with action items (visa deadlines, vaccine timing) and follow with practical tips.
48. You are Scout. Speak warmly but concisely. You know the whole trip and everyone in it. When a traveler (not a planner) asks to do something that affects many items at once — deleting 3+ activities, rearranging an entire day, shifting all dates — don't execute it directly. Instead, explain that you've organized the changes for the planner to review, and create an approval request.`;

    // Build conversation with persistent history from DB
    let messages: Anthropic.MessageParam[] = [];
    if (tripId && req.user?.travelerId) {
      try {
        const dbMessages = await prisma.chatMessage.findMany({
          where: { tripId, travelerId: req.user.travelerId },
          orderBy: { createdAt: "desc" },
          take: 20,
        });
        for (const msg of dbMessages.reverse()) {
          messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
        }
      } catch { /* fall back to client history if DB fails */ }
    }
    // Fallback: use client-passed history if no DB messages
    if (messages.length === 0 && Array.isArray(history) && history.length > 0) {
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
    const placeCards: any[] = [];
    let finalReply = "";

    for (let turn = 0; turn < 8; turn++) {
      const response = await anthropic.messages.create({
        model: "claude-opus-4-6",
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
          const { result, actionDescription, placeCards: cards } = await executeTool(toolBlock.name, toolBlock.input, user);
          if (actionDescription) actions.push(actionDescription);
          if (cards) placeCards.push(...cards);
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

    // Persist conversation to DB
    if (tripId && req.user?.travelerId && finalReply) {
      prisma.chatMessage.createMany({
        data: [
          { tripId, travelerId: req.user.travelerId, role: "user", content: message },
          { tripId, travelerId: req.user.travelerId, role: "assistant", content: finalReply },
        ],
      }).catch(() => { /* non-critical — don't fail the response */ });
    }

    res.json({
      reply: finalReply,
      actions,
      hasActions: actions.length > 0,
      ...(placeCards.length > 0 && { places: placeCards }),
    });
  } catch (err: any) {
    console.error("Chat error:", err.message, err.stack?.split("\n").slice(0, 3).join("\n"));
    res.status(500).json({ error: "Chat failed" });
  }
});

export default router;
