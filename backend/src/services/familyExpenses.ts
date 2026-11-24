/**
 * Budget on a trip whose payers are families (Ken, Nov 16 2026: "dollars as the common unit, the three families as
 * payers, shared costs split per person", "plus a currency pop-up on entering and viewing an expense, at recent rates").
 * Anyone on the trip can be the one who paid, the youngest included; what they pay counts for their family.
 *
 * A trip is a families' trip when it has TripPerson rows (the plan's roster import writes them). Japan's couples'
 * ledger (services/expenses.ts) is a different sum and stays as it is; this sits beside it and shares its History,
 * receipts, take-away and put-back.
 *
 * A payment is kept as said (dong, riel, yen or dollars) with its dollars in whole cents at the rate of the day it was
 * kept. The arithmetic is services/familyLedger.ts.
 */
import { Prisma } from "@prisma/client";
import prisma from "./db.js";
import { familyMath, abroadOn, type RosterPerson } from "./familyLedger.js";
import { ratesPerDollar, toDollars, type Rates, type Currency, type Foreign } from "./rates.js";
import { tripToday, dayZone } from "./dayCountry.js";
import { logChange, tellScreens, mayChange, mayChangeAs, organizerOf, keepReceipt, moneyWords } from "./expenses.js";
import type { PaperFile } from "./papers.js";

export type Roster = {
  /** the families in their order */
  families: number[];
  /** what each family is called on screen */
  label: Record<number, string>;
  people: RosterPerson[];
};

export type FamilyItem = {
  id: string; party: string; paidByName: string | null;
  amount: number; currency: string;
  /** its dollars; null when it couldn't be counted (see notCounted) */
  usd: number | null;
  rate: number | null; rateDate: string | null;
  what: string | null; dayDate: string | null;
  /** everyone abroad on its day (no list was said) */
  everyone: boolean;
  /** who it was for in the end, by name */
  forNames: string[];
  /** nobody was abroad that day and no one was named: it stays the payer's own until someone says who it was for */
  forNobody: boolean;
  /** each family's part of it, in dollars */
  shares: Record<string, number>;
  /** kept before this trip's families were known, so it is in no sum: shown, never dropped */
  notCounted?: true;
  addedByName: string; createdAt: string; mayRemove: boolean; hasReceipt: boolean;
};

export type FamilyLedger = {
  unit: "USD";
  parties: string[];
  people: { name: string; party: string; abroadFrom: string; abroadTo: string }[];
  /** the day on the trip's own clock, and that clock (the Log's times are read on it) */
  today: string;
  zone: string;
  /** the families with someone abroad today */
  here: string[];
  /** dollars each family has paid, what was its to pay, and paid − share (positive: it is owed) */
  paid: Record<string, number>;
  share: Record<string, number>;
  balance: Record<string, number>;
  /** the family furthest behind among those abroad today; null when fewer than two are, or all are within a dollar */
  next: string | null;
  settled: boolean;
  /** the fewest payments that make every family even */
  even: { from: string; to: string; usd: number }[];
  /** the asker's own family */
  mine: string | null;
  items: FamilyItem[];
  rates: Rates;
  /** each day of the trip and the money of its country (null where Wander keeps no rate for it), so the entry sheet
   *  opens on the money a person is holding that day */
  days: { date: string; money: Foreign | null }[];
};

/** The money of a day's country, for the countries Wander keeps a rate for; null for any other, never a guess
 *  (the phone's lib/rates.ts currencyOfCountry is the same rule) */
export function moneyOfCountry(country?: string | null): Foreign | null {
  switch (String(country ?? "").trim().toLowerCase()) {
    case "vietnam": case "viet nam": return "VND";
    case "cambodia": return "KHR";
    case "japan": return "JPY";
    default: return null;
  }
}

const dollars = (cents: number) => cents / 100;
const firstWord = (s: string) => s.trim().split(/\s+/)[0].toLowerCase();
const wordsOf = (s: string) => s.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);

/** The trip's families and people, or null when the trip has none (a couples' trip, or a plan not set up yet) */
export async function rosterOf(tripId: string): Promise<Roster | null> {
  const rows = await prisma.tripPerson.findMany({ where: { tripId }, orderBy: [{ family: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });
  if (!rows.length) return null;
  const families = [...new Set(rows.map((r) => r.family))];
  const label = Object.fromEntries(families.map((f) => [f, rows.find((r) => r.family === f)!.familyLabel])) as Record<number, string>;
  return { families, label, people: rows.map((r) => ({ name: r.name, family: r.family, abroadFrom: r.abroadFrom, abroadTo: r.abroadTo })) };
}

/** Who paid, from what was said: a family's name, one of its people, or several of them ("Larisa and Ken"). Null when
 *  nobody on the trip is named, or the people named are from more than one family. */
export function payerOf(r: Roster, said: string): { family: number; person: string | null } | null {
  const s = String(said || "").trim().toLowerCase();
  if (!s) return null;
  for (const f of r.families) if (r.label[f].toLowerCase() === s) return { family: f, person: null };
  const words = wordsOf(s);
  const named = r.people.filter((p) => words.includes(firstWord(p.name)));
  const fams = [...new Set(named.map((p) => p.family))];
  if (!named.length || fams.length !== 1) return null;
  return { family: fams[0], person: named.length === 1 ? named[0].name : null };
}

/** Who a payment was for, from what was said: null for everyone abroad that day; names as the trip spells them; a
 *  family's name stands for its people. An error names what couldn't be placed. */
export function forListOf(r: Roster, said: unknown): { list: string[] | null } | { error: string } {
  if (said === undefined || said === null) return { list: null };
  // (said in one breath, "Ken & Larisa and Andy": a family's name is lifted out whole before the rest is split at its "and"s)
  const inWords = (s: string): string[] => {
    const whole: string[] = [];
    let rest = s;
    for (const f of r.families) {
      const at = rest.toLowerCase().indexOf(r.label[f].toLowerCase());
      if (at >= 0) { whole.push(r.label[f]); rest = `${rest.slice(0, at)},${rest.slice(at + r.label[f].length)}`; }
    }
    return [...whole, ...rest.split(/,|\band\b|&|\+/i)];
  };
  const parts = (Array.isArray(said) ? said : inWords(String(said))).map((x) => String(x ?? "").trim()).filter(Boolean);
  if (!parts.length || (parts.length === 1 && /^(everyone|everybody|all|all of us|shared|split|the group|the whole group)$/i.test(parts[0]))) return { list: null };
  const out: string[] = [];
  const unknown: string[] = [];
  for (const part of parts) {
    const fam = r.families.find((f) => r.label[f].toLowerCase() === part.toLowerCase());
    const found = fam !== undefined ? r.people.filter((p) => p.family === fam) : r.people.filter((p) => firstWord(p.name) === firstWord(part));
    if (!found.length) unknown.push(part);
    for (const p of found) if (!out.includes(p.name)) out.push(p.name);
  }
  if (unknown.length) return { error: `Who is it for? ${unknown.join(", ")} isn't on this trip.` };
  return { list: out.length ? out : null };
}

/** The currency said, or null for one Wander doesn't keep (or none said) */
export function currencySaid(c: unknown): Currency | null {
  const s = String(c ?? "").trim().toLowerCase();
  if (/^(usd|us\$|\$|dollars?|us dollars?)$/.test(s)) return "USD";
  if (/^(jpy|yen|¥|円)$/.test(s)) return "JPY";
  if (/^(vnd|dong|đồng|₫|đ)$/.test(s)) return "VND";
  if (/^(khr|riels?|៛)$/.test(s)) return "KHR";
  return null;
}

/** The most one payment can be, in each money (about $100,000; yen as Japan's Budget has it) */
export const MOST: Record<Currency, number> = { USD: 100_000, JPY: 10_000_000, VND: 2_000_000_000, KHR: 300_000_000 };

/** An amount as it's kept: whole dong, riel and yen; dollars to the cent. Null when it isn't a real amount. */
export function amountKept(amount: unknown, currency: Currency): number | null {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0 || n > MOST[currency]) return null;
  const kept = currency === "USD" ? Math.round(Number((n * 100).toPrecision(12))) / 100 : Math.round(n);
  return kept > 0 ? kept : null;
}

/** The rate a payment is kept with is the rate a person is shown: yen to the hundredth, dong and riel to the whole unit
 *  (the phone's lib/rates.ts printedRate is the same rule). So its dollars can be checked by hand from the rate on its
 *  line (Nov 22 2026, Convert: the line said "¥159" while the sums used 158.70). */
export function ratePrinted(currency: Foreign, rate: number): number {
  return currency === "JPY" ? Math.round(Number((rate * 100).toPrecision(12))) / 100 : Math.round(rate);
}

/** An amount's dollars (whole cents) and yen, at a rate: today's as printed, or the one it was kept with */
async function moneyOf(amount: number, currency: Currency, keptRate?: { rate: number; rateDate: string | null } | null):
  Promise<{ usdCents: number; yen: number; rate: number | null; rateDate: string | null; approx: boolean }> {
  const rates = await ratesPerDollar();
  if (currency === "USD") {
    const usdCents = Math.round(Number((amount * 100).toPrecision(12)));
    return { usdCents, yen: Math.round(amount * rates.JPY.rate), rate: null, rateDate: null, approx: false };
  }
  const now = rates[currency as Foreign];
  const use = keptRate && keptRate.rate > 0 ? { rate: keptRate.rate, asOf: keptRate.rateDate, approx: false } : { ...now, rate: ratePrinted(currency as Foreign, now.rate) };
  const usd = toDollars(amount, currency, { [currency]: use } as Partial<Rates>) ?? 0;
  const usdCents = Math.round(usd * 100);
  const yen = currency === "JPY" ? Math.round(amount) : Math.round(usd * rates.JPY.rate);
  return { usdCents, yen, rate: use.rate, rateDate: use.asOf, approx: use.approx };
}

/** "$19.44" */
export const usdWords = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const forWords = (list: string[] | null) => (list ? `, for ${list.join(", ")}` : "");
const listOf = (x: unknown): string[] | null => (Array.isArray(x) ? x.filter((n): n is string => typeof n === "string") : null);
const sameList = (a: string[] | null, b: string[] | null) => (a === null || b === null ? a === b : a.length === b.length && a.every((n) => b.includes(n)));
/** What to ask when the people named are all the payer's own family */
const ownOnly = (party: string) => `That's all ${party}'s own, so there's nothing to share. Who else was it for?`;

/** The family of a kept payment: its number, else its label as the trip names families now, else who paid it */
function familyOfRow(r: Roster, row: { family: number | null; party: string; paidByName: string | null }): number | null {
  if (row.family !== null && r.families.includes(row.family)) return row.family;
  return payerOf(r, row.party)?.family ?? (row.paidByName ? payerOf(r, row.paidByName)?.family ?? null : null);
}

export async function familyLedger(tripId: string, roster: Roster, who?: { travelerId?: string | null; displayName?: string | null }): Promise<FamilyLedger> {
  const rows = await prisma.tripExpense.findMany({ where: { tripId, removedAt: null }, orderBy: { createdAt: "desc" } });
  const today = await tripToday(tripId);
  const placed = rows.map((row) => {
    const family = familyOfRow(roster, row);
    const cents = row.usdCents ?? (row.currency === "USD" ? Math.round(Number((row.amount * 100).toPrecision(12))) : null);
    return { row, family, cents };
  });
  const math = familyMath({
    families: roster.families, people: roster.people, today,
    payments: placed.filter((p) => p.family !== null && p.cents !== null && p.cents > 0)
      .map((p) => ({ id: p.row.id, family: p.family!, cents: p.cents!, dayDate: p.row.dayDate || today, forPeople: listOf(p.row.forPeople) })),
  });
  const L = (f: number) => roster.label[f];
  const byLabel = (rec: Record<number, number>) => Object.fromEntries(roster.families.map((f) => [L(f), dollars(rec[f] || 0)]));
  const withReceipt = new Set((await prisma.expenseReceipt.findMany({ where: { tripId }, select: { expenseId: true } })).map((r) => r.expenseId));
  const org = await organizerOf(tripId);
  const me = who?.displayName ? roster.people.find((p) => firstWord(p.name) === firstWord(who.displayName!)) : undefined;
  return {
    unit: "USD",
    parties: roster.families.map(L),
    people: roster.people.map((p) => ({ name: p.name, party: L(p.family), abroadFrom: p.abroadFrom, abroadTo: p.abroadTo })),
    today, zone: await dayZone(tripId, today),
    here: roster.families.filter((f) => abroadOn(roster.people, today).some((p) => p.family === f)).map(L),
    paid: byLabel(math.paid), share: byLabel(math.share), balance: byLabel(math.balance),
    next: math.next === null ? null : L(math.next),
    settled: math.settled,
    even: math.even.map((e) => ({ from: L(e.from), to: L(e.to), usd: dollars(e.cents) })),
    mine: me ? L(me.family) : null,
    items: placed.map(({ row, family, cents }) => {
      const m = math.payments[row.id];
      return {
        id: row.id, party: family !== null ? L(family) : row.party, paidByName: row.paidByName,
        amount: row.amount, currency: row.currency, usd: cents === null ? null : dollars(cents), rate: row.rate, rateDate: row.rateDate,
        what: row.what, dayDate: row.dayDate,
        everyone: m ? m.everyone : !listOf(row.forPeople), forNames: m ? m.forNames : listOf(row.forPeople) || [], forNobody: m ? m.forNobody : false,
        shares: m ? byLabel(m.shares) : {},
        ...(m ? {} : { notCounted: true as const }),
        addedByName: row.addedByName, createdAt: row.createdAt.toISOString(),
        mayRemove: !!who && mayChangeAs(org, row, { travelerId: who.travelerId, displayName: who.displayName || "" }),
        hasReceipt: withReceipt.has(row.id),
      };
    }),
    rates: await ratesPerDollar(),
    days: (await prisma.day.findMany({ where: { tripId }, select: { date: true, city: { select: { country: true } } }, orderBy: { date: "asc" } }))
      .map((d) => ({ date: d.date.toISOString().slice(0, 10), money: moneyOfCountry(d.city?.country) })),
  };
}

export type FamilyKept = { id: string; party: string; paidByName: string | null; amount: number; currency: Currency; usd: number; rate: number | null; rateDate: string | null; approx: boolean; forPeople: string[] | null; dayDate: string; again?: boolean };

/** A payment: who paid (a family, or anyone in it), how much, in which money, for what, on which day, for whom */
export async function addFamilyExpense(roster: Roster, input: { tripId: string; paidBy: string; amount: number; currency?: unknown; what?: string | null; dayDate?: string | null; forPeople?: unknown;
  addedById: string | null; addedByName: string; clientKey?: string | null; receipt?: PaperFile | null }): Promise<FamilyKept | { error: string }> {
  const clientKey = typeof input.clientKey === "string" && /^[\w-]{8,64}$/.test(input.clientKey) ? input.clientKey : null;
  // The same Keep again (its reply lost on a weak signal, then Keep tapped again): the payment already kept
  const already = async (): Promise<FamilyKept | null> => {
    const r = clientKey ? await prisma.tripExpense.findUnique({ where: { clientKey } }) : null;
    if (!r || r.tripId !== input.tripId) return null;
    return { id: r.id, party: r.party, paidByName: r.paidByName, amount: r.amount, currency: r.currency as Currency, usd: dollars(r.usdCents ?? 0), rate: r.rate, rateDate: r.rateDate, approx: false, forPeople: listOf(r.forPeople), dayDate: r.dayDate || "", again: true };
  };
  const seen = await already();
  if (seen) return seen;
  const payer = payerOf(roster, input.paidBy);
  if (!payer) return { error: `Which family paid? ${roster.families.map((f) => roster.label[f]).join(", ")}` };
  const currency = currencySaid(input.currency);
  if (!currency) return { error: "Which money was it in? Wander keeps dong, riel, yen and US dollars." };
  const amount = amountKept(input.amount, currency);
  if (amount === null) return { error: "That amount doesn't look right. How much was it?" };
  const who = forListOf(roster, input.forPeople);
  if ("error" in who) return who;
  const party = roster.label[payer.family];
  if (who.list && who.list.every((n) => roster.people.find((p) => p.name === n)?.family === payer.family)) return { error: ownOnly(party) };
  const m = await moneyOf(amount, currency);
  if (m.usdCents < 1) return { error: "That's under a cent. How much was it?" };
  const dayDate = typeof input.dayDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.dayDate) ? input.dayDate : await tripToday(input.tripId);
  let row;
  try {
    row = await prisma.tripExpense.create({ data: { tripId: input.tripId, party, family: payer.family, paidByName: payer.person, amount, currency, yen: m.yen, rate: m.rate, usdCents: m.usdCents, rateDate: m.rateDate,
      ...(who.list ? { forPeople: who.list } : {}), what: (input.what || "").trim().slice(0, 200) || null, dayDate, addedById: input.addedById, addedByName: input.addedByName, clientKey } });
  } catch (e: any) {
    // (two copies of the same Keep arriving together: the second finds the first)
    if (e?.code === "P2002") { const r = await already(); if (r) return r; }
    throw e;
  }
  // (a failure to keep the picture never loses the payment)
  if (input.receipt) await keepReceipt(input.tripId, row.id, input.receipt).catch((e) => console.warn("[budget] receipt not kept:", e?.message || e));
  await logChange(input.tripId, row.id, { travelerId: input.addedById, displayName: input.addedByName }, `added ${moneyWords(amount, currency)} (${party})${forWords(who.list)}`);
  tellScreens(input.tripId, input.addedByName);
  return { id: row.id, party, paidByName: payer.person, amount, currency, usd: dollars(m.usdCents), rate: m.rate, rateDate: m.rateDate, approx: m.approx, forPeople: who.list, dayDate };
}

/** Changed: how much, in which money, who paid, what for, who it was for, which day. By who kept it, or the trip's
 *  first member. An amount in the same money keeps the rate it was kept with; a new money takes today's. */
export async function changeFamilyExpense(roster: Roster, tripId: string, id: string, who: { travelerId?: string | null; displayName: string },
  change: { amount?: number; currency?: unknown; paidBy?: string; what?: string | null; forPeople?: unknown; dayDate?: string }):
  Promise<{ party: string; usd: number; said: string } | "not-yours" | "gone" | { error: string }> {
  const row = await prisma.tripExpense.findFirst({ where: { id, tripId, removedAt: null } });
  if (!row) return "gone";
  if (!(await mayChange(tripId, row, who))) return "not-yours";
  const wasFamily = familyOfRow(roster, row);
  let family = wasFamily, paidByName = row.paidByName;
  if (change.paidBy !== undefined && String(change.paidBy).trim()) {
    const p = payerOf(roster, String(change.paidBy));
    if (!p) return { error: `Which family paid? ${roster.families.map((f) => roster.label[f]).join(", ")}` };
    family = p.family; paidByName = p.person;
  }
  if (family === null) return { error: `Which family paid? ${roster.families.map((f) => roster.label[f]).join(", ")}` };
  const party = roster.label[family];
  const wasCurrency = currencySaid(row.currency) || "USD";
  let currency = wasCurrency;
  if (change.currency !== undefined && change.currency !== null && String(change.currency).trim()) {
    const c = currencySaid(change.currency);
    if (!c) return { error: "Which money was it in? Wander keeps dong, riel, yen and US dollars." };
    currency = c;
  }
  let amount = row.amount;
  if (change.amount !== undefined) {
    const n = amountKept(change.amount, currency);
    if (n === null) return { error: "That amount doesn't look right. How much was it?" };
    amount = n;
  } else if (currency !== wasCurrency) return { error: "How much was it in that money?" };
  const wasList = listOf(row.forPeople);
  let list = wasList;
  if (change.forPeople !== undefined) {
    const f = forListOf(roster, change.forPeople);
    if ("error" in f) return f;
    list = f.list;
  }
  if (list && list.every((n) => roster.people.find((p) => p.name === n)?.family === family) && (change.forPeople !== undefined || change.paidBy !== undefined)) return { error: ownOnly(party) };
  let dayDate = row.dayDate;
  if (change.dayDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(change.dayDate))) return { error: "Which day was it?" };
    dayDate = String(change.dayDate);
  }
  const what = change.what === undefined ? row.what : (String(change.what || "").trim().slice(0, 200) || null);
  const moneyChanged = amount !== row.amount || currency !== wasCurrency;
  const m = moneyChanged || row.usdCents === null
    ? await moneyOf(amount, currency, currency === wasCurrency && row.rate ? { rate: row.rate, rateDate: row.rateDate } : null)
    : { usdCents: row.usdCents, yen: row.yen, rate: row.rate, rateDate: row.rateDate, approx: false };
  if (m.usdCents < 1) return { error: "That's under a cent. How much was it?" };
  const said: string[] = [];
  if (moneyChanged) said.push(`changed ${moneyWords(row.amount, row.currency)} → ${moneyWords(amount, currency)}`);
  if (family !== wasFamily) said.push(`changed who paid: ${wasFamily !== null ? roster.label[wasFamily] : row.party} → ${party}`);
  if ((what || "") !== (row.what || "")) said.push(what ? (row.what ? `changed what it was for to “${what}”` : `added what it was for: “${what}”`) : "took out what it was for");
  if (!sameList(list, wasList)) said.push(`changed who it's for: ${wasList ? wasList.join(", ") : "everyone there that day"} → ${list ? list.join(", ") : "everyone there that day"}`);
  // (the Log is read by people: "Mon, Dec 28", never "2026-12-28")
  const asDay = (d: string | null) => (!d ? "none" : /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : d);
  if (dayDate !== row.dayDate) said.push(`changed its day: ${asDay(row.dayDate)} → ${asDay(dayDate)}`);
  const quiet = paidByName !== row.paidByName || row.family !== family || row.usdCents === null;
  if (!said.length && !quiet) return { party, usd: dollars(m.usdCents), said: "" };
  await prisma.tripExpense.update({ where: { id }, data: { party, family, paidByName, amount, currency, yen: m.yen, rate: m.rate, usdCents: m.usdCents, rateDate: m.rateDate, what, dayDate, forPeople: list ?? Prisma.DbNull } });
  const line = said.length ? `${said.join("; ")}${moneyChanged ? "" : ` (${moneyWords(amount, currency)})`}` : "";
  if (line) await logChange(tripId, id, who, line);
  tellScreens(tripId, who.displayName);
  return { party, usd: dollars(m.usdCents), said: line };
}
