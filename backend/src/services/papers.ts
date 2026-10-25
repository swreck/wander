/**
 * Papers kept from the trip (Ken, Oct 12 2026): "documents that I'm not sure I want to throw away, but I don't want to
 * carry paper. and I want to associate with the date… based on the date, you could connect it to where we were."
 * Who sees one: whoever kept it — and Ken's and Larisa's are visible to each other ("Anything I put in should be visible
 * to Larisa and Vice versa. Everyone else should be private to themselves"). The keeper can change it, to just them or to
 * everyone on the trip (Ken, Oct 25: "change the distribution between self and group").
 * Kept from Scout ("keep this", with the picture or PDF) or the Notes tab's "Keep a paper"; Wander reads what it is and
 * which trip day it belongs to, and files it there.
 */
import Anthropic from "@anthropic-ai/sdk";
import jwt from "jsonwebtoken";
import prisma from "./db.js";

// (by the names the four accounts carry — Ken's ruling names the two who share)
const SHARING = [["ken", "larisa"]];

/** The people whose papers this person may see: themselves, and their partner where Ken's ruling makes one */
export async function paperOwnersFor(travelerId: string): Promise<string[]> {
  const me = await prisma.traveler.findUnique({ where: { id: travelerId }, select: { displayName: true } });
  const pair = SHARING.find((p) => p.includes((me?.displayName || "").toLowerCase()));
  if (!pair) return [travelerId];
  const both = (await prisma.traveler.findMany({ select: { id: true, displayName: true } })).filter((t) => pair.includes(t.displayName.toLowerCase()));
  return [...new Set([travelerId, ...both.map((t) => t.id)])];
}

/** Who sees a paper (Ken, Oct 25, on the Baian ryokan's welcome sheet: "change the distribution between self and group"):
 *  "me" — only the keeper; "pair" — the keeper and their partner (Ken and Larisa, his Oct 12 ruling, and how a paper is
 *  kept); "group" — everyone on the trip, who each get a card about it the next time they open Wander. */
export type PaperShare = "me" | "pair" | "group";
/** As stored (null: as kept) → what it means for this keeper */
export const shareOf = (stored: string | null, keeperHasPartner: boolean): PaperShare =>
  stored === "group" ? "group" : stored === "me" || !keeperHasPartner ? "me" : "pair";

/** The papers this person may see on a trip: their own, their partner's not kept to themselves, and any shared with everyone */
export async function visibleWhere(tripId: string, travelerId: string) {
  const owners = await paperOwnersFor(travelerId);
  return { tripId, hidden: false, OR: [{ travelerId }, { share: "group" }, { share: null, travelerId: { in: owners } }] };
}

/** A short-lived link to one paper (or its small copy) for one person — an <img> can't send a sign-in. Opened, it asks
 *  again whether that person may still see it (kept back to Just me while a card was on someone's screen: it had still
 *  opened; fresh-agent check, Oct 25). */
export const paperLink = (id: string, small = false, who?: string) =>
  `/api/papers/file/${id}?t=${jwt.sign({ paper: id, ...(who ? { who } : {}) }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "1d" })}${small ? "&small=1" : ""}`;

/** May this person see this paper now? */
export async function maySee(p: { tripId: string; travelerId: string; share: string | null; hidden: boolean }, who: string): Promise<boolean> {
  if (p.hidden) return false;
  if (p.travelerId === who) return true;
  if (p.share === "group") return !!(await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId: p.tripId, travelerId: who } } }));
  return p.share === null && (await paperOwnersFor(who)).includes(p.travelerId);
}

/** The keeper changes who sees it. Shared with everyone: a card to each other person on the trip, once while it shows;
 *  kept back again: the card is taken back too (hidden, never deleted). */
export async function setPaperShare(paperId: string, travelerId: string, want: PaperShare): Promise<{ error: string } | { share: PaperShare; told: string[]; partner: string | null }> {
  const p = await prisma.tripPaper.findUnique({ where: { id: paperId }, select: { id: true, tripId: true, travelerId: true, authorName: true, title: true, hidden: true } });
  if (!p || p.hidden) return { error: "That paper isn't here any more." };
  if (p.travelerId !== travelerId) return { error: "Only the person who kept a paper can change who sees it." };
  const owners = await paperOwnersFor(travelerId);
  const partner = owners.length > 1 ? (await prisma.traveler.findFirst({ where: { id: { in: owners.filter((o) => o !== travelerId) } }, select: { displayName: true } }))?.displayName || null : null;
  if (want === "pair" && !partner) return { error: "Nobody shares papers with them: it's just them, or everyone." };
  await prisma.tripPaper.update({ where: { id: p.id }, data: { share: want === "group" ? "group" : want === "me" ? "me" : null } });
  const { othersOn, KEEP_MS } = await import("./tripAlerts.js");
  if (want !== "group") {
    await prisma.tripAlert.updateMany({ where: { paperId: p.id, withdrawnAt: null }, data: { withdrawnAt: new Date() } });
    return { share: want, told: [], partner };
  }
  const others = await othersOn(p.tripId, travelerId);
  // (shared again within its 3 days — a mis-tap put right, a change of mind: the same card comes back, so whoever already
  // tapped Got it isn't shown it again; fresh-agent check, Oct 25)
  const before = await prisma.tripAlert.findFirst({ where: { paperId: p.id, createdAt: { gt: new Date(Date.now() - KEEP_MS) } }, orderBy: { createdAt: "desc" } });
  if (before?.withdrawnAt) await prisma.tripAlert.update({ where: { id: before.id }, data: { withdrawnAt: null } });
  if (!before && others.length) {
    const me = await prisma.traveler.findUnique({ where: { id: travelerId }, select: { displayName: true } });
    await prisma.tripAlert.create({ data: { tripId: p.tripId, fromId: travelerId, fromName: me?.displayName || p.authorName, text: `Shared a paper: ${p.title}`, paperId: p.id } });
  }
  // (who will see the card: not anyone who already tapped Got it on it — the keeper is told only who it reaches)
  const answered = before ? new Set((await prisma.tripAlertSeen.findMany({ where: { alertId: before.id, state: "got" }, select: { travelerId: true } })).map((s) => s.travelerId)) : new Set<string>();
  return { share: "group", told: others.filter((o) => !answered.has(o.id)).map((o) => o.name), partner };
}

/** The kinds of file a paper can be: a picture the phone shrank, or a PDF */
export const PAPER_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 10 * 1024 * 1024;

export interface PaperFile { mediaType: string; data: string; name?: string; thumb?: string | null }
/** A file as the phone sent it — or why it can't be kept */
export function paperFile(x: unknown): PaperFile | string {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const mediaType = typeof o.mediaType === "string" ? o.mediaType : "";
  if (!PAPER_TYPES.includes(mediaType)) return "Only a photo, a picture or a PDF can be kept as a paper.";
  const data = typeof o.data === "string" && /^[A-Za-z0-9+/=]+$/.test(o.data.slice(0, 400)) ? o.data : "";
  if (!data) return "That file couldn't be read.";
  if (data.length * 0.75 > MAX_BYTES) return "That file is too large to keep (over 10 MB). A photo of it works.";
  // (the phone's own small copy, a JPEG data address under ~60 KB — anything else is left out)
  const thumb = typeof o.thumb === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(o.thumb) && o.thumb.length < 80_000 ? o.thumb : null;
  return { mediaType, data, name: typeof o.name === "string" ? o.name.slice(0, 160) : undefined, thumb };
}

/** The trip's days, with the town each is in (her Guide's city, without her planning words: "Karatsu ", "Okayama - WHERE
 *  IS BIZEN TOUR STARTING") */
export async function tripDays(tripId: string): Promise<{ date: string; town: string }[]> {
  const days = await prisma.day.findMany({ where: { tripId }, select: { date: true, city: { select: { name: true } } }, orderBy: { date: "asc" } });
  return days.map((d) => ({ date: d.date.toISOString().slice(0, 10), town: townName(d.city?.name || "") }));
}
export const townName = (s: string) => s.split(/\s+-\s+|\s*\(|,/)[0].trim();

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "date", "summary", "text"],
  properties: {
    text: { type: "string", description: "The words printed on it that a traveller might ask about, as printed, a line per item: times, places and their names, what was bought and each price, Wi-Fi network names and passwords, the place's own phone number and address, rules and notices. In the language printed, with an English line beside any Japanese. Leave out card, confirmation, reservation and passport numbers, guests' names and room numbers. Empty when nothing can be read." },
    title: { type: "string", description: "A few words a traveller would use: \"Yōyōkaku bill\", \"Shinkansen tickets Nagoya → Tokyo\", \"Pharmacy receipt\"" },
    date: { type: "string", description: "The trip day it belongs to, YYYY-MM-DD, from the list given — or an empty string when nothing on it says" },
    summary: { type: "string", description: "One or two plain sentences: what it is, the dates it covers, what the charges are for (and, for a hotel or ryokan bill with no room charge on it, that the room isn't on it), and the total paid, as printed" },
  },
};
const SYSTEM = `You read a paper someone on a trip kept instead of carrying it: a receipt, a bill, a ticket, a booking.
Be faithful: say only what the paper shows. Amounts with their currency as printed. A date printed as 26/10/10 is 2026-10-10.
In the title and summary, write dates the way a traveller says them ("Oct 8–10", "Oct 9"), never as 2026-10-08.
"date" is the trip day the paper belongs to, so it sits with where they were: the day it was issued or paid; for a stay (a hotel or ryokan bill), the last night of the stay — the day before check-out. It must be one of the trip's days given, or empty.
Say what the charges are for. A hotel or ryokan bill often lists only meals, drinks and service, the room paid when it was booked: then say plainly the room isn't on it — never let a total read as the price of the stay (Ken, Oct 12: "what did we pay at the Ryokan per night?").
Never put a card number, a confirmation or reservation number, a passport number, a guest's name or a room number in the title, summary or text.`;

let client: Anthropic | null = null;
/** What a paper is and which trip day it belongs to — read once, when it's kept from the Notes tab */
export async function readPaper(file: PaperFile, days: { date: string; town: string }[]): Promise<{ title: string; date: string | null; summary: string; text: string } | null> {
  client ??= new Anthropic();
  const block = file.mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } }
    : { type: "image", source: { type: "base64", media_type: file.mediaType, data: file.data } };
  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 6000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: [block, { type: "text", text: `The trip's days and where the travellers were:\n${days.map((d) => `${d.date} ${d.town}`).join("\n")}` }] }],
    } as any, { timeout: 45_000, maxRetries: 0 });   // (never "Reading it…" for minutes — kept as it is instead; verify21)
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    const r = text ? JSON.parse(text) : null;
    if (!r || typeof r.title !== "string" || !r.title.trim()) return null;
    const date = typeof r.date === "string" && days.some((d) => d.date === r.date) ? r.date : null;
    return { title: r.title.trim().slice(0, 120), date, summary: String(r.summary || "").trim().slice(0, 600), text: String(r.text || "").trim().slice(0, TEXT_MAX) };
  } catch (e: any) {
    console.warn(`[papers] couldn't read a paper: ${e?.status ?? e?.message ?? "unknown"}`);
    return null;
  }
}

/** The most of a paper's printed words kept (a long welcome sheet with its room descriptions fits) */
export const TEXT_MAX = 4000;

/** Keep one paper */
export async function keepPaper(o: { tripId: string; travelerId: string; authorName: string; file: PaperFile; title: string; dayDate: string | null; summary: string; text?: string | null }) {
  const thumb = o.file.thumb ? Buffer.from(o.file.thumb.split(",")[1], "base64") : null;
  return prisma.tripPaper.create({
    data: { tripId: o.tripId, travelerId: o.travelerId, authorName: o.authorName, dayDate: o.dayDate, title: o.title, summary: o.summary,
      ...(o.text ? { text: o.text.slice(0, TEXT_MAX) } : {}),
      fileName: o.file.name || null, mimeType: o.file.mediaType, bytes: Buffer.from(o.file.data, "base64"), ...(thumb ? { thumb } : {}) },
    select: { id: true, title: true, dayDate: true, summary: true },
  });
}

/** For Scout: the papers this person may see, one line each (never the file) */
export async function paperLines(tripId: string, travelerId: string): Promise<string[]> {
  const owners = await paperOwnersFor(travelerId);
  const papers = await prisma.tripPaper.findMany({ where: await visibleWhere(tripId, travelerId), orderBy: [{ dayDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, dayDate: true, summary: true, text: true, authorName: true, travelerId: true, share: true } });
  // (the day said in words, weekday and all — Scout called Fri, Oct 9 "Thu" working it out itself)
  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  // (and who sees it, so "who can see the ryokan sheet?" has its answer)
  const who = (p: { travelerId: string; authorName: string; share: string | null }) => {
    const mine = p.travelerId === travelerId, s = shareOf(p.share, mine ? owners.length > 1 : true);
    if (!mine) return s === "group" ? ` (kept by ${p.authorName}, shared with everyone)` : ` (kept by ${p.authorName})`;
    return s === "group" ? " (they shared it with everyone)" : s === "me" && owners.length > 1 ? " (only they see it)" : "";
  };
  // (and the words printed on it, so "what's the Wi-Fi password?" is answered from the sheet itself)
  const words = (t: string | null) => (t ? `\n    Printed on it: ${t.replace(/\s*\n\s*/g, " / ")}` : "");
  return papers.map((p) => `- [paper ${p.id}] ${p.dayDate ? `${day(p.dayDate)} (${p.dayDate})` : "no day"} · ${p.title} — ${p.summary}${who(p)}${words(p.text)}`);
}
