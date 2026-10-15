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

export type Ledger = {
  parties: string[];
  totals: Record<string, number>;
  /** the couple behind, who pays next — null when even */
  next: string | null;
  /** half the difference: what the couple behind owes the other, to be even */
  owes: { from: string; to: string; yen: number } | null;
  items: { id: string; party: string; amount: number; currency: string; yen: number; rate: number | null; what: string | null; dayDate: string | null; addedByName: string; createdAt: string; mayRemove: boolean }[];
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
  let next: string | null = null, owes: Ledger["owes"] = null;
  if (parties.length === 2) {
    const [a, b] = parties;
    if (totals[a] !== totals[b]) {
      const behind = totals[a] < totals[b] ? a : b, ahead = behind === a ? b : a;
      next = behind;
      owes = { from: behind, to: ahead, yen: Math.round(Math.abs(totals[a] - totals[b]) / 2) };
    }
  }
  const org = await prisma.tripMember.findFirst({ where: { tripId }, orderBy: { joinedAt: "asc" }, select: { travelerId: true } });
  const mine = (r: { addedById: string | null; addedByName: string }) => !!who && ((!!who.travelerId && r.addedById === who.travelerId) || (!!who.displayName && first(r.addedByName) === first(who.displayName)) || (!!who.travelerId && org?.travelerId === who.travelerId));
  return {
    parties, totals, next, owes,
    items: rows.map((r) => ({ id: r.id, party: r.party, amount: r.amount, currency: r.currency, yen: r.yen, rate: r.rate, what: r.what, dayDate: r.dayDate, addedByName: r.addedByName, createdAt: r.createdAt.toISOString(), mayRemove: mine(r) })),
  };
}

/** A payment: who paid (a couple, or anyone in it), how much, in what, for what, on which day */
export async function addExpense(input: { tripId: string; paidBy: string; amount: number; currency?: string; what?: string | null; dayDate?: string | null; addedById: string | null; addedByName: string }):
  Promise<{ id: string; party: string; yen: number; rate: number | null; approx: boolean } | { error: string }> {
  const parties = await partiesOf(input.tripId);
  const party = parties.find((p) => p.toLowerCase() === input.paidBy.trim().toLowerCase()) || partyFor(parties, input.paidBy);
  if (!party) return { error: `Which couple paid? ${parties.join(" or ") || "No couples found in her Guide."}` };
  const amount = Number(input.amount);
  if (!isFinite(amount) || amount <= 0 || amount > 10_000_000) return { error: "That amount doesn't look right — how much was it?" };
  const currency = /^(usd|\$|dollars?)$/i.test(String(input.currency || "")) ? "USD" : "JPY";
  let yen = Math.round(amount), rate: number | null = null, approx = false;
  if (currency === "USD") { const r = await yenPerDollar(); rate = r.rate; approx = r.approx; yen = Math.round(amount * r.rate); }
  const dayDate = typeof input.dayDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.dayDate) ? input.dayDate : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  const row = await prisma.tripExpense.create({ data: { tripId: input.tripId, party, amount, currency, yen, rate, what: (input.what || "").trim().slice(0, 200) || null, dayDate, addedById: input.addedById, addedByName: input.addedByName } });
  return { id: row.id, party, yen, rate, approx };
}

/** Taken away (hidden, never deleted) — by who added it, or the trip's first member */
export async function removeExpense(tripId: string, id: string, who: { travelerId?: string | null; displayName: string }): Promise<boolean | "not-yours"> {
  const row = await prisma.tripExpense.findFirst({ where: { id, tripId, removedAt: null } });
  if (!row) return false;
  const org = await prisma.tripMember.findFirst({ where: { tripId }, orderBy: { joinedAt: "asc" }, select: { travelerId: true } });
  const may = (!!who.travelerId && (row.addedById === who.travelerId || org?.travelerId === who.travelerId)) || first(row.addedByName) === first(who.displayName);
  if (!may) return "not-yours";
  await prisma.tripExpense.update({ where: { id }, data: { removedAt: new Date() } });
  return true;
}

/** "¥12,400" */
export const yenWords = (n: number) => `¥${Math.round(n).toLocaleString("en-US")}`;
