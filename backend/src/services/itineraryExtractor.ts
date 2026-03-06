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

CRITICAL — BASE CITIES vs. DAY TRIPS:
A "city" is ONLY a place where the traveler sleeps overnight. Day trip destinations, towns visited for a few hours, and excursion targets are EXPERIENCES, not cities. Assign them to the base city the traveler sleeps in that night.
Examples:
- "Tokyo (4 nights) → Mashiko (day trip)" → Tokyo is a CITY, Mashiko is an EXPERIENCE with cityName "Tokyo"
- "Kyoto (3 nights) → Shigaraki (day trip)" → Kyoto is a CITY, Shigaraki is an EXPERIENCE with cityName "Kyoto"
- "Day 2: Visit Nikko Toshogu shrine, then bike to Lake Chuzenji" while staying in Nikko → Nikko is the CITY, the shrine and lake are EXPERIENCES
If a place is described as a "day trip", "excursion", "side trip", or visited for less than a full day from a base, it is an experience.

TOUR COMPANY ITINERARIES (Backroads, G Adventures, Intrepid, etc.):
- When multiple activity levels or route options are listed for the same day (e.g., "Level 1: 15 miles / Level 2: 24 miles / Level 3: 39 miles"), create ONE experience with the moderate option and mention alternatives in the description.
- Activities marked "optional" should still be included as experiences but note "(optional)" in the description.
- Ignore: pricing, what's included/excluded lists, packing suggestions, booking terms, equipment specs, activity level explanations, and marketing copy. Only extract actual places, activities, and logistics.
- When the same attraction is part of multiple activity level options, list it only once.
- Hotel/lodge names with descriptions like "begins 3-night stay" → create ONE accommodation, do not repeat per night.

INFORMAL PLANNING NOTES:
- Notation like "Tokyo (4 nights)" or "Osaka (2n)" means a city with that many overnight stays. Calculate date ranges from the trip start date.
- Arrow notation like "Tokyo → Kyoto" means a route segment between base cities.
- Ignore weather analysis, date rankings, personal opinions, budget calculations, and general travel advice — these are not itinerary data.
- Emoji bullets, technique descriptions, and educational notes about a destination should become part of the experience description, not separate experiences.

DATE CALCULATION:
- Use YYYY-MM-DD format for all dates.
- If the document uses "Day 1", "Day 2", calculate from the provided start date.
- If the document uses night counts like "Tokyo (4 nights)", chain them: first city starts on trip start date, next city starts the day after the previous city's last night.
- departureDate for a city = the last night spent there (checkout is the next morning, which is the next city's arrivalDate).

ROUTE SEGMENTS:
- Only create route segments between BASE CITIES where the traveler actually travels between overnight stays.
- Do NOT create segments between day-trip destinations.
- "Bullet train" or "shinkansen" → transportMode "train". "Drive", "rent a car" → "drive". "Fly" → "flight".

GENERAL:
- City names should be clean and standard (e.g., "Kyoto" not "Kyoto, Japan" — country goes in the country field).
- If a region name is used instead of a city (e.g., "Izu Peninsula"), use the most specific locality available or keep the region name.
- Return ONLY the JSON object, no other text.`;

// Strip common web paste noise before extraction
function preprocessContent(raw: string): string {
  let text = raw;

  // Remove common cookie/consent banners
  text = text.replace(/(?:we use cookies|accept all cookies|cookie policy|privacy policy).*?\n/gi, "");

  // Remove navigation-style lines (short lines that look like menu items)
  const lines = text.split("\n");
  const cleaned = lines.filter((line) => {
    const trimmed = line.trim();
    // Keep empty lines (paragraph breaks)
    if (!trimmed) return true;
    // Remove very short lines that look like nav items (unless they contain dates or numbers)
    if (trimmed.length < 15 && !trimmed.match(/\d{4}|day\s*\d|night/i) && !trimmed.match(/→|->|—/)) {
      // But keep lines that look like city names or hotel names
      if (trimmed.match(/^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/)) return true;
      return false;
    }
    return true;
  });

  text = cleaned.join("\n");

  // Collapse excessive whitespace
  text = text.replace(/\n{4,}/g, "\n\n\n");

  // Truncate to ~6000 chars to stay well within context limits while keeping the meat
  if (text.length > 6000) {
    text = text.slice(0, 6000) + "\n\n[Content truncated]";
  }

  return text.trim();
}

export async function extractItinerary(
  content: string,
  images?: { base64: string; mediaType: string }[],
  hints?: { startDate?: string },
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
    const cleaned = preprocessContent(content);
    let textPrompt = `Extract the travel itinerary from this text:\n\n${cleaned}`;
    if (hints?.startDate) {
      textPrompt += `\n\nIMPORTANT: The trip starts on ${hints.startDate}. Use this to calculate actual dates for "Day 1", "Day 2", etc. Day 1 = ${hints.startDate}.`;
    }
    userContent.push({
      type: "text",
      text: textPrompt,
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
