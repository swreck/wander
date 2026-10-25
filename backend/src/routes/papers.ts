/**
 * Papers kept from the trip (services/papers.ts — Ken, Oct 12 2026).
 *   POST /trip/:tripId          { file: { mediaType, data, name?, thumb? } } → read, filed under its day, kept
 *   GET  /trip/:tripId[?date=]  the papers this person may see, with short-lived links to view them
 *   GET  /file/:id?t=…[&small=1] one paper (or its small copy), by short-lived link — <img> can't send a sign-in
 *   POST /:id/remove            the person who kept it takes it out of sight (nothing is deleted)
 *   POST /:id/share             { share: "me" | "pair" | "group" } — the person who kept it says who sees it
 */
import { Router } from "express";
import jwt from "jsonwebtoken";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { tripMemberParam } from "../middleware/role.js";
import { paperOwnersFor, paperFile, readPaper, keepPaper, tripDays, townName, visibleWhere, shareOf, setPaperShare, paperLink, maySee } from "../services/papers.js";

const router = Router();
const SECRET = process.env.JWT_SECRET || "dev-secret";

// (opened in its own tab, so said as a plain page — the raw {"error": …} showed braces and all; verify21)
const plainPage = (words: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wander</title></head><body style="font:17px -apple-system,system-ui,sans-serif;background:#faf8f5;color:#3a3128;padding:48px 24px;text-align:center"><p>${words}</p></body></html>`;

// ── One paper, by short-lived link ──
router.get("/file/:id", async (req, res) => {
  let who: string | null = null;
  try {
    const payload = jwt.verify(String(req.query.t || ""), SECRET) as any;
    if (payload.paper !== String(req.params.id)) throw new Error("mismatch");
    who = typeof payload.who === "string" ? payload.who : null;
  } catch {
    res.status(403).type("html").send(plainPage("This link doesn't work any more. Open the paper again from Wander."));
    return;
  }
  const p = await prisma.tripPaper.findUnique({ where: { id: String(req.params.id) }, select: { bytes: true, thumb: true, mimeType: true, fileName: true, hidden: true, tripId: true, travelerId: true, share: true } });
  if (!p || p.hidden) { res.status(404).type("html").send(plainPage("This paper was removed from Wander.")); return; }
  // (a link for one person: still theirs to see? — its keeper may have kept it back since)
  if (who && !(await maySee(p, who))) { res.status(403).type("html").send(plainPage("This paper isn't shared with you any more.")); return; }
  const small = req.query.small === "1" && p.thumb;
  res.setHeader("Content-Type", small ? "image/jpeg" : p.mimeType);
  res.setHeader("Cache-Control", "private, max-age=86400");
  if (!small && p.fileName) res.setHeader("Content-Disposition", `inline; filename="${p.fileName.replace(/[^\w.\- ]+/g, "_")}"`);
  res.send(Buffer.from(small ? p.thumb! : p.bytes));
});

router.use(requireAuth);
router.param("tripId", tripMemberParam);

router.post("/trip/:tripId", async (req: AuthRequest, res) => {
  const travelerId = req.user?.travelerId;
  if (!travelerId) { res.status(403).json({ error: "Sign in first." }); return; }
  const file = paperFile(req.body?.file);
  if (typeof file === "string") { res.status(400).json({ error: file }); return; }
  const tripId = String(req.params.tripId);
  const days = await tripDays(tripId);
  const read = await readPaper(file, days);
  // (unread — Wander couldn't make it out — it's still kept, under today's trip day if there is one: the phone's today,
  // not the server's UTC day, which is still yesterday before 9 AM in Japan; verify21)
  const today = typeof req.body?.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.today) ? req.body.today : new Date().toISOString().slice(0, 10);
  const owners = await paperOwnersFor(travelerId);
  // (read, but nothing on it says a day — a welcome sheet, a menu, a temple ticket: the day it was kept, which is the day
  // they were there; six of Ken's 17 papers sat under "No day" by Oct 25)
  const todayOnTrip = days.some((d) => d.date === today) ? today : null;
  const paper = await keepPaper({ tripId, travelerId, authorName: req.user?.displayName || "", file,
    title: read?.title || (file.mediaType === "application/pdf" ? "A PDF" : "A photo"),
    dayDate: read?.date || todayOnTrip,
    summary: read?.summary || "Wander couldn't read this one, so it's kept as it is.", text: read?.text || null });
  // (one like it already kept that day, by them or the one who shares theirs — two photos of the same bill; verify21: by
  // the first word of the title, "Yōyōkaku bill" ~ "Yōyōkaku ryokan bill, Karatsu")
  const first = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).find((w) => w.length >= 4) || "";
  // (…and, when both print an amount, the same amount — two different taxi rides on Oct 12 were called alike; verify22)
  const amounts = (s: string) => new Set((s.match(/[¥￥]\s?[\d,]{3,}|[\d,]{3,}\s?円/g) || []).map((a) => a.replace(/\D/g, "")));
  const sameAmount = (a: string, b: string) => { const x = amounts(a), y = amounts(b); return !x.size || !y.size || [...x].some((n) => y.has(n)); };
  const like = read && paper.dayDate ? (await prisma.tripPaper.findMany({ where: { tripId, hidden: false, dayDate: paper.dayDate, travelerId: { in: owners }, NOT: { id: paper.id } }, select: { title: true, summary: true, authorName: true, travelerId: true } }))
    .find((o) => first(o.title) && first(o.title) === first(paper.title) && sameAmount(o.summary, paper.summary)) : undefined;
  res.json({ paper: { ...paper, town: days.find((d) => d.date === paper.dayDate)?.town || null, read: !!read },
    alsoKept: like ? { by: like.travelerId === travelerId ? "You" : like.authorName, title: like.title } : null });
});

router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const travelerId = req.user?.travelerId;
  if (!travelerId) { res.status(403).json({ error: "Sign in first." }); return; }
  const tripId = String(req.params.tripId);
  const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
  const owners = await paperOwnersFor(travelerId);
  const linkFor = (id: string, small = false) => paperLink(id, small, travelerId);
  const [papers, days] = await Promise.all([
    prisma.tripPaper.findMany({ where: { ...(await visibleWhere(tripId, travelerId)), ...(date ? { dayDate: date } : {}) },
      orderBy: [{ dayDate: "desc" }, { createdAt: "desc" }],
      select: { id: true, title: true, summary: true, dayDate: true, authorName: true, travelerId: true, mimeType: true, createdAt: true, share: true, thumb: false } }),
    prisma.day.findMany({ where: { tripId }, select: { date: true, city: { select: { name: true } } } }),
  ]);
  const withThumb = new Set((await prisma.tripPaper.findMany({ where: { id: { in: papers.map((p) => p.id) }, NOT: { thumb: null } }, select: { id: true } })).map((p) => p.id));
  const town = (d: string | null) => { const day = d && days.find((x) => x.date.toISOString().slice(0, 10) === d); return day ? townName(day.city?.name || "") : null; };
  // (who else sees this person's papers — "Larisa" for Ken, "Ken" for Larisa, nobody for anyone else)
  const partner = owners.length > 1 ? (await prisma.traveler.findMany({ where: { id: { in: owners.filter((o) => o !== travelerId) } }, select: { displayName: true } })).map((t) => t.displayName)[0] || null : null;
  res.json({
    sharedWith: partner,
    papers: papers.map((p) => ({ id: p.id, title: p.title, summary: p.summary, dayDate: p.dayDate, town: town(p.dayDate), authorName: p.authorName,
      mine: p.travelerId === travelerId, pdf: p.mimeType === "application/pdf", createdAt: p.createdAt,
      // (who sees it: a paper of their partner's that they can see is never "me")
      share: shareOf(p.share, p.travelerId === travelerId ? !!partner : true),
      url: linkFor(p.id), smallUrl: withThumb.has(p.id) ? linkFor(p.id, true) : null })),
  });
});

router.post("/:id/share", async (req: AuthRequest, res) => {
  const want = req.body?.share;
  if (want !== "me" && want !== "pair" && want !== "group") { res.status(400).json({ error: "Just you, the two of you, or everyone?" }); return; }
  const r = await setPaperShare(String(req.params.id), req.user?.travelerId || "", want);
  if ("error" in r) { res.status(/kept a paper/.test(r.error) ? 403 : /isn't here/.test(r.error) ? 404 : 400).json({ error: r.error }); return; }
  res.json(r);
});

router.post("/:id/remove", async (req: AuthRequest, res) => {
  const p = await prisma.tripPaper.findUnique({ where: { id: String(req.params.id) }, select: { travelerId: true } });
  if (!p) { res.status(404).json({ error: "That paper isn't here any more." }); return; }
  if (p.travelerId !== req.user?.travelerId) { res.status(403).json({ error: "Only the person who kept a paper can remove it." }); return; }
  await prisma.tripPaper.update({ where: { id: String(req.params.id) }, data: { hidden: true } });
  // (a card about it, if it was shared, goes too)
  await prisma.tripAlert.updateMany({ where: { paperId: String(req.params.id), withdrawnAt: null }, data: { withdrawnAt: new Date() } });
  res.json({ ok: true });
});

export default router;
