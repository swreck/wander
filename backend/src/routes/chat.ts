import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../services/db.js";
import { noteMatches, sharedWords } from "../services/tripNotes/view.js";
import { keptWords } from "../services/tripNotes/kept.js";
import { settingsOf, tidyLater } from "./tripNotes.js";
import { helloFor, answerHello, offerAsked } from "../services/scoutHello.js";
import { PACKING } from "../services/packing.js";
import { createHash } from "crypto";
import { logChange } from "../services/changeLog.js";
import { syncTripDates } from "../services/syncTripDates.js";
import { requireAuth, parseAccessCodes, type AuthRequest } from "../middleware/auth.js";
import { extractRecommendations } from "../services/itineraryExtractor.js";
import { geocodeExperience, geocodeCity } from "../services/geocoding.js";
import { findDuplicate } from "../services/dedup.js";
import { enrichExperience } from "../services/capture.js";
import { getCountryAdvisories, getPreTripSummary } from "../services/travelAdvisory.js";
import { addDayChoice, removeDayChoice, listDayChoices, plainDay } from "../services/dayChoices.js";
import { setDecisionVotes } from "../services/decisionVotes.js";
import type { ContextLine } from "../services/guide/sources.js";
import { keepScoutWarm } from "../services/scoutWarm.js";

const SCOUT_MODEL = "claude-opus-5";
import { appleGuidesOf } from "../services/guide/appleGuides.js";
import { myMapPlaces } from "../services/guide/googleMyMap.js";
import { placeNotesOf, noteFor } from "../services/guide/placeNotes.js";
import { createMaybe, setIn, removeFromMaybes, putBackOnMaybes, MaybeError } from "../services/maybes.js";
import { validAttachments, attachmentBlocks } from "../services/attachments.js";
import { screenWords as tellKenScreen } from "../services/tellKen.js";
import { unseenLinks, markUnseen, seenIn, LINK_CHECK_NOTE, promisesButton } from "../services/links.js";
import { listMarks, setMark, todoKey, deadlineKey } from "../services/actionMarks.js";
import { piecesOfStep, answerSources, type AnswerPiece, type CitedDocument } from "../services/guide/answerSources.js";

const router = Router();
router.use(requireAuth);

const anthropic = new Anthropic();
// SCOUT_STUB (a local test server's --stub-scout, never set on Railway): a fixed answer and no model call — for walks of
// screens and plumbing, which paid for real answers nobody read (cost audit, Oct 16)
const scoutCreate = (params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> => process.env.SCOUT_STUB
  ? Promise.resolve({ id: "stub", type: "message", role: "assistant", model: SCOUT_MODEL, stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "text", text: "(Scout's test answer: on this test server Scout doesn't call the model.)", citations: null }],
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } as unknown as Anthropic.Message)
  : anthropic.messages.create(params);

/** The town a note is about, as Scout names it — only when the person's own words name it (a note's place is theirs) */
export function placeInWords(place: unknown, words: string): string | null {
  const p = typeof place === "string" ? place.trim() : "";
  if (!p || p.length > 40) return null;
  return new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(words) ? p.replace(/^./, (c) => c.toUpperCase()) : null;
}

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
        themes: { type: "array", items: { type: "string", enum: ["ceramics", "architecture", "food", "temples", "nature", "other", "shopping"] } },
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
    description: "Same as im_in (kept for older phrasing): mark an idea or maybe as one this person is in on, so the group sees it. Optional note becomes their line on it.",
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
    name: "add_maybe",
    description: "Put a maybe on a city's list for the whole group (Maybes, a row on Home) — 'maybe we should…', 'we could…', 'what about…', 'that looks fun, let's maybe…', a link they want the others to see. Their words as they said them (lightly trimmed), on today's city unless they name another. Wander never changes Larisa's Guide; this is the group's own list.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        cityId: { type: "string", description: "The city whose list it goes on: today's city, or the city they named" },
        words: { type: "string", description: "Their words: 'tea or ice cream after the museum?', 'the kiln the innkeeper told us about'" },
        link: { type: "string", description: "A link they shared, if any (http…)" },
      },
      required: ["tripId", "cityId", "words"],
    },
  },
  {
    name: "remove_from_maybes",
    description: "Take something off a city's Maybes list for everyone ('never mind the ice cream', 'take TeamLab off Tokyo's maybes — we're doing it in Kyoto'). Allowed for the person who put it there (Larisa for her Guide's ideas) and the trip's organizer; anyone else gets a refusal to pass on. Nothing is deleted and Larisa's Guide doesn't change; it can be put back.",
    input_schema: { type: "object" as const, properties: { experienceId: { type: "string" } }, required: ["experienceId"] },
  },
  {
    name: "put_back_on_maybes",
    description: "Put something taken off a Maybes list back on it ('put the ice cream back'). The same people who may take it off.",
    input_schema: { type: "object" as const, properties: { experienceId: { type: "string" } }, required: ["experienceId"] },
  },
  {
    name: "im_in",
    description: "'I'm in', 'count me in', 'I'd do that', 'I'm interested' on an idea or maybe (on: true); 'I'm out', 'take me off that' (on: false). forName: when they say their partner who isn't on Wander is in too ('Julie's in too') — shown as 'Julie (via Andy)'. Never changes Larisa's Guide or her X marks.",
    input_schema: {
      type: "object" as const,
      properties: {
        experienceId: { type: "string" },
        on: { type: "boolean", description: "true = in (default); false = take it back" },
        forName: { type: "string", description: "Only when speaking for someone else on the trip who isn't on Wander" },
      },
      required: ["experienceId"],
    },
  },
  {
    name: "react_to_interest",
    description: "Older: react to a flag someone raised ('maybe on Ichiran', 'pass on that one'). For 'I'm in' / 'count me in' use im_in instead.",
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
    description: "Add a line to the shared trip phrase card. Use when user says 'add a phrase', 'how do you say X in Japanese', 'I need to know how to say...', or asks to keep something on the card. Every line's title is ENGLISH — what an English speaker scans the card for (rule 27). Three kinds: something to SAY — the romaji and how to sound it out, never Japanese characters in romaji; something to SHOW someone (an allergy or diet for the waiter, a medical need, where to go for a taxi) — script is the polite written Japanese, romaji is what that Japanese says in plain English sentence for sentence, no pronunciation; or characters to RECOGNIZE on a sign, button, screen or machine (a toilet's 大 / 小, a ticket machine's 大人 / 小人) — the characters with their meanings, no pronunciation. Never add a fact they didn't give (no address or phone number from memory). One request is ONE line: never split it into several. First look at PHRASE CARD: when a line there already says the same thing (in any wording), tell them it's there and don't add another, unless they ask for another way to say it (anotherWay: true).",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        english: { type: "string", description: "The title, in English: what it says ('Where is the station?'), or what the characters are for ('Toilet flush', 'Ticket machine fares')." },
        romaji: { type: "string", description: "The Japanese line under the title: for something to say, the romaji ('Eki wa doko desu ka?'), NO Japanese characters; for characters to recognize, the characters with what each means, in their own words when they gave them, exactly ('大 for full flush; 小 for light flush')." },
        pronunciation: { type: "string", description: "For something to say: the romaji sounded out for an English speaker, syllables joined by hyphens, as the card's own ('Konnichiwa' → 'Koh-nee-chee-wah'; 'Arigatou gozaimasu' → 'Ah-ree-gah-toh go-zah-ee-mahs'). Leave out for characters to recognize." },
        script: { type: "string", description: "The line in written Japanese (kanji and kana), when showing it to someone helps: an allergy or diet ('Allium allergy' → a polite written statement), a medical need, an address for a taxi. Exactly what they said, nothing added. The card gives it a 'Show large' button. For something to SHOW, romaji is what the Japanese says in plain English, sentence for sentence, so they know exactly what they hand over (Ken, Oct 14: \"make sure the small type English always makes it clear to the user what they are giving to the Japanese reader\"), and pronunciation is left out." },
        followUps: { type: "array", description: "For something to SHOW only: the two to four questions they'll most likely need next, so the person can help them get what they want (an allergy: which dishes don't have it; can this one be made without it; is it in the soup or sauce; a plain fallback like 'Plain rice would be fine'). Each short, English and polite written Japanese saying the same.", items: { type: "object", properties: { english: { type: "string" }, script: { type: "string" } }, required: ["english", "script"] } },
        anotherWay: { type: "boolean", description: "Only when they ask for a second way to say something already on the card" },
      },
      required: ["tripId", "english", "romaji"],
    },
  },
  {
    name: "arrange_my_phrases",
    description: "Change the phrase card (the 日 card): take a phrase off, put one back, or move one to the top or the bottom. 'Take Konnichiwa off my phrases', 'put Sumimasen first', 'bring back Thank you', 'remove the extra not-feeling-well ones' (one call per phrase). Remove takes it off THEIR OWN card. Only when they clearly say everyone's ('take it off everyone's card', 'remove it for all of us') set forEveryone — it works only for a phrase they added (or any added phrase, for the trip's organizer); Ken (Oct 14): \"ensure just your card is default. I don't want Larisa or Julie to accidentally remove for andy!\" The order is theirs alone. Nothing is deleted. Say which happened, as the result says.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        phrase: { type: "string", description: "The phrase as they named it, by its English title or its Japanese: 'Excuse me' or 'Sumimasen'" },
        action: { type: "string", enum: ["remove", "put_back", "move_to_top", "move_to_bottom"] },
        forEveryone: { type: "boolean", description: "Remove only: true only when they clearly asked for it off everyone's card" },
      },
      required: ["tripId", "phrase", "action"],
    },
  },
  // ── Showing things in Wander (moves the screen; changes nothing) ──────────────
  {
    name: "show_in_wander",
    description: "Open a screen in Wander for the person: a day (by date), a city's ideas, Now, Actions, People, Home, History or the help page. Use go=true when they ask to see/open/show/take them to something ('show me our first day in Kyoto', 'take me to the day Andy and Julie arrive', 'open tomorrow') — Scout's panel steps down to a small bar and that screen opens. Use go=false when your answer is about a specific day or place and a button to open it would help ('Open Thu, Oct 15 ›'). Work out the date from the Guide first. Never open a day that isn't part of the trip. Always give a headline: the answer in a few words for Scout's small bar.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        target: { type: "string", enum: ["day", "ideas", "now", "actions", "people", "home", "history", "help", "back"], description: "'actions' holds the deadlines and to-dos; 'back' returns to the screen they were on before" },
        date: { type: "string", description: "YYYY-MM-DD, for target 'day'" },
        city: { type: "string", description: "City name, for target 'ideas' (e.g. 'Tokyo')" },
        markedBy: { type: "string", description: "For target 'ideas': only the ideas this person marked ('the Kyoto ideas I marked' → the asker's own name)" },
        item: { type: "string", description: "For target 'day': a few words from the Guide line you're talking about ('Meet Backroads', 'Robuchon', 'Check out') — the screen scrolls to it and highlights it" },
        go: { type: "boolean", description: "true: open it now (they asked to be shown). false: offer a button." },
        headline: { type: "string", description: "The answer in 4–9 words for Scout's small bar, leading with the fact, no 'Here's', people's names spelled out (never the Guide's initials like 'J/A' or 'K/L'): 'Sat Oct 17 · Robuchon 6:00 PM, jackets', 'Oct 29 · still open: Shiraume or Four Seasons', 'Nothing records a reconfirm yet'" },
      },
      required: ["tripId", "target", "go"],
    },
  },
  // ── Getting there (Oct 2: "what's next, and how do I get there?" — walking, train or taxi) ──────────────
  {
    name: "directions",
    description: "Put a button under your answer that opens directions from wherever the person is standing to a place — in Google Maps — so nobody types an address into a map app. Use it whenever they ask how to get somewhere, the way to the next stop, walking/train/taxi directions, or what's next on a trip day when the next stop is a real place. Pass the place as her Guide names it, its town, and the way: walk, train, or taxi. The map app starts from the phone's own location, so you never need theirs for this.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        place: { type: "string", description: "The destination as her Guide names it, e.g. 'Tokyodo Main Showroom (Yotsuya)', 'Gion Tsujiri Main Shop'" },
        town: { type: "string", description: "The city it's in, e.g. 'Tokyo', 'Kyoto'" },
        way: { type: "string", enum: ["walk", "train", "taxi"], description: "walk; train (trains, subway and buses); or taxi (a driving route — the map shows the driver where to go)" },
      },
      required: ["tripId", "place", "way"],
    },
  },
  // ── Where they are, when Scout can't see it (Oct 12: iOS forgets a Home Screen app's location answer between
  // launches, so on a fresh open this is how a "near me" question in any wording gets their location) ──────────────
  {
    name: "offer_location",
    description: "Put a \"Use my location\" button under your answer. One tap shares where their phone is and asks you the same question again. Use it only when WHERE THEY ARE says their location isn't known and your answer depends on where they're standing right now: what's near them, the nearest or closest anything, which way or how far to somewhere, \"I'm lost\". Never when you already have their location or when they've said no to sharing it, and never for a question that doesn't need it.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  // ── Papers kept from the trip (Oct 12, Ken: receipts and the like, by date, instead of carrying paper) ──────────────
  {
    name: "keep_paper",
    description: "Keep the photo, picture or PDF they sent with THIS message as a paper of the trip — a receipt, a bill, a ticket, a booking — filed under the trip day it belongs to, so they needn't carry it. Use it when they ask to keep, save or file it (\"keep this\", \"save this receipt\"). Read it first. Give a title of a few words (\"Yōyōkaku bill\"), the trip day as YYYY-MM-DD (the day it was issued or paid; for a stay, its last night — the day before check-out — so it sits with where they stayed; the DAY BY DAY lines say where they were), and one or two plain sentences: what it is, the dates it covers (said as \"Oct 8–10\"), what the charges are for (a ryokan bill with no room charge on it: say the room isn't on it), the total as printed. Never a card, confirmation, reservation or passport number, a guest's name or a room number in the title or summary. Only the person and, for Ken and Larisa, each other, see it. When several files came with the message, one call per paper, each naming its own files by number in the order they were sent (files: [1], or [2, 3] for one paper's two pages). A file goes in two papers only when it shows both — one photo of tickets for two different days: keep it under each day, each paper's summary saying only its own tickets.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD, a day of the trip" },
        summary: { type: "string" },
        files: { type: "array", items: { type: "integer" }, description: "Which of the files sent with this message are this paper, numbered from 1 in the order sent. Needed when more than one was sent." },
      },
      required: ["title", "date", "summary"],
    },
  },
  {
    name: "keep_photo",
    description: "Keep the photo(s) they sent with THIS message in their own trip photos, on a trip day — a picture of the trip, the food, a place, the group (\"keep this for today\", \"add this to my photos\", \"save these for Tuesday\"). Not a receipt, bill, ticket or booking (that's keep_paper). Just theirs unless they say to share it with the trip (\"share it\", \"for everyone\"). Their words about it, if any, as its caption. Rule 62.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "The trip day it's from, YYYY-MM-DD — today unless they say another day" },
        shared: { type: "boolean", description: "true only when they ask to share it with the trip" },
        caption: { type: "string", description: "Their own words about the photo, if they said any — never yours" },
      },
    },
  },
  {
    name: "remove_paper",
    description: "Take a paper out of sight (nothing is deleted), when the person who kept it asks — by the id in THEIR PAPERS. Only the person who kept it can.",
    input_schema: { type: "object" as const, properties: { paperId: { type: "string" } }, required: ["paperId"] },
  },
  // ── Places of a kind near them (Oct 12, Ken: "Yes" to the phone's position going to Google for this) ──────────────
  {
    name: "places_near_me",
    description: "Find real places of a kind closest to where their phone is right now (from Google), each with how far and which way from them and whether it's open now; a walking button to the closest one comes with it. Use it for 'coffee near me', 'somewhere to sit down', 'closest pharmacy', 'an ATM', 'ramen I can walk to' when WHERE THEY ARE gives their location and her pins have nothing of that kind near them. Faster and closer than a web search for this. Not for places in a town they're not in.",
    input_schema: {
      type: "object" as const,
      properties: { kind: { type: "string", description: "What to look for, in a few English words: 'coffee shop', 'pharmacy', 'ramen', 'convenience store', 'ATM'" } },
      required: ["kind"],
    },
  },
  // ── Notes on ideas (Wander's own; the Guide is never changed) ──────────────
  {
    name: "add_idea_note",
    description: "Write a note on one of the trip's ideas for the person asking, e.g. 'note on Tsukiji: go early, before 8'. Everyone on the trip sees it under that idea in Maybes, with the person's name — unless justForMe is true (only they see it). It does not change Larisa's Guide. Find the idea's id with search_experiences.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        experienceId: { type: "string" },
        content: { type: "string", description: "The note, in their words, without their name in front" },
        justForMe: { type: "boolean" },
      },
      required: ["tripId", "experienceId", "content"],
    },
  },
  {
    name: "take_back_idea_note",
    description: "Take back a note the person asking wrote on an idea ('take back my note on Tsukiji'). Only their own notes; with text, the one that matches it, otherwise their latest on that idea.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        experienceId: { type: "string" },
        text: { type: "string", description: "Words from the note, when they have more than one there" },
      },
      required: ["tripId", "experienceId"],
    },
  },
  // ── Same-day choices (Wander's own; the Guide is never changed) ──────────────
  {
    name: "add_same_day_plan",
    description: "Put a same-day plan on a day, e.g. 'Ken and Andy are going to <a museum> this afternoon', 'we're doing <an activity> at 3'. It shows on that day in Wander (Home, the day screen, Now) for everyone on the trip, labelled as added in Wander by this person. It does not change Larisa's Guide. Pass experienceId when it's one of the trip's ideas (find it with search_experiences).",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD, the trip's local date (today unless they say otherwise)" },
        text: { type: "string", description: "The plan in the person's own words, short: 'Ken & Andy: <a museum> this afternoon'" },
        time: { type: "string", description: "HH:MM 24-hour, only when they gave a time" },
        experienceId: { type: "string", description: "The idea this is, when there is one" },
      },
      required: ["tripId", "date", "text"],
    },
  },
  {
    name: "remove_same_day_plan",
    description: "Take a same-day plan that was added in Wander off its day ('we're not doing <that museum> after all'). Only for choices added in Wander — never Guide items. Find the id with get_same_day_plans.",
    input_schema: {
      type: "object" as const,
      properties: { tripId: { type: "string" }, choiceId: { type: "string" } },
      required: ["tripId", "choiceId"],
    },
  },
  {
    name: "get_my_notes",
    description: "Read the asker's own trip notes (the Notes tab) and any notes others chose to share with the trip — never anyone's private notes. Use when someone asks about what they (or the group) wrote: 'what did I say about the potter?', 'my notes from Kyoto'. Optional search words and a day.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        query: { type: "string", description: "Words to look for, e.g. 'potter' (optional)" },
        date: { type: "string", description: "A trip day, YYYY-MM-DD (optional)" },
      },
      required: ["tripId"],
    },
  },
  {
    name: "change_my_note",
    description: "Change one of the asker's OWN kept notes, as its Change and Share buttons on the Notes tab do: new words for it ('fix the typo in my sorbet note', 'make that note say Thursday, not Wednesday'), or who sees it ('share my La Table note with everyone', 'make that one just me'), or the day it's about ('that note was about yesterday'). Find it first with get_my_notes (its id), and name it by its first words in your reply. The words you pass are the WHOLE note as it should now read — their words with only the change they asked for, never tidied; the first wording is always kept. Never someone else's note. Taking a note out is only on the Notes tab. Rule 46e.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        noteId: { type: "string", description: "The note's id from get_my_notes" },
        words: { type: "string", description: "The whole note as it should now read (only when its words change)" },
        share: { type: "string", enum: ["trip", "just me"], description: "Who sees it (only when they asked to change that)" },
        day: { type: "string", description: "The trip day it's about, YYYY-MM-DD, or \"none\" (only when they asked to move it: 'that note is about yesterday')" },
        add: { type: "string", description: "Their words to ADD under the note, with the time, as the Notes tab's 'Add to it' does ('add to my sake note: the brewer was 14th generation'). Their words only; never with words." },
      },
      required: ["tripId", "noteId"],
    },
  },
  {
    name: "tell_everyone",
    description: "Let everyone else on the trip know something about the trip's logistics: each of them sees it the next time they open Wander, with 'Got it' and 'Remind me'. Use when they ask: 'let everyone know…', 'tell everyone…', 'alert the group…', 'make sure everyone sees…'. Only for what the group needs to know or do: a time, a place, a meeting point, a change, a booking, a correction everyone should see. Never general messaging, chat or feelings. Rule 63.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        words: { type: "string", description: "What everyone will read, in the asker's voice, short and plain: their own words when they gave them, with only what they asked you to add." },
        confirmed: { type: "boolean", description: "true only when the asker has just said yes to these exact words, shown to them first. Without it, nothing is sent: you show them the words." },
        until: { type: "string", description: "Japan time, YYYY-MM-DDTHH:MM, when its moment has passed (a bus leaving at 8:15 tomorrow → that time). Only for a message about a moment; otherwise leave out (it shows for 3 days)." },
      },
      required: ["tripId", "words", "confirmed"],
    },
  },
  {
    name: "my_alerts",
    description: "What the asker has told everyone through you (Ken, the trip's first member, sees everyone's), each with who has tapped Got it, who asked to be reminded, and who hasn't tapped either yet. With takeBack: take one back — hidden from everyone, never deleted; only the sender or Ken. Use for 'has everyone seen my message?', 'did Julie get it?', 'take back that message'. Rule 63.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        takeBack: { type: "string", description: "The id of one to take back (only when they asked)" },
      },
      required: ["tripId"],
    },
  },
  {
    name: "tell_ken",
    description: "Pass a message about WANDER ITSELF to Ken, who builds it: a wish for something it could do, something confusing or hard to find, something that looks wrong. Use when they ask you to ('Tell Ken…', 'let Ken know…', 'send that to Ken', or yes to your offer), and when they tell you they don't like something about Wander ('I don't like…', 'this is annoying', 'why does it…') — Scout told them so (Ken, Oct 23): pass it, then say you have. Their own words, exactly as they said them (leave out only 'Tell Ken'); one message per thought. Never for a personal message to Ken ('tell Ken I'll be late', 'tell Ken to meet us at 7') — that's a text from them, not you. Any picture they sent with it goes along. Rule 59.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        words: { type: "string", description: "Their words exactly as they said them — never your summary. If dictation clearly garbled a word, keep their words and add nothing." },
      },
      required: ["tripId", "words"],
    },
  },
  {
    name: "add_wander_idea",
    description: "Post an idea about WANDER ITSELF to Ideas for Wander — Ken and Andy's place for making Wander better — when its member asks: 'Wander idea: …', 'For Ideas for Wander: …', 'add that to Ideas for Wander', 'put this in Ideas'. Their own words exactly; any picture they sent with it goes along. Members only: for anyone else, use tell_ken instead (on their yes). Rule 60.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        words: { type: "string", description: "Their words exactly as they said them, without 'Wander idea:' or 'For Ideas for Wander' — never your summary." },
      },
      required: ["tripId", "words"],
    },
  },
  {
    name: "add_expense",
    description: "Keep a payment one couple made for the group, so the two couples come out even at the end (shared half and half): 'we paid ¥12,400 for dinner', 'Andy just spent 12400', 'Larisa paid $85 for the taxi'. paidBy: the couple, or anyone in it — 'we'/'I' is the person talking. Yen unless they say dollars. Rule 61.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        paidBy: { type: "string", description: "Who paid: a person's name (their couple counts) or the couple ('Andy & Julie'); for 'we' or 'I', the person talking" },
        amount: { type: "number", description: "The amount as said, a number: 12400, or 85.5" },
        currency: { type: "string", enum: ["JPY", "USD"], description: "JPY (yen) unless they said dollars" },
        what: { type: "string", description: "What it was for, in their words, if they said ('dinner at Yazawa'); leave out if not said" },
        date: { type: "string", description: "The trip day it was spent, YYYY-MM-DD, when not today" },
        forCouple: { type: "string", description: "Shared, half each, is the default: leave this out. Only when their words clearly say it's wholly the OTHER couple's (Julie bought Larisa a jacket → Larisa): that couple, who then owe it all back. Never the couple that paid. Unclear (a gift? something just for them?) → ask before keeping. Rule 61." },
        receipt: { type: "boolean", description: "true when they sent a photo of this payment's receipt with this message: the photo is kept with the payment (the amount is still yours to give, read from it)" },
      },
      required: ["tripId", "paidBy", "amount"],
    },
  },
  {
    name: "remove_expense",
    description: "Take away a payment kept by mistake (the one they mean, from money_so_far's list, by its id). Only who added it, or Ken, can. Rule 61.",
    input_schema: { type: "object" as const, properties: { tripId: { type: "string" }, id: { type: "string" } }, required: ["tripId", "id"] },
  },
  {
    name: "put_back_expense",
    description: "Put back a payment that was taken away, so it counts again (the one they mean, from money_so_far's takenAway list, by its id). Only who added it, or Ken, can. Rule 61.",
    input_schema: { type: "object" as const, properties: { tripId: { type: "string" }, id: { type: "string" } }, required: ["tripId", "id"] },
  },
  {
    name: "change_expense",
    description: "Change a payment already kept — how much, yen or dollars, which couple paid, or what it was for (the one they mean, from money_so_far's list, by its id). Give only what changes. Only who added it, or Ken, can. Rule 61.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" }, id: { type: "string" },
        amount: { type: "number", description: "The new amount, as said" },
        currency: { type: "string", enum: ["JPY", "USD"] },
        paidBy: { type: "string", description: "The couple (or anyone in it) who really paid" },
        what: { type: "string", description: "What it was for, in their words; an empty string takes it out" },
        forCouple: { type: "string", description: "Who it's wholly for — a couple or anyone in it — or 'shared' to make it half each again" },
      },
      required: ["tripId", "id"],
    },
  },
  {
    name: "money_so_far",
    description: "Who pays next, each couple's total, what one couple owes the other to be even, and every payment kept (newest first, with ids). For 'who pays next?', 'where are we on money?', 'how much have we spent?', and before remove_expense, put_back_expense (its takenAway list) or change_expense. Rule 61.",
    input_schema: { type: "object" as const, properties: { tripId: { type: "string" } }, required: ["tripId"] },
  },
  {
    name: "keep_in_my_notes",
    description: "Keep what the person tells you about the trip in their Notes (the Notes tab), word for word, on the day it's about. Their notes are the trip's story — later summaries are made from them. Use it when they tell you something that happened, what they saw or learned, who they met, or why the day went as it did ('we came here because our guide drove us…', 'the potter's family has fired kilns for ten generations'), or ask you to note or remember something. Not for questions, and not for plans (that's add_same_day_plan — when they tell both, do both). Only they see it unless they ask for the trip to see it.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        words: { type: "string", description: "Their own words about it, exactly as they said them — never your summary or rewording. Leave out only words said to you ('Scout, note that'). With fromScout: your own earlier answer's words, exactly as you wrote them (the whole list or the part they want)." },
        fromScout: { type: "boolean", description: "True only when they ask you to keep something YOU said — your list, your answer ('put that in my notes', 'remember that list'). It's kept marked as from Scout, never as their words. Keep the part of your answer they mean, exactly as you wrote it; don't write it anew." },
        date: { type: "string", description: "YYYY-MM-DD, the trip day it's about (today unless they say otherwise)" },
        place: { type: "string", description: "The town it happened in, only when their own words name one ('a little shop in Arita' → 'Arita'); otherwise leave it out and the note goes under that day's city. With fromScout: the trip's city your answer is about ('Kyoto' for Kyoto dinners), if it's about one" },
        shareWithTrip: { type: "boolean", description: "Only when they ask for everyone on the trip to see it" },
      },
      required: ["tripId", "words", "date"],
    },
  },
  {
    name: "packing_tips",
    description: "The checked list of things Americans most often say they wish they'd brought to Japan, each with why and, for rules (medicines, luggage on the bullet train, plugs), the official source. Use when someone asks what to pack or bring, or asks for the packing list Scout offered Julie ('I want that too').",
    input_schema: { type: "object" as const, properties: { tripId: { type: "string" } }, required: ["tripId"] },
  },
  {
    name: "get_weather",
    description: "Wander's own forecast: the one the day pages and Home show, for the person asking. For each day: where they sleep that night (their hotel), and where her plan takes them that day when that's somewhere else (a day trip, or where a travel day starts); the temperatures, the chance of rain and how much, the hours rain is most likely (up to 3 days out), and how sure. Use for ANY weather question about the trip's days: today, tonight, tomorrow, this week, 'do I need an umbrella', 'will it be cold in Nikko'. With town: any other town in Japan on those days, including one their day passes through (where a ride, walk or tour goes). With hours: the temperature and chance of rain hour by hour for that part of the day, and how far Europe's and the US forecasts run from it.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" },
        dates: { type: "array", items: { type: "string" }, description: "Japan dates, YYYY-MM-DD (today if none). Up to 16." },
        town: { type: "string", description: "Only for a town in Japan that isn't where their plan has them, e.g. 'Kanazawa', or one their day passes through, e.g. 'Kanuma' on a ride." },
        hours: { type: "object", description: "Japan's hours, 0–23, both included: { from: 13, to: 18 } for 1 to 6 PM. For a question about part of a day ('this afternoon', 'from 1 to 6', 'when we ride').", properties: { from: { type: "number" }, to: { type: "number" } } },
      },
      required: ["tripId"],
    },
  },
  {
    name: "get_todos",
    description: "List the trip's to-dos on the Actions screen: those from the Actions tab of Larisa's Guide and those added in Wander, with who each is for and whether it's done.",
    input_schema: { type: "object" as const, properties: { tripId: { type: "string" } }, required: ["tripId"] },
  },
  {
    name: "add_todo",
    description: "Add a to-do on the Actions screen ('remind us to get yen'), for everyone or one person, with an optional by-when. It's added in Wander — Larisa's Guide is not changed.",
    input_schema: {
      type: "object" as const,
      properties: {
        tripId: { type: "string" }, action: { type: "string", description: "What needs doing" },
        owner: { type: "string", description: "Who it's for: a first name, or 'Both' for everyone (default)" },
        dueDate: { type: "string", description: "By when, in plain words ('Oct 20') — optional" },
        notes: { type: "string" },
      },
      required: ["tripId", "action"],
    },
  },
  {
    name: "set_todo_done",
    description: "Tick a to-do off, or open it again (done: false). Works for any to-do on the Actions screen; ticking one from Larisa's Guide marks it done in Wander only.",
    input_schema: { type: "object" as const, properties: { tripId: { type: "string" }, todoId: { type: "string" }, done: { type: "boolean" } }, required: ["tripId", "todoId", "done"] },
  },
  {
    name: "set_deadline_done",
    description: "Mark a deadline from Larisa's Guide done in Wander (e.g. 'I reconfirmed Robuchon'), or not done (done: false). Wander's record only — her sheet isn't changed. Name it by its words as the deadlines status lists it. Only when the person says it's done; never assume.",
    input_schema: { type: "object" as const, properties: { tripId: { type: "string" }, deadline: { type: "string", description: "Its words, e.g. 'Reconfirm the La Table de Joël Robuchon dinner'" }, done: { type: "boolean" } }, required: ["tripId", "deadline", "done"] },
  },
  {
    name: "remove_todo",
    description: "Take out a to-do that was added in Wander. Never one from Larisa's Guide — that goes when she takes it out of her sheet. Find the id with get_todos.",
    input_schema: { type: "object" as const, properties: { tripId: { type: "string" }, todoId: { type: "string" } }, required: ["tripId", "todoId"] },
  },
  {
    name: "get_same_day_plans",
    description: "List the same-day plans people added in Wander, for one date or the whole trip.",
    input_schema: {
      type: "object" as const,
      properties: { tripId: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD (optional)" } },
      required: ["tripId"],
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
    description: "Bring back something that was deleted (experience, reservation, accommodation, day). Use only when someone names something deleted: 'undo that delete', 'restore [name]', 'I didn't mean to delete [name]'. Never for 'bring it back' about something you said or they kept — that's their Notes (rule 41b). Requires the changeLogId from get_change_log.",
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

// Tools Scout is no longer offered (Sep 2026). Larisa's Guide is the master plan;
// Wander is downstream of it. An AI must never be able to delete or restructure the
// trip — cities, days, dates, bookings, hotels, route legs, or whole trips. Their
// implementations below stay in place (unreachable) in case a safer form returns.
const WITHDRAWN_TOOLS = new Set([
  // Train status read Wander's old route list (empty — the trains are in Ken's rail sheet) and told Scout "No train
  // segments in your itinerary" with nothing live: a false fact (best-information audit, Oct 10). Scout uses web
  // search for live status, labelled as found online, until a status check is built on the rail sheet's trains
  "check_transit_status",
  // Who is on the trip and who plans it: planners decide, from People — never Scout
  "add_trip_members",
  "change_member_role",
  // Sign-in links come only from People, which shares them without ever showing the code
  // (a link Scout printed in chat was already retired and scrolled away)
  "resend_invite",
  "delete_experience",
  "bulk_delete_experiences",
  "delete_city",
  "delete_day",
  "delete_reservation",
  "delete_accommodation",
  "delete_route_segment",
  "delete_decision",
  "shift_trip_dates",
  "bulk_update_days",
  "update_day_date",
  "update_city_dates",
  "reassign_day",
  "reorder_cities",
  "hide_city",
  "create_trip",
  "activate_trip",
  "set_trip_anchor",
  // April's "learnings" never kept anything (it wanted a person's id the tool never asked for; production has none) —
  // and Scout reached for it when Ken said "remember" (Oct 13). Remembering goes in Notes: keep_in_my_notes
  "save_learning",
  "get_learnings",
]);

// Scout searches and reads the web with Anthropic's own tools (they need no other key, so they work
// wherever Scout does — the old search needed a Brave key that wasn't always set, and Scout said it
// "couldn't pull a live forecast"). The old client-side web_search stays defined but isn't offered.
const offeredTools: Anthropic.ToolUnion[] = [
  ...tools.filter((t) => !WITHDRAWN_TOOLS.has(t.name) && t.name !== "web_search"),
  // The basic search and fetch: each claim from the web comes back with its page's title, address and the
  // words quoted, for "Sources". The newer filtering search (web_search_20260209) dropped those citations
  // and took 34 s against 13 s on the same question (probe, Sep 30 2026).
  { type: "web_search_20250305", name: "web_search", max_uses: 5 },
  { type: "web_fetch_20250910", name: "web_fetch", max_uses: 3, citations: { enabled: true } },
];
/** The tools Scout is offered — exported for size checks (tools are part of every question's prompt) */
export const scoutTools = offeredTools;

// Scout can't unlock anyone's vault (it only has the signed-in session), so vault-protected
// document details never pass through it — same types the vault protects on screen
// (routes/travelerDocuments.ts SENSITIVE_TYPES).
const VAULT_PROTECTED_TYPES = ["passport", "visa", "insurance"];
function maskVaultDocument<T extends { type: string; data: unknown }>(doc: T): T {
  if (!VAULT_PROTECTED_TYPES.includes(doc.type)) return doc;
  return { ...doc, data: { locked: true, howToSee: "Open your vault in Profile to see these details." } };
}

// Execute a tool call and return the result
const NOT_YOURS = "That's part of Larisa's Guide, so Wander doesn't change it (the next read of her Guide would undo it anyway). Offer instead: a same-day plan (add_same_day_plan), a note on the idea, or a message to Larisa.";

export async function guideItemRefusal(toolName: string, input: any): Promise<string | null> {
  const isGuideIdea = async (id: string) => {
    const e = await prisma.experience.findUnique({ where: { id }, select: { sheetRowRef: true } });
    return !!e?.sheetRowRef && !e.sheetRowRef.startsWith("Removed from Guide|");
  };
  switch (toolName) {
    case "promote_experience": case "demote_experience": case "update_experience": case "move_experience":
      return input?.experienceId && (await isGuideIdea(String(input.experienceId))) ? NOT_YOURS : null;
    case "reorder_experiences":
      for (const id of (input?.experienceIds || []) as string[]) if (await isGuideIdea(String(id))) return NOT_YOURS;
      return null;
    case "update_day_notes": {
      const day = input?.dayId ? await prisma.day.findUnique({ where: { id: String(input.dayId) }, select: { tripId: true } }) : null;
      const fromGuide = day ? await prisma.guideSnapshot.count({ where: { tripId: day.tripId } }) : 0;
      return fromGuide ? NOT_YOURS : null;
    }
    case "update_city": {
      const c = input?.cityId ? await prisma.city.findUnique({ where: { id: String(input.cityId) }, select: { guideKey: true } }) : null;
      return c?.guideKey ? NOT_YOURS : null;
    }
    case "update_accommodation": {
      const a = input?.accommodationId ? await prisma.accommodation.findUnique({ where: { id: String(input.accommodationId) }, select: { guideKey: true } }) : null;
      return a?.guideKey ? NOT_YOURS : null;
    }
    default:
      return null;
  }
}

/**
 * Takes a "Message for Larisa: …" line off a reply nobody asked a message for. Asked means the question
 * itself wants her told ("text Larisa…", "draft a note", "let her know"), or it says yes to Scout's own
 * offer on the previous turn ("Want me to draft a note to Larisa?" → "yes"). Never for Larisa herself.
 */
/**
 * Scout's answer arrives in pieces around a web search. Joined as they come, a line said before searching
 * ("I'll check — the Raku Museum is on your plan…") stayed in and ran into the answer ("afternoon.Yes —").
 * Pieces are joined with a space where a sentence ended, and "let me check" narration is taken out.
 */
export function joinAnswerPieces(pieces: string[]): string {
  let out = "";
  for (const p of pieces) {
    if (!p) continue;
    out += out && /[.!?]$/.test(out) && /^[A-Z*]/.test(p) ? ` ${p}` : p;
  }
  return withoutNarration(out.trim());
}
export function withoutNarration(text: string): string {
  return text
    // "I'll check — …" / "Let me check the hours." / "Let me look that up:" at the start of a sentence
    .replace(/(^|(?<=[.!?]\s)|(?<=\n))(?:I'll|I will|Let me|Let's) (?:check|look(?: that)? up|look|see|search)\b[^.!?\n—:]*(?:[.!?:]\s*|\s*—\s*[^.!?\n]*[.!?]\s*)/gi, "$1")
    // A false start corrected mid-sentence: "Tomorrow morning — Fri… rather, the Imperial is…" (Sep 30, 1 in 4)
    .replace(/\b[A-Za-z]{1,9}(?:…|\.\.\.)\s*(?:rather|sorry|I mean|make that|no)\b,?\s*/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Tool markup written out as text instead of used as a tool (Sep 30 exam, H19: the whole answer to "how do
 * we get to Une Immersion tonight?" was `<invoke name="show_in_wander"><parameter …>` — a traveler would
 * have seen that). Returns the text without it, and whether any was there.
 */
const TOOL_MARKUP = /<(?:antml:)?function_calls>[\s\S]*?<\/(?:antml:)?function_calls>|<(?:antml:)?invoke\b[\s\S]*?<\/(?:antml:)?invoke>|<\/?(?:antml:)?(?:invoke|parameter|function_calls)\b[^>]*>/g;
export function withoutToolMarkup(text: string): { text: string; had: boolean } {
  const had = /<\/?(?:antml:)?(?:invoke|parameter|function_calls)\b/.test(text);
  return { text: had ? text.replace(TOOL_MARKUP, "").replace(/\n{3,}/g, "\n\n").trim() : text, had };
}

export function withoutUnaskedDraft(reply: string, message: string, history: unknown, asker?: string | null): string {
  if (!/Message for Larisa:/i.test(reply)) return reply;
  const q = String(message || "");
  const asked = /\b(message|text|tell|ask|email|note to|let)\b[^.?!]{0,40}\blarisa\b/i.test(q)
    || /\blarisa\b[^.?!]{0,40}\b(know|message|text|told)\b/i.test(q)
    || /\b(draft|write)\b[^.?!]{0,30}\b(note|message|text)\b/i.test(q);
  // The app sends history as { role, text } (ChatBubble); "content" is accepted too
  const last = Array.isArray(history) ? [...history].reverse().find((h: any) => h?.role === "assistant") : null;
  const lastWords = String((last as any)?.text ?? (last as any)?.content ?? "");
  const offered = /draft|message|note/i.test(lastWords) && /larisa/i.test(lastWords);
  const saidYes = /^\s*(yes|yeah|yep|sure|ok(ay)?|please|do it|go ahead|sounds good)\b/i.test(q);
  if (/^larisa$/i.test(String(asker || "").trim()) || !(asked || (offered && saidYes))) {
    return reply.replace(/\n*\s*\**Message for Larisa:\**[\s\S]*$/i, "").trimEnd();
  }
  return reply;
}

export async function executeTool(
  toolName: string,
  input: any,
  user: { code: string; displayName: string; travelerId?: string },
  // what the person said in this conversation, newest first, word for word (keep_in_my_notes keeps only their words)
  said?: string[],
  // what Scout said in it, newest first (keep_in_my_notes with fromScout: Scout's own answer, kept as Scout's)
  scoutSaid?: string[],
  // where they are and what they sent with this message (tell_ken keeps the screen and one picture)
  asked?: { screen?: string | null; image?: { mediaType: string; data: string } | null },
): Promise<{ result: any; actionDescription?: string; placeCards?: any[]; navigate?: { path: string; label: string; go: boolean; headline?: string }; route?: { label: string; apple: string; google: string; search?: string }; forecasts?: { date: string; weather: unknown }[] }> {
  // Larisa's own items (her ideas, stops, hotels, days) come from her Guide; the next read of it
  // would silently undo any change Scout made to them, losing what the person meant. So Scout
  // doesn't change them — it adds a note or a same-day plan, which always survive.
  const guideRefusal = await guideItemRefusal(toolName, input);
  if (guideRefusal) return { result: { error: guideRefusal } };

  if (WITHDRAWN_TOOLS.has(toolName)) {
    return { result: { error: "Scout can't delete or restructure the trip. Changes to the plan happen in Larisa's Guide." } };
  }
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
        result: { saved: true, documentId: doc.id, type: input.type, data: maskVaultDocument({ type: input.type, data: input.data }).data, forTraveler: targetName },
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
        result: { updated: true, documentId: updated.id, type: updated.type, data: maskVaultDocument(updated).data },
        actionDescription: `Updated ${(updated.type || "travel").replace("_", " ")} for ${user.displayName}`,
      };
    }

    case "get_my_documents": {
      const myProfile = await prisma.travelerProfile.findUnique({
        where: { tripId_userCode: { tripId: input.tripId, userCode: user.code } },
        include: { documents: { orderBy: { createdAt: "asc" } } },
      });
      return { result: (myProfile?.documents || []).map(maskVaultDocument) };
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
        ).map((d) => maskVaultDocument({ id: d.id, type: d.type, label: d.label, data: d.data, isPrivate: d.isPrivate })),
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
    // Flagging an idea for the group is "I'm in" (Maybes, Oct 2 2026) — one kind of interest, marked as Wander's, which
    // a new Guide copy never takes away (flags written the old way were replaced with her marks on every import)
    case "float_to_group":
    case "im_in": {
      if (!user.travelerId) return { result: { error: "Sign in as yourself to say you're in" } };
      const exp = await prisma.experience.findUnique({ where: { id: input.experienceId }, include: { city: true } });
      if (!exp) return { result: { error: "Experience not found" } };
      const on = input.on !== false;
      const r = await setIn(user as any, exp.id, on, input.forName || null, " (via chat)");
      if (input.note && String(input.note).trim() && user.travelerId) {
        await prisma.experienceNote.create({ data: { experienceId: exp.id, travelerId: user.travelerId, content: String(input.note).trim(), visibility: "group" } });
      }
      const who = input.forName ? `${String(input.forName).split(/\s+/)[0]} (via you)` : "You";
      return {
        result: { experience: exp.name, city: exp.city.name, on, interested: r.interests.map((i) => i.displayName) },
        actionDescription: on ? `${who} — in on "${exp.name}"` : `${who} — no longer in on "${exp.name}"`,
      };
    }

    case "take_back_maybe":
    case "remove_from_maybes": {
      try {
        const r = await removeFromMaybes(user as any, input.experienceId, " (via chat)");
        return { result: { offTheList: r.name, city: r.city, alreadyOff: r.already }, actionDescription: `Off ${r.city}'s maybes: "${r.name}"` };
      } catch (e) {
        if (e instanceof MaybeError) return { result: { error: e.message } };
        throw e;
      }
    }

    case "put_back_on_maybes": {
      try {
        const r = await putBackOnMaybes(user as any, input.experienceId, " (via chat)");
        return { result: { backOnTheList: r.name, city: r.city, alreadyOn: r.already }, actionDescription: `Back on ${r.city}'s maybes: "${r.name}"` };
      } catch (e) {
        if (e instanceof MaybeError) return { result: { error: e.message } };
        throw e;
      }
    }

    // "Maybe we should…" (Maybes, Oct 2 2026): on the city's list for everyone, as the Maybes screen does it
    case "add_maybe": {
      if (!user.travelerId) return { result: { error: "Sign in as yourself to add a maybe" } };
      try {
        const { maybe, city, again } = await createMaybe(user as any, input.tripId, input.cityId, String(input.words || ""), input.link || null, " (via chat)");
        return {
          result: { maybeId: maybe.id, words: maybe.name, link: maybe.sourceUrl, city, alreadyThere: again },
          actionDescription: `On ${city}'s maybes: "${maybe.name}"`,
        };
      } catch (e) {
        if (e instanceof MaybeError) return { result: { error: e.message } };
        throw e;
      }
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
      // (one phrase, once: Scout put "not feeling well" on the card four ways in one morning — Ken, Oct 13. The same words
      // are refused here, the everyday ones included; whether two phrases MEAN the same is Scout's call from the PHRASE
      // CARD line — a word-overlap test blocked "Where is the toilet?" for "Where is the station?", verify29)
      const { samePhrase, cardPhrases, firstOnAddersCard } = await import("../services/phrasePrefs.js");
      const onCard = (await cardPhrases(input.tripId)).filter((p) => !p.removedAt);
      const twin = input.anotherWay === true ? null : onCard.find((p) => samePhrase(p.english, String(input.english || "")) || samePhrase(p.local, String(input.romaji || "")));
      if (twin) {
        // (one they took off their own card: it's still on everyone's, so it comes back to theirs — verify30)
        const meId = (user as any).travelerId as string | undefined;
        const { phrasePrefsOf, savePhrasePrefs } = await import("../services/phrasePrefs.js");
        if (meId && (await phrasePrefsOf(meId, input.tripId)).hidden.includes(twin.key)) {
          const prefs = await phrasePrefsOf(meId, input.tripId);
          await savePhrasePrefs(meId, input.tripId, { hidden: prefs.hidden.filter((k) => k !== twin.key) });
          return { result: { backOnTheirCard: { english: twin.english, romaji: twin.local }, say: "It was on the card; they had taken it off theirs, and it's back on it now." }, actionDescription: `Back on your phrase card: ${twin.local}` };
        }
        // (verify52: "How do I say thank you?" got no way to say it, and "so I haven't added it twice" — app-speak)
        return { result: { alreadyOnCard: { english: twin.english, romaji: twin.local, pronunciation: twin.pronunciation || null, script: twin.script || null }, say: "Give them the phrase as it is on the card and how to say it (the romaji, then its pronunciation), and that it's on their phrase card under 日. Don't mention adding or not adding it." } };
      }
      const phrase = await prisma.tripPhrase.create({
        data: {
          tripId: input.tripId,
          english: input.english,
          romaji: input.romaji,
          ...(typeof input.pronunciation === "string" && input.pronunciation.trim() ? { pronunciation: input.pronunciation.trim().slice(0, 300) } : {}),
          ...(typeof input.script === "string" && /[぀-ヿ㐀-鿿]/.test(input.script) ? { script: input.script.trim().slice(0, 600) } : {}),
          ...(Array.isArray(input.followUps) && input.followUps.length ? { followUps: (await import("../services/phraseSuggest.js")).checkedFollowUps(input.followUps) } : {}),
          addedBy: user.displayName,
        },
      });
      await firstOnAddersCard((user as any).travelerId, input.tripId, phrase.id).catch(() => {});
      return {
        result: { saved: true, english: phrase.english, romaji: phrase.romaji, pronunciation: phrase.pronunciation, script: (phrase as any).script || null, where: "first on their phrase card; at the bottom of everyone else's" },
        actionDescription: `Added phrase: "${phrase.english}" → ${phrase.romaji}`,
      };
    }

    // The asker's own phrase card, arranged as the card's Edit does (Ken, Oct 13: "Need to be able to remove phrases.
    // And to rearrange the order") — services/phrasePrefs
    case "arrange_my_phrases": {
      const me = (user as any).travelerId as string | undefined;
      if (!me) return { result: { error: "Phrase cards are per person — this sign-in has no person." } };
      if (!(await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId: input.tripId, travelerId: me } } }))) {
        return { result: { error: "That trip isn't one of yours." } };
      }
      const { cardPhrases, phrasePrefsOf, savePhrasePrefs, arranged, mayRemoveForAll } = await import("../services/phrasePrefs.js");
      const every = await cardPhrases(input.tripId);
      // (taken off everyone's card: only put_back can name it, and only for those who may)
      const all = every.filter((p) => !p.removedAt || String(input.action) === "put_back");
      const flat = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const want = flat(String(input.phrase || ""));
      if (!want) return { result: { error: "Which phrase?" } };
      const exact = all.filter((p) => flat(p.english) === want || flat(p.local) === want);
      const near = exact.length ? exact : all.filter((p) => flat(p.english).includes(want) || flat(p.local).includes(want));
      if (near.length !== 1) {
        return { result: { error: near.length ? "More than one phrase fits — ask which they mean." : "No phrase on the card fits that.", onTheCard: all.map((p) => `${p.local} (${p.english})`) } };
      }
      const hit = near[0];
      // An added phrase they may take off everyone's card (they added it, or they're the trip's organizer): it goes off
      // everyone's — the Maybes rule; hidden, never deleted
      const forAll = !!hit.id && await mayRemoveForAll({ travelerId: me, displayName: user.displayName }, { tripId: input.tripId, addedBy: hit.addedBy || "" });
      // (off everyone's only when asked for in so many words — otherwise their own card, as anyone's: Ken, Oct 14)
      if (String(input.action) === "remove" && forAll && input.forEveryone === true) {
        await prisma.tripPhrase.update({ where: { id: hit.id! }, data: { removedAt: new Date(), removedBy: user.displayName } });
        return { result: { done: true, phrase: `${hit.local} (${hit.english})`, offEveryonesCard: true, say: "One short line: it's off the phrase card for everyone, and can be put back." }, actionDescription: `Off the phrase card: ${hit.local}` };
      }
      if (String(input.action) === "put_back" && hit.removedAt) {
        if (!forAll) return { result: { error: "Only the person who added it, or the trip's organizer, can put it back." } };
        await prisma.tripPhrase.update({ where: { id: hit.id! }, data: { removedAt: null, removedBy: null } });
        return { result: { done: true, phrase: `${hit.local} (${hit.english})`, backOnEveryonesCard: true }, actionDescription: `Back on the phrase card: ${hit.local}` };
      }
      const prefs = await phrasePrefsOf(me, input.tripId);
      let { hidden } = prefs;
      let order = arranged(all.map((p) => p.key), prefs);
      const action = String(input.action);
      if (action === "remove") hidden = [...new Set([...hidden, hit.key])];
      else if (action === "put_back") hidden = hidden.filter((k) => k !== hit.key);
      else if (action === "move_to_top") { order = [hit.key, ...order.filter((k) => k !== hit.key)]; hidden = hidden.filter((k) => k !== hit.key); }
      else if (action === "move_to_bottom") { order = [...order.filter((k) => k !== hit.key), hit.key]; hidden = hidden.filter((k) => k !== hit.key); }
      else return { result: { error: "Say remove, put_back, move_to_top or move_to_bottom." } };
      await savePhrasePrefs(me, input.tripId, { order, hidden });
      const words = { remove: "Taken off your phrase card", put_back: "Back on your phrase card", move_to_top: "First on your phrase card", move_to_bottom: "Last on your phrase card" }[action as "remove"];
      return {
        result: { done: true, phrase: `${hit.local} (${hit.english})`, onlyTheirCard: true, say: "One short line: what changed, on their own card only. 'Put back' brings a removed one back.",
          ...(action === "remove" && input.forEveryone === true && !forAll ? { notForEveryone: "Only the person who added it, or the trip's organizer, can take it off everyone's card; it's off theirs." } : {}) },
        actionDescription: `${words}: ${hit.local}`,
      };
    }

    case "directions": {
      const place = String(input.place || "").replace(/\s+/g, " ").trim();
      if (!place) return { result: { error: "Which place? Name it as her Guide does." } };
      const town = String(input.town || "").trim();
      const tripId = String(input.tripId || "");
      // her words, without a leading emoji, with "(Yotsuya)" read as part of the address
      const dest = place.replace(/^[^\p{L}\p{N}]+/u, "").replace(/\s*\(([^)]*)\)\s*/g, ", $1").replace(/,\s*$/, "").trim();
      // Her own place for it, best first: the pin of a Google Maps place she linked (Tokyodo), the address she wrote
      // ("Address: UNE IMMERSION · 1-28-8 Hommachi, Shibuya-ku…"), the place her own map link names (Apple's ?q=) —
      // and only then Scout's words and the town (Oct 2: the taxi to dinner searched "UNE IMMERSION, Tokyo")
      const flat = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      let herPlace: string | null = null;
      const want = flat(dest.split(",")[0]);
      // (a town alone — "Kyoto" — is no one place: her many Kyoto lines aren't looked through)
      const towns = tripId ? (await prisma.city.findMany({ where: { tripId }, select: { name: true } })).map((c) => flat(c.name)) : [];
      if (tripId && want.length >= 4 && want !== flat(town) && !towns.includes(want)) {
        // (her line's own name is this place — "🍽️ DINNER RESERVATION: UNE IMMERSION (Shibuya/Hatsudai)" is Une Immersion;
        // "ART AQUARIUM MUSEUM GINZA" isn't Ginza: Scout's words must be at least half of her name for it)
        const words = (s: string) => s.split(" ").filter(Boolean).length;
        const nameOf = (t: string) => flat(t.replace(/\([^)]*\)/g, " ").replace(/^[^:]*:\s*/, ""));
        // (a place named exactly so beats longer names that hold it — Oct 12: her "Tokoname Station Bicycle Parking" pin
        // beside "Tokoname Station" made two places, and the button only searched Maps)
        const exactFirst = <T,>(xs: T[], name: (x: T) => string) => { const e = xs.filter((x) => name(x) === want); return e.length ? e : xs; };
        const named = exactFirst((await prisma.guideItem.findMany({ where: { tripId }, select: { title: true, link: true, detail: true } }))
          .filter((i) => { const n = nameOf(i.title); return n === want || (n.includes(want) && words(want) * 2 >= words(n)); }), (i) => nameOf(i.title));
        // (only when her lines agree on one place: "Ginza" names many, and a button to the first would be wrong)
        const one = (xs: (string | null | undefined)[]) => { const u = [...new Set(xs.filter(Boolean) as string[])]; return u.length === 1 ? u[0] : null; };
        const pin = one(named.map((i) => { const m = i.link?.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/); return m ? `${m[1]},${m[2]}` : null; }));
        const address = one(named.map((i) => (i.detail || "").match(/^Address:\s*(?:[^·\n]*·\s*)?([^\n]{8,})$/m)?.[1]?.trim()));
        const linkWords = one(named.map((i) => {
          try {
            const u = new URL(i.link || "");
            if (/(^|\.)maps\.apple\.com$/.test(u.hostname)) return u.searchParams.get("q");
            if (/\/maps\/place\//.test(u.pathname)) return decodeURIComponent(u.pathname.split("/maps/place/")[1].split("/")[0].replace(/\+/g, " "));
          } catch { /* not a link */ }
          return null;
        }));
        // (the place on her Apple Maps guide of that name — "UMENO VASE SHOP" — when her sheet gives no pin or address;
        // the same name rule, and only one place: a different branch on her map is never swapped in)
        // (…or on her Google map — Oct 11 — the same rule)
        // (never a pin far from the whole trip — her Sannenzaka pin sat in Wakayama, 100 km from Kyoto; Oct 11)
        const { strayPinsOf } = await import("../services/guide/nearby.js");
        const stray = pin || address ? new Map<string, unknown>() : await strayPinsOf(tripId);
        const onMap = pin || address ? null : one(exactFirst([...(await appleGuidesOf(tripId)).flatMap((g) => g.places), ...(await myMapPlaces(tripId)).map((p) => ({ name: p.name, lat: p.lat, lng: p.lng }))]
          .filter((p) => p.name && p.lat != null && p.lng != null && !stray.has(`${p.lat.toFixed(5)},${p.lng.toFixed(5)}`) && (() => { const n = nameOf(p.name!); return n === want || (n.includes(want) && words(want) * 2 >= words(n)); })()), (p) => nameOf(p.name!))
          .map((p) => `${p.lat},${p.lng}`));
        // (a hotel's address from its booking — "back to the Imperial" — when no line of hers gives one)
        const stay = pin || address || onMap ? null : one((await prisma.accommodation.findMany({ where: { tripId, address: { not: null } }, select: { name: true, address: true } }))
          .filter((s) => flat(s.name).length >= 4 && (want.includes(flat(s.name)) || flat(s.name).includes(want))).map((s) => s.address));
        herPlace = pin || address || onMap || stay || (linkWords ? `${linkWords}${town ? `, ${town}` : ""}` : null);
      }
      // Wander's own note on the place, when nothing of hers gives where it is — Shirakabeso's Izu address, from Backroads.
      // (A note names one place exactly, so it counts even where the place shares its name with a stop on the trip —
      // her Guide calls the Oct 21–22 stop "Shirakabeso" too.)
      if (!herPlace && tripId) {
        const known = noteFor(await placeNotesOf(tripId), dest.split(",")[0]);
        if (known) herPlace = known.lat != null && known.lng != null ? `${known.lat},${known.lng}` : known.address;
      }
      const where = herPlace || `${dest}${town && !flat(dest).includes(flat(town)) ? `, ${town}` : ""}, Japan`;
      const way: "walk" | "train" | "taxi" = input.way === "train" || input.way === "taxi" ? input.way : "walk";
      const how = { walk: { verb: "Walk to", apple: "w", google: "walking" }, train: { verb: "Train to", apple: "r", google: "transit" }, taxi: { verb: "Taxi to", apple: "d", google: "driving" } }[way];
      // Scout never lies: with nothing of hers to go on, the button only searches Maps for a name — it says so, and so
      // does Scout (Ken, Oct 2: "This is travel and we could end up in the wrong place")
      const searchOnly = !herPlace;
      return {
        result: searchOnly
          ? { ok: true, shown: `a button that opens directions, but nothing of hers gives an address or map place for this, so Maps will only SEARCH for "${where}"`,
              // (verify15: a place found online got "her Guide has no address", as if it were hers)
              say: "Tell them plainly that the button searches Maps for this, so they should check the place Maps finds is the right one before setting off. Say her Guide has no address for it only when it's one of her places; a place you found online is never hers." }
          : { ok: true, shown: `a button that opens ${way === "walk" ? "walking" : way === "train" ? "train and subway" : "driving (for a taxi)"} directions from where they are standing to the place in her Guide (in Google Maps)` },
        route: {
          label: `${how.verb} ${dest.split(",")[0]}`,
          apple: `https://maps.apple.com/?daddr=${encodeURIComponent(where)}&dirflg=${how.apple}`,
          google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where)}&travelmode=${how.google}`,
          ...(searchOnly && { search: where.replace(/, Japan$/, "") }),
        },
      };
    }

    case "show_in_wander": {
      const tripId = String(input.tripId || "");
      const go = input.go === true;
      // A few words for Scout's small bar; the bar falls back to the answer's first line without it
      const headline = typeof input.headline === "string" ? input.headline.replace(/\s+/g, " ").trim().slice(0, 90) || undefined : undefined;
      const fixed: Record<string, [string, string]> = {
        back: ["back", "Back to where you were"],
        now: ["/now", "See what's next"], actions: ["/?actions=1", "Open Actions"], people: ["/people", "Open People on this trip"],
        home: ["/", "Open Home"], history: ["/history", "Open What's changed"], help: ["/guide", "Open How Wander works"],
      };
      if (input.target === "day") {
        const date = String(input.date || "").slice(0, 10);
        const day = /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? await prisma.day.findFirst({ where: { tripId, date: new Date(`${date}T00:00:00.000Z`) }, include: { city: { select: { name: true } } } })
          : null;
        if (!day) return { result: { error: `${date || "That date"} isn't a day of this trip — nothing opened.` } };
        // A moving day names both places ("Tokyo → Nikko"), as the day screen does — the 8:30 meeting is in Tokyo
        const prevDate = new Date(`${date}T00:00:00.000Z`);
        prevDate.setUTCDate(prevDate.getUTCDate() - 1);
        const prev = await prisma.day.findFirst({ where: { tripId, date: prevDate }, include: { city: { select: { name: true } } } });
        const where = prev?.city?.name && day.city?.name && prev.city.name !== day.city.name ? `${prev.city.name} → ${day.city.name}` : day.city?.name;
        const label = `Open ${plainDay(date)}${where ? ` · ${where}` : ""}`;
        // The line Scout is talking about: the screen scrolls to it and marks it, so it's never below the fold
        let hash = "";
        const want = typeof input.item === "string" ? input.item.toLowerCase().split(/[^a-z0-9]+/).filter((w: string) => w.length > 2) : [];
        if (want.length) {
          const { withDaySwaps } = await import("../services/guide/daySwaps.js");
          const items = await withDaySwaps(tripId, await prisma.guideItem.findMany({ where: { tripId, date: new Date(`${date}T00:00:00.000Z`), kind: { not: "stop" } }, select: { id: true, title: true, kind: true, date: true, source: true, sortOrder: true } }));
          const scored = items
            .map((i) => ({ i, n: want.filter((w: string) => i.title.toLowerCase().includes(w)).length }))
            .filter((x) => x.n > 0)
            .sort((a, b) => b.n - a.n || (a.i.kind === "deadline" ? 1 : 0) - (b.i.kind === "deadline" ? 1 : 0));
          if (scored[0]) hash = `#item-${scored[0].i.id}`;
        }
        return { result: { opened: go, screen: label }, navigate: { path: `/day/${date}${hash}`, label, go, headline } };
      }
      if (input.target === "ideas") {
        const want = String(input.city || "").trim().toLowerCase();
        const cities = await prisma.city.findMany({ where: { tripId, hidden: false }, select: { id: true, name: true } });
        const city = want ? cities.find((c) => c.name.toLowerCase() === want) || cities.find((c) => c.name.toLowerCase().includes(want) || want.includes(c.name.toLowerCase())) : null;
        if (want && !city) return { result: { error: `${input.city} isn't a stop on this trip — nothing opened. Stops: ${cities.map((c) => c.name).join(", ")}.` } };
        // "The Kyoto ideas I marked": the screen opens with that person's marks only — the words and the
        // screen agree (it used to open on everyone's, 12 ideas, while Scout said three)
        let by: string | null = null;
        if (typeof input.markedBy === "string" && input.markedBy.trim()) {
          const want = input.markedBy.trim().toLowerCase();
          const marks = await prisma.experienceInterest.findMany({
            where: { experience: { tripId, ...(city ? { cityId: city.id } : {}) } },
            select: { displayName: true },
          });
          const names = Array.from(new Set(marks.map((m) => m.displayName.replace(/\s*\(maybe\)$/i, ""))));
          by = names.find((n) => n.toLowerCase() === want) || names.find((n) => n.toLowerCase().startsWith(want)) || null;
          if (!by) return { result: { error: `${input.markedBy} hasn't marked any ideas${city ? ` in ${city.name}` : ""} — nothing opened.` } };
        }
        const label = city ? `Open Maybes · ${city.name}${by ? ` · ${by} is in` : ""}` : "Open Maybes";
        const query = [city ? `city=${city.id}` : null, by ? `by=${encodeURIComponent(by)}` : null].filter(Boolean).join("&");
        return { result: { opened: go, screen: label }, navigate: { path: query ? `/ideas?${query}` : "/ideas", label, go, headline } };
      }
      const f = fixed[input.target as string];
      if (!f) return { result: { error: "That isn't a screen in Wander." } };
      return { result: { opened: go, screen: f[1] }, navigate: { path: f[0], label: f[1], go, headline } };
    }

    case "add_idea_note": {
      const traveler = await prisma.traveler.findUnique({ where: { displayName: user.displayName }, select: { id: true } });
      if (!traveler) return { result: { error: "I couldn't tell who's asking — try again after signing in." } };
      const exp = await prisma.experience.findFirst({ where: { id: String(input.experienceId || ""), tripId: input.tripId }, select: { id: true, name: true, tripId: true } });
      if (!exp) return { result: { error: "That idea isn't on this trip — look it up with search_experiences first." } };
      if (!(await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId: exp.tripId, travelerId: traveler.id } } }))) return { result: { error: "That trip isn't one of yours." } };
      const content = String(input.content || "").trim().slice(0, 1000);
      if (!content) return { result: { error: "The note is empty." } };
      const visibility = input.justForMe === true ? "private" : "group";
      const note = await prisma.experienceNote.create({ data: { experienceId: exp.id, travelerId: traveler.id, content, visibility } });
      if (visibility === "group") {
        logChange({
          tripId: exp.tripId, user: user as any, actionType: "note_added", entityType: "experience_note", entityId: note.id,
          entityName: exp.name, description: `noted on ${exp.name}: "${content.slice(0, 80)}"`, newState: { experienceId: exp.id, content },
        }).catch(() => {});
      }
      return {
        result: { saved: true, idea: exp.name, whoSees: visibility === "group" ? "everyone on the trip" : "only you", guideChanged: false },
        actionDescription: `Note on ${exp.name}${visibility === "private" ? " (just for you)" : ""}`,
      };
    }

    case "take_back_idea_note": {
      const traveler = await prisma.traveler.findUnique({ where: { displayName: user.displayName }, select: { id: true } });
      if (!traveler) return { result: { error: "I couldn't tell who's asking — try again after signing in." } };
      const exp = await prisma.experience.findFirst({ where: { id: String(input.experienceId || ""), tripId: input.tripId }, select: { id: true, name: true, tripId: true } });
      if (!exp) return { result: { error: "That idea isn't on this trip." } };
      if (!(await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId: exp.tripId, travelerId: traveler.id } } }))) return { result: { error: "That trip isn't one of yours." } };
      const mine = await prisma.experienceNote.findMany({ where: { experienceId: exp.id, travelerId: traveler.id }, orderBy: { createdAt: "desc" } });
      const want = typeof input.text === "string" ? input.text.trim().toLowerCase() : "";
      const note = want ? mine.find((n) => n.content.toLowerCase().includes(want)) : mine[0];
      if (!note) return { result: { error: mine.length ? "None of your notes there match those words." : `You haven't written a note on ${exp.name}. (Only your own notes can be taken back.)` } };
      await prisma.experienceNote.delete({ where: { id: note.id } });
      if (note.visibility === "group") {
        // Its words leave the history too, as when it's taken back on screen
        await prisma.changeLog.updateMany({ where: { entityId: note.id, actionType: "note_added" }, data: { description: `noted on ${exp.name} (since taken back)`, newState: undefined } }).catch(() => {});
        logChange({
          tripId: exp.tripId, user: user as any, actionType: "note_removed", entityType: "experience_note", entityId: note.id,
          entityName: exp.name, description: `took back a note on ${exp.name}`, previousState: { experienceId: exp.id, content: note.content },
        }).catch(() => {});
      }
      return { result: { removed: true, idea: exp.name, note: note.content }, actionDescription: `Took back your note on ${exp.name}` };
    }

    case "add_same_day_plan": {
      const traveler = await prisma.traveler.findUnique({ where: { displayName: user.displayName }, select: { id: true } });
      if (!traveler) return { result: { error: "I couldn't tell who's asking — try again after signing in." } };
      const added = await addDayChoice({ tripId: input.tripId, travelerId: traveler.id, date: input.date, text: input.text, time: input.time, experienceId: input.experienceId });
      if (!added.ok) return { result: { error: added.error } };
      // In History like one added by tapping
      logChange({
        tripId: input.tripId, user: user as any, actionType: "day_choice_added", entityType: "day_choice", entityId: added.choice.id,
        entityName: added.choice.text, description: `added "${added.choice.text}" to ${plainDay(added.choice.date)}`, newState: added.choice,
      }).catch(() => {});
      return {
        result: { saved: true, choice: added.choice, whoSees: "everyone on the trip", guideChanged: false },
        actionDescription: `On ${plainDay(added.choice.date)}: ${added.choice.text}`,
      };
    }

    case "remove_same_day_plan": {
      const removed = await removeDayChoice(input.tripId, input.choiceId);
      if (!removed.ok) return { result: { error: removed.error } };
      logChange({
        tripId: input.tripId, user: user as any, actionType: "day_choice_removed", entityType: "day_choice", entityId: removed.removed.id,
        entityName: removed.removed.text, description: `took "${removed.removed.text}" off ${plainDay(removed.removed.date)}`, previousState: removed.removed,
      }).catch(() => {});
      return { result: { removed: true, choice: removed.removed }, actionDescription: `Off ${plainDay(removed.removed.date)}: ${removed.removed.text}` };
    }

    case "get_same_day_plans": {
      return { result: { choices: await listDayChoices(input.tripId, input.date || undefined) } };
    }

    // To-dos on the Actions screen (Sep 30 2026 — the same rules as the screen: anything can be ticked off; only a
    // to-do added in Wander can be taken out, never one from Larisa's Guide)
    // Trip notes (Oct 1 2026): the asker's own, and those shared with the trip — never another person's private note
    case "get_my_notes": {
      const me = (user as any).travelerId as string | undefined;
      if (!me) return { result: { error: "Notes are kept per person — this sign-in has no person." } };
      if (!(await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId: input.tripId, travelerId: me } } }))) {
        return { result: { error: "That trip isn't one of yours." } };
      }
      const q = String(input.query || "").trim().slice(0, 200);
      const all = await prisma.tripNote.findMany({
        where: {
          tripId: input.tripId,
          OR: [{ travelerId: me }, { visibility: "trip" }],
          ...(input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? { dayDate: input.date } : {}),
        },
        // (newest first: bringing something back starts from the latest — rule 41b; oldest-first cut at 60 dropped the
        // newest once someone had more — verify55)
        orderBy: { createdAt: "desc" },
      });
      // (the same rule as the Notes screens: someone else's note is only its words as they read now — services/tripNotes/view)
      // Any of the asked words, not the whole phrase: "coffee list" missed a note of "coffee places" (verify55); the
      // ones matching more words first, newest first among equals
      const STOP = new Set(["the", "and", "that", "this", "what", "was", "were", "you", "for", "with", "about", "from", "thing", "list", "one", "ones", "back", "bring", "told", "said", "discussed", "remember", "earlier", "yesterday", "today"]);
      const words = q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w));
      const hits = (n: (typeof all)[number]) => (!q ? 1 : noteMatches(n, me, q) ? words.length + 1 : words.filter((w) => noteMatches(n, me, w)).length);
      const notes = all.map((n, i) => ({ n, i, h: hits(n) })).filter((x) => x.h > 0).sort((a, b) => b.h - a.h || a.i - b.i).slice(0, 60).map((x) => x.n);
      // (to the minute: with six notes kept the same day, Scout called the oldest "the most recent one" — user-julie4)
      const keptOn = (d: Date) => `${plainDay(d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" }))}, ${d.toLocaleTimeString("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", minute: "2-digit" })}`;
      return { result: {
        order: q ? "the ones matching their words most first; newest first among those — 'kept' says when" : "newest first — 'kept' says when (Japan time)",
        notes: notes.map((n) => n.travelerId === me
          // (an answer of yours they asked you to keep is yours, never quoted as their words — rule 40)
          ? { id: n.id, by: n.source === "scout-answer" ? "Scout (your own answer, kept for them)" : "you", kept: keptOn(n.createdAt), day: n.dayDate, city: n.city, shared: n.visibility === "trip", words: n.tidied || n.text, ...(n.text !== n.original ? { asFirstSaved: n.original } : {}) }
          // (someone else's shared kept answer is still Scout's words, never theirs — verify55)
          : { by: n.source === "scout-answer" ? `Scout (an answer kept for ${n.authorName}, shared)` : n.authorName, kept: keptOn(n.createdAt), day: n.dayDate, city: n.city, shared: true, words: sharedWords(n) }),
        rule: "Quote their words exactly when you use them; say whose note it is; never add to or summarize away what they wrote unless asked to summarize.",
      } };
    }
    // One of their own notes changed, as the Notes tab's Change and Share do (Oct 17, the fresh notes audit: "That one's
    // yours to edit on the Notes tab… I can't rewrite a note you've already kept" — CLAUDE.md §8, Scout does what the
    // screen does). The first wording stays; their words are never tidied; never someone else's note.
    case "change_my_note": {
      const me = (user as any).travelerId as string | undefined;
      if (!me) return { result: { error: "Notes are kept per person — this sign-in has no person." } };
      const note = await prisma.tripNote.findFirst({ where: { id: String(input.noteId || ""), tripId: input.tripId } });
      if (!note || note.travelerId !== me) return { result: { error: "That isn't one of their own notes — find it with get_my_notes (their own notes have an id)." } };
      const data: Record<string, unknown> = {};
      if (typeof input.words === "string") {
        const w = input.words.replace(/^\s+|\s+$/g, "");
        if (!w) return { result: { error: "A note can't be empty — taking one out is on the Notes tab." } };
        if (w.length > 50_000) return { result: { error: "That's longer than one note can hold — split it in two." } };
        if (note.source === "scout-answer") return { result: { error: "That one is your own answer kept for them — its words stay as you wrote them; who sees it can change." } };
        if (w !== (note.tidied || note.text)) { data.text = w; data.editedAt = new Date(); data.tidied = null; data.tidyStatus = null; }
      }
      // ("Add to it", as the Notes tab does: under the note, with the time — Ken, Oct 18)
      if (typeof input.add === "string" && input.add.trim() && typeof input.words !== "string") {
        if (note.source === "scout-answer") return { result: { error: "That one is your own answer kept for them — its words stay as you wrote them." } };
        const now = new Date();
        const japan = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
        const at = now.toLocaleString("en-US", { timeZone: "Asia/Tokyo", ...(japan(note.createdAt) === japan(now) ? {} : { weekday: "short", month: "short", day: "numeric" }), hour: "numeric", minute: "2-digit" });
        const w = `${(note.tidied || note.text).replace(/\s+$/, "")}\n\n${at} — ${input.add.trim()}`;
        if (w.length > 50_000) return { result: { error: "That's longer than one note can hold — start a new note." } };
        data.text = w; data.editedAt = now; data.tidied = null; data.tidyStatus = null;
      }
      if (input.share === "trip" || input.share === "just me") data.visibility = input.share === "trip" ? "trip" : "private";
      if (input.day === "none") data.dayDate = null;
      else if (typeof input.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.day) && input.day !== note.dayDate) data.dayDate = input.day;
      if (!Object.keys(data).length) return { result: { unchanged: true, say: "Nothing to change — say so in a line." } };
      const after = await prisma.tripNote.update({ where: { id: note.id }, data });
      const first = (after.text.split(/\s+/).slice(0, 6).join(" ") + (after.text.split(/\s+/).length > 6 ? "…" : ""));
      return {
        result: { changed: true, note: first, wordsChanged: "text" in data, shared: after.visibility === "trip",
          say: typeof input.add === "string" && input.add.trim() && typeof input.words !== "string"
            ? `One short line: added under the note "${first}", with the time. Don't repeat their words.`
            : `One short line naming the note by its first words ("${first}"): what changed — ${"dayDate" in data ? `it's now filed under ${after.dayDate ? plainDay(after.dayDate) : "no particular day"}, ` : ""}its words, or that it's now ${after.visibility === "trip" ? "shared with everyone on the trip" : "just theirs"}${"text" in data ? "; its first wording is kept" : ""}.` },
        actionDescription: `${typeof input.add === "string" && input.add.trim() && typeof input.words !== "string" ? "Added to" : "text" in data ? "Changed" : "Updated"} your note “${first}”${"visibility" in data ? (after.visibility === "trip" ? " — shared with the trip" : " — just you") : ""}`,
      };
    }
    // "Let everyone know" (Ken, Oct 18): shown to each other member at their next opening, Got it / Remind me —
    // services/tripAlerts.ts
    case "tell_everyone": {
      const me = (user as any).travelerId as string | undefined;
      if (!me) return { result: { error: "This sign-in has no person to send it from." } };
      const member = await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId: String(input.tripId || ""), travelerId: me } } });
      if (!member) return { result: { error: "They aren't on this trip." } };
      const words = String(input.words || "").trim();
      if (!words) return { result: { error: "Nothing to send: ask what everyone should know." } };
      const { tellEveryone, othersOn } = await import("../services/tripAlerts.js");
      const others = await othersOn(input.tripId, me);
      if (!others.length) return { result: { error: "Nobody else is on the trip yet." } };
      const names = others.map((o) => o.name);
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
      // (when its moment passes — Japan time; Ken: "Expires in 3 days or the moment that the moment has passed")
      const untilRaw = typeof input.until === "string" ? input.until.trim() : "";
      const until = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(untilRaw) ? new Date(`${untilRaw}:00+09:00`) : null;
      if (untilRaw && (!until || isNaN(until.getTime()))) return { result: { error: "until must be Japan time as YYYY-MM-DDTHH:MM, or left out." } };
      if (until && until.getTime() <= Date.now()) return { result: { error: "That moment has already passed — say so to them; nothing was sent." } };
      const whenGone = until ? `, until ${until.toLocaleString("en-US", { timeZone: "Asia/Tokyo", weekday: "short", hour: "numeric", minute: "2-digit" })}` : "";
      // (Ken, Oct 18: "Confirm: 'got it. Here's what I'll send: ….'" — never sent before their yes to these exact words)
      if (input.confirmed !== true) {
        return { result: { notSentYet: true, words, to: names,
          say: `Nothing is sent yet. Reply with: Got it. Here's what I'll send: “${words}” — then one line: it goes to ${list} the next time each opens Wander${whenGone}; send it? Then wait for their yes. On yes, call tell_everyone again with these exact words and confirmed: true; if they change it, show the new words the same way.` } };
      }
      const a = await tellEveryone(input.tripId, me, user.displayName || "Someone", words, until);
      if (!a) return { result: { error: "Nothing to send." } };
      return {
        result: { sent: true, id: a.id, words: a.text, to: names,
          say: `One short line: sent — ${list} will see it the next time each opens Wander${whenGone}. Don't quote it again. They can ask you whether everyone has seen it, or to take it back.` },
        actionDescription: `Everyone will see this when they next open Wander: “${a.text.length > 80 ? a.text.slice(0, 80) + "…" : a.text}”`,
      };
    }
    case "my_alerts": {
      const me = (user as any).travelerId as string | undefined;
      if (!me) return { result: { error: "This sign-in has no person." } };
      const { sentOn, takeBack } = await import("../services/tripAlerts.js");
      if (typeof input.takeBack === "string" && input.takeBack) {
        const r = await takeBack(input.takeBack, me);
        if (r === "none") return { result: { error: "No message with that id — list them first." } };
        if (r === "not-yours") return { result: { error: "Only the person who sent it, or Ken, can take it back." } };
        return { result: { takenBack: true, say: "One line: it's taken back — nobody will see it now (anyone who already tapped Got it has read it)." }, actionDescription: "Taken back: nobody will see it now" };
      }
      const sent = await sentOn(String(input.tripId || ""), me);
      return { result: { sent, say: sent.length ? "Say who has tapped Got it, who asked to be reminded, and who hasn't tapped either yet (noTapYet — never 'hasn't seen it': Wander only knows taps), by name, for the one they asked about (the newest when they didn't say)." : "Nothing sent to everyone yet: say so in a line." } };
    }
    // Ken, Oct 10: telling Scout what happened today ("we came to this town because our guide drove us…") had nowhere
    // to go. Kept in their Notes, every word theirs: a note once kept "themes" instead of what he said (ChatGPT, before
    // Wander), so the words Scout passes are kept only when they are the person's own; otherwise all they said is kept.
    case "add_wander_idea": {
      const me = (user as any).travelerId as string | undefined;
      const { isMember, postIdea } = await import("../services/wanderIdeas.js");
      if (!me || !(await isMember(input.tripId, me))) {
        return { result: { error: "Ideas for Wander is Ken and Andy's. Offer to pass it to Ken word for word instead (tell_ken, on their yes)." } };
      }
      const { keptWords } = await import("../services/tripNotes/kept.js");
      const raw = String(input.words || "").replace(/^\s*(wander\s+idea|(for|add to|put (this|that) in)\s+(the\s+)?ideas(\s+for\s+wander)?)\s*[:,.]?\s*/i, "");
      const words = keptWords(raw, said || []) || raw;
      const r = await postIdea({ tripId: input.tripId, travelerId: me, authorName: user.displayName, words, screen: asked?.screen ?? null,
        pictures: asked?.image ? [asked.image] : [] });
      if ("error" in r) return { result: { error: r.error } };
      return {
        result: { posted: true, words, withPicture: !!asked?.image,
          say: "One short line: it's in Ideas for Wander, word for word (with the picture if any), and Scout will answer it there; Ideas is at the top of Home." },
        actionDescription: "Added to Ideas for Wander",
      };
    }
    case "add_expense":
    case "remove_expense":
    case "put_back_expense":
    case "change_expense":
    case "money_so_far": {
      const me = (user as any).travelerId as string | undefined;
      if (!me || !(await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId: input.tripId, travelerId: me } } }))) {
        return { result: { error: "That trip isn't one of yours." } };
      }
      const { addExpense, removeExpense, restoreExpense, changeExpense, ledger, yenWords } = await import("../services/expenses.js");
      const said = (l: Awaited<ReturnType<typeof ledger>>) => ({
        whoPaysNext: l.next, totals: Object.fromEntries(Object.entries(l.totals).map(([k, v]) => [k, yenWords(v)])),
        toBeEven: l.owes ? `${l.owes.from} owes ${l.owes.to} ${yenWords(l.owes.yen)}` : "even",
      });
      if (toolName === "money_so_far") {
        const l = await ledger(input.tripId, { travelerId: me, displayName: user.displayName });
        // (taken away, newest first — for put_back_expense: "put the coffee back")
        const off = await prisma.tripExpense.findMany({ where: { tripId: input.tripId, removedAt: { not: null } }, orderBy: { removedAt: "desc" }, take: 10 });
        // (not shared, said apart, so a mistake shows — Ken, Oct 23: "highlight anything that doesn't shared because it's
        // probably an error")
        const notShared = l.items.filter((x) => x.forParty).map((x) => `${x.currency === "USD" ? `$${x.amount}` : yenWords(x.amount)}${x.what ? ` (${x.what})` : ""}, paid by ${x.party}: ${x.forParty === x.party ? `${x.party} paid for themselves — not shared at all, probably a mistake` : `${x.forParty} owe it all back`}`);
        return { result: { ...said(l), ...(notShared.length ? { notShared, notSharedHow: "Name these, plainly, as not shared — ask whether each is right" } : {}), payments: l.items.slice(0, 40).map((x) => ({ id: x.id, paidBy: x.party, for: x.forParty ? `${x.forParty} alone` : "shared", amount: x.currency === "USD" ? `$${x.amount}` : yenWords(x.amount), yen: x.currency === "USD" ? yenWords(x.yen) : undefined, what: x.what, day: x.dayDate, keptBy: x.addedByName, youMayRemove: x.mayRemove })),
          takenAway: off.map((x) => ({ id: x.id, paidBy: x.party, amount: x.currency === "USD" ? `$${x.amount}` : yenWords(x.amount), what: x.what, keptBy: x.addedByName })),
          // (Scout offered Larisa "tell me which and I'll take them off" for Andy's entries, then couldn't; user-larisa3)
          say: "Say who pays next and what they'd pay the other couple to be even, in a line. Totals and payments only if asked (Ken: people don't want to be reminded how much they've paid). Offer to change or take a payment away only when it's youMayRemove: true; for others, say who kept it and that they (or Ken) can." } };
      }
      if (toolName === "change_expense") {
        const r = await changeExpense(input.tripId, String(input.id || ""), { travelerId: me, displayName: user.displayName },
          { amount: input.amount === undefined ? undefined : Number(input.amount), currency: input.currency, paidBy: input.paidBy, what: input.what, forParty: input.forCouple });
        if (r === "not-yours") return { result: { error: "Only whoever kept that payment, or Ken, can change it." } };
        if (r === "gone") return { result: { error: "That payment isn't there — look at money_so_far for its id." } };
        if ("error" in r) return { result: { error: r.error } };
        const l = await ledger(input.tripId);
        return { result: { changed: r.said || "nothing to change — it already says that", ...said(l), say: "One line: what changed, and who pays next now." }, actionDescription: r.said ? `Changed: ${r.said}` : undefined };
      }
      if (toolName === "remove_expense") {
        const r = await removeExpense(input.tripId, String(input.id || ""), { travelerId: me, displayName: user.displayName });
        if (r === "not-yours") return { result: { error: "Only whoever kept that payment, or Ken, can take it away." } };
        if (!r) return { result: { error: "That payment isn't there — look at money_so_far for its id." } };
        const l = await ledger(input.tripId);
        return { result: { removed: true, ...said(l), say: "One line: it's taken away, and who pays next now." }, actionDescription: "Payment taken away" };
      }
      if (toolName === "put_back_expense") {
        const r = await restoreExpense(input.tripId, String(input.id || ""), { travelerId: me, displayName: user.displayName });
        if (r === "not-yours") return { result: { error: "Only whoever kept that payment, or Ken, can put it back." } };
        if (r === "gone") return { result: { error: "That payment isn't there — look at money_so_far's takenAway list for its id." } };
        const l = await ledger(input.tripId);
        if (r === "already") return { result: { already: "It already counts — it was never taken away, or someone put it back.", ...said(l) } };
        return { result: { putBack: `${r.party}, ${r.currency === "USD" ? `$${r.amount}` : yenWords(r.amount)}`, ...said(l), say: "One line: it's back and counts again, and who pays next now." }, actionDescription: "Payment put back" };
      }
      const paidBy = String(input.paidBy || "");
      const r = await addExpense({ tripId: input.tripId, paidBy: /^(we|us|i|me|our)$/i.test(paidBy.trim()) ? user.displayName : paidBy, amount: Number(input.amount), currency: input.currency, what: input.what ?? null, dayDate: input.date ?? null, forParty: input.forCouple ?? null, addedById: me, addedByName: user.displayName });
      if ("error" in r) return { result: { error: r.error } };
      const l = await ledger(input.tripId);
      return {
        result: { kept: true, id: r.id, paidBy: r.party, for: r.forParty ? `${r.forParty} alone — they owe it back in full` : "shared, half each", amount: input.currency === "USD" ? `$${input.amount}` : yenWords(Number(input.amount)), ...(r.rate ? { inYen: `${yenWords(r.yen)} at ${r.rate.toFixed(2)} yen to the dollar${r.approx ? " (an approximate rate — the day's wasn't reachable)" : ""}` } : {}), ...said(l),
          say: "One or two short lines: kept for which couple and how much (and its yen for dollars), then who pays next, and — when they aren't even — what that couple would pay the other to be even now, said plainly (\"…would pay Ken & Larisa ¥534 to be even\"). Not the totals (Ken: people don't want to be reminded how much they've paid). No lists." },
        actionDescription: `Kept: ${r.party} paid ${input.currency === "USD" ? `$${input.amount}` : yenWords(Number(input.amount))}`,
      };
    }
    case "tell_ken": {
      const me = (user as any).travelerId as string | undefined;
      if (!me) return { result: { error: "Messages to Ken go from a person's own sign-in." } };
      if (!(await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId: input.tripId, travelerId: me } } }))) {
        return { result: { error: "That trip isn't one of yours." } };
      }
      // (their words only: what they said in this conversation, as keep_in_my_notes keeps them)
      const { keptWords } = await import("../services/tripNotes/kept.js");
      const words = keptWords(String(input.words || ""), said || []) || String(input.words || "");
      const { tellKen } = await import("../services/tellKen.js");
      const r = await tellKen({ tripId: input.tripId, travelerId: me, authorName: user.displayName, words, screen: asked?.screen ?? null, image: asked?.image ?? null });
      if ("error" in r) return { result: { error: r.error } };
      return {
        result: { sent: true, words, screen: asked?.screen ?? null, withPicture: !!asked?.image,
          say: "One or two short lines: it's sent to Ken, word for word (and the screen they were on, and the picture if any). Never promise he'll fix it. Invite another, one thought per message." },
        actionDescription: "Sent to Ken",
      };
    }
    case "keep_in_my_notes": {
      const me = (user as any).travelerId as string | undefined;
      if (!me) return { result: { error: "Notes are kept per person — this sign-in has no person." } };
      if (!(await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId: input.tripId, travelerId: me } } }))) {
        return { result: { error: "That trip isn't one of yours." } };
      }
      const date = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : null;
      if (!date) return { result: { error: "Which day is it about? Pass the date as YYYY-MM-DD." } };
      if (!String(input.words || "").trim()) return { result: { error: "There's nothing to keep yet — what would they like noted?" } };
      // (Scout's own answer, when they ask for it to be kept — Ken, Oct 13: the breakfast list Scout made from his photo
      // was refused as "a summary" and lost. Kept only as Scout already wrote it in this conversation, marked as Scout's)
      const fromScout = input.fromScout === true;
      // (Scout's answers carry **bold** marks the Notes screen would show as stars; only those come off)
      const scoutWords = fromScout ? keptWords(String(input.words || ""), scoutSaid || []) : null;
      const words = fromScout ? (scoutWords ? scoutWords.replace(/\*\*/g, "") : null) : keptWords(String(input.words || ""), said || []);
      if (!words) return { result: { error: fromScout
        ? "Those aren't words you wrote earlier in this conversation. Pass the part of your earlier answer they want kept, exactly as you wrote it — never a new version."
        : "Those aren't words they said in this conversation. Pass their own words exactly as they said them (a part of their message is fine) — never your summary or rewording. If they want YOUR answer kept, set fromScout and pass your earlier words." } };
      const day = await prisma.day.findFirst({
        where: { tripId: input.tripId, date: { gte: new Date(`${date}T00:00:00Z`), lt: new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400_000) } },
        select: { city: { select: { name: true } } },
      });
      // (the same words told again — a resend, a retry — are the same note)
      const clientId = `scout-${createHash("sha256").update(`${date}|${words}`).digest("hex").slice(0, 40)}`;
      const already = await prisma.tripNote.findUnique({ where: { travelerId_clientId: { travelerId: me, clientId } } });
      const note = already || await prisma.tripNote.create({
        data: {
          tripId: input.tripId, travelerId: me, authorName: user.displayName, clientId,
          original: words, text: words, source: fromScout ? "scout-answer" : "scout",
          visibility: input.shareWithTrip === true ? "trip" : "private",
          // (where it happened, when their own words name the town — Oct 10 re-audit: a shop in Arita was filed under
          // "Hakata", that day's city; a place Scout names that their words don't is ignored)
          // (Scout's own answer about another city — "Kyoto dinners" kept in Tokyo — goes under that city, when it's one
          // of the trip's; verify29: it was filed under Tokyo and wouldn't show under Kyoto later)
          dayDate: date, city: (fromScout && typeof input.place === "string" && input.place.trim()
            ? (await prisma.city.findFirst({ where: { tripId: input.tripId, name: { equals: input.place.trim(), mode: "insensitive" } }, select: { name: true } }))?.name
            : null) || placeInWords(input.place, words) || day?.city?.name || null,
        },
      });
      // "Tidy my dictation" (Ken, Oct 10: like Wispr Flow — his exact words kept, misspeaking and haste fixed so it reads
      // clearly): what's said to Scout is often spoken, so with their switch on it's tidied as a spoken note is — the
      // original stays, marked "tidied", one tap shows every word as said
      if (!already && !fromScout && (await settingsOf(me)).tidy) tidyLater(note.id, note.text);
      return {
        result: {
          kept: true, alreadyKept: !!already, day: plainDay(date), words: note.text, ...(fromScout ? { markedAs: "kept from Scout" } : {}),
          whoSees: note.visibility === "trip" ? "everyone on the trip" : "only them",
          where: "their Notes tab",
          say: "One short line: it's in their Notes for that day, and who sees it. Don't repeat their words back.",
        },
        actionDescription: `In your Notes for ${plainDay(date)}${note.visibility === "trip" ? " (shared with the trip)" : ""}`,
      };
    }

    case "get_weather": {
      // The day page's forecast, in the day page's words (services/dayWeather + forecastWords — Ken, Oct 13: "yes. One
      // unified and correct source"). Before, Scout searched the web: asked "Is it going to rain in Mashiko today?" on
      // Oct 14 it gave a Norwegian site's "2.6 mm, 24°/17° C" while the day page said 94% (.13"), most likely 10 AM–7 PM.
      const { dayWeather, townWeather } = await import("../services/dayWeather.js");
      const { forecastLines } = await import("../services/forecastWords.js");
      const now = new Date();
      const today = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);   // (Japan's date)
      // (real calendar days only: "2026-13-45" looks like one and broke the lookup — chaos check, Oct 14)
      const asked: string[] = (Array.isArray(input.dates) ? input.dates : []).map(String)
        .filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d);
      const dates = [...new Set(asked.length ? asked : [today])].sort().slice(0, 16);
      const town = typeof input.town === "string" ? input.town.trim() : "";
      const hf = Number(input.hours?.from), ht = Number(input.hours?.to);
      const hrs = Number.isInteger(hf) && Number.isInteger(ht) && hf >= 0 && ht <= 23 && hf <= ht ? { from: hf, to: ht } : null;
      // (plain characters for an answer: the day page's no-break spaces and hyphens keep its lines from wrapping badly)
      const plain = (t: string) => t.replace(/\u00a0/g, " ").replace(/\u2060/g, "").replace(/\u2011/g, "-");
      const dayName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
      const readAt = (iso: string) => `${new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", minute: "2-digit", ...(iso.slice(0, 10) !== now.toISOString().slice(0, 10) ? { weekday: "short" } : {}) })} Japan time`;
      const kept: { date: string; weather: unknown }[] = [];
      const days = await Promise.all(dates.map(async (date) => {
        const w = town ? await townWeather(String(input.tripId || ""), town, date, today) : await dayWeather(String(input.tripId || ""), user.displayName || "", date, today);
        const far = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`) > 15 * 86_400_000;
        if (!w) return { date, day: dayName(date), none: date < today ? "No forecast: that day is over." : far ? "No forecast yet: more than 16 days ahead." : town ? `No forecast for ${town}: Wander couldn't find it in Japan.` : "Wander has no forecast for that day just now." };
        if (!town) kept.push({ date, weather: w });
        // (how sure, said for every day: told only of early outlooks, Scout called four days within the week "an early
        // outlook" — weather exam, Oct 14)
        // (and an airport in her plan for them that day, its own forecast: asked "what's the weather when we land?",
        // Scout stretched the Imperial's rain hours over Narita, 60 km away — weather exam and verify43)
        const airports: string[] = [];
        if (!town) {
          const { airportsOf } = await import("../services/stormWatch.js");
          const { weatherAt } = await import("../services/dayWeather.js");
          for (const a of await airportsOf(String(input.tripId || ""), user.displayName || "", date).catch(() => [])) {
            const aw = await weatherAt(a, a.name, date, today);
            if (aw) airports.push(plain(forecastLines(aw, date, a.name, now)[0].text));
          }
        }
        // (hour by hour for part of the day, at each line's place — Ken, Oct 17: "What's the temperature in Nikko where we
        // start biking from 1pm to 6pm?" and Scout had only the day's low and high)
        let hourly: unknown[] | undefined;
        if (hrs) {
          const { dayPoints, townPoint, hoursAt, hourlyWords } = await import("../services/dayWeather.js");
          const pts = town ? [await townPoint(String(input.tripId || ""), town)].filter((x): x is NonNullable<typeof x> => !!x) : await dayPoints(String(input.tripId || ""), user.displayName || "", date);
          hourly = (await Promise.all(pts.map(async (x) => { const h = await hoursAt(x.pt, date, hrs.from, hrs.to); return h ? hourlyWords(x.place, h) : null; }))).filter(Boolean);
        }
        return { date, day: dayName(date), lines: forecastLines(w, date, w.place, now).map((l) => plain(l.text)), read: readAt(w.at),
          ahead: w.outlook === "early outlook" ? "an early outlook: more than a week ahead, likely to change" : "a week or less",
          ...(hourly?.length ? { hourly } : {}),
          ...(airports.length ? { airports, airportsNote: "the airport's own forecast, for their flight that day (not on the day page): use it for landing or leaving" } : {}) };
      }));
      // The storm, warning and train watch for their places (services/stormWatch — Ken's decision 2): the same lines the
      // day page shows, for the days asked about; and whether it found anything at all through 5 days ahead
      let watch: Record<string, unknown> | null = null;
      if (!town) {
        try {
          const { stormWatch } = await import("../services/stormWatch.js");
          const sw = await stormWatch(String(input.tripId || ""), user.displayName || "", today, now);
          // (each day says for itself what was checked — "Nothing is up for either day" covered a Monday the chance check
          // never reached; verify46)
          const tw = sw.through || { warnings: null, chances: null, typhoons: null };
          for (const d of days as any[]) {
            if (sw.days[d.date]) d.watch = sw.days[d.date].map((l) => l.text);
            d.stormCheck = [
              d.date === today ? (tw.warnings ? "warnings in force now: checked" : "warnings in force now: NOT checked (couldn't read them)") : "warnings: only ever known on the day",
              tw.chances && d.date <= tw.chances ? "chance of warning-level weather: checked" : "chance of warning-level weather: NOT checked for this day",
              tw.typhoons && d.date <= tw.typhoons ? "typhoons: checked" : "typhoons: NOT checked for this day",
            ].join("; ") + (sw.days[d.date] ? " — see watch" : " — nothing found in what was checked");
          }
          // (what was checked and how far — never a blanket "through Oct 19": chances reach about 3 days by region and 5
          // by prefecture, and Scout told Ken Sunday was checked when it wasn't; verify45)
          const t = sw.through || { warnings: null, chances: null, typhoons: null };
          const checked = [
            t.warnings ? "warnings in force now (today only: a warning is only ever for now)" : "",
            t.chances ? `the chance of warning-level weather, through ${dayName(t.chances)}` : "",
            t.typhoons ? `typhoons and tropical storms, through ${dayName(t.typhoons)}` : "",
          ].filter(Boolean);
          watch = {
            checked: checked.length ? checked : ["nothing"],
            ...(Object.keys(sw.days).length ? { daysWithWatch: Object.fromEntries(Object.entries(sw.days).map(([d, ls]) => [dayName(d), ls.map((l) => l.text)])) } : {}),
            ...(!Object.keys(sw.days).length && checked.length ? { found: "Nothing near their places in what was checked." } : {}),
            ...(sw.unknown?.length ? { couldNotCheck: sw.unknown } : {}),
            how: "Say only what \"checked\" covers, with its own dates: a day past those dates wasn't checked for that, so say so, and lead with it (\"It's too soon to know for Wed, Oct 21: …\"), never with \"no warnings\" or \"nothing\" for that day. Anything under couldNotCheck: say Wander couldn't check it just now. Never an all-clear beyond that.",
          };
        } catch (e: any) { watch = { couldNotCheck: ["the storm watch"] }; console.warn("[get_weather] watch:", e?.message); }
      }
      return {
        result: {
          days,
          ...(watch ? { stormWatch: watch } : {}),
          source: town ? `Wander's forecast for ${town} (Open-Meteo), the same source as the day pages` : "Wander's forecast (Open-Meteo): exactly what the day page and Home show for them",
          ...(hrs ? { hourlyHow: "hourly: each place's own hours (Japan time), from the same forecast as the lines. Give the hours they asked about as they are (a few may be said as a short run, \"61°F at 1 PM, 55°F by 6 PM\"), the place's height when it tells them which spot it is, and otherForecasts in a few words. Never move one place's hours to another. A height is that place's own, above sea level: never a difference between places (comparing two, give each one's height)." } : {}),
          say: town
            ? "Give the numbers exactly as the lines have them, and say in a short clause that it's not where their plan has them that day, unless their day passes through it (say where it does, from DAY BY DAY)."
            : "Give the numbers, hours and places exactly as these lines have them: you may say them more naturally, but never change, round, average or merge a number, an hour or a place. Two lines for a day: say both, the first one first (where the day takes them, then where they sleep). An early outlook is said as one. Rain hours are Japan time and already leave out hours that have passed. Each line's hours and temperatures are for that line's place, all day: never tie them to being somewhere else (\"that rain window overlaps your landing at Narita\" is wrong: the hotel is 60 km from the airport), and never call the day's range tonight's. No ranges of your own (\"high 40s\"). Don't add the reading time unless they ask how current it is.",
        },
        ...(kept.length ? { forecasts: kept } : {}),
      };
    }

    case "packing_tips": {
      // (with the live forecast where this person sleeps, stay by stay — Ken, Oct 12: "Adjust your packing tips for this.
      // Don't say obvious things. Be helpful." — services/packingWeather.ts)
      let weather: unknown = null;
      try {
        const { packingWeather } = await import("../services/packingWeather.js");
        const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);   // (Japan's date)
        const stays = await packingWeather(String(input.tripId || ""), user.displayName || "", today);
        if (stays.length) weather = {
          asOf: `the live forecast (Open-Meteo), read ${today}`,
          stays,
          // (verify23: rain 8 days out said as fact, "hotels lend them", items of five sentences, "25°F colder" worked out)
          how: "From this, at most three items, each ONE sentence: what the forecast shows for their own nights or days (with the dates as given here, weekday and all), tied to what Backroads' itinerary or her Guide has them doing that day, and what to pack for it. Worth an item, and only these: the coldest stop against where they start, in ONE item (give both ranges, never a difference you work out); the days rain shows when they'll be outside (biking, a hike); one very wet stretch. Never an item that only says a stop is mild or warm, or tells them to bring ordinary clothes for it ('light clothes', 'a short-sleeve layer'): that's obvious, and Ken (Oct 12): \"Don't just do the obvious. That's worse than nothing.\" Fewer weather items is better than an obvious one. Certainty goes day by day: a rain day may be called likely, with its chance, only when it's marked 'forecast' AND its models 'agree'; when its models 'disagree' (Europe's, Japan's and the US forecasts don't all show rain), it only 'may' rain, and say the forecasts disagree, with no chance given as if settled; one marked 'early outlook' is more than a week away and only 'may' rain. Say once that the numbers are for the hotel itself when 'at' says so. Backroads' own notes already tell them to bring rain gear, warm layers and gloves: never mention any of those, even in passing, and nothing as obvious as 'check the forecast'. One item may be, on its own and about nothing else: no need to pack an umbrella, since convenience stores sell them for under ¥1,000. Temperatures in °F as given. Backroads' days by their date (\"Mon, Oct 19\"), never its numbers (\"Day 2\"). Nothing of your own about the hotels (what they have or lend) or about what dries overnight.",
        };
      } catch (e: any) { console.warn("[packing] weather unavailable:", e?.message); }
      return { result: weather ? { ...PACKING, weather } : PACKING };
    }

    case "get_todos": {
      const todos = await prisma.planningAction.findMany({ where: { tripId: input.tripId }, orderBy: { createdAt: "asc" } });
      // Her Actions tab's "Both" is Andy and Larisa (its two status columns); "Both" added in Wander is everyone
      // (her initials, one or several — "AB / JD" is Andy & Julie; initials no one has, like "LT", stay as she wrote them)
      const INITIALS: Record<string, string> = { LF: "Larisa", KR: "Ken", AB: "Andy", JD: "Julie" };
      const forWhom = (t: { owner: string; sheetRowRef: string | null }) =>
        // (initials no one has are her list's heading, never a person — Scout said "marked for LT"; Ken: "There is no LT")
        t.owner === "Both" ? (t.sheetRowRef ? "Andy & Larisa" : "everyone") : t.owner.split(/\s*[\/&,]\s*/).map((o) => INITIALS[o] || `her “${o} actions” list (a heading in her Actions tab, not a person)`).join(" & ");
      // (her to-dos ticked in Wander by the person they're for — Oct 9 — are done, said with who and when)
      const marks = new Map((await listMarks(input.tripId).catch(() => [])).map((m) => [m.key, m]));
      return { result: { todos: todos.map((t) => {
        const mark = t.sheetRowRef ? marks.get(todoKey(t)) : undefined;
        return { id: t.id, action: t.action, for: forWhom(t), by: t.dueDate, done: t.status === "done" || !!mark, ...(mark ? { markedDoneInWander: `by ${mark.byName} on ${mark.at.slice(0, 10)} (Wander's record; her sheet may not say so)` } : {}), andyStatus: t.andyStatus, larisaStatus: t.larisaStatus, notes: t.notes, from: t.sheetRowRef ? "Larisa's Guide" : t.createdBy ? `added in Wander by ${t.createdBy}` : "added in Wander" };
      }) } };
    }
    case "add_todo": {
      if (!String(input.action || "").trim()) return { result: { error: "What needs doing?" } };
      const created = await prisma.planningAction.create({
        data: { tripId: input.tripId, action: String(input.action).trim(), owner: String(input.owner || "Both").trim(), dueDate: input.dueDate?.trim() || null, notes: input.notes?.trim() || null, status: "open", createdBy: user.displayName },
      });
      logChange({ tripId: input.tripId, user: user as any, actionType: "action_added", entityType: "planning_action", entityId: created.id, entityName: created.action, description: `added a to-do: "${created.action}"` }).catch(() => {});
      return { result: { added: true, todo: created }, actionDescription: `To-do added: ${created.action}` };
    }
    case "set_todo_done": {
      const t = await prisma.planningAction.findFirst({ where: { id: input.todoId, tripId: input.tripId } });
      if (!t) return { result: { error: "That to-do isn't on this trip." } };
      // Her Guide's to-do: marked done in Wander, beside her list — never changed in it (it's rebuilt on every read of her
      // Guide, and her sheet is hers to tick)
      if (t.sheetRowRef) {
        const r = await setMark(input.tripId, { travelerId: user.travelerId || "", name: user.displayName }, todoKey(t), t.action, !!input.done);
        if (!r.ok) return { result: { error: r.error } };
        logChange({ tripId: input.tripId, user: user as any, actionType: input.done ? "action_marked_done" : "action_marked_open", entityType: "action_mark", entityId: todoKey(t), entityName: t.action, description: input.done ? `marked "${t.action}" done` : `marked "${t.action}" not done yet` }).catch(() => {});
        return { result: { updated: true, markedInWander: true, note: "Marked in Wander only — Larisa's sheet isn't changed." }, actionDescription: `${input.done ? "Done" : "Open again"}: ${t.action}` };
      }
      const updated = await prisma.planningAction.update({ where: { id: t.id }, data: { status: input.done ? "done" : "open" } });
      logChange({ tripId: input.tripId, user: user as any, actionType: input.done ? "action_done" : "action_reopened", entityType: "planning_action", entityId: t.id, entityName: t.action, description: input.done ? `ticked off "${t.action}"` : `marked "${t.action}" not done` }).catch(() => {});
      return { result: { updated: true, todo: updated }, actionDescription: `${input.done ? "Done" : "Open again"}: ${t.action}` };
    }
    case "set_deadline_done": {
      const words = String(input.deadline || "").trim().toLowerCase();
      if (!words) return { result: { error: "Which deadline?" } };
      const deadlines = await prisma.guideItem.findMany({ where: { tripId: input.tripId, kind: "deadline" }, select: { title: true, date: true } });
      const found = deadlines.filter((d) => d.title.toLowerCase().includes(words) || words.includes(d.title.toLowerCase()));
      if (!found.length) return { result: { error: "No deadline in the Guide says that.", deadlines: deadlines.map((d) => d.title) } };
      if (found.length > 1) return { result: { error: "More than one deadline matches — which one?", matches: found.map((d) => `${d.title} (${d.date?.toISOString().slice(0, 10)})`) } };
      const d = found[0];
      const r = await setMark(input.tripId, { travelerId: user.travelerId || "", name: user.displayName }, deadlineKey(d), d.title, !!input.done);
      if (!r.ok) return { result: { error: r.error } };
      logChange({ tripId: input.tripId, user: user as any, actionType: input.done ? "action_marked_done" : "action_marked_open", entityType: "action_mark", entityId: deadlineKey(d), entityName: d.title, description: input.done ? `marked "${d.title}" done` : `marked "${d.title}" not done yet` }).catch(() => {});
      return { result: { updated: true, deadline: d.title, done: !!input.done, note: "Marked in Wander only — Larisa's sheet isn't changed." }, actionDescription: `${input.done ? "Done" : "Open again"}: ${d.title}` };
    }
    case "remove_todo": {
      const t = await prisma.planningAction.findFirst({ where: { id: input.todoId, tripId: input.tripId } });
      if (!t) return { result: { error: "That to-do isn't on this trip." } };
      if (t.sheetRowRef) return { result: { error: "That to-do is from Larisa's Guide — it goes when she takes it out of her sheet." } };
      // Only whoever added it, as on the Actions screen
      if (t.createdBy && t.createdBy !== user.displayName) return { result: { error: `That's ${t.createdBy}'s to-do — only ${t.createdBy} can take it out.` } };
      await prisma.planningAction.delete({ where: { id: t.id } });
      logChange({ tripId: input.tripId, user: user as any, actionType: "action_removed", entityType: "planning_action", entityId: t.id, entityName: t.action, description: `took out the to-do "${t.action}"`, previousState: t }).catch(() => {});
      return { result: { removed: true }, actionDescription: `To-do taken out: ${t.action}` };
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

      // Replaces this person's votes with one first choice (or "happy with any"), the same as the app
      const voterRow = await prisma.traveler.findUnique({ where: { displayName: user.displayName }, select: { id: true } });
      const outcome = await setDecisionVotes(input.decisionId, { code: user.code, displayName: user.displayName, travelerId: voterRow?.id || null },
        [{ optionId: typeof input.optionId === "string" && input.optionId ? input.optionId : null, rank: 1 }]);
      if (!outcome.ok) return { result: { error: outcome.error } };

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
      // Only your own — an X in her Guide is hers, and someone else's "I'm in" is theirs (it took any mark away)
      const mine = interest.userCode === user.code || (!!user.travelerId && interest.userCode.startsWith(`wander:${user.travelerId}`));
      if (!mine) {
        return { result: { error: interest.userCode.startsWith("wander:") ? `That's ${interest.displayName}'s — only they can take it back.` : `That mark is from Larisa's Guide — Wander can't change it.` } };
      }
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

/**
 * Your conversation with Scout on every device (Oct 4, Ken: "When I change devices or change between a webpage and web
 * app … I seem to lose the history. I can imagine starting a topic on one device and wanting to refer to it on
 * another."). Each answer was always saved here; the screens showed only the copy on that device (and an iPhone's Home
 * Screen app keeps its own, apart from Safari). Only your own conversation, on that trip, since your last "Start fresh".
 */
const FRESH = "fresh";
async function freshSince(tripId: string, travelerId: string): Promise<Date> {
  const m = await prisma.chatMessage.findFirst({ where: { tripId, travelerId, role: FRESH }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  return m?.createdAt || new Date(0);
}
router.get("/history", async (req: AuthRequest, res) => {
  const tripId = typeof req.query.tripId === "string" ? req.query.tripId : "";
  const travelerId = req.user?.travelerId;
  if (!tripId || !travelerId) { res.json({ messages: [] }); return; }
  // (a trip that isn't yours is refused before this — bodyTripGuard reads ?tripId)
  const fresh = await freshSince(tripId, travelerId);
  const rows = await prisma.chatMessage.findMany({
    where: { tripId, travelerId, role: { in: ["user", "assistant"] }, createdAt: { gt: fresh } },
    orderBy: [{ createdAt: "desc" }], take: 50,
    select: { role: true, content: true, sources: true, toolUse: true, createdAt: true },
  });
  // (a question and its answer are saved together, at one moment: the question first)
  rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.role === "user" ? -1 : 1) - (b.role === "user" ? -1 : 1));
  // (a first word from Scout for this person, if there is one — services/scoutHello.ts)
  const hello = await helloFor(tripId, travelerId, req.user?.displayName || "").catch(() => null);
  res.json({
    freshAt: fresh.getTime() ? fresh.toISOString() : null,
    ...(hello ? { hello } : {}),
    messages: rows.map((m) => {
      if (m.role === "user") {
        // "what's this? (with menu.png, plan.pdf)" — the files went with it; their names, not the files, were kept
        // (a file name may have brackets of its own — "menu (1).png"; verify8)
        const w = m.content.match(/^([\s\S]*?) \(with (.+)\)$/);
        return { role: "user", text: w ? w[1] : m.content, at: m.createdAt.toISOString(), ...(w ? { files: w[2].split(", ").map((name) => ({ name })) } : {}) };
      }
      return asAnswer(m);
    }),
  });
});
/** A place's name for matching ("Glitch Coffee, Meieki" = "glitch coffee meieki") */
const flatName = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** A directions button to a point Google gave (places_near_me): the same button the directions tool makes */
function walkRouteTo(p: { name: string; lat: number; lng: number }, way?: unknown) {
  const how = way === "train" ? { verb: "Train to", apple: "r", google: "transit" } : way === "taxi" ? { verb: "Taxi to", apple: "d", google: "driving" } : { verb: "Walk to", apple: "w", google: "walking" };
  const at = `${p.lat},${p.lng}`;
  return {
    label: `${how.verb} ${p.name}`,
    apple: `https://maps.apple.com/?daddr=${encodeURIComponent(at)}&dirflg=${how.apple}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(at)}&travelmode=${how.google}`,
  };
}
/** A saved answer as a phone shows it: words, sources, place cards, screens, directions, "Use my location" */
function asAnswer(m: { content: string; createdAt: Date; sources: unknown; toolUse: unknown }) {
  const t = (m.toolUse || {}) as { places?: unknown[]; shows?: unknown[]; routes?: unknown[]; askHere?: unknown };
  return { role: "assistant", text: m.content, at: m.createdAt.toISOString(), ...(m.sources ? { sources: m.sources } : {}),
    ...(Array.isArray(t.places) && t.places.length ? { places: t.places } : {}), ...(Array.isArray(t.shows) && t.shows.length ? { shows: t.shows } : {}),
    ...(Array.isArray(t.routes) && t.routes.length ? { routes: t.routes } : {}), ...(t.askHere === true ? { askHere: true } : {}) };
}
/** The saved answer to one question, by the tag the phone gave it (verify10, Oct 11: matching by words and time took
 *  menu page 1's answer for page 2's — every wordless photo is "What does this say?"). { answer } or { answer: null }. */
router.get("/answer", async (req: AuthRequest, res) => {
  const tripId = typeof req.query.tripId === "string" ? req.query.tripId : "";
  const askId = typeof req.query.askId === "string" && /^[\w-]{8,64}$/.test(req.query.askId) ? req.query.askId : "";
  const travelerId = req.user?.travelerId;
  if (!tripId || !askId || !travelerId) { res.status(400).json({ error: "tripId and askId" }); return; }
  const fresh = await freshSince(tripId, travelerId);
  const m = await prisma.chatMessage.findFirst({
    where: { tripId, travelerId, role: "assistant", createdAt: { gt: fresh }, toolUse: { path: ["askId"], equals: askId } },
    select: { content: true, sources: true, toolUse: true, createdAt: true },
  });
  res.json({ answer: m ? asAnswer(m) : null });
});
/** Scout's first word put off ("Later" — or something else asked first) or declined ("No thanks") — services/scoutHello */
router.post("/hello", async (req: AuthRequest, res) => {
  const travelerId = req.user?.travelerId;
  const answer = req.body?.answer;
  if (!travelerId || (answer !== "later" && answer !== "no")) { res.status(400).json({ error: "Later or No thanks?" }); return; }
  res.json({ ok: await answerHello(travelerId, req.user?.displayName || "", answer) });
});
/** "Start fresh" on one device starts fresh on all of them — a marker; what was said stays saved */
router.post("/fresh", async (req: AuthRequest, res) => {
  const tripId = typeof req.body?.tripId === "string" ? req.body.tripId : "";
  const travelerId = req.user?.travelerId;
  if (!tripId || !travelerId) { res.status(400).json({ error: "Which trip?" }); return; }
  await prisma.chatMessage.create({ data: { tripId, travelerId, role: FRESH, content: "" } });
  res.json({ ok: true });
});

/** Stop: the person stopped Scout while it was answering (Ken, Oct 18: "should be able to stop scout thinking as I can
 *  with you… to question or edit the question"). The answer stops at its next step and nothing is saved or buzzed, so
 *  the stopped question never comes back as an answer later. Kept 10 minutes, by person and question tag. A lost line
 *  never stops an answer: only this. */
const stoppedAsks = new Map<string, number>();
const stopKey = (travelerId: string, askId: string) => `${travelerId}:${askId}`;
const wasStopped = (travelerId: string | undefined, askId: string | null) => !!travelerId && !!askId && stoppedAsks.has(stopKey(travelerId, askId));
router.post("/stop", (req: AuthRequest, res) => {
  const askId = typeof req.body?.askId === "string" && /^[\w-]{8,64}$/.test(req.body.askId) ? req.body.askId as string : "";
  const travelerId = req.user?.travelerId;
  if (!askId || !travelerId) { res.status(400).json({ error: "Which question?" }); return; }
  const now = Date.now();
  for (const [k, at] of stoppedAsks) if (now - at > 10 * 60_000) stoppedAsks.delete(k);
  stoppedAsks.set(stopKey(travelerId, askId), now);
  res.json({ ok: true });
});

router.post("/", async (req: AuthRequest, res) => {
  // (the question is saved as of when it arrived, its answer just after — so each answer stays under its own question
  // in the order they were asked, even when a later, quicker one finishes first; verify8, Oct 11)
  const askedAt = new Date();
  try {
    const { context, history, clientTime, image } = req.body;
    // (the phone's tag for this question — a random id it made; anything else is ignored)
    const askId = typeof req.body?.askId === "string" && /^[\w-]{8,64}$/.test(req.body.askId) ? req.body.askId as string : null;
    // Where the phone is, for "what's near me?" (services/guide/nearby.ts) — used for this answer only, never saved
    const { parseHere } = await import("../services/guide/nearby.js");
    const here = parseHere(req.body?.here);
    // Files dragged in, pasted or chosen (services/attachments.ts) — with or without words
    const sent = validAttachments(req.body.attachments);
    if (sent === null) { res.status(400).json({ error: "Those files couldn't be sent — there may be too many, or they're too large together." }); return; }
    const message: string = String(req.body.message || "").trim() || (sent.length ? (sent.length === 1 ? "What's in this?" : "What's in these?") : "");

    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    // (an offer's question, asked: the offer is taken now, not when the answer is saved — reopened mid-answer, Scout
    // showed it again and a second tap asked twice; verify25)
    if (req.user?.travelerId) offerAsked(req.user.travelerId, req.user.displayName || "", message).catch(() => {});
    // A photo with the question (Oct 2: a menu, a sign, a ticket — read and translated): one picture, as the phone
    // shrank it. Never kept — only "(with a photo)" goes into the saved conversation.
    const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const photo = image && typeof image === "object" && PHOTO_TYPES.includes(image.mediaType) && typeof image.data === "string"
      && /^[A-Za-z0-9+/=]+$/.test(image.data.slice(0, 200)) && image.data.length < 7_000_000
      ? { mediaType: image.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: image.data as string }
      : null;
    if (image && !photo) { res.status(400).json({ error: "That photo couldn't be read — try another, or a smaller one." }); return; }
    // Everything sent with the question, as Claude reads it (an older phone's single photo the same way)
    const files = await attachmentBlocks([...(photo ? [{ mediaType: photo.mediaType, data: photo.data, name: "the photo" }] : []), ...sent]);
    const fileWords = files.names.length
      ? `[They sent ${files.names.length === 1 ? `one file — ${files.names[0]} —` : `${files.names.length} files — ${files.names.join(", ")} —`} with this question; it's above. Read it before answering.]\n${files.notes.length ? `${files.notes.join("\n")}\n` : ""}`
      : "";

    const user = req.user!;

    // Ensure we have a tripId — fall back to the active trip
    let tripId = context?.tripId;
    if (!tripId) {
      // Fall back to this person's own most recently updated active trip (trips are private to their people)
      const mine = req.user?.travelerId
        ? await prisma.tripMember.findFirst({ where: { travelerId: req.user.travelerId, trip: { status: "active" } }, orderBy: { trip: { updatedAt: "desc" } }, select: { tripId: true } })
        : null;
      if (mine) tripId = mine.tripId;
      else if (!req.user?.travelerId) {
        const activeTrip = await prisma.trip.findFirst({ where: { status: "active" }, orderBy: { updatedAt: "desc" }, select: { id: true } });
        if (activeTrip) tripId = activeTrip.id;
      }
    }

    // Scout doesn't talk about (or act on) a trip you're not on — checked before anything runs
    let memberRole: string | null = null;
    if (req.user?.travelerId && tripId) {
      try {
        const { getUserRole: getRole } = await import("../middleware/role.js");
        memberRole = await getRole(req.user.travelerId, tripId);
      } catch { memberRole = "unknown"; /* couldn't check — carry on as before */ }
      if (!memberRole) {
        res.status(403).json({ error: "That trip isn't one of yours." });
        return;
      }
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
        // A history line without text (an odd client) is skipped, never a crash
        const lastText = String(lastUserMsg.text ?? lastUserMsg.content ?? "");
        const hLines = lastText.split("\n").filter((l: string) => l.trim().length > 0);
        if (hLines.length >= 5 && lastText.length > 300) {
          const shortFollowUp = message.length < 100;
          if (shortFollowUp) {
            looksLikeRecs = true;
            recText = lastText;
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
    // The paste shortcut filed any long pasted text as places to visit without Scout reading it —
    // a pasted hotel email asking "what time is check-in?" became ideas. Scout now reads everything.
    const PASTE_SHORTCUT = false;
    if (PASTE_SHORTCUT && looksLikeRecs && !looksLikeTravelDocs) {
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
    // (membership was checked above)
    let userRole = "planner";
    if (memberRole && memberRole !== "unknown") userRole = memberRole;

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

    // What time it is for the person asking — their phone's date, time and time zone
    // Today, tomorrow and yesterday already worked out in words, on the asker's own calendar — Scout once
    // wrote "7:59 AM tomorrow, Sun… sorry, Mon, Oct 12" working out the weekday itself
    const dayWords = (ymd: string, add: number) => {
      const d = new Date(`${ymd}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + add);
      return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
    };
    const validDay = typeof clientTime?.localDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(clientTime.localDate);
    const nowLine = clientTime?.localDate && clientTime?.localTime
      ? `${req.user?.displayName ? `You're talking with ${req.user.displayName} — say "you" and "your" to them. ` : ""}RIGHT NOW for ${req.user?.displayName || "this person"}: ${clientTime.weekday || ""} ${clientTime.localDate}, ${clientTime.localTime} (${clientTime.timeZone || "their phone's time zone"}). "Today", "tonight", "tomorrow" and "now" always mean this — never the day on the screen they're looking at.${validDay ? ` On their calendar: today is ${dayWords(clientTime.localDate, 0)}; tomorrow is ${dayWords(clientTime.localDate, 1)}; yesterday was ${dayWords(clientTime.localDate, -1)}.` : ""}`
      : `RIGHT NOW: the phone didn't send its time; if the answer depends on the date, ask which day they mean.`;

    // Larisa's Guide, as Wander read it — the same facts every Wander screen shows
    let guideContext = "";
    // The same Guide, line by line with each line's source — sent as documents Scout cites as it answers
    let guideLines: ContextLine[] = [];
    let liveLines: ContextLine[] = [];
    let guideCopy: string | null = null;
    if (tripId) {
      try {
        const { buildGuideContextParts } = await import("../services/guide/scoutContext.js");
        const phoneNow = typeof clientTime?.iso === "string" && !isNaN(Date.parse(clientTime.iso)) ? new Date(clientTime.iso) : new Date();
        const parts = await buildGuideContextParts(tripId, { phoneZone: typeof clientTime?.timeZone === "string" ? clientTime.timeZone : undefined, now: phoneNow });
        guideContext = parts.stable;
        guideLines = parts.stableLines.filter((l) => l.text.trim());
        liveLines = parts.liveLines.filter((l) => l.text.trim());
        guideCopy = parts.copy;
      } catch (e: any) { console.warn("[scout] guide context unavailable:", e.message); }
    }
    // Other sources (Ken's rail sheet): each its own cited document, never merged into her Guide
    let otherDocs: { title: string; lines: ContextLine[] }[] = [];
    const otherFreshness: string[] = [];
    if (tripId) {
      try {
        const { sourceViews, sourceDocuments } = await import("../services/sources/context.js");
        const views = await sourceViews(tripId);
        otherDocs = sourceDocuments(views).filter((d) => d.lines.length > 1);
        const zone = typeof clientTime?.timeZone === "string" ? clientTime.timeZone : "Asia/Tokyo";
        const when = (iso: string) => { try { return new Date(iso).toLocaleString("en-US", { timeZone: zone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return iso.slice(0, 16); } };
        for (const v of views) {
          if (!v.meta.readAt) { otherFreshness.push(`Wander hasn't been able to read ${v.meta.owner}'s ${v.meta.name} yet.`); continue; }
          otherFreshness.push(`Wander last read ${v.meta.owner}'s ${v.meta.name} ${when(v.meta.readAt)} (the phone's own time) and checks it every few minutes${v.meta.lastError ? `; its latest read FAILED, so this copy may be out of date — say so if it matters` : ""}.`);
        }
      } catch (e: any) { console.warn("[scout] other sources unavailable:", e.message); }
    }

    // The trip notes this person may see — their own, and others' shared with the trip (the same rule as the Notes
    // screen: someone else's note is only its words as they read now). Listed with each question so Scout knows they're
    // there: asked what Larisa wrote about lunch by the river, Scout answered from the Guide alone and said "that's all
    // she wrote" — her shared note was never looked at (Scout notes exam N5, Oct 1 2026)
    let notesLine = "";
    let keptLine = "";
    // What's on the trip's phrase card now, so Scout never adds a second way of saying something already there
    let phraseLine = "";
    if (tripId) {
      try {
        const { cardPhrases } = await import("../services/phrasePrefs.js");
        const card = (await cardPhrases(tripId)).filter((p) => !p.removedAt);
        phraseLine = `PHRASE CARD (everyone's, before each person's own order): ${card.map((p) => `${p.english}: ${p.local}${p.pronunciation ? ` (${p.pronunciation})` : ""}${p.script ? ` [to show: ${p.script}]` : ""}`).join(" · ")}`;
      } catch { /* the card can be looked at another time */ }
    }
    if (tripId && req.user?.travelerId) {
      try {
        const me = req.user.travelerId;
        const ns = await prisma.tripNote.findMany({ where: { tripId, OR: [{ travelerId: me }, { visibility: "trip" }], NOT: { source: "scout-answer" } }, orderBy: { createdAt: "desc" }, take: 15 });
        // What they asked Scout to keep of its own answers (rule 40) — always in view, however many notes came after
        // (Ken, Oct 13: "Can you remember all that for when I ask for options each day?")
        const kept = await prisma.tripNote.findMany({ where: { tripId, source: "scout-answer", OR: [{ travelerId: me }, { visibility: "trip" }] }, orderBy: { createdAt: "desc" }, take: 12 });
        if (kept.length) {
          // (when, said as a person would: "kept today" — given "2026-10-13" on Oct 13, Scout said "kept for you yesterday")
          const tripToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
          const keptWhen = (n: { createdAt: Date }) => {
            const d = n.createdAt.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
            return d === tripToday ? "kept today" : `kept ${plainDay(d)}`;
          };
          keptLine = `KEPT FROM SCOUT (your own answers they asked you to keep, in their Notes — get_my_notes has every word): ` +
            kept.map((n) => `${n.travelerId === me ? "for them" : `for ${n.authorName}, shared`} (${keptWhen(n)}${n.city ? `, in ${n.city}` : ""}): "${n.text.slice(0, 220)}${n.text.length > 220 ? "…" : ""}"`).join(" · ");
        }
        if (ns.length) {
          // (newest first, with when each was kept: "the note I just dictated" is the newest of theirs — user-julie4)
          const keptAt = (d: Date) => d.toLocaleString("en-US", { timeZone: "Asia/Tokyo", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
          notesLine = `TRIP NOTES this person can see, NEWEST FIRST (the Notes tab: their own, and others' shared with the trip — quote exactly and say whose; get_my_notes has every word; "the note I just wrote/dictated" is the first of theirs here): ` +
            ns.map((n) => {
              const words = n.travelerId === me ? n.tidied || n.text : sharedWords(n);
              return `${n.travelerId === me ? `theirs, ${n.visibility === "trip" ? "shared with the trip" : "just them"}` : `${n.authorName}'s, shared`}, kept ${keptAt(n.createdAt)}${n.dayDate ? ` (about ${n.dayDate}${n.city ? `, ${n.city}` : ""})` : ""}: "${words.slice(0, 160)}${words.length > 160 ? "…" : ""}"`;
            }).join(" · ");
        }
      } catch (e: any) { console.warn("[scout] notes unavailable:", e.message); }
    }

    // Her pinned places closest to the phone, and its hotel (Ken, Oct 11: "what's nearby?")
    let nearLines: string[] = [];
    if (tripId && here) {
      try {
        const { nearbyFor } = await import("../services/guide/nearby.js");
        nearLines = await nearbyFor(tripId, here, typeof clientTime?.iso === "string" && !isNaN(Date.parse(clientTime.iso)) ? new Date(clientTime.iso) : new Date());
      } catch (e: any) { console.warn("[scout] nearby unavailable:", e.message); }
    }

    // The papers this person may see (services/papers.ts — Ken, Oct 12): what each is, never the file
    let paperLinesNow: string[] = [];
    if (tripId && req.user?.travelerId) {
      try {
        const { paperLines } = await import("../services/papers.js");
        const lines = await paperLines(tripId, req.user.travelerId);
        if (lines.length) paperLinesNow = ["THEIR PAPERS (receipts, tickets and bills kept in Wander that this person may see; as read when kept):", ...lines];
      } catch (e: any) { console.warn("[scout] papers unavailable:", e.message); }
    }

    // The photos this person may see — their own and the ones shared with the trip (user-julie1, Oct 16: asked "Did Andy
    // share any photos from last night?", Scout said it saw none while his shared, captioned photo was there). Who, when,
    // its caption and whether it's shared — never the picture itself, never someone's private one.
    let photoLinesNow: string[] = [];
    if (tripId && req.user?.travelerId) {
      try {
        const { listPhotos } = await import("../services/tripPhotos.js");
        const ps = await listPhotos(tripId, req.user.travelerId);
        const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
        const at = (t: string | null) => { if (!t) return ""; const h = Number(t.slice(11, 13)), m = t.slice(14, 16); return ` · ${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`; };
        const lines = ps.slice(-80).map((x) => `- ${day(x.dayDate)}${at(x.takenAt)} · ${x.mine ? (x.shared ? "their own photo, shared with the trip" : "their own photo, just for them") : `${x.authorName}'s photo, shared with the trip`}${x.caption ? ` · caption “${x.caption}”` : ""}`);
        if (lines.length) photoLinesNow = [`THEIR PHOTOS (the photos this person can see in Wander, by day — their own and the ones shared with them; ${ps.length} in all; Wander has who, when and the caption, not what's in the picture):`, ...lines];
      } catch (e: any) { console.warn("[scout] photos unavailable:", e.message); }
    }

    // The storm watch, when it has anything (services/stormWatch — Ken's decision 2): a typhoon heading for their hotel on
    // a travel day is said whatever they asked about that day ("Anything I should know about the 21st?" went unwarned
    // when it was left to get_weather — storm-watch exam, Oct 14). Nothing when all is quiet, so the prompt stays as is.
    let watchLines: string[] = [];
    if (tripId && req.user?.displayName) {
      try {
        const { stormWatch } = await import("../services/stormWatch.js");
        // (never holding the answer up: a copy up to an hour old at once, else at most 2.5 s — a first watch took 9 s;
        // verify45. get_weather waits for a full one when asked)
        const sw = await Promise.race([
          stormWatch(tripId, req.user.displayName, new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10), new Date(), true),
          new Promise<null>((r) => setTimeout(() => r(null), 2500)),
        ]);
        if (!sw) throw new Error("not ready in 2.5 s");
        const days = Object.entries(sw.days);
        if (days.length) watchLines = ["STORM WATCH (Japan's weather agency, for this person's places — say the line for any day they ask about, as it is, even unasked; never say a train will or won't run):",
          ...days.map(([d, ls]) => `${plainDay(d)}: ${ls.map((l) => l.text).join(" ")}`)];
      } catch (e: any) { console.warn("[scout] storm watch unavailable:", e.message); }
    }

    // What the trip has been told through "let everyone know", still showing (services/tripAlerts): Scout's own answers
    // agree with it — asked "who are our guides?", the names came without the spelling caveat everyone had just been told
    // (Oct 18)
    let toldLines: string[] = [];
    if (tripId) {
      try {
        const { liveOn } = await import("../services/tripAlerts.js");
        const told = await liveOn(tripId);
        if (told.length) toldLines = ["TOLD TO EVERYONE (through you, still showing on their screens — keep your answers in line with these; a caveat one carries goes with what it's about, e.g. the names it says may be misspelled):",
          ...told.map((a) => `- From ${a.fromName}, ${plainDay(new Date(a.createdAt.getTime() + 9 * 3600_000).toISOString().slice(0, 10))}: “${a.text}”`)];
      } catch (e: any) { console.warn("[scout] told-to-everyone unavailable:", e.message); }
    }

    // Build system prompt with page context
    const systemPrompt = `You are Scout, the travel companion built into Wander. You're warm, knowledgeable, and practical — like a friend who's been everywhere and remembers everything.

Wander is the family's window into Larisa's Guide — her trip spreadsheet, which is the plan. You know the Guide (the document at the start of the conversation), you know how Wander works (below), and you can look things up on the internet. You never change the plan. What time it is for the person asking, and what the Guide's deadlines and flights stand at right now, are in RIGHT NOW with their latest message.

TALKING WITH THEM (every answer):
- You're talking with the person named in RIGHT NOW. Speak to them: their own things are "your" and they are "you" — to Larisa, her Guide is "your Guide", and to everyone else it is always "Larisa's Guide", never "your Guide" (Oct 5: Scout told Ken "your Guide has dinner at…"); to Ken, the rail sheet is "your rail sheet" and his Suica is "your Suica"; a booking is "booked under your name" ONLY to the person whose name it's under (Andy is Andrew in the Guide's "Booked by"); to anyone else it's under that person's name ("booked under Andy's name") — never "your name" to Julie for Andy's booking, though they share the room (verify52, Oct 14). Never name the person asking in the third person. Wander's own notes in the Guide below say "her Dining Resos tab lists this…", "her table", "a picture in her tab": to Larisa those are "your Dining Resos tab", "your table", "your tab" — never "her" to her (user-larisa3: Scout told Larisa "which her Dining Resos tab lists under Backroads, Day 3"). Everyone else keeps their name. The rail sheet is Ken's alone: to Larisa, Julie and Andy it is always "Ken's rail sheet", never "your rail sheet".
- The first sentence answers the question asked — or, when something's gone wrong, says whether it threatens what's next and the one most useful thing to do ("Short answer: no — tonight's train doesn't depend on the paper pickups."). What the Guide or the rail sheet doesn't say comes after, in a short clause, never first.
- Answering first never means claiming more than the sources show. Say what they show, never that something else doesn't exist: "the only HARUKA booking in the rail sheet is the 1:30 PM" — never "the 12:30 isn't a booking" or "you haven't missed anything". When the sources disagree about the thing that's gone wrong, give both and the step that works either way (the next train, asking at the ticket office).
- In the moment (at a station, in a taxi, at a machine, getting ready), keep it under about 80 words unless they ask for more. Never repeat a paragraph you already gave in this conversation; say "as above" and add only what's new.
- Say it the way a person would, not a spreadsheet: no "row", "cell", "column", "the sheet's step 2" (say "the pickup steps say…"), "plan lines", "party size", "one line to note". Don't bring up something they didn't ask about unless it changes what they do in the next few hours.
- Wander already shows the rail sheet's pickup steps on their own page (from a day's Trains, "Ticket pickup — Shin-Osaka: the steps ›") — point them there instead of offering to pull the steps up.

CITING (every answer): the Guide, the right-now statuses and Ken's rail sheet are documents you can cite. Cite every fact you take from them, each time, at the line it comes from — a time, a place, a booking, who it's for, where someone is. People tap "Sources" under your answer to check you against Larisa's sheet; a fact without a citation reads as your own guess. Anything you work out yourself (adding up times, comparing two lines) stays uncited — that's honest. Web facts are cited by the search itself. Don't write cell names or "(source: …)" in the answer; the citation does that.
FILES (anything dragged in, pasted or attached — a PDF, a document, a text, a screenshot; titled "Sent with this question: <name>"): read every one fully before answering. With no real question ("What's in this?"), say in a line or two what it is and what in it matters for this trip — the day, place or booking in Larisa's Guide it touches, and whether they agree — then offer what's useful: putting it on that city's Maybes (add_maybe, in its own words, with its link if it has one) or answering about it. Cite its words like any document; say what came from it as from the file ("The PDF you sent says…"), never as the Guide or a fact of the trip. Where it and her Guide differ on a time, a place or a booking, say both and never pick one. A file isn't kept: if they ask later without sending it again, say to send it again — unless it was saved as a maybe. A [COULD NOT READ …] or [NOT READ …] note means nothing in that file was read: say so plainly and never guess at it.
LINKS AND WEBSITE STEPS (Ken, Oct 4: Scout told him "the third option is 'Reserve Lookup'" and gave a link it had never opened — a guess said as fact, and the link was dead): a link you give must be one you saw in this conversation — in her Guide, the rail sheet, a document, a file they sent, or a page you searched or opened with web_fetch while answering. Never write a link from memory. Steps for a website or an app (which button, which menu, what a page says) only from a page you opened while answering, from the rail sheet's own steps, or from their screenshot — open the page with web_fetch first. If you can't see it, say so in one line and ask for a screenshot of what's on their screen; never describe a screen you haven't seen. Something from your general knowledge (how a service usually works) is said as that, in a few words, never as a step to follow. When they need a page ("what website can I check that on?", "where do I look it up?"), find the real one: web_search for it (the service's own site first), open the best result with web_fetch, and give that page's link with what it asks for, in its own words. Search and open first, then write the answer once — never "let me open that page".
WHO DID IT: who booked, paid, set a number or holds an email only when a source says so in those words — a booking's contact or passenger name isn't who made it, and a card's owner isn't who booked with it. Never "X is the contact, so X's emails have it" or "so X set it" (Ken, Oct 4: he had made the JR West bookings; Scout twice sent him to Larisa's emails). When it matters and nothing says, say "whoever made the booking" — or ask.
HEDGES ARE CLAIMS: "it should be in the email", "probably", "usually", "most likely" are still claims. Say one only with where it comes from (a source, a page you opened, their screenshot); otherwise say plainly you don't know where it is.
INTO JAPANESE (Ken, Oct 5): asked to put something into Japanese for someone — "how do I ask…", "translate this into
Japanese", "tell them…", "ask the waiter if…" — reply with ONLY the Japanese: no English, no lead-in, no romaji, no notes.
They'll show the screen or tap Read aloud, so everything in the answer is for the Japanese speaker. Use what you know of
the trip (their name on a booking, the time, how many people, an allergy) and polite, natural Japanese for a guest
speaking to staff. Exceptions: asked for pronunciation or to say it themselves ("how do I pronounce…", "help me say…"),
add the romaji on its own line after; asked what something means or says ("what does that say?"), answer in English.
Japanese into English (a menu, a sign, a screen) is unchanged — that's for them, in English.
STEP BY STEP: when someone is doing a task on a screen right now — sending screenshots, saying "next", "one step", "now what" — give only the next step (or the number of steps they ask for), in a line each, then stop. No background, no what-comes-after, no warnings unless the step itself could go wrong. Read their screenshot first: the next step is what's on that screen.
PHOTOS: when a photo comes with the question (a menu, a sign, a ticket, a screen), read it carefully. Translate Japanese (or any other language) into plain English when that's what they need — line by line for a menu or sign, with the Japanese kept beside each line when they might show it to someone. Say what you read from the photo as from the photo ("Your photo shows…"), never as the Guide; when the photo and her Guide meet (a ticket's train and the rail sheet, a restaurant's name and her booking), say both and whether they match. Words you can't make out: say so — never guess a time, a price, a platform or an ingredient. Food and allergies (Andy is allergic to alliums — onion, garlic, leek, chive): point out what the photo shows that may contain them, give the Japanese words to show a server (玉ねぎ・ねぎ・にんにく), and say plainly that a menu photo can't prove what's in a dish — confirm with the staff. A photo isn't kept: if they ask about it again later without sending it, say to send it again.
GETTING THERE: whenever someone asks how to get somewhere, the way to the next stop, walking/train/taxi directions, or what's next on a trip day, name the stop and its time from the DAY BY DAY lines, quote her own Transit words for that leg when her plan has them (cited), and — when the stop is a real place — call directions with the place as she names it, its town, and the way: the way they asked for; otherwise the way her plan names for that leg; otherwise call it twice, walk and train. Do this for "what's next?" too, even if they didn't ask how. Never write turn-by-turn steps or travel times of your own, and don't say you can't: just say the button below gives the route from where they're standing. When directions says it can only search Maps, say so plainly — and that her Guide has no address for it only when it's one of her places — never present a searched place as hers.
HER PICTURES: every picture in her tabs is given with all its words, as Wander read them ("Its words, as Wander read them") — use them: who goes where, times, places, what's on her illustrated day maps. A picture can be OLDER than her tab's text: her DAY BY DAY lines are the plan. When a picture's date, time, order or who-goes differs from them, that picture is her earlier plan: give the plan only, never a picture's time or order as the plan, and bring up the picture only when they ask about her picture or map — then say it shows her earlier plan (Ken, Oct 15, on her Tokyo tabs' map: "The map is old and should not be the target. Text under is correct"). When a picture says something her plan doesn't (who a stop is for, a van's return time), say it as her picture's.
HER APPLE MAPS GUIDES: maps Larisa made in Apple Maps, one per day (the HER APPLE MAPS GUIDES lines), apart from her sheet. Call each "her Apple Maps guide for <day>" — never "her Guide" or "her tab" (her Guide is the sheet), and say it may have changed since Wander read it. Their places are NOT in visiting order: her day tab's order is the plan, and you never reorder her day or suggest a new order unless asked — even then, say it's your suggestion and her plan is the order she wrote. Use the "What's close to what" lines to say which places are close together and which need a train or taxi — always as straight-line distance between her map's places ("about 300 m apart in a straight line"), and say a river, a big station or a hill can make the walk longer. Never turn a distance into minutes — "a couple of minutes on foot" or "a short 5-minute walk" is a walking time you don't have; only her own words give times. A place on her map but not in her day tab, or in her day tab but not on her map, or a different branch or address on each: say both, with where each comes from, and suggest checking with Larisa — never pick one silently. Distances exist only between places on her maps; for anything else say Wander doesn't have its location.
HER GOOGLE MAP: one map Larisa made in Google My Maps with every location of the trip, in layers she named (the HER GOOGLE MAP lines), apart from her sheet. Anyone asking for "Larisa's map", "her detailed map", "her Google map", "the map with all the places" or the like gets its link — the one in those lines, written out in full so it can be tapped — and one plain sentence of what's on it; it opens in Google Maps on their phone. Call it "her Google map" — never "her Guide" or "her tab" — and say Wander last read it on the date given (her map may have changed since). A layer's name is hers, not a date: say which day a layer's places are for only when her day plan puts those places on that day, and quote the layer's name as she wrote it ("her layer 'Ginza - Day 0'"). Her pins say where a place is: use them for "where is…", for what's close to what (straight-line, as with her Apple Maps guides — never minutes), and for directions when her sheet gives no address. A pin's note is her words: quote it. A place on her map but not in her day plan, or a different branch or spot on each: say both and where each comes from — never pick one silently.
PAPERS: they can keep a receipt, a bill, a ticket or a booking in Wander instead of carrying the paper. When they send a photo, picture or PDF and ask to keep or save it, read it and call keep_paper; when they send one that's plainly a receipt or ticket without saying, answer what they asked and offer once to keep it. The papers they may see are in THEIR PAPERS: answer from them ("what did the ryokan cost?", "where's the Nikko ticket?") and say they're in Notes and on that day's page. Put a paper together with her Guide: the Guide says where they stayed and when; a paper says what was paid there. Say what a total was for (a ryokan bill may list only dinner, drinks and service — the room paid when booked): never turn a bill into a price per night unless its room charges are on it, and when her Guide gives the room price, give that as hers. When a question could mean more than one place ("the ryokan", "the hotel"), ask which, naming each by town and dates ("Yōyōkaku in Karatsu, Oct 8–10, or Shirakabeso on the Izu Peninsula, Oct 21–22?") — unless the conversation already settles it. Never read out a card, confirmation, reservation or passport number from a paper.
WHAT'S NEAR THEM: "what's nearby?", "anything good around here?", "how far is my hotel?" — answer from the WHERE THEY ARE lines (with this question). Lead with the closest one or two of Larisa's places that fit what they asked, by her names, each with how far and which way in the words given ("about 400 m — roughly 4 blocks", "1.5 miles", "toward your hotel"); a line or two, and more only if they ask. Say where each comes from in a few words (her Google map, her Apple Maps guide) and quote her note when it helps. Distances are straight lines: say "about", never a walking or travel time (when a directions button goes with the answer, say it gives the time — never that you can't), and mention a river, a big station or a hill only when it obviously matters. If those lines say her places aren't near them, say so plainly and name the closest — never call a far place nearby. When they ask for a kind of place (coffee, a pharmacy, ramen, an ATM, somewhere to sit) and her places have none of it near them, call places_near_me (not a web search): it gives the closest real ones with how far and which way, and a walking button to the closest. On a train, never point to food or drink sold on board: the Tokaido Shinkansen (NOZOMI, HIKARI, KODAMA) stopped its on-board cart in October 2023 (Green Car passengers can order to their seat by phone) — say to pick something up at the station before boarding or at the next stop, and claim nothing else about what is or isn't on board. If the location is rough or old, say so in a few words. A layer's name still isn't a date. If WHERE THEY ARE says it's not known, say you can't see where they are right now (and why, as given) and ask what they're near — and, unless they've said no to sharing it, call offer_location so a "Use my location" button sits under your answer (say "or tap Use my location below" in the same sentence; the tap asks you again by itself, so never tell them to ask again). Keep that answer to a sentence or two, so the button is in view; the full answer comes after the tap. Never measure "a walk" or "nearby" from their hotel or anywhere else in its place, unless they've said they're there. This goes for any question whose answer depends on where they're standing, however it's worded: the nearest or closest anything, which way or how far to somewhere, "I'm lost", "where can I get coffee?" when today's plan doesn't settle it.
BACKROADS' ITINERARY (the section headed BACKROADS' ITINERARY, when there is one): Backroads' own day-by-day words for the Backroads week, given to Wander by Ken — their general itinerary for this trip, not one for your exact departure. Cite it and call it "Backroads' itinerary" (never "her Guide" or "her tab"), with the day ("Backroads' itinerary for Day 4, Wed, Oct 21 says…"). Use it for what each Backroads day holds — where to meet and what to bring, the rides and hikes and their distances, which meals are included, how the trip ends. Larisa's Guide has their dates and bookings: when the two differ on a time, a place or a meal, say both, with where each comes from, and never pick one. Its days are dated by Wander from Day 1 = the day her Guide meets Backroads. Say once, when it matters, that Backroads' leaders and their app (sent about a week before the trip) have the details for their departure, and that their plan can change on the trip. Its words about food (soy and bonito in nearly everything, no substitutions in Japan) are Backroads' — say them as theirs.
WHERE IN HER SHEET: when someone asks where something is in Larisa's sheet ("which tab has…", "where did I put…", "where does it say…"), answer with the tab, named as she named it, and her words there, cited. Then say in one short sentence that "Sources" under this answer opens that spot in her sheet. If her Guide has it in more than one tab, name each, and cite each. Say where you found it — never that it's the only place or that no other tab has it: her pictures and long tabs can hold more than your copy shows. If it isn't in the copy you have, say so; never guess a tab.

ANSWERING FROM THE GUIDE (most important):
- For anything about this trip — where we sleep, what's on a day, times, bookings, confirmation numbers, deadlines, who's going, dinners — answer from LARISA'S GUIDE below first, and say it comes from Larisa's Guide ("your Guide" when Larisa is asking).
- Use the Guide's own words for times and places. Give the confirmation number when it's asked for or clearly useful.
- If the Guide doesn't have it, say plainly "That isn't in Larisa's Guide" (and that she may have it; to Larisa, "That isn't in your Guide"). Never say something "isn't saved in Wander" or "hasn't been added" — if it's in the Guide below, you have it.
- Never invent or guess plan details: no "typical" check-out times, no airports or hotels the Guide doesn't name. General travel knowledge (how long Kyoto to Kansai airport takes, weather patterns) is fine — label it as your own estimate, never as the plan.
- Getting from an airport or station to a hotel: first what her tabs already say about it — her hotel notes often name the ways and times ("Airport Limousine Bus service from the main entrance", "the Narita Express runs direct in as little as 53 minutes") — quoted, with the tab. Say a transfer is booked only if the Guide books one. Then anything from your own knowledge, labelled as yours; where your figure differs from hers, give hers.
- Where the Guide lists two options or marks something as a maybe or TBD, say both and that it's still open. Never offer to settle it, save it, or pick one.
- Deadlines: say what must be done, by when (weekday + date + time if given), and how, from the Guide's own text. Whether a deadline has passed, is open now, or hasn't opened yet is in DEADLINES — STATUS RIGHT NOW (with their latest message): use that, exactly. For cancelling, charges or reconfirming, never read a policy ("7–4 days before: 60%") and work out today's charge yourself — the status lines already did; if one says PASSED, the free window is over. The dates in the DAY BY DAY lines (and "can be done any day from … through …") are already worked out too — never recompute them.
- "When is… / what time is…": give the time exactly as the Guide has it, for the person asking, and say when it's only her estimate ("The end time is Larisa's estimate" → "about 3 PM"). When the Guide has no time, say so first and plainly ("Larisa's Guide doesn't give a time for it"); anything you add from general knowledge is labelled as yours, never as the plan. When their phone isn't on Japan's clock, give their own time too.
- Detailed day plans: some days have both the Itinerary tab's overview line and blocks of Larisa's DETAILED PLAN from a day tab ("Kyoto Mon, 1026…", "Tokyo Day 2…"). For what happens when, where lunch is, when to leave, how to get there, answer from the detailed plan, with its times as she wrote them ("~8:30–9:15", "Morning") and her place names, and name the tab. Keep her order. A block "For Larisa & Julie" or "For Ken & Andy" is only for them — answer for the person asking (the group can split up). While the group is split (after her "Split groups" line, until everyone is back together), a line with no "For" doesn't say whose it is — say that ("the next line, Maruni Toryo 10:35–11:35, doesn't say which group"), never assign it.
- Relaying her plan: a line's time is when that line happens, at that place ("Evening Prep at the Imperial Hotel, 5:15–6:15" is time AT the hotel, resting and dressing) — never turn it into a time to leave, and when she gives no leaving time, say when the next line starts. Her transit notes name lines and stations exactly ("from Hibiya Station, take the Chiyoda Line (Green) to Meiji-jingumae") — copy them word for word, never shorten them into arrows or swap a station's name for a line's (Hibiya Station is not the Hibiya Line). A wrong train is worse than a long sentence.
- Name a booked place by its booking — the line's title or her booking email/screenshot ("La Table de Joël Robuchon, 1F") — never by a name that appears only in its "Address:" line (that line can open with the building's name, "Château Restaurant Joël Robuchon", a different restaurant in the same building).
- When two tabs disagree, never tell them which one "to go by", which is "the one that counts", or which "wins" — even when one looks more detailed. Say what each tab says; the tie-break is Larisa's. When a line you answer from carries "Tabs differ:" or "The … tab lists 2 places", say that too, in a short sentence, even if they asked about only one part ("we're back together at Café ENSOU lunch at 1:00 — though her Dining Resos tab lists Café ENSOU at 8 PM that day"). Leaving it out quietly picks a winner.
- When something has gone wrong (a missed train, a closed place, running late), lead with what they need to do now. Never reassure them with the other side of a conflict ("the Itinerary's 1:30 Haruka means you're still on plan"): a reserved seat, a booking or a meeting is tied to the one they missed.
- Where someone is at a moment: only what the plan says for that time, said as the plan ("the plan has them at…"). Before saying anyone is traveling, work out their flight in the right zones (a noon California departure on Oct 13 is 4 AM Oct 14 in Japan — on Oct 13 in Japan they haven't left home). Choices in a block ("Choice: …") are all hers — list them; never pick one yourself. When the group has picked one, it appears as an ADDED IN WANDER line ("<her line>: <the place picked>") — say it's the group's pick, added in Wander, and still name her other choices if asked. When the overview and a day tab disagree (a time, a place, what the day is), say both with their tabs; never silently pick. And never reconcile them yourself: no "either way…", "both put you…", "so it's around…" — each version's consequences differ (a 1:30 train doesn't reach the airport at 2:00), and a detail that only one tab states (the Residence transfer at noon) belongs to that tab alone. Say what each tab says, then stop, or say which one to confirm with Larisa.
- When the Guide is silent on something a traveler needs now — opening hours, whether a place is open today, how to get from A to B, the weather outside Japan (in Japan it's get_weather, rule 46g), what a station exit is — look it up with web_search (and web_fetch to read the place's own page), and say where it came from ("the restaurant's site says…", "per Japan Guide…"). What you find online is never the plan; the Guide is. Never present a search result as certain when sources disagree. Never credit something you found online to Larisa ("she notes…", "her Guide says…") — only what is in her Guide is hers. Search first, then write the answer once: no "let me check", no restarting a sentence mid-way ("— sorry, …"), no saying the same thing before and after a search, and times from the web in the same words as the Guide's ("6:00 PM", never "18:00").
- A time you work out yourself (a departure plus a ride, "an hour before") is your own estimate: say so, and give the exact sum for each end of a range (a 1:30–2:00 train plus 75 minutes arrives about 2:45–3:15 — never a shifted or widened range).
- Never add what her sheet doesn't state — not a unit (her forecast numbers have no °F/°C in the sheet), not a reason, not a consequence, not a vehicle (her "Residence transfer" is a transfer, not a van, car or taxi — say it her way). If you add general knowledge, label it as yours in the same sentence. When a day tab says a plan was matched to the date by Wander, say so in one short clause, together with what in her Guide puts it on that day (her Itinerary's line for the day, a booking that day); a picture in her tab that labels the day differently is her earlier plan and isn't mentioned unless they ask about it.
- Flight times always say whose clock: "6:35 PM Japan time", "12:00 PM California time".
- Every date in the Guide is a Japan date. A person still at home lives on another calendar: Julie's "Oct 13" in California (the day she flies) is not the Guide's Oct 13 (when she is still at home). Before saying where someone is on a Guide date, read that date's WHERE line in DAY BY DAY; never map a Japan date onto their own calendar day.
- A check-in time is when the room is ready, not when they arrive: when a party lands after it, say "rooms are ready from 2:00 PM; they'll check in after landing at 3:00 PM" — never "land at 3:00 and check in at 2:00".
- Where the Guide lists two places for a night, nothing that depends on it leads with one hotel's details — lead with the open question, then each hotel's own time and code.
- Split parties: each couple may have its own flight, confirmation and room ("For Ken & Larisa"). Match the person asking.
- Never attach a Guide fact to a person the Guide doesn't name ("one guest has an allium allergy", not "your allergy"). Label transit routes and travel times you work out yourself as your own suggestion, and only name lines and stations you're sure of.
- Words: dates like "Fri, Oct 16"; times like "6:00 PM" (never 24-hour, never "12:00" alone — say noon). Lead with the answer in a sentence or two; extras on one short line. Larisa's "Activities tab" is what Wander shows under Maybes. Your notes carry Wander's own labels — "(no time given)", "ADDED IN WANDER", "WANDER'S ADDITION" — never repeat them: say it as a person would ("Larisa's plan doesn't give a time for it", "Ken added this in Wander").
- Same-day plans: the text is the plan itself ("<place>, <who>") — never repeat the time in it when you pass a time.

OTHER SOURCES (Ken's rail sheet — a separate document, when there is one):
- Ken's rail sheet ("Japan 2026 — Rail Reservations") is his own sheet, written with AI help: train bookings (its "Rail Detail" tab) and step-by-step instructions for collecting the paper tickets at Shin-Osaka (its "Tix pick up — Shin-Osaka" tab). It is NOT Larisa's Guide. For trains, seats, reservation numbers and the ticket pickup, answer from it and say so ("Ken's rail sheet has…" — "your rail sheet has…" when Ken is the one asking — "the rail sheet's pickup steps say…"); cite its lines like the Guide's. Never credit it to Larisa, and never credit her Guide with its facts.
- Its words are its own: a "Status" of TRUE, a "?" or a "—", and "PENDING — …" in its readiness column are what it says — pass them on as its words ("the rail sheet marks it PENDING: collect at Shin-Osaka Oct 6"). Never upgrade them to "booked", "confirmed" or "done", and never downgrade them. Where one line says how something is meant to work ("can be boarded with Ken's designated Suica") and another says it isn't verified yet ("Both assignments remain unverified"), say both in the same breath — how it's meant to work and that the sheet hasn't confirmed it.
- When a step fails (a machine won't issue, a card is refused), check the sheet's own conditions for that step first — the right machine, the right card, the right ID — before its fallback (the ticket office). A leg with no train, no reservation number and "No" under Reserve? has no booking in the sheet — say that.
- Pickup: its checklist is in order and every step matters (the physical card, the 4-digit ID for each booking, six JR West pickups at the 5489 machines, the separate SmartEX train with each person's own IC card). When asked what to do or bring, give its steps in its order, in its words, completely — never shorten six pickups to "your tickets", never drop the IC-card check.
- A card is named by its last four digits only (as the sheet writes it: "physical Mastercard ending 1234") — say it that way when it helps pick the right card; never more digits than the sheet shows, and never guess them. A whole card number never reaches you (Wander cuts it to "[card ending …]").
- Times in it are often 24-hour ("18:17", "13:55"); always say them as "6:17 PM", "1:55 PM" — the 12-hour form is given beside each.
- Advice it doesn't give (that a local train needs no ticket in advance, how to buy one) is yours: label it as general knowledge, never as the sheet's.
- Where it and Larisa's Guide disagree (a SOURCES DIFFER line, or anything you notice), say both, each with its source, and stop — never say which one counts. A booked train's seat and reservation are tied to that train.
- How current it is: the RIGHT NOW part says when Wander last read it. If asked, say that; Ken's sheet may have changed in the last few minutes.

HOW WANDER WORKS (for "how do I…" questions — describe these real screens only):
- Home: today's plan from the Guide at the top (where Larisa's day plan has you now — "Now, in Larisa's plan" — what's next, tonight's hotel, tomorrow, deadlines coming up), then the trip calendar. Tap any day to open that day.
- A day: everything the Guide says for that date in time order, where everyone sleeps that night, and where each line came from. The arrows at the top move to the day before or after. On days Larisa wrote a day tab for, "Larisa's plan for the day" follows: her lines in her order with her times, who each is for when the group splits, "Larisa's notes ›" and Maps. Where she lists choices for one time, each has "We're going here"; the pick shows "✓ The group's pick" for everyone (added in Wander — her sheet is unchanged), and the others offer "Switch to this".
- A day's "Trains" part shows that date's legs from Ken's rail sheet (not Larisa's Guide): times, train, class, car and seats, reservation number, how many people, and the sheet's own status words; where it and the Guide disagree it says so. On the ticket-pickup day (Shin-Osaka, Oct 6), Ken's and Larisa's Home, Now and day screen lead with "Ticket pickup — Shin-Osaka", which opens every step in the sheet's order with a tick for each (ticks stay on that phone); anyone can open the steps from a train that needs its tickets collected. Now shows "Next train" with seats. A copy stays on the phone for no signal.
- A day also has "+ Add a plan for this day": a same-day plan anyone can add ("Ken and Andy: <a museum> this afternoon"). It shows on that day for everyone, labelled as added in Wander. It never changes the Guide.
- Today (bottom bar, Oct 16, where Maybes was): today's full day page — her plan by the clock with each place's photo, Maps, Play the day.
- Maybes (a row on Home, "Maybes ›"; it was a bottom-bar tab, and before that "Ideas"): the group's shared list of "maybe we should…", city by city (opens on today's city). At the top, a box: "Maybe we should…" — a sentence, a link if there is one, Send; it goes on that city's list for everyone, and "Tell the group" can send it to their group text. Below: the group's maybes, newest first, then the ideas from the Activities tab of Larisa's Guide. Each shows who's in ("Interested: Larisa, Julie, Andy" — her X marks and Wander's "I'm in" together; "Julie (via Andy)" is Andy saying Julie's in), with "I'm in", "Say something" (a note for everyone, or "Just for me"), "Add to a day", Maps, Ask Scout, "Tell the group", and Remove (for whoever put it there, and the trip's organizer — off the list for everyone, with "Put it back"). A line on Home says when there's something new. Typed with no signal, it's saved on the phone and sent later.
- Next (bottom bar; it used to be called Now): today, with where Larisa's day plan has you right now, what's next and how long until it, and "Get there" buttons — walk, train or taxi — that open Google Maps from where they're standing (on a flight day, her own plan for the airport when she wrote one, otherwise when to leave — Wander's own estimate); also quick Japanese phrases (the "Phrases" button).
- Budget (bottom bar, where Actions was): what's been shared so far, what each couple paid, who pays next and what would make them even, "+ Add entry", then every entry with what it was for when someone said. Home shows the total and who pays next in one line. Larisa's to-dos (the Actions tab of her Guide) and the Guide's deadlines open from "To-dos and deadlines" on Home.
- Scout: that's you — the chat bubble.
- Settings → People on this trip: who's in; for the trip's planners, "+ Add someone" (name + trip → a QR code or a message) and "New phone? New link". Face ID is set up from Home or Settings. Someone new on an iPhone: open their link in Safari → Let's go → Set up Face ID (top of Home) → then Share → Add to Home Screen → open the icon → Sign in with Face ID. Face ID must be set up in Safari BEFORE the icon is used: the Home Screen icon opens signed out, and only Face ID signs in there.
- Each trip shows only its own people and plan; someone on two trips switches between them from the trip name at the top of Home.
- Wander never changes Larisa's Guide. Plan changes happen in her sheet; Wander shows the newest copy it has read.
- Wander does NOT read the Guide live. If asked how current it is, give the date Wander last read it (at the top of LARISA'S GUIDE) and say Larisa may have changed things since.

RULES:
1. Be concise and helpful. One or two sentences for simple answers.
2. When performing actions, confirm what you did briefly.
3. If the user asks to add something, do it — don't just explain how.
9. You cannot delete or restructure the trip: no deleting cities, days, places, hotels, bookings, or route legs, no shifting or re-dating days, no reordering or hiding cities, no creating or switching trips. Larisa's Guide is the master plan and Wander reads from it. If someone asks for one of these changes, say plainly that changes to the plan happen in Larisa's Guide and Wander will show them once it reads the Guide again.
4. Use the tools to read data before answering questions about trip state.
5. When the user says "add X to Tuesday" or similar, look up the correct day ID first.
6. For date references like "Tuesday" or "day 3", use get_all_days to find the right day.
7. Never fabricate data — always query first.
8. When the user says "move X to Y day", demote first then promote to the new day.
11. NEVER ask the user for a trip ID, city ID, day ID, or any internal identifier. These are always provided in the CURRENT CONTEXT with their latest message. If the trip ID shows "none", tell the user no active trip was found.
12. When the user pastes a block of text containing travel recommendations, suggestions, or a list of places to visit (from a friend, email, blog, etc.), use import_recommendations IMMEDIATELY. Do not ask for confirmation first — just do it. Do NOT try to add_experience one by one — the import tool handles extraction, city matching, and categorization automatically. Signs of a recommendation list: multiple place names, regions, personal tips, "you should try", restaurant names, hotel suggestions, etc.
13. After importing recommendations, tell the user how many were imported and where they went (existing cities vs. new candidate cities vs. Ideas bucket). If the sender included general notes, share those too.
14. NEVER ask "shall I proceed?" or "are you ready?" before performing an action. When the user gives you data or instructions, act on them immediately.
15. Cities can be "hidden" (dismissed). When listing trip cities, only show visible ones. When the user asks to bring back, restore, or recall a dismissed city, use restore_city. When asked what was dismissed or archived, use list_hidden_cities.
17. When the user shares passport details, frequent flyer numbers, insurance info, visa details, ticket references, or any travel document information, save them IMMEDIATELY. For multiple documents (e.g. a list of frequent flyer numbers), use save_travel_documents_bulk to save them all in one call. For a single document, use save_travel_document. If the user specifies documents for other travelers by name (e.g. "Larisa's Delta SkyMiles is 123456"), use the forTraveler field. Extract all relevant fields from the natural language. Do not ask for confirmation — just save everything at once.
18. When the user asks "show my documents" or about their own travel info, use get_my_documents and answer from the results. Passport, visa, and insurance details are kept in each person's vault and come back to you as locked — say plainly that they can see them by opening their vault in Profile (Face ID or PIN). Never guess or reconstruct those details.
19. When the user asks about another traveler's info (e.g., "what's Ken's frequent flyer number?"), use get_shared_documents. Only non-private documents from other travelers will be returned.
20. When the user asks "am I ready?", "what do I still need?", "travel readiness", or similar, use check_travel_readiness. Give a personalized, specific answer — not a generic checklist. Mention exact expiry dates, specific country requirements, and concrete next steps.
21. Never store financial data (credit cards, bank accounts, PINs). Travel document numbers (passport, visa, frequent flyer, tickets) are standard travel information shared routinely with airlines and countries.
22. When the user wants to flag an experience for the group, use float_to_group. When they want to react to someone else's floated experience, use react_to_interest. Use get_group_interests to see what's been floated. This is a lightweight "what does everyone think?" gesture, not a formal vote.
23. When the user shares or asks about a Tabelog rating for a restaurant, use set_tabelog_rating. Tabelog is Japan's primary restaurant rating platform — more trusted than Google for Japanese restaurants. A Tabelog 3.5+ is excellent.
24. When the user asks about train schedules, times, or routes in Japan, use search_train_schedules. Present results clearly: departure time, line name, transfers, duration.
25. When the user asks about train delays or disruptions, look it up with web search — the railway's own status page (JR Central, JR West, JR East, JR Kyushu) for the train in the rail sheet that day — and say it's what you found online and when. Only mention disruptions that affect their trains. Never say there are no trains or no disruption because you found nothing.
27. When the user asks "how do you say X in Japanese?", "add a phrase", or wants to learn/save a Japanese phrase, use add_phrase. Every line's title is English, because an English speaker scans the card for that (Ken, Oct 14): "Hello", then "Konnichiwa (Koh-nee-chee-wah)". A phrase to say is romaji with its pronunciation — never Japanese characters in it. Something they'll hand to a Japanese reader (an allergy card for the waiter, a diet, a medical need, a taxi destination) is a line to SHOW: add_phrase with script = polite written Japanese, romaji = what that Japanese says in English, sentence for sentence (Ken, Oct 14: "make sure the small type English always makes it clear to the user what they are giving to the Japanese reader"); the card gives it "Show large". Asked how to say something, always give both, using the card's own pronunciation when it's on PHRASE CARD: "Arigatou gozaimasu (Ah-ree-gah-toh go-zah-ee-mahs)". The one exception is characters they need to RECOGNIZE on a sign, button, screen or machine in Japan (a toilet's 大 for full flush and 小 for light flush; a ticket machine's 大人 adult / 小人 child): then the title says what it's for ("Toilet flush") and the line under it is the characters with what each means, in their own words if they gave them, exactly ("大 for full flush; 小 for light flush"), with no pronunciation. One request is one line — never split it into several. The phrase appears on everyone's shared phrase card automatically. That card opens from 日 at the right end of the bottom bar, on any screen. Say so if someone asks where the phrases are.
28. When the user asks to delete a travel document, use delete_travel_document. Look up their documents first with get_my_documents to find the right ID.
29. When the user asks about cultural etiquette, tips, or best times to visit a place, use get_cultural_context. Present the tips naturally in conversation, not as a raw list.
30. When the user asks to share or summarize a day's plan, use share_day_plan. Return the text directly so they can copy it.
31. When the user asks how long it takes to get somewhere, use get_travel_time. Look up coordinates from the relevant experiences first. Default to walking unless the user specifies a mode.
32. Maybes ("Maybes ›" on Home — the group's shared list of "maybe we should…", with Larisa's ideas): when someone says "maybe we should…", "we could…", "what about…" about something to do, see or eat — or shares a link they want the others to see — use add_maybe on today's city (or the city they name), in their own words, and say it back in a few words ("On Kyoto's maybes."). "I'm in" / "count me in" on an idea or maybe → im_in; "Julie's in too" (someone not on Wander) → im_in with forName. "Never mind the ice cream" / "take X off the maybes" → remove_from_maybes (the person who put it there, or the trip's organizer; if refused, say who can); "put it back" → put_back_on_maybes. When asked "any maybes near here?" or "what did people say maybe to?", read the city's ideas (get_city_experiences) and say who's in; one with removedAt is off the list (say who took it off if asked), never offered as a maybe. Never say Larisa's Guide changed: her X marks are hers; Wander's "I'm in" is Wander's.
33. When the user asks about ratings or reviews for a place, use get_ratings. Interpret the scores in context — Tabelog 3.5+ is excellent, Google 4.0+ is very good.
35. When the user asks about a specific place, wants to see what somewhere looks like, or is deciding whether to visit, use lookup_place. This returns a photo and details from Google. Use it proactively when discussing restaurants, temples, hotels, or attractions — don't just describe them in words when you can show a photo card. Include the city or neighborhood in the query for better results (e.g. "Fushimi Inari Kyoto" not just "Fushimi Inari").
36. When the user asks about something NOT in the trip data — restaurant recommendations, opening hours, crowd levels, "is X worth visiting", "best Y near Z", current conditions, travel tips — use web_search. Synthesize the results into a concise, helpful answer. Do NOT dump raw search results. Never use web_search for questions answerable from trip data (use other tools instead). You can combine web_search with lookup_place in the same response — search for information, then show a photo card for the top recommendation.
37. When a user asks to add a destination as a "day trip", "excursion", or "side trip" from an existing city, use add_experience to create it within that city — do NOT use add_city. Day trips are experiences you return from, not separate overnight bases. Only use add_city when the user wants a new base/overnight destination with its own date range.
38. When someone says "let's decide", "help us choose", "we need to pick between", or "start a vote", use create_decision with options. Use get_open_decisions to see current decisions. Use cast_decision_vote to vote (set optionId to null for "happy with any"). Use resolve_decision when someone says "go with X" or "let's do X". Use add_decision_option to add more choices to an existing decision. This is the primary group decision mechanism — prefer it over the older interest-floating system for formal choices.
39. Use get_contributions_by_traveler when the user asks what someone has added, contributed, or wants to see a specific traveler's activities.
40. "Remember this", "remember that for later", "put it in my notes", "next time we should…": it goes in their Notes with keep_in_my_notes (rule 46e) — the only memory that lasts past this conversation. When what they want kept is something YOU said (your list, your answer), set fromScout and pass that part of your earlier answer exactly as you wrote it; it's kept marked as from Scout. Then say in one short line that it's in their Notes, marked from Scout, and who sees it. Never say you'll remember something you didn't keep. Of this conversation you see only the last 10 messages, and only today's, though their screen shows more — so never promise to have anything "as long as this conversation runs"; what lasts is their Notes.
41. What you kept for them is in KEPT FROM SCOUT (below, with TRIP NOTES). When they ask for options, a choice or a suggestion (where to eat, breakfast, what to do), look there and in their notes first (get_my_notes with the words that fit, for every word), and use what's there — say it's from what you kept for them.
41b. Bringing it back (Ken, Oct 14: "1. Ask or tell 2. Scott responds with something useful for future 4. Remember that let's use say something later like "A that thing we discussed? Bring it back. 5. Scott brings it back by finding in notes what would have been gone."). When they ask for something from before — "that thing we discussed", "bring it back", "what was that list", "what did you tell me about…", "what did I say about…", even garbled by dictation — look in what was kept FOR THEM and their own notes FIRST (KEPT FROM SCOUT "for them", and get_my_notes with the words that fit, for every word), newest first. Bring back the one that fits best — the newest kept for them when nothing in their words points elsewhere — word for word, and say it's from their Notes and when it was kept (get_my_notes gives "kept"). Someone else's shared one only when they name whose ("Julie's coffee list"), and said as kept for that person. If two or three could fit, give the newest and name the others in a few words each ("or the Kyoto dinner list from Monday?"). When it's still in this conversation, or it's a fact in the Guide ("what did you tell me about the Backroads meeting?"), answer from that. Only when none of these has it, say so plainly, and that next time "remember that" keeps it. "Bring it back" means a removed maybe or phrase only when they name one or are clearly talking about Maybes or the phrase card, and restore_entity / restore_city only when they name something deleted or hidden.
42. Use update_learning and delete_learning when the user wants to edit or remove a saved learning.
43. When a planner asks "anything to review?", "pending changes?", or similar, use get_pending_approvals to show queued approval requests.
44. Use review_approval when a planner says "approve that", "looks good", "reject that change", or similar. Pass the approvalId, the decision ("approved" or "rejected"), and optionally a note.
45. Letting people in: the trip's planners do it from Wander's People screen (Settings → People on this trip). "+ Add someone": type the name, pick the trip, and Wander shows a QR code for that person's iPhone camera (or "Send as a message"); on their phone it opens in Safari, where they tap Let's go, set up Face ID, and are then shown how to put Wander on the Home Screen. If someone's Home Screen icon won't sign them in, they haven't set up Face ID yet: open their link in Safari, Let's go, then Settings → Face ID. Someone already in Wander from another trip just gets this trip too. For a new phone: "New phone? New link" next to their name. You can't make or show links in chat — say so plainly and point there. If the asker isn't a planner, say Ken or Larisa can do it. Don't guess anyone's pronouns — use their name.
46d. Showing things: you can move Wander's screen with show_in_wander (it changes nothing). When someone asks to see, open, show or be taken to something — "show me our first day in Kyoto", "the day Andy and Julie arrive", "open tomorrow", "Tokyo ideas", "show me the deadlines" (that's Actions), "who's on the trip" (People) — work out the exact date or city from the Guide, call it with go=true, and reply in one short line that says what they're looking at ("Here's Wed, Oct 14 — Julie & Andy land at Narita at 3:00 PM."). Your panel steps down to a small bar while they look, so they can ask a follow-up; always pass a headline — the answer itself in a few words for that bar ("Oct 29 · still open: Shiraume or Four Seasons"). When you're talking about one line of that day (the Backroads meeting, a dinner), pass item with a few of its words so the screen scrolls to it. "Ideas I marked" / "what Julie's in on" / "Julie's maybes" → target "ideas" (the Maybes screen) with markedBy set to that person's name (the asker's own name for "I"). "Take me back" / "go back" → target "back". When your answer is about one specific day, also call it with go=false so a button appears. If what they asked for doesn't exist in the plan (a city with no stay, a date outside the trip), say so in words first ("The trip ends Thu, Oct 29 — Nov 3 isn't part of it.") and offer the nearest real day as a button — never invent one, and never answer with only "tap below". Phrases like "been to by now" mean what the plan says up to today; say that you know the plan, not what they actually did. Everything you write before and after a tool call is shown together as one answer — so after a tool call, don't repeat yourself; add only what's new, or nothing.
46c. Telling Larisa: Wander never changes her Guide, so when someone suggests a change to the plan itself (move a day, drop or add something, a question for her), offer to draft a short message to Larisa. Only when they ask for it, or clearly want her told, add ONE line at the very END of your reply, after your full answer, exactly in this form: "Message for Larisa: <the message, 1–3 sentences, written in the asker's own voice, plain words, dates like Fri, Oct 16>". The app turns that line into a Send button that opens their Messages. A question about the plan ("do we have dinner Saturday?", "do we need to reconfirm anything?", "where does the tour start?", "are we going to X?") gets an answer, not a draft — at most offer in words ("Want me to draft a note to Larisa?"). Never do this when the asker is Larisa herself. Once they've said no to a note in this conversation, never offer it again (Oct 14: Scout offered Ken twice more after his "No."). Something Wander shows that they tell you is done, settled or out of date is never a reason to ask Larisa to change her Guide: say plainly that they're right and Wander shouldn't be showing it, and leave it out of your answers. Never say Wander "can't hide" something or explain that its screens show her sheet as read — Ken (Oct 14): "You don't change her sheet. You add value to it. So if it is done or out of date, you don't show it."
46b. Same-day plans: when someone says what they're doing today or on a given day ("Ken and Andy are going to <a museum> this afternoon", "put <an activity> on Thursday at 3"), use add_same_day_plan. It shows on that day for everyone on the trip, labelled as added in Wander by them; Larisa's Guide is not changed. Say where it is in a few words ("On today for everyone."). Say her Guide is unchanged only when they ask whether it changes — the day screen already says where each line came from, and told every time it reads like software reporting (Ken, Oct 10). Use remove_same_day_plan when they drop it. Notes on an idea: add_idea_note ("note on Tsukiji: go early"), for the group or justForMe; take_back_idea_note takes back one of their own (never someone else's). On screen, only a note's author sees "Remove" beside their own note in Maybes — someone else's note is theirs to take back.
46e. Trip notes (the Notes tab): each person's own words, kept exactly — private unless they share a note with the trip. "What did I write about…", "my notes from Kyoto" → get_my_notes, and quote their words exactly, saying whose note it is. When someone asks what a person "wrote", "said" or "noted" about something, look in get_my_notes (their shared notes) AND the Guide, and give both — a shared note is something they wrote. Never say "that's all they wrote" unless you looked in both. You never see or mention anyone's private notes but the asker's — so never say someone "hasn't written", "didn't note" or "wrote nothing" about something: you can't know. Say "nothing they've shared mentions it" (and, when it helps, that their private notes are theirs alone). Keeping notes: when someone tells you about the trip — what happened, what they saw or learned, who they met, why the day went as it did ("we came here because our guide drove us, so we saw Arita too") — or asks you to note or remember something, keep it with keep_in_my_notes: their own words exactly as they said them (a part of their message is fine — never your summary, never tidied), on the day it's about; or, when they ask you to keep your own answer, that answer as you wrote it with fromScout (rule 40). Their notes are the trip's story. When what they told you also puts a new stop on a day, do both (add_same_day_plan too). Reply in one short line that says where it is and who sees it ("In your Notes for today — just you."); never repeat their words back. Add one more sentence only when something in the plan is touched by what they told you (a booked train or table the change affects) — nothing else, no recap of the day. A question on its own isn't a note. To change one of their own notes — its words, or who sees it ("fix the typo in my sorbet note", "share my La Table note") — find it with get_my_notes and use change_my_note, only when they ask for that change and only on the note they mean (name it by its first words and when it was kept; if two could fit, ask which). "Add to my sake note: …", "put this under my brewery note" → change_my_note with add (their words, under the note with the time — Ken, Oct 18), never a new note. The words you pass are the whole note with just their change. Never keep a note again to change or share it. Taking a note out is only on the Notes tab — say so. "The note I just wrote/dictated" is their newest (TRIP NOTES is newest first, with times); if their newest isn't clearly the one they mean, ask which, quoting its first words (user-julie4: Scout named her oldest note of the day as "the most recent" and offered to share it).
46g. Weather: any question about the weather on the trip's days (today, tonight, tomorrow, "this week", "do I need an umbrella", "will it be cold in Nikko", "is it going to rain in Mashiko") → get_weather, the same forecast the day pages and Home show, and answer from it. Its numbers, hours and places exactly as its lines have them: say them naturally, but never change, round, average or merge them, and never add another forecast for the same day unless they ask for one (below). Part of a day ("from 1 to 6", "this afternoon", "when we ride") → get_weather with hours, and give its hourly. A place their day passes through that no line covers (where Backroads' itinerary or her Guide has a ride, a walk or a tour go: "where we start biking") → get_weather with that town and the hours, once per town, saying which is which; never a guess of your own from the other places ("expect it milder"). No ranges or words of your own for the numbers, not even in a closing summary ("high 40s to low 60s" for 44–64°F is wrong: give the lines' numbers or none). A line's temperatures are the whole day's low and high: never call them "tonight's" or "this afternoon's". A line's hours are for its own place only: never apply the hotel's rain hours to an airport, a station or another town. Where a line says "but the forecasts disagree" or "though other forecasts show little rain", keep it. When a day has two lines (a day trip, or where a travel day starts), say both, the first one first. When a day's "ahead" says it's an early outlook, say so in a few words; a day a week or less ahead is just the forecast, with nothing said about how far ahead it is. "The forecasts disagree" or "other forecasts show little rain" only where a line says it. For a town in Japan that isn't where their plan has them that day, get_weather with town, and say in a short clause that their plan has them elsewhere. Asked for another source, or to check a weather app, a site or a screenshot against Wander (Ken, Oct 17: "Find another source for hourly… I want to be sure it's the correct Nikko and accurate"): get_weather first, then web_search for that town's forecast (the service they named first; else Japan's weather agency or tenki.jp), and give both: Wander's first, for the place they asked about or ride through (when they ask whether it's the right place, get_weather with that town and the hours too, so its height and hours are Wander's own), then the other, named and said as found online, with its numbers as it gives them. Where they differ, say by how much, worked pair by pair from the numbers you give ("8 to 19°F warmer", never one figure for all), and what you can see that may explain it (another spot or height, another hour, otherForecasts); a height or other fact found online is that site's, said as theirs, and never reasoned from when Wander's own differs; never call either one wrong, or guess what an app is set to, beyond what you saw. When the search finds no figures for those hours, say so in one line. Never refuse to look. Unasked, never a weather site's numbers in Japan. Outside Japan, web_search, said as found online. When get_weather has no forecast for a day (over, or more than 16 days ahead), say so; her pre-trip forecast in the Guide may be given then, said as hers, written before the trip. Units as the lines give them (°F, inches). Typhoons, storms, weather warnings, "will our train run?": get_weather too. Its stormWatch is Japan's weather agency's warnings, its chance of warning-level weather and typhoon tracks for their places: say a day's watch lines as they are, with the agency named. For any day, say only what its own "stormCheck" says was checked: a part marked NOT checked is never "nothing" or "all clear" for that day, even folded into a sentence about several days. Anything under "couldNotCheck" you must say Wander couldn't check just now. Whether a particular train runs is never yours to say: JR decides, usually the day before. Never promise to keep watching, to tell them if it changes, or what Backroads' leaders will do: you only answer when asked ("ask me again closer to the day" is true).
46f. Packing: "what should I pack / bring", "anything I might not think to pack", or the packing list Scout offered Julie ("I want that too", "can I have Julie's packing list") → packing_tips, and answer only from what it returns: its items in its order, at most seven, each ONE plain sentence (about 30 words at most; the whole answer under about 220 words, someone reading on a phone while they pack). When it returns weather (the live forecast where they'll sleep), lead with up to three weather items made exactly as its "how" says — their own dates and places, never what Backroads already tells them — then the list's items, seven in all. A weather follow-up after it ("will it really rain in Nikko?") is a weather question: get_weather (rule 46g). Their days are "your" days ("your hiking day"), never "their", and named by date, never "Day 3". Where the Guide shows it for this person's own days, tie an item to them in a few words (shoes off → the nights they're at a ryokan; a big suitcase → their bullet-train days) — never invent a tie, never count or describe their nights beyond what's given ("most of your nights"), and leave it out when the Guide doesn't show one. Follow each item's tieTo exactly (a rule for some trains is never stretched to others), and name each place or date once in the whole answer — never the same inns or the same place in two items (once one item has said "Shirakabeso on the Izu Peninsula", a later one says "the bullet train on Wed, Oct 21", not "to the Izu Peninsula" again). Name a day by its date ("Wed, Oct 21"), never by Backroads' day number ("Day 4") — that isn't a date they know. Add no items of your own and no general travel advice. Never promise what a hotel or inn will do, and keep each item's own checks ("ask the inn first"). Say a rule's source when you give it (medicines, luggage). End with exactly one line inviting them to say how they travel so you can tailor it. Asked for more than the list, say so, and label anything you find online as found online.
46c. To-dos (the Actions screen): "remind us to…" / "add a to-do…" → add_todo (added in Wander; her Guide unchanged — say so in a few words). "We did it" / "that's done" → set_todo_done. "Take that off the list" → remove_todo, only for one added in Wander; one from Larisa's Guide stays until she takes it out of her sheet (it can still be ticked off). Use get_todos to find it. On screen: Actions → "+ Add", the tick beside each, and "Take out" on those added in Wander.
51. Use retract_interest when someone says "take that back", "un-flag that", or "remove my interest in [name]". Look up group interests first.
52. Use restore_entity when someone says "undo that delete", "bring back [name of something deleted]", or "I didn't mean to remove that" — never for "bring it back" about something you said or they kept (rule 41b). First use get_change_log to find the changeLogId for the deletion, then call restore_entity with it.
54. Use create_day_choice when someone says "some of us might want to do X while others do Y", "we could split up", or "there are two options for the afternoon". This creates a Decision tied to a specific day so everyone can vote on what they want to do.
59. Telling Ken about Wander (Ken, Oct 14: "if they would like a feature added to wander or anything about the way wander works is confusing, they can speak or type at that moment what they want and it will become a message to Ken to try to fix"). Only when they ask for it — "Tell Ken…", "let Ken know…", "send that to Ken", or yes to your offer — a message about WANDER ITSELF goes to Ken with tell_ken: their words exactly, one thought per message (two wishes in one breath: two calls). Something they don't like about Wander ("I don't like…", "this is annoying", "this is confusing", "why does it…", "it keeps…") goes to Ken without asking: Scout promised it (Ken, Oct 23, Scout's note to Andy: "Anytime you don't like something, just tap Scout & tell me. I'll let Ken know and try to fix it") — tell_ken with their words, then answer what you can and say in one line that you've passed it to Ken word for word. A wish ("I wish Wander…", "Wander should…", "I can't find…") said without asking: answer what you can, then offer once, in one short line: "Want me to pass that to Ken, word for word?" — and send it on their yes. Dictation can garble "Ken" ("tell can…", "tell Kent…"): if it's plainly meant, send it; if not, ask. Then one or two short lines: it's sent to Ken word for word (with the screen they're on, and the picture if they sent one), and they can send another. Never say Ken will fix it or when. If what they said is also a question you can answer ("I can't find the Maybes"), answer it too. Not about Wander — "tell Ken I'll be late", "tell Ken to meet us at 7", "tell Ken I love the trip" — is theirs to text: say so in one line, and send nothing. If it's unclear which, ask in one line. Never pass on anything they didn't ask you to.
60. Ideas for Wander (Ken, Oct 15: "a place used most by andy and me to place screenshots and ideas to improve wander"): when Ken or Andy says "Wander idea: …" (the short way, often spoken), "For Ideas for Wander: …", "add that to Ideas", "put this in Ideas for Wander", call add_wander_idea with their words exactly (and their picture goes along). "Wander idea" means this only at the start of what they say — "an idea for dinner" or "any ideas for tonight?" is a question for you, never a post. It's theirs alone: anyone else who asks gets one line saying it's Ken and Andy's, and the offer to pass it to Ken (rule 59). "Tell Ken…" stays tell_ken, even from Ken or Andy. Never post on your own, and never move something said to you into Ideas without their asking.
61. Who pays next (Larisa's idea, Oct 15: one couple pays for something, it's kept, and at the end the couple that paid less owes the other half the difference; "a simple button that is something like who pays next"). When someone says a couple, or anyone in it, paid for something — "we paid ¥12,400 for dinner", "Andy just spent 12400", "Larisa got the taxi, $30" — keep it with add_expense: who paid (their name, or the person talking for "we"/"I"), the amount as said, yen unless they said dollars, and what it was for if they said. Don't ask what it was for: it isn't needed. A number with no currency in Japan is yen. Then one or two lines: kept for which couple, and who pays next. "Who pays next?", "where are we on money?": money_so_far, then who pays next and what they'd pay to be even, in a line — never how much has been spent unless asked (Ken, Oct 16: "people do not want to be reminded how much they've paid. They simply want to understand the next action, which is who pays next and what the difference is"). A payment wholly for one couple — "Julie paid ¥5,000 for a jacket that's just Larisa's" — is kept with forCouple (that couple owes it back in full); anything else is shared half and half (leave forCouple out). Shared is the default (Ken, Oct 23: "Make a shared expense as a clear default… Ask if the intent is unclear"): forCouple only when their words plainly say it's the other couple's, never the couple that paid; when it might be either (a present? something just for them?), ask in one line before keeping it. Asked how things stand, name any payment that isn't shared, so a mistake shows. A payment kept by mistake: remove_expense (only who kept it, or Ken). One taken away by mistake ("put the coffee back"): put_back_expense, from money_so_far's takenAway list (the same people can); it counts again. A photo of a receipt sent with who paid ("Ken and Larisa paid this", "we got the taxi"): read its grand total (合計, never the tax line) and add_expense with receipt: true, what it was for read from it in a few plain words ("Taxi") — it's a payment, not a paper; if it's unclear who paid, ask in one line. Never read a card number off it. A payment that's wrong — the amount, yen or dollars, which couple paid, or what it was for ("make the coffee ¥4,300", "that was Julie, not me", "it was for the taxi"): change_expense, giving only what changes (the same people can). Budget's page: tap a payment to change it (who paid, the amount, what for, who it's for, or remove it); "Log" at the foot lists who added, changed, removed or put back what, when, and a removed payment can be put back there. Never keep money in Notes for this. If it's unclear who paid, ask in one line. It's shared by the two couples, all four see it. Say money plainly, in short sentences, without dashes.
62. Their photos (Oct 15: each of the four keeps their own photos on the day they took them; just theirs unless shared with the trip). A photo of the trip sent with "keep this", "add this to my photos", "save these for Tuesday": keep_photo — today unless they name a day; shared only when they ask to share it; their own words about it as its caption. A receipt, bill, ticket or booking is a paper (keep_paper), not a photo; if it's unclear which, ask in one line. Never share a photo they didn't ask to share. "Did Andy share any photos?", "what photos do we have from Tuesday?": answer from THEIR PHOTOS — who, which day and time, the caption — and say they're on that day's page under "Photos from the day" (and in Play the day). You know who took a photo, when and its caption, not what it shows. Never say there are no photos when THEIR PHOTOS lists some; when it has none for that day, say none have been shared for that day yet.
63. Letting everyone know (Ken, Oct 18: "Alert on next login function from anyone using anything to scout like 'let everyone know' with 'got it' and 'remind me' as options. This is for logistics not general messaging."): "let everyone know…", "tell everyone…", "can you alert everyone when they log in…" → tell_everyone, and never say Wander can't reach them. Only the trip's logistics: a time, a place, a meeting point, a change, a booking, a correction everyone should see (that the guides' names may be misspelled is one). Chat, jokes, greetings or feelings: say in a line that it's for the trip's logistics, and that a shared note or a text reaches them. The words: theirs when they gave them, in their voice ("I" is the sender), short, with only what they asked you to add; never news of your own, and never a list of names or a wall of text — say what's there to ask you about (Ken, Oct 18: "I do not expect to send out a message with all the names, which seems annoying and a wall of text"). Always confirm first (Ken, Oct 18: "Confirm: 'got it. Here's what I'll send: ….'"): call tell_everyone without confirmed and reply as it says; send (confirmed: true, the same words) only after their yes. A message about a moment (a bus leaving, a meeting time) gets until: that moment, Japan time; it's gone from everyone's screen then, and after 3 days in any case. "Has everyone seen it?", "did Julie get it?", "take it back" → my_alerts.
55. Use get_travel_advisories when someone asks about visas, vaccines, shots, health precautions, travel requirements, SIM cards, connectivity, currency, or "what do I need for this trip?". Also use it PROACTIVELY when a new country is added to the trip or when checking travel readiness — travelers need to know about visa requirements and recommended vaccinations well before departure. Present the information conversationally, not as a raw dump. Lead with action items (visa deadlines, vaccine timing) and follow with practical tips.
48. You are Scout. Speak warmly but concisely. You know the whole trip and everyone in it. When a traveler (not a planner) asks to do something that affects many items at once — deleting 3+ activities, rearranging an entire day, shifting all dates — don't execute it directly. Instead, explain that you've organized the changes for the planner to review, and create an approval request.`;

    // The conversation is what THIS phone shows. A chat from another phone, or from last night,
    // must never steer an answer here (it once made Scout say "no check-out today" on a moving day).
    // The saved history below is used only when the phone sent none at all (older app versions).
    let messages: Anthropic.MessageParam[] = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-10)) {
        if ((h.role === "user" || h.role === "assistant") && typeof h.text === "string" && h.text.trim()) {
          messages.push({ role: h.role, content: h.text });
        }
      }
      // The API needs alternating turns starting with the person; drop a leading assistant greeting
      while (messages.length && messages[0].role !== "user") messages.shift();
    } else if (tripId && req.user?.travelerId) {
      try {
        // Only the current conversation (the last six hours) — older exchanges may rest on a
        // previous copy of the Guide or an earlier day, and shouldn't steer today's answers
        // (and only since "Start fresh" — a marker row, never a turn of the conversation)
        const fresh = await freshSince(tripId, req.user.travelerId);
        const dbMessages = await prisma.chatMessage.findMany({
          where: { tripId, travelerId: req.user.travelerId, role: { in: ["user", "assistant"] }, createdAt: { gte: new Date(Math.max(Date.now() - 6 * 60 * 60 * 1000, fresh.getTime() + 1)) } },
          orderBy: { createdAt: "desc" },
          take: 20,
        });
        for (const msg of dbMessages.reverse()) {
          messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
        }
      } catch { /* no saved history — answer this question on its own */ }
    }
    // What the person said in this conversation, newest first — the only words keep_in_my_notes may keep
    const theirWords = [message, ...messages.filter((m) => m.role === "user" && typeof m.content === "string").map((m) => m.content as string).reverse()];
    // …and what Scout itself said in it, newest first — what keep_in_my_notes may keep, marked as Scout's, when they ask
    // for Scout's own answer to be kept (Ken, Oct 13: "Put in notes" for the breakfast list Scout made from his photo)
    const scoutWords = messages.filter((m) => m.role === "assistant" && typeof m.content === "string").map((m) => m.content as string).reverse();
    // Append tripId hint to the user message so the model can't miss it
    const augmentedMessage =`${fileWords}${tripId
      ? `${message}\n\n[System: The active trip ID is ${tripId}. Use it for any tool calls. Do not ask the user for it.]`
      : message}`;
    const actions: string[] = [];
    const placeCards: any[] = [];
    // Screens Scout opened or offered ("Open Wed, Oct 14 · Tokyo")
    const shows: { path: string; label: string; go: boolean; headline?: string }[] = [];
    // Directions Scout offered ("Walk to Tokyodo Main Showroom", "Taxi to …")
    const routes: { label: string; apple: string; google: string; search?: string }[] = [];
    // The forecasts Scout read (get_weather), for the phone to keep as the day page's copy
    const forecastsRead: { date: string; weather: unknown }[] = [];
    // (Wander's own records Scout read this turn, so Sources can say where its figures came from — answerSources)
    const wanderFacts: { from: string; text: string }[] = [];
    if (photoLinesNow.length) wanderFacts.push({ from: "the trip's photos in Wander", text: photoLinesNow.join("\n") });
    // "Use my location" under the answer (offer_location) — only when the phone said where it is wasn't known
    let askHere = false;
    // Places places_near_me found for this answer, by name — directions to one of them goes to Google's own point
    const nearFound = new Map<string, { name: string; lat: number; lng: number }>();
    let finalReply = "";
    // What this answer used, across every step, logged once at the end — real cost, not a guess
    const used = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, searches: 0, steps: 0 };

    // Cheapest order that loses nothing (measured Sep 29): Scout's instructions (the same for everyone) and
    // the Guide (the same for everyone until her copy is read again or a plan is added) are cached for an
    // hour and reused at a tenth of the price; only this question's details are paid in full. Before, the
    // time and the page sat inside the instructions and the Guide carried "right now" statuses, so almost
    // every question re-stored all ~73,000 tokens.
    //
    // Sources (Sep 30): the Guide goes to Scout as a document with citations on, one block per line, so each
    // piece of an answer comes back pointing at the lines it used — resolved to the source recorded with each
    // line. A document belongs in a message, so it opens the conversation (cached for an hour after the
    // instructions); this question's details and the right-now statuses (a small second document) go with
    // the latest message, after everything cached.
    const HOUR = { type: "ephemeral" as const, ttl: "1h" as const };
    const GUIDE_TITLE = "Larisa's Guide (the plan, as Wander last read it)";
    const LIVE_TITLE = "Right now: her Guide's deadlines and flights";
    const citedDocs: CitedDocument[] = [{ title: GUIDE_TITLE, lines: guideLines }, { title: LIVE_TITLE, lines: liveLines }, ...otherDocs];
    const asDocument = (title: string, lines: ContextLine[], cache: boolean): any => ({
      type: "document", title, citations: { enabled: true },
      source: { type: "content", content: lines.map((l) => ({ type: "text", text: l.text })) },
      ...(cache ? { cache_control: HOUR } : {}),
    });
    const liveTail = [
      "RIGHT NOW (this question):",
      nowLine,
      liveLines.length ? `(What her Guide's deadlines and flights stand at right now is in the document "${LIVE_TITLE}".)` : "",
      ...otherFreshness,
      ...nearLines,
      ...paperLinesNow,
      ...photoLinesNow,
      ...watchLines,
      ...toldLines,
      notesLine,
      keptLine,
      phraseLine,
      "",
      "CURRENT CONTEXT:",
      `- Page: ${context?.page || "unknown"}`,
      `- Trip ID: ${tripId || "none"}`,
      `- User: ${req.user?.displayName || "unknown"} (role: ${userRole})`,
      context?.cityId ? `- Viewing city ID: ${context.cityId}` : "",
      context?.cityName ? `- Viewing city: ${context.cityName}` : "",
      context?.dayId ? `- Viewing day ID: ${context.dayId}` : "",
      context?.dayDate ? `- Viewing day: ${context.dayDate}` : "",
      learningsContext,
    ].filter(Boolean).join("\n");
    const system: Anthropic.TextBlockParam[] = [{ type: "text", text: systemPrompt, cache_control: HOUR }];
    // The latest message: the right-now statuses, this question's details, then the question itself
    const latest: any[] = [
      ...(liveLines.length ? [asDocument(LIVE_TITLE, liveLines, false)] : []),
      { type: "text", text: liveTail },
      ...files.blocks,
      { type: "text", text: augmentedMessage },
    ];
    messages.push({ role: "user", content: latest });
    // The Guide opens the conversation — the same bytes for everyone, so it's read from the cache
    // Other sources follow it, each cached on its own: a change to the rail sheet re-reads only that part
    const cachedDocs = [
      ...(guideContext && guideLines.length ? [asDocument(GUIDE_TITLE, guideLines, true)] : []),
      ...otherDocs.map((d) => asDocument(d.title, d.lines, true)),
    ];
    if (cachedDocs.length) {
      const first = messages[0];
      const rest = typeof first.content === "string" ? [{ type: "text", text: first.content }] : (first.content as any[]);
      messages[0] = { role: "user", content: [...cachedDocs, ...rest] };
    }
    // Every piece of the answer with its citations, and pages Scout fetched (their citations name them by title)
    const answerPieces: AnswerPiece[] = [];
    const fetchedPages: { url: string; title: string }[] = [];
    let askedAgainForWords = false;
    let askedAgainForLinks = false;
    let askedAgainForButton = false;
    const startedAt = Date.now();

    for (let turn = 0; turn < 8; turn++) {
      // (stopped by the person: no further step — services already done by a tool stay done)
      if (wasStopped(req.user?.travelerId, askId)) break;
      const response = await scoutCreate({
        model: SCOUT_MODEL,
        // (a full answer on one place across every source, or a table of eight days, ran past 2,048 and was cut off
        // mid-row — Ken, Oct 2. Since Sep 28 Scout's model thinks by default when `thinking` is left out, and that
        // thinking counts toward max_tokens, so 4,096 could cut a long answer off; 16,000, billed only as used —
        // cost audit, Oct 16)
        // SCOUT_THINKING (test server only, Oct 4): asks for adaptive thinking explicitly — the same as the default now
        ...(process.env.SCOUT_THINKING ? { thinking: { type: "adaptive" } as any } : {}),
        max_tokens: 16000,
        system,
        tools: offeredTools,
        messages,
      });
      const u: any = response.usage || {};
      used.input += u.input_tokens || 0;
      used.cacheWrite += u.cache_creation_input_tokens || 0;
      used.cacheRead += u.cache_read_input_tokens || 0;
      used.output += u.output_tokens || 0;
      used.searches += u.server_tool_use?.web_search_requests || 0;
      used.steps++;

      // Collect text parts — from every step. (Scout often answers, then calls a tool, then adds a
      // short line; keeping only the last step's words threw the real answer away: "Tap below to open it.")
      // With citations on, one stretch of text arrives in pieces (split where a citation starts or ends); pieces
      // side by side join as written, and stretches between tool calls join as before.
      const step = piecesOfStep(response.content as any[]);
      // Tool markup written as words is never shown (see withoutToolMarkup), in the answer or its pieces
      answerPieces.push(...step.pieces.filter((p: AnswerPiece) => !withoutToolMarkup(p.text).had));
      for (const b of response.content as any[]) {
        if (b?.type === "web_fetch_tool_result" && b.content?.url) fetchedPages.push({ url: b.content.url, title: b.content.content?.title || b.content.url });
      }
      const cleaned = withoutToolMarkup(joinAnswerPieces(step.groups));
      // (a citation written out as words — '"Tokyo Day 3."<citation index="1-117,1-108" />' — never reaches the screen;
      // the real ones come as citations, not text. Seen once on the test copy, Oct 17)
      const textParts = cleaned.text.replace(/\s*<\/?citation\b[^>]*>/g, "");
      if (textParts) {
        finalReply = finalReply ? `${finalReply}\n\n${textParts}` : textParts;
      }
      // Nothing readable left after the markup: ask once more, in plain words
      if (cleaned.had && !finalReply && response.stop_reason !== "tool_use" && !askedAgainForWords) {
        askedAgainForWords = true;
        console.log("Scout wrote tool markup as its answer — asking again for plain words");
        messages.push({ role: "assistant", content: [{ type: "text", text: "(My last reply came out as tool markup.)" }] });
        messages.push({ role: "user", content: [{ type: "text", text: "Please answer the question in plain words. To open a screen, call the show_in_wander tool — don't write it out." }] });
        continue;
      }

      // A long web search can pause the answer part-way; it's picked up where it stopped
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      // Done — unless the answer gives a link Scout never saw (Ken, Oct 4: a JR West link from memory, dead, with a
      // made-up page behind it). Once: open it or take it out, and write the answer again. (services/links.ts)
      if (response.stop_reason !== "tool_use") {
        const unseen = unseenLinks(finalReply, seenIn(systemPrompt, messages as any[], response.content as any[]));
        if (unseen.length && !askedAgainForLinks && turn < 6) {
          askedAgainForLinks = true;
          console.log(`Scout gave ${unseen.length} link(s) it never saw — asking it to open or drop them`);
          messages.push({ role: "assistant", content: response.content });
          messages.push({ role: "user", content: [{ type: "text", text: `${LINK_CHECK_NOTE} ${unseen.length === 1 ? "a link" : "links"} you haven't seen in this conversation: ${unseen.join(" ")}. Open ${unseen.length === 1 ? "it" : "each"} with web_fetch and keep only what the page itself shows, or take it out. Then write your whole answer again, as your reply to the question — don't mention this check.` }] });
          finalReply = "";
          answerPieces.length = 0;
          continue;
        }
        // …or unless it promises a button below that isn't there (verify16, Oct 12: Ken in Tokoname station got "The
        // button below routes you there from where you're standing" — directions was never called, so no button; he'd
        // scroll for it). Once: put it there, or take the words out. ("Use my location" has its own guard below.)
        const herePromise = !!here && "none" in here && here.none !== "denied" && /\buse my location\b/i.test(finalReply);
        if (promisesButton(finalReply) && !routes.length && !shows.length && !askHere && !herePromise && !askedAgainForButton && turn < 6) {
          askedAgainForButton = true;
          console.log("Scout promised a button it never made — asking it to make it or drop the words");
          messages.push({ role: "assistant", content: response.content });
          messages.push({ role: "user", content: [{ type: "text", text: "(Wander) Your answer says there's a button below it, but no tool you called puts one there. If the answer needs directions, call directions now; to point to a screen, call show_in_wander. Otherwise take the button out of your words. Then write your whole answer again, as your reply to the question — don't mention this check." }] });
          finalReply = "";
          answerPieces.length = 0;
          continue;
        }
        if (unseen.length) finalReply = markUnseen(finalReply, unseen);
        break;
      }

      // Process tool calls
      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let screenOnlyOk = toolUseBlocks.every((b) => ["show_in_wander", "directions", "offer_location"].includes((b as Anthropic.ToolUseBlock).name));

      for (const block of toolUseBlocks) {
        const toolBlock = block as Anthropic.ToolUseBlock;
        console.log(`Chat tool call: ${toolBlock.name}`, JSON.stringify(toolBlock.input).slice(0, 200));
        // (the button only where tapping it can help: the phone sent no position and they haven't said no — with a
        // position it would ask for what Scout already has; after a no, the tap only fails)
        if (toolBlock.name === "offer_location") {
          const can = !!here && "none" in here && here.none !== "denied";
          if (can) askHere = true;
          else screenOnlyOk = false;
          toolResults.push({ type: "tool_result", tool_use_id: toolBlock.id, content: JSON.stringify(can
            ? { ok: true, shown: "a \"Use my location\" button under your answer; one tap shares where their phone is and asks you this question again" }
            : { error: here && "lat" in here ? "You already have where they are (WHERE THEY ARE). Answer from it." : here && "none" in here && here.none === "denied" ? "They've said no to sharing their location, so the button can't help. Ask what they're near; the iPhone's Settings can change it." : "Their phone sent nothing about where it is, so the button can't help. Ask what they're near." }) });
          continue;
        }
        // Places of a kind near the phone (services/guide/nearby.ts placesNear) — needs where they are, which only this
        // request has; a walking button to the closest, and directions to any of them go to Google's own point
        if (toolBlock.name === "places_near_me") {
          const kind = String((toolBlock.input as any)?.kind || "").trim();
          const key = process.env.GOOGLE_MAPS_API_KEY;
          let out: unknown;
          if (!here || !("lat" in here)) out = { error: "You don't have where they are (WHERE THEY ARE). Ask what they're near, or offer the location button." };
          else if (!kind || !key) out = { error: !kind ? "What kind of place? e.g. 'coffee shop'." : "Place search isn't available right now. Say so plainly." };
          else {
            const { placesNear, buttonPlace } = await import("../services/guide/nearby.js");
            const found = await placesNear(here, kind, key);
            if (!found) out = { error: "Google didn't answer just now. Say so, and offer to try again or to search the web." };
            else if (!found.length) out = { found: [], say: `Google shows no ${kind} near them.` };
            else {
              for (const p of found) nearFound.set(flatName(p.name), p);
              const first = buttonPlace(found);
              // (no walking button from a moving train — the café is behind them by the time they tap; verify19)
              const moving = here.spd != null && here.spd >= 7;
              const r = walkRouteTo(first);
              if (!moving && !routes.some((w) => w.apple === r.apple) && routes.length < 3) routes.push(r);
              out = {
                found: found.map((p) => ({ name: p.name, howFar: p.words, way: `to the ${p.way}`, openNow: p.open, rating: p.rating, ratings: p.ratings, area: p.area })),
                shown: moving ? "no walking button: they're moving fast, so these are near where they were a moment ago" : `a walking-directions button to ${first.name}${first.open === true ? " (open now)" : ""}`,
                say: "Lead with the closest one or two (open ones first), each with how far and which way in the words given; say they're from Google, not her Guide. Never a walking time — the button gives it. For another of them, call directions with its name exactly as given.",
              };
            }
          }
          if ((out as any)?.error) screenOnlyOk = false;
          toolResults.push({ type: "tool_result", tool_use_id: toolBlock.id, content: JSON.stringify(out) });
          continue;
        }
        // Papers (services/papers.ts): the files sent with this very message, kept under the day Scout read on them
        if (toolBlock.name === "keep_paper" || toolBlock.name === "remove_paper") {
          const input = (toolBlock.input || {}) as Record<string, unknown>;
          const P = await import("../services/papers.js");
          let out: unknown;
          if (!tripId || !req.user?.travelerId) out = { error: "No trip to keep it in." };
          else if (toolBlock.name === "remove_paper") {
            const p = await prisma.tripPaper.findUnique({ where: { id: String(input.paperId || "") }, select: { travelerId: true, title: true, tripId: true } });
            if (!p || p.tripId !== tripId) out = { error: "No such paper in THEIR PAPERS." };
            else if (p.travelerId !== req.user.travelerId) out = { error: "Only the person who kept it can remove it — say so." };
            else { await prisma.tripPaper.update({ where: { id: String(input.paperId) }, data: { hidden: true } }); actions.push(`Removed the paper "${p.title}"`); out = { ok: true }; }
          } else {
            // (the phone sends each picture's small copy beside it; the files themselves were checked above)
            const raw = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
            const all = [...(photo ? [{ mediaType: photo.mediaType, data: photo.data }] : []), ...sent.map((a, i) => ({ ...a, thumb: raw[i]?.thumb }))]
              .map((f) => P.paperFile(f)).filter((f): f is import("../services/papers.js").PaperFile => typeof f !== "string");
            // (this paper's own files — Ken, Oct 13: two photos, a Yamabiko ticket and a Haruka ticket, and each was kept
            // with both; with more than one file sent, the call says which are this paper)
            const asked = Array.isArray(input.files) ? [...new Set((input.files as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= all.length))] : [];
            const files = asked.length ? asked.map((n) => all[n - 1]) : all.length === 1 ? all : [];
            const days = await P.tripDays(tripId);
            const date = typeof input.date === "string" && days.some((d) => d.date === input.date) ? input.date : null;
            const title = String(input.title || "").trim().slice(0, 120) || "A paper";
            if (!all.length) out = { error: "Nothing they sent with this message can be kept (a photo, a picture or a PDF). Ask them to attach it here and say keep it." };
            else if (!files.length) out = { error: `${all.length} files came with this message. Call keep_paper once per paper, with files: the numbers (1 to ${all.length}, in the order sent) that are this paper.` };
            else {
              for (const [i, file] of files.entries()) {
                await P.keepPaper({ tripId, travelerId: req.user.travelerId, authorName: req.user.displayName || "", file, dayDate: date,
                  title: files.length > 1 ? `${title} (${i + 1} of ${files.length})` : title, summary: String(input.summary || "").trim().slice(0, 600) });
              }
              const town = days.find((d) => d.date === date)?.town;
              actions.push(`Kept "${title}"${date ? ` under ${new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}${town ? ` · ${town}` : ""}` : ""}`);
              out = { ok: true, kept: files.length, day: date, town: town || null, say: "Tell them in a sentence what you kept and the day it's under, and that it's in Notes and on that day's page." };
            }
          }
          if ((out as any)?.error) screenOnlyOk = false;
          toolResults.push({ type: "tool_result", tool_use_id: toolBlock.id, content: JSON.stringify(out) });
          continue;
        }
        // Your photos (services/tripPhotos.ts): the pictures sent with this very message, on a trip day, yours unless shared
        if (toolBlock.name === "keep_photo") {
          const input = (toolBlock.input || {}) as Record<string, unknown>;
          let out: unknown;
          if (!tripId || !req.user?.travelerId) out = { error: "No trip to keep it in." };
          else {
            const raw = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
            const pics = [...(photo ? [{ mediaType: photo.mediaType, data: photo.data, thumb: undefined as string | undefined }] : []), ...sent.map((a, i) => ({ ...a, thumb: raw[i]?.thumb as string | undefined }))]
              .filter((f) => /^image\/jpe?g$/.test(f.mediaType));
            const { addPhoto } = await import("../services/tripPhotos.js");
            const day = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
            if (!pics.length) out = { error: "No photo came with this message (a JPEG photo). Ask them to attach it here and say keep it." };
            else {
              let kept = 0;
              for (const f of pics) {
                const r = await addPhoto({ tripId, travelerId: req.user.travelerId, authorName: req.user.displayName || "", image: f.data, thumb: String(f.thumb || f.data).replace(/^data:[^,]+,/, ""),
                  dayDate: day, caption: typeof input.caption === "string" ? keptWords(input.caption, theirWords || []) || null : null, shared: input.shared === true });
                if (!("error" in r)) kept++;
              }
              actions.push(`Kept ${kept === 1 ? "a photo" : `${kept} photos`} for ${new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}${input.shared === true ? ", shared with the trip" : ""}`);
              out = { ok: kept > 0, kept, day, shared: input.shared === true, say: "One short line: kept on which day, just theirs or shared with the trip, and that it's under Photos from the day on that day's page." };
            }
          }
          if ((out as any)?.error) screenOnlyOk = false;
          toolResults.push({ type: "tool_result", tool_use_id: toolBlock.id, content: JSON.stringify(out) });
          continue;
        }
        // (directions to a place places_near_me just found: Google's own point, not a name search)
        if (toolBlock.name === "directions" && nearFound.has(flatName(String((toolBlock.input as any)?.place || "")))) {
          const r = walkRouteTo(nearFound.get(flatName(String((toolBlock.input as any).place)))!, (toolBlock.input as any)?.way);
          if (!routes.some((w) => w.apple === r.apple) && routes.length < 3) routes.push(r);
          toolResults.push({ type: "tool_result", tool_use_id: toolBlock.id, content: JSON.stringify({ ok: true, shown: `a button with ${r.label.toLowerCase()} directions from where they're standing (in Google Maps)` }) });
          continue;
        }
        try {
          // (where they are, and the first picture they sent — for tell_ken)
          const firstPicture = photo || sent.find((a) => /^image\/(jpeg|png|webp|gif)$/.test(a.mediaType)) || null;
          const { result, actionDescription, placeCards: cards, navigate, route, forecasts } = await executeTool(toolBlock.name, toolBlock.input, user, theirWords, scoutWords,
            toolBlock.name === "tell_ken" || toolBlock.name === "add_wander_idea" ? { screen: tellKenScreen(context), image: firstPicture } : undefined);
          if (forecasts) for (const f of forecasts) if (!forecastsRead.some((x) => x.date === f.date)) forecastsRead.push(f);
          if (route && !routes.some((w) => w.apple === route.apple) && routes.length < 3) routes.push(route);
          // A payment kept from a photo of its receipt: the photo sent with this message, kept with it (the Budget page's
          // "Photo of the receipt", by Scout — Ken, Oct 16: "take pictures of receipts and add them")
          if (toolBlock.name === "add_expense" && (toolBlock.input as any)?.receipt === true && (result as any)?.kept && (result as any)?.id && tripId) {
            const raw = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
            const { paperFile } = await import("../services/papers.js");
            const pic = [...(photo ? [{ mediaType: photo.mediaType, data: photo.data }] : []), ...sent.map((a, i) => ({ ...a, thumb: raw[i]?.thumb }))]
              .map((f) => paperFile(f)).find((f): f is import("../services/papers.js").PaperFile => typeof f !== "string" && f.mediaType.startsWith("image/"));
            if (pic) {
              const { keepReceipt } = await import("../services/expenses.js");
              await keepReceipt(tripId, (result as any).id, pic).then(() => { (result as any).receiptKept = true; }).catch(() => { (result as any).receiptKept = false; });
            } else (result as any).receiptKept = false;
          }
          if (actionDescription) actions.push(actionDescription);
          {
            const from = ({ money_so_far: "the trip's Budget", add_expense: "the trip's Budget", remove_expense: "the trip's Budget", put_back_expense: "the trip's Budget", change_expense: "the trip's Budget", get_my_notes: "your notes in Wander" } as Record<string, string>)[toolBlock.name];
            if (from) wanderFacts.push({ from, text: JSON.stringify(result) });
          }
          if (cards) placeCards.push(...cards);
          if (navigate && !shows.some((s) => s.path === navigate.path) && shows.length < 3) shows.push(navigate);
          console.log(`Chat tool result: ${toolBlock.name} OK`);
          if ((result as any)?.error) screenOnlyOk = false;
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result),
          });
        } catch (toolErr: any) {
          screenOnlyOk = false;
          console.error(`Chat tool error: ${toolBlock.name}`, toolErr.message);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: JSON.stringify({ error: toolErr.message }),
            is_error: true,
          });
        }
      }

      // The answer is already written and the only tool was opening a screen, which worked: done. The
      // extra step only re-read the whole prompt (~72,000 tokens) to add "Tap below" — about 40% of a
      // typical answer's cost, and a few seconds (measured Sep 29).
      if (screenOnlyOk && textParts.length >= 40) break;

      // Add assistant response and tool results for next turn
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    }

    // A "Message for Larisa:" draft only when someone asked for one (rule 46c) — the prompt rule alone
    // still let a plain "what time should we leave for the airport?" end in a draft, and the app turns
    // that line into a Send button. Never for Larisa herself.
    // (stopped: nothing saved, nothing buzzed, nothing sent — the phone already let it go)
    if (wasStopped(req.user?.travelerId, askId)) { console.log(`Scout stopped by its asker after ${((Date.now() - startedAt) / 1000).toFixed(1)} s`); if (!res.headersSent) res.status(409).json({ error: "stopped" }); return; }
    finalReply = withoutUnaskedDraft(finalReply, message, history, req.user?.displayName);
    // The words and the button agree: an answer that says "tap Use my location" has the button whenever it can help
    // (Oct 12: "Is there somewhere to sit down for a coffee?" said it and never called offer_location — a button that
    // wasn't there)
    if (!askHere && here && "none" in here && here.none !== "denied" && /\buse my location\b/i.test(finalReply)) askHere = true;

    // Where the answer came from — its citations as Scout wrote them, each resolved to the source recorded
    // with the line it points at; the parts with none are Scout's own words. Shown only when someone taps
    // "Sources" under the answer.
    const sources0 = finalReply ? answerSources(finalReply, answerPieces, citedDocs, guideCopy, fetchedPages, wanderFacts) : null;
    // (what Scout read from a photo has no Guide source — the Sources panel says the photo is where it came from)
    const sources = sources0 && files.images ? { ...sources0, photo: true } : sources0;
    const hasSources = !!sources && (sources.claims.length > 0 || sources.ownWords.length > 0 || !!sources.fromWander?.length);

    // Opus 5 list price: $5/M input, $25/M output, one-hour cache writes 2x input ($10/M), cache reads 0.1x,
    // searches $10/1,000
    const dollars = (used.input * 5 + used.cacheWrite * 10 + used.cacheRead * 0.5 + used.output * 25) / 1e6 + used.searches * 0.01;
    console.log(`Scout usage: steps=${used.steps} input=${used.input} cacheWrite=${used.cacheWrite} cacheRead=${used.cacheRead} output=${used.output} searches=${used.searches} seconds=${((Date.now() - startedAt) / 1000).toFixed(1)} ≈ $${dollars.toFixed(3)}`);
    // (the cached part of this question — instructions, tools, her Guide, the rail sheet — kept warm for the next one;
    // services/scoutWarm.ts)
    if (tripId && cachedDocs.length && used.steps > 0) keepScoutWarm(tripId, { model: SCOUT_MODEL, system, tools: offeredTools, docs: cachedDocs });

    // Persist conversation to DB
    if (tripId && req.user?.travelerId && finalReply) {
      prisma.chatMessage.createMany({
        data: [
          // (the phone's own tag for this question goes with both rows, so a phone that lost the line asks for the
          // answer to exactly this question — never one with the same words; verify10, Oct 11)
          { tripId, travelerId: req.user.travelerId, role: "user", createdAt: askedAt, content: files.names.length ? `${message} (with ${files.names.join(", ")})` : message,
            ...(askId ? { toolUse: { askId } as any } : {}) },
          // (its place cards, screens and directions too, so the answer looks the same on every device — Oct 4)
          { tripId, travelerId: req.user.travelerId, role: "assistant", createdAt: new Date(askedAt.getTime() + 1), content: finalReply, ...(hasSources ? { sources: sources as any } : {}),
            ...(placeCards.length || shows.length || routes.length || askHere || askId ? { toolUse: { places: placeCards, shows, routes, ...(askHere ? { askHere } : {}), ...(askId ? { askId } : {}) } as any } : {}) },
        ],
      }).catch(() => { /* non-critical — don't fail the response */ });
    }
    // A buzz on each of their phones that allowed it, when the answer took a while (Ken, Oct 12: phone in hand or
    // locked, glancing for it) — services/push.ts; never holds the answer up
    if (req.user?.travelerId && finalReply && Date.now() - askedAt.getTime() >= 8000) {
      const { sendAnswerReady } = await import("../services/push.js");
      void sendAnswerReady(req.user.travelerId, finalReply).catch(() => {});
    }

    res.json({
      reply: finalReply,
      actions,
      hasActions: actions.length > 0,
      ...(placeCards.length > 0 && { places: placeCards }),
      ...(shows.length > 0 && { shows }),
      ...(routes.length > 0 && { routes }),
      ...(askHere && { askHere }),
      ...(hasSources && { sources }),
      // (the forecasts Scout read, so the phone's day page and Home show the same numbers — lib/forecast keepDayForecast)
      ...(forecastsRead.length > 0 && { forecasts: forecastsRead }),
    });
  } catch (err: any) {
    console.error("Chat error:", err.message, err.stack?.split("\n").slice(0, 3).join("\n"));
    res.status(500).json({ error: "Chat failed" });
  }
});

export default router;
