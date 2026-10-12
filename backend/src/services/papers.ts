/**
 * Papers kept from the trip (Ken, Oct 12 2026): "documents that I'm not sure I want to throw away, but I don't want to
 * carry paper. and I want to associate with the date… based on the date, you could connect it to where we were."
 * Who sees one: whoever kept it — and Ken's and Larisa's are visible to each other ("Anything I put in should be visible
 * to Larisa and Vice versa. Everyone else should be private to themselves").
 * Kept from Scout ("keep this", with the picture or PDF) or the Notes tab's "Keep a paper"; Wander reads what it is and
 * which trip day it belongs to, and files it there.
 */
import Anthropic from "@anthropic-ai/sdk";
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
  required: ["title", "date", "summary"],
  properties: {
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
Never put a card number, a confirmation or reservation number, a passport number, a guest's name or a room number in the title or summary.`;

let client: Anthropic | null = null;
/** What a paper is and which trip day it belongs to — read once, when it's kept from the Notes tab */
export async function readPaper(file: PaperFile, days: { date: string; town: string }[]): Promise<{ title: string; date: string | null; summary: string } | null> {
  client ??= new Anthropic();
  const block = file.mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } }
    : { type: "image", source: { type: "base64", media_type: file.mediaType, data: file.data } };
  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: [block, { type: "text", text: `The trip's days and where the travellers were:\n${days.map((d) => `${d.date} ${d.town}`).join("\n")}` }] }],
    } as any, { timeout: 45_000, maxRetries: 0 });   // (never "Reading it…" for minutes — kept as it is instead; verify21)
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    const r = text ? JSON.parse(text) : null;
    if (!r || typeof r.title !== "string" || !r.title.trim()) return null;
    const date = typeof r.date === "string" && days.some((d) => d.date === r.date) ? r.date : null;
    return { title: r.title.trim().slice(0, 120), date, summary: String(r.summary || "").trim().slice(0, 600) };
  } catch (e: any) {
    console.warn(`[papers] couldn't read a paper: ${e?.status ?? e?.message ?? "unknown"}`);
    return null;
  }
}

/** Keep one paper */
export async function keepPaper(o: { tripId: string; travelerId: string; authorName: string; file: PaperFile; title: string; dayDate: string | null; summary: string }) {
  const thumb = o.file.thumb ? Buffer.from(o.file.thumb.split(",")[1], "base64") : null;
  return prisma.tripPaper.create({
    data: { tripId: o.tripId, travelerId: o.travelerId, authorName: o.authorName, dayDate: o.dayDate, title: o.title, summary: o.summary,
      fileName: o.file.name || null, mimeType: o.file.mediaType, bytes: Buffer.from(o.file.data, "base64"), ...(thumb ? { thumb } : {}) },
    select: { id: true, title: true, dayDate: true, summary: true },
  });
}

/** For Scout: the papers this person may see, one line each (never the file) */
export async function paperLines(tripId: string, travelerId: string): Promise<string[]> {
  const owners = await paperOwnersFor(travelerId);
  const papers = await prisma.tripPaper.findMany({ where: { tripId, hidden: false, travelerId: { in: owners } }, orderBy: [{ dayDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, dayDate: true, summary: true, authorName: true, travelerId: true } });
  // (the day said in words, weekday and all — Scout called Fri, Oct 9 "Thu" working it out itself)
  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return papers.map((p) => `- [paper ${p.id}] ${p.dayDate ? `${day(p.dayDate)} (${p.dayDate})` : "no day"} · ${p.title} — ${p.summary}${p.travelerId === travelerId ? "" : ` (kept by ${p.authorName})`}`);
}
