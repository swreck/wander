/**
 * Reads pictures pasted into Larisa's Guide (booking screenshots, meeting notes, maps).
 *
 * Many on-the-road facts exist ONLY as screenshots in the sheet (flights, hotel bookings,
 * cancellation deadlines). Each picture is read once by Claude and the result is cached by
 * content hash, so an unchanged picture is never re-read on the next snapshot.
 *
 * Faithfulness: transcribe what is legible; extract facts only when the picture states them;
 * separate confirmed bookings from searches/suggestions; never infer.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5";

export interface ImageFlight {
  status: "confirmed" | "suggested_or_search";
  airline: string | null;
  flightNumber: string | null;
  travelers: string[];
  confirmation: string | null;
  departDate: string | null;   // YYYY-MM-DD
  departTime: string | null;   // HH:MM (local at departure airport)
  departAirport: string | null;
  arriveDate: string | null;
  arriveTime: string | null;
  arriveAirport: string | null;
  seats: { traveler: string; seat: string }[];
}

export interface ImageHotelBooking {
  hotel: string;
  bookedBy: string | null;
  room: string | null;
  confirmation: string | null;
  checkInDate: string | null;
  checkInTime: string | null;
  checkOutDate: string | null;
  checkOutTime: string | null;
  freeCancellationUntil: string | null; // as written in the picture
  address: string | null;
  phone: string | null;
}

export interface ImageReading {
  kind: "flight_booking" | "flight_search" | "hotel_booking" | "hotel_info" | "restaurant_booking" | "meeting_notes" | "map" | "floor_plan" | "comparison" | "other";
  summary: string;
  transcription: string;
  flights: ImageFlight[];
  hotelBookings: ImageHotelBooking[];
}

// The API limits schemas to 16 union-typed fields, so "not stated" is an empty string on the
// wire and converted to null after parsing (see blankToNull).
const nullableString = { type: "string" };

const READING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "summary", "transcription", "flights", "hotelBookings"],
  properties: {
    kind: {
      type: "string",
      enum: ["flight_booking", "flight_search", "hotel_booking", "hotel_info", "restaurant_booking", "meeting_notes", "map", "floor_plan", "comparison", "other"],
    },
    summary: { type: "string" },
    transcription: { type: "string" },
    flights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["status", "airline", "flightNumber", "travelers", "confirmation", "departDate", "departTime", "departAirport", "arriveDate", "arriveTime", "arriveAirport", "seats"],
        properties: {
          status: { type: "string", enum: ["confirmed", "suggested_or_search"] },
          airline: nullableString,
          flightNumber: nullableString,
          travelers: { type: "array", items: { type: "string" } },
          confirmation: nullableString,
          departDate: nullableString,
          departTime: nullableString,
          departAirport: nullableString,
          arriveDate: nullableString,
          arriveTime: nullableString,
          arriveAirport: nullableString,
          seats: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["traveler", "seat"],
              properties: { traveler: { type: "string" }, seat: { type: "string" } },
            },
          },
        },
      },
    },
    hotelBookings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hotel", "bookedBy", "room", "confirmation", "checkInDate", "checkInTime", "checkOutDate", "checkOutTime", "freeCancellationUntil", "address", "phone"],
        properties: {
          hotel: { type: "string" },
          bookedBy: nullableString,
          room: nullableString,
          confirmation: nullableString,
          checkInDate: nullableString,
          checkInTime: nullableString,
          checkOutDate: nullableString,
          checkOutTime: nullableString,
          freeCancellationUntil: nullableString,
          address: nullableString,
          phone: nullableString,
        },
      },
    },
  },
};

const SYSTEM = `You read pictures that a trip planner pasted into her shared planning spreadsheet: booking confirmations, flight searches, meeting notes, hotel comparisons, maps, floor plans.

Be faithful:
- "transcription": every legible piece of text, in reading order, as written. For maps, list the labels and places shown.
- "summary": one plain sentence saying what the picture is.
- Put a flight in "flights" only when the picture shows it. Mark it "confirmed" only when the picture shows a completed booking (a confirmation or reservation number, "Flight confirmed", "Purchase confirmation"). Price-comparison or search screens are "suggested_or_search".
- Put a hotel in "hotelBookings" only for an actual reservation shown in the picture (reservation number or booked-by details). Hotel comparison tables and room descriptions are not bookings.
- Dates as YYYY-MM-DD, times as 24-hour HH:MM, exactly as the picture states them (local time at that place). Use an empty string for anything the picture doesn't state. Never infer, estimate, or fill gaps.
- "freeCancellationUntil": copy the deadline as written, including the time zone if shown.`;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/** Read one picture. Returns null (with a reason) if Claude declines or the reply can't be used. */
export async function readGuideImage(
  bytes: Buffer,
  mimeType: string,
  where: { tabName: string; anchor: string; tabText: string; tripDates?: string },
): Promise<{ reading: ImageReading | null; failure?: string }> {
  const tripLine = where.tripDates
    ? ` The trip runs ${where.tripDates}; a date shown without a year belongs to this trip.`
    : "";
  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: READING_SCHEMA } },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: bytes.toString("base64") },
        },
        {
          type: "text",
          text: `This picture is on the tab "${where.tabName}" at cell ${where.anchor}.${tripLine}${where.tabText ? ` Text elsewhere on that tab: ${where.tabText.slice(0, 1500)}` : ""}`,
        },
      ],
    }],
  } as any);

  if (response.stop_reason === "refusal") return { reading: null, failure: "Claude declined to read this picture." };
  if (response.stop_reason === "max_tokens") return { reading: null, failure: "The picture's text was too long to finish reading." };
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return { reading: null, failure: "No reading came back." };
  try {
    return { reading: blankToNull(JSON.parse(text)) as ImageReading };
  } catch {
    return { reading: null, failure: "The reading came back in an unusable form." };
  }
}

/** Empty strings mean "the picture doesn't state it" — store those as null (arrays and required text stay as-is). */
function blankToNull(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => blankToNull(v));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, blankToNull(v, k)]));
  }
  if (value === "" && !["summary", "transcription", "hotel", "traveler", "seat"].includes(key)) return null;
  return value;
}

/** Map names as written in bookings ("Kenneth Rosen", "LARISA J FONG", "Andrew Byrne") to the group. */
const PEOPLE: { name: string; aliases: string[] }[] = [
  { name: "Ken", aliases: ["ken", "kenneth"] },
  { name: "Larisa", aliases: ["larisa"] },
  { name: "Julie", aliases: ["julie"] },
  { name: "Andy", aliases: ["andy", "andrew"] },
];

/** Hotel rooms in this group are booked per couple: a booking by one partner is the couple's room. */
const COUPLES: Record<string, string> = { Ken: "Ken & Larisa", Larisa: "Ken & Larisa", Julie: "Julie & Andy", Andy: "Julie & Andy" };
export function roomFor(bookedBy: string | null | undefined): string | null {
  const who = whoFromNames([bookedBy]);
  if (!who) return null;
  return COUPLES[who] || who;
}

export function whoFromNames(names: (string | null | undefined)[]): string | null {
  const found = new Set<string>();
  for (const n of names) {
    if (!n) continue;
    const words = n.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    for (const p of PEOPLE) if (p.aliases.some((a) => words.includes(a))) found.add(p.name);
  }
  if (found.size === 0) return null;
  const has = (n: string) => found.has(n);
  if (found.size === 4) return "Everyone";
  if (has("Ken") && has("Larisa") && found.size === 2) return "Ken & Larisa";
  if (has("Julie") && has("Andy") && found.size === 2) return "Julie & Andy";
  return Array.from(found).join(" & ");
}
