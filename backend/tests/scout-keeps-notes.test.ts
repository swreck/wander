/**
 * SCOUT KEEPS WHAT YOU TELL IT (Oct 10 2026). Ken, at Okawachiyama: he wanted to tell Scout they'd come to the town, and
 * why ("our guide is driving us today … which allows us to come here and also see Arita"), and it had nowhere to go.
 * Now Scout keeps it in his Notes — and only his own words (a note app once kept "themes" instead of what he said):
 * - the words named are kept exactly as he wrote them (his spelling, capitals, punctuation), on the day, with the city
 * - a part of what he said is fine; words from earlier in the conversation are fine ("yes, keep that")
 * - Scout's rewording or summary is refused, never kept; a part of a word ("art" from "Arita") is not his words
 * - the same words told twice are one note; private unless he asks to share; someone not on the trip gets nothing
 * - it's on his Notes screen marked "told to Scout", and Scout reads it back with get_my_notes
 * Invented data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";

process.env.JWT_SECRET = "test-secret-scout-notes";
const { app } = await import("../src/index.js");
const { signToken } = await import("../src/middleware/auth.js");
const { executeTool } = await import("../src/routes/chat.js");
const { keptWords } = await import("../src/services/tripNotes/kept.js");
const prisma = new PrismaClient();

let tripId = "", meId = "", outsiderId = "", token = "";
const SAID = "We're at okawachiyama now! Our guide is driving us today, which we didn't expect — so we could come here and also see Arita, then take the train on to Hakata.";
beforeAll(async () => {
  const mk = async (n: string) => (await prisma.traveler.findFirst({ where: { displayName: n } })) || prisma.traveler.create({ data: { displayName: n } });
  const me = await mk("SKNTraveler"), out = await mk("SKNOutsider");
  meId = me.id; outsiderId = out.id;
  tripId = (await prisma.trip.create({ data: { name: "SKN Trip", status: "archived", timeZone: "Asia/Tokyo", startDate: new Date("2031-10-05"), endDate: new Date("2031-10-29") } })).id;
  await prisma.tripMember.create({ data: { tripId, travelerId: me.id, role: "member" } });
  const city = await prisma.city.create({ data: { tripId, name: "Karatsu", country: "Japan", sequenceOrder: 1 } });
  await prisma.day.create({ data: { tripId, cityId: city.id, date: new Date("2031-10-10T00:00:00Z") } });
  token = signToken({ code: "SKNTraveler", displayName: "SKNTraveler", travelerId: me.id });
});
afterAll(async () => {
  await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
  await prisma.$disconnect();
});
const user = () => ({ code: "SKNTraveler", displayName: "SKNTraveler", travelerId: meId });
const notes = () => prisma.tripNote.findMany({ where: { tripId, travelerId: meId }, orderBy: { createdAt: "asc" } });

describe("only their own words", () => {
  it("keeps the part named, exactly as written (capitals, punctuation), ignoring how Scout spaced or capitalised it", () => {
    expect(keptWords("our guide is driving us today which we didnt expect", [SAID])).toBeNull(); // "didnt" isn't what he wrote
    expect(keptWords("Our guide is driving us today, which we didn't expect", [SAID])).toBe("Our guide is driving us today, which we didn't expect");
    expect(keptWords("we're at Okawachiyama now", [SAID])).toBe("We're at okawachiyama now!");
  });
  it("a summary or rewording is not his words", () => {
    expect(keptWords("Visited Okawachiyama thanks to the guide driving", [SAID])).toBeNull();
    expect(keptWords("art", [SAID])).toBeNull();
  });
  it("finds words from earlier in the conversation", () => {
    expect(keptWords("the potter's family has fired kilns for ten generations", ["yes, keep that", "The potter's family has fired kilns for ten generations."]))
      .toBe("The potter's family has fired kilns for ten generations.");
  });
});

describe("keep_in_my_notes", () => {
  it("keeps his words in his Notes for the day, with the city, private, marked told to Scout", async () => {
    const r = await executeTool("keep_in_my_notes", { tripId, words: SAID, date: "2031-10-10" }, user(), [SAID]);
    expect(r.result).toMatchObject({ kept: true, whoSees: "only them" });
    const [n] = await notes();
    expect(n).toMatchObject({ original: SAID, text: SAID, source: "scout", visibility: "private", dayDate: "2031-10-10", city: "Karatsu" });
  });
  it("the same words told again are the same note", async () => {
    const r = await executeTool("keep_in_my_notes", { tripId, words: SAID, date: "2031-10-10" }, user(), [SAID]);
    expect(r.result).toMatchObject({ kept: true, alreadyKept: true });
    expect(await notes()).toHaveLength(1);
  });
  it("Scout's own wording is refused and nothing is kept", async () => {
    const r = await executeTool("keep_in_my_notes", { tripId, words: "The group visited Okawachiyama's porcelain kilns.", date: "2031-10-10" }, user(), [SAID]);
    expect(r.result.error).toMatch(/aren't words they said/);
    expect(await notes()).toHaveLength(1);
  });
  it("shared with the trip only when asked", async () => {
    const said = "Share this with everyone: the noodle shop by the station was the best meal so far.";
    const r = await executeTool("keep_in_my_notes", { tripId, words: "the noodle shop by the station was the best meal so far", date: "2031-10-10", shareWithTrip: true }, user(), [said]);
    expect(r.result.whoSees).toBe("everyone on the trip");
    expect((await notes()).at(-1)).toMatchObject({ text: "the noodle shop by the station was the best meal so far.", visibility: "trip" });
  });
  it("a day isn't guessed; empty words aren't kept; someone not on the trip gets nothing", async () => {
    expect((await executeTool("keep_in_my_notes", { tripId, words: SAID, date: "today" }, user(), [SAID])).result.error).toMatch(/Which day/);
    expect((await executeTool("keep_in_my_notes", { tripId, words: "  ", date: "2031-10-10" }, user(), [SAID])).result.error).toMatch(/nothing to keep/);
    const out = await executeTool("keep_in_my_notes", { tripId, words: SAID, date: "2031-10-10" }, { code: "SKNOutsider", displayName: "SKNOutsider", travelerId: outsiderId }, [SAID]);
    expect(out.result.error).toMatch(/isn't one of yours/);
    expect(await prisma.tripNote.count({ where: { travelerId: outsiderId } })).toBe(0);
  });
  it("with Tidy my dictation on, it's tidied like a spoken note (the original kept); off, it isn't", async () => {
    // (off — the first note above was never sent to be tidied)
    expect((await notes())[0].tidyStatus).toBeNull();
    await prisma.traveler.update({ where: { id: meId }, data: { preferences: { notes: { tidy: true } } } });
    const said = "We met Scott's friend the potter, um, who fires a noborigama kiln twice a year.";
    await executeTool("keep_in_my_notes", { tripId, words: said, date: "2031-10-10" }, user(), [said]);
    // (tidying starts in the background)
    let n = (await notes()).at(-1)!;
    for (let i = 0; i < 20 && n.tidyStatus === null; i++) { await new Promise((r) => setTimeout(r, 150)); n = (await notes()).at(-1)!; }
    expect(n.original).toBe(said);
    expect(n.tidyStatus).not.toBeNull();
    await prisma.traveler.update({ where: { id: meId }, data: { preferences: {} } });
  });
  it("is on his Notes screen and Scout reads it back word for word", async () => {
    const list = await request(app).get(`/api/trip-notes/trip/${tripId}`).set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    const mine = (list.body.notes || list.body).find((n: { text: string }) => n.text === SAID);
    expect(mine).toMatchObject({ source: "scout", mine: true });
    const back = await executeTool("get_my_notes", { tripId, date: "2031-10-10" }, user());
    expect(back.result.notes.some((n: { words: string }) => n.words === SAID)).toBe(true);
    const exp = await request(app).get(`/api/trip-notes/trip/${tripId}/export`).set("Authorization", `Bearer ${token}`);
    expect(exp.text).toContain("told to Scout");
  });
});
