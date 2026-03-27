import prisma from "./db.js";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

/**
 * Normalize a name for fuzzy comparison (same logic as dedup.ts).
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`".,!?()[\]{}\-–—:/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length >= 4 && longer.includes(shorter)) return true;
  return false;
}

export interface FieldDiff {
  field: string;
  existing: string | null;
  incoming: string | null;
}

export interface VersionMatch {
  existingId: string;
  existingName: string;
  incomingName: string;
  confidence: "high" | "medium";
  diffs: FieldDiff[];
}

export interface VersionMatchResult {
  matches: VersionMatch[];
  newItems: number[];  // indices into the extracted items array
}

interface ExtractedItem {
  name: string;
  description?: string | null;
  userNotes?: string | null;
  timeWindow?: string | null;
  themes?: string[];
}

/**
 * Compare extracted items against existing experiences in a city.
 * Returns matches with field-level diffs showing what the new version adds.
 */
export async function findVersionMatches(
  tripId: string,
  cityId: string | null,
  items: ExtractedItem[],
): Promise<VersionMatchResult> {
  const where: any = { tripId };
  if (cityId) where.cityId = cityId;

  const existing = await prisma.experience.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
      userNotes: true,
      timeWindow: true,
    },
  });

  const matches: VersionMatch[] = [];
  const matchedIndices = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const normItem = normalize(item.name);

    // Pass 1: fuzzy name match
    for (const exp of existing) {
      if (fuzzyMatch(normItem, normalize(exp.name))) {
        const diffs = computeDiffs(exp, item);
        if (diffs.length > 0) {
          matches.push({
            existingId: exp.id,
            existingName: exp.name,
            incomingName: item.name,
            confidence: "high",
            diffs,
          });
          matchedIndices.add(i);
        }
        break;
      }
    }
  }

  // Pass 2: AI matching for remaining items (only if there are unmatched items
  // AND unmatched existing experiences, and the count is small enough to be worth it)
  const unmatchedItems = items
    .map((item, i) => ({ item, i }))
    .filter(({ i }) => !matchedIndices.has(i));

  const matchedExistingIds = new Set(matches.map(m => m.existingId));
  const unmatchedExisting = existing.filter(e => !matchedExistingIds.has(e.id));

  if (unmatchedItems.length > 0 && unmatchedExisting.length > 0 && unmatchedItems.length <= 20) {
    try {
      const aiMatches = await aiMatchPlaces(
        unmatchedItems.map(u => u.item),
        unmatchedExisting,
      );

      for (const aiMatch of aiMatches) {
        const itemIdx = unmatchedItems[aiMatch.itemIndex].i;
        const exp = unmatchedExisting[aiMatch.existingIndex];
        const diffs = computeDiffs(exp, items[itemIdx]);
        if (diffs.length > 0) {
          matches.push({
            existingId: exp.id,
            existingName: exp.name,
            incomingName: items[itemIdx].name,
            confidence: "medium",
            diffs,
          });
          matchedIndices.add(itemIdx);
        }
      }
    } catch (err) {
      console.error("AI version match error (non-fatal):", err);
    }
  }

  const newItems = items
    .map((_, i) => i)
    .filter(i => !matchedIndices.has(i));

  return { matches, newItems };
}

function computeDiffs(
  existing: { description: string | null; userNotes: string | null; timeWindow: string | null },
  incoming: ExtractedItem,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  if (incoming.description && !existing.description) {
    diffs.push({ field: "description", existing: null, incoming: incoming.description });
  }
  if (incoming.userNotes && !existing.userNotes) {
    diffs.push({ field: "notes", existing: null, incoming: incoming.userNotes });
  }
  if (incoming.timeWindow && !existing.timeWindow) {
    diffs.push({ field: "timing", existing: null, incoming: incoming.timeWindow });
  }
  // Also show diffs where incoming has more detail (longer text)
  if (incoming.description && existing.description &&
      incoming.description.length > existing.description.length * 1.5) {
    diffs.push({ field: "description", existing: existing.description, incoming: incoming.description });
  }

  return diffs;
}

interface AiMatchResult {
  itemIndex: number;
  existingIndex: number;
}

async function aiMatchPlaces(
  items: ExtractedItem[],
  existing: { id: string; name: string }[],
): Promise<AiMatchResult[]> {
  const prompt = `Given these NEW items:\n${items.map((it, i) => `${i}: ${it.name}`).join("\n")}\n\nAnd these EXISTING items:\n${existing.map((e, i) => `${i}: ${e.name}`).join("\n")}\n\nWhich new items refer to the same place as an existing item? Return JSON array of matches:\n[{"new": 0, "existing": 2}]\nReturn empty array [] if no matches. Only match if you're confident they're the same physical place.`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("");

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]) as { new: number; existing: number }[];
  return parsed
    .filter(m => m.new >= 0 && m.new < items.length && m.existing >= 0 && m.existing < existing.length)
    .map(m => ({ itemIndex: m.new, existingIndex: m.existing }));
}
