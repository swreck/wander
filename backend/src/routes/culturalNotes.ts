import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const anthropic = new Anthropic();

// Generate and cache cultural context notes for an experience
router.post("/experience/:id", async (req: AuthRequest, res) => {
  const exp = await prisma.experience.findUnique({
    where: { id: req.params.id as string },
    include: { city: true },
  });
  if (!exp) { res.status(404).json({ error: "Experience not found" }); return; }

  // Return cached if available
  if (exp.culturalNotes) {
    res.json({ notes: exp.culturalNotes, cached: true });
    return;
  }

  const themes = (exp.themes || []).join(", ");
  const prompt = `You are a knowledgeable cultural guide for travelers visiting ${exp.city.name}, ${exp.city.country || "Japan"}.

Generate 2-3 brief, practical cultural context tips for visiting "${exp.name}".
${themes ? `This place involves: ${themes}.` : ""}
${exp.description ? `Description: ${exp.description}` : ""}

Rules:
- Each tip should be 1-2 sentences max
- Focus on etiquette, customs, or practical knowledge a visitor wouldn't know
- Be specific to this TYPE of place (temple, restaurant, pottery studio, etc.)
- Never be generic ("enjoy the culture!") — only share genuinely useful information
- If it's a restaurant: mention ordering customs, payment, tipping (none in Japan), seating, cash-only status
- If it's a temple/shrine: mention shoes, photography rules, incense, offerings
- If it's a craft/pottery place: mention reservation requirements, handling etiquette
- If it's nature: mention trail etiquette, bear bells, onsen customs if relevant
- ALWAYS include one timing tip: when is this place quietest? When does it get crowded? Best time of day to visit? Opening time quirks?

Return a JSON array of objects: [{"tip": "text", "category": "etiquette|practical|timing"}]
You must include at least one tip with category "timing".`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const notes = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    // Cache on the experience
    await prisma.experience.update({
      where: { id: exp.id },
      data: { culturalNotes: notes },
    });

    res.json({ notes, cached: false });
  } catch (err) {
    console.error("Cultural notes generation error:", err);
    res.status(500).json({ error: "Failed to generate cultural notes" });
  }
});

export default router;
