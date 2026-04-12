/**
 * Google Sheets ↔ Wander Sync Service
 *
 * Reads Larisa's spreadsheet, parses its structure-aware layout,
 * and maps data bidirectionally with the Wander database.
 *
 * Key design decisions:
 * - Parses by headers and list boundaries, NOT fixed cell addresses
 * - Fuzzy name matching for dedup (Jaro-Winkler)
 * - Spreadsheet wins on conflict (last-write-wins)
 * - Budget/weather columns are spreadsheet-only (not synced)
 * - Wander-only data (cultural notes, map pins, travel times) stays in Wander
 */

import { google, type sheets_v4 } from "googleapis";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Types ────────────────────────────────────────────────────

export interface ParsedCity {
  name: string;
  normalizedCityName?: string; // Set during import (stripped Backroads prefix etc.)
  arrivalDate: string | null; // ISO date
  departureDate: string | null;
  nights: number;
  hotelName: string | null;
  hotelDailyRate: string | null;
  hotelTotalJA: string | null;
  hotelTotalKL: string | null;
  hotelNotes: string | null;
  notes: string | null;
  budgetJA: string | null; // cumulative line item for J/A
  budgetKL: string | null; // cumulative line item for K/L
  mealsDailyDesc: string | null;
  mealsBudgetJA: string | null;
  mealsBudgetKL: string | null;
  isBackroads: boolean;
  days: ParsedDay[];
}

export interface ParsedDay {
  date: string; // ISO date
  description: string | null;
  notes: string | null;
  isGuided: boolean;
  // Travel columns from spreadsheet (From/To/Depart/Arrive/FlightTime)
  travelFrom: string | null;
  travelTo: string | null;
  travelDepart: string | null;
  travelArrive: string | null;
  travelFlightTime: string | null;
}

export interface ParsedHotel {
  name: string;
  location: string | null;
  rating: string | null;
  sqFootage: string | null;
  dailyRate: string | null;
  totalCost: string | null;
  otherCriteria: string | null;
  url: string | null;
  aiNotes: string | null;
  votes: { julie: string | null; larisa: string | null; ken: string | null; andy: string | null };
  sheetRowRef: string;
}

export interface ParsedActivity {
  name: string;
  city: string; // "Tokyo" | "Kyoto" | "Osaka"
  section: string; // "Activities" | "Tours/Day Trips" | "Restaurants"
  neighborhood: string | null;
  comment: string | null;
  url: string | null;
  interests: { julie: boolean; andy: boolean; larisa: boolean; ken: boolean };
  dateAssignments: { date: string; assigned: boolean }[];
  sheetRowRef: string; // e.g. "Activities Template:14"
}

export interface ParsedAction {
  action: string;
  owner: string; // "Both" | "LF" | "KR" | name
  dueDate: string | null;
  notes: string | null;
  andyStatus: string | null;    // raw text from "Andy Status" column
  larisaStatus: string | null;  // raw text from "Larisa Status" column
  statusNotes: string | null;   // raw text from "Status Notes" column
  sheetRowRef: string;
}

// A tab-level note captures non-empty text rows from tabs the structured parsers don't
// understand (Flight info, Tokyo Hotel Info, meeting summaries, etc). The goal is to
// preserve EVERY piece of text Larisa put in the sheet — even when the rich content
// (images, merged cells) can't be read via the API. Each note row is a simple text
// string with its source tab name; the UI presents them as "Notes from the Guide".
export interface ParsedSheetNote {
  tabName: string;
  rowIndex: number;
  text: string;
}

export interface SpreadsheetData {
  cities: ParsedCity[];
  tokyoHotels: ParsedHotel[];
  kyotoHotels: ParsedHotel[];
  activities: ParsedActivity[];
  actions: ParsedAction[];
  sheetNotes: ParsedSheetNote[];
  tabGids: Record<string, number>; // tab name → Google Sheets gid for deep-linking
  rawTabData: Record<string, string[][]>;
}

// ── Auth ─────────────────────────────────────────────────────

const CREDENTIALS_PATH = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH
  || "/Users/kenrosen/Documents/Projects/WanderDocumentationAndResources/actionmgr-e5d782f7349e.json";

function getAuth() {
  let credentials: any;

  if (process.env.GOOGLE_SHEETS_CREDENTIALS_B64) {
    // Production (Railway): base64-encoded JSON to avoid shell escaping issues
    const decoded = Buffer.from(process.env.GOOGLE_SHEETS_CREDENTIALS_B64, "base64").toString("utf-8");
    credentials = JSON.parse(decoded);
  } else if (process.env.GOOGLE_SHEETS_CREDENTIALS_JSON) {
    // Alternative: raw JSON string
    credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS_JSON);
  } else {
    // Dev: read from file
    credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

function getDriveClient() {
  return google.drive({ version: "v3", auth: getAuth() });
}

// ── Spreadsheet Copy ─────────────────────────────────────────

export async function copySpreadsheet(
  sourceId: string,
  newTitle: string,
): Promise<string> {
  const drive = getDriveClient();
  const res = await drive.files.copy({
    fileId: sourceId,
    requestBody: { name: newTitle },
  });
  return res.data.id!;
}

// ── Read All Data ────────────────────────────────────────────

export async function readSpreadsheet(spreadsheetId: string): Promise<SpreadsheetData> {
  const sheets = getSheetsClient();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title).filter(Boolean) as string[];
  // Build tab name → gid map for deep-linking
  const tabGids: Record<string, number> = {};
  meta.data.sheets?.forEach(s => {
    if (s.properties?.title && s.properties?.sheetId != null) {
      tabGids[s.properties.title] = s.properties.sheetId;
    }
  });

  const rawTabData: Record<string, string[][]> = {};

  for (const name of sheetNames) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${name}'`,
    });
    rawTabData[name] = (res.data.values || []) as string[][];
  }

  // Tab detection — prefer "Template" tabs when multiple matches exist (Larisa may add
  // adjacent tabs like "Tokyo Hotel Info" for analysis; the Template is the live decision surface).
  const findTemplateTab = (city: string) => {
    const matches = sheetNames.filter(n => {
      const lower = n.toLowerCase();
      return lower.includes(city) && lower.includes("hotel");
    });
    // Prefer tabs with "template" in the name if present
    const withTemplate = matches.find(n => n.toLowerCase().includes("template"));
    return withTemplate || matches[0];
  };

  const itineraryTab = sheetNames.find(n => n.toLowerCase().includes("itinerary"));
  const tokyoHotelTab = findTemplateTab("tokyo");
  const kyotoHotelTab = findTemplateTab("kyoto");
  const activitiesTab = sheetNames.find(n => n.toLowerCase().includes("activities"));
  const actionsTab = sheetNames.find(n => n.toLowerCase() === "actions");

  const cities = itineraryTab ? parseItinerary(rawTabData[itineraryTab]) : [];
  const tokyoHotels = tokyoHotelTab ? parseHotelTemplate(rawTabData[tokyoHotelTab], tokyoHotelTab) : [];
  const kyotoHotels = kyotoHotelTab ? parseHotelTemplate(rawTabData[kyotoHotelTab], kyotoHotelTab) : [];
  const activities = activitiesTab ? parseActivities(rawTabData[activitiesTab]) : [];
  const actions = actionsTab ? parseActions(rawTabData[actionsTab]) : [];

  // Capture ANY tab that isn't structurally parsed. Ken's rule: every tab Larisa put in
  // her sheet must show up in Wander somehow. Structured tabs (itinerary, hotel templates,
  // activities, actions) have their own parsers; every other tab — narrative or visual —
  // gets its non-empty rows captured as SheetNotes. Visual-only tabs (maps, metro diagrams)
  // will often contribute 0-1 text rows; they still get captured so the UI can surface an
  // interactive Wander version alongside the link to the source tab.
  const structuredTabs = new Set<string>(
    [itineraryTab, tokyoHotelTab, kyotoHotelTab, activitiesTab, actionsTab]
      .filter(Boolean) as string[],
  );
  const unstructuredTabs = sheetNames.filter(n => !structuredTabs.has(n));
  const sheetNotes = parseSheetNotes(unstructuredTabs, rawTabData);
  // Also record every unstructured tab name even if it contributed zero rows, so the UI
  // can render a card per tab (e.g., visual-only map tabs that need an interactive replacement).
  for (const tabName of unstructuredTabs) {
    const hasNotes = sheetNotes.some(n => n.tabName === tabName);
    if (!hasNotes) {
      sheetNotes.push({
        tabName,
        rowIndex: -1, // sentinel: zero-text tab, capture the tab itself
        text: "", // empty — the UI decides how to represent a visual-only tab
      });
    }
  }

  return { cities, tokyoHotels, kyotoHotels, activities, actions, sheetNotes, tabGids, rawTabData };
}

// ── Itinerary Parser ─────────────────────────────────────────

// Known Japan cities (for detecting city header rows vs date rows)
const JAPAN_CITIES = [
  "san francisco", "osaka", "okayama", "hakata", "karatsu",
  "hakata or karatsu", "nagoya", "tokyo", "kyoto", "nikko",
  "shirakabeso", "backroads",
];

const SKIP_CITIES = ["kanchanaburi"];

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();

  // Match patterns like "Mon, 10/05", "Tue, 10/06", "10/13/2026", "Wed, 10/14"
  const match = cleaned.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!match) return null;

  const month = parseInt(match[1]);
  const day = parseInt(match[2]);
  const year = match[3] ? (match[3].length === 2 ? 2026 : parseInt(match[3])) : 2026;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isCityHeader(row: string[]): { isCityHeader: boolean; cityName: string | null; isBackroads: boolean; skip: boolean } {
  const dateCol = (row[2] || "").trim();
  if (!dateCol) return { isCityHeader: false, cityName: null, isBackroads: false, skip: false };

  // Check if it's a date (has a slash pattern like 10/05)
  if (/\d{1,2}\/\d{1,2}/.test(dateCol)) return { isCityHeader: false, cityName: null, isBackroads: false, skip: false };

  // Check for skip cities
  const lower = dateCol.toLowerCase();
  for (const skip of SKIP_CITIES) {
    if (lower.includes(skip)) return { isCityHeader: false, cityName: null, isBackroads: false, skip: true };
  }

  // Check for Backroads
  if (lower.includes("backroads")) {
    // Extract destination: "Backroads - Tokyo->Nikko (Day 1-4)"
    const dest = dateCol.replace(/backroads\s*[-–]\s*/i, "").replace(/\(.*\)/, "").trim();
    return { isCityHeader: true, cityName: `Backroads: ${dest}`, isBackroads: true, skip: false };
  }

  // Check for known city names
  for (const city of JAPAN_CITIES) {
    if (lower.includes(city)) {
      return { isCityHeader: true, cityName: dateCol, isBackroads: false, skip: false };
    }
  }

  // If it doesn't match a date pattern and doesn't match known cities,
  // check if it looks like a city name (no numbers, not a budget value)
  if (!/\d/.test(dateCol) && dateCol.length > 2) {
    return { isCityHeader: true, cityName: dateCol, isBackroads: false, skip: false };
  }

  return { isCityHeader: false, cityName: null, isBackroads: false, skip: false };
}

function parseItinerary(rows: string[][]): ParsedCity[] {
  const cities: ParsedCity[] = [];
  let currentCity: ParsedCity | null = null;
  let skipping = false;

  for (let i = 1; i < rows.length; i++) { // skip header row
    const row = rows[i] || [];

    // Check for "Total" row (end of data)
    if ((row[2] || "").trim().toLowerCase() === "total") break;

    const { isCityHeader: isHeader, cityName, isBackroads, skip } = isCityHeader(row);

    if (skip) {
      skipping = true;
      continue;
    }

    if (isHeader && cityName) {
      skipping = false;

      // Save previous city
      if (currentCity) {
        finalizeCityDates(currentCity);
        cities.push(currentCity);
      }

      currentCity = {
        name: cityName,
        arrivalDate: null,
        departureDate: null,
        nights: 0,
        hotelName: null,
        hotelDailyRate: null,
        hotelTotalJA: null,
        hotelTotalKL: null,
        hotelNotes: null,
        notes: null,
        budgetJA: null,
        budgetKL: null,
        mealsDailyDesc: null,
        mealsBudgetJA: null,
        mealsBudgetKL: null,
        isBackroads,
        days: [],
      };
      continue;
    }

    if (skipping || !currentCity) continue;

    // Parse date row
    const dateStr = (row[2] || "").trim();
    const parsedDate = parseDate(dateStr);
    if (!parsedDate) continue;

    // Extract data from this row
    const checkOut = parseDate((row[3] || "").trim());
    const nights = parseInt((row[4] || "").trim()) || 0;
    const description = (row[5] || "").trim() || null;
    const hotelName = (row[19] || "").trim() || null;
    const hotelTotalJA = (row[20] || "").trim() || null;
    const hotelTotalKL = (row[21] || "").trim() || null;
    const notes = (row[23] || "").trim() || null;
    const budgetJA = (row[0] || "").trim() || null;
    const budgetKL = (row[1] || "").trim() || null;
    const mealsDailyDesc = (row[24] || "").trim() || null;
    const mealsBudgetJA = (row[25] || "").trim() || null;
    const mealsBudgetKL = (row[26] || "").trim() || null;

    // Set city dates from the first date row that has check-in/check-out
    if (!currentCity.arrivalDate) {
      currentCity.arrivalDate = parsedDate;
    }
    if (checkOut && !currentCity.departureDate) {
      currentCity.departureDate = checkOut;
    }
    if (nights && !currentCity.nights) {
      currentCity.nights = nights;
    }
    if (hotelName && !currentCity.hotelName) {
      currentCity.hotelName = hotelName;
      currentCity.hotelDailyRate = hotelName; // column T is "Hotel (Daily Rate)"
      currentCity.hotelTotalJA = hotelTotalJA;
      currentCity.hotelTotalKL = hotelTotalKL;
    }
    if (notes && !currentCity.notes) {
      currentCity.notes = notes;
    }
    // Capture budget from the first row that has non-zero values
    if (budgetJA && !currentCity.budgetJA && !budgetJA.includes("$ -")) {
      currentCity.budgetJA = budgetJA;
    }
    if (budgetKL && !currentCity.budgetKL && !budgetKL.includes("$ -")) {
      currentCity.budgetKL = budgetKL;
    }
    if (mealsDailyDesc && !currentCity.mealsDailyDesc) {
      currentCity.mealsDailyDesc = mealsDailyDesc;
      currentCity.mealsBudgetJA = mealsBudgetJA;
      currentCity.mealsBudgetKL = mealsBudgetKL;
    }

    // Extract travel columns (From, To, Depart, Arrive, Flight Time)
    const travelFrom = (row[6] || "").trim() || null;
    const travelTo = (row[7] || "").trim() || null;
    const travelDepart = (row[8] || "").trim() || null;
    const travelArrive = (row[9] || "").trim() || null;
    const travelFlightTime = (row[10] || "").trim() || null;

    // Add day
    currentCity.days.push({
      date: parsedDate,
      description,
      notes,
      isGuided: currentCity.isBackroads,
      travelFrom,
      travelTo,
      travelDepart,
      travelArrive,
      travelFlightTime,
    });
  }

  // Don't forget the last city
  if (currentCity) {
    finalizeCityDates(currentCity);
    cities.push(currentCity);
  }

  return cities;
}

function finalizeCityDates(city: ParsedCity) {
  if (city.days.length === 0) return;

  if (!city.arrivalDate) {
    city.arrivalDate = city.days[0].date;
  }

  // If no departure date, compute from arrival + nights or last day
  if (!city.departureDate) {
    if (city.nights > 0 && city.arrivalDate) {
      const d = new Date(city.arrivalDate + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + city.nights);
      city.departureDate = d.toISOString().split("T")[0];
    } else {
      city.departureDate = city.days[city.days.length - 1].date;
    }
  }
}

// ── Hotel Template Parser ────────────────────────────────────

function parseHotelTemplate(rows: string[][], tabName: string): ParsedHotel[] {
  const hotels: ParsedHotel[] = [];

  // Find the header row (contains "Hotels" in column Q / index 16)
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if ((rows[i]?.[16] || "").toLowerCase().includes("hotel")) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return hotels;

  // Parse hotel rows (start after header)
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const name = (row[16] || "").trim();
    if (!name) continue; // skip empty rows

    hotels.push({
      name,
      location: (row[17] || "").trim() || null,
      rating: (row[18] || "").trim() || null,
      sqFootage: (row[19] || "").trim() || null,
      dailyRate: (row[20] || "").trim() || null,
      totalCost: (row[21] || "").trim() || null,
      otherCriteria: (row[22] || "").trim() || null,
      url: (row[23] || "").trim() || null,
      aiNotes: (row[24] || "").trim() || null,
      votes: {
        julie: (row[11] || "").trim() || null,
        larisa: (row[12] || "").trim() || null,
        ken: (row[13] || "").trim() || null,
        andy: (row[14] || "").trim() || null,
      },
      sheetRowRef: `${tabName}:${i}`,
    });
  }

  return hotels;
}

// ── Activities Parser ────────────────────────────────────────

function parseActivities(rows: string[][]): ParsedActivity[] {
  const activities: ParsedActivity[] = [];
  let currentCity = "Tokyo";
  let currentSection = "Activities";

  // Find header row (contains "Julie" in column A)
  let headerRow = -1;
  let dateColumns: { index: number; date: string }[] = [];

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if ((rows[i]?.[0] || "").trim().toLowerCase() === "julie") {
      headerRow = i;
      // Parse date columns (index 9+)
      for (let j = 9; j < (rows[i]?.length || 0); j++) {
        const header = (rows[i][j] || "").trim();
        const dateMatch = header.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
        if (dateMatch) {
          const month = parseInt(dateMatch[1]);
          const day = parseInt(dateMatch[2]);
          const year = dateMatch[3] ? (dateMatch[3].length === 2 ? 2026 : parseInt(dateMatch[3])) : 2026;
          dateColumns.push({
            index: j,
            date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          });
        }
      }
      break;
    }
  }

  if (headerRow === -1) return activities;

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || [];

    // Check for section header (column E, index 4)
    const sectionHeader = (row[4] || "").trim();
    if (sectionHeader && sectionHeader.includes(" - ")) {
      // Parse "Tokyo - Activities", "Kyoto - Tours/Day Trips", etc.
      const parts = sectionHeader.split(" - ");
      currentCity = parts[0].trim();
      currentSection = parts.slice(1).join(" - ").trim();
      continue;
    }

    // Parse activity row
    const name = (row[5] || "").trim();
    if (!name) continue;

    const julieInterest = (row[0] || "").trim().toLowerCase();
    const andyInterest = (row[1] || "").trim().toLowerCase();
    const larisaInterest = (row[2] || "").trim().toLowerCase();
    const kenInterest = (row[3] || "").trim().toLowerCase();

    const dateAssignments = dateColumns.map(dc => ({
      date: dc.date,
      assigned: !!(row[dc.index] || "").trim(),
    }));

    activities.push({
      name,
      city: currentCity,
      section: currentSection,
      neighborhood: (row[6] || "").trim() || null,
      comment: (row[7] || "").trim() || null,
      url: (row[8] || "").trim() || null,
      interests: {
        julie: julieInterest === "x" || julieInterest === "yes",
        andy: andyInterest === "x" || andyInterest === "yes",
        larisa: larisaInterest === "x" || larisaInterest === "yes" || larisaInterest === "maybe",
        ken: kenInterest === "x" || kenInterest === "yes",
      },
      dateAssignments,
      sheetRowRef: `Activities Template:${i}`,
    });
  }

  return activities;
}

// ── Actions Parser ───────────────────────────────────────────

// ── Sheet Notes Parser ───────────────────────────────────────
//
// For "narrative" tabs that don't follow a structured schema (Flight info, Tokyo Hotel Info,
// meeting summaries), we preserve every non-empty cell as a note. Rows where every column is
// empty are skipped. Multi-column rows are joined with " · " to keep context together.
//
// The goal is NOT to parse structure — it's to ensure nothing Larisa wrote gets silently
// dropped. A planner reading Wander sees the text; for the visual parts they click through
// to the source sheet.

function parseSheetNotes(tabNames: string[], rawTabData: Record<string, string[][]>): ParsedSheetNote[] {
  const notes: ParsedSheetNote[] = [];
  for (const tabName of tabNames) {
    const rows = rawTabData[tabName];
    if (!rows) continue;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const cells = row.map(c => String(c || "").trim()).filter(Boolean);
      if (cells.length === 0) continue;
      notes.push({
        tabName,
        rowIndex: i,
        text: cells.join(" · "),
      });
    }
  }
  return notes;
}

function parseActions(rows: string[][]): ParsedAction[] {
  const actions: ParsedAction[] = [];
  if (rows.length < 2) return actions;

  // Row 0 is the header. Current observed format (Apr 2026):
  // Actions | Owner | Due Dates | Notes | Andy Status | Larisa Status | Status Notes
  // Older format had only the first four columns. Parser reads all seven defensively —
  // missing columns return null rather than break.
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const action = (row[0] || "").trim();
    if (!action) continue;

    actions.push({
      action,
      owner: (row[1] || "").trim() || "Everyone",
      dueDate: (row[2] || "").trim() || null,
      notes: (row[3] || "").trim() || null,
      andyStatus: (row[4] || "").trim() || null,
      larisaStatus: (row[5] || "").trim() || null,
      statusNotes: (row[6] || "").trim() || null,
      sheetRowRef: `Actions:${i}`,
    });
  }

  return actions;
}

// ── Fuzzy Name Matching (Jaro-Winkler) ───────────────────────

export function jaroWinkler(s1: string, s2: string): number {
  const a = s1.toLowerCase().trim();
  const b = s2.toLowerCase().trim();

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

  // Winkler bonus for common prefix (up to 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(a.length, b.length)); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

export function findBestMatch(name: string, candidates: string[], threshold = 0.85): string | null {
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = jaroWinkler(name, candidate);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

// ── Version Snapshot (safety net before sync) ────────────────
//
// Ken's rule: no write to a live sheet without first creating a NAMED BACKUP COPY
// visible in Google Drive. Not a pinned revision (those have no visible name and are
// hard to find). A full file copy named "Pre-sync backup YYYY-MM-DD HH:MM — <reason>"
// that Larisa or Ken can find, open, and compare at any time.
//
// If the copy fails, the push aborts. No write without a rollback point.

export async function createVersionSnapshot(spreadsheetId: string, label: string): Promise<string> {
  const drive = getDriveClient();

  // Get the original file's name so the backup is recognizable
  const file = await drive.files.get({ fileId: spreadsheetId, fields: "name" });
  const originalName = file.data.name || "Unknown sheet";

  // Create a full copy with a clear, human-readable name.
  // The copy is owned by the SERVICE ACCOUNT — it lives in the service account's Drive,
  // NOT in Larisa's Drive. She never sees these backups. They're for Ken's peace of mind
  // and disaster recovery only.
  const now = new Date();
  const timestamp = now.toISOString().replace("T", " ").slice(0, 16); // "2026-04-12 10:53"
  const copyName = `[Wander backup] ${timestamp} — ${originalName}`;

  const copy = await drive.files.copy({
    fileId: spreadsheetId,
    requestBody: { name: copyName },
  });

  const copyId = copy.data.id;
  if (!copyId) {
    throw new Error(`createVersionSnapshot: Drive copy returned no ID for sheet ${spreadsheetId}. Refusing to push without a backup.`);
  }

  console.log(`[sheets-sync] Created backup copy: "${copyName}" (${copyId})`);

  // Cleanup: keep only the 5 most recent backups. Delete older ones so the service
  // account's Drive doesn't fill up and Larisa never accidentally discovers them if
  // the service account is shared.
  try {
    const backups = await drive.files.list({
      q: `name contains '[Wander backup]' and mimeType = 'application/vnd.google-apps.spreadsheet'`,
      fields: "files(id, name, createdTime)",
      orderBy: "createdTime desc",
      pageSize: 50,
    });
    const oldBackups = (backups.data.files || []).slice(5); // keep newest 5
    for (const old of oldBackups) {
      if (old.id) {
        await drive.files.delete({ fileId: old.id });
        console.log(`[sheets-sync] Deleted old backup: ${old.name}`);
      }
    }
  } catch (cleanupErr: any) {
    // Cleanup failure is non-fatal — the backup itself succeeded
    console.warn(`[sheets-sync] Backup cleanup failed (non-fatal): ${cleanupErr.message}`);
  }

  return copyId;
}

// ── Cell Formatting (Wander origin tint) ─────────────────────

const WANDER_TINT = { red: 1.0, green: 0.976, blue: 0.902, alpha: 1.0 }; // #FFF9E6

export async function tintCells(
  spreadsheetId: string,
  sheetName: string,
  startRow: number, // 0-indexed
  startCol: number, // 0-indexed
  endRow: number,
  endCol: number,
) {
  const sheets = getSheetsClient();

  // Get the sheet ID from the sheet name
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find(s => s.properties?.title === sheetName);
  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range: {
            sheetId: sheet.properties.sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: WANDER_TINT,
            },
          },
          fields: "userEnteredFormat.backgroundColor",
        },
      }],
    },
  });
}

// ── Write to Spreadsheet ─────────────────────────────────────

export async function writeToSheet(
  spreadsheetId: string,
  range: string,
  values: string[][],
) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

export async function appendToSheet(
  spreadsheetId: string,
  range: string,
  values: string[][],
) {
  const sheets = getSheetsClient();

  // Find the last row with data, then write to the next row starting at column A
  // This avoids Google Sheets' default append behavior which shifts columns right
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  const lastRow = (existing.data.values?.length || 0) + 1;

  // Extract sheet name from range (e.g., "'Activities Template'" → "Activities Template")
  const sheetName = range.replace(/'/g, "");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A${lastRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}
