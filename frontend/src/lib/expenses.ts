/**
 * Who paid for what, couple by couple (backend routes/expenses.ts; Larisa's idea, Oct 15 2026): who pays next, each
 * couple's total, what one owes the other to be even. This phone keeps its last copy, so it shows with no signal.
 */
import { api } from "./api";
import { money, type Currency, type Foreign, type Rates } from "./rates";

/** One payment on a trip whose payers are families (the server's backend/src/services/familyExpenses.ts FamilyItem) */
export type FamilyItem = {
  id: string; party: string; paidByName: string | null;
  amount: number; currency: string;
  /** its dollars; null when it couldn't be counted (see notCounted) */
  usd: number | null;
  rate: number | null; rateDate: string | null;
  what: string | null; dayDate: string | null;
  /** everyone on the trip that day (no list was said) */
  everyone: boolean;
  /** who it was for in the end, by name */
  forNames: string[];
  /** nobody was on the trip that day and no one was named: it stays the payer's own until someone says who it was for */
  forNobody: boolean;
  /** each family's part of it, in dollars */
  shares: Record<string, number>;
  /** kept before this trip's families were known, so it is in no sum: shown, never dropped */
  notCounted?: true;
  addedByName: string; createdAt: string; mayRemove: boolean; hasReceipt: boolean;
};

/** Budget on a trip whose payers are families, in dollars to the cent (the server's FamilyLedger) */
export type FamilyLedger = {
  unit: "USD";
  /** the families' labels, in their order */
  parties: string[];
  people: { name: string; party: string; abroadFrom: string; abroadTo: string }[];
  /** the day on the trip's own clock, and that clock */
  today: string;
  zone: string;
  /** the families with someone on the trip today */
  here: string[];
  paid: Record<string, number>;
  share: Record<string, number>;
  balance: Record<string, number>;
  /** the family that pays next; null when fewer than two families are on the trip today, or all are even */
  next: string | null;
  settled: boolean;
  /** the fewest payments that make every family even */
  even: { from: string; to: string; usd: number }[];
  /** the reader's own family */
  mine: string | null;
  items: FamilyItem[];
  rates: Rates;
  /** each day of the trip and the money of its country (null where Wander keeps no rate for it) */
  days: { date: string; money: Foreign | null }[];
};

export type Ledger = {
  parties: string[];
  totals: Record<string, number>;
  /** the yen shared half and half ("¥… shared so far"), and the yen wholly one couple's (Oct 16) — older copies kept on a
   *  phone have neither */
  shared?: number; alone?: number;
  next: string | null;
  owes: { from: string; to: string; yen: number } | null;
  items: { id: string; party: string; forParty?: string | null; amount: number; currency: string; yen: number; rate: number | null; what: string | null; dayDate: string | null; addedByName: string; createdAt: string; mayRemove: boolean; hasReceipt?: boolean; checkedBy?: string }[];
  /** a trip whose payers are families: the couples' fields above are empty and this is its Budget */
  family?: FamilyLedger;
  /** a trip built from a plan whose families aren't in yet: nothing can be kept */
  notSetUp?: boolean;
};

/** Who pays next, and that family's place among the trip's families (its colour); a couple's place is -1 */
export function payNextOf(l: Ledger | null): { party: string; index: number } | null {
  if (!l) return null;
  if (l.family) return l.family.next ? { party: l.family.next, index: l.family.parties.indexOf(l.family.next) } : null;
  return l.next ? { party: l.next, index: -1 } : null;
}

/** A receipt photo, shrunk on the phone, ready to read and to keep with its payment */
export type ReceiptPhoto = { mediaType: "image/jpeg"; data: string; thumb: string };
/** Ken, Oct 16: "take pictures of receipts and add them and simply note who paid for them and have the option of adding
 *  what the item is". The photo shrunk, then read by Wander: its total, yen or dollars, what it was for, the trip day —
 *  null fields when it couldn't be read (the person types the amount; the photo still goes with the payment).
 *  On a families' trip the server's reader gives dong, riel, yen or dollars, or no money when the receipt doesn't say:
 *  that screen asks for `readReceiptPhoto<Currency | null>`. */
export async function readReceiptPhoto<C = "JPY" | "USD">(tripId: string, file: File): Promise<{ photo: ReceiptPhoto | null; read: { amount: number | null; currency: C; what: string; date: string | null } | null; error?: string }> {
  const { shrinkPicture } = await import("./papers");
  const p = await shrinkPicture(file);
  if (!p) return { photo: null, read: null, error: "That picture couldn't be read on this phone. A screenshot of it works." };
  const photo: ReceiptPhoto = { mediaType: "image/jpeg", data: p.data, thumb: p.thumb };
  try {
    const r = await api.post<{ read: { amount: number | null; currency: C; what: string; date: string | null } | null }>(`/expenses/trip/${tripId}/receipt`, { file: photo });
    return { photo, read: r.read };
  } catch {
    return { photo, read: null };
  }
}
/** A receipt's photo added to a payment already kept (who kept it, or Ken). Null when kept; else what went wrong. */
export async function attachReceiptPhoto(tripId: string, id: string, file: File): Promise<string | null> {
  const { shrinkPicture } = await import("./papers");
  const p = await shrinkPicture(file);
  if (!p) return "That picture couldn't be read on this phone. A screenshot of it works.";
  try { await api.post(`/expenses/trip/${tripId}/${id}/receipt`, { file: { mediaType: "image/jpeg", data: p.data, thumb: p.thumb } }); window.dispatchEvent(new Event(MONEY_CHANGED)); return null; }
  catch (e: any) { return e?.status ? e.message : "That didn't go through. Try again when you have signal."; }
}
/** A payment's receipt photo, for showing (fetched with the person's sign-in; an object address the page lets go of) */
export async function receiptImage(tripId: string, id: string, small = false): Promise<string | null> {
  try {
    const r = await fetch(`/api/expenses/trip/${tripId}/${id}/receipt${small ? "?small=1" : ""}`, { headers: { Authorization: `Bearer ${localStorage.getItem("wander_token") || ""}` } });
    if (!r.ok) return null;
    return URL.createObjectURL(await r.blob());
  } catch { return null; }
}

const key = (tripId: string) => `wander:money:${tripId}`;
export const MONEY_CHANGED = "wander:money-changed";

/** "That's right": a payment that isn't shared is as meant — off the "check these" box (Ken, Oct 23). null when kept. */
export async function sayItsRight(tripId: string, id: string): Promise<string | null> {
  try { await api.post(`/expenses/trip/${tripId}/${id}/right`, {}); window.dispatchEvent(new Event(MONEY_CHANGED)); return null; }
  catch { return navigator.onLine === false ? "No signal — try again when there's a bar or two." : "That didn't save — try again?"; }
}
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
/** What's shared so far: the yen shared half and half (a phone's older copy: everything kept) */
export const sharedOf = (l: Ledger) => l.shared ?? Object.values(l.totals).reduce((a, b) => a + b, 0);
/** A one-time tag for one Keep: sent again with the same words, the server knows it's the same payment (a reply lost on a
 *  weak signal, "That didn't save", Keep again — never kept twice) */
export const newKeepKey = () => {
  try { if (typeof crypto?.randomUUID === "function") return crypto.randomUUID(); } catch { /* older phone */ }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};
/** A Keep not yet answered — it may have reached Wander. Its tag is kept for the same words from the moment Keep is
 *  tapped until Wander answers, on the phone itself, so the same payment typed again is still the one payment: after
 *  Cancel while "Keeping…" hangs, and after Wander is closed and opened again (fresh testers, Oct 16: each way, kept
 *  twice). A day old, it's let go. */
const UNSURE = "wander:unsure-keep";
type Unsure = { words: string; key: string; at: number; ttl?: number };
const live = (u: Unsure) => Date.now() - u.at < (u.ttl || 86400_000);
const unsure = (): Unsure[] => { try { return (JSON.parse(localStorage.getItem(UNSURE) || "[]") as Unsure[]).filter(live); } catch { return []; } };
/** Keeps whose pop-up was closed before Wander answered: if the answer then comes, the payment is kept, and the same words
 *  typed again in the next ten minutes are still that payment (Cancel while "Keeping…", it landed, typed again — kept
 *  twice; fresh tester). After ten minutes the same words are a new payment again (a second taxi). */
const letGo = new Set<string>();
export const letGoOfKeep = (key: string) => { letGo.add(key); };
const setUnsure = (list: Unsure[]) => { try { localStorage.setItem(UNSURE, JSON.stringify(list.slice(-20))); } catch { /* full or blocked */ } };
let unsureHere: Unsure[] = [];
const allUnsure = () => [...unsure(), ...unsureHere.filter(live)];
export const keepKeyFor = (tripId: string, words: string) => allUnsure().find((u) => u.words === `${tripId}|${words}`)?.key || newKeepKey();
/** A Keep whose pop-up was closed, answered after all: the Budget page says so ("Saved after all: …") */
export const MONEY_KEPT_LATE = "wander:money-kept-late";
/** err: what to say when it didn't (or may not have) saved; again: Wander already had this very payment ("Already saved") */
export async function addPayment(tripId: string, body: { paidBy: string; amount: number; currency: Currency; what?: string; forParty?: string | null; forPeople?: string[]; clientKey?: string; dayDate?: string; receipt?: ReceiptPhoto }, words = ""): Promise<{ err: string | null; again: boolean }> {
  let again = false;
  // (only the first send says "already kept": the phone's own second try finds the first one that got through, and
  // that's still her one Keep — "Already kept" after one tap read as if she'd typed it twice)
  let first = true;
  const send = async () => { const isFirst = first; first = false; const r = await api.post<{ again?: boolean }>(`/expenses/trip/${tripId}`, body); if (isFirst) again = !!r?.again; };
  // (no answer at all — not a refusal: a weak signal; one more try with the same tag, which can never keep it twice)
  const noAnswer = (e: any) => !e?.status || e.status >= 500;
  const mark = body.clientKey ? { words: `${tripId}|${words}`, key: body.clientKey, at: Date.now() } : null;
  const forget = () => { if (!mark) return; unsureHere = unsureHere.filter((u) => u.key !== mark.key); setUnsure(unsure().filter((u) => u.key !== mark.key)); };
  if (mark) { unsureHere = [...unsureHere.filter((u) => u.key !== mark.key), mark]; setUnsure([...unsure().filter((u) => u.key !== mark.key), mark]); }
  try {
    try { await send(); }
    catch (e: any) { if (!noAnswer(e) || !body.clientKey) throw e; await new Promise((r) => setTimeout(r, 1500)); await send(); }
    if (mark && letGo.has(mark.key)) {
      // (answered after its pop-up was closed: kept, and the same words for ten more minutes are this payment)
      const kept = { ...mark, at: Date.now(), ttl: 10 * 60_000 };
      unsureHere = [...unsureHere.filter((u) => u.key !== mark.key), kept];
      setUnsure([...unsure().filter((u) => u.key !== mark.key), kept]);
      // (and says so — it used to just appear in the list; fresh tester)
      // (dong and riel as a person reads them: "2,500,000 ₫")
      const said = body.currency === "USD" ? `$${body.amount}` : body.currency === "JPY" ? yen(body.amount) : money(body.amount, body.currency);
      if (!again) window.dispatchEvent(new CustomEvent(MONEY_KEPT_LATE, { detail: `${body.paidBy}, ${said}${body.what ? `, ${body.what}` : ""}` }));
    } else forget();
    window.dispatchEvent(new Event(MONEY_CHANGED));
    return { err: null, again };
  } catch (e: any) {
    if (!noAnswer(e)) { forget(); return { err: e?.message && !/^Request failed/i.test(e.message) ? e.message : "That didn't save. Try again in a moment.", again: false }; }
    // (it may have reached Wander: the list shows it if it did)
    window.dispatchEvent(new Event(MONEY_CHANGED));
    return { err: "Wander didn't hear back, so this may or may not have saved. Tap Save again when you have signal. It won't be saved twice.", again: false };
  }
}
/** Changed: only what's given (Ken, Oct 16: "go back and add reason, change total, or change payer") */
export async function changePayment(tripId: string, id: string, body: { paidBy?: string; amount?: number; currency?: Currency; what?: string; forParty?: string | null; forPeople?: string[] | null; dayDate?: string }): Promise<string | null> {
  try { await api.patch(`/expenses/trip/${tripId}/${id}`, body); window.dispatchEvent(new Event(MONEY_CHANGED)); return null; }
  catch (e: any) { return e?.message && !/^Request failed|Failed to fetch|Load failed/i.test(e.message) ? e.message : "That didn't save — try again in a moment."; }
}
export type LogLine = { at: string; by: string; action: string; /** a removed payment you may put back: its id */ putBack?: string;
  /** a removed payment you may not put back: who can ("Julie or Ken") */ putBackBy?: string };
/** Budget's History, newest first (Ken, Oct 16: "date, person, action only") */
export async function loadHistory(tripId: string): Promise<LogLine[] | null> {
  try { return (await api.get<{ history: LogLine[] }>(`/expenses/trip/${tripId}/history`)).history; } catch { return null; }
}
/** A payment taken away, put back: it counts again (Ken, Oct 16: "brought back into the live flow") */
export async function putBackPayment(tripId: string, id: string): Promise<string | null> {
  try { await api.post(`/expenses/trip/${tripId}/${id}/back`, {}); window.dispatchEvent(new Event(MONEY_CHANGED)); return null; }
  catch (e: any) { return e?.message && !/^Request failed|Failed to fetch|Load failed/i.test(e.message) ? e.message : "That didn't go through — try again in a moment."; }
}
export async function removePayment(tripId: string, id: string): Promise<string | null> {
  try { await api.delete(`/expenses/trip/${tripId}/${id}`); window.dispatchEvent(new Event(MONEY_CHANGED)); return null; }
  catch (e: any) { return e?.message || "That didn't go through — try again in a moment."; }
}
/** "¥12,400" */
export const yen = (n: number) => `¥${Math.round(n).toLocaleString("en-US")}`;
