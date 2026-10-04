/**
 * Her pictures, by tab (backend /guide/pictures) — "See her map from this tab" on a day whose tab holds one (Oct 2:
 * her illustrated day maps sat at the top of each day tab, out of sight in Wander). A tap asks for a fresh link.
 */
import { api } from "./api";

export interface GuidePicture { tab: string; anchor: string; sha256: string; summary: string }
type ByTab = { tab: string; pictures: { anchor: string; sha256?: string; summary: string | null; read: boolean; personal?: boolean }[] }[];
const byTrip = new Map<string, Promise<GuidePicture[]>>();
/** Once per trip per visit (a failed ask is tried again next time) */
export function guidePictures(tripId: string): Promise<GuidePicture[]> {
  if (!byTrip.has(tripId)) {
    const p = api.get<ByTab>(`/guide/pictures/${tripId}`)
      .then((tabs) => (Array.isArray(tabs) ? tabs : []).flatMap((t) => t.pictures.filter((x) => x.read && x.sha256 && !x.personal).map((x) => ({ tab: t.tab, anchor: x.anchor, sha256: x.sha256!, summary: x.summary || "" }))))
      .catch(() => { byTrip.delete(tripId); return []; });
    byTrip.set(tripId, p);
  }
  return byTrip.get(tripId)!;
}
