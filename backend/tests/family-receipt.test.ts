/**
 * A RECEIPT'S PHOTO ON A FAMILIES' TRIP (Nov 23 2026). Japan's reader knows yen and dollars and says "a trip in Japan".
 * A trip whose payers are families runs through Vietnam, Cambodia and Japan, so its reader gives one of four moneys
 * (or none, when the receipt doesn't say and the place doesn't tell), and is told each day's town, country and money.
 * Japan's reader is untouched: a trip with no families is still read by it, word for word. Written before the code.
 *
 * The model is stubbed: these are the guards around its answer, what it is sent, and which reader a trip gets.
 * What the real reader makes of real receipts is the exam's job (trip-data/session-tools/december/receipt-exam).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

const model = vi.hoisted(() => ({ sent: [] as any[], say: null as any, stop: "end_turn" as string, fail: false }));
vi.mock("@anthropic-ai/sdk", async (orig) => {
  const real: any = await orig();
  class Fake extends real.default {
    constructor(o?: any) {
      super({ apiKey: "test", ...o });
      (this as any).messages = {
        create: async (p: any) => {
          model.sent.push(p);
          if (model.fail) throw new Error("down");
          return { id: "stub", type: "message", role: "assistant", model: "stub", stop_reason: model.stop, stop_sequence: null,
            content: [{ type: "text", text: JSON.stringify(model.say), citations: null }], usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
        },
      };
    }
  }
  return { ...real, default: Fake };
});

process.env.JWT_SECRET = "test-secret-family-receipt";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { readFamilyReceipt } = await import("../src/services/familyReceipt.js");
const prisma = new PrismaClient();

const VN = "Asia/Ho_Chi_Minh";
const plus = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const at0 = (s: string) => new Date(`${s}T00:00:00Z`);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: VN, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const inCambodia = plus(today, 1), inJapan = plus(today, 2), elsewhere = plus(today, 3);
const photo = { mediaType: "image/jpeg", data: "A".repeat(2400) };

let tripId = "", couples = "", ken = "";
const read = async (say: any, o: { stop?: string; fail?: boolean } = {}) => {
  model.sent.length = 0; model.say = say; model.stop = o.stop || "end_turn"; model.fail = !!o.fail;
  return readFamilyReceipt(tripId, photo);
};

beforeAll(async () => {
  const t = (await prisma.traveler.findFirst({ where: { displayName: "Frken" } })) || await prisma.traveler.create({ data: { displayName: "Frken" } });
  ken = t.id;
  const old = await prisma.trip.findMany({ where: { name: { in: ["FR Families", "FR Couples"] } }, select: { id: true } });
  for (const o of old) await prisma.trip.delete({ where: { id: o.id } }).catch(() => {});
  const trip = async (name: string) => {
    const id = (await prisma.trip.create({ data: { name, status: "archived", timeZone: VN, startDate: at0(plus(today, -3)), endDate: at0(plus(today, 6)), datesKnown: true } })).id;
    await prisma.tripMember.create({ data: { tripId: id, travelerId: ken, role: "planner" } });
    return id;
  };
  tripId = await trip("FR Families");
  couples = await trip("FR Couples");
  const cities: [string, string | null, string][] = [["Fr Town A - old quarter", "Vietnam", today], ["Fr Town B", "Cambodia", inCambodia], ["Fr Town C", "Japan", inJapan], ["Fr Town D", "Laos", elsewhere]];
  for (const [n, [name, country, date]] of cities.entries()) {
    const c = await prisma.city.create({ data: { tripId, name, country, sequenceOrder: n, planKey: `fr-${n}` } });
    await prisma.day.create({ data: { tripId, cityId: c.id, date: at0(date), dayType: "free" } });
  }
  const c = await prisma.city.create({ data: { tripId: couples, name: "Fr Kyoto", sequenceOrder: 0 } });
  await prisma.day.create({ data: { tripId: couples, cityId: c.id, date: at0(today), dayType: "free" } });
  for (const [i, [name, family, familyLabel]] of ([["Frken", 1, "Frken & Frlarisa"], ["Frlarisa", 1, "Frken & Frlarisa"], ["Frandy", 2, "Frandy & Frjulie"], ["Frjulie", 2, "Frandy & Frjulie"]] as [string, number, string][]).entries())
    await prisma.tripPerson.create({ data: { tripId, name, family, familyLabel, abroadFrom: plus(today, -3), abroadTo: plus(today, 6), sortOrder: i } });
});
afterAll(async () => {
  for (const id of [tripId, couples]) if (id) await prisma.trip.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

describe("what the families' reader makes of the model's answer", () => {
  it("a Vietnamese bill: its total in dong, what it was for, its day", async () => {
    expect(await read({ total: 1250000, currency: "VND", what: "Dinner at Quan An Ngon", date: today }))
      .toEqual({ amount: 1250000, currency: "VND", what: "Dinner at Quan An Ngon", date: today });
  });
  it("dollars to the cent, riel and yen whole", async () => {
    expect(await read({ total: 12.499, currency: "USD", what: "Tuk-tuk", date: "" })).toEqual({ amount: 12.5, currency: "USD", what: "Tuk-tuk", date: null });
    expect(await read({ total: 40000.4, currency: "KHR", what: "Lunch", date: inCambodia })).toEqual({ amount: 40000, currency: "KHR", what: "Lunch", date: inCambodia });
    expect(await read({ total: 16000, currency: "JPY", what: "Taxi", date: inJapan })).toEqual({ amount: 16000, currency: "JPY", what: "Taxi", date: inJapan });
  });
  it("a receipt whose money can't be told: the number, and no money (never a guess)", async () => {
    expect(await read({ total: 85000, currency: "", what: "Coffee", date: today })).toEqual({ amount: 85000, currency: null, what: "Coffee", date: today });
    expect(await read({ total: 85000, currency: "THB", what: "Coffee", date: today })).toMatchObject({ amount: 85000, currency: null });
    expect(await read({ total: 85000, what: "Coffee", date: today })).toMatchObject({ amount: 85000, currency: null });
  });
  it("no total, or one that isn't a real amount: no amount (the person types it; the photo is still kept)", async () => {
    for (const total of [0, -5, 3e9, "lots", null]) expect((await read({ total, currency: "VND", what: "Dinner", date: today }))!.amount, String(total)).toBeNull();
    expect((await read({ total: 150000, currency: "USD", what: "", date: "" }))!.amount).toBeNull();     // (over the most a payment can be in dollars)
    expect((await read({ total: 0.001, currency: "USD", what: "", date: "" }))!.amount).toBeNull();
    expect((await read({ total: 5e9, currency: "", what: "", date: "" }))!.amount).toBeNull();
  });
  it("a day that isn't one of the trip's is left out", async () => {
    expect((await read({ total: 10, currency: "USD", what: "", date: plus(today, 40) }))!.date).toBeNull();
    expect((await read({ total: 10, currency: "USD", what: "", date: "yesterday" }))!.date).toBeNull();
    expect((await read({ total: 10, currency: "USD", what: "", date: inJapan }))!.date).toBe(inJapan);
  });
  it("never a run of digits in what it was for (a card or slip number), and never long", async () => {
    expect((await read({ total: 10, currency: "USD", what: "Dinner 4111111111111111  **** 9921", date: "" }))!.what).toBe("Dinner");
    expect((await read({ total: 10, currency: "USD", what: "x".repeat(200), date: "" }))!.what.length).toBe(60);
    expect((await read({ total: 10, currency: "USD", date: "" }))!.what).toBe("");
  });
  it("nothing read: a refusal, a cut-off answer, the reader down, an answer that isn't JSON, a file that isn't a picture", async () => {
    expect(await read({ total: 10, currency: "USD", what: "", date: "" }, { stop: "refusal" })).toBeNull();
    expect(await read({ total: 10, currency: "USD", what: "", date: "" }, { stop: "max_tokens" })).toBeNull();
    expect(await read({ total: 10, currency: "USD", what: "", date: "" }, { fail: true })).toBeNull();
    expect(await read(null)).toBeNull();
    model.sent.length = 0;
    expect(await readFamilyReceipt(tripId, { mediaType: "application/pdf", data: photo.data })).toBeNull();
    expect(model.sent.length).toBe(0);
  });
});

describe("what the families' reader is sent", () => {
  it("the picture, each day with its town, country and money, and the four moneys to choose from", async () => {
    await read({ total: 10, currency: "USD", what: "", date: "" });
    const p = model.sent[0];
    expect(p.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
    const days = p.messages[0].content[1].text as string;
    expect(days).toContain(`${today} Fr Town A, Vietnam (dong)`);
    expect(days).toContain(`${inCambodia} Fr Town B, Cambodia (US dollars and riel)`);
    expect(days).toContain(`${inJapan} Fr Town C, Japan (yen)`);
    expect(days).toContain(`${elsewhere} Fr Town D, Laos\n`.trimEnd());
    expect(days).not.toMatch(/Laos \(/);
    expect(p.output_config.format.schema.properties.currency.enum).toEqual(["VND", "KHR", "JPY", "USD", ""]);
    expect(p.system).toContain("Tổng cộng");
    expect(p.system).toContain("1.250.000");
    expect(p.system).toContain("合計");
    expect(p.system).not.toContain("a trip in Japan");
    expect(p.system).toMatch(/card number/);
  });
});

describe("which reader a trip gets", () => {
  const tok = () => signToken({ code: "Frken", displayName: "Frken", travelerId: ken });
  it("a families' trip: the families' reader, and dong comes back as dong", async () => {
    model.sent.length = 0; model.say = { total: 1250000, currency: "VND", what: "Dinner", date: today }; model.stop = "end_turn"; model.fail = false;
    const r = await request(app).post(`/api/expenses/trip/${tripId}/receipt`).set("Authorization", `Bearer ${tok()}`).send({ file: photo });
    expect(r.status).toBe(200);
    expect(r.body.read).toEqual({ amount: 1250000, currency: "VND", what: "Dinner", date: today });
    expect(model.sent[0].system).not.toContain("a trip in Japan");
  });
  it("a trip with no families: Japan's reader, as it always was (yen or dollars only)", async () => {
    model.sent.length = 0; model.say = { total: 5200, currency: "VND", what: "Taxi", date: today };
    const r = await request(app).post(`/api/expenses/trip/${couples}/receipt`).set("Authorization", `Bearer ${tok()}`).send({ file: photo });
    expect(r.status).toBe(200);
    expect(r.body.read).toEqual({ amount: 5200, currency: "JPY", what: "Taxi", date: today });
    expect(model.sent[0].system).toContain("a trip in Japan");
    expect(model.sent[0].output_config.format.schema.properties.currency.enum).toEqual(["JPY", "USD"]);
  });
  it("a file that isn't a photo is refused on both, with the same words", async () => {
    for (const id of [tripId, couples]) {
      const r = await request(app).post(`/api/expenses/trip/${id}/receipt`).set("Authorization", `Bearer ${tok()}`).send({ file: { mediaType: "application/pdf", data: photo.data } });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("Only a photo of the receipt can be read.");
    }
  });
});
