/**
 * A line of her day plan that names no one, during a split day, may be named in a picture she pasted in the same tab:
 * her Kyoto map lists "You & Julie (morning)" over "• Traditional Industry Hall • Maruni Toryo (tools & clay) • Wood-firing
 * potter". Round 13 (Oct 1 2026): Wander said "Your Guide doesn't name the group for this line" — untrue of her Guide as
 * a whole. The picture's own words are quoted beside the line; who "You" is, is left to the reader.
 *
 * Finds the picture line naming the same place (every distinctive word of the picture's place name, before its
 * brackets, is in the plan line), walks up over its bullet siblings to their heading, and returns the heading only when
 * it names people. Nothing found, or a heading with no one in it: null.
 */
const STOP = new Set(["the", "and", "with", "for", "from", "to", "of", "at", "in", "on", "a", "an", "e", "g", "eg"]);
const wordsOf = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
const BULLET = /^\s*[•\-*·]\s*/;

export interface PictureGroup { heading: string; with: string[] }

/**
 * Where a booking picture says a tour starts, in its own words, and its arrive-early rule (round 13: her stop list puts
 * the Oct 25 e-bike meeting point at "Cycle Kyoto"; her Viator booking picture in the same tab says "Start your cycle
 * adventure … at Kyoto's NORU bicycle shop" and "Must arrive 15 minutes prior to departure"). Null when it names no place.
 */
export function pictureStartFor(transcription: string): { place: string; arrive: string | null } | null {
  const flat = (transcription || "").replace(/\s+/g, " ");
  const m = flat.match(/\bstart[a-z]*\b[^.]{0,80}?\bat\s+((?:[A-Z][\w'’&-]*)(?:\s+[\w'’&-]+){0,5}?\s+(?:shop|store|station|office|centre|center|lobby|entrance|gate|hotel|cafe|café|building))\b/i);
  if (!m) return null;
  const arrive = flat.match(/\bMust arrive \d+\s*minutes? (?:prior to|before) (?:departure|the start)\b/i)?.[0] || null;
  return { place: m[1].trim(), arrive };
}

export function pictureGroupFor(label: string, transcriptions: string[], people: string[]): PictureGroup | null {
  const own = wordsOf(label);
  if (!own.length) return null;
  const names = new RegExp(`\\b(you|${people.map((p) => p.replace(/[^A-Za-z]/g, "")).filter(Boolean).join("|")})\\b`, "i");
  for (const text of transcriptions) {
    const lines = (text || "").split("\n").map((l) => l.trim());
    for (let i = 0; i < lines.length; i++) {
      if (!BULLET.test(lines[i])) continue;
      const place = lines[i].replace(BULLET, "").split("(")[0];
      const pw = wordsOf(place);
      if (!pw.length || !pw.every((w) => own.includes(w))) continue;
      let j = i;
      while (j > 0 && BULLET.test(lines[j])) j--;
      if (j === i || BULLET.test(lines[j]) || !names.test(lines[j])) continue;
      const siblings: string[] = [];
      for (let k = j + 1; k < lines.length && BULLET.test(lines[k]); k++) if (k !== i) siblings.push(lines[k].replace(BULLET, ""));
      return { heading: lines[j], with: siblings };
    }
  }
  return null;
}
