/**
 * Her pictures, by tab (backend /guide/pictures) — "See her map from this tab" on a day whose tab holds one (Oct 2:
 * her illustrated day maps sat at the top of each day tab, out of sight in Wander). A tap asks for a fresh link.
 */
import { api } from "./api";

export interface GuidePicture { tab: string; anchor: string; sha256: string; summary: string }
type ByTab = { tab: string; pictures: { anchor: string; sha256?: string; summary: string | null; read: boolean; personal?: boolean }[] }[];
const byTrip = new Map<string, Promise<GuidePicture[]>>();
const key = (tripId: string) => `wander:guide-pictures:${tripId}`;

/** This phone's last copy (undefined if it has none) — the day draws with it at once, nothing drops in later */
export function savedGuidePictures(tripId: string): GuidePicture[] | undefined {
  try { const raw = localStorage.getItem(key(tripId)); return raw ? (JSON.parse(raw) as GuidePicture[]) : undefined; } catch { return undefined; }
}

/** Once per trip per visit (a failed ask is tried again next time) */
export function guidePictures(tripId: string): Promise<GuidePicture[]> {
  if (!byTrip.has(tripId)) {
    const p = api.get<ByTab>(`/guide/pictures/${tripId}`)
      .then((tabs) => {
        const list = (Array.isArray(tabs) ? tabs : []).flatMap((t) => t.pictures.filter((x) => x.read && x.sha256 && !x.personal).map((x) => ({ tab: t.tab, anchor: x.anchor, sha256: x.sha256!, summary: x.summary || "" })));
        try { localStorage.setItem(key(tripId), JSON.stringify(list)); } catch { /* storage full or private */ }
        return list;
      })
      .catch(() => { byTrip.delete(tripId); return savedGuidePictures(tripId) || []; });
    byTrip.set(tripId, p);
  }
  return byTrip.get(tripId)!;
}
