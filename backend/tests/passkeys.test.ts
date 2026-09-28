/**
 * PASSKEY (FACE ID) SIGN-IN TESTS (Sep 2026)
 *
 * 1. Old vault credentials (id stored as an array of characters, key as byte values) read correctly
 * 2. In production, tapping a name no longer signs anyone in; secret access codes still work
 * 3. Face ID sign-in rejects missing or unknown credentials without crashing
 * 4. Setting up Face ID requires being signed in
 * 5. The login screen is told which sign-in methods exist
 */

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.ACCESS_CODES = "PASS1:PasskeyTester";
process.env.JWT_SECRET = "test-secret-passkeys";

const { app } = await import("../src/index.js");
const { normalizeCredentials, publicKeyBytes } = await import("../src/services/passkeys.js");
const prisma = new PrismaClient();

const TRAVELER_NAME = "Passkey Test Traveler";

afterAll(async () => {
  await prisma.traveler.deleteMany({ where: { displayName: TRAVELER_NAME } });
  await prisma.$disconnect();
});

describe("Stored credentials", () => {
  it("reads the old vault shape (id as characters, key as bytes)", () => {
    const legacy = [{ credentialID: ["a", "B", "c", "-", "_"], publicKey: [1, 2, 3, 250], counter: 0, transports: ["internal"] }];
    const [c] = normalizeCredentials(legacy);
    expect(c.id).toBe("aBc-_");
    expect(Array.from(publicKeyBytes(c))).toEqual([1, 2, 3, 250]);
    expect(c.transports).toEqual(["internal"]);
  });

  it("reads the current shape unchanged", () => {
    const current = [{ id: "xyz", publicKey: Buffer.from([9, 8, 7]).toString("base64url"), counter: 4, transports: [] }];
    const [c] = normalizeCredentials(current);
    expect(c.id).toBe("xyz");
    expect(c.counter).toBe(4);
    expect(Array.from(publicKeyBytes(c))).toEqual([9, 8, 7]);
  });

  it("ignores empty or malformed entries", () => {
    expect(normalizeCredentials(null)).toEqual([]);
    expect(normalizeCredentials([{ nothing: true }, null])).toEqual([]);
  });
});

describe("Name sign-in", () => {
  it("works outside production (development and tests)", async () => {
    await prisma.traveler.upsert({ where: { displayName: TRAVELER_NAME }, create: { displayName: TRAVELER_NAME }, update: {} });
    const res = await request(app).post("/api/auth/login").send({ code: TRAVELER_NAME });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("is refused in production — tapping a name no longer signs anyone in", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await request(app).post("/api/auth/login").send({ code: TRAVELER_NAME });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Face ID/);
      const methods = await request(app).get("/api/auth/login-methods");
      expect(methods.body.nameLogin).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it("secret access codes still sign in, even in production", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await request(app).post("/api/auth/login").send({ code: "PASS1" });
      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe("PasskeyTester");
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe("Face ID sign-in endpoints", () => {
  it("login-methods reports Face ID available", async () => {
    const res = await request(app).get("/api/auth/login-methods");
    expect(res.status).toBe(200);
    expect(res.body.passkey).toBe(true);
  });

  it("login-options returns a challenge without needing to know who you are", async () => {
    const res = await request(app).post("/api/auth/passkey/login-options");
    expect(res.status).toBe(200);
    expect(res.body.options.challenge).toBeTruthy();
    expect(res.body.challengeToken).toBeTruthy();
    expect(res.body.options.allowCredentials || []).toEqual([]);
  });

  it("login-verify rejects missing details", async () => {
    const res = await request(app).post("/api/auth/passkey/login-verify").send({});
    expect(res.status).toBe(400);
  });

  it("login-verify rejects an unknown credential with a plain explanation", async () => {
    const opts = await request(app).post("/api/auth/passkey/login-options");
    const res = await request(app).post("/api/auth/passkey/login-verify").send({
      challengeToken: opts.body.challengeToken,
      response: { id: "not-a-real-credential", rawId: "not-a-real-credential", type: "public-key", response: {} },
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/personal link/);
  });

  it("login-verify rejects a forged challenge token", async () => {
    const res = await request(app).post("/api/auth/passkey/login-verify").send({
      challengeToken: "garbage",
      response: { id: "x", rawId: "x", type: "public-key", response: {} },
    });
    expect(res.status).toBe(401);
  });

  it("setting up Face ID requires being signed in", async () => {
    const res = await request(app).post("/api/auth/passkey/register-options").send({});
    expect(res.status).toBe(401);
  });

  it("a signed-in traveler gets setup options for a sign-in-capable passkey", async () => {
    const login = await request(app).post("/api/auth/login").send({ code: TRAVELER_NAME });
    const res = await request(app)
      .post("/api/auth/passkey/register-options")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.options.authenticatorSelection.residentKey).toBe("required");
    expect(res.body.options.authenticatorSelection.userVerification).toBe("required");
    expect(res.body.challengeToken).toBeTruthy();
  });
});
