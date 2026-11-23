/**
 * GET /api/rates (Nov 22 2026): the recent rates per dollar the phone's currency pop-up and calculator read. Signed-in
 * people only; never fails (a rate source that is down gives round figures marked approximate); the source is asked
 * once, not once per person. Written before the route existed. The network is a stand-in; no database.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

process.env.JWT_SECRET = "test-secret-rates-route";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { forgetRates, RATE_SOURCE } = await import("../src/services/rates.js");

const token = signToken({ code: "Pat Hashrates", displayName: "Pat Hashrates" });
const as = { Authorization: `Bearer ${token}` };
const GOOD = { result: "success", time_last_update_utc: "Sun, 22 Nov 2026 00:02:31 +0000", base_code: "USD", rates: { USD: 1, EUR: 0.86, JPY: 159.78, VND: 25715.74, KHR: 4064.11 } };

let asked: string[] = [];
const sourceGives = (answer: () => unknown) => vi.stubGlobal("fetch", (async (url: unknown) => { asked.push(String(url)); return answer(); }) as unknown as typeof fetch);

beforeEach(() => { forgetRates(); asked = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("GET /api/rates", () => {
  it("is for signed-in people only: 401 with no token, and the source isn't asked", async () => {
    sourceGives(() => ({ ok: true, json: async () => GOOD }));
    const r = await request(app).get("/api/rates");
    expect(r.status).toBe(401);
    expect(asked).toEqual([]);
  });

  it("gives yen, dong and riel per dollar, each with the day it's from, and names the source", async () => {
    sourceGives(() => ({ ok: true, json: async () => GOOD }));
    const r = await request(app).get("/api/rates").set(as);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      rates: {
        JPY: { rate: 159.78, asOf: "2026-11-22", approx: false },
        VND: { rate: 25715.74, asOf: "2026-11-22", approx: false },
        KHR: { rate: 4064.11, asOf: "2026-11-22", approx: false },
      },
      source: "open.er-api.com",
    });
    expect(asked).toEqual([RATE_SOURCE]);
  });

  it("never fails: with the source down it answers 200 with round figures marked approximate", async () => {
    sourceGives(() => { throw new Error("no network"); });
    const r = await request(app).get("/api/rates").set(as);
    expect(r.status).toBe(200);
    expect(r.body.rates).toEqual({
      JPY: { rate: 150, asOf: null, approx: true },
      VND: { rate: 25000, asOf: null, approx: true },
      KHR: { rate: 4100, asOf: null, approx: true },
    });
  });

  it("asks the source once for two people in a row", async () => {
    sourceGives(() => ({ ok: true, json: async () => GOOD }));
    await request(app).get("/api/rates").set(as);
    await request(app).get("/api/rates").set(as);
    expect(asked).toEqual([RATE_SOURCE]);
  });

  it("takes nothing from the request: a query string changes neither the answer nor the address asked", async () => {
    sourceGives(() => ({ ok: true, json: async () => GOOD }));
    const r = await request(app).get("/api/rates?base=EUR&currency=THB&tripId=x").set(as);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.rates).sort()).toEqual(["JPY", "KHR", "VND"]);
    expect(asked).toEqual([RATE_SOURCE]);
  });

  it("only GET: a POST isn't a way in", async () => {
    sourceGives(() => ({ ok: true, json: async () => GOOD }));
    const r = await request(app).post("/api/rates").set(as).send({ rates: { VND: 1 } });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(asked).toEqual([]);
  });
});
