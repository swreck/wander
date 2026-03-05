import Anthropic from "@anthropic-ai/sdk";
import prisma from "./db.js";
import { geocodeExperience } from "./geocoding.js";

const anthropic = new Anthropic();

interface CaptureResult {
  experiences: {
    name: string;
    description: string;
    sourceUrl?: string;
  }[];
  isList: boolean;
}

const CAPTURE_PROMPT = `You are a travel experience extractor. Given text or an image from a travel article, blog, review site, or screenshot, extract the experiences (restaurants, temples, museums, activities, shops, etc.) mentioned.

Return JSON:
{
  "experiences": [
    { "name": "Place Name", "description": "Brief description from the source" }
  ],
  "isList": true/false
}

Rules:
- Extract ALL distinct places/experiences mentioned
- Set isList to true if 2+ experiences were found
- Keep descriptions brief but informative (1-2 sentences)
- If only one place is clearly the subject, return just that one
- If the text is a review of one specific place, that's one experience
- Return ONLY the JSON object`;

export async function extractFromText(text: string): Promise<CaptureResult> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: CAPTURE_PROMPT,
    messages: [{ role: "user", content: text }],
  });

  const responseText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { experiences: [{ name: text.slice(0, 100), description: text }], isList: false };
  }

  return JSON.parse(jsonMatch[0]);
}

export async function extractFromImage(base64: string, mediaType: string): Promise<CaptureResult> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: CAPTURE_PROMPT,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: base64,
          },
        },
        { type: "text", text: "Extract travel experiences from this screenshot." },
      ],
    }],
  });

  const responseText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { experiences: [{ name: "Screenshot capture", description: "" }], isList: false };
  }

  return JSON.parse(jsonMatch[0]);
}

export async function extractFromUrl(url: string): Promise<CaptureResult> {
  try {
    const res = await fetch(url);
    const html = await res.text();

    // Extract title and meta description
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i);

    const title = titleMatch ? titleMatch[1].trim() : "";
    const description = descMatch ? descMatch[1].trim() : "";

    // Strip HTML tags and get some text content
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);

    return extractFromText(`Title: ${title}\nDescription: ${description}\n\nContent: ${textContent}`);
  } catch {
    return { experiences: [{ name: url, description: "URL capture", sourceUrl: url }], isList: false };
  }
}

// Queue async enrichment after capture
export async function enrichExperience(experienceId: string) {
  // Geocode in background
  try {
    await geocodeExperience(experienceId);
  } catch (err) {
    console.error("Enrichment geocoding error:", err);
  }
}
