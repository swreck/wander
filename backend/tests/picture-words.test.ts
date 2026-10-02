/**
 * HER PICTURES' WORDS (Oct 2 2026, Ken: "every word, image, and number" in her sheet is data). Her illustrated day map
 * held who-goes-where and times; Wander kept only "a five-panel illustrated itinerary map". Now:
 * - Find a word searches a picture's summary AND all its words — card numbers masked, as in her cells
 * - the day screen's list of her pictures, by tab — only the trip's people see it
 * Invented data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-picture-words";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const prisma = new PrismaClient();

let tripId = "", member = "", outsider = "";
const SHA = "a".repeat(64);

beforeAll(async () => {
  tripId = (await prisma.trip.create({ data: { name: "Picture Words Trip", status: "archived", timeZone: "Asia/Tokyo" } })).id;
  await prisma.guideSnapshot.create({ data: { tripId, sourceName: "pw.xlsx", sourceKind: "xlsx", contentHash: "pw", status: "current",
    tabs: [{ name: "Town Day 4 Pottery", cells: [{ a1: "A40", r: 40, c: 1, text: "Stop 1: Clay shop" }], images: [{ sha256: SHA, anchor: "A1" }] }] as any } });
  await prisma.guideImage.create({ data: { tripId, sha256: SHA, mimeType: "image/png", bytes: Buffer.from([1, 2, 3]), readStatus: "read",
    transcription: "Wednesday — Pottery Day\nMuseum (Kip & Ada)\nYou & Jo (morning)\n• Clay shop\nPrivate van (8:00–9:15 am, 5:30–6:45 pm)\nPaid with 4111 1111 1111 1111",
    facts: { summary: "A four-panel illustrated itinerary map of the pottery town." } } });
  const mk = async (n: string) => (await prisma.traveler.findFirst({ where: { displayName: n } })) || prisma.traveler.create({ data: { displayName: n } });
  const a = await mk("PWMember"), o = await mk("PWOutsider");
  await prisma.tripMember.create({ data: { tripId, travelerId: a.id, role: "traveler" } });
  member = signToken({ code: "PWMember", displayName: "PWMember", travelerId: a.id });
  outsider = signToken({ code: "PWOutsider", displayName: "PWOutsider", travelerId: o.id });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("a picture's words", () => {
  it("Find a word gets the summary and every word of the picture, card numbers masked", async () => {
    const r = await request(app).get(`/api/guide/words/${tripId}`).set("Authorization", `Bearer ${member}`);
    expect(r.status).toBe(200);
    const p = r.body.pictures.find((x: any) => x.tab === "Town Day 4 Pottery");
    expect(p.text).toMatch(/four-panel illustrated itinerary map/);
    expect(p.text).toMatch(/Museum \(Kip & Ada\)/);
    expect(p.text).toMatch(/Private van \(8:00–9:15 am, 5:30–6:45 pm\)/);
    expect(p.text).not.toMatch(/4111 1111 1111 1111/);
    expect(p.text).toMatch(/card ending 1111/);
  });
  it("the day screen's pictures by tab — the trip's people only", async () => {
    const ok = await request(app).get(`/api/guide/pictures/${tripId}`).set("Authorization", `Bearer ${member}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveLength(1);
    expect(ok.body[0].tab).toBe("Town Day 4 Pottery");
    expect(ok.body[0].pictures[0]).toMatchObject({ anchor: "A1", sha256: SHA, summary: "A four-panel illustrated itinerary map of the pottery town.", read: true });
    const no = await request(app).get(`/api/guide/pictures/${tripId}`).set("Authorization", `Bearer ${outsider}`);
    expect(no.status).toBe(403);
  });
});
