/**
 * PEOPLE & PERSONAL LINKS
 *
 * Sep 28 2026: Wander holds real booking codes, so sign-in was tightened.
 * - GET  /api/people/:tripId        everyone in the group with a plain status (members only, no link codes)
 * - POST /api/people/:tripId/link   a fresh personal link for one person (planners only)
 * - A personal link retires once its person has Face ID working after the link was made
 *   (a key set up, or an existing key used — isLinkRetired in services/passkeys.ts).
 * - Scout can't add people or change who plans.
 */

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { takeTurnsWithActiveTrip } from "./active-trip-lock.js";

// Switches the active trip: takes turns with the other files that do
takeTurnsWithActiveTrip();

process.env.ACCESS_CODES = "PEOPLE1:PLPlanner";
process.env.JWT_SECRET = "test-secret-people";

const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const prisma = new PrismaClient();

const TRIP_NAME = "People Links Trip";
const NAMES = ["PLPlanner", "PLTraveler", "PLOutsider", "PLNewbie", "PLLateKey"];

async function tokenForTraveler(displayName: string): Promise<{ token: string; travelerId: string }> {
  let traveler = await prisma.traveler.findFirst({ where: { displayName } });
  if (!traveler) traveler = await prisma.traveler.create({ data: { displayName } });
  return { token: signToken({ code: displayName, displayName, travelerId: traveler.id }), travelerId: traveler.id };
}

/** A stored Face ID key in the current shape, with the times that decide whether a link has retired. */
function credential(id: string, when: { createdAt: Date; lastUsedAt?: Date }) {
  return {
    id,
    publicKey: Buffer.from(`public-key-${id}`).toString("base64url"),
    counter: 0,
    transports: ["internal"],
    createdAt: when.createdAt.toISOString(),
    ...(when.lastUsedAt ? { lastUsedAt: when.lastUsedAt.toISOString() } : {}),
  };
}

async function setCredentials(travelerId: string, creds: unknown[]) {
  await prisma.traveler.update({ where: { id: travelerId }, data: { webauthnCredentials: creds as any } });
}

async function inviteFor(token: string) {
  const invite = await prisma.tripInvite.findUnique({ where: { inviteToken: token } });
  expect(invite).not.toBeNull();
  return invite!;
}

const ms = (d: Date, delta: number) => new Date(d.getTime() + delta);

let tripId: string;
let planner: { token: string; travelerId: string };
let traveler: { token: string; travelerId: string };
let outsider: { token: string; travelerId: string };
let newbieToken: string; // PLNewbie's invite from trip creation (unclaimed)

afterAll(async () => {
  const trips = await prisma.trip.findMany({ where: { name: TRIP_NAME } });
  for (const t of trips) await prisma.trip.delete({ where: { id: t.id } });
  await prisma.traveler.deleteMany({ where: { displayName: { in: NAMES } } }).catch(() => {});
  await prisma.$disconnect();
});

describe("Setup", () => {
  it("a planner creates the trip; a traveler joins through their own link; an outsider is not on it", async () => {
    planner = await tokenForTraveler("PLPlanner");
    outsider = await tokenForTraveler("PLOutsider");

    const res = await request(app)
      .post("/api/trips")
      .set("Authorization", `Bearer ${planner.token}`)
      .send({ name: TRIP_NAME, startDate: "2027-03-01", endDate: "2027-03-05", members: ["PLNewbie", "PLTraveler"], skipDocumentCarryOver: true });
    expect(res.status).toBe(201);
    tripId = res.body.id;
    newbieToken = res.body.invites.find((i: any) => i.expectedName === "PLNewbie").inviteToken;
    const travelerLink = res.body.invites.find((i: any) => i.expectedName === "PLTraveler").inviteToken;

    const join = await request(app).post(`/api/auth/join/${travelerLink}`).send({});
    expect(join.status).toBe(200);
    expect(join.body.displayName).toBe("PLTraveler");
    traveler = { token: join.body.token, travelerId: (await prisma.traveler.findFirst({ where: { displayName: "PLTraveler" } }))!.id };
  });
});

describe("GET /api/people/:tripId — who's in, for members only", () => {
  it("someone not on the trip can't see its people", async () => {
    const res = await request(app).get(`/api/people/${tripId}`).set("Authorization", `Bearer ${outsider.token}`);
    expect(res.status).toBe(403);
    expect(res.body.people).toBeUndefined();
  });

  it("an access-code sign-in with no traveler identity can't see them either", async () => {
    const login = await request(app).post("/api/auth/login").send({ code: "PEOPLE1" });
    expect(login.status).toBe(200);
    const res = await request(app).get(`/api/people/${tripId}`).set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
  });

  it("without signing in, nothing", async () => {
    const res = await request(app).get(`/api/people/${tripId}`);
    expect(res.status).toBe(401);
  });

  it("a traveler sees everyone with a plain status, can't send links, and sees no link codes", async () => {
    const res = await request(app).get(`/api/people/${tripId}`).set("Authorization", `Bearer ${traveler.token}`);
    expect(res.status).toBe(200);
    expect(res.body.canSendLinks).toBe(false);

    const byName = new Map(res.body.people.map((p: any) => [p.name, p]));
    expect(byName.get("PLPlanner")).toMatchObject({ travelerId: planner.travelerId, role: "planner", status: "link", faceIdPhones: 0, isMe: false });
    expect(byName.get("PLTraveler")).toMatchObject({ travelerId: traveler.travelerId, role: "traveler", status: "link", faceIdPhones: 0, isMe: true });
    // Only this trip's group: someone who isn't on it (and wasn't invited to it) doesn't appear
    expect(byName.get("PLOutsider")).toBeUndefined();
    // Invited but not in yet
    expect(byName.get("PLNewbie")).toMatchObject({ role: null, status: "not-yet", isMe: false });
    for (const p of res.body.people) {
      expect(Object.keys(p).sort()).toEqual(["faceIdPhones", "isMe", "name", "role", "status", "travelerId"]);
    }
    expect(JSON.stringify(res.body)).not.toContain(newbieToken);
  });

  it("a planner sees the same list and can send links", async () => {
    const res = await request(app).get(`/api/people/${tripId}`).set("Authorization", `Bearer ${planner.token}`);
    expect(res.status).toBe(200);
    expect(res.body.canSendLinks).toBe(true);
    expect(res.body.people.find((p: any) => p.isMe).name).toBe("PLPlanner");
  });

  it("someone with Face ID shows as face-id, with the number of phones", async () => {
    const now = new Date();
    await setCredentials(planner.travelerId, [credential("pl-phone", { createdAt: now }), credential("pl-ipad", { createdAt: now })]);
    const res = await request(app).get(`/api/people/${tripId}`).set("Authorization", `Bearer ${traveler.token}`);
    expect(res.body.people.find((p: any) => p.name === "PLPlanner")).toMatchObject({ status: "face-id", faceIdPhones: 2 });
    await setCredentials(planner.travelerId, []);
  });
});

describe("POST /api/people/:tripId/link — a fresh personal link, planners only", () => {
  it("a traveler can't make links", async () => {
    const before = await prisma.tripInvite.count({ where: { tripId } });
    const res = await request(app)
      .post(`/api/people/${tripId}/link`)
      .set("Authorization", `Bearer ${traveler.token}`)
      .send({ travelerId: planner.travelerId });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Only Ken or Larisa can send links.");
    expect(res.body.token).toBeUndefined();
    expect(await prisma.tripInvite.count({ where: { tripId } })).toBe(before);
  });

  it("someone not on the trip can't make links", async () => {
    const res = await request(app)
      .post(`/api/people/${tripId}/link`)
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ travelerId: outsider.travelerId });
    expect(res.status).toBe(403);
  });

  it("a planner asking for someone who doesn't exist gets a plain 404", async () => {
    const res = await request(app)
      .post(`/api/people/${tripId}/link`)
      .set("Authorization", `Bearer ${planner.token}`)
      .send({ travelerId: "no-such-person" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("We couldn't find that person.");
  });

  it("a link for someone already on the trip just signs them in", async () => {
    const res = await request(app)
      .post(`/api/people/${tripId}/link`)
      .set("Authorization", `Bearer ${planner.token}`)
      .send({ travelerId: traveler.travelerId });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("PLTraveler");
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);

    const invite = await inviteFor(res.body.token);
    expect(invite.claimedByTravelerId).toBe(traveler.travelerId);

    const peek = await request(app).get(`/api/auth/join/${res.body.token}`);
    expect(peek.status).toBe(200);
    expect(peek.body).toMatchObject({ tripId, personalInvite: true, expectedName: "PLTraveler", alreadyClaimed: true });

    const join = await request(app).post(`/api/auth/join/${res.body.token}`).send({});
    expect(join.status).toBe(200);
    expect(join.body).toMatchObject({ displayName: "PLTraveler", alreadyMember: true, tripId });
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${join.body.token}`);
    expect(me.body.travelerId).toBe(traveler.travelerId);

    // Still one membership, still a traveler
    const members = await prisma.tripMember.findMany({ where: { tripId, travelerId: traveler.travelerId } });
    expect(members.map((m) => m.role)).toEqual(["traveler"]);
  });

  it("a link for someone not yet on the trip adds them as a traveler when they open it", async () => {
    const res = await request(app)
      .post(`/api/people/${tripId}/link`)
      .set("Authorization", `Bearer ${planner.token}`)
      .send({ travelerId: outsider.travelerId });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("PLOutsider");
    expect((await inviteFor(res.body.token)).claimedByTravelerId).toBeNull();

    const join = await request(app).post(`/api/auth/join/${res.body.token}`).send({});
    expect(join.status).toBe(200);
    expect(join.body.displayName).toBe("PLOutsider");
    expect(join.body.tripId).toBe(tripId);

    const member = await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId, travelerId: outsider.travelerId } } });
    expect(member?.role).toBe("traveler");
    expect((await prisma.trip.findUnique({ where: { id: tripId } }))?.status).toBe("active");
    expect(await prisma.traveler.count({ where: { displayName: "PLOutsider" } })).toBe(1);

    // They now appear on the trip, and can see its people
    const people = await request(app).get(`/api/people/${tripId}`).set("Authorization", `Bearer ${join.body.token}`);
    expect(people.status).toBe(200);
    expect(people.body.people.find((p: any) => p.isMe)).toMatchObject({ name: "PLOutsider", role: "traveler", status: "link" });
  });
});

describe("Link retirement — once Face ID works, the link has done its job", () => {
  it("a link stops working once its person sets up Face ID after it was made", async () => {
    const res = await request(app)
      .post(`/api/people/${tripId}/link`)
      .set("Authorization", `Bearer ${planner.token}`)
      .send({ travelerId: traveler.travelerId });
    const link = res.body.token;
    const invite = await inviteFor(link);
    expect((await request(app).get(`/api/auth/join/${link}`)).status).toBe(200);

    await setCredentials(traveler.travelerId, [credential("tr-phone", { createdAt: ms(invite.createdAt, 1) })]);

    const peek = await request(app).get(`/api/auth/join/${link}`);
    expect(peek.status).toBe(410);
    expect(peek.body.retired).toBe(true);
    expect(peek.body.error).toMatch(/^PLTraveler already uses Face ID, so this link has done its job/);
    expect(peek.body.tripName).toBeUndefined();

    const join = await request(app).post(`/api/auth/join/${link}`).send({});
    expect(join.status).toBe(410);
    expect(join.body.retired).toBe(true);
    expect(join.body.token).toBeUndefined();

    // A planner can send a new one at any time, and it works
    const fresh = await request(app)
      .post(`/api/people/${tripId}/link`)
      .set("Authorization", `Bearer ${planner.token}`)
      .send({ travelerId: traveler.travelerId });
    expect(fresh.status).toBe(200);
    const freshJoin = await request(app).post(`/api/auth/join/${fresh.body.token}`).send({});
    expect(freshJoin.status).toBe(200);
    expect(freshJoin.body.displayName).toBe("PLTraveler");

    await setCredentials(traveler.travelerId, []);
  });

  it("a Face ID key set up before the link (and not used since) leaves the link working — a new phone", async () => {
    const res = await request(app)
      .post(`/api/people/${tripId}/link`)
      .set("Authorization", `Bearer ${planner.token}`)
      .send({ travelerId: traveler.travelerId });
    const invite = await inviteFor(res.body.token);
    await setCredentials(traveler.travelerId, [
      credential("old-phone", { createdAt: ms(invite.createdAt, -86_400_000), lastUsedAt: ms(invite.createdAt, -60_000) }),
    ]);

    const peek = await request(app).get(`/api/auth/join/${res.body.token}`);
    expect(peek.status).toBe(200);
    const join = await request(app).post(`/api/auth/join/${res.body.token}`).send({});
    expect(join.status).toBe(200);
    expect(join.body.displayName).toBe("PLTraveler");

    await setCredentials(traveler.travelerId, []);
  });

  it("using an older Face ID key after the link was made also retires it", async () => {
    const res = await request(app)
      .post(`/api/people/${tripId}/link`)
      .set("Authorization", `Bearer ${planner.token}`)
      .send({ travelerId: traveler.travelerId });
    const invite = await inviteFor(res.body.token);
    await setCredentials(traveler.travelerId, [
      credential("old-phone", { createdAt: ms(invite.createdAt, -86_400_000), lastUsedAt: ms(invite.createdAt, 1) }),
    ]);

    const join = await request(app).post(`/api/auth/join/${res.body.token}`).send({});
    expect(join.status).toBe(410);
    expect(join.body.retired).toBe(true);

    await setCredentials(traveler.travelerId, []);
  });

  it("a not-yet-opened link retires when the person it names already set up Face ID after it was made", async () => {
    // PLNewbie's link came with the trip; PLNewbie then got into Wander another way and set up Face ID.
    const invite = await inviteFor(newbieToken);
    expect(invite.claimedByTravelerId).toBeNull();
    expect((await request(app).get(`/api/auth/join/${newbieToken}`)).status).toBe(200);

    const newbie = await tokenForTraveler("PLNewbie");
    await setCredentials(newbie.travelerId, [credential("nb-phone", { createdAt: ms(invite.createdAt, 1) })]);

    const peek = await request(app).get(`/api/auth/join/${newbieToken}`);
    expect(peek.status).toBe(410);
    expect(peek.body.retired).toBe(true);
    expect(peek.body.expectedName).toBe("PLNewbie");
    const join = await request(app).post(`/api/auth/join/${newbieToken}`).send({});
    expect(join.status).toBe(410);
    expect(await prisma.tripMember.findFirst({ where: { tripId, travelerId: newbie.travelerId } })).toBeNull();
  });

  // SUSPECTED PRODUCT BUG — left failing on purpose (see report, Sep 28 2026).
  // POST /api/trips/:id/resend-invite (and Scout's resend_invite, now withdrawn) give the SAME invite
  // row a new code but keep its original createdAt. For someone who set up Face ID after their first link, the
  // "new" link is therefore born retired: the planner hands over a link that only says "already
  // uses Face ID". People → Send link (POST /api/people/:tripId/link) makes a new row and is fine.
  // No screen calls resend-invite today (TripMembers.tsx is not mounted), so this is latent.
  it("resending a link to someone who already uses Face ID gives a link that works", async () => {
    const add = await request(app)
      .post(`/api/trips/${tripId}/add-members`)
      .set("Authorization", `Bearer ${planner.token}`)
      .send({ names: ["PLLateKey"] });
    expect(add.status).toBe(200);
    const first = add.body.created[0].token;
    expect((await request(app).post(`/api/auth/join/${first}`).send({})).status).toBe(200);
    const late = await prisma.traveler.findFirst({ where: { displayName: "PLLateKey" } });
    const invite = await inviteFor(first);
    await setCredentials(late!.id, [credential("late-phone", { createdAt: ms(invite.createdAt, 1) })]);

    // Their phone is lost; the planner resends
    const resend = await request(app)
      .post(`/api/trips/${tripId}/resend-invite`)
      .set("Authorization", `Bearer ${planner.token}`)
      .send({ inviteId: invite.id });
    expect(resend.status).toBe(200);
    const peek = await request(app).get(`/api/auth/join/${resend.body.invite.inviteToken}`);
    expect(peek.status).toBe(200);
  });
});

describe("Scout can't hand out ways in", () => {
  const chatSource = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/routes/chat.ts"),
    "utf8",
  );
  const withdrawnBlock = chatSource.match(/const WITHDRAWN_TOOLS = new Set\(\[([\s\S]*?)\]\);/);
  const withdrawn = new Set([...(withdrawnBlock?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));

  it("adding people and changing who plans are withdrawn from Scout", () => {
    expect(withdrawnBlock).not.toBeNull();
    expect(withdrawn.has("add_trip_members")).toBe(true);
    expect(withdrawn.has("change_member_role")).toBe(true);
  });

  // Scout's resend_invite has no planner check of its own: while offered, any signed-in traveler
  // could ask "send Larisa a new link" and get a working link that signs in AS Larisa (the claim
  // matches her existing traveler by name). It must stay withdrawn, or gain a planner check.
  it("Scout's resend_invite is withdrawn or checks for a planner", () => {
    const caseBody = chatSource.match(/case "resend_invite": \{([\s\S]*?)\n    case "/)?.[1] ?? "";
    expect(caseBody).not.toBe("");
    const guarded = withdrawn.has("resend_invite") || /planner/i.test(caseBody);
    expect(guarded).toBe(true);
  });
});
