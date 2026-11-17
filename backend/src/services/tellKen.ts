/**
 * "Tell Ken…" (Oct 14 2026). Ken: "if they would like a feature added to wander or anything about the way wander works
 * is confusing, they can speak or type at that moment what they want and it will become a message to Ken to try to
 * fix. It cannot be a nuisance, and it should be very easy". Said to Scout ("Tell Ken the day page is hard to read"),
 * kept word for word with the screen they were on and a picture only if they sent one; Ken's phone buzzes. Only the
 * trip's organizer reads them (and his engineer); never anyone else's Notes or Scout answers.
 */
import prisma from "./db.js";
import { sendToPhones, answerPreview } from "./push.js";

/** The trip's organizer: its first member (the same rule as the Maybes and the phrase card) */
export async function organizerOf(tripId: string): Promise<string | null> {
  const m = await prisma.tripMember.findFirst({ where: { tripId }, orderBy: { joinedAt: "asc" }, select: { travelerId: true } });
  return m?.travelerId ?? null;
}

/** "the Oct 15 page", "Home": where they were, said plainly */
export function screenWords(context: { page?: unknown; dayDate?: unknown; cityName?: unknown } | null | undefined): string | null {
  const page = typeof context?.page === "string" ? context.page.trim().slice(0, 60) : "";
  const day = typeof context?.dayDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(context.dayDate) ? context.dayDate : "";
  if (day) {
    const d = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return `the ${d} page`;
  }
  return page || null;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Keep one message and buzz the organizer. Their words only; at most one picture, as sent. */
export async function tellKen(input: {
  tripId: string; travelerId: string; authorName: string; words: string; screen?: string | null;
  image?: { mediaType: string; data: string } | null;
}): Promise<{ id: string } | { error: string }> {
  // (without "Tell Ken" in front, or a comma or "and" left hanging where two wishes were split: "…should have a search,")
  const words = String(input.words || "").replace(/^\s*(tell|let)\s+ken\s*(know\s*)?[:,]?\s*/i, "").replace(/[\s,;]+(and)?\s*$/i, "").trim().slice(0, 2000);
  if (!words) return { error: "There's nothing to pass on yet. What would you like Ken to know about Wander?" };
  const org = await organizerOf(input.tripId);
  if (!org) return { error: "This trip has no organizer to send it to." };
  const image = input.image && IMAGE_TYPES.includes(input.image.mediaType) && /^[A-Za-z0-9+/=]+$/.test(input.image.data.slice(0, 200)) && input.image.data.length < 7_000_000
    ? { imageType: input.image.mediaType, image: Buffer.from(input.image.data, "base64") } : {};
  const row = await prisma.tellKen.create({ data: { tripId: input.tripId, travelerId: input.travelerId, authorName: input.authorName, words, screen: input.screen || null, ...image } });
  // (the buzz: who, and their first words — never to the person who sent it, if Ken tells himself)
  if (org !== input.travelerId) {
    sendToPhones(org, { title: `${input.authorName.split(/\s+/)[0]}, about Wander`, body: answerPreview(words), tag: `tell-ken-${row.id}`, url: "/settings?tellken=1" }).catch(() => {});
  }
  return { id: row.id };
}

/** Everything sent, newest first — for the organizer only */
export async function tellKenList(tripId: string, travelerId: string) {
  if ((await organizerOf(tripId)) !== travelerId) return null;
  const rows = await prisma.tellKen.findMany({ where: { tripId }, orderBy: { createdAt: "desc" }, take: 200,
    select: { id: true, authorName: true, words: true, screen: true, imageType: true, readAt: true, createdAt: true } });
  return rows.map((r) => ({ id: r.id, who: r.authorName, words: r.words, screen: r.screen, hasPicture: !!r.imageType, read: !!r.readAt, at: r.createdAt.toISOString() }));
}
