/**
 * Ideas for Wander (Oct 15 2026) — Ken and Andy's place for screenshots and ideas to make Wander better, with Scout and
 * Wander's engineer answering. Backend: routes/wanderIdeas.ts, services/wanderIdeas.ts.
 */
import { api } from "./api";
import { shrinkPicture } from "./papers";

export type IdeaStatus = "new" | "talking" | "planned" | "built" | "not-now";
export const STATUS_WORDS: Record<IdeaStatus, string> = { new: "New", talking: "Talking", planned: "Planned", built: "Built", "not-now": "Not now" };
export interface IdeaPost { id: string; who: string; role: "person" | "helper" | "engineer"; mine: boolean; words: string; screen: string | null; pictures: string[]; at: string }
export interface Idea extends IdeaPost { status: IdeaStatus; replies: IdeaPost[] }

export const ideasOf = (tripId: string) => api.get<{ ideas: Idea[] }>(`/wander-ideas/trip/${tripId}`).then((r) => r.ideas);
export const ideasUnseen = (tripId: string) => api.get<{ member: boolean; unseen?: number }>(`/wander-ideas/trip/${tripId}/unseen`);
export const ideasSeen = (tripId: string) => api.post(`/wander-ideas/trip/${tripId}/seen`, {}).catch(() => {});
export const setIdeaStatus = (tripId: string, id: string, status: IdeaStatus) => api.post(`/wander-ideas/trip/${tripId}/${id}/status`, { status });

/** Post an idea (or a reply, with parentId): the words as written, and each picture shrunk on the phone first */
export async function postIdea(tripId: string, words: string, files: File[], opts: { parentId?: string; screen?: string } = {}): Promise<{ id: string } | { error: string }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { error: "No signal right now. Your words stay here; post again when there's signal." };
  const pictures: { mediaType: string; data: string }[] = [];
  for (const f of files.slice(0, 6)) {
    const p = await shrinkPicture(f);
    if (!p) return { error: `“${f.name || "That picture"}” couldn't be read on this phone. A screenshot of it works.` };
    pictures.push({ mediaType: "image/jpeg", data: p.data });
  }
  try {
    return await api.post<{ id: string }>(`/wander-ideas/trip/${tripId}`, { words, pictures, ...opts });
  } catch (e: any) {
    // (the server's own words when it said why; otherwise plain words — never "Request failed: 500")
    return { error: e?.message && !/^Request failed|Failed to fetch|Unauthorized|NetworkError|Load failed/i.test(e.message) ? e.message : "That didn't post. Your words are still here; try again in a moment." };
  }
}

/** A picture, loaded with this phone's sign-in (a plain link to it carries none) — kept for the visit */
const pictureUrls = new Map<string, Promise<string | null>>();
export function ideaPictureUrl(id: string): Promise<string | null> {
  if (!pictureUrls.has(id)) {
    let token = ""; try { token = localStorage.getItem("wander_token") || ""; } catch { /* none */ }
    pictureUrls.set(id, fetch(`/api/wander-ideas/picture/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => { pictureUrls.delete(id); return null; }));
  }
  return pictureUrls.get(id)!;
}
