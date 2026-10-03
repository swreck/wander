/**
 * Import a snapshot of Larisa's Guide into a Wander trip.
 *
 * The sheet is the master; Wander's copy is rebuilt from each good snapshot:
 * - The whole snapshot is kept (every tab, every cell, every picture).
 * - Stays, days, dated items, reservations, actions, and ideas are (re)built from it,
 *   updated in place by stable keys so anything a person adds in Wander stays attached.
 * - A read that looks broken is refused and the previous version stays in place.
 *
 * Never writes anywhere but Wander's own database.
 */

import prisma from "../db.js";
import { readGuideXlsx, rowsOf, type GuideReadResult, type GuideTab } from "./reader.js";
import { interpretItinerary, parseStatedTimes, type ItineraryResult, type InterpretedItem } from "./itinerary.js";
import { readGuideImage, whoFromNames, roomFor, type ImageReading } from "./images.js";
import { readGuideText, isBookingProse, tabTextHash, type TextReading } from "./textReader.js";
import { readDayPlans, looksLikeDayPlan, dayPlanHash, verifyAgainstTab, type DayPlanReading } from "./dayPlanReader.js";
import { pictureGroupFor, pictureStartFor } from "./pictureGroup.js";
import { withoutFinancialDetails } from "../sources/filter.js";

export interface ImportOptions {
  buffer: Buffer;
  sourceName: string;             // e.g. "Japan Oct 2026.xlsx"
  importedBy: string;             // display name
  tripId?: string;                // update this trip; omit to create a new one
  tripName?: string;              // for a new trip
  timeZone?: string;              // for a new trip, default Asia/Tokyo
  readPictures?: boolean;         // default true
  readDayPlans?: boolean;         // default true (her day-plan tabs; cached, so only changed tabs are read)
  readText?: boolean;             // default true (her pasted emails/confirmations; cached the same way)
  // Readings already made from the same file elsewhere (another copy of the database), keyed exactly as
  // they're cached here — so the same file imported again reads nothing twice
  seedReadings?: {
    textReadings?: Record<string, TextReading>;
    dayPlanReadings?: Record<string, DayPlanReading>;
    images?: Record<string, { transcription: string | null; facts: unknown }>; // by picture sha256
  };
}

export interface ImportReport {
  accepted: boolean;
  tripId: string | null;
  snapshotId: string | null;
  reasons: string[];              // why a snapshot was refused
  counts: Record<string, number>;
  warnings: string[];
  changes: { added: string[]; removed: string[] };
  pictures: { read: number; cached: number; failed: { tab: string; anchor: string; reason: string }[] };
  textReadings?: Record<string, TextReading>; // cached readings of prose tabs, by tab-text hash
  dayPlanReadings?: Record<string, DayPlanReading>; // cached readings of day-plan tabs, by tab-text hash
  // a day planned twice in one tab: the cell Wander follows and the earlier one(s) (dayPlanVersions)
  supersededPlans?: { tab: string; day: string; current: string; earlier: string[]; why?: string }[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const asDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const addDays = (ymd: string, n: number) => { const d = asDate(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "October 11, 2026, 11:59 PM (JST)" or "2026-10-11, 23:59 (UTC+09:00)" → "2026-10-11". */
function dateFromWords(text: string | null): string | null {
  if (!text) return null;
  const iso = text.match(/(20\d\d)-(\d\d)-(\d\d)/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = text.toLowerCase().match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(20\d\d)/);
  if (m) return `${m[3]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

/** "Hotel Granvia Okayama (chk in 3p, chk out 12p) " → name + the words in parentheses. */
function splitHotel(text: string): { name: string; extra: string | null } {
  const m = text.trim().match(/^(.*?)\s*\((.*)\)\s*$/);
  return m ? { name: m[1].trim(), extra: m[2].trim() } : { name: text.trim(), extra: null };
}

function zoneFor(city: string | null, tripZone: string): string {
  return city && /san francisco/i.test(city) ? "America/Los_Angeles" : tripZone;
}

const AIRPORT_ZONES: Record<string, string> = { SFO: "America/Los_Angeles", LAX: "America/Los_Angeles", KIX: "Asia/Tokyo", NRT: "Asia/Tokyo", HND: "Asia/Tokyo", ITM: "Asia/Tokyo" };
const AIRPORT_NAMES: Record<string, string> = { SFO: "San Francisco", LAX: "Los Angeles", KIX: "Kansai", NRT: "Narita", HND: "Haneda", ITM: "Itami" };
const ZONE_WORDS: Record<string, string> = { "America/Los_Angeles": "California time", "Asia/Tokyo": "Japan time" };

/** "KIX" → "Kansai (KIX)" */
export function airportName(code: string | null | undefined): string {
  if (!code) return "the airport";
  return AIRPORT_NAMES[code] ? `${AIRPORT_NAMES[code]} (${code})` : code;
}

/** "United Airlines", "UA 35" → "United UA35" */
export function flightLabel(airline: string | null | undefined, number: string | null | undefined): string {
  const a = (airline || "").replace(/\s+(Airlines?|Airways|Air Lines)\b.*$/i, "").trim();
  const n = (number || "").replace(/\s+/g, "");
  return [a, n].filter(Boolean).join(" ") || "Flight";
}

/** "2026-10-06", "14:50", Tokyo → "Tue, Oct 6, 2:50 PM Japan time" */
export function plainWhen(date: string | null | undefined, time: string | null | undefined, zone: string): string {
  const day = date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "";
  let clock = "";
  if (time && /^\d{1,2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(":").map(Number);
    clock = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  }
  return [day, clock ? `${clock}${ZONE_WORDS[zone] ? ` ${ZONE_WORDS[zone]}` : ""}` : ""].filter(Boolean).join(", ");
}

// `refs`: every cell (or picture) this line's words came from, when more than its sourceRef — a line merged
// from two tabs, a day-plan line located in her tab. Worked out here, from her cells, at import.
type Item = InterpretedItem & { forWhom?: string | null; link?: string | null; timeZone?: string; windowStart?: string | null; timeText?: string | null; refs?: string[] };

/** Where a line's source is, and her exact words there — what "Sources" under a Scout answer shows */
export type GuideCellWords =
  | { kind: "cell"; tab: string; a1: string; text: string; part?: boolean }  // part: only the lines that bear on it
  | { kind: "picture"; tab: string; anchor: string; sha256: string }
  | { kind: "tab"; tab: string };  // her tab, where Wander couldn't pin the one cell — said so, never guessed

export const flatWords = (s: string) => norm(s).replace(/[‐-―]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

/**
 * The cell in her tab holding a line's own words — the smallest cell containing all of them (a stop list and a
 * narrative can both mention a place; the line itself is the tighter match) — and, in a Time | Plan table,
 * the time cell beside it. Nothing when her words can't be found: the source then names the tab only.
 */
export function cellsHolding(tab: GuideTab, words: string, timeText?: string | null): string[] {
  const want = flatWords(words);
  if (!want) return [];
  let hits = tab.cells.filter((c) => flatWords(c.text).includes(want));
  if (!hits.length) {
    const own = distinctWords(words);
    if (own.length >= 2) hits = tab.cells.filter((c) => own.every((w) => flatWords(c.text).includes(w)));
  }
  if (!hits.length) return [];
  // With a time, the cell that has her time too: "Stop 2: ART AQUARIUM MUSEUM" is in her stop list, but the
  // 11:15 AM – 12:30 PM is in her narrative — a source without the time wouldn't show where it came from
  const t = timeText ? flatWords(timeText) : "";
  const withTime = t ? hits.filter((c) => flatWords(c.text).includes(t)) : [];
  const cell = [...(withTime.length ? withTime : hits)].sort((a, b) => a.text.length - b.text.length)[0];
  const refs = [`${tab.name}!${cell.a1}`];
  if (timeText && !withTime.length) {
    const beside = tab.cells.find((c) => c.r === cell.r && c.a1 !== cell.a1 && t && flatWords(c.text).includes(t));
    if (beside) refs.unshift(`${tab.name}!${beside.a1}`);
  }
  return refs;
}

/**
 * A line read from one row of her table also carries words from that row's other cells (her travel note, the
 * arrival city). Each such cell is a source exactly when its words are in the line — decided here, from her
 * cells, never guessed. Short cells ("3p", "X") are left out: too easily found by accident.
 */
export function rowCellsInLine(ref: string, line: string, read: GuideReadResult): string[] {
  const bang = ref.lastIndexOf("!");
  if (bang < 0) return [];
  const tab = read.tabs.find((t) => t.name === ref.slice(0, bang));
  const own = tab?.cells.find((c) => c.a1 === ref.slice(bang + 1));
  if (!tab || !own) return [];
  const said = flatWords(line);
  return tab.cells
    .filter((c) => c.r === own.r && c.a1 !== own.a1 && flatWords(c.text).length >= 4 && said.includes(flatWords(c.text)))
    .map((c) => `${tab.name}!${c.a1}`);
}

/** Her words at each of a line's sources, from the copy just read */
export function cellWordsFor(refs: string[], read: GuideReadResult): GuideCellWords[] {
  const out: GuideCellWords[] = [];
  for (const ref of Array.from(new Set(refs))) {
    if (ref.startsWith("image:")) {
      const sha = ref.slice(6);
      const at = read.tabs.flatMap((t) => t.images.map((p) => ({ tab: t.name, ...p }))).find((p) => p.sha256 === sha);
      out.push({ kind: "picture", tab: at?.tab || "", anchor: at?.anchor || "", sha256: sha });
      continue;
    }
    const bang = ref.lastIndexOf("!");
    const tabName = bang > 0 ? ref.slice(0, bang) : ref;
    const a1 = bang > 0 ? ref.slice(bang + 1) : "";
    const tab = read.tabs.find((t) => t.name === tabName);
    // A whole row ("Activities Template!37"): its filled cells, left to right
    if (tab && /^\d+$/.test(a1)) {
      const row = tab.cells.filter((c) => c.r === Number(a1) && c.text.trim()).sort((a, b) => a.c - b.c).slice(0, 8);
      if (row.length) { for (const c of row) out.push({ kind: "cell", tab: tabName, a1: c.a1, text: c.text }); continue; }
    }
    const cell = tab && /^[A-Z]+\d+$/.test(a1) ? tab.cells.find((c) => c.a1 === a1) : undefined;
    out.push(cell ? { kind: "cell", tab: tabName, a1, text: cell.text } : { kind: "tab", tab: tabName });
  }
  return out;
}

const GENERIC_WORDS = new Set(["hotel", "the", "ryokan", "residence", "tokyo", "kyoto", "resort", "inn", "and"]);

// Words that don't pick out one place or thing ("lunch", "taxi", "station") — two lines sharing only these
// aren't about the same thing
const PLAN_WORDS = new Set([...GENERIC_WORDS, "lunch", "dinner", "breakfast", "brunch", "light", "reservation", "visit", "stop",
  "return", "leave", "taxi", "board", "reserved", "arrive", "depart", "check", "collect", "luggage", "complimentary",
  "transfer", "station", "market", "street", "walk", "with", "from", "into", "back", "toward", "towards", "optional",
  "easy", "focused", "additional", "traditional", "private", "shower", "change", "rest", "split", "groups", "tour",
  "day", "trip", "then", "after", "before", "early", "late", "time", "flight", "train", "gallery", "cafe", "museum", "shop",
  "michelin", "star", "stars", "japanese", "style"]);
/** A word and its plural read as one ("sweets" / "sweet") */
export const stem = (w: string) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
/** Place words many stops share — never enough alone to say which stop a line means */
const PLACE_WORDS = new Set(["temple", "shrine", "garden", "bridge", "building", "center", "centre", "pottery", "ceramic",
  "restaurant", "house", "hotel", "residence", "village", "district", "avenue", "crossing", "flagship", "department",
  "souvenir", "kitchen", "noodle", "festival", "viewpoint", "observatory", "station", "airport", "terminal"]);
/** "Café ENSOU lunch" → ["ensou"]; "Board reserved HARUKA" → ["haruka"] */
export function distinctWords(s: string): string[] {
  return Array.from(new Set(s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !PLAN_WORDS.has(w) && !/^\d+$/.test(w))));
}

/**
 * Her pasted map links are sometimes a Google search of a Maps address
 * ("google.com/search?q=https://maps.apple.com/%3Fq%3DFour%2BSeasons…") — tapped, that opens a search page,
 * not Maps. The Maps address inside is the link she meant.
 */
export function unwrapSearchLink(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)google\.[a-z.]+$/i.test(u.hostname) && u.pathname === "/search") {
      const q = u.searchParams.get("q") || "";
      // Encoded twice in her cell (Gemini's links: "maps.apple.com/%253Fq%253D…"): one decode leaves
      // "/%3Fq%3D…", which Maps can't read (round 9) — decode the inner address once more
      if (/^https?:\/\//i.test(q)) {
        if (!/%3[fd]/i.test(q)) return q;
        try { return decodeURIComponent(q); } catch { return q; }
      }
    }
  } catch { /* not a URL — keep as is */ }
  return url;
}

/** "13:30" → "1:30 PM" */
const clock12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
// "Dining Resos (row 30)" → "Dining Resos"; "Kyoto Thu, 1029 (Flight Home) · Day 5" → "Kyoto Thu, 1029 (Flight Home)"
const tabOf = (source: string) => (/itinerary/i.test(source) ? "Itinerary" : source.split(/ · | \(row /)[0]);

/**
 * Whose a line is, from her own shorthand on the same date: "day 1 - JA Arrive (evening), KL day trip to
 * Mashiko" names Ken & Larisa (her "K/L") for Mashiko that day, so the Mashiko day-trip line with no names on it
 * is theirs — quoted as her words, never guessed (round 10: Julie's first day opened on it, unlabelled, and
 * three testers asked "am I supposed to catch that 8:07 train?"). A couple's initials come from the trip's own
 * couples ("Ken & Larisa" → KL, K/L, K&L). Only a distinctive place word counts, only one couple may claim it
 * that day, and a line that already names people is never changed.
 */
const SHORTHAND_STOP = new Set(["arrive", "arrival", "evening", "morning", "afternoon", "travel", "train", "trip", "tour", "night", "dinner", "lunch", "hotel", "depart", "leave", "flight", "check", "free", "shopping"]);
export function tagPartiesFromShorthand(items: Item[]): void {
  const couples = Array.from(new Set(items.map((i) => i.forWhom).filter((w): w is string => !!w && / & /.test(w) && !/everyone/i.test(w))));
  const byInitials = couples.map((c) => {
    const [a, b] = c.split(/\s*&\s*/);
    return a && b ? { couple: c, re: new RegExp(`(?:^|[\\s,(])${a[0]}\\s*[/&]?\\s*${b[0]}\\s+([^,;()\\n]+)`, "g") } : null;
  }).filter(Boolean) as { couple: string; re: RegExp }[];
  const byDate = new Map<string, Item[]>();
  for (const i of items) if (i.date) byDate.set(i.date, [...(byDate.get(i.date) || []), i]);
  for (const [, day] of byDate) {
    // word → the couple her shorthand gives it to, and the words she wrote
    const claims = new Map<string, { couple: string; said: string } | null>();
    for (const line of day) {
      for (const { couple, re } of byInitials) {
        for (const m of line.title.matchAll(re)) {
          // Two couples in one subject ("K/L, J/A depart Osaka") — it's everyone's, not this couple's
          const before = line.title.slice(0, m.index ?? 0);
          if (byInitials.some((o) => o.couple !== couple && new RegExp(`${o.couple.split(/\s*&\s*/).map((n) => n[0]).join("\\s*[/&]?\\s*")}\\s*(,|and|&)?\\s*$`, "i").test(before))) continue;
          for (const w of m[1].toLowerCase().split(/[^a-z]+/).filter((x) => x.length >= 5 && !SHORTHAND_STOP.has(x))) {
            const had = claims.get(w);
            claims.set(w, had === undefined ? { couple, said: m[0].replace(/^[\s,(]+/, "").trim() } : had && had.couple === couple ? had : null);
          }
        }
      }
    }
    for (const i of day) {
      if (i.forWhom || !["plan", "tour", "note"].includes(i.kind)) continue;
      const words = i.title.toLowerCase().split(/[^a-z]+/);
      const hit = Array.from(claims.entries()).find(([w, c]) => c && words.includes(w) && !byInitials.some(({ re }) => { re.lastIndex = 0; return re.test(i.title); }));
      if (!hit || !hit[1]) continue;
      i.forWhom = hit[1].couple;
      i.detail = [i.detail, `For ${hit[1].couple}: her Itinerary line this day says “${hit[1].said}”.`].filter(Boolean).join("\n");
    }
  }
}

/**
 * Her note for a stay, from its heading: everything she wrote there except the city's name — the part in
 * brackets and her working notes before or after it. Round 9: "Okayama (day trip to Bizen - 40 min JR
 * train) - WHERE IS BIZEN TOUR STARTING" kept only the brackets, so her open question vanished and the tour
 * looked settled. A stray bracket ("(tour Karatsu - coordinate pu for tour), day trip to Arita)") never cuts
 * the note in half. A Backroads leg's "(Day 1-4)" is its day count, not a note. Null when there's none.
 */
export function stopNoteOf(sectionTitle: string): string | null {
  const open = sectionTitle.indexOf("(");
  const close = sectionTitle.lastIndexOf(")");
  const inner = open >= 0 && close > open ? sectionTitle.slice(open + 1, close) : "";
  if (/^\s*day\s*\d/i.test(inner)) return null;
  let depth = 0;
  const bracketed = Array.from(inner).filter((ch) => {
    if (ch === "(") { depth++; return true; }
    if (ch === ")") { if (depth === 0) return false; depth--; }
    return true;
  }).join("").replace(/\s{2,}/g, " ").trim();
  // Before the brackets, after the city's name: "Hakata - NOT AN OVERNIGHT (travel through)"
  const head = open >= 0 ? sectionTitle.slice(0, open) : sectionTitle;
  const lead = /\s[-–]\s/.test(head) ? head.replace(/^.*?\s[-–]\s+/, "").replace(/\s{2,}/g, " ").trim() : "";
  // After the brackets: "… 40 min JR train) - WHERE IS BIZEN TOUR STARTING"
  const tail = close >= 0 ? sectionTitle.slice(close + 1).replace(/^[\s,;:–-]+/, "").replace(/\s{2,}/g, " ").trim() : "";
  const note = [lead, bracketed, tail].filter(Boolean).join(" — ");
  return note || null;
}

/**
 * Where her tabs disagree about the same thing, both lines say so — Wander never settles it. A line of
 * her day plan and another tab's line that name the same distinctive thing ("HARUKA", "ENSOU") at times
 * 30+ minutes apart: her Oct 29 day tab boards the Haruka "~12:30–1:00", her Itinerary note says
 * "1:30-2:00p Haruka"; Dining Resos lists Cafe Ensou at 8 PM, her Oct 28 tab has it as the 1:00 lunch.
 * Each line gets "Tabs differ: …" quoting the other, which every screen shows on the line itself.
 */
export function markTabsDiffer(items: Item[]): void {
  const note = (i: Item, line: string) => { if (!(i.detail || "").includes(line)) i.detail = [i.detail, line].filter(Boolean).join("\n"); };
  for (const b of items) {
    if (b.kind !== "block" || !b.time || !b.date) continue;
    const words = distinctWords(b.title);
    if (!words.length) continue;
    const blockSaid = `"${b.title}" at ${b.timeText || clock12(b.time)}`;
    for (const o of items) {
      if (o === b || o.date !== b.date || o.kind === "block" || ["checkout", "checkin", "deadline", "weather", "stop"].includes(o.kind)) continue;
      // The same booked place, but her day tab puts it in a neighbourhood its address doesn't name:
      // "DINNER RESERVATION – Yakiniku Yazawa Tokyo (Ginza)" vs "Address: … 5-10 Yaesu 1-chome" (round 7)
      const area = b.title.match(/\(([^)]+)\)\s*$/)?.[1];
      const address = (o.detail || "").match(/^Address: ([^\n]+)/m)?.[1];
      if (area && address && o.kind === "meal" && o.time === b.time && words.some((w) => distinctWords(o.title).includes(w))) {
        const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const named = area.split(/[/,&]| and /).map((x) => fold(x).trim()).filter((x) => x.length > 2);
        if (named.length && !named.some((x) => fold(address).includes(x))) {
          note(b, `Tabs differ: her ${tabOf(b.source)} tab puts it in ${area}; her ${tabOf(o.source)} address is "${address}".`);
          note(o, `Tabs differ: her ${tabOf(b.source)} tab puts it in ${area}; this address is her ${tabOf(o.source)} tab's.`);
        }
      }
      // The same time and the same name, but each names a different restaurant: her day tab's "DINNER RESERVATION –
      // Gastronomy "Joël Robuchon" (Ebisu)" vs the booking "LeTable de Joel Robuchon - 1F" (round 12 — one building,
      // two restaurants, two dress codes; nothing flagged it). A place in brackets is the rule above's business.
      if (o.kind === "meal" && o.time === b.time) {
        const nameWords = (s: string) => new Set(distinctWords(s.split("\n")[0].replace(/^[A-Z][A-Z &-]+\s+[–-]\s+/, "").replace(/\([^)]*\)/g, "")));
        const bw = nameWords(b.title), ow = nameWords(o.title);
        const shared = [...bw].some((w) => ow.has(w));
        const onlyB = [...bw].filter((w) => !ow.has(w)), onlyO = [...ow].filter((w) => !bw.has(w));
        if (shared && onlyB.length && onlyO.length) {
          note(b, `Tabs differ: her ${tabOf(o.source)} tab's booking at this time is "${o.title.split("\n")[0]}".`);
          note(o, `Tabs differ: her ${tabOf(b.source)} tab has ${blockSaid}.`);
          continue;
        }
      }
      // Another tab's line for the same thing, at another time
      const oWords = distinctWords(o.title);
      if (o.time && words.some((w) => oWords.includes(w)) && Math.abs(toMinutes(o.time) - toMinutes(b.time)) >= 30) {
        note(b, `Tabs differ: her ${tabOf(o.source)} tab has "${o.title.split("\n")[0]}" at ${clock12(o.time)}.`);
        note(o, `Tabs differ: her ${tabOf(b.source)} tab has ${blockSaid}.`);
        continue;
      }
      // A note on another tab's line that names it with a time ("1:30-2:00p Haruka from Kyoto to KIX")
      for (const seg of (o.detail || "").split(/\n| — |; /)) {
        // Her words only — never Wander's own notes ("Tabs differ: …", "Time from the … tab") or a chain
        // reaction follows ("Depart Shigaraki" matched the tab name inside another line's note)
        if (/^(Tabs differ:|Time from the |The .+ tab lists |Wander matched |Times are Larisa's|Address:)/.test(seg.trim())) continue;
        if (!words.some((w) => distinctWords(seg).includes(w))) continue;
        // A time has minutes or an am/pm ("1:30-2:00p", "8p") — never a bare number ("Michelin 1 star")
        const t = seg.match(/\b(\d{1,2}):(\d{2})\s*(?:(a|p)\.?m?\b)?(?:\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(a|p)\.?m?\b)?/i)
          || seg.match(/\b(\d{1,2})()\s*(a|p)\.?m?\b/i);
        if (!t) continue;
        const half = (t[3] || t[4] || "").toLowerCase();
        let h = Number(t[1]) % 12;
        if (half === "p" || (!half && h < 7)) h += 12;
        const mins = h * 60 + Number(t[2] || 0);
        if (Math.abs(mins - toMinutes(b.time)) < 30) continue;
        const said = seg.replace(/^Larisa's (travel )?note:\s*/i, "").replace(/^"|"$/g, "").trim();
        note(b, `Tabs differ: her ${tabOf(o.source)} tab says "${said}".`);
        note(o, `Tabs differ: her ${tabOf(b.source)} tab has ${blockSaid}.`);
        break;
      }
    }
  }
}
/** Two hotel names refer to the same place when they share a distinctive word ("IMPERIAL HOTEL, TOKYO" ~ "Imperial Hotel"). */
function sharesName(a: string, b: string): boolean {
  const words = (s: string) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !GENERIC_WORDS.has(w)));
  const wa = words(a);
  return Array.from(words(b)).some((w) => wa.has(w));
}

function mergePeople(a: string | null | undefined, b: string | null | undefined): string | null {
  const names = new Set<string>();
  for (const w of [a, b]) {
    if (!w) continue;
    if (w === "Everyone") return "Everyone";
    w.split(" & ").forEach((n) => names.add(n.trim()));
  }
  if (["Ken", "Larisa", "Julie", "Andy"].every((n) => names.has(n))) return "Everyone";
  return names.size ? Array.from(names).join(" & ") : null;
}

/**
 * Two sources describing the same thing (Larisa's itinerary row and a booking screenshot)
 * become one item: her words stay the title; the other source fills in what's missing.
 */
function mergeInto(items: Item[], cand: Item, matches: (i: Item) => boolean): void {
  const existing = items.find(matches);
  if (!existing) { items.push(cand); return; }
  if (cand.confirmation && existing.confirmation !== cand.confirmation) {
    existing.confirmation = existing.confirmation
      ? `${existing.forWhom ? existing.forWhom + " " : ""}${existing.confirmation} · ${cand.forWhom ? cand.forWhom + " " : ""}${cand.confirmation}`
      : cand.confirmation;
  }
  existing.forWhom = mergePeople(existing.forWhom, cand.forWhom);
  // Each source's details on their own line (details are short labelled lines)
  if (cand.detail && !(existing.detail || "").includes(cand.detail)) existing.detail = [existing.detail, cand.detail].filter(Boolean).join("\n");
  if (!existing.time && cand.time) existing.time = cand.time;
  if (!existing.endTime && cand.endTime) existing.endTime = cand.endTime;
  if (!existing.place && cand.place) existing.place = cand.place;
  if (!existing.link && cand.link) existing.link = cand.link;
  if (!existing.source.includes(cand.source)) existing.source = `${existing.source} + ${cand.source}`;
  // Both lines' cells stay its sources (only the first one's was kept before)
  existing.refs = Array.from(new Set([...(existing.refs || [existing.sourceRef]), ...(cand.refs || [cand.sourceRef])]));
}

const minutesOf = (t: string | null | undefined) => {
  const m = (t || "").match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const QUESTION_STOP = new Set([...GENERIC_WORDS, "trip", "tour", "visit", "dinner", "lunch", "museum", "town", "village", "temple", "shrine", "garden", "market", "street", "from", "with"]);

/**
 * Last pass over the day-by-day items, after every source is merged:
 * - A flight's arrival is never its "end time" (it's another zone, often the next day), and its time
 *   is in the departure airport's zone, whichever city row it sat under.
 * - A day note that is really the flight ("6:30p flight" beside a 6:35 PM departure) folds into the
 *   flight, in Larisa's words, so it doesn't read as a second flight.
 * - An open question from the Activities tab ("1 day to Mashiko-Julie interested?") travels to every
 *   other day that mentions the same trip, so none of them reads as settled.
 */
export function tidyItems(items: Item[], openQuestions: { name: string; text: string; date: string }[]): void {
  for (const f of items) {
    if (f.kind !== "flight") continue;
    f.endTime = null;
    const code = (f.title.match(/\b[A-Z]{3}\b/g) || []).find((c) => AIRPORT_ZONES[c]);
    if (code && !/^Land at/.test(f.title) && !f.source.includes("Screenshot")) f.timeZone = AIRPORT_ZONES[code];
  }

  // A row that only repeats a confirmation code already on that day's booking ("confirmation: : ABC123")
  const repeats = new Set<Item>();
  for (const n of items) {
    if (!["note", "plan"].includes(n.kind)) continue;
    const code = n.title.match(/^\s*confirmation\s*[:#]*\s*[:#]*\s*([A-Za-z0-9-]{5,})\s*$/i)?.[1];
    if (code && items.some((o) => o !== n && o.date === n.date && (o.confirmation || "").includes(code))) repeats.add(n);
  }
  for (let k = items.length - 1; k >= 0; k--) if (repeats.has(items[k])) items.splice(k, 1);

  const folded = new Set<Item>();
  for (const f of items) {
    if (f.kind !== "flight" || /^Land at/.test(f.title)) continue;
    const at = minutesOf(f.time);
    if (at === null) continue;
    for (const n of items) {
      if (n === f || folded.has(n) || n.date !== f.date || !["note", "plan", "travel"].includes(n.kind)) continue;
      const nt = minutesOf(n.time);
      if (nt === null || Math.abs(nt - at) > 15 || !/\b(flight|fly|flies|plane)\b/i.test(`${n.title} ${n.detail || ""}`)) continue;
      // Quoted exactly as she wrote it ("6:30p flight - travel day…"), never with its time taken out
      // Each of her notes on its own line — "Larisa's note: … — Larisa's travel note: …" ran together
      f.detail = [f.detail, `Larisa's note: "${n.said || n.title}"`, n.detail || null].filter(Boolean).join("\n");
      if (!f.source.includes(n.source)) f.source = `${f.source} + ${n.source}`;
      folded.add(n);
    }
  }
  // A note with no time on the same sheet row as a flight is about that flight ("ANA part of Star
  // Alliance" beside Ken & Larisa's UA35) — on its own it showed to everyone as a line of its own
  const rowOf = (s: string) => s.match(/^([^·(]+?)\s*·[^(]*\(row (\d+)\)/);
  for (const n of items) {
    if (folded.has(n) || n.kind !== "note" || n.time || n.forWhom) continue;
    const nr = rowOf(n.source);
    if (!nr) continue;
    const f = items.find((o) => o.kind === "flight" && !/^Land at/.test(o.title) && o.date === n.date
      && o.source.split(" + ").some((part) => { const r = rowOf(part); return !!r && r[1] === nr[1] && r[2] === nr[2]; }));
    if (!f) continue;
    f.detail = [f.detail, `Larisa's note: "${n.said || n.title}"`].filter(Boolean).join("\n");
    if (!f.source.includes(n.source)) f.source = `${f.source} + ${n.source}`;
    folded.add(n);
  }
  for (let k = items.length - 1; k >= 0; k--) if (folded.has(items[k])) items.splice(k, 1);

  for (const q of openQuestions) {
    const words = norm(q.name).split(/[^a-z]+/).filter((w) => w.length >= 5 && !QUESTION_STOP.has(w));
    if (!words.length) continue;
    const when = new Date(`${q.date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    for (const i of items) {
      if (!i.date || i.date === q.date || !["plan", "tour", "meal", "travel", "note"].includes(i.kind) || i.title.startsWith("Maybe:")) continue;
      if (!words.some((w) => norm(i.title).includes(w))) continue;
      const line = `Still open in the Guide: ${q.name} is also marked for ${when} ("${q.text}")`;
      if (!(i.detail || "").includes(line)) i.detail = [i.detail, line].filter(Boolean).join("\n");
    }
  }
}

export const REMOVED_PREFIX = "Removed from Guide|";

/**
 * Larisa changes her sheet during the trip; Wander re-reads it. Anything people added in Wander
 * must survive that. Most of it lives apart from the Guide and is never touched. The one risk: an
 * idea of hers that people wrote on (notes, reactions, looked-up ratings, a same-day plan, a note on
 * the idea itself) and that is gone from the new copy — renamed, moved, or removed.
 * - Renamed (one new idea in the same city shares a distinctive word): everything moves onto it.
 * - Otherwise: the old idea stays, marked "no longer in Larisa's Guide", with everything on it.
 * Ideas nobody wrote on simply go, as before.
 */
export async function keepWhatPeopleAdded(
  tx: any, tripId: string, ideaRefs: string[], createdNow: { id: string; cityId: string; name: string }[],
  report: { warnings: string[] },
): Promise<void> {
  const gone = await tx.experience.findMany({
    where: { tripId, sheetRowRef: { startsWith: "Activities Template|", notIn: ideaRefs.length ? ideaRefs : ["__none__"] } },
    include: { notes: { select: { id: true } }, reactions: { select: { id: true } }, ratings: { select: { id: true } } },
  });
  for (const g of gone) {
    const plans = await tx.dayChoice.count({ where: { tripId, experienceId: g.id } });
    const written = g.notes.length + g.reactions.length + g.ratings.length + plans + (g.userNotes ? 1 : 0);
    if (!written) continue;
    const words = norm(g.name).split(/[^a-z]+/).filter((w: string) => w.length > 3 && !QUESTION_STOP.has(w));
    const matches = createdNow.filter((e) => e.cityId === g.cityId && words.some((w: string) => norm(e.name).includes(w)));
    if (matches.length === 1) {
      const to = matches[0].id;
      await tx.experienceNote.updateMany({ where: { experienceId: g.id }, data: { experienceId: to } });
      await tx.experienceRating.updateMany({ where: { experienceId: g.id }, data: { experienceId: to } });
      await tx.dayChoice.updateMany({ where: { tripId, experienceId: g.id }, data: { experienceId: to } });
      // Reactions one by one: the new idea has none yet, but never let a clash lose the rest
      for (const r of g.reactions) {
        await tx.experienceReaction.update({ where: { id: r.id }, data: { experienceId: to } }).catch(() => {});
      }
      const carry: Record<string, unknown> = {};
      if (g.userNotes) carry.userNotes = g.userNotes;
      if (g.latitude !== null && g.longitude !== null) Object.assign(carry, { latitude: g.latitude, longitude: g.longitude, placeIdGoogle: g.placeIdGoogle, locationStatus: g.locationStatus });
      if (Object.keys(carry).length) await tx.experience.update({ where: { id: to }, data: carry });
      report.warnings.push(`"${g.name}" is now "${matches[0].name}" in the Guide — notes and plans on it moved across.`);
    } else {
      await tx.experience.update({ where: { id: g.id }, data: { sheetRowRef: `${REMOVED_PREFIX}${g.sheetRowRef}`, dayId: null, state: "possible" } });
      report.warnings.push(`"${g.name}" is no longer in the Guide — kept in Wander, marked that way, because people wrote on it.`);
    }
  }
}

// ── Other tabs ──────────────────────────────────────────────────

interface ParsedAction { action: string; owner: string; dueDate: string | null; notes: string | null; andyStatus: string | null; larisaStatus: string | null; statusNotes: string | null; ref: string }

/** Actions tab, found by headers ("Actions", "Owner"), columns matched by name. */
function parseActionsTab(tabs: GuideTab[]): ParsedAction[] {
  for (const tab of tabs) {
    const rows = rowsOf(tab);
    for (const [r, cells] of rows) {
      const header = new Map(cells.map((c) => [norm(c.text), c.c]));
      if (!header.has("actions") || !header.has("owner")) continue;
      const col = (name: string) => header.get(name);
      const out: ParsedAction[] = [];
      for (const [rr, row] of rows) {
        if (rr <= r) continue;
        const at = (c: number | undefined) => (c === undefined ? null : row.find((x) => x.c === c)?.text.trim() || null);
        const action = at(col("actions"));
        if (!action) continue;
        out.push({
          action, owner: at(col("owner")) || "Both", dueDate: at(col("due dates")) || at(col("due date")),
          notes: at(col("notes")), andyStatus: at(col("andy status")), larisaStatus: at(col("larisa status")),
          statusNotes: at(col("status notes")), ref: `${tab.name}|${action}`,
        });
      }
      return out;
    }
  }
  return [];
}

interface ParsedIdea {
  name: string; city: string; section: string; area: string | null; comment: string | null; url: string | null;
  interested: string[]; dates: string[]; dateNotes: string[]; ref: string; row: number;
  /** Every date column with a mark. A mark that says more than "X" ("X, if Julie isn't interested") is tentative. */
  marks: { date: string; text: string; firm: boolean }[];
}

/** Activities template: a header row naming the four travelers, section headers like "Tokyo - Activities". */
export function parseIdeasTab(tabs: GuideTab[], tripYear: string): ParsedIdea[] {
  const people = ["julie", "andy", "larisa", "ken"];
  for (const tab of tabs) {
    const rows = rowsOf(tab);
    for (const [r, cells] of rows) {
      const personCols = new Map<string, number>();
      for (const c of cells) if (people.includes(norm(c.text))) personCols.set(norm(c.text), c.c);
      if (personCols.size < 3) continue;
      const sectionCell = cells.find((c) => / - /.test(c.text) && !people.includes(norm(c.text)));
      if (!sectionCell) continue;
      const sectionCol = sectionCell.c;
      const nameCol = sectionCol + 1;
      const areaCol = sectionCol + 2;
      const commentCol = cells.find((c) => norm(c.text) === "comment")?.c;
      const urlCol = cells.find((c) => norm(c.text) === "url")?.c;
      const dateCols: { c: number; date: string }[] = [];
      for (const c of cells) {
        const m = c.text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (m) dateCols.push({ c: c.c, date: `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` });
      }
      void tripYear;
      let section = sectionCell.text.trim();
      const out: ParsedIdea[] = [];
      for (const [rr, row] of Array.from(rows.entries()).sort((a, b) => a[0] - b[0])) {
        if (rr < r) continue;
        const at = (c: number | undefined) => (c === undefined ? null : row.find((x) => x.c === c)?.text.trim() || null);
        const sec = at(sectionCol);
        if (sec && / - /.test(sec)) section = sec;
        const name = at(nameCol);
        if (!name || rr === r) continue;
        // An X is a mark; "Maybe" stays a maybe ("Larisa (maybe)") — never shown as a firm interest
        const interested = Array.from(personCols.entries())
          .filter(([, c]) => /^(x|yes|maybe)$/i.test(at(c) || ""))
          .map(([p, c]) => `${p[0].toUpperCase() + p.slice(1)}${/^maybe$/i.test(at(c) || "") ? " (maybe)" : ""}`);
        const marks = dateCols.filter((d) => !!at(d.c)).map((d) => ({ date: d.date, text: at(d.c)!, firm: /^(x|yes)$/i.test(at(d.c)!) }));
        out.push({
          name, city: section.split(" - ")[0].trim(), section: section.split(" - ").slice(1).join(" - ").trim(),
          area: at(areaCol), comment: commentCol ? at(commentCol) : null, url: urlCol ? at(urlCol) : null,
          interested, marks, row: rr,
          // Only a plain mark puts the idea on that day
          dates: marks.filter((m) => m.firm).map((m) => m.date),
          // A tick that says more than "X" keeps its words, e.g. "X, if Julie isn't interested"
          dateNotes: marks.filter((m) => !m.firm).map((m) => `${m.date.slice(5).replace("-", "/")}: ${m.text}`),
          ref: `${tab.name}|${name}`,
        });
      }
      return out;
    }
  }
  return [];
}

/** Dinner reservation tab rows like "Sa, 10/17 @6p" + restaurant name to the right. */
function parseReservations(tabs: GuideTab[], year: string): (InterpretedItem & { link: string | null; refs?: string[] })[] {
  const out: (InterpretedItem & { link: string | null; refs?: string[] })[] = [];
  for (const tab of tabs) {
    if (!/reso|reservation|dinner/i.test(tab.name)) continue;
    const rows = rowsOf(tab);
    for (const [r, cells] of rows) {
      const sorted = [...cells].sort((a, b) => a.c - b.c);
      const dateCell = sorted.find((c) => /^(mo|tu|we|th|fr|sa|su)[a-z]*,?\s*\d{1,2}\/\d{1,2}/i.test(c.text.trim()));
      if (!dateCell) continue;
      const m = dateCell.text.match(/(\d{1,2})\/(\d{1,2})/)!;
      const nameCell = sorted.find((c) => c.c > dateCell.c && c.kind === "text" && !/^https?:/i.test(c.text));
      if (!nameCell) continue; // a date with nothing booked yet stays in the raw tab
      const detailCell = sorted.find((c) => c.c > nameCell.c && c.kind === "text" && !/^https?:/i.test(c.text));
      const linkCell = sorted.find((c) => c.c > nameCell.c && (c.link || /^https?:/i.test(c.text)));
      const at = dateCell.text.match(/@\s*([\d:]+\s*[ap])/i);
      const noReso = /no\s*resos?\b|no reservation/i.test(dateCell.text);
      out.push({
        date: `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`,
        time: at ? parseStatedTimes(at[1]).start : null, endTime: null, kind: "meal",
        // The name is the first line; what she wrote under it ("(Michelin 1 star - Tempura)") is detail
        title: nameCell.text.split("\n")[0].trim(),
        detail: [
          noReso ? "No reservation" : null,
          nameCell.text.split("\n").slice(1).map((l) => l.trim()).filter(Boolean).join(" · ") || null,
          // Her next column is the place's address block, which can open with a building's name
          // ("Château Restaurant Joël Robuchon · Reception Yasuda · Yebisu Garden Place…" for La Table,
          // 1F) — labelled, so nobody reads it as the name of the restaurant booked
          detailCell ? `Address: ${detailCell.text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 3).join(" · ")}` : null,
        ].filter(Boolean).join("\n") || null,
        place: null, confirmation: null, sourceRef: `${tab.name}!${nameCell.a1}`, source: `${tab.name} (row ${r})`, city: null,
        link: linkCell?.link || linkCell?.text || null,
        // Its date and time, its name and its address each come from their own cell
        refs: [dateCell, nameCell, detailCell].filter((c): c is NonNullable<typeof c> => !!c).map((c) => `${tab.name}!${c.a1}`),
      });
    }
  }
  // Two places on the same date and time: a choice, or not yet settled — Wander doesn't guess which;
  // each line says so, in plain words
  for (const a of out) {
    const same = out.filter((b) => b.date === a.date && b.time === a.time && b.source.split(" (")[0] === a.source.split(" (")[0]);
    if (same.length < 2) continue;
    const names = same.map((b) => b.title.split("\n")[0].trim());
    const line = `The ${a.source.split(" (")[0]} tab lists ${same.length} places for this date${a.time ? " and time" : ""}: ${names.join(" and ")}.`;
    if (!(a.detail || "").includes(line)) a.detail = [a.detail, line].filter(Boolean).join("\n");
  }
  return out;
}

/**
 * Which reader a tab gets. Her reservations tab ("Dinner Resos", now "Dining Resos") is read as
 * reservations; a tab that plans days is read as a day plan; each tab by one reader only, so nothing
 * shows twice and no fact from one tab lands on another's line.
 */
function isDayPlanTab(name: string, text: string): boolean {
  if (/reso|reservation/i.test(name)) return false;
  return looksLikeDayPlan(text);
}

/**
 * Two whole plans for the same day in one tab (Oct 2: she added a revised "Day 2" — other times, Akihabara moved to
 * midday — below the old one in A44, and kept the old). Wander follows one, the same way every time, and says so:
 * the one new since Wander's last copy of her Guide; with no last copy to tell by, the one lower in her tab. Only that
 * one is read into the day; the other stays in her tab, marked for Scout as the earlier version. A plan cell is one
 * holding three or more time ranges under a "Day N" heading.
 */
export type PlanChoiceKept = { tab: string; day: string; current: string; earlier: string[]; why?: string };
export function dayPlanVersions(tab: GuideTab, prevTab: GuideTab | undefined, prevChoices: PlanChoiceKept[] = []): { superseded: Set<string>; notes: Map<string, { note: string; current: string; earlier: string[]; why: string }> } {
  const RANGE = /\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*[–—-]\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)/gi;
  const dayNoOf = (t: string) => t.match(/\bDay\s*(\d+)\s*[:–—-]/i)?.[1];
  const groups = new Map<string, GuideTab["cells"]>();
  for (const c of tab.cells) {
    const n = dayNoOf(c.text || "");
    if (!n || (c.text.match(RANGE) || []).length < 3) continue;
    groups.set(n, [...(groups.get(n) || []), c]);
  }
  const before = new Set((prevTab?.cells || []).map((c) => (c.text || "").trim()));
  const superseded = new Set<string>();
  const notes = new Map<string, { note: string; current: string; earlier: string[]; why: string }>();
  for (const [n, cells] of groups) {
    if (cells.length < 2) continue;
    // The choice made when the new version first arrived, kept while both versions stay as they were — a re-import of
    // the same file has nothing "new" to tell by, and the reason flipped to "lower in the tab" (Oct 2, second import)
    const kept = prevChoices.find((k) => k.tab === tab.name && k.day === n && k.why);
    const keptCell = kept && prevTab ? cells.find((c) => c.a1 === kept.current && prevTab.cells.some((p) => p.a1 === c.a1 && (p.text || "").trim() === (c.text || "").trim())) : undefined;
    const sameSet = !!kept && kept.earlier.every((a1) => cells.some((c) => c.a1 === a1)) && cells.length === kept.earlier.length + 1;
    const fresh = prevTab ? cells.filter((c) => !before.has((c.text || "").trim())) : [];
    const current = keptCell && sameSet ? keptCell : fresh.length === 1 ? fresh[0] : [...cells].sort((a, b) => b.r - a.r || b.c - a.c)[0];
    const earlier = cells.filter((c) => c !== current);
    for (const c of earlier) superseded.add(c.a1);
    // (what Wander knows: it wasn't in her last copy and the other was — not a date; an import date isn't hers)
    const why = keptCell && sameSet ? kept!.why! : fresh.length === 1 ? "the one she added most recently" : "the one lower in the tab";
    notes.set(n, {
      current: current.a1, earlier: earlier.map((c) => c.a1), why,
      note: `Her tab has ${cells.length} versions of this day's plan: Wander follows ${current.a1} (${why}); ${earlier.map((c) => c.a1).join(" and ")} ${earlier.length === 1 ? "has" : "have"} other times — worth checking with Larisa which is current.`,
    });
  }
  return { superseded, notes };
}

// ── Validation ──────────────────────────────────────────────────

function validate(read: GuideReadResult, itin: ItineraryResult | null, previous: any | null): string[] {
  const reasons: string[] = [];
  if (!itin) reasons.push("No itinerary tab found (looked for a tab with \"Date\" and \"Description\" headers).");
  if (itin && !itin.firstDate) reasons.push("The itinerary has no dates.");
  if (itin && itin.stays.length === 0) reasons.push("The itinerary has no hotel stays.");
  const prevCounts = previous?.report?.counts as Record<string, number> | undefined;
  if (itin && prevCounts) {
    if (prevCounts.stays && itin.stays.length < prevCounts.stays / 2) reasons.push(`Only ${itin.stays.length} hotel stays, down from ${prevCounts.stays} — this looks like a partial read.`);
    if (prevCounts.tabs && read.tabs.length < prevCounts.tabs / 2) reasons.push(`Only ${read.tabs.length} tabs, down from ${prevCounts.tabs} — this looks like a partial read.`);
  }
  return reasons;
}

// ── Import ──────────────────────────────────────────────────────

export async function importGuideSnapshot(opts: ImportOptions): Promise<ImportReport> {
  const report: ImportReport = {
    accepted: false, tripId: opts.tripId || null, snapshotId: null, reasons: [], counts: {}, warnings: [],
    changes: { added: [], removed: [] }, pictures: { read: 0, cached: 0, failed: [] },
  };

  const read = await readGuideXlsx(opts.buffer);
  const itin = interpretItinerary(read.tabs);
  const previous = opts.tripId
    ? await prisma.guideSnapshot.findFirst({ where: { tripId: opts.tripId, status: "current" }, orderBy: { importedAt: "desc" } })
    : null;

  report.reasons = validate(read, itin, previous);
  if (report.reasons.length > 0 || !itin) {
    if (opts.tripId) {
      const rejected = await prisma.guideSnapshot.create({
        data: {
          tripId: opts.tripId, sourceName: opts.sourceName, sourceKind: "xlsx", contentHash: read.contentHash,
          status: "rejected", tabs: read.tabs as any, report: { reasons: report.reasons } as any, importedBy: opts.importedBy,
        },
      });
      report.snapshotId = rejected.id;
    }
    return report;
  }

  const tripZone = opts.timeZone || "Asia/Tokyo";
  const year = itin.firstDate!.slice(0, 4);

  // Trip (new or existing)
  let tripId = opts.tripId;
  if (!tripId) {
    const trip = await prisma.trip.create({
      data: {
        name: opts.tripName || "Japan 2026", status: "active", datesKnown: true, timeZone: tripZone,
        startDate: asDate(itin.firstDate!), endDate: asDate(itin.lastDate!),
      },
    });
    tripId = trip.id;
    await prisma.trip.updateMany({ where: { status: "active", id: { not: tripId } }, data: { status: "archived" } });
    for (const name of ["Ken", "Larisa"]) {
      const t = await prisma.traveler.findFirst({ where: { displayName: name } });
      if (t) await prisma.tripMember.upsert({
        where: { tripId_travelerId: { tripId, travelerId: t.id } },
        create: { tripId, travelerId: t.id, role: "planner" }, update: { role: "planner" },
      });
    }
  }
  report.tripId = tripId;

  // Pictures: store once by content, read the new ones
  for (const img of read.images) {
    await prisma.guideImage.upsert({
      where: { tripId_sha256: { tripId, sha256: img.sha256 } },
      create: { tripId, sha256: img.sha256, mimeType: img.mimeType, bytes: Uint8Array.from(img.bytes) },
      update: {},
    });
  }
  const placements = read.tabs.flatMap((t) => t.images.map((p) => ({ tab: t, ...p })));
  const tripDates = `${itin.firstDate} to ${itin.lastDate}`;
  const seededImages = opts.seedReadings?.images || {};
  if (Object.keys(seededImages).length) {
    const notRead = await prisma.guideImage.findMany({ where: { tripId, readStatus: { not: "read" }, sha256: { in: read.images.map((i) => i.sha256) } } });
    for (const img of notRead) {
      const seed = seededImages[img.sha256];
      if (!seed?.facts) continue;
      await prisma.guideImage.update({
        where: { id: img.id },
        data: { readStatus: "read", transcription: seed.transcription, facts: seed.facts as any, readAt: new Date() },
      });
    }
  }
  if (opts.readPictures !== false) {
    const unread = await prisma.guideImage.findMany({ where: { tripId, readStatus: { not: "read" }, sha256: { in: read.images.map((i) => i.sha256) } } });
    report.pictures.cached = read.images.length - unread.length;
    const queue = [...unread];
    const worker = async () => {
      while (queue.length) {
        const img = queue.shift()!;
        const place = placements.find((p) => p.sha256 === img.sha256)!;
        try {
          const { reading, failure } = await readGuideImage(Buffer.from(img.bytes), img.mimeType, {
            tabName: place.tab.name, anchor: place.anchor, tabText: place.tab.cells.map((c) => c.text).join(" | "), tripDates,
          });
          await prisma.guideImage.update({
            where: { id: img.id },
            data: reading
              ? { readStatus: "read", transcription: reading.transcription, facts: reading as any, readAt: new Date() }
              : { readStatus: "failed", facts: { failure } as any, readAt: new Date() },
          });
          if (reading) report.pictures.read++;
          else report.pictures.failed.push({ tab: place.tab.name, anchor: place.anchor, reason: failure || "unknown" });
        } catch (err: any) {
          await prisma.guideImage.update({ where: { id: img.id }, data: { readStatus: "failed", facts: { failure: err.message } as any } });
          report.pictures.failed.push({ tab: place.tab.name, anchor: place.anchor, reason: "Couldn't reach Claude to read this picture." });
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  } else {
    const unread = await prisma.guideImage.count({ where: { tripId, readStatus: { not: "read" }, sha256: { in: read.images.map((i) => i.sha256) } } });
    if (unread) report.warnings.push(`${unread} picture${unread === 1 ? "" : "s"} in the Guide weren't read this time (pictures were switched off).`);
  }
  const images = await prisma.guideImage.findMany({ where: { tripId, sha256: { in: read.images.map((i) => i.sha256) } } });
  const readings = images.filter((i) => i.readStatus === "read" && i.facts).map((i) => ({ image: i, reading: i.facts as unknown as ImageReading, place: placements.find((p) => p.sha256 === i.sha256)! }));

  // ── Derived facts ──
  const items: Item[] = itin.items.map((i) => ({ ...i, timeZone: zoneFor(i.city, tripZone) }));

  // Confirmed flights and hotel bookings from screenshots
  const hotelBookings = new Map<string, { b: ImageReading["hotelBookings"][number]; sha: string; tab: string }>();
  for (const { reading, image, place } of readings) {
    for (const f of reading.flights || []) {
      if (f.status !== "confirmed" || !f.departDate) continue;
      const who = whoFromNames(f.travelers);
      const seats = (f.seats || []).map((s) => `${whoFromNames([s.traveler]) || s.traveler} ${s.seat}`).join(", ");
      const flightName = flightLabel(f.airline, f.flightNumber);
      const nextDay = !!(f.arriveDate && f.arriveDate !== f.departDate);
      const depZone = (f.departAirport && AIRPORT_ZONES[f.departAirport]) || tripZone;
      const arrZone = (f.arriveAirport && AIRPORT_ZONES[f.arriveAirport]) || tripZone;
      // Said the way people say it: "United UA34 · Kansai (KIX) → San Francisco (SFO)"
      const title = `${flightName} · ${airportName(f.departAirport)} → ${airportName(f.arriveAirport)}`;
      const lands = f.arriveTime ? `Lands at ${airportName(f.arriveAirport)} ${plainWhen(f.arriveDate || f.departDate, f.arriveTime, arrZone)}` : null;
      const departure: Item = {
        // Arrival is in another time zone, often the next day — never an "end time" on this line
        date: f.departDate, time: f.departTime, endTime: null, kind: "flight", title,
        detail: [lands, seats ? `Seats requested: ${seats}` : null].filter(Boolean).join("\n") || null,
        place: null, confirmation: f.confirmation, forWhom: who, sourceRef: `image:${image.sha256}`,
        source: `Screenshot in ${place.tab.name}`, city: null, timeZone: depZone,
      };
      // Same flight in Larisa's itinerary (same day, same departure time) → one item, with the booking's
      // plain title and the departure airport's time zone (her row sits under a city, which can be the destination)
      const sameFlight = (i: Item) => i.kind === "flight" && i.date === f.departDate && !!f.departTime && i.time === f.departTime;
      const hers = items.find(sameFlight);
      mergeInto(items, departure, sameFlight);
      if (hers) {
        // The booking page may not show the flight number; Larisa's row often does ("KIX - UA34 → SFO")
        const numberInHers = !f.flightNumber ? hers.title.match(/\b([A-Z]{2})\s?(\d{1,4})\b/) : null;
        const finalTitle = numberInHers ? `${flightLabel(f.airline, `${numberInHers[1]}${numberInHers[2]}`)} · ${airportName(f.departAirport)} → ${airportName(f.arriveAirport)}` : title;
        if (hers.title !== finalTitle) hers.detail = [hers.detail, `Guide: "${hers.title}"`].filter(Boolean).join("\n");
        hers.title = finalTitle;
        hers.timeZone = depZone;
        hers.endTime = null;
      }
      // Landing on a later day gets its own item on that day. Its words hold at any moment: "Left SFO Tue,
      // Oct 13" once had Scout say Julie & Andy were "having left" the evening before they flew
      if (nextDay && f.arriveDate) {
        const landTitle = `Land at ${airportName(f.arriveAirport)} · ${flightName}`;
        mergeInto(items, {
          date: f.arriveDate, time: f.arriveTime, endTime: null, kind: "flight", title: landTitle,
          detail: f.departTime ? `Takes off from ${airportName(f.departAirport)} ${plainWhen(f.departDate, f.departTime, depZone)}` : null,
          place: null, confirmation: f.confirmation, forWhom: who, sourceRef: `image:${image.sha256}`,
          source: `Screenshot in ${place.tab.name}`, city: null, timeZone: arrZone,
        }, (i) => i.kind === "flight" && i.date === f.arriveDate && i.title === landTitle && i.time === f.arriveTime);
      }
    }
    for (const b of reading.hotelBookings || []) {
      if (!b.checkInDate) continue;
      const key = `${norm(splitHotel(b.hotel).name)}|${b.checkInDate}|${norm(b.bookedBy || "")}`;
      const existing = hotelBookings.get(key);
      if (!existing || (!existing.b.confirmation && b.confirmation)) hotelBookings.set(key, { b, sha: image.sha256, tab: place.tab.name });
    }
  }
  for (const { b, sha, tab } of hotelBookings.values()) {
    const who = roomFor(b.bookedBy);
    // Call the hotel what Larisa calls it ("Imperial Hotel"), not what the booking page shouts ("IMPERIAL HOTEL, TOKYO")
    const stay = itin.stays.find((s) => sharesName(s.hotel, b.hotel) && s.checkIn && s.checkOut && b.checkInDate! >= s.checkIn && b.checkInDate! < s.checkOut);
    const name = stay ? splitHotel(stay.hotel).name : b.hotel;
    const base = { place: b.address, confirmation: b.confirmation, forWhom: who, sourceRef: `image:${sha}`, source: `Screenshot in ${tab}`, city: null, timeZone: tripZone, endTime: null };
    const same = (title: string, date: string | null) => (i: Item) => i.title === title && i.date === date;
    const inTitle = `Check in · ${name}`;
    // The room as a person says it: "Room: Tower Building High Floor Standard, Twin" — not the booking page's
    // bedding options and rate names
    const room = b.room ? b.room.split(/[;(]/)[0].replace(/\s*:\s*/g, ", ").replace(/\s+/g, " ").trim().replace(/,$/, "") : null;
    mergeInto(items, { ...base, date: b.checkInDate, time: b.checkInTime, kind: "checkin", title: inTitle,
      detail: [b.bookedBy ? `Booked by ${b.bookedBy}` : null, room ? `Room: ${room}` : null].filter(Boolean).join("\n") || null }, same(inTitle, b.checkInDate));
    if (b.checkOutDate) {
      const outTitle = `Check out · ${name}`;
      mergeInto(items, { ...base, date: b.checkOutDate, time: b.checkOutTime, kind: "checkout", title: outTitle, detail: null }, same(outTitle, b.checkOutDate));
    }
    const cancelDate = dateFromWords(b.freeCancellationUntil);
    // Larisa's itinerary may already carry the same cutoff ("cancellation date" column) → one item,
    // worded the same way for every hotel: "Free cancellation ends · Imperial Hotel", "Until 11:59 PM Japan time"
    if (cancelDate) {
      const cancelTitle = `Free cancellation ends · ${name}`;
      const at = (b.freeCancellationUntil || "").match(/\b(\d{1,2}:\d{2}\s*[AP]M)\b/i);
      const until = at ? `Until ${at[1].toUpperCase().replace(/\s+/, " ")} ${ZONE_WORDS[tripZone] || ""}`.trim() : b.freeCancellationUntil;
      const sameCutoff = (i: Item) => i.kind === "deadline" && i.date === cancelDate && sharesName(i.title, name) && (!i.forWhom || !who || i.forWhom === who);
      mergeInto(items, { ...base, date: cancelDate, time: null, kind: "deadline", title: cancelTitle, detail: until }, sameCutoff);
      const merged = items.find(sameCutoff);
      if (merged) merged.title = cancelTitle;
    }
  }

  const reservations = parseReservations(read.tabs, year).map((r) => ({ ...r, timeZone: tripZone }));
  items.push(...reservations);

  // Ideas Larisa marked for a specific day (Activities tab). A plain mark is part of that day;
  // a mark with words is a maybe, shown in her words.
  const ideas = parseIdeasTab(read.tabs, year);
  const openQuestions: { name: string; text: string; date: string }[] = [];
  for (const idea of ideas) {
    const tab = idea.ref.split("|")[0];
    const interested = idea.interested.length ? `Interested: ${idea.interested.join(", ")}` : null;
    for (const m of idea.marks) {
      const cand: Item = {
        date: m.date, time: null, endTime: null, kind: m.firm ? "plan" : "note",
        title: m.firm ? idea.name : `Maybe: ${idea.name}`,
        detail: [m.firm ? null : m.text, idea.comment, interested].filter(Boolean).join(" · ") || null,
        place: idea.area, confirmation: null, forWhom: null, link: idea.url, city: idea.city, timeZone: tripZone,
        source: `${tab} (row ${idea.row})`, sourceRef: `${tab}!${idea.row}`,
      };
      const words = norm(idea.name).split(/[^a-z]+/).filter((w) => w.length > 3);
      if (m.firm) mergeInto(items, cand, (i) => i.date === m.date && ["plan", "tour", "meal"].includes(i.kind) && words.some((w) => norm(i.title).includes(w)));
      else { items.push(cand); if (m.date) openQuestions.push({ name: idea.name, text: m.text, date: m.date }); }
    }
  }

  // Prose tabs (pasted emails): bookings and deadlines stated only in text. Cached by tab text.
  const cachedText = { ...opts.seedReadings?.textReadings, ...((previous?.report as any)?.textReadings || {}) } as Record<string, TextReading>;
  const textReadings: Record<string, TextReading> = {};
  const structuredNames = new Set([itin.tabName]);
  const proseTabs = read.tabs
    .filter((t) => !structuredNames.has(t.name) && !/^actions$/i.test(t.name) && !/activities template/i.test(t.name))
    .map((t) => ({ tab: t, text: Array.from(rowsOf(t).entries()).sort((a, b) => a[0] - b[0]).map(([, cs]) => cs.sort((a, b) => a.c - b.c).map((c) => c.text).join(" | ")).join("\n") }))
    // A day-plan tab is read as a day plan only: read for bookings too, the Shigaraki day's
    // "lunch for 5, including Kimiko" landed on an 8 PM dinner listing — a false fact
    .filter(({ tab, text }) => isBookingProse(text) && !isDayPlanTab(tab.name, text));
  await Promise.all(proseTabs.map(async ({ tab, text }) => {
    const hash = tabTextHash(text);
    let reading: TextReading | null = cachedText[hash] || null;
    // (its own switch: skipping pictures must never also skip her pasted bookings — the Robuchon
    // deadlines vanished on a test re-read that way)
    if (!reading && opts.readText !== false) {
      const r = await readGuideText(tab.name, text, tripDates).catch(() => ({ reading: null, failure: "Couldn't reach Claude." }));
      reading = r.reading;
      if (!reading) report.warnings.push(`Couldn't read the text on "${tab.name}" for bookings — it's still shown under From the Guide.`);
    }
    if (!reading) return;
    textReadings[hash] = reading;
    const src = { sourceRef: `${tab.name}!text`, source: `${tab.name} (pasted text)`, city: null, timeZone: tripZone, place: null, link: null };
    // The cell her pasted words are in (the reading quotes them; the quote is found in her cells)
    const quoteRefs = (quote?: string | null) => {
      const found = cellsHolding(tab, (quote || "").split("\n").find((l) => l.trim().length > 8) || "");
      return found.length ? found : [`${tab.name}!text`];
    };
    // Whose name the booking is under, from her pasted confirmation ("お名前：Sato, Hana") — so a
    // deadline answers "is this on me?"
    // A hotel's email names its guest only in the greeting ("Dear Hana Sato," — round 12: the Four Seasons
    // deadline said no one's name, so Julie asked "is that on me?"); trusted only when the tab holds one booking
    const dear = reading.bookings.length === 1 ? text.match(/^\s*Dear\s+(?:(?:Mr|Ms|Mrs|Dr)\.?\s+)?([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){1,2})\s*,?\s*$/m)?.[1] : null;
    const bookedUnder = (b: { quote?: string | null }) => {
      const m = (b.quote || "").match(/(?:お名前|予約者名|Guest name|Booked under|Name)\s*[:：]\s*([^\n]{2,40})/i);
      return m ? `Booked under ${m[1].trim()}` : dear ? `Booked under ${dear}` : null;
    };
    for (const b of reading.bookings) {
      if (!b.date) continue;
      const kind: Item["kind"] = b.kind === "hotel" ? "checkin" : b.kind === "restaurant" ? "meal" : b.kind === "tour" ? "tour" : b.kind === "flight" ? "flight" : "note";
      const title = b.kind === "hotel" ? `Check in · ${b.name}` : b.name;
      // Labelled lines ("Party: 4", "Dress: …"); a bare "4" or "2 adults" becomes "Party: …"
      const party = b.people && !/party\s*:/i.test(b.details || "") ? `Party: ${b.people.replace(/^party\s*:\s*/i, "")}` : null;
      const detail = [bookedUnder(b), party, b.details, b.phone ? `Phone: ${b.phone}` : null].filter(Boolean).join("\n") || null;
      const nameWords = norm(b.name).split(/[^a-z]+/).filter((w) => w.length > 3);
      mergeInto(items, { ...src, refs: quoteRefs(b.quote), place: b.address, date: b.date, time: b.time, endTime: null, kind, title, detail, confirmation: b.confirmation, forWhom: null },
        (i) => i.date === b.date && (i.kind === kind || (kind === "meal" && i.kind === "plan")) && nameWords.some((w) => norm(i.title).includes(w)));
      if (b.kind === "hotel" && b.checkOutDate) {
        mergeInto(items, { ...src, refs: quoteRefs(b.quote), date: b.checkOutDate, time: b.checkOutTime, endTime: null, kind: "checkout", title: `Check out · ${b.name}`, detail: null, confirmation: b.confirmation, forWhom: null },
          (i) => i.date === b.checkOutDate && i.kind === "checkout" && nameWords.some((w) => norm(i.title).includes(w)));
      }
    }
    const plainDay = (ymdStr: string) => new Date(`${ymdStr}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    for (const d of reading.deadlines) {
      // How to act on it: the booking it's about (same tab, name in the words) gives the phone and code
      const about = reading.bookings.find((b) => norm(b.name).split(/[^a-z]+/).filter((w) => w.length > 3 && !GENERIC_WORDS.has(w)).some((w) => norm(d.what).includes(w)));
      // A window ("reconfirm 3–7 days before") is listed on its LAST day — the day it must be done by —
      // and its first day travels with it, so screens can show it for the whole window.
      items.push({ ...src, refs: quoteRefs(d.quote), date: d.endDate || d.date, time: null, endTime: null, kind: "deadline", title: d.what,
        detail: [
          d.endDate ? `Any day from ${plainDay(d.date)} through ${plainDay(d.endDate)}` : null,
          about ? bookedUnder(about) : null,
          about?.phone ? `Phone: ${about.phone}` : null,
          d.computed ? `Worked out from: "${d.quote}"` : `"${d.quote}"`,
        ].filter(Boolean).join("\n"),
        confirmation: about?.confirmation || null, forWhom: null, windowStart: d.endDate ? d.date : null });
      // A charge schedule ("7 days to 4 days before 60% …") also belongs on the booking itself
      if (about?.date && /\d+\s*%/.test(d.quote)) {
        const aboutWords = norm(about.name).split(/[^a-z]+/).filter((w) => w.length > 3 && !GENERIC_WORDS.has(w));
        const booking = items.find((i) => i.date === about.date && ["meal", "plan", "tour"].includes(i.kind) && aboutWords.some((w) => norm(i.title).includes(w)));
        const charges = `Cancellation charges: ${d.quote.replace(/^[^:：]*[:：]\s*/, "").replace(/\s*\n\s*/g, "; ").replace(/\s{2,}/g, " ").trim()}`;
        if (booking && !(booking.detail || "").includes("Cancellation charges")) booking.detail = [booking.detail, charges].filter(Boolean).join("\n");
      }
    }
  }));

  const textHotels = Object.values(textReadings).flatMap((r) => r.bookings.filter((b) => b.kind === "hotel" && b.date));

  // Day-plan tabs (her detail for key days): time blocks, some with several choices, put on their day
  // beside the Itinerary's overview line. Layout-tolerant reading, then checked word-for-word against
  // her tab (dayPlanReader.ts). Cached by tab text.
  // The Guide's author writes "You" for herself; the group is whoever her lines name ("Ken & Larisa", "Julie & Andy")
  const guideOwner = "Larisa";
  const groupNames = new Set<string>([guideOwner.toLowerCase()]);
  for (const i of items) for (const n of (i.forWhom || "").split(/\s*&\s*/)) if (n && !/^everyone$/i.test(n)) groupNames.add(n.trim().toLowerCase());
  const cachedPlans = { ...opts.seedReadings?.dayPlanReadings, ...((previous?.report as any)?.dayPlanReadings || {}) } as Record<string, DayPlanReading>;
  const dayPlanReadings: Record<string, DayPlanReading> = {};
  const tripDays = new Set<string>();
  if (itin.firstDate && itin.lastDate) for (let d = itin.firstDate; d <= itin.lastDate; d = addDays(d, 1)) tripDays.add(d);
  const overview = Array.from(tripDays).map((d) => {
    const city = itin.stays.find((s) => s.checkIn && s.checkOut && s.checkIn <= d && d < s.checkOut)?.city || "";
    const lines = items.filter((i) => i.date === d && ["plan", "note", "tour", "meal", "meeting", "travel", "train", "flight"].includes(i.kind)).slice(0, 5).map((i) => i.title);
    return `${d} (${new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}) ${city}: ${lines.join(" | ")}`;
  }).join("\n");
  // (a day planned twice in one tab: only the version Wander follows is read — dayPlanVersions)
  const prevTabs = (((previous as any)?.tabs as GuideTab[] | undefined) || []);
  const prevChoices = ((((previous as any)?.report as ImportReport | undefined)?.supersededPlans) || []) as PlanChoiceKept[];
  report.supersededPlans = [];
  const planTabs = read.tabs
    .filter((t) => t.name !== itin.tabName && !/^actions$/i.test(t.name) && !/activities template/i.test(t.name))
    .map((t) => {
      const versions = dayPlanVersions(t, prevTabs.find((p) => p.name === t.name), prevChoices);
      const kept = versions.superseded.size ? { ...t, cells: t.cells.filter((c) => !versions.superseded.has(c.a1)) } : t;
      for (const [n, v] of versions.notes) report.supersededPlans!.push({ tab: t.name, day: n, current: v.current, earlier: v.earlier, why: v.why });
      return { tab: t, versions, text: Array.from(rowsOf(kept).entries()).sort((a, b) => a[0] - b[0]).map(([, cs]) => cs.sort((a, b) => a.c - b.c).map((c) => c.text).join(" | ")).join("\n") };
    })
    .filter(({ tab, text }) => isDayPlanTab(tab.name, text));
  await Promise.all(planTabs.map(async ({ tab, text, versions }) => {
    const hash = dayPlanHash(text);
    let raw: DayPlanReading | null = cachedPlans[hash] || null;
    if (!raw && opts.readDayPlans !== false) {
      const r = await readDayPlans(tab.name, text, tripDates, overview).catch(() => ({ reading: null, failure: "Couldn't reach Claude." }));
      raw = r.reading;
      if (!raw) report.warnings.push(`Couldn't read "${tab.name}" for day plans — its text is still shown under Larisa's Guide, tab by tab.`);
    }
    if (!raw) return;
    dayPlanReadings[hash] = raw;
    const { reading, dropped } = verifyAgainstTab(raw, text, tripDays);
    if (dropped) report.warnings.push(`"${tab.name}": left out ${dropped} line${dropped === 1 ? "" : "s"} Wander couldn't match word for word to the tab (or to a day of the trip).`);
    // Her own map links: a day tab's stop list ("Stop 4: Shoraian (Tofu & yuba lunch)" linked to the
    // place). A plan line naming that place gets her link — a search built from the line's words once sent
    // "Café ENSOU lunch, Kyoto" for a café in Shigaraki.
    const stops = Array.from(rowsOf(tab).values()).flat()
      // One stop per cell (its link is that stop's), or a cell listing several, one per line ("• Stop 3: Cycle Kyoto
      // (E-bike meeting point)") — those lines carry names, never a link (the cell's one link isn't each stop's)
      .flatMap((c) => {
        const n = (c.text.match(/stop\s*\d/gi) || []).length;
        // A map place she put beside the stop, in the same row, is that stop's link — over the stop's own search link
        // (Oct 2: she added Tokyodo's exact Google Maps place in G39 beside "Stop 4: Tokyodo Main Showroom", whose own
        // link was a search for the name)
        const placeBeside = n === 1 ? tab.cells.find((x) => x.r === c.r && x.a1 !== c.a1 && x.link && /\/maps\/place\/|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(x.link))?.link : undefined;
        if (n === 1) return [{ text: c.text, link: placeBeside ?? c.link ?? null }];
        return n > 1 ? c.text.split("\n").filter((l) => /stop\s*\d/i.test(l)).map((l) => ({ text: l, link: null as string | null })) : [];
      })
      // A stop's name can wrap inside its cell ("Stop 4: Gallery & Cafe ⏎ ENSOU (Woodland lunch stop)")
      .map((c) => {
        const flat = c.text.replace(/\s+/g, " ");
        const name = ((flat.match(/stop\s*\d+[a-z]?\s*:\s*([^(]+)/i) || [])[1] || "").trim();
        // What the stop is for, in her brackets ("Cycle Kyoto (E-bike meeting point)")
        const role = ((flat.match(/stop\s*\d+[a-z]?\s*:\s*[^(]+\(([^)]+)\)/i) || [])[1] || "").trim();
        return { link: c.link ? unwrapSearchLink(c.link) : null, name, words: distinctWords(name), roleWords: distinctWords(role) };
      })
      .filter((s) => s.words.length);
    // Every distinctive word of her stop's name must be in the line ("Gallery & Cafe ENSOU" → "Café ENSOU
    // lunch"); a shared neighborhood alone ("Montbell Ginza" vs "Ginza Premium Retail Walk") is no match.
    // Leaving a place isn't going there: "Leave Four Seasons" gets no map of the hotel you're standing in.
    const stopLink = (label: string) => {
      if (/^\s*(leave|depart)\b/i.test(label)) return null;
      const own = distinctWords(label).map(stem);
      const best = stops.filter((s) => s.link && s.words.every((w) => own.includes(stem(w)))).sort((a, b) => b.words.length - a.words.length)[0];
      return best ? best.link : nameWordStop(label)?.link || roleStop(label)?.link || null;
    };
    // A line naming a stop by its one telling word ("Arashiyama river / Togetsukyo" → her "Stop 3: Togetsukyo Bridge
    // (Riverfront walk)") — a long word only that stop has, never a place word any stop could share ("bridge",
    // "temple"); with every word required, the river walk had no map (round 15, Oct 26)
    const nameWordStop = (label: string) => {
      if (/^\s*(leave|depart)\b/i.test(label)) return null;
      const own = distinctWords(label).map(stem);
      // (nor the town the whole tab is about — "Kyoto Wed, 1028 Shigaraki": "Shigaraki" sent the Share Studio lines to
      // the Shigaraki Ceramic Cultural Park, a different place)
      const tabName = tab.name.toLowerCase();
      const telling = (w: string) => w.length >= 7 && !PLACE_WORDS.has(stem(w)) && !tabName.includes(stem(w));
      const hits = stops.filter((s) => s.link && s.words.some((w) => telling(w) && own.includes(stem(w))
        && stops.filter((o) => o.words.some((x) => stem(x) === stem(w))).length === 1));
      // (two can: "Arashiyama river / Togetsukyo" has Stop 1's "Arashiyama" too — the stop more of whose name the line
      // says wins, Togetsukyo Bridge's half over Arashiyama Bamboo Grove's third; a tie is no answer)
      const share = (s: (typeof stops)[number]) => s.words.filter((w) => own.includes(stem(w))).length / s.words.length;
      const ranked = hits.sort((a, b) => share(b) - share(a));
      return ranked.length && (ranked.length === 1 || share(ranked[0]) > share(ranked[1])) ? ranked[0] : null;
    };
    // A line that names a stop by what it's for, not its name ("Taxi to e-bike meeting point" → her "Stop 3: Cycle
    // Kyoto (E-bike meeting point)") — the stop's name is said with it (round 12: Andy at noon on Oct 25 couldn't find
    // where the e-bike tour met; no screen named Cycle Kyoto)
    // (word stems: her "Traditional sweets/matcha" stop is the line "Traditional Kyoto sweet / matcha in Gion" — the
    // plural kept Gion Tsujiri, and any map, off it; round 15, Oct 26)
    const roleStop = (label: string) => {
      if (/^\s*(leave|depart)\b/i.test(label)) return null;
      const own = distinctWords(label).map(stem);
      if (stops.some((s) => s.words.every((w) => own.includes(stem(w))))) return null;
      const hits = stops.filter((s) => s.roleWords.length >= 2 && s.roleWords.every((w) => own.includes(stem(w))));
      return hits.length === 1 ? hits[0] : null;
    };
    // A picture she pasted in the same tab can date its days ("Day 1 – Tue, Oct 13" on her Tokyo route map) — said beside
    // Wander's match when it differs, never silently overruled (round 12: "since the tab doesn't give a date" while her
    // own map in that tab said Oct 13 for the plan Wander put on Oct 15)
    // (its own pictures first, then its sibling day tabs' — her four-panel Tokyo map sits in "Tokyo Day 1 Ginza" and
    // labels all three Tokyo days)
    const family = tab.name.match(/^(.*?\bDay)\s*\d/i)?.[1]?.toLowerCase();
    const pictureTabs = readings.filter((r) => r.place.tab.name === tab.name || (family && r.place.tab.name.toLowerCase().startsWith(family)))
      .sort((a, b) => Number(b.place.tab.name === tab.name) - Number(a.place.tab.name === tab.name));
    const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const pictureDateOf = (dayNo: string, year: string) => {
      for (const r of pictureTabs) {
        const m = JSON.stringify(r.reading).match(new RegExp(`Day\\s*${dayNo}\\s*[–—:-]\\s*(?:[A-Z][a-z]{2,8},?\\s*)?(${MONTHS.join("|")})[a-z]*\\.?\\s*(\\d{1,2})\\b`, "i"));
        if (m) return { date: `${year}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`, tab: r.place.tab.name };
      }
      return null;
    };
    const plainDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    // Her whole route for the day, when her tab has one ("Open Complete Day 3 Route on Google Maps") — kept with the
    // day's first line so the day screen can open it (charm item C4, Oct 1 2026). Only for a tab with one day's plan:
    // a route can't be told apart between two days.
    const routeCell = reading.plans.length === 1
      ? tab.cells.find((c) => /google\.[a-z.]+\/maps\/dir\/[^/?\s]+\/[^/?\s]+/i.test(c.link || c.text || ""))
      : undefined;
    const routeUrl = routeCell ? (routeCell.link || (routeCell.text.match(/https?:\/\/\S+/) || [])[0] || null) : null;
    for (const p of reading.plans) {
      const day = p.date || p.matchedDate!;
      const dayNo = (p.heading || "").match(/\bDay\s*(\d+)\b/i)?.[1];
      const pic = !p.date && p.matchedDate && dayNo ? pictureDateOf(dayNo, day.slice(0, 4)) : null;
      const picSays = pic && pic.date !== day
        ? ` A picture in her ${pic.tab === tab.name ? "tab" : `“${pic.tab}” tab`} labels Day ${dayNo} ${plainDate(pic.date)} — a different date; worth checking with Larisa.`
        : "";
      const matched = !p.date && p.matchedDate
        ? `Wander matched this plan to ${plainDate(day)}, since her tab's words don't give a date. ${(p.matchReason || "").trim().replace(/^./, (c) => c.toUpperCase()).replace(/([^.!?])$/, "$1.")}${picSays}`
        : null;
      // (this day planned twice in her tab: which one Wander follows, said on the day — dayPlanVersions)
      const twoVersions = dayNo ? versions.notes.get(dayNo)?.note || null : null;
      for (const [bi, b] of p.blocks.entries()) {
        // Every block stays: her plan is shown whole, in her order (a duplicate check dropped "~8:00 Breakfast /
        // check out; leave luggage at Four Seasons" for looking like the check-out line). What it adds to the
        // Itinerary's own line for the same thing: a time the line didn't have ("Une Immersion" → 7:00 PM),
        // said to come from this tab.
        // Only a meal's time onto the same meal: a looser match gave Shiraume's kaiseki dinner "5:00 PM"
        // from "Taxi to Shiraume", and the day's title "Kyoto day 4 - Shigaraki" 9:15 — false times
        const mealBlock = b.kind === "meal" || /\b(dinner|lunch|brunch|breakfast|reservation)\b/i.test(b.label);
        if (b.start && mealBlock) {
          for (const i of items) {
            if (i.date !== day || i.time || i.kind !== "meal") continue;
            const own = norm(i.title.split("\n")[0]).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !GENERIC_WORDS.has(w));
            if (!own.length || !own.every((w) => norm(b.label).includes(w))) continue;
            i.time = b.start;
            // Its time's cell is one of its sources now
            i.refs = Array.from(new Set([...(i.refs || [i.sourceRef]), ...cellsHolding(tab, b.label, b.timeText)]));
            const line = `Time from the ${tab.name} tab.`;
            if (!(i.detail || "").includes(line)) i.detail = [i.detail, line].filter(Boolean).join("\n");
          }
        }
        // Who it's for, when she names people of the group ("You + Julie" → Larisa & Julie; she writes "You")
        const whoNames = b.who ? b.who.split(/\s*(?:\+|&|,|\band\b)\s*/i).map((w) => w.trim()).filter(Boolean) : [];
        const party = whoNames.length && whoNames.every((w) => /^you$/i.test(w) || groupNames.has(w.toLowerCase()))
          ? whoNames.map((w) => (/^you$/i.test(w) ? guideOwner : w)).join(" & ")
          : null;
        // A line naming no one may be named in a picture in the tab — quoted, never assigned (round 13: her Kyoto map lists
        // "You & Julie (morning)" over Maruni Toryo, while Wander said her Guide didn't name the group)
        // (a picture pasted in several tabs counts in each — her one Kyoto map heads all five Kyoto day tabs)
        const tabPictures = readings.filter((r) => placements.some((pl) => pl.sha256 === r.image.sha256 && pl.tab.name === tab.name))
          .map((r) => r.image.transcription || "");
        const picGroup = !party && !b.who ? pictureGroupFor(b.label, tabPictures, [...groupNames]) : null;
        // A meeting point her stop list names, and a booking picture in the tab that says the tour starts somewhere else:
        // both shown, never settled (round 13: Oct 25's e-bike tour — "Cycle Kyoto" vs "Kyoto's NORU bicycle shop")
        const stop = roleStop(b.label);
        const start = stop ? tabPictures.map(pictureStartFor).find((x) => x && !distinctWords(x.place).every((w) => stop.words.includes(w))) : null;
        const startDiffers = stop && start
          ? `Tabs differ: within this tab — her stop list has ${stop.name} for this; her booking picture says the tour starts at “${start.place}”${start.arrive ? ` — “${start.arrive}”` : ""}`
          : null;
        items.push({
          date: day, time: b.start, endTime: b.end, timeText: b.timeText,
          kind: "block", title: b.label, forWhom: party,
          detail: [
            b.who && !party ? (/^for\b/i.test(b.who) ? b.who[0].toUpperCase() + b.who.slice(1) : `For ${b.who}`) : null,
            picGroup ? `A picture in her tab lists this under “${picGroup.heading}”${picGroup.with.length ? `, with ${picGroup.with.join(" · ")}` : ""}.` : null,
            b.approx ? "Times are Larisa's estimate." : null,
            ...b.choices.map((c) => `Choice: ${c.name}${c.note ? ` — ${c.note}` : ""}`),
            roleStop(b.label) ? `Where: ${roleStop(b.label)!.name} — the stop her tab lists for this` : null,
            startDiffers,
            bi === 0 && routeUrl ? `Her whole route for the day: ${routeUrl}` : null,
            twoVersions,
            b.notes,
            matched,
          ].filter(Boolean).join("\n") || null,
          place: null, confirmation: null, link: stopLink(b.label), city: null, timeZone: tripZone,
          source: `${tab.name}${p.heading ? ` · ${p.heading}` : ""}`, sourceRef: `${tab.name}!plan`,
          refs: cellsHolding(tab, b.label, b.timeText),
        });
      }
    }
  }));
  markTabsDiffer(items);
  tagPartiesFromShorthand(items);

  // A stop's heading carries Larisa's summary of it — "Karatsu (tour Karatsu, day trip to Arita)",
  // "Nagoya (bullet train 3.25 hrs; Tokoname day trip - 40 min by Meitetsu train)". Kept as a note for
  // every day of that stop (the heading doesn't say which day), shown under the day's title.
  const sections = new Map<string, { note: string; from: string; to: string; source: string; sourceRef: string; city: string }>();
  for (const s of itin.stays) {
    const note = stopNoteOf(s.sectionTitle);
    if (!note || !s.checkIn || !s.checkOut) continue;
    const lastNight = addDays(s.checkOut, -1);
    const had = sections.get(s.sectionTitle);
    sections.set(s.sectionTitle, had
      ? { ...had, from: s.checkIn < had.from ? s.checkIn : had.from, to: lastNight > had.to ? lastNight : had.to }
      : { note, from: s.checkIn, to: lastNight, source: s.source.replace(/\s*·.*$/, "") + " (heading)", sourceRef: s.sourceRef, city: s.city });
  }
  // Her travel notes on a section's heading row go with that section's stay; a section with no stay of its own ("Hakata
  // - NOT AN OVERNIGHT (travel through)") goes with the next stay down her sheet, its heading said with it (round 13)
  const rowOf = (ref: string) => Number(ref.match(/![A-Z]+(\d+)$/)?.[1] || 0);
  const headTravel = new Map<string, string[]>();
  for (const h of itin.sectionTravel || []) {
    const own = itin.stays.some((s) => s.sectionTitle === h.title);
    const target = own ? h.title : itin.stays.filter((s) => rowOf(s.sourceRef) > rowOf(h.ref)).sort((a, b) => rowOf(a.sourceRef) - rowOf(b.sourceRef))[0]?.sectionTitle;
    if (target) headTravel.set(target, [...(headTravel.get(target) || []), own ? h.note : `${h.title} — ${h.note}`]);
  }
  for (const [title, sec] of sections) {
    // Her travel notes on the stay's hotel rows ("Nagoya -> Tokoname (~40 min) via Meitetsu") go with it
    const travel = Array.from(new Set([...(headTravel.get(title) || []), ...itin.stays.filter((s) => s.sectionTitle === title && s.travelNote).map((s) => s.travelNote!)]));
    items.push({
      date: sec.to, windowStart: sec.from, time: null, endTime: null, kind: "stop", title: sec.note,
      detail: travel.length ? travel.map((t) => `Larisa's travel note: ${t}`).join("\n") : null,
      place: null, confirmation: null, forWhom: null, link: null, city: sec.city, timeZone: tripZone,
      source: sec.source, sourceRef: sec.sourceRef,
    });
  }
  // Her forecast for each stay, on every day of it
  for (const s of itin.stays) {
    if (!s.weather || !s.checkIn || !s.checkOut) continue;
    items.push({
      date: addDays(s.checkOut, -1), windowStart: s.checkIn, time: null, endTime: null, kind: "weather",
      title: `Larisa's forecast: ${s.weather}`, detail: null, place: null, confirmation: null, forWhom: null, link: null,
      city: s.city, timeZone: tripZone, source: s.source.replace(/\s*·.*$/, "") + " (forecast)", sourceRef: s.sourceRef,
    });
  }

  // Every moving day says you're leaving the hotel. Larisa's itinerary has each check-out date;
  // bookings added the time for some. A day two stays leave is one line (shown as "A or B").
  for (const s of itin.stays) {
    if (!s.checkOut || s.checkOutInferred) continue;
    const { name, extra } = splitHotel(s.hotel);
    const leavingSameDay = itin.stays.filter((o) => o.checkOut === s.checkOut).length > 1;
    const already = items.some((i) => i.kind === "checkout" && i.date === s.checkOut && (leavingSameDay || sharesName(i.title, name)));
    if (already) continue;
    const outTime = extra ? parseStatedTimes((extra.match(/out\s+([^,]+)/i) || [])[1] || "").start : null;
    items.push({
      date: s.checkOut, time: outTime, endTime: null, kind: "checkout", title: `Check out · ${name}`, detail: null,
      place: null, confirmation: null, forWhom: null, link: null, city: s.city, timeZone: tripZone,
      source: s.source, sourceRef: s.sourceRef,
    });
  }

  tidyItems(items, openQuestions);

  // ── Cities and days ──
  const nightCity = new Map<string, string>();
  for (const s of itin.stays) {
    if (!s.checkIn || !s.checkOut) continue;
    for (let d = s.checkIn; d < s.checkOut; d = addDays(d, 1)) if (!nightCity.has(d)) nightCity.set(d, s.city);
  }
  const dayCity = new Map<string, string>();
  const firstCity = itin.cityOrder[0];
  let last = firstCity;
  for (let d = itin.firstDate!; d <= itin.lastDate!; d = addDays(d, 1)) {
    const city = nightCity.get(d) || itin.stays.find((s) => s.checkOut === d)?.city || last;
    dayCity.set(d, city);
    last = city;
  }
  const guidedDates = new Set<string>();
  for (const s of itin.stays) {
    if (!/^backroads/i.test(s.sectionTitle) || !s.checkIn || !s.checkOut) continue;
    for (let d = s.checkIn; d <= s.checkOut; d = addDays(d, 1)) guidedDates.add(d);
  }

  const planByDate = new Map<string, string[]>();
  for (const i of itin.items) {
    if (!i.date || !["plan", "tour", "meal", "meeting"].includes(i.kind)) continue;
    planByDate.set(i.date, [...(planByDate.get(i.date) || []), i.title]);
  }

  const previousItems = previous ? await prisma.guideItem.findMany({ where: { snapshotId: previous.id } }) : [];

  const actions = parseActionsTab(read.tabs);

  const snapshotId = await prisma.$transaction(async (tx) => {
    await tx.guideSnapshot.updateMany({ where: { tripId, status: "current" }, data: { status: "previous" } });
    const snap = await tx.guideSnapshot.create({
      data: {
        tripId, sourceName: opts.sourceName, sourceKind: "xlsx", contentHash: read.contentHash, status: "current",
        tabs: read.tabs as any, importedBy: opts.importedBy,
      },
    });

    // Cities (all non-skipped sections, in the Guide's order)
    const cityIds = new Map<string, string>();
    const cityDates = new Map<string, string[]>();
    for (const [d, c] of dayCity) cityDates.set(c, [...(cityDates.get(c) || []), d]);
    let seq = 0;
    for (const name of itin.cityOrder) {
      const dates = (cityDates.get(name) || []).sort();
      const data = {
        name, sequenceOrder: seq++, hidden: false,
        country: /san francisco/i.test(name) ? "United States" : "Japan",
        arrivalDate: dates[0] ? asDate(dates[0]) : null, departureDate: dates.length ? asDate(dates[dates.length - 1]) : null,
      };
      const existing = await tx.city.findFirst({ where: { tripId, guideKey: norm(name) } });
      const city = existing
        ? await tx.city.update({ where: { id: existing.id }, data })
        : await tx.city.create({ data: { ...data, tripId, guideKey: norm(name) } });
      cityIds.set(name, city.id);
    }
    await tx.city.updateMany({ where: { tripId, guideKey: { not: null, notIn: itin.cityOrder.map(norm) } }, data: { hidden: true } });

    // Days (by date)
    const dayIds = new Map<string, string>();
    for (const [d, c] of dayCity) {
      const data = { cityId: cityIds.get(c)!, dayType: guidedDates.has(d) ? "guided" : "free", notes: (planByDate.get(d) || []).join(" · ") || null };
      const existing = await tx.day.findFirst({ where: { tripId, date: asDate(d) } });
      const day = existing ? await tx.day.update({ where: { id: existing.id }, data }) : await tx.day.create({ data: { ...data, tripId, date: asDate(d) } });
      dayIds.set(d, day.id);
    }

    // Stays
    const stayKeys: string[] = [];
    const checkOutConfirmed = new Set<string>();
    for (const s of itin.stays) {
      const { name, extra } = splitHotel(s.hotel);
      const key = `${norm(name)}|${s.checkIn}`;
      stayKeys.push(key);
      const inStay = (d: string | null) => !!(d && s.checkIn && s.checkOut && d >= s.checkIn && d < s.checkOut);
      const matching = Array.from(hotelBookings.values()).filter(({ b }) => sharesName(b.hotel, name) && inStay(b.checkInDate));
      const textMatch = textHotels.filter((t) => sharesName(t.name, name) && inStay(t.date));
      if (matching.length === 0 && textMatch.length === 1) {
        matching.push({ b: {
          hotel: textMatch[0].name, bookedBy: null, room: null, confirmation: textMatch[0].confirmation, checkInDate: textMatch[0].date,
          checkInTime: textMatch[0].time, checkOutDate: textMatch[0].checkOutDate, checkOutTime: textMatch[0].checkOutTime,
          freeCancellationUntil: null, address: null, phone: null,
        }, sha: "", tab: "" });
      }
      // A check-out the itinerary left out but a booking states: confirmed, or flagged if they disagree
      const bookedOut = matching.find((m) => m.b.checkOutDate)?.b.checkOutDate;
      if (s.checkOutInferred && bookedOut) {
        if (bookedOut === s.checkOut) checkOutConfirmed.add(s.hotel);
        else report.warnings.push(`${s.hotel}: the booking says check-out ${bookedOut}; Wander shows ${s.checkOut} from the itinerary.`);
      }
      const who = new Set(matching.map(({ b }) => roomFor(b.bookedBy)).filter(Boolean) as string[]);
      const inTimes = extra ? parseStatedTimes((extra.match(/in\s+([^,]+)/i) || [])[1] || "").start : null;
      const outTimes = extra ? parseStatedTimes((extra.match(/out\s+([^,]+)/i) || [])[1] || "").start : null;
      const data = {
        cityId: cityIds.get(s.city)!, name,
        notes: [extra, ...s.notes].filter(Boolean).join(" · ") || null,
        checkInDate: s.checkIn ? asDate(s.checkIn) : null, checkOutDate: s.checkOut ? asDate(s.checkOut) : null,
        checkInTime: inTimes || matching.find((m) => m.b.checkInTime)?.b.checkInTime || null,
        checkOutTime: outTimes || matching.find((m) => m.b.checkOutTime)?.b.checkOutTime || null,
        confirmationNumber: matching.length === 1 ? matching[0].b.confirmation : null,
        address: matching.find((m) => m.b.address)?.b.address || null,
        forWhom: who.size === 2 ? "Everyone" : who.size === 1 ? Array.from(who)[0] : null,
        sheetRowRef: s.sourceRef,
      };
      const existing = await tx.accommodation.findFirst({ where: { tripId, guideKey: key } });
      if (existing) await tx.accommodation.update({ where: { id: existing.id }, data });
      else await tx.accommodation.create({ data: { ...data, tripId, guideKey: key } });
    }
    await tx.accommodation.deleteMany({ where: { tripId, guideKey: { not: null, notIn: stayKeys } } });

    // Guide items (rebuilt)
    await tx.guideItem.deleteMany({ where: { tripId } });
    await tx.guideItem.createMany({
      data: items.map((i, idx) => ({
        tripId, snapshotId: snap.id, date: i.date ? asDate(i.date) : null, time: i.time, endTime: i.endTime,
        timeZone: i.timeZone || tripZone, kind: i.kind, title: i.title, detail: i.detail, forWhom: i.forWhom || null,
        place: i.place, confirmation: i.confirmation, link: (i as any).link || null, source: i.source, sourceRef: i.sourceRef, sortOrder: idx,
        windowStart: i.windowStart || null, timeText: i.timeText || null,
        cells: (() => {
          const refs = i.refs?.length ? i.refs : [i.sourceRef];
          const line = [i.title, i.detail, i.place, i.timeText].filter(Boolean).join(" ");
          return cellWordsFor([...refs, ...refs.flatMap((r) => rowCellsInLine(r, line, read))], read) as any;
        })(),
      })),
    });

    // Actions tab
    const actionRefs = actions.map((a) => a.ref);
    for (const a of actions) {
      const bothDone = [a.andyStatus, a.larisaStatus].filter(Boolean).every((s) => /done|n\/a/i.test(s!)) && (a.andyStatus || a.larisaStatus);
      const data = {
        action: a.action, owner: a.owner, dueDate: a.dueDate, notes: a.notes, andyStatus: a.andyStatus,
        larisaStatus: a.larisaStatus, statusNotes: a.statusNotes, status: bothDone ? "done" : "open",
      };
      const existing = await tx.planningAction.findFirst({ where: { tripId, sheetRowRef: a.ref } });
      if (existing) await tx.planningAction.update({ where: { id: existing.id }, data });
      else await tx.planningAction.create({ data: { ...data, tripId, sheetRowRef: a.ref } });
    }
    await tx.planningAction.deleteMany({ where: { tripId, sheetRowRef: { not: null, notIn: actionRefs.length ? actionRefs : ["__none__"] } } });

    // Ideas (activities template)
    const ideaRefs = ideas.map((i) => i.ref);
    const createdNow: { id: string; cityId: string; name: string }[] = [];
    for (const idea of ideas) {
      const cityId = cityIds.get(Array.from(cityIds.keys()).find((c) => norm(c) === norm(idea.city)) || "") || null;
      if (!cityId) { report.warnings.push(`"${idea.name}" is listed under ${idea.city}, which isn't a stop in the itinerary — kept in the Guide tab only.`); continue; }
      const dayId = idea.dates.map((d) => dayIds.get(d)).find(Boolean) || null;
      const data = {
        cityId, name: idea.name, description: [idea.comment, idea.area, ...idea.dateNotes].filter(Boolean).join(" — ") || null, sourceUrl: idea.url,
        explorationZoneAssociation: idea.area, state: (dayId ? "selected" : "possible") as any, dayId,
        priorityOrder: idea.row, // Larisa's order in her Activities tab
        themes: (/restaurant/i.test(idea.section) ? ["food"] : []) as any,
      };
      const existing = await tx.experience.findFirst({ where: { tripId, sheetRowRef: idea.ref } });
      const exp = existing
        ? await tx.experience.update({ where: { id: existing.id }, data })
        : await tx.experience.create({ data: { ...data, tripId, sheetRowRef: idea.ref, createdBy: "Larisa" } });
      if (!existing) createdNow.push({ id: exp.id, cityId, name: idea.name });
      await tx.experienceInterest.deleteMany({ where: { experienceId: exp.id } });
      if (idea.interested.length) {
        await tx.experienceInterest.createMany({
          data: idea.interested.map((p) => ({ experienceId: exp.id, tripId, userCode: p, displayName: p })), skipDuplicates: true,
        });
      }
    }
    await keepWhatPeopleAdded(tx, tripId, ideaRefs, createdNow, report);
    await tx.experience.deleteMany({ where: { tripId, sheetRowRef: { startsWith: "Activities Template|", notIn: ideaRefs.length ? ideaRefs : ["__none__"] } } });

    // "From the Guide": every tab that isn't read structurally, plus what each picture shows
    const structured = new Set([itin.tabName, ...actions.slice(0, 1).map((a) => a.ref.split("|")[0]), ...ideas.slice(0, 1).map((i) => i.ref.split("|")[0])]);
    await tx.sheetNote.deleteMany({ where: { tripId } });
    const notes: { tripId: string; tabName: string; rowIndex: number; text: string }[] = [];
    const pictureFirstTab = new Map<string, string>();
    for (const tab of read.tabs) {
      if (structured.has(tab.name)) continue;
      for (const [r, cells] of rowsOf(tab)) {
        const text = cells.sort((a, b) => a.c - b.c).map((c) => c.text.trim()).filter(Boolean).join(" · ");
        if (text) notes.push({ tripId, tabName: tab.name, rowIndex: r, text });
      }
      tab.images.forEach((p, n) => {
        const img = images.find((i) => i.sha256 === p.sha256);
        const summary = (img?.facts as any)?.summary;
        // Everything Wander read in it, not just what it is (Ken, Oct 2: "every word, image, and number" in her sheet is
        // data — her Kyoto map's "MIHO Museum (Ken & Andy)", van times and flight time were only "a five-panel
        // illustrated itinerary map"). Card numbers masked, as in her cells. A picture she placed in several tabs is
        // read out once; the others point to it.
        const first = pictureFirstTab.get(p.sha256);
        const words = img?.transcription?.trim() ? withoutFinancialDetails(img.transcription.trim()) : "";
        if (!first) pictureFirstTab.set(p.sha256, tab.name);
        const text = !summary ? "Picture (not read yet)"
          : first ? `Picture: ${summary} (the same picture as in her ${first} tab — its words are there)`
          : `Picture: ${summary}${words ? `\nIts words, as Wander read them:\n${words}` : ""}`;
        notes.push({ tripId, tabName: tab.name, rowIndex: 100000 + n, text });
      });
      if (tab.cells.length === 0 && tab.images.length === 0) notes.push({ tripId, tabName: tab.name, rowIndex: -1, text: "" });
    }
    if (notes.length) await tx.sheetNote.createMany({ data: notes, skipDuplicates: true });

    // Trip: dates, source, and the Guide marker (keeps the trip safe from deletion)
    await tx.trip.update({
      where: { id: tripId },
      data: {
        startDate: asDate(itin.firstDate!), endDate: asDate(itin.lastDate!), timeZone: tripZone,
        // Her sheet's name, without the computer's copy mark ("Japan Oct 2026-2" read like a file version)
        tagline: `From Larisa's Guide · ${opts.sourceName.replace(/\.xlsx$/i, "").replace(/(?:-\d| \(\d+\)| copy(?: \d+)?)$/i, "")}`,
      },
    });
    // (her sheet's address and tab ids — sheetLink.ts — and her Apple Maps guides — appleGuides.ts — kept across imports)
    const priorMappings = (await tx.sheetSyncConfig.findUnique({ where: { tripId }, select: { tabMappings: true } }))?.tabMappings as any;
    const kept = priorMappings?.sheetLink;
    const keptMaps = Array.isArray(priorMappings?.appleGuides) ? priorMappings.appleGuides : null;
    // (the days' summaries too — daySummaries.ts; a day the new copy changes hides its own until it's rewritten)
    const keptSummaries = priorMappings?.daySummaries && typeof priorMappings.daySummaries === "object" ? priorMappings.daySummaries : null;
    // (and Wander's own notes on her places — placeNotes.ts)
    const keptPlaces = Array.isArray(priorMappings?.placeNotes) ? priorMappings.placeNotes : null;
    const tabMappings = { source: "snapshot", sourceName: opts.sourceName, ...(kept ? { sheetLink: kept } : {}), ...(keptMaps ? { appleGuides: keptMaps } : {}), ...(keptSummaries ? { daySummaries: keptSummaries } : {}), ...(keptPlaces ? { placeNotes: keptPlaces } : {}) };
    await tx.sheetSyncConfig.upsert({
      where: { tripId },
      create: { tripId, spreadsheetId: "", lastSyncAt: new Date(), lastSyncStatus: "success", tabMappings },
      update: { lastSyncAt: new Date(), lastSyncStatus: "success", tabMappings },
    });

    // What changed since the last version
    const key = (i: { date: Date | string | null; time: string | null; title: string }) =>
      `${i.date ? (typeof i.date === "string" ? i.date : i.date.toISOString().slice(0, 10)) : "—"} ${i.time || ""} ${i.title}`.trim();
    const before = new Set(previousItems.map(key));
    const after = new Set(items.map(key));
    report.changes.added = previous ? Array.from(after).filter((k) => !before.has(k)) : [];
    report.changes.removed = previous ? Array.from(before).filter((k) => !after.has(k)) : [];

    report.counts = {
      tabs: read.tabs.length, pictures: read.images.length, cities: itin.cityOrder.length, days: dayCity.size,
      stays: itin.stays.length, items: items.length, reservations: reservations.length, actions: actions.length, ideas: ideas.length,
    };
    const unconfirmed = itin.warnings.filter((w) => !Array.from(checkOutConfirmed).some((h) => w.startsWith(`${h}: the Guide gives no check-out date`)));
    report.warnings.push(...unconfirmed, ...itin.skippedSections.map((s) => `Left out on purpose — Larisa marked it: "${s.title}".`));
    report.textReadings = textReadings;
    report.dayPlanReadings = dayPlanReadings;
    // The stored report must say what happened: this reading is the current, accepted one
    report.accepted = true;
    report.snapshotId = snap.id;
    await tx.guideSnapshot.update({ where: { id: snap.id }, data: { report: report as any } });
    return snap.id;
  }, { timeout: 120000, maxWait: 20000 });

  report.snapshotId = snapshotId;
  report.accepted = true;
  return report;
}
