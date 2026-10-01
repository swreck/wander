/**
 * Her other tabs' text (the "tab by tab" rows), for the few places a screen needs a line from them — loaded once per
 * trip and kept (the phone's saved copy answers with no signal).
 *
 * Why: a screen must never say "her Guide doesn't say" when one of her tabs does (delight audit: at Narita Wander told
 * Julie "Her Guide doesn't say how to get from Narita to Imperial Hotel" — her "Tokyo Areas & Hotel Options" tab, on the
 * Imperial's row, names the Airport Limousine Bus from the main entrance and the Narita Express).
 */
import { api } from "./api";

export type NotesByTab = Record<string, { rowIndex: number; text: string }[]>;

const cache: Record<string, Promise<NotesByTab>> = {};

export function sheetNotes(tripId: string): Promise<NotesByTab> {
  if (!cache[tripId]) {
    cache[tripId] = api.get<{ byTab?: NotesByTab }>(`/sheets-sync/notes/${tripId}`)
      .then((r) => r?.byTab || {})
      .catch(() => { delete cache[tripId]; return {}; });
  }
  return cache[tripId];
}

const TRANSPORT = /\b(limousine|airport bus|narita express|n'?ex|skyliner|keisei|haruka|airport train|shuttle|taxi from (the )?airport|from (the )?airport)\b/i;

/** Her own sentences about getting from the airport to this hotel, from any tab row that names the hotel: [{ tab, text }] */
export function airportWaysTo(byTab: NotesByTab, hotelName: string): { tab: string; text: string }[] {
  // The hotel's distinctive word ("Imperial" from "Imperial Hotel"; "Granvia" from "Hotel Granvia Okayama")
  const word = hotelName.split(/\s+/).find((w) => w.length > 3 && !/^(hotel|the|ryokan|resort|inn|tokyo|kyoto|osaka)$/i.test(w));
  if (!word) return [];
  const out: { tab: string; text: string }[] = [];
  for (const [tab, rows] of Object.entries(byTab)) {
    for (const r of rows) {
      if (!new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(r.text) || !TRANSPORT.test(r.text)) continue;
      const sentences = r.text.split(/(?<=[.!?])\s+|\s+·\s+/).filter((s) => TRANSPORT.test(s));
      // (her cell's bullet and picture marks before the words — "￼ • Airport access…" — aren't hers to quote)
      for (const s of sentences) {
        const text = s.replace(/^[^\p{L}\p{N}“"(]+/u, "").trim();
        if (text && !out.some((o) => o.text === text)) out.push({ tab, text });
      }
    }
  }
  return out.slice(0, 3);
}
