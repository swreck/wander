/**
 * Maybes — one rule for the Maybes screen (routes/maybes.ts) and Scout (chat.ts add_maybe / im_in), Oct 2 2026.
 * A maybe is an idea added in Wander (an Experience with no sheetRowRef) on a city's list. "I'm in" is an
 * ExperienceInterest marked "wander:" — shown with her Guide's X marks, never written to her sheet, and never taken
 * away by a new Guide copy (importSnapshot.ts replaces only her marks).
 */
import prisma from "./db.js";
import { logChange } from "./changeLog.js";

/** The marker on Wander's own "I'm in" (her Guide's marks are the plain names from her columns) */
export const WANDER_MARK = "wander:";
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

type Who = { travelerId?: string; code: string; displayName: string };

/** "maybe that coffee place https://www.instagram.com/reel/x Thursday?" → its words and its link */
export function wordsAndLink(words: string, link?: string | null): { words: string; link: string | null } {
  let text = (words || "").trim();
  let url = (link || "").trim() || null;
  const found = text.match(/https?:\/\/\S+/i);
  if (!url && found) url = found[0].replace(/[).,!?]+$/, "");
  if (found) text = text.replace(found[0], " ").replace(/\s{2,}/g, " ").trim();
  if (url && !/^https?:\/\//i.test(url)) url = null;
  if (!text && url) {
    let host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* not a link after all */ }
    text = host ? `A link from ${host}` : "";
  }
  return { words: text.slice(0, 300), link: url };
}

export class MaybeError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Put a maybe on a city's list; saying it is being in on it. The same words twice within minutes is one maybe. */
export async function createMaybe(who: Who, tripId: string, cityId: string, rawWords: string, rawLink?: string | null, via = "") {
  const { words, link } = wordsAndLink(rawWords, rawLink);
  if (!tripId || !cityId || !words) throw new MaybeError(400, "A few words, the trip and the city are needed");
  const city = await prisma.city.findUnique({ where: { id: cityId }, select: { tripId: true, name: true } });
  if (!city || city.tripId !== tripId) throw new MaybeError(404, "City not found on this trip");
  const me = who.displayName;
  const recent = await prisma.experience.findFirst({
    where: { tripId, cityId, createdBy: me, name: words, sheetRowRef: null, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
  });
  // (with its marks, so the phone knows the "I'm in" on it is yours — it showed "Interested: you" beside "I'm in")
  const withMarks = (id: string) => prisma.experience.findUniqueOrThrow({ where: { id }, include: { interests: { select: { displayName: true, userCode: true }, orderBy: { createdAt: "asc" } } } });
  if (recent) return { maybe: await withMarks(recent.id), city: city.name, again: true };
  const created = await prisma.experience.create({
    data: { tripId, cityId, name: words, sourceUrl: link, createdBy: me, state: "possible", priorityOrder: 0 },
  });
  if (who.travelerId) {
    await prisma.experienceInterest.create({
      data: { experienceId: created.id, tripId, userCode: `${WANDER_MARK}${who.travelerId}`, displayName: me },
    }).catch(() => { /* already there */ });
  }
  const maybe = await withMarks(created.id);
  await logChange({
    user: who, tripId, actionType: "maybe_added", entityType: "experience", entityId: maybe.id, entityName: words,
    description: `${me}: maybe — "${words}" (${city.name})${via}`,
  });
  return { maybe, city: city.name, again: false };
}

/** Take back your own maybe (plans change — "tea or ice cream?" at 3 is gone by 5). Only the person who said it, and
 *  never one of her ideas. The notes and "I'm in"s on it go with it. */
export async function takeBackMaybe(who: Who, experienceId: string, via = "") {
  const exp = await prisma.experience.findUnique({ where: { id: experienceId }, select: { id: true, tripId: true, name: true, sheetRowRef: true, createdBy: true } });
  if (!exp) throw new MaybeError(404, "Not found");
  if (exp.sheetRowRef) throw new MaybeError(403, "That's one of Larisa's ideas — Wander can't take it off her list.");
  if (firstName(exp.createdBy).toLowerCase() !== firstName(who.displayName).toLowerCase()) throw new MaybeError(403, `That's ${firstName(exp.createdBy)}'s maybe — only they can take it back.`);
  const plans = await prisma.dayChoice.count({ where: { experienceId } });
  if (plans) await prisma.dayChoice.updateMany({ where: { experienceId }, data: { experienceId: null } });
  await prisma.experience.delete({ where: { id: experienceId } });
  await logChange({
    user: who, tripId: exp.tripId, actionType: "maybe_taken_back", entityType: "experience", entityId: experienceId,
    entityName: exp.name, description: `${who.displayName} took back the maybe "${exp.name}"${via}`,
  });
  return { name: exp.name };
}

/** "I'm in" on a maybe or one of her ideas — or "Julie's in too", said by her partner (forName) */
export async function setIn(who: Who, experienceId: string, on: boolean, forName?: string | null, via = "") {
  if (!who.travelerId) throw new MaybeError(403, "Traveler identity required");
  const exp = await prisma.experience.findUnique({ where: { id: experienceId }, select: { id: true, tripId: true, name: true } });
  if (!exp) throw new MaybeError(404, "Not found");
  const other = forName && forName.trim() ? firstName(forName) : null;
  const userCode = `${WANDER_MARK}${who.travelerId}${other ? `:for:${other.toLowerCase()}` : ""}`;
  const displayName = other ? `${other} (via ${firstName(who.displayName)})` : who.displayName;
  if (on) {
    await prisma.experienceInterest.upsert({
      where: { experienceId_userCode: { experienceId, userCode } },
      create: { experienceId, tripId: exp.tripId, userCode, displayName },
      update: { displayName },
    });
  } else {
    await prisma.experienceInterest.deleteMany({ where: { experienceId, userCode } });
  }
  await logChange({
    user: who, tripId: exp.tripId, actionType: on ? "maybe_in" : "maybe_out", entityType: "experience", entityId: experienceId,
    entityName: exp.name, description: `${displayName} ${on ? "is in on" : "is no longer in on"} "${exp.name}"${via}`,
  });
  const interests = await prisma.experienceInterest.findMany({ where: { experienceId }, select: { displayName: true, userCode: true }, orderBy: { createdAt: "asc" } });
  return { on, name: exp.name, tripId: exp.tripId, interests };
}
