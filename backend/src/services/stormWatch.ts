/**
 * Storm, warning and train watch (Ken's decision 2, Oct 13 2026: "yes" — live before Oct 19, two days before the Oct 21
 * Shinkansen through Shizuoka; plan in trip-data/weather-research-2026-10-12.md §4 item 5, data in
 * storm-watch-research-2026-10-14.md). Normally silent. A day gets a line only when Japan's weather agency (JMA) has:
 *   - a Level 3+ warning in force now for the town they're in today (where they sleep, a day trip, an airport, a travel
 *     day's start, and the areas on its way);
 *   - a medium or high chance of warning-level weather there, as far ahead as JMA says (about 3 days by region, 5 by
 *     prefecture);
 *   - a typhoon or tropical storm forecast near them within 5 days.
 * A travel day with any of these also says how JR handles stopped trains.
 *
 * JMA's files are unofficial and changed on May 29 2026 (the old warning file still answers, frozen at May 28 — it
 * would have said "no warnings" forever). So each reader checks the file is fresh and shaped as expected and throws
 * otherwise; the watch then says what it couldn't check, never "nothing" (verify45). And it says how far each check
 * reaches, so nobody is told a day was checked that wasn't.
 */
import prisma from "./db.js";

const JMA = "https://www.jma.go.jp/bosai";
/** English pages people can open (each checked to open, Oct 14) */
export const LINKS = {
  // (short: the sentence before each already names the agency)
  warnings: { label: "Warning map", url: "https://www.jma.go.jp/bosai/map.html#contents=warning&lang=en" },
  typhoon: { label: "Typhoon map", url: "https://www.jma.go.jp/bosai/map.html#contents=typhoon&lang=en" },
  // (its English address sends the page to the Japanese one — Oct 14; JR East's status pages refuse requests from
  // outside Japan, so they can't be checked and aren't linked)
  tokaido: { label: "Shinkansen status, in Japanese", url: "https://traininfo.jr-central.co.jp/shinkansen/pc/ja/index.html" },
};
/** Prefectures the Tokaido Shinkansen runs through: Tokyo, Kanagawa, Shizuoka, Aichi, Gifu, Shiga, Kyoto, Osaka */
const TOKAIDO_OFFICES = /^(13|14|22|23|21|25|26|27)/;

/** JMA's warning codes since May 29 2026, from its own warning page: element and level (2 advisory, 3 warning, 4 urgent
 *  warning, 5 emergency warning). Level 2s are left out of the watch; they're listed so a new code is noticed. */
export const KINDS: Record<string, { el: string; level: number }> = {
  "10": { el: "rain", level: 2 }, "03": { el: "rain", level: 3 }, "43": { el: "rain", level: 4 }, "33": { el: "rain", level: 5 },
  "29": { el: "landslide", level: 2 }, "09": { el: "landslide", level: 3 }, "49": { el: "landslide", level: 4 }, "39": { el: "landslide", level: 5 },
  "19": { el: "tide", level: 2 }, "08": { el: "tide", level: 3 }, "48": { el: "tide", level: 4 }, "38": { el: "tide", level: 5 },
  "15": { el: "wind", level: 2 }, "05": { el: "wind", level: 3 }, "35": { el: "wind", level: 5 },
  "13": { el: "wind_snow", level: 2 }, "02": { el: "wind_snow", level: 3 }, "32": { el: "wind_snow", level: 5 },
  "12": { el: "snow", level: 2 }, "06": { el: "snow", level: 3 }, "36": { el: "snow", level: 5 },
  "16": { el: "wave", level: 2 }, "07": { el: "wave", level: 3 }, "37": { el: "wave", level: 5 },
  "14": { el: "thunder", level: 2 }, "17": { el: "snow_melting", level: 2 }, "20": { el: "fog", level: 2 }, "21": { el: "dry", level: 2 },
  "22": { el: "avalanche", level: 2 }, "23": { el: "cold", level: 2 }, "24": { el: "frost", level: 2 }, "25": { el: "ice", level: 2 }, "26": { el: "snow_accretion", level: 2 },
};
const WARN_WORDS: Record<string, string> = {
  rain: "heavy rain", landslide: "landslides", tide: "storm surge", wind: "storm winds", wind_snow: "snowstorms", snow: "heavy snow", wave: "high waves",
};
/** JMA's own English names for the levels (its warning page) */
const LEVEL_WORDS: Record<number, string> = { 3: "warning", 4: "urgent warning", 5: "emergency warning" };
/** The chance file's types → words ("大雨の警報級の可能性" → heavy rain) */
const CHANCE_WORDS: [RegExp, string][] = [[/^大?雨/, "heavy rain"], [/^土砂/, "landslides"], [/^雪/, "heavy snow"], [/^風/, "storm winds"], [/^波/, "high waves"], [/^潮位/, "storm surge"]];

/** Where a place is in JMA's terms: its region (class10) and prefecture (office) codes, the codes of its town's areas
 *  (class20 — Nikko City is five), and names to say */
export type Region = {
  code: string; office: string; towns: string[]; town: string; area: string;
  /** the prefecture in English ("Shizuoka"), for a chance JMA gives for the whole prefecture */
  pref?: string;
  /** every town area in the region — for an area on the way, where the route's point fell in one town of many */
  regionTowns?: string[];
};
export interface WatchLine {
  date: string;
  kind: "warning" | "chance" | "typhoon" | "train";
  /** one sentence, ready to show and for Scout to say as is */
  text: string;
  link?: { label: string; url: string };
}
export interface Watch {
  /** per Japan date, today through 5 days ahead: empty when nothing is up */
  days: Record<string, WatchLine[]>;
  /** how far each check reaches (Japan dates), null when it couldn't be read */
  through: { warnings: string | null; chances: string | null; typhoons: string | null };
  /** what couldn't be read just now — the watch then says it doesn't know, never "nothing" */
  unknown: string[];
  checked: string;
}

// ── JMA's files, kept a few minutes ──
const files = new Map<string, { at: number; v: unknown }>();
async function jma<T>(path: string, keepMin: number): Promise<T> {
  const k = files.get(path);
  if (k && Date.now() - k.at < keepMin * 60_000) return k.v as T;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const r = await fetch(`${JMA}/${path}`, { signal: ctl.signal });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    const v = await r.json();
    files.set(path, { at: Date.now(), v });
    return v as T;
  } finally { clearTimeout(t); }
}

export const unseenCodes = new Set<string>();
/** A warning code as JMA writes it, "03" — also when it comes as a number (verify48) */
const codeOf = (c: unknown) => (c == null || c === "" ? "" : String(c).padStart(2, "0"));
type Warn = { el: string; level: number; since: string };
/** Warnings in force now, by town area (class20 code): Level 3+ only. Throws when the file is stale or not shaped as
 *  expected — never an empty answer from a file it can't read (verify45). */
export function warningsNow(map: unknown, mapTime: unknown, now = new Date()): Map<string, Warn[]> {
  const latest = Date.parse((mapTime as any)?.latestControlDatetime || "");
  // (JMA updates the file whenever any office issues anything nationwide, usually many times an hour; six quiet hours
  // means it's stuck — the old file froze for months)
  if (!Array.isArray(map) || !map.length || !latest || now.getTime() - latest > 6 * 3600_000) throw new Error("JMA warnings file stale or changed");
  const shaped = map.filter((b: any) => typeof b?.dataTypeCode === "string" && typeof b?.reportDatetime === "string" && Array.isArray(b?.warning?.class20Items)
    && b.warning.class20Items.every((it: any) => typeof it?.areaCode === "string" && Array.isArray(it?.kinds)));
  if (shaped.length < map.length * 0.9) throw new Error(`JMA warnings file changed (${shaped.length} of ${map.length} bulletins as expected)`);
  // (and the words and codes inside: statuses JMA uses, codes in KINDS — renamed ones read as "nothing"; verify46)
  const kinds = shaped.flatMap((b: any) => b.warning.class20Items.flatMap((it: any) => it.kinds));
  // (statuses: nearly all must be JMA's words; codes: one new code is logged below, most unknown means a new code list)
  const known = kinds.filter((k: any) => typeof k?.status === "string" && (["発表", "継続", "解除"].includes(k.status) || /なし|から/.test(k.status)));
  if (!kinds.length || known.length < kinds.length * 0.9) throw new Error(`JMA warnings file changed (${known.length} of ${kinds.length} statuses as expected)`);
  // (an issued, continuing or lifted entry always carries its code — without one, the field was renamed; verify47)
  const live = kinds.filter((k: any) => ["発表", "継続", "解除"].includes(k?.status));
  if (live.length && live.filter((k: any) => codeOf(k.code)).length < live.length * 0.9) throw new Error("JMA warnings file changed (entries without codes)");
  const coded = kinds.filter((k: any) => codeOf(k?.code));
  if (coded.length && coded.filter((k: any) => KINDS[codeOf(k.code)]).length < coded.length * 0.5) throw new Error(`JMA warnings file changed (most codes unknown)`);
  // Since May 29 each kind has its own bulletin (dataTypeCode: VPWW55 rain, VPWW56 landslide, VPWW58 wind, VPWW59
  // waves…), and the file keeps each office's latest of each. So what's in force in a town is, for each kind of
  // bulletin, the newest one's codes still "発表" (issued) or "継続" (continuing) — a rain bulletin saying "none" says
  // nothing about wind (Hokkaido, Oct 14: wind 05 in VPWW58 beside rain lifted in VPWW55).
  const newest = new Map<string, { at: string; kinds: { code?: string; status?: string }[] }>();   // town|type → bulletin
  for (const b of shaped as any[]) {
    for (const it of b.warning.class20Items) {
      const key = `${it.areaCode}|${b.dataTypeCode}`;
      const had = newest.get(key);
      if (!had || b.reportDatetime > had.at) newest.set(key, { at: b.reportDatetime, kinds: it.kinds });
    }
  }
  const out = new Map<string, Warn[]>();
  for (const [key, b] of newest) {
    const town = key.split("|")[0];
    for (const k of b.kinds) {
      const code = codeOf(k.code);
      if (!code || (k.status !== "発表" && k.status !== "継続")) continue;
      const kind = KINDS[code];
      // (a code JMA added after this list: never guessed into a warning — logged, to add to KINDS)
      if (!kind) { if (!unseenCodes.has(code)) { unseenCodes.add(code); console.warn(`[storm-watch] JMA warning code ${code} isn't in KINDS`); } continue; }
      if (kind.level < 3) continue;
      out.set(town, [...(out.get(town) || []), { ...kind, since: b.at }]);
    }
  }
  return out;
}

export type Chances = {
  /** by area code (a region's or a prefecture's), by Japan date */
  by: Map<string, Map<string, { what: string; chance: "medium" | "high" }[]>>;
  /** the dates each area code is listed for, whatever its values — what was actually checked */
  covered: Map<string, Set<string>>;
};
/** JMA's chance of warning-level weather, "中" medium / "高" high. Today and tomorrow come by region (class10), in
 *  6-hour blocks; up to 5 days by prefecture (office code) — Shizuoka's 220000, not Izu's 220020 (verify45). */
export function chancesAhead(prob: unknown): Chances {
  if (!Array.isArray(prob) || !prob.length) throw new Error("JMA chance file changed");
  const by = new Map<string, Map<string, { what: string; chance: "medium" | "high" }[]>>();
  const covered = new Map<string, Set<string>>();
  const values = new Set<string>();
  let read = 0;
  for (const office of prob) for (const report of Array.isArray(office) ? office : []) for (const ts of report?.timeSeries || []) {
    const days: string[] = (ts.timeDefines || []).map((t: string) => String(t).slice(0, 10));
    for (const a of ts.areas || []) for (const p of a.properties || []) {
      const what = CHANCE_WORDS.find(([re]) => re.test(String(p.type || "")))?.[1];
      if (!what || !Array.isArray(p.probabilities) || !a.code) continue;
      read++;
      const code = String(a.code);
      if (!covered.has(code)) covered.set(code, new Set());
      p.probabilities.forEach((v: string, i: number) => {
        values.add(v);
        const day = days[i];
        if (!day) return;
        covered.get(code)!.add(day);
        if (v !== "中" && v !== "高") return;
        if (!by.has(code)) by.set(code, new Map());
        const list = by.get(code)!.get(day) || [];
        const had = list.find((x) => x.what === what);
        if (had) { if (v === "高") had.chance = "high"; } else list.push({ what, chance: v === "高" ? "high" : "medium" });
        by.get(code)!.set(day, list);
      });
    }
  }
  if (!read) throw new Error("JMA chance file changed (no chances read)");
  // (dates and values as JMA writes them — a renamed date field or new value words read as "nothing"; verify46)
  if (!covered.size || ![...covered.values()].some((d) => d.size)) throw new Error("JMA chance file changed (no dates read)");
  // ("なし" none, "" not given, "中" medium, "高" high — JMA's own words, Oct 14)
  const WORDS = ["", "なし", "中", "高"];
  if (values.size && ![...values].every((v) => WORDS.includes(v))) throw new Error(`JMA chance file changed (values ${[...values].filter((v) => !WORDS.includes(v)).join(", ")})`);
  return { by, covered };
}

export type Storm = { number: string; name: string; category: string; points: { at: string; lat: number; lng: number; radiusKm: number }[] };
const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
/** The storm's center now and where it's forecast, with the 70% circle (JMA typhoon forecast.json); null when the file
 *  isn't as expected (the caller says it couldn't read that storm) */
export function stormTrack(forecast: unknown, category = ""): Storm | null {
  if (!Array.isArray(forecast)) return null;
  const title = forecast.find((p: any) => p?.part === "title") as any;
  const points = forecast.filter((p: any) => Array.isArray(p?.center) && p?.validtime?.UTC).map((p: any) => ({
    at: String(p.validtime.UTC), lat: Number(p.center[0]), lng: Number(p.center[1]), radiusKm: Number(p.probabilityCircle?.radius || 0) / 1000,
  })).filter((p) => isFinite(p.lat) && isFinite(p.lng) && !isNaN(Date.parse(p.at)));
  if (!points.length) return null;
  return { number: String(title?.typhoonNumber || "").slice(-2).replace(/^0/, ""), name: String(title?.name?.en || ""), category, points };
}
/** "Typhoon Nakri (No. 31)", "Severe Tropical Storm Koguma (No. 29)" — JMA's category (TY, STS, TS) */
export function stormName(s: Storm): string {
  // (only JMA's own TY is a typhoon; "LOW" is one that's lost its tropical strength — Koguma on Oct 14, verify47 — and
  // an unknown category is said as a tropical storm, never promoted to a typhoon)
  if (s.category === "LOW") return `The remains of ${s.name || "a tropical storm"}${s.number ? ` (No. ${s.number})` : ""}, now an ordinary low,`;
  const kind = s.category === "TY" ? "Typhoon" : s.category === "STS" ? "Severe Tropical Storm" : s.category === "TD" ? "A tropical depression" : "Tropical Storm";
  if (kind.startsWith("A ")) return kind;
  return s.name ? `${kind} ${s.name}${s.number ? ` (No. ${s.number})` : ""}` : s.number ? `${kind} No. ${s.number}` : `A ${kind.toLowerCase()}`;
}
/** Near: within 300 km (~190 miles) of a place counting the forecast's uncertainty (its 70% circle) — a typhoon's
 *  storm winds reach 100–250 km from its center, and its rain further. The distance said is to the center (verify45:
 *  to the circle's edge, a center ~600 km off read "within about 100 miles"). */
export const NEAR_KM = 300;
/** The track hour by hour between JMA's forecast points (24 hours apart after the first day): a fast storm crossing
 *  Tokyo between two points went unseen on both days (verify46). Straight lines between points, the circle growing
 *  with them. */
export function hourly(points: Storm["points"]): Storm["points"] {
  const ps = [...points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const out: Storm["points"] = [];
  for (let i = 0; i < ps.length; i++) {
    out.push(ps[i]);
    const next = ps[i + 1];
    if (!next) break;
    const t0 = Date.parse(ps[i].at), hours = Math.floor((Date.parse(next.at) - t0) / 3600_000);
    for (let h = 1; h < hours; h++) {
      const f = h / hours;
      out.push({ at: new Date(t0 + h * 3600_000).toISOString(), lat: ps[i].lat + (next.lat - ps[i].lat) * f, lng: ps[i].lng + (next.lng - ps[i].lng) * f, radiusKm: ps[i].radiusKm + (next.radiusKm - ps[i].radiusKm) * f });
    }
  }
  return out;
}
export function stormNear(s: Storm, place: { lat: number; lng: number }, from: number, to: number): { at: string; km: number } | null {
  let best: { at: string; km: number } | null = null;
  for (const p of hourly(s.points)) {
    const t = Date.parse(p.at);
    if (t < from || t > to) continue;
    const km = kmBetween(p, place);
    if (km - p.radiusKm <= NEAR_KM && (!best || km < best.km)) best = { at: p.at, km };
  }
  return best;
}

// ── Which region a place is in: Google's town for the point, then JMA's own list of towns (kept for good) ──
const regions = new Map<string, Region | null>();
type AreaJson = { offices: Record<string, { name: string; enName?: string }>; class10s: Record<string, { name: string; enName?: string; parent: string }>; class15s: Record<string, { parent: string }>; class20s: Record<string, { name: string; enName?: string; parent: string }> };
export function regionOf(area: AreaJson, prefecture: string, town: string): Region | null {
  if (!town) return null;
  const hits = Object.entries(area.class20s).filter(([, v]) => v.name.startsWith(town)).map(([code, v]) => {
    const c10 = area.class15s[v.parent]?.parent;
    const office = c10 ? area.class10s[c10]?.parent : undefined;
    return { code, v, c10, office };
  }).filter((h) => h.c10 && h.office && (!prefecture || area.offices[h.office!]?.name === prefecture));
  if (!hits.length) return null;
  const { v, c10, office } = hits[0];
  // (the town in English: "Odawara City" → "Odawara"; "Imaichi, Nikko City" → "Nikko")
  const en = (v.enName || "").split(",").pop()!.replace(/\s+(City|Town|Village|Ward)$/i, "").trim();
  // (the area in English, for a place on the way: "Western Region" of Kanagawa → "western Kanagawa"; "Izu" → "Izu";
  // "Tokyo Region" → "Tokyo")
  const pref = area.offices[office!]?.enName || "";
  const r10 = area.class10s[c10!]?.enName || "";
  const dir = r10.match(/^(Northern|Southern|Eastern|Western|Central|North-western|North-eastern|South-western|South-eastern)\s+Region$/i)?.[1];
  const areaName = dir ? `${dir.toLowerCase()} ${pref}` : !r10 || r10.includes(pref) || /Prefecture$/i.test(r10) ? pref : r10;
  const regionTowns = Object.entries(area.class20s).filter(([, x]) => area.class15s[x.parent]?.parent === c10).map(([code]) => code);
  return { code: c10!, office: office!, towns: hits.filter((h) => h.c10 === c10).map((h) => h.code), town: en || town, area: areaName || en || town, pref, regionTowns };
}
export async function regionAt(lat: number, lng: number): Promise<Region | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (regions.has(key)) return regions.get(key)!;
  const g = process.env.GOOGLE_MAPS_API_KEY;
  if (!g) return null;
  try {
    const j = await (await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=ja&key=${g}`)).json() as any;
    const parts: { long_name: string; types: string[] }[] = j?.results?.[0]?.address_components || [];
    const pref = parts.find((p) => p.types.includes("administrative_area_level_1"))?.long_name || "";
    // (a Tokyo ward is its own town in JMA's list — 千代田区; elsewhere the city or town — 日光市, 益子町)
    const towns = [...parts.filter((p) => p.types.includes("locality")), ...parts.filter((p) => p.types.includes("sublocality_level_1") && /区$/.test(p.long_name))].map((p) => p.long_name);
    const area = await jma<AreaJson>("common/const/area.json", 24 * 60);
    const r = towns.map((t) => regionOf(area, pref, t)).find(Boolean) || null;
    regions.set(key, r);
    return r;
  } catch { return null; }
}

/** "Wed, Oct 21" */
export const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** A place they'll be on a day: where they sleep, a day trip or an airport, where a travel day starts, or an area on the
 *  way */
export type DayPlace = { name: string; lat: number; lng: number; role: "night" | "day" | "morning" | "way" };
type Placed = DayPlace & { region: Region | null };

/** The watch, from the files and the places — pure, for tests. `today`: Japan's date. A null file wasn't read. */
export function watchFrom(input: {
  today: string; now: Date;
  places: Record<string, Placed[]>;
  travelDays: Set<string>;
  warnings: Map<string, Warn[]> | null;
  chances: Chances | null;
  storms: Storm[] | null;
}): { days: Record<string, WatchLine[]>; through: Watch["through"] } {
  const days: Record<string, WatchLine[]> = {};
  const dates = Object.keys(input.places).sort();
  const when = (date: string) => (date === input.today ? "today" : `on ${dayLabel(date)}`);
  // (a place by name — where they sleep, spend the day or land; an area on the way only when it's all there is)
  const named = (ps: Placed[]) => {
    const stay = [...new Set(ps.filter((p) => p.role !== "way").map((p) => p.name))];
    return stay.length ? list(stay) : `${list([...new Set(ps.map((p) => p.name))])}, on your way`;
  };
  for (const date of dates) {
    const lines: WatchLine[] = [];
    const here = input.places[date].filter((p) => p.region);
    // Warnings in force now, on today only — by town: all of the town's areas, or part of it (verify45: a warning for
    // Okutama alone would have read "in force for Tokyo")
    if (date === input.today && input.warnings) {
      const said = new Set<string>();
      for (const p of here) {
        const found = new Map<string, { w: Warn; n: number }>();
        // (an area on the way: any town in it — the route's point fell in Odawara, the warning was Hakone's; verify46)
        const towns = p.role === "way" ? p.region!.regionTowns || p.region!.towns : p.region!.towns;
        for (const t of towns) for (const w of input.warnings.get(t) || []) {
          const k = `${w.el}|${w.level}`;
          found.set(k, { w, n: (found.get(k)?.n || 0) + 1 });
        }
        for (const [k, { w, n }] of found) {
          const whole = n >= p.region!.towns.length;
          // (an area on the way is bigger than the town the point fell in: always "part of")
          const where = p.role === "way" ? `part of ${p.name}, on your way` : `${whole ? "" : "part of "}${p.name}`;
          if (said.has(`${k}|${where}`)) continue;
          said.add(`${k}|${where}`);
          lines.push({ date, kind: "warning", link: LINKS.warnings,
            text: `A Level ${w.level} ${LEVEL_WORDS[w.level] || "warning"} for ${WARN_WORDS[w.el] || w.el} is in force for ${where}, from Japan's weather agency.` });
        }
      }
    }
    // The chance of warning-level weather: the region's, when JMA lists the region that day (this morning's, finer);
    // else the prefecture's, said as the prefecture's — "for Shizuoka, where Shirakabeso is", never as if for the town
    // (verify46: yesterday's prefecture value outranked this morning's region value, and read as the town's)
    if (input.chances) {
      const groups = new Map<string, { src: "region" | "pref"; ps: Placed[]; what: Map<string, "medium" | "high"> }>();
      for (const p of here) {
        const byRegion = input.chances.covered.get(p.region!.code)?.has(date);
        const src = byRegion ? "region" : "pref";
        const c = input.chances.by.get(byRegion ? p.region!.code : p.region!.office)?.get(date) || [];
        if (!c.length) continue;
        const key = `${src}|${byRegion ? p.region!.code : p.region!.office}`;
        const g = groups.get(key) || { src, ps: [] as Placed[], what: new Map<string, "medium" | "high">() };
        g.ps.push(p);
        for (const x of c) g.what.set(x.what, g.what.get(x.what) === "high" || x.chance === "high" ? "high" : "medium");
        groups.set(key, g);
      }
      for (const level of ["high", "medium"] as const) {
        for (const g of groups.values()) {
          const what = [...g.what].filter(([, v]) => v === level).map(([w]) => w);
          if (!what.length) continue;
          const stay = [...new Set(g.ps.filter((p) => p.role !== "way").map((p) => p.name))];
          const pref = g.ps[0].region!.pref || "";
          const where = g.src === "region" || !pref ? named(g.ps)
            : stay.length ? `${pref}, where ${list(stay)} ${stay.length > 1 ? "are" : "is"}` : `${pref}, on your way`;
          lines.push({ date, kind: "chance", link: LINKS.warnings,
            text: `Japan's weather agency sees a ${level} chance of warning-level ${list(what)} for ${where}${/, on your way$|, where .* (is|are)$/.test(where) ? "," : ""} ${when(date)}.` });
        }
      }
    }
    // A typhoon near where they'll be, within 5 days
    const away = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${input.today}T00:00:00Z`)) / 86_400_000);
    if (away <= 5 && input.storms) {
      const from = Date.parse(`${date}T00:00:00+09:00`), to = from + 86_400_000;
      for (const s of input.storms) {
        // (the closest; at a tie, where they sleep or spend the day before an area on the way)
        const rank = (p: DayPlace) => (p.role === "way" ? 1 : 0);
        const near = input.places[date].map((p) => ({ p, n: stormNear(s, p, from, to) })).filter((x) => x.n)
          .sort((a, b) => Math.round(a.n!.km / 30) - Math.round(b.n!.km / 30) || rank(a.p) - rank(b.p))[0];
        if (!near) continue;
        const miles = Math.round((near.n!.km * 0.621) / 10) * 10;
        lines.push({ date, kind: "typhoon", link: LINKS.typhoon,
          text: `${stormName(s)} is forecast to ${miles < 40 ? "pass over or near" : `pass about ${miles} miles from`} ${near.p.name}${near.p.role === "way" ? ", on your way," : ""} ${when(date)}, from Japan's weather agency.` });
      }
    }
    // A day with a train in it under any of these: how JR handles stopped trains (makeWatch's trainDay)
    if (lines.length && input.travelDays.has(date)) {
      // (the Shinkansen's own status page when the day runs through Tokaido country — Oct 21, Tokyo to Mishima)
      const tokaido = new Set(here.map((p) => p.region!.office).filter((o) => TOKAIDO_OFFICES.test(o))).size >= 2;
      lines.push({ date, kind: "train", ...(tokaido ? { link: LINKS.tokaido } : {}),
        text: "For a train that day: JR usually announces planned stops the day before, and a train it cancels is refunded in full, with no fee." });
    }
    if (lines.length) days[date] = lines;
  }
  // How far each check reaches: warnings are now; chances as far as every place of every day is listed (by region or
  // prefecture); typhoons 5 days (JMA's tracks run 5 days, and no storm means none to come near)
  let chances: string | null = null;
  if (input.chances) {
    for (const date of dates) {
      const all = input.places[date].every((p) => p.region && (input.chances!.covered.get(p.region.code)?.has(date) || input.chances!.covered.get(p.region.office)?.has(date)));
      if (!all) break;
      chances = date;
    }
  }
  return { days, through: { warnings: input.warnings ? input.today : null, chances, typhoons: input.storms ? addDays(input.today, 5) : null } };
}

/** Points every ~40 km along the road from where a travel day starts to where it ends (not the ends) — the road runs
 *  through the same areas as the train (Nikko → Tokyo → Kanagawa → eastern Shizuoka on Oct 21); a straight line didn't
 *  (verify45: Ome, Sagamihara and Hakone, missing Mishima and Yokohama). Google gives no train routes in Japan. Null
 *  when there's no route to be had (the watch then says it couldn't check the way). */
const routes = new Map<string, { lat: number; lng: number }[] | null>();
export async function wayPoints(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<{ lat: number; lng: number }[] | null> {
  const key = `${a.lat.toFixed(3)},${a.lng.toFixed(3)}>${b.lat.toFixed(3)},${b.lng.toFixed(3)}`;
  if (routes.has(key)) return routes.get(key)!;
  const g = process.env.GOOGLE_MAPS_API_KEY;
  if (!g) return null;
  try {
    const j = await (await fetch(`https://maps.googleapis.com/maps/api/directions/json?origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&mode=driving&key=${g}`)).json() as any;
    const line = decodePolyline(j?.routes?.[0]?.overview_polyline?.points || "");
    if (line.length < 2) { routes.set(key, null); return null; }
    const out: { lat: number; lng: number }[] = [];
    let since = 0;
    for (let i = 1; i < line.length; i++) {
      since += kmBetween(line[i - 1], line[i]);
      if (since >= 40 && kmBetween(line[i], b) > 20) { out.push(line[i]); since = 0; }
    }
    routes.set(key, out);
    return out;
  } catch { return null; }
}
export function decodePolyline(s: string): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < s.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, byte = 0;
      do { byte = s.charCodeAt(i++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20 && i < s.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d; else lng += d;
    }
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}

/** Airports in her plan for this person that day: "Land at Narita (NRT) · United", "Kansai (KIX) → San Francisco" */
export async function airportsOf(tripId: string, person: string, date: string): Promise<DayPlace[]> {
  const me = person.split(" ")[0].toLowerCase();
  const flights = await prisma.guideItem.findMany({ where: { tripId, kind: "flight", date: new Date(`${date}T00:00:00Z`) }, select: { title: true, forWhom: true } });
  const { hotelPoint } = await import("./packingWeather.js");
  const out: DayPlace[] = [];
  for (const f of flights) {
    if (f.forWhom && !/everyone/i.test(f.forWhom) && !f.forWhom.toLowerCase().includes(me)) continue;
    const m = f.title.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s\(([A-Z]{3})\)/);
    if (!m) continue;
    const p = await hotelPoint(`${m[1]} Airport ${m[2]} Japan`);
    if (p && p.lat > 24 && p.lat < 46 && p.lng > 122 && p.lng < 146) out.push({ name: `${m[1]} Airport`, lat: p.lat, lng: p.lng, role: "day" });
  }
  return out;
}

const TRAIN = /\b(train|trains|shinkansen|bullet train|JR|nozomi|hikari|kodama|yamabiko|hayabusa|tsubasa|narita express|N'EX)\b/i;
/** A day with a train in it: her Guide's lines that day ("day 6 - hike, train to kyoto", "YAMABIKO 127"), or the words
 *  of a document someone gave Wander for that day (Backroads' "board one of Japan's famous bullet trains", Oct 21) */
export async function trainDay(tripId: string, date: string): Promise<boolean> {
  const items = await prisma.guideItem.findMany({ where: { tripId, date: new Date(`${date}T00:00:00Z`) }, select: { kind: true, title: true, detail: true } });
  if (items.some((i) => i.kind === "train" || TRAIN.test(`${i.title} ${i.detail || ""}`))) return true;
  const { tripDocumentsOf } = await import("./guide/tripDocuments.js");
  for (const d of await tripDocumentsOf(tripId)) {
    if (!d.dayOne || !/^\d{4}-\d{2}-\d{2}$/.test(d.dayOne)) continue;
    const day = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${d.dayOne}T00:00:00Z`)) / 86_400_000) + 1;
    if (d.sections.some((s: any) => s.day === day && s.paragraphs.some((p: string) => TRAIN.test(p)))) return true;
  }
  return false;
}

const kept = new Map<string, { at: number; w: Watch }>();
const making = new Map<string, Promise<Watch>>();
/** This person's watch, today (Japan's date) through 5 days ahead. Fresh for 5 minutes; `orStale` returns a copy up to
 *  an hour old at once while a new one is made (Scout's opening doesn't wait on JMA — verify45: a first watch took 9 s) */
export async function stormWatch(tripId: string, person: string, today: string, now = new Date(), orStale = false, remake = false): Promise<Watch> {
  const key = `${tripId}|${person}|${today}`;
  const k = kept.get(key);
  if (!remake && k && Date.now() - k.at < 5 * 60_000) return k.w;
  // (tests only: a made-up watch, so Scout's answers can be checked on a typhoon that isn't there — never set on Railway)
  if (process.env.STORM_WATCH_FAKE) {
    const fs = await import("fs");
    return JSON.parse(fs.readFileSync(process.env.STORM_WATCH_FAKE, "utf-8")) as Watch;
  }
  const fresh = making.get(key) || makeWatch(tripId, person, today, now).then((w) => { kept.set(key, { at: Date.now(), w }); return w; }).finally(() => making.delete(key));
  making.set(key, fresh);
  if (orStale && k && Date.now() - k.at < 60 * 60_000) return k.w;
  return fresh;
}

/** Each traveler's watch made ahead — at start, then every 10 minutes — so no first question of the day, and none just
 *  after a deploy, waits 6–9 s on JMA or goes without the storm lines (verify46). Only for active trips. */
export function startWatchWarmer() {
  // (WARMERS=off: a local test server, unless a check needs warming — it kept the test database awake; cost audit)
  if (process.env.VITEST_WORKER_ID || process.env.STORM_WATCH_FAKE || process.env.WARMERS === "off") return;
  const warm = async () => {
    // (not overnight in Japan, midnight to 5 AM — nobody's asking, and production's database can rest; verify47)
    const hourJapan = new Date(Date.now() + 9 * 3600_000).getUTCHours();
    if (hourJapan < 5) return;
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    // (only a trip under way or starting within the eight days it warms — after the trip, or for a placeholder trip, it
    // woke the database 19 hours a day for nobody; cost audit, Oct 16)
    const trips = await prisma.trip.findMany({ where: { status: "active", endDate: { gte: new Date(`${today}T00:00:00Z`) }, startDate: { lte: new Date(`${addDays(today, 8)}T00:00:00Z`) } }, select: { id: true, tripMembers: { select: { traveler: { select: { displayName: true } } } } } });
    for (const t of trips) for (const m of t.tripMembers) {
      // (made fresh each round; the last copy keeps serving meanwhile)
      await stormWatch(t.id, m.traveler.displayName, today, new Date(), false, true).catch(() => null);
      // (and their day forecasts for the week ahead — three Open-Meteo calls per place, kept 30 minutes: on a slow
      // morning a cold week took 9 s, and Scout or the day page shouldn't be the one waiting)
      const { dayWeather } = await import("./dayWeather.js");
      for (let i = 0; i < 8; i++) await dayWeather(t.id, m.traveler.displayName, addDays(today, i), today).catch(() => null);
    }
  };
  // (every 10 minutes: a watch older than 5 is still served at once while the next is made — orStale)
  setInterval(() => { warm().catch(() => {}); }, 10 * 60_000);
  setTimeout(() => { warm().catch(() => {}); }, 8000);
}

async function makeWatch(tripId: string, person: string, today: string, now: Date): Promise<Watch> {
  const { dayPlaces } = await import("./dayWeather.js");
  const unknown: string[] = [];
  const dates = Array.from({ length: 6 }, (_, i) => addDays(today, i));
  const places: Record<string, Placed[]> = {};
  const travelDays = new Set<string>();
  for (const date of dates) {
    const at = await dayPlaces(tripId, person, date).catch(() => null);
    if (!at) { places[date] = []; continue; }
    const list: DayPlace[] = [{ name: at.night.town, lat: at.night.lat, lng: at.night.lng, role: "night" }];
    if (at.dayTrip) list.push({ name: at.dayTrip.place, lat: at.dayTrip.lat, lng: at.dayTrip.lng, role: "day" });
    list.push(...(await airportsOf(tripId, person, date).catch(() => [])));
    // (JR's rule only on a day with a train in it — her Guide's lines that day, or Backroads' words for that day; not
    // Oct 18, a Backroads bus day — verify46)
    if (await trainDay(tripId, date).catch(() => false)) travelDays.add(date);
    if (at.morning) {
      list.push({ name: at.morning.place, lat: at.morning.lat, lng: at.morning.lng, role: "morning" });
      const way = await wayPoints(at.morning, at.night);
      if (!way) unknown.push(`the areas on the way from ${at.morning.place} to ${at.night.town} on ${dayLabel(date)}`);
      for (const p of way || []) list.push({ name: "", lat: p.lat, lng: p.lng, role: "way" });
    }
    const placed: Placed[] = [];
    for (const p of list) {
      const region = await regionAt(p.lat, p.lng);
      if (!region && p.role !== "way") unknown.push(`which weather area ${p.name} is in`);
      // (an area on the way is named by its area, never a town the train may not pass: "western Kanagawa")
      placed.push({ ...p, name: p.name || region?.area || "", region });
    }
    // (one per area on the way, and none for an area where the day already is)
    const seen = new Set(placed.filter((p) => p.role !== "way" && p.region).map((p) => p.region!.code));
    places[date] = placed.filter((p) => {
      if (!p.name) return false;
      if (p.role !== "way") return true;
      if (!p.region || seen.has(p.region.code)) return false;
      seen.add(p.region.code);
      return true;
    });
  }
  let warnings: Map<string, Warn[]> | null = null, chances: Chances | null = null, storms: Storm[] | null = null;
  try { warnings = warningsNow(await jma("warning/data/r8/map.json", 5), await jma("warning/data/r8/map_time.json", 5), now); }
  catch (e: any) { unknown.push("warnings in force now"); console.warn("[storm-watch] warnings:", e?.message); }
  try { chances = chancesAhead(await jma("probability/data/probability/r8/map.json", 15)); }
  catch (e: any) { unknown.push("the chance of warning-level weather"); console.warn("[storm-watch] chances:", e?.message); }
  try {
    const listed = await jma<{ tropicalCyclone?: string; category?: string }[]>("typhoon/data/targetTc.json", 15);
    if (!Array.isArray(listed) || listed.some((t) => typeof t?.tropicalCyclone !== "string")) throw new Error("typhoon list changed");
    const tracks = await Promise.all(listed.map(async (t) => ({ id: t.tropicalCyclone!, s: stormTrack(await jma(`typhoon/data/${t.tropicalCyclone}/forecast.json`, 15).catch(() => null), t.category || "") })));
    // (a listed storm whose track can't be read: said, never dropped — verify45)
    const unread = tracks.filter((t) => !t.s);
    if (unread.length) throw new Error(`couldn't read the track of ${unread.map((t) => t.id).join(", ")}`);
    storms = tracks.map((t) => t.s!);
  } catch (e: any) { unknown.push("typhoons"); console.warn("[storm-watch] typhoons:", e?.message); }
  const { days, through } = watchFrom({ today, now, places, travelDays, warnings, chances, storms });
  return { days, through, unknown: [...new Set(unknown)], checked: now.toISOString() };
}
