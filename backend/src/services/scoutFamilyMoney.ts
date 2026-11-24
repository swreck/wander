/**
 * Scout and money on a trip whose payers are families (Nov 23 2026). Ken (Nov 16): "dollars as the common unit, the
 * three families as payers, shared costs split per person". Chat parity: what Budget's page does on such a trip
 * (services/familyExpenses.ts), Scout does in words, with the same sums and the same refusals.
 *
 * Japan's couples' Budget in Scout (routes/chat.ts, the money case; rule 61) is untouched: a trip with no families
 * never reaches this file. Here are the five money tools for a families' trip, convert_money, and the prompt and the
 * tool words such a trip is sent in place of the couples'.
 */
import prisma from "./db.js";
import { addFamilyExpense, changeFamilyExpense, familyLedger, currencySaid, moneyOfCountry, usdWords, ratePrinted, type Roster, type FamilyLedger, type FamilyItem } from "./familyExpenses.js";
import { removeExpense, restoreExpense, moneyWords } from "./expenses.js";
import { dayCountry, tripToday } from "./dayCountry.js";
import { ratesPerDollar, type Currency, type Foreign } from "./rates.js";

type Who = { travelerId: string; displayName: string };
type Told = { result: any; actionDescription?: string };

const FOUR = "dong, riel, yen and US dollars";
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_WORD: Record<Foreign, string> = { VND: "dong", KHR: "riel", JPY: "yen" };

/** An amount as Scout is given it: "$19.44", "2,500,000 ₫", "40,000 ៛", "¥16,000" */
const words = (amount: number, currency: string) => (currency === "USD" ? usdWords(Math.round(Number((amount * 100).toPrecision(12)))) : moneyWords(amount, currency));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 22" from "2026-11-22"; null when the day can't be read (never a made-up day) */
function dayWords(asOf: string | null | undefined): string | null {
  const m = asOf ? /^\d{4}-(\d{2})-(\d{2})$/.exec(asOf) : null;
  if (!m) return null;
  const month = Number(m[1]), day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${MONTHS[month - 1]} ${day}` : null;
}

/** A payment's day as Scout says it: "today" when it is the trip's today, else "Thu, Dec 31" (never "2026-12-31", and
 *  never both: Scout wrote "on today, Thu, Dec 31" from the bare date, Nov 24 2026) */
function sayDay(day: string, today: string): string {
  if (day === today) return "today";
  return YMD.test(day) ? new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : day;
}

/** A rate as the phone's rate line prints it: "25,716 ₫ to the dollar", "¥158.70 to the dollar", a round "¥160" */
function perDollar(currency: Foreign, rate: number): string {
  const printed = ratePrinted(currency, rate);
  return `${currency === "JPY" && !Number.isInteger(printed) ? `¥${printed.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : moneyWords(printed, currency)} to the dollar`;
}

/** A rate with its day when it's a real one, "a recent rate" when the day isn't known, and plainly rough when it's a round figure */
function rateLine(currency: Foreign, r: { rate: number; asOf: string | null; approx: boolean }): string {
  if (r.approx) return `about ${perDollar(currency, r.rate)}, a rough figure: Wander couldn't get a recent rate`;
  const day = dayWords(r.asOf);
  return day ? `${perDollar(currency, r.rate)}, the rate on ${day}` : `${perDollar(currency, r.rate)}, a recent rate`;
}

/** One sentence per family that would pay, as Budget's page has them: "A would pay B $21.36 and C $16.24." */
function evenLines(l: FamilyLedger): string[] {
  const payers = [...new Set(l.even.map((e) => e.from))];
  return payers.map((from) => {
    const to = l.even.filter((e) => e.from === from).map((e) => `${e.to} ${usdWords(Math.round(e.usd * 100))}`);
    return `${from} would pay ${to.length > 2 ? `${to.slice(0, -1).join(", ")} and ${to[to.length - 1]}` : to.join(" and ")}.`;
  });
}

/** Who pays next and what would make the families even, in dollars: the two things every money answer ends on */
const standing = (l: FamilyLedger) => ({
  whoPaysNext: l.next ?? (l.settled ? "no one: the families are within a dollar of even"
    : l.here.length < 2 ? "no one yet: fewer than two families are on the trip today"
    : "no one: the families on the trip today are within a dollar of each other"),
  toBeEven: l.even.length ? evenLines(l) : "even",
});

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
const forOf = (x: FamilyItem) => (x.forNobody ? "no one yet" : x.everyone ? `everyone on the trip that day (${people(x.forNames.length)})` : x.forNames.join(", "));

/** What a kept payment needs said about it: nobody was abroad on its day, or only the payer's own family was */
function notesOf(l: FamilyLedger, id: string): { noOneThatDay?: string; note?: string } {
  const x = l.items.find((i) => i.id === id);
  if (!x) return {};
  if (x.forNobody) return { noOneThatDay: `No one was on the trip ${!x.dayDate ? "that day" : x.dayDate === l.today ? "today" : `on ${sayDay(x.dayDate, l.today)}`}, so it counts for ${x.party} alone until its day or who it was for is given. Ask which day it was.` };
  const others = Object.entries(x.shares).some(([party, usd]) => party !== x.party && usd > 0);
  return x.everyone && !others ? { note: `Only ${x.party}'s people were on the trip that day, so it changes nothing between the families.` } : {};
}

/** The five money tools on a families' trip. The caller has already checked the person is on the trip. */
export async function scoutFamilyMoney(toolName: string, input: any, who: Who, roster: Roster): Promise<Told> {
  const tripId = String(input?.tripId || "");
  const id = String(input?.id || "");
  const me = roster.people.find((p) => p.name.trim().split(/\s+/)[0].toLowerCase() === who.displayName.trim().split(/\s+/)[0].toLowerCase());
  const myFamily = me ? roster.label[me.family] : null;
  // ("we paid", "that was me": the person talking, whose family it counts for)
  const payer = (said: unknown) => { const s = String(said ?? ""); return /^(we|us|i|me|our|ours|my family|our family)$/i.test(s.trim()) ? who.displayName : s; };
  // ("for me and the kids": the person talking; "just for us": their family)
  const one = (said: string) => {
    const s = said.trim();
    if (/^(me|i|myself)$/i.test(s)) return who.displayName;
    if (/^(us|we|ours|my family|our family)$/i.test(s) && myFamily) return myFamily;
    return said;
  };
  const forWho = (said: unknown): unknown => {
    if (Array.isArray(said)) return said.map((x) => one(String(x ?? "")));
    if (typeof said !== "string") return said;
    const whole = one(said);
    if (whole !== said) return whole;
    return said.replace(/\b(me|myself)\b/gi, who.displayName).replace(/\bI\b/g, who.displayName).replace(/\b(us|we)\b/gi, myFamily || "us");
  };
  const now = () => familyLedger(tripId, roster, who);

  if (toolName === "money_so_far") {
    const l = await now();
    // (taken away, newest first, for put_back_expense: "put the coffee back")
    const off = await prisma.tripExpense.findMany({ where: { tripId, removedAt: { not: null } }, orderBy: { removedAt: "desc" }, take: 10 });
    // (in no family's share yet, said apart so a mistake shows: Ken, Oct 23, "highlight anything that doesn't shared
    // because it's probably an error")
    const check = l.items.filter((x) => x.forNobody || x.notCounted).map((x) => `${words(x.amount, x.currency)}${x.what ? ` (${x.what})` : ""}, paid by ${x.party}${x.dayDate ? (x.dayDate === l.today ? " today" : ` on ${sayDay(x.dayDate, l.today)}`) : ""}: ${x.notCounted ? "Wander can't tell which family paid, so it is in no sum" : "no one was on the trip that day"}`);
    return { result: {
      unit: "US dollars", ...standing(l), ...(l.mine ? { yourFamily: l.mine } : {}),
      families: Object.fromEntries(l.parties.map((party) => [party, l.people.filter((p) => p.party === party).map((p) => p.name)])),
      onTheTripToday: l.here,
      paid: Object.fromEntries(l.parties.map((party) => [party, usdWords(Math.round((l.paid[party] || 0) * 100))])),
      ...(check.length ? { check, checkHow: "Name these plainly, and ask which day each was, or who it was for" } : {}),
      payments: l.items.slice(0, 40).map((x) => ({
        id: x.id, paidBy: x.paidByName ? `${x.party} (${x.paidByName})` : x.party, amount: words(x.amount, x.currency),
        ...(x.currency !== "USD" && x.usd !== null ? { dollars: usdWords(Math.round(x.usd * 100)) } : {}),
        for: forOf(x), what: x.what, day: x.dayDate ? sayDay(x.dayDate, l.today) : null, keptBy: x.addedByName, youMayRemove: x.mayRemove, ...(x.hasReceipt ? { receipt: true } : {}),
      })),
      takenAway: off.map((x) => ({ id: x.id, paidBy: x.party, amount: words(x.amount, x.currency), what: x.what, keptBy: x.addedByName })),
      // (Scout offered Larisa "tell me which and I'll take them off" for Andy's entries, then couldn't; user-larisa3)
      say: "Say who pays next and what would make the families even, in dollars, in a line or two. What each family has paid, and the payments, only if asked (Ken: people don't want to be reminded how much they've paid). Offer to change or take a payment away only when it's youMayRemove: true; for others, say who kept it and that they (or Ken) can.",
    } };
  }

  if (toolName === "remove_expense") {
    const r = await removeExpense(tripId, id, who);
    if (r === "not-yours") return { result: { error: "Only whoever kept that payment, or Ken, can take it away." } };
    if (!r) return { result: { error: "That payment isn't there — look at money_so_far for its id." } };
    return { result: { removed: true, ...standing(await now()), say: "One line: it's taken away, and who pays next now." }, actionDescription: "Payment taken away" };
  }

  if (toolName === "put_back_expense") {
    const r = await restoreExpense(tripId, id, who);
    if (r === "not-yours") return { result: { error: "Only whoever kept that payment, or Ken, can put it back." } };
    if (r === "gone") return { result: { error: "That payment isn't there — look at money_so_far's takenAway list for its id." } };
    const l = await now();
    if (r === "already") return { result: { already: "It already counts — it was never taken away, or someone put it back.", ...standing(l) } };
    return { result: { putBack: `${r.party}, ${words(r.amount, r.currency)}`, ...notesOf(l, id), ...standing(l), say: "One line: it's back and counts again, and who pays next now." }, actionDescription: "Payment put back" };
  }

  const saidMoney = String(input?.currency ?? "").trim();

  if (toolName === "change_expense") {
    // (a money Wander doesn't keep is never kept as another one: nothing is changed)
    if (saidMoney && !currencySaid(saidMoney)) return { result: { changed: false, question: `Wander keeps ${FOUR}, so nothing was changed.` } };
    // (what isn't given isn't changed: an empty list or a null is "not given", never "everyone")
    const given = input?.forPeople;
    const r = await changeFamilyExpense(roster, tripId, id, who, {
      amount: input?.amount === undefined || input?.amount === null ? undefined : Number(input.amount),
      currency: saidMoney || undefined,
      paidBy: input?.paidBy === undefined || input?.paidBy === null ? undefined : payer(input.paidBy),
      what: input?.what === null ? undefined : input?.what,
      forPeople: given === undefined || given === null || (Array.isArray(given) && !given.length) ? undefined : forWho(given),
      dayDate: input?.date === undefined || input?.date === null ? undefined : String(input.date),
    });
    if (r === "not-yours") return { result: { error: "Only whoever kept that payment, or Ken, can change it." } };
    if (r === "gone") return { result: { error: "That payment isn't there — look at money_so_far for its id." } };
    if ("error" in r) return { result: { changed: false, question: r.error } };
    const l = await now();
    // (a new amount or a new money that isn't dollars: its dollars now, as a kept payment's are said)
    const x = l.items.find((i) => i.id === id);
    const newMoney = !!r.said && (input?.amount !== undefined && input?.amount !== null || !!saidMoney) && !!x && x.currency !== "USD" && x.usd !== null;
    return { result: { changed: r.said || "nothing to change — it already says that", ...(newMoney ? { nowInDollars: usdWords(Math.round(x!.usd! * 100)) } : {}), ...notesOf(l, id), ...standing(l),
      say: "One line: what changed (with nowInDollars when it's given: \"about $22.14\"), and who pays next now." }, actionDescription: r.said ? `Changed: ${r.said}` : undefined };
  }

  if (toolName !== "add_expense") return { result: { error: "Scout has no such money tool." } };

  const date = YMD.test(String(input?.date || "")) ? String(input.date) : await tripToday(tripId);
  let currency: Currency | null = null;
  if (saidMoney) {
    currency = currencySaid(saidMoney);
    // (a money Wander doesn't keep is never kept as another one)
    if (!currency) return { result: { kept: false, question: `Wander keeps ${FOUR}, so nothing was kept.` } };
  } else {
    // No money said: never guessed. On a day in Japan a bare number is yen, as it always was; anywhere else Scout asks.
    const there = moneyOfCountry(await dayCountry(tripId, date));
    if (there === "JPY") currency = "JPY";
    else if (there) return { result: { kept: false, question: `Was that in ${MONEY_WORD[there]} or US dollars? Nothing is kept yet.` } };
    else return { result: { kept: false, question: `Which money was it in? Wander keeps ${FOUR}. Nothing is kept yet.` } };
  }
  const r = await addFamilyExpense(roster, { tripId, paidBy: payer(input?.paidBy), amount: Number(input?.amount), currency, what: typeof input?.what === "string" ? input.what : null,
    dayDate: date, forPeople: forWho(input?.forPeople), addedById: who.travelerId, addedByName: who.displayName });
  if ("error" in r) return { result: { kept: false, question: r.error } };
  const l = await now();
  const x = l.items.find((i) => i.id === r.id);
  const amount = words(r.amount, r.currency);
  return {
    result: {
      kept: true, id: r.id, paidBy: r.party, day: sayDay(r.dayDate, l.today), amount,
      ...(r.currency !== "USD" && r.rate ? { inDollars: `${usdWords(Math.round(r.usd * 100))} at ${rateLine(r.currency, { rate: r.rate, asOf: r.rateDate, approx: r.approx })}` } : {}),
      for: x ? forOf(x) : r.forPeople ? r.forPeople.join(", ") : "everyone on the trip that day",
      ...notesOf(l, r.id), ...standing(l),
      say: "One or two short lines: kept for which family and how much (with its dollars when it wasn't in dollars), its day from \"day\" (\"today\" stands alone, never \"on today\"; a date takes \"on\": \"on Thu, Dec 31\"), then who pays next and, when they aren't even, what would make them even now, as toBeEven has it. Not what each family has paid (Ken: people don't want to be reminded how much they've paid). No lists. With noOneThatDay, ask which day it was.",
    },
    actionDescription: `Kept: ${r.party} paid ${amount}`,
  };
}

const cents = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;
const whole = (n: number) => Math.round(Number(n.toPrecision(12)));

/**
 * "How much is 500,000 dong?" One money as another at a recent rate, by the sum the Convert button on the bar does
 * (frontend/src/lib/rates.ts convert: the rates as printed, rounded once at the end), so Scout and the screen agree.
 * Keeps nothing. `tripId` only when the person is on that trip: it says which country they are in today.
 */
export async function convertMoney(input: { tripId?: string | null; amount?: unknown; from?: unknown; to?: unknown }): Promise<Told> {
  const n = typeof input.amount === "number" ? input.amount : typeof input.amount === "string" && input.amount.trim() ? Number(input.amount) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 1e13) return { result: { error: "How much? Give the amount as a number." } };
  const NO_RATE = `Wander has rates for ${FOUR} only.`;
  const from = currencySaid(input.from);
  if (!from) return { result: { error: NO_RATE } };
  let to: Currency | null;
  if (String(input.to ?? "").trim()) {
    to = currencySaid(input.to);
    if (!to) return { result: { error: NO_RATE } };
    if (to === from) return { result: { error: "That's the same money." } };
  } else if (from !== "USD") to = "USD";
  else {
    // (dollars, and no money named: the money of the country they are in today, when the trip says)
    to = input.tripId ? moneyOfCountry(await dayCountry(input.tripId, await tripToday(input.tripId))) : null;
    if (!to) return { result: { question: "Into which money: dong, riel or yen?" } };
  }
  const rates = await ratesPerDollar();
  const per = (c: Currency) => (c === "USD" ? 1 : ratePrinted(c, rates[c].rate));
  const amount = from === "USD" ? cents(n) : whole(n);
  if (!(amount > 0) || !(per(from) > 0) || !(per(to) > 0)) return { result: { error: "How much? Give the amount as a number." } };
  const out = to === "USD" ? cents((amount / per(from)) * per(to)) : whole((amount / per(from)) * per(to));
  const used = ([from, to] as Currency[]).filter((c): c is Foreign => c !== "USD");
  const day = dayWords(rates[used[0]].asOf);
  const rate = used.length === 1 ? rateLine(used[0], rates[used[0]])
    : used.every((c) => !rates[c].approx && rates[c].asOf === rates[used[0]].asOf) && day ? `${used.map((c) => perDollar(c, rates[c].rate)).join(" and ")}, the rates on ${day}`
    : used.map((c) => rateLine(c, rates[c])).join("; ");
  return { result: { amount: words(amount, from), is: words(out, to), rate,
    say: "Say it as about, with the rate's day (or that it's a rough figure): a recent rate, not what a bank, a card or a money changer will give. Nothing was kept in Budget." } };
}

/** The plan trip's Money line (services/planTrip.ts PLAN_BLOCK), and what a families' trip is told in its place */
const MONEY_WAS = "- Money: Wander keeps yen and US dollars only so far.";
const MONEY_ENDS = "\n- Past, now and ahead come from RIGHT NOW.";
const MONEY_NOW = `- Money: this trip's Budget is kept by family. Wander keeps a payment in dong, riel, yen or US dollars, as said, and
  works out who pays next in dollars at a recent rate (rule 61). A number with no money said is never guessed: on a
  day in Japan it is yen; anywhere else leave currency out, and add_expense comes back with the question to ask. For
  any other money, say Wander keeps those four, and keep nothing.
- Who is on this trip ("who's coming?", "how many of us?", "which family is Andy in?"): Wander holds the list. Call
  money_so_far: its "families" has every family and the people in it, as the plan has them, and "onTheTripToday" who is
  on the trip today. Answer from those, by family, and say nothing about money unless they asked. Never say Wander
  doesn't hold the list. The people using Wander so far are a shorter list: that is who has joined Wander, said only
  when they ask that. The list gives no arrival, departure or flight: those come only from DAY BY DAY's lines.`;

/** The app map's Budget line (the couples' page), and the families' page */
const PAGE_WAS = `what's been shared so far, what each couple paid, who pays next and what would make them even, "+ Add entry", then every entry with what it was for when someone said. Home shows the total and who pays next in one line.`;
const PAGE_NOW = `who pays next and what would make the families even, in dollars, "+ Add entry", then every entry with what it was for when someone said; a tap on an amount shows it in dollars, in the trip's other moneys at a recent rate, and each family's part. Home shows who pays next and what they'd pay to be even in one line.`;

/** Rule 61 for a families' trip, in place of the couples' (one line, as every rule is) */
const RULE_61_STARTS = "\n61. Who pays next (Larisa's idea, Oct 15: one couple pays for something";
const RULE_61_NOW = `61. Who pays next, on a trip of families (Ken, Nov 16: "dollars as the common unit, the three families as payers, shared costs split per person"). Budget is kept by family: anyone in a family can be the one who paid, the youngest included, and it counts for their family. A payment is shared per person by everyone on the trip that day, unless they say who it was for. When someone says a family, or anyone in it, paid for something ("we paid 2,500,000 dong for dinner", "Andy got the boat, $60", "Larisa paid 80,000 riel for the tuk-tuk") keep it with add_expense: who paid (their name, or the person talking for "we"/"I"), the amount as said, the money only if they said it, and what it was for if they said. Don't ask what it was for: it isn't needed. Wander keeps dong, riel, yen and US dollars, each as said, with its dollars at a recent rate. Never guess the money: when they said none, leave currency out; when add_expense comes back with a question, ask it in one line, and nothing is kept until they answer. Any other money keeps nothing: say Wander keeps dong, riel, yen and US dollars. A payment for some people only ("for Julie and Andy", "just for Andy's family"): forPeople, with their names, or a family's name as money_so_far gives it; when it's unclear who they mean ("the kids"), ask. Shared by everyone is the default (Ken, Oct 23: "Make a shared expense as a clear default… Ask if the intent is unclear"); when it might be either (a present? something just for them?), ask in one line before keeping it. Then one or two lines: kept for which family, its dollars when it wasn't in dollars, and who pays next. When add_expense says noOneThatDay, say so and ask which day it was. "Who pays next?", "where are we on money?": money_so_far, then who pays next and what would make the families even, in dollars, in a line or two; never how much has been spent unless asked (Ken, Oct 16: "people do not want to be reminded how much they've paid. They simply want to understand the next action, which is who pays next and what the difference is"). Who pays next is the family furthest behind among those on the trip today; when the tool says no one, say that, never a family of your own choosing. Asked how things stand, name anything in money_so_far's check list, so a mistake shows. A payment kept by mistake: remove_expense (only who kept it, or Ken). One taken away by mistake ("put the coffee back"): put_back_expense, from money_so_far's takenAway list (the same people can); it counts again. A payment that's wrong (the amount, the money, who paid, what it was for, who it was for, or its day): change_expense, giving only what changes (the same people can). A photo of a receipt sent with who paid ("we got this", "Larisa paid this"): read its grand total and the money it is in (on a Vietnamese bill the total is "Tổng cộng", never the tax or service line, and 1.250.000 there is 1,250,000 dong; a bill in Cambodia may give dollars and riel: keep the one they paid in, and ask when that's unclear) and add_expense with receipt: true, what it was for read from it in a few plain words ("Dinner"); it's a payment, not a paper; if it's unclear who paid, ask in one line. Never read a card number off it. "How much is 500,000 dong?", "what's $40 in riel?": convert_money, said as about, with the rate's day; it's a recent rate, not what a bank or a card will give, and it keeps nothing. The Convert button on the bottom bar does the same sum. Budget's page: tap a payment to change it (who paid, the amount and its money, what for, who it's for, its day, or remove it); tap an amount to see it in the other moneys; "Log" at the foot lists who added, changed, removed or put back what, when, and a removed payment can be put back there. Never keep money in Notes for this. If it's unclear who paid, ask in one line. Every family sees it. Say money plainly, in short sentences, without dashes.`;

const GONE = "Scout's prompt no longer has the spots the families' Budget is made from";

/**
 * Scout's prompt for a plan trip with families: the plan trip's prompt with its Money line, the app map's Budget line
 * and rule 61 replaced. Nothing else changes. No person of the trip is named here: who is in which family comes back
 * from money_so_far. If a spot can't be found the prompt has changed under this function, and it says so loudly
 * rather than quietly telling Scout the couples' rule on a families' trip.
 */
export function familySystemPrompt(planPrompt: string): string {
  const money = planPrompt.indexOf(MONEY_WAS);
  const moneyEnd = money < 0 ? -1 : planPrompt.indexOf(MONEY_ENDS, money);
  if (money < 0 || moneyEnd < 0) throw new Error(GONE);
  let out = `${planPrompt.slice(0, money)}${MONEY_NOW}${planPrompt.slice(moneyEnd)}`;
  if (!out.includes(PAGE_WAS)) throw new Error(GONE);
  out = out.replace(PAGE_WAS, () => PAGE_NOW);
  const rule = out.indexOf(RULE_61_STARTS);
  if (rule < 0) throw new Error(GONE);
  const ruleEnd = out.indexOf("\n", rule + 1);
  return `${out.slice(0, rule)}\n${RULE_61_NOW}${ruleEnd < 0 ? "" : out.slice(ruleEnd)}`;
}

const MONEY_CODES = "VND (dong), KHR (riel), JPY (yen), USD (US dollars)";
const CONVERT_TOOL = {
  name: "convert_money",
  description: "One money as another at a recent rate: dong, riel, yen and US dollars, each way. For 'how much is 500,000 dong?', 'what's $40 in riel?', a price on a menu or a meter. It keeps nothing: a payment to remember is add_expense. Rule 61.",
  input_schema: {
    type: "object" as const,
    properties: {
      tripId: { type: "string" },
      amount: { type: "number", description: "The amount as said, a number: 500000, or 40" },
      from: { type: "string", description: `The money it is in, as a code: ${MONEY_CODES}` },
      to: { type: "string", description: "The money they want it in, as a code. Leave out for the usual: dollars for dong, riel or yen; for dollars, the money of the country they are in today." },
    },
    required: ["tripId", "amount", "from"],
  },
};

/** A tool's fields in their order, with some replaced: [new name, new field], or null to drop one */
function fields(tool: string, props: Record<string, any> | undefined, swap: Record<string, [string, any] | null>): Record<string, any> {
  for (const k of Object.keys(swap)) if (!props?.[k]) throw new Error(`Scout's tool ${tool} no longer has "${k}"`);
  return Object.fromEntries(Object.entries(props!).flatMap(([k, v]) => (k in swap ? (swap[k] ? [swap[k]!] : []) : [[k, v]])));
}

/**
 * The tools Scout is sent on a plan trip with families: the plan trip's, with the three that speak of couples, half
 * and half and "yen or dollars" reworded for families (who it was for by name; any of the four moneys), and
 * convert_money added at the end. Copies: the shared array and the plan trip's are never touched.
 */
export function familyTools<T extends { name: string }>(planOnes: T[]): T[] {
  const seen = new Set<string>();
  const out = planOnes.map((t) => {
    if (t.name !== "add_expense" && t.name !== "change_expense" && t.name !== "money_so_far") return t;
    seen.add(t.name);
    const copy: any = JSON.parse(JSON.stringify(t));
    const props = copy.input_schema?.properties;
    if (t.name === "add_expense") {
      if (!Array.isArray(props?.currency?.enum)) throw new Error(`Scout's tool ${t.name} no longer has "currency" as yen or dollars`);
      copy.description = "Keep a payment one family made for the group, so the families come out even (shared per person by everyone on the trip that day, unless forPeople says who): 'we paid 2,500,000 dong for dinner', 'Andy just spent 40 dollars', 'Larisa paid 80,000 riel for the tuk-tuk'. paidBy: a family, or anyone in it; 'we'/'I' is the person talking. Kept in the money they said; when they said none it comes back with a question, except on a day in Japan. Rule 61.";
      copy.input_schema.properties = fields(t.name, props, {
        paidBy: ["paidBy", { type: "string", description: "Who paid: a person's name (their family counts) or the family's name as money_so_far gives it; for 'we' or 'I', the person talking" }],
        currency: ["currency", { type: "string", description: `The money they said, as a code: ${MONEY_CODES}; any other money's own code (EUR), and nothing is kept. Leave out when they said none.` }],
        forCouple: ["forPeople", { type: "array", items: { type: "string" }, description: "Everyone on the trip that day is the default: leave this out. Only when their words say who it was for: those people's names, or a family's name for all of that family ('me' is the person talking). Never the payer's own family alone: that isn't shared at all. Unclear (a present? something just for them?) → ask before keeping. Rule 61." }],
        receipt: ["receipt", { type: "boolean", description: "true when they sent a photo of this payment's receipt with this message: the photo is kept with the payment (the amount and its money are still yours to give, read from it)" }],
      });
    } else if (t.name === "change_expense") {
      copy.description = "Change a payment already kept: how much, which money, who paid, what it was for, who it was for, or its day (the one they mean, from money_so_far's list, by its id). Give only what changes. Only who added it, or Ken, can. Rule 61.";
      copy.input_schema.properties = fields(t.name, props, {
        currency: ["currency", { type: "string", description: "The new money, as a code: VND, KHR, JPY or USD. With a new money, give the amount too." }],
        paidBy: ["paidBy", { type: "string", description: "The family (or anyone in it) who really paid" }],
        forCouple: ["forPeople", { type: "array", items: { type: "string" }, description: "Who it is for: people's names, or a family's name for all of that family; [\"everyone\"] makes it everyone on the trip that day again" }],
        thatsRight: ["date", { type: "string", description: "The trip day it was really spent, YYYY-MM-DD" }],
      });
    } else {
      copy.description = "Who pays next, what would make the families even (in US dollars), the families and who is in each, and every payment kept (newest first, with ids). For 'who pays next?', 'where are we on money?', 'how much have we spent?', and before remove_expense, put_back_expense (its takenAway list) or change_expense. Rule 61.";
    }
    return copy as T;
  });
  for (const name of ["add_expense", "change_expense", "money_so_far"]) if (!seen.has(name)) throw new Error(`Scout no longer has "${name}"`);
  return [...out, CONVERT_TOOL as unknown as T];
}
