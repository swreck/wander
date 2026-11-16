/**
 * The two checks every place photo passes (moved here from placePhotos.ts on Nov 16 2026, word for word, so the first
 * look at a place and a later look at its current photos use the very same check — services/placePhotoChecks.ts):
 *  - is Google's place the one her line means;
 *  - which of its photos show it, best first.
 * Each call is counted (services/usage.ts) with its tokens, under a daily ceiling.
 */
import Anthropic from "@anthropic-ai/sdk";
import { allow, noteTokens } from "./usage.js";

let client: Anthropic | null = null;
const MODEL = "claude-opus-5";

type PlaceCheck = (line: string, query: string, g: { name: string; address: string; types: string[] }) => Promise<{ same: boolean; why: string } | null>;
let placeCheck: PlaceCheck | null = null;
/** Is Google's place the one her line means? null when it couldn't be asked (or today's ceiling is reached) */
export const samePlace: PlaceCheck = (...a) => (placeCheck ?? aiSamePlace)(...a);
/** (tests: a place check whose answers are known) */
export function setPlaceCheckForTests(c: PlaceCheck | null): void { placeCheck = c; }
async function aiSamePlace(line: string, query: string, g: { name: string; address: string; types: string[] }): Promise<{ same: boolean; why: string } | null> {
  if (!(await allow("ai.place_check"))) return null;
  client ??= new Anthropic();
  const res = await client.messages.create({
    model: MODEL, max_tokens: 1500,
    system: "You check whether a photo of a place may stand beside a line of a travel plan. Say same=true only when Google's place is plainly the very place the line means to visit (the same shop, restaurant, temple, market, museum, station or hotel — a branch in another town is not the same, and nor is another branch of the same brand in the same district: when the line names a flagship, a main store or a branch by its place, Google's place must be that one, not a smaller shop of the brand nearby). When the line gives her booking for it (\"her booking for it: …\"), the place is the one her booking names: Google's place is the same when it is that booking's restaurant or venue, even when the line's own words name another room of the same building; a place that isn't her booking's is not the same. A food hall, floor or counter inside a department store is the same place as the store when Google lists only the store. A line that isn't one place (a walk, a stroll through an area, \"refresh at the hotel\" when the hotel isn't named, free time, lunch with no place named) is same=false. A line about getting somewhere — a taxi, train, bus or walk to a place, a transfer, \"continue to\", \"return to\" — is same=false: the photo belongs on the line for the place itself. When unsure, false: a wrong photo beside her plan is worse than none.",
    messages: [{ role: "user", content: `Her plan's line: "${line}"\nThe Maps search for it: "${query}"\nGoogle's place: "${g.name}", ${g.address} (kinds: ${g.types.slice(0, 6).join(", ")})\nAnswer in JSON only: {"same": true|false, "why": "a few words"}` }],
  });
  noteTokens("ai.place_check", { in: res.usage?.input_tokens, out: res.usage?.output_tokens });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const j = JSON.parse(m[0]);
  return typeof j.same === "boolean" ? { same: j.same, why: String(j.why || "") } : null;
}

const WORDS: Record<number, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight" };

/** The photo check's own answer: which of `images` (each 640 wide) show what her line means, best first, at most `most`
 *  — their indexes; [] when none does; null when they couldn't be looked at (or today's ceiling is reached) */
export type Judge = (line: string, name: string, images: { bytes: Buffer; type: string }[], most: number) => Promise<number[] | null>;

const aiJudge: Judge = async (line, name, images, most) => {
  if (!images.length) return [];
  if (!(await allow("ai.photo_check"))) return null;
  client ??= new Anthropic();
  const imgs: Anthropic.ImageBlockParam[] = images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.type.split(";")[0] as "image/jpeg", data: i.bytes.toString("base64") } }));
  const res = await client.messages.create({
    model: MODEL, max_tokens: 2000,
    system: `You choose the photos to show for a line of a travel plan. Keep each photo that plainly shows the place the way the line means it: the market's stalls for a market, the temple for a temple, the food hall for a department store's food hall (depachika), the restaurant's dining room or its food for a restaurant, the museum, its building or its art for a museum, the hotel for a hotel, the shop or what it sells on its own shelves for a shop, the sight itself for a sight. Every photo must be taken at the place: leave out one taken anywhere else (a purchase at someone's home, a product on a desk or a floor that isn't the shop's), a photo of a different shop or restaurant (even in the same building), a sign, a map, a menu board or a receipt on its own, a car park, a selfie, a person filling the frame or a stranger who is the photo's subject (someone eating at their table, posing), a blurred or dark photo, a photo of another stretch of a river, road, trail or coast far from where the line goes (a wide lowland riverbed under an expressway for a rafting gorge), a season that hides it (deep snow for an autumn ride), and one that repeats a photo already kept (the same shot again). Put the best first; for a restaurant, mix its room and its food when both are there. At most ${WORDS[most] || most}. An empty list when none of them shows it.`,
    messages: [{ role: "user", content: [...imgs, { type: "text", text: `Her plan's line: "${line}" — the place: "${name}". The ${imgs.length} photos above are numbered 0 to ${imgs.length - 1} in order. Answer in JSON only: {"show": [<numbers, best first>], "why": "a few words"}` }] }],
  });
  noteTokens("ai.photo_check", { in: res.usage?.input_tokens, out: res.usage?.output_tokens });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "null");
  if (!j || !Array.isArray(j.show)) return null;
  const show = [...new Set((j.show as unknown[]).filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < imgs.length))].slice(0, most);
  console.log(`[place-photos] photos for "${line.slice(0, 40)}": ${show.join(", ") || "none"} of ${imgs.length} (${String(j.why || "").slice(0, 60)})`);
  return show;
};

let judge: Judge = aiJudge;
export const judgePhotos: Judge = (...a) => judge(...a);
/** (tests: a judge whose answers are known) */
export function setJudgeForTests(j: Judge | null): void { judge = j ?? aiJudge; }
