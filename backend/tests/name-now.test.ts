/**
 * A PERSON IS KNOWN BY THEIR NAME AS IT IS NOW (Oct 10 2026). The real accounts were "Andy B" and "Julie D."; they know
 * themselves as Andy and Julie, and her Guide says "Julie & Andy". Renamed, a phone's sign-in still carries the old name,
 * so the server takes the name from the account itself:
 * - "who am I" answers with the name as it is now, not the one the sign-in was given
 * - what's kept under their name (a note's author) uses the name as it is now
 * - a sign-in whose person is gone still works on its own name (never a refusal)
 * Invented data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-name-now";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const prisma = new PrismaClient();

let tripId = "", personId = "", token = "";
beforeAll(async () => {
  const p = await prisma.traveler.create({ data: { displayName: "NNWalter Q." } });
  personId = p.id;
  tripId = (await prisma.trip.create({ data: { name: "NN Trip", status: "archived", timeZone: "Asia/Tokyo", startDate: new Date("2031-10-05"), endDate: new Date("2031-10-29") } })).id;
  await prisma.tripMember.create({ data: { tripId, travelerId: p.id, role: "member" } });
  // (signed in under the old name, as Andy's and Julie's phones are)
  token = signToken({ code: "NNWalter Q.", displayName: "NNWalter Q.", travelerId: p.id });
  await prisma.traveler.update({ where: { id: p.id }, data: { displayName: "NNWalter" } });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.traveler.delete({ where: { id: personId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("known by the name as it is now", () => {
  it("who am I: the new name, from a sign-in made under the old one", async () => {
    const r = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.displayName).toBe("NNWalter");
  });
  it("a note is kept under the new name", async () => {
    const r = await request(app).post(`/api/trip-notes/trip/${tripId}`).set("Authorization", `Bearer ${token}`)
      .send({ clientId: "nn-note-0001", text: "The kiln was still warm." });
    expect(r.status).toBe(201);
    expect((await prisma.tripNote.findFirst({ where: { travelerId: personId } }))!.authorName).toBe("NNWalter");
  });
  it("a sign-in whose person is gone still works on its own name", async () => {
    const gone = signToken({ code: "NNGone", displayName: "NNGone", travelerId: "no-such-person-id" });
    const r = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${gone}`);
    expect(r.status).toBe(200);
    expect(r.body.displayName).toBe("NNGone");
  });
});
