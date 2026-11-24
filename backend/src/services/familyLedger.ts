/**
 * Who owes what when families travel together and share costs per person (Ken, Nov 16 2026: "dollars as the common
 * unit, the three families as payers, shared costs split per person").
 *
 * Only arithmetic lives here: no database, no clock, no rates. Every amount is whole cents, so the shares of a payment
 * always add up to exactly what was paid.
 *
 * A payment is for a list of people. With no list it is for everyone abroad on the payment's day, worked out when the
 * Budget is read, so a person whose dates are corrected later is counted correctly from then on. A family's share of
 * a payment is the amount × (its people on the list ÷ the list's size).
 */

export type RosterPerson = { name: string; family: number; abroadFrom: string; abroadTo: string };
export type FamilyPayment = {
  id: string;
  /** the family that paid */
  family: number;
  /** what was paid, in whole cents of a dollar */
  cents: number;
  /** the day it was paid, YYYY-MM-DD */
  dayDate: string;
  /** who it was for, by name; null = everyone abroad that day */
  forPeople: string[] | null;
};
export type FamilyMath = {
  /** per family: what it paid, what was its to pay, and paid − share (positive: it is owed) */
  paid: Record<number, number>;
  share: Record<number, number>;
  balance: Record<number, number>;
  /** per payment: who it was for in the end, each family's share, and whether nobody could be found to share it */
  payments: Record<string, { forNames: string[]; everyone: boolean; shares: Record<number, number>; forNobody: boolean }>;
  /** the fewest payments that make every family even: who pays whom */
  even: { from: number; to: number; cents: number }[];
  /** every family within a dollar of even */
  settled: boolean;
  /** the family furthest behind among those with someone abroad today; null when fewer than two are, or all are close */
  next: number | null;
};

/** Within this of each other, families count as even (a dollar) */
export const CLOSE_CENTS = 100;

const day = (s: string) => String(s || "").slice(0, 10);
const key = (name: string) => name.trim().toLowerCase();

/** The people abroad on a day (both ends included) */
export function abroadOn(people: RosterPerson[], date: string): RosterPerson[] {
  const d = day(date);
  return people.filter((p) => day(p.abroadFrom) <= d && d <= day(p.abroadTo));
}

/** An amount in whole cents split by weights, the parts adding up to exactly the amount: each part rounded down, then
 *  the cents left over handed out one each, to the largest remainders first (earlier in the list on a tie) */
export function splitCents(cents: number, weights: number[]): number[] {
  const total = weights.reduce((a, w) => a + w, 0);
  if (!Number.isInteger(cents) || cents <= 0 || total <= 0) return weights.map(() => 0);
  const parts = weights.map((w) => Math.floor((cents * w) / total));
  let left = cents - parts.reduce((a, p) => a + p, 0);
  const order = weights.map((w, i) => ({ i, rem: (cents * w) % total })).filter((x) => x.rem > 0).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const x of order) { if (left <= 0) break; parts[x.i]++; left--; }
  return parts;
}

/** The fewest payments that make everyone even: the family furthest behind pays the family furthest ahead, and again */
export function toBeEven(families: number[], balance: Record<number, number>): { from: number; to: number; cents: number }[] {
  const b = new Map(families.map((f) => [f, balance[f] || 0]));
  const out: { from: number; to: number; cents: number }[] = [];
  for (let guard = 0; guard < families.length; guard++) {
    let from = families[0], to = families[0];
    for (const f of families) { if (b.get(f)! < b.get(from)!) from = f; if (b.get(f)! > b.get(to)!) to = f; }
    const cents = Math.min(-b.get(from)!, b.get(to)!);
    if (!(cents > 0)) break;
    out.push({ from, to, cents });
    b.set(from, b.get(from)! + cents); b.set(to, b.get(to)! - cents);
  }
  return out;
}

/**
 * The whole sum. `families` is the families in their order (the order ties are broken in); `today` is the day on the
 * trip's own clock. A payment whose amount isn't a whole positive number of cents, or whose family isn't one of the
 * trip's, is left out.
 */
export function familyMath(input: { families: number[]; people: RosterPerson[]; payments: FamilyPayment[]; today: string }): FamilyMath {
  const { families, people } = input;
  const zero = () => Object.fromEntries(families.map((f) => [f, 0])) as Record<number, number>;
  const paid = zero(), share = zero();
  const byName = new Map(people.map((p) => [key(p.name), p]));
  const payments: FamilyMath["payments"] = {};
  for (const pay of input.payments) {
    if (!Number.isInteger(pay.cents) || pay.cents <= 0 || !families.includes(pay.family)) continue;
    const everyone = !pay.forPeople;
    // (a name twice counts once; a name that isn't on the trip counts for nothing)
    const list = everyone ? abroadOn(people, pay.dayDate) : [...new Set(pay.forPeople!.map(key))].map((k) => byName.get(k)).filter((p): p is RosterPerson => !!p);
    const forNobody = list.length === 0;
    // (nobody to share it: it stays the payer's own, so nothing is owed for it until someone says who it was for)
    const parts = forNobody ? families.map((f) => (f === pay.family ? pay.cents : 0)) : splitCents(pay.cents, families.map((f) => list.filter((p) => p.family === f).length));
    const shares = zero();
    families.forEach((f, i) => { shares[f] = parts[i]; share[f] += parts[i]; });
    paid[pay.family] += pay.cents;
    payments[pay.id] = { forNames: list.map((p) => p.name), everyone, shares, forNobody };
  }
  const balance = zero();
  for (const f of families) balance[f] = paid[f] - share[f];
  const settled = families.every((f) => Math.abs(balance[f]) < CLOSE_CENTS);
  const here = families.filter((f) => abroadOn(people, input.today).some((p) => p.family === f));
  let next: number | null = null;
  // (even is even: once every family is within a dollar, nobody is told to pay next)
  if (!settled && here.length >= 2) {
    const low = here.reduce((a, f) => (balance[f] < balance[a] ? f : a), here[0]);
    const high = here.reduce((a, f) => (balance[f] > balance[a] ? f : a), here[0]);
    if (balance[high] - balance[low] >= CLOSE_CENTS) next = low;
  }
  return { paid, share, balance, payments, even: settled ? [] : toBeEven(families, balance), settled, next };
}
