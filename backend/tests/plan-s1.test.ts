/**
 * Wander's own plan for a trip, slice S1 (Nov 17 2026; the December trip's plan lives in the private trip-data folder).
 * A plan is a snapshot of kind "wander_plan" whose lines are GuideItem rows with a `plan:` sourceRef; these tests hold
 * the server's side of that: the schema's new columns, what a Guide copy may do to a plan, what Scout may change, and
 * what stays quiet for a trip nobody is on yet. Invented trips, people and plans only ("Stay A", "Leg 1").
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

// (every notice is recorded here and none is sent: the test database is a copy of production)
const pushed: { to: string; tag: string }[] = [];
vi.mock("../src/services/push.js", async (orig) => {
  const real: any = await orig();
  return { ...real, sendToPhones: vi.fn(async (to: string, note: { tag: string }) => { pushed.push({ to, tag: note.tag }); return 1; }) };
});

process.env.JWT_SECRET = "test-secret-plan-s1";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { importGuideSnapshot, itemsReplacedByImport } = await import("../src/services/guide/importSnapshot.js");
const { cellsOfItem } = await import("../src/services/guide/sources.js");
const { guideItemRefusal } = await import("../src/routes/chat.js");
// (these two are new modules: loaded inside the tests that use them, so a missing one fails only its own tests)
const abroad = () => import("../src/services/abroad.js");
const country = () => import("../src/services/dayCountry.js");
const { tripsToWarm, stormWatch } = await import("../src/services/stormWatch.js");
const { nudgeNow } = await import("../src/services/eveningNudge.js");
const { helloFor } = await import("../src/services/scoutHello.js");
const { refreshDueSources } = await import("../src/services/sources/refresh.js");
const prisma = new PrismaClient();

const TAG = `ps1-${Date.now()}`;
const DAY = 86400_000;
const ids = { travelers: [] as string[], trips: [] as string[] };
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const at0 = (s: string) => new Date(`${s}T00:00:00Z`);

const person = async (who: string, withPhone = false) => {
  const t = await prisma.traveler.create({ data: { displayName: `${TAG}-${who}` } });
  ids.travelers.push(t.id);
  if (withPhone) await prisma.pushSubscription.create({ data: { travelerId: t.id, endpoint: `https://push.example/${TAG}-${who}`, p256dh: "p".repeat(24), auth: "a".repeat(12) } });
  return { id: t.id, name: t.displayName, tok: signToken({ code: t.displayName, displayName: t.displayName, travelerId: t.id }) };
};
const trip = async (name: string, startMs: number, endMs: number, zone: string | null = null) => {
  const t = await prisma.trip.create({ data: { name: `${TAG} ${name}`, status: "active", startDate: new Date(startMs), endDate: new Date(endMs), timeZone: zone } });
  ids.trips.push(t.id);
  return t.id;
};
const snapshot = (tripId: string, sourceKind: string, status = "current") =>
  prisma.guideSnapshot.create({ data: { tripId, sourceName: sourceKind === "wander_plan" ? "A plan" : "A Guide.xlsx", sourceKind, contentHash: `${TAG}-${sourceKind}-${Math.random()}`, status, tabs: [] as any, importedBy: "test" } });
const item = (tripId: string, snapshotId: string, sourceRef: string, title: string, date = "2026-12-20") =>
  prisma.guideItem.create({ data: { tripId, snapshotId, date: at0(date), kind: "plan", title, source: sourceRef.startsWith("plan:") ? "Larisa's notes" : "Itinerary · Notes (row 4)", sourceRef, sortOrder: 0 } });

let ken: Awaited<ReturnType<typeof person>>;
let planTrip = "", planSnap = "", guideTrip = "";

beforeAll(async () => {
  ken = await person("ken");
  planTrip = await trip("plan trip", Date.now() + 30 * DAY, Date.now() + 53 * DAY);
  await prisma.tripMember.create({ data: { tripId: planTrip, travelerId: ken.id, role: "planner" } });
  planSnap = (await snapshot(planTrip, "wander_plan")).id;
  await item(planTrip, planSnap, "plan:leg:leg-1", "Leg 1");
  await item(planTrip, planSnap, "plan:stay:stay-a:in", "Check in · Stay A");
  guideTrip = await trip("guide trip", Date.now() + 30 * DAY, Date.now() + 53 * DAY);
  await prisma.tripMember.create({ data: { tripId: guideTrip, travelerId: ken.id, role: "planner" } });
});
afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.sampleEntry.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.accommodation.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.day.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.city.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.guideItem.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.guideSnapshot.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.tripMember.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.trip.deleteMany({ where: { id: { in: ids.trips } } });
  await prisma.traveler.deleteMany({ where: { id: { in: ids.travelers } } });
  await prisma.$disconnect();
});

// ── A and D5: the schema ──────────────────────────────────────────────────────────────────────────────────────────

describe("the schema's new columns (A, D5)", () => {
  it("a membership's days: null both ends round-trips as null, and nobody sees samples unless set", async () => {
    const t = await trip("members", Date.now() + 30 * DAY, Date.now() + 40 * DAY);
    const a = await person("a"), b = await person("b"), c = await person("c");
    const whole = await prisma.tripMember.create({ data: { tripId: t, travelerId: a.id } });
    const read = await prisma.tripMember.findUniqueOrThrow({ where: { id: whole.id } });
    expect(read.abroadFrom).toBeNull();
    expect(read.abroadTo).toBeNull();
    expect(read.showSamples).toBe(false);
    const part = await prisma.tripMember.create({ data: { tripId: t, travelerId: b.id, abroadFrom: at0("2026-12-25"), abroadTo: at0("2027-01-01"), showSamples: true } });
    const back = await prisma.tripMember.findUniqueOrThrow({ where: { id: part.id } });
    expect(back.abroadFrom?.toISOString()).toBe("2026-12-25T00:00:00.000Z");
    expect(back.abroadTo?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(back.showSamples).toBe(true);
    // (set, then cleared: back to the whole trip)
    await prisma.tripMember.update({ where: { id: part.id }, data: { abroadFrom: null, abroadTo: null } });
    const cleared = await prisma.tripMember.findUniqueOrThrow({ where: { id: part.id } });
    expect([cleared.abroadFrom, cleared.abroadTo]).toEqual([null, null]);
    // (an update that names neither leaves a person's days alone)
    await prisma.tripMember.update({ where: { id: whole.id }, data: { openedAt: new Date() } });
    expect((await prisma.tripMember.findUniqueOrThrow({ where: { id: whole.id } })).abroadFrom).toBeNull();
    void c;
  });

  it("City and Accommodation carry a plan key and a zone; every Guide row in the copy of production has none", async () => {
    const t = await trip("rows", Date.now() + 30 * DAY, Date.now() + 40 * DAY);
    const city = await prisma.city.create({ data: { tripId: t, name: "City A", sequenceOrder: 0, planKey: "city-a", timeZone: "Asia/Ho_Chi_Minh", country: "Vietnam" } });
    const plain = await prisma.city.create({ data: { tripId: t, name: "City B", sequenceOrder: 1 } });
    expect([plain.planKey, plain.timeZone]).toEqual([null, null]);
    const stay = await prisma.accommodation.create({ data: { tripId: t, cityId: city.id, name: "Stay A", planKey: "stay-a" } });
    const own = await prisma.accommodation.create({ data: { tripId: t, cityId: city.id, name: "Stay B" } });
    expect((await prisma.accommodation.findUniqueOrThrow({ where: { id: stay.id } })).planKey).toBe("stay-a");
    expect((await prisma.accommodation.findUniqueOrThrow({ where: { id: own.id } })).planKey).toBeNull();
    expect(await prisma.city.count({ where: { guideKey: { not: null }, OR: [{ planKey: { not: null } }, { timeZone: { not: null } }] } })).toBe(0);
    expect(await prisma.accommodation.count({ where: { guideKey: { not: null }, planKey: { not: null } } })).toBe(0);
    expect(await prisma.tripMember.count({ where: { trip: { guideSnapshots: { some: { sourceKind: "xlsx" } } }, OR: [{ abroadFrom: { not: null } }, { abroadTo: { not: null } }, { showSamples: true }] } })).toBe(0);
  });

  it("sample_entries: a row keeps its kind, date, slot and data, lives in a table of that name, and goes with its trip", async () => {
    const t = await trip("samples", Date.now() + 30 * DAY, Date.now() + 40 * DAY);
    const s = await prisma.sampleEntry.create({ data: { tripId: t, kind: "line", date: "2026-12-20", slot: "2026-12-20|morning", data: { title: "A sample" } } });
    const nodate = await prisma.sampleEntry.create({ data: { tripId: t, kind: "maybe", slot: "city-a|1", data: {} } });
    expect((await prisma.sampleEntry.findUniqueOrThrow({ where: { id: s.id } })).data).toEqual({ title: "A sample" });
    expect(nodate.date).toBeNull();
    expect(s.createdAt).toBeInstanceOf(Date);
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`select count(*) n from sample_entries where trip_id = ${t}`;
    expect(Number(n)).toBe(2);
    await prisma.trip.delete({ where: { id: t } });
    ids.trips.splice(ids.trips.indexOf(t), 1);
    expect(await prisma.sampleEntry.count({ where: { tripId: t } })).toBe(0);
  });
});

// ── B (spec D2): a Guide copy never deletes plan lines ─────────────────────────────────────────────────────────────

describe("a Guide copy and a plan (D2)", () => {
  it("the import's delete takes a Guide's own lines and leaves a plan's lines and its snapshot", async () => {
    const t = await trip("both", Date.now() + 30 * DAY, Date.now() + 40 * DAY);
    const guide = await snapshot(t, "xlsx", "previous");
    const plan = await snapshot(t, "wander_plan");
    await item(t, guide.id, "Itinerary!F4", "Guide line 1");
    await item(t, guide.id, "Itinerary!F5", "Guide line 2");
    await item(t, plan.id, "plan:leg:leg-1", "Plan line 1");
    const r = await prisma.guideItem.deleteMany({ where: itemsReplacedByImport(t) });
    expect(r.count).toBe(2);
    expect((await prisma.guideItem.findMany({ where: { tripId: t } })).map((i) => i.title)).toEqual(["Plan line 1"]);
    expect(await prisma.guideSnapshot.count({ where: { tripId: t, sourceKind: "wander_plan", status: "current" } })).toBe(1);
  });

  it("with no plan on the trip the delete takes every line, as it always has", async () => {
    const t = await trip("guide only", Date.now() + 30 * DAY, Date.now() + 40 * DAY);
    const g = await snapshot(t, "xlsx");
    for (let n = 0; n < 4; n++) await item(t, g.id, `Itinerary!F${n + 4}`, `Guide line ${n}`);
    expect((await prisma.guideItem.deleteMany({ where: itemsReplacedByImport(t) })).count).toBe(4);
    // (and another trip's lines are never in reach)
    expect(await prisma.guideItem.count({ where: { tripId: planTrip } })).toBe(2);
  });

  const rows = async (tripId: string) => ({
    snapshots: await prisma.guideSnapshot.count({ where: { tripId } }), items: await prisma.guideItem.count({ where: { tripId } }),
    days: await prisma.day.count({ where: { tripId } }), cities: await prisma.city.count({ where: { tripId } }),
    plan: (await prisma.guideSnapshot.findUniqueOrThrow({ where: { id: planSnap } })).status,
  });

  it("the import refuses a trip whose current snapshot is a plan, in plain words, before reading anything", async () => {
    const before = await rows(planTrip);
    const r = await importGuideSnapshot({ buffer: Buffer.from("not a spreadsheet"), sourceName: "Her Guide.xlsx", importedBy: "Ken", tripId: planTrip, readPictures: false, readText: false, readDayPlans: false });
    expect(r.accepted).toBe(false);
    expect(r.reasons.join(" ")).toBe("This trip is built from Wander's own plan, which a copy of a Guide can't replace. Nothing was changed.");
    expect(await rows(planTrip)).toEqual(before);
  });

  it("the upload route says the same to the planner (422) and writes nothing", async () => {
    const before = await rows(planTrip);
    const r = await request(app).post("/api/guide/import").set({ Authorization: `Bearer ${ken.tok}` }).field("tripId", planTrip).attach("file", Buffer.from("x"), "Her Guide.xlsx");
    expect(r.status).toBe(422);
    expect(r.body.reasons.join(" ")).toMatch(/built from Wander's own plan/);
    expect(await rows(planTrip)).toEqual(before);
  });

  it("a trip whose plan is only an older snapshot is not refused for that reason", async () => {
    const t = await trip("plan then guide", Date.now() + 30 * DAY, Date.now() + 40 * DAY);
    await snapshot(t, "wander_plan", "previous");
    await snapshot(t, "xlsx", "current");
    const r: any = await importGuideSnapshot({ buffer: Buffer.from("not a spreadsheet"), sourceName: "Her Guide.xlsx", importedBy: "Ken", tripId: t, readPictures: false, readText: false, readDayPlans: false }).catch((e) => ({ threw: e.message, reasons: [] }));
    expect([...(r.reasons || []), r.threw || ""].join(" ")).not.toMatch(/Wander's own plan/);
  });
});

// ── C (spec D1): a plan line names no tab; Scout doesn't change a plan's cities or stays ──────────────────────────

describe("a plan line has no spot in a Guide (D1, H4)", () => {
  it("cellsOfItem returns nothing for a plan: reference, even when a tab of that very name exists", () => {
    const tabs: any = [{ name: "plan:leg:leg-1", cells: [{ a1: "A1", r: 1, c: 1, text: "words" }], images: [] }];
    expect(cellsOfItem({ cells: null, sourceRef: "plan:leg:leg-1" }, tabs)).toEqual([]);
    expect(cellsOfItem({ cells: null, sourceRef: "plan:stay:stay-a:in" }, [])).toEqual([]);
    // (a Guide line still finds its cell)
    expect(cellsOfItem({ cells: null, sourceRef: "Itinerary!A1" }, [{ name: "Itinerary", cells: [{ a1: "A1", r: 1, c: 1, text: "hello" }], images: [] }] as any)).toEqual([{ kind: "cell", tab: "Itinerary", a1: "A1", text: "hello" }]);
  });

  it("/guide/items for a plan trip: every plan line comes back with no spot", async () => {
    const r = await request(app).get(`/api/guide/items/${planTrip}`).set({ Authorization: `Bearer ${ken.tok}` });
    expect(r.status).toBe(200);
    expect(r.body.map((i: any) => i.title).sort()).toEqual(["Check in · Stay A", "Leg 1"]);
    for (const i of r.body) expect(i.spots).toEqual([]);
  });
});

describe("Scout leaves a plan's cities and stays alone (D1, H9)", () => {
  let cityId = "", planCity = "", guideCity = "", planStay = "", guideStay = "", ownStay = "";
  beforeAll(async () => {
    const c = await prisma.city.create({ data: { tripId: planTrip, name: "City A", sequenceOrder: 0 } });
    cityId = c.id;
    planCity = (await prisma.city.create({ data: { tripId: planTrip, name: "City P", sequenceOrder: 1, planKey: "city-p" } })).id;
    guideCity = (await prisma.city.create({ data: { tripId: planTrip, name: "City G", sequenceOrder: 2, guideKey: "city g" } })).id;
    planStay = (await prisma.accommodation.create({ data: { tripId: planTrip, cityId, name: "Stay A", planKey: "stay-a" } })).id;
    guideStay = (await prisma.accommodation.create({ data: { tripId: planTrip, cityId, name: "Stay G", guideKey: "stay g|2026-12-20" } })).id;
    ownStay = (await prisma.accommodation.create({ data: { tripId: planTrip, cityId, name: "Stay W" } })).id;
  });

  it("update_city refuses a city with a plan key, in words that say whose it is, as it refuses a Guide's city", async () => {
    const r = await guideItemRefusal("update_city", { cityId: planCity });
    expect(r).toMatch(/plan/i);
    expect(r).not.toMatch(/Larisa's Guide/);
    expect(await guideItemRefusal("update_city", { cityId: guideCity })).toMatch(/Larisa's Guide/);
    expect(await guideItemRefusal("update_city", { cityId })).toBeNull();
    expect(await guideItemRefusal("update_city", {})).toBeNull();
    expect(await guideItemRefusal("update_city", { cityId: `${TAG}-nope` })).toBeNull();
  });

  it("update_accommodation refuses a stay with a plan key; a Guide's stay as before; Wander's own stay is editable", async () => {
    const r = await guideItemRefusal("update_accommodation", { accommodationId: planStay });
    expect(r).toMatch(/plan/i);
    expect(r).not.toMatch(/Larisa's Guide/);
    expect(await guideItemRefusal("update_accommodation", { accommodationId: guideStay })).toMatch(/Larisa's Guide/);
    expect(await guideItemRefusal("update_accommodation", { accommodationId: ownStay })).toBeNull();
    expect(await guideItemRefusal("update_accommodation", { accommodationId: `${TAG}-nope` })).toBeNull();
  });

  it("a day's notes on a plan trip are refused too (the plan tool would put them back)", async () => {
    const d = await prisma.day.create({ data: { tripId: planTrip, cityId, date: at0("2026-12-20") } });
    expect(await guideItemRefusal("update_day_notes", { dayId: d.id })).toBeTruthy();
  });
});

// ── D (spec D9): nothing reaches a person outside their days; the storm watch is Japan's ─────────────────────────

describe("a person's days (D5, D9)", () => {
  const d = (s: string) => at0(s);
  it("a day is theirs from abroadFrom through abroadTo inclusive; a null end is the trip's end", async () => {
    const { onTheirDays } = await abroad();
    const m = { abroadFrom: d("2026-12-25"), abroadTo: d("2027-01-01") };
    for (const [day, want] of [["2026-12-24", false], ["2026-12-25", true], ["2026-12-31", true], ["2027-01-01", true], ["2027-01-02", false]] as const) expect(onTheirDays(m, day)).toBe(want);
    expect(onTheirDays({ abroadFrom: null, abroadTo: null }, "2020-01-01")).toBe(true);
    expect(onTheirDays({ abroadFrom: d("2026-12-25"), abroadTo: null }, "2026-12-24")).toBe(false);
    expect(onTheirDays({ abroadFrom: d("2026-12-25"), abroadTo: null }, "2030-01-01")).toBe(true);
    expect(onTheirDays({ abroadFrom: null, abroadTo: d("2027-01-01") }, "2027-01-02")).toBe(false);
    expect(onTheirDays({ abroadFrom: null, abroadTo: d("2027-01-01") }, "2026-01-02")).toBe(true);
  });

  it("pushAllowed reads the person's own membership on the trip's own clock", async () => {
    const { pushAllowed } = await abroad();
    const t = await trip("clock", at0("2026-12-14").getTime(), at0("2027-01-08").getTime(), "Asia/Ho_Chi_Minh");
    const a = await person("clock-a");
    await prisma.tripMember.create({ data: { tripId: t, travelerId: a.id, abroadFrom: d("2026-12-25"), abroadTo: d("2027-01-01") } });
    // 17:30 UTC Dec 24 is 00:30 Dec 25 in Hanoi: already their first day there
    expect(await pushAllowed(a.id, t, new Date("2026-12-24T17:30:00Z"))).toBe(true);
    expect(await pushAllowed(a.id, t, new Date("2026-12-24T16:30:00Z"))).toBe(false);
    expect(await pushAllowed(a.id, t, new Date("2027-01-02T01:00:00Z"))).toBe(false);
    // (not on the trip at all, or a trip that doesn't exist: nothing to hold back by)
    expect(await pushAllowed(ken.id, t, new Date("2026-12-24T16:30:00Z"))).toBe(true);
    expect(await pushAllowed(a.id, `${TAG}-none`, new Date())).toBe(true);
  });

  it("the evening nudge skips a person outside their days and sends to the others", async () => {
    const t = await trip("nudge", at0("2026-12-14").getTime(), at0("2027-01-08").getTime(), "Asia/Ho_Chi_Minh");
    const snap = await snapshot(t, "wander_plan");
    void snap;
    const whole = await person("n-whole", true), inside = await person("n-inside", true), outside = await person("n-outside", true), after = await person("n-after", true);
    await prisma.tripMember.createMany({ data: [
      { tripId: t, travelerId: whole.id },
      { tripId: t, travelerId: inside.id, abroadFrom: d("2026-12-14"), abroadTo: d("2027-01-08") },
      { tripId: t, travelerId: outside.id, abroadFrom: d("2026-12-25"), abroadTo: d("2027-01-01") },
      { tripId: t, travelerId: after.id, abroadFrom: d("2026-12-14"), abroadTo: d("2026-12-18") },
    ] });
    pushed.length = 0;
    // 21:30 on Dec 20 in Hanoi
    const sent = await nudgeNow(new Date("2026-12-20T14:30:00Z"));
    const to = pushed.map((p) => p.to);
    expect(to).toContain(whole.id);
    expect(to).toContain(inside.id);
    expect(to).not.toContain(outside.id);
    expect(to).not.toContain(after.id);
    expect(sent.map((s) => s.to).sort()).toEqual([inside.name, whole.name].sort());
  });
});

describe("the storm watch is Japan's (D9)", () => {
  const cityIn = (tripId: string, name: string, country: string, order: number) => prisma.city.create({ data: { tripId, name, country, sequenceOrder: order } });
  const dayIn = (tripId: string, cityId: string, date: string) => prisma.day.create({ data: { tripId, cityId, date: at0(date) } });

  it("a day's country is its city's; a day with no row says nothing", async () => {
    const { dayCountry } = await country();
    const t = await trip("countries", Date.now() + 30 * DAY, Date.now() + 40 * DAY);
    const hanoi = await cityIn(t, "City A", "Vietnam", 0), tokyo = await cityIn(t, "City B", "Japan", 1), blank = await prisma.city.create({ data: { tripId: t, name: "City C", sequenceOrder: 2 } });
    await dayIn(t, hanoi.id, "2026-12-20"); await dayIn(t, tokyo.id, "2027-01-02"); await dayIn(t, blank.id, "2027-01-03");
    expect(await dayCountry(t, "2026-12-20")).toBe("Vietnam");
    expect(await dayCountry(t, "2027-01-02")).toBe("Japan");
    expect(await dayCountry(t, "2027-01-03")).toBeNull();
    expect(await dayCountry(t, "2027-02-01")).toBeNull();
    expect(await dayCountry(`${TAG}-none`, "2027-01-03")).toBeNull();
  });

  it("only a trip with a city in Japan is warmed: under way or starting within eight days", async () => {
    const today = ymd(Date.now());
    const viet = await trip("warm viet", Date.now() - 2 * DAY, Date.now() + 9 * DAY);
    await cityIn(viet, "City A", "Vietnam", 0);
    const mixed = await trip("warm mixed", Date.now() - 2 * DAY, Date.now() + 9 * DAY);
    await cityIn(mixed, "City A", "Vietnam", 0); await cityIn(mixed, "City B", "Japan", 1);
    const far = await trip("warm far", Date.now() + 20 * DAY, Date.now() + 30 * DAY);
    await cityIn(far, "City B", "Japan", 0);
    const got = (await tripsToWarm(today)).map((x) => x.id);
    expect(got).toContain(mixed);
    expect(got).not.toContain(viet);
    expect(got).not.toContain(far);
  });

  it("the watch for a trip with no city in Japan asks JMA nothing", async () => {
    const t = await trip("watch viet", Date.now() - 1 * DAY, Date.now() + 9 * DAY);
    await cityIn(t, "City A", "Vietnam", 0);
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    try {
      const w = await stormWatch(t, "Ken", ymd(Date.now()), new Date(), false, true);
      expect(spy).not.toHaveBeenCalled();
      expect(w.days).toEqual({});
      expect(w.unknown).toEqual([]);
    } finally { spy.mockRestore(); }
  });

  it("the watch for a trip with a city in Japan still asks (the Japan trip is unchanged)", async () => {
    const t = await trip("watch japan", Date.now() - 1 * DAY, Date.now() + 9 * DAY);
    await cityIn(t, "City B", "Japan", 0);
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    try {
      await stormWatch(t, "Ken", ymd(Date.now()), new Date(), false, true);
      expect(spy).toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
});

describe("a trip nobody is on yet stays quiet (D9)", () => {
  it("two members, a trip weeks away: no push, no hello, no lookup until a person opens it", async () => {
    const t = await trip("quiet", Date.now() + 28 * DAY, Date.now() + 52 * DAY, "Asia/Ho_Chi_Minh");
    await snapshot(t, "wander_plan");
    const one = await person("q-one", true), two = await person("q-two", true);
    await prisma.tripMember.createMany({ data: [{ tripId: t, travelerId: one.id }, { tripId: t, travelerId: two.id }] });
    pushed.length = 0;
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("a lookup was made"));
    try {
      await nudgeNow(new Date());
      await nudgeNow(new Date(Date.now() + 12 * 3600_000));
      expect((await tripsToWarm(ymd(Date.now()))).map((x) => x.id)).not.toContain(t);
      expect(await helloFor(t, one.id, one.name)).toBeNull();
      expect(await helloFor(t, two.id, "Julie")).toBeNull();
      expect(await helloFor(t, two.id, "Andy")).toBeNull();
      await refreshDueSources(async () => { throw new Error("a source was read"); });
      expect(pushed.filter((p) => [one.id, two.id].includes(p.to))).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
});
