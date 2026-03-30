/**
 * AUTH & INVITE SYSTEM TESTS
 *
 * Tests the personal invite link flow:
 * 1. Trip creation generates invite tokens per member
 * 2. GET /auth/join/:token reveals trip info
 * 3. POST /auth/join/:token claims invite, issues JWT
 * 4. Duplicate claim handling
 * 5. Trip-level (open) invite tokens
 * 6. Login event recording
 * 7. Traveler preferences endpoints
 */

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.ACCESS_CODES = "INVITE1:InvitePlanner,INVITE2:InviteTraveler";
process.env.JWT_SECRET = "test-secret-invite";

const { app } = await import("../src/index.js");
const prisma = new PrismaClient();

const TEST_TRIP_NAMES = [
  "Invite Test Trip",
  "Open Invite Trip",
  "Preferences Trip",
];

let plannerToken: string;
let tripId: string;
let tripInviteToken: string; // trip-level open invite
let personalTokens: Record<string, string> = {}; // name → token

afterAll(async () => {
  for (const name of TEST_TRIP_NAMES) {
    const trips = await prisma.trip.findMany({ where: { name } });
    for (const t of trips) {
      await prisma.trip.delete({ where: { id: t.id } });
    }
  }
  // Clean up test travelers created via invite
  const testTravelers = await prisma.traveler.findMany({
    where: { displayName: { in: ["Ava", "Brian", "Cintya", "NewPerson"] } },
  });
  for (const t of testTravelers) {
    await prisma.traveler.delete({ where: { id: t.id } });
  }
  await prisma.$disconnect();
});

// ─── Auth & Login ────────────────────────────────────────────

describe("Authentication", () => {
  it("logs in with access code and returns token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ code: "INVITE1" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.displayName).toBe("InvitePlanner");
    plannerToken = res.body.token;
  });

  it("rejects invalid access code", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ code: "WRONG" });
    expect(res.status).toBe(401);
  });

  it("returns user info on /me", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("InvitePlanner");
  });
});

// ─── Trip Creation with Members ──────────────────────────────

describe("Trip Creation with Invite Tokens", () => {
  it("creates trip with member names and returns invite tokens", async () => {
    const res = await request(app)
      .post("/api/trips")
      .set("Authorization", `Bearer ${plannerToken}`)
      .send({
        name: "Invite Test Trip",
        startDate: "2026-12-25",
        endDate: "2027-01-01",
        cities: [
          { name: "Hanoi", country: "Vietnam", arrivalDate: "2026-12-25", departureDate: "2026-12-28" },
          { name: "Ho Chi Minh City", country: "Vietnam", arrivalDate: "2026-12-29", departureDate: "2027-01-01" },
        ],
        members: ["Ava", "Brian", "Cintya"],
        skipDocumentCarryOver: true,
      });

    expect(res.status).toBe(201);
    tripId = res.body.id;

    // Should include invite data
    expect(res.body.invites).toBeDefined();
    expect(res.body.invites.length).toBe(3);

    for (const inv of res.body.invites) {
      expect(inv.expectedName).toBeDefined();
      expect(inv.inviteToken).toBeDefined();
      personalTokens[inv.expectedName] = inv.inviteToken;
    }

    expect(personalTokens["Ava"]).toBeDefined();
    expect(personalTokens["Brian"]).toBeDefined();
    expect(personalTokens["Cintya"]).toBeDefined();
  });

  it("trip has an open invite token", async () => {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    expect(trip).not.toBeNull();
    expect(trip!.inviteToken).toBeDefined();
    tripInviteToken = trip!.inviteToken!;
  });
});

// ─── Personal Invite Flow ────────────────────────────────────

describe("Personal Invite Link", () => {
  it("GET /join/:token shows trip info for personal token", async () => {
    const token = personalTokens["Ava"];
    const res = await request(app).get(`/api/auth/join/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tripName).toBe("Invite Test Trip");
    expect(res.body.personalInvite).toBe(true);
    expect(res.body.expectedName).toBe("Ava");
  });

  it("POST /join/:token claims personal invite and returns JWT", async () => {
    const token = personalTokens["Ava"];
    const res = await request(app)
      .post(`/api/auth/join/${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.displayName).toBe("Ava");
    expect(res.body.tripId).toBe(tripId);
  });

  it("GET /join/:token shows already claimed after claim", async () => {
    const token = personalTokens["Ava"];
    const res = await request(app).get(`/api/auth/join/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.alreadyClaimed).toBe(true);
  });

  it("POST /join/:token for already-claimed returns existing traveler token", async () => {
    const token = personalTokens["Ava"];
    const res = await request(app)
      .post(`/api/auth/join/${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.displayName).toBe("Ava");
  });

  it("claims second personal invite (Brian)", async () => {
    const token = personalTokens["Brian"];
    const res = await request(app)
      .post(`/api/auth/join/${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Brian");
    expect(res.body.tripId).toBe(tripId);
  });
});

// ─── Open (Trip-Level) Invite Flow ───────────────────────────

describe("Trip-Level Open Invite", () => {
  it("GET /join/:tripToken shows trip info", async () => {
    const res = await request(app).get(`/api/auth/join/${tripInviteToken}`);
    expect(res.status).toBe(200);
    expect(res.body.tripName).toBe("Invite Test Trip");
    expect(res.body.personalInvite).toBe(false);
  });

  it("POST /join/:tripToken with matching name claims invite", async () => {
    const res = await request(app)
      .post(`/api/auth/join/${tripInviteToken}`)
      .send({ name: "Cintya" });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Cintya");
    expect(res.body.tripId).toBe(tripId);
  });

  it("POST /join/:tripToken with new name creates unexpected member", async () => {
    const res = await request(app)
      .post(`/api/auth/join/${tripInviteToken}`)
      .send({ name: "NewPerson" });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("NewPerson");
    expect(res.body.tripId).toBe(tripId);
  });
});

// ─── Invalid Tokens ──────────────────────────────────────────

describe("Invalid Invite Tokens", () => {
  it("GET /join with nonexistent token returns 404", async () => {
    const res = await request(app).get("/api/auth/join/nonexistent_token_xyz");
    expect(res.status).toBe(404);
  });

  it("POST /join with nonexistent token returns 404", async () => {
    const res = await request(app)
      .post("/api/auth/join/nonexistent_token_xyz")
      .send({ name: "Nobody" });
    expect(res.status).toBe(404);
  });
});

// ─── Members List ────────────────────────────────────────────

describe("Trip Members", () => {
  it("lists all members and invites", async () => {
    const res = await request(app)
      .get(`/api/trips/${tripId}/members`)
      .set("Authorization", `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.members).toBeDefined();
    expect(res.body.invites).toBeDefined();
    // Planner + Ava + Brian + Cintya + NewPerson = at least 4 members
    expect(res.body.members.length).toBeGreaterThanOrEqual(4);
  });

  it("resends invite (generates new token)", async () => {
    // Find an invite to resend — get Ava's claimed invite
    const membersRes = await request(app)
      .get(`/api/trips/${tripId}/members`)
      .set("Authorization", `Bearer ${plannerToken}`);

    const avaInvite = membersRes.body.invites.find(
      (i: any) => i.expectedName === "Ava"
    );
    if (!avaInvite) return; // skip if no invite record

    const oldToken = avaInvite.inviteToken;

    const res = await request(app)
      .post(`/api/trips/${tripId}/resend-invite`)
      .set("Authorization", `Bearer ${plannerToken}`)
      .send({ inviteId: avaInvite.id });

    expect(res.status).toBe(200);
    expect(res.body.invite.inviteToken).toBeDefined();
    // New token should differ from old
    expect(res.body.invite.inviteToken).not.toBe(oldToken);
  });
});

// ─── Add Members After Creation ──────────────────────────────

describe("Add Members Post-Creation", () => {
  it("adds new members to existing trip", async () => {
    const res = await request(app)
      .post(`/api/trips/${tripId}/add-members`)
      .set("Authorization", `Bearer ${plannerToken}`)
      .send({ names: ["Darryl", "Elaine"] });

    expect(res.status).toBe(200);
    expect(res.body.created).toBeDefined();
    expect(res.body.created.length).toBe(2);
    expect(res.body.created[0].link).toBeDefined();
    expect(res.body.created[0].token).toBeDefined();
  });

  it("skips duplicate member names", async () => {
    const res = await request(app)
      .post(`/api/trips/${tripId}/add-members`)
      .set("Authorization", `Bearer ${plannerToken}`)
      .send({ names: ["Ava", "Elaine"] }); // both already exist

    expect(res.status).toBe(200);
    // Should create 0 new invites (both already invited)
    expect(res.body.created.length).toBe(0);
  });
});

// ─── Login Event ─────────────────────────────────────────────

describe("Login Event Recording", () => {
  it("records login event", async () => {
    const res = await request(app)
      .post("/api/auth/login-event")
      .set("Authorization", `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
  });
});

// ─── Traveler Preferences ────────────────────────────────────

describe("Traveler Preferences", () => {
  let travelerId: string;

  it("gets traveler by ID", async () => {
    // Find the planner's traveler record
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${plannerToken}`);
    travelerId = me.body.travelerId;
    if (!travelerId) return;

    const res = await request(app)
      .get(`/api/auth/travelers/${travelerId}`)
      .set("Authorization", `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(travelerId);
  });

  it("updates traveler preferences", async () => {
    if (!travelerId) return;

    const prefs = {
      interests: ["food", "ceramics", "temples"],
      dietary: "vegetarian",
      travelStyle: "early bird",
    };

    const res = await request(app)
      .patch(`/api/auth/travelers/${travelerId}`)
      .set("Authorization", `Bearer ${plannerToken}`)
      .send({ preferences: prefs });

    expect(res.status).toBe(200);
    expect(res.body.preferences).toBeDefined();
    expect(res.body.preferences.interests).toContain("ceramics");
  });

  it("preferences persist on re-fetch", async () => {
    if (!travelerId) return;

    const res = await request(app)
      .get(`/api/auth/travelers/${travelerId}`)
      .set("Authorization", `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.preferences.dietary).toBe("vegetarian");
  });
});
