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
  /** Her forecast for the stay, as written ("lows 57-63, highs 72-76, rain 0-.1 in") */
  weather?: string | null;
  /** Her travel note on the hotel row ("Nagoya -> Tokoname (~40 min) via Meitetsu") */
  travelNote?: string | null;
}

/** Her forecast columns, in her numbers: "lows 57-63, highs 72-76, rain 0-.1 in" */
function weatherWords(lo: string, hi: string, precip: string): string | null {
  const n = (v: string) => v.replace(/(\d)\.0\b/g, "$1");   // a spreadsheet's "64.0" is her 64
  const parts = [lo ? `lows ${n(lo)}` : "", hi ? `highs ${n(hi)}` : "", precip ? `rain ${n(precip)}` : ""].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export interface InterpretedItem {
  date: string | null;         // YYYY-MM-DD
  time: string | null;         // HH:MM
  endTime: string | null;
  // "stop": Larisa's summary in a stop's heading, for every day of that stop (windowStart → date)
  // "block": one time block of her detailed plan for a day (a day-plan tab), in her order
  kind: "flight" | "train" | "travel" | "plan" | "note" | "deadline" | "meeting" | "tour" | "meal" | "checkin" | "checkout" | "stop" | "block" | "weather";
  title: string;
  detail: string | null;
  place: string | null;
  confirmation: string | null;
  sourceRef: string;
  source: string;
  city: string | null;
  /** Larisa's cell exactly as written, when the title is shortened (its opening time moved to the time
   *  column). Anything that quotes her uses this, so a quote is never edited. */
  said?: string;
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
  /** Travel notes on a section's heading row ("Hakata - NOT AN OVERNIGHT (travel through)" · "PT1: Okayama -> Hakata…"),
   *  in her order — a heading row is otherwise skipped, and these were read onto no screen (round 13) */
  sectionTravel?: { title: string; note: string; ref: string }[];
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
  | "time1" | "to2" | "time2" | "total" | "hotel" | "cancellation" | "notes" | "notes2" | "meals"
  | "lo" | "hi" | "precip";

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
    // Her forecast columns (added Sep 29)
    else if (t === "lo" || t === "low") set("lo");
    else if (t === "hi" || t === "high") set("hi");
    else if (t.startsWith("precip") || t === "rain") set("precip");
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

/**
 * Larisa's words without a time that only opens the line, since Wander shows it beside them:
 * "8:30a meet Backroads" → "Meet Backroads". A time anywhere else stays exactly as written —
 * "Team Lab Kyoto (entry window: 11-11:30a)" and "Concludes: 11:30a hotel/12p Kyoto train station"
 * mean something only with their times in place.
 */
export function withoutStatedTime(text: string): string {
  const leading = /^\s*~?\d{1,2}(?::\d{2})?\s*(?:-\s*\d{1,2}(?::\d{2})?\s*)?[ap]m?\b\.?\s*[-–:,]?\s*/i;
  if (!leading.test(text)) return text.trim();
  const stripped = text.replace(leading, "").trim();
  if (!stripped) return text.trim();
  return stripped[0].toUpperCase() + stripped.slice(1);
}

const COMMON_WORDS = new Set(["meet", "with", "the", "and", "from", "into", "day", "trip", "tour", "visit", "check", "time"]);

/**
 * Two lines in the itinerary about the same moment — same day, same stated time, a shared distinctive
 * word ("8:30a meet Backroads" in Description, "Meet Backroads 8:30a Courtyard by Marriott Tokyo
 * Station" in Notes) — become one item: the fuller wording, both sources.
 */
export function mergeSameMoment(items: InterpretedItem[]): InterpretedItem[] {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !COMMON_WORDS.has(w)));
  const out: InterpretedItem[] = [];
  for (const item of items) {
    const twin = item.time && item.date
      ? out.find((o) => o.date === item.date && o.time === item.time && o.kind !== "deadline" && item.kind !== "deadline"
          && Array.from(words(item.title)).some((w) => words(o.title).has(w)))
      : undefined;
    if (!twin) { out.push(item); continue; }
    if (item.title.length > twin.title.length) twin.title = item.title;
    if (twin.kind === "note" || twin.kind === "plan") twin.kind = item.kind;
    twin.endTime ||= item.endTime;
    twin.confirmation ||= item.confirmation;
    twin.place ||= item.place;
    if (item.detail && !(twin.detail || "").includes(item.detail)) twin.detail = [twin.detail, item.detail].filter(Boolean).join(" · ");
    if (!twin.source.includes(item.source)) twin.source = `${twin.source} + ${item.source}`;
  }
  return out;
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
  // Her working notes after the name ("Tokyo - ASK KENJI…", "Hakata - NOT AN OVERNIGHT", a stray
  // ", day trip to Arita)") aren't part of it: a city name never has " - ", a comma or a bracket
  t = t.split(/\s+[-–]\s+|,|\)|\(/)[0].trim();
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
      // Her travel note on the heading row itself
      const headTravel = cellIn(row, roles.get("total"));
      if (!skip && headTravel?.text.trim()) (result.sectionTravel ||= []).push({ title, note: headTravel.text.trim(), ref: ref(headTravel.a1) });
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
    const hotelText = hotelCell?.text.trim() || "";
    // A sentence in her Hotel column is her note for the day, not a place to sleep (Oct 4 copy, T40: "AI estimates our
    // arrival to the hotel (6:15-6:45p) and your arrival (6-6:30p) and to aim for dinner between 7-7:30p" was read as a
    // second hotel for Oct 14–17). Her hotel names run three words at most outside their brackets ("Hotel Granvia
    // Okayama (chk in 3p, chk out 12p)", "Ritz-Carlton, Nikko"); the note ran 17. Kept whole, as a note.
    const hotelIsNote = hotelText.replace(/\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean).length > 6;
    if (hotelIsNote && hotelCell!.kind === "text" && itemDate) {
      result.items.push({
        date: itemDate, time: null, endTime: null, kind: "note", title: hotelText, detail: null, place: null, confirmation: null,
        sourceRef: ref(hotelCell!.a1), source: readable("Hotel", r), city,
      });
    }
    const hotel = hotelIsNote ? "" : hotelText;
    if (hotel && hotelCell!.kind === "text" && date) {
      const checkoutCell = cellIn(row, roles.get("checkout"));
      const nightsCell = cellIn(row, roles.get("nights"));
      const cancelCell = cellIn(row, roles.get("cancellation"));
      const notes = [textIn(row, roles.get("notes")), textIn(row, roles.get("notes2"))].filter(Boolean);
      // Dates she wrote into the hotel's name ("Shiraume (10/25 - 10/27)") are her latest word on the
      // nights — they settle two stays that overlap in the date columns. Used, and said in the report.
      const named = hotel.match(/\(\s*(\d{1,2})\/(\d{1,2})\s*[-–]\s*(\d{1,2})\/(\d{1,2})\s*\)/);
      const yr = date.slice(0, 4);
      const namedIn = named ? `${yr}-${named[1].padStart(2, "0")}-${named[2].padStart(2, "0")}` : null;
      const namedOut = named ? `${yr}-${named[3].padStart(2, "0")}-${named[4].padStart(2, "0")}` : null;
      const hotelName = named ? hotel.replace(named[0], "").replace(/\s{2,}/g, " ").trim() : hotel;
      if (named && (namedIn !== date || namedOut !== (checkoutCell?.date || null))) {
        result.warnings.push(`${hotelName}: using the dates in its name (${named[1]}/${named[2]}–${named[3]}/${named[4]}) — the date columns say ${date} to ${checkoutCell?.date || "?"}.`);
      }
      result.stays.push({
        sectionTitle: section.title,
        city,
        hotel: hotelName,
        checkIn: namedIn || date,
        checkOut: namedOut || checkoutCell?.date || null,
        weather: weatherWords(textIn(row, roles.get("lo")), textIn(row, roles.get("hi")), textIn(row, roles.get("precip"))),
        travelNote: textIn(row, roles.get("total")) || null,
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
    // A row with only her travel note ("PT2: Hakata -> Karatsu…" under the Hakata heading) goes with its section's
    // heading notes — it made nothing at all before (round 13)
    const travelOnly = textIn(row, roles.get("total"));
    if (!hotel && !isLeg && !desc && travelOnly) {
      (result.sectionTravel ||= []).push({ title: section.title, note: travelOnly, ref: ref(cellIn(row, roles.get("total"))!.a1) });
    }
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
      // "Finish at Mashiko Station by 3:45p-4p" is a deadline in her words, not when the day starts
      const byTime = /\b(by|until|before|no later than)\s*~?\d{1,2}(:\d{2})?\s*[ap]/i.test(desc);
      const stated = byTime ? { start: null, end: null } : parseStatedTimes(desc);
      const rowStart = t1?.kind === "time" ? t1.time! : parseStatedTimes(t1?.text || "").start;
      const rowEnd = t2?.kind === "time" ? t2.time! : parseStatedTimes(t2?.text || "").start;
      const time = stated.start || (!isLeg ? rowStart : null);
      const endTime = stated.end || (!isLeg && time ? rowEnd : null);
      // "~3p" is her estimate: kept in her words so no screen (or Scout) states it as exact
      const endText = stated.end ? desc : (!isLeg && time ? t2?.text || "" : "");
      const approxEnd = endTime && /~\s*\d|\b(about|approx|around|ish)\b/i.test(endText)
        ? `The end time is Larisa's estimate ("${(endText.match(/~\s*\d{1,2}(?::\d{2})?\s*[ap]?m?/i) || [endText.trim()])[0].trim()}").`
        : null;
      const kind: InterpretedItem["kind"] = confirmationMatch ? "note"
        : /\btour\b/i.test(desc) ? "tour"
        : /\bmeet\b/i.test(desc) ? "meeting"
        : /\b(dinner|lunch|brunch|breakfast)\b/i.test(desc) ? "meal"
        : date ? "plan" : "note";
      result.items.push({
        date: itemDate, time, endTime, kind, title: stated.start ? withoutStatedTime(desc) : desc,
        // Her note on getting there, written beside the day ("Tokyo → 8:07a Utsunomiya ~50 min Shinkansen…")
        detail: [approxEnd, !isLeg && total ? `Larisa's travel note: ${total}` : null].filter(Boolean).join("\n") || null,
        place: null,
        said: stated.start ? desc.trim() : undefined,
        confirmation: confirmationMatch ? confirmationMatch[1] : null,
        sourceRef: ref(descCell!.a1), source: readable("Description", r), city,
      });
    }

    // Her forecast on a day's own row (a hotel row's forecast goes with the stay)
    const dayWeather = !(hotel && date) ? weatherWords(textIn(row, roles.get("lo")), textIn(row, roles.get("hi")), textIn(row, roles.get("precip"))) : null;
    if (dayWeather && itemDate) {
      result.items.push({
        date: itemDate, time: null, endTime: null, kind: "weather", title: `Larisa's forecast: ${dayWeather}`, detail: null,
        place: null, confirmation: null, sourceRef: ref((cellIn(row, roles.get("lo")) || cellIn(row, roles.get("hi")))!.a1), source: readable("forecast", r), city,
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
        // Which row the note sat on is bookkeeping — the source line keeps it, travelers don't need it. On a hotel's
        // row, which hotel it sits beside is said (round 12: the Four Seasons room type, "Two-Bedroom Heritage Garden
        // Residence", was quoted as Oct 27's itinerary above her real line for the day)
        title: stated.start ? withoutStatedTime(note) : note,
        // Only a room's description — never a meeting or a day's note that happens to share the row ("Meet Backroads
        // 8:30a…" sits on the Ritz-Carlton's row and is the day's first event)
        detail: hotel && date && !stated.start && /\b(bedroom|residence|suite|room|king|queen|twin|double|villa|tatami|ocean view|garden view)\b/i.test(note)
          ? `Beside ${hotel.replace(/\s*\(\s*\d{1,2}\/\d{1,2}\s*[-–]\s*\d{1,2}\/\d{1,2}\s*\)/, "").trim()} in her Itinerary` : null,
        place: null, confirmation: null,
        said: stated.start ? note : undefined,
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

  result.items = mergeSameMoment(result.items);

  return result;
}
