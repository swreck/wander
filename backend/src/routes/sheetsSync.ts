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
import type { TransportMode } from "@prisma/client";

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

    // Sync planning actions from Guide → Wander
    // Status derivation: group actions ("Both") are done only when BOTH per-person
    // statuses say "DONE". Single-owner actions use that owner's status.
    const deriveStatus = (a: typeof data.actions[0]): string => {
      const andyDone = a.andyStatus?.toLowerCase().trim() === "done";
      const larisaDone = a.larisaStatus?.toLowerCase().trim() === "done";
      const owner = a.owner.toLowerCase();
      if (owner === "lf" || owner === "larisa") return larisaDone ? "done" : "open";
      if (owner === "ja" || owner === "andy") return andyDone ? "done" : "open";
      if (andyDone && larisaDone) return "done";
      return a.notes?.toLowerCase().includes("done") ? "done" : "open";
    };

    for (const act of data.actions) {
      const existing = await prisma.planningAction.findFirst({
        where: { tripId, sheetRowRef: act.sheetRowRef },
      });

      const derivedStatus = deriveStatus(act);

      if (existing) {
        const needsUpdate = existing.action !== act.action
          || existing.owner !== act.owner
          || existing.dueDate !== act.dueDate
          || existing.notes !== act.notes
          || existing.andyStatus !== act.andyStatus
          || existing.larisaStatus !== act.larisaStatus
          || existing.statusNotes !== act.statusNotes
          || existing.status !== derivedStatus;

        if (needsUpdate) {
          await prisma.planningAction.update({
            where: { id: existing.id },
            data: {
              action: act.action,
              owner: act.owner,
              dueDate: act.dueDate,
              notes: act.notes,
              andyStatus: act.andyStatus,
              larisaStatus: act.larisaStatus,
              statusNotes: act.statusNotes,
              status: derivedStatus,
            },
          });
          updatedCount++;
        }
      } else {
        // Check by action name (fuzzy) in case sheetRowRef changed
        const byName = await prisma.planningAction.findFirst({
          where: { tripId, action: { contains: act.action.substring(0, 10) } },
        });

        if (!byName) {
          await prisma.planningAction.create({
            data: {
              tripId,
              action: act.action,
              owner: act.owner,
              dueDate: act.dueDate,
              notes: act.notes,
              andyStatus: act.andyStatus,
              larisaStatus: act.larisaStatus,
              statusNotes: act.statusNotes,
              sheetRowRef: act.sheetRowRef,
              status: derivedStatus,
            },
          });
          addedCount++;
        }
      }
    }

    // Sync sheet notes from unstructured tabs. Upsert by (tripId, tabName, rowIndex)
    // so repeated pulls stay idempotent. When the planner requests a reconcile pull
    // (body.reconcile === true), we ALSO delete any Wander notes that are no longer
    // in the sheet — useful after Larisa finishes a cut-and-paste. Default is
    // conservative (preserve Wander's copy) because a mid-edit state in Larisa's sheet
    // shouldn't destroy context planners might be relying on.
    let noteCount = 0;
    let notesRemoved = 0;
    const seenNoteKeys = new Set<string>();
    for (const note of data.sheetNotes) {
      seenNoteKeys.add(`${note.tabName}::${note.rowIndex}`);
      await prisma.sheetNote.upsert({
        where: {
          tripId_tabName_rowIndex: {
            tripId,
            tabName: note.tabName,
            rowIndex: note.rowIndex,
          },
        },
        create: {
          tripId,
          tabName: note.tabName,
          rowIndex: note.rowIndex,
          text: note.text,
        },
        update: {
          text: note.text,
        },
      });
      noteCount++;
    }

    if (req.body?.reconcile === true) {
      const stale = await prisma.sheetNote.findMany({
        where: { tripId },
        select: { id: true, tabName: true, rowIndex: true },
      });
      const toDelete = stale.filter(n => !seenNoteKeys.has(`${n.tabName}::${n.rowIndex}`));
      if (toDelete.length > 0) {
        await prisma.sheetNote.deleteMany({
          where: { id: { in: toDelete.map(n => n.id) } },
        });
        notesRemoved = toDelete.length;
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

    // Sync route segments from itinerary travel columns (From/To/Depart/Arrive)
    let segmentCount = 0;
    for (const pc of data.cities) {
      for (const pd of pc.days) {
        if (!pd.travelFrom && !pd.travelTo) continue;
        const originName = pd.travelFrom || pc.name;
        const destName = pd.travelTo || pc.name;
        if (originName.toLowerCase() === destName.toLowerCase()) continue;

        const mode = guessTransportMode(pd.travelFlightTime, pd.travelFrom, pd.travelTo, pd.description);

        const existing = await prisma.routeSegment.findFirst({
          where: { tripId, originCity: originName, destinationCity: destName },
        });

        if (!existing) {
          await prisma.routeSegment.create({
            data: {
              tripId,
              originCity: originName,
              destinationCity: destName,
              sequenceOrder: segmentCount,
              transportMode: mode,
              departureDate: pd.date ? new Date(pd.date + "T00:00:00Z") : null,
              departureTime: pd.travelDepart || null,
              arrivalTime: pd.travelArrive || null,
              notes: pd.travelFlightTime ? `Flight time: ${pd.travelFlightTime}` : null,
            },
          });
          segmentCount++;
          addedCount++;
        } else if (existing.departureTime !== (pd.travelDepart || null) || existing.arrivalTime !== (pd.travelArrive || null)) {
          await prisma.routeSegment.update({
            where: { id: existing.id },
            data: {
              departureTime: pd.travelDepart || null,
              arrivalTime: pd.travelArrive || null,
              transportMode: mode,
            },
          });
          updatedCount++;
        }
      }
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
    const noteSummary = notesRemoved > 0
      ? `, ${noteCount} notes synced (${notesRemoved} stale removed)`
      : noteCount > 0 ? `, ${noteCount} notes synced` : "";
    const summaryLine = `Pull: ${addedCount} added, ${updatedCount} updated${noteSummary}, ${conflicts.length} conflicts`;
    await prisma.$executeRawUnsafe(`
      INSERT INTO sheet_sync_logs (id, trip_id, direction, status, summary, conflicts, details, created_at)
      VALUES (gen_random_uuid(), $1, 'pull', $2, $3, $4::jsonb, $5::jsonb, NOW())
    `,
      tripId,
      conflicts.length > 0 ? "conflict" : "success",
      summaryLine,
      JSON.stringify(conflicts),
      JSON.stringify({ addedCount, updatedCount, noteCount, notesRemoved }),
    );

    res.json({
      added: addedCount,
      updated: updatedCount,
      noteCount,
      notesRemoved,
      conflicts,
      summary: `Pull complete: ${addedCount} added, ${updatedCount} updated${noteSummary}, ${conflicts.length} conflicts`,
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

    // Safety net: pin the current revision BEFORE any write. Ken's rule (memory:
    // feedback_sheet_sync_versioning.md): no write without a rollback point. If this throws,
    // the push aborts — we never modify the sheet without a pinned pre-state.
    const pinLabel = `Pre-push ${new Date().toISOString()}`;
    let pinnedRevisionId: string;
    try {
      pinnedRevisionId = await createVersionSnapshot(config.spreadsheetId, pinLabel);
    } catch (pinErr: any) {
      console.error("[sheets-sync] Version pin failed, aborting push:", pinErr.message);
      await prisma.sheetSyncLog.create({
        data: {
          tripId,
          direction: "push",
          status: "error",
          summary: `Push aborted — could not pin revision: ${pinErr.message}`,
        },
      });
      res.status(500).json({ error: `Cannot push: version pin failed (${pinErr.message})` });
      return;
    }

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

    // ─────────────────────────────────────────────────────────
    // Actions two-way sync
    //
    // Current Actions tab schema (7 columns, Apr 2026):
    //   [0] Actions  [1] Owner  [2] Due Dates  [3] Notes
    //   [4] Andy Status  [5] Larisa Status  [6] Status Notes
    //
    // Two paths:
    //   A) Wander-created actions (sheetRowRef is null) → append a new row to the sheet.
    //   B) Existing actions (sheetRowRef is set) → if Wander's version differs from
    //      what's currently in the sheet, overwrite that row in place.
    //
    // "Differs" means a human edited the action inside Wander (notes/status/dueDate/etc)
    // after the last pull. We trust Wander as the newer source here because push runs
    // after pull in the Sync Now flow. For pure pull-only workflows, planners should
    // not edit in Wander — but that isn't enforced here.
    // ─────────────────────────────────────────────────────────

    const actionsTabName = "Actions";
    let actionsAdded = 0;
    let actionsUpdated = 0;

    // Path A: append new Wander-created actions
    const newWanderActions = await prisma.planningAction.findMany({
      where: { tripId, sheetRowRef: null },
    });
    for (const act of newWanderActions) {
      const row = [
        act.action,
        act.owner || "Both",
        act.dueDate || "",
        act.notes || "",
        act.andyStatus || "",
        act.larisaStatus || "",
        act.statusNotes || "",
      ];
      await appendToSheet(config.spreadsheetId, `'${actionsTabName}'`, [row]);

      // Row number is approximate because other pushes may run in parallel; a subsequent
      // pull will reconcile the actual row number via fuzzy name matching.
      const actionsData = sheetData.rawTabData[actionsTabName] || [];
      const newRow = actionsData.length + actionsAdded + 1;
      await prisma.planningAction.update({
        where: { id: act.id },
        data: { sheetRowRef: `${actionsTabName}:${newRow}` },
      });
      actionsAdded++;
      pushedCount++;

      try {
        await tintCells(config.spreadsheetId, actionsTabName, newRow - 1, 0, newRow, 7);
      } catch { /* best-effort */ }
    }

    // Path B: update existing actions where Wander and sheet diverge
    const existingWanderActions = await prisma.planningAction.findMany({
      where: { tripId, sheetRowRef: { not: null } },
    });
    for (const act of existingWanderActions) {
      // sheetRowRef looks like "Actions:3" — split to get the row index
      const parts = (act.sheetRowRef || "").split(":");
      if (parts.length !== 2 || parts[0] !== actionsTabName) continue;
      const rowIdx = parseInt(parts[1], 10); // this is the parser's 0-based row index
      if (isNaN(rowIdx)) continue;

      // Find the matching parsed action from the fresh sheet read
      const sheetAct = sheetData.actions.find(a => a.sheetRowRef === act.sheetRowRef);
      if (!sheetAct) continue; // row moved or deleted — let next pull reconcile

      // Compare every syncable field. If any differ, overwrite the whole row so the
      // sheet matches Wander's current state exactly.
      const diverged =
        sheetAct.action !== act.action ||
        sheetAct.owner !== act.owner ||
        (sheetAct.dueDate || "") !== (act.dueDate || "") ||
        (sheetAct.notes || "") !== (act.notes || "") ||
        (sheetAct.andyStatus || "") !== (act.andyStatus || "") ||
        (sheetAct.larisaStatus || "") !== (act.larisaStatus || "") ||
        (sheetAct.statusNotes || "") !== (act.statusNotes || "");

      if (!diverged) continue;

      // Overwrite row: Actions tab is 1-indexed in A1 notation, and the parser's rowIdx
      // is also the 0-based row so the sheet row number = rowIdx + 1.
      const sheetRowNumber = rowIdx + 1;
      const range = `'${actionsTabName}'!A${sheetRowNumber}:G${sheetRowNumber}`;
      await writeToSheet(config.spreadsheetId, range, [[
        act.action,
        act.owner || "Both",
        act.dueDate || "",
        act.notes || "",
        act.andyStatus || "",
        act.larisaStatus || "",
        act.statusNotes || "",
      ]]);
      actionsUpdated++;
      pushedCount++;

      try {
        await tintCells(config.spreadsheetId, actionsTabName, rowIdx, 0, rowIdx + 1, 7);
      } catch { /* best-effort */ }
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

          if (!existingRank || existingRank !== String(vote.rank)) {
            // Write the rank number (1, 2, or 3)
            const colLetter = String.fromCharCode(65 + colIdx); // L, M, N, O
            const sheetRow = rowIdx + 1; // 1-indexed
            const range = `'${tabName}'!${colLetter}${sheetRow}`;
            await writeToSheet(config.spreadsheetId, range, [[String(vote.rank)]]);
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

    // Log the push with the pinned revision ID so we can recover the pre-push state if needed.
    // The revision ID is what Ken would use in Drive's version history to roll back.
    const summary = `Push complete: ${pushedCount} changes (${actionsAdded} new actions, ${actionsUpdated} updated actions, ${votesUpdated} votes)`;
    await prisma.sheetSyncLog.create({
      data: {
        tripId,
        direction: "push",
        status: "success",
        summary,
        details: {
          pinnedRevisionId,
          pinLabel,
          actionsAdded,
          actionsUpdated,
          votesUpdated,
          activitiesPushed: pushedCount - actionsAdded - actionsUpdated,
        },
      },
    });

    res.json({
      pushed: pushedCount,
      votesUpdated,
      actionsAdded,
      actionsUpdated,
      pinnedRevisionId,
      summary,
    });
  } catch (err: any) {
    console.error("[sheets-sync] Push failed:", err.message);
    // Log the failure too so we have a complete history of sync attempts.
    try {
      await prisma.sheetSyncLog.create({
        data: {
          tripId: (req.body as any)?.tripId || "unknown",
          direction: "push",
          status: "error",
          summary: `Push failed: ${err.message}`,
        },
      });
    } catch { /* best-effort log */ }
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

// ── GET /actions — Planning actions from Guide ───────────────
router.get("/actions/:tripId", async (req: AuthRequest, res) => {
  try {
    const tripId = req.params.tripId as string;
    const actions = await prisma.planningAction.findMany({
      where: { tripId },
      orderBy: { createdAt: "asc" },
    });
    res.json(actions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /notes — Sheet notes from narrative tabs ─────────────
// Returns all text rows captured from Flight info, Tokyo Hotel Info, meeting summaries, etc.
// Grouped by tab so the UI can render a "Notes from the Guide" section per source tab.
router.get("/notes/:tripId", async (req: AuthRequest, res) => {
  try {
    const tripId = req.params.tripId as string;
    const notes = await prisma.sheetNote.findMany({
      where: { tripId },
      orderBy: [{ tabName: "asc" }, { rowIndex: "asc" }],
    });
    // Group by tab for easier frontend rendering
    const byTab: Record<string, { rowIndex: number; text: string }[]> = {};
    for (const n of notes) {
      if (!byTab[n.tabName]) byTab[n.tabName] = [];
      byTab[n.tabName].push({ rowIndex: n.rowIndex, text: n.text });
    }
    // Include tabGids from sync config for deep-linked sheet URLs
    const config = await prisma.sheetSyncConfig.findUnique({ where: { tripId } });
    const tabGids = (config?.tabMappings as any)?.tabGids || {};
    res.json({ notes, byTab, tabGids });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /actions — Create a new planning action ─────────────
router.post("/actions", async (req: AuthRequest, res) => {
  try {
    const { tripId, action, owner, dueDate, notes } = req.body;
    if (!tripId || !action?.trim()) {
      res.status(400).json({ error: "tripId and action are required" });
      return;
    }

    const created = await prisma.planningAction.create({
      data: {
        tripId,
        action: action.trim(),
        owner: owner?.trim() || "Both",
        dueDate: dueDate?.trim() || null,
        notes: notes?.trim() || null,
        status: "open",
      },
    });

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /actions/:id — Update an action ────────────────────
router.patch("/actions/:id", async (req: AuthRequest, res) => {
  try {
    const { action, owner, dueDate, notes, status } = req.body;

    const updated = await prisma.planningAction.update({
      where: { id: req.params.id as string },
      data: {
        ...(action !== undefined && { action: action.trim() }),
        ...(owner !== undefined && { owner: owner.trim() }),
        ...(dueDate !== undefined && { dueDate: dueDate?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(status !== undefined && { status }),
      },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /actions/:id — Remove an action ───────────────────
router.delete("/actions/:id", async (req: AuthRequest, res) => {
  try {
    await prisma.planningAction.delete({
      where: { id: req.params.id as string },
    });
    res.json({ deleted: true });
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

/** Guess transport mode from spreadsheet travel columns */
function guessTransportMode(flightTime: string | null, from: string | null, to: string | null, description: string | null): TransportMode {
  const text = `${flightTime || ""} ${from || ""} ${to || ""} ${description || ""}`.toLowerCase();
  if (flightTime && flightTime.trim()) return "flight";
  if (text.includes("fly") || text.includes("flight") || text.includes("airport")) return "flight";
  if (text.includes("ferry") || text.includes("boat")) return "ferry";
  if (text.includes("drive") || text.includes("car") || text.includes("rental")) return "drive";
  if (text.includes("bus")) return "bus";
  if (text.includes("walk")) return "walk";
  return "train"; // Default for Japan travel
}

export default router;
