/**
 * Recent exchange rates for a trip that pays in dong, riel, dollars and yen (Ken, Nov 16: "inputs and views of a
 * transaction later should have a pop up for currency using recent conversion rates (do not have to be perfect to the
 * hour or even the day)"). Written before services/rates.ts existed. Japan's payments don't use this: they keep the
 * yen and the rate stored on each row, and expenses.ts's yenPerDollar is unchanged.
 *
 * No network and no database: every test hands in its own fetcher and clock.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ratesPerDollar, toDollars, fromDollars, forgetRates, RATE_SOURCE } from "../src/services/rates.js";

const HOUR = 3600_000, MIN = 60_000;
const GOOD = { JPY: 159.78, VND: 25715.74, KHR: 4064.11 };
const body = (rates: Record<string, unknown>, when = "Mon, 16 Nov 2026 00:02:31 +0000") =>
  ({ result: "success", time_last_update_utc: when, base_code: "USD", rates: { USD: 1, EUR: 0.86, ...rates } });

/** A fetcher that counts its calls and answers with whatever `next` holds at that moment */
function source() {
  const s = {
    calls: [] as string[],
    next: (() => ({ ok: true, json: async () => body(GOOD) })) as () => unknown,
    fetcher: (async (url: unknown) => { s.calls.push(String(url)); return s.next(); }) as unknown as typeof fetch,
  };
  return s;
}
const down = () => { throw new Error("no network"); };

describe("recent rates per dollar", () => {
  beforeEach(() => forgetRates());

  it("reads yen, dong and riel from one ask, each with the day it's from", async () => {
    const s = source();
    const r = await ratesPerDollar({ fetcher: s.fetcher, now: () => 0 });
    expect(r.JPY).toEqual({ rate: 159.78, asOf: "2026-11-16", approx: false });
    expect(r.VND).toEqual({ rate: 25715.74, asOf: "2026-11-16", approx: false });
    expect(r.KHR).toEqual({ rate: 4064.11, asOf: "2026-11-16", approx: false });
    expect(s.calls).toEqual([RATE_SOURCE]);
  });

  it("asks only this address, with nothing added to it", () => {
    expect(RATE_SOURCE).toBe("https://open.er-api.com/v6/latest/USD");
  });

  it("keeps a good answer 12 hours, then asks again", async () => {
    const s = source();
    let t = 0;
    const opts = { fetcher: s.fetcher, now: () => t };
    await ratesPerDollar(opts);
    t = 11 * HOUR + 59 * MIN; await ratesPerDollar(opts);
    expect(s.calls.length).toBe(1);
    t = 12 * HOUR + MIN;
    s.next = () => ({ ok: true, json: async () => body({ ...GOOD, VND: 25800 }, "Mon, 16 Nov 2026 12:02:31 +0000") });
    const r = await ratesPerDollar(opts);
    expect(s.calls.length).toBe(2);
    expect(r.VND.rate).toBe(25800);
  });

  it("the source down with nothing kept: round figures, each said to be approximate, no day", async () => {
    const s = source(); s.next = down;
    const r = await ratesPerDollar({ fetcher: s.fetcher, now: () => 0 });
    expect(r.JPY).toEqual({ rate: 150, asOf: null, approx: true });
    expect(r.VND).toEqual({ rate: 25000, asOf: null, approx: true });
    expect(r.KHR).toEqual({ rate: 4100, asOf: null, approx: true });
  });

  it("the source down after a good answer: the last good rates, with the day they are from", async () => {
    const s = source();
    let t = 0;
    const opts = { fetcher: s.fetcher, now: () => t };
    await ratesPerDollar(opts);
    t = 13 * HOUR; s.next = down;
    const r = await ratesPerDollar(opts);
    expect(r.VND).toEqual({ rate: 25715.74, asOf: "2026-11-16", approx: false });
    expect(r.JPY).toEqual({ rate: 159.78, asOf: "2026-11-16", approx: false });
  });

  it("after a failed ask it waits 10 minutes before asking again", async () => {
    const s = source(); s.next = down;
    let t = 0;
    const opts = { fetcher: s.fetcher, now: () => t };
    await ratesPerDollar(opts);
    t = 9 * MIN; await ratesPerDollar(opts);
    expect(s.calls.length).toBe(1);
    t = 11 * MIN;
    s.next = () => ({ ok: true, json: async () => body(GOOD) });
    const r = await ratesPerDollar(opts);
    expect(s.calls.length).toBe(2);
    expect(r.KHR).toEqual({ rate: 4064.11, asOf: "2026-11-16", approx: false });
  });

  it("a currency missing from the answer: the others are fresh, that one is a round figure", async () => {
    const s = source();
    s.next = () => ({ ok: true, json: async () => body({ JPY: 159.78, VND: 25715.74 }) });
    const r = await ratesPerDollar({ fetcher: s.fetcher, now: () => 0 });
    expect(r.JPY.approx).toBe(false);
    expect(r.VND.approx).toBe(false);
    expect(r.KHR).toEqual({ rate: 4100, asOf: null, approx: true });
  });

  it("a currency missing later keeps its own last good rate and day", async () => {
    const s = source();
    let t = 0;
    const opts = { fetcher: s.fetcher, now: () => t };
    await ratesPerDollar(opts);
    t = 13 * HOUR;
    s.next = () => ({ ok: true, json: async () => body({ JPY: 161, VND: 25900 }, "Tue, 17 Nov 2026 00:30:21 +0000") });
    const r = await ratesPerDollar(opts);
    expect(r.JPY).toEqual({ rate: 161, asOf: "2026-11-17", approx: false });
    expect(r.KHR).toEqual({ rate: 4064.11, asOf: "2026-11-16", approx: false });
  });

  it("a rate that can't be right is treated as missing (never shown)", async () => {
    for (const bad of [{ VND: 2.57 }, { VND: 0 }, { VND: -25000 }, { VND: "25715" }, { VND: null }, { VND: 9_000_000 }, { VND: NaN }]) {
      forgetRates();
      const s = source();
      s.next = () => ({ ok: true, json: async () => body({ ...GOOD, ...bad }) });
      const r = await ratesPerDollar({ fetcher: s.fetcher, now: () => 0 });
      expect(r.VND, JSON.stringify(bad)).toEqual({ rate: 25000, asOf: null, approx: true });
      expect(r.JPY.rate).toBe(159.78);
    }
    forgetRates();
    const s = source();
    s.next = () => ({ ok: true, json: async () => body({ ...GOOD, JPY: 15, KHR: 40 }) });
    const r = await ratesPerDollar({ fetcher: s.fetcher, now: () => 0 });
    expect(r.JPY).toEqual({ rate: 150, asOf: null, approx: true });
    expect(r.KHR).toEqual({ rate: 4100, asOf: null, approx: true });
  });

  it("an answer that isn't a success, isn't in dollars, or isn't readable counts as the source being down", async () => {
    const answers: (() => unknown)[] = [
      () => ({ ok: false, json: async () => body(GOOD) }),
      () => ({ ok: true, json: async () => ({ ...body(GOOD), result: "error" }) }),
      () => ({ ok: true, json: async () => ({ ...body(GOOD), base_code: "EUR" }) }),
      () => ({ ok: true, json: async () => { throw new Error("not json"); } }),
      () => ({ ok: true, json: async () => null }),
      () => ({ ok: true, json: async () => ({ result: "success", base_code: "USD" }) }),
    ];
    for (const next of answers) {
      forgetRates();
      const s = source(); s.next = next;
      const r = await ratesPerDollar({ fetcher: s.fetcher, now: () => 0 });
      expect(r.VND).toEqual({ rate: 25000, asOf: null, approx: true });
    }
  });

  it("an answer with no readable day still gives the rates, with no day", async () => {
    const s = source();
    s.next = () => ({ ok: true, json: async () => body(GOOD, "soon") });
    const r = await ratesPerDollar({ fetcher: s.fetcher, now: () => 0 });
    expect(r.VND).toEqual({ rate: 25715.74, asOf: null, approx: false });
  });

  it("a source that never answers is given up on, and nobody waits", async () => {
    const hangs = ((_url: unknown, init?: { signal?: AbortSignal }) => new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })) as unknown as typeof fetch;
    const began = Date.now();
    const r = await ratesPerDollar({ fetcher: hangs, now: () => 0, timeoutMs: 40 });
    expect(Date.now() - began).toBeLessThan(1500);
    expect(r.JPY).toEqual({ rate: 150, asOf: null, approx: true });
  });

  it("an answer whose body never arrives is given up on too", async () => {
    const stalls = (async () => ({ ok: true, json: () => new Promise(() => {}) })) as unknown as typeof fetch;
    const began = Date.now();
    const r = await ratesPerDollar({ fetcher: stalls, now: () => 0, timeoutMs: 40 });
    expect(Date.now() - began).toBeLessThan(1500);
    expect(r.VND).toEqual({ rate: 25000, asOf: null, approx: true });
  });

  it("a fetcher that throws on the spot leaves nothing behind to fail later", async () => {
    const stray: unknown[] = [];
    const note = (e: unknown) => { stray.push(e); };
    process.on("unhandledRejection", note);
    try {
      const throws = (() => { throw new Error("thrown on the spot"); }) as unknown as typeof fetch;
      const r = await ratesPerDollar({ fetcher: throws, now: () => 0, timeoutMs: 20 });
      expect(r.KHR).toEqual({ rate: 4100, asOf: null, approx: true });
      await new Promise((done) => setTimeout(done, 80));
      expect(stray).toEqual([]);
    } finally { process.off("unhandledRejection", note); }
  });

  it("a rate twice or half what it could be is a bad answer: dong 15,000 to 40,000, riel 3,000 to 6,000", async () => {
    for (const [bad, c, round] of [[{ VND: 51_000 }, "VND", 25000], [{ VND: 12_800 }, "VND", 25000], [{ KHR: 8_100 }, "KHR", 4100], [{ KHR: 2_000 }, "KHR", 4100]] as const) {
      forgetRates();
      const s = source();
      s.next = () => ({ ok: true, json: async () => body({ ...GOOD, ...bad }) });
      const r = await ratesPerDollar({ fetcher: s.fetcher, now: () => 0 });
      expect(r[c], JSON.stringify(bad)).toEqual({ rate: round, asOf: null, approx: true });
    }
    forgetRates();
    const s = source();
    s.next = () => ({ ok: true, json: async () => body({ JPY: 51, VND: 39_000, KHR: 5_900 }) });
    const r = await ratesPerDollar({ fetcher: s.fetcher, now: () => 0 });
    expect([r.JPY.approx, r.VND.approx, r.KHR.approx]).toEqual([false, false, false]);
  });

  it("two asks at the same moment make one request", async () => {
    const s = source();
    const opts = { fetcher: s.fetcher, now: () => 0 };
    const [a, b] = await Promise.all([ratesPerDollar(opts), ratesPerDollar(opts)]);
    expect(s.calls.length).toBe(1);
    expect(a).toEqual(b);
  });

  it("what it hands back can't be used to change what it keeps", async () => {
    const s = source();
    const opts = { fetcher: s.fetcher, now: () => 0 };
    const r = await ratesPerDollar(opts);
    r.VND.rate = 1;
    expect((await ratesPerDollar(opts)).VND.rate).toBe(25715.74);
  });
});

describe("amounts to and from dollars", () => {
  const rates = {
    JPY: { rate: 160, asOf: "2026-11-16", approx: false },
    VND: { rate: 25000, asOf: "2026-11-16", approx: false },
    KHR: { rate: 4000, asOf: "2026-11-16", approx: false },
  };

  it("a dinner of 1,250,000 dong is 50 dollars", () => {
    expect(toDollars(1_250_000, "VND", rates)).toBe(50);
  });
  it("yen and riel, to the cent", () => {
    expect(toDollars(3264, "JPY", rates)).toBe(20.4);
    expect(toDollars(10_000, "KHR", rates)).toBe(2.5);
    expect(toDollars(100, "JPY", rates)).toBe(0.63); // 0.625 rounds up
  });
  it("dollars pass through, to the cent", () => {
    expect(toDollars(12.345, "USD", rates)).toBe(12.35);
    expect(toDollars(0, "USD", rates)).toBe(0);
  });
  it("a money back amount keeps its sign", () => {
    expect(toDollars(-250_000, "VND", rates)).toBe(-10);
  });
  it("a currency it doesn't know, or an amount that isn't a number, gives nothing rather than a guess", () => {
    expect(toDollars(100, "EUR" as never, rates)).toBeNull();
    expect(toDollars(NaN, "VND", rates)).toBeNull();
    expect(toDollars(Infinity, "VND", rates)).toBeNull();
    expect(toDollars("100" as never, "VND", rates)).toBeNull();
  });
  it("dollars into each currency: whole dong, riel and yen; cents for dollars", () => {
    expect(fromDollars(50, "VND", rates)).toBe(1_250_000);
    expect(fromDollars(20.4, "JPY", rates)).toBe(3264);
    expect(fromDollars(1.2345, "KHR", rates)).toBe(4938);
    expect(fromDollars(12.345, "USD", rates)).toBe(12.35);
    expect(fromDollars(100, "EUR" as never, rates)).toBeNull();
    expect(fromDollars(NaN, "JPY", rates)).toBeNull();
  });
});
