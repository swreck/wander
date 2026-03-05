import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface ExtractedCity {
  name: string;
  country: string;
  arrivalDate: string | null;
  departureDate: string | null;
}

export interface ExtractedAccommodation {
  cityName: string;
  name: string;
  address?: string;
  checkInDate?: string;
  checkOutDate?: string;
  confirmationNumber?: string;
  notes?: string;
}

export interface ExtractedExperience {
  cityName: string;
  dayDate: string | null;
  name: string;
  description?: string;
  timeWindow?: string;
}

export interface ExtractedRouteSegment {
  originCity: string;
  destinationCity: string;
  transportMode: string;
  departureDate?: string;
  notes?: string;
}

export interface ExtractionResult {
  tripName: string;
  startDate: string;
  endDate: string;
  cities: ExtractedCity[];
  accommodations: ExtractedAccommodation[];
  experiences: ExtractedExperience[];
  routeSegments: ExtractedRouteSegment[];
  notes: string;
}

const EXTRACTION_PROMPT = `You are a travel itinerary parser. Extract structured trip data from the provided document.

Return a JSON object with this exact structure:
{
  "tripName": "descriptive trip name",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "cities": [
    { "name": "City Name", "country": "Country", "arrivalDate": "YYYY-MM-DD", "departureDate": "YYYY-MM-DD" }
  ],
  "accommodations": [
    { "cityName": "City Name", "name": "Hotel Name", "address": "...", "checkInDate": "YYYY-MM-DD", "checkOutDate": "YYYY-MM-DD", "notes": "..." }
  ],
  "experiences": [
    { "cityName": "City Name", "dayDate": "YYYY-MM-DD", "name": "Activity Name", "description": "brief description", "timeWindow": "morning/afternoon/evening or specific time" }
  ],
  "routeSegments": [
    { "originCity": "City A", "destinationCity": "City B", "transportMode": "train/flight/drive/ferry/other", "departureDate": "YYYY-MM-DD", "notes": "..." }
  ],
  "notes": "any important information that didn't fit the structure above"
}

Rules:
- Use YYYY-MM-DD format for all dates
- If the document covers only part of a longer trip, extract only what's in the document
- For transportMode, use: flight, train, ferry, drive, or other
- Include ALL activities, meals, visits, and experiences mentioned — even brief ones
- If a date is ambiguous or relative (e.g., "Day 3"), calculate from the trip start date if possible
- City names should be clean and standard (e.g., "Kyoto" not "Kyoto, Japan" — country goes in the country field)
- Return ONLY the JSON object, no other text`;

export async function extractItinerary(
  content: string,
  images?: { base64: string; mediaType: string }[]
): Promise<ExtractionResult> {
  const messages: Anthropic.MessageParam[] = [];

  const userContent: Anthropic.ContentBlockParam[] = [];

  if (images && images.length > 0) {
    for (const img of images) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: img.base64,
        },
      });
    }
    userContent.push({
      type: "text",
      text: "Extract the travel itinerary from these images.",
    });
  }

  if (content) {
    userContent.push({
      type: "text",
      text: `Extract the travel itinerary from this text:\n\n${content}`,
    });
  }

  messages.push({ role: "user", content: userContent });

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: EXTRACTION_PROMPT,
    messages,
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Parse the JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI extraction did not return valid JSON");
  }

  return JSON.parse(jsonMatch[0]) as ExtractionResult;
}
