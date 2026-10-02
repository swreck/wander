/**
 * Trip notes (Oct 1 2026) — each person's own words, kept exactly (see TripNote in schema.prisma).
 *   POST   /trip/:tripId          save a note (a resend with the same clientId is the same note — a weak signal
 *                                 never makes two)
 *   GET    /trip/:tripId?q=       my notes, and others' notes shared with the trip (never others' private ones)
 *   GET    /trip/:tripId/export   every word of my notes, as text
 *   PATCH  /:id                   the writer changes the words (the original stays), who sees it, or story use
 *   DELETE /:id                   the writer removes it
 *   GET/PATCH /settings           "Tidy my dictation" and "Let others' trip stories use what I say about places"
 */
import { Router, type Response, type NextFunction } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { tripMemberParam } from "../middleware/role.js";
import { tidyDictation } from "../services/tripNotes/tidy.js";
import { noteFor, noteMatches, wordCount } from "../services/tripNotes/view.js";

const router = Router();
router.use(requireAuth);
router.param("tripId", tripMemberParam);

const MAX_CHARS = 50_000;
export { wordCount };

type NoteSettings = { tidy: boolean; storyUse: boolean | null };
async function settingsOf(travelerId: string): Promise<NoteSettings> {
  const t = await prisma.traveler.findUnique({ where: { id: travelerId }, select: { preferences: true } });
  const n = ((t?.preferences as any) || {}).notes || {};
  return { tidy: n.tidy === true, storyUse: typeof n.storyUse === "boolean" ? n.storyUse : null };
}

/** Tidy in the background; the note is already saved with every word, and stays so whatever happens here */
function tidyLater(id: string, text: string) {
  prisma.tripNote.update({ where: { id }, data: { tidyStatus: "pending" } })
    .then(() => tidyDictation(text))
    .then(async (r) => {
      // (only if the words weren't changed again meanwhile)
      const now = await prisma.tripNote.findUnique({ where: { id }, select: { text: true } });
      if (now?.text === text) await prisma.tripNote.update({ where: { id }, data: { tidied: r.tidied, tidyStatus: r.status } });
    })
    .catch(() => { /* the note itself is safe */ });
}

// (what each person may see of a note: services/tripNotes/view.ts)
const shape = (n: any, me: string) => noteFor(n, me);

// ── Settings ──
router.get("/settings", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  if (!me) { res.status(403).json({ error: "Sign in on your own phone to keep notes." }); return; }
  res.json(await settingsOf(me));
});

router.patch("/settings", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  if (!me) { res.status(403).json({ error: "Sign in on your own phone to keep notes." }); return; }
  const { tidy, storyUse } = req.body || {};
  const t = await prisma.traveler.findUnique({ where: { id: me }, select: { preferences: true } });
  const prefs = (t?.preferences as any) || {};
  const notes = { ...(prefs.notes || {}) };
  if (typeof tidy === "boolean") notes.tidy = tidy;
  if (typeof storyUse === "boolean") notes.storyUse = storyUse;
  await prisma.traveler.update({ where: { id: me }, data: { preferences: { ...prefs, notes } } });
  res.json(await settingsOf(me));
});

// ── Save ──
router.post("/trip/:tripId", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  if (!me) { res.status(403).json({ error: "Sign in on your own phone to keep notes." }); return; }
  const tripId = req.params.tripId as string;
  const { clientId, text, source, visibility, dayDate, city, writtenAt } = req.body || {};
  // When the phone says it was written (a note kept on the phone with no signal arrives later — it keeps its own time);
  // only a time that makes sense: not ahead of now, not before the last two months
  const written = typeof writtenAt === "string" ? new Date(writtenAt) : null;
  const createdAt = written && !isNaN(written.getTime()) && written.getTime() <= Date.now() + 5 * 60_000
    && written.getTime() >= Date.now() - 60 * 24 * 3600_000 ? written : undefined;
  if (typeof clientId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(clientId)) { res.status(400).json({ error: "This note is missing its id from the phone." }); return; }
  if (typeof text !== "string" || !text.trim()) { res.status(400).json({ error: "There's nothing in this note yet." }); return; }
  if (text.length > MAX_CHARS) { res.status(400).json({ error: `That's longer than one note can hold (${MAX_CHARS.toLocaleString()} characters) — split it in two.` }); return; }
  // The same note sent again (a weak signal, a retry): the one already kept, unchanged
  const already = await prisma.tripNote.findUnique({ where: { travelerId_clientId: { travelerId: me, clientId } } });
  if (already) { res.json({ note: shape(already, me), duplicate: true }); return; }
  const words = text.replace(/^\s+|\s+$/g, "");
  const note = await prisma.tripNote.create({
    data: {
      tripId, travelerId: me, authorName: req.user!.displayName, clientId,
      original: words, text: words,
      source: ["typed", "voice", "evening"].includes(source) ? source : "typed",
      visibility: visibility === "trip" ? "trip" : "private",
      dayDate: typeof dayDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dayDate) ? dayDate : null,
      city: typeof city === "string" && city.trim() ? city.trim().slice(0, 80) : null,
      ...(createdAt ? { createdAt } : {}),
    },
  });
  // "Tidy my dictation": spoken notes only — typed or pasted words are already as the person meant them (tester t2)
  if (note.source === "voice" && (await settingsOf(me)).tidy) tidyLater(note.id, words);
  res.status(201).json({ note: shape(note, me) });
});

// ── Read ──
router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  if (!me) { res.status(403).json({ error: "Sign in on your own phone to keep notes." }); return; }
  const tripId = req.params.tripId as string;
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 200) : "";
  const notes = await prisma.tripNote.findMany({
    where: { tripId, OR: [{ travelerId: me }, { visibility: "trip" }] },
    orderBy: { createdAt: "desc" },
  });
  // (searched in what this person can see — someone else's earlier words never match)
  res.json(notes.filter((n) => !q || noteMatches(n, me, q)).map((n) => shape(n, me)));
});

router.get("/trip/:tripId/export", async (req: AuthRequest, res) => {
  const me = req.user?.travelerId;
  if (!me) { res.status(403).json({ error: "Sign in on your own phone to keep notes." }); return; }
  const tripId = req.params.tripId as string;
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { name: true, timeZone: true } });
  const zone = trip?.timeZone || "Asia/Tokyo";
  const notes = await prisma.tripNote.findMany({ where: { tripId, travelerId: me }, orderBy: { createdAt: "asc" } });
  const dayWords = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const lines: string[] = [`Trip notes — ${req.user!.displayName} — ${trip?.name || "the trip"}`, `${notes.length} note${notes.length === 1 ? "" : "s"}, every word as saved`, ""];
  let lastDay = "";
  for (const n of notes) {
    const day = n.dayDate || "";
    // (the place first, as Notes shows it: "Kyoto · Wed, Oct 28", "Japan overall")
    const head = `${n.city || "Japan overall"}${day ? ` · ${dayWords(day)}` : ""}`;
    if (head !== lastDay) { lines.push(`## ${head}`, ""); lastDay = head; }
    const when = n.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone });
    lines.push(`${when}${n.visibility === "trip" ? " · shared with the trip" : ""}${n.source === "voice" ? " · spoken" : n.source === "evening" ? " · Scout's evening question" : ""}`);
    lines.push(n.text);
    if (n.text !== n.original) lines.push("", "As first saved:", n.original);
    if (n.tidied) lines.push("", "Tidied copy:", n.tidied);
    lines.push("");
  }
  res.type("text/plain; charset=utf-8").send(lines.join("\n"));
});

// ── Change / remove (the writer only) ──
async function ownNote(req: AuthRequest, res: Response, next: NextFunction, id: string) {
  const me = req.user?.travelerId;
  const note = await prisma.tripNote.findUnique({ where: { id }, select: { travelerId: true } }).catch(() => null);
  if (!note) { res.status(404).json({ error: "That note isn't here any more." }); return; }
  if (note.travelerId !== me) { res.status(403).json({ error: "Only the person who wrote a note can change it." }); return; }
  next();
}
router.param("id", ownNote);

router.patch("/:id", async (req: AuthRequest, res) => {
  const me = req.user!.travelerId!;
  const id = req.params.id as string;
  const { text, visibility, storyUse, city } = req.body || {};
  const data: Record<string, unknown> = {};
  if (typeof text === "string") {
    if (!text.trim()) { res.status(400).json({ error: "A note can't be empty — to take it away, remove it." }); return; }
    if (text.length > MAX_CHARS) { res.status(400).json({ error: "That's longer than one note can hold — split it in two." }); return; }
    // The original stays as first saved; only the current words change
    data.text = text.replace(/^\s+|\s+$/g, "");
    data.editedAt = new Date();
    data.tidied = null;
    data.tidyStatus = null;
  }
  if (visibility === "private" || visibility === "trip") data.visibility = visibility;
  if (storyUse === null || typeof storyUse === "boolean") data.storyUse = storyUse;
  // What it's about — a place on the trip, "Backroads" or "Japan overall" (Ken, Oct 2); the words stay as they are
  if (typeof city === "string" && city.trim()) data.city = city.trim().slice(0, 80);
  const note = await prisma.tripNote.update({ where: { id }, data });
  // (words changed by hand are as the person wants them — never tidied; confirmation tester k2)
  res.json({ note: shape(note, me) });
});

router.delete("/:id", async (req: AuthRequest, res) => {
  await prisma.tripNote.delete({ where: { id: req.params.id as string } });
  res.json({ removed: true });
});

export default router;
