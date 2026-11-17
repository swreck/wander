/**
 * The December plan tool writes Ken's samples from a file (S3a, Nov 17 2026). The tool lives in the private trip-data
 * folder, so these skip without it. Made-up plan data and made-up words only. They run against the suite's own local run
 * database with the suite's own client, never the tool's address, and always name their trip (other files build plan trips
 * in the same database at the same time).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import prisma from "../src/services/db.js";
import { markedThrough, partOf, samplesFor } from "../src/services/samples.js";
import { fakePlan } from "./fixtures/fake-plan.js";

const DIR = path.resolve(import.meta.dirname, "../../trip-data/session-tools/december");
const have = fs.existsSync(path.join(DIR, "plan-lib.mts"));
const lib: any = have ? await import(path.join(DIR, "plan-lib.mts")) : null;
const TAG = `PLANS${Date.now()}`;
const names = { a: `${TAG}-Ken`, b: `${TAG}-Larisa` };
const planners = [{ name: names.a, showSamples: true }, { name: names.b, showSamples: false }];
const TRIP = `Samp Trip ${TAG}`;
let tripId = "";
let tmp = "";
let n = 0;

const planFor = (over: (p: any) => void = () => {}) => { const p = fakePlan(); p.trip.name = TRIP; over(p); return p; };
const fileOf = (body: unknown) => { const f = path.join(tmp, `s${n++}.json`); fs.writeFileSync(f, typeof body === "string" ? body : JSON.stringify(body)); return f; };
const run = (samples: unknown | undefined, extra: any = {}, plan = planFor()) =>
  lib.runPlan(prisma, plan, { mode: "test", planners, tripId, ...(samples === undefined ? {} : { samplesPath: fileOf(samples) }), ...extra });
const rows = () => prisma.sampleEntry.findMany({ where: { tripId }, orderBy: [{ kind: "asc" }, { slot: "asc" }] });
const FIVE = ["line", "summary", "maybe", "note", "trip_photo"];

const GOOD = { samples: [
  { kind: "line", date: "2027-03-02", part: "morning", time: "09:30", title: "A made-up market walk", detail: "Made-up detail.", picture: true },
  { kind: "line", date: "2027-03-02", part: "evening", title: "A made-up dinner" },
  { kind: "summary", date: "2027-03-02", text: "A made-up summary of a made-up day." },
  { kind: "maybe", city: "city-a", n: 1, title: "A made-up maybe", detail: "Made-up maybe detail." },
  { kind: "maybe", city: "city-b", n: 2, title: "Another made-up maybe" },
  { kind: "note", date: "2027-03-04", text: "A made-up note." },
  { kind: "trip_photo", date: "2027-03-04", caption: "A made-up caption" },
] };
const M = "⁣⁣";

beforeAll(async () => {
  if (!have) return;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plan-samples-"));
  for (const x of Object.values(names)) await prisma.traveler.create({ data: { displayName: x } });
  const t = await prisma.trip.create({ data: { name: TRIP, status: "archived" } });
  tripId = t.id;
  await prisma.guideSnapshot.create({ data: { tripId, sourceName: "December plan", sourceKind: "wander_plan", contentHash: "x", status: "current", tabs: [], importedBy: "plan-tool" } });
  const first = await run(undefined);
  if (first.refused) throw new Error(first.text);
});
afterAll(async () => {
  if (!have) return;
  await prisma.trip.deleteMany({ where: { name: { contains: TAG } } });
  await prisma.traveler.deleteMany({ where: { displayName: { startsWith: TAG } } });
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

describe.skipIf(!have)("the plan tool's sample boundaries are the server's", () => {
  it("every minute of the day lands in the same part as partOf in services/samples.ts", () => {
    for (let m = 0; m < 1440; m++) {
      const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      expect(lib.partOfTime(t), t).toBe(partOf(t));
    }
  });
});

describe.skipIf(!have)("samples from a file (S3a)", () => {
  it("each kind is created with its slot, date and data; every string is marked; a maybe has no date", async () => {
    const r = await run(GOOD);
    expect(r.refused, r.text).toBeFalsy();
    expect(r.text).toMatch(/\b7 changes\b/);
    const s = await rows();
    expect(s.map((x) => [x.kind, x.slot, x.date])).toEqual([
      ["line", "2027-03-02|evening", "2027-03-02"], ["line", "2027-03-02|morning", "2027-03-02"],
      ["maybe", "city-a|1", null], ["maybe", "city-b|2", null],
      ["note", "2027-03-04|note", "2027-03-04"], ["summary", "2027-03-02|summary", "2027-03-02"], ["trip_photo", "2027-03-04|photo", "2027-03-04"],
    ]);
    const by = Object.fromEntries(s.map((x) => [`${x.kind}|${x.slot}`, x.data as any]));
    expect(by["line|2027-03-02|morning"]).toEqual({ time: `09:30${M}`, title: `A made-up market walk${M}`, detail: `Made-up detail.${M}`, picture: true });
    expect(by["line|2027-03-02|evening"]).toEqual({ title: `A made-up dinner${M}` });
    expect(by["summary|2027-03-02|summary"]).toEqual({ text: `A made-up summary of a made-up day.${M}` });
    expect(by["maybe|city-a|1"]).toEqual({ title: `A made-up maybe${M}`, detail: `Made-up maybe detail.${M}` });
    expect(by["maybe|city-b|2"]).toEqual({ title: `Another made-up maybe${M}` });
    expect(by["note|2027-03-04|note"]).toEqual({ text: `A made-up note.${M}` });
    expect(by["trip_photo|2027-03-04|photo"]).toEqual({ caption: `A made-up caption${M}` });
    for (const x of s) expect(markedThrough(x.data), `${x.kind} ${x.slot}`).toBe(true);
  });

  it("samplesFor gives them to the member who sees samples and nothing to the other", async () => {
    const ken = await prisma.traveler.findUnique({ where: { displayName: names.a } });
    const lar = await prisma.traveler.findUnique({ where: { displayName: names.b } });
    const mine = await samplesFor(tripId, ken!.id);
    expect(mine.map((x) => `${x.kind}|${x.slot}`).sort()).toEqual((await rows()).map((x) => `${x.kind}|${x.slot}`).sort());
    expect(await samplesFor(tripId, lar!.id)).toEqual([]);
  });

  it("find prints each day's slots and each city's maybes, never a sample's words, and writes nothing", async () => {
    const before = JSON.stringify(await rows());
    const r = await run(GOOD, { mode: "find" });
    expect(r.refused, r.text).toBeFalsy();
    expect(r.text).toMatch(/2027-03-02 .*\| sample: 2027-03-02\|morning, 2027-03-02\|evening, 2027-03-02\|summary/);
    expect(r.text).toMatch(/2027-03-04 .*\| sample: 2027-03-04\|note, 2027-03-04\|photo/);
    expect(r.text).toMatch(/city-a\s+maybes \| sample: city-a\|1/);
    expect(r.text).toMatch(/city-b\s+maybes \| sample: city-b\|2/);
    expect(r.text).not.toMatch(/made-up/i);
    expect(r.text).toMatch(/\b0 changes\b/);
    expect(JSON.stringify(await rows())).toBe(before);
  });

  it("a second run reports 0 changes and leaves the rows as they were", async () => {
    const before = JSON.stringify(await rows());
    const r = await run(GOOD);
    expect(r.text).toMatch(/\b0 changes\b/);
    expect(JSON.stringify(await rows())).toBe(before);
  });

  it("one changed title is one change; the other rows are untouched", async () => {
    const before = await rows();
    const edited = JSON.parse(JSON.stringify(GOOD));
    edited.samples[3].title = "A made-up maybe, reworded";
    const r = await run(edited);
    expect(r.text).toMatch(/\b1 changes\b/);
    expect(r.text).toMatch(/change sample: city-a\|1/);
    const after = await rows();
    expect(after.length).toBe(before.length);
    for (const b of before) {
      const a = after.find((x) => x.id === b.id)!;
      if (b.slot === "city-a|1") expect((a.data as any).title).toBe(`A made-up maybe, reworded${M}`);
      else expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
    await run(GOOD);
  });

  it("an entry gone from the file removes its row and nothing else", async () => {
    const before = await rows();
    const fewer = { samples: GOOD.samples.filter((e: any) => e.kind !== "note") };
    const r = await run(fewer);
    expect(r.text).toMatch(/\b1 changes\b/);
    expect(r.text).toMatch(/remove sample: 2027-03-04\|note/);
    const after = await rows();
    expect(after.map((x) => x.id).sort()).toEqual(before.filter((x) => x.kind !== "note").map((x) => x.id).sort());
    await run(GOOD);
  });

  it("with no file, an empty file or an empty list the five kinds go and the unconfirmed rows stay; a plan with no file runs as before", async () => {
    const withUnconfirmed = planFor((x) => {
      x.legs.push({ key: "leg-u", date: "2027-03-04", who: "Sam", mode: "flight", service: "ZZ 9", from: "City B", to: "City A", note: "Maybe.", status: "unconfirmed", fromWhom: "Pat's notes", source: "p6", read: "me" });
      x.days[3].legs.push("leg-u");
    });
    await run(GOOD, {}, withUnconfirmed);
    expect((await rows()).filter((x) => FIVE.includes(x.kind)).length).toBe(7);
    expect((await rows()).filter((x) => x.kind === "unconfirmed").length).toBe(1);
    for (const gone of [undefined, "", "  \n", { samples: [] }]) {
      await run(GOOD, {}, withUnconfirmed);
      const r = await run(gone, {}, withUnconfirmed);
      expect(r.refused, r.text).toBeFalsy();
      expect(r.text).toMatch(/\b7 changes\b/);
      const left = await rows();
      expect(left.filter((x) => FIVE.includes(x.kind))).toEqual([]);
      expect(left.map((x) => [x.kind, x.slot])).toEqual([["unconfirmed", "leg:leg-u"]]);
      expect((await run(gone, {}, withUnconfirmed)).text).toMatch(/\b0 changes\b/);
    }
    const missing = await lib.runPlan(prisma, withUnconfirmed, { mode: "test", planners, tripId, samplesPath: path.join(tmp, "no-such-file.json") });
    expect(missing.refused, missing.text).toBeFalsy();
    expect(missing.text).toMatch(/\b0 changes\b/);
    await run(undefined);
  });
});

describe.skipIf(!have)("a samples file with any problem refuses the whole run and writes nothing", () => {
  const good = () => JSON.parse(JSON.stringify(GOOD));
  const only = (e: any) => ({ samples: [good().samples[0], e] });
  const bad: [string, unknown, RegExp][] = [
    ["an unknown kind", only({ kind: "weather", date: "2027-03-02", text: "x" }), /entry 2 \(kind weather\).*kind must be one of/],
    ["kind expense", only({ kind: "expense", date: "2027-03-02", text: "x" }), /entry 2 \(kind expense\).*never come from this file/],
    ["kind unconfirmed", only({ kind: "unconfirmed", slot: "leg:x", title: "x" }), /entry 2 \(kind unconfirmed\)/],
    ["a date that is not a plan day", only({ kind: "note", date: "2027-04-01", text: "A made-up note." }), /entry 2 \(kind note\).*date is not one of the plan's days/],
    ["a city that is not a plan city", only({ kind: "maybe", city: "city-z", n: 1, title: "A made-up maybe" }), /entry 2 \(kind maybe\).*city is not one of/],
    ["n of 0", only({ kind: "maybe", city: "city-a", n: 0, title: "A made-up maybe" }), /entry 2 \(kind maybe, slot city-a\).*n must be/],
    ["n of 10", only({ kind: "maybe", city: "city-a", n: 10, title: "A made-up maybe" }), /n must be a whole number from 1 to 9/],
    ["a maybe with a date", only({ kind: "maybe", city: "city-a", n: 3, date: "2027-03-02", title: "A made-up maybe" }), /a maybe has no date/],
    ["a part that is not a part", only({ kind: "line", date: "2027-03-02", part: "night", title: "A made-up thing" }), /part must be morning, midday, afternoon or evening/],
    ["a time that is not HH:MM", only({ kind: "line", date: "2027-03-02", part: "evening", time: "7pm", title: "A made-up thing" }), /time must be HH:MM/],
    ["a time in another part", only({ kind: "line", date: "2027-03-02", part: "evening", time: "14:00", title: "A made-up thing" }), /time falls in the afternoon, not the evening/],
    ["a time just before the evening", only({ kind: "line", date: "2027-03-02", part: "evening", time: "17:29", title: "A made-up thing" }), /falls in the afternoon/],
    ["two entries for one slot", { samples: [good().samples[0], good().samples[0]] }, /entry 2 .*slot 2027-03-02\|morning\): a second entry for the same slot/],
    ["a missing title", only({ kind: "line", date: "2027-03-02", part: "evening" }), /title is missing/],
    ["an empty text", only({ kind: "note", date: "2027-03-04", text: "  " }), /text is empty/],
    ["a missing caption", only({ kind: "trip_photo", date: "2027-03-04" }), /caption is missing/],
    ["a field the kind does not have", only({ kind: "note", date: "2027-03-04", text: "A made-up note.", detail: "x" }), /a note has no field "detail"/],
    ["a part on a note", only({ kind: "note", date: "2027-03-04", part: "morning", text: "A made-up note." }), /a note has no part/],
    ["the marker already in a string", only({ kind: "note", date: "2027-03-04", text: `A made-up note.${M}` }), /already holds the sample marker/],
    ["a title of 91 characters", only({ kind: "line", date: "2027-03-02", part: "evening", title: "x".repeat(91) }), /title is 91 characters; the limit is 90/],
    ["a caption of 91 characters", only({ kind: "trip_photo", date: "2027-03-04", caption: "x".repeat(91) }), /caption is 91 characters/],
    ["a detail of 161 characters", only({ kind: "maybe", city: "city-a", n: 3, title: "A made-up maybe", detail: "x".repeat(161) }), /detail is 161 characters; the limit is 160/],
    ["a summary of 321 characters", only({ kind: "summary", date: "2027-03-03", text: "x".repeat(321) }), /text is 321 characters; the limit is 320/],
    ["a note of 321 characters", only({ kind: "note", date: "2027-03-04", text: "x".repeat(321) }), /text is 321 characters/],
    ["a never-show word", only({ kind: "note", date: "2027-03-04", text: "Ask Quincy about it." }), /entry 2 .*never-show list/],
    ["the word PIN", only({ kind: "note", date: "2027-03-04", text: "The PIN is made up." }), /holds PIN/],
    ["the word card", only({ kind: "note", date: "2027-03-04", text: "Bring the card." }), /holds card/],
    ["a health word", only({ kind: "note", date: "2027-03-04", text: "Bring medication." }), /holds health word/],
    ["a passport number", only({ kind: "note", date: "2027-03-04", text: "Passport 123456789." }), /holds passport followed by a number/],
    ["a picture that is not true", only({ kind: "line", date: "2027-03-02", part: "evening", title: "A made-up thing", picture: false }), /picture is true or left out/],
    ["text that is not JSON", "{ not json", /not readable JSON/],
    ["a file with no samples list", { items: [] }, /must hold \{"samples"/],
    ["an entry that is not an object", { samples: ["a made-up string"] }, /entry 1 .*not an entry/],
  ];
  for (const [what, body, expected] of bad) {
    for (const mode of what === "an unknown kind" ? ["test", "find"] : ["test"]) {
      it(`${what}${mode === "find" ? " (find)" : ""}: refused, named without its words, nothing written`, async () => {
        await run(GOOD);
        const dump = async () => JSON.stringify([await rows(), await prisma.guideItem.count({ where: { tripId } }), (await prisma.trip.findUnique({ where: { id: tripId } }))!.name]);
        const before = await dump();
        const changedPlan = planFor((x) => { x.trip.name = `${TRIP} changed`; x.stays[0].name = "Stay A Hotel, changed"; });
        const r = await run(body, { mode }, changedPlan);
        expect(r.refused, r.text).toBe(true);
        expect(r.text).toMatch(expected);
        expect(r.text).toMatch(/Nothing was written/);
        expect(r.text).not.toMatch(/made-up|Quincy|123456789|medication|Bring the card/);
        expect(await dump()).toBe(before);
      });
    }
  }
  it("a refusal leaves every earlier row in place, and the unedited file still runs", async () => {
    const r = await run(GOOD);
    expect(r.text).toMatch(/\b0 changes\b/);
    expect((await rows()).filter((x) => FIVE.includes(x.kind)).length).toBe(7);
  });
});
