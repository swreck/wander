/**
 * Larisa's Guide — API
 *
 * POST /api/guide/import            Upload a snapshot (.xlsx saved from her Google Sheet). Planners only.
 * GET  /api/guide/status/:tripId    The current snapshot: when it was read, what was understood, what changed.
 * GET  /api/guide/items/:tripId     Dated/timed facts from the Guide (optionally ?date=YYYY-MM-DD).
 * GET  /api/guide/pictures/:tripId  Pictures pasted into the Guide, with short-lived links to view them.
 * GET  /api/guide/picture/:tripId/:sha?t=...  One picture (link from the list above).
 *
 * Wander only reads snapshots here; nothing is ever written back to the sheet.
 */

import { Router } from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getUserRole } from "../middleware/role.js";
import { importGuideSnapshot } from "../services/guide/importSnapshot.js";
import { sheetLinkOf, otherSheetLinks } from "../services/guide/sheetLink.js";
import { guideLinksByDay } from "../services/guide/appleGuides.js";
import { currentSummaries } from "../services/guide/daySummaries.js";
import { tabsOfCopy, cellsOfItem, completeCells, spotsOf } from "../services/guide/sources.js";
import { withoutFinancialDetails, holdsPersonalNumbers } from "../services/sources/filter.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const PICTURE_SECRET = process.env.JWT_SECRET || "dev-secret";

// ── One picture, by short-lived link (no auth header: <img> tags can't send one) ──
router.get("/picture/:tripId/:sha", async (req, res) => {
  try {
    const payload = jwt.verify(String(req.query.t || ""), PICTURE_SECRET) as any;
    if (payload.picture !== `${req.params.tripId}:${req.params.sha}`) throw new Error("mismatch");
  } catch {
    res.status(403).json({ error: "This picture link has expired. Reopen the page to see it." });
    return;
  }
  const img = await prisma.guideImage.findUnique({
    where: { tripId_sha256: { tripId: req.params.tripId, sha256: req.params.sha } },
    select: { bytes: true, mimeType: true, transcription: true },
  });
  if (!img) { res.status(404).json({ error: "Picture not found" }); return; }
  // Someone's own travel numbers are in it (Known Traveler, eTicket…): never shown in Wander — it's in her sheet (Oct 4)
  if (holdsPersonalNumbers(img.transcription)) { res.status(404).json({ error: "This picture holds personal numbers, so Wander doesn't show it." }); return; }
  res.setHeader("Content-Type", img.mimeType);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(Buffer.from(img.bytes));
});

router.use(requireAuth);

async function isMember(req: AuthRequest, tripId: string) {
  if (!req.user?.travelerId) return false;
  return !!(await getUserRole(req.user.travelerId, tripId));
}

// ── Import a snapshot ──
router.post("/import", upload.single("file"), async (req: AuthRequest, res) => {
  const file = (req as any).file as { buffer: Buffer; originalname: string } | undefined;
  if (!file) { res.status(400).json({ error: "Choose the Excel file you saved from Larisa's Guide." }); return; }
  if (!/\.xlsx$/i.test(file.originalname)) { res.status(400).json({ error: "That isn't an Excel file. In Google Sheets: File → Download → Microsoft Excel (.xlsx)." }); return; }
  const tripId = (req.body?.tripId as string) || undefined;
  if (!req.user?.travelerId) { res.status(403).json({ error: "Sign in first." }); return; }
  if (tripId) {
    if ((await getUserRole(req.user.travelerId, tripId)) !== "planner") {
      res.status(403).json({ error: "Only the trip's planners can bring in a new version of the Guide." });
      return;
    }
  } else {
    const plannerSomewhere = await prisma.tripMember.findFirst({ where: { travelerId: req.user.travelerId, role: { in: ["planner", "owner"] } } });
    if (!plannerSomewhere) { res.status(403).json({ error: "Only planners can start a trip from the Guide." }); return; }
  }
  try {
    const report = await importGuideSnapshot({
      buffer: file.buffer, sourceName: file.originalname, importedBy: req.user.displayName, tripId, tripName: req.body?.tripName,
    });
    res.status(report.accepted ? 200 : 422).json(report);
  } catch (err: any) {
    console.error("[guide] import failed:", err.message);
    res.status(500).json({ error: "That version didn't come in. Wander is still showing the previous one." });
  }
});

// ── Current snapshot status ──
router.get("/status/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!(await isMember(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const current = await prisma.guideSnapshot.findFirst({
    where: { tripId, status: "current" }, orderBy: { importedAt: "desc" },
    select: { id: true, sourceName: true, importedAt: true, importedBy: true, report: true },
  });
  const lastRejected = await prisma.guideSnapshot.findFirst({
    where: { tripId, status: "rejected" }, orderBy: { importedAt: "desc" },
    select: { sourceName: true, importedAt: true, report: true },
  });
  res.json({ current, lastRejected: lastRejected && current && lastRejected.importedAt > current.importedAt ? lastRejected : null });
});

// ── Dated facts ──
router.get("/items/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!(await isMember(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
  const items = await prisma.guideItem.findMany({
    where: { tripId, ...(date ? { date: new Date(`${date}T00:00:00Z`) } : {}) },
    orderBy: [{ date: "asc" }, { time: "asc" }, { sortOrder: "asc" }],
  });
  // Her cells' words travel with Scout's answers ("Sources"), not with every screen's download (103 KB, not 222) —
  // only where each line is in her sheet: its tabs and cell addresses, so a day screen can open that spot (round 16:
  // settling "your tabs differ" was a reason to open the sheet instead). Completed as Scout's lines are (sources.ts).
  const snap = await prisma.guideSnapshot.findFirst({ where: { tripId, status: "current" }, orderBy: { importedAt: "desc" }, select: { id: true } });
  const tabs = snap ? await tabsOfCopy(snap.id) : [];
  res.json(items.map(({ cells, ...i }) => ({ ...i, spots: spotsOf(completeCells(`${i.title}\n${i.detail || ""}`, cellsOfItem({ cells, sourceRef: i.sourceRef }, tabs), tabs, i.source)) })));
});

// ── Her words, every tab, for "Find in your Guide" (round 16: finding where she wrote a word was a reason to open the
// sheet — its Find jumps to the cell). Searched on the phone, so it works with no signal once read. Each cell's words
// (card numbers left out), what Wander read from each picture (its summary and its words, card numbers masked), and
// the trip day a cell belongs to, when a line of a day comes from it. ──
router.get("/words/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!(await isMember(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const snap = await prisma.guideSnapshot.findFirst({ where: { tripId, status: "current" }, orderBy: { importedAt: "desc" }, select: { id: true } });
  if (!snap) { res.json({ tabs: [], pictures: [], dayOf: {} }); return; }
  const tabs = await tabsOfCopy(snap.id);
  // (each picture's summary and all its words — Oct 2, Ken: everything in her sheet is data; card numbers masked as in
  // her cells, which already hold her pasted booking emails in full)
  const images = await prisma.guideImage.findMany({ where: { tripId }, select: { sha256: true, facts: true, transcription: true } });
  const summaryOf = new Map(images.map((i) => [i.sha256, [String((i.facts as any)?.summary || ""), withoutFinancialDetails(i.transcription || "")].filter(Boolean).join("\n")]));
  const items = await prisma.guideItem.findMany({ where: { tripId, date: { not: null } }, select: { date: true, kind: true, title: true, detail: true, source: true, cells: true, sourceRef: true } });
  const dayOf: Record<string, string> = {};
  // The day a cell is lived: a booking's email belongs to the dinner (Oct 17), not to its cancel-by date (Oct 9) — a
  // deadline's day is used only for a cell nothing else is on (round 16: Andy's "allium" find said Fri, Oct 9)
  for (const pass of ["day", "deadline"] as const) {
    for (const i of items.filter((x) => (x.kind === "deadline") === (pass === "deadline"))) {
      const day = i.date!.toISOString().slice(0, 10);
      for (const s of spotsOf(completeCells(`${i.title}\n${i.detail || ""}`, cellsOfItem(i, tabs), tabs, i.source))) {
        for (const a1 of s.a1s) {
          const k = `${s.tab}!${a1}`;
          if (pass === "deadline" ? !dayOf[k] : !dayOf[k] || day < dayOf[k]) dayOf[k] = day;
        }
      }
    }
  }
  res.json({
    tabs: tabs.map((t) => ({ name: t.name, cells: t.cells.filter((c) => c.text?.trim()).map((c) => [c.a1, withoutFinancialDetails(c.text)]) })),
    pictures: tabs.flatMap((t) => t.images.map((p) => ({ tab: t.name, anchor: p.anchor, sha256: p.sha256, text: summaryOf.get(p.sha256) || "" }))).filter((p) => p.text),
    dayOf,
  });
});

// ── Pictures, with short-lived links ──
router.get("/pictures/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!(await isMember(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const current = await prisma.guideSnapshot.findFirst({ where: { tripId, status: "current" }, orderBy: { importedAt: "desc" }, select: { tabs: true } });
  const images = await prisma.guideImage.findMany({ where: { tripId }, select: { sha256: true, readStatus: true, facts: true, transcription: true } });
  const bySha = new Map(images.map((i) => [i.sha256, i]));
  const tabs = ((current?.tabs as any[]) || []).filter((t) => t.images?.length);
  res.json(tabs.map((t) => ({
    tab: t.name,
    pictures: t.images.map((p: { anchor: string; sha256: string }) => {
      const img = bySha.get(p.sha256);
      const token = jwt.sign({ picture: `${tripId}:${p.sha256}` }, PICTURE_SECRET, { expiresIn: "10m" });
      // (someone's own travel numbers in it: no link — the phone says it's in her sheet)
      const personal = holdsPersonalNumbers(img?.transcription);
      return {
        anchor: p.anchor,
        // (which picture — the day screen asks for a fresh link on a tap: "See her map from this tab", Oct 2)
        sha256: p.sha256,
        url: personal ? null : `/api/guide/picture/${tripId}/${p.sha256}?t=${token}`,
        personal,
        summary: (img?.facts as any)?.summary || null,
        read: img?.readStatus === "read",
      };
    }),
  })));
});

// ── A fresh link to one picture — "See the picture" under a Scout answer's Sources ──
router.get("/picture-link/:tripId/:sha", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  const sha = req.params.sha as string;
  if (!(await isMember(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const img = await prisma.guideImage.findUnique({ where: { tripId_sha256: { tripId, sha256: sha } }, select: { sha256: true, transcription: true } });
  if (!img) { res.status(404).json({ error: "That picture isn't in the Guide Wander has now." }); return; }
  if (holdsPersonalNumbers(img.transcription)) { res.json({ url: null, personal: true }); return; }
  const token = jwt.sign({ picture: `${tripId}:${sha}` }, PICTURE_SECRET, { expiresIn: "10m" });
  res.json({ url: `/api/guide/picture/${tripId}/${sha}?t=${token}` });
});

// ── Her sheet's address and tab ids — "Open at this spot in her sheet" under a Scout answer's Sources ──
// (null when Wander has none; the phone opens it, Google decides who may see it — Wander never reaches it)
router.get("/sheet-link/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!(await isMember(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  const [link, others] = await Promise.all([sheetLinkOf(tripId), otherSheetLinks(tripId)]);
  res.json({ link, others });
});

// ── Each day's summary, while it still matches the day (daySummaries.ts) ──
router.get("/day-summaries/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!(await isMember(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  res.json({ byDay: await currentSummaries(tripId) });
});

// ── Her Apple Maps guides, by the day each is for — "Her Apple Maps guide for the day ↗" (appleGuides.ts) ──
router.get("/apple-guides/:tripId", async (req: AuthRequest, res) => {
  const tripId = req.params.tripId as string;
  if (!(await isMember(req, tripId))) { res.status(403).json({ error: "Not a member of this trip" }); return; }
  res.json({ byDay: await guideLinksByDay(tripId) });
});

export default router;
