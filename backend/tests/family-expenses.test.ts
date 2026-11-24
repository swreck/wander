/**
 * BUDGET ON A FAMILIES' TRIP (Nov 22 2026). Ken (Nov 16): "dollars as the common unit, the three families as payers,
 * shared costs split per person", "plus a currency pop-up on entering and viewing an expense, at recent rates."
 * And: the youngest "is treated as an adult. she might absolutely pay for something".
 *
 * Every figure below was worked out by hand before the code ran, at round rates the test's stand-in source gives:
 * 25,000 dong, 4,000 riel and 160 yen to the dollar.
 *
 *   The people (invented): family 1 Feken, Felarisa (abroad the whole trip) and Fekid (from four days ago);
 *   family 2 Feandy, Fejulie, Fejo; family 3 Fepat, Fesam, Fex, Fey (families 2 and 3 from two days ago).
 *
 *   P1 Feandy, 2,500,000 dong, today, everyone (10)      = $100.00 → 1: $30   2: $30   3: $40
 *   P2 Fepat & Fesam, $60, today, for Feken, Fex, Fey    = $60.00  → 1: $20            3: $40
 *   P3 Felarisa, 40,000 riel, today, everyone            = $10.00  → 1: $3    2: $3    3: $4
 *   P4 Feken, 16,000 yen, six days ago (family 1 only)   = $100.00 → 1: $100
 *   P5 Fejo, $10.02, today, for Fejo, Fekid, Fex         = $10.02  → 1: $3.34 2: $3.34 3: $3.34
 *   paid   1: $110.00  2: $110.02  3: $60.00
 *   share  1: $156.34  2: $36.34   3: $87.34
 *   owed   1: −$46.34  2: +$73.68  3: −$27.34   → family 1 pays next; 1 → 2 $46.34 and 3 → 2 $27.34 make it even
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-family-expenses";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { forgetRates } = await import("../src/services/rates.js");
const { tripToday } = await import("../src/services/dayCountry.js");
const prisma = new PrismaClient();

const F1 = "Feken & Felarisa", F2 = "Feandy & Fejulie", F3 = "Fepat & Fesam";
const sourceGives = (rates: Record<string, number>) => {
  forgetRates();
  vi.stubGlobal("fetch", (async () => ({ ok: true, json: async () => ({ result: "success", time_last_update_utc: "Sun, 22 Nov 2026 00:02:31 +0000", base_code: "USD", rates: { USD: 1, ...rates } }) })) as unknown as typeof fetch);
};
const plus = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

let tripId = "", couplesTrip = "", planTrip = "", today = "";
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const at = (trip: string) => `/api/expenses/trip/${trip}`;
const add = (n: string, body: Record<string, unknown>, trip = tripId) => request(app).post(at(trip)).set("Authorization", `Bearer ${tok[n]}`).send(body);
const patch = (n: string, id: string, body: Record<string, unknown>, trip = tripId) => request(app).patch(`${at(trip)}/${id}`).set("Authorization", `Bearer ${tok[n]}`).send(body);
const del = (n: string, id: string) => request(app).delete(`${at(tripId)}/${id}`).set("Authorization", `Bearer ${tok[n]}`);
const back = (n: string, id: string) => request(app).post(`${at(tripId)}/${id}/back`).set("Authorization", `Bearer ${tok[n]}`);
const read = async (n = "Feken", trip = tripId) => (await request(app).get(at(trip)).set("Authorization", `Bearer ${tok[n]}`)).body;
const fam = async (n = "Feken") => (await read(n)).family;
const item = async (what: string) => (await fam()).items.find((i: any) => i.what === what);

beforeAll(async () => {
  sourceGives({ JPY: 160, VND: 25000, KHR: 4000 });
  for (const n of ["Feken", "Felarisa", "Feandy", "Fejo"]) {
    const t = (await prisma.traveler.findFirst({ where: { displayName: n } })) || await prisma.traveler.create({ data: { displayName: n } });
    ids[n] = t.id; tok[n] = signToken({ code: n, displayName: n, travelerId: t.id });
  }
  const trip = async (name: string) => {
    const id = (await prisma.trip.create({ data: { name, status: "archived", timeZone: "Asia/Ho_Chi_Minh", startDate: new Date("2031-12-14"), endDate: new Date("2032-01-08") } })).id;
    let d = 1;
    for (const n of ["Feken", "Felarisa", "Feandy", "Fejo"]) await prisma.tripMember.create({ data: { tripId: id, travelerId: ids[n], role: n === "Feken" ? "planner" : "member", joinedAt: new Date(`2031-01-0${d++}`) } });
    return id;
  };
  tripId = await trip("FE Families");
  couplesTrip = await trip("FE Couples");
  planTrip = await trip("FE Plan, no families yet");
  await prisma.guideSnapshot.create({ data: { tripId: planTrip, sourceName: "fe-plan", sourceKind: "wander_plan", contentHash: "fe-plan", status: "current", tabs: [] } });
  today = await tripToday(tripId);
  const whole = [plus(today, -10), plus(today, 15)], late = [plus(today, -2), plus(today, 5)];
  const people: [string, number, string, string[]][] = [
    ["Feken", 1, F1, whole], ["Felarisa", 1, F1, whole], ["Fekid", 1, F1, [plus(today, -4), plus(today, 15)]],
    ["Feandy", 2, F2, late], ["Fejulie", 2, F2, late], ["Fejo", 2, F2, late],
    ["Fepat", 3, F3, late], ["Fesam", 3, F3, late], ["Fex", 3, F3, late], ["Fey", 3, F3, late],
  ];
  for (const [i, [name, family, familyLabel, [abroadFrom, abroadTo]]] of people.entries())
    await prisma.tripPerson.create({ data: { tripId, name, family, familyLabel, abroadFrom, abroadTo, sortOrder: i } });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  for (const id of [tripId, couplesTrip, planTrip]) await prisma.trip.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

describe("the families and their people", () => {
  it("an empty Budget names the three families, the ten people, who is abroad today, and whose family the asker is in", async () => {
    const f = await fam("Fejo");
    expect(f.unit).toBe("USD");
    expect(f.parties).toEqual([F1, F2, F3]);
    expect(f.people.map((p: any) => p.name)).toEqual(["Feken", "Felarisa", "Fekid", "Feandy", "Fejulie", "Fejo", "Fepat", "Fesam", "Fex", "Fey"]);
    expect(f.people.find((p: any) => p.name === "Fejo").party).toBe(F2);
    expect(f.today).toBe(today);
    expect(f.zone).toBe("Asia/Ho_Chi_Minh");
    expect(f.here).toEqual([F1, F2, F3]);
    expect(f.mine).toBe(F2);
    expect(f.paid).toEqual({ [F1]: 0, [F2]: 0, [F3]: 0 });
    expect(f.next).toBeNull();
    expect(f.settled).toBe(true);
    expect(f.items).toEqual([]);
  });
  it("the couples' fields stay empty, so an older Wander on a phone shows nothing rather than dollars as yen", async () => {
    const l = await read();
    expect(l.parties).toEqual([]); expect(l.items).toEqual([]); expect(l.totals).toEqual({});
    expect(l.next).toBeNull(); expect(l.owes).toBeNull(); expect(l.shared).toBe(0); expect(l.alone).toBe(0);
  });
});

describe("five payments, worked out by hand", () => {
  it("P1: one person pays in dong for everyone abroad that day", async () => {
    const r = await add("Feandy", { paidBy: "Feandy", amount: 2_500_000, currency: "VND", what: "p1 dinner", dayDate: today });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ party: F2, paidByName: "Feandy", amount: 2_500_000, currency: "VND", usd: 100, rate: 25000, rateDate: "2026-11-22", approx: false, forPeople: null, dayDate: today });
    const x = await item("p1 dinner");
    expect(x).toMatchObject({ party: F2, paidByName: "Feandy", usd: 100, everyone: true, forNobody: false, shares: { [F1]: 30, [F2]: 30, [F3]: 40 } });
    expect(x.forNames).toHaveLength(10);
    const row = await prisma.tripExpense.findUnique({ where: { id: r.body.id } });
    expect(row).toMatchObject({ family: 2, party: F2, usdCents: 10000, rate: 25000, rateDate: "2026-11-22", yen: 16000, forPeople: null, forParty: null });
  });
  it("P2: a family pays in dollars for three named people", async () => {
    const r = await add("Feken", { paidBy: F3, amount: 60, currency: "USD", what: "p2 boat", dayDate: today, forPeople: ["Feken", "Fex", "Fey"] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ party: F3, paidByName: null, usd: 60, rate: null, rateDate: null, forPeople: ["Feken", "Fex", "Fey"] });
    expect(await item("p2 boat")).toMatchObject({ everyone: false, forNames: ["Feken", "Fex", "Fey"], shares: { [F1]: 20, [F2]: 0, [F3]: 40 } });
  });
  it("P3: riel", async () => {
    const r = await add("Felarisa", { paidBy: "Felarisa", amount: 40_000, currency: "riel", what: "p3 tuk-tuk", dayDate: today });
    expect(r.body).toMatchObject({ party: F1, currency: "KHR", usd: 10, rate: 4000 });
    expect(await item("p3 tuk-tuk")).toMatchObject({ shares: { [F1]: 3, [F2]: 3, [F3]: 4 } });
  });
  it("P4: yen, on a day when only one family was abroad: kept, and all that family's own", async () => {
    const r = await add("Feken", { paidBy: "Feken", amount: 16_000, currency: "JPY", what: "p4 early", dayDate: plus(today, -6) });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ party: F1, usd: 100, rate: 160 });
    expect(await item("p4 early")).toMatchObject({ everyone: true, forNames: ["Feken", "Felarisa"], forNobody: false, shares: { [F1]: 100, [F2]: 0, [F3]: 0 } });
  });
  it("P5: the youngest pays for three of the young ones, a cent that doesn't split evenly left to nobody", async () => {
    const r = await add("Fejo", { paidBy: "Fejo", amount: 10.02, currency: "$", what: "p5 ice cream", dayDate: today, forPeople: "Fejo, Fekid and Fex" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ party: F2, paidByName: "Fejo", usd: 10.02, forPeople: ["Fejo", "Fekid", "Fex"] });
    expect(await item("p5 ice cream")).toMatchObject({ shares: { [F1]: 3.34, [F2]: 3.34, [F3]: 3.34 } });
  });
  it("the sum: what each family paid, what was its to pay, who is owed, who pays next, and what makes it even", async () => {
    const f = await fam();
    expect(f.paid).toEqual({ [F1]: 110, [F2]: 110.02, [F3]: 60 });
    expect(f.share).toEqual({ [F1]: 156.34, [F2]: 36.34, [F3]: 87.34 });
    expect(f.balance).toEqual({ [F1]: -46.34, [F2]: 73.68, [F3]: -27.34 });
    expect(f.next).toBe(F1);
    expect(f.settled).toBe(false);
    expect([...f.even].sort((a: any, b: any) => a.from.localeCompare(b.from))).toEqual([{ from: F1, to: F2, usd: 46.34 }, { from: F3, to: F2, usd: 27.34 }]);
    expect(f.items).toHaveLength(5);
    expect(f.rates.VND.rate).toBe(25000);
  });
  it("a payment that doesn't split to the cent still adds up to exactly what was paid", async () => {
    const r = await add("Feken", { paidBy: "Feken", amount: 10.01, currency: "USD", what: "odd cent", dayDate: today });
    const x = await item("odd cent");
    expect(Math.round((x.shares[F1] + x.shares[F2] + x.shares[F3]) * 100)).toBe(1001);
    expect((await del("Feken", r.body.id)).status).toBe(200);
    expect((await fam()).paid).toEqual({ [F1]: 110, [F2]: 110.02, [F3]: 60 });
  });
});

describe("what is asked, and what is refused", () => {
  const refused = async (n: string, body: Record<string, unknown>, words: RegExp) => {
    const before = (await fam()).items.length;
    const r = await add(n, { what: "never kept", dayDate: today, ...body });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(words);
    expect((await fam()).items.length).toBe(before);
  };
  it("nobody on the trip as the payer; people of two families as the payer; no payer", async () => {
    await refused("Feken", { paidBy: "Zed", amount: 5, currency: "USD" }, /Which family paid\? Feken & Felarisa, Feandy & Fejulie, Fepat & Fesam/);
    await refused("Feken", { paidBy: "Feken and Feandy", amount: 5, currency: "USD" }, /Which family paid/);
    await refused("Feken", { paidBy: "", amount: 5, currency: "USD" }, /Which family paid/);
  });
  it("two people of one family as the payer is that family", async () => {
    const r = await add("Feken", { paidBy: "Felarisa and Feken", amount: 0.1, currency: "USD", what: "two payers", dayDate: today });
    expect(r.body).toMatchObject({ party: F1, paidByName: null });
    await del("Feken", r.body.id);
  });
  it("no money named, or one Wander doesn't keep: asked, never guessed", async () => {
    await refused("Feken", { paidBy: "Feken", amount: 500 }, /Which money was it in\?/);
    await refused("Feken", { paidBy: "Feken", amount: 500, currency: "EUR" }, /Which money was it in\?/);
    await refused("Feken", { paidBy: "Feken", amount: 500, currency: "baht" }, /Which money was it in\?/);
  });
  it("an amount that isn't one: nothing, less than nothing, not a number, more than the most", async () => {
    for (const amount of [0, -5, "lots", 100_001]) await refused("Feken", { paidBy: "Feken", amount, currency: "USD" }, /doesn't look right/);
    await refused("Feken", { paidBy: "Feken", amount: 2_000_000_001, currency: "VND" }, /doesn't look right/);
    await refused("Feken", { paidBy: "Feken", amount: 300_000_001, currency: "KHR" }, /doesn't look right/);
    await refused("Feken", { paidBy: "Feken", amount: 10_000_001, currency: "JPY" }, /doesn't look right/);
  });
  it("so few dong it is under a cent", async () => {
    await refused("Feken", { paidBy: "Feken", amount: 100, currency: "VND" }, /under a cent/);
  });
  it("someone not on the trip in the list of who it was for", async () => {
    await refused("Feken", { paidBy: "Feken", amount: 5, currency: "USD", forPeople: ["Feandy", "Zed"] }, /Zed isn't on this trip/);
  });
  it("a family paying only for its own people: asked who else, as Japan's Budget asks", async () => {
    await refused("Feken", { paidBy: "Feken", amount: 5, currency: "USD", forPeople: ["Feken", "Fekid"] }, /all Feken & Felarisa's own.*Who else was it for\?/);
    await refused("Feken", { paidBy: "Feken", amount: 5, currency: "USD", forPeople: F1 }, /Who else was it for\?/);
  });
  it("'everyone' is everyone abroad that day; a family's name is its people", async () => {
    const a = await add("Feken", { paidBy: "Feken", amount: 1, currency: "USD", what: "for everyone", dayDate: today, forPeople: "everyone" });
    expect(a.body.forPeople).toBeNull();
    const b = await add("Feken", { paidBy: "Feken", amount: 1, currency: "USD", what: "for a family", dayDate: today, forPeople: [F2] });
    expect(b.body.forPeople).toEqual(["Feandy", "Fejulie", "Fejo"]);
    const c = await add("Feken", { paidBy: "Feken", amount: 1, currency: "USD", what: "said in one breath", dayDate: today, forPeople: "Feandy & Fejulie and Feken" });
    expect(c.body.forPeople).toEqual(["Feandy", "Fejulie", "Fejo", "Feken"]);
    await del("Feken", a.body.id); await del("Feken", b.body.id); await del("Feken", c.body.id);
  });
  it("a day when nobody was abroad: kept, the payer's own, and marked so someone can say who it was for", async () => {
    const r = await add("Feandy", { paidBy: "Feandy", amount: 80, currency: "USD", what: "deposit at home", dayDate: plus(today, -30) });
    expect(r.status).toBe(200);
    expect(await item("deposit at home")).toMatchObject({ everyone: true, forNames: [], forNobody: true, shares: { [F1]: 0, [F2]: 80, [F3]: 0 } });
    expect((await fam()).balance).toEqual({ [F1]: -46.34, [F2]: 73.68, [F3]: -27.34 });
    // said who it was for: all ten → 1: $24, 2: $24, 3: $32
    const all = (await fam()).people.map((p: any) => p.name);
    const p = await patch("Feandy", r.body.id, { forPeople: all });
    expect(p.status).toBe(200);
    expect(await item("deposit at home")).toMatchObject({ everyone: false, forNobody: false, shares: { [F1]: 24, [F2]: 24, [F3]: 32 } });
    expect((await fam()).balance).toEqual({ [F1]: -70.34, [F2]: 129.68, [F3]: -59.34 });
    expect((await del("Feandy", r.body.id)).status).toBe(200);
  });
  it("no day said: the trip's own today", async () => {
    const r = await add("Feken", { paidBy: "Feken", amount: 1, currency: "USD", what: "no day" });
    expect(r.body.dayDate).toBe(today);
    await del("Feken", r.body.id);
  });
  it("Keep tapped twice with the same key keeps it once", async () => {
    const body = { paidBy: "Feken", amount: 3, currency: "USD", what: "twice", dayDate: today, clientKey: "fe-key-00000001" };
    const a = await add("Feken", body), b = await add("Feken", body);
    expect(b.body.id).toBe(a.body.id);
    expect(b.body.again).toBe(true);
    expect((await fam()).items.filter((i: any) => i.what === "twice")).toHaveLength(1);
    const both = await Promise.all([add("Feken", { ...body, clientKey: "fe-key-00000002", what: "together" }), add("Feken", { ...body, clientKey: "fe-key-00000002", what: "together" })]);
    expect(both[0].body.id).toBe(both[1].body.id);
    for (const what of ["twice", "together"]) await del("Feken", (await item(what)).id);
    expect((await fam()).paid).toEqual({ [F1]: 110, [F2]: 110.02, [F3]: 60 });
  });
});

describe("changing, taking away, putting back", () => {
  it("only who kept it, or the trip's first member, may change it or take it away", async () => {
    const p1 = await item("p1 dinner");
    expect((await patch("Fejo", p1.id, { what: "mine now" })).status).toBe(403);
    expect((await del("Fejo", p1.id)).status).toBe(403);
    expect((await patch("Feken", p1.id, { what: "p1 dinner" })).status).toBe(200);
    expect(p1.mayRemove).toBe(true);
    expect((await fam("Fejo")).items.find((i: any) => i.what === "p1 dinner").mayRemove).toBe(false);
  });
  it("a new amount in the same money keeps the rate it was kept with, whatever today's rate is", async () => {
    sourceGives({ JPY: 150, VND: 26000, KHR: 4100 });
    const p1 = await item("p1 dinner");
    const r = await patch("Feandy", p1.id, { amount: 5_000_000 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ party: F2, usd: 200 });
    expect(r.body.said).toBe("changed 2,500,000 ₫ → 5,000,000 ₫");
    expect(await item("p1 dinner")).toMatchObject({ amount: 5_000_000, usd: 200, rate: 25000, rateDate: "2026-11-22" });
    await patch("Feandy", p1.id, { amount: 2_500_000 });
    expect(await item("p1 dinner")).toMatchObject({ amount: 2_500_000, usd: 100, rate: 25000 });
  });
  it("a new money needs its amount, and takes today's rate", async () => {
    const p1 = await item("p1 dinner");
    const q = await patch("Feandy", p1.id, { currency: "USD" });
    expect(q.status).toBe(400);
    expect(q.body.error).toMatch(/How much was it in that money\?/);
    const r = await patch("Feandy", p1.id, { currency: "KHR", amount: 410_000 });
    expect(r.body.usd).toBe(100);
    expect(await item("p1 dinner")).toMatchObject({ currency: "KHR", amount: 410_000, usd: 100, rate: 4100 });
    // back as it was, in dong at today's 26,000: 2,600,000 dong = $100
    await patch("Feandy", p1.id, { currency: "VND", amount: 2_600_000 });
    expect(await item("p1 dinner")).toMatchObject({ currency: "VND", usd: 100, rate: 26000 });
    expect((await fam()).balance).toEqual({ [F1]: -46.34, [F2]: 73.68, [F3]: -27.34 });
    expect((await patch("Feandy", p1.id, { currency: "EUR", amount: 5 })).status).toBe(400);
  });
  it("who paid, what it was for, who it was for, and its day can each change; a change into a family's own is asked about", async () => {
    const p2 = await item("p2 boat");
    // family 2 paid it instead: paid 1: 110, 2: 170.02, 3: 0; shares unchanged → owed 1: −46.34, 2: +133.68, 3: −87.34
    const r = await patch("Feken", p2.id, { paidBy: "Fejulie" });
    expect(r.body.said).toBe("changed who paid: Fepat & Fesam → Feandy & Fejulie ($60)");
    expect(await item("p2 boat")).toMatchObject({ party: F2, paidByName: "Fejulie" });
    expect((await fam()).balance).toEqual({ [F1]: -46.34, [F2]: 133.68, [F3]: -87.34 });
    expect((await fam()).next).toBe(F3);
    const own = await patch("Feken", p2.id, { forPeople: ["Feandy", "Fejo"] });
    expect(own.status).toBe(400);
    expect(own.body.error).toMatch(/Who else was it for\?/);
    const ownByPayer = await patch("Feken", p2.id, { paidBy: F3, forPeople: ["Fex"] });
    expect(ownByPayer.status).toBe(400);
    expect((await patch("Feken", p2.id, { forPeople: ["Zed"] })).status).toBe(400);
    expect((await patch("Feken", p2.id, { dayDate: "soon" })).status).toBe(400);
    // for everyone on a day when only family 1 was abroad: all family 1's
    const e = await patch("Feken", p2.id, { forPeople: null, dayDate: plus(today, -6) });
    expect(e.status).toBe(200);
    expect(await item("p2 boat")).toMatchObject({ everyone: true, forNames: ["Feken", "Felarisa"], shares: { [F1]: 60, [F2]: 0, [F3]: 0 } });
    // and back as it was
    const b = await patch("Feken", p2.id, { paidBy: F3, forPeople: ["Feken", "Fex", "Fey"], dayDate: today, what: "p2 boat" });
    expect(b.status).toBe(200);
    expect(await item("p2 boat")).toMatchObject({ party: F3, paidByName: null, forNames: ["Feken", "Fex", "Fey"], dayDate: today });
    expect((await fam()).balance).toEqual({ [F1]: -46.34, [F2]: 73.68, [F3]: -27.34 });
  });
  it("a change that changes nothing says nothing", async () => {
    const p3 = await item("p3 tuk-tuk");
    const r = await patch("Felarisa", p3.id, { amount: 40_000, currency: "KHR", what: "p3 tuk-tuk" });
    expect(r.status).toBe(200);
    expect(r.body.said).toBe("");
  });
  it("taken away it leaves every sum; put back it counts again; a payment that isn't there is a 404", async () => {
    const p3 = await item("p3 tuk-tuk");
    expect((await del("Felarisa", p3.id)).status).toBe(200);
    // without P3: paid 1: 100; share 1: 153.34, 2: 33.34, 3: 83.34 → owed 1: −53.34, 2: +76.68, 3: −23.34
    expect((await fam()).balance).toEqual({ [F1]: -53.34, [F2]: 76.68, [F3]: -23.34 });
    expect((await patch("Felarisa", p3.id, { amount: 1 })).status).toBe(404);
    expect((await del("Felarisa", p3.id)).status).toBe(404);
    expect((await back("Fejo", p3.id)).status).toBe(403);
    expect((await back("Felarisa", p3.id)).status).toBe(200);
    expect((await fam()).balance).toEqual({ [F1]: -46.34, [F2]: 73.68, [F3]: -27.34 });
    expect((await patch("Feken", "no-such-payment", { amount: 1 })).status).toBe(404);
    expect((await del("Feken", "no-such-payment")).status).toBe(404);
    expect((await back("Feken", "no-such-payment")).status).toBe(404);
    // (a payment of another trip isn't this trip's)
    const other = await prisma.tripExpense.create({ data: { tripId: couplesTrip, party: "A & B", amount: 100, currency: "JPY", yen: 100, addedByName: "Feken", addedById: ids.Feken } });
    expect((await patch("Feken", other.id, { amount: 1 })).status).toBe(404);
  });
  it("History says each thing once, in the money it was in", async () => {
    const h = (await request(app).get(`${at(tripId)}/history`).set("Authorization", `Bearer ${tok.Feken}`)).body.history as { by: string; action: string }[];
    const lines = h.map((x) => x.action);
    const has = (start: string) => lines.filter((l) => l.toLowerCase().startsWith(start.toLowerCase())).length;
    expect(has("added 2,500,000 ₫ (Feandy & Fejulie)")).toBe(1);
    expect(has("added $60 (Fepat & Fesam), for Feken, Fex, Fey")).toBe(1);
    expect(has("added 40,000 ៛ (Feken & Felarisa)")).toBe(1);
    expect(has("added ¥16,000 (Feken & Felarisa)")).toBe(1);
    expect(has("added $10.02 (Feandy & Fejulie), for Fejo, Fekid, Fex")).toBe(1);
    expect(has("removed 40,000 ៛ (Feken & Felarisa)")).toBe(1);
    expect(has("put back 40,000 ៛ (Feken & Felarisa)")).toBe(1);
    expect(has("changed 2,500,000 ₫ → 5,000,000 ₫")).toBe(1);
    // (a dong payment's own "added" line is recognised, so History doesn't make up a second one from what it holds now)
    expect(has("added 2,600,000 ₫")).toBe(0);
  });
  it("after all of it, the hand-worked sum still stands", async () => {
    const f = await fam();
    expect(f.paid).toEqual({ [F1]: 110, [F2]: 110.02, [F3]: 60 });
    expect(f.share).toEqual({ [F1]: 156.34, [F2]: 36.34, [F3]: 87.34 });
    expect(f.next).toBe(F1);
    expect(f.items).toHaveLength(5);
  });
});

describe("a payment kept in a way the sum can't count is shown, never dropped", () => {
  it("a row whose family isn't one of the trip's: listed as not counted, in no total", async () => {
    const row = await prisma.tripExpense.create({ data: { tripId, party: "Somebody Else", amount: 50, currency: "USD", yen: 8000, what: "stray", addedByName: "Feken", addedById: ids.Feken } });
    const f = await fam();
    expect(f.items.find((i: any) => i.what === "stray")).toMatchObject({ notCounted: true, party: "Somebody Else", usd: 50 });
    expect(f.paid).toEqual({ [F1]: 110, [F2]: 110.02, [F3]: 60 });
    await prisma.tripExpense.delete({ where: { id: row.id } });
  });
});

describe("the other two kinds of trip", () => {
  it("a couples' trip is asked in yen or dollars; another money is refused, where it was once kept as yen unseen", async () => {
    const r = await add("Feken", { paidBy: "Feken", amount: 500_000, currency: "VND", what: "dong on a yen trip" }, couplesTrip);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("This trip's Budget keeps yen and US dollars.");
    const row = await prisma.tripExpense.create({ data: { tripId: couplesTrip, party: "A & B", amount: 100, currency: "JPY", yen: 100, addedByName: "Feken", addedById: ids.Feken } });
    const p = await patch("Feken", row.id, { amount: 5, currency: "KHR" }, couplesTrip);
    expect(p.status).toBe(400);
    expect(p.body.error).toBe("This trip's Budget keeps yen and US dollars.");
    expect((await prisma.tripExpense.findUnique({ where: { id: row.id } }))!.amount).toBe(100);
    // (yen and dollars go on to the couples' Budget as before: this trip has no couples, so that is what it asks)
    const y = await add("Feken", { paidBy: "Feken", amount: 500, currency: "yen", what: "yen on a yen trip" }, couplesTrip);
    expect(y.body.error || "").not.toMatch(/keeps yen and US dollars/);
    const l = await read("Feken", couplesTrip);
    expect(l.family).toBeUndefined();
    expect(l.notSetUp).toBeUndefined();
  });
  it("a trip built from a plan whose families aren't in yet: Budget says so, and keeps nothing", async () => {
    const l = await read("Feken", planTrip);
    expect(l.notSetUp).toBe(true);
    expect(l.family).toBeUndefined();
    expect(l.parties).toEqual([]);
    const r = await add("Feken", { paidBy: "Feken", amount: 5, currency: "USD", what: "too early" }, planTrip);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Budget isn't set up for this trip yet.");
    expect(await prisma.tripExpense.count({ where: { tripId: planTrip } })).toBe(0);
  });
});

describe("the rate a payment is kept with is the rate a person is shown", () => {
  // By hand, at the rate as printed: 250,004,000 dong ÷ 25,000 = $10,000.16 (÷ the source's 25,000.4 it would be $10,000.00);
  // 1,587,040 yen ÷ 158.70 = $10,000.25 (÷ the source's 158.704 it would be $10,000.00)
  it("dong at the whole-unit rate, yen at the hundredth: the dollars can be checked from the rate on the line", async () => {
    sourceGives({ JPY: 158.704, VND: 25000.4, KHR: 4066.3 });
    const d = await add("Feken", { paidBy: "Feken", amount: 250_004_000, currency: "VND", what: "printed dong", dayDate: today });
    expect(d.body).toMatchObject({ usd: 10000.16, rate: 25000 });
    const y = await add("Feken", { paidBy: "Feken", amount: 1_587_040, currency: "JPY", what: "printed yen", dayDate: today });
    expect(y.body).toMatchObject({ usd: 10000.25, rate: 158.7 });
    await del("Feken", d.body.id); await del("Feken", y.body.id);
    sourceGives({ JPY: 150, VND: 26000, KHR: 4100 });
  });
});

describe("each day's money, for the entry sheet", () => {
  it("a day in Vietnam says dong, in Cambodia riel, in Japan yen; a country Wander keeps no rate for says none", async () => {
    expect((await fam()).days).toEqual([]);
    const places: [string, string | null, string][] = [["FE Hanoi", "Vietnam", "2031-12-20"], ["FE Siem Reap", "Cambodia", "2031-12-31"], ["FE Slopes", "Japan", "2032-01-03"], ["FE Elsewhere", "Laos", "2032-01-05"], ["FE Nowhere", null, "2032-01-06"]];
    for (const [i, [name, country, date]] of places.entries()) {
      const city = await prisma.city.create({ data: { tripId, name, country, sequenceOrder: i } });
      await prisma.day.create({ data: { tripId, cityId: city.id, date: new Date(`${date}T00:00:00Z`) } });
    }
    expect((await fam()).days).toEqual([
      { date: "2031-12-20", money: "VND" }, { date: "2031-12-31", money: "KHR" }, { date: "2032-01-03", money: "JPY" },
      { date: "2032-01-05", money: null }, { date: "2032-01-06", money: null },
    ]);
    // (the day on the trip's clock is still today: none of these days is being lived now)
    expect((await fam()).today).toBe(today);
  });
});
