/**
 * The sums behind a Budget shared by families, per person (services/familyLedger.ts, Nov 22 2026). Ken, Nov 16:
 * "dollars as the common unit, the three families as payers, shared costs split per person".
 * Every expected figure here was worked out by hand, in whole cents. No database, no clock, no network.
 * The people are made up, in the shape of a trip of ten: a family of three (one joining late), of three, and of four.
 */
import { describe, it, expect } from "vitest";
import { abroadOn, splitCents, toBeEven, familyMath, CLOSE_CENTS, type RosterPerson, type FamilyPayment } from "../src/services/familyLedger.js";

const WHOLE = { abroadFrom: "2026-12-14", abroadTo: "2027-01-08" };
const WEEK = { abroadFrom: "2026-12-25", abroadTo: "2027-01-01" };
const PEOPLE: RosterPerson[] = [
  { name: "Ken", family: 1, ...WHOLE },
  { name: "Larisa", family: 1, ...WHOLE },
  { name: "Milo", family: 1, abroadFrom: "2026-12-22", abroadTo: "2027-01-08" },
  { name: "Rosa", family: 2, ...WEEK },
  { name: "Tomas", family: 2, ...WEEK },
  { name: "Ines", family: 2, ...WEEK },
  { name: "Otto", family: 3, ...WEEK },
  { name: "Greta", family: 3, ...WEEK },
  { name: "Pia", family: 3, ...WEEK },
  { name: "Lars", family: 3, ...WEEK },
];
const FAMILIES = [1, 2, 3];
const pay = (id: string, family: number, cents: number, dayDate: string, forPeople: string[] | null = null): FamilyPayment => ({ id, family, cents, dayDate, forPeople });
const sum = (r: Record<number, number>) => Object.values(r).reduce((a, n) => a + n, 0);
const math = (payments: FamilyPayment[], today = "2026-12-28", people = PEOPLE) => familyMath({ families: FAMILIES, people, payments, today });

describe("who is abroad on a day", () => {
  const names = (d: string) => abroadOn(PEOPLE, d).map((p) => p.name);
  it("before anyone leaves and after everyone is home: nobody", () => {
    expect(names("2026-12-13")).toEqual([]);
    expect(names("2027-01-09")).toEqual([]);
  });
  it("the first week: the two who went early", () => {
    expect(names("2026-12-14")).toEqual(["Ken", "Larisa"]);
    expect(names("2026-12-21")).toEqual(["Ken", "Larisa"]);
  });
  it("the day the third joins, he counts", () => {
    expect(names("2026-12-22")).toEqual(["Ken", "Larisa", "Milo"]);
  });
  it("both ends of the shared week count: all ten", () => {
    expect(names("2026-12-25").length).toBe(10);
    expect(names("2027-01-01").length).toBe(10);
  });
  it("the day after the shared week: the first family only", () => {
    expect(names("2027-01-02")).toEqual(["Ken", "Larisa", "Milo"]);
    expect(names("2027-01-08")).toEqual(["Ken", "Larisa", "Milo"]);
  });
  it("a day written with a time still counts as that day", () => {
    expect(names("2026-12-25T23:30:00.000Z").length).toBe(10);
  });
});

describe("splitting cents so nothing is lost or made up", () => {
  it("$1.00 between three: 34, 33, 33", () => expect(splitCents(100, [1, 1, 1])).toEqual([34, 33, 33]));
  it("$10.00 between families of 3, 3 and 4: 300, 300, 400", () => expect(splitCents(1000, [3, 3, 4])).toEqual([300, 300, 400]));
  it("$10.01: the odd cent goes to the largest remainder (the four)", () => expect(splitCents(1001, [3, 3, 4])).toEqual([300, 300, 401]));
  it("one cent between ten: the four get it", () => expect(splitCents(1, [3, 3, 4])).toEqual([0, 0, 1]));
  it("two cents between three equal: the first two", () => expect(splitCents(2, [1, 1, 1])).toEqual([1, 1, 0]));
  it("a family with nobody on the list pays nothing", () => expect(splitCents(500, [0, 2, 0])).toEqual([0, 500, 0]));
  it("$25.01 between 3, 3 and 4: 750, 750, 1001", () => expect(splitCents(2501, [3, 3, 4])).toEqual([750, 750, 1001]));
  it("nothing to split, a wrong amount or nobody to split it between: zeros", () => {
    expect(splitCents(0, [1, 1])).toEqual([0, 0]);
    expect(splitCents(-5, [1, 1])).toEqual([0, 0]);
    expect(splitCents(10.5, [1, 1])).toEqual([0, 0]);
    expect(splitCents(NaN, [1, 1])).toEqual([0, 0]);
    expect(splitCents(100, [0, 0, 0])).toEqual([0, 0, 0]);
    expect(splitCents(100, [])).toEqual([]);
  });
  it("the parts always add up to the amount, and no part is ever more than a cent from its exact share", () => {
    for (const weights of [[3, 3, 4], [2, 0, 0], [3, 3, 0], [1, 1, 1], [2, 1, 0], [1, 3, 4], [0, 0, 7]]) {
      const total = weights.reduce((a, w) => a + w, 0);
      for (let cents = 1; cents <= 2500; cents++) {
        const parts = splitCents(cents, weights);
        expect(parts.reduce((a, p) => a + p, 0)).toBe(cents);
        parts.forEach((p, i) => expect(Math.abs(p - (cents * weights[i]) / total)).toBeLessThan(1));
      }
    }
  });
  it("a very large amount ($80,000.01) still adds up", () => {
    const parts = splitCents(8_000_001, [3, 3, 4]);
    expect(parts).toEqual([2_400_000, 2_400_000, 3_200_001]);
  });
});

describe("who pays whom to be even", () => {
  it("everyone even: nothing", () => expect(toBeEven(FAMILIES, { 1: 0, 2: 0, 3: 0 })).toEqual([]));
  it("one family ahead, two behind: two payments, the larger first", () => {
    expect(toBeEven(FAMILIES, { 1: -100, 2: -200, 3: 300 })).toEqual([{ from: 2, to: 3, cents: 200 }, { from: 1, to: 3, cents: 100 }]);
  });
  it("one family behind, two ahead: it pays each", () => {
    expect(toBeEven(FAMILIES, { 1: 400, 2: 100, 3: -500 })).toEqual([{ from: 3, to: 1, cents: 400 }, { from: 3, to: 2, cents: 100 }]);
  });
  it("two families only", () => {
    expect(toBeEven([1, 2], { 1: -5000, 2: 5000 })).toEqual([{ from: 1, to: 2, cents: 5000 }]);
  });
  it("two equally behind: the earlier family is named first", () => {
    expect(toBeEven(FAMILIES, { 1: -500, 2: 1000, 3: -500 })).toEqual([{ from: 1, to: 2, cents: 500 }, { from: 3, to: 2, cents: 500 }]);
  });
  it("never more payments than families less one, and paying them leaves everyone at zero", () => {
    for (const b of [{ 1: -1, 2: -1, 3: 2 }, { 1: 7000, 2: -3000, 3: -4000 }, { 1: -750, 2: 3250, 3: -2500 }, { 1: 1, 2: 0, 3: -1 }]) {
      const even = toBeEven(FAMILIES, b);
      expect(even.length).toBeLessThanOrEqual(2);
      const after: Record<number, number> = { ...b };
      for (const t of even) { expect(t.cents).toBeGreaterThan(0); expect(t.from).not.toBe(t.to); after[t.from] += t.cents; after[t.to] -= t.cents; }
      expect(after).toEqual({ 1: 0, 2: 0, 3: 0 });
    }
  });
});

describe("the whole sum", () => {
  it("nothing paid: all zeros, even, nobody pays next", () => {
    const m = math([]);
    expect(m.paid).toEqual({ 1: 0, 2: 0, 3: 0 });
    expect(m.share).toEqual({ 1: 0, 2: 0, 3: 0 });
    expect(m.balance).toEqual({ 1: 0, 2: 0, 3: 0 });
    expect(m.payments).toEqual({});
    expect(m.even).toEqual([]);
    expect(m.settled).toBe(true);
    expect(m.next).toBeNull();
  });

  it("the first week, only one family abroad: its payment is all its own, nothing is owed, nobody pays next", () => {
    const m = math([pay("a", 1, 4860, "2026-12-20")], "2026-12-20");
    expect(m.payments.a).toEqual({ forNames: ["Ken", "Larisa"], everyone: true, shares: { 1: 4860, 2: 0, 3: 0 }, forNobody: false });
    expect(m.paid).toEqual({ 1: 4860, 2: 0, 3: 0 });
    expect(m.balance).toEqual({ 1: 0, 2: 0, 3: 0 });
    expect(m.settled).toBe(true);
    expect(m.even).toEqual([]);
    expect(m.next).toBeNull();
  });

  it("$100 for all ten, paid by the second family: 30, 30, 40; the four owe 40, the first three owe 30", () => {
    const m = math([pay("b", 2, 10000, "2026-12-26")], "2026-12-26");
    expect(m.payments.b.shares).toEqual({ 1: 3000, 2: 3000, 3: 4000 });
    expect(m.payments.b.forNames.length).toBe(10);
    expect(m.payments.b.everyone).toBe(true);
    expect(m.paid).toEqual({ 1: 0, 2: 10000, 3: 0 });
    expect(m.share).toEqual({ 1: 3000, 2: 3000, 3: 4000 });
    expect(m.balance).toEqual({ 1: -3000, 2: 7000, 3: -4000 });
    expect(m.settled).toBe(false);
    expect(m.even).toEqual([{ from: 3, to: 2, cents: 4000 }, { from: 1, to: 2, cents: 3000 }]);
    expect(m.next).toBe(3);
  });

  it("three payments, one for three named people, one with an odd cent", () => {
    const m = math([
      pay("b", 2, 10000, "2026-12-26"),
      pay("c", 1, 9000, "2026-12-27", ["Ken", "Larisa", "Rosa"]),
      pay("d", 3, 2501, "2026-12-28"),
    ]);
    expect(m.payments.c).toEqual({ forNames: ["Ken", "Larisa", "Rosa"], everyone: false, shares: { 1: 6000, 2: 3000, 3: 0 }, forNobody: false });
    expect(m.payments.d.shares).toEqual({ 1: 750, 2: 750, 3: 1001 });
    expect(m.paid).toEqual({ 1: 9000, 2: 10000, 3: 2501 });
    expect(m.share).toEqual({ 1: 9750, 2: 6750, 3: 5001 });
    expect(m.balance).toEqual({ 1: -750, 2: 3250, 3: -2500 });
    expect(m.even).toEqual([{ from: 3, to: 2, cents: 2500 }, { from: 1, to: 2, cents: 750 }]);
    expect(m.next).toBe(3);
  });

  it("a payment wholly for another family: they owe it all back", () => {
    const m = math([pay("e", 1, 5000, "2026-12-27", ["Rosa", "Tomas"])]);
    expect(m.payments.e.shares).toEqual({ 1: 0, 2: 5000, 3: 0 });
    expect(m.balance).toEqual({ 1: 5000, 2: -5000, 3: 0 });
    expect(m.even).toEqual([{ from: 2, to: 1, cents: 5000 }]);
    expect(m.next).toBe(2);
  });

  it("a payment wholly for the payer's own family: nothing is owed", () => {
    const m = math([pay("f", 3, 8000, "2026-12-27", ["Otto", "Pia"])]);
    expect(m.payments.f.shares).toEqual({ 1: 0, 2: 0, 3: 8000 });
    expect(m.balance).toEqual({ 1: 0, 2: 0, 3: 0 });
    expect(m.settled).toBe(true);
    expect(m.next).toBeNull();
  });

  it("names are matched whatever their capitals or spaces; a name twice counts once; a stranger counts for nothing", () => {
    const m = math([pay("g", 2, 1000, "2026-12-27", ["ken", " Ken ", "KEN", "Nobody Atall"])]);
    expect(m.payments.g).toEqual({ forNames: ["Ken"], everyone: false, shares: { 1: 1000, 2: 0, 3: 0 }, forNobody: false });
  });

  it("someone named who isn't abroad that day still shares it (they were named on purpose)", () => {
    const m = math([pay("h", 1, 900, "2026-12-18", ["Ken", "Larisa", "Milo"])], "2026-12-18");
    expect(m.payments.h.shares).toEqual({ 1: 900, 2: 0, 3: 0 });
    const n = math([pay("i", 1, 900, "2026-12-18", ["Ken", "Rosa", "Otto"])], "2026-12-18");
    expect(n.payments.i.shares).toEqual({ 1: 300, 2: 300, 3: 300 });
  });

  it("nobody to share it (a day no one is abroad, only strangers named, an empty list): it stays the payer's own and says so", () => {
    for (const p of [pay("j", 2, 700, "2026-12-01"), pay("j", 2, 700, "2026-12-27", ["Nobody Atall"]), pay("j", 2, 700, "2026-12-27", [])]) {
      const m = math([p]);
      expect(m.payments.j.forNobody).toBe(true);
      expect(m.payments.j.forNames).toEqual([]);
      expect(m.payments.j.shares).toEqual({ 1: 0, 2: 700, 3: 0 });
      expect(m.paid).toEqual({ 1: 0, 2: 700, 3: 0 });
      expect(m.balance).toEqual({ 1: 0, 2: 0, 3: 0 });
    }
  });

  it("a payment that isn't a whole positive number of cents, or from a family not on the trip, is left out entirely", () => {
    const m = math([pay("k0", 1, 0, "2026-12-27"), pay("k1", 1, -500, "2026-12-27"), pay("k2", 1, 10.5, "2026-12-27"), pay("k3", 1, NaN, "2026-12-27"), pay("k4", 1, Infinity, "2026-12-27"), pay("k5", 9, 500, "2026-12-27")]);
    expect(m.payments).toEqual({});
    expect(m.paid).toEqual({ 1: 0, 2: 0, 3: 0 });
    expect(m.balance).toEqual({ 1: 0, 2: 0, 3: 0 });
  });

  it("someone's dates corrected later: everyone-that-day is worked out again from the dates as they are now", () => {
    const p = [pay("l", 1, 900, "2026-12-23")];
    expect(math(p).payments.l.forNames).toEqual(["Ken", "Larisa", "Milo"]);
    const later = PEOPLE.map((x) => (x.name === "Milo" ? { ...x, abroadFrom: "2026-12-24" } : x));
    expect(math(p, "2026-12-28", later).payments.l.forNames).toEqual(["Ken", "Larisa"]);
    const early = PEOPLE.map((x) => (x.family === 2 ? { ...x, abroadFrom: "2026-12-23" } : x));
    const m = math(p, "2026-12-28", early);
    expect(m.payments.l.shares).toEqual({ 1: 450, 2: 450, 3: 0 });
    expect(m.balance).toEqual({ 1: 450, 2: -450, 3: 0 });
  });
});

describe("even, and who pays next", () => {
  it("within a dollar of even counts as even: nothing to pay, nobody pays next", () => {
    // $1.47 for one person of each family: 49 cents each; the payer is 98 cents ahead
    const m = math([pay("m", 2, 147, "2026-12-27", ["Ken", "Rosa", "Otto"])]);
    expect(m.balance).toEqual({ 1: -49, 2: 98, 3: -49 });
    expect(m.settled).toBe(true);
    expect(m.even).toEqual([]);
    expect(m.next).toBeNull();
  });
  it("a dollar ahead is not even", () => {
    const m = math([pay("n", 2, 150, "2026-12-27", ["Ken", "Rosa", "Otto"])]);
    expect(m.balance).toEqual({ 1: -50, 2: 100, 3: -50 });
    expect(CLOSE_CENTS).toBe(100);
    expect(m.settled).toBe(false);
    expect(m.even).toEqual([{ from: 1, to: 2, cents: 50 }, { from: 3, to: 2, cents: 50 }]);
    expect(m.next).toBe(1);
  });
  it("two families equally behind: the earlier one pays next", () => {
    const m = math([pay("o", 2, 1500, "2026-12-27", ["Ken", "Rosa", "Otto"])]);
    expect(m.balance).toEqual({ 1: -500, 2: 1000, 3: -500 });
    expect(m.next).toBe(1);
  });
  it("after the others have gone home: what's owed still shows, and nobody pays next", () => {
    const m = math([pay("b", 2, 10000, "2026-12-26")], "2027-01-03");
    expect(m.even).toEqual([{ from: 3, to: 2, cents: 4000 }, { from: 1, to: 2, cents: 3000 }]);
    expect(m.next).toBeNull();
  });
  it("before the trip and after it: nobody pays next", () => {
    expect(math([pay("b", 2, 10000, "2026-12-26")], "2026-12-01").next).toBeNull();
    expect(math([pay("b", 2, 10000, "2026-12-26")], "2027-02-01").next).toBeNull();
  });
  it("pays next is only ever a family with someone abroad today", () => {
    // the first family is furthest behind but, in this roster, went home early
    const gone = PEOPLE.map((x) => (x.family === 1 ? { ...x, abroadTo: "2026-12-27" } : x));
    const m = math([pay("p", 2, 9000, "2026-12-26", ["Ken", "Larisa", "Milo"]), pay("q", 2, 700, "2026-12-26", ["Otto"])], "2026-12-29", gone);
    expect(m.balance).toEqual({ 1: -9000, 2: 9700, 3: -700 });
    expect(m.next).toBe(3);
    expect(m.even).toEqual([{ from: 1, to: 2, cents: 9000 }, { from: 3, to: 2, cents: 700 }]);
  });
  it("the families here today are close to each other, though one at home owes: nobody pays next", () => {
    const gone = PEOPLE.map((x) => (x.family === 1 ? { ...x, abroadTo: "2026-12-27" } : x));
    // the second family paid $90 for the first; the third paid $90.50 for the first: both here, 50 cents apart
    const m = math([pay("r", 2, 9000, "2026-12-26", ["Ken"]), pay("s", 3, 9050, "2026-12-26", ["Larisa"])], "2026-12-29", gone);
    expect(m.balance).toEqual({ 1: -18050, 2: 9000, 3: 9050 });
    expect(m.settled).toBe(false);
    expect(m.next).toBeNull();
  });
});

describe("many payments at random", () => {
  it("shares add up to each payment, balances add up to zero, and the payments to be even leave everyone at zero", () => {
    let seed = 20261122;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const days = ["2026-12-16", "2026-12-22", "2026-12-25", "2026-12-28", "2026-12-31", "2027-01-01", "2027-01-04"];
    for (let round = 0; round < 40; round++) {
      const payments: FamilyPayment[] = [];
      for (let i = 0; i < 60; i++) {
        const some = rnd(3) === 0 ? PEOPLE.filter(() => rnd(2) === 0).map((p) => p.name) : null;
        payments.push(pay(`p${i}`, 1 + rnd(3), 1 + rnd(250_000), days[rnd(days.length)], some));
      }
      const m = math(payments);
      for (const p of payments) expect(sum(m.payments[p.id].shares)).toBe(p.cents);
      expect(sum(m.paid)).toBe(payments.reduce((a, p) => a + p.cents, 0));
      expect(sum(m.share)).toBe(sum(m.paid));
      expect(sum(m.balance)).toBe(0);
      const after = { ...m.balance };
      for (const t of m.even) { after[t.from] += t.cents; after[t.to] -= t.cents; }
      if (!m.settled) expect(after).toEqual({ 1: 0, 2: 0, 3: 0 });
      expect(m.even.length).toBeLessThanOrEqual(2);
    }
  });
});
