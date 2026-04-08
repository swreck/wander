/**
 * Sheet Import Service
 *
 * Creates a clean Wander trip from Larisa's spreadsheet data.
 * Option A: empty trip, populated entirely from spreadsheet (spreadsheet is seed data).
 */

import prisma from "./db.js";
import {
  readSpreadsheet,
  copySpreadsheet,
  type ParsedCity,
  type ParsedDay,
  type ParsedHotel,
  type ParsedActivity,
  type SpreadsheetData,
} from "./sheetsSync.js";
import type { TransportMode } from "@prisma/client";

const USER_CODE_MAP: Record<string, string> = {
  julie: "Julie",
  andy: "Andy",
  larisa: "Larisa",
  ken: "Ken",
};

interface ImportResult {
  tripId: string;
  tripName: string;
  workingCopyId: string;
  backupCopyId: string;
  cities: number;
  days: number;
  experiences: number;
  accommodations: number;
  decisions: number;
  interests: number;
  summary: string;
}

export async function importFromSpreadsheet(
  spreadsheetId: string,
  creatorCode: string = "Ken",
): Promise<ImportResult> {
  console.log("[sheet-import] Reading spreadsheet...");
  const data = await readSpreadsheet(spreadsheetId);

  // Working copies: service account has no Drive quota.
  // Use the source spreadsheet directly for now.
  // Ken can create manual copies via Google Drive if needed.
  const workingCopyId = spreadsheetId;
  const backupCopyId = ""; // TODO: create via Ken's personal Drive
  console.log(`[sheet-import] Using source spreadsheet directly: ${spreadsheetId}`);

  // Create clean trip
  console.log("[sheet-import] Creating trip...");
  const trip = await prisma.trip.create({
    data: {
      name: "Japan 2026",
      tagline: "Ceramics, culture, and Backroads",
      status: "active",
      datesKnown: true,
    },
  });

  // Create sync config
  await prisma.sheetSyncConfig.create({
    data: {
      tripId: trip.id,
      spreadsheetId: workingCopyId,
      tabMappings: {
        sourceSpreadsheetId: spreadsheetId,
        backupSpreadsheetId: backupCopyId,
        itineraryTab: "Japan-Oct'26-Itinerary",
        tokyoHotelTab: "Tokyo Hotel Template",
        kyotoHotelTab: "Kyoto Hotel Template",
        activitiesTab: "Activities Template",
      },
    },
  });

  // Ensure creator is a planner
  const creator = await prisma.traveler.findFirst({
    where: { displayName: creatorCode },
  });
  if (creator) {
    await prisma.tripMember.create({
      data: { tripId: trip.id, travelerId: creator.id, role: "planner" },
    });
  }

  // Add all travelers as members
  for (const name of Object.values(USER_CODE_MAP)) {
    if (name === creatorCode) continue;
    const traveler = await prisma.traveler.findFirst({
      where: { displayName: name },
    });
    if (traveler) {
      await prisma.tripMember.upsert({
        where: { tripId_travelerId: { tripId: trip.id, travelerId: traveler.id } },
        create: { tripId: trip.id, travelerId: traveler.id, role: "traveler" },
        update: {},
      });
    }
  }

  // Import cities and days
  console.log("[sheet-import] Importing cities and days...");
  const { cityCount, dayCount, cityIdMap } = await importCities(trip.id, data.cities, creatorCode);

  // Import activities as experiences
  console.log("[sheet-import] Importing activities...");
  const { experienceCount, interestCount } = await importActivities(trip.id, data.activities, cityIdMap, creatorCode);

  // Import hotel decisions
  console.log("[sheet-import] Importing hotel decisions...");
  let decisionCount = 0;
  const tokyoCityId = cityIdMap.get("Tokyo");
  if (tokyoCityId && data.tokyoHotels.length > 0) {
    await importHotelDecision(trip.id, tokyoCityId, "Tokyo hotel", data.tokyoHotels, creatorCode);
    decisionCount++;
  }
  const kyotoCityId = cityIdMap.get("Kyoto");
  if (kyotoCityId && data.kyotoHotels.length > 0) {
    await importHotelDecision(trip.id, kyotoCityId, "Kyoto hotel", data.kyotoHotels, creatorCode);
    decisionCount++;
  }

  // Import known accommodations from itinerary
  console.log("[sheet-import] Importing accommodations...");
  let accommodationCount = 0;
  for (const city of data.cities) {
    if (city.hotelName && city.hotelName !== "TBD") {
      // Skip numeric-only hotel names (those are daily rates, not names)
      const cleaned = city.hotelName.replace(/[,$\s]/g, "");
      if (/^\d+(\.\d+)?$/.test(cleaned)) continue;

      // Use the normalizedCityName (set during import) for lookup
      const cityId = findCityId(cityIdMap, city.normalizedCityName || city.name);
      if (cityId) {
        await prisma.accommodation.create({
          data: {
            tripId: trip.id,
            cityId,
            name: city.hotelName,
            notes: city.hotelNotes || null,
          },
        });
        accommodationCount++;
      }
    }
  }

  // Sync trip dates from days
  const { syncTripDates } = await import("./syncTripDates.js");
  await syncTripDates(trip.id);

  const summary = [
    `Created trip "${trip.name}" (${trip.id})`,
    `${cityCount} cities, ${dayCount} days`,
    `${experienceCount} activities, ${interestCount} interest marks`,
    `${decisionCount} hotel decisions, ${accommodationCount} confirmed accommodations`,
    `Working copy: ${workingCopyId}`,
    `Backup copy: ${backupCopyId}`,
  ].join("\n");

  console.log("[sheet-import] Done!");
  console.log(summary);

  return {
    tripId: trip.id,
    tripName: trip.name,
    workingCopyId,
    backupCopyId,
    cities: cityCount,
    days: dayCount,
    experiences: experienceCount,
    accommodations: accommodationCount,
    decisions: decisionCount,
    interests: interestCount,
    summary,
  };
}

// ── City & Day Import ────────────────────────────────────────

async function importCities(
  tripId: string,
  parsedCities: ParsedCity[],
  creatorCode: string,
): Promise<{ cityCount: number; dayCount: number; cityIdMap: Map<string, string>; segmentCount: number }> {
  const cityIdMap = new Map<string, string>();
  let dayCount = 0;
  let sequenceOrder = 0;

  // Merge Backroads sections into their destination cities or keep separate
  // For now, keep Backroads as separate cities with dayType "guided"
  for (const pc of parsedCities) {
    // Skip San Francisco (departure city, not a destination)
    if (pc.name.toLowerCase().includes("san francisco")) continue;

    // Normalize city name for Wander
    let cityName = pc.name;
    if (cityName.startsWith("Backroads:")) {
      cityName = cityName.replace("Backroads:", "").trim();
      // Handle compound names like "Tokyo->Nikko (Day 1-4)"
      if (cityName.includes("->")) {
        cityName = cityName.split("->").pop()!.trim();
      }
      cityName = cityName.replace(/\(.*\)/, "").trim();
      if (!cityName) cityName = pc.name;
    }

    // Store normalized name back on the parsed city for accommodation lookup
    pc.normalizedCityName = cityName;

    // Check if we already have this city (e.g., "Kyoto" from Backroads + post-Backroads)
    const existingCityId = findCityId(cityIdMap, cityName);

    let cityId: string;
    if (existingCityId) {
      // Extend existing city's dates and merge budget if needed
      cityId = existingCityId;
      const existingCity = await prisma.city.findUnique({ where: { id: cityId } });
      if (existingCity && pc.arrivalDate) {
        const existingArrival = existingCity.arrivalDate?.toISOString().split("T")[0];
        const existingDeparture = existingCity.departureDate?.toISOString().split("T")[0];
        const newArrival = pc.arrivalDate;
        const newDeparture = pc.departureDate;

        const finalArrival = (!existingArrival || newArrival < existingArrival) ? newArrival : existingArrival;
        const finalDeparture = (!existingDeparture || (newDeparture && newDeparture > existingDeparture)) ? newDeparture : existingDeparture;

        // Merge budget data (new section's budget adds to existing)
        const existingCost = (existingCity.costEstimate as any) || {};
        const newCost = (pc.budgetJA || pc.budgetKL || pc.hotelTotalJA || pc.mealsBudgetJA) ? {
          budgetJA: parseCurrency(pc.budgetJA) ?? existingCost.budgetJA,
          budgetKL: parseCurrency(pc.budgetKL) ?? existingCost.budgetKL,
          hotelDailyRate: pc.hotelDailyRate || existingCost.hotelDailyRate,
          hotelTotalJA: parseCurrency(pc.hotelTotalJA) ?? existingCost.hotelTotalJA,
          hotelTotalKL: parseCurrency(pc.hotelTotalKL) ?? existingCost.hotelTotalKL,
          mealsDailyDesc: pc.mealsDailyDesc || existingCost.mealsDailyDesc,
          mealsBudgetJA: parseCurrency(pc.mealsBudgetJA) ?? existingCost.mealsBudgetJA,
          mealsBudgetKL: parseCurrency(pc.mealsBudgetKL) ?? existingCost.mealsBudgetKL,
        } : existingCost;

        await prisma.city.update({
          where: { id: cityId },
          data: {
            arrivalDate: finalArrival ? new Date(finalArrival + "T00:00:00Z") : null,
            departureDate: finalDeparture ? new Date(finalDeparture + "T00:00:00Z") : null,
            costEstimate: Object.keys(newCost).length > 0 ? newCost : undefined,
          },
        });
      }
    } else {
      const costEstimate = (pc.budgetJA || pc.budgetKL || pc.hotelTotalJA || pc.mealsBudgetJA) ? {
        budgetJA: parseCurrency(pc.budgetJA),
        budgetKL: parseCurrency(pc.budgetKL),
        hotelDailyRate: pc.hotelDailyRate,
        hotelTotalJA: parseCurrency(pc.hotelTotalJA),
        hotelTotalKL: parseCurrency(pc.hotelTotalKL),
        mealsDailyDesc: pc.mealsDailyDesc,
        mealsBudgetJA: parseCurrency(pc.mealsBudgetJA),
        mealsBudgetKL: parseCurrency(pc.mealsBudgetKL),
      } : undefined;

      const city = await prisma.city.create({
        data: {
          tripId,
          name: cityName,
          country: "Japan",
          sequenceOrder: sequenceOrder++,
          arrivalDate: pc.arrivalDate ? new Date(pc.arrivalDate + "T00:00:00Z") : null,
          departureDate: pc.departureDate ? new Date(pc.departureDate + "T00:00:00Z") : null,
          costEstimate: costEstimate || undefined,
        },
      });
      cityId = city.id;
      cityIdMap.set(cityName, cityId);
    }

    // Create days for every date in the city's range (not just explicit rows)
    // This mirrors how the city creation route works
    const notesMap = new Map<string, { description: string | null; isGuided: boolean }>();
    for (const pd of pc.days) {
      notesMap.set(pd.date, { description: pd.description, isGuided: pd.isGuided });
    }

    if (pc.arrivalDate && pc.departureDate) {
      const arrival = new Date(pc.arrivalDate + "T00:00:00Z");
      const departure = new Date(pc.departureDate + "T00:00:00Z");
      for (let d = new Date(arrival); d <= departure; d.setUTCDate(d.getUTCDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        const dateStart = new Date(dateStr + "T00:00:00Z");
        const dateEnd = new Date(dateStr + "T23:59:59Z");
        const dayMeta = notesMap.get(dateStr);

        const existingDay = await prisma.day.findFirst({
          where: { tripId, date: { gte: dateStart, lte: dateEnd } },
        });

        if (existingDay) {
          await prisma.day.update({
            where: { id: existingDay.id },
            data: {
              cityId,
              dayType: (dayMeta?.isGuided || pc.isBackroads) ? "guided" : "free",
              notes: dayMeta?.description || existingDay.notes,
            },
          });
        } else {
          await prisma.day.create({
            data: {
              tripId,
              cityId,
              date: dateStart,
              dayType: (dayMeta?.isGuided || pc.isBackroads) ? "guided" : "free",
              notes: dayMeta?.description || null,
            },
          });
          dayCount++;
        }
      }
    } else {
      // No date range — just create days from explicit rows
      for (const pd of pc.days) {
        const dateStart = new Date(pd.date + "T00:00:00Z");
        const dateEnd = new Date(pd.date + "T23:59:59Z");
        const existingDay = await prisma.day.findFirst({
          where: { tripId, date: { gte: dateStart, lte: dateEnd } },
        });
        if (!existingDay) {
          await prisma.day.create({
            data: { tripId, cityId, date: dateStart, dayType: pd.isGuided ? "guided" : "free", notes: pd.description || null },
          });
          dayCount++;
        }
      }
    }
  }

  // ── Create route segments from travel data in parsed days ──
  let segmentCount = 0;
  const allDaysWithTravel: { city: ParsedCity; day: ParsedDay }[] = [];
  for (const pc of parsedCities) {
    for (const pd of pc.days) {
      if (pd.travelFrom || pd.travelTo) {
        allDaysWithTravel.push({ city: pc, day: pd });
      }
    }
  }

  for (const { city, day } of allDaysWithTravel) {
    const originName = day.travelFrom || city.name;
    const destName = day.travelTo || city.name;
    // Skip if origin and destination are the same (no real travel)
    if (originName.toLowerCase() === destName.toLowerCase()) continue;

    // Determine transport mode from spreadsheet columns
    const mode = guessTransportMode(day.travelFlightTime, day.travelFrom, day.travelTo, day.description);

    // Check if segment already exists
    const existing = await prisma.routeSegment.findFirst({
      where: {
        tripId,
        originCity: originName,
        destinationCity: destName,
      },
    });

    if (!existing) {
      await prisma.routeSegment.create({
        data: {
          tripId,
          originCity: originName,
          destinationCity: destName,
          sequenceOrder: segmentCount,
          transportMode: mode,
          departureDate: day.date ? new Date(day.date + "T00:00:00Z") : null,
          departureTime: day.travelDepart || null,
          arrivalTime: day.travelArrive || null,
          notes: day.travelFlightTime ? `Flight time: ${day.travelFlightTime}` : null,
        },
      });
      segmentCount++;
    }
  }

  return { cityCount: cityIdMap.size, dayCount, cityIdMap, segmentCount };
}

/** Guess transport mode from spreadsheet columns */
function guessTransportMode(flightTime: string | null, from: string | null, to: string | null, description: string | null): TransportMode {
  const text = `${flightTime || ""} ${from || ""} ${to || ""} ${description || ""}`.toLowerCase();
  if (flightTime && flightTime.trim()) return "flight"; // Has a flight time → it's a flight
  if (text.includes("fly") || text.includes("flight") || text.includes("airport")) return "flight";
  if (text.includes("ferry") || text.includes("boat")) return "ferry";
  if (text.includes("drive") || text.includes("car") || text.includes("rental")) return "drive";
  if (text.includes("bus")) return "bus";
  if (text.includes("walk")) return "walk";
  // Default to train for Japan travel
  return "train";
}

// ── Activities Import ────────────────────────────────────────

async function importActivities(
  tripId: string,
  activities: ParsedActivity[],
  cityIdMap: Map<string, string>,
  creatorCode: string,
): Promise<{ experienceCount: number; interestCount: number }> {
  let experienceCount = 0;
  let interestCount = 0;

  for (const act of activities) {
    const cityId = findCityId(cityIdMap, act.city);
    if (!cityId) {
      console.warn(`[sheet-import] No city found for activity "${act.name}" in "${act.city}", skipping`);
      continue;
    }

    // Determine theme from section
    const theme = act.section.toLowerCase().includes("restaurant") ? "food" : "other";

    // Build description from comment and section
    let description = "";
    if (act.comment) description += act.comment;
    if (act.neighborhood) {
      if (description) description += ` — `;
      description += act.neighborhood;
    }

    const exp = await prisma.experience.create({
      data: {
        tripId,
        cityId,
        name: act.name,
        description: description || null,
        sourceUrl: act.url || null,
        createdBy: "Larisa",
        state: "possible",
        themes: [theme] as any,
        explorationZoneAssociation: act.neighborhood || null,
        sheetRowRef: act.sheetRowRef,
      },
    });
    experienceCount++;

    // Create interest marks
    const interestEntries: { code: string; name: string; interested: boolean }[] = [
      { code: "Julie", name: "Julie", interested: act.interests.julie },
      { code: "Andy", name: "Andy", interested: act.interests.andy },
      { code: "Larisa", name: "Larisa", interested: act.interests.larisa },
      { code: "Ken", name: "Ken", interested: act.interests.ken },
    ];

    for (const entry of interestEntries) {
      if (!entry.interested) continue;

      await prisma.experienceInterest.create({
        data: {
          experienceId: exp.id,
          tripId,
          userCode: entry.code,
          displayName: entry.name,
        },
      });
      interestCount++;
    }

    // Handle date assignments → promote to selected
    for (const da of act.dateAssignments) {
      if (!da.assigned) continue;

      const dateStart = new Date(da.date + "T00:00:00Z");
      const dateEnd = new Date(da.date + "T23:59:59Z");
      const day = await prisma.day.findFirst({
        where: {
          tripId,
          date: { gte: dateStart, lte: dateEnd },
        },
      });

      if (day) {
        await prisma.experience.update({
          where: { id: exp.id },
          data: { state: "selected", dayId: day.id },
        });
      }
    }
  }

  return { experienceCount, interestCount };
}

// ── Hotel Decision Import ────────────────────────────────────

async function importHotelDecision(
  tripId: string,
  cityId: string,
  title: string,
  hotels: ParsedHotel[],
  creatorCode: string,
) {
  const decision = await prisma.decision.create({
    data: {
      tripId,
      cityId,
      title,
      createdBy: creatorCode,
      status: "open",
    },
  });

  for (const hotel of hotels) {
    // Build rich description
    const descParts: string[] = [];
    if (hotel.location) descParts.push(`Location: ${hotel.location}`);
    if (hotel.rating) descParts.push(`Rating: ${hotel.rating}`);
    if (hotel.sqFootage) descParts.push(`Size: ${hotel.sqFootage}`);
    if (hotel.dailyRate) descParts.push(`${hotel.dailyRate}/night`);
    if (hotel.totalCost) descParts.push(`Total: ${hotel.totalCost}`);
    if (hotel.otherCriteria) descParts.push(hotel.otherCriteria);
    if (hotel.aiNotes) descParts.push(hotel.aiNotes);

    const exp = await prisma.experience.create({
      data: {
        tripId,
        cityId,
        name: hotel.name,
        description: descParts.join("\n") || null,
        sourceUrl: hotel.url || null,
        createdBy: "Larisa",
        state: "voting",
        decisionId: decision.id,
        themes: [],
        sheetRowRef: hotel.sheetRowRef,
      },
    });

    // Import votes (1 = top choice → maps to a vote)
    const voteEntries = [
      { code: "Julie", rank: hotel.votes.julie },
      { code: "Larisa", rank: hotel.votes.larisa },
      { code: "Ken", rank: hotel.votes.ken },
      { code: "Andy", rank: hotel.votes.andy },
    ];

    for (const ve of voteEntries) {
      if (!ve.rank) continue;
      // Any ranking (1, 2, or 3) means they voted for this option
      // In Wander's decision model, a vote = preference for this option
      if (["1", "2", "3"].includes(ve.rank.trim())) {
        const rankNum = parseInt(ve.rank!.trim()) || 1;
        await prisma.decisionVote.upsert({
          where: {
            decisionId_userCode_rank: { decisionId: decision.id, userCode: ve.code, rank: rankNum },
          },
          create: {
            decisionId: decision.id,
            optionId: exp.id,
            userCode: ve.code,
            displayName: ve.code,
            rank: rankNum,
          },
          update: {
            optionId: exp.id,
          },
        });
      }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────

function parseCurrency(val: string | null): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) || num === 0 ? null : num;
}

function findCityId(cityIdMap: Map<string, string>, targetName: string): string | null {
  // Exact match
  for (const [name, id] of cityIdMap) {
    if (name.toLowerCase() === targetName.toLowerCase()) return id;
  }

  // Partial match (e.g., "Hakata or Karatsu" matches "Hakata")
  const targetLower = targetName.toLowerCase();
  for (const [name, id] of cityIdMap) {
    const nameLower = name.toLowerCase();
    if (nameLower.includes(targetLower) || targetLower.includes(nameLower)) return id;
  }

  // Fuzzy match
  const names = Array.from(cityIdMap.keys());
  for (const name of names) {
    if (jaroWinklerSimple(name.toLowerCase(), targetLower) > 0.85) {
      return cityIdMap.get(name) || null;
    }
  }

  return null;
}

function jaroWinklerSimple(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const matchWindow = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);
  let matches = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(b.length - 1, i + matchWindow);
    for (let j = start; j <= end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(a.length, b.length)); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}
