/**
 * A message a person sends Ken on purpose is not a trip notice (December plan S1; Nov 17 2026). Larisa telling Ken
 * something about December on Dec 1 must reach his phone at home, though his days on the trip start Dec 14. The gate
 * on days stays on the automated evening nudge. Invented trip and people only.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// (every notice is recorded with the options it was sent with, and none is sent: the test database is a copy of production)
const pushed: { to: string; tag: string; opts: any }[] = [];
vi.mock("../src/services/push.js", async (orig) => {
  const real: any = await orig();
  return { ...real, sendToPhones: vi.fn(async (to: string, note: { tag: string }, opts?: any) => { pushed.push({ to, tag: note.tag, opts }); return 1; }) };
});

process.env.JWT_SECRET = "test-secret-plan-s1-notices";
const { tellKen } = await import("../src/services/tellKen.js");
const { scoutNoteShown, markSeen } = await import("../src/services/tripAlerts.js");
const { nudgeNow } = await import("../src/services/eveningNudge.js");
const prisma = new PrismaClient();

const TAG = `ps1n-${Date.now()}`;
const at0 = (s: string) => new Date(`${s}T00:00:00Z`);
let tripId = "", ken: any, larisa: any;

beforeAll(async () => {
  ken = await prisma.traveler.create({ data: { displayName: `${TAG}-Ken` } });
  larisa = await prisma.traveler.create({ data: { displayName: `${TAG}-Larisa` } });
  await prisma.pushSubscription.create({ data: { travelerId: ken.id, endpoint: `https://push.example/${TAG}-ken`, p256dh: "p".repeat(24), auth: "a".repeat(12) } });
  const t = await prisma.trip.create({ data: { name: `${TAG} trip`, status: "active", startDate: at0("2026-12-14"), endDate: at0("2027-01-08"), timeZone: "Asia/Ho_Chi_Minh" } });
  tripId = t.id;
  // (Ken is the trip's first member, so the organizer; his days there start Dec 25, outside the date of the checks)
  await prisma.tripMember.create({ data: { tripId, travelerId: ken.id, role: "planner", abroadFrom: at0("2026-12-25"), abroadTo: at0("2027-01-01"), joinedAt: new Date("2026-01-01T00:00:00Z") } });
  await prisma.tripMember.create({ data: { tripId, travelerId: larisa.id, role: "planner", joinedAt: new Date("2026-01-02T00:00:00Z") } });
});
afterAll(async () => {
  await prisma.tripAlert.deleteMany({ where: { tripId } });
  await prisma.tellKen.deleteMany({ where: { tripId } });
  await prisma.tripMember.deleteMany({ where: { tripId } });
  await prisma.pushSubscription.deleteMany({ where: { travelerId: ken.id } });
  await prisma.trip.delete({ where: { id: tripId } });
  await prisma.traveler.deleteMany({ where: { id: { in: [ken.id, larisa.id] } } });
  await prisma.$disconnect();
});

const settle = () => new Promise((r) => setTimeout(r, 300));

describe("a message to Ken reaches him at home", () => {
  it("tell-Ken on a trip whose days haven't started for Ken still sends to Ken, with no trip gate", async () => {
    pushed.length = 0;
    const r: any = await tellKen({ tripId, travelerId: larisa.id, authorName: "Larisa", words: "The Hanoi hotel wants a deposit" });
    expect(r.id).toBeTruthy();
    await settle();
    const got = pushed.filter((p) => p.to === ken.id && p.tag === `tell-ken-${r.id}`);
    expect(got.length).toBe(1);
    expect(got[0].opts?.tripId).toBeUndefined();
  });

  it("Scout's note shown to someone, and their answer, reach Ken the same way", async () => {
    const note = await prisma.tripAlert.create({ data: { tripId, fromId: larisa.id, fromName: "Scout", toId: larisa.id, text: "A note", key: `${TAG}-k` } });
    pushed.length = 0;
    await scoutNoteShown(note.id, larisa.id);
    const shown = pushed.filter((p) => p.to === ken.id && p.tag === `scout-note-${note.id}`);
    expect(shown.length).toBe(1);
    expect(shown[0].opts?.tripId).toBeUndefined();
    pushed.length = 0;
    await markSeen(note.id, larisa.id, "got", { openSeconds: 3 });
    await settle();
    const answered = pushed.filter((p) => p.to === ken.id && p.tag === `scout-note-${note.id}`);
    expect(answered.length).toBe(1);
    expect(answered[0].opts?.tripId).toBeUndefined();
  });

  it("the evening nudge for the same person and day still does not send", async () => {
    pushed.length = 0;
    // 21:30 on Dec 20 in Hanoi: before Ken's days there begin
    await nudgeNow(new Date("2026-12-20T14:30:00Z"));
    expect(pushed.filter((p) => p.to === ken.id).length).toBe(0);
  });
});
