/**
 * LETTING SOMEONE IN, AND EACH TRIP ITS OWN GROUP (Sep 28 2026)
 *
 * Ken plans two trips with two groups. "Into Wander" and "onto a trip" are different things:
 * - POST /api/people/:tripId/add { name }: a planner of THAT trip lets a person in — new people are
 *   created when they open their link; someone already in Wander keeps their account and gets the trip.
 * - A person sees only their own trips: /api/trips, /api/trips/:id, /api/trips/active.
 * - /api/manifest.json?start=/join/<code>: the Home Screen icon for an invite opens that invite.
 */

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-people-add";

const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const prisma = new PrismaClient();

const TRIP_ONE = "PS Japan Group Trip";
const TRIP_TWO = "PS Vietnam Group Trip";
const NAMES = ["PSPlanner", "PSTraveler", "PSNewcomer", "PSOther"];

async function tokenFor(displayName: string) {
  let t = await prisma.traveler.findFirst({ where: { displayName } });
  if (!t) t = await prisma.traveler.create({ data: { displayName } });
  return { token: signToken({ code: displayName, displayName, travelerId: t.id }), travelerId: t.id };
}

let planner: { token: string; travelerId: string };
let tripOne: string;
let tripTwo: string;
let newcomerToken = "";
let newcomerId = "";

afterAll(async () => {
  for (const name of [TRIP_ONE, TRIP_TWO]) {
    const trips = await prisma.trip.findMany({ where: { name } });
    for (const t of trips) await prisma.trip.delete({ where: { id: t.id } });
  }
  await prisma.traveler.deleteMany({ where: { displayName: { in: NAMES } } }).catch(() => {});
  await prisma.$disconnect();
});

describe("Setup: one planner, two trips", () => {
  it("creates both trips (the planner plans each)", async () => {
    planner = await tokenFor("PSPlanner");
    const one = await request(app).post("/api/trips").set("Authorization", `Bearer ${planner.token}`)
      .send({ name: TRIP_ONE, startDate: "2027-04-01", endDate: "2027-04-05", members: ["PSTraveler"], skipDocumentCarryOver: true });
    expect(one.status).toBe(201);
    tripOne = one.body.id;
    const two = await request(app).post("/api/trips").set("Authorization", `Bearer ${planner.token}`)
      .send({ name: TRIP_TWO, startDate: "2027-06-01", endDate: "2027-06-05", skipDocumentCarryOver: true });
    expect(two.status).toBe(201);
    tripTwo = two.body.id;
  });
});

describe("Add someone", () => {
  it("a planner makes an invite for someone new to Wander", async () => {
    const res = await request(app).post(`/api/people/${tripOne}/add`).set("Authorization", `Bearer ${planner.token}`).send({ name: "  PSNewcomer " });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("PSNewcomer");
    expect(res.body.tripName).toBe(TRIP_ONE);
    expect(res.body.alreadyInWander).toBe(false);
    expect(res.body.alreadyOnTrip).toBe(false);
    expect(typeof res.body.token).toBe("string");
    newcomerToken = res.body.token;
    // Nobody is created until they open it
    expect(await prisma.traveler.findFirst({ where: { displayName: "PSNewcomer" } })).toBeNull();
  });

  it("the invite shows on People as invited, not yet in", async () => {
    const res = await request(app).get(`/api/people/${tripOne}`).set("Authorization", `Bearer ${planner.token}`);
    expect(res.status).toBe(200);
    const row = res.body.people.find((p: { name: string }) => p.name === "PSNewcomer");
    expect(row?.status).toBe("not-yet");
    expect(JSON.stringify(res.body)).not.toContain(newcomerToken);
  });

  it("opening it creates the person, puts them on this trip, and signs them in", async () => {
    const res = await request(app).post(`/api/auth/join/${newcomerToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("PSNewcomer");
    const t = await prisma.traveler.findFirst({ where: { displayName: "PSNewcomer" } });
    expect(t).not.toBeNull();
    newcomerId = t!.id;
    const m = await prisma.tripMember.findUnique({ where: { tripId_travelerId: { tripId: tripOne, travelerId: newcomerId } } });
    expect(m?.role).toBe("traveler");
  });

  it("a traveler (not a planner) can't add people", async () => {
    const trav = await tokenFor("PSTraveler");
    // PSTraveler joins trip one through their invite from trip creation
    const inv = await prisma.tripInvite.findFirst({ where: { tripId: tripOne, expectedName: "PSTraveler" } });
    await request(app).post(`/api/auth/join/${inv!.inviteToken}`).send({});
    const res = await request(app).post(`/api/people/${tripOne}/add`).set("Authorization", `Bearer ${trav.token}`).send({ name: "PSOther" });
    expect(res.status).toBe(403);
    expect(await prisma.tripInvite.findFirst({ where: { tripId: tripOne, expectedName: "PSOther" } })).toBeNull();
  });

  it("someone not on a trip can't add people to it", async () => {
    const other = await tokenFor("PSOther");
    const res = await request(app).post(`/api/people/${tripOne}/add`).set("Authorization", `Bearer ${other.token}`).send({ name: "Anyone" });
    expect(res.status).toBe(403);
  });

  it("a name is needed", async () => {
    for (const name of ["", "   ", "1234", "x".repeat(41)]) {
      const res = await request(app).post(`/api/people/${tripOne}/add`).set("Authorization", `Bearer ${planner.token}`).send({ name });
      expect(res.status).toBe(400);
    }
  });

  it("a name already in Wander makes no link until the planner says it's the same person", async () => {
    const before = await prisma.tripInvite.count({ where: { tripId: tripOne } });
    const res = await request(app).post(`/api/people/${tripOne}/add`).set("Authorization", `Bearer ${planner.token}`).send({ name: "psnewcomer" });
    expect(res.status).toBe(409);
    expect(res.body.sameName).toBe(true);
    expect(res.body.name).toBe("PSNewcomer");
    expect(res.body.onTrip).toBe(true);
    expect(res.body.token).toBeUndefined();
    expect(await prisma.tripInvite.count({ where: { tripId: tripOne } })).toBe(before);
  });

  it("someone already on the trip gets a link that just signs them in (a new phone)", async () => {
    const res = await request(app).post(`/api/people/${tripOne}/add`).set("Authorization", `Bearer ${planner.token}`).send({ name: "psnewcomer", samePerson: true });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("PSNewcomer");
    expect(res.body.alreadyOnTrip).toBe(true);
    const join = await request(app).post(`/api/auth/join/${res.body.token}`).send({});
    expect(join.body.displayName).toBe("PSNewcomer");
    expect(await prisma.traveler.count({ where: { displayName: { equals: "PSNewcomer", mode: "insensitive" } } })).toBe(1);
  });
});

describe("Each person sees only their own trips", () => {
  it("the newcomer's trip list has trip one only, with their role", async () => {
    const tok = signToken({ code: "PSNewcomer", displayName: "PSNewcomer", travelerId: newcomerId });
    const res = await request(app).get("/api/trips").set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(200);
    const names = res.body.map((t: { name: string }) => t.name);
    expect(names).toContain(TRIP_ONE);
    expect(names).not.toContain(TRIP_TWO);
    expect(res.body.find((t: { name: string }) => t.name === TRIP_ONE).myRole).toBe("traveler");
  });

  it("another trip can't be opened by id", async () => {
    const tok = signToken({ code: "PSNewcomer", displayName: "PSNewcomer", travelerId: newcomerId });
    const res = await request(app).get(`/api/trips/${tripTwo}`).set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(404);
    expect(res.body.name).toBeUndefined();
  });

  it("their 'current trip' is their own, even when the planner's current trip is another group's", async () => {
    // Creating trip two made it Wander's active trip; trip one was archived
    const tok = signToken({ code: "PSNewcomer", displayName: "PSNewcomer", travelerId: newcomerId });
    const res = await request(app).get("/api/trips/active").set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(200);
    expect(res.body?.id).toBe(tripOne);
  });

  it("the other trip's people and members aren't visible to them", async () => {
    const tok = signToken({ code: "PSNewcomer", displayName: "PSNewcomer", travelerId: newcomerId });
    expect((await request(app).get(`/api/people/${tripTwo}`).set("Authorization", `Bearer ${tok}`)).status).toBe(403);
    expect((await request(app).get(`/api/trips/${tripTwo}/members`).set("Authorization", `Bearer ${tok}`)).status).toBe(403);
  });

  it("adding them to the second trip keeps one account and gives them both trips", async () => {
    const res = await request(app).post(`/api/people/${tripTwo}/add`).set("Authorization", `Bearer ${planner.token}`).send({ name: "PSNewcomer", samePerson: true });
    expect(res.status).toBe(201);
    expect(res.body.alreadyInWander).toBe(true);
    expect(res.body.alreadyOnTrip).toBe(false);
    const join = await request(app).post(`/api/auth/join/${res.body.token}`).send({});
    expect(join.status).toBe(200);
    const trips = await request(app).get("/api/trips").set("Authorization", `Bearer ${join.body.token}`);
    const names = trips.body.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining([TRIP_ONE, TRIP_TWO]));
    expect(await prisma.traveler.count({ where: { displayName: "PSNewcomer" } })).toBe(1);
  });

  it("the second trip's People shows only its own group", async () => {
    const res = await request(app).get(`/api/people/${tripTwo}`).set("Authorization", `Bearer ${planner.token}`);
    const names = res.body.people.map((p: { name: string }) => p.name);
    expect(names).toContain("PSNewcomer");
    expect(names).not.toContain("PSTraveler");
  });
});

describe("Home Screen icon for an invite", () => {
  it("starts at the invite link", async () => {
    const res = await request(app).get("/api/manifest.json?start=/join/abcDEF123_-xyz");
    expect(res.status).toBe(200);
    expect(res.body.start_url).toBe("/join/abcDEF123_-xyz");
    expect(res.body.display).toBe("standalone");
  });

  it("anything else starts at Home", async () => {
    for (const start of ["https://evil.example/join/abc12345", "/settings", "/join/../../x", "/join/<script>"]) {
      const res = await request(app).get(`/api/manifest.json?start=${encodeURIComponent(start)}`);
      expect(res.body.start_url).toBe("/");
    }
  });
});
