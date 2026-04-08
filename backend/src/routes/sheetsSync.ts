/**
 * Sheet Sync API Routes
 *
 * POST /api/sheets-sync/import     — Initial import from spreadsheet → new trip
 * POST /api/sheets-sync/pull       — Pull spreadsheet changes → update Wander DB
 * POST /api/sheets-sync/push       — Push Wander changes → update spreadsheet
 * GET  /api/sheets-sync/status     — Sync status for current trip
 * GET  /api/sheets-sync/conflicts  — Recent conflict log
 * PATCH /api/sheets-sync/config    — Update sync settings (interval, spreadsheet ID)
 */

import { Router } from "express";
import prisma from "../services/db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getUserRole } from "../middleware/role.js";
import { importFromSpreadsheet } from "../services/sheetImport.js";
import {
  readSpreadsheet,
  findBestMatch,
  writeToSheet,
  appendToSheet,
  tintCells,
  createVersionSnapshot,
} from "../services/sheetsSync.js";

const router = Router();
router.use(requireAuth);

// ── POST /import — Create new trip from spreadsheet ──────────
router.post("/import", async (req: AuthRequest, res) => {
  try {
    const { spreadsheetId } = req.body;
    if (!spreadsheetId) {
      res.status(400).json({ error: "spreadsheetId is required" });
      return;
    }

    const result = await importFromSpreadsheet(spreadsheetId, req.user!.code);
    res.json(result);
  } catch (err: any) {
    console.error("[sheets-sync] Import failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /pull — Sync spreadsheet → Wander ──────────────────
router.post("/pull", async (req: AuthRequest, res) => {
  try {
    const { tripId } = req.body;
    if (!tripId) {
      res.status(400).json({ error: "tripId is required" });
      return;
    }

    // Verify planner role
    if (req.user?.travelerId) {
      const role = await getUserRole(req.user.travelerId, tripId);
      if (role !== "planner") {
        res.status(403).json({ error: "Only planners can sync" });
        return;
      }
    }

    const config = await prisma.sheetSyncConfig.findUnique({
      where: { tripId },
    });
    if (!config) {
      res.status(404).json({ error: "No sync config for this trip" });
      return;
    }

    // Safety net: pin the current revision before modifying anything
    const snapshotId = await createVersionSnapshot(
      config.spreadsheetId,
      `Pre-pull ${new Date().toISOString()}`,
    );

    const data = await readSpreadsheet(config.spreadsheetId);
    const conflicts: any[] = [];
    let updatedCount = 0;
    let addedCount = 0;

    // Get existing experiences for this trip
    const existingExps = await prisma.experience.findMany({
      where: { tripId, decisionId: null }, // Skip decision options
      include: { city: true },
    });

    const existingNames = existingExps.map(e => e.name);

    // Sync activities
    for (const act of data.activities) {
      const cityId = await findCityByName(tripId, act.city);
      if (!cityId) continue;

      // Try to find existing experience by fuzzy name match
      const match = findBestMatch(act.name, existingNames);
      if (match) {
        // Existing experience — check for updates
        const existing = existingExps.find(e => e.name === match)!;
        const updates: any = {};

        // URL update (spreadsheet wins)
        if (act.url && act.url !== existing.sourceUrl) {
          updates.sourceUrl = act.url;
          if (existing.sourceUrl) {
            conflicts.push({
              field: "sourceUrl",
              entity: existing.name,
              wanderValue: existing.sourceUrl,
              sheetValue: act.url,
              resolution: "spreadsheet wins",
            });
          }
        }

        // Neighborhood update
        if (act.neighborhood && act.neighborhood !== existing.explorationZoneAssociation) {
          updates.explorationZoneAssociation = act.neighborhood;
        }

        if (Object.keys(updates).length > 0) {
          await prisma.experience.update({
            where: { id: existing.id },
            data: updates,
          });
          updatedCount++;
        }

        // Sync interests
        await syncInterests(existing.id, tripId, act.interests);
      } else {
        // New activity from spreadsheet
        const exp = await prisma.experience.create({
          data: {
            tripId,
            cityId,
            name: act.name,
            description: act.comment || null,
            sourceUrl: act.url || null,
            createdBy: "Larisa",
            state: "possible",
            explorationZoneAssociation: act.neighborhood || null,
          },
        });
        addedCount++;

        // Create interests
        await syncInterests(exp.id, tripId, act.interests);
      }
    }

    // Sync hotel decisions (check for new hotels or vote changes)
    const decisions = await prisma.decision.findMany({
      where: { tripId, status: "open" },
      include: { options: true, votes: true },
    });

    for (const decision of decisions) {
      const isTokyoDecision = decision.title.toLowerCase().includes("tokyo");
      const hotels = isTokyoDecision ? data.tokyoHotels : data.kyotoHotels;

      for (const hotel of hotels) {
        const existingOption = decision.options.find(
          o => findBestMatch(hotel.name, [o.name]) !== null
        );

        if (!existingOption) {
          // New hotel option
          await prisma.experience.create({
            data: {
              tripId,
              cityId: decision.cityId,
              name: hotel.name,
              description: buildHotelDescription(hotel),
              sourceUrl: hotel.url || null,
              createdBy: "Larisa",
              state: "voting",
              decisionId: decision.id,
            },
          });
          addedCount++;
        }

        // Sync votes
        const voteMap = [
          { code: "Julie", rank: hotel.votes.julie },
          { code: "Larisa", rank: hotel.votes.larisa },
          { code: "Ken", rank: hotel.votes.ken },
          { code: "Andy", rank: hotel.votes.andy },
        ];

        for (const ve of voteMap) {
          if (!ve.rank || !["1", "2", "3"].includes(ve.rank.trim())) continue;
          const optionId = existingOption?.id;
          if (!optionId) continue;

          const existingVote = decision.votes.find(v => v.userCode === ve.code);
          if (!existingVote) {
            await prisma.decisionVote.create({
              data: {
                decisionId: decision.id,
                optionId,
                userCode: ve.code,
                displayName: ve.code,
              },
            });
          }
        }
      }
    }

    // Sync date-column assignments from Guide → Wander
    // When Larisa puts a ✓ in a date column, assign that activity to that day
    let dateAssignmentCount = 0;
    for (const act of data.activities) {
      for (const da of act.dateAssignments) {
        if (!da.assigned) continue;

        // Find the experience in Wander
        const match = findBestMatch(act.name, existingNames);
        if (!match) continue;
        const exp = existingExps.find(e => e.name === match);
        if (!exp || exp.state === "selected") continue; // Already assigned, skip

        // Find the day for this date
        const dateStart = new Date(da.date + "T00:00:00Z");
        const dateEnd = new Date(da.date + "T23:59:59Z");
        const day = await prisma.day.findFirst({
          where: { tripId, date: { gte: dateStart, lte: dateEnd } },
        });
        if (!day) continue;

        await prisma.experience.update({
          where: { id: exp.id },
          data: { state: "selected", dayId: day.id },
        });
        dateAssignmentCount++;
      }
    }
    if (dateAssignmentCount > 0) {
      addedCount += dateAssignmentCount;
    }

    // Update sync config
    await prisma.sheetSyncConfig.update({
      where: { tripId },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: conflicts.length > 0 ? "conflict" : "success",
      },
    });

    // Log the sync
    await prisma.$executeRawUnsafe(`
      INSERT INTO sheet_sync_logs (id, trip_id, direction, status, summary, conflicts, details, created_at)
      VALUES (gen_random_uuid(), $1, 'pull', $2, $3, $4::jsonb, $5::jsonb, NOW())
    `,
      tripId,
      conflicts.length > 0 ? "conflict" : "success",
      `Pull: ${addedCount} added, ${updatedCount} updated, ${conflicts.length} conflicts`,
      JSON.stringify(conflicts),
      JSON.stringify({ addedCount, updatedCount }),
    );

    res.json({
      added: addedCount,
      updated: updatedCount,
      conflicts,
      summary: `Pull complete: ${addedCount} added, ${updatedCount} updated, ${conflicts.length} conflicts`,
    });
  } catch (err: any) {
    console.error("[sheets-sync] Pull failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /push — Sync Wander → spreadsheet ──────────────────
router.post("/push", async (req: AuthRequest, res) => {
  try {
    const { tripId } = req.body;
    if (!tripId) {
      res.status(400).json({ error: "tripId is required" });
      return;
    }

    if (req.user?.travelerId) {
      const role = await getUserRole(req.user.travelerId, tripId);
      if (role !== "planner") {
        res.status(403).json({ error: "Only planners can sync" });
        return;
      }
    }

    const config = await prisma.sheetSyncConfig.findUnique({
      where: { tripId },
    });
    if (!config) {
      res.status(404).json({ error: "No sync config for this trip" });
      return;
    }

    // Safety net: pin revision before writing
    await createVersionSnapshot(config.spreadsheetId, `Pre-push ${new Date().toISOString()}`);

    // Read current spreadsheet state
    const sheetData = await readSpreadsheet(config.spreadsheetId);

    // Get Wander experiences not in spreadsheet
    const wanderExps = await prisma.experience.findMany({
      where: { tripId, decisionId: null },
      include: { city: true, interests: true },
    });

    const sheetActivityNames = sheetData.activities.map(a => a.name);
    let pushedCount = 0;

    // Find activities tab name
    const tabMappings = config.tabMappings as any;
    const activitiesTabName = tabMappings?.activitiesTab || "Activities Template";

    // Build a map of city → last activity row in the spreadsheet for correct section placement
    const rawActivities = sheetData.rawTabData[activitiesTabName] || [];
    const citySectionLastRow = new Map<string, number>();
    let currentSection = "Tokyo";
    for (let i = 0; i < rawActivities.length; i++) {
      const sectionHeader = (rawActivities[i]?.[4] || "").trim();
      if (sectionHeader && sectionHeader.includes(" - ")) {
        currentSection = sectionHeader.split(" - ")[0].trim();
      }
      const name = (rawActivities[i]?.[5] || "").trim();
      if (name) {
        citySectionLastRow.set(currentSection, i);
      }
    }

    for (const exp of wanderExps) {
      const match = findBestMatch(exp.name, sheetActivityNames);
      if (match) continue; // Already in spreadsheet

      const julie = (exp as any).interests?.some((i: any) => i.userCode === "Julie") ? "X" : "";
      const andy = (exp as any).interests?.some((i: any) => i.userCode === "Andy") ? "X" : "";
      const larisa = (exp as any).interests?.some((i: any) => i.userCode === "Larisa") ? "X" : "";
      const ken = (exp as any).interests?.some((i: any) => i.userCode === "Ken") ? "X" : "";

      const row = [julie, andy, larisa, ken, "", exp.name, exp.explorationZoneAssociation || "", exp.userNotes || exp.description || "", exp.sourceUrl || ""];

      // Find the right section based on city name
      const cityName = exp.city?.name || "Tokyo";
      const sectionCity = cityName.includes("Kyoto") ? "Kyoto"
        : cityName.includes("Osaka") ? "Osaka"
        : "Tokyo"; // Default to Tokyo for other cities

      // Append after the last activity in that city's section
      // For now, append at end — section-aware insertion requires sheet row manipulation
      // which is complex. The parser will re-detect sections on next pull.
      await appendToSheet(config.spreadsheetId, `'${activitiesTabName}'`, [row]);
      pushedCount++;

      // Update the sheetRowRef on the experience
      const lastRow = rawActivities.length + pushedCount;
      await prisma.experience.update({
        where: { id: exp.id },
        data: { sheetRowRef: `${activitiesTabName}:${lastRow}` },
      });

      // Tint the row with Wander origin color
      try {
        await tintCells(config.spreadsheetId, activitiesTabName, lastRow - 1, 0, lastRow, 9);
      } catch { /* tinting is best-effort */ }
    }

    // Push hotel votes back to spreadsheet
    const decisions = await prisma.decision.findMany({
      where: { tripId, status: "open" },
      include: { options: true, votes: true },
    });

    let votesUpdated = 0;
    for (const decision of decisions) {
      const isTokyoDecision = decision.title.toLowerCase().includes("tokyo");
      const tabName = isTokyoDecision
        ? (tabMappings?.tokyoHotelTab || "Tokyo Hotel Template")
        : (tabMappings?.kyotoHotelTab || "Kyoto Hotel Template");
      const sheetHotels = isTokyoDecision ? sheetData.tokyoHotels : sheetData.kyotoHotels;

      // Find the header row to know where data starts
      const rawRows = sheetData.rawTabData[tabName] || [];
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
        if ((rawRows[i]?.[16] || "").toLowerCase().includes("hotel")) {
          headerRowIdx = i;
          break;
        }
      }
      if (headerRowIdx === -1) continue;

      for (let hi = 0; hi < sheetHotels.length; hi++) {
        const sheetHotel = sheetHotels[hi];
        const option = decision.options.find(
          o => findBestMatch(sheetHotel.name, [o.name]) !== null
        );
        if (!option) continue;

        // Check if any votes for this option exist in Wander but not in sheet
        const optionVotes = decision.votes.filter(v => v.optionId === option.id);
        const rowIdx = headerRowIdx + 1 + hi; // 1-based for sheets API

        for (const vote of optionVotes) {
          const colIdx = vote.userCode === "Julie" ? 11
            : vote.userCode === "Larisa" ? 12
            : vote.userCode === "Ken" ? 13
            : vote.userCode === "Andy" ? 14
            : -1;
          if (colIdx === -1) continue;

          // Check if sheet already has this vote
          const existingRank = vote.userCode === "Julie" ? sheetHotel.votes.julie
            : vote.userCode === "Larisa" ? sheetHotel.votes.larisa
            : vote.userCode === "Ken" ? sheetHotel.votes.ken
            : sheetHotel.votes.andy;

          if (!existingRank) {
            // Write "1" as rank (Wander votes don't have rank differentiation)
            const colLetter = String.fromCharCode(65 + colIdx); // L, M, N, O
            const sheetRow = rowIdx + 1; // 1-indexed
            const range = `'${tabName}'!${colLetter}${sheetRow}`;
            await writeToSheet(config.spreadsheetId, range, [["1"]]);
            votesUpdated++;

            // Tint the vote cell
            try {
              await tintCells(config.spreadsheetId, tabName, rowIdx, colIdx, rowIdx + 1, colIdx + 1);
            } catch { /* tinting is best-effort */ }
          }
        }
      }
    }

    // Update sync config
    await prisma.sheetSyncConfig.update({
      where: { tripId },
      data: { lastSyncAt: new Date(), lastSyncStatus: "success" },
    });

    res.json({
      pushed: pushedCount,
      votesUpdated,
      summary: `Push complete: ${pushedCount} activities, ${votesUpdated} votes written to spreadsheet`,
    });
  } catch (err: any) {
    console.error("[sheets-sync] Push failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /status — Current sync status ────────────────────────
router.get("/status/:tripId", async (req: AuthRequest, res) => {
  try {
    const tripId = req.params.tripId as string;
    const config = await prisma.sheetSyncConfig.findUnique({
      where: { tripId },
    });

    if (!config) {
      res.json({ configured: false });
      return;
    }

    res.json({
      configured: true,
      spreadsheetId: config.spreadsheetId,
      syncIntervalMs: config.syncIntervalMs,
      lastSyncAt: config.lastSyncAt,
      lastSyncStatus: config.lastSyncStatus,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /conflicts — Recent conflict log ─────────────────────
router.get("/conflicts/:tripId", async (req: AuthRequest, res) => {
  try {
    const tripId = req.params.tripId as string;
    const logs = await prisma.$queryRawUnsafe(`
      SELECT * FROM sheet_sync_logs
      WHERE trip_id = $1 AND status = 'conflict'
      ORDER BY created_at DESC
      LIMIT 20
    `, tripId) as any[];

    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /config — Update sync settings ─────────────────────
router.patch("/config", async (req: AuthRequest, res) => {
  try {
    const { tripId, spreadsheetId, syncIntervalMs } = req.body;
    if (!tripId) {
      res.status(400).json({ error: "tripId is required" });
      return;
    }

    if (req.user?.travelerId) {
      const role = await getUserRole(req.user.travelerId, tripId);
      if (role !== "planner") {
        res.status(403).json({ error: "Only planners can change sync settings" });
        return;
      }
    }

    const config = await prisma.sheetSyncConfig.upsert({
      where: { tripId },
      create: {
        tripId,
        spreadsheetId: spreadsheetId || "",
        syncIntervalMs: syncIntervalMs ?? 0,
      },
      update: {
        ...(spreadsheetId !== undefined && { spreadsheetId }),
        ...(syncIntervalMs !== undefined && { syncIntervalMs }),
      },
    });

    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ──────────────────────────────────────────────────

async function findCityByName(tripId: string, cityName: string): Promise<string | null> {
  const cities = await prisma.city.findMany({
    where: { tripId },
    select: { id: true, name: true },
  });

  const lower = cityName.toLowerCase();
  // Exact match
  const exact = cities.find(c => c.name.toLowerCase() === lower);
  if (exact) return exact.id;

  // Partial match
  const partial = cities.find(c =>
    c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())
  );
  if (partial) return partial.id;

  return null;
}

async function syncInterests(
  experienceId: string,
  tripId: string,
  interests: { julie: boolean; andy: boolean; larisa: boolean; ken: boolean },
) {
  const entries = [
    { code: "Julie", name: "Julie", interested: interests.julie },
    { code: "Andy", name: "Andy", interested: interests.andy },
    { code: "Larisa", name: "Larisa", interested: interests.larisa },
    { code: "Ken", name: "Ken", interested: interests.ken },
  ];

  for (const entry of entries) {
    if (!entry.interested) continue;

    const existing = await prisma.experienceInterest.findUnique({
      where: { experienceId_userCode: { experienceId, userCode: entry.code } },
    });
    if (!existing) {
      await prisma.experienceInterest.create({
        data: {
          experienceId,
          tripId,
          userCode: entry.code,
          displayName: entry.name,
        },
      });
    }
  }
}

function buildHotelDescription(hotel: any): string {
  const parts: string[] = [];
  if (hotel.location) parts.push(`Location: ${hotel.location}`);
  if (hotel.rating) parts.push(`Rating: ${hotel.rating}`);
  if (hotel.sqFootage) parts.push(`Size: ${hotel.sqFootage}`);
  if (hotel.dailyRate) parts.push(`${hotel.dailyRate}/night`);
  if (hotel.totalCost) parts.push(`Total: ${hotel.totalCost}`);
  if (hotel.otherCriteria) parts.push(hotel.otherCriteria);
  if (hotel.aiNotes) parts.push(hotel.aiNotes);
  return parts.join("\n") || "";
}

export default router;
