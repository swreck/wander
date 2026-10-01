/**
 * A note on an idea sent twice — the page and the phone's background helper can both resend one kept with no signal —
 * is kept once (confirmation tester k2, Oct 1 2026). A different note, or the same words later, is a new note.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const prisma = new PrismaClient();

let tripId = "", experienceId = "", token = "", travelerId = "";
beforeAll(async () => {
  const t = (await prisma.traveler.findFirst({ where: { displayName: "ENResend" } })) || (await prisma.traveler.create({ data: { displayName: "ENResend" } }));
  travelerId = t.id;
  tripId = (await prisma.trip.create({ data: { name: "EN Resend Trip", status: "archived" } })).id;
  await prisma.tripMember.create({ data: { tripId, travelerId, role: "traveler" } });
  const city = await prisma.city.create({ data: { tripId, name: "Kyoto", sequenceOrder: 1 } });
  experienceId = (await prisma.experience.create({ data: { tripId, cityId: city.id, name: "Fushimi Inari", createdBy: "ENResend" } as any })).id;
  token = signToken({ code: "ENResend", displayName: "ENResend", travelerId });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("a note on an idea, sent twice", () => {
  it("is kept once; a different note is its own", async () => {
    const send = (content: string) => request(app).post("/api/experience-notes").set("Authorization", `Bearer ${token}`).send({ experienceId, content, visibility: "private" });
    const one = await send("Go before 8 — the gates are quiet then");
    const two = await send("Go before 8 — the gates are quiet then");
    expect(one.status).toBe(201);
    expect(two.status).toBe(200);
    expect(two.body.id).toBe(one.body.id);
    const other = await send("Bring water for the climb");
    expect(other.status).toBe(201);
    expect(await prisma.experienceNote.count({ where: { experienceId, travelerId } })).toBe(2);
  });
});
