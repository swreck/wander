/**
 * Votes on a group decision: someone's top picks (ranks 1–3), or "happy with any" (one vote with no option).
 *
 * Shared by POST /api/decisions/:id/vote and Scout's cast_decision_vote, so both behave the same. A new set
 * of votes replaces the person's old ones in one step: a pick that isn't one of this decision's choices
 * changes nothing (it once wiped the old votes and then failed with a server error), and "happy with any"
 * is kept as a vote (the app said "Got it — you're flexible" and then saved nothing).
 */

import prisma from "./db.js";

export interface VotePick { optionId: string | null; rank: number }

export type VoteOutcome =
  | { ok: true; votes: Awaited<ReturnType<typeof prisma.decisionVote.create>>[] }
  | { ok: false; status: 400 | 403 | 404; error: string };

export const NOT_A_CHOICE = "That isn't one of the choices for this decision.";

/** Picks as sent: ranks 1–3 only, each rank and each option once (the first one wins) */
function cleanPicks(picks: VotePick[]): VotePick[] {
  const ranks = new Set<number>();
  const options = new Set<string>();
  const out: VotePick[] = [];
  for (const p of picks) {
    if (!Number.isInteger(p.rank) || p.rank < 1 || p.rank > 3 || ranks.has(p.rank)) continue;
    if (p.optionId !== null && options.has(p.optionId)) continue;
    ranks.add(p.rank);
    if (p.optionId !== null) options.add(p.optionId);
    out.push(p);
  }
  return out;
}

export async function setDecisionVotes(
  decisionId: string,
  voter: { code: string; displayName: string; travelerId: string | null },
  picks: VotePick[],
): Promise<VoteOutcome> {
  const decision = await prisma.decision.findUnique({ where: { id: decisionId }, select: { status: true, tripId: true } });
  if (!decision) return { ok: false, status: 404, error: "Decision not found" };
  // Trips are private to their people: a traveler votes only on their own trips' decisions (a secret-code
  // sign-in has no traveler identity and isn't limited, the same as GET /api/trips/:id)
  if (voter.travelerId && !(await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId: decision.tripId, travelerId: voter.travelerId } } }))) {
    return { ok: false, status: 403, error: "That trip isn't one of yours." };
  }
  if (decision.status !== "open") return { ok: false, status: 400, error: "Decision is already resolved" };

  const clean = cleanPicks(picks);
  const optionIds = clean.map((p) => p.optionId).filter((id): id is string => id !== null);
  if (optionIds.length) {
    const found = await prisma.experience.count({ where: { id: { in: optionIds }, decisionId } });
    if (found !== optionIds.length) return { ok: false, status: 400, error: NOT_A_CHOICE };
  }

  const votes = await prisma.$transaction(async (tx) => {
    await tx.decisionVote.deleteMany({ where: { decisionId, userCode: voter.code } });
    const made = [];
    for (const p of clean) {
      made.push(await tx.decisionVote.create({
        data: { decisionId, optionId: p.optionId, userCode: voter.code, displayName: voter.displayName, rank: p.rank },
      }));
    }
    return made;
  });
  return { ok: true, votes };
}
