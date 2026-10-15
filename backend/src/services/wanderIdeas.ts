/**
 * "Ideas for Wander" (Oct 15 2026). Ken: "Can wander have place used most by andy and me to place screenshots and ideas
 * to improve wander? Plan this. Should not get in the way of travel flow. Product focused only. With all inputs durable
 * and optimized to support planning. So ideally you or Scott are a participant. Perhaps even for you to be able to
 * respond in that context with 'I get the goal. What about….'" Then: "Yes on idea's for wander approach. That one is
 * clearly a mode, one enters, so it should be easy and evident for Andy and me without conflicting with daily reference
 * use".
 *
 * Its members (Ken and Andy) post ideas — their words exactly, screenshots, the screen they were on — and reply to each
 * other. Scout's product helper answers each new idea within seconds ("I get the goal… What about…?"), reading only
 * Wander's features and the idea list, never the trip. Wander's engineer (Claude, in its working sessions:
 * trip-data/session-tools/ideas.mts) answers and moves each idea's status, so the list is the plan. Nothing is deleted.
 * Tell Ken stays Ken's own (services/tellKen.ts): Larisa and Julie were told no one else sees those.
 */
import Anthropic from "@anthropic-ai/sdk";
import prisma from "./db.js";

export const STATUSES = ["new", "talking", "planned", "built", "not-now"] as const;
export type IdeaStatus = (typeof STATUSES)[number];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MOST_PICTURES = 6;

export const HELPER_NAME = "Scout";
// (as the page says it: "Wander's engineer" meant nothing to Andy — verify62)
export const ENGINEER_NAME = "Claude, who builds Wander with Ken";

export async function isMember(tripId: string, travelerId: string | undefined | null): Promise<boolean> {
  if (!travelerId) return false;
  return !!(await prisma.wanderIdeaMember.findUnique({ where: { tripId_travelerId: { tripId, travelerId } } }));
}

type Picture = { mediaType: string; data: string };
const okPicture = (p: Picture) => IMAGE_TYPES.includes(p?.mediaType) && typeof p.data === "string" && /^[A-Za-z0-9+/=]+$/.test(p.data.slice(0, 200)) && p.data.length < 7_000_000;

/** A member's idea or reply: their words exactly, and up to six pictures */
export async function postIdea(input: {
  tripId: string; travelerId: string; authorName: string; words: string; screen?: string | null; parentId?: string | null;
  pictures?: Picture[];
}): Promise<{ id: string; parentId: string | null } | { error: string }> {
  if (!(await isMember(input.tripId, input.travelerId))) return { error: "Ideas for Wander is for its members." };
  const words = String(input.words || "").trim().slice(0, 4000);
  const pictures = (input.pictures || []).filter(okPicture).slice(0, MOST_PICTURES);
  if (!words && !pictures.length) return { error: "Write the idea, or add a screenshot." };
  let parentId: string | null = null;
  if (input.parentId) {
    const parent = await prisma.wanderIdea.findUnique({ where: { id: input.parentId }, select: { id: true, tripId: true, parentId: true } });
    if (!parent || parent.tripId !== input.tripId) return { error: "That idea isn't here anymore." };
    parentId = parent.parentId || parent.id;   // (a reply to a reply joins the idea's thread)
  }
  const row = await prisma.wanderIdea.create({
    data: { tripId: input.tripId, travelerId: input.travelerId, authorName: input.authorName, role: "person", parentId, words,
      screen: input.screen || null, pictures: { create: pictures.map((p) => ({ imageType: p.mediaType, image: Buffer.from(p.data, "base64") })) } },
  });
  // (talking once someone answers an idea that was new)
  if (parentId) await prisma.wanderIdea.updateMany({ where: { id: parentId, status: "new" }, data: { status: "talking" } });
  // Scout answers each new idea — in the background, so posting never waits on it
  else helperReply(row.id).catch((e) => console.warn("[ideas] helper:", e?.message || e));
  return { id: row.id, parentId };
}

/** A reply from Wander's engineer (Claude's working sessions), and the idea's status if it changed */
export async function engineerReply(ideaId: string, words: string, status?: IdeaStatus) {
  const idea = await prisma.wanderIdea.findUnique({ where: { id: ideaId }, select: { id: true, tripId: true, parentId: true } });
  if (!idea || idea.parentId) throw new Error("Not an idea");
  if (words.trim()) await prisma.wanderIdea.create({ data: { tripId: idea.tripId, authorName: ENGINEER_NAME, role: "engineer", parentId: idea.id, words: words.trim() } });
  if (status) await moveStatus(idea.tripId, idea.id, status, { authorName: ENGINEER_NAME, travelerId: null });
}

/**
 * An idea's status moved, said on the idea as a line of its own ("Ken marked it Built") — so it's news like a reply: the
 * other member's dot on Home, "new" on the card, the idea back at the top (andy-ideas, Oct 15: Ken marked Andy's idea
 * Built and Andy never learned of it). Nothing when it didn't move.
 */
async function moveStatus(tripId: string, id: string, status: string, by: { authorName: string; travelerId: string | null }): Promise<boolean> {
  const idea = await prisma.wanderIdea.findFirst({ where: { id, tripId, parentId: null }, select: { status: true } });
  if (!idea) return false;
  if (idea.status === status) return true;
  await prisma.wanderIdea.update({ where: { id }, data: { status } });
  await prisma.wanderIdea.create({ data: { tripId, travelerId: by.travelerId, authorName: by.authorName, role: "status", parentId: id, words: status } });
  return true;
}

export async function setStatus(tripId: string, travelerId: string, id: string, status: string, authorName = "Someone"): Promise<boolean> {
  if (!(STATUSES as readonly string[]).includes(status) || !(await isMember(tripId, travelerId))) return false;
  return moveStatus(tripId, id, status, { authorName, travelerId });
}

/** The ideas, each with its replies, the one with the latest word first */
export async function listIdeas(tripId: string, travelerId: string) {
  const rows = await prisma.wanderIdea.findMany({
    where: { tripId }, orderBy: { createdAt: "asc" },
    select: { id: true, travelerId: true, authorName: true, role: true, parentId: true, words: true, screen: true, status: true, createdAt: true, pictures: { select: { id: true }, orderBy: { createdAt: "asc" } } },
  });
  const one = (r: (typeof rows)[number]) => ({ id: r.id, who: r.authorName, role: r.role, mine: r.travelerId === travelerId, words: r.words, screen: r.screen,
    pictures: r.pictures.map((p) => p.id), at: r.createdAt.toISOString() });
  const ideas = rows.filter((r) => !r.parentId).map((r) => ({ ...one(r), status: r.status, replies: rows.filter((x) => x.parentId === r.id).map(one) }));
  const last = (i: (typeof ideas)[number]) => (i.replies.length ? i.replies[i.replies.length - 1].at : i.at);
  return ideas.sort((a, b) => last(b).localeCompare(last(a)));
}

/** Something new since this member last looked: an idea or a reply by anyone else (Scout and the engineer included) */
export async function unseenCount(tripId: string, travelerId: string): Promise<number | null> {
  const m = await prisma.wanderIdeaMember.findUnique({ where: { tripId_travelerId: { tripId, travelerId } } });
  if (!m) return null;
  return prisma.wanderIdea.count({ where: { tripId, OR: [{ travelerId: null }, { travelerId: { not: travelerId } }], ...(m.seenAt ? { createdAt: { gt: m.seenAt } } : {}) } });
}
export async function markSeen(tripId: string, travelerId: string) {
  await prisma.wanderIdeaMember.updateMany({ where: { tripId, travelerId }, data: { seenAt: new Date() } });
}

// ── Scout's product helper ─────────────────────────────────────────────────────────────────────────────────────────

/** What Wander is and does, for the helper (kept short: it's read with every idea — a few cents each) */
const WANDER = `Wander is a phone web app (iPhone, saved to the Home Screen) for four friends on a trip in Japan, Oct 5–29 2026: Ken and Larisa, Andy and Julie. Larisa planned the trip in a Google Sheet ("her Guide"); Wander reads a copy of it and never changes it — her plan is the master, in her order and her words.
Where words come from: her Guide (Larisa's sheet); Backroads' itinerary (a PDF from the tour company, for the guided week Oct 18–25: rides, hikes, lengths — Backroads' words, never hers); Ken's rail sheet; Google (place photos, opening hours, Maps). Never call one source's words another's.
Bottom bar: Home · Maybes · Next · Notes · Budget · Scout, and 日 (the phrase card).
Screens: Home (today's plan in short, the forecast, a calendar of the days, "Budget: ¥… shared so far" with who pays next, "To-dos and deadlines" for her to-do list, the trip's story, her other tabs to read). A day page (the city and its photo, the forecast, her plan by the clock with Maps links (Google Maps) and her notes, bookings, tonight's hotel, "Photos from the day", notes for the day). "Play the day" on every day (one moment per screen with photos, a Next button naming what's next, a cover; Backroads days play Backroads' itinerary). Next (what's coming up now, with Walk/Train/Taxi directions in Google Maps). Maybes (a shared list of ideas, "I'm in", by city). Notes (their own words kept exactly; Talk to dictate; keep a paper like a receipt). Budget (who pays next — the bar's icon shows "KL" purple or "AJ" orange, the couple that has paid less; the total; "+ Add entry"; every entry). Your own photos (on the day they were taken, just yours unless shared, captions; shared ones play in Play the day and the story). Scout (an AI guide that answers from her Guide, Backroads' itinerary and the web, never invents a time or place; keeps payments, photos and notes; "Tell Ken…"; "Use my location"). Settings (Face ID, buzz when Scout answers).
What doesn't change: Wander never edits her Guide; Scout never states what it can't support; no polls or votes; it must work for people who've had no training; Ken decides what's built and when.`;

const HELPER_RULES = `You are Scout, taking part in "Ideas for Wander": Ken and Andy's place to suggest how Wander could be better. Someone just posted an idea (with screenshots, if any). Reply once, briefly, as a thoughtful product partner.
- Start with "I get the goal:" and the goal behind their idea, in their terms, in one sentence (what they're trying to get, not what they asked for).
- Then one concrete suggestion that might serve that goal better or more simply, as a question: "What about …?" One only, and specific to Wander's real screens.
- Only if an earlier idea's own words ask for the same thing, say so in one short sentence, naming who and when (if it's the same person's own earlier idea, say "you posted this on Oct 15"), quoting its words exactly, and saying where it stands from its [status] in plain words ("Close to Andy's idea from Oct 15, already planned: '…'"). Never say what an earlier idea covers or means beyond its own words; if none plainly asks for the same thing, say nothing about earlier ideas.
- If it reports something broken or wrong, skip "What about": say what you understand they saw, and ask exactly one question — the single detail that would help most (which screen, or what they expected).
- 2 or 3 sentences, under 60 words in all: it's read on a phone beside their idea. Plain words, one thought per sentence, no marketing words, no exclamation marks, no lists, no headings, no markdown (no asterisks).
- Before suggesting, check the screens above: if what they want is already there, say where it is instead ("Home already says 'Who pays next: Ken & Larisa'"). Never suggest what already exists.
- Never promise it will be built, or when. Never say a feature exists unless it's described above. Never say anything about how Larisa or anyone words things beyond what's quoted to you. Nothing about the trip itself (times, places, bookings) — only Wander.`;

let client: Anthropic | null = null;

/** Scout's answer to a new idea, kept as a reply */
export async function helperReply(ideaId: string): Promise<string | null> {
  if (process.env.IDEAS_HELPER === "off") return null;
  const idea = await prisma.wanderIdea.findUnique({ where: { id: ideaId }, include: { pictures: true } });
  if (!idea || idea.parentId || idea.role !== "person") return null;
  const others = await prisma.wanderIdea.findMany({ where: { tripId: idea.tripId, parentId: null, id: { not: idea.id } }, orderBy: { createdAt: "desc" }, take: 40,
    select: { authorName: true, travelerId: true, words: true, status: true, createdAt: true } });
  // (andy-ideas: "new" came out as "not looked at yet", which read as neglect)
  const STATUS_SAID: Record<string, string> = { new: "posted, not yet talked over", talking: "being talked over", planned: "already planned", built: "already built", "not-now": "set aside for now" };
  const list = others.map((o) => `- ${o.authorName}${o.travelerId && o.travelerId === idea.travelerId ? " (the same person)" : ""}, ${o.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Tokyo" })} [${STATUS_SAID[o.status] || o.status}]: ${o.words.slice(0, 200).replace(/\s+/g, " ")}`).join("\n") || "(none yet)";
  const content: Anthropic.ContentBlockParam[] = [
    ...idea.pictures.slice(0, MOST_PICTURES).map((p) => ({ type: "image" as const, source: { type: "base64" as const, media_type: p.imageType as "image/jpeg", data: Buffer.from(p.image).toString("base64") } })),
    { type: "text", text: `EARLIER IDEAS:\n${list}\n\nTHE NEW IDEA, from ${idea.authorName}${idea.screen ? `, on ${idea.screen}` : ""}${idea.pictures.length ? `, with ${idea.pictures.length} screenshot${idea.pictures.length > 1 ? "s" : ""}` : ""}:\n${idea.words || "(no words — just the screenshot)"}` },
  ];
  client ??= new Anthropic();
  const ask = (blocks: Anthropic.ContentBlockParam[]) => client!.messages.create({ model: "claude-opus-5", max_tokens: 1200, system: `${WANDER}\n\n${HELPER_RULES}`, messages: [{ role: "user", content: blocks }] });
  let res: Anthropic.Message;
  try { res = await ask(content); } catch (e: any) {
    // (a picture the model can't read must not leave the idea unanswered — Oct 15 test: "Could not process image")
    if (!(e?.status === 400 && /image/i.test(String(e?.message)))) throw e;
    const text = content.filter((b) => b.type === "text") as Anthropic.TextBlockParam[];
    res = await ask([{ type: "text", text: `${text.map((t) => t.text).join("\n")}\n\n(The screenshot that came with it couldn't be read; say so in a few words at the end.)` }]);
  }
  let words = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  // (cut off: back to its last whole sentence — Oct 15 test: a reply ended "Close to")
  if (res.stop_reason === "max_tokens") words = words.replace(/[^.?!]*$/, "").trim();
  const u: any = res.usage || {};
  console.log(`[ideas] helper replied: input=${u.input_tokens} output=${u.output_tokens} stop=${res.stop_reason} blocks=${res.content.map((b) => b.type).join(",")} ≈ $${(((u.input_tokens || 0) * 5 + (u.output_tokens || 0) * 25) / 1e6).toFixed(3)}`);
  if (!words) return null;
  // (the idea stays "new" until a person answers it — Scout's first thoughts aren't a conversation yet)
  await prisma.wanderIdea.create({ data: { tripId: idea.tripId, authorName: HELPER_NAME, role: "helper", parentId: idea.id, words } });
  return words;
}
