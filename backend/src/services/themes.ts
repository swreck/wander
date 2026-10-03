/**
 * Themes for the Maybes filters (Ken, Oct 3 2026): Food & drink · Temples & history · Art & craft · Shopping · Nature ·
 * Other. Her restaurant section already says "food"; anything else is read once by a fast model — a maybe when it's
 * posted, her ideas once — and kept. Only ever a filter: Wander never states a theme as a fact about a place, and a
 * wrong one only means a filter misses something. Unsure → "other". Never called under tests.
 */
import Anthropic from "@anthropic-ai/sdk";
import prisma from "./db.js";

export const THEME_LABELS: Record<string, string> = {
  food: "Food & drink", temples: "Temples & history", ceramics: "Art & craft", shopping: "Shopping", nature: "Nature", other: "Other",
};
type Theme = "food" | "temples" | "ceramics" | "shopping" | "nature" | "other";
const VALID = new Set<Theme>(["food", "temples", "ceramics", "shopping", "nature", "other"]);

let client: Anthropic | null = null;

/** One theme for an idea, from its words; "other" when unsure or when the model can't be reached */
export async function guessTheme(name: string, detail: string | null, city: string): Promise<Theme> {
  if (process.env.VITEST || !process.env.ANTHROPIC_API_KEY) return "other";
  try {
    client ??= new Anthropic();
    const r = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 5,
      messages: [{
        role: "user",
        content: `An idea for things to do on a trip in ${city}, Japan: "${name}"${detail ? ` (${detail.slice(0, 200)})` : ""}.
Which one theme fits best? Reply with exactly one word:
food — restaurants, cafés, bars, sweets, food markets, food experiences
temples — temples, shrines, castles, historic districts, history museums
ceramics — art, galleries, crafts, pottery, design, art museums
shopping — shops, stores, department stores, markets for goods
nature — gardens, parks, walks, hikes, views, onsen
other — anything else, or if unsure`,
      }],
    });
    const word = ((r.content[0] as { type: string; text?: string })?.text || "").trim().toLowerCase().replace(/[^a-z]/g, "");
    return VALID.has(word as Theme) ? (word as Theme) : "other";
  } catch {
    return "other";
  }
}

/** Ideas on a trip with no theme yet get one (her ideas once; maybes as they're posted). Returns how many were read. */
export async function tagMissingThemes(tripId: string, limit = 400): Promise<number> {
  const list = await prisma.experience.findMany({
    where: { tripId, themes: { isEmpty: true } },
    select: { id: true, name: true, description: true, city: { select: { name: true } } },
    take: limit,
  });
  for (const e of list) {
    const t = await guessTheme(e.name, e.description, e.city.name);
    await prisma.experience.update({ where: { id: e.id }, data: { themes: [t] as any } });
  }
  return list.length;
}
