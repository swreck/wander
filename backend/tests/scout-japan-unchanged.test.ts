/**
 * S1 (December plan, S2b, Nov 17 2026): Japan's trip reads to Scout exactly as it did. What is sent to the model for a trip
 * read from a spreadsheet, at a fixed clock, is held as three sha256 hashes: Scout's system prompt (captured from the
 * request the chat route really makes, with the model stubbed), the stable context and the live context. The hashes were
 * taken on the code BEFORE the slice and must be the same after. A trip built from a plan changes Scout's words; this one
 * must not change by a character, which is why no Japan exam is rerun for the slice.
 *
 * Also here: S5 (Japan's trip still has its "still at home" lines, which a plan trip must not).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";
import { cleanFixtures, makeJapan } from "./fixtures/scout-fixtures.js";

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

process.env.JWT_SECRET = "test-secret-scout-japan";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { buildGuideContextParts } = await import("../src/services/guide/scoutContext.js");
const prisma = new PrismaClient();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// The fixed clock: Oct 13 2026, 1:00 PM in California (the phone), Oct 14 5:00 AM in Japan
const NOW = new Date("2026-10-13T20:00:00Z");
const PHONE = "America/Los_Angeles";

// Taken on the code before S2b (see the header). Never edit these to make the test pass.
const HELD = {
  system: "e5dd26ef13ca3ace29a7ede276935086ea1936a09df321420b194f50583f64e1",
  stable: "d4786b2ada57a7fea3c037a5d996472fd757039698d59f02fda84ec3163fff0a",
  live: "76e27f761492eada7879d507ff2f987e2c727c26cfcade7c9d708752c2c4210f",
};

let japan: Awaited<ReturnType<typeof makeJapan>>;
let tok = "";

beforeAll(async () => {
  await cleanFixtures(prisma, "japan");
  japan = await makeJapan(prisma);
  tok = signToken({ code: "Pat Hashjp", displayName: "Pat Hashjp", travelerId: japan.travelers.pat });
});
afterAll(async () => {
  await cleanFixtures(prisma, "japan");
  await prisma.$disconnect();
});

describe("S1 Japan's trip: what Scout is sent is unchanged", () => {
  it("the system prompt, the stable context and the live context hold their hashes", async () => {
    const parts = await buildGuideContextParts(japan.tripId, { phoneZone: PHONE, now: NOW });
    sentToModel.length = 0;
    const r = await request(app).post("/api/chat").set("Authorization", `Bearer ${tok}`).send({
      message: "When is dinner?", context: { page: "Home", tripId: japan.tripId }, history: [],
      clientTime: { iso: NOW.toISOString(), localDate: "2026-10-13", localTime: "1:00 PM", weekday: "Tuesday", timeZone: PHONE },
    });
    expect(r.status).toBe(200);
    expect(sentToModel.length).toBeGreaterThan(0);
    const system = sentToModel[0].system[0].text as string;
    const got = { system: sha(system), stable: sha(parts.stable), live: sha(parts.live) };
    if (process.env.HASH_LOG) console.log("JAPAN HASHES", JSON.stringify(got));
    if (process.env.DUMP_DIR) (await import("fs")).writeFileSync(`${process.env.DUMP_DIR}/japan.txt`, `${parts.stable}\n\n=====LIVE=====\n${parts.live}\n`);
    // (the context is real: the fixture's flight, its "still at home" line, a deadline's status and the prompt's first words)
    expect(parts.stable).toContain("Julie & Andy");
    expect(parts.live).toContain("DEADLINES — STATUS RIGHT NOW");
    expect(system.startsWith("You are Scout")).toBe(true);
    expect(got).toEqual(HELD);
  });

  it("S5 Japan's trip still has its 'still at home' line for a party that hasn't flown yet", async () => {
    const parts = await buildGuideContextParts(japan.tripId, { phoneZone: PHONE, now: NOW });
    expect(parts.stable).toMatch(/\[WHERE: on this Japan date Julie & Andy are NOT in Japan/);
  });
});
