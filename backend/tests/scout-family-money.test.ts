/**
 * SCOUT AND MONEY ON A FAMILIES' TRIP (Nov 23 2026). Ken (Nov 16): "dollars as the common unit, the three families as
 * payers, shared costs split per person". Chat parity: what Budget's page does on such a trip, Scout does in words:
 * keep a payment (in dong, riel, yen or US dollars), change it, take it away, put it back, say who pays next. And
 * convert_money for "how much is 500,000 dong?". Written before the code.
 *
 * The model is stubbed and no network is reached. Every figure was worked out by hand at the round rates the test's
 * stand-in source gives: 25,000 dong, 4,000 riel and 160 yen to the dollar.
 *
 *   The people (invented): family 1 Sfken, Sflarisa (abroad the whole trip) and Sfkid (from four days ago);
 *   family 2 Sfandy, Sfjulie, Sfjo; family 3 Sfpat, Sfsam, Sfx, Sfy (families 2 and 3 from two days ago to tomorrow).
 *   Today is a day in Vietnam, tomorrow one in Cambodia, the day after one in Japan (family 1 alone by then).
 *
 *   P1 Sfandy "we", 2,500,000 dong, today, everyone (10)        = $100.00 → 1: $30   2: $30   3: $40
 *        owed 1: −$30  2: +$70  3: −$40          → family 3 pays next; 3 → 2 $40 and 1 → 2 $30
 *   P2 Sfpat, $60, today, for Sfken, Sfx, Sfy                   = $60.00  → 1: $20            3: $40
 *        owed 1: −$50  2: +$70  3: −$20          → family 1 pays next; 1 → 2 $50 and 3 → 2 $20
 *   P3 Sflarisa "I", 40,000 riel, tomorrow, everyone (10)       = $10.00  → 1: $3    2: $3    3: $4
 *        owed 1: −$43  2: +$67  3: −$24
 *   P4 Sfken "we", 16,000 and no money said, a day in Japan     = yen, $100.00 → 1: $100 (family 1 alone that day)
 *        owed unchanged
 *   P5 Sfjo "I", $10.02, today, for "me", Sfkid and Sfx         = $10.02  → 1: $3.34 2: $3.34 3: $3.34
 *        paid 1: $110.00 2: $110.02 3: $60.00 · share 1: $156.34 2: $36.34 3: $87.34
 *        owed 1: −$46.34 2: +$73.68 3: −$27.34   → family 1 pays next; 1 → 2 $46.34 and 3 → 2 $27.34
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

const sentToModel = vi.hoisted(() => [] as any[]);
vi.mock("@anthropic-ai/sdk", async (orig) => {
  const real: any = await orig();
  class Fake extends real.default {
    constructor(o?: any) {
      super({ apiKey: "test", ...o });
      (this as any).messages = {
        create: async (p: any) => {
          sentToModel.push(p);
          return { id: "stub", type: "message", role: "assistant", model: "stub", stop_reason: "end_turn", stop_sequence: null,
            content: [{ type: "text", text: "(stub)", citations: null }], usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
        },
      };
    }
  }
  return { ...real, default: Fake };
});

process.env.JWT_SECRET = "test-secret-scout-family-money";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { forgetRates } = await import("../src/services/rates.js");
const { executeTool, scoutTools } = await import("../src/routes/chat.js");
const { planSystemPrompt, planTools } = await import("../src/services/planTrip.js");
const { familySystemPrompt, familyTools } = await import("../src/services/scoutFamilyMoney.js");
const prisma = new PrismaClient();

const VN = "Asia/Ho_Chi_Minh";
const F1 = "Sfken & Sflarisa", F2 = "Sfandy & Sfjulie", F3 = "Sfpat & Sfsam";
const plus = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const at0 = (s: string) => new Date(`${s}T00:00:00Z`);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: VN, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const inCambodia = plus(today, 1), inJapan = plus(today, 2), noDay = plus(today, 12), longAgo = plus(today, -30);
// (a day said as a person reads it: "Mon, Dec 28", never "2026-12-28")
const asDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

let tripId = "", couples = "";
const ids: Record<string, string> = {};
const who = (n: string) => ({ code: n, displayName: n, travelerId: ids[n] });
const run = async (tool: string, input: Record<string, unknown>, n = "Sfken") => executeTool(tool, { tripId, ...input }, who(n));
const res = async (tool: string, input: Record<string, unknown>, n = "Sfken") => (await run(tool, input, n)).result;
const rows = () => prisma.tripExpense.findMany({ where: { tripId }, orderBy: { createdAt: "asc" } });
const kept: Record<string, string> = {};

beforeAll(async () => {
  forgetRates();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    const url = String(input);
    if (url.includes("open.er-api.com")) return new Response(JSON.stringify({ result: "success", time_last_update_utc: "Sun, 22 Nov 2026 00:02:31 +0000", base_code: "USD", rates: { USD: 1, JPY: 160, VND: 25000, KHR: 4000 } }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
  for (const n of ["Sfken", "Sflarisa", "Sfandy", "Sfjo", "Sfout"]) {
    const t = (await prisma.traveler.findFirst({ where: { displayName: n } })) || await prisma.traveler.create({ data: { displayName: n } });
    ids[n] = t.id;
  }
  const old = await prisma.trip.findMany({ where: { name: { in: ["SF Families", "SF Couples"] } }, select: { id: true } });
  for (const t of old) await prisma.trip.delete({ where: { id: t.id } }).catch(() => {});
  const trip = async (name: string) => {
    const id = (await prisma.trip.create({ data: { name, status: "archived", timeZone: VN, startDate: at0(plus(today, -10)), endDate: at0(plus(today, 15)), datesKnown: true } })).id;
    let d = 1;
    for (const n of ["Sfken", "Sflarisa", "Sfandy", "Sfjo"]) await prisma.tripMember.create({ data: { tripId: id, travelerId: ids[n], role: n === "Sfken" ? "planner" : "member", joinedAt: new Date(`2031-01-0${d++}`) } });
    return id;
  };
  tripId = await trip("SF Families");
  couples = await trip("SF Couples");
  await prisma.guideSnapshot.create({ data: { tripId, sourceName: "The plan", sourceKind: "wander_plan", contentHash: `sf-plan-${Math.random()}`, status: "current", tabs: [] as any, importedBy: "test" } });
  const cities: [string, string, string, string][] = [["Sf Town A", "Vietnam", VN, today], ["Sf Town B", "Cambodia", "Asia/Phnom_Penh", inCambodia], ["Sf Town C", "Japan", "Asia/Tokyo", inJapan]];
  for (const [n, [name, country, timeZone, date]] of cities.entries()) {
    const c = await prisma.city.create({ data: { tripId, name, country, timeZone, sequenceOrder: n, planKey: `sf-${n}` } });
    await prisma.day.create({ data: { tripId, cityId: c.id, date: at0(date), dayType: "free" } });
  }
  const whole = [plus(today, -10), plus(today, 15)], late = [plus(today, -2), plus(today, 1)];
  const people: [string, number, string, string[]][] = [
    ["Sfken", 1, F1, whole], ["Sflarisa", 1, F1, whole], ["Sfkid", 1, F1, [plus(today, -4), plus(today, 15)]],
    ["Sfandy", 2, F2, late], ["Sfjulie", 2, F2, late], ["Sfjo", 2, F2, late],
    ["Sfpat", 3, F3, late], ["Sfsam", 3, F3, late], ["Sfx", 3, F3, late], ["Sfy", 3, F3, late],
  ];
  for (const [i, [name, family, familyLabel, [abroadFrom, abroadTo]]] of people.entries())
    await prisma.tripPerson.create({ data: { tripId, name, family, familyLabel, abroadFrom, abroadTo, sortOrder: i } });
});
afterAll(async () => {
  vi.restoreAllMocks();
  forgetRates();
  for (const id of [tripId, couples]) if (id) await prisma.trip.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

describe("keeping a payment in words", () => {
  it("P1: 'we paid 2,500,000 dong for dinner' is kept in dong for the talker's family, with its dollars and who pays next", async () => {
    const r = await run("add_expense", { paidBy: "we", amount: 2500000, currency: "VND", what: "dinner" }, "Sfandy");
    // (its day as Scout says it: "today", never the bare date beside it — "on today, Thu, Dec 31", the Nov 24 exam)
    expect(r.result).toMatchObject({ kept: true, paidBy: F2, day: "today", amount: "2,500,000 ₫", for: "everyone on the trip that day (10 people)", whoPaysNext: F3 });
    expect(r.result.inDollars).toBe("$100.00 at 25,000 ₫ to the dollar, the rate on Nov 22");
    expect(r.result.toBeEven).toEqual([`${F3} would pay ${F2} $40.00.`, `${F1} would pay ${F2} $30.00.`]);
    expect(r.result.noOneThatDay).toBeUndefined();
    expect(typeof r.result.id).toBe("string");   // (the receipt photo is kept with the payment by this id)
    expect(r.actionDescription).toBe(`Kept: ${F2} paid 2,500,000 ₫`);
    kept.p1 = r.result.id;
    const row = await prisma.tripExpense.findUnique({ where: { id: kept.p1 } });
    expect(row).toMatchObject({ currency: "VND", amount: 2500000, usdCents: 10000, family: 2, party: F2, paidByName: "Sfandy", what: "dinner", dayDate: today, addedByName: "Sfandy", addedById: ids.Sfandy });
    expect(row!.forPeople).toBeNull();
    // (never the couples' words on this trip)
    expect(JSON.stringify(r.result)).not.toMatch(/couple|half each|¥|yen/i);
  });

  it("P2: someone else's payment in dollars, for the people named", async () => {
    const r = await res("add_expense", { paidBy: "Sfpat", amount: 60, currency: "USD", what: "boat", forPeople: ["Sfken", "Sfx", "Sfy"] }, "Sflarisa");
    expect(r).toMatchObject({ kept: true, paidBy: F3, amount: "$60.00", for: "Sfken, Sfx, Sfy", whoPaysNext: F1 });
    expect(r.inDollars).toBeUndefined();
    expect(r.toBeEven).toEqual([`${F1} would pay ${F2} $50.00.`, `${F3} would pay ${F2} $20.00.`]);
    kept.p2 = r.id;
    const row = await prisma.tripExpense.findUnique({ where: { id: kept.p2 } });
    expect(row).toMatchObject({ currency: "USD", amount: 60, usdCents: 6000, family: 3, paidByName: "Sfpat", addedByName: "Sflarisa" });
    expect(row!.forPeople).toEqual(["Sfken", "Sfx", "Sfy"]);
  });

  it("P3: riel on a day in Cambodia", async () => {
    const r = await res("add_expense", { paidBy: "I", amount: 40000, currency: "riel", date: inCambodia }, "Sflarisa");
    expect(r).toMatchObject({ kept: true, paidBy: F1, day: asDay(inCambodia), amount: "40,000 ៛", inDollars: "$10.00 at 4,000 ៛ to the dollar, the rate on Nov 22", whoPaysNext: F1 });
    expect(r.toBeEven).toEqual([`${F1} would pay ${F2} $43.00.`, `${F3} would pay ${F2} $24.00.`]);
    kept.p3 = r.id;
  });

  it("P4: a number with no money said is yen on a day in Japan, and changes nothing when only the payer's family is there", async () => {
    const r = await res("add_expense", { paidBy: "we", amount: 16000, date: inJapan, what: "ramen" });
    expect(r).toMatchObject({ kept: true, paidBy: F1, amount: "¥16,000", inDollars: "$100.00 at ¥160 to the dollar, the rate on Nov 22", for: "everyone on the trip that day (3 people)", whoPaysNext: F1 });
    expect(r.note).toBe(`Only ${F1}'s people were on the trip that day, so it changes nothing between the families.`);
    expect(r.toBeEven).toEqual([`${F1} would pay ${F2} $43.00.`, `${F3} would pay ${F2} $24.00.`]);
    kept.p4 = r.id;
    expect(await prisma.tripExpense.findUnique({ where: { id: kept.p4 } })).toMatchObject({ currency: "JPY", amount: 16000, usdCents: 10000 });
  });

  it("P5: 'me' in who it was for is the person talking; a family's name stands for its people", async () => {
    const r = await res("add_expense", { paidBy: "I", amount: 10.02, currency: "dollars", forPeople: ["me", "Sfkid", "Sfx"] }, "Sfjo");
    expect(r).toMatchObject({ kept: true, paidBy: F2, amount: "$10.02", for: "Sfjo, Sfkid, Sfx", whoPaysNext: F1 });
    expect(r.toBeEven).toEqual([`${F1} would pay ${F2} $46.34.`, `${F3} would pay ${F2} $27.34.`]);
    kept.p5 = r.id;
    const fam = await res("add_expense", { paidBy: "Sfjo", amount: 9, currency: "USD", forPeople: [F3], what: "family three's tickets" }, "Sfjo");
    expect(fam).toMatchObject({ kept: true, for: "Sfpat, Sfsam, Sfx, Sfy" });
    // (taken away again, so the figures above stand for what follows)
    expect((await res("remove_expense", { id: fam.id }, "Sfjo")).removed).toBe(true);
  });
});

describe("a number with no money said is never guessed outside Japan", () => {
  it("asks dong or dollars in Vietnam, riel or dollars in Cambodia, and which money on a day that isn't the trip's; nothing is kept", async () => {
    const before = (await rows()).length;
    expect(await res("add_expense", { paidBy: "we", amount: 500 })).toEqual({ kept: false, question: "Was that in dong or US dollars? Nothing is kept yet." });
    expect(await res("add_expense", { paidBy: "we", amount: 500, date: inCambodia })).toEqual({ kept: false, question: "Was that in riel or US dollars? Nothing is kept yet." });
    expect(await res("add_expense", { paidBy: "we", amount: 500, date: noDay })).toEqual({ kept: false, question: "Which money was it in? Wander keeps dong, riel, yen and US dollars. Nothing is kept yet." });
    expect(await res("add_expense", { paidBy: "we", amount: 500, currency: "  " })).toEqual({ kept: false, question: "Was that in dong or US dollars? Nothing is kept yet." });
    expect((await rows()).length).toBe(before);
  });
  it("a money Wander doesn't keep is never kept as another one", async () => {
    const before = await rows();
    expect(await res("add_expense", { paidBy: "we", amount: 40, currency: "EUR" })).toEqual({ kept: false, question: "Wander keeps dong, riel, yen and US dollars, so nothing was kept." });
    expect(await res("add_expense", { paidBy: "we", amount: 40, currency: "baht", date: inJapan })).toEqual({ kept: false, question: "Wander keeps dong, riel, yen and US dollars, so nothing was kept." });
    expect(await res("change_expense", { id: kept.p1, amount: 40, currency: "EUR" }, "Sfandy")).toEqual({ changed: false, question: "Wander keeps dong, riel, yen and US dollars, so nothing was changed." });
    expect(await rows()).toEqual(before);
  });
});

describe("what can't be kept is asked about, and nothing is written", () => {
  it("who paid, who it was for, an amount that isn't one, a payment all the payer's own", async () => {
    const before = (await rows()).length;
    const ask = async (input: Record<string, unknown>, n = "Sfken") => res("add_expense", { currency: "USD", amount: 20, paidBy: "we", ...input }, n);
    expect(await ask({ paidBy: "Zed" })).toEqual({ kept: false, question: `Which family paid? ${F1}, ${F2}, ${F3}` });
    expect(await ask({ paidBy: "" })).toEqual({ kept: false, question: `Which family paid? ${F1}, ${F2}, ${F3}` });
    expect(await ask({ paidBy: "Sfken and Sfandy" })).toEqual({ kept: false, question: `Which family paid? ${F1}, ${F2}, ${F3}` });
    expect(await ask({ forPeople: ["Sfx", "Zed"] })).toEqual({ kept: false, question: "Who is it for? Zed isn't on this trip." });
    expect(await ask({ forPeople: ["Sflarisa", "Sfkid"] })).toEqual({ kept: false, question: `That's all ${F1}'s own, so there's nothing to share. Who else was it for?` });
    expect(await ask({ forPeople: ["us"] })).toEqual({ kept: false, question: `That's all ${F1}'s own, so there's nothing to share. Who else was it for?` });
    for (const amount of [0, -5, NaN, "lots", 1e12, undefined]) expect(await ask({ amount }), String(amount)).toEqual({ kept: false, question: "That amount doesn't look right. How much was it?" });
    expect(await ask({ amount: 0.001 })).toEqual({ kept: false, question: "That amount doesn't look right. How much was it?" });
    expect((await rows()).length).toBe(before);
  });
  it("a day no one was on the trip is kept, and said, so the day can be asked about", async () => {
    const r = await res("add_expense", { paidBy: "Sfandy", amount: 12, currency: "USD", date: longAgo, what: "early taxi" }, "Sfandy");
    expect(r).toMatchObject({ kept: true, paidBy: F2, day: asDay(longAgo), for: "no one yet" });
    expect(r.noOneThatDay).toBe(`No one was on the trip on ${asDay(longAgo)}, so it counts for ${F2} alone until its day or who it was for is given. Ask which day it was.`);
    expect(JSON.stringify({ d: r.day, n: r.noOneThatDay })).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    kept.early = r.id;
    const so = await res("money_so_far", {});
    expect(so.check).toEqual([`$12.00 (early taxi), paid by ${F2} on ${asDay(longAgo)}: no one was on the trip that day`]);
    // its day put right: it's shared by the ten of today, and is then taken away so the figures above stand
    const fixed = await res("change_expense", { id: kept.early, date: today }, "Sfandy");
    expect(fixed.nowInDollars).toBeUndefined();   // (a day changed, in dollars: no new dollars to say)
    expect(fixed.changed).toContain(`changed its day: ${asDay(longAgo)} → ${asDay(today)}`);
    expect(fixed.changed).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect((await res("money_so_far", {})).check).toBeUndefined();
    expect((await res("remove_expense", { id: kept.early }, "Sfandy")).removed).toBe(true);
  });
  it("someone who isn't on the trip gets nothing, on any of the five", async () => {
    for (const tool of ["add_expense", "remove_expense", "put_back_expense", "change_expense", "money_so_far"])
      expect(await res(tool, { id: kept.p1, paidBy: "Sfken", amount: 5, currency: "USD" }, "Sfout"), tool).toEqual({ error: "That trip isn't one of yours." });
    expect((await executeTool("money_so_far", { tripId: "" }, who("Sfken"))).result).toEqual({ error: "That trip isn't one of yours." });
  });
});

describe("where things stand", () => {
  it("money_so_far: who pays next, what would make the families even in dollars, the families, each payment with its id", async () => {
    const r = await res("money_so_far", {}, "Sflarisa");
    expect(r.whoPaysNext).toBe(F1);
    expect(r.toBeEven).toEqual([`${F1} would pay ${F2} $46.34.`, `${F3} would pay ${F2} $27.34.`]);
    expect(r.families).toEqual({ [F1]: ["Sfken", "Sflarisa", "Sfkid"], [F2]: ["Sfandy", "Sfjulie", "Sfjo"], [F3]: ["Sfpat", "Sfsam", "Sfx", "Sfy"] });
    expect(r.yourFamily).toBe(F1);
    expect(r.paid).toEqual({ [F1]: "$110.00", [F2]: "$110.02", [F3]: "$60.00" });
    expect(r.payments.map((p: any) => p.id)).toEqual([kept.p5, kept.p4, kept.p3, kept.p2, kept.p1]);
    const p1 = r.payments.find((p: any) => p.id === kept.p1);
    expect(p1).toMatchObject({ paidBy: `${F2} (Sfandy)`, amount: "2,500,000 ₫", dollars: "$100.00", for: "everyone on the trip that day (10 people)", what: "dinner", day: "today", keptBy: "Sfandy", youMayRemove: false });
    expect(r.payments.find((p: any) => p.id === kept.p3).day).toBe(asDay(inCambodia));
    expect(JSON.stringify(r.payments.map((p: any) => p.day))).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // (who kept it may change it, and so may the trip's first member)
    expect(r.payments.find((p: any) => p.id === kept.p2)).toMatchObject({ amount: "$60.00", for: "Sfken, Sfx, Sfy", keptBy: "Sflarisa", youMayRemove: true });
    expect((await res("money_so_far", {}, "Sfken")).payments.every((p: any) => p.youMayRemove)).toBe(true);
    expect((await res("money_so_far", {}, "Sfjo")).yourFamily).toBe(F2);
    expect(r.takenAway.length).toBe(2);   // (the two taken away above, newest first)
    expect(r.takenAway[0]).toMatchObject({ id: kept.early, paidBy: F2, amount: "$12.00", what: "early taxi", keptBy: "Sfandy" });
    expect(r.say).toMatch(/who pays next/);
    expect(JSON.stringify(r)).not.toMatch(/couple|half each/i);
  });
});

describe("changing, taking away, putting back", () => {
  it("only who kept it, or the trip's first member, can", async () => {
    expect(await res("change_expense", { id: kept.p1, amount: 2000000 }, "Sfjo")).toEqual({ error: "Only whoever kept that payment, or Ken, can change it." });
    expect(await res("remove_expense", { id: kept.p1 }, "Sfjo")).toEqual({ error: "Only whoever kept that payment, or Ken, can take it away." });
    expect(await res("put_back_expense", { id: kept.early }, "Sfjo")).toEqual({ error: "Only whoever kept that payment, or Ken, can put it back." });
    expect((await prisma.tripExpense.findUnique({ where: { id: kept.p1 } }))!.amount).toBe(2500000);
  });
  it("an id that isn't there says so", async () => {
    expect(await res("change_expense", { id: "nope", amount: 5 })).toEqual({ error: "That payment isn't there — look at money_so_far for its id." });
    expect(await res("remove_expense", { id: "nope" })).toEqual({ error: "That payment isn't there — look at money_so_far for its id." });
    expect(await res("put_back_expense", { id: "nope" })).toEqual({ error: "That payment isn't there — look at money_so_far's takenAway list for its id." });
    expect(await res("change_expense", {})).toEqual({ error: "That payment isn't there — look at money_so_far for its id." });
  });
  it("the amount in the same money keeps the rate it was kept with; the trip's first member may change another's", async () => {
    const r = await run("change_expense", { id: kept.p1, amount: 2000000 }, "Sfken");
    // $80 → 1: $24, 2: $24, 3: $32. paid 2: $90.02. owed 1: −$40.34, 2: +$59.68, 3: −$19.34
    expect(r.result.changed).toBe("changed 2,500,000 ₫ → 2,000,000 ₫");
    // (a new amount that isn't dollars comes with its dollars now, to say: the Nov 24 exam's "Changed to 90,000 ៛" gave none)
    expect(r.result.nowInDollars).toBe("$80.00");
    expect(r.result.say).toMatch(/nowInDollars/);
    expect(r.result).toMatchObject({ whoPaysNext: F1, toBeEven: [`${F1} would pay ${F2} $40.34.`, `${F3} would pay ${F2} $19.34.`] });
    expect(r.actionDescription).toBe("Changed: changed 2,500,000 ₫ → 2,000,000 ₫");
    expect(await prisma.tripExpense.findUnique({ where: { id: kept.p1 } })).toMatchObject({ amount: 2000000, usdCents: 8000, rate: 25000 });
    // and back
    expect((await res("change_expense", { id: kept.p1, amount: 2500000 }, "Sfandy")).toBeEven).toEqual([`${F1} would pay ${F2} $46.34.`, `${F3} would pay ${F2} $27.34.`]);
  });
  it("who paid, who it was for, what for and its day, giving only what changes", async () => {
    // P2 becomes family 1's ("that was me"), for everyone: $60 over ten = 18 / 18 / 24
    // paid 1: $170.00 2: $110.02 3: $0 · share 1: $154.34 2: $54.34 3: $71.34 · owed 1: +$15.66 2: +$55.68 3: −$71.34
    const r = await res("change_expense", { id: kept.p2, paidBy: "me", forPeople: "everyone", what: "boat ride" }, "Sflarisa");
    expect(r.changed).toContain(`changed who paid: ${F3} → ${F1}`);
    expect(r.changed).toContain("changed what it was for to “boat ride”");
    expect(r.changed).toContain("changed who it's for: Sfken, Sfx, Sfy → everyone there that day");
    expect(r).toMatchObject({ whoPaysNext: F3, toBeEven: [`${F3} would pay ${F2} $55.68 and ${F1} $15.66.`] });
    // and back, by the same person
    const back = await res("change_expense", { id: kept.p2, paidBy: "Sfpat", forPeople: ["Sfken", "Sfx", "Sfy"], what: "boat" }, "Sflarisa");
    expect(back.toBeEven).toEqual([`${F1} would pay ${F2} $46.34.`, `${F3} would pay ${F2} $27.34.`]);
    // a new money needs its amount; the same thing said again changes nothing
    expect(await res("change_expense", { id: kept.p2, currency: "VND" }, "Sflarisa")).toEqual({ changed: false, question: "How much was it in that money?" });
    expect((await res("change_expense", { id: kept.p2, what: "boat" }, "Sflarisa")).changed).toBe("nothing to change — it already says that");
    // (the couples' "that's right" isn't this trip's: alone, it changes nothing)
    expect((await res("change_expense", { id: kept.p2, thatsRight: true }, "Sflarisa")).changed).toBe("nothing to change — it already says that");
    expect(await res("change_expense", { id: kept.p2, date: "next week" }, "Sflarisa")).toEqual({ changed: false, question: "Which day was it?" });
  });
  it("taken away and put back, and put back twice", async () => {
    const off = await run("remove_expense", { id: kept.p5 }, "Sfjo");
    // without P5: owed 1: −$43, 2: +$67, 3: −$24
    expect(off.result).toMatchObject({ removed: true, whoPaysNext: F1, toBeEven: [`${F1} would pay ${F2} $43.00.`, `${F3} would pay ${F2} $24.00.`] });
    expect(off.actionDescription).toBe("Payment taken away");
    expect(await res("remove_expense", { id: kept.p5 }, "Sfjo")).toEqual({ error: "That payment isn't there — look at money_so_far for its id." });
    const on = await run("put_back_expense", { id: kept.p5 }, "Sfken");
    expect(on.result).toMatchObject({ putBack: `${F2}, $10.02`, whoPaysNext: F1, toBeEven: [`${F1} would pay ${F2} $46.34.`, `${F3} would pay ${F2} $27.34.`] });
    expect(on.actionDescription).toBe("Payment put back");
    expect((await res("put_back_expense", { id: kept.p5 }, "Sfjo")).already).toBe("It already counts — it was never taken away, or someone put it back.");
  });
  it("when every family is within a dollar, no one is told to pay next", async () => {
    // family 1 pays family 2 $46.34 and family 3 pays family 2 $27.34, as payments for family 2's people alone
    const a = await res("add_expense", { paidBy: "Sfken", amount: 46.34, currency: "USD", forPeople: [F2], what: "settling" });
    const b = await res("add_expense", { paidBy: "Sfpat", amount: 27.34, currency: "USD", forPeople: [F2], what: "settling" });
    expect(b).toMatchObject({ kept: true, whoPaysNext: "no one: the families are within a dollar of even", toBeEven: "even" });
    for (const id of [a.id, b.id]) expect((await res("remove_expense", { id })).removed).toBe(true);
  });
});

describe("convert_money: 'how much is 500,000 dong?'", () => {
  it("each way, at the rate a person can check by hand, and keeps nothing", async () => {
    const before = (await rows()).length;
    expect(await res("convert_money", { amount: 500000, from: "VND" })).toMatchObject({ amount: "500,000 ₫", is: "$20.00", rate: "25,000 ₫ to the dollar, the rate on Nov 22" });
    expect(await res("convert_money", { amount: 40, from: "dollars", to: "riel" })).toMatchObject({ amount: "$40.00", is: "160,000 ៛", rate: "4,000 ៛ to the dollar, the rate on Nov 22" });
    // (dollars with no money to turn them into: the money of today's country, Vietnam)
    expect(await res("convert_money", { amount: 40, from: "USD" })).toMatchObject({ amount: "$40.00", is: "1,000,000 ₫" });
    // (between two of them: through dollars, rounded once)
    expect(await res("convert_money", { amount: 16000, from: "yen", to: "dong" })).toMatchObject({ amount: "¥16,000", is: "2,500,000 ₫", rate: "¥160 to the dollar and 25,000 ₫ to the dollar, the rates on Nov 22" });
    expect((await res("convert_money", { amount: 500000, from: "VND" })).say).toMatch(/about/);
    expect((await rows()).length).toBe(before);
  });
  it("says what it can't do", async () => {
    expect(await res("convert_money", { amount: 40, from: "EUR" })).toEqual({ error: "Wander has rates for dong, riel, yen and US dollars only." });
    expect(await res("convert_money", { amount: 40, from: "USD", to: "baht" })).toEqual({ error: "Wander has rates for dong, riel, yen and US dollars only." });
    expect(await res("convert_money", { amount: 40, from: "USD", to: "USD" })).toEqual({ error: "That's the same money." });
    for (const amount of [0, -1, NaN, "some", undefined]) expect(await res("convert_money", { amount, from: "VND" }), String(amount)).toEqual({ error: "How much? Give the amount as a number." });
    // (dollars, no money named, and no day of the trip to say which country: asks)
    expect((await executeTool("convert_money", { tripId: couples, amount: 40, from: "USD" }, who("Sfken"))).result).toEqual({ question: "Into which money: dong, riel or yen?" });
  });
  it("a round figure is said to be rough when no recent rate could be had", async () => {
    forgetRates();
    const down = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("no", { status: 503 }));
    const r = await res("convert_money", { amount: 250000, from: "VND" });
    expect(r).toMatchObject({ amount: "250,000 ₫", is: "$10.00", rate: "about 25,000 ₫ to the dollar, a rough figure: Wander couldn't get a recent rate" });
    down.mockImplementation(async (input: any) => String(input).includes("open.er-api.com")
      ? new Response(JSON.stringify({ result: "success", time_last_update_utc: "Sun, 22 Nov 2026 00:02:31 +0000", base_code: "USD", rates: { USD: 1, JPY: 160, VND: 25000, KHR: 4000 } }), { status: 200 })
      : new Response("{}", { status: 200 }));
    forgetRates();
  });
});

describe("what Scout is told on a families' trip", () => {
  const base = "First paragraph.\n\n- Every date in the Guide is a Japan date.\n";
  it("the prompt: the families' rule 61 in place of the couples', and the families' Money line", async () => {
    sentToModel.length = 0;
    const tok = signToken({ code: "Sfken", displayName: "Sfken", travelerId: ids.Sfken });
    const r = await request(app).post("/api/chat").set("Authorization", `Bearer ${tok}`).send({
      message: "Hello", context: { page: "Home", tripId }, history: [],
      clientTime: { iso: new Date().toISOString(), localDate: today, localTime: "9:00 AM", weekday: "Monday", timeZone: VN },
    });
    expect(r.status).toBe(200);
    const system = sentToModel[0].system.map((s: any) => s.text).join("\n");
    expect(system).toContain("THIS TRIP IS BUILT FROM A PLAN");
    expect(system).toContain("\n61. Who pays next, on a trip of families");
    expect(system).toContain("- Money: this trip's Budget is kept by family.");
    expect(system).toContain("convert_money");
    expect(system).toContain("forPeople");
    for (const gone of ["Wander keeps yen and US dollars only so far", "one couple pays for something", "forCouple", "half and half", "It's shared by the two couples", "合計"]) expect(system, gone).not.toContain(gone);
    // (one rule 61, and the rules around it untouched)
    expect(system.match(/\n61\. /g)!.length).toBe(1);
    expect(system).toMatch(/\n60\. /);
    expect(system).toMatch(/\n62\. /);
    const tools = sentToModel[0].tools as any[];
    const tool = (n: string) => tools.find((t) => t.name === n);
    const add = tool("add_expense").input_schema.properties;
    expect(Object.keys(add)).toEqual(["tripId", "paidBy", "amount", "currency", "what", "date", "forPeople", "receipt"]);
    expect(add.currency.enum).toBeUndefined();
    expect(add.forPeople).toMatchObject({ type: "array", items: { type: "string" } });
    expect(Object.keys(tool("change_expense").input_schema.properties)).toEqual(["tripId", "id", "amount", "currency", "paidBy", "what", "forPeople", "date"]);
    expect(tool("convert_money").input_schema.required).toEqual(["tripId", "amount", "from"]);
    for (const n of ["add_expense", "change_expense", "money_so_far"]) expect(JSON.stringify(tool(n)), n).not.toMatch(/couple|half each|forCouple|thatsRight/i);
    // (every other tool is the plan trip's, word for word)
    const planOnes = planTools(scoutTools as any[]) as any[];
    for (const t of planOnes) if (!["add_expense", "change_expense", "money_so_far"].includes(t.name)) expect(tool(t.name), t.name).toEqual(t);
    expect(tools.length).toBe(planOnes.length + 1);
  });
  it("the shared tools and the plan trip's are never touched by it", () => {
    const shared = JSON.stringify(scoutTools), plan = planTools(scoutTools as any[]);
    const planWas = JSON.stringify(plan);
    const fam = familyTools(plan as any[]) as any[];
    expect(JSON.stringify(scoutTools)).toBe(shared);
    expect(JSON.stringify(plan)).toBe(planWas);
    expect(fam.find((t) => t.name === "convert_money")).toBeTruthy();
    expect((plan as any[]).find((t) => t.name === "convert_money")).toBeUndefined();
    expect((scoutTools as any[]).find((t) => t.name === "convert_money")).toBeUndefined();
  });
  it("\"who is on this trip?\" has an answer: the prompt sends Scout to money_so_far, which names every family's people", async () => {
    // (Nov 24 exam, H2: with the ten in Wander, Scout told Larisa "Wander doesn't hold the full list of travelers yet")
    sentToModel.length = 0;
    const tok = signToken({ code: "Sflarisa", displayName: "Sflarisa", travelerId: ids.Sflarisa });
    const sent = await request(app).post("/api/chat").set("Authorization", `Bearer ${tok}`).send({
      message: "Who is on this trip?", context: { page: "Home", tripId }, history: [],
      clientTime: { iso: new Date().toISOString(), localDate: today, localTime: "9:00 AM", weekday: "Monday", timeZone: VN },
    });
    expect(sent.status).toBe(200);
    const p: string = sentToModel[0].system.map((s: any) => s.text).join("\n");
    expect(p).toMatch(/- Who is on this trip[^\n]*: Wander holds the list\. Call\s+money_so_far/);
    expect(p).toMatch(/Never say Wander\s+doesn't hold the list/);
    expect(p).toMatch(/gives no arrival, departure or flight/);
    expect(p).toContain("\n- Past, now and ahead come from RIGHT NOW.");
    const r = (await executeTool("money_so_far", { tripId }, who("Sflarisa"))).result;
    expect(Object.keys(r.families)).toEqual([F1, F2, F3]);
    expect(Object.values(r.families).flat().length).toBe(10);
    expect(r.families[F1]).toContain("Sflarisa");
  });
  it("it says so loudly when the prompt or a tool no longer has the spots it is made from", () => {
    // (a prompt with no Money line, then one with the Money line and no rule 61)
    expect(() => familySystemPrompt(base)).toThrow(/no longer has/);
    expect(() => familySystemPrompt(`${base}- Money: Wander keeps yen and US dollars only so far. Ask.\n- Past, now and ahead come from RIGHT NOW.\n`)).toThrow(/no longer has/);
    expect(() => familyTools([{ name: "add_expense", description: "x", input_schema: { type: "object", properties: { tripId: {} } } }] as any[])).toThrow(/no longer has/);
  });
  it("a couples' trip (no families) keeps the couples' Budget in Scout's words", async () => {
    const r = (await executeTool("money_so_far", { tripId: couples }, who("Sfken"))).result;
    expect(r.families).toBeUndefined();
    expect(r.say).toMatch(/other couple/);
  });
});
