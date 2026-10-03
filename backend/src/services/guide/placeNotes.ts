/**
 * Wander's own notes on her places — facts about a place she names that come from somewhere other than her Guide
 * (Oct 2 2026: her Guide says only "Shirakabeso"; Backroads describes it as "tucked away in a forested valley on the
 * Izu Peninsula", at 1594 Yugashima, Izu — added by Ken). Always said as Wander's, with where it came from; never as
 * hers. Kept beside her sheet's address; every import keeps it. The city of the same name gets the place's location
 * on the map (scripts/set-place-note.ts).
 */
import prisma from "../db.js";

export interface PlaceNote {
  /** the place as her Guide names it ("Shirakabeso") */
  name: string;
  /** what it is and where, in plain words ("a ryokan in a forested valley on the Izu Peninsula") */
  what: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** where Wander learned it ("Backroads' description, added by Ken") */
  from: string;
  addedAt: string;
}

export async function placeNotesOf(tripId: string): Promise<PlaceNote[]> {
  const cfg = await prisma.sheetSyncConfig.findUnique({ where: { tripId }, select: { tabMappings: true } });
  const list = (cfg?.tabMappings as any)?.placeNotes;
  return Array.isArray(list) ? list.filter((p: any) => p && typeof p.name === "string" && typeof p.what === "string" && typeof p.from === "string") : [];
}

const fold = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** The note for a place her Guide names, by name (the same name, or her name inside a longer one — "Check out · Shirakabeso") */
export function noteFor(notes: PlaceNote[], name: string): PlaceNote | undefined {
  const n = fold(name);
  return notes.find((p) => { const k = fold(p.name); return k.length >= 4 && (n === k || new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(n)); });
}

/** The words Scout reads beside the place — Wander's, with their source */
export function placeNoteWords(p: PlaceNote): string {
  return `[WANDER'S ADDITION, not her Guide — ${p.from}: ${p.name} is ${p.what}${p.address ? `; address ${p.address}` : ""}]`;
}
