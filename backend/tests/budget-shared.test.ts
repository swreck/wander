/**
 * BUDGET — SHARED IS THE DEFAULT (Oct 23 2026). Ken: "Folks are sometimes misaligning whether in expense is shared by
 * both parties. Make a shared expense as a clear default. And then in the summary, make it clear and highlight anything
 * that doesn't shared because it's probably an error. Ask if the intent is unclear."
 * - a payment with no "for whom" is shared, half each
 * - for the other couple: they owe it all
 * - a couple paying for themselves alone is refused with a question (add, and change into it — by "for" or by "who paid")
 * - one kept that way before can still be made shared; money_so_far names everything not shared, that one as a mistake
 * Invented data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-budget-shared";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { executeTool } = await import("../src/routes/chat.js");
const prisma = new PrismaClient();

let tripId = "";
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const who = (n: string) => ({ code: n, displayName: n, travelerId: ids[n] });
beforeAll(async () => {
  for (const n of ["Bsken", "Bslarisa", "Bsandy", "Bsjulie"]) {
    const t = (await prisma.traveler.findFirst({ where: { displayName: n } })) || await prisma.traveler.create({ data: { displayName: n } });
    ids[n] = t.id; tok[n] = signToken({ code: n, displayName: n, travelerId: t.id });
  }
  tripId = (await prisma.trip.create({ data: { name: "BS Trip", status: "archived", timeZone: "Asia/Tokyo", startDate: new Date("2031-10-05"), endDate: new Date("2031-10-29") } })).id;
  let d = 1;
  for (const n of ["Bsken", "Bslarisa", "Bsandy", "Bsjulie"]) await prisma.tripMember.create({ data: { tripId, travelerId: ids[n], role: n === "Bsken" ? "planner" : "member", joinedAt: new Date(`2031-01-0${d++}`) } });
  // (the couples come from her Guide's "X & Y" lines — services/expenses.ts partiesOf)
  const snap = await prisma.guideSnapshot.create({ data: { tripId, sourceName: "bs.xlsx", sourceKind: "xlsx", contentHash: "bs", status: "current", tabs: [] } });
  for (const [i, w] of ["Bsken & Bslarisa", "Bsandy & Bsjulie"].entries())
    await prisma.guideItem.create({ data: { tripId, snapshotId: snap.id, kind: "plan", title: `Dinner ${i}`, forWhom: w, date: new Date(`2031-10-0${6 + i}T00:00:00Z`), source: "Itinerary", sourceRef: `bs!A${i}` } });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});
const add = (n: string, body: Record<string, unknown>) => request(app).post(`/api/expenses/trip/${tripId}`).set("Authorization", `Bearer ${tok[n]}`).send(body);
const ledger = async () => (await request(app).get(`/api/expenses/trip/${tripId}`).set("Authorization", `Bearer ${tok.Bsken}`)).body;

describe("shared is the default; not shared is asked about and flagged", () => {
  let parties: string[] = [];
  it("the trip has two couples to share between", async () => {
    parties = (await ledger()).parties;
    if (parties.length !== 2) console.warn("couples as the ledger sees them:", parties);
    expect(parties.length).toBe(2);
  });
  it("no 'for whom' → shared, half each", async () => {
    const r = await add("Bsandy", { paidBy: "Bsandy", amount: 4000, currency: "JPY", what: "lunch" });
    expect(r.status).toBeLessThan(300);
    const x = (await ledger()).items.find((i: any) => i.what === "lunch");
    expect(x.forParty).toBeNull();
  });
  it("for the other couple → they owe it all", async () => {
    const mine = parties.find((p) => /Bsandy/.test(p))!, other = parties.find((p) => p !== mine)!;
    const r = await add("Bsandy", { paidBy: "Bsandy", amount: 3000, currency: "JPY", what: "scarf", forParty: other });
    expect(r.status).toBeLessThan(300);
    expect((await ledger()).items.find((i: any) => i.what === "scarf").forParty).toBe(other);
  });
  it("a couple paying for themselves alone is refused, with a question", async () => {
    const mine = parties.find((p) => /Bsandy/.test(p))!;
    const r = await add("Bsandy", { paidBy: "Bsandy", amount: 2000, currency: "JPY", what: "self", forParty: mine });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.error).toMatch(/isn't shared at all.*Was it shared, half each/);
    expect((await ledger()).items.some((i: any) => i.what === "self")).toBe(false);
    const s = await executeTool("add_expense", { tripId, paidBy: "Bsandy", amount: 2000, currency: "JPY", what: "self2", forCouple: "Bsjulie" }, who("Bsandy"));
    expect(JSON.stringify(s.result)).toMatch(/isn't shared at all/);
  });
  it("changing one into a couple paying for themselves is refused — by 'for' or by 'who paid'", async () => {
    const scarf = (await ledger()).items.find((i: any) => i.what === "scarf");
    const mine = parties.find((p) => /Bsandy/.test(p))!, other = parties.find((p) => p !== mine)!;
    const byFor = await request(app).patch(`/api/expenses/trip/${tripId}/${scarf.id}`).set("Authorization", `Bearer ${tok.Bsandy}`).send({ forParty: mine });
    expect(byFor.status).toBeGreaterThanOrEqual(400);
    const byPayer = await request(app).patch(`/api/expenses/trip/${tripId}/${scarf.id}`).set("Authorization", `Bearer ${tok.Bsandy}`).send({ paidBy: other });
    expect(byPayer.status).toBeGreaterThanOrEqual(400);
    expect((await ledger()).items.find((i: any) => i.what === "scarf").forParty).toBe(other);
  });
  it("one kept that way before: named as a mistake, and can be made shared", async () => {
    const mine = parties.find((p) => /Bsandy/.test(p))!;
    const old = await prisma.tripExpense.create({ data: { tripId, party: mine, forParty: mine, amount: 1987, currency: "JPY", yen: 1987, what: "old self", addedByName: "Bsandy", addedById: ids.Bsandy } });
    const m = await executeTool("money_so_far", { tripId }, who("Bsken"));
    const ns: string[] = m.result.notShared;
    expect(ns.some((s) => /old self/.test(s) && /probably a mistake/.test(s))).toBe(true);
    expect(ns.some((s) => /scarf/.test(s) && /owe it all back/.test(s))).toBe(true);
    expect(ns.some((s) => /lunch/.test(s))).toBe(false);
    const fix = await request(app).patch(`/api/expenses/trip/${tripId}/${old.id}`).set("Authorization", `Bearer ${tok.Bsandy}`).send({ forParty: null });
    expect(fix.status).toBeLessThan(300);
    expect((await ledger()).items.find((i: any) => i.what === "old self").forParty).toBeNull();
  });
  it("a one-time note from Scout to Andy after his next payment: his alone, made once, never in the trip's messages", async () => {
    // (the trip's Andy — "Bsandy" isn't him; a traveler whose first name is Andy is)
    const a = (await prisma.traveler.findFirst({ where: { displayName: "Andy Bstest" } })) || await prisma.traveler.create({ data: { displayName: "Andy Bstest" } });
    await prisma.tripMember.upsert({ where: { tripId_travelerId: { tripId, travelerId: a.id } }, create: { tripId, travelerId: a.id, joinedAt: new Date("2031-01-09") }, update: {} });
    await prisma.tripAlert.deleteMany({ where: { key: "andy-budget-2026-10-23" } });
    const at = signToken({ code: "Andy Bstest", displayName: "Andy Bstest", travelerId: a.id });
    const pend = async (t: string) => (await request(app).get("/api/alerts/pending").set("Authorization", `Bearer ${t}`)).body.alerts as any[];
    expect((await pend(at)).some((x) => x.from === "Scout")).toBe(false);
    await request(app).post(`/api/expenses/trip/${tripId}`).set("Authorization", `Bearer ${at}`).send({ paidBy: "Bsandy", amount: 500, currency: "JPY", what: "andy's coffee" });
    const mine = (await pend(at)).filter((x) => x.from === "Scout");
    expect(mine.length).toBe(1);
    expect(mine[0].toYou).toBe(true);
    expect(mine[0].text).toBe("Hi Andy. This is Scout. Ken said my UI was disappointing. I'm sorry and I tried to improve. Anytime you don't like something, just tap Scout & tell me. I'll let Ken know and try to fix it. Have fun in Kyoto!");
    expect((await pend(tok.Bsjulie)).some((x) => x.from === "Scout")).toBe(false);
    expect((await pend(tok.Bsken)).some((x) => x.from === "Scout")).toBe(false);
    await request(app).post(`/api/expenses/trip/${tripId}`).set("Authorization", `Bearer ${at}`).send({ paidBy: "Bsandy", amount: 600, currency: "JPY", what: "andy's second coffee" });
    expect(await prisma.tripAlert.count({ where: { key: "andy-budget-2026-10-23" } })).toBe(1);
    await request(app).post(`/api/alerts/${mine[0].id}/seen`).set("Authorization", `Bearer ${at}`).send({ state: "got" });
    expect((await pend(at)).some((x) => x.from === "Scout")).toBe(false);
    // (never among the trip's messages to everyone, for Scout's answers or my_alerts)
    const { liveOn } = await import("../src/services/tripAlerts.js");
    expect((await liveOn(tripId)).some((x) => x.fromName === "Scout")).toBe(false);
    expect(JSON.stringify((await executeTool("my_alerts", { tripId }, who("Bsken"))).result)).not.toMatch(/This is Scout/);
    await prisma.tripAlert.deleteMany({ where: { key: "andy-budget-2026-10-23" } });
  });
  it("an amount, a description or the payer changed on a shared one stays shared", async () => {
    const lunch = (await ledger()).items.find((i: any) => i.what === "lunch");
    const r = await request(app).patch(`/api/expenses/trip/${tripId}/${lunch.id}`).set("Authorization", `Bearer ${tok.Bsandy}`).send({ amount: 4500, paidBy: "Bsken" });
    expect(r.status).toBeLessThan(300);
    const x = (await ledger()).items.find((i: any) => i.what === "lunch");
    expect(x.forParty).toBeNull();
    expect(x.amount).toBe(4500);
  });
});
