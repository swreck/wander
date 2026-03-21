import { Router } from "express";
import prisma from "../services/db.js";
import { logChange } from "../services/changeLog.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Get active voting sessions for a trip
router.get("/trip/:tripId", async (req: AuthRequest, res) => {
  const sessions = await prisma.votingSession.findMany({
    where: { tripId: req.params.tripId as string, status: "open" },
    include: { votes: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(sessions);
});

// Get a specific session with results
router.get("/:id", async (req: AuthRequest, res) => {
  const session = await prisma.votingSession.findUnique({
    where: { id: req.params.id as string },
    include: { votes: true },
  });
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  // Tally results
  const options = session.options as any[];
  const results = options.map((opt: any, i: number) => {
    const votes = session.votes.filter((v) => v.optionIndex === i);
    return {
      ...opt,
      yes: votes.filter((v) => v.preference === "yes").length,
      maybe: votes.filter((v) => v.preference === "maybe").length,
      no: votes.filter((v) => v.preference === "no").length,
      voters: votes.map((v) => ({ userCode: v.userCode, preference: v.preference })),
    };
  });

  res.json({ ...session, results });
});

// Create a voting session
router.post("/", async (req: AuthRequest, res) => {
  const { tripId, question, options } = req.body;
  if (!tripId || !question || !options?.length) {
    res.status(400).json({ error: "tripId, question, and options are required" });
    return;
  }

  const session = await prisma.votingSession.create({
    data: {
      tripId,
      question,
      options,
      createdBy: req.user!.code,
    },
  });

  await logChange({
    user: req.user!,
    tripId,
    actionType: "vote_created",
    entityType: "voting_session",
    entityId: session.id,
    entityName: question,
    description: `${req.user!.displayName} started a vote: "${question}"`,
    newState: session,
  });

  res.status(201).json(session);
});

// Cast votes (upsert — can change your mind)
router.post("/:id/vote", async (req: AuthRequest, res) => {
  const { votes } = req.body; // [{optionIndex: 0, preference: "yes"}, ...]
  if (!votes?.length) { res.status(400).json({ error: "votes array required" }); return; }

  const session = await prisma.votingSession.findUnique({ where: { id: req.params.id as string } });
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (session.status !== "open") { res.status(400).json({ error: "Voting is closed" }); return; }

  for (const v of votes) {
    if (!["yes", "maybe", "no"].includes(v.preference)) continue;
    await prisma.vote.upsert({
      where: {
        sessionId_userCode_optionIndex: {
          sessionId: session.id,
          userCode: req.user!.code,
          optionIndex: v.optionIndex,
        },
      },
      update: { preference: v.preference },
      create: {
        sessionId: session.id,
        userCode: req.user!.code,
        optionIndex: v.optionIndex,
        preference: v.preference,
      },
    });
  }

  res.json({ voted: true });
});

// Close a voting session
router.post("/:id/close", async (req: AuthRequest, res) => {
  const session = await prisma.votingSession.findUnique({ where: { id: req.params.id as string } });
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  await prisma.votingSession.update({
    where: { id: session.id },
    data: { status: "closed", closedAt: new Date() },
  });

  res.json({ closed: true });
});

export default router;
