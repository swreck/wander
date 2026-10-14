/**
 * Open-Meteo calls (services/meteo.ts) and the forecast kept from them (dayWeather): busy answers tried again, a stalled
 * reply given up on, and a forecast missing its rain hours or its other-forecasts check asked for again within minutes
 * (verify47). fetch is stubbed — no network.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import http from "http";
import { meteo } from "../src/services/meteo.js";
import { weatherAt } from "../src/services/dayWeather.js";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("meteo()", () => {
  it("a busy answer (429, 503) is tried again", async () => {
    const answers = [429, 503, 200];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(answers[0] === 200 ? "{}" : null, { status: answers.shift()! })));
    const r = await meteo("https://api.open-meteo.com/x");
    expect(r.status).toBe(200);
  });

  it("a reply that stalls after its first bytes is given up on, not waited on for minutes (verify47)", async () => {
    const server = http.createServer((_q, res) => { res.writeHead(200, { "content-type": "application/json" }); res.write("{"); /* never ends */ });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as any).port;
    const t0 = Date.now();
    const r = await meteo(`http://127.0.0.1:${port}/`, undefined, 300);
    expect(r.status).toBe(503);
    expect(Date.now() - t0).toBeLessThan(5000);   // (3 tries × 0.3 s, plus the pauses between)
    server.closeAllConnections(); server.close();
  });
});

describe("a half-failed forecast is asked for again soon", () => {
  it("rain hours missing when the hourly call failed come back after 2 minutes (verify47: they stayed missing 30)", async () => {
    let hourlyUp = false;
    const today = "2026-10-20";
    const days = Array.from({ length: 16 }, (_, i) => new Date(Date.parse(`${today}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("hourly=")) {
        if (!hourlyUp) return new Response(null, { status: 503 });
        const time = days.slice(0, 4).flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`));
        const wet = time.map((t) => (Number(t.slice(11, 13)) >= 15 && Number(t.slice(11, 13)) <= 19 ? 0.05 : 0));
        return Response.json({ hourly: { time, precipitation_probability_best_match: wet.map((x) => (x ? 80 : 10)), precipitation_jma_seamless: wet, precipitation_ecmwf_ifs025: wet, precipitation_gfs_seamless: wet } });
      }
      if (u.includes("models=ecmwf")) return Response.json({ daily: { time: days, precipitation_sum_ecmwf_ifs025: days.map(() => 0.3), precipitation_sum_jma_seamless: days.map(() => 0.3), precipitation_sum_gfs_seamless: days.map(() => 0.3) } });
      return Response.json({ daily: { time: days, temperature_2m_max: days.map(() => 70), temperature_2m_min: days.map(() => 60), precipitation_probability_max: days.map(() => 80), precipitation_sum: days.map(() => 0.3), weather_code: days.map(() => 61) } });
    }));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T23:00:00Z"));
    const p = { lat: 35.111, lng: 139.111 };
    const first = await weatherAt(p, "Somewhere", today, today);
    expect(first?.rain).toBe(80);
    expect(first?.wet).toBeUndefined();   // (no hours: the hourly call was busy)
    hourlyUp = true;
    vi.setSystemTime(new Date("2026-10-19T23:01:00Z"));
    expect((await weatherAt(p, "Somewhere", today, today))?.wet).toBeUndefined();   // (a minute on: still the kept one)
    vi.setSystemTime(new Date("2026-10-19T23:03:00Z"));
    expect((await weatherAt(p, "Somewhere", today, today))?.wet).toEqual([[14, 19]]);   // (past 2 minutes: asked again)
  });
});
