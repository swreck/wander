/**
 * Itinerary interpreter — reads the Guide's itinerary tab (header-driven, never by fixed
 * column position) and produces stays, day plans, travel legs, notes, and deadlines in
 * Larisa's own words, each tagged with the exact cell it came from.
 *
 * Faithfulness rules (see memory: product vision):
 * - Never reword. Titles and notes are the cell text, trimmed.
 * - Never guess a time. A time is set only when the Guide states it unambiguously:
 *   a time-of-day cell (e.g. 10:45), or text like "8:30a", "~3p", "11-11:30a", "6:30p".
 *   "6:15 or later" stays as words with no time.
 * - Sections marked SKIP by Larisa are left out on purpose and reported.
 * - Where the Guide disagrees with itself (two hotels the same night), keep both and flag it.
 */

import type { GuideCell, GuideTab } from "./reader.js";

export interface InterpretedStay {
  sectionTitle: string;
  city: string;
  hotel: string;
  checkIn: string | null;      // YYYY-MM-DD
  checkOut: string | null;     // YYYY-MM-DD
  nights: number | null;
  cancellationDate: string | null;
  notes: string[];
  sourceRef: string;
  source: string;
  /** The itinerary gives no check-out; the date was worked out (and a warning says so). */
  checkOutInferred?: boolean;
}

export interface InterpretedItem {
  date: string | null;         // YYYY-MM-DD
  time: string | null;         // HH:MM
  endTime: string | null;
  kind: "flight" | "train" | "travel" | "plan" | "note" | "deadline" | "meeting" | "tour" | "meal" | "checkin" | "checkout";
  title: string;
  detail: string | null;
  place: string | null;
  confirmation: string | null;
  sourceRef: string;
  source: string;
  city: string | null;
}

export interface ItineraryResult {
  tabName: string;
  stays: InterpretedStay[];
  items: InterpretedItem[];
  cityOrder: string[];          // cities in the order the Guide lists them
  firstDate: string | null;
  lastDate: string | null;
  skippedSections: { title: string; reason: string; rows: number[] }[];
  warnings: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Find the itinerary tab by its headers ("Date" + "Description"), not by its name. */
export function findItineraryTab(tabs: GuideTab[]): { tab: GuideTab; headerRow: number } | null {
  for (const tab of tabs) {
    const byRow = new Map<number, string[]>();
    for (const c of tab.cells) {
      if (c.r > 10) continue;
      byRow.set(c.r, [...(byRow.get(c.r) || []), norm(c.text)]);
    }
    for (const [r, texts] of byRow) {
      if (texts.includes("date") && texts.includes("description")) return { tab, headerRow: r };
    }
  }
  return null;
}

type Role =
  | "date" | "checkout" | "nights" | "description" | "from" | "to" | "depart" | "arrive" | "flightTime"
  | "time1" | "to2" | "time2" | "total" | "hotel" | "cancellation" | "notes" | "notes2" | "meals";

function mapColumns(tab: GuideTab, headerRow: number): Map<Role, number> {
  const roles = new Map<Role, number>();
  const headers = tab.cells.filter((c) => c.r === headerRow).sort((a, b) => a.c - b.c);
  let toCount = 0, timeCount = 0, notesCount = 0;
  for (const h of headers) {
    const t = norm(h.text);
    const set = (role: Role) => { if (!roles.has(role)) roles.set(role, h.c); };
    if (t === "date") set("date");
    else if (t.startsWith("chk out") || t.startsWith("check out") || t === "checkout") set("checkout");
    else if (t === "nights") set("nights");
    else if (t === "description") set("description");
    else if (t === "from") set("from");
    else if (t === "to") { toCount++; set(toCount === 1 ? "to" : "to2"); }
    else if (t === "depart") set("depart");
    else if (t.startsWith("arrive")) set("arrive");
    else if (t === "flight time") set("flightTime");
    else if (t === "time") { timeCount++; if (timeCount === 1) set("time1"); else if (timeCount === 2) set("time2"); }
    else if (t === "total") set("total");
    else if (t.startsWith("hotel")) set("hotel");
    else if (t.startsWith("cancellation")) set("cancellation");
    else if (t === "notes") { notesCount++; set(notesCount === 1 ? "notes" : "notes2"); }
    else if (t.startsWith("meals")) set("meals");
  }
  return roles;
}

/** Parse times stated unambiguously in text: "8:30a", "8:45a", "~3p", "6:30p", "11-11:30a", "12p". */
export function parseStatedTimes(text: string): { start: string | null; end: string | null } {
  const t = text.toLowerCase();
  // Range with a shared suffix: "11-11:30a", "8:30-10a"
  const range = t.match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(a|p)(?:m)?\b/);
  if (range) {
    const suffix = range[5];
    return { start: to24(+range[1], +(range[2] || 0), suffix), end: to24(+range[3], +(range[4] || 0), suffix) };
  }
  const single = t.match(/~?\b(\d{1,2})(?::(\d{2}))?\s*(a|p)(?:m)?\b/);
  if (single) return { start: to24(+single[1], +(single[2] || 0), single[3]), end: null };
  return { start: null, end: null };
}

function to24(h: number, m: number, ap: string): string | null {
  if (h < 1 || h > 12 || m > 59) return null;
  let hh = h % 12;
  if (ap === "p") hh += 12;
  return `${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Section titles: "Karatsu (tour Karatsu, day trip to Arita)", "Backroads - Tokyo->Nikko (Day 1-4)". */
export function cityFromSection(title: string): string {
  let t = title.trim();
  const backroads = t.match(/^backroads\s*[-–]\s*(.+)$/i);
  if (backroads) {
    t = backroads[1].replace(/\(.*?\)/g, "").trim();
    if (t.includes("->")) t = t.split("->").pop()!.trim();
  }
  t = t.replace(/\(.*?\)/g, "").trim();
  return t.replace(/\s+/g, " ");
}

const cellIn = (row: GuideCell[] | undefined, col: number | undefined) =>
  col === undefined ? undefined : row?.find((c) => c.c === col);

const textIn = (row: GuideCell[] | undefined, col: number | undefined) => cellIn(row, col)?.text.trim() || "";

export function interpretItinerary(tabs: GuideTab[]): ItineraryResult | null {
  const found = findItineraryTab(tabs);
  if (!found) return null;
  const { tab, headerRow } = found;
  const roles = mapColumns(tab, headerRow);
  const dateCol = roles.get("date");
  const rows = new Map<number, GuideCell[]>();
  for (const c of tab.cells) rows.set(c.r, [...(rows.get(c.r) || []), c]);
  const rowNumbers = Array.from(rows.keys()).filter((r) => r > headerRow).sort((a, b) => a - b);

  const result: ItineraryResult = {
    tabName: tab.name, stays: [], items: [], cityOrder: [], firstDate: null, lastDate: null, skippedSections: [], warnings: [],
  };
  const ref = (a1: string) => `${tab.name}!${a1}`;
  const readable = (role: string, r: number) => `Itinerary · ${role} (row ${r})`;

  let section: { title: string; city: string; skip: boolean; skipReason: string; rows: number[] } | null = null;
  let lastDate: string | null = null;

  for (const r of rowNumbers) {
    const row = rows.get(r)!;
    const dateCell = cellIn(row, dateCol);

    // Totals end the itinerary
    if (dateCell && /^(total|per night)$/i.test(dateCell.text.trim())) break;

    // Section header: bold text in the Date column that isn't a date
    if (dateCell && dateCell.kind === "text" && dateCell.bold) {
      if (section?.skip) result.skippedSections.push({ title: section.title, reason: section.skipReason, rows: section.rows });
      const title = dateCell.text.trim();
      const skip = /\bskip\b/i.test(title);
      section = { title, city: cityFromSection(title.split(/\s*-\s*skip/i)[0]), skip, skipReason: skip ? title : "", rows: [] };
      if (!skip && !result.cityOrder.includes(section.city)) result.cityOrder.push(section.city);
      lastDate = null;
      continue;
    }
    if (!section) continue;
    section.rows.push(r);
    if (section.skip) continue;

    const date = dateCell && (dateCell.kind === "date" || dateCell.kind === "datetime") ? dateCell.date! : null;
    if (date) {
      lastDate = date;
      if (!result.firstDate || date < result.firstDate) result.firstDate = date;
      if (!result.lastDate || date > result.lastDate) result.lastDate = date;
    }
    const itemDate = date || lastDate; // undated rows belong to the dated row above them
    const city = section.city;

    // Stay: a hotel on a dated row
    const hotelCell = cellIn(row, roles.get("hotel"));
    const hotel = hotelCell?.text.trim() || "";
    if (hotel && hotelCell!.kind === "text" && date) {
      const checkoutCell = cellIn(row, roles.get("checkout"));
      const nightsCell = cellIn(row, roles.get("nights"));
      const cancelCell = cellIn(row, roles.get("cancellation"));
      const notes = [textIn(row, roles.get("notes")), textIn(row, roles.get("notes2"))].filter(Boolean);
      result.stays.push({
        sectionTitle: section.title,
        city,
        hotel,
        checkIn: date,
        checkOut: checkoutCell?.date || null,
        nights: nightsCell ? Number(nightsCell.text) || null : null,
        cancellationDate: cancelCell?.date || null,
        notes,
        sourceRef: ref(hotelCell!.a1),
        source: readable("Hotel", r),
      });
      if (cancelCell?.date) {
        result.items.push({
          date: cancelCell.date, time: null, endTime: null, kind: "deadline",
          title: `${hotel} — cancellation date`, detail: null, place: null, confirmation: null,
          sourceRef: ref(cancelCell.a1), source: readable("cancellation date", r), city,
        });
      }
    }

    // Day plan / description
    const descCell = cellIn(row, roles.get("description"));
    const desc = descCell?.text.trim() || "";
    const confirmationMatch = desc.match(/confirmation\s*:?\s*:?\s*([A-Z0-9]{5,})/i);

    // Travel legs: From/To (+ times), or the second To/Time pair
    const from = textIn(row, roles.get("from"));
    const to = textIn(row, roles.get("to")) || textIn(row, roles.get("to2"));
    const t1 = cellIn(row, roles.get("time1")) || cellIn(row, roles.get("depart"));
    const t2 = cellIn(row, roles.get("time2")) || cellIn(row, roles.get("arrive"));
    const total = textIn(row, roles.get("total")) || textIn(row, roles.get("flightTime"));
    const isLeg = !!(from && to);
    if (isLeg && itemDate) {
      const startTime = t1?.kind === "time" ? t1.time! : parseStatedTimes(t1?.text || "").start;
      const endTime = t2?.kind === "time" ? t2.time! : parseStatedTimes(t2?.text || "").start;
      const words = [t1?.text && !startTime ? `leave ${t1.text}` : "", t2?.text && !endTime ? `arrive ${t2.text}` : "", total].filter(Boolean).join(" · ");
      const isFlight = /\b[A-Z]{2}\s?\d{1,4}\b/.test(from) || /\b(flight|fly|airport)\b/i.test(desc) || /\b[A-Z]{3}\s*-\s*[A-Z]{2}\d/.test(from);
      const isTrain = /shinkansen|train|jr\b|line/i.test(`${total} ${desc}`);
      result.items.push({
        date: itemDate, time: startTime, endTime, kind: isFlight ? "flight" : isTrain ? "train" : "travel",
        title: `${from} → ${to}`, detail: [desc, words].filter(Boolean).join(" · ") || null, place: null,
        confirmation: null, sourceRef: ref((cellIn(row, roles.get("from")) || descCell || dateCell)!.a1), source: readable("travel", r), city,
      });
    }

    if (desc && itemDate && !(isLeg && !confirmationMatch)) {
      const stated = parseStatedTimes(desc);
      const rowStart = t1?.kind === "time" ? t1.time! : parseStatedTimes(t1?.text || "").start;
      const rowEnd = t2?.kind === "time" ? t2.time! : parseStatedTimes(t2?.text || "").start;
      const time = stated.start || (!isLeg ? rowStart : null);
      const endTime = stated.end || (!isLeg && time ? rowEnd : null);
      const kind: InterpretedItem["kind"] = confirmationMatch ? "note"
        : /\btour\b/i.test(desc) ? "tour"
        : /\bmeet\b/i.test(desc) ? "meeting"
        : /\b(dinner|lunch|brunch|breakfast)\b/i.test(desc) ? "meal"
        : date ? "plan" : "note";
      result.items.push({
        date: itemDate, time, endTime, kind, title: desc, detail: null, place: null,
        confirmation: confirmationMatch ? confirmationMatch[1] : null,
        sourceRef: ref(descCell!.a1), source: readable("Description", r), city,
      });
    }

    // Notes columns on rows that aren't stays (stay notes are kept on the stay AND as dated notes)
    for (const role of ["notes", "notes2"] as const) {
      const noteCell = cellIn(row, roles.get(role));
      const note = noteCell?.text.trim();
      if (!note || !itemDate) continue;
      if (/^https?:\/\//i.test(note)) continue; // bare links are kept in the raw tab for Scout
      const stated = parseStatedTimes(note);
      result.items.push({
        date: itemDate, time: stated.start, endTime: stated.end,
        kind: /\bmeet\b/i.test(note) && stated.start ? "meeting" : "note",
        title: note, detail: hotel ? `Noted on ${hotel}` : null, place: null, confirmation: null,
        sourceRef: ref(noteCell!.a1), source: readable("Notes", r), city,
      });
    }
  }
  if (section?.skip) result.skippedSections.push({ title: section.title, reason: section.skipReason, rows: section.rows });

  // The trip runs through the latest check-out morning, even if no row is dated that day.
  for (const s of result.stays) {
    if (s.checkOut && (!result.lastDate || s.checkOut > result.lastDate)) result.lastDate = s.checkOut;
  }

  // Stays with no check-out date: check-in + nights when the Guide gives nights, else the trip's last day. Always say so.
  for (const s of result.stays) {
    if (s.checkOut || !s.checkIn) continue;
    if (s.nights) {
      const d = new Date(s.checkIn + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + s.nights);
      s.checkOut = d.toISOString().slice(0, 10);
    } else {
      s.checkOut = result.lastDate;
    }
    s.checkOutInferred = true;
    result.warnings.push(`${s.hotel}: the Guide gives no check-out date — shown through ${s.checkOut ?? "the end of the trip"}.`);
  }

  // Ambiguity: two stays covering the same night — keep both, say so.
  const nights = new Map<string, InterpretedStay[]>();
  for (const s of result.stays) {
    if (!s.checkIn || !s.checkOut) continue;
    for (let d = new Date(s.checkIn + "T00:00:00Z"); d < new Date(s.checkOut + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      nights.set(key, [...(nights.get(key) || []), s]);
    }
  }
  for (const [night, list] of nights) {
    if (list.length > 1) result.warnings.push(`${night}: the Guide lists more than one hotel for this night — ${list.map((s) => s.hotel).join(" and ")}.`);
  }

  return result;
}
