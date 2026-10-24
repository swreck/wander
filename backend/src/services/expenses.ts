/**
 * Who paid for what, couple by couple (Oct 15 2026). Larisa's idea, through Ken: "one should be able to say to scout it
 * any time that the unit that is Ken and Larisa has paid a certain amount of money for something. That amount of money
 * needs to be documented so that at the end of the trip, the amount of money paid by Ken Larissa and the amount of money
 * paid by Julie and Andi needs to be added up with the difference the amount that one owes to the other at the end of
 * the trip. And to make that amount of money to be even at the end of the trip as small as possible, there should
 * always be a simple button that is something like who pays next and it just points to the couple that currently has
 * the smaller total." Ken's answers: shared half and half; "In yen (or dollars and you should convert)"; all four see it;
 * "It didn't need to be exact!"
 *
 * Every amount is shared half and half, so the couple that paid less owes the other half the difference. Kept as said,
 * yen or dollars; a dollar amount is kept with its yen at that day's rate (the European Central Bank's, via
 * frankfurter.app — free, no key).
 */
import Anthropic from "@anthropic-ai/sdk";
import prisma from "./db.js";
import { broadcastChange } from "../routes/sse.js";
import { tripDays, type PaperFile } from "./papers.js";

export type Ledger = {
  parties: string[];
  /** what each couple has paid, everything they kept */
  totals: Record<string, number>;
  /** the yen of payments shared half and half — "¥… shared so far" */
  shared: number;
  /** the yen of payments wholly for one couple (Oct 16) */
  alone: number;
  /** the couple behind, who pays next — null when even */
  next: string | null;
  /** half the difference: what the couple behind owes the other, to be even */
  owes: { from: string; to: string; yen: number } | null;
  items: { id: string; party: string; forParty: string | null; amount: number; currency: string; yen: number; rate: number | null; what: string | null; dayDate: string | null; addedByName: string; createdAt: string; mayRemove: boolean; hasReceipt: boolean; checkedBy?: string }[];
};

const first = (s: string) => s.trim().split(/\s+/)[0].toLowerCase();

/** A couple by its people, whatever order her Guide names them in: "Julie & Andy" and "Andy & Julie" are "andy+julie" */
export const coupleKey = (label: string) => label.split(/\s*&\s*|\s+and\s+/i).map((x) => x.trim()).filter(Boolean).map(first).sort().join("+");
/** A kept payment's couple as the trip names it now — a payment kept as "Julie & Andy" still counts if a new copy of her
 *  Guide says "Andy & Julie" (the sums matched couples by spelling; one flip and every payment under the old one would
 *  have dropped out of them, unseen) */
export const canonCouple = (parties: string[], label: string) => parties.find((p) => coupleKey(p) === coupleKey(label)) || label;

/** The trip's couples, as her Guide names them ("Ken & Larisa", "Andy & Julie") — both of each a member of the trip */
export async function partiesOf(tripId: string): Promise<string[]> {
  const found = await couplesInGuide(tripId);
  if (found.length >= 2) return found;
  // (her Guide naming fewer than two — a new copy that drops its "&" lines: the couples payments were already kept for,
  // so the sums never lose one)
  const kept = await prisma.tripExpense.findMany({ where: { tripId }, select: { party: true }, distinct: ["party"], orderBy: { createdAt: "asc" } });
  const out = [...found];
  for (const k of kept) if (!out.some((p) => coupleKey(p) === coupleKey(k.party))) out.push(k.party);
  return out.slice(0, 2);
}

async function couplesInGuide(tripId: string): Promise<string[]> {
  const members = await prisma.tripMember.findMany({ where: { tripId }, include: { traveler: { select: { displayName: true } } }, orderBy: { joinedAt: "asc" } });
  const names = new Set(members.map((m) => first(m.traveler.displayName)));
  // (in a fixed order, so the same Guide always gives the same spelling)
  const rows = await prisma.guideItem.findMany({ where: { tripId, forWhom: { contains: "&" } }, select: { forWhom: true }, orderBy: [{ date: "asc" }, { id: "asc" }] });
  const count = new Map<string, { label: string; n: number }>();
  for (const r of rows) {
    const people = String(r.forWhom).split(/\s*&\s*/).map((x) => x.trim()).filter(Boolean);
    if (people.length !== 2 || !people.every((p) => names.has(first(p)))) continue;
    const key = people.map(first).sort().join("+");
    const c = count.get(key) || { label: people.join(" & "), n: 0 };
    c.n++; count.set(key, c);
  }
  // (the two most-named couples, in the order their first member joined the trip — Ken & Larisa first)
  const order = members.map((m) => first(m.traveler.displayName));
  const top = [...count.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 2);
  return top.sort((a, b) => Math.min(...a[0].split("+").map((x) => order.indexOf(x))) - Math.min(...b[0].split("+").map((x) => order.indexOf(x)))).map(([, c]) => c.label);
}

/** The couple a person (or a couple's name) belongs to — "Andy", "Andy and Julie", "we" said by Andy */
export function partyFor(parties: string[], name: string): string | null {
  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return parties.find((p) => p.split(/\s*&\s*/).some((x) => words.includes(first(x)))) || null;
}

// The day's yen per dollar, kept 12 hours (a failed ask: the last one known, else a round figure, said as approximate)
let rateKept: { rate: number; at: number; approx: boolean } | null = null;
export async function yenPerDollar(): Promise<{ rate: number; approx: boolean }> {
  if (rateKept && Date.now() - rateKept.at < 12 * 3600_000 && !rateKept.approx) return rateKept;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=JPY", { signal: ctl.signal }).finally(() => clearTimeout(t));
    const rate = (await r.json())?.rates?.JPY;
    if (typeof rate === "number" && rate > 50 && rate < 400) { rateKept = { rate, at: Date.now(), approx: false }; return rateKept; }
  } catch { /* fall through */ }
  return rateKept || { rate: 150, approx: true };
}

export async function ledger(tripId: string, who?: { travelerId?: string | null; displayName?: string | null }): Promise<Ledger> {
  const parties = await partiesOf(tripId);
  const rows = (await prisma.tripExpense.findMany({ where: { tripId, removedAt: null }, orderBy: { createdAt: "desc" } }))
    .map((r) => ({ ...r, party: canonCouple(parties, r.party), forParty: r.forParty ? canonCouple(parties, r.forParty) : null }));
  const totals: Record<string, number> = Object.fromEntries(parties.map((p) => [p, 0]));
  for (const r of rows) totals[r.party] = (totals[r.party] || 0) + r.yen;
  // What the other couple owes for each payment: half of one shared, all of one wholly theirs (Ken, Oct 16: Julie's
  // ¥5,000 for Larisa's jacket is Ken & Larisa's to pay back in full), none of one wholly the payer's own
  const owedBack = (r: { party: string; forParty: string | null; yen: number }) => (!r.forParty ? r.yen / 2 : r.forParty !== r.party ? r.yen : 0);
  const shared = rows.filter((r) => !r.forParty).reduce((a, r) => a + r.yen, 0);
  const alone = rows.filter((r) => !!r.forParty).reduce((a, r) => a + r.yen, 0);
  let next: string | null = null, owes: Ledger["owes"] = null;
  if (parties.length === 2) {
    const [a, b] = parties;
    // (positive: b owes a)
    const net = rows.reduce((n, r) => n + (r.party === a ? owedBack(r) : r.party === b ? -owedBack(r) : 0), 0);
    if (Math.round(net) !== 0) {
      const behind = net > 0 ? b : a, ahead = behind === a ? b : a;
      next = behind;
      owes = { from: behind, to: ahead, yen: Math.round(Math.abs(net)) };
    }
  }
  const withReceipt = new Set((await prisma.expenseReceipt.findMany({ where: { tripId }, select: { expenseId: true } })).map((r) => r.expenseId));
  const org = await prisma.tripMember.findFirst({ where: { tripId }, orderBy: { joinedAt: "asc" }, select: { travelerId: true } });
  const mine = (r: { addedById: string | null; addedByName: string }) => !!who && ((!!who.travelerId && r.addedById === who.travelerId) || (!!who.displayName && first(r.addedByName) === first(who.displayName)) || (!!who.travelerId && org?.travelerId === who.travelerId));
  return {
    parties, totals, shared, alone, next, owes,
    items: rows.map((r) => ({ id: r.id, party: r.party, forParty: r.forParty, amount: r.amount, currency: r.currency, yen: r.yen, rate: r.rate, what: r.what, dayDate: r.dayDate, addedByName: r.addedByName, createdAt: r.createdAt.toISOString(), mayRemove: mine(r), hasReceipt: withReceipt.has(r.id),
      ...(r.forParty && r.checkedAt ? { checkedBy: r.checkedBy || "someone" } : {}) })),
  };
}

/** "That's right": a payment that isn't shared is as meant — off the "check these" box (Ken, Oct 23: "they're all
 *  correct. I don't know how to remove them from that page. make sure there's a way to remove them"). Anyone on the
 *  trip; logged. Changing who paid, the amount or who it's for puts it back in the box. */
export async function checkNotShared(tripId: string, id: string, who: { travelerId?: string | null; displayName: string }): Promise<"done" | "gone" | "shared" | "not-member"> {
  const row = await prisma.tripExpense.findFirst({ where: { id, tripId, removedAt: null } });
  if (!row) return "gone";
  if (!row.forParty) return "shared";
  if (who.travelerId && !(await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId, travelerId: who.travelerId } } }))) return "not-member";
  if (!row.checkedAt) {
    await prisma.tripExpense.update({ where: { id }, data: { checkedAt: new Date(), checkedBy: who.displayName } });
    await logChange(tripId, id, who, `said it's right that it isn't shared (${moneyWords(row.amount, row.currency)}, for ${row.forParty} alone)`);
    tellScreens(tripId, who.displayName);
  }
  return "done";
}

/** Every open screen on the trip looks again (the bar's "who pays next", Home's total) — quietly, no notice; the person
 *  who kept it too, since Scout may have kept it for them */
function tellScreens(tripId: string, name: string) {
  try { broadcastChange(tripId, { userCode: "", displayName: name, description: "updated the budget", quiet: true }); } catch { /* no one listening */ }
}

const forWords = (forParty: string | null) => (forParty ? ` for ${forParty} alone` : "");
/** What to ask when it would be a couple paying for themselves alone */
const notSharedSelf = (party: string, parties: string[]) => {
  const other = parties.find((p) => p !== party);
  return `${party} paying for ${party} alone isn't shared at all, so the Budget has nothing to keep. Was it shared, half each${other ? `, or for ${other} alone (they'd owe it all back)` : ""}?`;
};
const moneyWords = (amount: number, currency: string) => (currency === "USD" ? `$${Number(amount.toFixed(2))}` : yenWords(amount));
/** One line of Budget's History (Ken, Oct 16: "date, person, action only") */
async function logChange(tripId: string, expenseId: string, by: { travelerId?: string | null; displayName: string }, action: string) {
  try { await prisma.tripExpenseLog.create({ data: { tripId, expenseId, byId: by.travelerId || null, byName: by.displayName, action } }); }
  catch (e: any) { console.warn("[budget] history not kept:", e.message); }
}
/** Who may change or take away a payment: who kept it, or Ken (the trip's first member) — his rule for Maybes */
async function mayChange(tripId: string, row: { addedById: string | null; addedByName: string }, who: { travelerId?: string | null; displayName: string }) {
  return mayChangeAs(await organizerOf(tripId), row, who);
}
const organizerOf = async (tripId: string) => (await prisma.tripMember.findFirst({ where: { tripId }, orderBy: { joinedAt: "asc" }, select: { travelerId: true } }))?.travelerId || null;
const mayChangeAs = (org: string | null, row: { addedById: string | null; addedByName: string }, who: { travelerId?: string | null; displayName: string }) =>
  (!!who.travelerId && (row.addedById === who.travelerId || org === who.travelerId)) || (!!who.displayName && first(row.addedByName) === first(who.displayName));

/** A payment: who paid (a couple, or anyone in it), how much, in what, for what, on which day */
export async function addExpense(input: { tripId: string; paidBy: string; amount: number; currency?: string; what?: string | null; dayDate?: string | null; forParty?: string | null; addedById: string | null; addedByName: string; clientKey?: string | null; receipt?: PaperFile | null }):
  Promise<{ id: string; party: string; forParty: string | null; yen: number; rate: number | null; approx: boolean; again?: boolean } | { error: string }> {
  // The same Keep again (its reply lost on a weak signal, "That didn't save", Keep tapped again): the payment already kept
  const clientKey = typeof input.clientKey === "string" && /^[\w-]{8,64}$/.test(input.clientKey) ? input.clientKey : null;
  const already = async () => {
    const r = clientKey ? await prisma.tripExpense.findUnique({ where: { clientKey } }) : null;
    return r && r.tripId === input.tripId ? { id: r.id, party: r.party, forParty: r.forParty, yen: r.yen, rate: r.rate, approx: false, again: true } : null;
  };
  const seen = await already();
  if (seen) return seen;
  const parties = await partiesOf(input.tripId);
  const party = parties.find((p) => p.toLowerCase() === input.paidBy.trim().toLowerCase()) || partyFor(parties, input.paidBy);
  if (!party) return { error: `Which couple paid? ${parties.join(" or ") || "No couples found in her Guide."}` };
  const amount = Number(input.amount);
  if (!isFinite(amount) || amount <= 0 || amount > 10_000_000) return { error: "That amount doesn't look right — how much was it?" };
  const currency = /^(usd|\$|dollars?)$/i.test(String(input.currency || "")) ? "USD" : "JPY";
  let yen = Math.round(amount), rate: number | null = null, approx = false;
  if (currency === "USD") { const r = await yenPerDollar(); rate = r.rate; approx = r.approx; yen = Math.round(amount * r.rate); }
  const dayDate = typeof input.dayDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.dayDate) ? input.dayDate : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  // (wholly one couple's: "Ken & Larisa", "Larisa", "hers" said by Larisa — or shared when not said)
  let forParty: string | null = null;
  if (input.forParty && !/^(shared|split|both|everyone|all of us|half)$/i.test(String(input.forParty).trim())) {
    forParty = parties.find((p) => p.toLowerCase() === String(input.forParty).trim().toLowerCase()) || partyFor(parties, String(input.forParty));
    if (!forParty) return { error: `Who is it for? ${parties.join(", ")}, or shared` };
  }
  // (a couple paying for themselves alone isn't a shared cost at all — Andy kept four that way on Oct 23, meaning shared;
  // Ken: "Make a shared expense as a clear default… Ask if the intent is unclear")
  if (forParty && forParty === party) return { error: notSharedSelf(party, parties) };
  let row;
  try {
    row = await prisma.tripExpense.create({ data: { tripId: input.tripId, party, forParty, amount, currency, yen, rate, what: (input.what || "").trim().slice(0, 200) || null, dayDate, addedById: input.addedById, addedByName: input.addedByName, clientKey } });
  } catch (e: any) {
    // (two copies of the same Keep arriving together: the second finds the first)
    if (e?.code === "P2002") { const r = await already(); if (r) return r; }
    throw e;
  }
  // (its receipt, when it was kept from a photo of one — a failure to keep the picture never loses the payment)
  if (input.receipt) await keepReceipt(input.tripId, row.id, input.receipt).catch((e) => console.warn("[budget] receipt not kept:", e?.message || e));
  await logChange(input.tripId, row.id, { travelerId: input.addedById, displayName: input.addedByName }, `added ${moneyWords(amount, currency)} (${party})${forWords(forParty)}`);
  // (a one-time note from Scout after this, when Ken left one — services/tripAlerts ONE_TIME_NOTES; never holds it up)
  try { const { afterDoing } = await import("./tripAlerts.js"); await afterDoing(input.tripId, { travelerId: input.addedById, displayName: input.addedByName }, "budget-add"); }
  catch (e: any) { console.warn("[budget] one-time note:", e?.message || e); }
  tellScreens(input.tripId, input.addedByName);
  return { id: row.id, party, forParty, yen, rate, approx };
}

/** Taken away (hidden, never deleted) — by who added it, or the trip's first member */
export async function removeExpense(tripId: string, id: string, who: { travelerId?: string | null; displayName: string }): Promise<boolean | "not-yours"> {
  const row = await prisma.tripExpense.findFirst({ where: { id, tripId, removedAt: null } });
  if (!row) return false;
  if (!(await mayChange(tripId, row, who))) return "not-yours";
  await prisma.tripExpense.update({ where: { id }, data: { removedAt: new Date() } });
  await logChange(tripId, id, who, `removed ${moneyWords(row.amount, row.currency)} (${row.party})`);
  tellScreens(tripId, who.displayName);
  return true;
}

/** Put back (Ken, Oct 16, on "Nothing is lost": brought back into the live flow) — a payment taken away counts again, as
 *  it was; by who kept it, or Ken */
export async function restoreExpense(tripId: string, id: string, who: { travelerId?: string | null; displayName: string }): Promise<{ party: string; amount: number; currency: string } | "not-yours" | "gone" | "already"> {
  const row = await prisma.tripExpense.findFirst({ where: { id, tripId } });
  if (!row) return "gone";
  if (!row.removedAt) return "already";
  if (!(await mayChange(tripId, row, who))) return "not-yours";
  await prisma.tripExpense.update({ where: { id }, data: { removedAt: null } });
  await logChange(tripId, id, who, `put back ${moneyWords(row.amount, row.currency)} (${row.party})`);
  tellScreens(tripId, who.displayName);
  return { party: row.party, amount: row.amount, currency: row.currency };
}

/** Changed: how much, in what, which couple paid, what for (Ken, Oct 16: "add edit button to budget page to go back and
 *  add reason, change total, or change payer") — by who kept it, or Ken. A dollar amount keeps the rate it was kept at,
 *  unless it's newly in dollars (then that day's). */
export async function changeExpense(tripId: string, id: string, who: { travelerId?: string | null; displayName: string },
  change: { amount?: number; currency?: string; paidBy?: string; what?: string | null; forParty?: string | null }):
  Promise<{ party: string; yen: number; said: string } | "not-yours" | "gone" | { error: string }> {
  const row = await prisma.tripExpense.findFirst({ where: { id, tripId, removedAt: null } });
  if (!row) return "gone";
  if (!(await mayChange(tripId, row, who))) return "not-yours";
  const parties = await partiesOf(tripId);
  // (as the trip names the couples now — a kept "Julie & Andy" read against "Andy & Julie" would log a change that isn't one)
  row.party = canonCouple(parties, row.party);
  if (row.forParty) row.forParty = canonCouple(parties, row.forParty);
  let party = row.party;
  if (change.paidBy !== undefined && String(change.paidBy).trim()) {
    const p = parties.find((x) => x.toLowerCase() === String(change.paidBy).trim().toLowerCase()) || partyFor(parties, String(change.paidBy));
    if (!p) return { error: `Which couple paid? ${parties.join(" or ")}` };
    party = p;
  }
  let amount = row.amount;
  if (change.amount !== undefined) {
    const n = Number(change.amount);
    if (!isFinite(n) || n <= 0 || n > 10_000_000) return { error: "That amount doesn't look right — how much was it?" };
    amount = n;
  }
  const currency = change.currency === undefined ? row.currency : /^(usd|\$|dollars?)$/i.test(String(change.currency)) ? "USD" : "JPY";
  let rate: number | null = currency === "USD" ? row.rate : null;
  if (currency === "USD" && (row.currency !== "USD" || !rate)) rate = (await yenPerDollar()).rate;
  const yen = currency === "USD" ? Math.round(amount * (rate || 150)) : Math.round(amount);
  const what = change.what === undefined ? row.what : (String(change.what || "").trim().slice(0, 200) || null);
  let forParty = row.forParty;
  if (change.forParty !== undefined) {
    if (!change.forParty || /^(shared|split|both|everyone|half)$/i.test(String(change.forParty).trim())) forParty = null;
    else {
      const f = parties.find((x) => x.toLowerCase() === String(change.forParty).trim().toLowerCase()) || partyFor(parties, String(change.forParty));
      if (!f) return { error: `Who is it for? ${parties.join(", ")}, or shared` };
      forParty = f;
    }
  }
  // (made into one a couple paid for themselves — never kept; one kept that way before can still be made shared)
  if (forParty && forParty === party && (change.forParty !== undefined || change.paidBy !== undefined)) return { error: notSharedSelf(party, parties) };
  const said: string[] = [];
  if (amount !== row.amount || currency !== row.currency) said.push(`changed ${moneyWords(row.amount, row.currency)} → ${moneyWords(amount, currency)}`);
  if (party !== row.party) said.push(`changed who paid: ${row.party} → ${party}`);
  if ((what || "") !== (row.what || "")) said.push(what ? (row.what ? `changed what it was for to “${what}”` : `added what it was for: “${what}”`) : "took out what it was for");
  if (forParty !== row.forParty) said.push(`changed who it's for: ${row.forParty ? `${row.forParty} alone` : "shared"} → ${forParty ? `${forParty} alone` : "shared"}`);
  if (!said.length) return { party, yen, said: "" };
  // (who paid, how much or who it's for changed: "that's right" was said of something else — back in the box)
  const recheck = party !== row.party || amount !== row.amount || currency !== row.currency || forParty !== row.forParty;
  await prisma.tripExpense.update({ where: { id }, data: { party, amount, currency, yen, rate, what, forParty, ...(recheck ? { checkedAt: null, checkedBy: null } : {}) } });
  const line = `${said.join("; ")}${amount === row.amount && currency === row.currency ? ` (${moneyWords(amount, currency)})` : ""}`;
  await logChange(tripId, id, who, line);
  tellScreens(tripId, who.displayName);
  return { party, yen, said: line };
}

/** Budget's History, newest first: when, who, what they did. Payments kept before History began (Oct 16) show when they
 *  were added and taken away, from what each payment already held. */
export async function expenseHistory(tripId: string, who?: { travelerId?: string | null; displayName: string }): Promise<{ at: string; by: string; action: string; putBack?: string; putBackBy?: string }[]> {
  const logs = await prisma.tripExpenseLog.findMany({ where: { tripId }, orderBy: { at: "desc" }, take: 300 });
  const rows = await prisma.tripExpense.findMany({ where: { tripId } });
  // (the add itself — "added ¥…" or "added $…" — not "added its receipt")
  const added = new Set(logs.filter((l) => /^added [¥$]/.test(l.action)).map((l) => l.expenseId));
  const removed = new Set(logs.filter((l) => l.action.startsWith("removed ")).map((l) => l.expenseId));
  const before = [
    ...rows.filter((r) => !added.has(r.id)).map((r) => ({ at: r.createdAt, by: r.addedByName, action: `added ${moneyWords(r.amount, r.currency)} (${r.party})`, id: r.id })),
    ...rows.filter((r) => r.removedAt && !removed.has(r.id)).map((r) => ({ at: r.removedAt!, by: "", action: `removed ${moneyWords(r.amount, r.currency)} (${r.party})`, id: r.id })),
  ];
  // "Put it back" on the latest removal of a payment that's still taken away, for whoever may (who kept it, or Ken)
  const offNow = new Map<string, (typeof rows)[number]>(rows.filter((r) => r.removedAt).map((r) => [r.id, r]));
  const offered = new Set<string>();
  // (who the organizer is, asked once — asked for each removed payment, the Log took seconds to come back)
  const orgRow = who ? await prisma.tripMember.findFirst({ where: { tripId }, orderBy: { joinedAt: "asc" }, select: { travelerId: true, traveler: { select: { displayName: true } } } }) : null;
  const org = orgRow?.travelerId || null;
  const orgName = orgRow?.traveler.displayName.split(/\s+/)[0] || "Ken";
  const lines = [...logs.map((l) => ({ at: l.at, by: l.byName, action: l.action, id: l.expenseId })), ...before].sort((a, b) => b.at.getTime() - a.at.getTime());
  // (what each was for, as it says now — "Removed ¥2,000 (Ken & Larisa)" didn't say which ¥2,000 to put back; fresh tester)
  const whatOf = new Map(rows.map((r) => [r.id, r.what]));
  return lines.map((x) => {
    const row = offNow.get(x.id);
    const latestOff = !!who && !!row && x.action.startsWith("removed ") && !offered.has(x.id);
    if (latestOff) offered.add(x.id);
    const putBack = latestOff && mayChangeAs(org, row!, who!);
    // (for someone who may not: who can — Andy saw no button and no reason; fresh tester)
    const keeper = row ? row.addedByName.split(/\s+/)[0] : "";
    const putBackBy = latestOff && !putBack ? (keeper && keeper !== orgName ? `${keeper} or ${orgName}` : orgName) : undefined;
    // (a change too, unless the change is to what it was for — it says that itself)
    const what = /^(added|removed|put back|changed|replaced) /.test(x.action) && !/what it was for/.test(x.action) ? whatOf.get(x.id) : null;
    return { at: x.at.toISOString(), by: x.by, action: what ? `${x.action}: ${what}` : x.action, ...(putBack ? { putBack: x.id } : {}), ...(putBackBy ? { putBackBy } : {}) };
  });
}

/** "¥12,400" */
export const yenWords = (n: number) => `¥${Math.round(n).toLocaleString("en-US")}`;

// ── Receipts (Ken, Oct 16: "take pictures of receipts and add them and simply note who paid for them and have the option
// of adding what the item is") ──

const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["total", "currency", "what", "date"],
  properties: {
    total: { type: "number", description: "The total paid, as printed (the grand total: 合計 / 合計金額 / Total), a number; 0 when no total can be read" },
    currency: { type: "string", enum: ["JPY", "USD"], description: "JPY for yen (¥, 円), USD for dollars" },
    what: { type: "string", description: "What it was for, in one to four plain English words a traveller would say: \"Taxi\", \"Lunch at Maisen\", \"Train tickets\", \"Pharmacy\" — empty when it can't be told" },
    date: { type: "string", description: "The day it was paid, YYYY-MM-DD, from the list given — empty when the receipt doesn't say or it isn't one of them" },
  },
};
const RECEIPT_SYSTEM = `You read a receipt someone on a trip in Japan photographed, to keep the payment in the group's shared budget.
Be faithful: only what the receipt shows. The total is the grand total paid (合計, 合計金額, お支払, Total), never a subtotal, the tax line (内消費税等) or change given back.
"what" names what was bought the way a traveller would, in plain English: a taxi receipt (メータ運賃, a car number, a taxi company) is "Taxi"; a restaurant's is "Dinner at <name>" or "Lunch at <name>" by the time if its name is clear, else "Meal"; a shop's is the shop's kind or name.
Never put a card number, an approval or slip number, a phone number, a person's name or a registration number in "what".`;

let receiptClient: Anthropic | null = null;
/** What a receipt says: its total, in yen or dollars, what it was for, and the trip day it was paid — null when it can't
 *  be read (the person types the amount; the photo is still kept with the payment) */
export async function readReceipt(tripId: string, file: PaperFile): Promise<{ amount: number | null; currency: "JPY" | "USD"; what: string; date: string | null } | null> {
  if (!file.mediaType.startsWith("image/")) return null;
  receiptClient ??= new Anthropic();
  const days = await tripDays(tripId);
  try {
    const response = await receiptClient.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      output_config: { effort: "low", format: { type: "json_schema", schema: RECEIPT_SCHEMA } },
      system: RECEIPT_SYSTEM,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: file.mediaType, data: file.data } },
        { type: "text", text: `The trip's days:\n${days.map((d) => `${d.date} ${d.town}`).join("\n")}` },
      ] }],
    } as any, { timeout: 45_000, maxRetries: 0 });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    const r = text ? JSON.parse(text) : null;
    if (!r) return null;
    const amount = typeof r.total === "number" && r.total > 0 && r.total < 10_000_000 ? r.total : null;
    const date = typeof r.date === "string" && days.some((d) => d.date === r.date) ? r.date : null;
    // (never a run of digits in what it says it was for — a card or slip number slipped in would be shown to all four)
    const what = String(r.what || "").replace(/[\d*]{4,}/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
    return { amount, currency: r.currency === "USD" ? "USD" : "JPY", what, date };
  } catch (e: any) {
    console.warn(`[budget] couldn't read a receipt: ${e?.status ?? e?.message ?? "unknown"}`);
    return null;
  }
}

/** A payment's receipt photo, kept with it */
export async function keepReceipt(tripId: string, expenseId: string, file: PaperFile): Promise<void> {
  if (!file.mediaType.startsWith("image/")) return;
  const thumb = file.thumb ? Buffer.from(file.thumb.split(",")[1], "base64") : null;
  const data = { tripId, mimeType: file.mediaType, bytes: Buffer.from(file.data, "base64"), ...(thumb ? { thumb } : {}) };
  await prisma.expenseReceipt.upsert({ where: { expenseId }, create: { expenseId, ...data }, update: data });
}

/** A receipt's photo added to a payment already kept (typed in the taxi, the photo later — Oct 16: Larisa kept the ¥5,200
 *  taxi; Ken had the receipt). Who kept it, or Ken. Logged. */
export async function attachReceipt(tripId: string, expenseId: string, who: { travelerId?: string | null; displayName: string }, file: PaperFile): Promise<true | "gone" | "not-yours"> {
  const row = await prisma.tripExpense.findFirst({ where: { id: expenseId, tripId, removedAt: null } });
  if (!row) return "gone";
  if (!(await mayChange(tripId, row, who))) return "not-yours";
  // (a wrong photo replaced by the right one — said as a replacement in the Log)
  const had = await prisma.expenseReceipt.findUnique({ where: { expenseId }, select: { expenseId: true } });
  await keepReceipt(tripId, expenseId, file);
  await logChange(tripId, expenseId, who, `${had ? "replaced" : "added"} its receipt (${moneyWords(row.amount, row.currency)}, ${row.party})`);
  tellScreens(tripId, who.displayName);
  return true;
}

/** The receipt photo of a payment on this trip, or null */
export async function receiptOf(tripId: string, expenseId: string, small = false): Promise<{ bytes: Buffer; type: string } | null> {
  const r = await prisma.expenseReceipt.findUnique({ where: { expenseId } });
  if (!r || r.tripId !== tripId) return null;
  if (small && r.thumb) return { bytes: Buffer.from(r.thumb), type: "image/jpeg" };
  return { bytes: Buffer.from(r.bytes), type: r.mimeType };
}
