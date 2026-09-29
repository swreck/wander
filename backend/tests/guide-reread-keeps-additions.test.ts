/**
 * LARISA CHANGES HER SHEET; WANDER RE-READS IT; NOTHING PEOPLE ADDED IS LOST (Sep 28 2026)
 *
 * Made-up trip (never real data). An idea people wrote on disappears from the new copy of the
 * Guide — renamed, or removed. keepWhatPeopleAdded (services/guide/importSnapshot.ts) runs before
 * the importer clears ideas that are gone:
 * - renamed (one new idea in the same city shares a distinctive word): notes, ratings, reactions,
 *   same-day plans and the idea's own notes move onto the new idea;
 * - removed: the idea stays, marked "Removed from Guide|…", with everything on it;
 * - nobody wrote on it: left for the importer to clear, as before.
 * And Scout won't change Larisa's own items (the next read would undo it).
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-reread";
await import("../src/index.js");
const { keepWhatPeopleAdded, REMOVED_PREFIX } = await import("../src/services/guide/importSnapshot.js");
const { guideItemRefusal } = await import("../src/routes/chat.js");
const prisma = new PrismaClient();

const TRIP = "Reread Keeps Additions Trip";
let tripId = "";
let cityId = "";
let travelerId = "";
const ids: Record<string, string> = {};

beforeAll(async () => {
  const trip = await prisma.trip.create({ data: { name: TRIP, startDate: new Date("2027-05-01"), endDate: new Date("2027-05-05") } });
  tripId = trip.id;
  const city = await prisma.city.create({ data: { tripId, name: "Pottersville", sequenceOrder: 0, guideKey: "pottersville" } });
  cityId = city.id;
  await prisma.day.create({ data: { tripId, cityId, date: new Date("2027-05-02T00:00:00.000Z") } });
  const t = await prisma.traveler.upsert({ where: { displayName: "RRWriter" }, update: {}, create: { displayName: "RRWriter" } });
  travelerId = t.id;
  const idea = (name: string) => prisma.experience.create({ data: { tripId, cityId, name, sheetRowRef: `Activities Template|${name}`, createdBy: "Larisa" } });
  ids.renamedOld = (await idea("Mashiko pottery day")).id;
  ids.removed = (await idea("Tea ceremony at Kodai")).id;
  ids.untouched = (await idea("Fish market breakfast")).id;
  ids.renamedNew = (await idea("Mashiko pottery day trip (with Julie?)")).id;
  // People wrote on the first two
  await prisma.experienceNote.create({ data: { experienceId: ids.renamedOld, travelerId, content: "Bring cash for the kilns" } });
  await prisma.experienceReaction.create({ data: { experienceId: ids.renamedOld, travelerId, emoji: "🔥" } });
  await prisma.experience.update({ where: { id: ids.renamedOld }, data: { userNotes: "Julie wants to go", latitude: 36.46, longitude: 140.09 } });
  await prisma.dayChoice.create({ data: { tripId, date: "2027-05-02", text: "Mashiko pottery day", experienceId: ids.renamedOld, travelerId } });
  await prisma.experienceNote.create({ data: { experienceId: ids.removed, travelerId, content: "Kodai said 2pm works" } });
});

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { name: TRIP } });
  await prisma.traveler.deleteMany({ where: { displayName: "RRWriter" } }).catch(() => {});
  await prisma.$disconnect();
});

describe("A re-read keeps what people added", () => {
  it("moves everything from a renamed idea, keeps a removed one, and leaves an unwritten one to be cleared", async () => {
    const report = { warnings: [] as string[] };
    // The new copy of the Guide has the renamed idea and nothing else of the old three
    const stillThere = [`Activities Template|Mashiko pottery day trip (with Julie?)`];
    await prisma.$transaction((tx) => keepWhatPeopleAdded(tx, tripId, stillThere, [{ id: ids.renamedNew, cityId, name: "Mashiko pottery day trip (with Julie?)" }], report));

    // Renamed: note, reaction, same-day plan, own notes and place all on the new idea
    expect(await prisma.experienceNote.count({ where: { experienceId: ids.renamedNew } })).toBe(1);
    expect(await prisma.experienceReaction.count({ where: { experienceId: ids.renamedNew } })).toBe(1);
    expect(await prisma.dayChoice.count({ where: { experienceId: ids.renamedNew } })).toBe(1);
    const moved = await prisma.experience.findUnique({ where: { id: ids.renamedNew } });
    expect(moved?.userNotes).toBe("Julie wants to go");
    expect(moved?.latitude).toBeCloseTo(36.46);

    // Removed: still there, marked, with its note
    const kept = await prisma.experience.findUnique({ where: { id: ids.removed }, include: { notes: true } });
    expect(kept?.sheetRowRef).toBe(`${REMOVED_PREFIX}Activities Template|Tea ceremony at Kodai`);
    expect(kept?.notes.map((n) => n.content)).toEqual(["Kodai said 2pm works"]);

    // Nobody wrote on it: unchanged here (the importer clears it next)
    const plain = await prisma.experience.findUnique({ where: { id: ids.untouched } });
    expect(plain?.sheetRowRef).toBe("Activities Template|Fish market breakfast");

    expect(report.warnings.join(" ")).toMatch(/now "Mashiko pottery day trip/);
    expect(report.warnings.join(" ")).toMatch(/Tea ceremony at Kodai" is no longer in the Guide/);
  });

  it("the importer's clean-up then removes only the unwritten one", async () => {
    const stillThere = [`Activities Template|Mashiko pottery day trip (with Julie?)`];
    await prisma.experience.deleteMany({ where: { tripId, sheetRowRef: { startsWith: "Activities Template|", notIn: stillThere } } });
    const left = (await prisma.experience.findMany({ where: { tripId }, select: { name: true } })).map((e) => e.name).sort();
    expect(left).toEqual(["Mashiko pottery day trip (with Julie?)", "Tea ceremony at Kodai"]);
    // Every note anyone wrote is still here
    expect(await prisma.experienceNote.count({ where: { traveler: { displayName: "RRWriter" } } })).toBe(2);
  });

  it("a second re-read with nothing new changes nothing", async () => {
    const report = { warnings: [] as string[] };
    const stillThere = [`Activities Template|Mashiko pottery day trip (with Julie?)`];
    await prisma.$transaction((tx) => keepWhatPeopleAdded(tx, tripId, stillThere, [], report));
    expect(report.warnings).toEqual([]);
    expect(await prisma.experienceNote.count({ where: { traveler: { displayName: "RRWriter" } } })).toBe(2);
  });
});

describe("Scout doesn't change Larisa's own items", () => {
  it("refuses to edit or move one of her ideas", async () => {
    for (const tool of ["update_experience", "promote_experience", "demote_experience", "move_experience"]) {
      expect(await guideItemRefusal(tool, { experienceId: ids.renamedNew })).toMatch(/Larisa's Guide/);
    }
    expect(await guideItemRefusal("reorder_experiences", { experienceIds: [ids.renamedNew] })).toMatch(/Larisa's Guide/);
  });

  it("refuses to change one of her stops", async () => {
    expect(await guideItemRefusal("update_city", { cityId })).toMatch(/Larisa's Guide/);
  });

  it("an idea no longer in her Guide, or one added in Wander, can still be changed", async () => {
    expect(await guideItemRefusal("update_experience", { experienceId: ids.removed })).toBeNull();
    const own = await prisma.experience.create({ data: { tripId, cityId, name: "Our own find", createdBy: "RRWriter" } });
    expect(await guideItemRefusal("update_experience", { experienceId: own.id })).toBeNull();
  });
});
