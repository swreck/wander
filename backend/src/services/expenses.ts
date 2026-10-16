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
import prisma from "./db.js";
import { broadcastChange } from "../routes/sse.js";

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
  items: { id: string; party: string; forParty: string | null; amount: number; currency: string; yen: number; rate: number | null; what: string | null; dayDate: string | null; addedByName: string; createdAt: string; mayRemove: boolean }[];
};

const first = (s: string) => s.trim().split(/\s+/)[0].toLowerCase();

/** The trip's couples, as her Guide names them ("Ken & Larisa", "Andy & Julie") — both of each a member of the trip */
export async function partiesOf(tripId: string): Promise<string[]> {
  const members = await prisma.tripMember.findMany({ where: { tripId }, include: { traveler: { select: { displayName: true } } }, orderBy: { joinedAt: "asc" } });
  const names = new Set(members.map((m) => first(m.traveler.displayName)));
  const rows = await prisma.guideItem.findMany({ where: { tripId, forWhom: { contains: "&" } }, select: { forWhom: true } });
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
  const rows = await prisma.tripExpense.findMany({ where: { tripId, removedAt: null }, orderBy: { createdAt: "desc" } });
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
  const org = await prisma.tripMember.findFirst({ where: { tripId }, orderBy: { joinedAt: "asc" }, select: { travelerId: true } });
  const mine = (r: { addedById: string | null; addedByName: string }) => !!who && ((!!who.travelerId && r.addedById === who.travelerId) || (!!who.displayName && first(r.addedByName) === first(who.displayName)) || (!!who.travelerId && org?.travelerId === who.travelerId));
  return {
    parties, totals, shared, alone, next, owes,
    items: rows.map((r) => ({ id: r.id, party: r.party, forParty: r.forParty, amount: r.amount, currency: r.currency, yen: r.yen, rate: r.rate, what: r.what, dayDate: r.dayDate, addedByName: r.addedByName, createdAt: r.createdAt.toISOString(), mayRemove: mine(r) })),
  };
}

/** Every open screen on the trip looks again (the bar's "who pays next", Home's total) — quietly, no notice; the person
 *  who kept it too, since Scout may have kept it for them */
function tellScreens(tripId: string, name: string) {
  try { broadcastChange(tripId, { userCode: "", displayName: name, description: "updated the budget", quiet: true }); } catch { /* no one listening */ }
}

const forWords = (forParty: string | null) => (forParty ? ` for ${forParty} alone` : "");
const moneyWords = (amount: number, currency: string) => (currency === "USD" ? `$${Number(amount.toFixed(2))}` : yenWords(amount));
/** One line of Budget's History (Ken, Oct 16: "date, person, action only") */
async function logChange(tripId: string, expenseId: string, by: { travelerId?: string | null; displayName: string }, action: string) {
  try { await prisma.tripExpenseLog.create({ data: { tripId, expenseId, byId: by.travelerId || null, byName: by.displayName, action } }); }
  catch (e: any) { console.warn("[budget] history not kept:", e.message); }
}
/** Who may change or take away a payment: who kept it, or Ken (the trip's first member) — his rule for Maybes */
async function mayChange(tripId: string, row: { addedById: string | null; addedByName: string }, who: { travelerId?: string | null; displayName: string }) {
  const org = await prisma.tripMember.findFirst({ where: { tripId }, orderBy: { joinedAt: "asc" }, select: { travelerId: true } });
  return (!!who.travelerId && (row.addedById === who.travelerId || org?.travelerId === who.travelerId)) || first(row.addedByName) === first(who.displayName);
}

/** A payment: who paid (a couple, or anyone in it), how much, in what, for what, on which day */
export async function addExpense(input: { tripId: string; paidBy: string; amount: number; currency?: string; what?: string | null; dayDate?: string | null; forParty?: string | null; addedById: string | null; addedByName: string }):
  Promise<{ id: string; party: string; forParty: string | null; yen: number; rate: number | null; approx: boolean } | { error: string }> {
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
  const row = await prisma.tripExpense.create({ data: { tripId: input.tripId, party, forParty, amount, currency, yen, rate, what: (input.what || "").trim().slice(0, 200) || null, dayDate, addedById: input.addedById, addedByName: input.addedByName } });
  await logChange(input.tripId, row.id, { travelerId: input.addedById, displayName: input.addedByName }, `added ${moneyWords(amount, currency)} (${party})${forWords(forParty)}`);
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
  const said: string[] = [];
  if (amount !== row.amount || currency !== row.currency) said.push(`changed ${moneyWords(row.amount, row.currency)} → ${moneyWords(amount, currency)}`);
  if (party !== row.party) said.push(`changed who paid: ${row.party} → ${party}`);
  if ((what || "") !== (row.what || "")) said.push(what ? (row.what ? `changed what it was for to “${what}”` : `added what it was for: “${what}”`) : "took out what it was for");
  if (forParty !== row.forParty) said.push(`changed who it's for: ${row.forParty ? `${row.forParty} alone` : "shared"} → ${forParty ? `${forParty} alone` : "shared"}`);
  if (!said.length) return { party, yen, said: "" };
  await prisma.tripExpense.update({ where: { id }, data: { party, amount, currency, yen, rate, what, forParty } });
  const line = `${said.join("; ")}${amount === row.amount && currency === row.currency ? ` (${moneyWords(amount, currency)})` : ""}`;
  await logChange(tripId, id, who, line);
  tellScreens(tripId, who.displayName);
  return { party, yen, said: line };
}

/** Budget's History, newest first: when, who, what they did. Payments kept before History began (Oct 16) show when they
 *  were added and taken away, from what each payment already held. */
export async function expenseHistory(tripId: string): Promise<{ at: string; by: string; action: string }[]> {
  const logs = await prisma.tripExpenseLog.findMany({ where: { tripId }, orderBy: { at: "desc" }, take: 300 });
  const rows = await prisma.tripExpense.findMany({ where: { tripId } });
  const added = new Set(logs.filter((l) => l.action.startsWith("added ")).map((l) => l.expenseId));
  const removed = new Set(logs.filter((l) => l.action.startsWith("removed ")).map((l) => l.expenseId));
  const before = [
    ...rows.filter((r) => !added.has(r.id)).map((r) => ({ at: r.createdAt, by: r.addedByName, action: `added ${moneyWords(r.amount, r.currency)} (${r.party})` })),
    ...rows.filter((r) => r.removedAt && !removed.has(r.id)).map((r) => ({ at: r.removedAt!, by: "", action: `removed ${moneyWords(r.amount, r.currency)} (${r.party})` })),
  ];
  return [...logs.map((l) => ({ at: l.at, by: l.byName, action: l.action })), ...before]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((x) => ({ at: x.at.toISOString(), by: x.by, action: x.action }));
}

/** "¥12,400" */
export const yenWords = (n: number) => `¥${Math.round(n).toLocaleString("en-US")}`;
