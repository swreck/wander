/**
 * "Fixed" (Nov 17 2026, a fresh reviewer on production): a photographer's name beside a photo reads as a name. A photo of
 * a Kyoto stop was credited "D&#39;A…" where the name has an apostrophe: Google sends the credit as web code, and
 * Wander passed it to phones as it came. This check fails on the code before that day. The credit Wander keeps is never
 * changed: a photo is matched across Google's listings by it (placePhotoChecks keyOf), so a changed one would be looked
 * at, and paid for, again.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-photo-credit";
const { knownHits } = await import("../src/services/placePhotos.js");
const { keyOf } = await import("../src/services/placePhotoChecks.js");
const plain = (await import("../src/services/photoCredit.js").catch(() => null))?.plainCredit as ((c: string | null) => string | null) | undefined;
const prisma = new PrismaClient();

const TAG = `pcr-${Date.now()}`;
// (invented names: this repo is public)
const KEPT = ["Gianni D&#39;Angelo (Sample Name)", "Tom &amp; Mia", "とんかつ まい泉 青山本店", null];
let row: { id: string; name: string | null; verdict: string; checkedAt: Date; hours?: unknown };
beforeAll(async () => {
  row = await prisma.placePhoto.create({ data: { query: `${TAG} Museum, Kyoto, Japan`, line: `${TAG} The museum`, placeId: `${TAG}-place`, name: "Museum",
    photos: [], verdict: "yes", why: "[1] same", checkedAt: new Date("2026-11-16T00:00:00Z") } });
  for (const [rank, credit] of KEPT.entries()) await prisma.placePhotoCheck.create({ data: { placeRowId: row.id, keyHash: keyOf(credit, 1600, 1200), imageHash: `${TAG}-${rank}`, pass: true, rank, credit, source: "check" } });
});
afterAll(async () => {
  if (row) await prisma.placePhotoCheck.deleteMany({ where: { placeRowId: row.id } });
  await prisma.placePhoto.deleteMany({ where: { query: { startsWith: TAG } } });
  await prisma.$disconnect();
});

describe("a photographer's name on its way to a phone", () => {
  it("reads as a name, in the order the photos show", async () => {
    const hit = (await knownHits([row])).get(row.id);
    expect(hit?.photos.map((p) => p.credit)).toEqual(["Gianni D'Angelo (Sample Name)", "Tom & Mia", "とんかつ まい泉 青山本店", null]);
  });
  it("leaves the credit Wander keeps, and the key made from it, as they were", async () => {
    const kept = await prisma.placePhotoCheck.findMany({ where: { placeRowId: row.id }, orderBy: { rank: "asc" } });
    expect(kept.map((k) => k.credit)).toEqual(KEPT);
    expect(kept.map((k) => k.keyHash)).toEqual(KEPT.map((c) => keyOf(c, 1600, 1200)));
  });
});

describe("web code in a credit", () => {
  it("has a reader", () => { expect(plain).toBeTypeOf("function"); });
  it.each([
    ["Gianni D&#39;Angelo", "Gianni D'Angelo"],
    ["D&#x27;Arcy", "D'Arcy"],
    ["D&apos;Arcy &quot;Dee&quot;", "D'Arcy \"Dee\""],
    ["A &lt;3 B; C &gt; D", "A <3 B; C > D"],
    ["Caf&#233; &#x1F600;", "Café 😀"],
    ["a&nbsp;b", "a b"],
    // (once only: what a person typed as "&#39;" stays as they typed it)
    ["&amp;#39;", "&#39;"],
    // (not web code: left alone)
    ["AT&T", "AT&T"], ["R&D; Co", "R&D; Co"], ["&bogus;", "&bogus;"], ["&#0;", "&#0;"], ["&#xD800;", "&#xD800;"], ["&#99999999;", "&#99999999;"],
    ["", ""],
  ])("%s → %s", (from, to) => { expect(plain?.(from)).toBe(to); });
  it("keeps no credit as no credit", () => { expect(plain?.(null)).toBeNull(); });
});
