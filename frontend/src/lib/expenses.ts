/**
 * Who paid for what, couple by couple (backend routes/expenses.ts; Larisa's idea, Oct 15 2026): who pays next, each
 * couple's total, what one owes the other to be even. This phone keeps its last copy, so it shows with no signal.
 */
import { api } from "./api";

export type Ledger = {
  parties: string[];
  totals: Record<string, number>;
  next: string | null;
  owes: { from: string; to: string; yen: number } | null;
  items: { id: string; party: string; amount: number; currency: string; yen: number; rate: number | null; what: string | null; dayDate: string | null; addedByName: string; createdAt: string; mayRemove: boolean }[];
};

const key = (tripId: string) => `wander:money:${tripId}`;
export const MONEY_CHANGED = "wander:money-changed";
// (someone else kept or took away a payment — or Scout did — and the server said so: every money view looks again)
if (typeof window !== "undefined") window.addEventListener("wander:data-changed", () => window.dispatchEvent(new Event(MONEY_CHANGED)));

/** The couple's initials, first names in alphabetical order — "Andy & Julie" or "Julie & Andy" → "AJ"; "Ken & Larisa" → "KL" */
export const initialsOf = (party: string) => party.split(/\s*&\s*|\s+and\s+/i).map((n) => n.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)).map((n) => n[0].toUpperCase()).join("");

export function savedLedger(tripId: string): Ledger | null {
  try { return JSON.parse(localStorage.getItem(key(tripId)) || "null"); } catch { return null; }
}
export async function loadLedger(tripId: string): Promise<Ledger | null> {
  try {
    const l = await api.get<Ledger>(`/expenses/trip/${tripId}`);
    try { localStorage.setItem(key(tripId), JSON.stringify(l)); } catch { /* full */ }
    return l;
  } catch { return savedLedger(tripId); }
}
export async function addPayment(tripId: string, body: { paidBy: string; amount: number; currency: "JPY" | "USD"; what?: string }): Promise<string | null> {
  try { await api.post(`/expenses/trip/${tripId}`, body); window.dispatchEvent(new Event(MONEY_CHANGED)); return null; }
  catch (e: any) { return e?.message && !/^Request failed|Failed to fetch|Load failed/i.test(e.message) ? e.message : "That didn't save — try again in a moment."; }
}
/** Changed: only what's given (Ken, Oct 16: "go back and add reason, change total, or change payer") */
export async function changePayment(tripId: string, id: string, body: { paidBy?: string; amount?: number; currency?: "JPY" | "USD"; what?: string }): Promise<string | null> {
  try { await api.patch(`/expenses/trip/${tripId}/${id}`, body); window.dispatchEvent(new Event(MONEY_CHANGED)); return null; }
  catch (e: any) { return e?.message && !/^Request failed|Failed to fetch|Load failed/i.test(e.message) ? e.message : "That didn't save — try again in a moment."; }
}
/** Budget's History, newest first (Ken, Oct 16: "date, person, action only") */
export async function loadHistory(tripId: string): Promise<{ at: string; by: string; action: string }[] | null> {
  try { return (await api.get<{ history: { at: string; by: string; action: string }[] }>(`/expenses/trip/${tripId}/history`)).history; } catch { return null; }
}
export async function removePayment(tripId: string, id: string): Promise<string | null> {
  try { await api.delete(`/expenses/trip/${tripId}/${id}`); window.dispatchEvent(new Event(MONEY_CHANGED)); return null; }
  catch (e: any) { return e?.message || "That didn't go through — try again in a moment."; }
}
/** "¥12,400" */
export const yen = (n: number) => `¥${Math.round(n).toLocaleString("en-US")}`;
