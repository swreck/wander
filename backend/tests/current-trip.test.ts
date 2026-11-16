/**
 * Each person's own current trip (Nov 16 2026). Opening a trip used to archive every other trip for all of Wander, the
 * app's first load switched everyone to the trip with the newest Guide copy, and the sign-in's role came from that one
 * global trip. Now choosing a trip moves only the person choosing; nothing about the trips themselves changes.
 * Invented people and trips; the other rows in the copy of production are only read.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-current-trip";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { pickCurrent } = await import("../src/services/currentTrip.js");
const prisma = new PrismaClient();

const TAG = `ct-${Date.now()}`;
const DAY = 86400_000;
const ids = { travelers: [] as string[], trips: [] as string[] };
let ken = { id: "", tok: "" }, andy = { id: "", tok: "" };
let past = "", second = "", setAside = "";

const person = async (who: string) => {
  const t = await prisma.traveler.create({ data: { displayName: `${TAG}-${who}` } });
  ids.travelers.push(t.id);
  return { id: t.id, tok: signToken({ code: t.displayName, displayName: t.displayName, travelerId: t.id }) };
};
const trip = async (name: string, startInDays: number, endInDays: number, status: "active" | "archived" = "active") => {
  const t = await prisma.trip.create({ data: { name: `${TAG} ${name}`, status, startDate: new Date(Date.now() + startInDays * DAY), endDate: new Date(Date.now() + endInDays * DAY) } });
  ids.trips.push(t.id);
  return t.id;
};
const as = (tok: string) => ({ Authorization: `Bearer ${tok}` });
const current = async (tok: string) => (await request(app).get("/api/trips/active").set(as(tok))).body?.id;
const statuses = async () => Object.fromEntries((await prisma.trip.findMany({ where: { id: { in: ids.trips } }, select: { id: true, status: true } })).map((t) => [t.id, t.status]));

beforeAll(async () => {
  ken = await person("ken");
  andy = await person("andy");
  past = await trip("past", -45, -20);
  second = await trip("second", 30, 50);
  setAside = await trip("april placeholder", -220, -200, "archived");
  await prisma.tripMember.createMany({ data: [
    { tripId: past, travelerId: ken.id, role: "planner" },
    { tripId: past, travelerId: andy.id, role: "traveler" },
    { tripId: second, travelerId: ken.id, role: "traveler" },
    { tripId: setAside, travelerId: ken.id, role: "planner" },
  ] });
});
afterAll(async () => {
  await prisma.tripMember.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.changeLog.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.trip.deleteMany({ where: { id: { in: ids.trips } } });
  await prisma.traveler.deleteMany({ where: { id: { in: ids.travelers } } });
  await prisma.$disconnect();
});

describe("each person's own current trip", () => {
  it("with nothing chosen: the next trip to start, never a set-aside one; a person on one trip gets that trip", async () => {
    expect(await current(ken.tok)).toBe(second);
    expect(await current(andy.tok)).toBe(past);
  });

  it("Ken switches past → second → past; Andy's trip never moves and no trip's status changes", async () => {
    const before = await statuses();
    for (const to of [past, second, past]) {
      const r = await request(app).post(`/api/trips/${to}/activate`).set(as(ken.tok));
      expect(r.status).toBe(200);
      expect(r.body.id).toBe(to);
      expect(await current(ken.tok)).toBe(to);
      expect(await current(andy.tok)).toBe(past);
    }
    expect(await statuses()).toEqual(before);
    const andyRow = await prisma.tripMember.findFirst({ where: { travelerId: andy.id } });
    expect(andyRow?.openedAt).toBeNull();
  });

  it("choosing the same trip twice is harmless", async () => {
    await request(app).post(`/api/trips/${second}/activate`).set(as(ken.tok)).expect(200);
    await request(app).post(`/api/trips/${second}/activate`).set(as(ken.tok)).expect(200);
    expect(await current(ken.tok)).toBe(second);
  });

  it("a trip someone isn't on is refused and changes nothing; a made-up id is not found", async () => {
    const before = await prisma.tripMember.findMany({ where: { tripId: { in: ids.trips } }, orderBy: { id: "asc" } });
    expect((await request(app).post(`/api/trips/${second}/activate`).set(as(andy.tok))).status).toBe(403);
    expect((await request(app).post(`/api/trips/${TAG}-nope/activate`).set(as(andy.tok))).status).toBe(404);
    expect((await request(app).post(`/api/trips/%20/activate`).set(as(andy.tok))).status).toBeGreaterThanOrEqual(400);
    expect(await prisma.tripMember.findMany({ where: { tripId: { in: ids.trips } }, orderBy: { id: "asc" } })).toEqual(before);
    expect(await current(andy.tok)).toBe(past);
  });

  it("a set-aside trip chosen by its member opens for them and stays set aside", async () => {
    await request(app).post(`/api/trips/${setAside}/activate`).set(as(ken.tok)).expect(200);
    expect(await current(ken.tok)).toBe(setAside);
    expect((await statuses())[setAside]).toBe("archived");
    await request(app).post(`/api/trips/${past}/activate`).set(as(ken.tok)).expect(200);
  });

  it("two choices in the same millisecond: the later one wins", async () => {
    const { chooseTrip } = await import("../src/services/currentTrip.js");
    const frozen = Date.now() + 60_000;
    const spy = vi.spyOn(Date, "now").mockReturnValue(frozen);
    try {
      await chooseTrip(ken.id, past);
      await chooseTrip(ken.id, second);
    } finally { spy.mockRestore(); }
    expect(await current(ken.tok)).toBe(second);
    await request(app).post(`/api/trips/${past}/activate`).set(as(ken.tok)).expect(200);
    expect(await current(ken.tok)).toBe(past);
  });

  it("two switches at once settle on one of them, for Ken only", async () => {
    await Promise.all([past, second, past, second].map((to) => request(app).post(`/api/trips/${to}/activate`).set(as(ken.tok))));
    expect([past, second]).toContain(await current(ken.tok));
    expect(await current(andy.tok)).toBe(past);
  });

  it("the role is the person's role on their own current trip, at sign-in and after a switch", async () => {
    await request(app).post(`/api/trips/${past}/activate`).set(as(ken.tok)).expect(200);
    expect((await request(app).get("/api/auth/me").set(as(ken.tok))).body.role).toBe("planner");
    await request(app).post(`/api/trips/${second}/activate`).set(as(ken.tok)).expect(200);
    expect((await request(app).get("/api/auth/me").set(as(ken.tok))).body.role).toBe("traveler");
    // (sign-in by name is for tests and local work only)
    const signIn = await request(app).post("/api/auth/login").send({ code: `${TAG}-ken` });
    expect(signIn.status).toBe(200);
    expect(signIn.body.role).toBe("traveler");
    expect((await request(app).get("/api/auth/me").set(as(andy.tok))).body.role).toBe("traveler");
  });

  it("the trip list says when this person chose each trip", async () => {
    const list = (await request(app).get("/api/trips").set(as(ken.tok))).body as any[];
    const mine = list.filter((t) => ids.trips.includes(t.id));
    expect(mine.map((t) => t.id).sort()).toEqual([past, second, setAside].sort());
    expect(mine.find((t) => t.id === second).myOpenedAt).toBeTruthy();
    const andys = (await request(app).get("/api/trips").set(as(andy.tok))).body as any[];
    expect(andys.filter((t) => ids.trips.includes(t.id)).map((t) => t.id)).toEqual([past]);
  });

  it("a new trip is its creator's current trip and leaves every other trip and person alone", async () => {
    const before = await statuses();
    const r = await request(app).post("/api/trips").set(as(andy.tok)).send({ name: `${TAG} andy's new` });
    expect(r.status).toBe(201);
    ids.trips.push(r.body.id);
    expect(await current(andy.tok)).toBe(r.body.id);
    expect(await current(ken.tok)).toBe(second);
    const after = await statuses();
    for (const id of Object.keys(before)) expect(after[id]).toBe(before[id]);
  });
});

describe("pickCurrent", () => {
  const now = new Date("2026-12-16T03:00:00Z");
  const m = (tripId: string, openedAt: string | null, start: string, end: string, status = "active") =>
    ({ tripId, openedAt: openedAt ? new Date(openedAt) : null, trip: { status, startDate: new Date(`${start}T00:00:00Z`), endDate: new Date(`${end}T00:00:00Z`), timeZone: "Asia/Ho_Chi_Minh", updatedAt: new Date("2026-11-01") } });

  it("a trip that began after the last choice comes forward by itself", () => {
    expect(pickCurrent([m("japan", "2026-12-01T00:00:00Z", "2026-10-05", "2026-10-29"), m("dec", null, "2026-12-15", "2027-01-08")], now)).toBe("dec");
  });
  it("a choice made during a trip wins (Ken looks something up in Japan)", () => {
    expect(pickCurrent([m("japan", "2026-12-16T02:00:00Z", "2026-10-05", "2026-10-29"), m("dec", "2026-12-15T00:00:00Z", "2026-12-15", "2027-01-08")], now)).toBe("japan");
  });
  it("a trip's first hours on its own clock don't outrank a choice made in them (Hanoi is UTC+7)", () => {
    // Dec 15 begins in Hanoi at 17:00 UTC on Dec 14; Ken opens Japan at 17:30 UTC; it's 18:00 UTC
    const at = new Date("2026-12-14T18:00:00Z");
    const dec = m("dec", null, "2026-12-15", "2027-01-08");
    expect(pickCurrent([m("japan", "2026-12-14T17:30:00Z", "2026-10-05", "2026-10-29"), dec], at)).toBe("japan");
    // and before his choice, December had come forward by itself
    expect(pickCurrent([m("japan", "2026-12-14T16:30:00Z", "2026-10-05", "2026-10-29"), dec], at)).toBe("dec");
  });
  it("midnight on a trip's own clock", async () => {
    const { zonedMidnight } = await import("../src/services/currentTrip.js");
    expect(new Date(zonedMidnight("2026-11-17", "Asia/Tokyo")).toISOString()).toBe("2026-11-16T15:00:00.000Z");
    expect(new Date(zonedMidnight("2026-12-15", "Asia/Ho_Chi_Minh")).toISOString()).toBe("2026-12-14T17:00:00.000Z");
    expect(new Date(zonedMidnight("2026-12-15", "America/Los_Angeles")).toISOString()).toBe("2026-12-15T08:00:00.000Z");
  });
  it("nothing chosen: under way, then next to start, then ended last; set-aside trips last of all", () => {
    expect(pickCurrent([m("a", null, "2026-10-05", "2026-10-29"), m("b", null, "2027-03-01", "2027-03-10")], now)).toBe("b");
    expect(pickCurrent([m("a", null, "2026-10-05", "2026-10-29"), m("old", null, "2026-04-01", "2026-04-10")], now)).toBe("a");
    expect(pickCurrent([m("april", null, "2026-10-01", "2026-11-01", "archived"), m("a", null, "2026-10-05", "2026-10-29")], now)).toBe("a");
    expect(pickCurrent([m("april", null, "2026-10-01", "2026-11-01", "archived")], now)).toBe("april");
    expect(pickCurrent([], now)).toBeNull();
  });
});
