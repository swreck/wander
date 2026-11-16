/**
 * A place's checked photos, shown from Google's current list of them (Nov 16 2026; services/placePhotoChecks.ts).
 * Google is made up: each listing hands out fresh references; a photo's image is its own words at the asked width. The
 * photo check passes images whose words begin "good". Invented places; production rows are only read.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-photo-checks";
process.env.GOOGLE_MAPS_API_KEY = "test-key";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { keyOf, imageHashOf, forgetForTests } = await import("../src/services/placePhotoChecks.js");
const { setJudgeForTests, setPlaceCheckForTests } = await import("../src/services/photoJudge.js");
const { CEILINGS } = await import("../src/services/usage.js");
const prisma = new PrismaClient();

const TAG = `ppc-${Date.now()}`;
const DAY = 86400_000;
type Photo = { id: string; credit: string; w: number; h: number };
const google = { places: new Map<string, Photo[]>(), down: new Set<string>(), details: 0, photos: 0, search: 0, issued: 0, slow: 0 };
const realFetch = globalThis.fetch;
vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
  const url = new URL(String(input?.url ?? input));
  if (url.hostname !== "maps.googleapis.com") return realFetch(input, init);
  const json = (b: unknown, age = 300) => new Response(JSON.stringify(b), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${age}` } });
  if (url.pathname.includes("/place/details/")) {
    google.details++;
    if (google.slow) await new Promise((r) => setTimeout(r, google.slow));
    const id = url.searchParams.get("place_id")!;
    if (google.down.has(id)) throw new Error("Google is down");
    const list = google.places.get(id) || [];
    google.issued++;
    const photos = list.map((p) => ({ photo_reference: `${p.id}~${google.issued}`, width: p.w, height: p.h, html_attributions: [`<a href="https://maps.google.com/x">${p.credit}</a>`] }));
    const fields = url.searchParams.get("fields") || "";
    return json({ status: "OK", result: { photos, ...(fields.includes("name") ? { name: `${TAG} Place ${id}`, formatted_address: "1-1 Ginza, Tokyo", types: ["restaurant"] } : {}) } });
  }
  if (url.pathname.includes("/place/textsearch/")) {
    google.search++;
    return json({ status: "OK", results: [{ place_id: `${TAG}-new`, name: `${TAG} New Place`, formatted_address: "1-1 Ginza, Tokyo", types: ["restaurant"] }] });
  }
  if (url.pathname.includes("/place/photo")) {
    google.photos++;
    const ref = url.searchParams.get("photo_reference") || "";
    if (!ref.includes("~")) return new Response("expired", { status: 400 });
    return new Response(new TextEncoder().encode(`${ref.split("~")[0]}@${url.searchParams.get("maxwidth")}`), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" } });
  }
  return json({ status: "ZERO_RESULTS", results: [] });
});
const at640 = (id: string) => imageHashOf(Buffer.from(`${id}@640`));
let judged = 0;
const ids = { rows: [] as string[], trips: [] as string[], travelers: [] as string[] };
const row = async (name: string, placeId: string, photos: Photo[]) => {
  google.places.set(placeId, photos);
  const r = await prisma.placePhoto.create({ data: { query: `${TAG} ${name}, Tokyo, Japan`, line: `${TAG} ${name}`, placeId, name, photos: [{ ref: "a-month-old-ref", credit: null }], verdict: "yes", why: "[2] same", checkedAt: new Date(Date.now() - 30 * DAY) } });
  ids.rows.push(r.id);
  return r.id;
};
// (words: what the verdict was judged against — a place's line, as row() makes it; null for one judged before words were kept)
const verdict = (rowId: string, p: Photo, pass: boolean, rank: number | null, source = "october", words: string | null = "same") =>
  prisma.placePhotoCheck.create({ data: { placeRowId: rowId, keyHash: keyOf(p.credit, p.w, p.h), imageHash: at640(p.id), pass, rank, credit: p.credit, source,
    words: words === "same" ? null : words } }).then(async (v) => {
    if (words === "same") { const r = await prisma.placePhoto.findUnique({ where: { id: rowId } }); return prisma.placePhotoCheck.update({ where: { id: v.id }, data: { words: r!.line } }); }
    return v;
  });
const photo = (rowId: string, which: string, size = "small") => request(app).get(`/api/place-photos/${rowId}/${which}?v=1${size === "small" ? "&size=small" : ""}`);
const text = (r: any) => Buffer.from(r.body).toString();

beforeAll(async () => {
  setJudgeForTests(async (_line, _name, images, most) => { judged++; return images.map((im, i) => (im.bytes.toString().startsWith("good") ? i : -1)).filter((i) => i >= 0).slice(0, most); });
  setPlaceCheckForTests(async () => ({ same: true, why: "the same place (test)" }));
});
beforeEach(() => { forgetForTests(); });
afterAll(async () => {
  setJudgeForTests(null); setPlaceCheckForTests(null);
  await prisma.placePhotoCheck.deleteMany({ where: { placeRowId: { in: ids.rows } } });
  const made = await prisma.placePhoto.findMany({ where: { query: { startsWith: TAG } }, select: { id: true } });
  await prisma.placePhotoCheck.deleteMany({ where: { placeRowId: { in: made.map((m) => m.id) } } });
  await prisma.placePhoto.deleteMany({ where: { query: { startsWith: TAG } } });
  await prisma.city.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.tripMember.deleteMany({ where: { tripId: { in: ids.trips } } });
  await prisma.trip.deleteMany({ where: { id: { in: ids.trips } } });
  await prisma.traveler.deleteMany({ where: { id: { in: ids.travelers } } });
  await prisma.$disconnect();
});

describe("a place kept from Japan's own October checks", () => {
  it("shows exactly its October photos, in October's order, by fresh references; never checks new ones", async () => {
    const a = { id: "good-a", credit: "Aiko", w: 4032, h: 3024 }, b = { id: "good-b", credit: "Ben", w: 1024, h: 704 }, x = { id: "good-new", credit: "Xu", w: 4800, h: 3600 };
    const id = await row("Maisen", `${TAG}-oct`, [x, b, a]);   // (Google's order differs; a photo October never saw)
    await verdict(id, a, true, 0); await verdict(id, b, true, 1);
    const before = judged;
    expect(text(await photo(id, "0"))).toBe("good-a@640");
    expect(text(await photo(id, "1"))).toBe("good-b@640");
    expect((await photo(id, "2")).status).toBe(404);
    await new Promise((r) => setTimeout(r, 300));
    expect(judged).toBe(before);
    expect(await prisma.placePhotoCheck.count({ where: { placeRowId: id } })).toBe(2);
  });

  it("October's verdicts judged before words were kept: judged again once, October's photos only — a new one never added", async () => {
    const a = { id: "good-oa", credit: "OA", w: 4032, h: 3024 }, b = { id: "bad-ob", credit: "OB", w: 1024, h: 704 }, x = { id: "good-ox", credit: "OX", w: 4800, h: 3600 };
    const id = await row("OldRules", `${TAG}-oldrules`, [x, b, a]);
    await verdict(id, a, true, 1, "october", null); await verdict(id, b, true, 0, "october", null);
    const before = judged;
    await photo(id, "0");
    await new Promise((r) => setTimeout(r, 300));
    expect(judged).toBe(before + 1);
    expect(text(await photo(id, "0"))).toBe("good-oa@640");
    expect((await photo(id, "1")).status).toBe(404);
    expect(await prisma.placePhotoCheck.count({ where: { placeRowId: id } })).toBe(2);
  });

  it("two photos sharing photographer and size, one passed and one failed: only the passed one shows, told apart by the image", async () => {
    const pass = { id: "good-twin", credit: "Ruth", w: 4032, h: 3024 }, fail = { id: "bad-twin", credit: "Ruth", w: 4032, h: 3024 };
    const id = await row("Starbucks", `${TAG}-twins`, [fail, pass]);
    const v = await verdict(id, pass, true, 0);
    await verdict(id, fail, false, null);
    expect(text(await photo(id, "0"))).toBe("good-twin@640");
    expect(text(await photo(id, v.id, "large"))).toBe("good-twin@1600");
    expect((await photo(id, "1")).status).toBe(404);
  });

  it("a shared key with no passed record of either photo: neither is shown on the strength of the other", async () => {
    const one = { id: "good-one", credit: "Shop", w: 1024, h: 704 }, two = { id: "bad-two", credit: "Shop", w: 1024, h: 704 };
    const id = await row("Shop", `${TAG}-shared-unknown`, [two, one]);
    // (October passed a third photo of the same key that Google no longer lists)
    await prisma.placePhotoCheck.create({ data: { placeRowId: id, keyHash: keyOf("Shop", 1024, 704), imageHash: at640("good-gone"), pass: true, rank: 0, credit: "Shop", source: "october" } });
    expect((await photo(id, "0")).status).toBe(404);
  });
});

describe("a place whose photos expired and has no verdicts (Japan's 75)", () => {
  it("is looked at when a person opens it: the check runs once, its verdicts kept, best first", async () => {
    const id = await row("Tsukiji", `${TAG}-gone`, [{ id: "bad-1", credit: "A", w: 1, h: 1 }, { id: "good-2", credit: "B", w: 2, h: 2 }, { id: "good-3", credit: "C", w: 3, h: 3 }]);
    const before = judged;
    const r = await photo(id, "0");
    expect(r.status).toBe(200);
    expect(text(r)).toBe("good-2@640");
    expect(judged).toBe(before + 1);
    const checks = await prisma.placePhotoCheck.findMany({ where: { placeRowId: id }, orderBy: { rank: "asc" } });
    expect(checks.map((c) => [c.pass, c.rank])).toEqual([[true, 0], [true, 1], [false, null]]);
    // opened again, by anyone: no new check, no new rows
    forgetForTests();
    expect(text(await photo(id, "1"))).toBe("good-3@640");
    expect(judged).toBe(before + 1);
    expect(await prisma.placePhotoCheck.count({ where: { placeRowId: id } })).toBe(3);
  });

  it("two people opening it at once: one listing from Google, one check", async () => {
    const id = await row("Nishiki", `${TAG}-two`, [{ id: "good-x", credit: "X", w: 5, h: 5 }, { id: "good-y", credit: "Y", w: 6, h: 6 }]);
    const d0 = google.details, j0 = judged;
    const [a, b] = await Promise.all([photo(id, "0"), photo(id, "0")]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(google.details - d0).toBe(1);
    expect(judged - j0).toBe(1);
  });

  it("Google down: \"not available\", no error, and not asked again that day", async () => {
    const id = await row("Down", `${TAG}-down`, [{ id: "good-z", credit: "Z", w: 7, h: 7 }]);
    google.down.add(`${TAG}-down`);
    const d0 = google.details;
    expect((await photo(id, "0")).status).toBe(404);
    expect((await photo(id, "0")).status).toBe(404);
    expect(google.details - d0).toBe(1);
    google.down.delete(`${TAG}-down`);
  });

  it("Google lists no photos: \"not available\", asked once that day", async () => {
    const id = await row("Empty", `${TAG}-empty`, []);
    const d0 = google.details;
    expect((await photo(id, "0")).status).toBe(404);
    expect((await photo(id, "0")).status).toBe(404);
    expect(google.details - d0).toBe(1);
  });
});

describe("addresses and limits", () => {
  it("an unknown place, a deleted place, a made-up photo id: not found", async () => {
    expect((await photo(`${TAG}nosuchplace0000000`, "0")).status).toBe(404);
    const id = await row("Deleted", `${TAG}-del`, [{ id: "good-d", credit: "D", w: 8, h: 8 }]);
    await prisma.placePhoto.delete({ where: { id } });
    expect((await photo(id, "0")).status).toBe(404);
    const other = await row("Other", `${TAG}-other`, [{ id: "good-o", credit: "O", w: 9, h: 9 }]);
    expect((await photo(other, "zzzzzzzzzzzzzzzzzzzzzzzz")).status).toBe(404);
    expect((await photo(other, "abc%21%22")).status).toBe(404);
    expect((await photo(other, "99")).status).toBe(404);
  });

  it("opened again: served from memory, no new request to Google; kept as long as Google's answer allows", async () => {
    const p = { id: "good-r", credit: "R", w: 10, h: 10 };
    const id = await row("Repeat", `${TAG}-rep`, [p]);
    await verdict(id, p, true, 0);
    const first = await photo(id, "0", "large");
    expect(first.headers["cache-control"]).toMatch(/^public, max-age=86\d{3}$/);
    const n = google.photos + google.details;
    for (let i = 0; i < 5; i++) expect(text(await photo(id, "0", "large"))).toBe("good-r@1600");
    expect(google.photos + google.details).toBe(n);
  });

  it("the day's ceiling reached: \"not available\", never an error, and the refusal counted", async () => {
    const p = { id: "good-c", credit: "C2", w: 11, h: 11 };
    const id = await row("Ceiling", `${TAG}-ceil`, [p]);
    await verdict(id, p, true, 0);
    const was = CEILINGS["google.details"];
    CEILINGS["google.details"] = 0;
    try {
      const r = await photo(id, "0");
      expect(r.status).toBe(404);
      expect(r.headers["cache-control"]).toBe("no-store");
      const day = new Date().toISOString().slice(0, 10);
      expect((await prisma.serviceUsage.findUnique({ where: { day_kind: { day, kind: "google.details" } } }))!.refused).toBeGreaterThan(0);
    } finally { CEILINGS["google.details"] = was; }
  });

  it("what phones are told: Wander's ids and the photographers, never a Google reference", async () => {
    const t = await prisma.traveler.create({ data: { displayName: `${TAG}-viewer` } });
    ids.travelers.push(t.id);
    const tok = signToken({ code: t.displayName, displayName: t.displayName, travelerId: t.id });
    const r = await request(app).get("/api/place-photos/known").set({ Authorization: `Bearer ${tok}` });
    expect(r.status).toBe(200);
    const mine = (r.body.places as any[]).filter((p) => p.query.startsWith(TAG));
    expect(JSON.stringify(mine)).not.toMatch(/~\d|a-month-old-ref|photo_reference|"ref"/);
    const maisen = mine.find((p) => p.line.endsWith("Maisen"));
    expect(maisen.hit.photos.map((p: any) => p.credit)).toEqual(["Aiko", "Ben"]);
    expect(maisen.hit.photos.every((p: any) => /^[a-z0-9]{20,40}$/.test(p.id))).toBe(true);
    // (a place not yet looked at: one photo with no id — opening it is what looks at it)
    const notYet = await row("NotYet", `${TAG}-notyet`, [{ id: "good-n", credit: "N", w: 12, h: 12 }]);
    const again = await request(app).get("/api/place-photos/known").set({ Authorization: `Bearer ${tok}` });
    const ny = (again.body.places as any[]).find((p) => p.query.includes("NotYet"));
    expect(ny.hit.photos).toEqual([{ credit: null }]);
    // its first photo opened (the place is looked at), then asked for alone: ids and photographers, no reference
    expect((await photo(notYet, "0")).status).toBe(200);
    const one = await request(app).get(`/api/place-photos/one/${notYet}`).set({ Authorization: `Bearer ${tok}` });
    expect(one.body.hit.photos).toEqual([{ id: expect.stringMatching(/^[a-z0-9]{20,40}$/), credit: "N" }]);
    expect(JSON.stringify(one.body)).not.toMatch(/~\d|photo_reference|"ref"/);
    expect((await request(app).get(`/api/place-photos/one/${TAG}-nope`).set({ Authorization: `Bearer ${tok}` })).status).toBe(404);
    expect((await request(app).get(`/api/place-photos/one/${notYet}`)).status).toBe(401);
  });

  it("a new line of a trip still to come: looked up, checked, and kept as verdicts — never as references", async () => {
    google.places.set(`${TAG}-new`, [{ id: "good-n1", credit: "N1", w: 13, h: 13 }, { id: "bad-n2", credit: "N2", w: 14, h: 14 }, { id: "good-n3", credit: "N3", w: 15, h: 15 }]);
    const t = await prisma.traveler.create({ data: { displayName: `${TAG}-planner` } });
    ids.travelers.push(t.id);
    const trip = await prisma.trip.create({ data: { name: `${TAG} coming`, startDate: new Date(Date.now() + 30 * DAY), endDate: new Date(Date.now() + 40 * DAY) } });
    ids.trips.push(trip.id);
    await prisma.tripMember.create({ data: { tripId: trip.id, travelerId: t.id, role: "planner" } });
    const tok = signToken({ code: t.displayName, displayName: t.displayName, travelerId: t.id });
    const q = `${TAG} Ginza Shop, Tokyo, Japan`;
    const r = await request(app).post("/api/place-photos/lookup").set({ Authorization: `Bearer ${tok}` }).send({ tripId: trip.id, places: [{ key: q, query: q, line: `${TAG} Shopping at Ginza Shop` }] });
    expect(r.status).toBe(200);
    const hit = r.body.places[q];
    expect(hit.photos.map((p: any) => p.credit)).toEqual(["N1", "N3"]);
    const kept = await prisma.placePhoto.findUnique({ where: { query: q } });
    expect(kept!.photos).toEqual([]);
    expect(await prisma.placePhotoCheck.count({ where: { placeRowId: kept!.id } })).toBe(3);
    expect(text(await photo(kept!.id, hit.photos[1].id))).toBe("good-n3@640");
  });
});
