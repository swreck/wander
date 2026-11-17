/**
 * The December plan tool's limits (S1, spec D11; Nov 17 2026). The tool lives in the private trip-data folder, so these
 * skip without it. It may write only to the local database "wander_december" (made from the local copy); production's
 * mode refuses unless the lead has set today's date; any address off this Mac is refused; a plan file with a plan-check
 * problem is refused. Made-up plan data only.
 */
import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fakePlan } from "./fixtures/fake-plan.js";

const DIR = path.resolve(import.meta.dirname, "../../trip-data/session-tools/december");
const have = fs.existsSync(path.join(DIR, "plan-env.mts"));
const env: any = have ? await import(path.join(DIR, "plan-env.mts")) : null;
const TSX = path.resolve(import.meta.dirname, "../node_modules/.bin/tsx");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "plan-tool-"));
const write = (name: string, plan: unknown) => { const p = path.join(scratch, name); fs.writeFileSync(p, JSON.stringify(plan)); return p; };
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

describe.skipIf(!have)("where the plan tool may write", () => {
  it("refuses any address whose host isn't this Mac", () => {
    expect(() => env.assertLocalhost("postgresql://u:p@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require")).toThrow(/isn't this Mac/);
    expect(() => env.assertLocalhost("postgresql://u@192.168.1.5:5432/wander_december")).toThrow(/isn't this Mac/);
    expect(() => env.assertLocalhost("postgresql://u@localhost.evil.example/wander_december")).toThrow(/isn't this Mac/);
    expect(() => env.assertLocalhost("not an address")).toThrow(/isn't a database address/);
    expect(() => env.assertLocalhost("")).toThrow();
    expect(() => env.assertLocalhost("postgresql://u@localhost:5432/wander_december")).not.toThrow();
    expect(() => env.assertLocalhost("postgresql://u@127.0.0.1:5432/wander_december")).not.toThrow();
  });

  it("test and find write to wander_december alone; the address never comes from the environment", () => {
    for (const mode of ["test", "find"]) {
      const url = env.targetFor(mode, { DATABASE_URL: "postgresql://u@db.neon.tech/prod", WANDER_PLAN_PROD: env.todayUtc() });
      expect(new URL(url).hostname).toBe("localhost");
      expect(env.dbNameOf(url)).toBe("wander_december");
    }
  });

  it("prod refuses without WANDER_PLAN_PROD, with yesterday's or a made-up date, and with no address", () => {
    const now = new Date("2026-12-01T10:00:00Z");
    expect(() => env.targetFor("prod", {}, now)).toThrow(/needs WANDER_PLAN_PROD/);
    expect(() => env.targetFor("prod", { WANDER_PLAN_PROD: "2026-11-30", PLAN_PROD_DATABASE_URL: "postgresql://u@h/d" }, now)).toThrow(/not today's date/);
    expect(() => env.targetFor("prod", { WANDER_PLAN_PROD: "tomorrow", PLAN_PROD_DATABASE_URL: "postgresql://u@h/d" }, now)).toThrow(/not today's date/);
    expect(() => env.targetFor("prod", { WANDER_PLAN_PROD: "1" }, now)).toThrow(/not today's date/);
    expect(() => env.targetFor("prod", { WANDER_PLAN_PROD: "2026-12-01" }, now)).toThrow(/PLAN_PROD_DATABASE_URL/);
    expect(env.targetFor("prod", { WANDER_PLAN_PROD: "2026-12-01", PLAN_PROD_DATABASE_URL: "postgresql://u@h/d" }, now)).toBe("postgresql://u@h/d");
  });

  it("the date is UTC's: 11 PM in California on Nov 30 is already Dec 1", () => {
    expect(env.todayUtc(new Date("2026-12-01T07:00:00Z"))).toBe("2026-12-01");
    expect(env.todayUtc(new Date("2026-12-01T23:59:00Z"))).toBe("2026-12-01");
  });

  it("the command line: prod with nothing set exits with the refusal and touches nothing", () => {
    const p = write("ok.json", fakePlan());
    const clean = { ...process.env, WANDER_PLAN_PROD: "", PLAN_PROD_DATABASE_URL: "", DATABASE_URL: "" };
    const r = spawnSync(TSX, [path.join(DIR, "plan-tool.mts"), "prod", "--plan", p], { encoding: "utf-8", env: clean });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/needs WANDER_PLAN_PROD/);
    const old = spawnSync(TSX, [path.join(DIR, "plan-tool.mts"), "prod", "--plan", p], { encoding: "utf-8", env: { ...clean, WANDER_PLAN_PROD: "2020-01-01" } });
    expect(old.status).not.toBe(0);
    expect(`${old.stdout}${old.stderr}`).toMatch(/not today's date/);
  });

  it("an unknown mode, or none, is refused", () => {
    for (const args of [[], ["publish"], ["--fresh"]]) {
      const r = spawnSync(TSX, [path.join(DIR, "plan-tool.mts"), ...args], { encoding: "utf-8", env: { ...process.env, WANDER_PLAN_PROD: "" } });
      expect(r.status).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/find \| test \| prod/);
    }
  });
});

describe.skipIf(!have)("a plan file with a problem is refused (plan-check first)", () => {
  it("the made-up plan passes plan-check", () => {
    expect(env.runPlanCheck(write("pass.json", fakePlan())).ok).toBe(true);
  });

  it("a gap in the days, a wrong weekday, a missing leg, a stay with the wrong nights, an unsourced leg: each is a problem", () => {
    const cases: [string, (p: any) => void, RegExp][] = [
      ["a gap", (p) => { p.days.splice(2, 1); }, /gap before/],
      ["a wrong weekday", (p) => { p.days[1].weekday = "Fri"; }, /file says Fri/],
      ["a leg no day names", (p) => { p.days[0].legs = []; }, /is on no day/],
      ["a stay with the wrong nights", (p) => { delete p.days[1].stay; }, /nights booked/],
      ["a leg with no source", (p) => { delete p.legs[0].source; }, /no source, status or who/],
      ["a booking-code-looking word", (p) => { p.stays[0].room = "Room 4 code AB12CD"; }, /private-looking text/],
    ];
    for (const [name, change, want] of cases) {
      const p = fakePlan(); change(p);
      const r = env.runPlanCheck(write(`bad-${name.replace(/\W+/g, "-")}.json`, p));
      expect(r.ok, name).toBe(false);
      expect(r.output, name).toMatch(want);
    }
  });

  it("a file that isn't JSON, and one that isn't there, are refused with a word, not a crash", () => {
    const junk = path.join(scratch, "junk.json"); fs.writeFileSync(junk, "{ not json");
    expect(env.runPlanCheck(junk).ok).toBe(false);
    expect(env.runPlanCheck(path.join(scratch, "nothing.json")).ok).toBe(false);
  });
});
