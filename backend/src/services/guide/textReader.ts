/**
 * Reads prose tabs of the Guide (pasted emails, confirmation text) for bookings and deadlines.
 *
 * Example: a Dinner Resos tab holding a restaurant's email that says "Please contact us for
 * reconfirmation 3-7 days prior... the reservation will be automatically cancelled" — a deadline
 * that matters on the road, stated only in prose. Each fact quotes the words it came from.
 * Results are cached per tab text, so an unchanged tab is never re-read.
 */

import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";

const MODEL = "claude-opus-5";

export interface TextBooking {
  kind: "hotel" | "restaurant" | "tour" | "flight" | "other";
  name: string;
  date: string | null;          // YYYY-MM-DD (the booking's date, or check-in)
  time: string | null;          // HH:MM local
  checkOutDate: string | null;
  checkOutTime: string | null;
  confirmation: string | null;
  people: string | null;        // as written, e.g. "4 people", "2 adults"
  details: string | null;       // short, in the source's words (dress code, allergies noted…)
  quote: string;                // the words this came from
}

export interface TextDeadline {
  date: string;                 // YYYY-MM-DD
  endDate: string | null;       // for a window ("between … and …")
  what: string;                 // plain, short: "Reconfirm the Robuchon dinner"
  quote: string;                // the source's own words
  computed: boolean;            // true when the date was worked out from a rule ("3-7 days prior")
}

export interface TextReading { bookings: TextBooking[]; deadlines: TextDeadline[] }

const s = { type: "string" };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bookings", "deadlines"],
  properties: {
    bookings: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["kind", "name", "date", "time", "checkOutDate", "checkOutTime", "confirmation", "people", "details", "quote"],
        properties: {
          kind: { type: "string", enum: ["hotel", "restaurant", "tour", "flight", "other"] },
          name: s, date: s, time: s, checkOutDate: s, checkOutTime: s, confirmation: s, people: s, details: s, quote: s,
        },
      },
    },
    deadlines: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["date", "endDate", "what", "quote", "computed"],
        properties: { date: s, endDate: s, what: s, quote: s, computed: { type: "boolean" } },
      },
    },
  },
};

const SYSTEM = `You read one tab of a group's trip-planning spreadsheet: usually pasted emails and confirmation messages.

Return only what the text states:
- "bookings": confirmed reservations (hotel, restaurant, tour, flight) with their confirmation or reservation number when shown. Recommendations, options under consideration, and availability replies are NOT bookings.
- "deadlines": things that must be done by a date for a booking to hold — reconfirmation, free-cancellation cutoffs, payment dates. When the text states a rule relative to a known date ("reconfirm 3-7 days prior" to a stated reservation date), work out the dates, set "computed" true, and keep the original words in "quote".
- Dates YYYY-MM-DD, times 24-hour HH:MM, local time. Use an empty string for anything not stated. Never guess.
- "what" is short and plain. "quote" is the exact source words (trimmed).`;

let client: Anthropic | null = null;
const anthropic = () => (client ||= new Anthropic());

export function tabTextHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function readGuideText(tabName: string, text: string, tripDates: string): Promise<{ reading: TextReading | null; failure?: string }> {
  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `Tab "${tabName}". The trip runs ${tripDates}; a date without a year belongs to this trip.\n\n${text.slice(0, 60000)}` }],
  } as any);
  if (response.stop_reason === "refusal") return { reading: null, failure: "Claude declined to read this tab." };
  const out = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!out) return { reading: null, failure: "No reading came back." };
  try {
    const parsed = JSON.parse(out) as TextReading;
    const clean = (v: string | null) => (v === "" ? null : v);
    parsed.bookings = parsed.bookings.filter((b) => b.name?.trim()).map((b) => ({
      ...b, date: clean(b.date), time: clean(b.time), checkOutDate: clean(b.checkOutDate), checkOutTime: clean(b.checkOutTime),
      confirmation: clean(b.confirmation), people: clean(b.people), details: clean(b.details),
    }));
    parsed.deadlines = parsed.deadlines.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date)).map((d) => ({ ...d, endDate: clean(d.endDate) }));
    return { reading: parsed };
  } catch {
    return { reading: null, failure: "The reading came back in an unusable form." };
  }
}

/** Tabs worth reading as prose: substantial text that mentions a booking. */
export function isBookingProse(text: string): boolean {
  return text.length > 300 && /(confirm|reservation|reserve|booking|booked|check-?in|cancel)/i.test(text);
}
