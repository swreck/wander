/**
 * The December plan tool's rows (S1, spec D11, T-c, T-d; Nov 17 2026). The tool lives in the private trip-data folder,
 * so these skip without it. Made-up plan data only ("Stay A", "Leg 1"). They run against the suite's own local run
 * database, with the suite's own client, never the tool's address.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import prisma from "../src/services/db.js";
import { dayHashes, currentSummaries, EMPTY_DAY_HASH } from "../src/services/guide/daySummaries.js";
import { fakePlan } from "./fixtures/fake-plan.js";

const DIR = path.resolve(import.meta.dirname, "../../trip-data/session-tools/december");
const have = fs.existsSync(path.join(DIR, "plan-lib.mts"));
const lib: any = have ? await import(path.join(DIR, "plan-lib.mts")) : null;
const TAG = `PLANT${Date.now()}`;
const names = { a: `${TAG}-Ken`, b: `${TAG}-Larisa` };
const planners = [{ name: names.a, showSamples: true }, { name: names.b, showSamples: false }];
// (the plan's trip exists before the first run and every run names it: other files build plan trips in this database at the
// same time, and a run that must find "the" plan trip would refuse, or adopt theirs; S3 fix, Nov 17 2026)
let ownTripId = "";
const run = (plan: any, extra: any = {}) => lib.runPlan(prisma, plan, { mode: "test", planners, ...(ownTripId ? { tripId: ownTripId } : {}), ...extra });
const tripOf = async () => (await prisma.guideSnapshot.findFirst({ where: { sourceKind: "wander_plan", trip: { name: { startsWith: "A Trip" } } }, select: { tripId: true } }))!.tripId;
const items = async (tripId: string) => prisma.guideItem.findMany({ where: { tripId }, orderBy: [{ date: "asc" }, { sortOrder: "asc" }] });
let created: string[] = [];

const planFor = (over: (p: any) => void = () => {}) => { const p = fakePlan(); p.trip.name = `A Trip ${TAG}`; over(p); return p; };
const tid = async () => (await prisma.trip.findFirst({ where: { name: `A Trip ${TAG}` } }))!.id;

beforeAll(async () => {
  if (!have) return;
  for (const n of Object.values(names)) await prisma.traveler.create({ data: { displayName: n } });
  const own = await prisma.trip.create({ data: { name: `A Trip ${TAG}`, status: "archived" } });
  ownTripId = own.id;
  await prisma.guideSnapshot.create({ data: { tripId: own.id, sourceName: "December plan", sourceKind: "wander_plan", contentHash: "x", status: "current", tabs: [], importedBy: "plan-tool" } });
});
afterAll(async () => {
  if (!have) return;
  await prisma.trip.deleteMany({ where: { name: { contains: TAG } } });
  await prisma.traveler.deleteMany({ where: { displayName: { startsWith: TAG } } });
});

describe.skipIf(!have)("the plan tool writes the plan (T-c)", () => {
  it("writes a trip found by its plan snapshot, two planners with their days, Ken first and sampling", async () => {
    const r = await run(planFor());
    expect(r.refused).toBeFalsy();
    const trip = await prisma.trip.findFirst({ where: { name: `A Trip ${TAG}` }, include: { tripMembers: { include: { traveler: true }, orderBy: { joinedAt: "asc" } }, guideSnapshots: true } });
    expect(trip!.guideSnapshots.map((s) => [s.sourceKind, s.status])).toEqual([["wander_plan", "current"]]);
    expect(trip!.startDate!.toISOString().slice(0, 10)).toBe("2027-03-01");
    expect(trip!.endDate!.toISOString().slice(0, 10)).toBe("2027-03-05");
    expect(trip!.tripMembers.map((m) => [m.traveler.displayName, m.role, m.showSamples, m.openedAt])).toEqual([[names.a, "planner", true, null], [names.b, "planner", false, null]]);
    expect(trip!.tripMembers[0].abroadFrom!.toISOString().slice(0, 10)).toBe("2027-03-01");
  });

  it("run twice: the second run reports 0 changes and the rows are the same", async () => {
    const id = await tid();
    const before = JSON.stringify(await items(id));
    const r = await run(planFor());
    expect(r.text).toMatch(/\b0 changes\b/);
    expect(JSON.stringify(await items(id))).toBe(before);
  });

  it("find writes nothing", async () => {
    const id = await tid();
    const n = await prisma.guideItem.count({ where: { tripId: id } });
    const p = planFor((x) => { x.stays.pop(); x.days.forEach((d: any) => { if (d.stay === "stay-b") delete d.stay; }); });
    const r = await run(p, { mode: "find" });
    expect(r.refused, r.text).toBeFalsy();
    expect(r.text).toMatch(/would remove/i);
    expect(await prisma.guideItem.count({ where: { tripId: id } })).toBe(n);
  });

  it("a flight that lands the next day is two rows; the zone and words are the arrival's own", async () => {
    const rows = (await items(await tid())).filter((i) => i.sourceRef.startsWith("plan:leg:leg-1"));
    expect(rows.map((i) => [i.sourceRef, i.kind, i.date!.toISOString().slice(0, 10), i.time, i.endTime, i.timeZone, i.forWhom])).toEqual([
      ["plan:leg:leg-1", "flight", "2027-03-01", "11:45", null, "America/Los_Angeles", "Pat & Sam"],
      ["plan:leg:leg-1:land", "flight", "2027-03-02", "17:40", null, "Asia/Ho_Chi_Minh", "Pat & Sam"],
    ]);
    expect(rows[0].title).toBe("XY 123 · Home City (AAA) → City A Airport (BBB)");
    expect(rows[0].detail).toMatch(/Lands at City A Airport \(BBB\) Tue, Mar 2, 5:40 PM Vietnam time/);
    expect(rows[1].title).toBe("Land at City A Airport (BBB) · XY 123");
    expect(rows[0].confirmation).toBeNull();
    expect(rows[0].cells).toBeNull();
  });

  it("a flight with no times is a 'travel' row; a timed train has start and end", async () => {
    const all = await items(await tid());
    const f = all.find((i) => i.sourceRef === "plan:leg:leg-2")!;
    expect([f.kind, f.time, f.title, f.forWhom]).toEqual(["travel", null, "City A → City B", "Everyone"]);
    expect(f.detail).toMatch(/The tour company books it/);
    const t = all.find((i) => i.sourceRef === "plan:leg:leg-3")!;
    expect([t.kind, t.time, t.endTime, t.timeZone, t.title]).toEqual(["train", "09:20", "10:44", "Asia/Tokyo", "Fast Line 507 · City B Station → City C"]);
  });

  it("a stay is an Accommodation with its marker and a check-in and a check-out; no 'stop' line", async () => {
    const id = await tid();
    const a = await prisma.accommodation.findFirst({ where: { tripId: id, planKey: "stay-a" } });
    expect([a!.name, a!.checkInTime, a!.checkOutTime, a!.notes, a!.forWhom, a!.guideKey, a!.sheetRowRef, a!.confirmationNumber, a!.latitude]).toEqual(["Stay A Hotel", "15:00", "12:00", "A King Room, 1 room, 2 adults", "Pat & Sam", null, null, null, null]);
    expect(a!.checkInDate!.toISOString().slice(0, 10)).toBe("2027-03-01");
    expect(a!.checkOutDate!.toISOString().slice(0, 10)).toBe("2027-03-03");
    const all = await items(id);
    const cin = all.find((i) => i.sourceRef === "plan:stay:stay-a:in")!;
    expect([cin.kind, cin.time, cin.title, cin.place, cin.timeZone]).toEqual(["checkin", "15:00", "Check in · Stay A Hotel", "1 Made Up Street, City A", "Asia/Ho_Chi_Minh"]);
    expect(cin.detail).toBe("Room: A King Room, 1 room, 2 adults\nPhone: +10000000001");
    const cout = all.find((i) => i.sourceRef === "plan:stay:stay-a:out")!;
    expect([cout.kind, cout.time, cout.title, cout.detail]).toEqual(["checkout", "12:00", "Check out · Stay A Hotel", null]);
    expect(all.filter((i) => i.kind === "stop")).toEqual([]);
  });

  it("every plan item has the plan's marker, a snapshot, and a date that has a Day row", async () => {
    const id = await tid();
    const days = new Set((await prisma.day.findMany({ where: { tripId: id } })).map((d) => d.date.toISOString().slice(0, 10)));
    const all = await items(id);
    expect(all.length).toBeGreaterThan(8);
    for (const i of all) {
      expect(i.sourceRef.startsWith("plan:")).toBe(true);
      expect(i.date && days.has(i.date.toISOString().slice(0, 10))).toBe(true);
    }
  });

  it("a day's lines and its commitments: kinds by first words; the timed cantMiss is a meeting; the day row notes", async () => {
    const all = await items(await tid());
    const lines = all.filter((i) => i.sourceRef.startsWith("plan:day:2027-03-03:line:"));
    expect(lines.map((i) => [i.kind, i.title, i.time])).toEqual([["tour", "Welcome walk, 1 hour", null], ["meal", "Dinner together", null]]);
    const m = all.find((i) => i.kind === "meeting")!;
    expect([m.time, m.timeZone, m.place]).toEqual(["09:00", "Asia/Tokyo", "The Lobby, Stay A Hotel"]);
    expect(m.detail).toBe("Bring walking shoes.");
  });

  it("cantMiss lines print as WRITTEN, SKIPPED (with the row that holds it) or HELD", async () => {
    const p = planFor((x) => {
      x.days[3].cantMiss = ["The train leaves at 9:20 am.", "Ken and Pat: hotel check-out by 12:00 pm.", "Bring a hat (not read by me)."];
    });
    const r = await run(p, { mode: "find" });
    expect(r.text).toMatch(/SKIPPED.*The train leaves at 9:20 am.*plan:leg:leg-3/);
    expect(r.text).toMatch(/WRITTEN.*9:00 am, The Lobby/);
    expect(r.text).toMatch(/HELD.*Bring a hat/);
  });

  it("a stay that is 'pending' but booked is REAL, with its shown dates; the pending text is never written", async () => {
    const p = planFor((x) => { Object.assign(x.stays[1], { status: "pending", pending: "Waiting on SECRETWORD from the hotel.", bookedCheckOut: "2027-03-06", checkOutTime: "before 11:00 am" }); });
    const r = await run(p);
    const id = await tid();
    const b = await prisma.accommodation.findFirst({ where: { tripId: id, planKey: "stay-b" } });
    expect(b!.checkOutDate!.toISOString().slice(0, 10)).toBe("2027-03-05");
    expect(b!.checkOutTime).toBe("11:00");
    const dump = JSON.stringify([await items(id), await prisma.accommodation.findMany({ where: { tripId: id } }), await prisma.sampleEntry.findMany({ where: { tripId: id } })]);
    expect(dump).not.toMatch(/SECRETWORD|Waiting on/);
    expect(r.text).not.toMatch(/\b0 changes\b/);
    await run(planFor());
  });

  it("an unconfirmed leg and an unconfirmed stay become sample entries, never rows", async () => {
    const p = planFor((x) => {
      x.legs.push({ key: "leg-u", date: "2027-03-04", who: "Sam", mode: "flight", service: "ZZ 9", from: "City B", to: "City A", note: "Maybe.", status: "unconfirmed", fromWhom: "Pat's notes", source: "p6", read: "me" });
      x.days[3].legs.push("leg-u");
      x.stays[1].checkOut = "2027-03-04"; x.days[3].stay = "stay-u";
      x.stays.push({ key: "stay-u", city: "city-b", name: "Stay U", checkIn: "2027-03-04", checkOut: "2027-03-05", forWhom: "Sam", status: "unconfirmed", from: "Pat's notes", source: "p3", read: "me" });
    });
    const first = await run(p);
    expect(first.refused, first.text).toBeFalsy();
    const id = await tid();
    expect((await items(id)).some((i) => /leg-u|stay-u/.test(i.sourceRef))).toBe(false);
    expect(await prisma.accommodation.count({ where: { tripId: id, planKey: "stay-u" } })).toBe(0);
    const s = await prisma.sampleEntry.findMany({ where: { tripId: id }, orderBy: { slot: "asc" } });
    expect(s.map((x) => [x.kind, x.slot, x.date])).toEqual([["unconfirmed", "leg:leg-u", "2027-03-04"], ["unconfirmed", "stay:stay-u", "2027-03-04"]]);
    expect(JSON.stringify(s[0].data)).toMatch(/Not confirmed/);
    expect(JSON.stringify(s[0].data)).toContain("⁣⁣");
    expect((await run(p)).text).toMatch(/\b0 changes\b/);
    await run(planFor());
    expect(await prisma.sampleEntry.count({ where: { tripId: id } })).toBe(0);
  });

  it("a stay removed from the file removes its Accommodation and its check-in and check-out, and nothing else", async () => {
    const id = await tid();
    const before = (await items(id)).filter((i) => !i.sourceRef.startsWith("plan:stay:stay-b"));
    await run(planFor((x) => { x.stays.pop(); x.days.forEach((d: any) => { if (d.stay === "stay-b") delete d.stay; }); }));
    expect(await prisma.accommodation.count({ where: { tripId: id, planKey: "stay-b" } })).toBe(0);
    const after = await items(id);
    expect(after.some((i) => i.sourceRef.startsWith("plan:stay:stay-b"))).toBe(false);
    expect(after.map((i) => i.sourceRef).sort()).toEqual(before.map((i) => i.sourceRef).sort());
    expect(await prisma.accommodation.count({ where: { tripId: id, planKey: "stay-a" } })).toBe(1);
    await run(planFor());
    expect(await prisma.accommodation.count({ where: { tripId: id, planKey: "stay-b" } })).toBe(1);
  });

  it("a day removed: its Day row and its lines go, the other days stay", async () => {
    const id = await tid();
    const n = await prisma.day.count({ where: { tripId: id } });
    const r = await run(planFor((x) => { x.days.pop(); x.trip.lastDay = "2027-03-04"; x.cities[1].leave = "2027-03-04"; x.stays[1].checkOut = "2027-03-04"; delete x.days[3].stay; }));
    expect(r.refused, r.text).toBeFalsy();
    expect(await prisma.day.count({ where: { tripId: id } })).toBe(n - 1);
    expect((await prisma.trip.findUnique({ where: { id } }))!.endDate!.toISOString().slice(0, 10)).toBe("2027-03-04");
    expect((await items(id)).some((i) => i.date!.toISOString().slice(0, 10) === "2027-03-05")).toBe(false);
    await run(planFor());
    expect(await prisma.day.count({ where: { tripId: id } })).toBe(n);
  });

  it("an empty plan (no stays, legs, days or cities) is refused cleanly, with nothing written and nothing thrown", async () => {
    const id = await tid();
    const n = await prisma.guideItem.count({ where: { tripId: id } });
    const p = planFor((x) => { x.stays = []; x.legs = []; x.days = []; x.cities = []; x.ideas = []; });
    for (const mode of ["find", "test"]) {
      const r = await run(p, { mode });
      expect(r.refused).toBe(true);
      expect(r.text).toMatch(/Refusing/);
    }
    expect(await prisma.guideItem.count({ where: { tripId: id } })).toBe(n);
  });

  it("a plan with days and no lines, legs or stays writes the days and nothing else", async () => {
    const p = planFor((x) => { x.stays = []; x.legs = []; x.days.forEach((d: any) => { delete d.legs; delete d.stay; delete d.cantMiss; delete d.lines; }); });
    const r = await run(p, { mode: "find" });
    expect(r.refused, r.text).toBeFalsy();
    expect(r.text).toMatch(/\(no rows\)/);
  });

  it("a plan-check problem refuses and writes nothing", async () => {
    const id = await tid();
    const n = await prisma.guideItem.count({ where: { tripId: id } });
    const r = await run(planFor((x) => { x.days[1].weekday = "Sat"; }));
    expect(r.refused).toBe(true);
    expect(r.text).toMatch(/plan-check/i);
    expect(await prisma.guideItem.count({ where: { tripId: id } })).toBe(n);
  });

  it("the private lists are never written: neverShow key words, PIN, card and health words", async () => {
    const id = await tid();
    const dump = JSON.stringify([await items(id), await prisma.accommodation.findMany({ where: { tripId: id } }), await prisma.day.findMany({ where: { tripId: id } }), await prisma.sampleEntry.findMany({ where: { tripId: id } }), (await prisma.sheetSyncConfig.findUnique({ where: { tripId: id } }))?.tabMappings]);
    for (const w of ["Quincy", "Nowhere", "Phantom", "made-up later item", "waiting on someone", "A made-up question"]) expect(dump).not.toContain(w);
    expect(lib.privateHits(["Your PIN is 1234"], planFor())).not.toEqual([]);
    expect(lib.privateHits(["Pay with card ending 4242"], planFor())).not.toEqual([]);
    expect(lib.privateHits(["Her health notes"], planFor())).not.toEqual([]);
  });

  it("a private word that reaches a row stops the write (a leg's note carrying a neverShow word)", async () => {
    const id = await tid();
    const n = await prisma.guideItem.count({ where: { tripId: id } });
    const r = await run(planFor((x) => { x.legs[2].note = "Ask about Quincy's flight."; }));
    expect(r.refused, r.text).toBe(true);
    expect(r.text).toMatch(/Quincy/);
    expect(await prisma.guideItem.count({ where: { tripId: id } })).toBe(n);
  });

  it("'passport' passes as an instruction, and fails with a number, 'no.', 'number', 'details', 'expir' or a 6+ character code", () => {
    const ok = lib.privateHits(["Arrive in walking clothes with your passport, a daypack and rain gear."], planFor());
    expect(ok).toEqual([]);
    for (const t of ["passport no. X1234567", "Your passport number is on file", "passport details attached", "passport expires 2030", "passport AB12CD", "passport 12345678"]) expect(lib.privateHits([t], planFor()), t).not.toEqual([]);
  });

  it("the tool leaves another trip's rows alone, and finds its trip by the snapshot, not the name", async () => {
    const other = await prisma.trip.create({ data: { name: `A Trip ${TAG} ingest test` } });
    await run(planFor());
    expect(await prisma.guideItem.count({ where: { tripId: other.id } })).toBe(0);
    expect(await prisma.guideSnapshot.count({ where: { tripId: other.id } })).toBe(0);
    created.push(other.id);
  });

  it("a trip with no wander_plan snapshot is refused (T-d)", async () => {
    const t = await prisma.trip.create({ data: { name: `Guide trip ${TAG}` } });
    const s = await prisma.guideSnapshot.create({ data: { tripId: t.id, sourceName: "x.xlsx", sourceKind: "xlsx", contentHash: "h", tabs: [] } });
    await prisma.guideItem.create({ data: { tripId: t.id, snapshotId: s.id, kind: "note", title: "Hers", source: "Tab", sourceRef: "Tab!A1", date: new Date("2027-03-01") } });
    const r = await run(planFor(), { tripId: t.id });
    expect(r.refused).toBe(true);
    expect(r.text).toMatch(/isn't built from Wander's own plan/);
    expect(await prisma.guideItem.count({ where: { tripId: t.id } })).toBe(1);
    expect(await prisma.city.count({ where: { tripId: t.id } })).toBe(0);
  });

  it("a Guide row in the plan's own trip is never touched (only plan: rows are replaced)", async () => {
    const id = await tid();
    const snap = await prisma.guideSnapshot.findFirst({ where: { tripId: id, sourceKind: "wander_plan" } });
    await prisma.guideItem.create({ data: { tripId: id, snapshotId: snap!.id, kind: "note", title: "Not the plan's", source: "Tab", sourceRef: "Tab!A1", date: new Date("2027-03-02") } });
    await run(planFor((x) => { x.legs = x.legs.slice(0, 1); x.days.forEach((d: any) => { d.legs = (d.legs || []).filter((k: string) => k === "leg-1"); }); }));
    expect(await prisma.guideItem.count({ where: { tripId: id, title: "Not the plan's" } })).toBe(1);
    await prisma.guideItem.deleteMany({ where: { tripId: id, title: "Not the plan's" } });
  });

  it("a day's summary shows: the hash is the one dayHashes gives, and a day with no rows counts (Q6)", async () => {
    const quiet = () => planFor((x) => { x.legs.pop(); x.days[3].legs = []; });
    const r = await run(quiet());
    expect(r.refused, r.text).toBeFalsy();
    const id = await tid();
    const shown = await currentSummaries(id);
    expect(shown["2027-03-03"]).toBe("Fly to City B and settle in.");
    expect(shown["2027-03-04"]).toBe("A train day.");
    expect(Object.keys(await dayHashes(id))).not.toContain("2027-03-04");
    expect((await run(quiet())).text).toMatch(/\b0 changes\b/);
    await run(planFor());
    expect((await currentSummaries(id))["2027-03-04"]).toBe("A train day.");
  });

  it("a changed day hides its summary until the tool rewrites it: the stored hash follows the rows", async () => {
    const id = await tid();
    await prisma.guideItem.updateMany({ where: { tripId: id, sourceRef: "plan:leg:leg-3" }, data: { title: "Changed by hand" } });
    expect((await currentSummaries(id))["2027-03-04"]).toBeUndefined();
    await run(planFor());
    expect((await currentSummaries(id))["2027-03-04"]).toBe("A train day.");
  });

  it("other keys in the trip's config survive a run", async () => {
    const id = await tid();
    const cfg = await prisma.sheetSyncConfig.findUnique({ where: { tripId: id } });
    await prisma.sheetSyncConfig.update({ where: { tripId: id }, data: { tabMappings: { ...(cfg!.tabMappings as any), keepMe: 1 } } });
    await run(planFor());
    expect(((await prisma.sheetSyncConfig.findUnique({ where: { tripId: id } }))!.tabMappings as any).keepMe).toBe(1);
  });

  it("a city with no coordinates gets null, never a guess; find names each one", async () => {
    const id = await tid();
    const cities = await prisma.city.findMany({ where: { tripId: id }, orderBy: { sequenceOrder: "asc" } });
    expect(cities.map((c) => [c.planKey, c.country, c.timeZone, c.latitude, c.longitude, c.hidden, c.guideKey])).toEqual([
      ["city-a", "Vietnam", "Asia/Ho_Chi_Minh", null, null, false, null], ["city-b", "Japan", "Asia/Tokyo", null, null, false, null]]);
    expect((await run(planFor(), { mode: "find" })).text).toMatch(/no coordinates.*City A/s);
    await run(planFor((x) => { x.cities[0].lat = 21.03; x.cities[0].lng = 105.85; }));
    const a = await prisma.city.findFirst({ where: { tripId: id, planKey: "city-a" } });
    expect([a!.latitude, a!.longitude]).toEqual([21.03, 105.85]);
  });

  it("never stamps openedAt, and a person already on the trip keeps their own choice", async () => {
    const id = await tid();
    const m = await prisma.tripMember.findFirst({ where: { tripId: id, traveler: { displayName: names.b } } });
    await prisma.tripMember.update({ where: { id: m!.id }, data: { openedAt: new Date("2027-01-01") } });
    await run(planFor());
    expect((await prisma.tripMember.findUnique({ where: { id: m!.id } }))!.openedAt!.toISOString().slice(0, 10)).toBe("2027-01-01");
  });

  it("the tool's day hash equals the backend's own for a day with rows", async () => {
    const id = await tid();
    const h = await dayHashes(id);
    expect(lib.hashFromRows).toBeTypeOf("function");
    expect(lib.hashFromRows([])).toBe(EMPTY_DAY_HASH);
    const rows = await prisma.guideItem.findMany({ where: { tripId: id, date: { not: null } }, orderBy: [{ time: "asc" }, { sortOrder: "asc" }] });
    expect(lib.hashFromRows(rows.filter((r) => r.date!.toISOString().slice(0, 10) === "2027-03-04"))).toBe(h["2027-03-04"].hash);
  });
});

describe("a Guide trip's summaries read the same with or without the empty-day rule (Q6)", () => {
  it("every trip's current summaries equal the old rule's (a stored hash must match a day that has rows)", async () => {
    const cfgs = await prisma.sheetSyncConfig.findMany({ select: { tripId: true, tabMappings: true } });
    let checked = 0;
    for (const c of cfgs) {
      const stored = (c.tabMappings as any)?.daySummaries;
      if (!stored || typeof stored !== "object") continue;
      const trip = await prisma.trip.findUnique({ where: { id: c.tripId }, select: { guideSnapshots: { where: { sourceKind: "wander_plan" }, select: { id: true } } } });
      if (trip?.guideSnapshots.length) continue;
      const hashes = await dayHashes(c.tripId);
      const old: Record<string, string> = {};
      for (const [date, s] of Object.entries<any>(stored)) if (hashes[date] && hashes[date].hash === s.hash && s.text?.trim()) old[date] = s.text.trim();
      expect(await currentSummaries(c.tripId)).toEqual(old);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(0);
  });
});

describe.skipIf(!have)("a check-in with no time sits where the day reaches the hotel (S3 fix 10)", () => {
  // The fake plan's Wed Mar 3: lines "Welcome walk, 1 hour" and "Dinner together"; Stay B Inn (no check-in time) checks in.
  const dayTitles = async (date: string, untimedOnly = true) =>
    (await items(await tid())).filter((i) => i.date!.toISOString().slice(0, 10) === date && (!untimedOnly || i.time === null)).map((i) => i.title);
  const withLines = (lines: string[], extra: (p: any) => void = () => {}) => planFor((p) => { p.days[2].lines = lines; extra(p); });
  // (named by its trip: other files build plan trips in this database at the same time, and a run that must find "the" plan trip refuses)
  const go = async (p: any) => run(p, { tripId: await tid() });

  it("with no line naming the stay: directly before the day's first dinner line", async () => {
    await go(withLines(["Welcome walk, 1 hour", "Dinner together"]));
    const t = await dayTitles("2027-03-03");
    expect(t.indexOf("Check in · Stay B Inn")).toBe(t.indexOf("Dinner together") - 1);
    expect(t.indexOf("Welcome walk, 1 hour")).toBe(t.indexOf("Check in · Stay B Inn") - 1);
  });

  it("with a line naming the stay (its first two words): directly after the last such line, even after dinner", async () => {
    await go(withLines(["Welcome walk, 1 hour", "Dinner together", "Shuttle to Stay B Inn, 20 minutes", "Free time"]));
    const t = await dayTitles("2027-03-03");
    expect(t.indexOf("Check in · Stay B Inn")).toBe(t.indexOf("Shuttle to Stay B Inn, 20 minutes") + 1);
    expect(t.indexOf("Free time")).toBe(t.indexOf("Check in · Stay B Inn") + 1);
  });

  it("with no stay-naming line and no dinner: last", async () => {
    await go(withLines(["Welcome walk, 1 hour", "Morning stroll"]));
    const t = await dayTitles("2027-03-03");
    expect(t[t.length - 1]).toBe("Check in · Stay B Inn");
  });

  it("a check-in with a time keeps its place by the clock; a day with no lines keeps the old order; check-outs do not move", async () => {
    await go(withLines(["Welcome walk, 1 hour", "Dinner together"], (p) => { p.stays[1].checkInTime = "5:00 pm"; }));
    const all = await dayTitles("2027-03-03", false);
    // (by the clock: after the 9:00 meeting and the 12:00 check-out, before every line with no time)
    expect(all.slice(0, 3)).toEqual(["Meet the Backroads leaders · The Lobby, Stay A Hotel", "Check out · Stay A Hotel", "Check in · Stay B Inn"]);
    await go(withLines([]));
    const none = await dayTitles("2027-03-03");
    // (no lines: where the tool has always put it, after the day's other untimed rows made earlier)
    expect(none.indexOf("Check in · Stay B Inn")).toBe(none.indexOf("City A → City B") + 1);
    await go(planFor());
  });

  it("a flight with no time that the day's own lines name is that line, once: its words go under it (S3d)", async () => {
    await go(withLines(["Welcome walk, 1 hour", "Shuttle to the airport, 45 minutes", "Flight to City B, 2 hours (the time can change)", "Dinner together"]));
    const all = (await items(await tid())).filter((i) => i.date!.toISOString().slice(0, 10) === "2027-03-03");
    expect(all.some((i) => i.sourceRef === "plan:leg:leg-2")).toBe(false);
    expect(all.some((i) => i.title === "City A → City B")).toBe(false);
    const line = all.find((i) => i.title === "Flight to City B, 2 hours (the time can change)")!;
    expect([line.kind, line.time, line.sourceRef]).toEqual(["travel", null, "plan:day:2027-03-03:line:3"]);
    expect(line.detail).toBe("The tour company books it\nA morning flight, about 2 hours.");
    // (the shuttle keeps no words of the flight's; with no such line the leg is its own row again)
    expect(all.find((i) => i.title === "Shuttle to the airport, 45 minutes")!.detail).toBeNull();
    await go(planFor());
    expect((await items(await tid())).some((i) => i.sourceRef === "plan:leg:leg-2")).toBe(true);
  });

  it("a second run reports 0 changes", async () => {
    const p = () => withLines(["Welcome walk, 1 hour", "Dinner together", "Shuttle to Stay B Inn, 20 minutes"]);
    await go(p());
    expect((await go(p())).text).toMatch(/\b0 changes\b/);
    await go(planFor());
  });
});
