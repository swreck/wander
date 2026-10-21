/**
 * EACH PERSON'S PHRASE CARD (Oct 13 2026). Ken: "Need to be able to remove phrases. And to rearrange the order. No need
 * to designate original or not." · "Anything added by one adds to bottom for others no matter where placed by the
 * person adding it. It goes to top for the one who adds it." And the Maybes rule for taking things off for everyone:
 * "It is for the person who added it and me."
 * - your order is yours alone; another person's card keeps its own
 * - a new phrase: first on the adder's card, last on everyone else's
 * - remove: a phrase you added (or any added one, for the organizer) comes off everyone's card — hidden, never deleted,
 *   and Put back brings it back; anything else comes off only your card
 * - Scout's arrange_my_phrases does the same; add_phrase won't add a second way of saying what's already there
 * Invented data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-phrase-card";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { executeTool } = await import("../src/routes/chat.js");
const prisma = new PrismaClient();

let tripId = "", orgId = "", otherId = "", orgTok = "", otherTok = "";
beforeAll(async () => {
  const mk = async (n: string) => (await prisma.traveler.findFirst({ where: { displayName: n } })) || prisma.traveler.create({ data: { displayName: n } });
  const org = await mk("PCOrganizer"), other = await mk("PCOther");
  orgId = org.id; otherId = other.id;
  tripId = (await prisma.trip.create({ data: { name: "PC Japan Trip", status: "archived", timeZone: "Asia/Tokyo", startDate: new Date("2031-10-05"), endDate: new Date("2031-10-29") } })).id;
  await prisma.tripMember.create({ data: { tripId, travelerId: org.id, role: "planner", joinedAt: new Date("2031-01-01") } });
  await prisma.tripMember.create({ data: { tripId, travelerId: other.id, role: "member", joinedAt: new Date("2031-02-01") } });
  orgTok = signToken({ code: "PCOrganizer", displayName: "PCOrganizer", travelerId: org.id });
  otherTok = signToken({ code: "PCOther", displayName: "PCOther", travelerId: other.id });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  for (const id of [orgId, otherId]) await prisma.traveler.update({ where: { id }, data: { preferences: {} } }).catch(() => {});
  await prisma.$disconnect();
});
const org = () => ({ code: "PCOrganizer", displayName: "PCOrganizer", travelerId: orgId });
const other = () => ({ code: "PCOther", displayName: "PCOther", travelerId: otherId });
const mine = async (tok: string) => (await request(app).get(`/api/phrases/trip/${tripId}/mine`).set("Authorization", `Bearer ${tok}`)).body;
const list = async (tok: string) => (await request(app).get(`/api/phrases/trip/${tripId}`).set("Authorization", `Bearer ${tok}`)).body as { id: string; english: string; removedAt: string | null; mayRemoveForAll: boolean }[];

describe("adding", () => {
  it("first on the adder's card, at the bottom of everyone else's", async () => {
    await request(app).patch(`/api/phrases/trip/${tripId}/mine`).set("Authorization", `Bearer ${otherTok}`).send({ order: ["core:japan:Excuse me", "core:japan:Hello"] });
    const r = await executeTool("add_phrase", { tripId, english: "Where is the station?", romaji: "Eki wa doko desu ka?" }, other());
    expect(r.result.saved).toBe(true);
    const id = (await list(otherTok)).find((p) => p.english === "Where is the station?")!.id;
    expect((await mine(otherTok)).order.slice(0, 3)).toEqual([`p:${id}`, "core:japan:Excuse me", "core:japan:Hello"]);
    // (the organizer never arranged theirs: the new one is simply after everything, in first order)
    expect((await mine(orgTok)).order).not.toContain(`p:${id}`);
  });
  it("the same phrase isn't added twice — the everyday ones too — but a different one always is", async () => {
    await executeTool("add_phrase", { tripId, english: "I'm sorry, I'm not feeling well", romaji: "Gomen nasai, chōshi ga warui desu" }, org());
    // (the same words, other punctuation and no long-vowel mark)
    const again = await executeTool("add_phrase", { tripId, english: "I'm sorry I'm not feeling well!", romaji: "Gomen nasai choshi ga warui desu" }, org());
    expect(again.result.alreadyOnCard).toBeTruthy();
    // (an everyday phrase)
    expect((await executeTool("add_phrase", { tripId, english: "Thank you", romaji: "Arigatou gozaimasu" }, org())).result.alreadyOnCard).toBeTruthy();
    // (verify29: these were blocked as "near matches")
    expect((await executeTool("add_phrase", { tripId, english: "Where is the toilet?", romaji: "Toire wa doko desu ka?" }, org())).result.saved).toBe(true);
    expect((await executeTool("add_phrase", { tripId, english: "I'm allergic to peanuts", romaji: "Pinattsu arerugii desu" }, org())).result.saved).toBe(true);
    expect((await list(orgTok)).filter((p) => /not feeling well/.test(p.english))).toHaveLength(1);
    const asked = await executeTool("add_phrase", { tripId, english: "I'm sorry, I'm not feeling well", romaji: "Gomen nasai, chōshi ga warui desu", anotherWay: true }, org());
    expect(asked.result.saved).toBe(true);
  });
});

describe("removing and putting back", () => {
  it("the one who added it takes it off everyone's card — hidden, never deleted — and puts it back", async () => {
    // (everyone's card only when asked for — Ken, Oct 14: "ensure just your card is default")
    const r = await executeTool("arrange_my_phrases", { tripId, phrase: "Where is the station?", action: "remove", forEveryone: true }, other());
    expect(r.result.offEveryonesCard).toBe(true);
    const row = await prisma.tripPhrase.findFirst({ where: { tripId, english: "Where is the station?" } });
    expect(row).toBeTruthy();
    expect(row!.removedAt).not.toBeNull();
    // (the organizer may put it back, so it still comes to them, marked removed)
    expect((await list(orgTok)).find((p) => p.english === "Where is the station?")!.removedAt).not.toBeNull();
    const back = await executeTool("arrange_my_phrases", { tripId, phrase: "Where is the station?", action: "put_back" }, other());
    expect(back.result.backOnEveryonesCard).toBe(true);
    expect((await prisma.tripPhrase.findUnique({ where: { id: row!.id } }))!.removedAt).toBeNull();
  });
  it("another person's phrase: only off your own card; they and the organizer can take it off everyone's", async () => {
    const r = await request(app).post(`/api/phrases/${(await list(otherTok)).find((p) => /not feeling well/.test(p.english))!.id}/remove`).set("Authorization", `Bearer ${otherTok}`);
    expect(r.status).toBe(403);
    const own = await executeTool("arrange_my_phrases", { tripId, phrase: "Pinattsu arerugii desu", action: "remove" }, other());
    expect(own.result.onlyTheirCard).toBe(true);
    expect((await mine(otherTok)).hidden.some((k: string) => k.startsWith("p:"))).toBe(true);
    // (the organizer still has it)
    expect((await list(orgTok)).find((p) => p.english === "I'm allergic to peanuts")!.removedAt).toBeNull();
    const st = (await list(orgTok)).find((p) => p.english === "Where is the station?")!;
    expect(st.mayRemoveForAll).toBe(true);
  });
  it("asking Scout to add a phrase you took off your card puts it back on yours (verify30)", async () => {
    await executeTool("arrange_my_phrases", { tripId, phrase: "Sumimasen", action: "remove" }, other());
    expect((await mine(otherTok)).hidden).toContain("core:japan:Excuse me");
    const r = await executeTool("add_phrase", { tripId, english: "Excuse me", romaji: "Sumimasen" }, other());
    expect(r.result.backOnTheirCard).toBeTruthy();
    expect((await mine(otherTok)).hidden).not.toContain("core:japan:Excuse me");
  });
  it("an everyday phrase comes off only your own card, and comes back", async () => {
    const r = await executeTool("arrange_my_phrases", { tripId, phrase: "Konnichiwa", action: "remove" }, org());
    expect(r.result.onlyTheirCard).toBe(true);
    expect((await mine(orgTok)).hidden).toContain("core:japan:Hello");
    expect((await mine(otherTok)).hidden).not.toContain("core:japan:Hello");
    await executeTool("arrange_my_phrases", { tripId, phrase: "Hello", action: "put_back" }, org());
    expect((await mine(orgTok)).hidden).not.toContain("core:japan:Hello");
  });
  it("the old delete route hides too, by the same rule — nothing is deleted", async () => {
    const id = (await list(orgTok)).find((p) => p.english === "I'm sorry, I'm not feeling well")!.id;
    expect((await request(app).delete(`/api/phrases/${id}`).set("Authorization", `Bearer ${otherTok}`)).status).toBe(403);
    expect((await request(app).delete(`/api/phrases/${id}`).set("Authorization", `Bearer ${orgTok}`)).status).toBe(200);
    expect(await prisma.tripPhrase.findUnique({ where: { id } })).toBeTruthy();
    // (off everyone's card: someone who can't put it back no longer gets it)
    expect((await list(otherTok)).some((p) => p.id === id)).toBe(false);
  });
});

describe("order", () => {
  it("moving one first changes only that person's card", async () => {
    await executeTool("arrange_my_phrases", { tripId, phrase: "Sumimasen", action: "move_to_top" }, org());
    expect((await mine(orgTok)).order[0]).toBe("core:japan:Excuse me");
    await executeTool("arrange_my_phrases", { tripId, phrase: "Sumimasen", action: "move_to_bottom" }, other());
    expect((await mine(otherTok)).order.at(-1)).toBe("core:japan:Excuse me");
    expect((await mine(orgTok)).order[0]).toBe("core:japan:Excuse me");
  });
  it("a phrase that doesn't fit, or fits two, is asked about — nothing changes", async () => {
    expect((await executeTool("arrange_my_phrases", { tripId, phrase: "zebra crossing", action: "remove" }, org())).result.error).toMatch(/No phrase/);
    // ("please": Yes please and Check please)
    const before = await mine(orgTok);
    expect((await executeTool("arrange_my_phrases", { tripId, phrase: "please", action: "remove" }, org())).result.error).toMatch(/More than one/);
    expect((await mine(orgTok)).hidden).toEqual(before.hidden);
  });
  it("not on the trip: refused", async () => {
    const outsider = await prisma.traveler.create({ data: { displayName: "PCOutsider" } });
    const r = await executeTool("arrange_my_phrases", { tripId, phrase: "Hello", action: "remove" }, { code: "x", displayName: "PCOutsider", travelerId: outsider.id });
    expect(r.result.error).toMatch(/isn't one of yours/);
    await prisma.traveler.delete({ where: { id: outsider.id } });
  });
});
