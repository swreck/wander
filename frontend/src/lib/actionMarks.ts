/**
 * To-dos and deadlines marked done in Wander by the person they're for (Ken, Oct 9: Actions "seems to include old
 * actions, non actions, and actions not for me"). Her Guide's own to-dos can only be ticked in her sheet, and some of her
 * lists have no status at all — in Wander they never finished. A mark is Wander's record, beside her list; never written to
 * her sheet. One place for Actions, the day's "Don't miss" and Home: a deadline marked done stops asking.
 * Keys match the server's (services/actionMarks.ts).
 */
import { api } from "./api";

export interface Mark { key: string; label: string; byName: string; at: string }

export const todoKey = (a: { id: string; sheetRowRef: string | null }) => `todo:${a.sheetRowRef || a.id}`;
export const deadlineKey = (i: { title: string; date: string | null }) => `deadline:${i.title.trim().replace(/\s+/g, " ")}|${(i.date || "").slice(0, 10)}`;

const copyKey = (tripId: string) => `wander:action-marks:${tripId}`;
const saved = (tripId: string): Mark[] => { try { return JSON.parse(localStorage.getItem(copyKey(tripId)) || "[]"); } catch { return []; } };

/** The trip's marks — Wander's, else the phone's copy (no signal) */
export async function loadMarks(tripId: string): Promise<Map<string, Mark>> {
  try {
    const list = await api.get<Mark[]>(`/action-marks/${tripId}`);
    try { localStorage.setItem(copyKey(tripId), JSON.stringify(list)); } catch { /* full */ }
    return new Map(list.map((m) => [m.key, m]));
  } catch {
    return new Map(saved(tripId).map((m) => [m.key, m]));
  }
}

/** The marks this phone last had, at once (for a first draw) */
export const savedMarks = (tripId: string) => new Map(saved(tripId).map((m) => [m.key, m]));

/** Done (or not done after all); every screen showing marks hears of it */
export async function setMark(tripId: string, key: string, label: string, done: boolean): Promise<void> {
  await api.post(`/action-marks/${tripId}`, { key, label, done });
  window.dispatchEvent(new CustomEvent("wander:marks-changed", { detail: { tripId } }));
}

/** "Oct 12" */
export const markDay = (m: Mark) => new Date(m.at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
