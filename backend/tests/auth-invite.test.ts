/**
 * AUTH & INVITE SYSTEM TESTS
 *
 * Tests the personal invite link flow:
 * 1. Trip creation generates invite tokens per member
 * 2. GET /auth/join/:token reveals trip info
 * 3. POST /auth/join/:token claims invite, issues JWT
 * 4. Duplicate claim handling
 * 5. The trip-wide (open) link is switched off (Sep 28 2026 — Wander holds booking codes)
 * 6. Only planners invite, resend or add people; the members list never shows link codes
 * 7. Login event recording
 * 8. Traveler preferences endpoints
 */

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { takeTurnsWithActiveTrip } from "./active-trip-lock.js";

// Switches the active trip: takes turns with the other files that do
takeTurnsWithActiveTrip();

process.env.ACCESS_CODES = "INVITE1:InvitePlanner,INVITE2:InviteTraveler";
process.env.JWT_SECRET = "test-secret-invite";

const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const prisma = new PrismaClient();

const OPEN_LINK_OFF = "This trip no longer has an open invitation link. Ask Ken or Larisa to send you your own link from People in Wander.";

/**
 * A token for a real traveler. Access-code sign-in carries no traveler identity, so it can
 * never be a planner; planner-only actions need someone who is on the trip as a planner
 * (creating a trip makes its creator one).
 */
async function tokenForTraveler(displayName: string): Promise<{ token: string; travelerId: string }> {
  let traveler = await prisma.traveler.findFirst({ where: { displayName } });
  if (!traveler) traveler = await prisma.traveler.create({ data: { displayName } });
  return { token: signToken({ code: displayName, displayName, travelerId: traveler.id }), travelerId: traveler.id };
}

const TEST_TRIP_NAMES = [
  "Invite Test Trip",
  "Open Invite Trip",
  "Preferences Trip",
];

let plannerToken: string;
let avaToken: string; // a traveler (not a planner) on the trip
let tripId: string;
let tripInviteToken: string; // trip-level open invite (switched off)
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
    where: { displayName: { in: ["Ava", "Brian", "Cintya", "NewPerson", "InvitePlanner"] } },
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
    // The planner acts with a traveler identity from here on (see tokenForTraveler).
    plannerToken = (await tokenForTraveler("InvitePlanner")).token;
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
    avaToken = res.body.token;

    // She's on the trip as a traveler, not a planner
    const member = await prisma.tripMember.findFirst({
      where: { tripId, traveler: { displayName: "Ava" } },
    });
    expect(member?.role).toBe("traveler");
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

// ─── Open (Trip-Level) Invite Flow — switched off ────────────
// Anyone holding the trip-wide link could join under any name. Wander now holds booking
// codes, so the trip-wide link is off and everyone gets their own link from People.

describe("Trip-Level Open Invite", () => {
  it("GET /join/:tripToken says the open link is off and reveals nothing about the trip", async () => {
    const res = await request(app).get(`/api/auth/join/${tripInviteToken}`);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe(OPEN_LINK_OFF);
    expect(res.body.tripName).toBeUndefined();
    expect(res.body.tripId).toBeUndefined();
    expect(res.body.currentMembers).toBeUndefined();
  });

  it("POST /join/:tripToken with an invited person's name does not sign them in", async () => {
    const res = await request(app)
      .post(`/api/auth/join/${tripInviteToken}`)
      .send({ name: "Cintya" });
    expect(res.status).toBe(410);
    expect(res.body.error).toBe(OPEN_LINK_OFF);
    expect(res.body.token).toBeUndefined();

    // Cintya's own invite is untouched, and she is not on the trip
    const invite = await prisma.tripInvite.findFirst({ where: { tripId, expectedName: "Cintya" } });
    expect(invite?.claimedByTravelerId).toBeNull();
    const member = await prisma.tripMember.findFirst({ where: { tripId, traveler: { displayName: "Cintya" } } });
    expect(member).toBeNull();
  });

  it("POST /join/:tripToken with a stranger's name creates nobody", async () => {
    const res = await request(app)
      .post(`/api/auth/join/${tripInviteToken}`)
      .send({ name: "NewPerson" });
    expect(res.status).toBe(410);
    expect(res.body.token).toBeUndefined();
    const stranger = await prisma.traveler.findFirst({ where: { displayName: "NewPerson" } });
    expect(stranger).toBeNull();
  });

  it("Cintya's own personal link still signs her in", async () => {
    const res = await request(app)
      .post(`/api/auth/join/${personalTokens["Cintya"]}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Cintya");
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
  it("lists all members and invites, and never shows a link code", async () => {
    const res = await request(app)
      .get(`/api/trips/${tripId}/members`)
      .set("Authorization", `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.members).toBeDefined();
    expect(res.body.invites).toBeDefined();
    // Planner + Ava + Brian + Cintya (each through a personal link)
    const names = res.body.members.map((m: any) => m.displayName);
    expect(names).toEqual(expect.arrayContaining(["InvitePlanner", "Ava", "Brian", "Cintya"]));
    expect(res.body.members.find((m: any) => m.displayName === "InvitePlanner").role).toBe("planner");
    expect(names).not.toContain("NewPerson");

    // Each link code signs someone in, so none appear in the list
    expect(res.body.inviteToken).toBeUndefined();
    expect(res.body.invites.length).toBe(3);
    for (const inv of res.body.invites) {
      expect(Object.keys(inv).sort()).toEqual(["claimed", "claimedAt", "expectedName", "id"]);
    }
    expect(JSON.stringify(res.body)).not.toContain(personalTokens["Brian"]);
    expect(res.body.invites.find((i: any) => i.expectedName === "Ava").claimed).toBe(true);
  });

  it("a traveler can't resend someone's invite", async () => {
    const membersRes = await request(app)
      .get(`/api/trips/${tripId}/members`)
      .set("Authorization", `Bearer ${plannerToken}`);
    const brianInvite = membersRes.body.invites.find((i: any) => i.expectedName === "Brian");

    const res = await request(app)
      .post(`/api/trips/${tripId}/resend-invite`)
      .set("Authorization", `Bearer ${avaToken}`)
      .send({ inviteId: brianInvite.id });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/^Only Ken or Larisa can invite people/);
    expect(res.body.personalLink).toBeUndefined();

    // Brian's link is unchanged
    const peek = await request(app).get(`/api/auth/join/${personalTokens["Brian"]}`);
    expect(peek.status).toBe(200);
  });

  it("resending gives Ava a new working personal link and retires the old one", async () => {
    const membersRes = await request(app)
      .get(`/api/trips/${tripId}/members`)
      .set("Authorization", `Bearer ${plannerToken}`);
    const avaInvite = membersRes.body.invites.find((i: any) => i.expectedName === "Ava");
    expect(avaInvite).toBeDefined();
    const oldToken = personalTokens["Ava"];

    const res = await request(app)
      .post(`/api/trips/${tripId}/resend-invite`)
      .set("Authorization", `Bearer ${plannerToken}`)
      .send({ inviteId: avaInvite.id });

    expect(res.status).toBe(200);
    const newToken = res.body.invite.inviteToken;
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);
    expect(res.body.personalLink).toContain(`/join/${newToken}`);

    // The new link shows Ava's trip and signs her in as herself
    const peek = await request(app).get(`/api/auth/join/${newToken}`);
    expect(peek.status).toBe(200);
    expect(peek.body.expectedName).toBe("Ava");
    const join = await request(app).post(`/api/auth/join/${newToken}`).send({});
    expect(join.status).toBe(200);
    expect(join.body.displayName).toBe("Ava");
    expect(join.body.tripId).toBe(tripId);

    // The old link no longer opens anything
    const oldPeek = await request(app).get(`/api/auth/join/${oldToken}`);
    expect(oldPeek.status).toBe(404);
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
    expect(res.body.created[0].link).toContain(`/join/${res.body.created[0].token}`);

    // Darryl's new personal link opens the trip for him
    const darryl = res.body.created.find((c: any) => c.name === "Darryl");
    const peek = await request(app).get(`/api/auth/join/${darryl.token}`);
    expect(peek.status).toBe(200);
    expect(peek.body.personalInvite).toBe(true);
    expect(peek.body.expectedName).toBe("Darryl");
  });

  it("a traveler can't add people to the trip", async () => {
    const res = await request(app)
      .post(`/api/trips/${tripId}/add-members`)
      .set("Authorization", `Bearer ${avaToken}`)
      .send({ names: ["AvasFriend"] });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/^Only Ken or Larisa can invite people/);
    const invite = await prisma.tripInvite.findFirst({ where: { tripId, expectedName: "AvasFriend" } });
    expect(invite).toBeNull();
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
