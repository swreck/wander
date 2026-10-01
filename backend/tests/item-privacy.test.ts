/**
 * A TRIP'S ITEMS ARE FOR ITS OWN PEOPLE (Oct 1 2026). Routes naming a trip were limited on Sep 30; routes naming one
 * item (an experience, day, reservation…) checked sign-in only, so anyone signed in to Wander could read, change or
 * delete another trip's things by id, and create things on another trip by naming it in the body.
 * - Someone on a different trip is refused on every kind of item, and the item is read back unchanged.
 * - The trip's own person can still do each of those things (nothing over-blocked).
 * Invented data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-item-privacy";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const prisma = new PrismaClient();

const T: Record<string, string> = {};
let member = "", outsider = "", memberId = "";

beforeAll(async () => {
  const mk = async (name: string) => (await prisma.traveler.findFirst({ where: { displayName: name } })) || prisma.traveler.create({ data: { displayName: name } });
  const m = await mk("IPMember"), o = await mk("IPOutsider");
  memberId = m.id;
  const a = await prisma.trip.create({ data: { name: "IP Their Trip", status: "archived" } });
  const b = await prisma.trip.create({ data: { name: "IP Outsider Trip", status: "archived" } });
  T.trip = a.id; T.otherTrip = b.id;
  await prisma.tripMember.create({ data: { tripId: a.id, travelerId: m.id, role: "planner" } });
  await prisma.tripMember.create({ data: { tripId: b.id, travelerId: o.id, role: "planner" } });
  member = signToken({ code: "IPMember", displayName: "IPMember", travelerId: m.id });
  outsider = signToken({ code: "IPOutsider", displayName: "IPOutsider", travelerId: o.id });
  const city = await prisma.city.create({ data: { tripId: a.id, name: "IP City", sequenceOrder: 1 } });
  T.city = city.id;
  T.otherCity = (await prisma.city.create({ data: { tripId: b.id, name: "IP Outsider City", sequenceOrder: 1 } })).id;
  const day = await prisma.day.create({ data: { tripId: a.id, cityId: city.id, date: new Date("2031-05-02T00:00:00Z"), notes: "IP day note" } });
  T.day = day.id;
  T.exp = (await prisma.experience.create({ data: { tripId: a.id, cityId: city.id, name: "IP Museum", createdBy: "IPMember" } })).id;
  T.resv = (await prisma.reservation.create({ data: { tripId: a.id, dayId: day.id, name: "IP Dinner", type: "restaurant", datetime: new Date("2031-05-02T10:00:00Z") } })).id;
  T.acc = (await prisma.accommodation.create({ data: { tripId: a.id, cityId: city.id, name: "IP Inn" } })).id;
  T.seg = (await prisma.routeSegment.create({ data: { tripId: a.id, originCity: "IP A", destinationCity: "IP B", sequenceOrder: 1, transportMode: "train" } })).id;
  T.dec = (await prisma.decision.create({ data: { tripId: a.id, cityId: city.id, title: "IP Which dinner", createdBy: "IPMember" } })).id;
  T.phrase = (await prisma.tripPhrase.create({ data: { tripId: a.id, english: "IP thank you", romaji: "arigato", addedBy: "IPMember" } })).id;
  T.action = (await prisma.planningAction.create({ data: { tripId: a.id, action: "IP Book the ferry", owner: "IPMember", createdBy: "IPMember" } })).id;
  T.log = (await prisma.changeLog.create({ data: {
    tripId: a.id, userCode: "IPMember", userDisplayName: "IPMember", actionType: "experience_updated", entityType: "experience",
    entityId: T.exp, entityName: "IP Museum", description: "renamed", previousState: { name: "IP Old Museum" },
  } })).id;
  T.learning = (await prisma.learning.create({ data: { travelerId: m.id, tripId: a.id, content: "IP likes quiet temples" } })).id;
});
afterAll(async () => {
  await prisma.learning.deleteMany({ where: { content: { startsWith: "IP " } } }).catch(() => {});
  for (const id of [T.trip, T.otherTrip]) await prisma.trip.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

const as = (token: string) => ({
  get: (u: string) => request(app).get(u).set("Authorization", `Bearer ${token}`),
  patch: (u: string, b: object) => request(app).patch(u).set("Authorization", `Bearer ${token}`).send(b),
  post: (u: string, b: object) => request(app).post(u).set("Authorization", `Bearer ${token}`).send(b),
  del: (u: string) => request(app).delete(u).set("Authorization", `Bearer ${token}`),
});

describe("someone on another trip is refused, and nothing changes", () => {
  const o = () => as(outsider);
  it("can't read an experience, day or city by id", async () => {
    expect((await o().get(`/api/experiences/${T.exp}`)).status).toBe(403);
    expect((await o().get(`/api/days/${T.day}`)).status).toBe(403);
    expect((await o().get(`/api/cities/${T.city}`)).status).toBe(403);
    expect((await o().get(`/api/route-segments/${T.seg}`)).status).toBe(403);
    // (a trip that isn't yours is "not found" — it doesn't confirm the trip exists)
    expect((await o().get(`/api/trips/${T.trip}`)).status).toBe(404);
  });
  it("can't change or remove an experience", async () => {
    expect((await o().patch(`/api/experiences/${T.exp}`, { name: "Hacked" })).status).toBe(403);
    expect((await o().post(`/api/experiences/${T.exp}/promote`, { dayId: T.day })).status).toBe(403);
    expect((await o().del(`/api/experiences/${T.exp}`)).status).toBe(403);
    const e = await prisma.experience.findUnique({ where: { id: T.exp } });
    expect(e?.name).toBe("IP Museum");
    expect(e?.dayId).toBeNull();
  });
  it("can't change or remove a day, city, reservation, stay or train leg", async () => {
    expect((await o().patch(`/api/days/${T.day}`, { notes: "Hacked" })).status).toBe(403);
    expect((await o().del(`/api/days/${T.day}`)).status).toBe(403);
    expect((await o().patch(`/api/cities/${T.city}`, { name: "Hacked" })).status).toBe(403);
    expect((await o().del(`/api/cities/${T.city}`)).status).toBe(403);
    expect((await o().patch(`/api/reservations/${T.resv}`, { name: "Hacked" })).status).toBe(403);
    expect((await o().del(`/api/reservations/${T.resv}`)).status).toBe(403);
    expect((await o().patch(`/api/accommodations/${T.acc}`, { name: "Hacked" })).status).toBe(403);
    expect((await o().del(`/api/accommodations/${T.acc}`)).status).toBe(403);
    expect((await o().patch(`/api/route-segments/${T.seg}`, { notes: "Hacked" })).status).toBe(403);
    expect((await o().del(`/api/route-segments/${T.seg}`)).status).toBe(403);
    expect((await prisma.day.findUnique({ where: { id: T.day } }))?.notes).toBe("IP day note");
    expect((await prisma.city.findUnique({ where: { id: T.city } }))?.name).toBe("IP City");
    expect((await prisma.reservation.findUnique({ where: { id: T.resv } }))?.name).toBe("IP Dinner");
    expect((await prisma.accommodation.findUnique({ where: { id: T.acc } }))?.name).toBe("IP Inn");
    expect((await prisma.routeSegment.findUnique({ where: { id: T.seg } }))?.notes).toBeNull();
  });
  it("can't vote on or remove a decision, a phrase, a to-do, or undo the trip's history", async () => {
    expect((await o().post(`/api/decisions/${T.dec}/resolve`, {})).status).toBe(403);
    expect((await o().del(`/api/decisions/${T.dec}`)).status).toBe(403);
    expect((await o().del(`/api/phrases/${T.phrase}`)).status).toBe(403);
    expect((await o().patch(`/api/sheets-sync/actions/${T.action}`, { status: "done" })).status).toBe(403);
    expect((await o().del(`/api/sheets-sync/actions/${T.action}`)).status).toBe(403);
    expect((await o().post(`/api/restore/${T.log}`, {})).status).toBe(403);
    expect((await prisma.decision.findUnique({ where: { id: T.dec } }))?.status).toBe("open");
    expect(await prisma.tripPhrase.findUnique({ where: { id: T.phrase } })).not.toBeNull();
    expect((await prisma.planningAction.findUnique({ where: { id: T.action } }))?.status).toBe("open");
    expect((await prisma.experience.findUnique({ where: { id: T.exp } }))?.name).toBe("IP Museum");
  });
  it("can't create things on the trip by naming it, its city or its day", async () => {
    const before = await prisma.experience.count({ where: { tripId: T.trip } });
    expect((await o().post("/api/experiences", { tripId: T.trip, cityId: T.city, name: "IP Sneaked in" })).status).toBe(403);
    // (naming their own trip but the other trip's city)
    expect((await o().post("/api/experiences", { tripId: T.otherTrip, cityId: T.city, name: "IP Sneaked in" })).status).toBe(403);
    expect((await o().post("/api/reservations", { tripId: T.trip, dayId: T.day, name: "IP Sneaked", type: "restaurant", datetime: "2031-05-02T11:00:00Z" })).status).toBe(403);
    expect((await o().post("/api/experience-notes", { experienceId: T.exp, content: "IP Sneaked note", visibility: "group" })).status).toBe(403);
    expect(await prisma.experience.count({ where: { tripId: T.trip } })).toBe(before);
    expect(await prisma.reservation.count({ where: { tripId: T.trip } })).toBe(1);
    expect(await prisma.experience.count({ where: { name: "IP Sneaked in" } })).toBe(0);
  });
  it("can't read or change the trip's learnings, or read its people's profiles", async () => {
    expect((await o().patch(`/api/learnings/${T.learning}`, { content: "Hacked" })).status).toBe(403);
    expect((await o().del(`/api/learnings/${T.learning}`)).status).toBe(403);
    expect((await prisma.learning.findUnique({ where: { id: T.learning } }))?.content).toBe("IP likes quiet temples");
    expect((await o().get(`/api/auth/travelers/${memberId}`)).status).toBe(404);
  });
});

describe("the trip's own person can still do each of those things", () => {
  const m = () => as(member);
  it("reads by id", async () => {
    expect((await m().get(`/api/experiences/${T.exp}`)).status).toBe(200);
    expect((await m().get(`/api/days/${T.day}`)).status).toBe(200);
    expect((await m().get(`/api/cities/${T.city}`)).status).toBe(200);
    expect((await m().get(`/api/trips/${T.trip}`)).status).toBe(200);
    expect((await m().get(`/api/auth/travelers/${memberId}`)).status).toBe(200);
  });
  it("changes items, and the change is read back", async () => {
    expect((await m().patch(`/api/experiences/${T.exp}`, { name: "IP Museum (renamed)" })).status).toBe(200);
    expect((await prisma.experience.findUnique({ where: { id: T.exp } }))?.name).toBe("IP Museum (renamed)");
    expect((await m().patch(`/api/days/${T.day}`, { notes: "IP day note, edited" })).status).toBe(200);
    expect((await prisma.day.findUnique({ where: { id: T.day } }))?.notes).toBe("IP day note, edited");
    expect((await m().patch(`/api/reservations/${T.resv}`, { name: "IP Dinner at 7" })).status).toBe(200);
    expect((await prisma.reservation.findUnique({ where: { id: T.resv } }))?.name).toBe("IP Dinner at 7");
    expect((await m().patch(`/api/learnings/${T.learning}`, { content: "IP likes quiet temples early" })).status).toBe(200);
  });
  it("creates on their own trip", async () => {
    const r = await m().post("/api/experiences", { tripId: T.trip, cityId: T.city, name: "IP Garden" });
    expect(r.status).toBe(201);
    expect(await prisma.experience.count({ where: { tripId: T.trip, name: "IP Garden" } })).toBe(1);
  });
  it("an id that doesn't exist still answers not found, as before", async () => {
    expect((await m().get("/api/experiences/does-not-exist")).status).toBe(404);
    expect((await as(outsider).patch("/api/experiences/does-not-exist", { name: "x" })).status).toBe(404);
  });
});
