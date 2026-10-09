/**
 * TRIP NOTES KEEP EVERY WORD, AND STAY PRIVATE (Oct 1 2026). Ken once had a notes tool keep only "themes" of what he
 * said. Read back through the API (and Scout's tool):
 * - a long note — Japanese, emoji, line breaks — comes back identical, in the list, the search and the export
 * - the same note sent twice (a weak signal) is kept once
 * - an edit changes the words now; the original stays as first saved
 * - another person on the trip can't see, find, export, change or remove a private note; a shared one they can read
 * - someone not on the trip gets nothing; Scout's tool shows the asker's notes and shared ones, never others' private
 * - the two settings start unset and are kept; "Tidy" keeps the writer's words or is thrown away
 * Invented data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-trip-notes";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { executeTool } = await import("../src/routes/chat.js");
const { keepsTheWords } = await import("../src/services/tripNotes/tidy.js");
const prisma = new PrismaClient();

let tripId = "", a = "", b = "", outsider = "", aId = "", bId = "";
const as = (t: string) => ({
  get: (u: string) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u: string, body: object) => request(app).post(u).set("Authorization", `Bearer ${t}`).send(body),
  patch: (u: string, body: object) => request(app).patch(u).set("Authorization", `Bearer ${t}`).send(body),
  del: (u: string) => request(app).delete(u).set("Authorization", `Bearer ${t}`),
});
const cid = () => `test${Math.random().toString(36).slice(2, 12)}`;

// About 4,000 words: everything a long dictated evening could hold
const LONG = Array.from({ length: 400 }, (_, i) =>
  `Day ${i % 25} — the potter in Shigaraki said 「土は生きている」, and I wrote it down 🍵. Then: "keep every word."`).join("\n");

beforeAll(async () => {
  const mk = async (n: string) => (await prisma.traveler.findFirst({ where: { displayName: n } })) || prisma.traveler.create({ data: { displayName: n } });
  const ta = await mk("TNAuthor"), tb = await mk("TNFriend"), to = await mk("TNOutsider");
  aId = ta.id; bId = tb.id;
  await prisma.traveler.update({ where: { id: ta.id }, data: { preferences: {} } });
  tripId = (await prisma.trip.create({ data: { name: "TN Notes Trip", status: "archived", timeZone: "Asia/Tokyo" } })).id;
  for (const t of [ta, tb]) await prisma.tripMember.create({ data: { tripId, travelerId: t.id, role: "traveler" } });
  a = signToken({ code: "TNAuthor", displayName: "TNAuthor", travelerId: ta.id });
  b = signToken({ code: "TNFriend", displayName: "TNFriend", travelerId: tb.id });
  outsider = signToken({ code: "TNOutsider", displayName: "TNOutsider", travelerId: to.id });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("every word kept", () => {
  it("a long note comes back identical — the reply, the list, the search, the export", async () => {
    const saved = await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: cid(), text: LONG, source: "voice", dayDate: "2026-10-28", city: "Kyoto" });
    expect(saved.status).toBe(201);
    expect(saved.body.note.original).toBe(LONG);
    expect(saved.body.note.text).toBe(LONG);
    expect(saved.body.note.wordCount).toBe(LONG.trim().split(/\s+/).length);
    const row = await prisma.tripNote.findUnique({ where: { id: saved.body.note.id } });
    expect(row?.original).toBe(LONG);
    const list = await as(a).get(`/api/trip-notes/trip/${tripId}`);
    expect(list.body.find((n: any) => n.id === saved.body.note.id).text).toBe(LONG);
    const found = await as(a).get(`/api/trip-notes/trip/${tripId}?q=${encodeURIComponent("土は生きている")}`);
    expect(found.body.some((n: any) => n.id === saved.body.note.id)).toBe(true);
    const out = await as(a).get(`/api/trip-notes/trip/${tripId}/export`);
    expect(out.status).toBe(200);
    expect(out.text.includes(LONG)).toBe(true);
  });
  it("the same note sent twice is kept once", async () => {
    const id = cid();
    const one = await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: id, text: "Sent on a weak signal" });
    const two = await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: id, text: "Sent on a weak signal" });
    expect(one.status).toBe(201);
    expect(two.status).toBe(200);
    expect(two.body.duplicate).toBe(true);
    expect(two.body.note.id).toBe(one.body.note.id);
    expect(await prisma.tripNote.count({ where: { travelerId: aId, clientId: id } })).toBe(1);
  });
  // Ken, Oct 9: a note Wander had (the reply was slow) still waited on the phone, and couldn't be edited there. Changed
  // while it waits, it carries when it was changed: arriving after its first words, the change is an edit.
  it("a note changed on the phone while it waited arrives as an edit — the first words kept as the original", async () => {
    const id = cid();
    const first = await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: id, text: "The first family studio" });
    const changed = await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: id, text: "The first family studio, ten generations", changedAt: new Date().toISOString() });
    expect(changed.status).toBe(200);
    expect(changed.body.changed).toBe(true);
    expect(changed.body.note.id).toBe(first.body.note.id);
    expect(changed.body.note.text).toBe("The first family studio, ten generations");
    expect(changed.body.note.original).toBe("The first family studio");
    expect(await prisma.tripNote.count({ where: { travelerId: aId, clientId: id } })).toBe(1);
  });
  it("a late resend never undoes an edit made since (its change is older, or it has none)", async () => {
    const id = cid();
    const n = await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: id, text: "Version one" });
    const before = new Date(Date.now() - 60_000).toISOString();
    await as(a).patch(`/api/trip-notes/${n.body.note.id}`, { text: "Edited on Wander" });
    const stale = await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: id, text: "Version two from the phone", changedAt: before });
    expect(stale.body.note.text).toBe("Edited on Wander");
    const plain = await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: id, text: "Version one" });
    expect(plain.body.note.text).toBe("Edited on Wander");
  });
  it("an edit changes the words now and keeps the original", async () => {
    const n = await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: cid(), text: "The adoring promise" });
    const e = await as(a).patch(`/api/trip-notes/${n.body.note.id}`, { text: "The durable promise" });
    expect(e.status).toBe(200);
    expect(e.body.note.text).toBe("The durable promise");
    expect(e.body.note.original).toBe("The adoring promise");
    const out = await as(a).get(`/api/trip-notes/trip/${tripId}/export`);
    expect(out.text.includes("The durable promise")).toBe(true);
    expect(out.text.includes("As first saved:\nThe adoring promise")).toBe(true);
  });
  it("an empty note or one with no phone id is refused, and nothing is kept", async () => {
    const before = await prisma.tripNote.count({ where: { tripId } });
    expect((await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: cid(), text: "   " })).status).toBe(400);
    expect((await as(a).post(`/api/trip-notes/trip/${tripId}`, { text: "no id" })).status).toBe(400);
    expect(await prisma.tripNote.count({ where: { tripId } })).toBe(before);
  });
});

describe("private unless shared", () => {
  let privateId = "", sharedId = "";
  beforeAll(async () => {
    privateId = (await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: cid(), text: "TN-SECRET a gift for Julie" })).body.note.id;
    sharedId = (await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: cid(), text: "TN-SHARED the temple at dawn", visibility: "trip" })).body.note.id;
  });
  it("someone else on the trip sees the shared note, never the private one — list, search, export", async () => {
    const list = await as(b).get(`/api/trip-notes/trip/${tripId}`);
    expect(list.body.some((n: any) => n.id === sharedId)).toBe(true);
    expect(list.body.some((n: any) => n.id === privateId)).toBe(false);
    expect(JSON.stringify(list.body)).not.toContain("TN-SECRET");
    expect(JSON.stringify((await as(b).get(`/api/trip-notes/trip/${tripId}?q=gift`)).body)).not.toContain("TN-SECRET");
    expect((await as(b).get(`/api/trip-notes/trip/${tripId}/export`)).text).not.toContain("TN-SECRET");
  });
  it("they can't change or remove it, shared or not; it's read back unchanged", async () => {
    expect((await as(b).patch(`/api/trip-notes/${privateId}`, { text: "Hacked" })).status).toBe(403);
    expect((await as(b).patch(`/api/trip-notes/${sharedId}`, { visibility: "private" })).status).toBe(403);
    expect((await as(b).del(`/api/trip-notes/${sharedId}`)).status).toBe(403);
    expect((await prisma.tripNote.findUnique({ where: { id: privateId } }))?.text).toBe("TN-SECRET a gift for Julie");
    expect((await prisma.tripNote.findUnique({ where: { id: sharedId } }))?.visibility).toBe("trip");
  });
  it("someone not on the trip gets nothing", async () => {
    expect((await as(outsider).get(`/api/trip-notes/trip/${tripId}`)).status).toBe(403);
    expect((await as(outsider).post(`/api/trip-notes/trip/${tripId}`, { clientId: cid(), text: "sneaked" })).status).toBe(403);
    expect((await as(outsider).get(`/api/trip-notes/trip/${tripId}/export`)).status).toBe(403);
  });
  it("Scout's tool: the asker's notes and shared ones — never another person's private note", async () => {
    const forB = await executeTool("get_my_notes", { tripId }, { code: "TNFriend", displayName: "TNFriend", travelerId: bId } as any);
    const text = JSON.stringify(forB.result);
    expect(text).toContain("TN-SHARED");
    expect(text).not.toContain("TN-SECRET");
    const forA = await executeTool("get_my_notes", { tripId, query: "gift" }, { code: "TNAuthor", displayName: "TNAuthor", travelerId: aId } as any);
    expect(JSON.stringify(forA.result)).toContain("TN-SECRET");
    const forOutsider = await executeTool("get_my_notes", { tripId }, { code: "TNOutsider", displayName: "TNOutsider", travelerId: "nobody" } as any);
    expect(JSON.stringify(forOutsider.result)).not.toContain("TN-");
  });
  it("words taken out of a shared note are gone for everyone else — list, search, Scout (privacy tester, Oct 1)", async () => {
    const n = await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: cid(), text: "Lunch by the river. TN-REMOVED Julie was grumpy", visibility: "trip" });
    await as(a).patch(`/api/trip-notes/${n.body.note.id}`, { text: "Lunch by the river." });
    // a tidied copy of the earlier words, as a slow tidy could leave it
    await prisma.tripNote.update({ where: { id: n.body.note.id }, data: { tidied: null } });
    const seen = (await as(b).get(`/api/trip-notes/trip/${tripId}`)).body.find((x: any) => x.id === n.body.note.id);
    expect(seen.text).toBe("Lunch by the river.");
    expect(seen.original).toBe("Lunch by the river.");
    expect(seen.tidied).toBeNull();
    expect(seen.clientId).toBeUndefined();
    expect(JSON.stringify((await as(b).get(`/api/trip-notes/trip/${tripId}`)).body)).not.toContain("TN-REMOVED");
    expect((await as(b).get(`/api/trip-notes/trip/${tripId}?q=TN-REMOVED`)).body).toEqual([]);
    const scout = await executeTool("get_my_notes", { tripId }, { code: "TNFriend", displayName: "TNFriend", travelerId: bId } as any);
    expect(JSON.stringify(scout.result)).not.toContain("TN-REMOVED");
    const scoutQ = await executeTool("get_my_notes", { tripId, query: "TN-REMOVED" }, { code: "TNFriend", displayName: "TNFriend", travelerId: bId } as any);
    expect((scoutQ.result as any).notes).toEqual([]);
    // the writer still has every word
    const mine = (await as(a).get(`/api/trip-notes/trip/${tripId}?q=TN-REMOVED`)).body;
    expect(mine.some((x: any) => x.id === n.body.note.id && x.original.includes("TN-REMOVED"))).toBe(true);
  });
  it("a note kept on the phone with no signal keeps the time it was written; a nonsense time is ignored", async () => {
    const written = new Date(Date.now() - 3 * 3600_000).toISOString();
    const n = await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: cid(), text: "Written on the train", writtenAt: written });
    expect(new Date(n.body.note.createdAt).toISOString()).toBe(written);
    const future = await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: cid(), text: "From the future", writtenAt: "2099-01-01T00:00:00Z" });
    expect(Math.abs(new Date(future.body.note.createdAt).getTime() - Date.now())).toBeLessThan(60_000);
  });
  it("what a note is about — a place, Backroads, Japan overall — can be changed by its writer only, words untouched (Ken, Oct 2)", async () => {
    const n = await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: cid(), text: "The cedar avenue at dusk", dayDate: "2026-10-19", city: "Nikko", visibility: "trip" });
    expect(n.body.note.city).toBe("Nikko");
    const moved = await as(a).patch(`/api/trip-notes/${n.body.note.id}`, { city: "Backroads" });
    expect(moved.body.note.city).toBe("Backroads");
    expect(moved.body.note.text).toBe("The cedar avenue at dusk");
    expect(moved.body.note.editedAt).toBeNull();
    expect((await as(b).patch(`/api/trip-notes/${n.body.note.id}`, { city: "Kyoto" })).status).toBe(403);
    expect((await prisma.tripNote.findUnique({ where: { id: n.body.note.id } }))?.city).toBe("Backroads");
    const overall = await as(a).post(`/api/trip-notes/trip/${tripId}`, { clientId: cid(), text: "Before we go: pack the good walking shoes", city: "Japan overall" });
    const out = (await as(a).get(`/api/trip-notes/trip/${tripId}/export`)).text;
    expect(out).toContain("## Backroads · Mon, Oct 19");
    expect(out).toContain("## Japan overall\n");
    await as(a).del(`/api/trip-notes/${n.body.note.id}`);
    await as(a).del(`/api/trip-notes/${overall.body.note.id}`);
  });
  it("the writer can share it, take it back, and remove it", async () => {
    expect((await as(a).patch(`/api/trip-notes/${privateId}`, { visibility: "trip" })).body.note.visibility).toBe("trip");
    expect((await as(a).patch(`/api/trip-notes/${privateId}`, { visibility: "private" })).body.note.visibility).toBe("private");
    expect((await as(a).del(`/api/trip-notes/${privateId}`)).status).toBe(200);
    expect(await prisma.tripNote.findUnique({ where: { id: privateId } })).toBeNull();
  });
});

describe("the two settings", () => {
  it("start unset, are kept, and are each person's own", async () => {
    expect((await as(a).get("/api/trip-notes/settings")).body).toEqual({ tidy: false, storyUse: null });
    expect((await as(a).patch("/api/trip-notes/settings", { tidy: true, storyUse: false })).body).toEqual({ tidy: true, storyUse: false });
    expect((await as(a).get("/api/trip-notes/settings")).body).toEqual({ tidy: true, storyUse: false });
    expect((await as(b).get("/api/trip-notes/settings")).body.tidy).toBe(false);
    await as(a).patch("/api/trip-notes/settings", { tidy: false });
  });
  it("a tidied copy is kept only when it keeps the writer's words", () => {
    expect(keepsTheWords("um so the adoring promise uh was kept", "So the durable promise was kept.")).toBe(true);
    expect(keepsTheWords("The potter showed us three kilns and talked about wood ash for an hour", "We visited a potter.")).toBe(false);
    expect(keepsTheWords("Short note", "Short note, plus a whole new sentence the writer never said at all here")).toBe(false);
  });
});
